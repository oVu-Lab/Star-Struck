import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ScreenManager } from '../src/core/ScreenManager.js';
import { EventBus } from '../src/core/EventBus.js';
import { GameState } from '../src/core/GameState.js';
import { SaveManager } from '../src/core/SaveManager.js';
import { HeroSystem } from '../src/systems/HeroSystem.js';
import { FormationSystem } from '../src/systems/FormationSystem.js';
import { CardSystem } from '../src/systems/CardSystem.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.js';
import { GachaSystem } from '../src/systems/GachaSystem.js';
import { MissionSystem } from '../src/systems/MissionSystem.js';
import { HomeScreen } from '../src/ui/HomeScreen.js';
import { MissionsScreen } from '../src/ui/MissionsScreen.js';
import { HeroScreen } from '../src/ui/HeroScreen.js';
import { FormationScreen } from '../src/ui/FormationScreen.js';
import { SummonScreen } from '../src/ui/SummonScreen.js';
import { InventoryScreen } from '../src/ui/InventoryScreen.js';
import { SettingsScreen } from '../src/ui/SettingsScreen.js';
import { buildDataRegistry } from '../src/utils/DataLoader.js';
import { createMemoryStorage } from '../src/utils/StorageUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

async function readFullBundle() {
  const dataDir = path.join(ROOT, 'data');
  const read = async (f) => JSON.parse(await fs.readFile(path.join(dataDir, f), 'utf8'));
  return {
    heroes: await read('heroes.json'),
    units: await read('units.json'),
    enemies: await read('enemies.json'),
    skills: await read('skills.json'),
    cards: await read('cards.json'),
    stages: await read('stages.json'),
    banners: await read('banners.json'),
    bosses: await read('bosses.json'),
    terrain: await read('terrain.json'),
    balance: await read('balance.json'),
    missions: await read('missions.json'),
  };
}

function makeClassList(initial = []) {
  const set = new Set(initial);
  return {
    add(...cls) {
      for (const c of cls) set.add(c);
    },
    remove(...cls) {
      for (const c of cls) set.delete(c);
    },
    toggle(c, force) {
      if (force === undefined) {
        if (set.has(c)) {
          set.delete(c);
          return false;
        }
        set.add(c);
        return true;
      }
      if (force) set.add(c);
      else set.delete(c);
      return force;
    },
    contains(c) {
      return set.has(c);
    },
    toArray() {
      return Array.from(set);
    },
  };
}

function createFakeNode(tag = 'div', { id = '', className = '', attrs = {} } = {}) {
  const attributes = new Map(Object.entries(attrs));
  if (id) attributes.set('id', id);
  let _className = className;
  let _classList = makeClassList(className.split(/\s+/).filter(Boolean));
  const node = {
    tagName: tag.toUpperCase(),
    children: [],
    parentNode: null,
    style: {},
    dataset: {},
    get className() {
      return _classList.toArray().join(' ');
    },
    set className(val) {
      _className = String(val ?? '');
      _classList = makeClassList(_className.split(/\s+/).filter(Boolean));
    },
    get classList() {
      return _classList;
    },
    offsetLeft: 0,
    offsetWidth: 0,
    setAttribute(k, v) {
      attributes.set(k, String(v));
      if (k === 'class') {
        this.className = String(v);
      }
    },
    getAttribute(k) {
      return attributes.has(k) ? attributes.get(k) : null;
    },
    removeAttribute(k) {
      attributes.delete(k);
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    remove() {
      if (!this.parentNode) return;
      const idx = this.parentNode.children.indexOf(this);
      if (idx !== -1) this.parentNode.children.splice(idx, 1);
      this.parentNode = null;
    },
    cloneNode(deep = false) {
      const clonedAttrs = {};
      for (const [k, v] of attributes.entries()) clonedAttrs[k] = v;
      const copy = createFakeNode(tag, {
        className: this.classList.toArray().join(' '),
        attrs: clonedAttrs,
      });
      if (deep) {
        for (const ch of this.children) {
          copy.appendChild(ch.cloneNode(true));
        }
      }
      return copy;
    },
    querySelectorAll(sel) {
      const results = [];
      const walk = (root) => {
        for (const child of root.children) {
          if (matches(child, sel)) results.push(child);
          walk(child);
        }
      };
      walk(this);
      return results;
    },
    querySelector(sel) {
      if (sel.startsWith(':scope > ')) {
        const sub = sel.slice(':scope > '.length).trim();
        return this.children.find((ch) => matches(ch, sub)) || null;
      }
      return this.querySelectorAll(sel)[0] || null;
    },
  };
  return node;
}

function matches(node, selector) {
  return selector.split(',').some((part) => {
    const s = part.trim();
    if (s === '[id]') return node.getAttribute('id') !== null;
    if (s === '[tabindex]') return node.getAttribute('tabindex') !== null;
    if (s === '[data-screen]') return node.getAttribute('data-screen') !== null;
    if (s === '[data-screen].is-active') {
      return node.getAttribute('data-screen') !== null && node.classList.contains('is-active');
    }
    if (s.startsWith('.')) {
      return node.classList.contains(s.slice(1));
    }
    return node.tagName.toLowerCase() === s.toLowerCase();
  });
}

test('ScreenManager applies directional transitions, strips cloned IDs, and prevents stacked exit layers on rapid navigation', async () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;

  const viewport = createFakeNode('main', { id: 'screen-viewport', className: 'screen-viewport' });
  let innerHtmlBacking = '';
  Object.defineProperty(viewport, 'innerHTML', {
    get() {
      return innerHtmlBacking;
    },
    set(val) {
      innerHtmlBacking = val;
      if (val === '') {
        for (const ch of viewport.children) ch.parentNode = null;
        viewport.children = [];
      }
    },
  });

  const navRoot = createFakeNode('nav', { id: 'primary-nav', className: 'primary-nav' });
  const navIds = ['home', 'missions', 'heroes', 'formation', 'summon'];
  navIds.forEach((id, idx) => {
    const btn = createFakeNode('button', { className: 'nav-link', attrs: { 'data-screen': id } });
    btn.offsetLeft = idx * 100;
    btn.offsetWidth = 92;
    navRoot.appendChild(btn);
  });

  globalThis.document = {
    createElement(tag) {
      return createFakeNode(tag);
    },
  };
  globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    removeEventListener() {},
  };

  try {
    const bus = new EventBus();
    const manager = new ScreenManager({ viewportEl: viewport, navRootEl: navRoot, eventBus: bus });

    for (const id of [...navIds, 'battle']) {
      manager.register(id, {
        mount(container) {
          const frame = createFakeNode('section', { id: `frame-${id}`, className: 'screen-frame' });
          const btn = createFakeNode('button', { id: `btn-${id}` });
          const canvas = createFakeNode('canvas', { id: `canvas-${id}` });
          frame.appendChild(btn);
          frame.appendChild(canvas);
          container.appendChild(frame);
        },
        unmount() {},
      });
    }

    manager.navigate('home');
    assert.equal(viewport.dataset.navDir, 'fade');
    assert.equal(navRoot.classList.contains('has-sliding-indicator'), true);
    const indicator = navRoot.querySelector('.nav-active-indicator');
    assert.ok(indicator, 'sliding nav indicator should be created');
    assert.equal(indicator.style.width, '76px');
    assert.equal(indicator.style.transform, 'translate3d(8px, 0, 0)');

    // Forward transition: home -> heroes
    manager.navigate('heroes');
    assert.equal(viewport.dataset.navDir, 'forward');
    let exitLayers = viewport.querySelectorAll('.screen-transition-exit');
    assert.equal(exitLayers.length, 1, 'should mount one inert outgoing exit layer');
    assert.equal(exitLayers[0].getAttribute('aria-hidden'), 'true');
    assert.equal(exitLayers[0].classList.contains('screen-transition-exit--forward'), true);
    assert.equal(exitLayers[0].querySelectorAll('[id]').length, 0, 'cloned snapshot must strip IDs');
    const clonedBtn = exitLayers[0].querySelector('button');
    assert.equal(clonedBtn?.getAttribute('tabindex'), '-1', 'cloned controls must be unfocusable');
    const clonedCanvas = exitLayers[0].querySelector('canvas');
    assert.equal(clonedCanvas?.style.opacity, '0', 'cloned canvases must be hidden during exit');

    // Rapid navigation burst: heroes -> formation -> summon -> missions (backward)
    manager.navigate('formation');
    manager.navigate('summon');
    manager.navigate('missions');
    assert.equal(viewport.dataset.navDir, 'backward');
    assert.equal(manager.getActiveScreenId(), 'missions');
    exitLayers = viewport.querySelectorAll('.screen-transition-exit');
    assert.equal(exitLayers.length, 1, 'rapid navigation must never stack multiple exit layers');
    assert.equal(indicator.style.transform, 'translate3d(108px, 0, 0)');

    // Battle navigation should skip snapshot exit layer and use fade
    manager.navigate('battle');
    assert.equal(viewport.dataset.navDir, 'fade');
    assert.equal(viewport.querySelectorAll('.screen-transition-exit').length, 0);

    // Wait for settle/exit timers to clear cleanly
    await new Promise((resolve) => setTimeout(resolve, 320));
    assert.equal(viewport.querySelectorAll('.screen-transition-exit').length, 0);
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
});

test('UI screens omit is-settled on initial mount and add is-settled + sub-view motion classes on in-screen updates', async () => {
  const dataRegistry = buildDataRegistry(await readFullBundle());
  const eventBus = new EventBus();
  const saveManager = new SaveManager({ eventBus, storage: createMemoryStorage() });
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
  const gachaSystem = new GachaSystem({
    dataRegistry,
    gameState,
    economySystem,
    heroSystem,
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

  const noopAudio = {
    playClick() {},
    playDeploy() {},
    playInvalid() {},
    playReward() {},
    playCardSelect() {},
    playSummon() {},
    syncVolumes() {},
  };
  const noopAssets = {
    bindImageElement() {},
    getStatusSummary: () => ({ loaded: 1, registered: 1, fallback: 0 }),
  };

  const makeMockContainer = () => {
    const stubChild = () => ({
      innerHTML: '',
      scrollTop: 0,
      style: {},
      appendChild() {},
      addEventListener() {},
      setAttribute() {},
      querySelector: () => null,
      querySelectorAll: () => [],
    });
    return {
      innerHTML: '',
      querySelector: (sel) => {
        if (
          sel === '#missions-body' ||
          sel === '#formation-workspace-body' ||
          sel === '#hero-collection-grid'
        ) {
          return stubChild();
        }
        return null;
      },
      querySelectorAll: () => [],
    };
  };

  const ctx = {
    eventBus,
    gameState,
    saveManager,
    screenManager: { navigate: () => true, has: () => true },
    assetManager: noopAssets,
    audioManager: noopAudio,
    dataRegistry,
    heroSystem,
    formationSystem,
    cardSystem,
    economySystem,
    progressionSystem,
    gachaSystem,
    missionSystem,
    notify() {},
    confirmDialog() {},
    openGuide() {},
  };

  const prevDoc = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      type: '',
      className: '',
      innerHTML: '',
      addEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => [],
      setAttribute() {},
    }),
  };

  try {
    const screens = [
      new HomeScreen(ctx),
      new MissionsScreen(ctx),
      new HeroScreen(ctx),
      new FormationScreen(ctx),
      new SummonScreen(ctx),
      new InventoryScreen(ctx),
      new SettingsScreen(ctx),
    ];

    for (const screen of screens) {
      const container = makeMockContainer();
      screen.mount(container);
      assert.equal(
        container.innerHTML.includes('is-settled'),
        false,
        `${screen.constructor.name} should animate entrance on initial mount`,
      );

      screen.render();
      assert.equal(
        container.innerHTML.includes('is-settled'),
        true,
        `${screen.constructor.name} should apply is-settled on in-screen re-renders`,
      );
      screen.unmount();
    }

    // Verify sub-view transition classes trigger on real state changes
    const missionContainer = makeMockContainer();
    const missionsScreen = new MissionsScreen(ctx);
    missionsScreen.mount(missionContainer);
    missionsScreen._selectCategory('weekly');
    assert.equal(missionContainer.innerHTML.includes('motion-tab-enter'), true);
    missionsScreen.unmount();

    const summonContainer = makeMockContainer();
    const summonScreen = new SummonScreen(ctx);
    summonScreen.mount(summonContainer);
    const banners = gachaSystem.getBanners();
    if (banners.length > 1) {
      gachaSystem.setActiveBanner(banners[1].id);
      summonScreen.render();
      assert.equal(summonContainer.innerHTML.includes('is-switching'), true);
      assert.equal(summonContainer.innerHTML.includes('motion-detail-enter'), true);
    }
    summonScreen.unmount();
  } finally {
    globalThis.document = prevDoc;
  }
});

test('Stylesheets maintain balanced CSS braces, reduced-motion support, and inert exit transition rules', async () => {
  const cssFiles = ['styles/main.css', 'styles/layout.css', 'styles/components.css', 'styles/battle.css'];
  let combined = '';

  for (const rel of cssFiles) {
    const content = await fs.readFile(path.join(ROOT, rel), 'utf8');
    combined += `\n${content}`;
    const opens = (content.match(/\{/g) || []).length;
    const closes = (content.match(/\}/g) || []).length;
    assert.equal(opens, closes, `${rel} must have balanced curly braces (${opens} vs ${closes})`);
  }

  assert.match(combined, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(combined, /\.screen-transition-exit\s*\{[\s\S]*?pointer-events:\s*none;/);
  assert.match(combined, /\.nav-active-indicator\s*\{/);
  assert.match(combined, /\.motion-tab-enter\s*\{/);
  assert.match(combined, /\.motion-detail-enter\s*\{/);
  assert.match(combined, /\.motion-pulse-commit\s*\{/);
  assert.match(combined, /\.modal-root\.is-closing/);
  assert.match(combined, /\.summon-overlay\.is-closing/);
  assert.match(combined, /\.card-preview-modal\.is-closing/);
});
