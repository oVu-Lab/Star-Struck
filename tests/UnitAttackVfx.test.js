import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { EventBus } from '../src/core/EventBus.js';
import { GameState } from '../src/core/GameState.js';
import { SaveManager } from '../src/core/SaveManager.js';
import { BattleManager } from '../src/battle/BattleManager.js';
import { Battlefield } from '../src/battle/Battlefield.js';
import { UnitManager, UNIT_STATES } from '../src/battle/UnitManager.js';
import { TargetingSystem } from '../src/battle/TargetingSystem.js';
import { MovementSystem } from '../src/battle/MovementSystem.js';
import { CombatSystem } from '../src/battle/CombatSystem.js';
import { ProjectileSystem } from '../src/battle/ProjectileSystem.js';
import { SkillSystem } from '../src/battle/SkillSystem.js';
import { WaveManager } from '../src/battle/WaveManager.js';
import { CardSystem } from '../src/systems/CardSystem.js';
import { HeroSystem } from '../src/systems/HeroSystem.js';
import { FormationSystem } from '../src/systems/FormationSystem.js';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { AnimationManager } from '../src/rendering/AnimationManager.js';
import { ParticleSystem } from '../src/rendering/ParticleSystem.js';
import { BattleRenderer } from '../src/rendering/BattleRenderer.js';
import { buildDataRegistry } from '../src/utils/DataLoader.js';
import { createMemoryStorage } from '../src/utils/StorageUtils.js';
import { drawProgressiveLaserBeam } from '../src/rendering/NonUnitVfxGeometry.js';
import {
  UNIT_ATTACK_FX_KINDS,
  UNIT_ATTACK_VFX_PROFILES,
  UNIT_VFX_OVERHAUL_CALIBRATION,
  UNIT_ROSTER_IDS,
  TRAJECTORY_PROFILES,
  resolveUnitAttackVfxProfile,
  getTrajectoryConfig,
} from '../src/rendering/UnitAttackVfxConfig.js';
import {
  isUnitAttackWorldEffect,
  drawUnitProjectile,
  drawUnitAttackWorldEffect,
  drawUnitHitReactionOverlay,
  resolveUnitEmitterScreenPoint,
  resolveLiveTargetScreenPoint,
  computeLaserPhaseState,
} from '../src/rendering/UnitAttackVfxRenderer.js';
import {
  drawUnitAttackPrepVfx,
  drawEnhancedAbilityTelegraph,
} from '../src/rendering/UnitVfxOverhaulHelpers.js';
import { getUnitModelLayout } from '../src/rendering/UnitObjectModelRenderer.js';
import {
  ratchetStepAngle,
  timeDilatedTravelCurve,
  evaluateImpactStages,
  organicContourFactor,
} from '../src/rendering/UnitVfxMotionEngine.js';

const ROOT = process.cwd();
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', rel), 'utf8'));

function loadRegistry() {
  return buildDataRegistry({
    heroes: readJson('heroes.json'),
    units: readJson('units.json'),
    enemies: readJson('enemies.json'),
    bosses: readJson('bosses.json'),
    cards: readJson('cards.json'),
    skills: readJson('skills.json'),
    stages: readJson('stages.json'),
    banners: readJson('banners.json'),
    terrain: readJson('terrain.json'),
    balance: readJson('balance.json'),
  });
}

function createStrictTrackingCanvas(width = 1280, height = 720) {
  let drawCalls = 0;
  const assertFinite = (name, ...vals) => {
    for (const v of vals) {
      if (typeof v === 'number' && !Number.isFinite(v)) {
        throw new Error(`Non-finite canvas coordinate in ${name}: ${v}`);
      }
    }
  };
  const makeGradient = (...args) => {
    assertFinite('gradient', ...args);
    return { addColorStop() {} };
  };
  const ctx = {
    save() {},
    restore() {},
    translate(x, y) { assertFinite('translate', x, y); },
    rotate(a) { assertFinite('rotate', a); },
    scale(x, y) { assertFinite('scale', x, y); },
    setTransform() {},
    clearRect() {},
    fillRect(x, y, w, h) { assertFinite('fillRect', x, y, w, h); drawCalls += 1; },
    strokeRect(x, y, w, h) { assertFinite('strokeRect', x, y, w, h); drawCalls += 1; },
    beginPath() {},
    closePath() {},
    moveTo(x, y) { assertFinite('moveTo', x, y); },
    lineTo(x, y) { assertFinite('lineTo', x, y); },
    quadraticCurveTo(a, b, c, d) { assertFinite('quadraticCurveTo', a, b, c, d); },
    bezierCurveTo(a, b, c, d, e, f) { assertFinite('bezierCurveTo', a, b, c, d, e, f); },
    arc(x, y, r, s, e) { assertFinite('arc', x, y, r, s, e); },
    ellipse(x, y, rx, ry, rot, s, e) { assertFinite('ellipse', x, y, rx, ry, rot, s, e); },
    roundRect(x, y, w, h) { assertFinite('roundRect', x, y, w, h); },
    fill() { drawCalls += 1; },
    stroke() { drawCalls += 1; },
    fillText() { drawCalls += 1; },
    setLineDash() {},
    drawImage() { drawCalls += 1; },
    clip() {},
    createLinearGradient: makeGradient,
    createRadialGradient: makeGradient,
    measureText: (t) => ({ width: String(t || '').length * 7 }),
  };
  return {
    width,
    height,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    getDrawCalls: () => drawCalls,
    resetDrawCalls: () => { drawCalls = 0; },
  };
}

function buildTestHarness() {
  const data = loadRegistry();
  const storage = createMemoryStorage();
  const eventBus = new EventBus();
  const saveManager = new SaveManager({ storage, eventBus });
  const gameState = new GameState(saveManager.load().data, eventBus);

  const economySystem = new EconomySystem({ gameState, saveManager, eventBus });
  const heroSystem = new HeroSystem({ dataRegistry: data, gameState, saveManager, eventBus });
  const formationSystem = new FormationSystem({ dataRegistry: data, gameState, heroSystem, saveManager, eventBus });
  const cardSystem = new CardSystem({ dataRegistry: data, gameState, saveManager, eventBus });
  const progressionSystem = new ProgressionSystem({
    dataRegistry: data,
    gameState,
    formationSystem,
    cardSystem,
    saveManager,
    eventBus,
  });
  for (const h of data.heroes) heroSystem.grantHero(h.id);
  for (const u of data.units) formationSystem.unlockUnit(u.id, cardSystem);
  for (const c of data.cards) cardSystem.unlockCard(c.id);
  const unitManager = new UnitManager({ dataRegistry: data, eventBus });
  const targetingSystem = new TargetingSystem({ balance: data.balance });
  const movementSystem = new MovementSystem({ balance: data.balance });
  const combatSystem = new CombatSystem({ eventBus, dataRegistry: data });
  const projectileSystem = new ProjectileSystem({ eventBus });
  const skillSystem = new SkillSystem({ dataRegistry: data, gameState, heroSystem, eventBus });
  const waveManager = new WaveManager({ eventBus, balance: data.balance });
  const animationManager = new AnimationManager();
  const particleSystem = new ParticleSystem();
  const mockAssets = { getImageElement: () => null };
  const battleRenderer = new BattleRenderer({
    assetManager: mockAssets,
    gameState,
    animationManager,
    particleSystem,
  });

  const battleManager = new BattleManager({
    dataRegistry: data,
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
    battleRenderer,
    animationManager,
    particleSystem,
    audioManager: null,
  });

  return {
    data,
    eventBus,
    gameState,
    unitManager,
    combatSystem,
    projectileSystem,
    animationManager,
    particleSystem,
    battleRenderer,
    battleManager,
  };
}

test('Full 33-unit roster audit: every playable, enemy, elite, and boss unit has an explicit bespoke VFX profile', () => {
  const data = loadRegistry();
  const expectedIds = [
    ...data.units.map((u) => u.id),
    ...data.enemies.map((e) => e.id),
    ...data.elites.map((el) => el.id),
    ...data.bosses.map((b) => b.id),
  ];

  assert.equal(expectedIds.length, 33, 'Expected 33 total unit types (10 playable + 10 enemy + 8 elite + 5 boss)');
  assert.equal(UNIT_ROSTER_IDS.length, 33, 'UNIT_ROSTER_IDS should cover all 33 unit types');

  for (const id of expectedIds) {
    const profile = UNIT_ATTACK_VFX_PROFILES[id];
    assert.ok(profile, `Missing explicit VFX profile for unit: ${id}`);
    assert.ok(profile.palette && profile.palette.primary && profile.palette.core, `Missing palette for ${id}`);
    assert.ok(profile.castStyle, `Missing castStyle for ${id}`);
    assert.ok(profile.impactStyle, `Missing impactStyle for ${id}`);
    if (profile.attackKind === 'melee') {
      assert.ok(profile.meleeStyle, `Missing meleeStyle for melee unit ${id}`);
    } else {
      assert.ok(profile.projectileStyle, `Missing projectileStyle for ranged/support unit ${id}`);
      assert.ok(TRAJECTORY_PROFILES[profile.trajectory], `Invalid trajectory '${profile.trajectory}' for ${id}`);
    }
  }
});

test('Creative diversity: no copy-pasted ground cracks or generic parabolic projectiles across the roster', () => {
  const meleeStyles = new Set();
  const meleeModes = new Set();
  const projectileStyles = new Set();
  const rangedModes = new Set();
  const impactStyles = new Set();
  const trajectories = new Set();
  let groundCrackUnits = 0;
  let ballisticArcUnits = 0;

  for (const profile of Object.values(UNIT_ATTACK_VFX_PROFILES)) {
    assert.ok(profile.presentationMode, `Missing presentationMode for ${profile.id}`);
    if (profile.usesGroundCracks) groundCrackUnits += 1;
    if (profile.usesBallisticArc) ballisticArcUnits += 1;

    if (profile.attackKind === 'melee') {
      meleeStyles.add(profile.meleeStyle);
      meleeModes.add(profile.presentationMode);
    } else {
      if (profile.projectileStyle) projectileStyles.add(profile.projectileStyle);
      if (profile.supportProjectileStyle) projectileStyles.add(profile.supportProjectileStyle);
      rangedModes.add(profile.presentationMode);
      if (profile.supportPresentationMode) rangedModes.add(profile.supportPresentationMode);
    }

    if (profile.impactStyle) impactStyles.add(profile.impactStyle);
    if (profile.supportImpactStyle) impactStyles.add(profile.supportImpactStyle);
    if (profile.trajectory) trajectories.add(profile.trajectory);
    if (profile.supportTrajectory) trajectories.add(profile.supportTrajectory);
  }

  assert.ok(groundCrackUnits <= 3, `Ground cracks must be restricted to <= 3 seismic/molten heavies, got ${groundCrackUnits}`);
  assert.ok(ballisticArcUnits <= 2, `Ballistic parabolic arcs must be restricted to <= 2 artillery mortar units, got ${ballisticArcUnits}`);
  assert.equal(meleeStyles.size, 15, `Expected 15 unique melee styles across 15 melee units, got ${meleeStyles.size}`);
  assert.equal(meleeModes.size, 15, `Expected 15 unique melee presentation modes, got ${meleeModes.size}`);
  assert.ok(projectileStyles.size >= 20, `Expected >= 20 distinct ranged/magic/support styles, got ${projectileStyles.size}`);
  assert.ok(rangedModes.size >= 12, `Expected >= 12 distinct ranged/magic/support presentation modes, got ${rangedModes.size}`);
  assert.ok(impactStyles.size >= 18, `Expected >= 18 distinct impact styles, got ${impactStyles.size}`);
  assert.ok(trajectories.size >= 10, `Expected >= 10 distinct trajectory curves, got ${trajectories.size}`);
});

test('Ally vs enemy palette separation when playable units spawn on enemy side', () => {
  for (const unitId of ['heavy_shield_guard', 'wind_cavalry', 'arcane_archer', 'field_cleric']) {
    const allyProfile = resolveUnitAttackVfxProfile({ unitId, side: 'ally' });
    const enemyProfile = resolveUnitAttackVfxProfile({ unitId, side: 'enemy' });
    assert.notEqual(
      allyProfile.palette.primary,
      enemyProfile.palette.primary,
      `${unitId} must visually separate ally and enemy primary palette`,
    );
  }

  // Cleric offensive light vs healing sanctuary must also remain visually distinct
  const clericAttack = resolveUnitAttackVfxProfile({ unitId: 'field_cleric', side: 'ally' }, { mode: 'attack' });
  const clericHeal = resolveUnitAttackVfxProfile({ unitId: 'field_cleric', side: 'ally' }, { mode: 'heal' });
  assert.notEqual(clericAttack.projectileStyle, clericHeal.projectileStyle);
  assert.notEqual(clericAttack.palette.primary, clericHeal.palette.primary);
});

test('Every one of the 33 units renders cast, mid-attack/flight, impact, dissipation, and hit reaction cleanly with finite geometry', () => {
  const bf = new Battlefield();
  const canvas = createStrictTrackingCanvas(1280, 720);
  const ctx = canvas.getContext('2d');
  const w = 1280;
  const h = 720;

  for (const id of UNIT_ROSTER_IDS) {
    const profile = UNIT_ATTACK_VFX_PROFILES[id];
    const side = profile.rosterGroup === 'playable' ? 'ally' : 'enemy';
    const modes = profile.supportProjectileStyle
      ? ['attack', profile.unitClass === 'field_cleric' ? 'heal' : 'shield']
      : ['attack'];

    for (const mode of modes) {
      const resolved = resolveUnitAttackVfxProfile(id, { mode, side });
      canvas.resetDrawCalls();

      // 1. Cast / Preparation phase across lifecycle
      for (const ratio of [0.15, 0.5, 0.85]) {
        const fx = {
          kind: UNIT_ATTACK_FX_KINDS.CAST,
          x: 34,
          y: 50,
          angle: 0,
          radius: 5,
          color: resolved.palette.primary,
          secondaryColor: resolved.palette.secondary,
          age: (resolved.castDuration || 0.18) * ratio,
          duration: resolved.castDuration || 0.18,
          profileId: id,
          style: resolved.castStyle,
          side,
          scale: resolved.scale || 1,
          seed: 42,
          meta: { mode },
        };
        assert.equal(isUnitAttackWorldEffect(fx.kind), true);
        drawUnitAttackWorldEffect(ctx, bf, w, h, fx, 'ground');
        drawUnitAttackWorldEffect(ctx, bf, w, h, fx, 'sky');
      }

      // 2. Mid-attack: melee choreography OR projectile flight
      if (profile.attackKind === 'melee') {
        for (const ratio of [0.2, 0.45, 0.82]) {
          const fx = {
            kind: UNIT_ATTACK_FX_KINDS.MELEE,
            x: 56,
            y: 50,
            x2: 44,
            y2: 50,
            angle: 0,
            radius: 7,
            color: resolved.palette.primary,
            secondaryColor: resolved.palette.secondary,
            age: (resolved.duration || 0.3) * ratio,
            duration: resolved.duration || 0.3,
            profileId: id,
            style: resolved.meleeStyle,
            side,
            scale: resolved.scale || 1,
            seed: 77,
            meta: { mode: 'attack' },
          };
          drawUnitAttackWorldEffect(ctx, bf, w, h, fx, 'ground');
          drawUnitAttackWorldEffect(ctx, bf, w, h, fx, 'sky');
        }
      } else {
        const proj = {
          id: `test_${id}_${mode}`,
          kind: mode === 'heal' ? 'healing' : mode === 'shield' ? 'shield' : 'magical',
          sourceSide: side,
          vfxProfileId: id,
          trajectory: resolved.trajectory,
          startX: 30,
          startY: 50,
          x: 48,
          y: 50,
          z: 4.2,
          prevX: 44,
          prevY: 49.6,
          prevZ: 3.9,
          visualOffsetX: 0.2,
          visualOffsetY: 0.6,
          prevOffsetX: 0.1,
          prevOffsetY: 0.4,
          targetX: 66,
          targetY: 50,
          totalDist: 36,
          traveled: 18,
          age: 0.35,
          seed: 101,
          curveSign: 1,
        };
        drawUnitProjectile(ctx, bf, w, h, proj, 1.25);

        // 3. Projectile impact + dissipation
        for (const ratio of [0.18, 0.5, 0.85]) {
          const fx = {
            kind: UNIT_ATTACK_FX_KINDS.IMPACT,
            x: 66,
            y: 50,
            angle: 0,
            radius: 9,
            color: resolved.palette.primary,
            secondaryColor: resolved.palette.secondary,
            age: (resolved.duration || 0.34) * ratio,
            duration: resolved.duration || 0.34,
            profileId: id,
            style: resolved.impactStyle,
            side,
            scale: resolved.scale || 1,
            seed: 133,
            meta: { mode },
          };
          drawUnitAttackWorldEffect(ctx, bf, w, h, fx, 'ground');
          drawUnitAttackWorldEffect(ctx, bf, w, h, fx, 'sky');
        }
      }

      // 4. Hit reaction overlay
      drawUnitHitReactionOverlay(
        ctx,
        { hitFlash: 0.12, lastHitReaction: resolved.hitReaction, lastHitAngle: 0.2 },
        640,
        360,
        42,
        1.0,
      );

      assert.ok(canvas.getDrawCalls() > 0, `Expected non-zero draw calls for ${id} (${mode})`);
    }
  }
});

test('ProjectileSystem visual trajectory offsets never alter simulation arrival time or impact coordinates', () => {
  const trajectories = Object.keys(TRAJECTORY_PROFILES);
  const arrivals = new Map();

  for (const traj of trajectories) {
    const ps = new ProjectileSystem();
    let impactPos = null;
    const bus = new EventBus();
    const psWithBus = new ProjectileSystem({ eventBus: bus });
    bus.on('projectile:impact', ({ projectile }) => {
      impactPos = { x: projectile.x, y: projectile.y, vx: projectile.visualOffsetX, vy: projectile.visualOffsetY };
    });

    const p = psWithBus.spawn({
      kind: 'magical',
      sourceSide: 'ally',
      vfxProfileId: 'arcane_archer',
      trajectory: traj,
      x: 20,
      y: 50,
      targetX: 60,
      targetY: 50,
      speed: 50,
      damage: 40,
    });

    // At spawn, lateral visual offset is strictly 0
    assert.equal(p.visualOffsetX, 0);
    assert.equal(p.visualOffsetY, 0);

    let steps = 0;
    let sawLateralOffset = false;
    while (psWithBus.getAll().length > 0 && steps < 120) {
      psWithBus.update(1 / 60, {});
      steps += 1;
      const active = psWithBus.getAll()[0];
      if (active && (Math.abs(active.visualOffsetX) > 0.05 || Math.abs(active.visualOffsetY) > 0.05)) {
        sawLateralOffset = true;
      }
    }

    assert.ok(impactPos, `Trajectory ${traj} should impact cleanly`);
    assert.equal(impactPos.x, 60);
    assert.equal(impactPos.y, 50);
    assert.equal(impactPos.vx, 0, `Visual offset X must return to 0 on impact for ${traj}`);
    assert.equal(impactPos.vy, 0, `Visual offset Y must return to 0 on impact for ${traj}`);
    arrivals.set(traj, steps);

    if ((getTrajectoryConfig(traj).lateralAmp || 0) > 0.2) {
      assert.equal(sawLateralOffset, true, `Expected non-zero mid-flight visual offset for ${traj}`);
    }
    ps.clear();
  }

  // All trajectories share identical arrival tick count because simulation physics are unchanged
  const uniqueTicks = new Set(arrivals.values());
  assert.equal(uniqueTicks.size, 1, `All trajectories must arrive on identical tick; got ${[...uniqueTicks]}`);
});

test('Live multi-unit battle spawns bespoke ua_* effects, stays within pool caps, and cleans up completely', () => {
  const {
    battleManager,
    unitManager,
    animationManager,
    particleSystem,
    battleRenderer,
  } = buildTestHarness();

  const canvas = createStrictTrackingCanvas(1280, 720);
  battleManager.startSession(null, { stageId: 'stage_1_3' });
  battleRenderer.attach(canvas);
  battleRenderer.setBattlefield(battleManager.battlefield);
  battleManager.beginBattle();

  // Spawn a dense mixed clash of playable + enemy + elite + boss units (44 total units)
  const allyTypes = [
    'heavy_shield_guard',
    'wind_cavalry',
    'arcane_archer',
    'field_cleric',
    'vanguard_breaker',
    'pulse_skirmisher',
    'solar_pyromancer',
    'aegis_sentinel',
    'chrono_weaver',
    'astral_construct',
  ];
  const enemyTypes = [
    'enemy_void_vanguard',
    'enemy_rift_stalker',
    'enemy_obsidian_marksman',
    'enemy_corrupted_acolyte',
    'enemy_siege_juggernaut',
    'enemy_stasis_weaver',
    'enemy_inferno_bombardier',
    'enemy_dread_bannerman',
    'enemy_cryo_warden',
    'enemy_abyssal_ravager',
  ];

  for (let i = 0; i < 20; i += 1) {
    unitManager.spawnUnit({
      unitId: allyTypes[i % allyTypes.length],
      side: 'ally',
      x: 22 + (i % 5) * 4,
      y: 22 + Math.floor(i / 5) * 14,
      level: 3,
      restrictToRegion: false,
    });
    unitManager.spawnUnit({
      unitId: enemyTypes[i % enemyTypes.length],
      side: 'enemy',
      x: 68 - (i % 5) * 4,
      y: 22 + Math.floor(i / 5) * 14,
      level: 3,
      restrictToRegion: false,
    });
  }

  let sawCast = false;
  let sawMelee = false;
  let sawImpact = false;
  let maxWorldFx = 0;
  let maxParticles = 0;

  for (let frame = 0; frame < 360; frame += 1) {
    battleManager.stepSimulation(1 / 60);
    const fxList = animationManager.getWorldEffects();
    maxWorldFx = Math.max(maxWorldFx, fxList.length);
    maxParticles = Math.max(maxParticles, particleSystem.getActiveCount());
    for (const fx of fxList) {
      if (fx.kind === UNIT_ATTACK_FX_KINDS.CAST) sawCast = true;
      if (fx.kind === UNIT_ATTACK_FX_KINDS.MELEE) sawMelee = true;
      if (fx.kind === UNIT_ATTACK_FX_KINDS.IMPACT) sawImpact = true;
    }

    if (frame % 6 === 0) {
      battleRenderer.render({
        stage: battleManager._activeStage,
        battlefield: battleManager.battlefield,
        phase: battleManager.getPhase(),
        units: unitManager.getAll(),
        projectiles: battleManager._projectiles.getAll(),
        telegraphs: battleManager._combat.getTelegraphs(),
      });
    }
  }

  assert.equal(sawCast, true, 'Expected live combat to spawn ua_cast effects');
  assert.equal(sawMelee, true, 'Expected live combat to spawn ua_melee effects');
  assert.equal(sawImpact, true, 'Expected live combat to spawn ua_impact effects');
  assert.ok(maxWorldFx <= 56, `World effect pool must stay <= 56, got ${maxWorldFx}`);
  assert.ok(maxParticles <= 160, `Active + ambient particles must stay bounded, got ${maxParticles}`);

  // Cleanup check
  battleManager.stopSession();
  assert.equal(animationManager.getWorldEffects().length, 0);
  assert.equal(particleSystem.getActiveCount(), 0);
});

test('Laser Attack VFX: 5-phase progressive emission grows monotonically across all 3 laser units', () => {
  const laserIds = ['enemy_obsidian_marksman', 'aegis_sentinel', 'pulse_skirmisher'];
  const canvas = createStrictTrackingCanvas(1280, 720);
  const ctx = canvas.getContext('2d');
  const bf = new Battlefield();

  for (const id of laserIds) {
    const profile = resolveUnitAttackVfxProfile(id, { mode: 'attack', side: id.startsWith('enemy_') ? 'enemy' : 'ally' });
    assert.ok(profile.beamSpec, `Missing beamSpec for laser unit ${id}`);
    assert.ok(profile.emitter, `Missing emitter offset for laser unit ${id}`);

    // Phase 1: Charging -> uEnd === 0 and drawProgressiveLaserBeam returns null (no full beam yet)
    const chargeState = computeLaserPhaseState(profile.beamSpec.chargeEnd * 0.5, profile.beamSpec);
    assert.equal(chargeState.phase, 'charging');
    assert.equal(chargeState.uEnd, 0);
    const chargeBeam = drawProgressiveLaserBeam(ctx, { x: 200, y: 360 }, { x: 600, y: 360 }, {
      uStart: chargeState.uStart,
      uEnd: chargeState.uEnd,
      taperMode: profile.beamSpec.taperMode,
    });
    assert.equal(chargeBeam, null, `${id} must not render full-span beam during charging phase`);

    // Phase 2: Emission -> uEnd & spanDist grow monotonically across [chargeEnd, reachEnd]
    const ce = profile.beamSpec.chargeEnd;
    const re = profile.beamSpec.reachEnd;
    const emissionSamples = [0.15, 0.4, 0.65, 0.88].map((r) => ce + (re - ce) * r);
    let prevSpan = 0;
    let prevUEnd = 0;
    for (const p of emissionSamples) {
      const st = computeLaserPhaseState(p, profile.beamSpec);
      assert.equal(st.phase, 'emission', `${id} at p=${p.toFixed(3)} should be in emission phase`);
      assert.ok(st.uEnd > prevUEnd, `${id} uEnd should increase monotonically (${st.uEnd} > ${prevUEnd})`);
      const res = drawProgressiveLaserBeam(ctx, { x: 200, y: 360 }, { x: 600, y: 360 }, {
        uStart: st.uStart,
        uEnd: st.uEnd,
        taperMode: profile.beamSpec.taperMode,
        coreWidth: profile.beamSpec.coreWidth,
        sheathWidth: profile.beamSpec.sheathWidth,
        haloWidth: profile.beamSpec.haloWidth,
        leadingFlare: 0.9,
      });
      assert.ok(res && res.spanDist > prevSpan, `${id} spanDist should grow monotonically during emission`);
      prevUEnd = st.uEnd;
      prevSpan = res.spanDist;
    }

    // Phase 3: Full Beam -> uEnd === 1
    const fullState = computeLaserPhaseState((re + 1) * 0.5, profile.beamSpec);
    assert.equal(fullState.phase, 'full');
    assert.equal(fullState.uEnd, 1);

    // Phase 5: Dissipation -> renders breakup shards cleanly even under reducedMotion
    for (const reducedMotion of [false, true]) {
      canvas.resetDrawCalls();
      const dRes = drawProgressiveLaserBeam(ctx, { x: 200, y: 360 }, { x: 600, y: 360 }, {
        uStart: 0.45,
        uEnd: 1,
        taperMode: profile.beamSpec.taperMode,
        coreWidth: profile.beamSpec.coreWidth * 0.5,
        sheathWidth: profile.beamSpec.sheathWidth * 0.5,
        alpha: 0.6,
        breakup: 0.75,
        reducedMotion,
      });
      assert.ok(dRes && canvas.getDrawCalls() > 0);
    }

    // Render full lifecycle through drawUnitProjectile across charge -> emission -> full
    const side = profile.rosterGroup === 'playable' ? 'ally' : 'enemy';
    for (const pRatio of [0.05, 0.35, 0.70, 0.92]) {
      canvas.resetDrawCalls();
      drawUnitProjectile(
        ctx,
        bf,
        1280,
        720,
        {
          id: `laser_${id}_${pRatio}`,
          kind: 'magical',
          sourceSide: side,
          vfxProfileId: id,
          trajectory: 'laser_straight',
          startX: 25,
          startY: 50,
          x: 25 + 40 * pRatio,
          y: 50,
          z: 2.4,
          targetX: 65,
          targetY: 50,
          totalDist: 40,
          traveled: 40 * pRatio,
          age: 0.25 * pRatio,
          seed: 77,
        },
        0.5,
      );
      assert.ok(canvas.getDrawCalls() > 0, `Expected finite draw calls for ${id} at progress ${pRatio}`);
    }
  }
});

test('Laser Attack VFX: emitter origin mirrors by facing/scale and beams track live moving targets', () => {
  const bf = new Battlefield();
  const profile = resolveUnitAttackVfxProfile('enemy_obsidian_marksman', { mode: 'attack', side: 'enemy' });
  const baseUnit = { uid: 'u_rail', x: 50, y: 50, facing: 1, visualScale: 1.0, state: UNIT_STATES.ATTACKING, attackAnim: 0 };
  const centerScreen = bf.worldToScreen(50, 50, 1280, 720, 0);

  const rightEmitter = resolveUnitEmitterScreenPoint(bf, 1280, 720, baseUnit, 50, 50, 1, profile, 0);
  const leftEmitter = resolveUnitEmitterScreenPoint(
    bf,
    1280,
    720,
    { ...baseUnit, facing: -1 },
    50,
    50,
    -1,
    profile,
    0,
  );
  const scaledEmitter = resolveUnitEmitterScreenPoint(
    bf,
    1280,
    720,
    { ...baseUnit, visualScale: 1.4 },
    50,
    50,
    1,
    profile,
    0,
  );

  assert.ok(rightEmitter.x > centerScreen.x, 'Facing +1 emitter must extend forward right');
  assert.ok(leftEmitter.x < centerScreen.x, 'Facing -1 emitter must mirror forward left');
  assert.ok(
    Math.abs((rightEmitter.x - centerScreen.x) + (leftEmitter.x - centerScreen.x)) < 0.001,
    'Emitter forward offset should mirror symmetrically around unit center',
  );
  assert.ok(scaledEmitter.x > rightEmitter.x, 'Larger visualScale must scale emitter forward offset');

  // Moving target tracking: live target screen point follows unit coordinates
  const movingTarget = { uid: 'u_target', x: 64, y: 42, state: UNIT_STATES.MOVING, visualScale: 1.0 };
  const tp1 = resolveLiveTargetScreenPoint(bf, 1280, 720, movingTarget, 60, 50);
  movingTarget.x = 76;
  movingTarget.y = 66;
  const tp2 = resolveLiveTargetScreenPoint(bf, 1280, 720, movingTarget, 60, 50);
  assert.ok(tp2.x > tp1.x && tp2.y > tp1.y, 'Live target tracking must follow target unit movement');

  // Render projectile + impact dissipation with unitByUid map and moving target
  const canvas = createStrictTrackingCanvas(1280, 720);
  const ctx = canvas.getContext('2d');
  const unitByUid = new Map([
    [baseUnit.uid, baseUnit],
    [movingTarget.uid, movingTarget],
  ]);
  drawUnitProjectile(
    ctx,
    bf,
    1280,
    720,
    {
      id: 'p_track',
      kind: 'magical',
      sourceUid: baseUnit.uid,
      targetUid: movingTarget.uid,
      sourceSide: 'enemy',
      vfxProfileId: 'enemy_obsidian_marksman',
      trajectory: 'laser_straight',
      startX: 50,
      startY: 50,
      x: 62,
      y: 56,
      targetX: 64,
      targetY: 42,
      totalDist: 28,
      traveled: 16,
      age: 0.2,
      seed: 12,
    },
    1.1,
    unitByUid,
  );
  drawUnitAttackWorldEffect(
    ctx,
    bf,
    1280,
    720,
    {
      kind: UNIT_ATTACK_FX_KINDS.IMPACT,
      x: 64,
      y: 42,
      angle: 0.2,
      radius: 6,
      color: profile.palette.primary,
      secondaryColor: profile.palette.secondary,
      age: 0.22,
      duration: 0.42,
      profileId: 'enemy_obsidian_marksman',
      style: profile.impactStyle,
      side: 'enemy',
      scale: 1,
      seed: 12,
      meta: { mode: 'attack', sourceUid: baseUnit.uid, targetUid: movingTarget.uid, startX: 50, startY: 50, sourceFacing: 1 },
    },
    'sky',
    unitByUid,
    1.1,
  );
  assert.ok(canvas.getDrawCalls() > 0);
});

test('Laser Attack VFX: interrupted casts, stunned/dead attackers, battle finalization, and stopSession clean up cleanly', () => {
  const {
    battleManager,
    unitManager,
    combatSystem,
    projectileSystem,
    animationManager,
    particleSystem,
    battleRenderer,
  } = buildTestHarness();

  const canvas = createStrictTrackingCanvas(1280, 720);
  battleManager.startSession(null, { stageId: 'stage_1_2' });
  battleRenderer.attach(canvas);
  battleRenderer.setBattlefield(battleManager.battlefield);
  battleManager.beginBattle();

  const aegis = unitManager.spawnUnit({ unitId: 'aegis_sentinel', side: 'ally', x: 24, y: 40, level: 3, restrictToRegion: false });
  const pulse = unitManager.spawnUnit({ unitId: 'pulse_skirmisher', side: 'ally', x: 24, y: 60, level: 3, restrictToRegion: false });
  const rail = unitManager.spawnUnit({ unitId: 'enemy_obsidian_marksman', side: 'enemy', x: 64, y: 50, level: 3, restrictToRegion: false });

  // Step combat until multiple laser projectiles & effects have been fired
  let sawProjectiles = false;
  for (let f = 0; f < 180; f += 1) {
    battleManager.stepSimulation(1 / 60);
    if (projectileSystem.getAll().length > 0) sawProjectiles = true;
    if (f % 5 === 0) {
      battleRenderer.render({
        stage: battleManager._activeStage,
        battlefield: battleManager.battlefield,
        phase: battleManager.getPhase(),
        units: unitManager.getAll(),
        projectiles: projectileSystem.getAll(),
        telegraphs: combatSystem.getTelegraphs(),
      });
    }
  }
  assert.equal(sawProjectiles, true, 'Expected live laser skirmish to spawn projectiles');

  // Verify stunned or dead unit suppresses ua_cast rendering immediately
  const bf = battleManager.battlefield;
  const ctx = canvas.getContext('2d');
  const unitMap = new Map([[pulse.uid, pulse]]);
  const castFx = {
    kind: UNIT_ATTACK_FX_KINDS.CAST,
    x: pulse.x,
    y: pulse.y,
    angle: 0,
    radius: 4.5,
    color: '#22d3ee',
    secondaryColor: '#a5f3fc',
    age: 0.05,
    duration: 0.14,
    profileId: 'pulse_skirmisher',
    style: 'repeater_muzzle_chevron',
    side: 'ally',
    scale: 1,
    meta: { mode: 'attack', sourceUid: pulse.uid, sourceFacing: 1 },
  };
  pulse.state = UNIT_STATES.STUNNED;
  canvas.resetDrawCalls();
  drawUnitAttackWorldEffect(ctx, bf, 1280, 720, castFx, 'sky', unitMap, 0.2);
  assert.equal(canvas.getDrawCalls(), 0, 'Stunned sourceUnit must suppress ua_cast muzzle drawing');

  // Verify killing an attacker removes its active ua_cast via battle:unitDefeated
  pulse.state = UNIT_STATES.ATTACKING;
  animationManager.spawnWorldEffect({
    kind: UNIT_ATTACK_FX_KINDS.CAST,
    x: aegis.x,
    y: aegis.y,
    angle: 0,
    radius: 4.5,
    color: '#60a5fa',
    secondaryColor: '#bae6fd',
    duration: 0.2,
    profileId: 'aegis_sentinel',
    style: 'hex_projector_flash',
    side: 'ally',
    meta: { mode: 'attack', sourceUid: aegis.uid, sourceFacing: 1 },
  });
  assert.ok(
    animationManager.getWorldEffects().some((fx) => fx.kind === UNIT_ATTACK_FX_KINDS.CAST && fx.meta?.sourceUid === aegis.uid),
  );
  combatSystem.applyDamage({
    source: rail,
    target: aegis,
    rawAttack: 99999,
    attackType: 'magical',
    unitManager,
    bypassMitigation: true,
  });
  assert.equal(
    animationManager.getWorldEffects().some((fx) => fx.kind === UNIT_ATTACK_FX_KINDS.CAST && fx.meta?.sourceUid === aegis.uid),
    false,
    'Defeating attacker mid-cast must clean up its ua_cast effect',
  );

  // Spawn an in-flight projectile then trigger battle finalization -> projectiles must clear immediately
  projectileSystem.spawn({
    kind: 'magical',
    sourceUid: rail.uid,
    sourceSide: 'enemy',
    vfxProfileId: 'enemy_obsidian_marksman',
    x: rail.x,
    y: rail.y,
    targetX: 20,
    targetY: 50,
    speed: 60,
    damage: 25,
  });
  assert.ok(projectileSystem.getAll().length > 0);
  battleManager._finalizeBattle(true);
  assert.equal(projectileSystem.getAll().length, 0, '_finalizeBattle must clear all active beam projectiles');

  battleManager.stopSession();
  assert.equal(projectileSystem.getAll().length, 0);
  assert.equal(animationManager.getWorldEffects().length, 0);
  assert.equal(particleSystem.getActiveCount(), 0);
});

test('VFX Overhaul: all 33 units have individualized scale calibration and clear normal-vs-skill visual hierarchy', () => {
  assert.equal(Object.keys(UNIT_VFX_OVERHAUL_CALIBRATION).length, 33);
  const uniqueAttackScales = new Set();
  for (const id of UNIT_ROSTER_IDS) {
    const cal = UNIT_VFX_OVERHAUL_CALIBRATION[id];
    assert.ok(cal, `Missing UNIT_VFX_OVERHAUL_CALIBRATION entry for ${id}`);
    assert.ok(cal.vfxScale >= 0.85 && cal.vfxScale <= 1.55, `${id} vfxScale out of disciplined range: ${cal.vfxScale}`);
    assert.ok(
      cal.skillScale > cal.vfxScale,
      `${id} skillScale (${cal.skillScale}) must exceed normal vfxScale (${cal.vfxScale})`,
    );
    assert.ok(cal.emitter && Number.isFinite(cal.emitter.screenForwardPx), `${id} missing model emitter calibration`);
    uniqueAttackScales.add(cal.vfxScale);

    const resolved = resolveUnitAttackVfxProfile(id, { mode: 'attack', side: 'ally' });
    assert.equal(resolved.vfxScale, cal.vfxScale);
    assert.equal(resolved.skillScale, cal.skillScale);
  }
  assert.ok(uniqueAttackScales.size >= 10, `Expected individualized per-unit scales (>= 10 distinct values), got ${uniqueAttackScales.size}`);
});

test('VFX Overhaul: preparation phase VFX renders finite geometry for all 33 units during normal attack prep and major skill casting', () => {
  const canvas = createStrictTrackingCanvas(1280, 720);
  const ctx = canvas.getContext('2d');

  for (const id of UNIT_ROSTER_IDS) {
    const profile = UNIT_ATTACK_VFX_PROFILES[id];
    const side = profile.rosterGroup === 'playable' ? 'ally' : 'enemy';

    // Normal attack preparation phase
    const atkUnit = {
      uid: `prep_atk_${id}`,
      unitId: id,
      side,
      facing: side === 'ally' ? 1 : -1,
      state: UNIT_STATES.ATTACKING,
      attackPrepOverride: 0.78,
      attackAnim: 0,
      phase: 0.4,
    };
    const atkLayout = getUnitModelLayout(atkUnit, { x: 420, y: 360, scale: 1.0, elapsed: 1.2 });
    canvas.resetDrawCalls();
    drawUnitAttackPrepVfx(ctx, atkUnit, atkLayout, 1.2, 'back', false);
    drawUnitAttackPrepVfx(ctx, atkUnit, atkLayout, 1.2, 'front', false);
    assert.ok(canvas.getDrawCalls() > 0, `Expected non-zero attack prep VFX draw calls for ${id}`);

    // Major skill casting phase
    const castUnit = {
      uid: `prep_cast_${id}`,
      unitId: id,
      side,
      facing: side === 'ally' ? 1 : -1,
      state: UNIT_STATES.CASTING,
      castingAbility: { duration: 1.0, remaining: 0.25 },
      attackAnim: 0,
      phase: 0.6,
    };
    const castLayout = getUnitModelLayout(castUnit, { x: 420, y: 360, scale: 1.0, elapsed: 1.5 });
    canvas.resetDrawCalls();
    drawUnitAttackPrepVfx(ctx, castUnit, castLayout, 1.5, 'back', false);
    drawUnitAttackPrepVfx(ctx, castUnit, castLayout, 1.5, 'front', false);
    assert.ok(canvas.getDrawCalls() > 0, `Expected non-zero skill cast prep VFX draw calls for ${id}`);
  }
});

test('VFX Overhaul: enhanced ability telegraphs render finite geometry across all telegraph archetypes', () => {
  const bf = new Battlefield();
  const canvas = createStrictTrackingCanvas(1280, 720);
  const ctx = canvas.getContext('2d');
  const abilities = [
    { abilityId: 'unit_solar_flare', color: '#f97316', label: 'Solar Flare' },
    { abilityId: 'boss_orbital_cataclysm', color: '#fb923c', label: 'Orbital Cataclysm' },
    { abilityId: 'unit_chrono_snare', color: '#a78bfa', label: 'Chrono Snare' },
    { abilityId: 'enemy_stasis_field', color: '#38bdf8', label: 'Stasis Field' },
    { abilityId: 'boss_temporal_collapse', color: '#c084fc', label: 'Temporal Collapse' },
    { abilityId: 'unit_aegis_pulse', color: '#38bdf8', label: 'Aegis Pulse' },
    { abilityId: 'boss_arcane_barrage', color: '#e879f9', label: 'Arcane Barrage' },
    { abilityId: 'generic_slam', color: '#f87171', label: 'Impact' },
  ];

  for (const ab of abilities) {
    canvas.resetDrawCalls();
    drawEnhancedAbilityTelegraph(
      ctx,
      bf,
      1280,
      720,
      { x: 52, y: 50, radius: 14, elapsed: 0.65, duration: 1.1, ...ab },
      2.4,
    );
    assert.ok(canvas.getDrawCalls() > 0, `Expected non-zero draw calls for telegraph ${ab.abilityId}`);
  }
});

test('VFX Motion Engine: natural easing, ratcheting escapement, time-dilation curve, and 3-stage impact progression', () => {
  // Time-dilated travel curve: exact endpoints, deliberate mid-flight dilation slowdown, rapid release/snap
  assert.equal(timeDilatedTravelCurve(0), 0);
  assert.equal(timeDilatedTravelCurve(1), 1);
  const earlyVel = timeDilatedTravelCurve(0.15) - timeDilatedTravelCurve(0.05);
  const midVel = timeDilatedTravelCurve(0.55) - timeDilatedTravelCurve(0.45);
  const lateVel = timeDilatedTravelCurve(0.95) - timeDilatedTravelCurve(0.85);
  assert.ok(midVel < earlyVel && midVel < lateVel, 'Mid-flight time dilation must slow relative to release and snap');

  // Ratcheting escapement: exact endpoints, monotonic without overshoot, elastic snap+recoil with overshoot
  const stepAngle = Math.PI / 3;
  assert.equal(ratchetStepAngle(0, 6, stepAngle), 0);
  assert.ok(Math.abs(ratchetStepAngle(1, 6, stepAngle) - 6 * stepAngle) < 1e-6);
  let prevAngle = -Infinity;
  for (let i = 0; i <= 20; i += 1) {
    const a = ratchetStepAngle(i / 20, 6, stepAngle, { overshoot: 0 });
    assert.ok(Number.isFinite(a) && a >= prevAngle - 1e-6);
    prevAngle = a;
  }
  const peakSnap = ratchetStepAngle(0.38 / 6, 6, stepAngle, { overshoot: 0.16, accelerate: false });
  const settledDetent = ratchetStepAngle(0.75 / 6, 6, stepAngle, { overshoot: 0.16, accelerate: false });
  assert.ok(peakSnap > settledDetent && Math.abs(settledDetent - stepAngle) < 1e-6, 'Escapement should overshoot slightly then settle on detent');

  // 3-stage impact lifecycle: pinch -> burst -> aftermath
  assert.equal(evaluateImpactStages(0.08).phase, 'pinch');
  assert.equal(evaluateImpactStages(0.42).phase, 'burst');
  assert.equal(evaluateImpactStages(0.88).phase, 'aftermath');

  // Organic contour distortion stays finite and strictly positive
  for (let i = 0; i < 16; i += 1) {
    const f = organicContourFactor((i * Math.PI) / 8, 2.3, 17, 0.25);
    assert.ok(Number.isFinite(f) && f > 0.4 && f < 1.6);
  }
});

test('VFX Motion Rework: all signature unit/elite/boss skills render finite geometry across pinch, burst, and dissipation', () => {
  const bf = new Battlefield();
  const canvas = createStrictTrackingCanvas(1280, 720);
  const ctx = canvas.getContext('2d');
  const skillCases = [
    { abilityId: 'unit_solar_flare', profileId: 'solar_pyromancer', kind: 'aoe_damage', color: '#f97316' },
    { abilityId: 'unit_chrono_snare', profileId: 'chrono_weaver', kind: 'aoe_damage', color: '#a78bfa' },
    { abilityId: 'unit_bulwark_guard', profileId: 'heavy_shield_guard', kind: 'self_defense', color: '#38bdf8' },
    { abilityId: 'unit_flank_surge', profileId: 'wind_cavalry', kind: 'self_buff', color: '#34d399' },
    { abilityId: 'unit_armor_sunder', profileId: 'vanguard_breaker', kind: 'aoe_damage', color: '#fb923c' },
    { abilityId: 'unit_armor_sunder', profileId: 'enemy_abyssal_ravager', kind: 'aoe_damage', color: '#fb7185' },
    { abilityId: 'unit_aegis_pulse', profileId: 'aegis_sentinel', kind: 'ally_barrier', color: '#38bdf8' },
    { abilityId: 'unit_aegis_pulse', profileId: 'enemy_cryo_warden', kind: 'ally_barrier', color: '#67e8f9' },
    { abilityId: 'unit_construct_overdrive', profileId: 'astral_construct', kind: 'self_buff', color: '#f5d37a' },
    { abilityId: 'enemy_shield_bash', profileId: 'enemy_void_vanguard', kind: 'aoe_damage', color: '#f43f5e' },
    { abilityId: 'enemy_tremor_slam', profileId: 'enemy_siege_juggernaut', kind: 'aoe_damage', color: '#ea580c' },
    { abilityId: 'enemy_stasis_field', profileId: 'enemy_stasis_weaver', kind: 'aoe_damage', color: '#818cf8' },
    { abilityId: 'enemy_dread_rally', profileId: 'enemy_dread_bannerman', kind: 'ally_buff', color: '#f43f5e' },
    { abilityId: 'boss_aegis_shell', profileId: 'boss_bastion_warden', kind: 'self_defense', color: '#f5d37a' },
    { abilityId: 'boss_shockwave', profileId: 'boss_bastion_warden', kind: 'aoe_damage', color: '#f5d37a' },
    { abilityId: 'boss_arcane_barrage', profileId: 'boss_relay_archon', kind: 'aoe_damage', color: '#38bdf8' },
    { abilityId: 'boss_temporal_collapse', profileId: 'boss_chrono_arbiter', kind: 'aoe_damage', color: '#c084fc' },
    { abilityId: 'boss_phase_mend', profileId: 'boss_chrono_arbiter', kind: 'self_heal', color: '#34d399' },
    { abilityId: 'boss_orbital_cataclysm', profileId: 'boss_astral_leviathan', kind: 'aoe_damage', color: '#fb923c' },
    { abilityId: 'boss_void_siphon', profileId: 'boss_astral_leviathan', kind: 'drain_aoe', color: '#a855f7' },
    { abilityId: 'boss_summon_guard', profileId: 'boss_bastion_warden', kind: 'summon', color: '#f5d37a' },
  ];

  for (const sc of skillCases) {
    canvas.resetDrawCalls();
    for (const ratio of [0.1, 0.45, 0.85]) {
      const fx = {
        kind: UNIT_ATTACK_FX_KINDS.ABILITY,
        x: 52,
        y: 50,
        angle: 0,
        radius: 14,
        color: sc.color,
        age: ratio,
        duration: 1.0,
        profileId: sc.profileId,
        side: sc.profileId.startsWith('enemy_') || sc.profileId.startsWith('boss_') ? 'enemy' : 'ally',
        scale: 1.0,
        seed: 55,
        meta: { abilityId: sc.abilityId, abilityKind: sc.kind },
      };
      drawUnitAttackWorldEffect(ctx, bf, 1280, 720, fx, 'ground');
      drawUnitAttackWorldEffect(ctx, bf, 1280, 720, fx, 'sky');
    }
    assert.ok(canvas.getDrawCalls() > 0, `Expected non-zero draw calls for skill ${sc.abilityId} (${sc.profileId})`);
  }
});


