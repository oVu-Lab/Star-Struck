import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  STARFALL_DURATION_SEC,
  STARFALL_REDUCED_DURATION_SEC,
  STARFALL_DAMAGE_STAGE_DEFS,
  STAR_ARCHETYPES,
  IMPACT_STYLES,
  buildStarfallDamageStages,
  createStarfallPlan,
  drawAstraStarfallWorldEffect,
  getStarfallCameraSchedule,
} from '../src/rendering/AstraStarfallVfx.js';
import { Battlefield } from '../src/battle/Battlefield.js';
import { AnimationManager } from '../src/rendering/AnimationManager.js';
import { ParticleSystem } from '../src/rendering/ParticleSystem.js';
import { BattleManager } from '../src/battle/BattleManager.js';
import { UnitManager } from '../src/battle/UnitManager.js';
import { TargetingSystem } from '../src/battle/TargetingSystem.js';
import { MovementSystem } from '../src/battle/MovementSystem.js';
import { CombatSystem } from '../src/battle/CombatSystem.js';
import { ProjectileSystem } from '../src/battle/ProjectileSystem.js';
import { SkillSystem } from '../src/battle/SkillSystem.js';
import { WaveManager } from '../src/battle/WaveManager.js';
import { EventBus } from '../src/core/EventBus.js';
import { GameState } from '../src/core/GameState.js';
import { SaveManager } from '../src/core/SaveManager.js';
import { AudioManager } from '../src/core/AudioManager.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { HeroSystem } from '../src/systems/HeroSystem.js';
import { FormationSystem } from '../src/systems/FormationSystem.js';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.js';
import { CardSystem } from '../src/systems/CardSystem.js';
import { buildDataRegistry } from '../src/utils/DataLoader.js';
import { createMemoryStorage } from '../src/utils/StorageUtils.js';
import { BattleScreen } from '../src/ui/BattleScreen.js';

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

function createFullHarness() {
  const dataRegistry = loadRegistry();
  const storage = createMemoryStorage();
  const eventBus = new EventBus();
  const saveManager = new SaveManager({ storage, eventBus });
  const gameState = new GameState(saveManager.load().data, eventBus);
  const audioManager = new AudioManager(gameState);
  const economySystem = new EconomySystem({ gameState, saveManager, eventBus });
  const heroSystem = new HeroSystem({ dataRegistry, gameState, saveManager, eventBus });
  const formationSystem = new FormationSystem({ dataRegistry, gameState, heroSystem, saveManager, eventBus });
  const cardSystem = new CardSystem({ dataRegistry, gameState, saveManager, eventBus });
  const progressionSystem = new ProgressionSystem({
    dataRegistry,
    gameState,
    economySystem,
    formationSystem,
    cardSystem,
    saveManager,
    eventBus,
  });

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
  const particleSystem = new ParticleSystem();

  const battleManager = new BattleManager({
    dataRegistry,
    gameState,
    eventBus,
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
    battleRenderer: {
      getDimensions: () => ({ width: 1280, height: 720 }),
      attach() {},
      detach() {},
      resize() {},
      setBattlefield() {},
      setDebugMode() {},
      hitTestCommanderDais: () => false,
      render() {},
    },
    animationManager,
    particleSystem,
    audioManager,
  });

  return {
    dataRegistry,
    eventBus,
    saveManager,
    gameState,
    audioManager,
    heroSystem,
    formationSystem,
    progressionSystem,
    cardSystem,
    unitManager,
    combatSystem,
    skillSystem,
    animationManager,
    particleSystem,
    battleManager,
  };
}

function createFiniteCheckingCtx() {
  const nonFiniteCoords = [];
  const check = (op, ...vals) => {
    for (const v of vals) {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        nonFiniteCoords.push({ op, v });
      }
    }
  };
  let drawCount = 0;
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    translate(x, y) { check('translate', x, y); },
    rotate(a) { check('rotate', a); },
    scale(x, y) { check('scale', x, y); },
    moveTo(x, y) { check('moveTo', x, y); },
    lineTo(x, y) { check('lineTo', x, y); },
    arc(x, y, r, s, e) { check('arc', x, y, r, s, e); },
    ellipse(x, y, rx, ry, rot, s, e) { check('ellipse', x, y, rx, ry, rot, s, e); },
    quadraticCurveTo(cpx, cpy, x, y) { check('quadraticCurveTo', cpx, cpy, x, y); },
    fillRect(x, y, w, h) { check('fillRect', x, y, w, h); drawCount += 1; },
    strokeRect(x, y, w, h) { check('strokeRect', x, y, w, h); drawCount += 1; },
    fill() { drawCount += 1; },
    stroke() { drawCount += 1; },
    setLineDash() {},
    createLinearGradient(x0, y0, x1, y1) {
      check('createLinearGradient', x0, y0, x1, y1);
      return { addColorStop() {} };
    },
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      check('createRadialGradient', x0, y0, r0, x1, y1, r1);
      return { addColorStop() {} };
    },
  };
  return {
    ctx,
    getDrawCount: () => drawCount,
    getNonFiniteCoords: () => nonFiniteCoords,
  };
}

test('buildStarfallDamageStages splits damage into 6 continuous shower ticks (60%) + 1 colossal impact (40%) summing strictly to total', () => {
  for (const total of [420, 240, 259, 317, 100, 1]) {
    const stages = buildStarfallDamageStages({ totalRawDamage: total, duration: STARFALL_DURATION_SEC });
    assert.equal(stages.length, 7);
    assert.equal(stages.reduce((acc, s) => acc + s.rawDamage, 0), total, `Exact raw damage sum for ${total}`);
    for (let i = 1; i < stages.length; i += 1) {
      assert.ok(stages[i].triggerTime > stages[i - 1].triggerTime, 'Stage trigger times must increase monotonically');
    }
  }

  const normalStages = buildStarfallDamageStages({ totalRawDamage: 420, duration: STARFALL_DURATION_SEC });
  assert.deepEqual(
    normalStages.map((s) => s.rawDamage),
    [42, 42, 42, 42, 42, 42, 168],
  );
  assert.deepEqual(
    normalStages.map((s) => s.triggerTime),
    [0.58, 1.0, 1.42, 1.84, 2.26, 2.68, 4.35],
  );

  const reducedStages = buildStarfallDamageStages({
    totalRawDamage: 420,
    duration: STARFALL_REDUCED_DURATION_SEC,
  });
  assert.equal(reducedStages.reduce((acc, s) => acc + s.rawDamage, 0), 420);
  assert.ok(reducedStages[6].triggerTime < normalStages[6].triggerTime);
});

test('createStarfallPlan produces continuous smooth meteor shower + subsidence + ONE colossal final meteor', () => {
  const plan = createStarfallPlan({
    enemies: [
      { x: 64, y: 28, isBoss: false },
      { x: 76, y: 50, isBoss: true },
      { x: 82, y: 74, isElite: true },
    ],
    allies: [
      { x: 20, y: 38 },
      { x: 24, y: 62 },
    ],
    seed: 2026,
    quality: 'high',
    reducedMotion: false,
  });

  assert.equal(plan.duration, STARFALL_DURATION_SEC);
  assert.equal(plan.damageStages.length, 7);
  assert.ok(plan.stars.length >= 50, 'High-quality plan should schedule a sustained continuous shower + colossal meteor');
  assert.ok(plan.canopyStars.length >= 40, 'Sky canopy should contain rich starfield depth');
  assert.ok(plan.canopyEdges.length >= 8, 'Sky canopy should include constellation connections');
  assert.ok(plan.novaRays.length >= 16, 'Colossal impact should precompute sunburst rays');
  assert.ok(plan.lingeringMotes.length >= 30, 'Aftermath phase should precompute lingering motes');

  const seenArchetypes = new Set(plan.stars.map((s) => s.archetype));
  for (const arch of STAR_ARCHETYPES) {
    assert.ok(seenArchetypes.has(arch), `Missing star archetype: ${arch}`);
  }

  const seenDepths = new Set(plan.stars.map((s) => s.depthTier));
  assert.ok(seenDepths.has('far') && seenDepths.has('mid') && seenDepths.has('near'), 'Must include far, mid, and near depth tiers');

  const seenImpacts = new Set(plan.stars.map((s) => s.impactStyle));
  for (const style of IMPACT_STYLES) {
    assert.ok(seenImpacts.has(style), `Missing impact style: ${style}`);
  }

  // Strictly ONE colossal final meteor, never inside the shower
  const colossalMeteors = plan.stars.filter((s) => s.archetype === 'colossal');
  const showerMeteors = plan.stars.filter((s) => s.streamPhase === 'shower');
  assert.equal(colossalMeteors.length, 1, 'Must summon strictly ONE colossal final meteor');
  assert.ok(showerMeteors.every((s) => s.archetype !== 'colossal'), 'Shower must not contain colossal meteors');

  const colossal = colossalMeteors[0];
  const maxShowerSize = Math.max(...showerMeteors.map((s) => s.size));
  const maxShowerTrail = Math.max(...showerMeteors.map((s) => s.trailWidth));
  assert.ok(colossal.size >= maxShowerSize * 2.0, `Colossal meteor size (${colossal.size}) must dwarf shower (${maxShowerSize})`);
  assert.ok(colossal.trailWidth >= maxShowerTrail * 2.0, `Colossal trailWidth (${colossal.trailWidth}) must dwarf shower (${maxShowerTrail})`);
  assert.ok(colossal.startTime > plan.anticipationStart, 'Colossal meteor enters after shower subsides and anticipation begins');
  assert.equal(colossal.impactTime, plan.colossalImpact);

  // Verify continuous shower coverage + smooth coordinated trajectories
  const showerMid = showerMeteors.filter((s) => s.depthTier === 'mid');
  const showerSlants = showerMeteors.map((s) => s.slantX);
  const slantSpread = Math.max(...showerSlants) - Math.min(...showerSlants);
  assert.ok(slantSpread <= 5.0, `Continuous shower stream slant spread (${slantSpread.toFixed(2)}) must stay smooth and coordinated`);
  for (const star of plan.stars) {
    assert.ok(Math.abs(star.gentleDrift) <= 1.25, `Star trajectory drift too crooked: ${star.gentleDrift}`);
  }

  // Verify continuous arrival with no large mid-shower dead gaps before subsidence
  const sortedImpacts = showerMid.map((s) => s.impactTime).sort((a, b) => a - b);
  assert.ok(sortedImpacts[0] <= 0.65);
  assert.ok(sortedImpacts[sortedImpacts.length - 1] <= plan.anticipationStart);
  for (let i = 1; i < sortedImpacts.length; i += 1) {
    assert.ok(sortedImpacts[i] - sortedImpacts[i - 1] <= 0.28, 'Continuous shower must sustain steady overlapping arrivals');
  }
});

test('drawAstraStarfallWorldEffect renders ground and sky layers across all phases with finite geometry and clean composite state', () => {
  const bf = new Battlefield();
  const plan = createStarfallPlan({
    enemies: [{ x: 68, y: 48, isBoss: true }],
    allies: [{ x: 22, y: 50 }],
    seed: 901,
    quality: 'high',
  });

  // Checkpoints covering: opening, mid-shower, subsidence, anticipation, colossal in flight, colossal impact, aftermath
  const checkpointsSec = [0.15, 0.75, 1.50, 2.50, 3.30, 3.95, 4.42, 5.20];
  for (const ageSec of checkpointsSec) {
    const tracker = createFiniteCheckingCtx();
    const fx = {
      kind: 'starfall',
      age: ageSec,
      duration: plan.duration,
      seed: 901,
      meta: { awaitingAwakening: false, starfallPlan: plan },
    };

    drawAstraStarfallWorldEffect(tracker.ctx, bf, 1280, 720, fx, 'ground');
    drawAstraStarfallWorldEffect(tracker.ctx, bf, 1280, 720, fx, 'sky');

    assert.equal(tracker.getNonFiniteCoords().length, 0, `Non-finite coordinates at age ${ageSec}s`);
    assert.ok(tracker.getDrawCount() > 0, `Expected drawing activity at age ${ageSec}s`);
    assert.equal(tracker.ctx.globalCompositeOperation, 'source-over', 'Must restore composite mode');
  }

  // Test awaitingAwakening suppresses drawing until released
  const heldTracker = createFiniteCheckingCtx();
  drawAstraStarfallWorldEffect(
    heldTracker.ctx,
    bf,
    1280,
    720,
    { kind: 'starfall', age: 0.5, duration: plan.duration, meta: { awaitingAwakening: true, starfallPlan: plan } },
    'sky',
  );
  assert.equal(heldTracker.getDrawCount(), 0, 'Must suppress rendering while awaiting Phase One awakening');

  // Test fallback plan creation when fx.meta is missing
  const fallbackTracker = createFiniteCheckingCtx();
  const bareFx = { kind: 'starfall', age: 0.4, duration: 1.2, seed: 42 };
  drawAstraStarfallWorldEffect(fallbackTracker.ctx, bf, 1280, 720, bareFx, 'sky');
  assert.ok(bareFx.meta?.starfallPlan, 'Should attach fallback plan when fx.meta is omitted');
  assert.ok(fallbackTracker.getDrawCount() > 0);
});

test('Reduced-motion settings suppress Starfall camera impulses, align colossal flash time, and zero AnimationManager shake', () => {
  const rmSchedule = getStarfallCameraSchedule({ reducedMotion: true });
  assert.equal(rmSchedule.impulses.length, 0, 'Reduced motion must disable Starfall camera impulses');
  assert.ok(rmSchedule.flashes.every((f) => f.maxAlpha <= 0.2), 'Reduced motion flashes must stay gentle');

  const rmPlan = createStarfallPlan({ reducedMotion: true, seed: 55 });
  assert.equal(rmPlan.duration, STARFALL_REDUCED_DURATION_SEC);
  assert.equal(rmSchedule.flashes[1].delaySec, rmPlan.damageStages[6].impactTime);

  const prevWindow = globalThis.window;
  globalThis.window = {
    matchMedia: (q) => ({ matches: q === '(prefers-reduced-motion: reduce)' }),
  };
  try {
    const anim = new AnimationManager();
    anim.triggerScreenShake(9, 0.5);
    anim.scheduleCameraImpulse({ delaySec: 0, intensity: 8, durationSec: 0.3 });
    assert.deepEqual(anim.getShakeOffset(), { x: 0, y: 0 });
  } finally {
    globalThis.window = prevWindow;
  }
});

test('BattleManager synchronizes continuous shower + colossal meteor impact damage, preserves anticipation pause & exact total', () => {
  const h = createFullHarness();
  h.battleManager.startSession(null, { stageId: 'stage_1_1' });
  h.battleManager.beginBattle();
  for (let i = 0; i < 65; i += 1) h.battleManager.stepSimulation(1 / 60);

  h.unitManager.clear();
  const ally = h.unitManager.spawnUnit({
    unitId: 'heavy_shield_guard',
    side: 'ally',
    x: 16,
    y: 50,
    level: 1,
    tier: 1,
  });
  ally.hp = Math.max(1, ally.hp - 120);
  ally.attack = 0;
  ally.attackCooldown = 999;
  ally.moveSpeed = 0;
  ally.abilities = [];

  const enemyA = h.unitManager.spawnUnit({
    unitId: 'heavy_shield_guard',
    side: 'enemy',
    x: 72,
    y: 34,
    level: 1,
    tier: 1,
  });
  const enemyB = h.unitManager.spawnUnit({
    unitId: 'arcane_archer',
    side: 'enemy',
    x: 78,
    y: 66,
    level: 1,
    tier: 1,
  });
  for (const e of [enemyA, enemyB]) {
    e.maxHp = 5000;
    e.hp = 5000;
    e.attack = 0;
    e.attackCooldown = 999;
    e.moveSpeed = 0;
    e.abilities = [];
  }

  const enemyAHpBefore = enemyA.hp;
  const enemyBHpBefore = enemyB.hp;
  const allyHpBefore = ally.hp;

  const expectedFullA = h.combatSystem.calculateDamage({
    attack: 420,
    defense: h.unitManager.getEffectiveStat(enemyA, 'defense'),
    attackType: 'magical',
    armorPierce: 0,
    critChance: 0,
  }).amount;
  const expectedFullB = h.combatSystem.calculateDamage({
    attack: 420,
    defense: h.unitManager.getEffectiveStat(enemyB, 'defense'),
    attackType: 'magical',
    armorPierce: 0,
    critChance: 0,
  }).amount;

  const stageEvents = [];
  const completedEvents = [];
  const unsubStage = h.eventBus.on('commander:ultimateStageResolved', (ev) => stageEvents.push(ev));
  const unsubComplete = h.eventBus.on('commander:ultimateCompleted', (ev) => completedEvents.push(ev));

  const unsubHold = h.eventBus.on('commander:ultimateActivated', () => {
    h.battleManager.beginAstraAwakening();
  });

  h.gameState.setBattle({ ultimateEnergy: 100 });
  const ultRes = h.battleManager.triggerUltimate();
  unsubHold();

  assert.equal(ultRes.ok, true);
  assert.equal(ultRes.summary.stagedDamage, true);
  assert.equal(ultRes.summary.pendingRawDamage, 420);

  // Ally healing immediate; zero premature enemy damage
  assert.ok(ally.hp > allyHpBefore, 'Ally healing must remain immediate and intact');
  assert.equal(enemyA.hp, enemyAHpBefore, 'Enemy A must take 0 premature damage at activation');
  assert.equal(enemyB.hp, enemyBHpBefore, 'Enemy B must take 0 premature damage at activation');

  for (let i = 0; i < 60; i += 1) {
    h.battleManager.stepSimulation(1 / 60);
  }
  assert.equal(stageEvents.length, 0, 'Zero damage stages may resolve during Phase One awakening');

  h.battleManager.completeAstraAwakening();
  const starfallFx = h.animationManager.getWorldEffects().find((fx) => fx.kind === 'starfall');
  assert.ok(starfallFx, 'Must keep starfall world effect active');
  assert.equal(starfallFx.meta.awaitingAwakening, false);

  // Step 5.75s (345 ticks) and sample enemy A damage across shower, anticipation, and colossal impact
  let dmgBeforeShower = 0;
  let dmgAtAnticipationStart = 0;
  let dmgBeforeColossalImpact = 0;
  let dmgAfterColossalImpact = 0;

  for (let tick = 0; tick < 345; tick += 1) {
    h.battleManager.stepSimulation(1 / 60);
    const dealtA = enemyAHpBefore - enemyA.hp;
    if (tick === 20) dmgBeforeShower = dealtA;           // ~0.35s (before first shower tick at 0.58s)
    if (tick === 174) dmgAtAnticipationStart = dealtA; // ~2.92s (after all 6 shower ticks)
    if (tick === 252) dmgBeforeColossalImpact = dealtA; // ~4.22s (colossal meteor in flight!)
    if (tick === 270) dmgAfterColossalImpact = dealtA;  // ~4.52s (just after colossal impact at 4.35s)
  }

  unsubStage();
  unsubComplete();

  assert.equal(stageEvents.length, 7, 'Must resolve 6 continuous shower ticks + 1 colossal impact');
  assert.deepEqual(
    stageEvents.map((s) => s.stageIndex),
    [1, 2, 3, 4, 5, 6, 7],
  );
  for (let i = 0; i < stageEvents.length; i += 1) {
    assert.ok(
      Math.abs(stageEvents[i].timelineSec - stageEvents[i].triggerTime) <= 0.03,
      `Stage ${i + 1} must trigger directly at authoritative fx.age=${stageEvents[i].triggerTime}`,
    );
    assert.equal(stageEvents[i].enemiesHit, 2);
    assert.ok(stageEvents[i].stageDamageApplied > 0);
  }

  assert.equal(dmgBeforeShower, 0, 'No damage before shower begins');
  assert.ok(dmgAtAnticipationStart > 0 && dmgAtAnticipationStart < expectedFullA, 'Continuous shower deals ~60% of damage before anticipation');
  assert.equal(dmgBeforeColossalImpact, dmgAtAnticipationStart, 'Zero damage during anticipation / colossal meteor flight before impact');
  assert.equal(dmgAfterColossalImpact, expectedFullA, 'Colossal meteor impact deals the remaining ~40% finishing damage');

  assert.equal(enemyAHpBefore - enemyA.hp, expectedFullA, 'Enemy A total HP lost must equal exact intended ultimate damage');
  assert.equal(enemyBHpBefore - enemyB.hp, expectedFullB, 'Enemy B total HP lost must equal exact intended ultimate damage');

  assert.equal(completedEvents.length, 1);
  assert.equal(completedEvents[0].totalDamage, expectedFullA + expectedFullB);
  assert.equal(h.battleManager.getActiveStarfallSequences().length, 0);
});

test('Interrupted or ended battles cancel pending Starfall stages and prevent delayed damage in subsequent battles', () => {
  const h = createFullHarness();
  h.battleManager.startSession(null, { stageId: 'stage_1_1' });
  h.battleManager.beginBattle();
  for (let i = 0; i < 65; i += 1) h.battleManager.stepSimulation(1 / 60);

  const stageEvents = [];
  const unsub = h.eventBus.on('commander:ultimateStageResolved', (ev) => stageEvents.push(ev));

  h.gameState.setBattle({ ultimateEnergy: 100 });
  const ultRes = h.battleManager.triggerUltimate();
  assert.equal(ultRes.ok, true);

  // Advance past Stage 1 (0.65s) only, leaving remaining shower ticks + colossal impact pending
  for (let i = 0; i < 39; i += 1) h.battleManager.stepSimulation(1 / 60);
  assert.equal(stageEvents.length, 1, 'Only Stage 1 should have fired before interruption');

  // Interrupt battle via stopSession() and start a brand new battle session
  h.battleManager.stopSession();
  assert.equal(h.battleManager.getActiveStarfallSequences().length, 0, 'Pending sequences must clear on stopSession');

  h.battleManager.startSession(null, { stageId: 'stage_1_1' });
  h.battleManager.beginBattle();
  for (let i = 0; i < 65; i += 1) h.battleManager.stepSimulation(1 / 60);

  h.unitManager.clear();
  const freshEnemy = h.unitManager.spawnUnit({
    unitId: 'heavy_shield_guard',
    side: 'enemy',
    x: 78,
    y: 50,
    level: 1,
    tier: 1,
  });
  freshEnemy.maxHp = 4000;
  freshEnemy.hp = 4000;
  const freshHpBefore = freshEnemy.hp;

  for (let i = 0; i < 340; i += 1) h.battleManager.stepSimulation(1 / 60);
  unsub();

  assert.equal(stageEvents.length, 1, 'Interrupted ultimate must never fire remaining shower/colossal stages in later battle');
  assert.equal(freshEnemy.hp, freshHpBefore, 'Fresh enemy in later battle must take zero delayed Astra damage');
});

test('BattleScreen mounts Astra fullscreen webm overlay, plays/completes Phase One cleanly, and cleans up on unmount', async () => {
  const h = createFullHarness();

  class MockVideoElement {
    constructor() {
      this.id = 'astra-ultimate-video';
      this.src = '/astra-cardtemplate/assets-astra/ultimate-animation.webm';
      this.muted = false;
      this.volume = 1;
      this.currentTime = 0;
      this.duration = 3.0;
      this.paused = true;
      this._listeners = new Map();
    }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(fn);
    }
    removeEventListener(type, fn) {
      this._listeners.get(type)?.delete(fn);
    }
    dispatch(type) {
      for (const fn of [...(this._listeners.get(type) || [])]) fn({ target: this });
    }
    play() {
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
  }

  const prevHTMLVideoElement = globalThis.HTMLVideoElement;
  const prevDocument = globalThis.document;
  const prevWindow = globalThis.window;

  const videoEl = new MockVideoElement();
  const overlayClasses = new Set();
  const overlayEl = {
    id: 'astra-ultimate-cinema',
    hidden: true,
    offsetWidth: 1280,
    classList: {
      add: (...cls) => cls.forEach((c) => overlayClasses.add(c)),
      remove: (...cls) => cls.forEach((c) => overlayClasses.delete(c)),
      contains: (c) => overlayClasses.has(c),
    },
  };
  const eyebrowEl = { textContent: '' };
  const titleEl = { textContent: '' };

  let awakeningBegan = 0;
  let awakeningCompleted = 0;
  let awakeningCancelled = 0;

  const screen = new BattleScreen({
    battleManager: {
      beginAstraAwakening: () => { awakeningBegan += 1; },
      completeAstraAwakening: () => { awakeningCompleted += 1; },
      cancelAstraAwakening: () => { awakeningCancelled += 1; },
      stopSession() {},
    },
    heroSystem: h.heroSystem,
    progressionSystem: h.progressionSystem,
    assetManager: { bindImageElement() {} },
    eventBus: h.eventBus,
    screenManager: { navigate() {} },
    gameState: h.gameState,
    saveManager: h.saveManager,
    audioManager: h.audioManager,
    tutorialManager: { shouldLaunch: () => false, abortSession() {} },
    cardSystem: h.cardSystem,
  });

  const battleScreenSource = fs.readFileSync(path.resolve(process.cwd(), 'src/ui/BattleScreen.js'), 'utf8');
  assert.ok(
    battleScreenSource.includes('/astra-cardtemplate/assets-astra/ultimate-animation.webm'),
    'BattleScreen markup must reference ultimate-animation.webm',
  );

  globalThis.HTMLVideoElement = MockVideoElement;
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  globalThis.document = prevDocument;

  try {
    screen._container = {
      querySelector(sel) {
        if (sel === '#astra-ultimate-cinema') return overlayEl;
        if (sel === '#astra-ultimate-video') return videoEl;
        if (sel === '#astra-cinema-eyebrow') return eyebrowEl;
        if (sel === '#astra-cinema-title') return titleEl;
        return null;
      },
    };

    const astra = h.dataRegistry.heroesById.get('astra');
    const starfall = h.dataRegistry.skillsById.get('ult_starfall_barrage');
    screen._showCutin(astra, starfall);

    assert.equal(awakeningBegan, 1);
    assert.equal(overlayEl.hidden, false);
    assert.equal(overlayEl.classList.contains('is-visible'), true);
    assert.equal(videoEl.paused, false);
    assert.equal(screen._astraCinemaActive, true);

    videoEl.dispatch('ended');
    assert.equal(awakeningCompleted, 1);
    assert.equal(overlayEl.classList.contains('is-exiting'), true);

    await new Promise((r) => setTimeout(r, 290));
    assert.equal(overlayEl.hidden, true);
    assert.equal(videoEl.paused, true);
    assert.equal(screen._astraCinemaActive, false);

    screen._showCutin(astra, starfall);
    assert.equal(screen._astraCinemaActive, true);
    screen.unmount();
    assert.equal(awakeningCancelled, 1);
    assert.equal(overlayEl.hidden, true);
    assert.equal(videoEl.paused, true);
    assert.equal(screen._astraCinemaActive, false);
  } finally {
    globalThis.HTMLVideoElement = prevHTMLVideoElement;
    globalThis.document = prevDocument;
    globalThis.window = prevWindow;
  }
});

test('Astra ultimate webm asset exists in template directory', () => {
  const webmPath = path.resolve(process.cwd(), 'astra-cardtemplate/assets-astra/ultimate-animation.webm');
  assert.equal(fs.existsSync(webmPath), true, 'ultimate-animation.webm must exist');
  assert.ok(fs.statSync(webmPath).size > 100000, 'ultimate-animation.webm must be non-empty');
});

test('Astra Commander Energy generates at exact 0.2x rates across all combat sources while Command Energy & thresholds remain intact', () => {
  const h = createFullHarness();
  const ultCfg = h.dataRegistry.balance.ultimateEnergy;
  const cmdCfg = h.dataRegistry.balance.commandEnergy;

  assert.equal(ultCfg.max, 100);
  assert.equal(ultCfg.gainPerDamageDealt, 0.009);
  assert.equal(ultCfg.gainPerDamageReceived, 0.007);
  assert.equal(ultCfg.gainPerHeal, 0.009);
  assert.equal(ultCfg.gainPerKill, 0.8);

  // Deployment / Command Energy untouched
  assert.equal(cmdCfg.max, 100);
  assert.equal(cmdCfg.starting, 60);
  assert.equal(cmdCfg.regenPerSecond, 4.2);

  h.battleManager.startSession(null, { stageId: 'stage_1_1' });
  h.battleManager.beginBattle();
  for (let i = 0; i < 65; i += 1) h.battleManager.stepSimulation(1 / 60);
  h.unitManager.clear();

  const astraScale = h.dataRegistry.heroesById.get('astra').baseStats.energyRegen; // 1.15
  const ally = h.unitManager.spawnUnit({ unitId: 'heavy_shield_guard', side: 'ally', x: 20, y: 50, level: 1, tier: 1 });
  const enemy = h.unitManager.spawnUnit({ unitId: 'arcane_archer', side: 'enemy', x: 60, y: 50, level: 1, tier: 1 });
  ally.hp = ally.maxHp - 400;
  enemy.maxHp = 2000;
  enemy.hp = 2000;

  h.gameState.setBattle({ ultimateEnergy: 0, ultimateMaxEnergy: 100 });

  // 1. Damage dealt by ally (without killing)
  const hitRes = h.combatSystem.applyDamage({
    source: ally,
    target: enemy,
    rawAttack: 200,
    attackType: 'magical',
    critChance: 0,
    unitManager: h.unitManager,
    skillSystem: h.skillSystem,
    bypassMitigation: true,
  });
  const afterDealt = h.gameState.battle.ultimateEnergy;
  assert.ok(Math.abs(afterDealt - hitRes.amount * 0.009 * astraScale) < 1e-9);

  // 2. Damage received by ally
  const recvRes = h.combatSystem.applyDamage({
    source: enemy,
    target: ally,
    rawAttack: 150,
    attackType: 'physical',
    critChance: 0,
    unitManager: h.unitManager,
    skillSystem: h.skillSystem,
    bypassMitigation: true,
  });
  const afterReceived = h.gameState.battle.ultimateEnergy - afterDealt;
  assert.ok(Math.abs(afterReceived - recvRes.amount * 0.007 * astraScale) < 1e-9);

  // 3. Healing ally
  const healRes = h.combatSystem.applyHeal({
    source: ally,
    target: ally,
    rawHeal: 120,
    skillSystem: h.skillSystem,
  });
  const afterHeal = h.gameState.battle.ultimateEnergy - afterDealt - afterReceived;
  assert.ok(Math.abs(afterHeal - healRes.amount * 0.009 * astraScale) < 1e-9);

  // 4. Killing enemy (damage dealt + kill bonus)
  const eBeforeKill = h.gameState.battle.ultimateEnergy;
  const killRes = h.combatSystem.applyDamage({
    source: ally,
    target: enemy,
    rawAttack: 2500,
    attackType: 'magical',
    critChance: 0,
    unitManager: h.unitManager,
    skillSystem: h.skillSystem,
    bypassMitigation: true,
  });
  assert.equal(killRes.killed, true);
  const afterKill = h.gameState.battle.ultimateEnergy - eBeforeKill;
  assert.ok(Math.abs(afterKill - (killRes.amount * 0.009 + 0.8) * astraScale) < 1e-9);

  // 5. Ultimate activation still strictly requires 100 energy
  h.gameState.setBattle({ ultimateEnergy: 99.9 });
  assert.equal(h.skillSystem.canActivateUltimate(), false);
  h.gameState.setBattle({ ultimateEnergy: 100 });
  assert.equal(h.skillSystem.canActivateUltimate(), true);
});
