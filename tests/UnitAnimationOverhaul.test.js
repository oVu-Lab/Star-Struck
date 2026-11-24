import test from 'node:test';
import assert from 'node:assert/strict';

import { UNIT_STATES } from '../src/battle/UnitManager.js';
import { UNIT_OBJECT_DESIGNS, UNIT_OBJECT_ROSTER_IDS } from '../src/rendering/UnitObjectDesignCatalog.js';
import {
  UNIT_ANIMATION_PROFILES,
  evaluateUnitAnimationState,
} from '../src/rendering/UnitAnimationProfiles.js';
import { UNIT_COMPONENT_ANIMATORS } from '../src/rendering/UnitComponentAnimators.js';
import { UNIT_SPRITE_RIG_SPECS, getUnitSpriteRig } from '../src/rendering/UnitSpriteRigCache.js';
import { drawChibiObjectUnit } from '../src/rendering/UnitObjectModelRenderer.js';

function createStrictMockCanvas() {
  let ops = 0;
  const assertFinite = (...vals) => {
    for (const v of vals) {
      assert.ok(Number.isFinite(v), `Non-finite canvas coordinate/radius: ${v}`);
    }
  };
  const grad = {
    addColorStop(offset) {
      assertFinite(offset);
    },
  };
  return {
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    save() { ops += 1; },
    restore() { ops += 1; },
    translate(x, y) { assertFinite(x, y); ops += 1; },
    rotate(a) { assertFinite(a); ops += 1; },
    scale(x, y) { assertFinite(x, y); ops += 1; },
    beginPath() { ops += 1; },
    closePath() { ops += 1; },
    moveTo(x, y) { assertFinite(x, y); ops += 1; },
    lineTo(x, y) { assertFinite(x, y); ops += 1; },
    quadraticCurveTo(cx, cy, x, y) { assertFinite(cx, cy, x, y); ops += 1; },
    arc(x, y, r, s, e) {
      assertFinite(x, y, r, s, e);
      assert.ok(r >= 0, `Negative arc radius: ${r}`);
      ops += 1;
    },
    ellipse(x, y, rx, ry, rot, s, e) {
      assertFinite(x, y, rx, ry, rot, s, e);
      assert.ok(rx >= 0 && ry >= 0, `Negative ellipse radius: ${rx}, ${ry}`);
      ops += 1;
    },
    rect(x, y, w, h) { assertFinite(x, y, w, h); ops += 1; },
    fillRect(x, y, w, h) { assertFinite(x, y, w, h); ops += 1; },
    fill() { ops += 1; },
    stroke() { ops += 1; },
    setLineDash() {},
    drawImage() { ops += 1; },
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      assertFinite(x0, y0, r0, x1, y1, r1);
      assert.ok(r0 >= 0 && r1 >= 0, `Negative gradient radius: ${r0}, ${r1}`);
      return grad;
    },
    createLinearGradient(x0, y0, x1, y1) {
      assertFinite(x0, y0, x1, y1);
      return grad;
    },
    getOps() { return ops; },
  };
}

test('All 33 units have 1-to-1 bespoke animation profiles and component animators with unique motion identities', () => {
  assert.equal(UNIT_OBJECT_ROSTER_IDS.length, 33);
  const idleStyles = new Set();
  const moveStyles = new Set();
  const attackStyles = new Set();
  const skillStyles = new Set();

  for (const id of UNIT_OBJECT_ROSTER_IDS) {
    const profile = UNIT_ANIMATION_PROFILES[id];
    assert.ok(profile, `Missing animation profile for ${id}`);
    assert.equal(typeof UNIT_COMPONENT_ANIMATORS[id], 'function', `Missing component animator for ${id}`);
    assert.ok(profile.motionIdentity && profile.motionIdentity.length > 10, `Missing motionIdentity for ${id}`);
    assert.ok(profile.idle?.style, `Missing idle style for ${id}`);
    assert.ok(profile.move?.style, `Missing move style for ${id}`);
    assert.ok(profile.attack?.style, `Missing attack style for ${id}`);
    assert.ok(profile.skill?.style, `Missing skill style for ${id}`);

    idleStyles.add(profile.idle.style);
    moveStyles.add(profile.move.style);
    attackStyles.add(profile.attack.style);
    skillStyles.add(profile.skill.style);
  }

  // Every single one of the 33 units has a distinct idle, move, attack, and skill style
  assert.equal(idleStyles.size, 33, 'Expected 33 unique idle animation styles');
  assert.equal(moveStyles.size, 33, 'Expected 33 unique movement animation styles');
  assert.equal(attackStyles.size, 33, 'Expected 33 unique attack animation styles');
  assert.equal(skillStyles.size, 33, 'Expected 33 unique skill animation styles');

  // Rig cache specs map to valid roster IDs and safely return null in headless Node
  for (const rigId of Object.keys(UNIT_SPRITE_RIG_SPECS)) {
    assert.ok(UNIT_OBJECT_DESIGNS[rigId], `Rig spec references unknown unit ${rigId}`);
    assert.equal(getUnitSpriteRig(rigId, null), null);
  }
});

test('3-phase attack choreography (Preparation -> Release -> Recovery) and synchronized skill release work cleanly across all 33 units', () => {
  for (const id of UNIT_OBJECT_ROSTER_IDS) {
    const design = UNIT_OBJECT_DESIGNS[id];
    const unit = {
      id,
      unitId: id,
      side: design.rosterGroup === 'playable' ? 'ally' : 'enemy',
      facing: design.rosterGroup === 'playable' ? 1 : -1,
      state: UNIT_STATES.ATTACKING,
      attackInterval: 1.2,
      attackCooldown: 0.10,
      attackAnim: 0,
      phase: 0.3,
    };

    // Phase 1: Preparation (wind-up as cooldown approaches 0)
    const prep = evaluateUnitAnimationState(unit, 1.0, design);
    assert.equal(prep.attackPhase, 'prep', `${id} should enter prep phase before attack lands`);
    assert.ok(prep.attackPrep > 0.25 && prep.attackPrep <= 1, `${id} attackPrep=${prep.attackPrep}`);

    // Phase 2: Action / Release (attackAnim just fired at 0.21)
    unit.attackCooldown = 1.15;
    unit.attackAnim = 0.20;
    const rel = evaluateUnitAnimationState(unit, 1.05, design);
    assert.equal(rel.attackPhase, 'release', `${id} should enter release phase at attackAnim=0.20`);
    assert.ok(rel.attackRelease > 0.5, `${id} attackRelease=${rel.attackRelease}`);

    // Phase 3: Recovery (attackAnim decaying toward 0)
    unit.attackAnim = 0.06;
    const rec = evaluateUnitAnimationState(unit, 1.18, design);
    assert.equal(rec.attackPhase, 'recovery', `${id} should enter recovery phase at attackAnim=0.06`);
    assert.ok(rec.attackRecovery > 0.2, `${id} attackRecovery=${rec.attackRecovery}`);

    // Synchronized Skill Cast -> Skill Release Burst transition
    unit.attackAnim = 0;
    unit.state = UNIT_STATES.CASTING;
    unit.castingAbility = { ability: { id: 'test_skill' }, duration: 0.6, remaining: 0.15 };
    const castState = evaluateUnitAnimationState(unit, 1.30, design);
    assert.ok(castState.castProgress > 0.7, `${id} castProgress=${castState.castProgress}`);

    // Immediately after cast finishes, skillRelease triggers cleanly
    unit.state = UNIT_STATES.IDLE;
    unit.castingAbility = null;
    const burstState = evaluateUnitAnimationState(unit, 1.34, design);
    assert.ok(burstState.skillRelease > 0.7, `${id} skillRelease should fire right after CASTING ends`);
  }
});

test('Smooth angle integration never jumps backwards when speed accelerates and decelerates', () => {
  const flagshipIds = ['chrono_weaver', 'solar_pyromancer', 'enemy_abyssal_ravager', 'wind_cavalry', 'enemy_inferno_bombardier'];
  for (const id of flagshipIds) {
    const design = UNIT_OBJECT_DESIGNS[id];
    const unit = {
      id,
      unitId: id,
      side: design.rosterGroup === 'playable' ? 'ally' : 'enemy',
      facing: 1,
      state: UNIT_STATES.IDLE,
      attackInterval: 1.0,
      attackCooldown: 0.8,
      attackAnim: 0,
      phase: 0,
    };

    let prevSpin = -Infinity;
    let prevGear = -Infinity;
    let prevWheel = -Infinity;
    for (let step = 0; step < 30; step += 1) {
      const elapsed = step * 0.05;
      if (step === 6) unit.state = UNIT_STATES.MOVING;
      if (step === 12) {
        unit.state = UNIT_STATES.ATTACKING;
        unit.attackCooldown = 0.08;
      }
      if (step === 16) {
        unit.attackCooldown = 1.0;
        unit.attackAnim = 0.20;
      }
      if (step === 22) {
        unit.attackAnim = 0;
        unit.state = UNIT_STATES.IDLE;
      }
      const st = evaluateUnitAnimationState(unit, elapsed, design, { reducedMotion: false });
      assert.ok(st.spinAngle >= prevSpin - 1e-9, `${id} spinAngle jumped backwards at step ${step}`);
      assert.ok(st.gearAngle >= prevGear - 1e-9, `${id} gearAngle jumped backwards at step ${step}`);
      assert.ok(st.wheelAngle >= prevWheel - 1e-9, `${id} wheelAngle jumped backwards at step ${step}`);
      prevSpin = st.spinAngle;
      prevGear = st.gearAngle;
      prevWheel = st.wheelAngle;
    }
    assert.ok(prevSpin > 0.5, `${id} should accumulate continuous forward rotation`);
  }
});

test('Reduced motion mode dampens motion scale safely and all 33 units render across every state with finite geometry and zero mutation', () => {
  const states = [
    { name: 'idle', patch: { state: UNIT_STATES.IDLE, attackAnim: 0 } },
    { name: 'moving', patch: { state: UNIT_STATES.MOVING, attackAnim: 0 } },
    { name: 'attack_prep', patch: { state: UNIT_STATES.ATTACKING, attackInterval: 1.2, attackCooldown: 0.08, attackAnim: 0 } },
    { name: 'attack_release', patch: { state: UNIT_STATES.ATTACKING, attackInterval: 1.2, attackCooldown: 1.1, attackAnim: 0.21 } },
    { name: 'attack_recovery', patch: { state: UNIT_STATES.ATTACKING, attackInterval: 1.2, attackCooldown: 0.9, attackAnim: 0.05 } },
    { name: 'casting', patch: { state: UNIT_STATES.CASTING, castingAbility: { duration: 0.6, remaining: 0.2 } } },
    { name: 'skill_release', patch: { state: UNIT_STATES.IDLE, skillReleaseProgress: 0.72 } },
    { name: 'dead', patch: { state: UNIT_STATES.DEAD } },
  ];

  for (const id of UNIT_OBJECT_ROSTER_IDS) {
    const design = UNIT_OBJECT_DESIGNS[id];
    const normalUnit = { id, unitId: id, side: 'ally', facing: 1, state: UNIT_STATES.MOVING, phase: 0.5 };
    const reducedUnit = { id, unitId: id, side: 'ally', facing: 1, state: UNIT_STATES.MOVING, phase: 0.5 };
    const normalAnim = evaluateUnitAnimationState(normalUnit, 1.2, design, { reducedMotion: false });
    const reducedAnim = evaluateUnitAnimationState(reducedUnit, 1.2, design, { reducedMotion: true });
    assert.ok(reducedAnim.motionScale < normalAnim.motionScale, `${id} reducedMotion should dampen motionScale`);

    for (const sCfg of states) {
      const unit = {
        id,
        unitId: id,
        side: design.rosterGroup === 'playable' ? 'ally' : 'enemy',
        facing: design.rosterGroup === 'playable' ? 1 : -1,
        tier: design.rosterGroup === 'playable' ? 2 : 1,
        hp: 100,
        maxHp: 100,
        phase: 0.4,
        ...sCfg.patch,
      };
      const snapshotHp = unit.hp;
      const snapshotState = unit.state;

      const ctx = createStrictMockCanvas();
      const layout = drawChibiObjectUnit(ctx, unit, {
        x: 220,
        y: 180,
        scale: 1.0,
        elapsed: 1.65,
        deathProgress: sCfg.name === 'dead' ? 0.5 : 0,
        assetManager: null,
        reducedMotion: false,
      });

      assert.ok(Number.isFinite(layout.drawX) && Number.isFinite(layout.drawY));
      assert.ok(ctx.getOps() >= 6, `${id} (${sCfg.name}) produced too few draw ops`);
      // Rendering must never mutate gameplay properties
      assert.equal(unit.hp, snapshotHp);
      assert.equal(unit.state, snapshotState);
    }
  }
});
