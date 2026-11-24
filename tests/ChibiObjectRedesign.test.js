import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { Battlefield } from '../src/battle/Battlefield.js';
import { UNIT_STATES } from '../src/battle/UnitManager.js';
import {
  UNIT_OBJECT_DESIGNS,
  UNIT_OBJECT_ROSTER_IDS,
  resolveUnitObjectDesign,
} from '../src/rendering/UnitObjectDesignCatalog.js';
import {
  UNIT_OBJECT_RENDERERS,
  drawChibiObjectUnit,
} from '../src/rendering/UnitObjectModelRenderer.js';
import {
  UNIT_ATTACK_FX_KINDS,
  resolveUnitAttackVfxProfile,
} from '../src/rendering/UnitAttackVfxConfig.js';
import { drawUnitAttackWorldEffect } from '../src/rendering/UnitAttackVfxRenderer.js';

import { ASSETS_CONFIG } from '../src/rendering/AssetManager.js';

const ROOT = process.cwd();
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', rel), 'utf8'));

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
    arc(x, y, r, s, e) {
      assertFinite('arc', x, y, r, s, e);
      if (r < 0) throw new Error(`Negative arc radius: ${r}`);
    },
    ellipse(x, y, rx, ry, rot, s, e) {
      assertFinite('ellipse', x, y, rx, ry, rot, s, e);
      if (rx < 0 || ry < 0) throw new Error(`Negative ellipse radius: ${rx}, ${ry}`);
    },
    roundRect(x, y, w, h) { assertFinite('roundRect', x, y, w, h); },
    fill() { drawCalls += 1; },
    stroke() { drawCalls += 1; },
    fillText() { drawCalls += 1; },
    setLineDash() {},
    drawImage() { drawCalls += 1; },
    createLinearGradient: makeGradient,
    createRadialGradient: makeGradient,
    measureText: (t) => ({ width: String(t || '').length * 7 }),
  };
  return {
    width,
    height,
    getContext: () => ctx,
    getDrawCalls: () => drawCalls,
    resetDrawCalls: () => { drawCalls = 0; },
  };
}

test('All 33 units have unique non-humanoid chibi object designs and bespoke 1-to-1 renderers', () => {
  const units = readJson('units.json').units;
  const enemies = readJson('enemies.json').enemies;
  const bossesJson = readJson('bosses.json');
  const expectedIds = [
    ...units.map((u) => u.id),
    ...enemies.map((e) => e.id),
    ...bossesJson.elites.map((el) => el.id),
    ...bossesJson.bosses.map((b) => b.id),
  ];

  assert.equal(expectedIds.length, 33);
  assert.equal(UNIT_OBJECT_ROSTER_IDS.length, 33);

  const concepts = new Set();
  const rendererKeys = new Set();
  let style25d = 0;
  let style2d = 0;
  let nonFaceCount = 0;

  for (const id of expectedIds) {
    const design = UNIT_OBJECT_DESIGNS[id];
    assert.ok(design, `Missing object design for ${id}`);
    assert.equal(design.isHumanoid, false, `${id} must be non-humanoid`);
    assert.ok(design.renderStyle === '2.5d' || design.renderStyle === '2d', `${id} missing valid renderStyle`);
    if (design.renderStyle === '2.5d') style25d += 1;
    if (design.renderStyle === '2d') style2d += 1;
    if (design.hasFace === false) nonFaceCount += 1;

    assert.ok(design.objectConcept, `Missing objectConcept for ${id}`);
    assert.ok(design.rendererKey, `Missing rendererKey for ${id}`);
    assert.ok(Array.isArray(design.materials) && design.materials.length >= 2, `Missing materials for ${id}`);
    assert.ok(typeof UNIT_OBJECT_RENDERERS[id] === 'function', `Missing bespoke renderer for ${id}`);

    const assetEntry = ASSETS_CONFIG[design.modelAssetId];
    assert.ok(assetEntry, `Missing ASSETS_CONFIG entry ${design.modelAssetId} for ${id}`);
    assert.equal(assetEntry.format, 'webp', `${id} model asset must be WebP`);
    const webpPath = path.join(ROOT, assetEntry.src.replace(/^\.\//, ''));
    assert.ok(fs.existsSync(webpPath), `Missing WebP file on disk: ${webpPath}`);
    const hdr = fs.readFileSync(webpPath).subarray(0, 12);
    assert.equal(hdr.subarray(0, 4).toString('ascii'), 'RIFF', `${id} WebP invalid RIFF header`);
    assert.equal(hdr.subarray(8, 12).toString('ascii'), 'WEBP', `${id} WebP invalid WEBP header`);

    assert.equal(concepts.has(design.objectConcept), false, `Duplicate objectConcept: ${design.objectConcept}`);
    assert.equal(rendererKeys.has(design.rendererKey), false, `Duplicate rendererKey: ${design.rendererKey}`);
    concepts.add(design.objectConcept);
    rendererKeys.add(design.rendererKey);
  }

  assert.ok(style25d >= 12 && style2d >= 12, `Expected balanced 2.5D/2D distinction, got 2.5d=${style25d}, 2d=${style2d}`);
  assert.ok(nonFaceCount >= 24, `Expected selective faces (>= 24 non-face units), got ${nonFaceCount}`);
});

test('All 33 chibi object models render cleanly across every state, facing, and tier with finite coordinates', () => {
  const canvas = createStrictTrackingCanvas(1280, 720);
  const ctx = canvas.getContext('2d');
  const states = [
    UNIT_STATES.IDLE,
    UNIT_STATES.MOVING,
    UNIT_STATES.ATTACKING,
    UNIT_STATES.CASTING,
    UNIT_STATES.HEALING,
    UNIT_STATES.STUNNED,
    UNIT_STATES.DEAD,
  ];

  for (const id of UNIT_OBJECT_ROSTER_IDS) {
    const design = UNIT_OBJECT_DESIGNS[id];
    const side = design.rosterGroup === 'playable' ? 'ally' : 'enemy';

    for (const facing of [1, -1]) {
      for (const state of states) {
        canvas.resetDrawCalls();
        const unit = {
          uid: `qa_${id}`,
          unitId: id,
          bossId: design.rosterGroup === 'boss' ? id : null,
          eliteId: design.rosterGroup === 'elite' ? id : null,
          side,
          facing,
          state,
          tier: design.rosterGroup === 'playable' ? 3 : 1,
          phase: 0.7,
          attackAnim: state === UNIT_STATES.ATTACKING ? 0.12 : 0,
          healAnim: state === UNIT_STATES.HEALING ? 0.2 : 0,
          hitFlash: state === UNIT_STATES.STUNNED ? 0.1 : 0,
          castingAbility: state === UNIT_STATES.CASTING ? { remaining: 0.25, duration: 0.6 } : null,
        };
        const layout = drawChibiObjectUnit(ctx, unit, {
          x: 640,
          y: 360,
          scale: 1.2,
          elapsed: 1.35,
          deathProgress: state === UNIT_STATES.DEAD ? 0.45 : 0,
        });
        assert.ok(layout && Number.isFinite(layout.drawX) && Number.isFinite(layout.drawY));
        assert.ok(canvas.getDrawCalls() > 0, `Expected non-zero draw calls for ${id} (${state}, facing=${facing})`);
      }
    }
  }

  // Verify enemy mirror palette resolution for playable units spawned on enemy side
  const allyShield = resolveUnitObjectDesign({ unitId: 'heavy_shield_guard', side: 'ally' });
  const enemyShield = resolveUnitObjectDesign({ unitId: 'heavy_shield_guard', side: 'enemy' });
  assert.notEqual(allyShield.palette.primary, enemyShield.palette.primary);
});

test('All 24 unit, elite, and boss signature abilities render cleanly across full lifecycle and caster variants', () => {
  const bossesJson = readJson('bosses.json');
  const abilities = bossesJson.bossAbilities;
  assert.equal(abilities.length, 24);

  const bf = new Battlefield();
  const canvas = createStrictTrackingCanvas(1280, 720);
  const ctx = canvas.getContext('2d');

  // Map each ability to all casters that use it to verify caster-specific branches
  const units = readJson('units.json').units;
  const enemies = readJson('enemies.json').enemies;
  const allCasters = [
    ...units.map((u) => ({ id: u.id, side: 'ally', abilities: u.abilities || [] })),
    ...enemies.map((e) => ({ id: e.id, side: 'enemy', abilities: e.abilities || [] })),
    ...bossesJson.elites.map((el) => ({ id: el.id, side: 'enemy', abilities: el.abilities || [] })),
    ...bossesJson.bosses.map((b) => ({ id: b.id, side: 'enemy', abilities: b.abilities || [] })),
  ];

  for (const ab of abilities) {
    const matchingCasters = allCasters.filter((c) => c.abilities.includes(ab.id));
    const targetsToTest = matchingCasters.length > 0
      ? matchingCasters
      : [{ id: 'boss_bastion_warden', side: 'enemy' }];

    for (const caster of targetsToTest) {
      const profile = resolveUnitAttackVfxProfile(caster.id, { side: caster.side });
      for (const ratio of [0.15, 0.45, 0.8]) {
        canvas.resetDrawCalls();
        const fx = {
          kind: UNIT_ATTACK_FX_KINDS.ABILITY,
          x: 52,
          y: 50,
          radius: ab.radius || 16,
          color: ab.color || profile.palette.primary,
          secondaryColor: profile.palette.secondary,
          age: 0.8 * ratio,
          duration: 0.8,
          profileId: caster.id,
          side: caster.side,
          scale: profile.scale || 1,
          seed: 77,
          meta: { abilityKind: ab.kind, abilityId: ab.id },
        };
        drawUnitAttackWorldEffect(ctx, bf, 1280, 720, fx, 'ground', null, 1.2);
        drawUnitAttackWorldEffect(ctx, bf, 1280, 720, fx, 'sky', null, 1.2);
        assert.ok(canvas.getDrawCalls() > 0, `Expected draw calls for ability ${ab.id} on ${caster.id}`);
      }
    }
  }
});

test('All 10 playable unit SVG icons are richly detailed multi-layer object illustrations (zero cartoon smiley placeholders)', () => {
  const units = readJson('units.json').units;
  assert.equal(units.length, 10);
  for (const u of units) {
    const svgPath = path.join(ROOT, 'assets', 'units', `${u.id}.svg`);
    assert.ok(fs.existsSync(svgPath), `Missing SVG for ${u.id}`);
    const content = fs.readFileSync(svgPath, 'utf8');
    assert.ok(content.includes('<svg'), `${u.id}.svg missing <svg>`);
    assert.ok(content.includes('<defs>'), `${u.id}.svg missing <defs> gradient shading`);
    assert.ok(
      content.includes('<radialGradient') || content.includes('<linearGradient'),
      `${u.id}.svg missing vector gradient`,
    );
    const primCount = (content.match(/<(?:path|polygon|rect|circle|ellipse|line|polyline)\b/g) || []).length;
    assert.ok(primCount >= 14, `${u.id}.svg lacks multi-layered illustration geometry (primitives=${primCount})`);
  }
});
