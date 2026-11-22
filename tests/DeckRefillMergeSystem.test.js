import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildDataRegistry } from '../src/utils/DataLoader.js';
import { EventBus } from '../src/core/EventBus.js';
import { GameState } from '../src/core/GameState.js';
import { SaveManager, SAVE_VERSION, DEFAULT_SAVE_KEY, migrateBattleDeck } from '../src/core/SaveManager.js';
import { createMemoryStorage } from '../src/utils/StorageUtils.js';
import { CardSystem } from '../src/systems/CardSystem.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { HeroSystem } from '../src/systems/HeroSystem.js';
import { FormationSystem } from '../src/systems/FormationSystem.js';
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
import { ScreenManager } from '../src/core/ScreenManager.js';
import { FormationScreen } from '../src/ui/FormationScreen.js';
import { BattleScreen } from '../src/ui/BattleScreen.js';
import { TutorialManager, TUTORIAL_STAGE_KEYS } from '../src/systems/TutorialManager.js';

function loadRegistry({ mutate = null } = {}) {
  const dataDir = path.resolve(process.cwd(), 'data');
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
  const raw = {
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
  };
  if (typeof mutate === 'function') mutate(raw);
  return buildDataRegistry(raw);
}

function createHarness({ storage = null, mutateData = null } = {}) {
  const dataRegistry = loadRegistry({ mutate: mutateData });
  const memStorage = storage || createMemoryStorage();
  const eventBus = new EventBus();
  const saveManager = new SaveManager({ storage: memStorage, eventBus });
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
  const unitManager = new UnitManager({ dataRegistry, eventBus });
  const targetingSystem = new TargetingSystem({ balance: dataRegistry.balance });
  const movementSystem = new MovementSystem({ balance: dataRegistry.balance });
  const combatSystem = new CombatSystem({ eventBus, dataRegistry });
  const projectileSystem = new ProjectileSystem({ eventBus });
  const skillSystem = new SkillSystem({ gameState, heroSystem, eventBus, dataRegistry });
  const waveManager = new WaveManager({ eventBus, balance: dataRegistry.balance });
  const animationManager = new AnimationManager();

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
    battleRenderer: null,
    animationManager,
    particleSystem: null,
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
    dataRegistry,
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
  };
}

function createMockElement(tagName = 'div', initialAttrs = {}) {
  const listeners = new Map();
  const children = [];
  const classSet = new Set(String(initialAttrs.class || '').split(/\s+/).filter(Boolean));
  const attrs = new Map(Object.entries(initialAttrs));
  let innerHtmlStr = '';
  let parsedNodes = [];

  const styleObj = {
    _props: new Map(),
    setProperty(k, v) { this._props.set(k, String(v)); },
    getPropertyValue(k) { return this._props.get(k) || ''; },
    removeProperty(k) { this._props.delete(k); },
  };

  const el = {
    tagName: tagName.toUpperCase(),
    id: initialAttrs.id || '',
    children,
    dataset: {},
    style: styleObj,
    hidden: Object.prototype.hasOwnProperty.call(initialAttrs, 'hidden'),
    disabled: Object.prototype.hasOwnProperty.call(initialAttrs, 'disabled'),
    textContent: '',
    value: '',
    title: initialAttrs.title || '',
    classList: {
      add(...cls) { for (const c of cls) if (c) classSet.add(c); },
      remove(...cls) { for (const c of cls) classSet.delete(c); },
      contains(c) { return classSet.has(c); },
      toggle(c, force) {
        const next = force !== undefined ? Boolean(force) : !classSet.has(c);
        if (next) classSet.add(c);
        else classSet.delete(c);
        return next;
      },
    },
    get className() { return Array.from(classSet).join(' '); },
    set className(val) {
      classSet.clear();
      for (const c of String(val || '').split(/\s+/).filter(Boolean)) classSet.add(c);
    },
    setAttribute(k, v) {
      attrs.set(k, String(v));
      if (k === 'class') el.className = v;
      else if (k === 'id') el.id = String(v);
      else if (k.startsWith('data-')) {
        const camel = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        el.dataset[camel] = String(v);
      }
    },
    getAttribute(k) {
      if (k === 'class') return el.className;
      if (k === 'id') return el.id;
      return attrs.has(k) ? attrs.get(k) : null;
    },
    appendChild(child) {
      children.push(child);
      return child;
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type);
      if (!list) return;
      const idx = list.indexOf(fn);
      if (idx >= 0) list.splice(idx, 1);
    },
    click() {
      if (el.disabled) return;
      const list = listeners.get('click') || [];
      for (const fn of [...list]) {
        fn({
          target: el,
          currentTarget: el,
          preventDefault() {},
          stopPropagation() {},
        });
      }
    },
    closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 120, height: 150, right: 120, bottom: 150 }; },
    get innerHTML() { return innerHtmlStr; },
    set innerHTML(html) {
      innerHtmlStr = String(html || '');
      children.length = 0;
      parsedNodes = parseHtmlElements(innerHtmlStr);
    },
    querySelector(sel) {
      return el.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      const out = [];
      const visit = (node) => {
        for (const c of [...(node._getParsed?.() || []), ...(node.children || [])]) {
          if (matchesSelector(c, sel)) out.push(c);
          visit(c);
        }
      };
      visit(el);
      return out;
    },
    _getParsed() {
      return parsedNodes;
    },
  };
  return el;
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

function matchesSelector(el, sel) {
  if (!sel) return false;
  if (sel.startsWith('#')) return el.id === sel.slice(1) || el.getAttribute?.('id') === sel.slice(1);
  if (sel.startsWith('.')) return el.classList?.contains(sel.slice(1));
  const attrMatch = sel.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
  if (attrMatch) {
    const [, key, val] = attrMatch;
    const actual = el.getAttribute?.(key);
    return val === undefined ? actual !== null : actual === val;
  }
  return false;
}

// ============================================================================
// 1. Deck Validation Tests
// ============================================================================

test('Deck Validation: enforces exact 6-card requirement, rejects duplicate names/IDs & invalid IDs, allows same-category cards', () => {
  const h = createHarness({
    mutateData(raw) {
      // Add an alternate ID card sharing the exact same name as Heavy Defender to verify name-uniqueness enforcement
      raw.cards.cards.push({
        id: 'card_shield_guard_alt',
        category: 'skill',
        rarity: 'R',
        unlockedByDefault: true,
        targeting: 'all_allies',
        name: 'Heavy Defender',
        iconAssetId: 'card_emblem_shield',
        cost: 20,
        cooldownSec: 2.5,
        effect: { kind: 'group_heal', healByTier: { '1': 50, '2': 80, '3': 120 } },
        description: 'Duplicate-name test card.',
      });
    },
  });

  // Fewer than 6 cards rejected
  assert.equal(h.cardSystem.setCustomDeck(['card_shield_guard', 'card_arcane_archer']).ok, false);
  // More than 6 cards rejected
  assert.equal(
    h.cardSystem.setCustomDeck([
      'card_shield_guard',
      'card_arcane_archer',
      'card_wind_cavalry',
      'card_field_cleric',
      'card_vanguard_breaker',
      'card_pulse_skirmisher',
      'card_skill_astral_nova',
    ]).ok,
    false,
  );
  // Unknown ID rejected
  assert.equal(
    h.cardSystem.setCustomDeck([
      'card_shield_guard',
      'card_arcane_archer',
      'card_wind_cavalry',
      'card_field_cleric',
      'card_skill_astral_nova',
      'card_nonexistent',
    ]).ok,
    false,
  );
  // Locked card rejected
  assert.equal(
    h.cardSystem.setCustomDeck([
      'card_shield_guard',
      'card_arcane_archer',
      'card_wind_cavalry',
      'card_field_cleric',
      'card_skill_astral_nova',
      'card_astral_construct',
    ]).ok,
    false,
  );
  // Duplicate card ID rejected
  assert.equal(
    h.cardSystem.setCustomDeck([
      'card_shield_guard',
      'card_shield_guard',
      'card_wind_cavalry',
      'card_field_cleric',
      'card_skill_astral_nova',
      'card_tactic_full_assault',
    ]).ok,
    false,
  );
  // Duplicate card NAME across different card IDs & categories rejected
  h.cardSystem.unlockCard('card_shield_guard_alt');
  const dupNameRes = h.cardSystem.setCustomDeck([
    'card_shield_guard',
    'card_shield_guard_alt',
    'card_wind_cavalry',
    'card_field_cleric',
    'card_skill_astral_nova',
    'card_tactic_full_assault',
  ]);
  assert.equal(dupNameRes.ok, false);
  assert.match(dupNameRes.reason, /Duplicate card name/i);

  // Different cards sharing the same category are accepted (all 6 Unit cards)
  const sixUnits = [
    'card_shield_guard',
    'card_wind_cavalry',
    'card_arcane_archer',
    'card_field_cleric',
    'card_vanguard_breaker',
    'card_pulse_skirmisher',
  ];
  const sameCatRes = h.cardSystem.setCustomDeck(sixUnits);
  assert.equal(sameCatRes.ok, true);
  assert.deepEqual(h.cardSystem.getCustomDeck(), sixUnits);
});

// ============================================================================
// 2. Random Generation With Replacement Tests
// ============================================================================

test('Random Generation: samples only from selected 6 cards with replacement, allows repeats, starts at Lv.I, and keeps definitions immutable', () => {
  const h = createHarness();
  const deckA = [
    'card_shield_guard',
    'card_arcane_archer',
    'card_field_cleric',
    'card_skill_astral_nova',
    'card_tactic_full_assault',
    'card_support_aegis_blessing',
  ];
  h.cardSystem.setCustomDeck(deckA);

  // Controllable RNG forcing slot repeats (0, 0, 0, 5, 5, 0)
  const rolls = [0.01, 0.05, 0.1, 0.9, 0.95, 0.0];
  let idx = 0;
  h.cardSystem.setRandomSource(() => rolls[idx++ % rolls.length]);

  const slots = h.cardSystem.initHand();
  assert.equal(slots.length, 6);
  const deckASet = new Set(deckA);

  for (const s of slots) {
    assert.ok(deckASet.has(s.cardId), `Generated card ${s.cardId} must belong to selected deck`);
    assert.equal(s.tier, 1);
    assert.equal(s.level, 1);
  }
  assert.equal(slots[0].cardId, 'card_shield_guard');
  assert.equal(slots[1].cardId, 'card_shield_guard');
  assert.equal(slots[2].cardId, 'card_shield_guard');
  assert.notEqual(slots[0].instanceId, slots[1].instanceId, 'Copies must be independent runtime instances');

  // Verify unlimited refills over time (12+ generations from 6-card deck) never exhaust
  const origDef = h.dataRegistry.cardsById.get('card_shield_guard');
  const origCost = origDef.cost;
  slots[0].cost = 999; // Mutating runtime copy must not mutate definition or sibling copies
  assert.equal(origDef.cost, origCost);
  assert.equal(h.cardSystem.getSlots()[1].cost, origCost);

  // Merge slots 1 & 2 into Lv.II and ensure original deck definition stays Lv.I / unchanged
  h.cardSystem.mergeAdjacent(1, 2);
  assert.equal(h.cardSystem.getSlots()[2].tier, 2);
  assert.equal(origDef.name, 'Heavy Defender');

  // Updating custom deck excludes removed cards in subsequent battle
  const deckB = [
    'card_wind_cavalry',
    'card_vanguard_breaker',
    'card_pulse_skirmisher',
    'card_skill_sanctuary_wave',
    'card_tactic_focus_fire',
    'card_support_overclock_core',
  ];
  h.cardSystem.setCustomDeck(deckB);
  const deckBSet = new Set(deckB);
  let sampleIdx = 0;
  h.cardSystem.setRandomSource(() => (sampleIdx++ % 6) / 6);
  const nextSlots = h.cardSystem.initHand();
  for (const s of nextSlots) {
    assert.ok(deckBSet.has(s.cardId));
    assert.equal(deckASet.has(s.cardId), false, 'Removed card from previous deck must not appear');
  }
});

// ============================================================================
// 3. Timed Automatic Refill Tests
// ============================================================================

test('Timed Refill: obeys central 5s config, runs independent slot timers, pauses/resumes, blocks stale battle timers, and ignores failed plays', () => {
  const h = createHarness();
  assert.equal(h.cardSystem.getRefillIntervalSec(), 5);

  h.battleManager.startSession(null, {
    stageId: 'stage_1_1',
    initialSlots: [
      'card_shield_guard',
      'card_arcane_archer',
      'card_field_cleric',
      'card_skill_astral_nova',
      'card_tactic_full_assault',
      'card_support_aegis_blessing',
    ],
  });
  h.battleManager.beginBattle();
  for (let i = 0; i < 65; i += 1) h.battleManager.stepSimulation(1 / 60);

  // Failed play (insufficient energy) must NOT consume card or start refill timer
  h.gameState.setBattle({ energy: 2, dp: 2 });
  const failPlay = h.battleManager.playCardSlot(0);
  assert.equal(failPlay.ok, false);
  assert.ok(h.cardSystem.getSlots()[0]);
  assert.equal(h.cardSystem.getRefillState(0).active, false);

  // Successful play at t=0 empties slot 0 and starts independent 5s timer
  h.gameState.setBattle({ energy: 100, dp: 100 });
  const okPlay0 = h.battleManager.playCardSlot(0);
  assert.equal(okPlay0.ok, true);
  assert.equal(h.cardSystem.getSlots()[0], null);
  assert.equal(h.cardSystem.getRefillState(0).active, true);
  assert.equal(h.cardSystem.getRefillState(0).remainingSec, 5);
  assert.equal(h.cardSystem.getRefillState(1).active, false);

  // Advance 2 seconds -> slot 0 has ~3s left; now play slot 3
  for (let i = 0; i < 120; i += 1) h.battleManager.stepSimulation(1 / 60);
  assert.equal(h.cardSystem.getSlots()[0], null);
  assert.ok(Math.abs(h.cardSystem.getRefillState(0).remainingSec - 3.0) < 0.1);

  h.gameState.setBattle({ energy: 100, dp: 100 });
  const okPlay3 = h.battleManager.playCardSlot(3);
  assert.equal(okPlay3.ok, true);
  assert.equal(h.cardSystem.getSlots()[3], null);
  assert.ok(Math.abs(h.cardSystem.getRefillState(3).remainingSec - 5.0) < 0.01);

  // Pause battle -> advance simulation -> remaining refill times must freeze
  h.battleManager.setPaused(true);
  const rem0Paused = h.cardSystem.getRefillState(0).remainingSec;
  const rem3Paused = h.cardSystem.getRefillState(3).remainingSec;
  for (let i = 0; i < 120; i += 1) h.battleManager.stepSimulation(1 / 60);
  assert.equal(h.cardSystem.getRefillState(0).remainingSec, rem0Paused);
  assert.equal(h.cardSystem.getRefillState(3).remainingSec, rem3Paused);

  // Resume -> advance 3.05s -> slot 0 refills (1x), slot 3 still has ~1.95s remaining
  let slot0RefillEvents = 0;
  h.eventBus.on('cards:refilled', ({ slotIndex }) => {
    if (slotIndex === 0) slot0RefillEvents += 1;
  });
  h.battleManager.setPaused(false);
  for (let i = 0; i < 183; i += 1) h.battleManager.stepSimulation(1 / 60);
  assert.ok(h.cardSystem.getSlots()[0], 'Slot 0 must refill after full 5s');
  assert.equal(h.cardSystem.getSlots()[0].tier, 1);
  assert.equal(slot0RefillEvents, 1, 'One refill timer must never generate multiple cards');
  assert.equal(h.cardSystem.getRefillState(0).active, false);
  assert.equal(h.cardSystem.getSlots()[3], null, 'Slot 3 timer must stay independent');
  assert.equal(h.cardSystem.getRefillState(3).active, true);

  // Advance another 2.05s -> slot 3 refills
  for (let i = 0; i < 125; i += 1) h.battleManager.stepSimulation(1 / 60);
  assert.ok(h.cardSystem.getSlots()[3]);

  // Capture old battle token & start a pending refill on slot 1, then start a new battle
  h.gameState.setBattle({ energy: 100, dp: 100 });
  h.battleManager.playCardSlot(1);
  const oldToken = h.cardSystem.getBattleToken();
  assert.equal(h.cardSystem.getRefillState(1).active, true);

  // Ending battle (victory/defeat/stop) cancels pending refills & prevents old token updates
  h.battleManager.stopSession();
  assert.equal(h.cardSystem.getRefillState(1).active, false);

  h.battleManager.startSession(null, { stageId: 'stage_1_1' });
  h.battleManager.beginBattle();
  for (let i = 0; i < 65; i += 1) h.battleManager.stepSimulation(1 / 60);
  const newSlotsSnapshot = h.cardSystem.getSlots().map((s) => s.instanceId);
  const staleRes = h.cardSystem.updateRefills(10, oldToken);
  assert.equal(staleRes.refilled.length, 0);
  assert.deepEqual(
    h.cardSystem.getSlots().map((s) => s.instanceId),
    newSlotsSnapshot,
    'Old battle token must not affect new battle',
  );
});

test('Timed Refill respects custom central refillIntervalSec configuration', () => {
  const h = createHarness({
    mutateData(raw) {
      raw.balance.deck.refillIntervalSec = 3;
      raw.cards.handConfig.refillIntervalSec = 3;
    },
  });
  assert.equal(h.cardSystem.getRefillIntervalSec(), 3);
  h.cardSystem.initHand();
  h.gameState.setBattle({ energy: 100, dp: 100 });
  h.cardSystem.playCard(2);
  h.cardSystem.updateRefills(2.5);
  assert.equal(h.cardSystem.getSlots()[2], null);
  h.cardSystem.updateRefills(0.6);
  assert.ok(h.cardSystem.getSlots()[2]);
});

// ============================================================================
// 4. Card Merging Tests (All Rules + Category Upgrade Scaling)
// ============================================================================

test('Merging: allows adjacent and non-adjacent pairs (including slots 1+6 and 2+5), blocks invalid pairs/self-merge/Lv.III, refills source slot, and scales all 4 categories', () => {
  const h = createHarness();
  h.battleManager.startSession(null, {
    stageId: 'stage_1_1',
    customDeckIds: [
      'card_shield_guard',
      'card_skill_astral_nova',
      'card_tactic_full_assault',
      'card_support_aegis_blessing',
      'card_arcane_archer',
      'card_field_cleric',
    ],
    initialSlots: [
      'card_shield_guard',         // Slot 1 (idx 0)
      'card_skill_astral_nova',    // Slot 2 (idx 1)
      'card_tactic_full_assault',  // Slot 3 (idx 2)
      'card_shield_guard',         // Slot 4 (idx 3)
      'card_skill_astral_nova',    // Slot 5 (idx 4)
      'card_shield_guard',         // Slot 6 (idx 5)
    ],
  });
  h.battleManager.beginBattle();
  for (let i = 0; i < 65; i += 1) h.battleManager.stepSimulation(1 / 60);

  // Invalid indices & self-merge fail safely without mutating slots
  assert.equal(h.cardSystem.canMerge(-1, 0), false);
  assert.equal(h.cardSystem.canMerge(0, 6), false);
  assert.equal(h.cardSystem.canMerge(1.5, 2), false);
  assert.equal(h.cardSystem.canMerge(0, 0), false);
  assert.equal(h.cardSystem.mergeAdjacent(-1, 0).ok, false);
  assert.equal(h.cardSystem.mergeAdjacent(0, 6).ok, false);
  assert.equal(h.cardSystem.mergeAdjacent(0, 0).ok, false);
  assert.equal(h.cardSystem.getSlots()[0].cardId, 'card_shield_guard');

  // Different card IDs, names, and categories cannot merge
  assert.equal(h.cardSystem.canMerge(0, 1), false);
  assert.equal(h.cardSystem.canMerge(1, 2), false);

  // Forced same-ID & baseName but different category guard check
  const origSlot2 = { ...h.cardSystem._slots[2] };
  h.cardSystem._slots[2].cardId = h.cardSystem._slots[1].cardId;
  h.cardSystem._slots[2].baseName = h.cardSystem._slots[1].baseName;
  assert.equal(h.cardSystem.canMerge(1, 2), false, 'Different categories cannot merge');
  h.cardSystem._slots[2] = origSlot2;

  // Forced same-ID & category but different baseName guard check
  const origSlot3Base = h.cardSystem._slots[3].baseName;
  h.cardSystem._slots[3].baseName = 'Different Base Name';
  assert.equal(h.cardSystem.canMerge(0, 3), false, 'Different base names cannot merge');
  h.cardSystem._slots[3].baseName = origSlot3Base;

  // Non-adjacent Slot 1 (idx 0) + Slot 6 (idx 5) merge -> Lv.II at idx 5, idx 0 starts 5s refill, no unit spawned
  assert.equal(h.cardSystem.canMerge(0, 5), true);
  const alliesBefore = h.unitManager.getActiveCount('ally');
  const m1 = h.battleManager.interactWithCardSlot(0);
  assert.equal(m1.action, 'selected');
  const m1Done = h.battleManager.interactWithCardSlot(5);
  assert.equal(m1Done.action, 'merged');
  assert.equal(m1Done.ok, true);
  assert.equal(m1Done.upgradedCard.tier, 2);
  assert.equal(m1Done.upgradedCard.levelLabel, 'Lv.II');
  assert.equal(h.cardSystem.getSlots()[5].tier, 2);
  assert.equal(h.cardSystem.getSlots()[0], null);
  assert.equal(h.cardSystem.getRefillState(0).active, true);
  assert.equal(h.unitManager.getActiveCount('ally'), alliesBefore, 'Merging must not spawn a unit directly');

  // Different tiers cannot merge (idx 3 is Lv.I, idx 5 is Lv.II)
  assert.equal(h.cardSystem.canMerge(3, 5), false);
  assert.equal(h.cardSystem.mergeAdjacent(3, 5).ok, false);

  // Non-adjacent Slot 2 (idx 1) + Slot 5 (idx 4) merge -> Lv.II Skill at idx 4, idx 1 starts 5s refill
  assert.equal(h.cardSystem.canMerge(1, 4), true);
  const mSkill = h.cardSystem.mergeAdjacent(1, 4);
  assert.equal(mSkill.ok, true);
  assert.equal(mSkill.upgradedCard.tier, 2);
  assert.equal(h.cardSystem.getSlots()[1], null);
  assert.equal(h.cardSystem.getRefillState(1).active, true);

  // Adjacent identical pair (slots 2 & 3) also merges cleanly
  h.cardSystem._slots[2] = h.cardSystem._createCardInstance(h.dataRegistry.cardsById.get('card_shield_guard'), 1);
  assert.equal(h.cardSystem.canMerge(2, 3), true);
  const mAdj = h.cardSystem.mergeAdjacent(2, 3);
  assert.equal(mAdj.ok, true);
  assert.equal(mAdj.upgradedCard.tier, 2);
  assert.equal(h.cardSystem.getSlots()[2], null);
  assert.equal(h.cardSystem.getRefillState(2).active, true);

  // Merge Lv.II in slot 3 with Lv.II in slot 5 -> Lv.III at slot 5
  assert.equal(h.cardSystem.canMerge(3, 5), true);
  const mMax = h.cardSystem.mergeAdjacent(3, 5);
  assert.equal(mMax.ok, true);
  assert.equal(mMax.upgradedCard.tier, 3);
  assert.equal(mMax.upgradedCard.levelLabel, 'Lv.III');
  assert.equal(h.cardSystem.getSlots()[3], null);
  assert.equal(h.cardSystem.getRefillState(3).active, true);

  // Level III cannot merge further
  h.cardSystem._slots[3] = h.cardSystem._createCardInstance(h.dataRegistry.cardsById.get('card_shield_guard'), 3);
  h.cardSystem._refillTimers[3] = null;
  assert.equal(h.cardSystem.canMerge(3, 5), false);
  const failMax = h.cardSystem.mergeAdjacent(3, 5);
  assert.equal(failMax.ok, false);
  assert.match(failMax.reason, /maximum Level III/i);

  // Verify upgraded effects across all 4 categories actually execute with upgraded tier scaling:
  // 1) Unit Card Lv.III spawns 2 stronger units
  h.gameState.setBattle({ energy: 100, dp: 100 });
  const unitPlay = h.battleManager.playCardSlot(5);
  assert.equal(unitPlay.ok, true);
  assert.equal(unitPlay.outcome.spawned.length, 2);
  assert.equal(unitPlay.outcome.spawned[0].tier, 3);

  // 2) Skill Card Lv.II deals higher damage & larger radius in real battle
  const skillPlay = h.battleManager.playCardSlot(4);
  assert.equal(skillPlay.ok, true);
  assert.equal(skillPlay.card.tier, 2);
  assert.equal(skillPlay.outcome.radius, 24);

  // 3) Tactic Card Lv.II applies stronger attack buff & longer duration
  h.cardSystem._slots[0] = h.cardSystem._createCardInstance(h.dataRegistry.cardsById.get('card_tactic_full_assault'), 2);
  h.cardSystem._refillTimers[0] = null;
  h.gameState.setBattle({ energy: 100, dp: 100 });
  const tacticPlay = h.battleManager.playCardSlot(0);
  assert.equal(tacticPlay.ok, true);
  assert.equal(tacticPlay.outcome.tactic.duration, 9.5);

  // 4) Support Card Lv.II grants stronger ward shield & longer duration
  h.cardSystem._slots[1] = h.cardSystem._createCardInstance(h.dataRegistry.cardsById.get('card_support_aegis_blessing'), 2);
  h.cardSystem._refillTimers[1] = null;
  h.gameState.setBattle({ energy: 100, dp: 100 });
  const supportPlay = h.battleManager.playCardSlot(1);
  assert.equal(supportPlay.ok, true);
  const allyWithWard = h.unitManager.getBySide('ally')[0];
  assert.ok(allyWithWard.shield >= 210);
});

// ============================================================================
// 5. Save Migration & Compatibility Tests
// ============================================================================

test('Save Migration: migrates v4 12-card decks (with duplicates) to 6 unique cards without losing collection or unrelated progress', () => {
  const storage = createMemoryStorage();
  const legacyV4 = {
    version: 4,
    player: { name: 'StarCmdr', level: 12, xp: 45, xpToNext: 200 },
    resources: { credits: 15000, astrite: 7200, stamina: 55, maxStamina: 60 },
    heroes: {
      owned: {
        astra: { id: 'astra', level: 8, xp: 10, copies: 2 },
        kael: { id: 'kael', level: 4, xp: 0, copies: 1 },
      },
    },
    formation: {
      commanderId: 'kael',
      unitSlots: ['heavy_shield_guard', 'wind_cavalry', 'arcane_archer', 'field_cleric'],
      battleDeck: [
        'card_shield_guard',
        'card_shield_guard',
        'card_arcane_archer',
        'card_arcane_archer',
        'card_wind_cavalry',
        'card_wind_cavalry',
        'card_field_cleric',
        'card_skill_astral_nova',
        'card_skill_sanctuary_wave',
        'card_tactic_full_assault',
        'card_tactic_focus_fire',
        'card_support_aegis_blessing',
      ],
    },
    progression: {
      selectedStageId: 'stage_2_2',
      unlockedStages: ['stage_1_1', 'stage_1_2', 'stage_2_2'],
      clearedStages: ['stage_1_1', 'stage_1_2'],
      stageRatings: { stage_1_1: 'S', stage_1_2: 'A' },
      unlockedCards: [
        'card_shield_guard',
        'card_wind_cavalry',
        'card_arcane_archer',
        'card_field_cleric',
        'card_skill_astral_nova',
        'card_skill_sanctuary_wave',
        'card_tactic_full_assault',
        'card_tactic_focus_fire',
        'card_support_aegis_blessing',
        'card_solar_pyromancer',
      ],
      claimedSessions: ['sess_1'],
      battleStats: { battlesPlayed: 9, battlesWon: 8, totalEnemiesDefeated: 95 },
    },
    settings: { musicVolume: 0.3, sfxVolume: 0.9, muted: false, battleSpeed: 2, graphicsQuality: 'medium' },
    tutorial: { completed: true, skipped: false, completedAt: '2026-01-01T00:00:00.000Z' },
  };
  storage.setItem(DEFAULT_SAVE_KEY, JSON.stringify(legacyV4));

  const saveManager = new SaveManager({ storage });
  const loaded = saveManager.load();

  assert.equal(loaded.data.version, SAVE_VERSION);
  assert.equal(loaded.data.formation.battleDeck.length, 6);
  assert.equal(new Set(loaded.data.formation.battleDeck).size, 6, 'Migrated deck must have 6 unique cards');
  assert.deepEqual(loaded.data.formation.battleDeck, [
    'card_shield_guard',
    'card_arcane_archer',
    'card_wind_cavalry',
    'card_field_cleric',
    'card_skill_astral_nova',
    'card_skill_sanctuary_wave',
  ]);

  // Entire card collection preserved intact
  assert.equal(loaded.data.progression.unlockedCards.length, 10);
  assert.ok(loaded.data.progression.unlockedCards.includes('card_solar_pyromancer'));

  // Unrelated progress preserved
  assert.equal(loaded.data.player.level, 12);
  assert.equal(loaded.data.resources.credits, 15000);
  assert.equal(loaded.data.resources.astrite, 7200);
  assert.equal(loaded.data.formation.commanderId, 'kael');
  assert.deepEqual(loaded.data.progression.clearedStages, ['stage_1_1', 'stage_1_2']);
  assert.equal(loaded.data.settings.battleSpeed, 2);
  assert.equal(loaded.data.tutorial.completed, true);

  // Deterministic fill when legacy deck had <6 unique valid cards
  const partialMigrated = migrateBattleDeck(
    ['card_shield_guard', 'card_shield_guard', 'card_invalid_id'],
    legacyV4.progression.unlockedCards,
  );
  assert.equal(partialMigrated.length, 6);
  assert.equal(new Set(partialMigrated).size, 6);
});

test('Battle Guard: redirects to deck builder when saved deck cannot assemble 6 valid unique cards', () => {
  const storage = createMemoryStorage();
  const limitedSave = {
    version: SAVE_VERSION,
    player: { name: 'Newbie', level: 1, xp: 0, xpToNext: 100 },
    resources: { credits: 1000, astrite: 500, stamina: 60, maxStamina: 60 },
    heroes: { owned: { astra: { id: 'astra', level: 1, xp: 0, copies: 1 } } },
    formation: {
      commanderId: 'astra',
      unitSlots: ['heavy_shield_guard', 'wind_cavalry', 'arcane_archer', 'field_cleric'],
      battleDeck: ['card_shield_guard', 'card_arcane_archer'],
    },
    progression: {
      selectedStageId: 'stage_1_1',
      unlockedStages: ['stage_1_1'],
      clearedStages: [],
      stageRatings: {},
      unlockedCards: ['card_shield_guard', 'card_arcane_archer'],
    },
    settings: { musicVolume: 0.45, sfxVolume: 0.65, muted: false, battleSpeed: 1, graphicsQuality: 'high' },
    tutorial: { completed: true, skipped: false, completedAt: '2026-01-01T00:00:00.000Z' },
  };
  storage.setItem(DEFAULT_SAVE_KEY, JSON.stringify(limitedSave));

  const h = createHarness({ storage });
  assert.equal(h.cardSystem.isDeckReadyForBattle().ok, false);

  const notifications = [];
  const screenManager = new ScreenManager({
    viewportEl: createMockElement('div'),
    navRootEl: createMockElement('nav'),
    eventBus: h.eventBus,
  });

  const ctx = {
    eventBus: h.eventBus,
    gameState: h.gameState,
    saveManager: h.saveManager,
    screenManager,
    assetManager: { bindImageElement() {} },
    audioManager: { playClick() {}, playInvalid() {} },
    dataRegistry: h.dataRegistry,
    heroSystem: h.heroSystem,
    formationSystem: h.formationSystem,
    cardSystem: h.cardSystem,
    economySystem: h.economySystem,
    progressionSystem: h.progressionSystem,
    battleManager: h.battleManager,
    tutorialManager: h.tutorialManager,
    notify: (msg, level) => notifications.push({ msg, level }),
  };

  screenManager.register('formation', new FormationScreen(ctx));
  screenManager.register('battle', new BattleScreen(ctx));
  screenManager.navigate('battle');

  assert.equal(screenManager.getActiveScreenId(), 'formation');
  assert.equal(h.gameState.ui.formationTab, 'deck');
  assert.ok(notifications.some((n) => /6 unique cards/i.test(n.msg)));
});

// ============================================================================
// 6. Tutorial Skip & Replay Normal RNG Restoration Test
// ============================================================================

test('Tutorial: skipping mid-tutorial restores normal random generation for subsequent battles', () => {
  const h = createHarness();
  h.tutorialManager.startSession();
  assert.equal(h.tutorialManager.getCurrentStage(), TUTORIAL_STAGE_KEYS.SELECT_UNIT);
  assert.ok(h.cardSystem._cardGenerator, 'Tutorial installs deterministic refill generator');

  h.tutorialManager.confirmSkip();
  assert.equal(h.tutorialManager.isActive(), false);
  assert.equal(h.cardSystem._cardGenerator, null, 'Skipping tutorial must restore normal RNG');
  assert.equal(h.battleManager.isTutorialSession(), false);
});

// ============================================================================
// 7. Deck Builder UI & Battle UI Refill/Merge Integration Tests
// ============================================================================

test('FormationScreen Deck UI: displays 6-card deck count, category filters, prevents duplicates, and updates saved deck', () => {
  const h = createHarness();
  h.gameState.setUI({ formationTab: 'deck' });
  const container = createMockElement('div');
  const notifications = [];

  const screen = new FormationScreen({
    eventBus: h.eventBus,
    gameState: h.gameState,
    saveManager: h.saveManager,
    screenManager: { navigate() {} },
    assetManager: { bindImageElement() {} },
    audioManager: {
      playClick() {},
      playInvalid() {},
      playCardSelect() {},
      playReward() {},
      playDeploy() {},
    },
    dataRegistry: h.dataRegistry,
    heroSystem: h.heroSystem,
    formationSystem: h.formationSystem,
    cardSystem: h.cardSystem,
    economySystem: h.economySystem,
    progressionSystem: h.progressionSystem,
    notify: (msg, level) => notifications.push({ msg, level }),
  });

  screen.mount(container);

  // Starts with 6/6 default cards; removing two shows 4/6 and disables Save
  assert.equal(screen._draftDeck.length, 6);
  const removeBtn0 = container.querySelector('[data-deck-remove="card_shield_guard"]');
  removeBtn0.click();
  const removeBtn1 = container.querySelector('[data-deck-remove="card_arcane_archer"]');
  removeBtn1.click();

  assert.equal(screen._draftDeck.length, 4);
  assert.ok(container.innerHTML.includes('Battle Deck (4/6)'));
  assert.equal(container.querySelector('#btn-deck-save').disabled, true);

  // Category filter switches to Tactic cards
  container.querySelector('[data-deck-cat="tactic"]').click();
  assert.equal(h.gameState.ui.cardCategoryFilter, 'tactic');
  assert.ok(container.querySelector('[data-card-id="card_tactic_focus_fire"]'));

  // Re-add two different cards to reach 6/6 and save
  container.querySelector('[data-deck-add="card_tactic_focus_fire"]').click();
  container.querySelector('[data-deck-cat="all"]').click();
  container.querySelector('[data-deck-add="card_wind_cavalry"]').click();
  assert.equal(screen._draftDeck.length, 6);
  assert.ok(container.innerHTML.includes('Battle Deck (6/6)'));
  assert.equal(container.querySelector('#btn-deck-save').disabled, false);

  container.querySelector('#btn-deck-save').click();
  assert.equal(h.cardSystem.getCustomDeck().includes('card_tactic_focus_fire'), true);
  assert.equal(h.cardSystem.getCustomDeck().includes('card_wind_cavalry'), true);

  screen.unmount();
});

test('BattleScreen UI: highlights non-adjacent merge partners, displays live refill countdown, and shows Merge -> II / III', () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  globalThis.document = {
    createElement(tag) { return createMockElement(tag); },
    getElementById() { return null; },
  };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };

  try {
    const h = createHarness();
    h.tutorialManager.markCompleted();
    const container = createMockElement('div');

    // Deterministic start: slots 0 & 5 identical Lv.I (non-adjacent!), slots 1..4 distinct
    h.cardSystem.setCardGenerator(({ slotIndex }) => {
      if (slotIndex === 0 || slotIndex === 5) return 'card_shield_guard';
      if (slotIndex === 1) return 'card_arcane_archer';
      if (slotIndex === 2) return 'card_field_cleric';
      if (slotIndex === 3) return 'card_tactic_full_assault';
      return 'card_skill_astral_nova';
    });

    const screen = new BattleScreen({
      eventBus: h.eventBus,
      gameState: h.gameState,
      saveManager: h.saveManager,
      screenManager: { navigate() {} },
      assetManager: { bindImageElement() {} },
      audioManager: { playClick() {}, playInvalid() {}, playCardDraw() {} },
      dataRegistry: h.dataRegistry,
      heroSystem: h.heroSystem,
      formationSystem: h.formationSystem,
      cardSystem: h.cardSystem,
      economySystem: h.economySystem,
      progressionSystem: h.progressionSystem,
      battleManager: h.battleManager,
      tutorialManager: h.tutorialManager,
      notify() {},
    });

    screen.mount(container);
    h.battleManager.beginBattle();
    for (let i = 0; i < 65; i += 1) h.battleManager.stepSimulation(1 / 60);
    screen._renderCardSlots();

    // Non-adjacent pair in slots 0 & 5 highlights as merge-ready and indicates Merge -> II
    assert.equal(screen._slotNodes[0].root.classList.contains('is-merge-ready'), true);
    assert.equal(screen._slotNodes[5].root.classList.contains('is-merge-ready'), true);
    assert.equal(screen._slotNodes[0].hint.textContent, 'Merge → II');
    assert.equal(screen._slotNodes[5].hint.textContent, 'Merge → II');

    // Selecting slot 0 highlights non-adjacent slot 5 as active merge target (and never slot 0 itself)
    const mergeRes = h.battleManager.interactWithCardSlot(0);
    assert.equal(mergeRes.action, 'selected');
    screen._renderCardSlots();
    assert.equal(screen._slotNodes[0].root.classList.contains('is-selected'), true);
    assert.equal(screen._slotNodes[0].root.classList.contains('is-merge-target'), false);
    assert.equal(screen._slotNodes[5].root.classList.contains('is-merge-target'), true);
    assert.equal(screen._slotNodes[5].hint.textContent, 'Merge → II');

    // Merge slot 0 into slot 5 -> slot 0 enters refill countdown (5.0s -> 2.5s), slot 5 becomes Lv.II
    const mergeDone = h.battleManager.interactWithCardSlot(5);
    assert.equal(mergeDone.action, 'merged');
    screen._renderCardSlots();

    assert.equal(screen._slotNodes[0].refillWrap.hidden, false);
    assert.equal(screen._slotNodes[0].refillTime.textContent, '5.0s');
    assert.equal(screen._slotNodes[5].tier.textContent, 'Lv.II');

    // Put another Lv.II Shield Guard in slot 2 and verify Merge -> III highlight
    h.cardSystem._slots[2] = h.cardSystem._createCardInstance(h.dataRegistry.cardsById.get('card_shield_guard'), 2);
    screen._renderCardSlots();
    assert.equal(screen._slotNodes[2].hint.textContent, 'Merge → III');
    assert.equal(screen._slotNodes[5].hint.textContent, 'Merge → III');

    // Advance 2.5s -> countdown updates to 2.5s and progress bar to 50%
    for (let i = 0; i < 150; i += 1) h.battleManager.stepSimulation(1 / 60);
    assert.equal(screen._slotNodes[0].refillTime.textContent, '2.5s');
    assert.equal(screen._slotNodes[0].refillFill.style.width, '50%');

    // Advance remaining 2.6s -> slot 0 refills and hides refill overlay
    for (let i = 0; i < 156; i += 1) h.battleManager.stepSimulation(1 / 60);
    assert.equal(screen._slotNodes[0].refillWrap.hidden, true);
    assert.equal(screen._slotNodes[0].tier.textContent, 'Lv.I');

    screen.unmount();
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
});
