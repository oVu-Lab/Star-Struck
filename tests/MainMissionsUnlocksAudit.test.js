import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { validateDataBundle, buildDataRegistry } from '../src/utils/DataLoader.js';
import { EventBus } from '../src/core/EventBus.js';
import { GameState } from '../src/core/GameState.js';
import { SaveManager, SAVE_VERSION } from '../src/core/SaveManager.js';
import { createMemoryStorage } from '../src/utils/StorageUtils.js';
import { HeroSystem } from '../src/systems/HeroSystem.js';
import { FormationSystem } from '../src/systems/FormationSystem.js';
import { CardSystem } from '../src/systems/CardSystem.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.js';
import { MissionSystem } from '../src/systems/MissionSystem.js';
import { MissionsScreen } from '../src/ui/MissionsScreen.js';
import { FormationScreen } from '../src/ui/FormationScreen.js';

function readFullBundle() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
  return {
    heroes: read('heroes.json'),
    units: read('units.json'),
    enemies: read('enemies.json'),
    skills: read('skills.json'),
    cards: read('cards.json'),
    stages: read('stages.json'),
    banners: read('banners.json'),
    bosses: read('bosses.json'),
    terrain: read('terrain.json'),
    balance: read('balance.json'),
    missions: read('missions.json'),
  };
}

function createHarness({ storage = null } = {}) {
  const bundle = readFullBundle();
  const dataRegistry = buildDataRegistry(bundle);
  const memStorage = storage || createMemoryStorage();
  const eventBus = new EventBus();
  const saveManager = new SaveManager({ storage: memStorage, eventBus });
  const loadRes = saveManager.load();
  const gameState = new GameState(loadRes.data, eventBus);
  const economySystem = new EconomySystem({ gameState, saveManager, eventBus });
  const heroSystem = new HeroSystem({ dataRegistry, gameState, saveManager, eventBus });
  const formationSystem = new FormationSystem({
    dataRegistry,
    gameState,
    heroSystem,
    saveManager,
    eventBus,
  });
  const cardSystem = new CardSystem({ dataRegistry, gameState, saveManager, eventBus });
  const progressionSystem = new ProgressionSystem({
    dataRegistry,
    gameState,
    formationSystem,
    cardSystem,
    saveManager,
    eventBus,
  });
  const missionSystem = new MissionSystem({
    dataRegistry,
    gameState,
    economySystem,
    progressionSystem,
    saveManager,
    eventBus,
  });

  return {
    bundle,
    dataRegistry,
    storage: memStorage,
    eventBus,
    saveManager,
    loadRes,
    gameState,
    economySystem,
    heroSystem,
    formationSystem,
    cardSystem,
    progressionSystem,
    missionSystem,
  };
}

function createMockContainer() {
  let rawHtml = '';
  const bodyHtmlById = { 'missions-body': '', 'formation-workspace-body': '' };
  let parsedNodes = [];
  let bodyNodes = [];

  function parseHtml(html) {
    const nodes = [];
    const tagRegex = /<(button|article|aside|section|div|img|nav|header|h1|h2|h3|span)\b([^>]*)>/gi;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
      const tag = match[1].toLowerCase();
      const attrStr = match[2] || '';
      const attrs = {};
      const attrRegex = /([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g;
      let am;
      while ((am = attrRegex.exec(attrStr)) !== null) {
        attrs[am[1]] = am[2] !== undefined ? am[2] : '';
      }
      const listeners = {};
      const node = {
        tag,
        attrs,
        scrollTop: 0,
        get innerHTML() {
          return Object.prototype.hasOwnProperty.call(bodyHtmlById, node.attrs.id)
            ? bodyHtmlById[node.attrs.id]
            : '';
        },
        set innerHTML(val) {
          if (Object.prototype.hasOwnProperty.call(bodyHtmlById, node.attrs.id)) {
            bodyHtmlById[node.attrs.id] = String(val);
            bodyNodes = [
              ...parseHtml(bodyHtmlById['missions-body']),
              ...parseHtml(bodyHtmlById['formation-workspace-body']),
            ];
          }
        },
        getAttribute(name) {
          return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
        },
        hasAttribute(name) {
          return Object.prototype.hasOwnProperty.call(attrs, name);
        },
        addEventListener(type, fn) {
          if (!listeners[type]) listeners[type] = [];
          listeners[type].push(fn);
        },
        click() {
          if (Object.prototype.hasOwnProperty.call(attrs, 'disabled')) return;
          for (const fn of listeners.click || []) fn({ currentTarget: node, target: node });
        },
        scrollIntoView() {},
        querySelector(sel) {
          const pool = [...parsedNodes, ...bodyNodes];
          return pool.find((n) => matchesSelector(n, sel)) || null;
        },
        querySelectorAll(sel) {
          const pool = [...parsedNodes, ...bodyNodes];
          return pool.filter((n) => matchesSelector(n, sel));
        },
      };
      nodes.push(node);
    }
    return nodes;
  }

  function matchesSelector(node, selector) {
    const sel = selector.trim();
    const parts = sel.split(/\s+/);
    const leaf = parts[parts.length - 1];

    const idMatch = leaf.match(/#([a-zA-Z0-9_-]+)/);
    if (idMatch && node.attrs.id !== idMatch[1]) return false;

    const classMatches = [...leaf.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
    const nodeClasses = (node.attrs.class || '').split(/\s+/).filter(Boolean);
    for (const cls of classMatches) {
      if (!nodeClasses.includes(cls)) return false;
    }

    const attrMatches = [...leaf.matchAll(/\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/g)];
    for (const am of attrMatches) {
      const attrName = am[1];
      const attrVal = am[2];
      if (!Object.prototype.hasOwnProperty.call(node.attrs, attrName)) return false;
      if (attrVal !== undefined && node.attrs[attrName] !== attrVal) return false;
    }

    const tagMatch = leaf.match(/^([a-zA-Z0-9]+)/);
    if (tagMatch && node.tag !== tagMatch[1].toLowerCase()) return false;

    return true;
  }

  return {
    get innerHTML() {
      return rawHtml + bodyHtmlById['missions-body'] + bodyHtmlById['formation-workspace-body'];
    },
    set innerHTML(val) {
      rawHtml = String(val);
      bodyHtmlById['missions-body'] = '';
      bodyHtmlById['formation-workspace-body'] = '';
      bodyNodes = [];
      parsedNodes = parseHtml(rawHtml);
    },
    querySelector(sel) {
      return [...parsedNodes, ...bodyNodes].find((n) => matchesSelector(n, sel)) || null;
    },
    querySelectorAll(sel) {
      return [...parsedNodes, ...bodyNodes].filter((n) => matchesSelector(n, sel));
    },
  };
}

function extractUnlockedBadgeText(html) {
  const m = html.match(/<span[^>]*data-stage-unlocks="(?:available|none)"[^>]*>([\s\S]*?)<\/span>/);
  return m ? m[1].trim() : null;
}

test('Main Missions Audit: zero duplicate unlocks within any stage, single unique first-unlock stage per card, and consistent stage order', () => {
  const bundle = readFullBundle();
  const validation = validateDataBundle(bundle);
  assert.equal(validation.valid, true, validation.errors.join('\n'));

  const harness = createHarness();
  const { dataRegistry, progressionSystem } = harness;

  // Chronological unlockAfter chain consistency
  const stages = dataRegistry.stages;
  assert.equal(stages.length, 12);
  assert.equal(stages[0].unlockAfter, null);
  for (let i = 1; i < stages.length; i += 1) {
    assert.equal(
      stages[i].unlockAfter,
      stages[i - 1].id,
      `Stage ${stages[i].id} unlockAfter must point directly to preceding stage ${stages[i - 1].id}`,
    );
  }

  // Every non-default card maps to exactly one unique stage, and no default card is assigned
  const nonDefaultCards = dataRegistry.cards.filter((c) => c.unlockedByDefault === false);
  const firstUnlockMap = progressionSystem.getCardFirstUnlockMap();
  assert.equal(
    firstUnlockMap.size,
    nonDefaultCards.length,
    'Every non-default unlockable card must have an authoritative first-unlock stage',
  );

  for (const card of dataRegistry.cards) {
    if (card.unlockedByDefault !== false) {
      assert.equal(
        firstUnlockMap.has(card.id),
        false,
        `Default-unlocked card ${card.id} (${card.name}) must not be listed as a stage unlock`,
      );
    } else {
      assert.equal(
        firstUnlockMap.has(card.id),
        true,
        `Locked card ${card.id} (${card.name}) must have a first-unlock stage`,
      );
    }
  }

  // Verify zero duplicates within any stage and zero repeats across later stages
  const seenCardIdsAcrossStages = new Set();
  const seenNamesAcrossStages = new Set();

  for (const stage of stages) {
    const unlocks = progressionSystem.getStageConfiguredUnlocks(stage.id);
    const stageCardIds = new Set();
    const stageNames = new Set();

    for (const entry of unlocks) {
      assert.equal(
        stageCardIds.has(entry.cardId),
        false,
        `Duplicate cardId "${entry.cardId}" within stage ${stage.id}`,
      );
      assert.equal(
        stageNames.has(entry.name),
        false,
        `Duplicate display name "${entry.name}" within stage ${stage.id}`,
      );
      assert.equal(
        seenCardIdsAcrossStages.has(entry.cardId),
        false,
        `Card "${entry.cardId}" appears again at ${stage.id} after earlier first-unlock stage`,
      );
      assert.equal(
        seenNamesAcrossStages.has(entry.name),
        false,
        `Card name "${entry.name}" appears again at ${stage.id} after earlier first-unlock stage`,
      );
      stageCardIds.add(entry.cardId);
      stageNames.add(entry.name);
      seenCardIdsAcrossStages.add(entry.cardId);
      seenNamesAcrossStages.add(entry.name);
    }
  }

  // Explicit check of expected authoritative first-unlock stage mapping across all 12 stages
  const expectedByStage = {
    stage_1_1: [],
    stage_1_2: ['Stasis Pulse'],
    stage_1_3: ['Mending Aura'],
    stage_1_4: ['Solar Pyromancer'],
    stage_2_1: ['Orbital Lance'],
    stage_2_2: ['Aegis Sentinel'],
    stage_2_3: ['Chrono Weaver'],
    stage_2_4: ['Gravity Vortex', 'Starlight Catalyst'],
    stage_3_1: ['Siege Protocol', 'Suppressive Volley'],
    stage_3_2: ['Astral Automaton'],
    stage_3_3: ['Arc Surge', 'Haste Relay'],
    stage_3_4: [],
  };

  for (const stage of stages) {
    const actualNames = progressionSystem.getStageConfiguredUnlocks(stage.id).map((u) => u.name);
    assert.deepEqual(
      actualNames,
      expectedByStage[stage.id],
      `Mismatch on configured unlocks for ${stage.code} (${stage.id})`,
    );
  }
});

test('DataLoader.validateDataBundle rejects duplicate stage unlocks, default-unlocked stage cards, and later-stage repeats', () => {
  const base = readFullBundle();

  // Case 1: duplicate within stage (unit + matching unit card)
  const dupWithin = structuredClone(base);
  dupWithin.stages.stages[11].rewards.bonusUnits = ['astral_construct'];
  dupWithin.stages.stages[11].rewards.bonusCards = ['card_astral_construct'];
  const res1 = validateDataBundle(dupWithin);
  assert.equal(res1.valid, false);
  assert.ok(res1.errors.some((e) => e.includes('stage_3_4')));

  // Case 2: default-unlocked card listed on Stage 1-1
  const defaultCard = structuredClone(base);
  defaultCard.stages.stages[0].rewards.bonusCards = ['card_skill_astral_nova'];
  const res2 = validateDataBundle(defaultCard);
  assert.equal(res2.valid, false);
  assert.ok(res2.errors.some((e) => e.includes('card_skill_astral_nova')));

  // Case 3: card listed again at later stage
  const repeatStage = structuredClone(base);
  repeatStage.stages.stages[11].rewards.bonusCards = ['card_skill_chain_lightning'];
  const res3 = validateDataBundle(repeatStage);
  assert.equal(res3.valid, false);
  assert.ok(res3.errors.some((e) => e.includes('card_skill_chain_lightning')));
});

test('MissionsScreen and FormationScreen display deduplicated unlocks, honest empty states, and exclude already-unlocked cards (e.g., Haste Relay)', () => {
  const harness = createHarness();
  const { gameState, progressionSystem } = harness;
  const ctx = {
    ...harness,
    assetManager: { bindImageElement() {} },
    audioManager: { playClick() {}, playCardSelect() {}, playInvalid() {}, playReward() {} },
    notify() {},
    screenManager: { has: () => true, navigate: () => true },
  };

  const container = createMockContainer();
  const missionsScreen = new MissionsScreen(ctx);
  missionsScreen.mount(container, { category: 'main' });

  const inspectMissionStage = (chapter, stageId) => {
    const chBtn = container.querySelector(`[data-chapter="${chapter}"]`);
    assert.ok(chBtn, `Missing chapter ${chapter}`);
    chBtn.click();
    const stBtn = container.querySelector(`.mission-stage-card[data-stage-id="${stageId}"]`);
    assert.ok(stBtn, `Missing stage card ${stageId}`);
    stBtn.click();
    return extractUnlockedBadgeText(container.innerHTML);
  };

  // Fresh save: check all key stages
  assert.equal(inspectMissionStage(1, 'stage_1_1'), 'New Unlocks: None');
  assert.equal(inspectMissionStage(1, 'stage_1_2'), 'Unlocks: Stasis Pulse');
  assert.equal(inspectMissionStage(1, 'stage_1_3'), 'Unlocks: Mending Aura');
  assert.equal(inspectMissionStage(1, 'stage_1_4'), 'Unlocks: Solar Pyromancer');
  assert.equal(inspectMissionStage(2, 'stage_2_1'), 'Unlocks: Orbital Lance');
  assert.equal(inspectMissionStage(2, 'stage_2_2'), 'Unlocks: Aegis Sentinel');
  assert.equal(inspectMissionStage(2, 'stage_2_3'), 'Unlocks: Chrono Weaver');
  assert.equal(inspectMissionStage(2, 'stage_2_4'), 'Unlocks: Gravity Vortex, Starlight Catalyst');
  assert.equal(inspectMissionStage(3, 'stage_3_1'), 'Unlocks: Siege Protocol, Suppressive Volley');
  assert.equal(inspectMissionStage(3, 'stage_3_2'), 'Unlocks: Astral Automaton');
  assert.equal(inspectMissionStage(3, 'stage_3_3'), 'Unlocks: Arc Surge, Haste Relay');
  assert.equal(inspectMissionStage(3, 'stage_3_4'), 'New Unlocks: None');

  // If Haste Relay was already unlocked (e.g. via Gacha) before clearing Stage 3-3:
  // Stage 3-3 must NOT advertise Haste Relay again!
  harness.cardSystem.unlockCard('card_support_haste_relay');
  assert.equal(inspectMissionStage(3, 'stage_3_3'), 'Unlocks: Arc Surge');

  // If Arc Surge is ALSO already unlocked before clearing Stage 3-3:
  // Stage 3-3 displays the honest empty state
  harness.cardSystem.unlockCard('card_skill_chain_lightning');
  assert.equal(inspectMissionStage(3, 'stage_3_3'), 'New Unlocks: None (Already Unlocked)');

  // Unlock Stage 3-3 and check FormationScreen briefing synchronization as well
  gameState.mutatePersistent('progression', (draft) => {
    draft.progression.unlockedStages.push('stage_3_2', 'stage_3_3', 'stage_3_4');
  });

  // Clearing Stage 3-3 when both cards were already owned grants bonusCards: [] and keeps both cards intact
  const clear33 = progressionSystem.recordBattleOutcome({
    sessionId: 'sess_3_3_preowned',
    stageId: 'stage_3_3',
    victory: true,
    rating: 'S',
  });
  assert.equal(clear33.applied, true);
  assert.deepEqual(clear33.rewards.bonusCards, []);
  assert.deepEqual(clear33.rewards.bonusUnits, []);
  assert.equal(harness.cardSystem.isCardUnlocked('card_support_haste_relay'), true);
  assert.equal(harness.cardSystem.isCardUnlocked('card_skill_chain_lightning'), true);

  // Check FormationScreen briefing for Stage 3-2 (single unit unlock, not duplicated as Card) and Stage 3-4 (empty state)
  missionsScreen.unmount();
  const formationScreen = new FormationScreen(ctx);
  gameState.setUI({ formationTab: 'stages' });
  progressionSystem.selectStage('stage_3_2');
  formationScreen.mount(container, { tab: 'stages' });
  assert.ok(container.innerHTML.includes('Units: Astral Automaton'));
  assert.equal(container.innerHTML.includes('Cards: Astral Automaton'), false);

  progressionSystem.selectStage('stage_3_4');
  formationScreen.render();
  assert.ok(container.innerHTML.includes('None (No new unlocks)'));
  formationScreen.unmount();
});

test('ProgressionSystem keeps battle reward unlocking synchronized with display and preserves existing player saves', () => {
  const storage = createMemoryStorage();
  // Simulate an existing v4 save where player cleared 1-1..1-4, 3-2, and unlocked Haste Relay via Gacha
  const existingSave = {
    version: 4,
    updatedAt: '2026-06-01T00:00:00Z',
    player: { name: 'Commander', level: 8, xp: 40, xpToNext: 300 },
    resources: { credits: 5000, astrite: 1400, stamina: 60, maxStamina: 60 },
    heroes: {
      owned: {
        astra: { id: 'astra', level: 4, xp: 20, copies: 1 },
        vanguard_zero: { id: 'vanguard_zero', level: 1, xp: 0, copies: 1 },
      },
    },
    units: {
      owned: {
        heavy_shield_guard: { id: 'heavy_shield_guard', level: 3, xp: 0 },
        wind_cavalry: { id: 'wind_cavalry', level: 3, xp: 0 },
        arcane_archer: { id: 'arcane_archer', level: 3, xp: 0 },
        field_cleric: { id: 'field_cleric', level: 3, xp: 0 },
        vanguard_breaker: { id: 'vanguard_breaker', level: 2, xp: 0 },
        pulse_skirmisher: { id: 'pulse_skirmisher', level: 2, xp: 0 },
        solar_pyromancer: { id: 'solar_pyromancer', level: 2, xp: 0 },
      },
    },
    formation: {
      commanderId: 'astra',
      unitSlots: ['heavy_shield_guard', 'solar_pyromancer', 'arcane_archer', 'field_cleric'],
      battleDeck: [
        'card_shield_guard',
        'card_solar_pyromancer',
        'card_arcane_archer',
        'card_field_cleric',
        'card_skill_astral_nova',
        'card_support_haste_relay',
      ],
    },
    progression: {
      selectedStageId: 'stage_2_1',
      unlockedStages: ['stage_1_1', 'stage_1_2', 'stage_1_3', 'stage_1_4', 'stage_2_1'],
      clearedStages: ['stage_1_1', 'stage_1_2', 'stage_1_3', 'stage_1_4'],
      stageRatings: { stage_1_1: 'S', stage_1_2: 'S', stage_1_3: 'A', stage_1_4: 'S' },
      unlockedCards: [
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
        'card_skill_stasis_pulse',
        'card_support_mending_aura',
        'card_solar_pyromancer',
        'card_support_haste_relay',
      ],
      claimedSessions: ['existing_s1'],
      battleStats: { battlesPlayed: 10, battlesWon: 9, totalEnemiesDefeated: 120 },
    },
    gacha: { ssrPity: 3, totalPulls: 12, history: [] },
    inventory: { items: [] },
    missions: {
      daily: { periodKey: '2026-06-01', progress: {}, claimed: [] },
      weekly: { periodKey: '2026-W23', progress: {}, claimed: [] },
      seasonal: {},
    },
    settings: { musicVolume: 0.45, sfxVolume: 0.65, muted: false, battleSpeed: 2, graphicsQuality: 'high' },
    tutorial: { completed: true, skipped: false, completedAt: '2026-05-01T00:00:00Z' },
  };
  storage.setItem('astral_command_save_v1', JSON.stringify(existingSave));

  const harness = createHarness({ storage });
  assert.equal(harness.loadRes.status, 'loaded');
  assert.equal(harness.loadRes.data.version, SAVE_VERSION);

  // All previously unlocked cards & units remain completely intact
  assert.equal(harness.cardSystem.isCardUnlocked('card_skill_astral_nova'), true);
  assert.equal(harness.cardSystem.isCardUnlocked('card_solar_pyromancer'), true);
  assert.equal(harness.cardSystem.isCardUnlocked('card_support_haste_relay'), true);
  assert.equal(harness.formationSystem.isUnitUnlocked('solar_pyromancer'), true);

  // Cleared stage 1-4 reports no remaining new unlocks
  const info14 = harness.progressionSystem.getStageUnlockInfo('stage_1_4');
  assert.equal(info14.isCleared, true);
  assert.deepEqual(info14.availableUnlocks, []);

  // Uncleared stage 3-3 only lists Arc Surge because Haste Relay is already owned
  const info33 = harness.progressionSystem.getStageUnlockInfo('stage_3_3');
  assert.deepEqual(
    info33.availableUnlocks.map((u) => u.name),
    ['Arc Surge'],
  );
  assert.deepEqual(
    info33.alreadyUnlocked.map((u) => u.name),
    ['Haste Relay'],
  );

  // Uncleared stage 2-2 yields Aegis Sentinel once (bonusUnits only, unlocking both unit and card)
  const res22 = harness.progressionSystem.recordBattleOutcome({
    sessionId: 'sess_2_2_save_test',
    stageId: 'stage_2_2',
    victory: true,
    rating: 'S',
  });
  assert.deepEqual(res22.rewards.bonusUnits, ['aegis_sentinel']);
  assert.deepEqual(res22.rewards.bonusCards, []);
  assert.equal(harness.formationSystem.isUnitUnlocked('aegis_sentinel'), true);
  assert.equal(harness.cardSystem.isCardUnlocked('card_aegis_sentinel'), true);
});
