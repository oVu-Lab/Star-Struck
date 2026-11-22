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

function createMockElement(tagName = 'div', attrs = {}) {
  const listeners = new Map();
  const children = [];
  const el = {
    tagName: tagName.toUpperCase(),
    attrs: { ...attrs },
    className: attrs.class || '',
    id: attrs.id || '',
    textContent: '',
    hidden: 'hidden' in attrs,
    disabled: 'disabled' in attrs,
    width: 126,
    height: 196,
    clientWidth: 126,
    clientHeight: 196,
    offsetWidth: 120,
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
      const arr = listeners.get(type);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
    appendChild(child) {
      children.push(child);
      child.parentNode = this;
      return child;
    },
    getContext() {
      const grad = { addColorStop() {} };
      return new Proxy(
        {
          createLinearGradient: () => grad,
          createRadialGradient: () => grad,
          measureText: (txt) => ({ width: String(txt || '').length * 7 }),
        },
        {
          get(target, prop) {
            if (prop in target) return target[prop];
            return () => {};
          },
        },
      );
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 126, height: 196 };
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const pool = this._parsed || [];
      if (selector.startsWith('#')) {
        const id = selector.slice(1);
        return pool.filter((n) => n.id === id);
      }
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        return pool.filter((n) => n.classList.contains(cls));
      }
      return [];
    },
  };
  return el;
}

function parseHtmlElements(html) {
  const nodes = [];
  const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>/g;
  let m;
  while ((m = tagRegex.exec(html)) !== null) {
    const tag = m[1];
    const attrStr = m[2] || '';
    const attrs = {};
    const attrRegex = /([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g;
    let a;
    while ((a = attrRegex.exec(attrStr)) !== null) {
      attrs[a[1]] = a[2] !== undefined ? a[2] : '';
    }
    const el = createMockElement(tag, attrs);
    if (attrs.style) {
      for (const pair of attrs.style.split(';')) {
        const [rawK, rawV] = pair.split(':');
        if (!rawK || rawV === undefined) continue;
        const k = rawK.trim();
        const v = rawV.trim();
        if (k.startsWith('--')) el.style.setProperty(k, v);
        else el.style[k] = v;
      }
    }
    nodes.push(el);
  }
  return nodes;
}

async function mountTestBattleScreen() {
  const dataRegistry = await loadRealRegistry();
  const sys = createSystems(dataRegistry);
  const unitManager = new UnitManager({ dataRegistry, eventBus: sys.eventBus });
  const targetingSystem = new TargetingSystem({ unitManager });
  const movementSystem = new MovementSystem({ unitManager });
  const combatSystem = new CombatSystem({ eventBus: sys.eventBus });
  const projectileSystem = new ProjectileSystem({ combatSystem, unitManager });
  const skillSystem = new SkillSystem({
    gameState: sys.gameState,
    heroSystem: sys.heroSystem,
    eventBus: sys.eventBus,
    dataRegistry,
  });
  const waveManager = new WaveManager({ dataRegistry, unitManager, eventBus: sys.eventBus });
  const animationManager = new AnimationManager();
  const particleSystem = new ParticleSystem();
  const mockAssets = {
    getHeroPortrait: () => null,
    getHeroCardAssets: () => null,
    getUnitSprite: () => null,
    getImageElement: () => null,
    getAssetUrl: () => '',
    bindImageElement() {},
  };
  const battleRenderer = new BattleRenderer({
    gameState: sys.gameState,
    assetManager: mockAssets,
    animationManager,
    particleSystem,
    dataRegistry,
  });
  const battleManager = new BattleManager({
    dataRegistry,
    gameState: sys.gameState,
    eventBus: sys.eventBus,
    heroSystem: sys.heroSystem,
    formationSystem: sys.formationSystem,
    cardSystem: sys.cardSystem,
    progressionSystem: sys.progressionSystem,
    unitManager,
    targetingSystem,
    movementSystem,
    combatSystem,
    projectileSystem,
    skillSystem,
    waveManager,
    animationManager,
    particleSystem,
    battleRenderer,
  });

  const savedWin = globalThis.window;
  const savedDoc = globalThis.document;
  const savedRaf = globalThis.requestAnimationFrame;
  const savedCaf = globalThis.cancelAnimationFrame;

  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame() {
      return 1;
    },
    cancelAnimationFrame() {},
  };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.document = {
    createElement: (t) => createMockElement(t),
    activeElement: null,
  };

  const container = createMockElement('div');
  const screen = new BattleScreen({
    dataRegistry,
    gameState: sys.gameState,
    saveManager: sys.saveManager,
    eventBus: sys.eventBus,
    heroSystem: sys.heroSystem,
    formationSystem: sys.formationSystem,
    cardSystem: sys.cardSystem,
    progressionSystem: sys.progressionSystem,
    skillSystem,
    battleManager,
    assetManager: mockAssets,
    audioManager: {
      playClick() {},
      playInvalid() {},
      playUltimate() {},
      playCardPlay() {},
      playCardMerge() {},
      toggleMute() {},
    },
    screenManager: { navigate() {} },
    notify() {},
  });

  screen.mount(container, { stageId: 'stage_1_1' });

  const cleanup = () => {
    screen.unmount();
    battleManager.stopSession?.();
    globalThis.window = savedWin;
    globalThis.document = savedDoc;
    globalThis.requestAnimationFrame = savedRaf;
    globalThis.cancelAnimationFrame = savedCaf;
  };

  return { screen, container, sys, skillSystem, battleManager, cleanup };
}

test('Ultimate Energy Bar charges smoothly from empty to full with layered VFX and tier progression', async () => {
  const { screen, container, sys, cleanup } = await mountTestBattleScreen();
  try {
    const barWrap = container.querySelector('#hud-ult-bar-wrap');
    const ultBar = container.querySelector('#hud-ult-bar');
    const ultPct = container.querySelector('#hud-ult-pct');
    const ultBtn = container.querySelector('#btn-trigger-ultimate');
    const readyBadge = container.querySelector('#hud-ult-ready-badge');

    assert.ok(barWrap, 'expected #hud-ult-bar-wrap container');
    assert.ok(ultBar, 'expected #hud-ult-bar fill element');
    assert.ok(readyBadge, 'expected #hud-ult-ready-badge element');

    // Verify all layered energy bar VFX sub-elements exist in DOM
    assert.ok(container.querySelector('.dock-commander-card__bar-aura'), 'expected outer glow aura layer');
    assert.ok(container.querySelector('.ult-bar__flow'), 'expected flowing energy layer');
    assert.ok(container.querySelector('.ult-bar__particles'), 'expected moving particles layer');
    assert.ok(container.querySelector('.ult-bar__highlight'), 'expected inner surface highlight layer');
    assert.ok(container.querySelector('.ult-bar__pulse'), 'expected charge pulse layer');
    assert.ok(container.querySelector('.ult-bar__edge'), 'expected leading fill edge layer');
    assert.ok(container.querySelector('.ult-bar__complete-sweep'), 'expected full-charge completion sweep');
    assert.equal(container.querySelectorAll('.ult-bar__spark').length, 6, 'expected 6 charge burst sparks');
    assert.equal(
      container.querySelectorAll('.ult-bar__ambient-spark').length,
      2,
      'expected 2 ambient rising energy sparks',
    );

    // Begin active combat at 0 energy
    sys.gameState.setBattle({
      phase: BATTLE_PHASES.ACTIVE_COMBAT,
      status: 'running',
      ultimateEnergy: 0,
      ultimateMaxEnergy: 100,
    });
    screen._syncHud();

    assert.equal(ultBar.style.width, '0%');
    assert.equal(barWrap.getAttribute('data-ult-tier'), 'empty');
    assert.equal(barWrap.style.getPropertyValue('--ult-pct'), '0%');
    assert.equal(barWrap.style.getPropertyValue('--ult-ratio'), '0.0000');
    assert.equal(barWrap.classList.contains('has-ult-energy'), false);
    assert.equal(barWrap.classList.contains('is-ult-ready'), false);
    assert.equal(ultBtn.disabled, true);

    // Step 1: Charge to 15% (low tier) -> triggers charging pulse
    sys.gameState.setBattle({ ultimateEnergy: 15 });
    screen._syncHud();

    assert.equal(ultBar.style.width, '15%');
    assert.equal(ultPct.textContent, '15%');
    assert.equal(barWrap.getAttribute('data-ult-tier'), 'low');
    assert.equal(barWrap.style.getPropertyValue('--ult-pct'), '15%');
    assert.equal(barWrap.style.getPropertyValue('--ult-ratio'), '0.1500');
    assert.equal(barWrap.classList.contains('has-ult-energy'), true);
    assert.equal(barWrap.classList.contains('is-ult-charging'), true);
    assert.equal(barWrap.classList.contains('is-ult-ready'), false);

    // Step 2: Charge to 50% (mid tier)
    sys.gameState.setBattle({ ultimateEnergy: 50 });
    screen._syncHud();

    assert.equal(ultBar.style.width, '50%');
    assert.equal(barWrap.getAttribute('data-ult-tier'), 'mid');
    assert.equal(barWrap.style.getPropertyValue('--ult-pct'), '50%');
    assert.equal(barWrap.style.getPropertyValue('--ult-ratio'), '0.5000');
    assert.equal(barWrap.classList.contains('is-ult-full'), false);

    // Step 3: Charge to 82% (high tier — intensified glow + ambient sparks)
    sys.gameState.setBattle({ ultimateEnergy: 82 });
    screen._syncHud();

    assert.equal(ultBar.style.width, '82%');
    assert.equal(barWrap.getAttribute('data-ult-tier'), 'high');
    assert.equal(barWrap.style.getPropertyValue('--ult-pct'), '82%');
    assert.equal(barWrap.style.getPropertyValue('--ult-ratio'), '0.8200');
    assert.equal(barWrap.classList.contains('is-ult-ready'), false);
    assert.equal(ultBtn.disabled, true);

    // Step 4: Reach 100% (full charge completion + ultimate ready state)
    sys.gameState.setBattle({ ultimateEnergy: 100 });
    screen._syncHud();

    assert.equal(ultBar.style.width, '100%');
    assert.equal(ultPct.textContent, 'READY [SPC]');
    assert.equal(barWrap.getAttribute('data-ult-tier'), 'full');
    assert.equal(barWrap.style.getPropertyValue('--ult-pct'), '100%');
    assert.equal(barWrap.style.getPropertyValue('--ult-ratio'), '1.0000');
    assert.equal(barWrap.classList.contains('has-ult-energy'), true);
    assert.equal(barWrap.classList.contains('is-ult-full'), true);
    assert.equal(barWrap.classList.contains('is-ult-ready'), true);
    assert.equal(barWrap.classList.contains('is-ult-just-full'), true);
    assert.equal(barWrap.classList.contains('is-ult-charging'), false);
    assert.equal(ultBtn.classList.contains('is-ult-ready'), true);
    assert.equal(ultBtn.getAttribute('data-ult-ready'), 'true');
    assert.equal(ultBtn.disabled, false);
  } finally {
    cleanup();
  }
});

test('Ultimate Energy Bar clears all ready/completion VFX on spend and recharges cleanly', async () => {
  const { screen, container, sys, skillSystem, cleanup } = await mountTestBattleScreen();
  try {
    const barWrap = container.querySelector('#hud-ult-bar-wrap');
    const ultBar = container.querySelector('#hud-ult-bar');
    const ultPct = container.querySelector('#hud-ult-pct');
    const ultBtn = container.querySelector('#btn-trigger-ultimate');
    const cmdConsole = container.querySelector('#commander-console');

    // Fill to 100% in active combat
    sys.gameState.setBattle({
      phase: BATTLE_PHASES.ACTIVE_COMBAT,
      status: 'running',
      ultimateEnergy: 100,
      ultimateMaxEnergy: 100,
    });
    screen._syncHud();

    assert.equal(barWrap.classList.contains('is-ult-ready'), true);
    assert.equal(barWrap.classList.contains('is-ult-just-full'), true);
    assert.equal(ultBtn.classList.contains('is-ult-ready'), true);
    assert.equal(cmdConsole.classList.contains('is-ult-ready'), true);

    // Spend ultimate via real SkillSystem.activateUltimate
    const res = skillSystem.activateUltimate({});
    assert.equal(res.ok, true);
    assert.equal(sys.gameState.battle.ultimateEnergy, 0);
    screen._syncHud();

    // Ready & completion effects must disappear immediately
    assert.equal(ultBar.style.width, '0%');
    assert.equal(ultPct.textContent, '0%');
    assert.equal(barWrap.getAttribute('data-ult-tier'), 'empty');
    assert.equal(barWrap.style.getPropertyValue('--ult-pct'), '0%');
    assert.equal(barWrap.style.getPropertyValue('--ult-ratio'), '0.0000');
    assert.equal(barWrap.classList.contains('has-ult-energy'), false);
    assert.equal(barWrap.classList.contains('is-ult-full'), false);
    assert.equal(barWrap.classList.contains('is-ult-ready'), false);
    assert.equal(barWrap.classList.contains('is-ult-just-full'), false);
    assert.equal(barWrap.classList.contains('is-ult-charging'), false);
    assert.equal(ultBtn.classList.contains('is-ult-ready'), false);
    assert.equal(ultBtn.getAttribute('data-ult-ready'), 'false');
    assert.equal(ultBtn.disabled, true);
    assert.equal(cmdConsole.classList.contains('is-ult-ready'), false);

    // Recharge cycle #2: 0 -> 35 -> 100
    skillSystem.addUltimateEnergy(35);
    screen._syncHud();

    assert.equal(barWrap.classList.contains('has-ult-energy'), true);
    assert.equal(barWrap.classList.contains('is-ult-charging'), true);
    assert.equal(barWrap.classList.contains('is-ult-ready'), false);
    assert.ok(parseInt(ultBar.style.width, 10) >= 35, 'bar fill should reflect recharged energy');

    skillSystem.addUltimateEnergy(100);
    screen._syncHud();

    assert.equal(ultBar.style.width, '100%');
    assert.equal(ultPct.textContent, 'READY [SPC]');
    assert.equal(barWrap.getAttribute('data-ult-tier'), 'full');
    assert.equal(barWrap.classList.contains('is-ult-ready'), true);
    assert.equal(barWrap.classList.contains('is-ult-just-full'), true);
    assert.equal(ultBtn.disabled, false);
  } finally {
    cleanup();
  }
});

test('Repeated charge updates trigger pulse feedback, auto-clear after timeout, and retrigger cleanly', async () => {
  const { screen, container, sys, cleanup } = await mountTestBattleScreen();
  try {
    const barWrap = container.querySelector('#hud-ult-bar-wrap');

    sys.gameState.setBattle({
      phase: BATTLE_PHASES.ACTIVE_COMBAT,
      status: 'running',
      ultimateEnergy: 0,
      ultimateMaxEnergy: 100,
    });
    screen._syncHud();

    // Repeated rapid increments should smoothly advance fill and keep charging feedback alive
    for (const energy of [10, 12, 15, 18, 28]) {
      sys.gameState.setBattle({ ultimateEnergy: energy });
      screen._syncHud();
      assert.equal(barWrap.style.getPropertyValue('--ult-pct'), `${energy}%`);
      assert.equal(barWrap.classList.contains('is-ult-charging'), true);
    }

    // After pulse duration elapses (> 440ms), transient charging class clears automatically
    await new Promise((resolve) => setTimeout(resolve, 480));
    assert.equal(
      barWrap.classList.contains('is-ult-charging'),
      false,
      'is-ult-charging should clear after pulse duration',
    );
    assert.equal(screen._ultPulseTimer, null);

    // Subsequent charge gain retriggers the charging pulse cleanly
    sys.gameState.setBattle({ ultimateEnergy: 42 });
    screen._syncHud();
    assert.equal(barWrap.classList.contains('is-ult-charging'), true);
    assert.equal(barWrap.getAttribute('data-ult-tier'), 'mid');
  } finally {
    cleanup();
  }
});

test('Ultimate Energy Bar respects phase gating and cleans up timers on unmount', async () => {
  const { screen, container, sys, cleanup } = await mountTestBattleScreen();
  try {
    const barWrap = container.querySelector('#hud-ult-bar-wrap');
    const ultBtn = container.querySelector('#btn-trigger-ultimate');

    // During PREPARATION, even 100 energy must not enable ready VFX
    sys.gameState.setBattle({
      phase: BATTLE_PHASES.PREPARATION,
      ultimateEnergy: 100,
      ultimateMaxEnergy: 100,
    });
    screen._syncHud();
    assert.equal(barWrap.classList.contains('is-ult-ready'), false);
    assert.equal(ultBtn.classList.contains('is-ult-ready'), false);
    assert.equal(ultBtn.disabled, true);

    // Transition to ACTIVE_COMBAT activates ready state & completion timer
    sys.gameState.setBattle({
      phase: BATTLE_PHASES.ACTIVE_COMBAT,
      status: 'running',
      ultimateEnergy: 100,
    });
    screen._syncHud();
    assert.equal(barWrap.classList.contains('is-ult-ready'), true);
    assert.ok(screen._ultCompleteTimer !== null, 'expected completion feedback timer');

    // Transition to RESULTS disables ready state and clears completion feedback
    sys.gameState.setBattle({
      phase: BATTLE_PHASES.RESULTS,
      status: 'victory',
      ultimateEnergy: 100,
    });
    screen._syncHud();
    assert.equal(barWrap.classList.contains('is-ult-ready'), false);
    assert.equal(barWrap.classList.contains('is-ult-just-full'), false);
    assert.equal(screen._ultCompleteTimer, null);

    // Trigger a charging timer and verify unmount clears it cleanly
    sys.gameState.setBattle({
      phase: BATTLE_PHASES.ACTIVE_COMBAT,
      status: 'running',
      ultimateEnergy: 20,
    });
    screen._syncHud();
    sys.gameState.setBattle({ ultimateEnergy: 35 });
    screen._syncHud();
    assert.ok(screen._ultPulseTimer !== null, 'expected active charge pulse timer');

    screen.unmount();
    assert.equal(screen._ultPulseTimer, null, 'unmount must clear _ultPulseTimer');
    assert.equal(screen._ultCompleteTimer, null, 'unmount must clear _ultCompleteTimer');
  } finally {
    cleanup();
  }
});

test('styles/battle.css defines all Ultimate Energy Bar VFX layers and prefers-reduced-motion overrides', async () => {
  const css = await fs.readFile(path.join(ROOT, 'styles/battle.css'), 'utf8');

  // Balanced braces sanity check
  let depth = 0;
  for (const ch of css) {
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    assert.ok(depth >= 0, 'unbalanced closing brace in styles/battle.css');
  }
  assert.equal(depth, 0, 'unclosed brace in styles/battle.css');

  // Core layered effect selectors & keyframes
  const requiredTokens = [
    '.dock-commander-card__bar-aura',
    '.ult-bar__flow',
    '.ult-bar__particles::before',
    '.ult-bar__particles::after',
    '.ult-bar__highlight',
    '.ult-bar__pulse',
    '.ult-bar__edge',
    '.ult-bar__complete-sweep',
    '.ult-bar__sparks',
    '.ult-bar__spark',
    '.ult-bar__ambient-spark',
    '.dock-commander-card__ready-badge::after',
    '@keyframes ult-energy-flow',
    '@keyframes ult-mote-stream',
    '@keyframes ult-mote-stream-fast',
    '@keyframes ult-charge-pulse',
    '@keyframes ult-edge-spark-burst',
    '@keyframes ult-ambient-spark-rise',
    '@keyframes ult-complete-sweep',
    '@keyframes ult-ready-glint',
    '@keyframes ult-track-ready-pulse',
    '@keyframes ult-track-complete',
    '@keyframes ult-ready-badge-sheen',
    '@media (prefers-reduced-motion: reduce)',
  ];

  for (const token of requiredTokens) {
    assert.ok(css.includes(token), `styles/battle.css missing required token: ${token}`);
  }

  // Verify prefers-reduced-motion disables animations on all new energy bar layers
  const reducedIdx = css.lastIndexOf('@media (prefers-reduced-motion: reduce)');
  const reducedBlock = css.slice(reducedIdx);
  for (const sel of [
    '.dock-commander-card__ready-badge',
    '.dock-commander-card__bar-aura',
    '.ult-bar__flow',
    '.ult-bar__particles::before',
    '.ult-bar__particles::after',
    '.ult-bar__pulse',
    '.ult-bar__complete-sweep',
    '.ult-bar__spark',
    '.ult-bar__ambient-spark',
  ]) {
    assert.ok(
      reducedBlock.includes(sel),
      `prefers-reduced-motion block missing selector: ${sel}`,
    );
  }
});
