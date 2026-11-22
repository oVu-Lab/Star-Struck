import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildDataRegistry } from '../src/utils/DataLoader.js';
import { EventBus } from '../src/core/EventBus.js';
import { GameState } from '../src/core/GameState.js';
import { SaveManager } from '../src/core/SaveManager.js';
import { ScreenManager } from '../src/core/ScreenManager.js';
import { Game } from '../src/core/Game.js';
import { createMemoryStorage } from '../src/utils/StorageUtils.js';
import { HeroSystem } from '../src/systems/HeroSystem.js';
import { FormationSystem } from '../src/systems/FormationSystem.js';
import { CardSystem } from '../src/systems/CardSystem.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.js';
import { TutorialManager, TUTORIAL_STAGE_KEYS } from '../src/systems/TutorialManager.js';
import { UnitManager } from '../src/battle/UnitManager.js';
import { TargetingSystem } from '../src/battle/TargetingSystem.js';
import { MovementSystem } from '../src/battle/MovementSystem.js';
import { CombatSystem } from '../src/battle/CombatSystem.js';
import { ProjectileSystem } from '../src/battle/ProjectileSystem.js';
import { SkillSystem } from '../src/battle/SkillSystem.js';
import { WaveManager } from '../src/battle/WaveManager.js';
import { BattleManager, BATTLE_PHASES } from '../src/battle/BattleManager.js';
import {
  TUTORIAL_STAGE_ID,
  TUTORIAL_DECK_IDS,
  TUTORIAL_INITIAL_SLOTS,
  TUTORIAL_REFILL_SEQUENCE,
} from '../src/battle/TutorialBattleConfig.js';
import { AnimationManager } from '../src/rendering/AnimationManager.js';
import { ParticleSystem } from '../src/rendering/ParticleSystem.js';
import { BattleRenderer } from '../src/rendering/BattleRenderer.js';
import { BattleScreen } from '../src/ui/BattleScreen.js';
import { SettingsScreen } from '../src/ui/SettingsScreen.js';

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

function createMockElement(tagName = 'div', attrs = {}) {
  const listeners = new Map();
  const children = [];
  const parsed = [];
  const el = {
    tagName: tagName.toUpperCase(),
    attrs: { ...attrs },
    className: attrs.class || '',
    id: attrs.id || '',
    textContent: '',
    hidden: 'hidden' in attrs,
    disabled: 'disabled' in attrs,
    value: attrs.value ?? '',
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
    _parsed: parsed,
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
      if (name.startsWith('data-')) {
        const camel = name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        this.dataset[camel] = String(val);
      }
    },
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
    click() {
      if (this.disabled) return;
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
    dispatchClickAt(clientX, clientY) {
      for (const fn of [...(listeners.get('click') || [])]) {
        fn({
          target: this,
          currentTarget: this,
          clientX,
          clientY,
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
      const slot = this.attrs['data-slot-index'];
      if (slot !== undefined) {
        const idx = Number(slot);
        return {
          left: 300 + idx * 110,
          top: 540,
          right: 400 + idx * 110,
          bottom: 690,
          width: 100,
          height: 150,
        };
      }
      if (this.id === 'btn-trigger-ultimate') {
        return { left: 1060, top: 494, right: 1186, bottom: 690, width: 126, height: 196 };
      }
      if (this.id === 'commander-console') {
        return { left: 1050, top: 540, right: 1188, bottom: 690, width: 138, height: 150 };
      }
      if (this.className.includes('dock-energy-core')) {
        return { left: 120, top: 540, right: 276, bottom: 690, width: 156, height: 150 };
      }
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
      el.textContent = inner.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    nodes.push(el);
  }
  return nodes;
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
    dispatchKey(code) {
      for (const h of [...(winListeners.get('keydown') || [])]) {
        h({ code, key: code === 'Escape' ? 'Escape' : code, target: null, preventDefault() {} });
      }
    },
  };

  let rafSeq = 0;
  const activeRafs = new Set();
  globalThis.requestAnimationFrame = () => {
    rafSeq += 1;
    activeRafs.add(rafSeq);
    return rafSeq;
  };
  globalThis.cancelAnimationFrame = (id) => {
    activeRafs.delete(id);
  };

  try {
    return fn({ modalRoot, viewportEl, navRootEl, winListeners, activeRafs });
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
    globalThis.requestAnimationFrame = prevRaf;
    globalThis.cancelAnimationFrame = prevCancelRaf;
  }
}

function createHarness({ storage = null } = {}) {
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

  const notifications = [];
  const audioCalls = [];
  const audioManager = {
    playClick() { audioCalls.push('click'); },
    playInvalid() { audioCalls.push('invalid'); },
    playCardSelect() { audioCalls.push('cardSelect'); },
    playDeploy() { audioCalls.push('deploy'); },
    playSkill() { audioCalls.push('skill'); },
    playMerge() { audioCalls.push('merge'); },
    playUltimate() { audioCalls.push('ultimate'); },
    playWave() { audioCalls.push('wave'); },
    playVictory() { audioCalls.push('victory'); },
    playDefeat() { audioCalls.push('defeat'); },
    playHeal() {},
    playHit() {},
    playProjectile() {},
    playUnitDeath() {},
    playBossEntrance() {},
    playCardDraw() {},
    playReward() {},
    setBgmMode() {},
    syncVolumes() {},
  };

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
    notify: (msg, level = 'info') => notifications.push({ msg, level }),
  });

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
    unitManager,
    combatSystem,
    waveManager,
    battleManager,
    tutorialManager,
    notifications,
    audioCalls,
  };
}

function registerScreens(h, viewportEl, navRootEl) {
  const screenManager = new ScreenManager({
    viewportEl,
    navRootEl,
    eventBus: h.eventBus,
  });
  const ctx = {
    eventBus: h.eventBus,
    gameState: h.gameState,
    saveManager: h.saveManager,
    screenManager,
    assetManager: {
      bindImageElement() {},
      getStatusSummary: () => ({ registered: 10, loaded: 10, fallback: 0 }),
    },
    audioManager: {
      playClick() {},
      playInvalid() {},
      playCardDraw() {},
      playReward() {},
      syncVolumes() {},
    },
    dataRegistry: h.dataRegistry,
    heroSystem: h.heroSystem,
    formationSystem: h.formationSystem,
    cardSystem: h.cardSystem,
    economySystem: h.economySystem,
    progressionSystem: h.progressionSystem,
    battleManager: h.battleManager,
    tutorialManager: h.tutorialManager,
    notify: (msg, level = 'info') => h.notifications.push({ msg, level }),
    confirmDialog() {},
    openGuide() {},
  };
  screenManager.register('home', { mount() {}, unmount() {} });
  screenManager.register('battle', new BattleScreen(ctx));
  screenManager.register('settings', new SettingsScreen(ctx));
  return { screenManager, ctx };
}

test('First-time battle launches dedicated Tutorial Battle immediately at Step 1 (no interface overview)', () => {
  withMockDom(({ viewportEl, navRootEl }) => {
    const h = createHarness();
    const { screenManager } = registerScreens(h, viewportEl, navRootEl);

    assert.equal(h.tutorialManager.shouldAutoLaunch(), true);
    assert.equal(h.gameState.tutorial.completed, false);
    assert.equal(h.gameState.tutorial.skipped, false);

    screenManager.navigate('battle');

    assert.equal(h.tutorialManager.isActive(), true);
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.SELECT_UNIT);
    assert.equal(h.battleManager.isTutorialSession(), true);
    assert.equal(h.gameState.battle.stageId, TUTORIAL_STAGE_ID);
    assert.equal(h.battleManager.getPhase(), BATTLE_PHASES.ACTIVE_COMBAT);
    assert.equal(h.gameState.battle.energy, 90);
    assert.equal(h.unitManager.getActiveCount('enemy'), 2, 'Wave 1 tutorial scouts spawned');

    const slots = h.cardSystem.getSlots();
    assert.equal(slots[0].cardId, TUTORIAL_INITIAL_SLOTS[0]);
    assert.equal(slots[1].cardId, TUTORIAL_INITIAL_SLOTS[1]);
    assert.equal(slots[2].cardId, TUTORIAL_INITIAL_SLOTS[2]);
    assert.equal(slots[5].cardId, TUTORIAL_INITIAL_SLOTS[5]);

    const overlayRoot = viewportEl.querySelector('#tutorial-overlay-root');
    assert.equal(overlayRoot.hidden, false);
    assert.equal(viewportEl.querySelector('#tutorial-overview-callouts'), null);
    assert.equal(viewportEl.querySelector('#tutorial-welcome-tabs'), null);
    assert.equal(viewportEl.querySelector('#tutorial-step-counter').textContent, 'Step 1 of 9');
    assert.equal(viewportEl.querySelector('#tutorial-stage-title').textContent, 'Select a Unit Card');
    assert.equal(viewportEl.querySelector('#tutorial-stage-body').textContent, 'Six slots draw from your deck. Click it.');

    screenManager.navigate('home');
  });
});

test('Complete 9-step tutorial teaches slots, real 5s timed refill, Lv.I->II->III merging, restores normal RNG, and preserves player deck', () => {
  withMockDom(({ viewportEl, navRootEl }) => {
    const h = createHarness();
    // Configure a custom player deck that differs from TUTORIAL_DECK_IDS to verify tutorial never alters it
    const playerSavedDeck = [
      'card_shield_guard',
      'card_wind_cavalry',
      'card_vanguard_breaker',
      'card_pulse_skirmisher',
      'card_skill_sanctuary_wave',
      'card_support_overclock_core',
    ];
    h.cardSystem.setCustomDeck(playerSavedDeck);
    const { screenManager } = registerScreens(h, viewportEl, navRootEl);

    const creditsBefore = h.gameState.resources.credits;
    const astriteBefore = h.gameState.resources.astrite;

    const assertShortBody = () => {
      const body = viewportEl.querySelector('#tutorial-stage-body').textContent.trim();
      const words = body.split(/\s+/).filter(Boolean);
      assert.ok(words.length > 0 && words.length < 10, `Expected < 10 words, got (${words.length}): "${body}"`);
      return body;
    };

    screenManager.navigate('battle');

    // Step 1 — Select a Unit Card (slot 0)
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.SELECT_UNIT);
    assert.equal(viewportEl.querySelector('#tutorial-step-counter').textContent, 'Step 1 of 9');
    assert.equal(assertShortBody(), 'Six slots draw from your deck. Click it.');
    assert.equal(viewportEl.querySelector('#tutorial-panel-actions').hidden, true);

    // Wrong card (slot 1 / slot 5) or backdrop click does nothing
    assert.equal(h.battleManager.interactWithCardSlot(1).ok, false);
    assert.equal(h.battleManager.interactWithCardSlot(5).ok, false);
    viewportEl.querySelector('.tutorial-backdrop-pane--top').click();
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.SELECT_UNIT);

    // Valid action: select Unit Card in slot 0 -> Step 2 (Deploy Your Unit)
    viewportEl.querySelector('[data-slot-index="0"]').click();
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.DEPLOY_UNIT);
    assert.equal(viewportEl.querySelector('#tutorial-step-counter').textContent, 'Step 2 of 9');
    assert.equal(viewportEl.querySelector('#tutorial-stage-title').textContent, 'Deploy Your Unit');
    assert.equal(assertShortBody(), 'Click here to deploy and start refill.');
    assert.equal(h.gameState.battle.selectedCardSlot, 0);

    // Invalid action: deploying outside friendly zone does nothing
    const energyBeforeInvalidDeploy = h.gameState.battle.energy;
    const canvas = viewportEl.querySelector('#battle-canvas');
    const rightSideScreen = h.battleManager.battlefield.worldToScreen(82, 50, 1280, 720);
    const badDeployRes = h.battleManager.handleCanvasPointer(rightSideScreen.x, rightSideScreen.y);
    assert.equal(badDeployRes.ok, false);
    assert.equal(h.gameState.battle.energy, energyBeforeInvalidDeploy);
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.DEPLOY_UNIT);

    // Valid action: deploy inside friendly region -> Step 3 (Automatic Card Refill)
    const alliesBeforeDeploy = h.unitManager.getActiveCount('ally');
    const friendlyScreen = h.battleManager.battlefield.worldToScreen(16, 50, 1280, 720);
    canvas.dispatchClickAt(friendlyScreen.x, friendlyScreen.y);
    assert.equal(h.unitManager.getActiveCount('ally'), alliesBeforeDeploy + 1);
    assert.equal(h.cardSystem.getSlots()[0], null, 'Slot 0 must empty after card use');
    assert.equal(h.cardSystem.getRefillState(0).active, true, 'Slot 0 must begin timed refill');
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.CARD_REFILL);
    assert.equal(viewportEl.querySelector('#tutorial-step-counter').textContent, 'Step 3 of 9');
    assert.equal(assertShortBody(), 'Empty slots refill automatically after 5 seconds.');
    assert.equal(viewportEl.querySelector('#btn-tutorial-continue').disabled, true);

    // Refill must NOT happen before 5s expires (test at 4.0s)
    for (let i = 0; i < 60 * 4; i += 1) {
      h.battleManager.stepSimulation(1 / 60);
    }
    assert.equal(h.cardSystem.getSlots()[0], null, 'Slot 0 must still be empty at 4.0s');
    assert.equal(h.cardSystem.getRefillState(0).active, true);
    assert.equal(viewportEl.querySelector('#btn-tutorial-continue').disabled, true);
    assert.equal(h.tutorialManager.continueCurrentStage(), false);

    // Advance remaining 1.1s -> real refill occurs deterministically
    for (let i = 0; i < 66; i += 1) {
      h.battleManager.stepSimulation(1 / 60);
    }
    const refilledSlot0 = h.cardSystem.getSlots()[0];
    assert.ok(refilledSlot0, 'Slot 0 must refill automatically after 5 seconds');
    assert.equal(refilledSlot0.cardId, TUTORIAL_REFILL_SEQUENCE[0]);
    assert.equal(refilledSlot0.tier, 1);
    assert.equal(viewportEl.querySelector('#btn-tutorial-continue').disabled, false);

    // Continue -> Step 4 (Merge Level I -> Level II across non-adjacent slots 1 & 4)
    viewportEl.querySelector('#btn-tutorial-continue').click();
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.MERGE_LV1);
    assert.equal(viewportEl.querySelector('#tutorial-step-counter').textContent, 'Step 4 of 9');
    assert.equal(assertShortBody(), 'Any two identical cards merge. Click this.');

    // Invalid slot click must not advance
    assert.equal(h.battleManager.interactWithCardSlot(0).ok, false);
    assert.equal(h.tutorialManager.getSubStep(), 'select_merge_1a');

    // Select slot 1 -> highlight non-adjacent slot 4
    viewportEl.querySelector('[data-slot-index="1"]').click();
    assert.equal(h.tutorialManager.getSubStep(), 'merge_1a');
    assert.equal(assertShortBody(), "Position doesn't matter. Click its match.");

    // Clicking slot 1 again or unhighlighted slot 3 is blocked during guided step
    assert.equal(h.battleManager.interactWithCardSlot(1).ok, false);
    assert.equal(h.battleManager.interactWithCardSlot(3).ok, false);

    // Merge slot 1 into non-adjacent slot 4 -> Lv.II created at slot 4, slot 1 starts refill
    viewportEl.querySelector('[data-slot-index="4"]').click();
    assert.equal(h.cardSystem.getSlots()[4].tier, 2);
    assert.equal(h.cardSystem.getSlots()[1], null);
    assert.equal(h.cardSystem.getRefillState(1).active, true);
    assert.equal(h.tutorialManager.getSubStep(), 'show_lv2');
    assert.equal(assertShortBody(), 'Upgraded to Level II! Emptied slot refills.');
    assert.equal(viewportEl.querySelector('#btn-tutorial-continue').disabled, false);

    // Continue -> Step 5 (Merge Level II -> Level III)
    viewportEl.querySelector('#btn-tutorial-continue').click();
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.MERGE_LV2);
    assert.equal(viewportEl.querySelector('#tutorial-step-counter').textContent, 'Step 5 of 9');
    assert.equal(h.tutorialManager.getSubStep(), 'select_merge_1b');
    assert.equal(assertShortBody(), 'Click this card to prepare another merge.');

    // Select slot 2 -> merge into slot 3 (creates second Lv.II at slot 3)
    viewportEl.querySelector('[data-slot-index="2"]').click();
    assert.equal(h.tutorialManager.getSubStep(), 'merge_1b');
    assert.equal(assertShortBody(), 'Click its match to create Level II.');
    viewportEl.querySelector('[data-slot-index="3"]').click();
    assert.equal(h.cardSystem.getSlots()[3].tier, 2);
    assert.equal(h.tutorialManager.getSubStep(), 'select_merge_2');
    assert.equal(assertShortBody(), 'Click this Level II card to upgrade.');

    // Select Lv.II at slot 4 -> merge into Lv.II at slot 3 -> creates max Lv.III
    viewportEl.querySelector('[data-slot-index="4"]').click();
    assert.equal(h.tutorialManager.getSubStep(), 'merge_2');
    assert.equal(assertShortBody(), 'Merge two Level II cards into Level III.');
    viewportEl.querySelector('[data-slot-index="3"]').click();
    assert.equal(h.cardSystem.getSlots()[3].tier, 3);
    assert.equal(h.cardSystem.getSlots()[3].levelLabel, 'Lv.III');
    assert.equal(h.tutorialManager.getSubStep(), 'show_lv3');
    assert.equal(assertShortBody(), 'Level III is the maximum card level.');

    // Continue -> Step 6 (Watch Your Units Fight)
    viewportEl.querySelector('#btn-tutorial-continue').click();
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.AUTO_COMBAT);
    assert.equal(viewportEl.querySelector('#tutorial-step-counter').textContent, 'Step 6 of 9');
    assert.equal(viewportEl.querySelector('#tutorial-stage-title').textContent, 'Watch Your Units Fight');
    assert.equal(assertShortBody(), 'Your units fight automatically.');

    // Continue blocked until combat occurs
    assert.equal(viewportEl.querySelector('#btn-tutorial-continue').disabled, true);
    h.tutorialManager.continueCurrentStage();
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.AUTO_COMBAT);

    for (let i = 0; i < 180; i += 1) {
      h.battleManager.stepSimulation(1 / 60);
    }
    assert.equal(viewportEl.querySelector('#btn-tutorial-continue').disabled, false);

    // Continue -> Step 7 (Use a Skill)
    viewportEl.querySelector('#btn-tutorial-continue').click();
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.SKILL_CARDS);
    assert.equal(h.tutorialManager.getSubStep(), 'select_skill_card');
    assert.equal(viewportEl.querySelector('#tutorial-step-counter').textContent, 'Step 7 of 9');
    assert.equal(viewportEl.querySelector('#tutorial-stage-title').textContent, 'Use a Skill');
    assert.equal(assertShortBody(), 'Click this card to select a skill.');

    // Invalid action: insufficient energy prevents Skill Card activation and does NOT advance
    const savedEnergy = h.gameState.battle.energy;
    h.gameState.setBattle({ energy: 5, dp: 5 });
    const lowEnergyCast = h.battleManager.playCardSlot(5, { x: 75, y: 50 });
    assert.equal(lowEnergyCast.ok, false);
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.SKILL_CARDS);
    h.gameState.setBattle({ energy: savedEnergy, dp: savedEnergy });

    // Invalid action: selecting non-skill card in Step 7 must NOT advance
    assert.equal(h.battleManager.interactWithCardSlot(3).ok, false);
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.SKILL_CARDS);

    // Valid action: select Skill Card (slot 5) -> click enemies to cast
    viewportEl.querySelector('[data-slot-index="5"]').click();
    assert.equal(h.tutorialManager.getSubStep(), 'cast_skill_card');
    assert.equal(viewportEl.querySelector('#tutorial-stage-title').textContent, 'Cast Your Skill');
    assert.equal(assertShortBody(), 'Click the enemies to cast your skill.');
    const enemy = h.unitManager.getBySide('enemy')[0];
    const enemyScreen = h.battleManager.battlefield.worldToScreen(enemy.x, enemy.y, 1280, 720);
    canvas.dispatchClickAt(enemyScreen.x, enemyScreen.y);

    // Advances to Step 8 (Activate Your Ultimate)
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.COMMANDER_ULTIMATE);
    assert.equal(viewportEl.querySelector('#tutorial-step-counter').textContent, 'Step 8 of 9');
    assert.equal(viewportEl.querySelector('#tutorial-stage-title').textContent, 'Activate Your Ultimate');
    assert.equal(assertShortBody(), 'Your Ultimate is ready. Click to activate.');
    assert.equal(h.gameState.battle.ultimateEnergy, 100);
    assert.equal(h.tutorialManager.buildViewModel().targetSelector, '#btn-trigger-ultimate');
    const ultSpotlight = viewportEl.querySelector('#tutorial-spotlight');
    assert.equal(ultSpotlight.style.left, '1055px');
    assert.equal(ultSpotlight.style.top, '489px');
    assert.equal(ultSpotlight.style.width, '136px');
    assert.equal(ultSpotlight.style.height, '206px');

    // Non-ultimate card plays are blocked during Step 8
    assert.equal(h.battleManager.interactWithCardSlot(3).ok, false);
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.COMMANDER_ULTIMATE);

    // Activate Commander Ultimate via button click -> advances to Step 9 (Finish the Battle)
    viewportEl.querySelector('#btn-trigger-ultimate').click();
    assert.equal(h.gameState.battle.ultimateEnergy, 0);
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.FINISH_BATTLE);
    assert.equal(viewportEl.querySelector('#tutorial-step-counter').textContent, 'Step 9 of 9');
    assert.equal(viewportEl.querySelector('#tutorial-stage-title').textContent, 'Finish the Battle');
    assert.equal(assertShortBody(), 'Defeat all enemies to win the battle.');
    assert.equal(viewportEl.querySelector('#tutorial-overlay-root').classList.contains('is-banner-mode'), true);

    // Step simulation until tutorial victory
    for (let step = 0; step < 60 * 90; step += 1) {
      if (h.battleManager.getPhase() === BATTLE_PHASES.RESULTS) break;
      h.battleManager.stepSimulation(1 / 60);
    }

    assert.equal(h.battleManager.getPhase(), BATTLE_PHASES.RESULTS);
    assert.equal(h.gameState.battle.results.victory, true);
    assert.equal(h.gameState.battle.results.isTutorial, true);
    assert.equal(h.tutorialManager.isActive(), false);
    assert.equal(h.tutorialManager.isCompleted(), true);
    assert.equal(h.cardSystem._cardGenerator, null, 'Normal random generator must be restored after tutorial');
    assert.deepEqual(h.cardSystem.getCustomDeck(), playerSavedDeck, 'Tutorial must not alter player saved deck');

    // Persisted across SaveManager reload
    const reloaded = h.saveManager.load();
    assert.equal(reloaded.data.tutorial.completed, true);
    assert.equal(reloaded.data.tutorial.skipped, false);
    assert.ok(typeof reloaded.data.tutorial.completedAt === 'string');

    // Tutorial battle does NOT pollute campaign progression or currencies
    assert.deepEqual(reloaded.data.progression.clearedStages, []);
    assert.equal(reloaded.data.progression.battleStats.battlesPlayed, 0);
    assert.equal(reloaded.data.resources.credits, creditsBefore);
    assert.equal(reloaded.data.resources.astrite, astriteBefore);

    // Tutorial EventBus listeners cleaned up on completion; BattleScreen listeners clean up on unmount
    assert.equal(h.tutorialManager._unsubs.length, 0);
    assert.equal(h.eventBus.listenerCount('cards:played'), 0);
    assert.equal(h.eventBus.listenerCount('battle:completed'), 1);

    screenManager.navigate('home');
    assert.equal(h.eventBus.listenerCount('commander:ultimateActivated'), 0);
    assert.equal(h.eventBus.listenerCount('battle:completed'), 0);

    // Entering a normal battle afterwards uses the player's saved deck and random generator
    screenManager.navigate('battle');
    assert.equal(h.battleManager.isTutorialSession(), false);
    assert.deepEqual(h.cardSystem.getActiveDeckIds(), playerSavedDeck);
    screenManager.navigate('home');
  });
});

test('Returning players skip tutorial automatically and enter normal battle flow cleanly', () => {
  withMockDom(({ viewportEl, navRootEl }) => {
    const h = createHarness();
    h.tutorialManager.markCompleted();
    const { screenManager } = registerScreens(h, viewportEl, navRootEl);

    assert.equal(h.tutorialManager.shouldAutoLaunch(), false);
    screenManager.navigate('battle');

    assert.equal(h.tutorialManager.isActive(), false);
    assert.equal(h.battleManager.isTutorialSession(), false);
    assert.equal(h.gameState.battle.stageId, 'stage_1_3');
    assert.equal(h.battleManager.getPhase(), BATTLE_PHASES.PREPARATION);
    assert.equal(h.gameState.battle.energy, 60, 'Normal battle keeps standard balance energy 60');
    assert.equal(viewportEl.querySelector('#tutorial-overlay-root').hidden, true);

    screenManager.navigate('home');
  });
});

test('Skip Tutorial opens confirmation dialog, cancel keeps tutorial active, and confirm saves skip and starts normal battle', () => {
  withMockDom(({ viewportEl, navRootEl }) => {
    const h = createHarness();
    const { screenManager } = registerScreens(h, viewportEl, navRootEl);

    screenManager.navigate('battle');
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.SELECT_UNIT);

    // Open skip modal
    viewportEl.querySelector('#btn-tutorial-skip').click();
    assert.equal(viewportEl.querySelector('#tutorial-skip-modal').hidden, false);
    assert.equal(h.tutorialManager.isActive(), true);

    // Cancel skip -> remains in tutorial
    viewportEl.querySelector('#btn-tutorial-skip-cancel').click();
    assert.equal(viewportEl.querySelector('#tutorial-skip-modal').hidden, true);
    assert.equal(h.tutorialManager.isActive(), true);
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.SELECT_UNIT);

    // Confirm skip -> marks skipped, cleans up listeners, launches normal battle
    viewportEl.querySelector('#btn-tutorial-skip').click();
    viewportEl.querySelector('#btn-tutorial-skip-confirm').click();

    assert.equal(h.tutorialManager.isActive(), false);
    assert.equal(h.tutorialManager.isSkipped(), true);
    assert.equal(h.tutorialManager.isCompleted(), false);
    assert.equal(h.battleManager.isTutorialSession(), false);
    assert.equal(h.gameState.battle.stageId, 'stage_1_3');
    assert.equal(h.battleManager.getPhase(), BATTLE_PHASES.PREPARATION);
    assert.equal(h.eventBus.listenerCount('cards:played'), 0);

    const reloaded = h.saveManager.load();
    assert.equal(reloaded.data.tutorial.skipped, true);

    screenManager.navigate('home');
  });
});

test('Leaving early mid-tutorial cleans up listeners and does NOT mark tutorial as completed', () => {
  withMockDom(({ viewportEl, navRootEl }) => {
    const h = createHarness();
    const { screenManager } = registerScreens(h, viewportEl, navRootEl);

    screenManager.navigate('battle');
    viewportEl.querySelector('[data-slot-index="0"]').click();
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.DEPLOY_UNIT);

    // Leave mid-tutorial (navigate back to Home)
    screenManager.navigate('home');

    assert.equal(h.tutorialManager.isActive(), false);
    assert.equal(h.tutorialManager.isCompleted(), false);
    assert.equal(h.tutorialManager.isSkipped(), false);
    assert.equal(h.eventBus.listenerCount('cards:played'), 0);
    assert.equal(h.eventBus.listenerCount('battle:completed'), 0);
    assert.equal(h.battleManager._tutorialActionFilter, null);

    // Re-entering battle still auto-launches tutorial at Step 1
    screenManager.navigate('battle');
    assert.equal(h.tutorialManager.isActive(), true);
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.SELECT_UNIT);

    screenManager.navigate('home');
  });
});

test('Pause and battle speed controls work during tutorial without breaking or advancing steps', () => {
  withMockDom(({ viewportEl, navRootEl }) => {
    const h = createHarness();
    const { screenManager } = registerScreens(h, viewportEl, navRootEl);

    screenManager.navigate('battle');
    viewportEl.querySelector('[data-slot-index="0"]').click();
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.DEPLOY_UNIT);

    viewportEl.querySelector('#btn-battle-speed').click();
    assert.equal(h.gameState.battle.speedMultiplier, 2);
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.DEPLOY_UNIT);

    viewportEl.querySelector('#btn-battle-pause').click();
    assert.equal(h.gameState.battle.status, 'paused');
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.DEPLOY_UNIT);
    assert.equal(viewportEl.querySelector('#tutorial-stage-body').textContent, 'Click here to deploy and start refill.');

    viewportEl.querySelector('#btn-battle-pause').click();
    assert.equal(h.gameState.battle.status, 'running');

    screenManager.navigate('home');
  });
});

test('Replay Tutorial works from SettingsScreen and Tactical Guide without resetting player progress', () => {
  withMockDom(({ viewportEl, navRootEl, modalRoot }) => {
    const h = createHarness();
    h.economySystem.grant('credits', 1000);
    h.tutorialManager.markCompleted();
    const creditsSaved = h.gameState.resources.credits;

    const { screenManager } = registerScreens(h, viewportEl, navRootEl);

    // 1. Replay from SettingsScreen
    screenManager.navigate('settings');
    assert.equal(viewportEl.querySelector('#tutorial-status-label').textContent.includes('Completed'), true);
    viewportEl.querySelector('#btn-replay-tutorial').click();

    assert.equal(screenManager.getActiveScreenId(), 'battle');
    assert.equal(h.tutorialManager.isActive(), true);
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.SELECT_UNIT);
    assert.equal(h.gameState.resources.credits, creditsSaved, 'Replaying tutorial must not reset player progress');

    screenManager.navigate('home');

    // 2. Replay from Game.openGuide()
    const game = new Game();
    game.audioManager = { playClick() {} };
    game.screenManager = screenManager;
    game.openGuide();

    const guideReplayBtn = modalRoot.querySelector('#btn-guide-replay-tutorial');
    assert.ok(guideReplayBtn, 'Tactical Guide modal must expose Replay Battle Tutorial button');
    guideReplayBtn.click();

    assert.equal(modalRoot.hidden, true);
    assert.equal(screenManager.getActiveScreenId(), 'battle');
    assert.equal(h.tutorialManager.isActive(), true);
    assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.SELECT_UNIT);

    screenManager.navigate('home');
  });
});
