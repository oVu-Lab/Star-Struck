import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildDataRegistry } from '../src/utils/DataLoader.js';
import { EventBus } from '../src/core/EventBus.js';
import { GameState } from '../src/core/GameState.js';
import { SaveManager, DEFAULT_SAVE_KEY } from '../src/core/SaveManager.js';
import { ScreenManager } from '../src/core/ScreenManager.js';
import { createMemoryStorage } from '../src/utils/StorageUtils.js';
import { HeroSystem } from '../src/systems/HeroSystem.js';
import { FormationSystem } from '../src/systems/FormationSystem.js';
import { CardSystem } from '../src/systems/CardSystem.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.js';
import { MissionSystem } from '../src/systems/MissionSystem.js';
import { TutorialManager } from '../src/systems/TutorialManager.js';
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
import { BattleScreen } from '../src/ui/BattleScreen.js';
import { MissionsScreen } from '../src/ui/MissionsScreen.js';
import { FormationScreen } from '../src/ui/FormationScreen.js';

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
    missions: read('missions.json'),
  });
}

function makeMockCanvasCtx() {
  const grad = { addColorStop() {} };
  return {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    save() {},
    restore() {},
    setTransform() {},
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    ellipse() {},
    roundRect() {},
    rect() {},
    clip() {},
    fill() {},
    stroke() {},
    drawImage() {},
    fillText() {},
    strokeText() {},
    translate() {},
    rotate() {},
    scale() {},
    setLineDash() {},
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
  };
}

function parseHtmlElements(html) {
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
    const el = createMockElement(tag, attrs);
    const closeToken = `</${tag}>`;
    const closeIdx = html.indexOf(closeToken, tagRe.lastIndex);
    if (closeIdx >= 0) {
      const inner = html.slice(tagRe.lastIndex, closeIdx);
      el._innerHTML = inner;
      el._parsed = parseHtmlElements(inner);
      el.textContent = inner.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    nodes.push(el);
  }
  return nodes;
}

function collectNodeTree(root) {
  const out = [];
  const visit = (list) => {
    for (const item of list || []) {
      out.push(item);
      if (item._parsed?.length) visit(item._parsed);
      if (item.children?.length) visit(item.children);
    }
  };
  if (root._parsed?.length) visit(root._parsed);
  if (root.children?.length) visit(root.children);
  return out;
}

function matchesSingleSelector(el, selector) {
  const leaf = selector.trim().split(/\s+/).pop();
  const idMatch = leaf.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch && el.id !== idMatch[1]) return false;

  const classMatches = [...leaf.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
  const nodeClasses = (el.className || '').split(/\s+/).filter(Boolean);
  for (const cls of classMatches) {
    if (!nodeClasses.includes(cls)) return false;
  }

  const attrMatches = [...leaf.matchAll(/\[([a-zA-Z0-9_:-]+)(?:="([^"]*)")?\]/g)];
  for (const am of attrMatches) {
    const [, key, expected] = am;
    if (!(key in el.attrs)) return false;
    if (expected !== undefined && el.attrs[key] !== expected) return false;
  }

  const tagMatch = leaf.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
  if (tagMatch && el.tagName.toLowerCase() !== tagMatch[1].toLowerCase()) return false;

  return true;
}

function createMockElement(tagName = 'div', attrs = {}) {
  const listeners = new Map();
  const children = [];
  const el = {
    tagName: tagName.toUpperCase(),
    attrs: { ...attrs },
    className: attrs.class || '',
    id: attrs.id || '',
    title: attrs.title || '',
    textContent: '',
    hidden: 'hidden' in attrs,
    disabled: 'disabled' in attrs,
    value: attrs.value ?? '',
    scrollTop: 0,
    width: 1280,
    height: 720,
    clientWidth: 1280,
    clientHeight: 720,
    offsetWidth: 120,
    offsetHeight: 200,
    style: {
      _props: new Map(),
      cssText: '',
      setProperty(k, v) {
        this._props.set(k, String(v));
      },
      getPropertyValue(k) {
        return this._props.get(k) || '';
      },
      removeProperty(k) {
        this._props.delete(k);
      },
    },
    dataset: new Proxy(
      {
        ...Object.fromEntries(
          Object.entries(attrs)
            .filter(([k]) => k.startsWith('data-'))
            .map(([k, v]) => [
              k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase()),
              v,
            ]),
        ),
      },
      {
        set(target, prop, value) {
          target[prop] = String(value);
          const kebab = String(prop).replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`);
          el.attrs[`data-${kebab}`] = String(value);
          return true;
        },
      },
    ),
    _innerHTML: '',
    _parsed: [],
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
      this._parsed = parseHtmlElements(this._innerHTML);
      if (this._innerHTML === '') {
        this.children.length = 0;
      }
    },
    get innerHTML() {
      return this._innerHTML;
    },
    getAttribute(name) {
      if (name === 'class') return this.className;
      if (name === 'id') return this.id;
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
    setAttribute(name, val) {
      this.attrs[name] = String(val);
      if (name === 'class') this.className = String(val);
      if (name === 'id') this.id = String(val);
      if (name === 'disabled') this.disabled = true;
      if (name.startsWith('data-')) {
        const camel = name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        this.dataset[camel] = String(val);
      }
    },
    removeAttribute(name) {
      delete this.attrs[name];
      if (name === 'disabled') this.disabled = false;
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name);
    },
    scrollIntoView() {},
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = listeners.get(type);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
    click({ bypassDisabled = false } = {}) {
      if (this.disabled && !bypassDisabled) return;
      for (const fn of [...(listeners.get('click') || [])]) {
        fn({
          target: this,
          currentTarget: this,
          clientX: 200,
          clientY: 360,
          preventDefault() {},
          stopPropagation() {},
        });
      }
    },
    getContext(kind) {
      if (this.tagName !== 'CANVAS' || kind !== '2d') return null;
      return makeMockCanvasCtx();
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 };
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
      const parts = selector
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const pool = collectNodeTree(this);
      const out = [];
      for (const node of pool) {
        if (parts.some((p) => matchesSingleSelector(node, p))) {
          if (!out.includes(node)) out.push(node);
        }
      }
      return out;
    },
  };
  return el;
}

function withMockDom(fn) {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCancelRaf = globalThis.cancelAnimationFrame;

  const modalRoot = createMockElement('div', { id: 'modal-root', hidden: '' });
  const viewportEl = createMockElement('main', { id: 'screen-viewport' });
  const navRootEl = createMockElement('nav', { id: 'primary-nav' });
  const appEl = createMockElement('div', { id: 'app' });

  const docListeners = new Map();
  const winListeners = new Map();

  globalThis.document = {
    createElement(tag) {
      return createMockElement(tag);
    },
    getElementById(id) {
      if (id === 'modal-root') return modalRoot;
      if (id === 'screen-viewport') return viewportEl;
      if (id === 'primary-nav') return navRootEl;
      if (id === 'app') return appEl;
      return viewportEl.querySelector(`#${id}`) || modalRoot.querySelector(`#${id}`) || null;
    },
    addEventListener(type, handler) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const arr = docListeners.get(type);
      if (!arr) return;
      const i = arr.indexOf(handler);
      if (i >= 0) arr.splice(i, 1);
    },
  };

  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener(type, handler) {
      if (!winListeners.has(type)) winListeners.set(type, []);
      winListeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const arr = winListeners.get(type);
      if (!arr) return;
      const i = arr.indexOf(handler);
      if (i >= 0) arr.splice(i, 1);
    },
  };

  let rafSeq = 0;
  globalThis.requestAnimationFrame = () => {
    rafSeq += 1;
    return rafSeq;
  };
  globalThis.cancelAnimationFrame = () => {};

  try {
    return fn({ modalRoot, viewportEl, navRootEl });
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
    globalThis.requestAnimationFrame = prevRaf;
    globalThis.cancelAnimationFrame = prevCancelRaf;
  }
}

function createHarness({ storage = null, markTutorialCompleted = true } = {}) {
  const dataRegistry = loadRegistry();
  const memStorage = storage || createMemoryStorage();
  const eventBus = new EventBus();
  const saveManager = new SaveManager({ storage: memStorage, eventBus });
  const gameState = new GameState(saveManager.load().data, eventBus);
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
    formationSystem,
    cardSystem,
    saveManager,
    eventBus,
  });
  const missionSystem = new MissionSystem({
    dataRegistry,
    gameState,
    economySystem,
    progressionSystem,
    saveManager,
    eventBus,
  });

  const unitManager = new UnitManager({ dataRegistry, eventBus });
  const targetingSystem = new TargetingSystem({ balance: dataRegistry.balance });
  const movementSystem = new MovementSystem({ balance: dataRegistry.balance });
  const combatSystem = new CombatSystem({ eventBus, dataRegistry });
  const projectileSystem = new ProjectileSystem({ eventBus });
  const skillSystem = new SkillSystem({ gameState, heroSystem, eventBus, dataRegistry });
  const waveManager = new WaveManager({ eventBus, balance: dataRegistry.balance });
  const animationManager = new AnimationManager();
  const particleSystem = new ParticleSystem();
  const battleRenderer = new BattleRenderer({
    assetManager: { getImageElement: () => null },
    animationManager,
    particleSystem,
    gameState,
  });
  const audioManager = new Proxy(
    {},
    {
      get() {
        return () => {};
      },
    },
  );

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
    audioManager,
  });

  const notifications = [];
  const confirmRequests = [];

  const tutorialManager = new TutorialManager({
    gameState,
    saveManager,
    eventBus,
    battleManager,
    cardSystem,
    heroSystem,
    unitManager,
    dataRegistry,
    audioManager,
    notify: (message, level = 'info') => notifications.push({ message, level }),
  });

  if (markTutorialCompleted) {
    tutorialManager.markCompleted();
  }

  return {
    dataRegistry,
    storage: memStorage,
    eventBus,
    saveManager,
    gameState,
    economySystem,
    heroSystem,
    formationSystem,
    cardSystem,
    progressionSystem,
    missionSystem,
    waveManager,
    battleManager,
    tutorialManager,
    audioManager,
    notifications,
    confirmRequests,
  };
}

function registerScreens(h, viewportEl, navRootEl) {
  const screenManager = new ScreenManager({ viewportEl, navRootEl, eventBus: h.eventBus });
  const ctx = {
    eventBus: h.eventBus,
    gameState: h.gameState,
    saveManager: h.saveManager,
    screenManager,
    assetManager: {
      bindImageElement() {},
      getImageElement: () => null,
    },
    audioManager: h.audioManager,
    dataRegistry: h.dataRegistry,
    heroSystem: h.heroSystem,
    formationSystem: h.formationSystem,
    cardSystem: h.cardSystem,
    economySystem: h.economySystem,
    progressionSystem: h.progressionSystem,
    missionSystem: h.missionSystem,
    battleManager: h.battleManager,
    tutorialManager: h.tutorialManager,
    notify: (message, level = 'info') => h.notifications.push({ message, level }),
    confirmDialog: (opts) => h.confirmRequests.push(opts),
    openGuide: () => {},
  };

  screenManager.register('missions', new MissionsScreen(ctx));
  screenManager.register('battle', new BattleScreen(ctx));
  screenManager.register('formation', new FormationScreen(ctx));
  return { screenManager, ctx };
}

function getStageButtonText(viewportEl) {
  const stageBtn = viewportEl.querySelector('#hud-stage-name');
  if (!stageBtn) return '';
  return stageBtn.querySelector('.hud-stage-name__text')?.textContent || stageBtn.textContent || '';
}

test('Scenario 1: Fresh save with only Stage 1-1 unlocked defaults Battle to Stage 1-1 and loads its encounter config', () => {
  withMockDom(({ viewportEl, navRootEl }) => {
    const h = createHarness();
    h.gameState.mutatePersistent('progression', (draft) => {
      draft.progression.unlockedStages = ['stage_1_1'];
      draft.progression.clearedStages = [];
      draft.progression.selectedStageId = 'stage_1_1';
      draft.progression.stageRatings = {};
    });
    h.saveManager.save(h.gameState.toSerializableSave());

    const { screenManager } = registerScreens(h, viewportEl, navRootEl);
    screenManager.navigate('battle');

    const expectedStage = h.dataRegistry.stagesById.get('stage_1_1');
    assert.equal(h.battleManager._activeStage.id, 'stage_1_1');
    assert.equal(h.gameState.battle.stageId, 'stage_1_1');
    assert.equal(h.gameState.battle.totalWaves, expectedStage.waves.length);
    assert.deepEqual(
      h.waveManager._waves.map((w) => w.entries),
      expectedStage.waves.map((w) => w.entries),
    );
    assert.equal(getStageButtonText(viewportEl), `Stage ${expectedStage.code} · ${expectedStage.name}`);

    screenManager.navigate('missions', { category: 'main' });
  });
});

test('Scenarios 2 & 3: Player with multiple unlocked stages enters highest unlocked stage automatically (never resets to 1-1)', () => {
  withMockDom(({ viewportEl, navRootEl }) => {
    const h = createHarness();
    // Case A: Default save starts with 1-1, 1-2, 1-3 unlocked while selectedStageId is 'stage_1_1'
    assert.equal(h.gameState.progression.selectedStageId, 'stage_1_1');
    const { screenManager } = registerScreens(h, viewportEl, navRootEl);
    screenManager.navigate('battle');

    const stage13 = h.dataRegistry.stagesById.get('stage_1_3');
    assert.equal(h.progressionSystem.getHighestUnlockedStage().id, 'stage_1_3');
    assert.equal(h.battleManager._activeStage.id, 'stage_1_3');
    assert.equal(h.gameState.battle.stageId, 'stage_1_3');
    assert.equal(h.gameState.battle.totalWaves, stage13.waves.length);
    assert.equal(getStageButtonText(viewportEl), `Stage ${stage13.code} · ${stage13.name}`);

    // Case B: Progressed player up to Stage 2-2 (even if save still had selectedStageId = 'stage_1_1')
    screenManager.navigate('formation');
    h.gameState.mutatePersistent('progression', (draft) => {
      draft.progression.unlockedStages = [
        'stage_1_1',
        'stage_1_2',
        'stage_1_3',
        'stage_1_4',
        'stage_2_1',
        'stage_2_2',
      ];
      draft.progression.clearedStages = ['stage_1_1', 'stage_1_2', 'stage_1_3', 'stage_1_4', 'stage_2_1'];
      draft.progression.selectedStageId = 'stage_1_1';
    });
    h.gameState.setUI({ battleStageExplicitlySelected: false, missionsPickedStageId: null });
    h.saveManager.save(h.gameState.toSerializableSave());

    // Formation preview matches highest unlocked stage before entering Battle
    screenManager.navigate('formation');
    assert.ok(viewportEl.innerHTML.includes('Stage 2-2'));

    screenManager.navigate('battle');
    const stage22 = h.dataRegistry.stagesById.get('stage_2_2');
    assert.equal(h.battleManager._activeStage.id, 'stage_2_2');
    assert.equal(h.gameState.battle.stageId, 'stage_2_2');
    assert.equal(h.gameState.battle.totalWaves, stage22.waves.length);
    assert.equal(h.waveManager._waves.length, stage22.waves.length);
    assert.equal(getStageButtonText(viewportEl), `Stage ${stage22.code} · ${stage22.name}`);

    // Clearing stage_2_2 unlocks stage_2_3 and clears stale explicit flag so next Battle advances to 2-3
    h.progressionSystem.selectStage('stage_1_2', { explicit: true });
    assert.equal(h.gameState.ui.battleStageExplicitlySelected, true);
    h.progressionSystem.recordBattleOutcome({
      victory: true,
      stageId: 'stage_2_2',
      sessionId: 'test_unlock_2_3',
      rating: 'S',
      stats: { enemiesDefeated: 12, durationSec: 45 },
    });
    assert.ok(h.progressionSystem.isStageUnlocked('stage_2_3'));
    assert.equal(h.gameState.ui.battleStageExplicitlySelected, false);

    screenManager.navigate('battle');
    const stage23 = h.dataRegistry.stagesById.get('stage_2_3');
    assert.equal(h.battleManager._activeStage.id, 'stage_2_3');
    assert.equal(getStageButtonText(viewportEl), `Stage ${stage23.code} · ${stage23.name}`);

    screenManager.navigate('missions', { category: 'main' });
  });
});

test('Scenario 4: Clickable Battle Stage indicator navigates to Main Missions stage selection and guards active combat / tutorial', () => {
  withMockDom(({ viewportEl, navRootEl }) => {
    // 4A. Tutorial disables and ignores Stage indicator click
    const tutHarness = createHarness({ markTutorialCompleted: false });
    const tutReg = registerScreens(tutHarness, viewportEl, navRootEl);
    tutReg.screenManager.navigate('battle');
    const tutStageBtn = viewportEl.querySelector('#hud-stage-name');
    assert.ok(tutStageBtn);
    assert.equal(tutStageBtn.disabled, true);
    assert.equal(tutStageBtn.classList.contains('is-tutorial'), true);
    tutStageBtn.click({ bypassDisabled: true });
    assert.equal(tutReg.screenManager.getActiveScreenId(), 'battle');
    tutReg.screenManager.navigate('missions', { category: 'main' });

    // 4B. Normal Preparation Battle renders clickable Stage indicator with cue arrow and opens Main Missions directly
    const h = createHarness();
    const { screenManager } = registerScreens(h, viewportEl, navRootEl);
    screenManager.navigate('battle');

    const stageBtn = viewportEl.querySelector('#hud-stage-name');
    assert.ok(stageBtn);
    assert.equal(stageBtn.tagName, 'BUTTON');
    assert.equal(stageBtn.disabled, false);
    assert.equal(stageBtn.classList.contains('hud-stage-name--clickable'), true);
    assert.ok(stageBtn.querySelector('.hud-stage-name__arrow'));
    assert.equal(getStageButtonText(viewportEl), 'Stage 1-3 · Obsidian Spire');

    stageBtn.click();

    assert.equal(screenManager.getActiveScreenId(), 'missions');
    assert.equal(h.gameState.ui.missionsCategory, 'main');
    assert.equal(h.gameState.ui.missionsSelectedStageId, 'stage_1_3');
    assert.ok(viewportEl.querySelector('.chapter-stages-grid'));
    assert.ok(viewportEl.querySelector('.mission-stage-card[data-stage-id="stage_1_3"]'));

    // 4C. Active combat pauses and asks confirmation before leaving to Main Missions
    screenManager.navigate('battle');
    h.battleManager.beginBattle();
    assert.equal(h.battleManager.getPhase(), BATTLE_PHASES.BATTLE_START);

    viewportEl.querySelector('#hud-stage-name').click();
    assert.equal(screenManager.getActiveScreenId(), 'battle');
    assert.equal(h.gameState.battle.status, 'paused');
    assert.equal(h.confirmRequests.length, 1);

    h.confirmRequests[0].onConfirm();
    assert.equal(screenManager.getActiveScreenId(), 'missions');
    assert.equal(h.gameState.ui.missionsCategory, 'main');
  });
});

test('Scenarios 5 & 6: Selecting a different unlocked stage in Main Missions persists on return to Battle and syncs UI + BattleManager', () => {
  withMockDom(({ viewportEl, navRootEl }) => {
    const h = createHarness();
    const { screenManager } = registerScreens(h, viewportEl, navRootEl);

    // Enter Battle (defaults to 1-3), click Stage indicator -> Main Missions
    screenManager.navigate('battle');
    assert.equal(h.battleManager._activeStage.id, 'stage_1_3');
    viewportEl.querySelector('#hud-stage-name').click();
    assert.equal(screenManager.getActiveScreenId(), 'missions');
    assert.equal(h.gameState.ui.missionsCategory, 'main');

    // Select Stage 1-2 card and launch via Start Battle CTA
    const card12 = viewportEl.querySelector('.mission-stage-card[data-stage-id="stage_1_2"]');
    assert.ok(card12);
    card12.click();
    assert.equal(h.gameState.ui.missionsSelectedStageId, 'stage_1_2');
    assert.equal(h.gameState.ui.missionsPickedStageId, 'stage_1_2');

    const startBtn = viewportEl.querySelector('[data-action="start-battle"]');
    assert.ok(startBtn);
    assert.equal(startBtn.disabled, false);
    assert.match(startBtn.textContent, /1-2/);
    startBtn.click();

    const stage12 = h.dataRegistry.stagesById.get('stage_1_2');
    assert.equal(screenManager.getActiveScreenId(), 'battle');
    assert.equal(h.battleManager._activeStage.id, 'stage_1_2');
    assert.equal(h.gameState.battle.stageId, 'stage_1_2');
    assert.equal(h.gameState.battle.totalWaves, stage12.waves.length);
    assert.deepEqual(
      h.waveManager._waves.map((w) => w.entries),
      stage12.waves.map((w) => w.entries),
    );
    assert.equal(getStageButtonText(viewportEl), `Stage ${stage12.code} · ${stage12.name}`);

    // Now click Stage indicator again, pick Stage 1-1 card, and return to Battle via direct screen navigation (bottom nav style)
    viewportEl.querySelector('#hud-stage-name').click();
    viewportEl.querySelector('.mission-stage-card[data-stage-id="stage_1_1"]').click();
    assert.equal(h.gameState.ui.missionsPickedStageId, 'stage_1_1');

    screenManager.navigate('battle');
    const stage11 = h.dataRegistry.stagesById.get('stage_1_1');
    assert.equal(h.battleManager._activeStage.id, 'stage_1_1');
    assert.equal(h.gameState.battle.stageId, 'stage_1_1');
    assert.equal(getStageButtonText(viewportEl), `Stage ${stage11.code} · ${stage11.name}`);

    // Re-entering Battle from Formation preserves the explicit unlocked stage_1_1 selection in-session
    screenManager.navigate('formation');
    assert.ok(viewportEl.innerHTML.includes('Stage 1-1'));
    screenManager.navigate('battle');
    assert.equal(h.battleManager._activeStage.id, 'stage_1_1');
    assert.equal(getStageButtonText(viewportEl), `Stage ${stage11.code} · ${stage11.name}`);

    screenManager.navigate('missions', { category: 'main' });
  });
});

test('Scenario 7: Locked stages can be inspected in Main Missions but cannot be selected or started in Battle', () => {
  withMockDom(({ viewportEl, navRootEl }) => {
    const h = createHarness();
    const { screenManager } = registerScreens(h, viewportEl, navRootEl);

    screenManager.navigate('battle');
    viewportEl.querySelector('#hud-stage-name').click();

    // Pick an unlocked stage first, then click locked stage_1_4
    viewportEl.querySelector('.mission-stage-card[data-stage-id="stage_1_2"]').click();
    assert.equal(h.gameState.ui.missionsPickedStageId, 'stage_1_2');

    const lockedCard14 = viewportEl.querySelector('.mission-stage-card[data-stage-id="stage_1_4"]');
    assert.ok(lockedCard14);
    assert.equal(lockedCard14.classList.contains('is-locked'), true);
    lockedCard14.click();

    // Inspecting a locked stage clears transient pick and disables Start Battle CTA
    assert.equal(h.gameState.ui.missionsSelectedStageId, 'stage_1_4');
    assert.equal(h.gameState.ui.missionsPickedStageId, null);

    const lockedCta = viewportEl.querySelector('[data-action="start-battle"]');
    assert.ok(lockedCta);
    assert.equal(lockedCta.disabled, true);
    assert.equal(lockedCta.textContent, 'Stage Locked');

    // Even forcing a click cannot start locked stage
    lockedCta.click({ bypassDisabled: true });
    assert.equal(screenManager.getActiveScreenId(), 'missions');

    // ProgressionSystem & BattleManager & resolveBattleEntryStage reject locked stage IDs
    const selectLocked = h.progressionSystem.selectStage('stage_2_1');
    assert.equal(selectLocked.ok, false);

    const resolved = h.progressionSystem.resolveBattleEntryStage({
      requestedStageId: 'stage_2_1',
    });
    assert.equal(resolved.id, 'stage_1_3');

    screenManager.navigate('battle', { stageId: 'stage_2_1', preserveSelectedStage: true });
    assert.equal(h.battleManager._activeStage.id, 'stage_1_3');
    assert.equal(h.gameState.battle.stageId, 'stage_1_3');
    assert.equal(getStageButtonText(viewportEl), 'Stage 1-3 · Obsidian Spire');

    const directStart = h.battleManager.startSession(viewportEl.querySelector('#battle-canvas'), {
      stageId: 'stage_3_4',
      enforceUnlock: true,
    });
    assert.equal(directStart.stage.id, 'stage_1_3');
    assert.equal(h.battleManager._activeStage.id, 'stage_1_3');

    screenManager.navigate('missions', { category: 'main' });
  });
});

test('Scenario 8: Refresh and reload preserve unlocked progression, default to highest unlocked stage, and override locked save tampering', () => {
  withMockDom(({ viewportEl, navRootEl }) => {
    const sharedStorage = createMemoryStorage();

    // Session 1: Progress up to Stage 2-1, select Stage 1-2 explicitly, then save
    const h1 = createHarness({ storage: sharedStorage });
    h1.gameState.mutatePersistent('progression', (draft) => {
      draft.progression.unlockedStages = ['stage_1_1', 'stage_1_2', 'stage_1_3', 'stage_1_4', 'stage_2_1'];
      draft.progression.clearedStages = ['stage_1_1', 'stage_1_2', 'stage_1_3', 'stage_1_4'];
    });
    h1.progressionSystem.selectStage('stage_1_2', { explicit: true });
    h1.saveManager.save(h1.gameState.toSerializableSave());

    // Simulate browser refresh: instantiate brand-new systems from sharedStorage
    const h2 = createHarness({ storage: sharedStorage });
    const reg2 = registerScreens(h2, viewportEl, navRootEl);
    reg2.screenManager.navigate('battle');

    const stage21 = h2.dataRegistry.stagesById.get('stage_2_1');
    assert.equal(h2.progressionSystem.getHighestUnlockedStage().id, 'stage_2_1');
    assert.equal(
      h2.battleManager._activeStage.id,
      'stage_2_1',
      'Fresh Battle entry after reload opens highest unlocked stage instead of stale Stage 1-2 or 1-1',
    );
    assert.equal(h2.gameState.battle.stageId, 'stage_2_1');
    assert.equal(getStageButtonText(viewportEl), `Stage ${stage21.code} · ${stage21.name}`);
    reg2.screenManager.navigate('missions', { category: 'main' });

    // Simulate corrupted/tampered selectedStageId pointing to locked stage_3_4 in persisted save
    const rawSaved = JSON.parse(sharedStorage.getItem(DEFAULT_SAVE_KEY));
    rawSaved.progression.selectedStageId = 'stage_3_4';
    sharedStorage.setItem(DEFAULT_SAVE_KEY, JSON.stringify(rawSaved));

    const h3 = createHarness({ storage: sharedStorage });
    const reg3 = registerScreens(h3, viewportEl, navRootEl);
    reg3.screenManager.navigate('battle');

    assert.equal(h3.battleManager._activeStage.id, 'stage_2_1');
    assert.equal(h3.gameState.battle.stageId, 'stage_2_1');
    assert.equal(getStageButtonText(viewportEl), `Stage ${stage21.code} · ${stage21.name}`);
    reg3.screenManager.navigate('missions', { category: 'main' });
  });
});
