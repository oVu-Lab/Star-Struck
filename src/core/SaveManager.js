/**
 * SaveManager — Versioned localStorage persistence with validation,
 * missing-field recovery, schema migration hooks (v1 -> v2), and safe reset.
 */

import { deepClone, resolveStorage, safeJsonParse } from '../utils/StorageUtils.js';

export const SAVE_VERSION = 5;
export const DEFAULT_SAVE_KEY = 'astral_command_save_v1';
export const DECK_SIZE = 6;

export const DEFAULT_BATTLE_DECK = Object.freeze([
  'card_shield_guard',
  'card_arcane_archer',
  'card_field_cleric',
  'card_skill_astral_nova',
  'card_tactic_full_assault',
  'card_support_aegis_blessing',
]);

const VALID_GRAPHICS = new Set(['low', 'medium', 'high']);
const VALID_SPEEDS = new Set([1, 2, 3]);
const VALID_RATINGS = new Set(['S', 'A', 'B', 'C']);

const DEFAULT_UNLOCKED_UNITS = [
  'heavy_shield_guard',
  'wind_cavalry',
  'arcane_archer',
  'field_cleric',
  'vanguard_breaker',
  'pulse_skirmisher',
];

const DEFAULT_UNLOCKED_CARDS = [
  'card_shield_guard',
  'card_wind_cavalry',
  'card_arcane_archer',
  'card_field_cleric',
  'card_vanguard_breaker',
  'card_pulse_skirmisher',
  'card_skill_astral_nova',
  'card_skill_sanctuary_wave',
  'card_tactic_full_assault',
  'card_tactic_focus_fire',
  'card_tactic_emergency_defense',
  'card_tactic_flank_maneuver',
  'card_support_aegis_blessing',
  'card_support_overclock_core',
  'card_support_cleanse_beacon',
];

function createDefaultOwnedUnits() {
  const owned = {};
  for (const id of DEFAULT_UNLOCKED_UNITS) {
    owned[id] = { id, level: 1, xp: 0 };
  }
  return owned;
}

/**
 * Deterministically migrates any saved battle deck (including legacy 12-card or duplicate decks)
 * to at most 6 unique valid owned cards while leaving unlockedCards completely intact.
 */
export function migrateBattleDeck(rawDeck, unlockedCards = DEFAULT_UNLOCKED_CARDS, validCardsById = null) {
  const unlockedList = Array.isArray(unlockedCards)
    ? Array.from(new Set(unlockedCards.filter((id) => typeof id === 'string' && id.trim())))
    : [...DEFAULT_UNLOCKED_CARDS];
  const unlockedSet = new Set(unlockedList);

  const getCardDef = (id) => {
    if (!validCardsById) return null;
    if (typeof validCardsById.get === 'function') return validCardsById.get(id) || null;
    return validCardsById[id] || null;
  };
  const isKnownCard = (id) => (!validCardsById ? true : Boolean(getCardDef(id)));
  const getNormName = (id) => {
    const def = getCardDef(id);
    return def?.name ? String(def.name).trim().toLowerCase() : null;
  };

  const result = [];
  const seenIds = new Set();
  const seenNames = new Set();

  const tryAdd = (cid) => {
    if (result.length >= DECK_SIZE) return false;
    if (typeof cid !== 'string' || !cid.trim()) return false;
    if (!isKnownCard(cid)) return false;
    if (!unlockedSet.has(cid)) return false;
    if (seenIds.has(cid)) return false;
    const normName = getNormName(cid);
    if (normName && seenNames.has(normName)) return false;
    seenIds.add(cid);
    if (normName) seenNames.add(normName);
    result.push(cid);
    return true;
  };

  if (Array.isArray(rawDeck)) {
    for (const cid of rawDeck) {
      if (result.length >= DECK_SIZE) break;
      tryAdd(cid);
    }
  }

  if (result.length < DECK_SIZE) {
    for (const cid of DEFAULT_BATTLE_DECK) {
      if (result.length >= DECK_SIZE) break;
      tryAdd(cid);
    }
  }

  if (result.length < DECK_SIZE) {
    for (const cid of unlockedList) {
      if (result.length >= DECK_SIZE) break;
      tryAdd(cid);
    }
  }

  return result;
}

export function createDefaultSave() {
  return {
    version: SAVE_VERSION,
    updatedAt: new Date().toISOString(),
    player: {
      name: 'Commander',
      level: 1,
      xp: 0,
      xpToNext: 100,
    },
    resources: {
      credits: 2400,
      astrite: 3200,
      stamina: 60,
      maxStamina: 60,
    },
    heroes: {
      owned: {
        astra: { id: 'astra', level: 1, xp: 0, copies: 1 },
        vanguard_zero: { id: 'vanguard_zero', level: 1, xp: 0, copies: 1 },
      },
    },
    units: {
      owned: createDefaultOwnedUnits(),
    },
    formation: {
      commanderId: 'astra',
      unitSlots: [
        'heavy_shield_guard',
        'wind_cavalry',
        'arcane_archer',
        'field_cleric',
      ],
      battleDeck: [...DEFAULT_BATTLE_DECK],
    },
    progression: {
      selectedStageId: 'stage_1_1',
      unlockedStages: ['stage_1_1', 'stage_1_2', 'stage_1_3'],
      clearedStages: [],
      stageRatings: {},
      unlockedCards: [...DEFAULT_UNLOCKED_CARDS],
      claimedSessions: [],
      battleStats: {
        battlesPlayed: 0,
        battlesWon: 0,
        totalEnemiesDefeated: 0,
      },
    },
    gacha: {
      ssrPity: 0,
      totalPulls: 0,
      history: [],
    },
    inventory: {
      items: [
        {
          id: 'item_xp_chip',
          name: 'Tactical XP Chip',
          category: 'materials',
          quantity: 12,
          description: 'Enhancement module used to raise Commander and Unit tactical rank.',
        },
        {
          id: 'item_aegis_core',
          name: 'Aegis Tactical Core',
          category: 'materials',
          quantity: 4,
          description: 'High-density core required for unit deck upgrades and breakthroughs.',
        },
        {
          id: 'item_stamina_cell',
          name: 'Field Energy Cell',
          category: 'consumables',
          quantity: 3,
          description: 'Restores 30 deployment stamina when activated.',
        },
        {
          id: 'item_astral_ticket',
          name: 'Astral Recruitment Permit',
          category: 'consumables',
          quantity: 2,
          description: 'Standard authorization voucher for commander recruitment.',
        },
      ],
    },
    missions: {
      daily: {
        periodKey: '',
        progress: {},
        claimed: [],
      },
      weekly: {
        periodKey: '',
        progress: {},
        claimed: [],
      },
      seasonal: {},
    },
    settings: {
      musicVolume: 0.45,
      sfxVolume: 0.65,
      muted: false,
      musicMuted: false,
      sfxMuted: false,
      battleSpeed: 1,
      graphicsQuality: 'high',
    },
    tutorial: {
      completed: false,
      skipped: false,
      completedAt: null,
    },
  };
}

export class SaveManager {
  constructor({ storage, storageKey = DEFAULT_SAVE_KEY, eventBus = null } = {}) {
    this._storage = resolveStorage(storage);
    this._storageKey = storageKey;
    this._eventBus = eventBus;
    this._migrations = new Map();

    // Built-in migration from P0 (v1) -> P1 (v2): preserves all existing player
    // progress while introducing P1 stage ratings, unlocked cards, and battle stats.
    this.registerMigration(1, (v1) => {
      const defaults = createDefaultSave();
      const next = deepClone(v1);
      next.progression = {
        ...defaults.progression,
        ...(next.progression || {}),
        stageRatings: { ...(next.progression?.stageRatings || {}) },
        unlockedCards: Array.isArray(next.progression?.unlockedCards)
          ? [...next.progression.unlockedCards]
          : [...defaults.progression.unlockedCards],
        battleStats: {
          ...defaults.progression.battleStats,
          ...(next.progression?.battleStats || {}),
        },
      };
      return next;
    });

    // Built-in migration from P1 (v2) -> P2 (v3): preserves all existing progress
    // while introducing unit roster levels, custom battleDeck, newly default P2 cards,
    // and persistent claimedSessions tracking.
    this.registerMigration(2, (v2) => {
      const defaults = createDefaultSave();
      const next = deepClone(v2);

      const existingUnits = next.units?.owned && typeof next.units.owned === 'object'
        ? next.units.owned
        : {};
      next.units = {
        owned: {
          ...createDefaultOwnedUnits(),
          ...existingUnits,
        },
      };

      next.formation = {
        ...defaults.formation,
        ...(next.formation || {}),
        battleDeck: Array.isArray(next.formation?.battleDeck)
          ? [...next.formation.battleDeck]
          : [],
      };

      const mergedUnlockedCards = Array.from(
        new Set([
          ...(Array.isArray(next.progression?.unlockedCards) ? next.progression.unlockedCards : []),
          ...DEFAULT_UNLOCKED_CARDS,
        ]),
      );

      next.progression = {
        ...defaults.progression,
        ...(next.progression || {}),
        unlockedCards: mergedUnlockedCards,
        claimedSessions: Array.isArray(next.progression?.claimedSessions)
          ? [...next.progression.claimedSessions]
          : [],
      };

      return next;
    });

    // Built-in migration from v3 -> v4: preserves all existing campaign, hero, unit,
    // deck, and inventory progress while introducing persistent Daily/Weekly/Seasonal missions.
    this.registerMigration(3, (v3) => {
      const defaults = createDefaultSave();
      const next = deepClone(v3);
      next.missions = {
        daily: {
          ...defaults.missions.daily,
          ...(next.missions?.daily || {}),
        },
        weekly: {
          ...defaults.missions.weekly,
          ...(next.missions?.weekly || {}),
        },
        seasonal:
          next.missions?.seasonal && typeof next.missions.seasonal === 'object'
            ? deepClone(next.missions.seasonal)
            : {},
      };
      return next;
    });

    // Built-in migration from v4 -> v5: preserves player collection and all unrelated
    // progress while migrating legacy 12-card or duplicate battle decks to the 6-card unique format.
    this.registerMigration(4, (v4) => {
      const defaults = createDefaultSave();
      const next = deepClone(v4);
      const unlockedCards = Array.isArray(next.progression?.unlockedCards)
        ? [...next.progression.unlockedCards]
        : [...defaults.progression.unlockedCards];

      next.formation = {
        ...defaults.formation,
        ...(next.formation || {}),
        battleDeck: migrateBattleDeck(next.formation?.battleDeck, unlockedCards),
      };
      return next;
    });
  }

  registerMigration(fromVersion, migratorFn) {
    this._migrations.set(fromVersion, migratorFn);
  }

  /**
   * Validates save structure and reports issues without throwing.
   */
  validate(data) {
    const errors = [];
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { valid: false, errors: ['Save payload must be a plain object.'] };
    }
    if (typeof data.version !== 'number' || !Number.isInteger(data.version) || data.version < 1) {
      errors.push('Missing or invalid save version.');
    }
    if (!data.player || typeof data.player !== 'object') {
      errors.push('Missing player section.');
    }
    if (!data.resources || typeof data.resources !== 'object') {
      errors.push('Missing resources section.');
    }
    if (!data.heroes || typeof data.heroes.owned !== 'object') {
      errors.push('Missing heroes.owned map.');
    }
    if (!data.formation || typeof data.formation.commanderId !== 'string') {
      errors.push('Missing formation.commanderId.');
    }
    if (!data.settings || typeof data.settings !== 'object') {
      errors.push('Missing settings section.');
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * Migrates older save schemas forward to SAVE_VERSION.
   */
  migrate(data) {
    if (!data || typeof data !== 'object') return createDefaultSave();
    let current = deepClone(data);
    let version = Number.isInteger(current.version) ? current.version : 0;

    while (version < SAVE_VERSION) {
      const fn = this._migrations.get(version);
      if (typeof fn === 'function') {
        current = fn(current);
        version += 1;
        current.version = version;
      } else {
        current.version = SAVE_VERSION;
        break;
      }
    }
    return current;
  }

  /**
   * Merges arbitrary or partially corrupted data into a valid save shape,
   * preserving intact fields while recovering missing or invalid ones.
   */
  recover(rawData) {
    const defaults = createDefaultSave();
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
      return { data: defaults, recovered: true, notes: ['Replaced unreadable save with defaults.'] };
    }

    const migrated = this.migrate(rawData);
    const notes = [];
    const safeNumber = (val, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) => {
      if (typeof val === 'number' && Number.isFinite(val)) {
        return Math.min(max, Math.max(min, val));
      }
      return fallback;
    };

    const result = createDefaultSave();
    result.version = SAVE_VERSION;
    result.updatedAt =
      typeof migrated.updatedAt === 'string' ? migrated.updatedAt : defaults.updatedAt;

    // Player
    if (migrated.player && typeof migrated.player === 'object') {
      result.player.name =
        typeof migrated.player.name === 'string' && migrated.player.name.trim()
          ? migrated.player.name.slice(0, 24)
          : defaults.player.name;
      result.player.level = Math.floor(safeNumber(migrated.player.level, defaults.player.level, 1, 99));
      result.player.xp = Math.floor(safeNumber(migrated.player.xp, defaults.player.xp, 0));
      result.player.xpToNext = Math.floor(
        safeNumber(migrated.player.xpToNext, defaults.player.xpToNext, 50),
      );
    } else {
      notes.push('Recovered missing player profile.');
    }

    // Resources
    if (migrated.resources && typeof migrated.resources === 'object') {
      result.resources.credits = Math.floor(
        safeNumber(migrated.resources.credits, defaults.resources.credits, 0),
      );
      result.resources.astrite = Math.floor(
        safeNumber(migrated.resources.astrite, defaults.resources.astrite, 0),
      );
      result.resources.maxStamina = Math.floor(
        safeNumber(migrated.resources.maxStamina, defaults.resources.maxStamina, 20, 300),
      );
      result.resources.stamina = Math.floor(
        safeNumber(migrated.resources.stamina, defaults.resources.stamina, 0, result.resources.maxStamina),
      );
    } else {
      notes.push('Recovered missing resources.');
    }

    // Heroes
    if (migrated.heroes?.owned && typeof migrated.heroes.owned === 'object') {
      const recoveredOwned = {};
      for (const [id, entry] of Object.entries(migrated.heroes.owned)) {
        if (entry && typeof entry === 'object' && typeof id === 'string') {
          recoveredOwned[id] = {
            id,
            level: Math.floor(safeNumber(entry.level, 1, 1, 99)),
            xp: Math.floor(safeNumber(entry.xp, 0, 0)),
            copies: Math.floor(safeNumber(entry.copies, 1, 1, 999)),
          };
        }
      }
      if (Object.keys(recoveredOwned).length > 0) {
        result.heroes.owned = recoveredOwned;
      } else {
        notes.push('Recovered empty owned hero roster.');
      }
    } else {
      notes.push('Recovered missing hero roster.');
    }

    // Units (P2)
    if (migrated.units?.owned && typeof migrated.units.owned === 'object') {
      const recoveredUnits = { ...createDefaultOwnedUnits() };
      for (const [id, entry] of Object.entries(migrated.units.owned)) {
        if (entry && typeof entry === 'object' && typeof id === 'string') {
          recoveredUnits[id] = {
            id,
            level: Math.floor(safeNumber(entry.level, 1, 1, 99)),
            xp: Math.floor(safeNumber(entry.xp, 0, 0)),
          };
        }
      }
      result.units.owned = recoveredUnits;
    }

    // Formation
    if (migrated.formation && typeof migrated.formation === 'object') {
      const cid = migrated.formation.commanderId;
      if (typeof cid === 'string' && result.heroes.owned[cid]) {
        result.formation.commanderId = cid;
      } else {
        result.formation.commanderId = Object.keys(result.heroes.owned)[0] || defaults.formation.commanderId;
        notes.push('Reassigned invalid active commander to an owned hero.');
      }

      if (Array.isArray(migrated.formation.unitSlots) && migrated.formation.unitSlots.length > 0) {
        const cleanedSlots = migrated.formation.unitSlots.filter((s) => typeof s === 'string').slice(0, 4);
        if (cleanedSlots.length === 4) {
          result.formation.unitSlots = cleanedSlots;
        }
      }

      if (Array.isArray(migrated.formation.battleDeck)) {
        result.formation.battleDeck = Array.from(
          new Set(migrated.formation.battleDeck.filter((c) => typeof c === 'string' && c.trim())),
        ).slice(0, DECK_SIZE);
      }
    } else {
      notes.push('Recovered missing formation.');
    }

    // Progression (P0 + P1 + P2 fields)
    if (migrated.progression && typeof migrated.progression === 'object') {
      if (typeof migrated.progression.selectedStageId === 'string') {
        result.progression.selectedStageId = migrated.progression.selectedStageId;
      }
      if (Array.isArray(migrated.progression.unlockedStages) && migrated.progression.unlockedStages.length) {
        result.progression.unlockedStages = Array.from(
          new Set(migrated.progression.unlockedStages.filter((s) => typeof s === 'string')),
        );
      }
      if (Array.isArray(migrated.progression.clearedStages)) {
        result.progression.clearedStages = Array.from(
          new Set(migrated.progression.clearedStages.filter((s) => typeof s === 'string')),
        );
      }
      if (migrated.progression.stageRatings && typeof migrated.progression.stageRatings === 'object') {
        const ratings = {};
        for (const [sid, rating] of Object.entries(migrated.progression.stageRatings)) {
          if (typeof sid === 'string' && VALID_RATINGS.has(rating)) {
            ratings[sid] = rating;
          }
        }
        result.progression.stageRatings = ratings;
      }
      if (Array.isArray(migrated.progression.unlockedCards) && migrated.progression.unlockedCards.length > 0) {
        result.progression.unlockedCards = Array.from(
          new Set(migrated.progression.unlockedCards.filter((c) => typeof c === 'string')),
        );
      }
      if (Array.isArray(migrated.progression.claimedSessions)) {
        result.progression.claimedSessions = Array.from(
          new Set(migrated.progression.claimedSessions.filter((s) => typeof s === 'string')),
        ).slice(-60);
      }
      if (migrated.progression.battleStats && typeof migrated.progression.battleStats === 'object') {
        result.progression.battleStats = {
          battlesPlayed: Math.floor(safeNumber(migrated.progression.battleStats.battlesPlayed, 0, 0)),
          battlesWon: Math.floor(safeNumber(migrated.progression.battleStats.battlesWon, 0, 0)),
          totalEnemiesDefeated: Math.floor(
            safeNumber(migrated.progression.battleStats.totalEnemiesDefeated, 0, 0),
          ),
        };
      }
    }

    // Gacha
    if (migrated.gacha && typeof migrated.gacha === 'object') {
      result.gacha.ssrPity = Math.floor(safeNumber(migrated.gacha.ssrPity, 0, 0, 80));
      result.gacha.totalPulls = Math.floor(safeNumber(migrated.gacha.totalPulls, 0, 0));
      if (Array.isArray(migrated.gacha.history)) {
        result.gacha.history = migrated.gacha.history.slice(0, 50);
      }
    }

    // Inventory
    if (Array.isArray(migrated.inventory?.items) && migrated.inventory.items.length > 0) {
      result.inventory.items = migrated.inventory.items
        .filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string')
        .map((item) => ({
          id: item.id,
          name: item.name,
          category: typeof item.category === 'string' ? item.category : 'materials',
          quantity: Math.floor(safeNumber(item.quantity, 0, 0)),
          description: typeof item.description === 'string' ? item.description : '',
        }));
    }

    // Missions (v4)
    if (migrated.missions && typeof migrated.missions === 'object') {
      const sanitizeProgressMap = (rawMap) => {
        const out = {};
        if (rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)) {
          for (const [metric, val] of Object.entries(rawMap)) {
            if (typeof metric === 'string' && metric.length > 0) {
              out[metric] = Math.floor(safeNumber(val, 0, 0));
            }
          }
        }
        return out;
      };
      const sanitizeClaimedList = (rawList) =>
        Array.isArray(rawList)
          ? Array.from(new Set(rawList.filter((id) => typeof id === 'string' && id.length > 0)))
          : [];

      if (migrated.missions.daily && typeof migrated.missions.daily === 'object') {
        result.missions.daily = {
          periodKey:
            typeof migrated.missions.daily.periodKey === 'string'
              ? migrated.missions.daily.periodKey.slice(0, 32)
              : '',
          progress: sanitizeProgressMap(migrated.missions.daily.progress),
          claimed: sanitizeClaimedList(migrated.missions.daily.claimed),
        };
      }

      if (migrated.missions.weekly && typeof migrated.missions.weekly === 'object') {
        result.missions.weekly = {
          periodKey:
            typeof migrated.missions.weekly.periodKey === 'string'
              ? migrated.missions.weekly.periodKey.slice(0, 32)
              : '',
          progress: sanitizeProgressMap(migrated.missions.weekly.progress),
          claimed: sanitizeClaimedList(migrated.missions.weekly.claimed),
        };
      }

      if (
        migrated.missions.seasonal &&
        typeof migrated.missions.seasonal === 'object' &&
        !Array.isArray(migrated.missions.seasonal)
      ) {
        const seasonalOut = {};
        for (const [eventId, entry] of Object.entries(migrated.missions.seasonal)) {
          if (typeof eventId === 'string' && eventId.length > 0 && entry && typeof entry === 'object') {
            seasonalOut[eventId] = {
              progress: sanitizeProgressMap(entry.progress),
              claimed: sanitizeClaimedList(entry.claimed),
            };
          }
        }
        result.missions.seasonal = seasonalOut;
      }
    }

    // Settings
    if (migrated.settings && typeof migrated.settings === 'object') {
      result.settings.musicVolume = safeNumber(
        migrated.settings.musicVolume,
        defaults.settings.musicVolume,
        0,
        1,
      );
      result.settings.sfxVolume = safeNumber(
        migrated.settings.sfxVolume,
        defaults.settings.sfxVolume,
        0,
        1,
      );
      result.settings.muted = Boolean(migrated.settings.muted);
      result.settings.musicMuted = Boolean(migrated.settings.musicMuted);
      result.settings.sfxMuted = Boolean(migrated.settings.sfxMuted);
      result.settings.battleSpeed = VALID_SPEEDS.has(migrated.settings.battleSpeed)
        ? migrated.settings.battleSpeed
        : defaults.settings.battleSpeed;
      result.settings.graphicsQuality = VALID_GRAPHICS.has(migrated.settings.graphicsQuality)
        ? migrated.settings.graphicsQuality
        : defaults.settings.graphicsQuality;
    } else {
      notes.push('Recovered missing settings.');
    }

    // Tutorial onboarding state
    if (migrated.tutorial && typeof migrated.tutorial === 'object') {
      result.tutorial = {
        completed: Boolean(migrated.tutorial.completed),
        skipped: Boolean(migrated.tutorial.skipped),
        completedAt:
          typeof migrated.tutorial.completedAt === 'string' && migrated.tutorial.completedAt.trim()
            ? migrated.tutorial.completedAt.slice(0, 48)
            : null,
      };
    }

    return { data: result, recovered: notes.length > 0, notes };
  }

  load() {
    const raw = this._storage.getItem(this._storageKey);
    if (!raw) {
      const fresh = createDefaultSave();
      this.save(fresh);
      return { data: fresh, status: 'created', notes: [] };
    }

    const parsed = safeJsonParse(raw);
    if (!parsed.ok) {
      const fresh = createDefaultSave();
      this.save(fresh);
      this._eventBus?.emit('save:recovered', { reason: parsed.error });
      return {
        data: fresh,
        status: 'recovered',
        notes: [`Corrupted save JSON recovered (${parsed.error}).`],
      };
    }

    const wasOlderVersion =
      typeof parsed.data?.version === 'number' && parsed.data.version < SAVE_VERSION;
    const validation = this.validate(parsed.data);
    const { data, recovered, notes } = this.recover(parsed.data);
    const neededRecovery = !validation.valid || recovered;
    if (neededRecovery || wasOlderVersion) {
      this.save(data);
      if (neededRecovery) {
        this._eventBus?.emit('save:recovered', { notes: [...validation.errors, ...notes] });
      } else if (wasOlderVersion) {
        this._eventBus?.emit('save:migrated', { fromVersion: parsed.data.version, toVersion: SAVE_VERSION });
      }
    }
    return {
      data,
      status: neededRecovery ? 'recovered' : 'loaded',
      migrated: wasOlderVersion,
      notes: [...validation.errors, ...notes],
    };
  }

  save(stateOrSave) {
    // Strip transient fields by running through recovery sanitizer
    const sanitized = this.recover(stateOrSave).data;
    sanitized.updatedAt = new Date().toISOString();
    try {
      this._storage.setItem(this._storageKey, JSON.stringify(sanitized));
      this._eventBus?.emit('save:written', { updatedAt: sanitized.updatedAt });
      return true;
    } catch (error) {
      console.error('[SaveManager] Failed to persist save:', error);
      this._eventBus?.emit('save:error', { error });
      return false;
    }
  }

  reset() {
    this._storage.removeItem(this._storageKey);
    const fresh = createDefaultSave();
    this.save(fresh);
    this._eventBus?.emit('save:reset', { data: fresh });
    return fresh;
  }

  exportJSON(saveData) {
    return JSON.stringify(this.recover(saveData).data, null, 2);
  }

  importJSON(rawJson) {
    const parsed = safeJsonParse(rawJson);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error, data: null };
    }
    const { data, notes } = this.recover(parsed.data);
    this.save(data);
    return { ok: true, error: null, data, notes };
  }
}
