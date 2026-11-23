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
  ASTRA_CARD_PREVIEW_OPTIONS,
  ASTRA_CARD_STATIC_OPTIONS,
  AstraCardRegistry,
  buildAstraCardData,
  hasCollectibleCommanderCard,
  isAstraHero,
  registerCollectibleCommanderCard,
} from '../src/ui/AstraCardMount.js';
import { HomeScreen } from '../src/ui/HomeScreen.js';
import { HeroScreen } from '../src/ui/HeroScreen.js';
import { FormationScreen } from '../src/ui/FormationScreen.js';
import { SummonScreen } from '../src/ui/SummonScreen.js';
import { BattleScreen } from '../src/ui/BattleScreen.js';
import { BattleRenderer } from '../src/rendering/BattleRenderer.js';
import { Battlefield } from '../src/battle/Battlefield.js';
import { SkillSystem } from '../src/battle/SkillSystem.js';
import { BATTLE_PHASES } from '../src/battle/BattleManager.js';
import * as THREE from 'three';
import { AstraCard } from '../astra-cardtemplate/AstraCard.js';
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
    hidden: false,
    disabled: false,
    style: {},
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
    removeEventListener(type, fn) {
      const list = listeners.get(type);
      if (!list) return;
      const idx = list.indexOf(fn);
      if (idx !== -1) list.splice(idx, 1);
    },
    getListenerCount(type) {
      return (listeners.get(type) || []).length;
    },
    dispatchPointer(type, props = {}) {
      for (const fn of [...(listeners.get(type) || [])]) {
        fn({
          pointerId: 1,
          pointerType: 'mouse',
          button: 0,
          clientX: 0,
          clientY: 0,
          target: this,
          currentTarget: this,
          preventDefault() {},
          stopPropagation() {},
          ...props,
        });
      }
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
      child.parentNode = this;
      children.push(child);
      return child;
    },
    remove() {
      if (this.parentNode?.children) {
        const idx = this.parentNode.children.indexOf(this);
        if (idx !== -1) this.parentNode.children.splice(idx, 1);
        this.parentNode = null;
      }
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
      this.options = { ...options };
      this.data = { ...(options.data || {}) };
      this.destroyed = false;
      this.paused = false;
      this.resized = 0;
      created.push(this);
    }
    getData() {
      return { ...this.data };
    }
    setOptions(next) {
      this.options = { ...this.options, ...(next || {}) };
    }
    pause() {
      this.paused = true;
    }
    resume() {
      this.paused = false;
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
  const source = await fs.readFile(path.join(ROOT, 'astra-cardtemplate/AstraCard.js'), 'utf8');
  assert.doesNotMatch(source, /cdn\.jsdelivr\.net/i, 'AstraCard.js must not import Three.js from external CDN');
  assert.match(source, /import\s+\*\s+as\s+THREE\s+from\s+['"]three['"]/, 'AstraCard.js must import local three package');
  assert.doesNotMatch(
    source,
    /hs\(\s*floor\(\s*u\s*\*\s*vec2\(\s*220\.?\s*,\s*330\.?\s*\)\s*\)/,
    'AstraCard.js flow-dust shader must not sample uninterpolated floor-quantized grid hash (causes 4x4 mosaic blocks)',
  );
  assert.match(
    source,
    /\bvn\(/,
    'AstraCard.js flow-dust shader must use smooth interpolated value noise vn()',
  );

  // Verify unrelated holographic/relief/flare shaders remain intact
  assert.match(source, /const VS = `/, 'AstraCard.js must preserve vertex shader VS');
  assert.match(source, /const COM = `/, 'AstraCard.js must preserve common shader COM');
  assert.match(source, /const FS = COM \+ `/, 'AstraCard.js must preserve main card shader FS');
  assert.match(source, /const SFS = COM \+ `/, 'AstraCard.js must preserve stacked edge shader SFS');
  assert.match(source, /float cr\(vec2 d\)/, 'AstraCard.js must preserve cr(d) star flares');

  // Verify upgraded holographic glitter particle shaders (PVS/PFS) and stratified meta attribute
  assert.match(source, /attribute vec4 meta;/, 'AstraCard.js PVS must accept vec4 meta attribute');
  assert.match(source, /g\.setAttribute\('meta'/, 'AstraCard.js pts() must populate meta attribute');
  assert.match(source, /vec3 pal\(float x\)/, 'AstraCard.js PFS must define iridescent 5-tone palette');
  assert.match(source, /if\(t<\.60\).*else if\(t<\.85\).*else if\(t<\.95\)/s, 'AstraCard.js PFS must differentiate 60/25/10/5 particle types');
  assert.doesNotMatch(source, /vec3\(1\.,\.88,\.62\)/, 'AstraCard.js PFS must not revert to solid monochrome circle');

  assert.deepEqual(ASTRA_CARD_STATIC_OPTIONS, {
    autoplay: false,
    interactive: false,
    tilt: 0,
    animateEffects: true,
  });

  for (const rel of [
    'astra-cardtemplate/AstraCard.css',
    'astra-cardtemplate/assets-astra/bg.jpeg',
    'astra-cardtemplate/assets-astra/character.png',
    'astra-cardtemplate/assets-astra/frame.png',
    'astra-cardtemplate/assets-astra/depth.jpeg',
  ]) {
    const stat = await fs.stat(path.join(ROOT, rel));
    assert.ok(stat.size > 0, `Expected non-empty asset ${rel}`);
  }

  const indexHtml = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(indexHtml, /href="\/astra-cardtemplate\/AstraCard\.css"/, 'index.html must link AstraCard.css');

  // Verify stationary camera framing fills slot cleanly (tilt === 0 uses tighter frustum)
  assert.match(
    source,
    /this\.o\.tilt === 0 \? Math\.max\(3\.12, 2\.08 \/ a\) : Math\.max\(3\.7, 2\.6 \/ a\)/,
    'Static AstraCard must frame tightly for 2:3 slots while keeping tilt clearance for tilted cards',
  );

  // Verify canvas layers above floor shadow in AstraCard.css
  const cardCss = await fs.readFile(path.join(ROOT, 'astra-cardtemplate/AstraCard.css'), 'utf8');
  assert.match(cardCss, /\.astra-card__canvas\s*\{[^}]*z-index:\s*1;/, 'Canvas must stack above floor shadow');

  // Verify AssetManager maps hero_portrait_astra to real 1152x1744 standalone character PNG (not SVG placeholder)
  assert.equal(ASSETS_CONFIG.hero_portrait_astra.src, './astra-cardtemplate/assets-astra/character.png');
  assert.equal(ASSETS_CONFIG.hero_portrait_astra.format, 'png');
  assert.deepEqual(ASSETS_CONFIG.hero_portrait_astra.canvasSize, PORTRAIT_CANVAS);
  assert.equal(ASSETS_CONFIG.hero_bg_astra.src, './astra-cardtemplate/assets-astra/bg.jpeg');
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

test('HeroScreen renders frameless Astra card without redundant caption, supports reusable interactive Card Preview Mode, and cleans up', async () => {
  const prevDocument = globalThis.document;
  const prevWindow = globalThis.window;
  const winListeners = new Map();
  globalThis.document = {
    createElement: (tag) => createMockElement(tag),
  };
  globalThis.window = {
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, []);
      winListeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = winListeners.get(type);
      if (!list) return;
      const idx = list.indexOf(fn);
      if (idx !== -1) list.splice(idx, 1);
    },
    dispatchKey(key) {
      for (const fn of [...(winListeners.get('keydown') || [])]) {
        fn({ key, preventDefault() {} });
      }
    },
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

    // 1. Frameless card display & removal of redundant below-card caption
    assert.equal(FakeCard.created.length, 1, 'Expected 1 AstraCard instance on HeroScreen for Astra');
    const firstCard = FakeCard.created[0];
    assert.equal(firstCard.destroyed, false);
    assert.equal(firstCard.options.autoplay, false);
    assert.equal(firstCard.options.interactive, false);
    assert.equal(firstCard.options.tilt, 0);
    assert.equal(firstCard.options.animateEffects, true);
    assert.equal(firstCard.options.selectable, true);
    assert.equal(firstCard.options.selected, false);
    assert.equal(firstCard.data.fullName, 'Astra Valen');
    assert.equal(firstCard.data.name, 'ASTRA');
    assert.equal(container.querySelector('#hero-detail-img'), null);
    assert.equal(
      container.querySelector('.hero-art-stage__scrim'),
      null,
      'Redundant below-card caption scrim must be removed for collectible Commander cards',
    );
    assert.equal(
      container.querySelector('.hero-art-stage__card-frame'),
      null,
      'Extra outer card-frame slot wrapper must not be rendered around collectible card',
    );
    assert.ok(
      container.querySelector('.hero-art-stage--collectible'),
      'Collectible card stage must use frameless .hero-art-stage--collectible layout',
    );
    assert.ok(
      container.querySelector('.hero-dossier'),
      'Right dossier panel beside the card must remain intact',
    );
    assert.doesNotMatch(
      container.innerHTML,
      /High Fantasy Knighthood/,
      'Redundant motif caption must not be rendered below Astra collectible card',
    );

    // 2. Click collectible card -> enters Interactive Card Preview Mode
    firstCard.options.onClick(firstCard.getData(), firstCard);
    assert.equal(firstCard.paused, true, 'Stage card must pause while preview modal is active');
    assert.equal(FakeCard.created.length, 2, 'Opening preview must mount interactive preview card');
    const previewCard = FakeCard.created[1];
    assert.deepEqual(
      {
        autoplay: previewCard.options.autoplay,
        interactive: previewCard.options.interactive,
        tilt: previewCard.options.tilt,
        animateEffects: previewCard.options.animateEffects,
      },
      ASTRA_CARD_PREVIEW_OPTIONS,
      'Preview card must enable interactive mouse 3D tilt/parallax without autoplay',
    );
    const modal = container.querySelector('#commander-card-preview-modal');
    assert.ok(modal, 'Interactive preview modal must mount in container');

    // Close preview via Close button -> destroys preview card & restores static stage card
    const closeBtn = modal.querySelector('#btn-close-card-preview');
    assert.ok(closeBtn, 'Preview modal must provide clear close button');
    closeBtn.click();
    assert.equal(previewCard.destroyed, true, 'Closing preview must destroy preview WebGL instance');
    assert.equal(container.querySelector('#commander-card-preview-modal'), null);
    assert.equal(firstCard.paused, false, 'Closing preview must resume stage card');
    assert.equal(firstCard.options.interactive, false, 'Stage card must stay non-interactive after closing preview');
    assert.equal(firstCard.options.tilt, 0, 'Stage card must stay stationary (tilt: 0) after closing preview');
    assert.equal(firstCard.options.autoplay, false);

    // Re-open preview and exit via Escape key
    firstCard.options.onClick(firstCard.getData(), firstCard);
    assert.equal(FakeCard.created.length, 3);
    const escPreviewCard = FakeCard.created[2];
    globalThis.window.dispatchKey('Escape');
    assert.equal(escPreviewCard.destroyed, true, 'Pressing Escape must close preview and destroy instance');
    assert.equal(container.querySelector('#commander-card-preview-modal'), null);
    assert.equal(firstCard.paused, false);

    // 3. Switch to Kael (non-collectible commander): AstraCard destroyed, portrait stage & scrim preserved
    gameState.setUI({ selectedHeroId: 'kael' });
    screen.render();
    assert.equal(firstCard.destroyed, true, 'AstraCard must be destroyed when switching away from Astra');
    assert.equal(FakeCard.created.length, 3, 'Non-collectible commander must not mount WebGL card');
    assert.ok(container.querySelector('#hero-detail-img'), 'Non-collectible commander must render portrait image');
    assert.ok(container.querySelector('.hero-art-stage__scrim'), 'Non-collectible commander must retain portrait scrim');

    // 4. Switch back to Astra, open preview, then unmount -> both stage and preview cards destroyed
    gameState.setUI({ selectedHeroId: 'astra' });
    screen.render();
    const stageCard2 = FakeCard.created[3];
    stageCard2.options.onClick(stageCard2.getData(), stageCard2);
    const previewCard3 = FakeCard.created[4];
    screen.unmount();
    assert.equal(stageCard2.destroyed, true, 'Stage card must be destroyed on HeroScreen unmount');
    assert.equal(previewCard3.destroyed, true, 'Open preview card must be destroyed on HeroScreen unmount');
    assert.equal((winListeners.get('keydown') || []).length, 0, 'Escape listener must be removed on unmount');
  } finally {
    globalThis.document = prevDocument;
    globalThis.window = prevWindow;
  }
});

test('Commander collectible card preview registry is reusable for future commanders (not hardcoded to Astra)', async () => {
  const prevDocument = globalThis.document;
  globalThis.document = {
    createElement: (tag) => createMockElement(tag),
  };

  try {
    const customHero = {
      id: 'test_commander_nova',
      name: 'Nova Valen',
      title: 'Solar Arbiter',
      rarity: 'SSR',
      role: 'Tactician',
      faction: 'Celestial Order',
      realm: 'Celestial Order',
      owned: true,
      level: 5,
      copies: 2,
      biography: 'Test commander for reusable preview verification.',
      portraitAssetId: 'hero_portrait_astra',
      passiveSkill: { name: 'Solar Aura', description: 'Test passive' },
      ultimateSkill: { name: 'Supernova', description: 'Test ultimate', energyCost: 100 },
    };

    assert.equal(hasCollectibleCommanderCard(customHero), false);
    registerCollectibleCommanderCard(customHero.id, {
      displayName: 'NOVA',
      glow: '#ffaa44',
    });
    assert.equal(hasCollectibleCommanderCard(customHero), true);

    const FakeCard = createFakeAstraCardClass();
    const registry = new AstraCardRegistry({ CardClass: FakeCard });
    const slot = createMockElement('div');
    const previewCard = registry.mount(slot, {
      hero: customHero,
      mode: 'preview',
    });

    assert.ok(previewCard, 'Registered future Commander must mount through shared AstraCardRegistry');
    assert.equal(previewCard.data.id, 'test_commander_nova');
    assert.equal(previewCard.data.name, 'NOVA');
    assert.equal(previewCard.options.glow, '#ffaa44');
    assert.equal(previewCard.options.interactive, true);
    assert.equal(previewCard.options.tilt, 1);
    assert.equal(previewCard.options.autoplay, false);
    registry.destroyAll();
  } finally {
    globalThis.document = prevDocument;
  }
});

test('HomeScreen keeps default Commanders button untouched without mounting AstraCard', async () => {
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
  const assets = createMockAssets();
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
    audioManager: createMockAudio(),
    screenManager: { navigate() {} },
    openGuide() {},
  });

  const container = createMockElement('div');
  screen.mount(container);

  const commandersBtn = container.querySelector('[data-nav="heroes"]');
  assert.ok(commandersBtn, 'HomeScreen must preserve default Commanders navigation button');
  assert.equal(
    container.querySelector('[data-astra-card-slot]'),
    null,
    'HomeScreen must not replace Commanders button or portrait with AstraCard',
  );
  assert.ok(
    container.querySelector('#home-commander-img'),
    'HomeScreen must preserve full-bleed commander showcase portrait',
  );

  screen.unmount();
});

test('BattleScreen and BattleRenderer bind enhanced ultimate-ready effects strictly to actual battle ultimateEnergy state', async () => {
  const prevDocument = globalThis.document;
  const prevWindow = globalThis.window;
  globalThis.document = {
    createElement: (tag) => createMockElement(tag),
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
  };

  try {
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
      status: 'running',
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

    const battleManagerStub = {
      startSession() {},
      stopSession() {},
      getSelectedPrepUnitUid() {
        return null;
      },
      getPrepUnitByUid() {
        return null;
      },
      triggerUltimate() {
        return skillSystem.activateUltimate({});
      },
    };

    const screen = new BattleScreen({
      eventBus,
      gameState,
      dataRegistry: registry,
      heroSystem,
      formationSystem,
      cardSystem,
      progressionSystem,
      battleManager: battleManagerStub,
      assetManager: createMockAssets(),
      audioManager: createMockAudio(),
      screenManager: { navigate() {} },
      notify() {},
    });

    const container = createMockElement('div');
    screen.mount(container);

    const ultBtn = container.querySelector('#btn-trigger-ultimate');
    const cmdConsole = container.querySelector('#commander-console');
    assert.ok(ultBtn && cmdConsole);
    assert.ok(container.querySelector('.dock-commander-card__fx'), 'Ultimate button must contain enhanced FX overlay');
    assert.ok(container.querySelector('.dock-commander-card__foil'), 'Ultimate FX must include foil reflection layer');
    assert.ok(container.querySelector('.dock-commander-card__glitter'), 'Ultimate FX must include glitter layer');
    assert.equal(
      container.querySelectorAll('.dock-commander-card__flare').length,
      3,
      'Ultimate FX must include 3 star flare accents',
    );

    // Charging during preparation -> NOT ready
    assert.equal(ultBtn.getAttribute('data-ult-ready'), 'false');
    assert.equal(ultBtn.classList.contains('is-ult-ready'), false);
    assert.equal(ultBtn.disabled, true);

    // Even at 100 energy during PREPARATION -> NOT ready
    gameState.setBattle({ ultimateEnergy: 100, phase: BATTLE_PHASES.PREPARATION });
    screen._syncHud();
    assert.equal(ultBtn.getAttribute('data-ult-ready'), 'false');
    assert.equal(ultBtn.classList.contains('is-ult-ready'), false);

    // Active combat at 99 energy -> NOT ready
    gameState.setBattle({ ultimateEnergy: 99, phase: BATTLE_PHASES.ACTIVE_COMBAT });
    screen._syncHud();
    assert.equal(ultBtn.getAttribute('data-ult-ready'), 'false');
    assert.equal(ultBtn.classList.contains('is-ult-ready'), false);

    // Active combat at 100 energy -> READY!
    gameState.setBattle({ ultimateEnergy: 100, phase: BATTLE_PHASES.ACTIVE_COMBAT });
    screen._syncHud();
    assert.equal(ultBtn.getAttribute('data-ult-ready'), 'true');
    assert.equal(ultBtn.classList.contains('is-ult-ready'), true);
    assert.equal(cmdConsole.classList.contains('is-ult-ready'), true);
    assert.equal(ultBtn.disabled, false);

    // Cast real ultimate via SkillSystem -> ultimateEnergy resets to 0 -> immediately returns to normal
    const res = skillSystem.activateUltimate({});
    assert.equal(res.ok, true);
    assert.equal(gameState.battle.ultimateEnergy, 0);
    screen._syncHud();
    assert.equal(ultBtn.getAttribute('data-ult-ready'), 'false');
    assert.equal(ultBtn.classList.contains('is-ult-ready'), false);
    assert.equal(cmdConsole.classList.contains('is-ult-ready'), false);
    assert.equal(ultBtn.disabled, true);

    screen.unmount();

    // Verify BattleRenderer._drawCommanderDais invokes star flares strictly when ultimate is ready
    const mockGrad = { addColorStop() {} };
    const noop = () => {};
    const mockCtx = {
      save: noop,
      restore: noop,
      translate: noop,
      rotate: noop,
      scale: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      arc: noop,
      ellipse: noop,
      fill: noop,
      stroke: noop,
      fillRect: noop,
      fillText: noop,
      drawImage: noop,
      setLineDash: noop,
      clip: noop,
      createRadialGradient: () => mockGrad,
      createLinearGradient: () => mockGrad,
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
    };
    const bf = new Battlefield({
      balance: registry.balance,
      terrainConfig: registry.terrains[0],
    });
    const renderer = new BattleRenderer({
      assetManager: { getImageElement: () => null },
      animationManager: { getShakeOffset: () => ({ x: 0, y: 0 }), getElapsed: () => 1.2 },
      particleSystem: null,
      gameState,
    });
    const astra = heroSystem.getHeroById('astra');

    let flareCalls = 0;
    const origFlare = renderer._drawStarFlare.bind(renderer);
    renderer._drawStarFlare = (...args) => {
      flareCalls += 1;
      return origFlare(...args);
    };

    // Charging (40/100) -> zero star flares
    renderer._drawCommanderDais(mockCtx, bf, 1024, 600, astra, 40, 1.2, false, BATTLE_PHASES.ACTIVE_COMBAT);
    assert.equal(flareCalls, 0, 'Charging dais must not render ultimate-ready star flares');

    // Ready (100/100 in active combat) -> 3 star flares rendered
    renderer._drawCommanderDais(mockCtx, bf, 1024, 600, astra, 100, 1.2, false, BATTLE_PHASES.ACTIVE_COMBAT);
    assert.equal(flareCalls, 3, 'Ultimate-ready dais must render 3 celestial star flares');

    // After ultimate used (0/100) -> back to zero star flares immediately
    flareCalls = 0;
    renderer._drawCommanderDais(mockCtx, bf, 1024, 600, astra, 0, 1.5, false, BATTLE_PHASES.ACTIVE_COMBAT);
    assert.equal(flareCalls, 0, 'Post-cast dais must immediately restore normal non-ready rendering');
  } finally {
    globalThis.document = prevDocument;
    globalThis.window = prevWindow;
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

test('FormationScreen Squad tab places vertical scrollable Commander selector inside left sidebar and aligns board to top', async () => {
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

  heroSystem.grantHero('kael');
  heroSystem.grantHero('lyra');

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
    screenManager: { navigate() {} },
    notify() {},
    AstraCardClass: FakeCard,
  });

  const container = createMockElement('div');
  gameState.setUI({ formationTab: 'squad' });
  screen.mount(container);

  // Verify commander selector is inside .formation-board__commander (left sidebar) and not a bottom strip
  const bodyEl = container.querySelector('#formation-workspace-body');
  const html = bodyEl?.innerHTML || '';
  const sidebarStart = html.indexOf('class="formation-board__commander"');
  const lanesStart = html.indexOf('id="formation-unit-slots"');
  const selectorStart = html.indexOf('id="commander-selector-row"');
  assert.ok(sidebarStart > -1 && lanesStart > -1 && selectorStart > -1);
  assert.ok(
    selectorStart > sidebarStart && selectorStart < lanesStart,
    'Commander selector must be nested inside the left .formation-board__commander sidebar before .formation-lanes',
  );
  assert.equal(
    container.querySelector('.commander-picker-strip'),
    null,
    'Old bottom horizontal .commander-picker-strip must be removed',
  );

  const options = container.querySelectorAll('.commander-option');
  assert.equal(
    options.length,
    heroSystem.getOwnedHeroes().length,
    'Expected vertical option row for each owned commander',
  );
  const astraOpt = container.querySelector('[data-commander-id="astra"]');
  const kaelOpt = container.querySelector('[data-commander-id="kael"]');
  assert.equal(astraOpt.classList.contains('is-active'), true);
  assert.equal(astraOpt.getAttribute('aria-selected'), 'true');
  assert.equal(kaelOpt.classList.contains('is-active'), false);

  // Clicking a vertical commander option updates the active commander immediately
  kaelOpt.click();
  assert.equal(heroSystem.getActiveCommander().id, 'kael');
  const updatedKaelOpt = container.querySelector('[data-commander-id="kael"]');
  const updatedAstraOpt = container.querySelector('[data-commander-id="astra"]');
  assert.equal(updatedKaelOpt.classList.contains('is-active'), true);
  assert.equal(updatedKaelOpt.getAttribute('aria-selected'), 'true');
  assert.equal(updatedAstraOpt.classList.contains('is-active'), false);

  // Verify CSS layout rules enforce top alignment and vertical scrollable list
  const css = await fs.readFile(path.join(ROOT, 'styles/components.css'), 'utf8');
  assert.match(css, /\.formation-board\s*\{[^}]*align-items:\s*start;/, '.formation-board must top-align content');
  assert.match(
    css,
    /\.formation-board__commander\s*\{[^}]*justify-content:\s*flex-start;/,
    '.formation-board__commander must top-align sidebar content',
  );
  assert.match(
    css,
    /\.commander-picker-list\s*\{[^}]*flex-direction:\s*column;[^}]*overflow-y:\s*auto;/,
    '.commander-picker-list must arrange commanders vertically with internal scrolling',
  );

  screen.unmount();
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

test('AstraCard localized zoom inspection: renders unclipped across viewport sizes, keeps all 4 edges visible, zooms face/sword/armor/background, resets on second click anywhere, preserves drag, and cleans up', async () => {
  const prevDocument = globalThis.document;
  const prevWindow = globalThis.window;
  const prevHTMLElement = globalThis.HTMLElement;
  const prevRAF = globalThis.requestAnimationFrame;
  const prevCancelRAF = globalThis.cancelAnimationFrame;

  class TestMockElement {
    constructor(tag = 'div') {
      const inner = createMockElement(tag);
      Object.defineProperties(this, Object.getOwnPropertyDescriptors(inner));
      this._rect = { left: 710, top: 165, width: 500, height: 750 };
      this.clientWidth = 500;
      this.clientHeight = 750;
      this.style.setProperty = (k, v) => { this.style[k] = v; };
      this.style.removeProperty = (k) => { delete this.style[k]; };
    }
    getBoundingClientRect() {
      return this._rect;
    }
    removeAttribute(name) {
      delete this.attrs[name];
      if (name === 'class') this.className = '';
      if (name === 'id') this.id = '';
    }
    dispatchEvent() {
      return true;
    }
  }

  const winListeners = new Map();
  const docListeners = new Map();
  let rafId = 1;

  globalThis.HTMLElement = TestMockElement;
  globalThis.requestAnimationFrame = () => ++rafId;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.document = {
    hidden: false,
    head: new TestMockElement('head'),
    createElement: (tag) => new TestMockElement(tag),
    getElementById: () => null,
    querySelectorAll: () => [],
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = docListeners.get(type);
      if (!list) return;
      const idx = list.indexOf(fn);
      if (idx !== -1) list.splice(idx, 1);
    },
  };
  globalThis.window = {
    devicePixelRatio: 2,
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, []);
      winListeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = winListeners.get(type);
      if (!list) return;
      const idx = list.indexOf(fn);
      if (idx !== -1) list.splice(idx, 1);
    },
    dispatchPointer(type, props = {}) {
      for (const fn of [...(winListeners.get(type) || [])]) {
        fn({
          pointerId: 1,
          pointerType: 'mouse',
          button: 0,
          clientX: 0,
          clientY: 0,
          preventDefault() {},
          ...props,
        });
      }
    },
  };

  // Prevent async _init from touching real WebGL in Node while exercising real AstraCard + Three.js scene/camera/raycaster
  const origInit = AstraCard.prototype._init;
  AstraCard.prototype._init = function mockInitNoGL() {};

  const setViewportGeometry = (card, vw, vh, slotW, slotH) => {
    const slotLeft = (vw - slotW) / 2;
    const slotTop = (vh - slotH) / 2;
    card.root.clientWidth = slotW;
    card.root.clientHeight = slotH;
    card.root._rect = { left: slotLeft, top: slotTop, width: slotW, height: slotH };
    card.canvas.clientWidth = vw;
    card.canvas.clientHeight = vh;
    card.canvas._rect = { left: 0, top: 0, width: vw, height: vh };
    card.canvas.getBoundingClientRect = () => card.canvas._rect;
    card._fit();
  };

  const projectLocalToClient = (card, localX, localY) => {
    card.card.updateMatrixWorld();
    card.cam.updateMatrixWorld();
    const v = new THREE.Vector3(localX, localY, 0).applyMatrix4(card.card.matrixWorld).project(card.cam);
    const rect = card.canvas.getBoundingClientRect();
    return {
      clientX: rect.left + ((v.x + 1) / 2) * rect.width,
      clientY: rect.top + ((1 - v.y) / 2) * rect.height,
    };
  };

  const getProjectedCardBounds = (card) => {
    const corners = [
      [-1, -1.5],
      [1, -1.5],
      [1, 1.5],
      [-1, 1.5],
    ].map(([x, y]) => projectLocalToClient(card, x, y));
    const xs = corners.map((c) => c.clientX);
    const ys = corners.map((c) => c.clientY);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  };

  const advanceFrames = (card, count = 60, stepMs = 16.67) => {
    let ts = performance.now();
    for (let i = 0; i < count; i++) {
      ts += stepMs;
      card._tick(ts);
    }
  };

  try {
    // Verify CSS removes container clipping and transform containing block
    const cardCss = await fs.readFile(path.join(ROOT, 'astra-cardtemplate/AstraCard.css'), 'utf8');
    const componentsCss = await fs.readFile(path.join(ROOT, 'styles/components.css'), 'utf8');
    assert.match(cardCss, /\.astra-card--zoomable\s*\{[^}]*overflow:\s*visible;/);
    assert.match(cardCss, /\.astra-card--zoomable\s+\.astra-card__canvas\s*\{[^}]*position:\s*fixed;[^}]*width:\s*100vw;[^}]*height:\s*100vh;/);
    assert.doesNotMatch(
      componentsCss.match(/@keyframes card-preview-stage-in[\s\S]*?\}\s*\}/)?.[0] || '',
      /transform:/,
      'card-preview-stage-in must not use transform (which traps fixed-position canvas inside modal stage)',
    );

    const container = new TestMockElement('div');
    const zoomEvents = [];
    let outsideClicks = 0;
    const card = new AstraCard(container, {
      autoplay: false,
      interactive: true,
      tilt: 1,
      animateEffects: true,
      zoomable: true,
      selectable: false,
      css: false,
      fontUrl: null,
      onZoomChange: (_d, inst) => zoomEvents.push(inst.isZoomed()),
      onOutsideClick: () => { outsideClicks += 1; },
    });

    // Attach real Three.js camera, card group, front PlaneGeometry(2,3) mesh, and mock renderer
    card.sc = new THREE.Scene();
    card.cam = new THREE.PerspectiveCamera(30, 1920 / 1080, 0.1, 50);
    card.card = new THREE.Group();
    card.sc.add(card.card);
    card._frontMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 3), new THREE.MeshBasicMaterial());
    card.card.add(card._frontMesh);
    card.U = {
      uCam: { value: new THREE.Vector3(0, 0, 7) },
      uP: { value: 0 },
      uPr: { value: 1 },
      uCs: { value: 1 },
    };
    let renderCount = 0;
    card.r = {
      setPixelRatio() {},
      setSize() {},
      render() { renderCount += 1; },
      dispose() {},
      forceContextLoss() {},
    };
    card._ready = true;
    setViewportGeometry(card, 1920, 1080, 500, 750);

    // Baseline unzoomed card renders at exact original slot proportions (~385x577 inside 500x750 slot)
    const baseBounds = getProjectedCardBounds(card);
    assert.ok(baseBounds.width > 380 && baseBounds.width < 390, `Expected original ~385px width, got ${baseBounds.width}`);
    assert.ok(baseBounds.height > 572 && baseBounds.height < 582, `Expected original ~577px height, got ${baseBounds.height}`);

    // 1. Desktop click on Face (0.04, 0.66) -> zooms deeply (~2.5x) beyond 500x750 slot without clipping
    const facePt = projectLocalToClient(card, 0.04, 0.66);
    card.root.dispatchPointer('pointerdown', facePt);
    globalThis.window.dispatchPointer('pointerup', facePt);
    assert.equal(card.isZoomed(), true, 'First click on face must zoom in');
    advanceFrames(card, 75);
    const zFace = card.getZoomState();
    assert.ok(zFace.scale > 2.4 && zFace.scale <= 2.6, `Expected ~2.5x desktop zoom, got ${zFace.scale}`);
    assert.ok(zFace.pan.y > 0.35, `Zooming face must pan strongly toward face, got ${zFace.pan.y}`);
    const faceZoomBounds = getProjectedCardBounds(card);
    assert.ok(faceZoomBounds.width > 900, `Enlarged width (${faceZoomBounds.width}) must extend past original 500px slot`);
    assert.ok(faceZoomBounds.height > 1350, `Enlarged height (${faceZoomBounds.height}) must extend past original 750px slot`);
    assert.ok(
      faceZoomBounds.minX >= 0 && faceZoomBounds.maxX <= 1920,
      `Left/right enlarged card edges must remain visible inside 1920px width: ${JSON.stringify(faceZoomBounds)}`,
    );
    assert.ok(
      faceZoomBounds.minY >= -20,
      `Top edge must stay framed inside top of 1920x1080 viewport when focused on face: ${JSON.stringify(faceZoomBounds)}`,
    );
    assert.ok(renderCount > 0);

    // 2. While zoomed, hovering does NOT turn the card and dragging PANS instead of turning
    const panBeforeHover = card.getZoomState().pan;
    card.root.dispatchPointer('pointermove', { clientX: 1200, clientY: 250 });
    advanceFrames(card, 15);
    assert.ok(Math.abs(card.pose.ry) < 1e-3 && Math.abs(card.pose.rx) < 1e-3, 'Hovering while zoomed must not turn card');
    assert.ok(
      Math.abs(card.getZoomState().pan.x - panBeforeHover.x) < 1e-3 &&
      Math.abs(card.getZoomState().pan.y - panBeforeHover.y) < 1e-3,
      'Hovering without dragging must not drift zoomed pan',
    );

    const dragStart = projectLocalToClient(card, 0.1, 0.1);
    const panBeforeDrag = card.getZoomState().pan;
    card.root.dispatchPointer('pointerdown', { ...dragStart, pointerId: 2 });
    // Drag left (-160px) and up (-140px) -> grab-pan shifts camera right (+panX) and down (-panY)
    card.root.dispatchPointer('pointermove', { clientX: dragStart.clientX - 160, clientY: dragStart.clientY - 140, pointerId: 2 });
    advanceFrames(card, 30);
    assert.ok(Math.abs(card.pose.ry) < 1e-3 && Math.abs(card.pose.rx) < 1e-3, 'Dragging while zoomed must pan, not turn the card');
    const panAfterDrag = card.getZoomState().pan;
    assert.ok(panAfterDrag.x > panBeforeDrag.x + 0.1, `Dragging left must pan view right (+panX): ${panBeforeDrag.x} -> ${panAfterDrag.x}`);
    assert.ok(panAfterDrag.y < panBeforeDrag.y - 0.1, `Dragging up must pan view down (-panY): ${panBeforeDrag.y} -> ${panAfterDrag.y}`);

    // Return pointer to start before release to verify maxDist prevents click-reset AND pans back cleanly
    card.root.dispatchPointer('pointermove', { ...dragStart, pointerId: 2 });
    globalThis.window.dispatchPointer('pointerup', { ...dragStart, pointerId: 2 });
    assert.equal(card.isZoomed(), true, 'Drag-and-return must not reset zoom');

    // 3. SECOND CLICK ANYWHERE (e.g., on Sword at completely different location) -> zooms back out, and mouse turning resumes!
    const swordWhileZoomedPt = projectLocalToClient(card, -0.32, -0.45);
    card.root.dispatchPointer('pointerdown', swordWhileZoomedPt);
    globalThis.window.dispatchPointer('pointerup', swordWhileZoomedPt);
    assert.equal(card.isZoomed(), false, 'Second click anywhere on card must zoom back out');
    advanceFrames(card, 75);
    assert.ok(Math.abs(card.getZoomState().scale - 1) < 1e-3);
    assert.ok(Math.abs(card.getZoomState().pan.x) < 1e-3);
    assert.ok(Math.abs(card.getZoomState().pan.y) < 1e-3);

    // Moving mouse while unzoomed resumes turning the card
    card.root.dispatchPointer('pointermove', { clientX: 1120, clientY: 540 });
    advanceFrames(card, 15);
    assert.ok(Math.abs(card.pose.ry) > 0.05, 'Unzoomed mouse move must resume turning the card');
    card.root.dispatchPointer('pointermove', { clientX: 960, clientY: 540 });
    advanceFrames(card, 60);

    // 4. Test Sword, Armor, and Background focus shifts + second click outside card resets zoom too
    for (const [label, lx, ly] of [
      ['sword', -0.45, -0.45],
      ['armor', 0.22, 0.12],
      ['background', -0.78, 1.15],
    ]) {
      const pt = projectLocalToClient(card, lx, ly);
      card.root.dispatchPointer('pointerdown', pt);
      globalThis.window.dispatchPointer('pointerup', pt);
      assert.equal(card.isZoomed(), true, `Clicking ${label} must zoom in`);
      advanceFrames(card, 65);
      const z = card.getZoomState();
      if (Math.abs(lx) > 0.05) {
        assert.equal(Math.sign(z.pan.x), Math.sign(lx), `${label} panX must shift toward clicked X`);
      }
      if (Math.abs(ly) > 0.05) {
        assert.equal(Math.sign(z.pan.y), Math.sign(ly), `${label} panY must shift toward clicked Y`);
      }
      const b = getProjectedCardBounds(card);
      assert.ok(
        b.minX >= 0 && b.maxX <= 1920,
        `Left/right edges must remain visible when focused on ${label}: ${JSON.stringify(b)}`,
      );
      if (ly >= 0.4) {
        assert.ok(b.minY >= -20, `Top edge must stay framed on upper focus (${label}): ${JSON.stringify(b)}`);
      } else if (ly <= -0.4) {
        assert.ok(b.maxY <= 1100, `Bottom edge must stay framed on lower focus (${label}): ${JSON.stringify(b)}`);
      } else {
        const focusedPt = projectLocalToClient(card, lx, ly);
        assert.ok(
          Math.abs(focusedPt.clientX - 960) < 25 && Math.abs(focusedPt.clientY - 540) < 25,
          `Middle focus (${label}) must center near (960, 540), got ${JSON.stringify(focusedPt)}`,
        );
      }

      // Second click outside the card silhouette on the canvas -> also zooms back out!
      card.root.dispatchPointer('pointerdown', { clientX: 25, clientY: 25 });
      globalThis.window.dispatchPointer('pointerup', { clientX: 25, clientY: 25 });
      assert.equal(card.isZoomed(), false, `Second click outside card after ${label} zoom must reset zoom`);
      advanceFrames(card, 65);
    }

    // 5. Clicking outside the card silhouette while UNZOOMED emits outsideclick
    assert.equal(outsideClicks, 0);
    card.root.dispatchPointer('pointerdown', { clientX: 25, clientY: 25 });
    globalThis.window.dispatchPointer('pointerup', { clientX: 25, clientY: 25 });
    assert.equal(outsideClicks, 1, 'Clicking outside card while unzoomed must emit outsideclick');

    // 6. Test different viewport sizes (1280x720 laptop and 390x844 mobile portrait)
    for (const [label, vw, vh, slotW, slotH] of [
      ['1280x720', 1280, 720, 374, 561],
      ['390x844', 390, 844, 327, 491],
    ]) {
      setViewportGeometry(card, vw, vh, slotW, slotH);
      const pt = projectLocalToClient(card, 0.25, 0.45);
      card.root.dispatchPointer('pointerdown', pt);
      globalThis.window.dispatchPointer('pointerup', pt);
      assert.equal(card.isZoomed(), true, `Zoom must activate on ${label}`);
      advanceFrames(card, 75);
      const b = getProjectedCardBounds(card);
      assert.ok(b.width > slotW * 1.8 && b.height > slotH * 1.8, `${label}: zoomed card (${b.width}x${b.height}) must significantly exceed slot (${slotW}x${slotH})`);
      if (vw >= 1000) {
        assert.ok(b.minX >= 0 && b.maxX <= vw, `${label}: horizontal card edges must stay inside viewport`);
      }
      // Second click anywhere resets
      card.root.dispatchPointer('pointerdown', { clientX: 12, clientY: vh / 2 });
      globalThis.window.dispatchPointer('pointerup', { clientX: 12, clientY: vh / 2 });
      assert.equal(card.isZoomed(), false);
      advanceFrames(card, 75);
    }

    // 7. Mobile touch double-tap to zoom and second double-tap anywhere to reset
    setViewportGeometry(card, 390, 844, 327, 491);
    const touchFace = projectLocalToClient(card, 0.04, 0.66);
    card.root.dispatchPointer('pointerdown', { ...touchFace, pointerType: 'touch', pointerId: 10 });
    globalThis.window.dispatchPointer('pointerup', { ...touchFace, pointerType: 'touch', pointerId: 10 });
    assert.equal(card.isZoomed(), false, 'Single touch tap must not zoom');

    card.root.dispatchPointer('pointerdown', { ...touchFace, pointerType: 'touch', pointerId: 11 });
    globalThis.window.dispatchPointer('pointerup', { ...touchFace, pointerType: 'touch', pointerId: 11 });
    assert.equal(card.isZoomed(), true, 'Touch double-tap must zoom in');
    advanceFrames(card, 65);

    const touchSword = projectLocalToClient(card, -0.3, -0.4);
    card.root.dispatchPointer('pointerdown', { ...touchSword, pointerType: 'touch', pointerId: 12 });
    globalThis.window.dispatchPointer('pointerup', { ...touchSword, pointerType: 'touch', pointerId: 12 });
    assert.equal(card.isZoomed(), true);
    card.root.dispatchPointer('pointerdown', { ...touchSword, pointerType: 'touch', pointerId: 13 });
    globalThis.window.dispatchPointer('pointerup', { ...touchSword, pointerType: 'touch', pointerId: 13 });
    assert.equal(card.isZoomed(), false, 'Second touch double-tap anywhere must reset zoom');

    // 8. Destroy cleans up listeners and resets zoom state
    card.zoomToPoint(0.1, 0.2);
    assert.equal(card.isZoomed(), true);
    card.destroy();
    assert.equal(card.destroyed, true);
    assert.equal(card.isZoomed(), false);
    assert.equal((winListeners.get('pointerup') || []).length, 0);
    assert.equal((winListeners.get('pointercancel') || []).length, 0);
    assert.equal((docListeners.get('visibilitychange') || []).length, 0);
    assert.ok(zoomEvents.includes(true) && zoomEvents.includes(false));
  } finally {
    AstraCard.prototype._init = origInit;
    globalThis.document = prevDocument;
    globalThis.window = prevWindow;
    globalThis.HTMLElement = prevHTMLElement;
    globalThis.requestAnimationFrame = prevRAF;
    globalThis.cancelAnimationFrame = prevCancelRAF;
  }
});

test('HeroScreen Inspect mode enables zoomable preview, closes on outside click when unzoomed, resets zoom on backdrop click, and resets zoom on close/reopen', async () => {
  const prevDocument = globalThis.document;
  const prevWindow = globalThis.window;
  const winListeners = new Map();
  globalThis.document = {
    createElement: (tag) => createMockElement(tag),
  };
  globalThis.window = {
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, []);
      winListeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = winListeners.get(type);
      if (!list) return;
      const idx = list.indexOf(fn);
      if (idx !== -1) list.splice(idx, 1);
    },
    dispatchKey(key) {
      for (const fn of [...(winListeners.get('keydown') || [])]) {
        fn({ key, preventDefault() {} });
      }
    },
  };

  try {
    const registry = await loadRealRegistry();
    const { eventBus, gameState, heroSystem, formationSystem } = createSystems(registry);

    class ZoomStubAstraCard {
      constructor(container, options) {
        this.container = container;
        this.options = { ...options };
        this.data = { ...(options.data || {}) };
        this.destroyed = false;
        this.paused = false;
        this._zoomed = false;
        this.resetCalls = [];
      }
      getData() { return { ...this.data }; }
      isZoomed() { return this._zoomed; }
      setZoomed(on) {
        this._zoomed = Boolean(on);
        this.options.onZoomChange?.(this.getData(), this);
      }
      resetZoom(opts = {}) {
        this.resetCalls.push(opts);
        const was = this._zoomed;
        this._zoomed = false;
        if (was) this.options.onZoomChange?.(this.getData(), this);
        return was;
      }
      pause() { this.paused = true; }
      resume() { this.paused = false; }
      resize() {}
      destroy() { this.destroyed = true; }
    }

    const screen = new HeroScreen({
      eventBus,
      gameState,
      heroSystem,
      formationSystem,
      assetManager: createMockAssets(),
      audioManager: createMockAudio(),
      screenManager: { navigate() {} },
      notify() {},
      AstraCardClass: ZoomStubAstraCard,
    });

    const container = createMockElement('div');
    gameState.setUI({ selectedHeroId: 'astra', heroFilter: 'ALL' });
    screen.mount(container);

    const stageCard = screen._mountedCard;
    assert.equal(stageCard.options.zoomable, false, 'Static stage card must not enable inspect zoom');

    // Open Inspect modal
    stageCard.options.onClick(stageCard.getData(), stageCard);
    const modal = container.querySelector('#commander-card-preview-modal');
    const previewCard = screen._previewCards.getInstances()[0];
    assert.ok(modal && previewCard);
    assert.equal(previewCard.options.zoomable, true, 'Inspect preview card must enable zoomable mode');
    assert.equal(typeof previewCard.options.onOutsideClick, 'function', 'Inspect preview must wire onOutsideClick');

    const backdrop = modal.querySelector('.card-preview-modal__backdrop');
    const hint = modal.querySelector('.card-preview-modal__hint');

    // Simulate zoomed state -> clicking backdrop resets zoom without closing modal
    previewCard.setZoomed(true);
    assert.equal(modal.classList.contains('is-zoomed'), true);
    assert.match(hint.textContent, /Click anywhere to return/i);

    backdrop.click();
    assert.equal(previewCard.isZoomed(), false, 'Clicking backdrop while zoomed must reset zoom');
    assert.equal(previewCard.destroyed, false, 'Clicking backdrop while zoomed must keep Inspect modal open');
    assert.ok(container.querySelector('#commander-card-preview-modal'));

    // Outside click on full-viewport canvas while NOT zoomed closes modal
    previewCard.options.onOutsideClick(previewCard.getData(), previewCard);
    assert.equal(previewCard.destroyed, true);
    assert.equal(container.querySelector('#commander-card-preview-modal'), null);

    // Re-open Inspect, zoom in, and close via Close button -> resets zoom and destroys cleanly
    stageCard.options.onClick(stageCard.getData(), stageCard);
    const previewCard2 = screen._previewCards.getInstances()[0];
    previewCard2.setZoomed(true);
    const closeBtn = container.querySelector('#btn-close-card-preview');
    closeBtn.click();
    assert.equal(previewCard2.isZoomed(), false);
    assert.ok(previewCard2.resetCalls.length >= 1, 'Closing Inspect must reset zoom');
    assert.equal(previewCard2.destroyed, true);

    // Re-open Inspect again -> starts fresh unzoomed
    stageCard.options.onClick(stageCard.getData(), stageCard);
    const previewCard3 = screen._previewCards.getInstances()[0];
    assert.equal(previewCard3.isZoomed(), false);

    screen.unmount();
    assert.equal(previewCard3.destroyed, true);
  } finally {
    globalThis.document = prevDocument;
    globalThis.window = prevWindow;
  }
});
