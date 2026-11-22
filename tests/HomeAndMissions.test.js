import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildDataRegistry, validateDataBundle } from '../src/utils/DataLoader.js';
import { EventBus } from '../src/core/EventBus.js';
import { GameState } from '../src/core/GameState.js';
import { SaveManager, SAVE_VERSION } from '../src/core/SaveManager.js';
import { createMemoryStorage } from '../src/utils/StorageUtils.js';
import { HeroSystem } from '../src/systems/HeroSystem.js';
import { FormationSystem } from '../src/systems/FormationSystem.js';
import { CardSystem } from '../src/systems/CardSystem.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.js';
import {
  MissionSystem,
  getDailyPeriodKey,
  getWeeklyPeriodKey,
} from '../src/systems/MissionSystem.js';
import { HomeScreen } from '../src/ui/HomeScreen.js';
import { MissionsScreen, resolveMissionDestination } from '../src/ui/MissionsScreen.js';

function readFullBundle() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
  return {
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
}

function createHarness({ now = new Date('2026-05-13T12:00:00Z'), customMissions = null, storage = null } = {}) {
  const bundle = readFullBundle();
  if (customMissions) {
    bundle.missions = customMissions;
  }
  const dataRegistry = buildDataRegistry(bundle);
  const memStorage = storage || createMemoryStorage();
  const eventBus = new EventBus();
  const saveManager = new SaveManager({ storage: memStorage, eventBus });
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
    formationSystem,
    cardSystem,
    saveManager,
    eventBus,
  });

  let currentTime = new Date(now);
  const missionSystem = new MissionSystem({
    dataRegistry,
    gameState,
    economySystem,
    progressionSystem,
    saveManager,
    eventBus,
    clock: () => new Date(currentTime),
  });

  return {
    bundle,
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
    setNow(nextDate) {
      currentTime = new Date(nextDate);
    },
  };
}

/**
 * Lightweight HTML-inspecting mock DOM node for testing screen controllers in Node
 * without external dependencies. Supports querySelector / querySelectorAll for
 * tag, class, #id, and [attr] / [attr="val"] selectors plus click dispatch.
 */
function createMockContainer() {
  let rawHtml = '';
  let bodyHtml = '';
  let parsedNodes = [];
  let bodyNodes = [];
  const scrolledChapters = [];

  function parseHtml(html) {
    const nodes = [];
    const tagRegex = /<(button|article|aside|section|div|img|nav|header|h1|h2|h3|span)\b([^>]*)>/gi;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
      const tag = match[1].toLowerCase();
      const attrStr = match[2] || '';
      const attrs = {};
      const attrRegex = /([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g;
      let am;
      while ((am = attrRegex.exec(attrStr)) !== null) {
        attrs[am[1]] = am[2] !== undefined ? am[2] : '';
      }
      const listeners = {};
      const node = {
        tag,
        attrs,
        scrollTop: 0,
        get innerHTML() {
          return node.attrs.id === 'missions-body' ? bodyHtml : '';
        },
        set innerHTML(val) {
          if (node.attrs.id === 'missions-body') {
            bodyHtml = String(val);
            bodyNodes = parseHtml(bodyHtml);
          }
        },
        getAttribute(name) {
          return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
        },
        hasAttribute(name) {
          return Object.prototype.hasOwnProperty.call(attrs, name);
        },
        addEventListener(type, fn) {
          if (!listeners[type]) listeners[type] = [];
          listeners[type].push(fn);
        },
        click() {
          if (Object.prototype.hasOwnProperty.call(attrs, 'disabled')) return;
          for (const fn of listeners.click || []) fn({ currentTarget: node, target: node });
        },
        scrollIntoView(opts) {
          scrolledChapters.push({ chapter: attrs['data-chapter'] || null, opts });
        },
        querySelector(sel) {
          const pool = node.attrs.id === 'missions-body' ? bodyNodes : [...parsedNodes, ...bodyNodes];
          return pool.find((n) => matchesSelector(n, sel)) || null;
        },
        querySelectorAll(sel) {
          const pool = node.attrs.id === 'missions-body' ? bodyNodes : [...parsedNodes, ...bodyNodes];
          return pool.filter((n) => matchesSelector(n, sel));
        },
      };
      nodes.push(node);
    }
    return nodes;
  }

  function matchesSelector(node, selector) {
    const sel = selector.trim();
    const parts = sel.split(/\s+/);
    const leaf = parts[parts.length - 1];

    const idMatch = leaf.match(/#([a-zA-Z0-9_-]+)/);
    if (idMatch && node.attrs.id !== idMatch[1]) return false;

    const classMatches = [...leaf.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
    const nodeClasses = (node.attrs.class || '').split(/\s+/).filter(Boolean);
    for (const cls of classMatches) {
      if (!nodeClasses.includes(cls)) return false;
    }

    const attrMatches = [...leaf.matchAll(/\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/g)];
    for (const am of attrMatches) {
      const attrName = am[1];
      const attrVal = am[2];
      if (!Object.prototype.hasOwnProperty.call(node.attrs, attrName)) return false;
      if (attrVal !== undefined && node.attrs[attrName] !== attrVal) return false;
    }

    const tagMatch = leaf.match(/^([a-zA-Z0-9]+)/);
    if (tagMatch && node.tag !== tagMatch[1].toLowerCase()) return false;

    return true;
  }

  const container = {
    get innerHTML() {
      return rawHtml + bodyHtml;
    },
    set innerHTML(val) {
      rawHtml = String(val);
      bodyHtml = '';
      bodyNodes = [];
      parsedNodes = parseHtml(rawHtml);
    },
    querySelector(sel) {
      return [...parsedNodes, ...bodyNodes].find((n) => matchesSelector(n, sel)) || null;
    },
    querySelectorAll(sel) {
      return [...parsedNodes, ...bodyNodes].filter((n) => matchesSelector(n, sel));
    },
    getScrolledChapters() {
      return scrolledChapters;
    },
  };

  return container;
}

test('DataLoader validates missions.json and stages.json chapter metadata cleanly', () => {
  const bundle = readFullBundle();
  const validation = validateDataBundle(bundle);
  assert.equal(validation.valid, true, `Validation errors: ${validation.errors.join('; ')}`);

  const reg = buildDataRegistry(bundle);
  assert.equal(reg.chapters.length, 3);
  assert.equal(reg.missions.daily.length, 5);
  assert.equal(reg.missions.weekly.length, 6);
  assert.equal(reg.missions.seasonalEvents.length, 0, 'No fake seasonal event should be configured by default');
});

test('SaveManager migrates v3 saves to v4 with mission tracking intact', () => {
  const storage = createMemoryStorage();
  const v3Save = {
    version: 3,
    savedAt: '2026-05-01T00:00:00Z',
    player: { name: 'Commander', level: 4, xp: 45, xpToNext: 220 },
    resources: { credits: 3200, astrite: 1800, stamina: 100, maxStamina: 120 },
    progression: {
      unlockedStages: ['stage_1_1', 'stage_1_2', 'stage_1_3', 'stage_1_4', 'stage_2_1'],
      clearedStages: ['stage_1_1', 'stage_1_2', 'stage_1_3', 'stage_1_4'],
      selectedStageId: 'stage_2_1',
      stageRatings: { stage_1_1: 'S', stage_1_2: 'A', stage_1_3: 'S', stage_1_4: 'A' },
      unlockedCards: ['card_shield_guard'],
      claimedSessions: ['s1'],
      battleStats: { battlesPlayed: 4, battlesWon: 4, totalEnemiesDefeated: 28 },
    },
    heroes: { owned: { astra: { id: 'astra', level: 2, xp: 10 } } },
    units: { owned: { heavy_shield_guard: { id: 'heavy_shield_guard', level: 2, xp: 0 } } },
    formation: {
      commanderId: 'astra',
      unitSlots: ['heavy_shield_guard', 'wind_cavalry', 'arcane_archer', 'field_cleric'],
      deck: ['card_shield_guard'],
    },
    gacha: { totalPulls: 0, ssrPity: 0, srPity: 0, history: [] },
    inventory: { items: [] },
    settings: { masterVolume: 0.7, bgmVolume: 0.5, sfxVolume: 0.8, muted: false, battleSpeed: 1 },
  };
  storage.setItem('astral_command_save_v1', JSON.stringify(v3Save));

  const saveManager = new SaveManager({ storage });
  const res = saveManager.load();
  assert.equal(res.status, 'loaded');
  assert.equal(res.data.version, SAVE_VERSION);
  assert.equal(res.data.progression.selectedStageId, 'stage_2_1');
  assert.equal(res.data.progression.clearedStages.length, 4);
  assert.ok(res.data.missions && typeof res.data.missions === 'object');
  assert.deepEqual(res.data.missions.daily.claimed, []);
  assert.deepEqual(res.data.missions.weekly.claimed, []);
});

test('MissionSystem tracks real EventBus actions, prevents duplicate claims across reloads, and handles UTC Daily/Weekly resets', () => {
  const harness = createHarness({ now: '2026-05-13T12:00:00Z' });
  const { eventBus, missionSystem, gameState, storage } = harness;

  // Initial state: zero fake progress
  assert.equal(missionSystem.getClaimableCount(), 0);
  const initialCredits = gameState.resources.credits;
  const initialAstrite = gameState.resources.astrite;

  // Real gameplay events
  eventBus.emit('progression:battleRecorded', {
    sessionId: 'sess_1',
    stageId: 'stage_1_1',
    victory: true,
    enemiesDefeated: 15,
  });
  eventBus.emit('cards:merged', { tier: 2 });
  eventBus.emit('cards:merged', { tier: 2 });
  eventBus.emit('cards:merged', { tier: 3 });
  eventBus.emit('commander:ultimateActivated', { heroId: 'astra' });

  const daily = missionSystem.getMissions('daily');
  const battleMission = daily.find((m) => m.id === 'daily_battle_1');
  const victoryMission = daily.find((m) => m.id === 'daily_victory_1');
  const mergeMission = daily.find((m) => m.id === 'daily_merge_3');
  const ultMission = daily.find((m) => m.id === 'daily_ultimate_1');
  const defeatMission = daily.find((m) => m.id === 'daily_enemies_15');

  assert.equal(battleMission.claimable, true);
  assert.equal(victoryMission.claimable, true);
  assert.equal(mergeMission.claimable, true);
  assert.equal(ultMission.claimable, true);
  assert.equal(defeatMission.claimable, true);
  assert.equal(missionSystem.getClaimableCount('daily'), 5);

  // Claim once
  const claim1 = missionSystem.claimMission('daily', 'daily_battle_1');
  assert.equal(claim1.ok, true);
  assert.equal(gameState.resources.credits, initialCredits + battleMission.rewards.credits);
  assert.equal(gameState.resources.astrite, initialAstrite + battleMission.rewards.astrite);

  // Duplicate claim blocked
  const claimDup = missionSystem.claimMission('daily', 'daily_battle_1');
  assert.equal(claimDup.ok, false);
  assert.equal(claimDup.duplicate, true);

  // Reload from persistent storage -> progress & claimed state preserved, duplicate still blocked
  const reloaded = createHarness({ now: '2026-05-13T18:00:00Z', storage });
  const dupAfterReload = reloaded.missionSystem.claimMission('daily', 'daily_battle_1');
  assert.equal(dupAfterReload.ok, false);
  assert.equal(dupAfterReload.duplicate, true);
  assert.equal(reloaded.missionSystem.getClaimableCount('daily'), 4);

  // Advance to next UTC day (Thursday May 14, same ISO week): Daily resets, Weekly persists
  reloaded.setNow('2026-05-14T00:05:00Z');
  const dailyResetInfo = reloaded.missionSystem.ensureResets();
  assert.equal(dailyResetInfo.dailyReset, true);
  assert.equal(dailyResetInfo.weeklyReset, false);
  assert.equal(dailyResetInfo.dailyKey, getDailyPeriodKey(new Date('2026-05-14T00:05:00Z')));
  assert.equal(reloaded.missionSystem.getClaimableCount('daily'), 0);
  const weeklyWin = reloaded.missionSystem.getMissions('weekly').find((m) => m.id === 'weekly_victories_5');
  assert.equal(weeklyWin.progress, 1, 'Weekly progress must persist across a daily reset');

  // Advance to next UTC Monday (May 18): Weekly resets as well
  reloaded.setNow('2026-05-18T00:01:00Z');
  const weeklyResetInfo = reloaded.missionSystem.ensureResets();
  assert.equal(weeklyResetInfo.dailyReset, true);
  assert.equal(weeklyResetInfo.weeklyReset, true);
  assert.equal(weeklyResetInfo.weeklyKey, getWeeklyPeriodKey(new Date('2026-05-18T00:01:00Z')));
  const weeklyWinAfter = reloaded.missionSystem.getMissions('weekly').find((m) => m.id === 'weekly_victories_5');
  assert.equal(weeklyWinAfter.progress, 0, 'Weekly progress must reset on next UTC week');
});

test('MissionSystem handles Seasonal events honestly (empty by default, active only when explicitly scheduled)', () => {
  const defaultHarness = createHarness({ now: '2026-05-13T12:00:00Z' });
  const defaultSummary = defaultHarness.missionSystem.getCategorySummary('seasonal');
  assert.equal(defaultSummary.event, null);
  assert.equal(defaultSummary.missions.length, 0);

  const bundle = readFullBundle();
  const customMissions = {
    ...bundle.missions,
    seasonalEvents: [
      {
        id: 'season_solstice_test',
        title: 'Solstice Frontline',
        description: 'Test configured seasonal event window.',
        startAt: '2026-05-01T00:00:00Z',
        endAt: '2026-06-01T00:00:00Z',
        missions: [
          {
            id: 'season_win_1',
            title: 'Solstice Skirmish',
            description: 'Win 1 battle during the event.',
            metric: 'battles_won',
            target: 1,
            rewards: { credits: 500, astrite: 120, playerXp: 60 },
          },
        ],
      },
    ],
  };

  const activeHarness = createHarness({ now: '2026-05-15T12:00:00Z', customMissions });
  const activeSummary = activeHarness.missionSystem.getCategorySummary('seasonal');
  assert.equal(activeSummary.event.id, 'season_solstice_test');
  assert.equal(activeSummary.missions.length, 1);

  activeHarness.eventBus.emit('progression:battleRecorded', {
    sessionId: 'season_s1',
    stageId: 'stage_1_1',
    victory: true,
    enemiesDefeated: 5,
  });
  const claimRes = activeHarness.missionSystem.claimMission('seasonal', 'season_win_1');
  assert.equal(claimRes.ok, true);
  assert.equal(claimRes.rewards.astrite, 120);
});

test('ProgressionSystem resolves chapters chronologically and identifies current progression chapter & stage', () => {
  const { gameState, progressionSystem } = createHarness();

  // Fresh save: Chapter 1 current (stage_1_1), Chapters 2 & 3 locked
  assert.equal(progressionSystem.getCurrentProgressionStage().id, 'stage_1_1');
  assert.equal(progressionSystem.getCurrentProgressionChapter(), 1);
  let chapters = progressionSystem.getChapters();
  assert.deepEqual(chapters.map((c) => c.chapter), [1, 2, 3]);
  assert.equal(chapters[0].status, 'current');
  assert.equal(chapters[1].status, 'locked');
  assert.equal(chapters[2].status, 'locked');

  // Advance progression to Chapter 2 Stage 2-2
  gameState.mutatePersistent('progression', (draft) => {
    draft.progression.clearedStages = ['stage_1_1', 'stage_1_2', 'stage_1_3', 'stage_1_4', 'stage_2_1'];
    draft.progression.unlockedStages = [
      'stage_1_1',
      'stage_1_2',
      'stage_1_3',
      'stage_1_4',
      'stage_2_1',
      'stage_2_2',
    ];
    draft.progression.selectedStageId = 'stage_2_2';
  });

  assert.equal(progressionSystem.getCurrentProgressionStage().id, 'stage_2_2');
  assert.equal(progressionSystem.getCurrentProgressionChapter(), 2);
  chapters = progressionSystem.getChapters();
  assert.equal(chapters[0].status, 'completed');
  assert.equal(chapters[1].status, 'current');
  assert.equal(chapters[2].status, 'locked');
});

test('HomeScreen renders strictly four left navigation cards (Missions, Summon, Formation, Commanders) with no Main Story/stage panel on Home', () => {
  const harness = createHarness();
  const navigated = [];
  const ctx = {
    ...harness,
    assetManager: { bindImageElement() {} },
    audioManager: { playClick() {} },
    screenManager: {
      navigate(dest, params) {
        navigated.push({ dest, params });
      },
    },
    openGuide() {},
  };

  const container = createMockContainer();
  const home = new HomeScreen(ctx);
  home.mount(container);

  const leftCards = container.querySelectorAll('.home-nav-card');
  assert.equal(leftCards.length, 4, 'Home left column must render strictly 4 navigation cards');
  assert.deepEqual(
    leftCards.map((c) => c.getAttribute('data-nav')),
    ['missions', 'summon', 'formation', 'heroes'],
  );
  assert.equal(
    container.innerHTML.includes('Main Story'),
    false,
    'Home screen must not contain a separate Main Story card',
  );
  assert.equal(
    container.querySelector('.home-operation-hero'),
    null,
    'Home screen must not display the Main Story/Stage hero panel before clicking Main Mission',
  );
  assert.equal(
    container.querySelector('[data-action="enter-battle"]'),
    null,
    'Home screen must not display a direct stage deploy button',
  );

  // Verify each of the 4 cards navigates to its correct destination
  for (const card of leftCards) {
    card.click();
  }
  assert.deepEqual(
    navigated.map((n) => n.dest),
    ['missions', 'summon', 'formation', 'heroes'],
  );

  home.unmount();
});

test('MissionsScreen enforces 4 categories, reveals Main Mission stage selection when Main Mission is clicked, defaults to current stage, preserves progression while browsing, and gates Start Battle to unlocked stages', () => {
  const harness = createHarness();
  const { gameState, progressionSystem } = harness;

  // Set player progression to Chapter 2 Stage 2-2
  gameState.mutatePersistent('progression', (draft) => {
    draft.progression.clearedStages = ['stage_1_1', 'stage_1_2', 'stage_1_3', 'stage_1_4', 'stage_2_1'];
    draft.progression.unlockedStages = [
      'stage_1_1',
      'stage_1_2',
      'stage_1_3',
      'stage_1_4',
      'stage_2_1',
      'stage_2_2',
    ];
    draft.progression.selectedStageId = 'stage_2_2';
  });

  const navigated = [];
  const ctx = {
    ...harness,
    assetManager: { bindImageElement() {} },
    audioManager: { playClick() {}, playReward() {} },
    notify() {},
    screenManager: {
      navigate(dest, params) {
        navigated.push({ dest, params });
      },
    },
  };

  const container = createMockContainer();
  const screen = new MissionsScreen(ctx);
  screen.mount(container);

  // Exact 4 category tabs
  const tabs = container.querySelectorAll('[data-mission-tab]');
  assert.deepEqual(
    tabs.map((t) => t.getAttribute('data-mission-tab')),
    ['daily', 'weekly', 'seasonal', 'main'],
  );

  // Default Missions view opens on Daily (stage timeline not shown until clicking Main Mission)
  assert.equal(gameState.ui.missionsCategory, 'daily');
  assert.equal(container.querySelector('.main-mission-workspace'), null);

  // Clicking Main Mission opens Chapter 2 & Stage 2-2 (NOT Chapter 1!) and scrolls timeline to Chapter 2
  container.querySelector('[data-mission-tab="main"]').click();
  assert.equal(gameState.ui.missionsCategory, 'main');
  assert.equal(gameState.ui.missionsSelectedChapter, 2);
  assert.equal(gameState.ui.missionsSelectedStageId, 'stage_2_2');
  assert.ok(
    container.getScrolledChapters().some((entry) => entry.chapter === '2'),
    'Expected chapter timeline to auto-scroll to current Chapter 2',
  );

  // Browse Chapter 1 manually -> updates displayed stages, does NOT mutate saved progression
  const ch1Node = container.querySelector('[data-chapter="1"]');
  assert.ok(ch1Node);
  ch1Node.click();
  assert.equal(gameState.ui.missionsSelectedChapter, 1);
  assert.equal(
    gameState.progression.selectedStageId,
    'stage_2_2',
    'Manual chapter browsing must not overwrite saved progression',
  );

  // Browse locked Chapter 3 -> Start Battle must be disabled and cannot launch battle
  const ch3Node = container.querySelector('[data-chapter="3"]');
  assert.ok(ch3Node);
  ch3Node.click();
  assert.equal(gameState.ui.missionsSelectedChapter, 3);
  const lockedStartBtn = container.querySelector('[data-action="start-battle"]');
  assert.ok(lockedStartBtn);
  assert.equal(lockedStartBtn.hasAttribute('disabled'), true, 'Start Battle must be disabled for locked stages');
  lockedStartBtn.click();
  assert.equal(navigated.length, 0, 'Locked stage must never launch battle');

  // Switch to Seasonal tab -> honest empty state shown
  container.querySelector('[data-mission-tab="seasonal"]').click();
  assert.ok(
    container.innerHTML.includes('No Active Seasonal Event'),
    'Seasonal tab must show honest empty state when no event is active',
  );

  // Re-enter Main Mission -> resets back to actual current progression (Chapter 2, Stage 2-2)
  container.querySelector('[data-mission-tab="main"]').click();
  assert.equal(gameState.ui.missionsSelectedChapter, 2);
  assert.equal(gameState.ui.missionsSelectedStageId, 'stage_2_2');

  // Start Battle on unlocked current Stage 2-2 -> selects stage and navigates to 'battle'
  const unlockedStartBtn = container.querySelector('[data-action="start-battle"]');
  assert.ok(unlockedStartBtn);
  assert.equal(unlockedStartBtn.hasAttribute('disabled'), false);
  unlockedStartBtn.click();
  assert.equal(navigated.length, 1);
  assert.equal(navigated[0].dest, 'battle');
  assert.equal(progressionSystem.getSelectedStage().id, 'stage_2_2');

  // Leave and re-mount MissionsScreen, then enter Main Mission again -> still restores Chapter 2 Stage 2-2
  container.querySelector('[data-chapter="1"]').click();
  assert.equal(gameState.ui.missionsSelectedChapter, 1);
  screen.unmount();
  screen.mount(container);
  container.querySelector('[data-mission-tab="main"]').click();
  assert.equal(gameState.ui.missionsSelectedChapter, 2);
  assert.equal(gameState.ui.missionsSelectedStageId, 'stage_2_2');

  screen.unmount();
});

test('MissionsScreen two-column Mission Center renders left category rail, reward icons/names/quantities, context-sensitive Go-To navigation, Claim persistence, and unmapped fallback', () => {
  const storage = createMemoryStorage();
  const harness = createHarness({ now: '2026-05-13T12:00:00Z', storage });
  const { gameState, eventBus, progressionSystem } = harness;

  const navigated = [];
  const notifications = [];
  const registeredScreens = new Set([
    'home',
    'missions',
    'battle',
    'heroes',
    'formation',
    'summon',
    'inventory',
    'settings',
  ]);
  const ctx = {
    ...harness,
    assetManager: { bindImageElement() {} },
    audioManager: { playClick() {}, playReward() {} },
    notify(msg, level) {
      notifications.push({ msg, level });
    },
    screenManager: {
      has(id) {
        return registeredScreens.has(id);
      },
      navigate(dest, params) {
        navigated.push({ dest, params });
        return true;
      },
    },
  };

  const container = createMockContainer();
  const screen = new MissionsScreen(ctx);
  screen.mount(container);

  // Two-column layout shell present with Left category rail + Right detail pane + scrollable list
  assert.ok(container.querySelector('.missions-center'));
  assert.ok(container.querySelector('.missions-category-pane'));
  assert.ok(container.querySelector('#missions-body.missions-detail-pane'));
  assert.ok(container.querySelector('.missions-list-scroll'));

  // Active category has clear selected state
  const dailyTab = container.querySelector('[data-mission-tab="daily"]');
  assert.equal(dailyTab.getAttribute('aria-selected'), 'true');
  assert.ok(dailyTab.getAttribute('class').includes('is-active'));

  // Incomplete daily missions must NEVER render Claim, and must show Go to Battle
  assert.equal(
    container.querySelectorAll('[data-claim-mission]').length,
    0,
    'Incomplete missions must never show Claim',
  );
  const dailyGoBtn = container.querySelector('[data-mission-go="daily_battle_1"]');
  assert.ok(dailyGoBtn, 'Incomplete daily battle mission should render Go to Battle button');
  assert.equal(dailyGoBtn.getAttribute('data-go-screen'), 'battle');
  assert.ok(container.innerHTML.includes('Go to Battle'));

  // Rewards must include icons (<svg>), names, and quantities
  assert.ok(container.innerHTML.includes('class="mission-reward-icon"'));
  assert.ok(container.innerHTML.includes('Astrite'));
  assert.ok(container.innerHTML.includes('Credits'));
  assert.ok(container.innerHTML.includes('Commander XP'));
  assert.ok(container.innerHTML.includes('Tactical XP Chip'));

  // Switch to Weekly -> inspect Formation & Summon action buttons and material icons
  container.querySelector('[data-mission-tab="weekly"]').click();
  assert.equal(container.querySelector('[data-mission-tab="weekly"]').getAttribute('aria-selected'), 'true');
  assert.equal(container.querySelector('[data-mission-tab="daily"]').getAttribute('aria-selected'), 'false');
  assert.ok(container.innerHTML.includes('Aegis Tactical Core'));
  assert.ok(container.innerHTML.includes('Field Energy Cell'));

  const upgradeGoBtn = container.querySelector('[data-mission-go="weekly_upgrade_2"]');
  assert.ok(upgradeGoBtn);
  assert.equal(upgradeGoBtn.getAttribute('data-go-screen'), 'formation');
  assert.ok(container.innerHTML.includes('Go to Formation'));

  const summonGoBtn = container.querySelector('[data-mission-go="weekly_summon_3"]');
  assert.ok(summonGoBtn);
  assert.equal(summonGoBtn.getAttribute('data-go-screen'), 'summon');
  assert.ok(container.innerHTML.includes('Go to Summon'));

  // Clicking Go to Formation sets formationTab='squad' and navigates to 'formation'
  gameState.setUI({ formationTab: 'deck' });
  upgradeGoBtn.click();
  assert.equal(navigated.length, 1);
  assert.equal(navigated[0].dest, 'formation');
  assert.equal(gameState.ui.formationTab, 'squad');

  // Simulate returning from Formation after upgrading 2 units
  screen.unmount();
  eventBus.emit('formation:unitUpgraded', { unitId: 'heavy_shield_guard' });
  eventBus.emit('formation:unitUpgraded', { unitId: 'wind_cavalry' });
  screen.mount(container);

  // Returning restores Weekly category and updates progress + flips button to Claim
  assert.equal(gameState.ui.missionsCategory, 'weekly');
  const upgradeClaimBtn = container.querySelector('[data-claim-mission="weekly_upgrade_2"]');
  assert.ok(upgradeClaimBtn, 'Completed mission after returning must display Claim button');
  assert.equal(container.querySelector('[data-mission-go="weekly_upgrade_2"]'), null);

  // Clicking Go to Summon navigates directly to 'summon'
  container.querySelector('[data-mission-go="weekly_summon_3"]').click();
  assert.equal(navigated[1].dest, 'summon');

  // Return to Weekly, switch across categories and back -> progress & claimable state preserved
  screen.unmount();
  screen.mount(container);
  container.querySelector('[data-mission-tab="seasonal"]').click();
  assert.ok(container.innerHTML.includes('No Active Seasonal Event'));
  container.querySelector('[data-mission-tab="weekly"]').click();
  assert.ok(container.querySelector('[data-claim-mission="weekly_upgrade_2"]'));

  // Claim completed mission -> grants rewards once and switches to disabled Claimed button
  const creditsBefore = gameState.resources.credits;
  const astriteBefore = gameState.resources.astrite;
  container.querySelector('[data-claim-mission="weekly_upgrade_2"]').click();
  assert.equal(gameState.resources.credits, creditsBefore + 800);
  assert.equal(gameState.resources.astrite, astriteBefore + 120);

  const claimedBtn = container.querySelector('[data-mission-claimed="weekly_upgrade_2"]');
  assert.ok(claimedBtn, 'Claimed mission must render Claimed state button');
  assert.equal(claimedBtn.hasAttribute('disabled'), true, 'Claimed button must be disabled');
  assert.equal(container.querySelector('[data-claim-mission="weekly_upgrade_2"]'), null);
  // Attempting to click disabled Claimed button does not duplicate rewards
  claimedBtn.click();
  assert.equal(gameState.resources.credits, creditsBefore + 800);
  assert.equal(gameState.resources.astrite, astriteBefore + 120);

  // Simulate page reload from persistent storage -> Claimed state persists on Weekly
  screen.unmount();
  const reloaded = createHarness({ now: '2026-05-13T18:00:00Z', storage });
  const reloadedScreen = new MissionsScreen({
    ...reloaded,
    assetManager: { bindImageElement() {} },
    audioManager: { playClick() {}, playReward() {} },
    notify() {},
    screenManager: ctx.screenManager,
  });
  reloadedScreen.mount(container, { category: 'weekly' });
  const claimedAfterReload = container.querySelector('[data-mission-claimed="weekly_upgrade_2"]');
  assert.ok(claimedAfterReload);
  assert.equal(claimedAfterReload.hasAttribute('disabled'), true);

  // Daily battle Go-To ensures an unlocked stage is selected before navigating to 'battle'
  reloaded.gameState.mutatePersistent('progression', (draft) => {
    draft.progression.selectedStageId = 'stage_3_1'; // locked stage
  });
  reloadedScreen._selectCategory('daily');
  container.querySelector('[data-mission-go="daily_battle_1"]').click();
  assert.equal(navigated[2].dest, 'battle');
  assert.equal(reloaded.progressionSystem.isStageUnlocked(reloaded.progressionSystem.getSelectedStage().id), true);
  assert.equal(progressionSystem.isStageUnlocked('stage_3_1'), false);
  reloadedScreen.unmount();

  // Unknown / unmapped mission metric handles gracefully without navigating to 'home'
  assert.equal(resolveMissionDestination({ metric: 'unsupported_metric' }, ctx), null);
  const customMissions = {
    ...harness.bundle.missions,
    daily: [
      {
        id: 'daily_unknown_metric',
        title: 'Unmapped Directive',
        description: 'Requires an unsupported metric.',
        metric: 'unsupported_metric',
        target: 2,
        rewards: { credits: 100, astrite: 10, playerXp: 10, materials: [] },
      },
    ],
  };
  const unmappedHarness = createHarness({ now: '2026-05-13T12:00:00Z', customMissions });
  const unmappedNav = [];
  const unmappedScreen = new MissionsScreen({
    ...unmappedHarness,
    assetManager: { bindImageElement() {} },
    audioManager: { playClick() {}, playReward() {} },
    notify() {},
    screenManager: {
      has: (id) => registeredScreens.has(id),
      navigate: (dest) => {
        unmappedNav.push(dest);
        return true;
      },
    },
  });
  unmappedScreen.mount(container);
  const unavailableBtn = container.querySelector('[data-mission-unavailable="daily_unknown_metric"]');
  assert.ok(unavailableBtn, 'Unmapped mission metric should render disabled unavailable button');
  assert.equal(unavailableBtn.hasAttribute('disabled'), true);
  assert.equal(container.querySelector('[data-mission-go="daily_unknown_metric"]'), null);
  unavailableBtn.click();
  assert.equal(unmappedNav.length, 0, 'Unmapped mission must never navigate to Home');
  unmappedScreen.unmount();
});

