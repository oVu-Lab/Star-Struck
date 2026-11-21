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
import { GachaSystem } from '../src/systems/GachaSystem.js';
import {
  ASTRA_CARD_STATIC_OPTIONS,
  AstraCardRegistry,
  buildAstraCardData,
  isAstraHero,
} from '../src/ui/AstraCardMount.js';
import { HeroScreen } from '../src/ui/HeroScreen.js';
import { FormationScreen } from '../src/ui/FormationScreen.js';
import { SummonScreen } from '../src/ui/SummonScreen.js';
import { ASSETS_CONFIG, PORTRAIT_CANVAS } from '../src/rendering/AssetManager.js';

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
  return {
    eventBus,
    saveManager,
    gameState,
    economySystem,
    heroSystem,
    formationSystem,
    cardSystem,
    progressionSystem,
    gachaSystem,
  };
}

/**
 * Lightweight mock DOM matching the selector patterns used across Star Struck screens.
 */
function createMockElement(tagName = 'div', attrs = {}) {
  const listeners = new Map();
  const children = [];
  const el = {
    tagName: tagName.toUpperCase(),
    attrs: { ...attrs },
    className: attrs.class || '',
    id: attrs.id || '',
    textContent: '',
    _innerHTML: '',
    children,
    set innerHTML(html) {
      this._innerHTML = String(html);
      this._parsed = parseHtmlElements(this._innerHTML);
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
    dispatchKey(key) {
      for (const fn of listeners.get('keydown') || []) {
        fn({
          key,
          target: this,
          currentTarget: this,
          preventDefault() {},
          stopPropagation() {},
        });
      }
    },
    appendChild(child) {
      children.push(child);
      return child;
    },
    closest() {
      return null;
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
    nodes.push(createMockElement(tag, attrs));
  }
  return nodes;
}

function matchesSelector(el, selector) {
  if (selector.startsWith('#')) {
    return el.id === selector.slice(1);
  }
  if (selector.startsWith('.')) {
    const cls = selector.slice(1);
    return el.className.split(/\s+/).includes(cls);
  }
  const attrMatch = selector.match(/^\[([a-zA-Z0-9_:-]+)(?:="([^"]*)")?\]$/);
  if (attrMatch) {
    const [, key, expected] = attrMatch;
    if (!(key in el.attrs)) return false;
    return expected === undefined ? true : el.attrs[key] === expected;
  }
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

function createFakeAstraCardClass() {
  const created = [];
  class FakeAstraCard {
    constructor(container, options) {
      this.container = container;
      this.options = options;
      this.data = { ...(options.data || {}) };
      this.destroyed = false;
      this.resized = 0;
      created.push(this);
    }
    getData() {
      return { ...this.data };
    }
    resize() {
      this.resized += 1;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  FakeAstraCard.created = created;
  return FakeAstraCard;
}

function createMockAudio() {
  return {
    playClick() {},
    playDeploy() {},
    playInvalid() {},
    playReward() {},
    playCardSelect() {},
    playSummon() {},
  };
}

function createMockAssets() {
  const bound = [];
  return {
    bound,
    bindImageElement(img, assetId) {
      bound.push({ img, assetId });
      img.setAttribute('data-bound-asset', assetId);
    },
  };
}

test('AstraCard module uses local Three.js r128 (no CDN) and exports static-card preset', async () => {
  const source = await fs.readFile(path.join(ROOT, 'astra-card/AstraCard.js'), 'utf8');
  assert.doesNotMatch(source, /cdn\.jsdelivr\.net/i, 'AstraCard.js must not import Three.js from external CDN');
  assert.match(source, /import\s+\*\s+as\s+THREE\s+from\s+['"]three['"]/, 'AstraCard.js must import local three package');

  assert.deepEqual(ASTRA_CARD_STATIC_OPTIONS, {
    autoplay: false,
    interactive: false,
    tilt: 0,
    animateEffects: true,
  });

  for (const rel of [
    'astra-card/AstraCard.css',
    'astra-card/assets/bg.jpeg',
    'astra-card/assets/character.png',
    'astra-card/assets/frame.jpeg',
    'astra-card/assets/depth.jpeg',
  ]) {
    const stat = await fs.stat(path.join(ROOT, rel));
    assert.ok(stat.size > 0, `Expected non-empty asset ${rel}`);
  }

  const indexHtml = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(indexHtml, /href="\/astra-card\/AstraCard\.css"/, 'index.html must link AstraCard.css');

  // Verify stationary camera framing fills slot cleanly (tilt === 0 uses tighter frustum)
  assert.match(
    source,
    /this\.o\.tilt === 0 \? Math\.max\(3\.12, 2\.08 \/ a\) : Math\.max\(3\.7, 2\.6 \/ a\)/,
    'Static AstraCard must frame tightly for 2:3 slots while keeping tilt clearance for tilted cards',
  );

  // Verify canvas layers above floor shadow in AstraCard.css
  const cardCss = await fs.readFile(path.join(ROOT, 'astra-card/AstraCard.css'), 'utf8');
  assert.match(cardCss, /\.astra-card__canvas\s*\{[^}]*z-index:\s*1;/, 'Canvas must stack above floor shadow');

  // Verify AssetManager maps hero_portrait_astra to real 1152x1744 standalone character PNG (not SVG placeholder)
  assert.equal(ASSETS_CONFIG.hero_portrait_astra.src, './astra-card/assets/character.png');
  assert.equal(ASSETS_CONFIG.hero_portrait_astra.format, 'png');
  assert.deepEqual(ASSETS_CONFIG.hero_portrait_astra.canvasSize, PORTRAIT_CANVAS);
  assert.equal(ASSETS_CONFIG.hero_bg_astra.src, './astra-card/assets/bg.jpeg');
});

test('AstraCardRegistry enforces static options, preserves game data, caps WebGL contexts, and cleans up', async () => {
  const registry = await loadRealRegistry();
  const astra = registry.heroesById.get('astra');
  assert.equal(isAstraHero(astra), true);
  assert.equal(isAstraHero('astra'), true);
  assert.equal(isAstraHero('kael'), false);

  const payload = buildAstraCardData(
    { ...astra, level: 7, copies: 3, owned: true },
    { activeCommander: true },
  );
  assert.equal(payload.id, 'astra');
  assert.equal(payload.name, 'ASTRA');
  assert.equal(payload.fullName, 'Astra Valen');
  assert.equal(payload.rarity, 'SSR');
  assert.equal(payload.level, 7);
  assert.equal(payload.copies, 3);
  assert.equal(payload.activeCommander, true);

  const FakeCard = createFakeAstraCardClass();
  const cardReg = new AstraCardRegistry({ maxInstances: 2, CardClass: FakeCard });
  const assets = createMockAssets();

  const c1 = cardReg.mount(createMockElement('div'), { hero: astra, assetManager: assets });
  const c2 = cardReg.mount(createMockElement('div'), { hero: astra, assetManager: assets });
  const fallbackSlot = createMockElement('div');
  const c3 = cardReg.mount(fallbackSlot, { hero: astra, assetManager: assets });

  assert.ok(c1 && c2);
  assert.equal(c3, null, 'Third mount beyond maxInstances=2 must fall back instead of allocating WebGL context');
  assert.equal(cardReg.count, 2);
  assert.equal(FakeCard.created.length, 2);
  assert.equal(FakeCard.created[0].options.autoplay, false);
  assert.equal(FakeCard.created[0].options.interactive, false);
  assert.equal(FakeCard.created[0].options.tilt, 0);
  assert.equal(FakeCard.created[0].options.animateEffects, true);
  assert.equal(assets.bound.length, 1);
  assert.equal(assets.bound[0].assetId, 'hero_portrait_astra');

  cardReg.resizeAll();
  assert.equal(c1.resized, 1);
  assert.equal(c2.resized, 1);

  cardReg.destroyAll();
  assert.equal(cardReg.count, 0);
  assert.equal(c1.destroyed, true);
  assert.equal(c2.destroyed, true);
});

test('HeroScreen mounts static AstraCard for Astra and destroys it on hero switch & unmount', async () => {
  const prevDocument = globalThis.document;
  globalThis.document = {
    createElement: (tag) => createMockElement(tag),
  };

  try {
    const registry = await loadRealRegistry();
    const { eventBus, gameState, heroSystem, formationSystem } = createSystems(registry);
    const FakeCard = createFakeAstraCardClass();
    const assets = createMockAssets();
    const navigations = [];

    const screen = new HeroScreen({
      eventBus,
      gameState,
      heroSystem,
      formationSystem,
      assetManager: assets,
      audioManager: createMockAudio(),
      screenManager: { navigate: (id) => navigations.push(id) },
      notify() {},
      AstraCardClass: FakeCard,
    });

    const container = createMockElement('div');
    gameState.setUI({ selectedHeroId: 'astra', heroFilter: 'ALL' });
    screen.mount(container);

    assert.equal(FakeCard.created.length, 1, 'Expected 1 AstraCard instance on HeroScreen for Astra');
    const firstCard = FakeCard.created[0];
    assert.equal(firstCard.destroyed, false);
    assert.equal(firstCard.options.autoplay, false);
    assert.equal(firstCard.options.interactive, false);
    assert.equal(firstCard.options.tilt, 0);
    assert.equal(firstCard.options.animateEffects, true);
    assert.equal(firstCard.data.fullName, 'Astra Valen');
    assert.equal(firstCard.data.name, 'ASTRA');
    assert.equal(container.querySelector('#hero-detail-img'), null);

    // Switch to Kael: AstraCard must be destroyed and portrait img restored
    gameState.setUI({ selectedHeroId: 'kael' });
    screen.render();
    assert.equal(firstCard.destroyed, true, 'AstraCard must be destroyed when switching away from Astra');
    assert.equal(FakeCard.created.length, 1, 'Non-Astra commander must not mount AstraCard');
    assert.ok(container.querySelector('#hero-detail-img'), 'Non-Astra commander must render portrait image');

    // Switch back to Astra, then unmount
    gameState.setUI({ selectedHeroId: 'astra' });
    screen.render();
    assert.equal(FakeCard.created.length, 2);
    const secondCard = FakeCard.created[1];
    assert.equal(secondCard.destroyed, false);

    screen.unmount();
    assert.equal(secondCard.destroyed, true, 'AstraCard must be destroyed on HeroScreen unmount');
  } finally {
    globalThis.document = prevDocument;
  }
});

test('FormationScreen mounts static AstraCard for Active Commander Astra, handles click navigation, and cleans up on tab switch/unmount', async () => {
  const registry = await loadRealRegistry();
  const {
    eventBus,
    gameState,
    heroSystem,
    formationSystem,
    cardSystem,
    economySystem,
    progressionSystem,
  } = createSystems(registry);
  const FakeCard = createFakeAstraCardClass();
  const navigations = [];

  // Ensure a second owned commander exists so we can switch commanders
  heroSystem.grantHero('kael');

  const screen = new FormationScreen({
    eventBus,
    gameState,
    dataRegistry: registry,
    heroSystem,
    formationSystem,
    cardSystem,
    economySystem,
    progressionSystem,
    assetManager: createMockAssets(),
    audioManager: createMockAudio(),
    screenManager: { navigate: (id) => navigations.push(id) },
    notify() {},
    AstraCardClass: FakeCard,
  });

  const container = createMockElement('div');
  gameState.setUI({ formationTab: 'squad' });
  screen.mount(container);

  assert.equal(FakeCard.created.length, 1, 'Formation Squad tab should mount AstraCard when Astra is active');
  const firstCard = FakeCard.created[0];
  assert.equal(firstCard.options.autoplay, false);
  assert.equal(firstCard.options.interactive, false);
  assert.equal(firstCard.options.tilt, 0);
  assert.equal(firstCard.options.animateEffects, true);
  assert.equal(firstCard.options.selected, false, 'Formation single commander preview must not enable yellow .is-selected box');
  assert.equal(firstCard.options.selectable, true);

  // Clicking the AstraCard opens Astra's dossier on Heroes screen
  firstCard.options.onClick(firstCard.getData(), firstCard);
  assert.deepEqual(navigations, ['heroes']);
  assert.equal(gameState.ui.selectedHeroId, 'astra');

  // Switching to Deck tab destroys the card
  gameState.setUI({ formationTab: 'deck' });
  screen.render();
  assert.equal(firstCard.destroyed, true, 'Switching away from Squad tab must destroy AstraCard');

  // Returning to Squad tab mounts a fresh card
  gameState.setUI({ formationTab: 'squad' });
  screen.render();
  assert.equal(FakeCard.created.length, 2);
  const secondCard = FakeCard.created[1];
  assert.equal(secondCard.destroyed, false);

  // Switching Active Commander to Kael destroys AstraCard
  formationSystem.setCommander('kael');
  assert.equal(secondCard.destroyed, true, 'Switching Active Commander away from Astra must destroy AstraCard');
  assert.equal(FakeCard.created.length, 2);

  // Switch back to Astra and unmount
  formationSystem.setCommander('astra');
  assert.equal(FakeCard.created.length, 3);
  const thirdCard = FakeCard.created[2];
  screen.unmount();
  assert.equal(thirdCard.destroyed, true, 'FormationScreen unmount must destroy AstraCard');
});

test('SummonScreen mounts static AstraCard only for Astra pull results, enforces WebGL cap, preserves click inspection, and cleans up', async () => {
  const registry = await loadRealRegistry();
  const {
    eventBus,
    gameState,
    economySystem,
    gachaSystem,
  } = createSystems(registry);
  const FakeCard = createFakeAstraCardClass();
  const assets = createMockAssets();
  const navigations = [];

  const screen = new SummonScreen({
    eventBus,
    gameState,
    dataRegistry: registry,
    gachaSystem,
    economySystem,
    assetManager: assets,
    audioManager: createMockAudio(),
    screenManager: { navigate: (id) => navigations.push(id) },
    notify() {},
    AstraCardClass: FakeCard,
  });

  const container = createMockElement('div');
  screen.mount(container);

  // Main summon stage must NOT mount AstraCard (banner illustration remains #banner-featured-img)
  assert.equal(FakeCard.created.length, 0, 'Main summon banner must not mount AstraCard');
  assert.ok(container.querySelector('#banner-featured-img'), 'Main summon banner illustration must be preserved');

  // Simulate a 10x result containing 8 Astra pulls + 2 Kael pulls to test both selective rendering and the 6-card WebGL cap
  const astraDef = registry.heroesById.get('astra');
  const kaelDef = registry.heroesById.get('kael');
  const mixedResults = [
    ...Array.from({ length: 8 }, (_, i) => ({
      itemType: 'hero',
      rarity: 'SSR',
      heroId: 'astra',
      hero: astraDef,
      isNew: i === 0,
    })),
    { itemType: 'hero', rarity: 'R', heroId: 'kael', hero: kaelDef, isNew: false },
    { itemType: 'hero', rarity: 'R', heroId: 'kael', hero: kaelDef, isNew: false },
  ];

  gameState.setUI({ lastSummonResults: mixedResults });
  screen._overlayMode = 'results';
  screen.render();

  assert.equal(FakeCard.created.length, 6, '10x overlay must cap simultaneous AstraCard WebGL instances at 6');
  for (const card of FakeCard.created) {
    assert.equal(card.options.autoplay, false);
    assert.equal(card.options.interactive, false);
    assert.equal(card.options.tilt, 0);
    assert.equal(card.options.animateEffects, true);
    assert.equal(card.data.fullName, 'Astra Valen');
  }

  const resultCards = container.querySelectorAll('.summon-result-card');
  assert.equal(resultCards.length, 10, 'All 10 pull result cards must still render');

  // Clicking the first Astra result card navigates to heroes and destroys all WebGL instances
  resultCards[0].click();
  assert.deepEqual(navigations, ['heroes']);
  assert.equal(gameState.ui.selectedHeroId, 'astra');
  assert.ok(
    FakeCard.created.every((c) => c.destroyed),
    'All AstraCard instances must be destroyed when inspecting a pull result',
  );

  // Re-open results and close overlay: all newly mounted cards must be destroyed
  screen._overlayMode = 'results';
  screen.render();
  assert.equal(FakeCard.created.length, 12);
  const closeBtn = container.querySelector('[data-close-overlay]');
  closeBtn.click();
  assert.ok(
    FakeCard.created.every((c) => c.destroyed),
    'Closing summon results overlay must destroy all AstraCard instances',
  );

  screen.unmount();
});
