import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { EventBus } from '../src/core/EventBus.js';
import { GameState } from '../src/core/GameState.js';
import { SaveManager } from '../src/core/SaveManager.js';
import { createMemoryStorage } from '../src/utils/StorageUtils.js';
import { buildDataRegistry } from '../src/utils/DataLoader.js';
import { HeroSystem } from '../src/systems/HeroSystem.js';
import { FormationSystem } from '../src/systems/FormationSystem.js';
import { CardSystem } from '../src/systems/CardSystem.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.js';
import { UnitManager } from '../src/battle/UnitManager.js';
import { TargetingSystem } from '../src/battle/TargetingSystem.js';
import { MovementSystem } from '../src/battle/MovementSystem.js';
import { CombatSystem } from '../src/battle/CombatSystem.js';
import { ProjectileSystem } from '../src/battle/ProjectileSystem.js';
import { SkillSystem } from '../src/battle/SkillSystem.js';
import { WaveManager } from '../src/battle/WaveManager.js';
import { BattleManager, BATTLE_PHASES } from '../src/battle/BattleManager.js';
import { AnimationManager } from '../src/rendering/AnimationManager.js';
import { ParticleSystem } from '../src/rendering/ParticleSystem.js';
import { BattleRenderer } from '../src/rendering/BattleRenderer.js';
import { renderHolographicCardEffects } from '../src/rendering/AstraGlitterEffects.js';
import { ASSETS_CONFIG } from '../src/rendering/AssetManager.js';
import { HomeScreen } from '../src/ui/HomeScreen.js';
import { BattleScreen } from '../src/ui/BattleScreen.js';

const ROOT = process.cwd();

async function loadRealRegistry() {
  const files = {
    heroes: 'data/heroes.json',
    units: 'data/units.json',
    enemies: 'data/enemies.json',
    bosses: 'data/bosses.json',
    cards: 'data/cards.json',
    skills: 'data/skills.json',
    stages: 'data/stages.json',
    banners: 'data/banners.json',
    terrain: 'data/terrain.json',
    balance: 'data/balance.json',
    missions: 'data/missions.json',
  };
  const payload = {};
  for (const [k, rel] of Object.entries(files)) {
    const raw = await fs.readFile(path.join(ROOT, rel), 'utf8');
    payload[k] = JSON.parse(raw);
  }
  return buildDataRegistry(payload);
}

function createSystems(dataRegistry) {
  const eventBus = new EventBus();
  const saveManager = new SaveManager({ storage: createMemoryStorage(), eventBus });
  const loadRes = saveManager.load();
  const gameState = new GameState(loadRes.data, eventBus);
  const economySystem = new EconomySystem({ gameState, saveManager, eventBus });
  const heroSystem = new HeroSystem({ dataRegistry, gameState, saveManager, eventBus });
  const formationSystem = new FormationSystem({
    dataRegistry,
    gameState,
    heroSystem,
    saveManager,
    eventBus,
  });
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

  return {
    eventBus,
    saveManager,
    gameState,
    economySystem,
    heroSystem,
    formationSystem,
    cardSystem,
    progressionSystem,
  };
}

function createMockElement(tagName = 'div', attrs = {}, ctxRecorder = null) {
  const listeners = new Map();
  const children = [];
  const el = {
    tagName: tagName.toUpperCase(),
    attrs: { ...attrs },
    className: attrs.class || '',
    id: attrs.id || '',
    textContent: '',
    hidden: 'hidden' in attrs,
    disabled: false,
    width: 126,
    height: 196,
    clientWidth: 126,
    clientHeight: 196,
    style: {
      _props: new Map(),
      setProperty(name, value) {
        this._props.set(name, String(value));
      },
      getPropertyValue(name) {
        return this._props.get(name) || '';
      },
      removeProperty(name) {
        this._props.delete(name);
      },
    },
    dataset: {},
    _innerHTML: '',
    children,
    parentNode: null,
    classList: {
      add(...names) {
        const set = new Set(el.className.split(/\s+/).filter(Boolean));
        for (const n of names) if (n) set.add(n);
        el.className = [...set].join(' ');
      },
      remove(...names) {
        const set = new Set(el.className.split(/\s+/).filter(Boolean));
        for (const n of names) set.delete(n);
        el.className = [...set].join(' ');
      },
      toggle(name, force) {
        const set = new Set(el.className.split(/\s+/).filter(Boolean));
        const shouldAdd = force === undefined ? !set.has(name) : Boolean(force);
        if (shouldAdd) set.add(name);
        else set.delete(name);
        el.className = [...set].join(' ');
        return shouldAdd;
      },
      contains(name) {
        return el.className.split(/\s+/).includes(name);
      },
    },
    set innerHTML(html) {
      this._innerHTML = String(html);
      this._parsed = parseHtmlElements(this._innerHTML, ctxRecorder);
    },
    get innerHTML() {
      return this._innerHTML;
    },
    getAttribute(name) {
      if (name === 'class') return this.className;
      if (name === 'id') return this.id;
      return this.attrs[name] ?? null;
    },
    setAttribute(name, val) {
      this.attrs[name] = String(val);
      if (name === 'class') this.className = String(val);
      if (name === 'id') this.id = String(val);
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    click() {
      for (const fn of listeners.get('click') || []) {
        fn({
          target: this,
          currentTarget: this,
          preventDefault() {},
          stopPropagation() {},
        });
      }
    },
    getContext(kind) {
      if (this.tagName !== 'CANVAS' || kind !== '2d') return null;
      return ctxRecorder || makeRecordingCtx();
    },
    getBoundingClientRect() {
      return { width: this.clientWidth, height: this.clientHeight, left: 0, top: 0 };
    },
    appendChild(child) {
      child.parentNode = this;
      children.push(child);
      return child;
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const pool = [...(this._parsed || []), ...collectDescendants(children)];
      const results = [];
      for (const node of pool) {
        if (matchesSelector(node, selector)) {
          results.push(node);
        }
        if (node._parsed?.length || node.children?.length) {
          for (const sub of node.querySelectorAll(selector)) {
            if (!results.includes(sub)) results.push(sub);
          }
        }
      }
      return results;
    },
  };
  return el;
}

function collectDescendants(list) {
  const out = [];
  for (const item of list || []) {
    out.push(item);
    if (item.children?.length) out.push(...collectDescendants(item.children));
  }
  return out;
}

function parseHtmlElements(html, ctxRecorder = null) {
  const nodes = [];
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
  let match;
  while ((match = tagRe.exec(html)) !== null) {
    const tag = match[1];
    const attrStr = match[2] || '';
    const attrs = {};
    const attrRe = /([a-zA-Z0-9_:-]+)(?:\s*=\s*"([^"]*)")?/g;
    let am;
    while ((am = attrRe.exec(attrStr)) !== null) {
      attrs[am[1]] = am[2] !== undefined ? am[2] : '';
    }
    nodes.push(createMockElement(tag, attrs, ctxRecorder));
  }
  return nodes;
}

function matchesSelector(el, selector) {
  if (selector.startsWith('#')) return el.id === selector.slice(1);
  if (selector.startsWith('.')) return el.className.split(/\s+/).includes(selector.slice(1));
  const attrMatch = selector.match(/^\[([a-zA-Z0-9_:-]+)(?:="([^"]*)")?\]$/);
  if (attrMatch) {
    const [, key, expected] = attrMatch;
    if (!(key in el.attrs)) return false;
    return expected === undefined ? true : el.attrs[key] === expected;
  }
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

function makeRecordingCtx() {
  const calls = {
    arcs: [],
    clears: 0,
    saves: 0,
    restores: 0,
    translates: [],
    fills: 0,
    fillRects: 0,
    strokes: 0,
    strokeRects: 0,
    gradients: 0,
  };
  const grad = { addColorStop() {} };
  return {
    calls,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    save() {
      calls.saves += 1;
    },
    restore() {
      calls.restores += 1;
    },
    setTransform() {},
    clearRect() {
      calls.clears += 1;
    },
    translate(x, y) {
      calls.translates.push({ x, y });
    },
    rotate() {},
    scale() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc(x, y, r) {
      calls.arcs.push({ x, y, r });
    },
    ellipse() {},
    roundRect() {},
    rect() {},
    clip() {},
    fill() {
      calls.fills += 1;
    },
    stroke() {
      calls.strokes += 1;
    },
    fillRect() {
      calls.fillRects += 1;
    },
    strokeRect() {
      calls.strokeRects += 1;
    },
    fillText() {},
    strokeText() {},
    drawImage() {},
    setLineDash() {},
    createLinearGradient() {
      calls.gradients += 1;
      return grad;
    },
    createRadialGradient() {
      calls.gradients += 1;
      return grad;
    },
  };
}

test('Issue 1: HomeScreen right-side preview uses Astra standalone character PNG while Commanders nav button keeps default design', async () => {
  const registry = await loadRealRegistry();
  const {
    eventBus,
    gameState,
    heroSystem,
    formationSystem,
    cardSystem,
    progressionSystem,
    economySystem,
  } = createSystems(registry);

  assert.equal(ASSETS_CONFIG.hero_portrait_astra.src, './astra-cardtemplate/assets-astra/character.png');
  assert.equal(ASSETS_CONFIG.hero_portrait_astra.format, 'png');
  const charStat = await fs.stat(path.join(ROOT, 'astra-cardtemplate/assets-astra/character.png'));
  assert.ok(charStat.isFile() && charStat.size > 0, 'Astra standalone character PNG must exist on disk');

  assert.equal(ASSETS_CONFIG.hero_portrait_astra_home.src, './assets/heroes/astra.svg');
  assert.equal(ASSETS_CONFIG.hero_portrait_astra_home.format, 'svg');

  const bound = [];
  const assets = {
    bindImageElement(img, assetId) {
      bound.push({ id: img.id || null, assetId });
      img.setAttribute('data-bound-asset', assetId);
    },
  };

  const screen = new HomeScreen({
    eventBus,
    gameState,
    dataRegistry: registry,
    heroSystem,
    formationSystem,
    cardSystem,
    progressionSystem,
    economySystem,
    missionSystem: { getClaimableCount: () => 0 },
    assetManager: assets,
    audioManager: { playClick() {} },
    screenManager: { navigate() {} },
    openGuide() {},
  });

  const container = createMockElement('div');
  screen.mount(container);

  const navArt = container.querySelector('#home-nav-art-commanders');
  const stageImg = container.querySelector('#home-commander-img');
  assert.ok(navArt && stageImg);
  assert.equal(
    navArt.getAttribute('data-bound-asset'),
    'hero_portrait_astra_home',
    'Home Commanders navigation button must preserve its existing default portrait design',
  );
  assert.equal(
    stageImg.getAttribute('data-bound-asset'),
    'hero_portrait_astra',
    'Home right-side Commander Preview must bind Astra standalone character PNG (hero_portrait_astra)',
  );
  assert.notEqual(
    stageImg.getAttribute('data-bound-asset'),
    'hero_portrait_astra_home',
    'Home right-side Commander Preview must not show the placeholder SVG',
  );
  assert.equal(container.querySelector('[data-astra-card-slot]'), null);

  for (const item of bound) {
    assert.notEqual(item.assetId, 'hero_bg_astra');
  }

  // Non-Astra commanders still use their own portraitAssetId on both slots
  heroSystem.grantHero('kael');
  formationSystem.setCommander('kael');
  assert.equal(
    container.querySelector('#home-nav-art-commanders').getAttribute('data-bound-asset'),
    'hero_portrait_kael',
  );
  assert.equal(
    container.querySelector('#home-commander-img').getAttribute('data-bound-asset'),
    'hero_portrait_kael',
  );

  // Stylesheet check: Home stage must not pull AstraCard bg.jpeg or frame.png
  const componentsCss = await fs.readFile(path.join(ROOT, 'styles/components.css'), 'utf8');
  assert.doesNotMatch(
    componentsCss,
    /\.home-commander-stage\.theme-astra[^}]*(bg\.jpeg|frame\.png|frame\.jpeg)/,
    'Home Commander stage CSS must not reference AstraCard frame or bg.jpeg',
  );

  screen.unmount();
});

test('Issue 2: Astra ultimate ready activates moving glitter particles, foil reflections, and flares, and restores normal on repeated cycles', async () => {
  const prevDocument = globalThis.document;
  const prevWindow = globalThis.window;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCancelRaf = globalThis.cancelAnimationFrame;

  const ctxRecorder = makeRecordingCtx();
  let rafSeq = 0;
  const scheduledRafs = new Map();

  globalThis.document = {
    createElement: (tag) => createMockElement(tag, {}, ctxRecorder),
  };
  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.requestAnimationFrame = (fn) => {
    rafSeq += 1;
    scheduledRafs.set(rafSeq, fn);
    return rafSeq;
  };
  globalThis.cancelAnimationFrame = (id) => {
    scheduledRafs.delete(id);
  };

  try {
    // 1. Verify renderHolographicCardEffects preserves full foil/flare intensity with moderated glitter density
    const c1 = makeRecordingCtx();
    renderHolographicCardEffects(c1, { width: 126, height: 196, elapsed: 0.2, isAstra: true });
    const c2 = makeRecordingCtx();
    renderHolographicCardEffects(c2, { width: 126, height: 196, elapsed: 1.4, isAstra: true });
    assert.ok(
      c1.calls.arcs.length >= 16 && c1.calls.arcs.length <= 49,
      `Expected moderated glitter + flare arc count (16..49), got ${c1.calls.arcs.length}`,
    );
    assert.ok(c1.calls.gradients >= 3, 'Expected iridescent + primary/secondary foil sweeps drawn');
    assert.ok(c1.calls.strokeRects >= 1, 'Expected specular border highlight drawn');
    assert.notDeepEqual(
      c1.calls.arcs.slice(0, 10),
      c2.calls.arcs.slice(0, 10),
      'Glitter particle positions must move across elapsed time',
    );

    // 2. Verify full BattleScreen ready-state transitions and repeated ready/use cycles
    const registry = await loadRealRegistry();
    const { eventBus, gameState, heroSystem, formationSystem, cardSystem, progressionSystem } =
      createSystems(registry);
    const skillSystem = new SkillSystem({
      gameState,
      heroSystem,
      eventBus,
      dataRegistry: registry,
    });

    const stage = progressionSystem.getSelectedStage();
    gameState.setBattle({
      stageId: stage.id,
      phase: BATTLE_PHASES.PREPARATION,
      status: 'preparation',
      ultimateEnergy: 0,
      ultimateMaxEnergy: 100,
      energy: 60,
      maxEnergy: 100,
      waveIndex: 1,
      totalWaves: 3,
      friendlyCount: 2,
      friendlyCap: 6,
      enemyCount: 0,
      enemyCap: 10,
      remainingDeckCount: 6,
      elapsedSec: 0,
      speedMultiplier: 1,
    });

    const screen = new BattleScreen({
      eventBus,
      gameState,
      dataRegistry: registry,
      heroSystem,
      formationSystem,
      cardSystem,
      progressionSystem,
      battleManager: {
        startSession() {},
        stopSession() {},
        getSelectedPrepUnitUid: () => null,
        getPrepUnitByUid: () => null,
        triggerUltimate: () => skillSystem.activateUltimate({}),
      },
      assetManager: { bindImageElement() {} },
      audioManager: { playClick() {}, playInvalid() {} },
      screenManager: { navigate() {} },
      notify() {},
    });

    const container = createMockElement('div', {}, ctxRecorder);
    screen.mount(container);

    const ultBtn = container.querySelector('#btn-trigger-ultimate');
    const fxCanvas = container.querySelector('#ult-fx-canvas');
    assert.ok(fxCanvas, 'Ultimate FX overlay must include #ult-fx-canvas');
    assert.equal(screen._ultFxController.active, false);

    // Cycle 1: Charge to 100 during active combat -> activates full FX
    gameState.setBattle({ phase: BATTLE_PHASES.ACTIVE_COMBAT, status: 'running', ultimateEnergy: 99 });
    assert.equal(screen._ultFxController.active, false);

    const arcsBeforeReady = ctxRecorder.calls.arcs.length;
    gameState.setBattle({ ultimateEnergy: 100 });
    assert.equal(ultBtn.getAttribute('data-ult-ready'), 'true');
    assert.equal(ultBtn.classList.contains('is-ult-ready'), true);
    assert.equal(screen._ultFxController.active, true);
    assert.ok(ctxRecorder.calls.arcs.length > arcsBeforeReady, 'Activating ready state must render glitter particles');

    // Step one RAF tick to confirm animation keeps advancing while ready
    const activeRafId = [...scheduledRafs.keys()][0];
    assert.ok(activeRafId, 'RAF loop must be scheduled while ultimate is ready');
    const rafCb = scheduledRafs.get(activeRafId);
    scheduledRafs.delete(activeRafId);
    rafCb(1200);
    assert.ok(screen._ultFxController.active);

    // Cast Ultimate -> resets energy to 0 -> FX stops and canvas clears immediately
    const clearsBeforeUse = ctxRecorder.calls.clears;
    const cast1 = skillSystem.activateUltimate({});
    assert.equal(cast1.ok, true);
    assert.equal(gameState.battle.ultimateEnergy, 0);
    assert.equal(ultBtn.getAttribute('data-ult-ready'), 'false');
    assert.equal(ultBtn.classList.contains('is-ult-ready'), false);
    assert.equal(screen._ultFxController.active, false);
    assert.ok(ctxRecorder.calls.clears > clearsBeforeUse, 'Using ultimate must clear FX canvas');
    assert.equal(scheduledRafs.size, 0, 'RAF loop must cancel when ultimate is no longer ready');

    // Cycle 2: Recharge to 100 again -> FX reactivates -> Battle ends -> FX shuts down cleanly
    gameState.setBattle({ ultimateEnergy: 100 });
    assert.equal(screen._ultFxController.active, true);
    assert.equal(ultBtn.classList.contains('is-ult-ready'), true);

    gameState.setBattle({ phase: BATTLE_PHASES.RESULTS, status: 'results' });
    assert.equal(screen._ultFxController.active, false);
    assert.equal(ultBtn.classList.contains('is-ult-ready'), false);

    screen.unmount();
    assert.equal(scheduledRafs.size, 0);
  } finally {
    globalThis.document = prevDocument;
    globalThis.window = prevWindow;
    globalThis.requestAnimationFrame = prevRaf;
    globalThis.cancelAnimationFrame = prevCancelRaf;
  }
});

test('Issue 3: Battle end (victory & defeat), stale RAF, restart, and exit clear screen shake and return camera to neutral', async () => {
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCancelRaf = globalThis.cancelAnimationFrame;

  let rafSeq = 0;
  const rafQueue = new Map();
  globalThis.requestAnimationFrame = (fn) => {
    rafSeq += 1;
    rafQueue.set(rafSeq, fn);
    return rafSeq;
  };
  globalThis.cancelAnimationFrame = (id) => {
    rafQueue.delete(id);
  };

  try {
    const registry = await loadRealRegistry();
    const { eventBus, gameState, heroSystem, cardSystem, progressionSystem, economySystem } =
      createSystems(registry);

    const unitManager = new UnitManager({ dataRegistry: registry, eventBus });
    const targetingSystem = new TargetingSystem({ balance: registry.balance });
    const movementSystem = new MovementSystem({ balance: registry.balance });
    const combatSystem = new CombatSystem({ eventBus, dataRegistry: registry });
    const projectileSystem = new ProjectileSystem({ eventBus });
    const skillSystem = new SkillSystem({ gameState, heroSystem, eventBus, dataRegistry: registry });
    const waveManager = new WaveManager({ eventBus, balance: registry.balance });
    const animationManager = new AnimationManager();
    const particleSystem = new ParticleSystem();

    const ctxRecorder = makeRecordingCtx();
    const mockCanvas = {
      width: 1280,
      height: 720,
      getBoundingClientRect: () => ({ width: 1280, height: 720 }),
      getContext: () => ctxRecorder,
    };
    const battleRenderer = new BattleRenderer({
      assetManager: { getImageElement: () => null },
      animationManager,
      particleSystem,
      gameState,
    });

    const battleManager = new BattleManager({
      dataRegistry: registry,
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

    // 1. Victory during active camera shake
    battleManager.startSession(mockCanvas, { stageId: 'stage_1_1' });
    battleManager.beginBattle();
    battleManager.stepSimulation(1.0); // enters ACTIVE_COMBAT & spawns wave 1
    assert.equal(battleManager.getPhase(), BATTLE_PHASES.ACTIVE_COMBAT);

    // Normal combat shake must still work during active combat
    animationManager.triggerScreenShake(11, 0.55);
    const activeOffset = animationManager.getShakeOffset();
    assert.ok(
      Math.abs(activeOffset.x) > 0 || Math.abs(activeOffset.y) > 0 || animationManager._shakeIntensity === 11,
      'Normal combat camera shake must remain active during combat',
    );

    // Complete victory while shake is still active
    battleManager._finalizeBattle(true);
    assert.equal(battleManager.getPhase(), BATTLE_PHASES.RESULTS);
    assert.deepEqual(animationManager.getShakeOffset(), { x: 0, y: 0 });

    // Run RAF loop tick after Victory -> canvas translate must be neutral {0, 0} and balanced save/restore
    ctxRecorder.calls.translates.length = 0;
    const postVictoryId = [...rafQueue.keys()][rafQueue.size - 1];
    const postVictoryRaf = rafQueue.get(postVictoryId);
    rafQueue.delete(postVictoryId);
    assert.ok(postVictoryRaf);
    postVictoryRaf(performance.now() + 16);
    assert.equal(ctxRecorder.calls.translates[0].x, 0);
    assert.equal(ctxRecorder.calls.translates[0].y, 0);
    assert.equal(ctxRecorder.calls.saves, ctxRecorder.calls.restores);

    // Late boss/unit defeat events after RESULTS must not re-enable shake
    eventBus.emit('battle:unitDefeated', { unit: { x: 50, y: 50, side: 'enemy', isBoss: true } });
    assert.deepEqual(animationManager.getShakeOffset(), { x: 0, y: 0 });

    // 2. Defeat during active camera shake
    battleManager.startSession(mockCanvas, { stageId: 'stage_1_1' });
    battleManager.beginBattle();
    battleManager.stepSimulation(1.0);
    animationManager.triggerScreenShake(9, 0.5);
    assert.equal(animationManager._shakeIntensity, 9);

    battleManager._finalizeBattle(false);
    assert.equal(battleManager.getPhase(), BATTLE_PHASES.RESULTS);
    assert.deepEqual(animationManager.getShakeOffset(), { x: 0, y: 0 });

    ctxRecorder.calls.translates.length = 0;
    const postDefeatId = [...rafQueue.keys()][rafQueue.size - 1];
    const postDefeatRaf = rafQueue.get(postDefeatId);
    rafQueue.delete(postDefeatId);
    postDefeatRaf(performance.now() + 32);
    assert.equal(ctxRecorder.calls.translates[0].x, 0);
    assert.equal(ctxRecorder.calls.translates[0].y, 0);

    // 3. Stale RAF callback & returning to Home/Heroes (stopSession)
    const staleId = [...rafQueue.keys()][rafQueue.size - 1];
    const staleCallback = rafQueue.get(staleId);
    rafQueue.delete(staleId);
    animationManager.triggerScreenShake(10, 1.0);
    battleManager.stopSession();
    assert.deepEqual(animationManager.getShakeOffset(), { x: 0, y: 0 });
    assert.equal(rafQueue.size, 0, 'stopSession must cancel pending RAF');

    const translatesBeforeStale = ctxRecorder.calls.translates.length;
    staleCallback(performance.now() + 48);
    assert.equal(
      ctxRecorder.calls.translates.length,
      translatesBeforeStale,
      'Stale RAF callback must not render after stopSession',
    );
    assert.equal(rafQueue.size, 0, 'Stale RAF callback must not reschedule');

    // 4. Restarting battle begins with neutral camera state
    battleManager.startSession(mockCanvas, { stageId: 'stage_1_1' });
    assert.deepEqual(animationManager.getShakeOffset(), { x: 0, y: 0 });
    assert.equal(battleManager.getPhase(), BATTLE_PHASES.PREPARATION);
    battleManager.stopSession();
  } finally {
    globalThis.requestAnimationFrame = prevRaf;
    globalThis.cancelAnimationFrame = prevCancelRaf;
  }
});

test('Issue 4: tactical card cooldown overlay hides cleanly after expiry and never clips 0.1s text at the bottom', async () => {
  const registry = await loadRealRegistry();
  const {
    eventBus,
    gameState,
    heroSystem,
    formationSystem,
    cardSystem,
    progressionSystem,
  } = createSystems(registry);

  const stage = registry.stages[0];
  cardSystem.initHand();
  gameState.setBattle({
    stageId: stage.id,
    phase: BATTLE_PHASES.ACTIVE_COMBAT,
    status: 'running',
    energy: 100,
    maxEnergy: 100,
    friendlyCount: 1,
    friendlyCap: 6,
    enemyCount: 1,
    enemyCap: 10,
    remainingDeckCount: 6,
    elapsedSec: 5,
    speedMultiplier: 1,
  });

  const screen = new BattleScreen({
    eventBus,
    gameState,
    dataRegistry: registry,
    heroSystem,
    formationSystem,
    cardSystem,
    progressionSystem,
    battleManager: {
      startSession() {},
      stopSession() {},
      getSelectedPrepUnitUid: () => null,
      getPrepUnitByUid: () => null,
      interactWithCardSlot: () => ({ ok: false, action: 'none' }),
    },
    assetManager: { bindImageElement() {} },
    audioManager: { playClick() {}, playInvalid() {} },
    screenManager: { navigate() {} },
    notify() {},
  });

  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  globalThis.document = {
    createElement(tag) {
      return createMockElement(tag);
    },
  };
  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
  };

  try {
    const container = createMockElement('div');
    screen.mount(container);

    const slot0 = cardSystem.getSlots()[0];
    assert.ok(slot0, 'Expected slot 0 to contain a tactical card');

    const cdWrap = screen._slotNodes[0].cdWrap;
    const cdText = screen._slotNodes[0].cdText;
    assert.equal(cdWrap.hidden, true);

    // Simulate near-end cooldown (0.08s -> displays "0.1s")
    cardSystem._cooldowns.set(slot0.cardId, 0.08);
    screen._renderCardSlots();

    assert.equal(cdWrap.hidden, false);
    assert.equal(cdWrap.style.height, undefined, 'Cooldown wrapper must not shrink style.height directly');
    assert.ok(cdWrap.style.getPropertyValue('--cd-pct').endsWith('%'));
    assert.equal(cdText.textContent, '0.1s');

    // Simulate cooldown expiry (<= 0.05s) -> wrapper must hide and clear stale state
    cardSystem._cooldowns.delete(slot0.cardId);
    screen._renderCardSlots();

    assert.equal(cdWrap.hidden, true);
    assert.equal(cdWrap.style.getPropertyValue('--cd-pct'), '');
    assert.equal(cdText.textContent, '');

    // Verify empty slot also keeps cooldown wrapper hidden and clean
    cardSystem._slots[0] = null;
    screen._renderCardSlots();
    assert.equal(cdWrap.hidden, true);
    assert.equal(cdText.textContent, '');

    screen.unmount();

    const battleCss = await fs.readFile(path.join(ROOT, 'styles/battle.css'), 'utf8');
    assert.match(
      battleCss,
      /\.tactical-card__cooldown\[hidden\]\s*\{[^}]*display:\s*none;/s,
      'battle.css must hide .tactical-card__cooldown[hidden] so display:flex does not override [hidden]',
    );
    assert.match(
      battleCss,
      /\.tactical-card__cooldown\s*\{[^}]*inset:\s*0;[^}]*overflow:\s*hidden;/s,
      'battle.css must keep .tactical-card__cooldown full-bleed inside the card',
    );
    assert.match(
      battleCss,
      /\.tactical-card__cooldown::before\s*\{[^}]*bottom:\s*0;[^}]*height:\s*var\(--cd-pct,\s*0%\);/s,
      'battle.css must animate the sweeping veil via ::before using --cd-pct',
    );
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
});

test('BattleScreen upper HUD displays only stage in top-left pill and only Start Battle button in prep bar', async () => {
  const registry = await loadRealRegistry();
  const {
    eventBus,
    gameState,
    heroSystem,
    formationSystem,
    cardSystem,
    progressionSystem,
  } = createSystems(registry);

  const stage = registry.stages[0];
  cardSystem.initHand();
  gameState.setBattle({
    stageId: stage.id,
    phase: BATTLE_PHASES.PREPARATION,
    status: 'preparation',
    energy: 60,
    maxEnergy: 100,
    waveIndex: 1,
    totalWaves: stage.waves?.length || 3,
    friendlyCount: 2,
    friendlyCap: 6,
    enemyCount: 0,
    enemyCap: 10,
    remainingDeckCount: 6,
    elapsedSec: 0,
    speedMultiplier: 1,
  });

  let beginCalled = 0;
  const screen = new BattleScreen({
    eventBus,
    gameState,
    dataRegistry: registry,
    heroSystem,
    formationSystem,
    cardSystem,
    progressionSystem,
    battleManager: {
      startSession() {},
      stopSession() {},
      beginBattle() {
        beginCalled += 1;
        gameState.setBattle({ phase: BATTLE_PHASES.BATTLE_START, status: 'running' });
      },
      getSelectedPrepUnit: () => null,
      getSelectedPrepUnitUid: () => null,
      interactWithCardSlot: () => ({ ok: false, action: 'none' }),
    },
    assetManager: { bindImageElement() {} },
    audioManager: { playClick() {}, playInvalid() {} },
    screenManager: { navigate() {} },
    notify() {},
  });

  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  globalThis.document = {
    createElement(tag) {
      return createMockElement(tag);
    },
  };
  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
  };

  try {
    const container = createMockElement('div');
    screen.mount(container);

    // Top-left stage pill contains only #hud-stage-name
    assert.ok(container.querySelector('.hud-pill-group--left'));
    assert.ok(container.querySelector('#hud-stage-name'));
    assert.equal(container.querySelector('.hud-realm-name'), null);
    assert.equal(container.querySelector('.hud-wave-meta'), null);
    assert.equal(container.querySelector('#hud-wave-indicator'), null);
    assert.equal(container.querySelector('#hud-wave-label'), null);
    assert.equal(container.querySelector('#hud-tactic-wrap'), null);
    assert.equal(container.querySelector('#hud-tactic-label'), null);

    const leftGroupMatch = container.innerHTML.match(
      /<div class="hud-pill-group hud-pill-group--left">([\s\S]*?)<\/div>/,
    );
    assert.ok(leftGroupMatch, 'Expected .hud-pill-group--left markup');
    assert.match(
      leftGroupMatch[1].trim(),
      /^<span id="hud-stage-name" class="hud-stage-name">Stage 1-1 · Outer Bastion<\/span>$/,
      'Top-left HUD pill must render only #hud-stage-name',
    );

    // Preparation bar contains only #btn-start-battle
    const prepBar = container.querySelector('#prep-bar');
    const startBtn = container.querySelector('#btn-start-battle');
    assert.ok(prepBar);
    assert.ok(startBtn);
    assert.equal(prepBar.hidden, false);
    assert.equal(container.querySelector('.prep-floating-bar__info'), null);
    assert.equal(container.querySelector('#prep-passive-label'), null);
    assert.equal(container.querySelector('#prep-hint'), null);
    assert.equal(container.querySelector('#prep-commander-switcher'), null);
    assert.equal(container.querySelector('#btn-prep-swap-class'), null);
    assert.equal(container.querySelector('[data-prep-commander]'), null);

    const prepBarMatch = container.innerHTML.match(
      /<div id="prep-bar" class="prep-floating-bar">([\s\S]*?)<\/div>/,
    );
    assert.ok(prepBarMatch, 'Expected #prep-bar markup');
    assert.match(
      prepBarMatch[1].trim(),
      /^<button type="button" id="btn-start-battle" class="btn btn-primary btn-sm">\s*Start Battle\s*<\/button>$/,
      '#prep-bar must contain only #btn-start-battle',
    );

    // Clicking Start Battle starts combat and hides #prep-bar
    startBtn.click();
    assert.equal(beginCalled, 1);
    assert.equal(prepBar.hidden, true);

    screen.unmount();
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
});
