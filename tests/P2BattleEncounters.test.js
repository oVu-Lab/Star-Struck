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
import { FormationSystem } from '../src/systems/FormationSystem.js';
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

function createBattleHarness() {
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

  // Unlock all commanders & playable units for encounter testing
  for (const h of dataRegistry.heroes) heroSystem.grantHero(h.id);
  for (const u of dataRegistry.units) formationSystem.unlockUnit(u.id, cardSystem);
  for (const c of dataRegistry.cards) cardSystem.unlockCard(c.id);

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
    heroSystem,
    cardSystem,
    progressionSystem,
    economySystem,
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
    eventBus,
  });

  return {
    dataRegistry,
    eventBus,
    gameState,
    heroSystem,
    formationSystem,
    cardSystem,
    progressionSystem,
    unitManager,
    combatSystem,
    projectileSystem,
    skillSystem,
    battleManager,
  };
}

test('P2 Encounters: Elite modifiers apply fortified shields, regeneration, and frenzied strikes through Combat/Unit systems', () => {
  const h = createBattleHarness();
  h.battleManager.startSession(null, { stageId: 'stage_1_4' });
  h.battleManager.beginBattle();
  for (let i = 0; i < 65; i += 1) h.battleManager.stepSimulation(1 / 60);

  // Clear Wave 1 cleanly to trigger Wave 2 elite spawn (elite_storm_lancer)
  for (const e of h.unitManager.getBySide('enemy')) {
    h.combatSystem.applyDamage({ source: null, target: e, rawAttack: 99999, unitManager: h.unitManager });
  }
  for (let i = 0; i < 140; i += 1) h.battleManager.stepSimulation(1 / 60);

  const wave2Elites = h.unitManager.getBySide('enemy').filter((u) => u.isElite);
  assert.ok(wave2Elites.length >= 1, 'Stage 1-4 Wave 2 should spawn an elite unit');

  // Spawn an elite with Fortified Hull + Regenerative Core modifiers and verify shield & periodic HP regen
  const modElite = h.unitManager.spawnUnit({
    unitId: 'enemy_siege_juggernaut',
    side: 'enemy',
    x: 92,
    y: 92,
    level: 4,
    isElite: true,
    eliteId: 'elite_bastion_titan',
    extraModifiers: ['mod_fortified_hull', 'mod_regenerative_core'],
  });
  assert.ok(modElite);
  assert.ok(modElite.modifierIds.includes('mod_fortified_hull'));
  assert.ok(modElite.modifierIds.includes('mod_regenerative_core'));
  assert.ok(modElite.shield > 0, 'Fortified Hull modifier must grant opening shield');
  assert.ok(modElite.regenConfig?.percent > 0, 'Regenerative Core modifier must configure periodic regen');

  // Wound the elite (breaking shield first) and isolate it across the 100x100 map so incoming damage doesn't mask regen
  modElite.shield = 0;
  modElite.hp = Math.floor(modElite.maxHp * 0.5);
  const hpAfterWound = modElite.hp;
  for (const ally of h.unitManager.getBySide('ally')) {
    ally.x = 6;
    ally.y = 6;
  }
  for (let i = 0; i < 220; i += 1) h.battleManager.stepSimulation(1 / 60);
  assert.ok(modElite.hp > hpAfterWound, 'Regenerative Core elite should regenerate HP over time');
});

test('P2 Commanders: switching to non-ASTRA commanders during prep applies passives and executes distinct ultimates', () => {
  const h = createBattleHarness();

  // 1. Seraphina: +10% ATK passive + Celestial Volley (high damage + defense shred)
  h.battleManager.startSession(null, { stageId: 'stage_2_1' });
  assert.equal(h.battleManager.setPrepCommander('seraphina').ok, true);
  assert.equal(h.heroSystem.getActiveCommander().id, 'seraphina');

  const allyWithSeraphina = h.unitManager.getBySide('ally')[0];
  const baseDef = h.dataRegistry.unitsById.get(allyWithSeraphina.unitId);
  assert.ok(allyWithSeraphina.attack > baseDef.stats.attack, 'Seraphina +10% ATK passive must boost ally attack');

  h.battleManager.beginBattle();
  for (let i = 0; i < 65; i += 1) h.battleManager.stepSimulation(1 / 60);
  h.gameState.setBattle({ ultimateEnergy: 100 });
  const seraUlt = h.battleManager.triggerUltimate();
  assert.equal(seraUlt.ok, true);
  assert.ok(seraUlt.summary.totalDamage > 0, 'Seraphina Celestial Volley must deal damage');
  const shredded = h.unitManager.getBySide('enemy').some((e) => e.statusEffects.some((s) => s.type === 'debuff_defense'));
  assert.equal(shredded, true, 'Seraphina ultimate must apply defense shred');

  // 2. Kael: Tempest Charge (damage + enemy slow + ally ATK/SPD buff)
  h.battleManager.startSession(null, { stageId: 'stage_2_1' });
  assert.equal(h.battleManager.setPrepCommander('kael').ok, true);
  h.battleManager.beginBattle();
  for (let i = 0; i < 65; i += 1) h.battleManager.stepSimulation(1 / 60);
  h.gameState.setBattle({ ultimateEnergy: 100 });
  const kaelUlt = h.battleManager.triggerUltimate();
  assert.equal(kaelUlt.ok, true);
  assert.ok(kaelUlt.summary.totalDamage > 0);
  assert.equal(
    h.unitManager.getBySide('enemy').some((e) => e.statusEffects.some((s) => s.type === 'debuff_slow')),
    true,
    'Kael ultimate must slow enemies',
  );

  // 3. Vanguard Zero (Orin Vance): Fortified Line (shield + DEF buff + +20 Command Energy)
  h.battleManager.startSession(null, { stageId: 'stage_2_1' });
  assert.equal(h.battleManager.setPrepCommander('vanguard_zero').ok, true);
  h.battleManager.beginBattle();
  for (let i = 0; i < 65; i += 1) h.battleManager.stepSimulation(1 / 60);
  h.gameState.setBattle({ energy: 40, dp: 40, ultimateEnergy: 100 });
  const orinUlt = h.battleManager.triggerUltimate();
  assert.equal(orinUlt.ok, true);
  assert.equal(orinUlt.summary.commandEnergyGained, 20);
  assert.ok(h.unitManager.getBySide('ally').every((a) => a.shield > 0), 'Fortified Line must shield all allies');
});

test('P2 New Units & New Cards: all 6 new playable units and new Skill/Tactic/Support cards resolve through real gameplay systems', () => {
  const h = createBattleHarness();
  const newUnitDeck = [
    'card_vanguard_breaker',
    'card_aegis_sentinel',
    'card_solar_pyromancer',
    'card_chrono_weaver',
    'card_astral_construct',
    'card_pulse_skirmisher',
  ];
  const tacticalDeck = [
    'card_skill_orbital_lance',
    'card_skill_gravity_vortex',
    'card_skill_chain_lightning',
    'card_tactic_flank_maneuver',
    'card_support_starlight_catalyst',
    'card_support_haste_relay',
  ];

  // Phase A: Deploy all 6 new unit cards deterministically
  h.battleManager.startSession(null, {
    stageId: 'stage_2_2',
    customDeckIds: newUnitDeck,
    initialSlots: newUnitDeck,
  });
  h.battleManager.beginBattle();
  for (let i = 0; i < 65; i += 1) h.battleManager.stepSimulation(1 / 60);

  for (let slot = 0; slot < 6; slot += 1) {
    h.gameState.setBattle({ energy: 100, dp: 100 });
    h.battleManager.interactWithCardSlot(slot);
    const playRes = h.battleManager.interactWithCardSlot(slot);
    assert.equal(playRes.ok, true, `Failed to play slot ${slot}: ${playRes.reason}`);
  }

  const allyIds = new Set(h.unitManager.getBySide('ally').map((u) => u.unitId));
  for (const newUnitId of [
    'vanguard_breaker',
    'aegis_sentinel',
    'solar_pyromancer',
    'chrono_weaver',
    'astral_construct',
    'pulse_skirmisher',
  ]) {
    assert.ok(allyIds.has(newUnitId), `Expected new unit ${newUnitId} on battlefield`);
  }

  // Verify astral_construct is CC-immune against stun
  const construct = h.unitManager.getBySide('ally').find((u) => u.unitId === 'astral_construct');
  h.unitManager.applyStatusEffect(construct, { type: 'stun', durationSec: 2.0 });
  assert.equal(h.unitManager.hasStatus(construct, 'stun'), false, 'Astral Construct must be immune to stun');

  // Track Aegis Sentinel shield projectile impact
  let shieldApplied = false;
  h.eventBus.on('combat:shield', () => {
    shieldApplied = true;
  });

  // Phase B: Configure deterministic refill for the 6 new Skill, Tactic, and Support cards and cast them after 5s refill
  let refillCursor = 0;
  h.cardSystem._activeDeckPool = tacticalDeck.map((id) => h.dataRegistry.cardsById.get(id));
  h.cardSystem.setCardGenerator(() => tacticalDeck[refillCursor++ % tacticalDeck.length]);
  // Advance 5.1s so all 6 slots refill with the 6 tactical cards (and cooldowns expire)
  for (let i = 0; i < 310; i += 1) h.battleManager.stepSimulation(1 / 60);

  h.gameState.setBattle({ ultimateEnergy: 0 });
  const ultBefore = h.gameState.battle.ultimateEnergy;
  for (let slot = 0; slot < 6; slot += 1) {
    h.gameState.setBattle({ energy: 100, dp: 100 });
    h.battleManager.interactWithCardSlot(slot);
    const res = h.battleManager.interactWithCardSlot(slot);
    assert.equal(res.ok, true, `Failed to cast tactical card in slot ${slot}: ${res.reason}`);
  }

  // Starlight Catalyst must have charged Ultimate Energy
  assert.ok(h.gameState.battle.ultimateEnergy > ultBefore, 'Starlight Catalyst must grant Ultimate Energy');

  // Step combat forward 3 seconds so Aegis Sentinel & Solar Pyromancer projectiles resolve
  for (let i = 0; i < 180; i += 1) h.battleManager.stepSimulation(1 / 60);
  assert.equal(shieldApplied, true, 'Aegis Sentinel should apply shields to allies in combat');
});

test('P2 Boss Encounters: Chrono Arbiter (Stage 2-4) and Astral Leviathan (Stage 3-4) spawn with >=2 abilities and can be defeated cleanly', () => {
  for (const { stageId, expectedBossId } of [
    { stageId: 'stage_2_4', expectedBossId: 'boss_chrono_arbiter' },
    { stageId: 'stage_3_4', expectedBossId: 'boss_astral_leviathan' },
  ]) {
    const h = createBattleHarness();
    h.battleManager.startSession(null, { stageId });
    h.battleManager.beginBattle();

    let bossSeen = null;
    let castObserved = false;
    h.eventBus.on('boss:abilityResolved', ({ unit }) => {
      if (unit?.bossId === expectedBossId) castObserved = true;
    });

    for (let step = 0; step < 900; step += 1) {
      h.battleManager.stepSimulation(1 / 30);
      const enemies = h.unitManager.getBySide('enemy');
      const boss = enemies.find((u) => u.isBoss);
      if (boss) {
        bossSeen = boss;
        if (castObserved || step > 550) {
          h.combatSystem.applyDamage({
            source: h.unitManager.getBySide('ally')[0] || null,
            target: boss,
            rawAttack: 99999,
            damageType: 'magical',
            unitManager: h.unitManager,
          });
        }
      } else if (h.battleManager.getPhase() === BATTLE_PHASES.ACTIVE_COMBAT && enemies.length > 0) {
        for (const e of enemies) {
          h.combatSystem.applyDamage({
            source: h.unitManager.getBySide('ally')[0] || null,
            target: e,
            rawAttack: 99999,
            unitManager: h.unitManager,
          });
        }
      }
      if (h.battleManager.getPhase() === BATTLE_PHASES.RESULTS) break;
    }

    assert.ok(bossSeen, `Expected boss ${expectedBossId} to spawn on ${stageId}`);
    assert.equal(bossSeen.bossId, expectedBossId);
    assert.ok(bossSeen.abilities.length >= 2, `Boss ${expectedBossId} must have >= 2 abilities`);
    assert.equal(castObserved, true, `Boss ${expectedBossId} should cast an ability during combat`);
    assert.equal(h.battleManager.getPhase(), BATTLE_PHASES.RESULTS);
    assert.equal(h.gameState.battle.results.victory, true);
  }
});

test('P2 Stress & Stability: 25v25 (50 active units) simulates 60 frames cleanly with zero NaN coordinates or HP', () => {
  const h = createBattleHarness();
  h.battleManager.startSession(null, { stageId: 'stage_3_3' });
  h.battleManager.beginBattle();
  for (let i = 0; i < 65; i += 1) h.battleManager.stepSimulation(1 / 60);

  const allyRoster = ['heavy_shield_guard', 'vanguard_breaker', 'pulse_skirmisher', 'solar_pyromancer', 'aegis_sentinel', 'chrono_weaver'];
  const enemyRoster = ['enemy_void_vanguard', 'enemy_rift_stalker', 'enemy_obsidian_marksman', 'enemy_inferno_bombardier', 'enemy_cryo_warden'];

  let idx = 0;
  while (h.unitManager.canSpawn('ally').ok) {
    h.unitManager.spawnUnit({
      unitId: allyRoster[idx % allyRoster.length],
      side: 'ally',
      x: 1 + (idx % 4) * 0.8,
      y: 1 + Math.floor(idx / 4) * 1.1,
    });
    idx += 1;
  }
  idx = 0;
  while (h.unitManager.canSpawn('enemy').ok) {
    h.unitManager.spawnUnit({
      unitId: enemyRoster[idx % enemyRoster.length],
      side: 'enemy',
      x: 6 + (idx % 4) * 0.8,
      y: 1 + Math.floor(idx / 4) * 1.1,
    });
    idx += 1;
  }

  assert.equal(h.unitManager.getAll().length, 50);

  for (let frame = 0; frame < 60; frame += 1) {
    h.battleManager.stepSimulation(1 / 30);
  }

  for (const u of h.unitManager.getAll()) {
    assert.equal(Number.isFinite(u.x), true, 'Unit x must be finite');
    assert.equal(Number.isFinite(u.y), true, 'Unit y must be finite');
    assert.equal(Number.isFinite(u.hp), true, 'Unit hp must be finite');
  }
  assert.ok(h.projectileSystem.getAll().length < 250, 'Projectiles must remain bounded');
});
