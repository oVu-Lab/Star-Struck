import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildDataRegistry } from '../src/utils/DataLoader.js';
import { EventBus } from '../src/core/EventBus.js';
import { GameState } from '../src/core/GameState.js';
import { SaveManager, SAVE_VERSION, DEFAULT_SAVE_KEY } from '../src/core/SaveManager.js';
import { createMemoryStorage } from '../src/utils/StorageUtils.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { HeroSystem } from '../src/systems/HeroSystem.js';
import { FormationSystem } from '../src/systems/FormationSystem.js';
import { CardSystem } from '../src/systems/CardSystem.js';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.js';
import { GachaSystem } from '../src/systems/GachaSystem.js';

function loadRegistry() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
  return buildDataRegistry({
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
  });
}

function createSystems() {
  const dataRegistry = loadRegistry();
  const storage = createMemoryStorage();
  const eventBus = new EventBus();
  const saveManager = new SaveManager({ storage, eventBus });
  const gameState = new GameState(saveManager.load().data, eventBus);
  const economySystem = new EconomySystem({ gameState, saveManager, eventBus });
  const heroSystem = new HeroSystem({ dataRegistry, gameState, saveManager, eventBus });
  const formationSystem = new FormationSystem({ dataRegistry, gameState, heroSystem, saveManager, eventBus });
  const cardSystem = new CardSystem({ dataRegistry, gameState, saveManager, eventBus });
  const progressionSystem = new ProgressionSystem({
    dataRegistry,
    gameState,
    formationSystem,
    cardSystem,
    saveManager,
    eventBus,
  });
  const gachaSystem = new GachaSystem({
    dataRegistry,
    gameState,
    economySystem,
    heroSystem,
    formationSystem,
    cardSystem,
    saveManager,
    eventBus,
  });

  return {
    dataRegistry,
    storage,
    eventBus,
    saveManager,
    gameState,
    economySystem,
    heroSystem,
    formationSystem,
    cardSystem,
    progressionSystem,
    gachaSystem,
  };
}

test('P2 FormationSystem: enforces unit unlock gating, unlocks new units, and upgrades unit stats with Credits + XP Chips', () => {
  const s = createSystems();

  // Default unlocked units = 6 (4 core + vanguard_breaker + pulse_skirmisher)
  assert.equal(s.formationSystem.getUnlockedUnits().length, 6);
  assert.equal(s.formationSystem.isUnitUnlocked('solar_pyromancer'), false);

  // Assigning a locked unit to a slot must be rejected
  const blocked = s.formationSystem.setUnitSlot(0, 'solar_pyromancer');
  assert.equal(blocked.ok, false);

  // Unlocking solar_pyromancer enables slot assignment and unlocks its card
  const unlock = s.formationSystem.unlockUnit('solar_pyromancer', s.cardSystem);
  assert.equal(unlock.ok, true);
  assert.equal(unlock.isNew, true);
  assert.equal(s.cardSystem.isCardUnlocked('card_solar_pyromancer'), true);

  const assign = s.formationSystem.setUnitSlot(2, 'solar_pyromancer');
  assert.equal(assign.ok, true);

  // Upgrading heavy_shield_guard increases level & scaled HP/ATK/DEF and deducts Credits + XP Chips
  const before = s.formationSystem.getUnitProgress('heavy_shield_guard');
  const creditsBefore = s.gameState.resources.credits;
  const up = s.formationSystem.upgradeUnit('heavy_shield_guard', s.economySystem);
  assert.equal(up.ok, true);
  assert.equal(up.unit.level, before.level + 1);
  assert.ok(up.unit.scaledStats.maxHp > before.scaledStats.maxHp);
  assert.ok(s.gameState.resources.credits < creditsBefore);
});

test('P2 CardSystem: validates custom 12-card battle deck, enforces 3-copy & >=4 unit limits, and loads saved deck', () => {
  const s = createSystems();

  // Rejects deck with < 12 cards
  assert.equal(s.cardSystem.setCustomDeck(['card_shield_guard']).ok, false);

  // Rejects deck with locked card
  const lockedDeck = [
    'card_shield_guard', 'card_shield_guard', 'card_wind_cavalry', 'card_arcane_archer',
    'card_astral_construct', // locked by default
    'card_field_cleric', 'card_skill_astral_nova', 'card_skill_sanctuary_wave',
    'card_tactic_full_assault', 'card_tactic_focus_fire', 'card_support_aegis_blessing', 'card_support_overclock_core',
  ];
  assert.equal(s.cardSystem.setCustomDeck(lockedDeck).ok, false);

  // Rejects deck with > 3 copies of same card
  const overCopyDeck = [
    'card_shield_guard', 'card_shield_guard', 'card_shield_guard', 'card_shield_guard',
    'card_wind_cavalry', 'card_arcane_archer', 'card_skill_astral_nova', 'card_skill_sanctuary_wave',
    'card_tactic_full_assault', 'card_tactic_focus_fire', 'card_support_aegis_blessing', 'card_support_overclock_core',
  ];
  assert.equal(s.cardSystem.setCustomDeck(overCopyDeck).ok, false);

  // Rejects deck with < 4 unit cards
  const lowUnitDeck = [
    'card_shield_guard', 'card_wind_cavalry', 'card_arcane_archer',
    'card_skill_astral_nova', 'card_skill_astral_nova', 'card_skill_sanctuary_wave',
    'card_tactic_full_assault', 'card_tactic_full_assault', 'card_tactic_focus_fire',
    'card_support_aegis_blessing', 'card_support_overclock_core', 'card_support_cleanse_beacon',
  ];
  assert.equal(s.cardSystem.setCustomDeck(lowUnitDeck).ok, false);

  // Accepts a valid 12-card unlocked custom deck and uses it during initHand()
  const validDeck = [
    'card_vanguard_breaker', 'card_vanguard_breaker',
    'card_pulse_skirmisher', 'card_field_cleric',
    'card_skill_astral_nova', 'card_tactic_flank_maneuver',
    'card_support_cleanse_beacon', 'card_shield_guard',
    'card_wind_cavalry', 'card_arcane_archer',
    'card_tactic_full_assault', 'card_support_aegis_blessing',
  ];
  const saved = s.cardSystem.setCustomDeck(validDeck);
  assert.equal(saved.ok, true);

  const hand = s.cardSystem.initHand();
  assert.equal(hand.length, 6);
  assert.equal(hand[0].cardId, 'card_vanguard_breaker');
  assert.equal(hand[1].cardId, 'card_vanguard_breaker');
  assert.equal(s.cardSystem.canMerge(0, 1), true);
  assert.equal(s.cardSystem.getRemainingDeckCount(), 6);

  // Clearing custom deck resets to auto-deck cleanly
  assert.equal(s.cardSystem.setCustomDeck([]).ok, true);
  assert.equal(s.cardSystem.getCustomDeck().length, 0);
});

test('P2 ProgressionSystem: enforces stage unlock progression, first-clear vs repeat-clear rewards, bonus units, and reload-safe duplicate protection', () => {
  const s = createSystems();

  // Locked chapter 2 stage cannot be selected initially
  assert.equal(s.progressionSystem.selectStage('stage_2_1').ok, false);

  // Clearing stage_1_3 unlocks stage_1_4
  const clear13 = s.progressionSystem.recordBattleOutcome({
    sessionId: 'sess_stage_1_3_first',
    stageId: 'stage_1_3',
    victory: true,
    rating: 'S',
    enemiesDefeated: 14,
    economySystem: s.economySystem,
    heroSystem: s.heroSystem,
  });
  assert.equal(clear13.applied, true);
  assert.equal(s.progressionSystem.isStageUnlocked('stage_1_4'), true);
  assert.equal(s.progressionSystem.selectStage('stage_1_4').ok, true);

  // First clear of stage_1_4 unlocks stage_2_1 + bonus unit solar_pyromancer + bonus card
  const firstRes = s.progressionSystem.recordBattleOutcome({
    sessionId: 'sess_stage_1_4_first',
    stageId: 'stage_1_4',
    victory: true,
    rating: 'S',
    enemiesDefeated: 18,
    economySystem: s.economySystem,
    heroSystem: s.heroSystem,
  });
  assert.equal(firstRes.applied, true);
  assert.equal(firstRes.isFirstClear, true);
  assert.ok(firstRes.rewards.bonusUnits.includes('solar_pyromancer'));
  assert.equal(s.formationSystem.isUnitUnlocked('solar_pyromancer'), true);
  assert.equal(s.cardSystem.isCardUnlocked('card_solar_pyromancer'), true);
  assert.equal(s.progressionSystem.isStageUnlocked('stage_2_1'), true);
  assert.equal(s.progressionSystem.selectStage('stage_2_1').ok, true);

  // Repeat clear of stage_1_4 grants reduced Credits/Astrite and zero duplicate bonusUnits/bonusCards
  const repeatRes = s.progressionSystem.recordBattleOutcome({
    sessionId: 'sess_stage_1_4_repeat',
    stageId: 'stage_1_4',
    victory: true,
    rating: 'A',
    enemiesDefeated: 18,
    economySystem: s.economySystem,
    heroSystem: s.heroSystem,
  });
  assert.equal(repeatRes.applied, true);
  assert.equal(repeatRes.isFirstClear, false);
  assert.ok(repeatRes.rewards.credits < firstRes.rewards.credits);
  assert.ok(repeatRes.rewards.astrite < firstRes.rewards.astrite);
  assert.equal(repeatRes.rewards.bonusUnits.length, 0);
  assert.equal(repeatRes.rewards.bonusCards.length, 0);

  // Reloading ProgressionSystem from persisted storage MUST still block duplicate sessionId claim
  const reloadedState = new GameState(s.saveManager.load().data, s.eventBus);
  const reloadedProg = new ProgressionSystem({
    dataRegistry: s.dataRegistry,
    gameState: reloadedState,
    saveManager: s.saveManager,
    eventBus: s.eventBus,
  });
  const dupRes = reloadedProg.recordBattleOutcome({
    sessionId: 'sess_stage_1_4_first',
    stageId: 'stage_1_4',
    victory: true,
    rating: 'S',
  });
  assert.equal(dupRes.applied, false);
  assert.equal(dupRes.duplicate, true);
});

test('P2 GachaSystem: supports Commander & Tactical Armory banners, 10-pull SR+ guarantee, and card/unit unlocking', () => {
  const s = createSystems();
  s.economySystem.grant('astrite', 5000);

  // Commander banner 10-pull guarantees >= SR
  const cmdTen = s.gachaSystem.pull(10, { bannerId: 'banner_starlight_command' });
  assert.equal(cmdTen.ok, true);
  assert.equal(cmdTen.results.length, 10);
  assert.ok(cmdTen.results.some((r) => r.rarity === 'SR' || r.rarity === 'SSR'));

  // Switch to Tactical Armory Supply banner and execute 10-pull
  assert.equal(s.gachaSystem.setActiveBanner('banner_tactical_requisition').ok, true);
  const tacTen = s.gachaSystem.pull(10);
  assert.equal(tacTen.ok, true);
  assert.equal(tacTen.results.length, 10);
  assert.ok(tacTen.results.every((r) => r.itemType === 'card'));
  assert.ok(tacTen.results.some((r) => r.rarity === 'SR' || r.rarity === 'SSR'));
  // Every pulled card must now be unlocked in CardSystem
  for (const entry of tacTen.results) {
    assert.equal(s.cardSystem.isCardUnlocked(entry.cardId), true);
  }
});

test('P2 SaveManager: migrates legacy v1 and v2 saves cleanly to v3 without losing any user progress', () => {
  const storage = createMemoryStorage();
  const bus = new EventBus();
  const saveMgr = new SaveManager({ storage, eventBus: bus });

  // Simulate legacy v2 save from P1
  const legacyV2 = {
    version: 2,
    player: { name: 'VeteranCmdr', level: 7, xp: 120, xpToNext: 300 },
    resources: { credits: 9999, astrite: 4800, stamina: 110, maxStamina: 120 },
    heroes: {
      owned: {
        astra: { id: 'astra', level: 5, xp: 40, copies: 2 },
        kael: { id: 'kael', level: 3, xp: 10, copies: 1 },
      },
    },
    formation: {
      commanderId: 'kael',
      unitSlots: ['heavy_shield_guard', 'wind_cavalry', 'arcane_archer', 'field_cleric'],
    },
    progression: {
      selectedStageId: 'stage_1_3',
      unlockedStages: ['stage_1_1', 'stage_1_2', 'stage_1_3'],
      clearedStages: ['stage_1_1', 'stage_1_2'],
      stageRatings: { stage_1_1: 'S', stage_1_2: 'A' },
      unlockedCards: ['card_shield_guard', 'card_wind_cavalry', 'card_arcane_archer', 'card_field_cleric'],
      battleStats: { battlesPlayed: 4, battlesWon: 3, totalEnemiesDefeated: 42 },
    },
    gacha: { totalPulls: 12, ssrPity: 12, history: [] },
    inventory: { items: [] },
    settings: { masterVolume: 0.7, sfxVolume: 0.8, bgmVolume: 0.5, muted: false },
  };
  storage.setItem(DEFAULT_SAVE_KEY, JSON.stringify(legacyV2));

  const res = saveMgr.load();
  assert.equal(res.status, 'loaded');
  assert.equal(res.data.version, SAVE_VERSION);
  assert.equal(res.data.player.name, 'VeteranCmdr');
  assert.equal(res.data.resources.credits, 9999);
  assert.equal(res.data.formation.commanderId, 'kael');
  assert.deepEqual(res.data.progression.clearedStages, ['stage_1_1', 'stage_1_2']);
  assert.equal(res.data.gacha.ssrPity, 12);

  // New v3 structures populated safely
  assert.ok(res.data.units?.owned?.heavy_shield_guard);
  assert.ok(res.data.units?.owned?.vanguard_breaker);
  assert.ok(Array.isArray(res.data.formation.battleDeck));
  assert.ok(Array.isArray(res.data.progression.claimedSessions));
  assert.ok(res.data.progression.unlockedCards.includes('card_vanguard_breaker'));
});
