import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { EventBus } from '../src/core/EventBus.js';
import { GameState } from '../src/core/GameState.js';
import { SaveManager } from '../src/core/SaveManager.js';
import { BattleManager, BATTLE_PHASES } from '../src/battle/BattleManager.js';
import { UnitManager } from '../src/battle/UnitManager.js';
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
  NON_UNIT_CARD_IDS,
  NON_UNIT_CARD_VFX_PROFILES,
  NON_UNIT_WORLD_FX_KINDS,
  getNonUnitCardVfxProfile,
  isNonUnitCard,
} from '../src/rendering/NonUnitCardVfxConfig.js';
import { isNonUnitWorldEffect } from '../src/rendering/NonUnitCardVfxRenderer.js';
import { NonUnitCardPlayVfx } from '../src/rendering/NonUnitCardPlayVfx.js';
import {
  buildPrecisionArrowPolygon,
  buildPrecisionChevronPolygon,
  buildAnalyticalRibbonGeometry,
  sampleCubicBezier,
  sampleLogSpiral,
} from '../src/rendering/NonUnitVfxGeometry.js';

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

function createTrackingCanvas(width = 1200, height = 640) {
  let drawCalls = 0;
  const makeGradient = () => ({ addColorStop() {} });
  const ctx = {
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    setTransform() {},
    clearRect() {},
    fillRect() { drawCalls += 1; },
    strokeRect() { drawCalls += 1; },
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    bezierCurveTo() {},
    arc() {},
    ellipse() {},
    roundRect() {},
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

function createMiniElement(tag = 'div') {
  const classes = new Set();
  const attrs = new Map();
  const props = new Map();
  const el = {
    tagName: tag.toUpperCase(),
    children: [],
    style: {
      setProperty(k, v) { props.set(k, String(v)); },
      getPropertyValue(k) { return props.get(k) || ''; },
    },
    classList: {
      add: (...cs) => cs.forEach((c) => classes.add(c)),
      remove: (...cs) => cs.forEach((c) => classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.get(k) || null; },
    appendChild(child) {
      child.parentNode = el;
      el.children.push(child);
      return child;
    },
    remove() {
      if (el.parentNode) {
        const idx = el.parentNode.children.indexOf(el);
        if (idx >= 0) el.parentNode.children.splice(idx, 1);
        el.parentNode = null;
      }
    },
    querySelector() { return null; },
    get innerHTML() { return el._innerHTML || ''; },
    set innerHTML(val) {
      el._innerHTML = String(val || '');
      if (val === '') el.children = [];
    },
    get className() { return [...classes].join(' '); },
    set className(val) {
      classes.clear();
      String(val || '').split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
    },
    getBoundingClientRect: () => ({ left: 100, top: 500, width: 104, height: 136 }),
  };
  return el;
}

function buildBattleHarness() {
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

  for (const h of dataRegistry.heroes) heroSystem.grantHero(h.id);
  for (const u of dataRegistry.units) formationSystem.unlockUnit(u.id, cardSystem);
  for (const c of dataRegistry.cards) cardSystem.unlockCard(c.id);

  const unitManager = new UnitManager({ dataRegistry, eventBus });
  const targetingSystem = new TargetingSystem({ balance: dataRegistry.balance });
  const movementSystem = new MovementSystem({ balance: dataRegistry.balance });
  const projectileSystem = new ProjectileSystem({ eventBus });
  const animationManager = new AnimationManager();
  const particleSystem = new ParticleSystem();
  const combatSystem = new CombatSystem({ dataRegistry, eventBus });
  const skillSystem = new SkillSystem({ dataRegistry, gameState, heroSystem, eventBus });
  const waveManager = new WaveManager({ eventBus, balance: dataRegistry.balance });
  const assetManager = {
    getImage: () => null,
    getImageElement: () => null,
    bindImageElement: () => {},
  };
  const battleRenderer = new BattleRenderer({
    assetManager,
    animationManager,
    particleSystem,
    gameState,
  });
  const audioManager = {
    playDeploy() {},
    playSkill() {},
    playHeal() {},
    playHit() {},
    playUltimate() {},
    playInvalid() {},
    playVictory() {},
    playDefeat() {},
    playWave() {},
    playBoss() {},
    setBgmMode() {},
  };

  const battleManager = new BattleManager({
    dataRegistry,
    gameState,
    eventBus,
    unitManager,
    targetingSystem,
    movementSystem,
    combatSystem,
    projectileSystem,
    skillSystem,
    cardSystem,
    waveManager,
    heroSystem,
    progressionSystem,
    economySystem,
    animationManager,
    particleSystem,
    battleRenderer,
    audioManager,
  });

  const canvas = createTrackingCanvas();
  battleManager.startSession(null, { stageId: 'stage_1_1', enforceUnlock: false });
  battleRenderer.attach(canvas);
  battleRenderer.setBattlefield(battleManager.battlefield);
  battleManager.beginBattle();
  battleManager.transitionPhase(BATTLE_PHASES.ACTIVE_COMBAT);

  // Seed several allies and enemies (including an elite) so every targeting mode resolves live units
  unitManager.spawnUnit({ unitId: 'unit_shield_guard', side: 'ally', x: 34, y: 40, level: 5 });
  unitManager.spawnUnit({ unitId: 'unit_arcane_archer', side: 'ally', x: 24, y: 54, level: 5 });
  unitManager.spawnUnit({ unitId: 'unit_wind_cavalry', side: 'ally', x: 38, y: 62, level: 5 });
  const enemy1 = unitManager.spawnUnit({ unitId: 'enemy_trooper', side: 'enemy', x: 64, y: 46, level: 3 });
  const enemy2 = unitManager.spawnUnit({ unitId: 'enemy_marksman', side: 'enemy', x: 70, y: 54, level: 3 });
  const enemy3 = unitManager.spawnUnit({ unitId: 'enemy_vanguard', side: 'enemy', x: 66, y: 50, level: 4, isElite: true });

  // Slightly injure an ally so heals always register
  const allies = unitManager.getBySide('ally');
  if (allies[0]) allies[0].hp = Math.max(10, allies[0].maxHp * 0.55);

  return {
    dataRegistry,
    eventBus,
    gameState,
    battleManager,
    battleRenderer,
    animationManager,
    particleSystem,
    cardSystem,
    unitManager,
    canvas,
    enemies: [enemy1, enemy2, enemy3],
  };
}

test('All 18 non-Unit cards in data/cards.json have unique individual VFX profiles and Unit cards are strictly excluded', () => {
  const registry = loadRegistry();
  const nonUnitCards = registry.cards.filter((c) => c.category !== 'unit');
  const unitCards = registry.cards.filter((c) => c.category === 'unit');

  assert.equal(nonUnitCards.length, 18, 'Expected exactly 18 non-Unit cards (6 Skill, 6 Tactic, 6 Support)');
  assert.equal(NON_UNIT_CARD_IDS.length, 18, 'VFX catalog must define all 18 non-Unit cards');

  const seenKinds = new Set();
  for (const card of nonUnitCards) {
    const instance = { cardId: card.id, category: card.category, tier: 1 };
    assert.equal(isNonUnitCard(instance), true, `${card.id} must be recognized as non-Unit`);
    const profile = getNonUnitCardVfxProfile(instance);
    assert.ok(profile, `${card.id} must have a dedicated VFX profile`);
    assert.equal(profile.cardId, card.id, `${card.id} must map to its own explicit profile`);
    assert.ok(NON_UNIT_WORLD_FX_KINDS.has(profile.worldFxKind), `${card.id} worldFxKind must be registered`);
    assert.equal(isNonUnitWorldEffect(profile.worldFxKind), true, `${profile.worldFxKind} must be handled by renderer`);
    assert.equal(seenKinds.has(profile.worldFxKind), false, `${profile.worldFxKind} must be unique per card`);
    seenKinds.add(profile.worldFxKind);
    assert.ok(profile.palette?.primary && profile.palette?.core, `${card.id} must define luminous palette`);
    assert.ok(profile.playMotion?.ribbonArc, `${card.id} must define card-play ribbon trajectory`);
  }

  for (const unitCard of unitCards) {
    const instance = { cardId: unitCard.id, category: 'unit', tier: 1 };
    assert.equal(isNonUnitCard(instance), false, `Unit card ${unitCard.id} must be excluded`);
    assert.equal(getNonUnitCardVfxProfile(instance), null, `Unit card ${unitCard.id} must not have a non-Unit profile`);
  }
});

test('Every single one of the 18 non-Unit cards plays cleanly across Tiers 1-3, spawns its bespoke world effect, renders without error, and cleans up', () => {
  const h = buildBattleHarness();
  const nonUnitCards = h.dataRegistry.cards.filter((c) => c.category !== 'unit');
  const playedEvents = [];
  h.eventBus.on('cards:nonUnitPlayed', (payload) => playedEvents.push(payload));

  for (const def of nonUnitCards) {
    const expectedProfile = NON_UNIT_CARD_VFX_PROFILES[def.id];
    assert.ok(expectedProfile, `Missing profile for ${def.id}`);

    for (const tier of [1, 2, 3]) {
      // Refill energy & keep enemies/allies alive for consistent resolution
      h.gameState.setBattle({ energy: 100, dp: 100 });
      for (const e of h.unitManager.getBySide('enemy')) {
        e.hp = e.maxHp;
      }
      if (h.unitManager.getBySide('enemy').length < 3) {
        h.unitManager.spawnUnit({ unitId: 'enemy_trooper', side: 'enemy', x: 65, y: 48, level: 3 });
        h.unitManager.spawnUnit({ unitId: 'enemy_marksman', side: 'enemy', x: 72, y: 54, level: 3 });
        h.unitManager.spawnUnit({ unitId: 'enemy_vanguard', side: 'enemy', x: 68, y: 50, level: 4, isElite: true });
      }
      for (const a of h.unitManager.getBySide('ally')) {
        a.hp = Math.max(20, a.maxHp * 0.65);
      }

      h.animationManager.reset();
      playedEvents.length = 0;

      // Inject card instance directly into slot 0
      const slotCard = {
        instanceId: `test_${def.id}_t${tier}`,
        cardId: def.id,
        name: def.name,
        category: def.category,
        rarity: def.rarity,
        cost: def.cost,
        tier,
        levelLabel: tier === 3 ? 'Lv.III' : tier === 2 ? 'Lv.II' : 'Lv.I',
        artAssetId: def.artAssetId,
        targeting: def.targeting,
        effect: def.effect,
      };
      h.cardSystem._slots[0] = slotCard;

      const res = h.battleManager.playCardSlot(0);
      assert.equal(res.ok, true, `Playing ${def.id} (Tier ${tier}) must succeed`);
      assert.equal(playedEvents.length, 1, `Playing ${def.id} must emit cards:nonUnitPlayed exactly once`);
      assert.equal(playedEvents[0].card.cardId, def.id);
      assert.equal(playedEvents[0].slotIndex, 0);
      assert.ok(playedEvents[0].vfxAnchor, `${def.id} must provide resolved vfxAnchor`);

      const effects = h.animationManager.getWorldEffects();
      const matchingFx = effects.find((fx) => fx.kind === expectedProfile.worldFxKind);
      assert.ok(matchingFx, `${def.id} (Tier ${tier}) must spawn bespoke world effect ${expectedProfile.worldFxKind}`);
      assert.equal(matchingFx.cardId, def.id);
      assert.equal(matchingFx.tier, tier);

      // Render across multiple animation progress points (ground + sky passes)
      for (const stepDt of [0.08, 0.22, 0.35, 0.4]) {
        h.animationManager.update(stepDt);
        h.particleSystem.update(stepDt, 1200, 640);
        h.canvas.resetDrawCalls();
        h.battleRenderer.render({
          stage: h.battleManager._activeStage,
          battlefield: h.battleManager.battlefield,
          phase: BATTLE_PHASES.ACTIVE_COMBAT,
          units: h.unitManager.getAll(),
          projectiles: [],
          telegraphs: [],
          activeTactic: h.battleManager._activeTactic,
          commander: null,
          ultimateEnergy: 0,
        });
        assert.ok(h.canvas.getDrawCalls() > 0, `Rendering ${def.id} (Tier ${tier}) must draw cleanly`);
      }

      // Advance past total duration and verify full cleanup (no leaked world effects)
      h.animationManager.update(2.0);
      const remaining = h.animationManager
        .getWorldEffects()
        .filter((fx) => fx.kind === expectedProfile.worldFxKind);
      assert.equal(remaining.length, 0, `${def.id} world effect must expire and clean up completely`);
    }
  }
});

test('Unit cards remain completely untouched: no cards:nonUnitPlayed event, no non-Unit ghost, exact deploy world effect preserved', () => {
  const h = buildBattleHarness();
  const unitCards = h.dataRegistry.cards.filter((c) => c.category === 'unit').slice(0, 4);
  const nonUnitEvents = [];
  h.eventBus.on('cards:nonUnitPlayed', (p) => nonUnitEvents.push(p));

  const origDoc = globalThis.document;
  globalThis.document = { createElement: (tag) => createMiniElement(tag) };
  try {
    const ghostLayer = createMiniElement('div');
    const vfxCanvas = createTrackingCanvas();
    const playVfx = new NonUnitCardPlayVfx(vfxCanvas, ghostLayer);

    for (const def of unitCards) {
      h.gameState.setBattle({ energy: 100, dp: 100 });
      h.animationManager.reset();
      const slotCard = {
        instanceId: `test_unit_${def.id}`,
        cardId: def.id,
        unitId: def.unitId,
        name: def.name,
        category: 'unit',
        rarity: def.rarity,
        cost: def.cost,
        tier: 1,
        spawnCount: 1,
        unitLevel: 1,
        statMultiplier: 1,
      };
      h.cardSystem._slots[0] = slotCard;

      const alliesBefore = h.unitManager.getBySide('ally').length;
      const res = h.battleManager.playCardSlot(0);
      assert.equal(res.ok, true, `Unit card ${def.id} must still play normally`);
      assert.equal(h.unitManager.getBySide('ally').length, alliesBefore + 1, 'Unit card must spawn ally');
      assert.equal(nonUnitEvents.length, 0, 'Unit card must never emit cards:nonUnitPlayed');
      assert.ok(
        h.animationManager.getWorldEffects().some((fx) => fx.kind === 'deploy'),
        'Unit card must retain its original deploy world effect',
      );
      assert.equal(
        h.animationManager.getWorldEffects().some((fx) => isNonUnitWorldEffect(fx.kind)),
        false,
        'Unit card must never spawn non-Unit world effects',
      );
      assert.equal(playVfx.playNonUnitCard({ card: slotCard }), false, 'NonUnitCardPlayVfx must reject Unit cards');
      assert.equal(playVfx.getActiveCount(), 0);
      assert.equal(ghostLayer.children.length, 0);
    }
    playVfx.stop();
  } finally {
    globalThis.document = origDoc;
  }
});

test('NonUnitCardPlayVfx handles repeated plays, special HUD destinations, reduced motion, and strict stop() cleanup', () => {
  const origDoc = globalThis.document;
  globalThis.document = { createElement: (tag) => createMiniElement(tag) };
  try {
    const ghostLayer = createMiniElement('div');
    const vfxCanvas = createTrackingCanvas(1280, 720);
    const controller = new NonUnitCardPlayVfx(vfxCanvas, ghostLayer);

    const theaterRect = { left: 0, top: 0, width: 1280, height: 720 };
    const slotRect = { left: 420, top: 560, width: 104, height: 136 };
    const energyCoreRect = { left: 40, top: 570, width: 180, height: 120 };
    const commanderCardRect = { left: 1080, top: 550, width: 140, height: 150 };

    // Overclock Core -> targets Energy Core + secondary battlefield anchor
    const ocOk = controller.playNonUnitCard({
      card: {
        cardId: 'card_support_overclock_core',
        category: 'support',
        name: 'Overclock Core',
        cost: 20,
        tier: 2,
      },
      slotIndex: 1,
      slotRect,
      theaterRect,
      targetScreenPos: { x: 460, y: 360 },
      energyCoreRect,
      commanderCardRect,
      reducedMotion: false,
    });
    assert.equal(ocOk, true);
    assert.equal(controller.getActiveCount(), 1);
    assert.equal(ghostLayer.children.length, 1);
    assert.equal(
      ghostLayer.children[0].style.getPropertyValue('--vfx-primary'),
      NON_UNIT_CARD_VFX_PROFILES.card_support_overclock_core.palette.primary,
    );

    // Starlight Catalyst -> targets Commander Ult card
    const scOk = controller.playNonUnitCard({
      card: {
        cardId: 'card_support_starlight_catalyst',
        category: 'support',
        name: 'Starlight Catalyst',
        cost: 28,
        tier: 3,
      },
      slotIndex: 4,
      slotRect,
      theaterRect,
      targetScreenPos: { x: 440, y: 340 },
      energyCoreRect,
      commanderCardRect,
      reducedMotion: false,
    });
    assert.equal(scOk, true);
    assert.equal(controller.getActiveCount(), 2);

    // Stress-test rapid repeated plays: must remain strictly bounded to <= 8
    for (let i = 0; i < 12; i += 1) {
      controller.playNonUnitCard({
        card: {
          cardId: i % 2 === 0 ? 'card_skill_orbital_lance' : 'card_skill_chain_lightning',
          category: 'skill',
          name: 'Stress Card',
          cost: 24,
          tier: (i % 3) + 1,
        },
        slotIndex: i % 6,
        slotRect,
        theaterRect,
        targetScreenPos: { x: 820, y: 310 },
        reducedMotion: false,
      });
    }
    assert.ok(controller.getActiveCount() <= 8, 'Active card-play VFX queue must stay strictly bounded (<= 8)');
    assert.ok(ghostLayer.children.length <= 8, 'Ghost DOM nodes must stay strictly bounded (<= 8)');

    // Render mid-flight frame cleanly
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    vfxCanvas.resetDrawCalls();
    controller._renderFrame(now + 280);
    assert.ok(vfxCanvas.getDrawCalls() > 0, 'Mid-flight card-play frame must draw ribbons, particles, and glints');

    // Reduced-motion play
    controller.stop();
    assert.equal(controller.getActiveCount(), 0, 'stop() must clear all active plays');
    assert.equal(ghostLayer.children.length, 0, 'stop() must remove all ghost DOM nodes');

    const rmOk = controller.playNonUnitCard({
      card: {
        cardId: 'card_skill_astral_nova',
        category: 'skill',
        name: 'Astral Nova',
        cost: 25,
        tier: 1,
      },
      slotIndex: 0,
      slotRect,
      theaterRect,
      targetScreenPos: { x: 780, y: 320 },
      reducedMotion: true,
    });
    assert.equal(rmOk, true);
    assert.equal(ghostLayer.children[0].classList.contains('is-reduced-motion'), true);
    controller._renderFrame(now + 120);

    // Final cleanup check
    controller.stop();
    assert.equal(controller.getActiveCount(), 0);
    assert.equal(ghostLayer.children.length, 0);
  } finally {
    globalThis.document = origDoc;
  }
});

test('styles/battle.css defines all Non-Unit card play VFX classes, reduced-motion overrides, balanced braces, and zero Unit card changes', () => {
  const css = fs.readFileSync(path.join(ROOT, 'styles', 'battle.css'), 'utf8');

  let depth = 0;
  for (const ch of css) {
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    assert.ok(depth >= 0, 'Unbalanced closing brace in styles/battle.css');
  }
  assert.equal(depth, 0, 'styles/battle.css must have balanced curly braces');

  const requiredSelectors = [
    '.card-play-ghost-layer',
    '.card-play-vfx-canvas',
    '.card-play-ghost',
    '.card-play-ghost__aura',
    '.card-play-ghost__sweep--a',
    '.card-play-ghost__sweep--b',
    '.card-play-ghost__rim',
    '@keyframes nonUnitGhostLift',
    '@keyframes nonUnitGhostSweepA',
    '@media (prefers-reduced-motion: reduce)',
  ];
  for (const sel of requiredSelectors) {
    assert.ok(css.includes(sel), `styles/battle.css must include ${sel}`);
  }

  const sectionStart = css.indexOf('Non-Unit Card Super Visual Overhaul');
  assert.ok(sectionStart > 0, 'Non-Unit VFX CSS section marker should exist');
  const sectionSlice = css.slice(sectionStart);
  assert.equal(
    sectionSlice.includes('.tactical-card--unit'),
    false,
    'Non-Unit VFX CSS section must never target .tactical-card--unit',
  );
});

test('NonUnitVfxGeometry guarantees exact mirror symmetry for arrows/chevrons and smooth non-degenerate analytical ribbons', () => {
  // 1. Precision Arrow mirror symmetry & aligned centerline
  const arrow = buildPrecisionArrowPolygon({
    shaftLength: 84,
    shaftHalfWidth: 4.2,
    tailHalfWidth: 1.2,
    headLength: 34,
    headHalfWidth: 18,
    barbBack: 10,
  });
  assert.equal(arrow.length, 8);
  assert.equal(arrow[0].y, 0, 'Arrow tip must lie exactly on y=0 axis');
  assert.equal(arrow[4].y, 0, 'Arrow tail point must lie exactly on y=0 axis');
  assert.ok(arrow[0].x > arrow[4].x, 'Arrow must point strictly forward along +X');
  // Mirror pairs: (1,7), (2,6), (3,5)
  for (const [topIdx, botIdx] of [[1, 7], [2, 6], [3, 5]]) {
    assert.equal(arrow[topIdx].x, arrow[botIdx].x, `Arrow vertex pair (${topIdx},${botIdx}) must share identical X`);
    assert.equal(arrow[topIdx].y, -arrow[botIdx].y, `Arrow vertex pair (${topIdx},${botIdx}) must be exact Y mirrors`);
  }

  // 2. Precision Chevron mirror symmetry & parallel wing edges
  const chevron = buildPrecisionChevronPolygon({ halfHeight: 40, depth: 20, thickness: 5 });
  assert.equal(chevron.length, 6);
  assert.equal(chevron[0].y, 0, 'Chevron outer apex must lie on y=0');
  assert.equal(chevron[3].y, 0, 'Chevron inner apex must lie on y=0');
  assert.equal(chevron[1].x, chevron[5].x, 'Chevron outer wing tips must share X');
  assert.equal(chevron[1].y, -chevron[5].y, 'Chevron outer wing tips must be exact Y mirrors');
  assert.equal(chevron[2].x, chevron[4].x, 'Chevron inner wing tips must share X');
  assert.equal(chevron[2].y, -chevron[4].y, 'Chevron inner wing tips must be exact Y mirrors');

  // 3. Smooth high-resolution analytical Bezier & logarithmic spiral ribbons (no kinks/NaNs)
  const bezGeom = buildAnalyticalRibbonGeometry(
    (u) => sampleCubicBezier({ x: 0, y: 100 }, { x: 80, y: 0 }, { x: 200, y: 0 }, { x: 280, y: 100 }, u),
    { steps: 40, maxWidth: 6, taperProfile: 'comet' },
  );
  assert.equal(bezGeom.center.length, 41);
  for (let i = 1; i < bezGeom.center.length - 1; i += 1) {
    const a = bezGeom.center[i - 1];
    const b = bezGeom.center[i];
    const c = bezGeom.center[i + 1];
    assert.ok(Number.isFinite(bezGeom.left[i].x) && Number.isFinite(bezGeom.right[i].y));
    const v1x = b.x - a.x;
    const v1y = b.y - a.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const cosAngle =
      (v1x * v2x + v1y * v2y) / (Math.max(1e-6, Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y)));
    assert.ok(cosAngle > 0.99, `Adjacent analytical Bezier segments must bend smoothly (cos=${cosAngle})`);
  }

  const spiralGeom = buildAnalyticalRibbonGeometry(
    (u) => sampleLogSpiral(200, 150, 90, 12, 0, Math.PI * 1.4, 0.5, u),
    { steps: 40, maxWidth: 4.5, taperProfile: 'comet' },
  );
  assert.equal(spiralGeom.left.length, 41);
  assert.ok(spiralGeom.left.every((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y)));
});

