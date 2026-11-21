/**
 * DataLoader — Loads, validates, and indexes JSON configuration files from /data/.
 */

export const DATA_ENDPOINTS = {
  heroes: './data/heroes.json',
  units: './data/units.json',
  enemies: './data/enemies.json',
  skills: './data/skills.json',
  cards: './data/cards.json',
  stages: './data/stages.json',
  banners: './data/banners.json',
  bosses: './data/bosses.json',
  terrain: './data/terrain.json',
  balance: './data/balance.json',
};

const VALID_CARD_CATEGORIES = new Set(['unit', 'skill', 'tactic', 'support']);

export const DEFAULT_BALANCE = Object.freeze({
  battlefield: {
    worldWidth: 100,
    worldHeight: 100,
    gridCols: 25,
    gridRows: 25,
    friendlyRegion: { minX: 4, maxX: 28, minY: 8, maxY: 92 },
    combatRegion: { minX: 28, maxX: 72, minY: 6, maxY: 94 },
    enemyRegion: { minX: 72, maxX: 96, minY: 8, maxY: 92 },
  },
  unitCaps: { maxFriendly: 25, maxEnemy: 25, maxTotal: 50 },
  commandEnergy: { max: 100, starting: 60, regenPerSecond: 4.2 },
  ultimateEnergy: {
    max: 100,
    starting: 0,
    gainPerDamageDealt: 0.045,
    gainPerDamageReceived: 0.035,
    gainPerHeal: 0.045,
    gainPerKill: 4,
  },
  combat: {
    physicalDefenseScale: 1.0,
    magicalDefenseScale: 0.65,
    minDamage: 5,
    defaultCritChance: 0.08,
    defaultCritMultiplier: 1.5,
    targetSwitchThreshold: 1.22,
    pathRecalcIntervalSec: 0.45,
    unreachableTimeoutSec: 1.25,
    waveTransitionDurationSec: 2.4,
    battleStartDurationSec: 0.85,
    deathAnimDurationSec: 0.45,
    antiStallStartSec: 150,
    antiStallHealPenaltyPer30Sec: 0.12,
    maxHealPenalty: 0.6,
  },
  progression: {
    unitUpgradeCreditBase: 250,
    unitUpgradeXpChipCost: 2,
    maxUnitLevel: 20,
    unitLevelStatBonus: 0.08,
    repeatClearCreditRatio: 0.7,
    repeatClearAstriteRatio: 0.35,
  },
  deck: { deckSize: 12, handSlots: 6, maxCardLevel: 3 },
  speeds: [1, 2, 3],
  ratings: {
    S: { minSurvivorRatio: 0.72, maxDurationSec: 180 },
    A: { minSurvivorRatio: 0.42, maxDurationSec: 240 },
    B: { minSurvivorRatio: 0.15, maxDurationSec: 330 },
  },
});

export function validateDataBundle(raw) {
  const errors = [];

  if (!raw?.heroes || !Array.isArray(raw.heroes.heroes) || raw.heroes.heroes.length === 0) {
    errors.push('heroes.json must define a non-empty heroes array.');
  }
  if (!raw?.units || !Array.isArray(raw.units.units) || raw.units.units.length === 0) {
    errors.push('units.json must define a non-empty units array.');
  }
  if (raw?.enemies && (!Array.isArray(raw.enemies.enemies) || raw.enemies.enemies.length === 0)) {
    errors.push('enemies.json must define a non-empty enemies array.');
  }
  if (!raw?.skills || !Array.isArray(raw.skills.skills) || raw.skills.skills.length === 0) {
    errors.push('skills.json must define a non-empty skills array.');
  }
  if (!raw?.cards || !Array.isArray(raw.cards.cards) || raw.cards.cards.length === 0) {
    errors.push('cards.json must define a non-empty cards array.');
  }
  if (!raw?.stages || !Array.isArray(raw.stages.stages) || raw.stages.stages.length === 0) {
    errors.push('stages.json must define a non-empty stages array.');
  }
  if (!raw?.banners || !Array.isArray(raw.banners.banners) || raw.banners.banners.length === 0) {
    errors.push('banners.json must define a non-empty banners array.');
  }

  if (errors.length === 0) {
    const skillIds = new Set(raw.skills.skills.map((s) => s.id));
    const unitIds = new Set(raw.units.units.map((u) => u.id));
    const hasEnemies = Boolean(raw.enemies && Array.isArray(raw.enemies.enemies));
    const enemyIds = new Set((raw.enemies?.enemies || []).map((e) => e.id));
    const allEntityIds = new Set([...unitIds, ...enemyIds]);
    const heroIds = new Set(raw.heroes.heroes.map((h) => h.id));
    const cardIds = new Set(raw.cards.cards.map((c) => c.id));
    const stageIds = new Set(raw.stages.stages.map((s) => s.id));
    const terrainIds = new Set((raw.terrain?.terrains || []).map((t) => t.id));
    const eliteIds = new Set((raw.bosses?.elites || []).map((e) => e.id));
    const eliteModifierIds = new Set((raw.bosses?.eliteModifiers || []).map((m) => m.id));
    const bossIds = new Set((raw.bosses?.bosses || []).map((b) => b.id));
    const bossAbilityIds = new Set((raw.bosses?.bossAbilities || []).map((a) => a.id));

    for (const hero of raw.heroes.heroes) {
      if (!skillIds.has(hero.passiveSkillId)) {
        errors.push(`Hero "${hero.id}" references missing passiveSkillId "${hero.passiveSkillId}".`);
      }
      if (!skillIds.has(hero.ultimateSkillId)) {
        errors.push(`Hero "${hero.id}" references missing ultimateSkillId "${hero.ultimateSkillId}".`);
      }
    }

    for (const unit of raw.units.units) {
      if (unit.cardId && !cardIds.has(unit.cardId)) {
        errors.push(`Unit "${unit.id}" references missing cardId "${unit.cardId}".`);
      }
      if (raw.bosses) {
        for (const abId of unit.abilities || []) {
          if (!bossAbilityIds.has(abId)) {
            errors.push(`Unit "${unit.id}" references unknown ability "${abId}".`);
          }
        }
      }
    }

    if (hasEnemies && raw.bosses) {
      for (const enemy of raw.enemies.enemies) {
        for (const abId of enemy.abilities || []) {
          if (!bossAbilityIds.has(abId)) {
            errors.push(`Enemy "${enemy.id}" references unknown ability "${abId}".`);
          }
        }
      }
    }

    for (const card of raw.cards.cards) {
      const category = card.category || 'unit';
      if (!VALID_CARD_CATEGORIES.has(category)) {
        errors.push(`Card "${card.id}" has invalid category "${category}".`);
      }
      if (category === 'unit') {
        if (!unitIds.has(card.unitId)) {
          errors.push(`Card "${card.id}" references missing unitId "${card.unitId}".`);
        }
      } else if (!card.effect || typeof card.effect !== 'object') {
        errors.push(`Non-unit card "${card.id}" must define an effect object.`);
      }
    }

    if (Array.isArray(raw.cards.defaultBattleDeck)) {
      for (const cid of raw.cards.defaultBattleDeck) {
        if (!cardIds.has(cid)) {
          errors.push(`defaultBattleDeck references unknown card "${cid}".`);
        }
      }
    }

    for (const banner of raw.banners.banners) {
      for (const hid of banner.featuredHeroIds || []) {
        if (!heroIds.has(hid)) {
          errors.push(`Banner "${banner.id}" references unknown featuredHeroId "${hid}".`);
        }
      }
      for (const cid of banner.featuredCardIds || []) {
        if (!cardIds.has(cid)) {
          errors.push(`Banner "${banner.id}" references unknown featuredCardId "${cid}".`);
        }
      }
      for (const cid of banner.duplicateBonusCards || []) {
        if (!cardIds.has(cid)) {
          errors.push(`Banner "${banner.id}" references unknown duplicateBonusCard "${cid}".`);
        }
      }
      if (banner.bannerType === 'tactical' && banner.pool) {
        for (const tierList of Object.values(banner.pool)) {
          for (const cid of tierList || []) {
            if (!cardIds.has(cid)) {
              errors.push(`Tactical banner "${banner.id}" pool references unknown card "${cid}".`);
            }
          }
        }
      } else if (banner.pool) {
        for (const tierList of Object.values(banner.pool)) {
          for (const hid of tierList || []) {
            if (!heroIds.has(hid)) {
              errors.push(`Commander banner "${banner.id}" pool references unknown hero "${hid}".`);
            }
          }
        }
      }
    }

    if (raw.bosses) {
      for (const elite of raw.bosses.elites || []) {
        const baseOk = allEntityIds.has(elite.baseUnitId) || (!hasEnemies && elite.baseUnitId?.startsWith('enemy_'));
        if (!baseOk) {
          errors.push(`Elite "${elite.id}" references unknown baseUnitId "${elite.baseUnitId}".`);
        }
        for (const abId of elite.abilities || []) {
          if (!bossAbilityIds.has(abId)) {
            errors.push(`Elite "${elite.id}" references unknown ability "${abId}".`);
          }
        }
        for (const modId of elite.modifiers || []) {
          if (!eliteModifierIds.has(modId)) {
            errors.push(`Elite "${elite.id}" references unknown modifier "${modId}".`);
          }
        }
      }
      for (const boss of raw.bosses.bosses || []) {
        const baseOk = allEntityIds.has(boss.baseUnitId) || (!hasEnemies && boss.baseUnitId?.startsWith('enemy_'));
        if (!baseOk) {
          errors.push(`Boss "${boss.id}" references unknown baseUnitId "${boss.baseUnitId}".`);
        }
        for (const abId of boss.abilities || []) {
          if (!bossAbilityIds.has(abId)) {
            errors.push(`Boss "${boss.id}" references unknown ability "${abId}".`);
          }
        }
      }
      for (const ab of raw.bosses.bossAbilities || []) {
        if (ab.kind === 'summon' && ab.unitId) {
          const summonOk = allEntityIds.has(ab.unitId) || (!hasEnemies && ab.unitId.startsWith('enemy_'));
          if (!summonOk) {
            errors.push(`Boss ability "${ab.id}" references unknown summon unitId "${ab.unitId}".`);
          }
        }
      }
    }

    for (const stage of raw.stages.stages) {
      if (raw.terrain && stage.terrainId && !terrainIds.has(stage.terrainId)) {
        errors.push(`Stage "${stage.id}" references unknown terrainId "${stage.terrainId}".`);
      }
      if (stage.unlockAfter && !stageIds.has(stage.unlockAfter)) {
        errors.push(`Stage "${stage.id}" references unknown unlockAfter stage "${stage.unlockAfter}".`);
      }
      for (const cid of stage.rewards?.bonusCards || []) {
        if (!cardIds.has(cid)) {
          errors.push(`Stage "${stage.id}" rewards references unknown bonusCard "${cid}".`);
        }
      }
      for (const uid of stage.rewards?.bonusUnits || []) {
        if (!unitIds.has(uid)) {
          errors.push(`Stage "${stage.id}" rewards references unknown bonusUnit "${uid}".`);
        }
      }
      for (const wave of stage.waves || []) {
        for (const u of wave.units || []) {
          const validUnit = allEntityIds.has(u.unitId) || (!hasEnemies && u.unitId?.startsWith('enemy_'));
          if (!validUnit) {
            errors.push(`Stage "${stage.id}" wave ${wave.wave} references unknown unitId "${u.unitId}".`);
          }
        }
        if (raw.bosses) {
          for (const e of wave.elites || []) {
            if (!eliteIds.has(e.eliteId)) {
              errors.push(`Stage "${stage.id}" wave ${wave.wave} references unknown eliteId "${e.eliteId}".`);
            }
            for (const modId of e.extraModifiers || []) {
              if (!eliteModifierIds.has(modId)) {
                errors.push(`Stage "${stage.id}" wave ${wave.wave} references unknown elite modifier "${modId}".`);
              }
            }
          }
          if (wave.boss && !bossIds.has(wave.boss.bossId)) {
            errors.push(`Stage "${stage.id}" wave ${wave.wave} references unknown bossId "${wave.boss.bossId}".`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function buildDataRegistry(raw) {
  const indexById = (list = []) => {
    const map = new Map();
    for (const item of list) {
      map.set(item.id, item);
    }
    return map;
  };

  const units = raw.units.units;
  const enemies = raw.enemies?.enemies || [];
  const allUnitsById = new Map();
  for (const u of units) allUnitsById.set(u.id, u);
  for (const e of enemies) allUnitsById.set(e.id, e);

  const elites = raw.bosses?.elites || [];
  const eliteModifiers = raw.bosses?.eliteModifiers || [];
  const bosses = raw.bosses?.bosses || [];
  const bossAbilities = raw.bosses?.bossAbilities || [];
  const terrains = raw.terrain?.terrains || [];
  const balance = raw.balance || DEFAULT_BALANCE;

  return {
    heroes: raw.heroes.heroes,
    heroesById: indexById(raw.heroes.heroes),
    units,
    unitsById: indexById(units),
    enemies,
    enemiesById: indexById(enemies),
    allUnitsById,
    skills: raw.skills.skills,
    skillsById: indexById(raw.skills.skills),
    cards: raw.cards.cards,
    cardsById: indexById(raw.cards.cards),
    handConfig: raw.cards.handConfig,
    defaultBattleDeck: raw.cards.defaultBattleDeck || null,
    stages: raw.stages.stages,
    stagesById: indexById(raw.stages.stages),
    banners: raw.banners.banners,
    bannersById: indexById(raw.banners.banners),
    elites,
    elitesById: indexById(elites),
    eliteModifiers,
    eliteModifiersById: indexById(eliteModifiers),
    bosses,
    bossesById: indexById(bosses),
    bossAbilities,
    bossAbilitiesById: indexById(bossAbilities),
    terrains,
    terrainsById: indexById(terrains),
    balance,
  };
}

export async function loadGameData(fetchFn = globalThis.fetch.bind(globalThis)) {
  const entries = Object.entries(DATA_ENDPOINTS);
  const results = await Promise.all(
    entries.map(async ([key, url]) => {
      const response = await fetchFn(url);
      if (!response.ok) {
        throw new Error(`Failed to load ${url} (HTTP ${response.status})`);
      }
      const json = await response.json();
      return [key, json];
    }),
  );

  const raw = Object.fromEntries(results);
  const validation = validateDataBundle(raw);
  if (!validation.valid) {
    throw new Error(`Invalid game configuration:\n${validation.errors.join('\n')}`);
  }
  return buildDataRegistry(raw);
}
