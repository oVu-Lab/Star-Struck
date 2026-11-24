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

import {
  SHIELD_THEME_IDS,
  SHIELD_THEMES,
  ALL_SHIELD_THEMES,
  getShieldTheme,
  resolveShieldTheme,
  computeShieldGeometry,
} from '../src/rendering/ShieldVfxConfig.js';
import {
  ShieldVfxSystem,
  MAX_CONCURRENT_HITS_PER_SHIELD,
  MAX_TRANSIENT_SHIELD_EFFECTS,
} from '../src/rendering/ShieldVfxSystem.js';
import {
  drawUnitShieldBack,
  drawUnitShieldFront,
  drawShieldTransientEffects,
} from '../src/rendering/ShieldVfxRenderer.js';

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

function createStrictMockCanvas(width = 1280, height = 720) {
  let ops = 0;
  const check = (fn, ...vals) => {
    for (const v of vals) {
      if (typeof v === 'number' && !Number.isFinite(v)) {
        throw new Error(`Non-finite Canvas2D argument in ${fn}: ${v}`);
      }
    }
    ops += 1;
  };
  const grad = { addColorStop: (o) => check('addColorStop', o) };
  const ctx = {
    save() { ops += 1; },
    restore() { ops += 1; },
    scale(x, y) { check('scale', x, y); },
    translate(x, y) { check('translate', x, y); },
    rotate(a) { check('rotate', a); },
    beginPath() { ops += 1; },
    closePath() { ops += 1; },
    clip() { ops += 1; },
    moveTo(x, y) { check('moveTo', x, y); },
    lineTo(x, y) { check('lineTo', x, y); },
    quadraticCurveTo(cpx, cpy, x, y) { check('quadraticCurveTo', cpx, cpy, x, y); },
    bezierCurveTo(a, b, c, d, x, y) { check('bezierCurveTo', a, b, c, d, x, y); },
    arc(x, y, r, s, e) { check('arc', x, y, r, s, e); assert.ok(r >= 0, 'arc radius >= 0'); },
    ellipse(x, y, rx, ry, rot, s, e) {
      check('ellipse', x, y, rx, ry, rot, s, e);
      assert.ok(rx >= 0 && ry >= 0, 'ellipse radii >= 0');
    },
    rect(x, y, w, h) { check('rect', x, y, w, h); },
    fillRect(x, y, w, h) { check('fillRect', x, y, w, h); },
    strokeRect(x, y, w, h) { check('strokeRect', x, y, w, h); },
    fill() { ops += 1; },
    stroke() { ops += 1; },
    fillText() { ops += 1; },
    setLineDash() { ops += 1; },
    drawImage() { ops += 1; },
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      check('createRadialGradient', x0, y0, r0, x1, y1, r1);
      return grad;
    },
    createLinearGradient(x0, y0, x1, y1) {
      check('createLinearGradient', x0, y0, x1, y1);
      return grad;
    },
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    fillStyle: '#000',
    strokeStyle: '#000',
    font: '12px sans-serif',
    textAlign: 'left',
  };
  return {
    width,
    height,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width, height }),
    getOpCount: () => ops,
  };
}

function buildTestBattleHarness() {
  const dataRegistry = loadRegistry();
  const eventBus = new EventBus();
  const storage = createMemoryStorage();
  const saveManager = new SaveManager({ storage, eventBus });
  const gameState = new GameState(saveManager.load().data, eventBus);

  const economySystem = new EconomySystem({ gameState, dataRegistry, eventBus });
  const heroSystem = new HeroSystem({ gameState, dataRegistry, eventBus });
  const formationSystem = new FormationSystem({ gameState, dataRegistry, heroSystem, eventBus });
  const cardSystem = new CardSystem({ dataRegistry, gameState, eventBus });
  const progressionSystem = new ProgressionSystem({ gameState, dataRegistry, eventBus });
  const unitManager = new UnitManager({ dataRegistry, eventBus });
  const targetingSystem = new TargetingSystem();
  const movementSystem = new MovementSystem();
  const combatSystem = new CombatSystem({ eventBus, dataRegistry, rng: () => 0.9 });
  const projectileSystem = new ProjectileSystem({ eventBus });
  const skillSystem = new SkillSystem({ gameState, heroSystem, eventBus, dataRegistry });
  const waveManager = new WaveManager({ dataRegistry, eventBus });
  const animationManager = new AnimationManager();
  const particleSystem = new ParticleSystem();
  const assetManager = { getImageElement: () => null };
  const battleRenderer = new BattleRenderer({
    assetManager,
    animationManager,
    particleSystem,
    gameState,
  });

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
    battleRenderer,
    animationManager,
    particleSystem,
    audioManager: null,
  });

  return {
    dataRegistry,
    eventBus,
    gameState,
    heroSystem,
    formationSystem,
    cardSystem,
    unitManager,
    combatSystem,
    projectileSystem,
    skillSystem,
    battleRenderer,
    battleManager,
  };
}

test('ShieldVfxConfig: all 14 existing shield sources resolve to distinct themes with complete palettes', () => {
  assert.equal(ALL_SHIELD_THEMES.length, 14);

  const mappings = [
    [{ abilityId: 'unit_bulwark_guard' }, SHIELD_THEME_IDS.HERALDIC_BULWARK],
    [{ sourceUnitId: 'aegis_sentinel', effectId: 'proj_shield_1' }, SHIELD_THEME_IDS.AEGIS_PRISM],
    [{ abilityId: 'unit_construct_overdrive' }, SHIELD_THEME_IDS.SOLAR_FORGE],
    [{ sourceUnitId: 'enemy_cryo_warden', effectId: 'proj_shield_2' }, SHIELD_THEME_IDS.CRYO_CRYSTAL],
    [{ modifierId: 'mod_fortified_hull' }, SHIELD_THEME_IDS.FORTRESS_HULL],
    [{ abilityId: 'boss_aegis_shell', sourceBossId: 'boss_bastion_warden' }, SHIELD_THEME_IDS.OBSIDIAN_AEGIS],
    [{ abilityId: 'boss_phase_mend', sourceBossId: 'boss_chrono_arbiter' }, SHIELD_THEME_IDS.CHRONO_TEMPORAL],
    [{ abilityId: 'boss_void_siphon', sourceBossId: 'boss_astral_leviathan' }, SHIELD_THEME_IDS.VOID_SIPHON],
    [{ cardId: 'card_skill_sanctuary_wave' }, SHIELD_THEME_IDS.SANCTUARY_VERDANT],
    [{ cardId: 'card_tactic_emergency_defense' }, SHIELD_THEME_IDS.TACTICAL_PHALANX],
    [{ cardId: 'card_support_aegis_blessing' }, SHIELD_THEME_IDS.ASTRAL_BLESSING],
    [{ cardId: 'card_support_cleanse_beacon' }, SHIELD_THEME_IDS.PURIFY_SANCTITY],
    [{ ultimateId: 'ult_sanctuary_pulse' }, SHIELD_THEME_IDS.RADIANT_HYMN],
    [{ ultimateId: 'ult_fortified_line' }, SHIELD_THEME_IDS.IRONFORGE_BASTION],
  ];

  const seenIds = new Set();
  for (const [query, expectedId] of mappings) {
    const resolved = resolveShieldTheme(query);
    assert.equal(resolved.id, expectedId, `Expected ${expectedId} for ${JSON.stringify(query)}`);
    seenIds.add(resolved.id);
    assert.ok(resolved.palette.primary && resolved.palette.secondary && resolved.palette.rim && resolved.palette.core);
    assert.ok(Array.isArray(resolved.palette.fragments) && resolved.palette.fragments.length >= 3);
    assert.ok(resolved.centerAlpha <= 0.05, `Shield center must stay transparent for readability (${resolved.id})`);
  }
  assert.equal(seenIds.size, 14, 'All 14 shield sources map to unique themes');
});

test('ShieldVfxSystem: formation choreography, reinforcement pulse, and smooth strength tracking', () => {
  const sys = new ShieldVfxSystem({ quality: 'high' });
  const unit = { uid: 'u1', unitId: 'heavy_shield_guard', x: 30, y: 50, facing: 1, hp: 500, maxHp: 500, shield: 150, shieldMax: 150, shieldThemeId: 'heraldic_bulwark', state: UNIT_STATES.IDLE };

  const state = sys.onShieldApplied({ unit, totalShield: 150, shieldMax: 150, themeId: 'heraldic_bulwark' });
  assert.equal(state.phase, 'forming');
  assert.equal(state.formProgress, 0);

  sys.update(0.22, [unit], []);
  assert.equal(state.phase, 'forming');
  assert.ok(state.formProgress > 0.4 && state.formProgress < 0.7);

  sys.update(0.3, [unit], []);
  assert.equal(state.phase, 'active');
  assert.equal(state.formProgress, 1);

  // Refreshing while active triggers smooth reinforcement pulse without resetting to 0
  sys.onShieldApplied({ unit, totalShield: 220, shieldMax: 220, themeId: 'heraldic_bulwark', isRefresh: true });
  assert.equal(state.phase, 'active');
  assert.equal(state.reinforcePulse, 1);
  sys.update(0.17, [unit], []);
  assert.ok(state.reinforcePulse > 0.3 && state.reinforcePulse < 0.7);

  // Lowering shield strength updates strengthRatio proportionally to shieldMax (NOT unit.maxHp)
  unit.shield = 44;
  unit.shieldMax = 220;
  for (let i = 0; i < 30; i += 1) sys.update(0.05, [unit], []);
  assert.ok(Math.abs(state.strengthRatio - 0.2) < 0.03, `Expected strengthRatio ~0.2, got ${state.strengthRatio}`);
});

test('ShieldVfxSystem: localized multi-hit impulses preserve attack angle, scale by severity, and stay capped', () => {
  const sys = new ShieldVfxSystem({ quality: 'high' });
  const unit = { uid: 'u2', unitId: 'aegis_sentinel', x: 50, y: 50, facing: 1, hp: 400, maxHp: 400, shield: 200, shieldMax: 200, shieldThemeId: 'aegis_prism', state: UNIT_STATES.IDLE };
  const state = sys.onShieldApplied({ unit, totalShield: 200, shieldMax: 200, themeId: 'aegis_prism', instant: true });

  // Small hit from the right (angle 0)
  const smallHit = sys.onShieldHit({ unit, absorbed: 18, remainingShield: 182, shieldMax: 200, impactAngle: 0, isCrit: false });
  // Heavy crit hit from upper-left (angle -2.4)
  const heavyHit = sys.onShieldHit({ unit, absorbed: 95, remainingShield: 87, shieldMax: 200, impactAngle: -2.4, isCrit: true });

  assert.equal(smallHit.surfaceAngle, 0);
  assert.equal(heavyHit.surfaceAngle, -2.4);
  assert.ok(heavyHit.severity > smallHit.severity + 0.3, 'Heavy crit hit must have much stronger reaction severity than small hit');

  // Rapid burst of 9 hits must stay strictly within fixed pool cap
  for (let i = 0; i < 9; i += 1) {
    sys.onShieldHit({ unit, absorbed: 12, remainingShield: 60, shieldMax: 200, impactAngle: i * 0.7 });
  }
  sys.update(0.02, [unit], []);
  assert.equal(state.activeHitCount, MAX_CONCURRENT_HITS_PER_SHIELD);
  assert.equal(state.hitImpulses.length, MAX_CONCURRENT_HITS_PER_SHIELD);
});

test('Gameplay preservation & distinct Break vs Expiration lifecycle events', () => {
  const { eventBus, unitManager, combatSystem, battleManager } = buildTestBattleHarness();
  battleManager.startSession(null, { stageId: 'stage_1_1' });
  battleManager.beginBattle();

  const appliedEvents = [];
  const hitEvents = [];
  const breakEvents = [];
  const expireEvents = [];
  eventBus.on('combat:shieldApplied', (e) => appliedEvents.push(e));
  eventBus.on('combat:shieldHit', (e) => hitEvents.push(e));
  eventBus.on('combat:shieldBroken', (e) => breakEvents.push(e));
  eventBus.on('combat:shieldExpired', (e) => expireEvents.push(e));

  const defender = unitManager.spawnUnit({ unitId: 'heavy_shield_guard', side: 'ally', x: 30, y: 50, restrictToRegion: false });
  const attacker = unitManager.spawnUnit({ unitId: 'enemy_void_vanguard', side: 'enemy', x: 45, y: 50, restrictToRegion: false });
  assert.ok(defender && attacker);

  // 1. Apply timed shield -> expires naturally without breaking
  unitManager.applyStatusEffect(defender, {
    id: 'unit_bulwark_guard_shd',
    type: 'shield',
    value: 110,
    durationSec: 1.0,
    abilityId: 'unit_bulwark_guard',
    sourceUnit: defender,
  });
  assert.equal(defender.shield, 110);
  assert.equal(defender.shieldMax, 110);
  assert.equal(defender.shieldThemeId, SHIELD_THEME_IDS.HERALDIC_BULWARK);
  assert.equal(appliedEvents.length, 1);

  unitManager.updateTimers(1.2);
  assert.equal(defender.shield, 0);
  assert.equal(expireEvents.length, 1, 'Timed expiration must emit combat:shieldExpired');
  assert.equal(breakEvents.length, 0, 'Natural expiration must NOT emit combat:shieldBroken');

  const shieldVfx = battleManager.getShieldVfxSystem();
  assert.ok(
    shieldVfx.getTransientEffects().some((fx) => fx.kind === 'expire' && fx.uid === defender.uid),
    'Natural expiration must queue an expire dissolve effect',
  );

  // 2. Apply fresh shield -> partial hit -> lethal shield-breaking hit from right (attacker.x > defender.x)
  unitManager.applyStatusEffect(defender, {
    id: 'card_support_aegis_blessing_shd',
    type: 'shield',
    value: 120,
    durationSec: 9.0,
    cardId: 'card_support_aegis_blessing',
  });
  assert.equal(defender.shieldThemeId, SHIELD_THEME_IDS.ASTRAL_BLESSING);
  const hpBefore = defender.hp;

  // Partial damage absorbed completely by shield (HP untouched)
  const partialRes = combatSystem.applyDamage({
    source: attacker,
    target: defender,
    rawAttack: 50,
    bypassMitigation: true,
    unitManager,
  });
  assert.equal(partialRes.absorbed, 50);
  assert.equal(partialRes.hpLost, 0);
  assert.equal(defender.hp, hpBefore, 'Shield absorption must protect HP identically to before');
  assert.equal(defender.shield, 70);
  assert.equal(hitEvents.length, 1);
  assert.equal(breakEvents.length, 0);
  assert.ok(Math.abs(hitEvents[0].impactAngle) < 0.25, 'Attack from right must localize hit at ~0 rad');

  // Heavy hit breaks remaining 70 shield and overflows 30 into HP
  const breakRes = combatSystem.applyDamage({
    source: attacker,
    target: defender,
    rawAttack: 100,
    bypassMitigation: true,
    unitManager,
  });
  assert.equal(breakRes.absorbed, 70);
  assert.equal(breakRes.hpLost, 30);
  assert.equal(breakRes.shieldBroken, true);
  assert.equal(defender.shield, 0);
  assert.equal(defender.hp, hpBefore - 30);
  assert.equal(breakEvents.length, 1, 'Depleting shield in combat must emit combat:shieldBroken');
  assert.equal(breakEvents[0].themeId, SHIELD_THEME_IDS.ASTRAL_BLESSING);
  assert.ok(
    shieldVfx.getTransientEffects().some((fx) => fx.kind === 'break' && fx.uid === defender.uid),
    'Combat break must queue a shatter break effect',
  );

  // Cleanup on stopSession
  battleManager.stopSession();
  assert.equal(shieldVfx.getActiveStateCount(), 0);
  assert.equal(shieldVfx.getTransientEffects().length, 0);
});

test('ShieldVfxRenderer: finite Canvas 2D geometry across all 14 themes, states, breaks, expirations, and reduced motion', () => {
  const canvas = createStrictMockCanvas(1280, 720);
  const ctx = canvas.getContext('2d');
  const bf = new Battlefield();
  const sys = new ShieldVfxSystem({ quality: 'high' });

  for (let idx = 0; idx < ALL_SHIELD_THEMES.length; idx += 1) {
    const theme = ALL_SHIELD_THEMES[idx];
    const unit = {
      uid: `render_${idx}`,
      unitId: idx % 3 === 0 ? 'heavy_shield_guard' : idx % 3 === 1 ? 'aegis_sentinel' : 'astral_construct',
      unitClass: idx % 3 === 0 ? 'heavy_defender' : 'defensive_support',
      side: idx % 2 === 0 ? 'ally' : 'enemy',
      facing: idx % 2 === 0 ? 1 : -1,
      x: 20 + (idx % 7) * 10,
      y: 35 + Math.floor(idx / 7) * 30,
      hp: 400,
      maxHp: 400,
      shield: 120,
      shieldMax: 120,
      shieldThemeId: theme.id,
      visualScale: idx === 5 ? 1.55 : 1.0,
      isBoss: idx === 5,
      state: UNIT_STATES.IDLE,
    };
    const layout = { drawX: 200 + idx * 60, drawY: 200, y: 244, spriteSize: 48 * unit.visualScale };

    // Formation phase
    const st = sys.onShieldApplied({ unit, totalShield: 120, shieldMax: 120, themeId: theme.id });
    sys.update(0.18, [unit], []);
    drawUnitShieldBack(ctx, unit, layout, unit.visualScale, 0.4, st, false);
    drawUnitShieldFront(ctx, unit, layout, unit.visualScale, 0.4, st, false);

    // Active + multi-hit + low shield cracks
    sys.update(0.4, [unit], []);
    unit.shield = 22;
    sys.onShieldHit({ unit, absorbed: 25, remainingShield: 22, shieldMax: 120, impactAngle: 0.2, isCrit: false });
    sys.onShieldHit({ unit, absorbed: 70, remainingShield: 22, shieldMax: 120, impactAngle: -2.1, isCrit: true });
    sys.update(0.12, [unit], []);
    drawUnitShieldBack(ctx, unit, layout, unit.visualScale, 1.2, st, false);
    drawUnitShieldFront(ctx, unit, layout, unit.visualScale, 1.2, st, false);
    // Reduced motion pass
    drawUnitShieldBack(ctx, unit, layout, unit.visualScale, 1.2, st, true);
    drawUnitShieldFront(ctx, unit, layout, unit.visualScale, 1.2, st, true);

    // Geometry proportionality check
    const geom = computeShieldGeometry(unit, layout, theme, unit.visualScale);
    assert.ok(geom.rx > 10 && geom.rx < layout.spriteSize * 0.72, `Shield width proportional (${theme.id})`);
    assert.ok(geom.ry > 10 && geom.ry < layout.spriteSize * 0.72, `Shield height proportional (${theme.id})`);
  }

  // Trigger break + expire transient renders across multiple timestamps
  const uBreak = { uid: 'render_0', unitId: 'heavy_shield_guard', x: 40, y: 50, facing: 1, visualScale: 1, shield: 0, hp: 300, state: UNIT_STATES.IDLE };
  const uExpire = { uid: 'render_1', unitId: 'aegis_sentinel', x: 60, y: 50, facing: -1, visualScale: 1, shield: 0, hp: 300, state: UNIT_STATES.IDLE };
  sys.onShieldBroken({ unit: uBreak, themeId: SHIELD_THEME_IDS.CRYO_CRYSTAL, impactAngle: 0.4, severity: 0.95 });
  sys.onShieldExpired({ unit: uExpire, themeId: SHIELD_THEME_IDS.ASTRAL_BLESSING });

  for (let step = 0; step < 6; step += 1) {
    sys.update(0.1, [uBreak, uExpire], []);
    drawShieldTransientEffects(ctx, bf, 1280, 720, sys.getTransientEffects(), step * 0.1, false);
  }

  assert.ok(canvas.getOpCount() > 500, 'Renderer emitted rich multi-layered draw commands');
  assert.ok(sys.getTransientEffects().length <= MAX_TRANSIENT_SHIELD_EFFECTS);
});
