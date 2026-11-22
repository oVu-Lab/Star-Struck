import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildDataRegistry } from '../src/utils/DataLoader.js';
import { EventBus } from '../src/core/EventBus.js';
import { GameState } from '../src/core/GameState.js';
import { SaveManager, SAVE_VERSION, createDefaultSave } from '../src/core/SaveManager.js';
import { createMemoryStorage } from '../src/utils/StorageUtils.js';
import { CardSystem } from '../src/systems/CardSystem.js';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { HeroSystem } from '../src/systems/HeroSystem.js';
import { Battlefield } from '../src/battle/Battlefield.js';
import { UnitManager } from '../src/battle/UnitManager.js';
import { WaveManager } from '../src/battle/WaveManager.js';

function loadRegistry() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
  return buildDataRegistry({
    heroes: read('heroes.json'),
    units: read('units.json'),
    skills: read('skills.json'),
    cards: read('cards.json'),
    stages: read('stages.json'),
    banners: read('banners.json'),
    bosses: read('bosses.json'),
    terrain: read('terrain.json'),
    balance: read('balance.json'),
  });
}

test('CardSystem handles 6-card deck, 6-slot hand, Lv.I->II->III merging across any slots, energy/cooldown/cap checks, and timed automatic refill', () => {
  const registry = loadRegistry();
  const bus = new EventBus();
  const state = new GameState(createDefaultSave(), bus);
  state.setBattle({ energy: 60, maxEnergy: 100, dp: 60, maxDp: 100 });
  const cards = new CardSystem({ dataRegistry: registry, gameState: state, eventBus: bus });

  // Custom 6-card unique deck
  const customDeck = [
    'card_shield_guard',
    'card_skill_astral_nova',
    'card_tactic_full_assault',
    'card_support_aegis_blessing',
    'card_arcane_archer',
    'card_wind_cavalry',
  ];

  // Initial 6 slots with shield guards in slots 0, 1, 2, 5 + skill + tactic
  const hand = cards.initHand({
    customDeckIds: customDeck,
    initialSlots: [
      'card_shield_guard',
      'card_shield_guard',
      'card_shield_guard',
      'card_tactic_full_assault',
      'card_skill_astral_nova',
      'card_shield_guard',
    ],
  });
  assert.equal(hand.length, 6);
  assert.deepEqual(cards.getActiveDeckIds(), customDeck);

  // Invalid merges: self-merge, different card ID / category
  assert.equal(cards.canMerge(0, 0), false);
  assert.equal(cards.canMerge(2, 3), false);
  assert.equal(cards.canMerge(3, 4), false);

  // Non-adjacent identical cards (slots 0 & 5) CAN merge -> Level II at slot 5; slot 0 starts refill
  assert.equal(cards.canMerge(0, 5), true);
  const m1 = cards.mergeAdjacent(0, 5);
  assert.equal(m1.ok, true);
  assert.equal(m1.upgradedCard.tier, 2);
  assert.equal(m1.upgradedCard.levelLabel, 'Lv.II');
  assert.equal(cards.getSlots()[0], null);
  assert.equal(cards.getRefillState(0).active, true);

  // Level I + Level I in slots 1 & 2 -> Level II at slot 2; slot 1 starts refill timer
  const m2 = cards.mergeAdjacent(1, 2);
  assert.equal(m2.ok, true);
  assert.equal(m2.upgradedCard.tier, 2);
  assert.equal(cards.getRefillState(1).active, true);

  // Non-adjacent Level II (slot 5) + Level II (slot 2) -> Level III at slot 2
  assert.equal(cards.canMerge(5, 2), true);
  const m3 = cards.mergeAdjacent(5, 2);
  assert.equal(m3.ok, true);
  assert.equal(m3.upgradedCard.tier, 3);
  assert.equal(m3.upgradedCard.levelLabel, 'Lv.III');
  assert.equal(cards.getRefillState(5).active, true);

  // Level III cannot merge even if another identical Level III existed
  cards._slots[1] = { ...cards._slots[2], instanceId: 'clone_lv3' };
  cards._refillTimers[1] = null;
  assert.equal(cards.canMerge(1, 2), false);
  assert.equal(cards.mergeAdjacent(1, 2).ok, false);

  // Insufficient energy does NOT consume card, energy, or start refill timer
  state.setBattle({ energy: 5, dp: 5 });
  const failEnergy = cards.playCard(4);
  assert.equal(failEnergy.ok, false);
  assert.equal(state.battle.energy, 5);
  assert.equal(cards.getSlots()[4].cardId, 'card_skill_astral_nova');
  assert.equal(cards.getRefillState(4).active, false);

  // Playing a card deducts energy, triggers cooldown, empties slot, and starts refill timer
  state.setBattle({ energy: 100, dp: 100 });
  const played = cards.playCard(4);
  assert.equal(played.ok, true);
  assert.equal(state.battle.energy, 100 - played.card.cost);
  assert.ok(cards.getCardCooldown(played.card.cardId) > 0);
  assert.equal(cards.getSlots()[4], null);
  assert.equal(cards.getRefillState(4).active, true);

  // Cooldown blocks immediate re-play of same cardId
  cards._slots[4] = cards._createCardInstance(registry.cardsById.get(played.card.cardId), 1);
  cards._refillTimers[4] = null;
  const cdBlocked = cards.playCard(4);
  assert.equal(cdBlocked.ok, false);
  cards.updateCooldowns(10);
  assert.equal(cards.getCardCooldown(played.card.cardId), 0);

  // Unit cap blocks playing a unit card without consuming energy or card
  const bf = new Battlefield({ balance: registry.balance });
  const um = new UnitManager({ dataRegistry: registry, eventBus: bus, battlefield: bf });
  for (let i = 0; i < 25; i += 1) {
    um.spawnUnit({ unitId: 'heavy_shield_guard', side: 'ally', x: 16, y: 15 + (i % 15) * 4 });
  }
  const energyBeforeCap = state.battle.energy;
  const capBlocked = cards.playCard(2, { unitManager: um });
  assert.equal(capBlocked.ok, false);
  assert.equal(state.battle.energy, energyBeforeCap);

  // Timed refill replenishes empty slots after 5 seconds without deck exhaustion
  um.clear();
  cards.updateRefills(cards.getRefillIntervalSec());
  assert.ok(cards.getSlots()[0], 'Slot 0 refills automatically after interval');
  assert.ok(cards.getSlots()[3], 'Slot 3 refills automatically after interval');
  assert.equal(cards.getSlots().every((s) => s !== null && s.tier >= 1), true);
});

test('WaveManager spawns multi-wave squads, elites, and boss in enemy region with clean wave transitions', () => {
  const registry = loadRegistry();
  const bus = new EventBus();
  const bf = new Battlefield({ balance: registry.balance });
  const units = new UnitManager({ dataRegistry: registry, eventBus: bus, battlefield: bf });
  const waves = new WaveManager({ eventBus: bus, balance: registry.balance });

  const stage = registry.stagesById.get('stage_1_1');
  waves.configure(stage, registry.balance);
  assert.equal(waves.getTotalWaves(), 3);
  assert.equal(waves.stageHasBoss(), true);

  const w1 = waves.spawnInitialWave(units, bf);
  assert.ok(w1.length > 0);
  for (const enemy of w1) {
    assert.equal(enemy.side, 'enemy');
    assert.ok(bf.isInsideEnemyRegion(enemy.x, enemy.y), 'Enemies must spawn in right-side enemy region');
  }
  assert.equal(waves.allWavesSpawned(), false);

  // Defeat wave 1 -> enters wave transition -> spawns wave 2 (with elite)
  units.clear();
  const t1 = waves.update(0.1, units, bf);
  assert.equal(t1.phaseHint, 'wave_transition');
  assert.equal(waves.isInTransition(), true);

  const t2 = waves.update(5.0, units, bf);
  assert.equal(t2.phaseHint, 'active_combat');
  assert.equal(waves.getCurrentWave(), 2);
  assert.ok(units.getBySide('enemy').some((u) => u.isElite), 'Wave 2 should include an elite unit');

  // Defeat wave 2 -> transitions -> spawns wave 3 (with boss)
  units.clear();
  waves.update(0.1, units, bf);
  waves.update(5.0, units, bf);
  assert.equal(waves.getCurrentWave(), 3);
  assert.equal(waves.isBossSpawned(), true);
  assert.ok(units.getActiveBoss(), 'Wave 3 should spawn stage boss inside UnitManager');
  assert.equal(waves.allWavesSpawned(), true);
});

test('SaveManager migrates legacy P0 v1 saves to v2 without losing progress and prevents duplicate battle rewards', () => {
  const registry = loadRegistry();
  const storage = createMemoryStorage();
  const bus = new EventBus();

  // Simulate an existing P0 v1 save in localStorage
  const legacyV1 = {
    version: 1,
    updatedAt: '2026-10-01T00:00:00.000Z',
    player: { name: 'VeteranCmdr', level: 7, xp: 45, xpToNext: 200 },
    resources: { credits: 8888, astrite: 5120, stamina: 50, maxStamina: 60 },
    heroes: {
      owned: {
        astra: { id: 'astra', level: 4, xp: 20, copies: 2 },
        kael: { id: 'kael', level: 2, xp: 0, copies: 1 },
      },
    },
    formation: {
      commanderId: 'astra',
      unitSlots: ['heavy_shield_guard', 'wind_cavalry', 'arcane_archer', 'field_cleric'],
    },
    progression: {
      selectedStageId: 'stage_1_2',
      unlockedStages: ['stage_1_1', 'stage_1_2'],
      clearedStages: ['stage_1_1'],
    },
    gacha: { ssrPity: 32, totalPulls: 40, history: [] },
    inventory: { items: [{ id: 'item_xp_chip', name: 'Tactical XP Chip', category: 'materials', quantity: 9 }] },
    settings: { musicVolume: 0.3, sfxVolume: 0.7, battleSpeed: 2, graphicsQuality: 'medium' },
  };
  storage.setItem('astral_command_save_v1', JSON.stringify(legacyV1));

  const saveManager = new SaveManager({ storage, eventBus: bus });
  const loaded = saveManager.load();
  assert.equal(loaded.data.version, SAVE_VERSION);
  assert.equal(loaded.data.player.name, 'VeteranCmdr');
  assert.equal(loaded.data.player.level, 7);
  assert.equal(loaded.data.resources.credits, 8888);
  assert.equal(loaded.data.resources.astrite, 5120);
  assert.equal(loaded.data.gacha.ssrPity, 32);
  assert.deepEqual(loaded.data.progression.clearedStages, ['stage_1_1']);
  assert.equal(typeof loaded.data.progression.stageRatings, 'object');
  assert.equal(typeof loaded.data.progression.battleStats.battlesWon, 'number');

  // Verify battle rewards apply once and duplicate sessionId is rejected
  const state = new GameState(loaded.data, bus);
  const economy = new EconomySystem({ gameState: state, saveManager, eventBus: bus });
  const heroes = new HeroSystem({ dataRegistry: registry, gameState: state, saveManager, eventBus: bus });
  const progression = new ProgressionSystem({ dataRegistry: registry, gameState: state, saveManager, eventBus: bus });

  const creditsBefore = state.resources.credits;
  const firstReward = progression.recordBattleOutcome({
    sessionId: 'session_unique_01',
    stageId: 'stage_1_2',
    victory: true,
    rating: 'S',
    enemiesDefeated: 12,
    economySystem: economy,
    heroSystem: heroes,
  });
  assert.equal(firstReward.applied, true);
  assert.ok(state.resources.credits > creditsBefore);
  assert.equal(state.progression.stageRatings.stage_1_2, 'S');

  const creditsAfterFirst = state.resources.credits;
  const duplicateReward = progression.recordBattleOutcome({
    sessionId: 'session_unique_01',
    stageId: 'stage_1_2',
    victory: true,
    rating: 'S',
    enemiesDefeated: 12,
    economySystem: economy,
    heroSystem: heroes,
  });
  assert.equal(duplicateReward.applied, false);
  assert.equal(duplicateReward.duplicate, true);
  assert.equal(state.resources.credits, creditsAfterFirst);

  // Reload from storage verifies persistence & cleanliness (no transient battle fields saved)
  const reloaded = saveManager.load();
  assert.equal(reloaded.data.resources.credits, creditsAfterFirst);
  assert.equal(reloaded.data.progression.stageRatings.stage_1_2, 'S');
  assert.equal('battle' in reloaded.data, false);
});
