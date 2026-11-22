import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildDataRegistry } from '../src/utils/DataLoader.js';
import { EventBus } from '../src/core/EventBus.js';
import { GameState } from '../src/core/GameState.js';
import { SaveManager } from '../src/core/SaveManager.js';
import { createMemoryStorage } from '../src/utils/StorageUtils.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { HeroSystem } from '../src/systems/HeroSystem.js';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.js';
import { CardSystem } from '../src/systems/CardSystem.js';
import { UnitManager } from '../src/battle/UnitManager.js';
import { TargetingSystem } from '../src/battle/TargetingSystem.js';
import { MovementSystem } from '../src/battle/MovementSystem.js';
import { CombatSystem } from '../src/battle/CombatSystem.js';
import { ProjectileSystem } from '../src/battle/ProjectileSystem.js';
import { SkillSystem } from '../src/battle/SkillSystem.js';
import { WaveManager } from '../src/battle/WaveManager.js';
import { BattleManager, BATTLE_PHASES } from '../src/battle/BattleManager.js';
import { AnimationManager } from '../src/rendering/AnimationManager.js';

function createHeadlessGameHarness() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
  const dataRegistry = buildDataRegistry({
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

  const storage = createMemoryStorage();
  const eventBus = new EventBus();
  const saveManager = new SaveManager({ storage, eventBus });
  const initialSave = saveManager.load().data;
  const gameState = new GameState(initialSave, eventBus);

  const economySystem = new EconomySystem({ gameState, saveManager, eventBus });
  const heroSystem = new HeroSystem({ dataRegistry, gameState, saveManager, eventBus });
  const progressionSystem = new ProgressionSystem({ dataRegistry, gameState, saveManager, eventBus });
  const cardSystem = new CardSystem({ dataRegistry, gameState, eventBus });
  const unitManager = new UnitManager({ dataRegistry, eventBus });
  const targetingSystem = new TargetingSystem({ balance: dataRegistry.balance });
  const movementSystem = new MovementSystem({ balance: dataRegistry.balance });
  const combatSystem = new CombatSystem({ eventBus, dataRegistry });
  const projectileSystem = new ProjectileSystem({ eventBus });
  const skillSystem = new SkillSystem({ gameState, heroSystem, eventBus, dataRegistry });
  const waveManager = new WaveManager({ eventBus, balance: dataRegistry.balance });
  const animationManager = new AnimationManager();

  const battleManager = new BattleManager({
    dataRegistry,
    gameState,
    eventBus,
    progressionSystem,
    economySystem,
    heroSystem,
    cardSystem,
    unitManager,
    targetingSystem,
    movementSystem,
    combatSystem,
    projectileSystem,
    skillSystem,
    waveManager,
    battleRenderer: null,
    animationManager,
    particleSystem: null,
    audioManager: null,
  });

  return {
    dataRegistry,
    storage,
    eventBus,
    saveManager,
    gameState,
    economySystem,
    heroSystem,
    progressionSystem,
    cardSystem,
    unitManager,
    combatSystem,
    waveManager,
    battleManager,
  };
}

test('Full P1 Battle Integration: Preparation -> Combat -> Cards & Merge -> Ultimate -> Waves & Boss -> Victory -> Rewards & Save', () => {
  const h = createHeadlessGameHarness();
  const creditsBefore = h.gameState.resources.credits;

  // Deterministic sequence ensuring slots 0 & 1 match for merge testing, while all 4 categories appear in slots 0..5
  const initSeq = [0.0, 0.0, 0.55, 0.72, 0.9, 0.2, 0.55, 0.72, 0.9, 0.0];
  let seqIdx = 0;
  h.cardSystem.setRandomSource(() => initSeq[seqIdx++ % initSeq.length]);

  // 1. Enter preparation
  h.battleManager.startSession(null, { stageId: 'stage_1_1' });
  assert.equal(h.battleManager.getPhase(), BATTLE_PHASES.PREPARATION);
  assert.ok(h.unitManager.getActiveCount('ally') >= 4);

  // 2. Arrange units inside friendly region (and reject invalid right-side placement)
  const firstAlly = h.unitManager.getBySide('ally')[0];
  assert.equal(h.battleManager.movePrepUnit(firstAlly.uid, 85, 50).ok, false);
  const moved = h.battleManager.movePrepUnit(firstAlly.uid, 20, 46);
  assert.equal(moved.ok, true);
  assert.ok(h.battleManager.battlefield.isInsideFriendlyRegion(firstAlly.x, firstAlly.y));

  // Verify speed cycling 1x -> 2x -> 3x -> 1x
  assert.equal(h.battleManager.cycleSpeed(), 2);
  assert.equal(h.battleManager.cycleSpeed(), 3);
  assert.equal(h.battleManager.cycleSpeed(), 1);

  // 3. Start battle & step past battle_start into active_combat
  assert.equal(h.battleManager.beginBattle().ok, true);
  assert.equal(h.battleManager.getPhase(), BATTLE_PHASES.BATTLE_START);

  for (let i = 0; i < 65; i += 1) {
    h.battleManager.stepSimulation(1 / 60);
  }
  assert.equal(h.battleManager.getPhase(), BATTLE_PHASES.ACTIVE_COMBAT);
  assert.ok(h.unitManager.getActiveCount('enemy') > 0, 'Wave 1 enemies must spawn');

  // Verify Pause stops simulation cleanly
  h.battleManager.togglePause();
  const pausedElapsed = h.gameState.battle.elapsedSec;
  h.battleManager.stepSimulation(1 / 60);
  assert.equal(h.gameState.battle.elapsedSec, pausedElapsed);
  h.battleManager.togglePause();

  // 4. Observe independent movement, combat, damage, and healing
  const allyStartX = firstAlly.x;
  let sawDamage = false;
  let sawHeal = false;
  let sawBoss = false;
  let sawWave2 = false;
  let mergedCard = false;
  let ultimateActivated = false;
  const categoriesPlayed = new Set();

  h.eventBus.on('combat:damage', () => {
    sawDamage = true;
  });
  h.eventBus.on('combat:heal', () => {
    sawHeal = true;
  });
  h.eventBus.on('battle:bossSpawned', () => {
    sawBoss = true;
  });
  h.eventBus.on('battle:waveSpawned', ({ waveNumber }) => {
    if (waveNumber >= 2) sawWave2 = true;
  });

  // 5. Merge identical cards in slots 0 and 1 (must NOT spawn a unit directly)
  const allyCountBeforeMerge = h.unitManager.getActiveCount('ally');
  const sel0 = h.battleManager.interactWithCardSlot(0);
  assert.equal(sel0.action, 'selected');
  const mergeRes = h.battleManager.interactWithCardSlot(1);
  assert.equal(mergeRes.action, 'merged');
  assert.equal(mergeRes.ok, true);
  assert.equal(mergeRes.upgradedCard.tier, 2);
  assert.equal(h.unitManager.getActiveCount('ally'), allyCountBeforeMerge, 'Merging must not spawn a unit');
  mergedCard = true;

  // Run full battle loop while intelligently deploying cards & activating ASTRA's ultimate
  for (let step = 0; step < 60 * 240; step += 1) {
    if (h.battleManager.getPhase() === BATTLE_PHASES.RESULTS) break;

    h.battleManager.stepSimulation(1 / 60);

    // Activate Commander Ultimate when Ultimate Energy reaches 100
    if (h.gameState.battle.ultimateEnergy >= 100) {
      const ultRes = h.battleManager.triggerUltimate();
      if (ultRes.ok) {
        ultimateActivated = true;
        assert.equal(h.gameState.battle.ultimateEnergy, 0);
      }
    }

    // Play cards periodically as Command Energy regenerates, prioritizing unplayed categories first
    if (step % 45 === 0) {
      const slots = h.cardSystem.getSlots();
      const neededSlot = slots.findIndex((c) => c && !categoriesPlayed.has(c.category));
      const candidateIndices = neededSlot >= 0 ? [neededSlot] : [0, 1, 2, 3, 4, 5];
      for (const idx of candidateIndices) {
        const card = slots[idx];
        if (!card) continue;
        if (h.gameState.battle.energy >= card.cost && h.cardSystem.getCardCooldown(card.cardId) <= 0) {
          const playRes = h.battleManager.playCardSlot(idx);
          if (playRes.ok) {
            categoriesPlayed.add(playRes.card.category);
            break;
          }
        }
      }
    }
  }

  // Assert every milestone of the full battle loop succeeded
  assert.ok(firstAlly.x > allyStartX || h.combatSystem.getStats().damageDealt > 0, 'Units must advance and fight');
  assert.equal(sawDamage, true, 'Combat damage must occur');
  assert.equal(sawHeal, true, 'Healing must occur via Field Cleric, Skill/Support cards, or ASTRA ultimate');
  assert.equal(mergedCard, true, 'Identical card merge must succeed');
  assert.ok(categoriesPlayed.has('unit'), 'Unit card must be played');
  assert.ok(categoriesPlayed.has('skill'), 'Skill card must be played');
  assert.ok(categoriesPlayed.has('tactic'), 'Tactic card must be played');
  assert.ok(categoriesPlayed.has('support'), 'Support card must be played');
  assert.equal(ultimateActivated, true, 'ASTRA Commander ultimate must charge and activate');
  assert.equal(sawWave2, true, 'Multiple enemy waves must spawn');
  assert.equal(sawBoss, true, 'Final stage boss must spawn');

  assert.equal(h.battleManager.getPhase(), BATTLE_PHASES.RESULTS, 'Battle must reach Results phase');
  const results = h.gameState.battle.results;
  assert.ok(results, 'Results payload must be populated');
  assert.equal(results.victory, true, 'Player squad with cards and ultimate should win Stage 1-1');
  assert.ok(['S', 'A', 'B', 'C'].includes(results.rating));
  assert.ok(results.enemiesDefeated >= 10);
  assert.ok(results.damageDealt > 0);
  assert.ok(results.healingPerformed > 0);

  // Rewards applied & persisted cleanly
  assert.ok(h.gameState.resources.credits > creditsBefore);
  const reloaded = h.saveManager.load();
  assert.equal(reloaded.status, 'loaded');
  assert.equal(reloaded.data.resources.credits, h.gameState.resources.credits);
  assert.ok(reloaded.data.progression.clearedStages.includes('stage_1_1'));
});

test('Defeat triggers strictly when all friendly units die and no reinforcement unit cards remain (not on random refills alone)', () => {
  const h = createHeadlessGameHarness();
  h.battleManager.startSession(null, {
    stageId: 'stage_1_3',
    customDeckIds: [
      'card_skill_astral_nova',
      'card_skill_sanctuary_wave',
      'card_tactic_full_assault',
      'card_tactic_focus_fire',
      'card_support_aegis_blessing',
      'card_support_overclock_core',
    ],
  });

  // Start battle and step into active combat
  h.battleManager.beginBattle();
  for (let i = 0; i < 65; i += 1) h.battleManager.stepSimulation(1 / 60);
  assert.equal(h.battleManager.getPhase(), BATTLE_PHASES.ACTIVE_COMBAT);

  // Deck pool has no unit cards, yet living allies keep battle going until defeated
  assert.equal(h.cardSystem.hasRemainingUnitCards(), false);
  assert.equal(h.battleManager.getPhase(), BATTLE_PHASES.ACTIVE_COMBAT);

  // Defeat all friendly units -> now defeat MUST trigger cleanly
  for (const ally of h.unitManager.getBySide('ally')) {
    h.combatSystem.applyDamage({
      source: null,
      target: ally,
      rawAttack: 99999,
      unitManager: h.unitManager,
    });
  }
  h.battleManager.stepSimulation(1 / 60);

  assert.equal(h.battleManager.getPhase(), BATTLE_PHASES.RESULTS);
  assert.equal(h.gameState.battle.results.victory, false);
  assert.equal(h.gameState.battle.results.rating, '—');
});
