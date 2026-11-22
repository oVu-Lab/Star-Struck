import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { EventBus } from '../src/core/EventBus.js';
import { GameState } from '../src/core/GameState.js';
import { SaveManager } from '../src/core/SaveManager.js';
import { ScreenManager } from '../src/core/ScreenManager.js';
import { createMemoryStorage } from '../src/utils/StorageUtils.js';
import { buildDataRegistry } from '../src/utils/DataLoader.js';
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
import { BattleManager } from '../src/battle/BattleManager.js';
import { AnimationManager } from '../src/rendering/AnimationManager.js';
import { ParticleSystem } from '../src/rendering/ParticleSystem.js';
import { HomeScreen } from '../src/ui/HomeScreen.js';
import { HeroScreen } from '../src/ui/HeroScreen.js';
import { BattleScreen } from '../src/ui/BattleScreen.js';
import { AstraCardRegistry } from '../src/ui/AstraCardMount.js';
import { AstraCard } from '../astra-cardtemplate/AstraCard.js';

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

function createMockNode(tagName = 'div', attrs = {}) {
  const listeners = new Map();
  const children = [];
  const node = {
    tagName: tagName.toUpperCase(),
    attrs: { ...attrs },
    className: attrs.class || '',
    id: attrs.id || '',
    textContent: '',
    hidden: 'hidden' in attrs,
    disabled: 'disabled' in attrs,
    style: {
      setProperty(k, v) {
        this[k] = v;
      },
      removeProperty(k) {
        delete this[k];
      },
    },
    dataset: {},
    offsetLeft: 0,
    offsetWidth: 92,
    scrollTop: 0,
    _innerHTML: '',
    children,
    parentNode: null,
    classList: {
      add(...names) {
        const set = new Set(node.className.split(/\s+/).filter(Boolean));
        for (const n of names) if (n) set.add(n);
        node.className = [...set].join(' ');
      },
      remove(...names) {
        const set = new Set(node.className.split(/\s+/).filter(Boolean));
        for (const n of names) set.delete(n);
        node.className = [...set].join(' ');
      },
      toggle(name, force) {
        const set = new Set(node.className.split(/\s+/).filter(Boolean));
        const shouldAdd = force === undefined ? !set.has(name) : Boolean(force);
        if (shouldAdd) set.add(name);
        else set.delete(name);
        node.className = [...set].join(' ');
        return shouldAdd;
      },
      contains(name) {
        return node.className.split(/\s+/).includes(name);
      },
    },
    set innerHTML(html) {
      this._innerHTML = String(html);
      for (const ch of children) ch.parentNode = null;
      children.length = 0;
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
    removeAttribute(name) {
      delete this.attrs[name];
      if (name === 'class') this.className = '';
      if (name === 'id') this.id = '';
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
    appendChild(child) {
      if (child.parentNode?.children) {
        const idx = child.parentNode.children.indexOf(child);
        if (idx !== -1) child.parentNode.children.splice(idx, 1);
      }
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
      if (selector.includes(',')) {
        const parts = selector.split(',').map((s) => s.trim()).filter(Boolean);
        const out = [];
        for (const p of parts) {
          for (const hit of this.querySelectorAll(p)) {
            if (!out.includes(hit)) out.push(hit);
          }
        }
        return out;
      }
      const pool = [...(this._parsed || []), ...collectDescendants(children)];
      const results = [];
      for (const candidate of pool) {
        if (matchesSelector(candidate, selector)) {
          results.push(candidate);
        }
        if (candidate._parsed?.length || candidate.children?.length) {
          for (const sub of candidate.querySelectorAll(selector)) {
            if (!results.includes(sub)) results.push(sub);
          }
        }
      }
      return results;
    },
  };
  return node;
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
    nodes.push(createMockNode(tag, attrs));
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
  if (selector === '[data-screen].is-active') {
    return el.getAttribute('data-screen') !== null && el.classList.contains('is-active');
  }
  const attrMatch = selector.match(/^\[([a-zA-Z0-9_:-]+)(?:="([^"]*)")?\]$/);
  if (attrMatch) {
    const [, key, expected] = attrMatch;
    if (!(key in el.attrs)) return false;
    return expected === undefined ? true : el.attrs[key] === expected;
  }
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

function createHarness(registry) {
  const eventBus = new EventBus();
  const saveManager = new SaveManager({ storage: createMemoryStorage(), eventBus });
  const gameState = new GameState(saveManager.load().data, eventBus);
  const economySystem = new EconomySystem({ gameState, saveManager, eventBus });
  const heroSystem = new HeroSystem({ dataRegistry: registry, gameState, saveManager, eventBus });
  const formationSystem = new FormationSystem({
    dataRegistry: registry,
    gameState,
    heroSystem,
    saveManager,
    eventBus,
  });
  const cardSystem = new CardSystem({ dataRegistry: registry, gameState, saveManager, eventBus });
  const progressionSystem = new ProgressionSystem({
    dataRegistry: registry,
    gameState,
    economySystem,
    formationSystem,
    cardSystem,
    saveManager,
    eventBus,
  });
  const missionSystem = new MissionSystem({
    dataRegistry: registry,
    gameState,
    economySystem,
    progressionSystem,
    saveManager,
    eventBus,
  });
  const unitManager = new UnitManager({ dataRegistry: registry, eventBus });
  const targetingSystem = new TargetingSystem({ balance: registry.balance });
  const movementSystem = new MovementSystem({ balance: registry.balance });
  const combatSystem = new CombatSystem({ eventBus, dataRegistry: registry });
  const projectileSystem = new ProjectileSystem({ eventBus });
  const skillSystem = new SkillSystem({
    gameState,
    heroSystem,
    eventBus,
    dataRegistry: registry,
  });
  const waveManager = new WaveManager({ eventBus, balance: registry.balance });
  const animationManager = new AnimationManager();
  const particleSystem = new ParticleSystem();
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
    battleRenderer: null,
    animationManager,
    particleSystem,
    audioManager: null,
  });
  const tutorialManager = new TutorialManager({
    gameState,
    saveManager,
    eventBus,
    battleManager,
    cardSystem,
    heroSystem,
    unitManager,
    dataRegistry: registry,
    audioManager: { playClick() {} },
    notify() {},
  });
  tutorialManager.markCompleted();

  return {
    eventBus,
    saveManager,
    gameState,
    economySystem,
    heroSystem,
    formationSystem,
    cardSystem,
    progressionSystem,
    missionSystem,
    battleManager,
    tutorialManager,
  };
}

// ============================================================================
// 1. Navigation Simplification & Settings Gear Tests
// ============================================================================

test('Navigation: index.html top nav contains strictly Home, Battle, Commanders, Inventory + top-right Settings gear', async () => {
  const html = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8');
  const navMatch = html.match(/<nav id="primary-nav"[^>]*>([\s\S]*?)<\/nav>/);
  assert.ok(navMatch, 'index.html must include #primary-nav');

  const navInner = navMatch[1];
  const links = [...navInner.matchAll(/<button[^>]*data-screen="([^"]+)"[^>]*>([^<]+)<\/button>/g)].map(
    (m) => ({ screen: m[1], label: m[2].trim() }),
  );

  assert.deepEqual(links, [
    { screen: 'home', label: 'Home' },
    { screen: 'battle', label: 'Battle' },
    { screen: 'heroes', label: 'Commanders' },
    { screen: 'inventory', label: 'Inventory' },
  ]);

  for (const removed of ['missions', 'summon', 'formation', 'decks', 'settings']) {
    assert.equal(
      navInner.includes(`data-screen="${removed}"`),
      false,
      `Removed destination "${removed}" must not appear in #primary-nav`,
    );
  }

  const headerResourcesMatch = html.match(/<div id="header-resources"[\s\S]*?<\/header>/);
  assert.ok(headerResourcesMatch, 'Header resources area must exist');
  assert.ok(
    headerResourcesMatch[0].includes('id="hdr-settings-btn"'),
    'Settings gear button #hdr-settings-btn must be in the top-right header area',
  );
  assert.ok(
    headerResourcesMatch[0].includes('<svg'),
    'Settings gear button must render an icon',
  );
});

test('Navigation: ScreenManager activates 4 top-level routes, clears indicator on secondary screens, and restores Home cleanly', async () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;

  const viewport = createMockNode('main', { id: 'screen-viewport' });
  const navRoot = createMockNode('nav', { id: 'primary-nav', class: 'primary-nav' });
  const topScreens = ['home', 'battle', 'heroes', 'inventory'];
  topScreens.forEach((id, idx) => {
    const btn = createMockNode('button', { class: 'nav-link', 'data-screen': id });
    btn.offsetLeft = idx * 100;
    btn.offsetWidth = 96;
    navRoot.appendChild(btn);
  });

  globalThis.document = {
    createElement: (tag) => createMockNode(tag),
  };
  globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    removeEventListener() {},
  };

  try {
    const registry = await loadRealRegistry();
    const h = createHarness(registry);
    const screenManager = new ScreenManager({
      viewportEl: viewport,
      navRootEl: navRoot,
      eventBus: h.eventBus,
    });

    for (const id of ['home', 'missions', 'summon', 'formation', 'battle', 'heroes', 'inventory', 'settings']) {
      if (id === 'home') {
        screenManager.register(
          'home',
          new HomeScreen({
            ...h,
            dataRegistry: registry,
            assetManager: { bindImageElement() {} },
            audioManager: { playClick() {} },
            screenManager,
          }),
        );
      } else {
        screenManager.register(id, { mount() {}, unmount() {} });
      }
    }

    screenManager.navigate('home');
    const indicator = navRoot.querySelector('.nav-active-indicator');
    assert.ok(indicator, 'Sliding nav indicator must be mounted');
    assert.equal(indicator.classList.contains('is-visible'), true);
    assert.equal(navRoot.querySelector('[data-screen="home"]').classList.contains('is-active'), true);

    // Secondary screens from Home feature cards and Settings gear must NOT activate unrelated top-nav tabs
    for (const secondary of ['missions', 'summon', 'formation', 'settings']) {
      if (screenManager.getActiveScreenId() === 'home') {
        const homeCard = viewport.querySelector(`[data-nav="${secondary}"]`);
        if (homeCard) {
          homeCard.click();
        } else {
          screenManager.navigate(secondary);
        }
      } else {
        screenManager.navigate(secondary);
      }
      assert.equal(screenManager.getActiveScreenId(), secondary);
      for (const topId of topScreens) {
        assert.equal(
          navRoot.querySelector(`[data-screen="${topId}"]`).classList.contains('is-active'),
          false,
          `Top-level nav item "${topId}" must not be active on secondary screen "${secondary}"`,
        );
      }
      assert.equal(
        indicator.classList.contains('is-visible'),
        false,
        `Active nav indicator must hide on secondary screen "${secondary}"`,
      );

      // Returning Home restores Home active state and visible indicator
      screenManager.navigate('home');
      assert.equal(screenManager.getActiveScreenId(), 'home');
      assert.equal(navRoot.querySelector('[data-screen="home"]').classList.contains('is-active'), true);
      assert.equal(indicator.classList.contains('is-visible'), true);
    }

    // Commanders feature card navigates to heroes and activates Commanders nav item
    viewport.querySelector('[data-nav="heroes"]').click();
    assert.equal(screenManager.getActiveScreenId(), 'heroes');
    assert.equal(navRoot.querySelector('[data-screen="heroes"]').classList.contains('is-active'), true);
    assert.equal(indicator.classList.contains('is-visible'), true);
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
});

// ============================================================================
// 2. Card Merge Visual Effects Tests
// ============================================================================

test('Merge VFX: triggers tier II and tier III VFX on valid merges, ignores invalid merges, preserves refill, and cleans up', async () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  globalThis.document = {
    createElement: (tag) => createMockNode(tag),
    getElementById: () => null,
  };
  globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    removeEventListener() {},
  };

  try {
    const registry = await loadRealRegistry();
    const h = createHarness(registry);
    const container = createMockNode('div');

    // Slots 0, 2, 4, 5 start with identical Lv.I Shield Guard so we can test I->II and II->III
    h.cardSystem.setCardGenerator(({ slotIndex }) => {
      if (slotIndex === 0 || slotIndex === 2 || slotIndex === 4 || slotIndex === 5) {
        return 'card_shield_guard';
      }
      if (slotIndex === 1) return 'card_arcane_archer';
      return 'card_skill_astral_nova';
    });

    const screen = new BattleScreen({
      ...h,
      dataRegistry: registry,
      assetManager: { bindImageElement() {} },
      audioManager: { playClick() {}, playInvalid() {}, playCardDraw() {}, playMerge() {} },
      screenManager: { navigate() {} },
      notify() {},
    });

    screen.mount(container);
    h.battleManager.beginBattle();
    for (let i = 0; i < 65; i += 1) h.battleManager.stepSimulation(1 / 60);

    const vfxCanvas = screen._hudEls.mergeVfxCanvas;
    const vfxCtrl = screen._mergeVfxController;
    assert.ok(vfxCanvas, 'BattleScreen must mount #merge-vfx-canvas');
    assert.ok(vfxCtrl, 'BattleScreen must instantiate CardMergeVfxController');
    assert.ok(screen._slotNodes[5].flash, 'Card slot must include .tactical-card__flash');
    assert.ok(screen._slotNodes[5].levelUp, 'Card slot must include .tactical-card__levelup');
    assert.equal(screen._slotNodes[5].levelUp.hidden, true);

    // Invalid merge attempt (slot 0 + slot 1 mismatched cards) must produce NO merge VFX
    h.battleManager.interactWithCardSlot(0);
    const badAttempt = h.battleManager.interactWithCardSlot(1);
    assert.notEqual(badAttempt.action, 'merged');
    assert.equal(vfxCtrl.activeCount, 0, 'Invalid merge must not start merge evolution VFX');
    assert.equal(screen._slotNodes[1].root.classList.contains('is-just-merged'), false);
    assert.equal(screen._slotNodes[1].levelUp.hidden, true);
    assert.equal(h.cardSystem.mergeAdjacent(0, 1).ok, false);
    assert.equal(vfxCtrl.activeCount, 0, 'Failed CardSystem merge must not start merge evolution VFX');

    // Clear selection, then perform valid merge slot 0 -> slot 5 (Lv.I -> Lv.II)
    h.gameState.setBattle({ selectedCardSlot: -1 });
    h.battleManager.interactWithCardSlot(0);
    const merge1 = h.battleManager.interactWithCardSlot(5);
    assert.equal(merge1.action, 'merged');
    assert.equal(merge1.ok, true);
    assert.equal(merge1.upgradedCard.tier, 2);

    assert.equal(screen._slotNodes[0].root.classList.contains('is-merge-departed'), true);
    assert.equal(screen._slotNodes[5].root.classList.contains('is-just-merged'), true);
    assert.equal(screen._slotNodes[5].root.classList.contains('is-merge-tier-2'), true);
    assert.equal(screen._slotNodes[5].tier.textContent, 'Lv.II');
    assert.equal(screen._slotNodes[5].tier.classList.contains('is-tier-evolving'), true);
    assert.equal(screen._slotNodes[5].tier.getAttribute('data-prev-tier'), 'Lv.I');
    assert.equal(screen._slotNodes[5].levelUp.hidden, false);
    assert.match(screen._slotNodes[5].levelUp.textContent, /LEVEL UP.*Lv\.II/);
    assert.equal(screen._slotNodes[5].levelUp.classList.contains('is-visible'), true);
    assert.equal(screen._slotNodes[5].levelUp.classList.contains('is-tier-3'), false);
    assert.equal(h.cardSystem.getRefillState(0).active, true, 'Source slot 0 refill timer must run normally');
    assert.equal(h.cardSystem.getSlots()[5].tier, 2, 'Target slot 5 must retain upgraded Lv.II state');
    assert.equal(vfxCtrl.activeCount, 1);
    assert.ok(
      vfxCtrl.getActiveEvolutions()[0].durationMs >= 450 &&
        vfxCtrl.getActiveEvolutions()[0].durationMs <= 650,
      'Lv.II upgrade duration must be within 450-650ms',
    );
    assert.deepEqual(
      {
        sourceIndex: vfxCtrl.getActiveEvolutions()[0].sourceIndex,
        targetIndex: vfxCtrl.getActiveEvolutions()[0].targetIndex,
        fromTier: vfxCtrl.getActiveEvolutions()[0].fromTier,
        toTier: vfxCtrl.getActiveEvolutions()[0].toTier,
      },
      { sourceIndex: 0, targetIndex: 5, fromTier: 1, toTier: 2 },
    );

    // Rapid consecutive merge: slot 2 -> slot 4 (Lv.I -> Lv.II), then slot 4 -> slot 5 (Lv.II -> Lv.III)
    h.battleManager.interactWithCardSlot(2);
    const merge2 = h.battleManager.interactWithCardSlot(4);
    assert.equal(merge2.ok, true);
    assert.equal(merge2.upgradedCard.tier, 2);

    h.battleManager.interactWithCardSlot(4);
    const merge3 = h.battleManager.interactWithCardSlot(5);
    assert.equal(merge3.ok, true);
    assert.equal(merge3.upgradedCard.tier, 3);

    assert.equal(screen._slotNodes[5].root.classList.contains('is-just-merged'), true);
    assert.equal(screen._slotNodes[5].root.classList.contains('is-merge-tier-3'), true);
    assert.equal(screen._slotNodes[5].tier.textContent, 'Lv.III');
    assert.equal(screen._slotNodes[5].tier.classList.contains('is-tier-evolving'), true);
    assert.equal(screen._slotNodes[5].tier.getAttribute('data-prev-tier'), 'Lv.II');
    assert.equal(screen._slotNodes[5].levelUp.hidden, false);
    assert.match(screen._slotNodes[5].levelUp.textContent, /LEVEL UP.*Lv\.III/);
    assert.equal(screen._slotNodes[5].levelUp.classList.contains('is-visible'), true);
    assert.equal(screen._slotNodes[5].levelUp.classList.contains('is-tier-3'), true);
    assert.equal(h.cardSystem.getSlots()[5].tier, 3, 'Target slot 5 must retain upgraded Lv.III state');
    assert.equal(vfxCtrl.activeCount, 3);
    const evList = vfxCtrl.getActiveEvolutions();
    assert.equal(evList[2].fromTier, 2);
    assert.equal(evList[2].toTier, 3);
    assert.equal(evList[2].sourceIndex, 4);
    assert.equal(evList[2].targetIndex, 5);
    assert.ok(
      evList[2].durationMs >= 450 && evList[2].durationMs <= 650,
      'Lv.III upgrade duration must finish within 450-650ms',
    );
    assert.ok(evList[2].durationMs > evList[0].durationMs, 'Lv.III upgrade must have richer duration than Lv.II');

    // Unmount cleans up all active VFX evolutions, labels, RAF, and timers cleanly
    const targetLevelUpNode = screen._slotNodes[5].levelUp;
    screen.unmount();
    assert.equal(vfxCtrl.activeCount, 0);
    assert.equal(screen._mergeVfxController, null);
    assert.equal(screen._slotAnimTimers.size, 0);
    assert.equal(targetLevelUpNode.hidden, true);
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
});

// ============================================================================
// 3. Heroes WebGL Loading Placeholder, Reuse & Fallback Tests
// ============================================================================

test('HeroScreen WebGL loading: shows placeholder until ready, hides reliably, reuses card on settings change, and falls back on error', async () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;

  globalThis.document = {
    createElement: (tag) => createMockNode(tag),
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
  };

  try {
    const registry = await loadRealRegistry();
    const h = createHarness(registry);

    const created = [];
    class DeferredAstraCard {
      constructor(container, options) {
        this.container = container;
        this.options = { ...options };
        this.data = { ...(options.data || {}) };
        this.ready = false;
        this.destroyed = false;
        this.paused = false;
        this.updatedCalls = 0;
        this.element = createMockNode('div', { class: 'astra-card astra-card--loading' });
        container.appendChild(this.element);
        created.push(this);
      }
      getData() {
        return { ...this.data };
      }
      update(next) {
        this.updatedCalls += 1;
        Object.assign(this.data, next);
      }
      pause() { this.paused = true; }
      resume() { this.paused = false; }
      resize() {}
      destroy() {
        this.destroyed = true;
        this.element?.remove?.();
      }
      resolveReady() {
        this.ready = true;
        this.options.onReady?.(this.getData(), this);
      }
      rejectError(err = new Error('WebGL context lost')) {
        this.options.onError?.(err);
      }
    }

    const screen = new HeroScreen({
      eventBus: h.eventBus,
      gameState: h.gameState,
      heroSystem: h.heroSystem,
      formationSystem: h.formationSystem,
      assetManager: {
        bindImageElement(img, id) {
          img.setAttribute('data-asset-id', id);
        },
      },
      audioManager: { playClick() {}, playDeploy() {}, playInvalid() {} },
      screenManager: { navigate() {} },
      notify() {},
      AstraCardClass: DeferredAstraCard,
    });

    const container = createMockNode('div');
    h.gameState.setUI({ selectedHeroId: 'astra', heroFilter: 'ALL' });
    screen.mount(container);

    assert.equal(created.length, 1);
    const slot = container.querySelector('#hero-collectible-card-slot');
    const placeholder = container.querySelector('#hero-card-loading-placeholder');
    assert.ok(slot && placeholder, 'Loading placeholder must render while AstraCard initializes');
    assert.equal(slot.getAttribute('data-card-state'), 'loading');
    assert.equal(placeholder.hidden, false);

    // Resolving ready transitions state cleanly and hides placeholder reliably
    created[0].resolveReady();
    assert.equal(slot.getAttribute('data-card-state'), 'ready');
    assert.equal(placeholder.hidden, true);
    assert.equal(placeholder.classList.contains('is-hidden'), true);

    // Unrelated settings change (e.g. mute toggle in header) must NOT tear down or recreate AstraCard
    h.gameState.mutatePersistent('settings', (p) => {
      p.settings.muted = true;
    });
    assert.equal(created.length, 1);
    assert.equal(created[0].destroyed, false);

    // Non-settings state change while staying on Astra reuses the live card instance
    h.eventBus.emit('state:changed', { scope: 'heroes' });
    assert.equal(created.length, 1, 'Live AstraCard must be reused across Astra state updates');
    assert.equal(created[0].destroyed, false);
    assert.equal(created[0].updatedCalls, 1);
    const slotAfterUpdate = container.querySelector('#hero-collectible-card-slot');
    const placeholderAfterUpdate = container.querySelector('#hero-card-loading-placeholder');
    assert.equal(slotAfterUpdate.getAttribute('data-card-state'), 'ready');
    assert.equal(placeholderAfterUpdate.hidden, true);

    // Switch to Kael and back to Astra, then simulate WebGL failure -> clean static portrait fallback
    h.gameState.setUI({ selectedHeroId: 'kael' });
    screen.render();
    assert.equal(created[0].destroyed, true);

    h.gameState.setUI({ selectedHeroId: 'astra' });
    screen.render();
    assert.equal(created.length, 2);
    created[1].rejectError(new Error('Simulated WebGL failure'));
    assert.equal(created[1].destroyed, true, 'Failed card instance must be destroyed cleanly');

    const fallbackSlot = container.querySelector('#hero-collectible-card-slot');
    assert.equal(fallbackSlot.getAttribute('data-card-state'), 'fallback');
    const fallbackImg = fallbackSlot.querySelector('.astra-card-fallback-img');
    assert.ok(fallbackImg, 'Graceful static portrait fallback must render when WebGL fails');
    assert.equal(fallbackImg.getAttribute('data-asset-id'), 'hero_portrait_astra');
    assert.ok(container.querySelector('.hero-dossier'), 'Commander dossier must remain usable after fallback');

    screen.unmount();
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
});

test('AstraCard performance helpers: exports static preload() and AstraCardRegistry supports fallback timeout', async () => {
  assert.equal(typeof AstraCard.preload, 'function');
  const preloadRes = await AstraCard.preload();
  assert.equal(preloadRes, null, 'AstraCard.preload is a safe no-op outside browser DOM');

  const source = await fs.readFile(path.join(ROOT, 'astra-cardtemplate/AstraCard.js'), 'utf8');
  assert.match(source, /Cinzel\+Decorative/, 'ensureFont must recognize existing Google Fonts stylesheet');
  assert.match(source, /const titleCache = new Map\(\)/, 'AstraCard must cache generated title canvases');

  // Verify AstraCardRegistry timeout triggers fallback cleanly without hanging forever
  const container = createMockNode('div');
  const errors = [];
  class HungCard {
    constructor(c, o) {
      this.container = c;
      this.options = o;
      this.ready = false;
      this.destroyed = false;
    }
    destroy() { this.destroyed = true; }
  }
  const reg = new AstraCardRegistry({ CardClass: HungCard });
  const card = reg.mount(container, {
    hero: { id: 'astra', name: 'Astra Valen', portraitAssetId: 'hero_portrait_astra' },
    assetManager: { bindImageElement() {} },
    loadingTimeoutMs: 25,
    onError: (err) => errors.push(err),
  });
  assert.ok(card);
  assert.equal(container.getAttribute('data-card-state'), 'loading');

  await new Promise((r) => setTimeout(r, 60));
  assert.equal(card.destroyed, true, 'Timed-out card must be destroyed');
  assert.equal(container.getAttribute('data-card-state'), 'fallback');
  assert.equal(errors.length, 1);
  reg.destroyAll();
});
