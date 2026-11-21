import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildDataRegistry } from '../src/utils/DataLoader.js';
import { EventBus } from '../src/core/EventBus.js';
import { GameState } from '../src/core/GameState.js';
import { SaveManager } from '../src/core/SaveManager.js';
import { createMemoryStorage } from '../src/utils/StorageUtils.js';
import { HeroSystem } from '../src/systems/HeroSystem.js';
import { FormationSystem } from '../src/systems/FormationSystem.js';
import { CardSystem } from '../src/systems/CardSystem.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { GachaSystem } from '../src/systems/GachaSystem.js';
import {
  SummonScreen,
  getBannerStatus,
  formatBannerDuration,
} from '../src/ui/SummonScreen.js';

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

function createMockContainer() {
  let rawHtml = '';
  let parsedNodes = [];

  function parseHtml(html) {
    const nodes = [];
    const tagRegex = /<(button|article|aside|section|div|img|nav|header|h1|h2|h3|span|p|strong)\b([^>]*)>/gi;
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
      const listeners = new Map();
      const node = {
        tag,
        attrs,
        index: match.index,
        getAttribute(name) {
          return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
        },
        setAttribute(name, val) {
          attrs[name] = String(val);
        },
        hasAttribute(name) {
          return Object.prototype.hasOwnProperty.call(attrs, name);
        },
        get disabled() {
          return Object.prototype.hasOwnProperty.call(attrs, 'disabled');
        },
        addEventListener(type, fn) {
          if (!listeners.has(type)) listeners.set(type, []);
          listeners.get(type).push(fn);
        },
        click() {
          if (Object.prototype.hasOwnProperty.call(attrs, 'disabled')) return;
          for (const fn of listeners.get('click') || []) {
            fn({ target: node, currentTarget: node, preventDefault() {} });
          }
        },
      };
      nodes.push(node);
    }
    return nodes;
  }

  function matchesSelector(node, selector) {
    const s = selector.trim();
    if (s.startsWith('#')) {
      return node.attrs.id === s.slice(1);
    }
    if (s.startsWith('.')) {
      const cls = s.slice(1);
      return (node.attrs.class || '').split(/\s+/).includes(cls);
    }
    if (s.startsWith('[')) {
      const eq = s.match(/^\[([a-zA-Z0-9_-]+)="([^"]*)"\]$/);
      if (eq) return node.attrs[eq[1]] === eq[2];
      const presence = s.match(/^\[([a-zA-Z0-9_-]+)\]$/);
      if (presence) return Object.prototype.hasOwnProperty.call(node.attrs, presence[1]);
    }
    return node.tag === s.toLowerCase();
  }

  return {
    get innerHTML() {
      return rawHtml;
    },
    set innerHTML(val) {
      rawHtml = String(val);
      parsedNodes = parseHtml(rawHtml);
    },
    querySelector(selector) {
      return parsedNodes.find((n) => matchesSelector(n, selector)) || null;
    },
    querySelectorAll(selector) {
      return parsedNodes.filter((n) => matchesSelector(n, selector));
    },
  };
}

function createSummonHarness({ extraBanners = [], startingAstrite = 3200 } = {}) {
  const bundle = readFullBundle();
  if (extraBanners.length > 0) {
    bundle.banners = {
      ...bundle.banners,
      banners: [...(bundle.banners.banners || []), ...extraBanners],
    };
  }
  const dataRegistry = buildDataRegistry(bundle);
  const storage = createMemoryStorage();
  const eventBus = new EventBus();
  const saveManager = new SaveManager({ storage, eventBus });
  const loadRes = saveManager.load();
  const gameState = new GameState(loadRes.data, eventBus);
  gameState.mutatePersistent('resources', (draft) => {
    draft.resources.astrite = startingAstrite;
  });

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

  const navigated = [];
  const boundAssets = [];
  const notifications = [];
  const audioEvents = [];

  const ctx = {
    dataRegistry,
    gameState,
    economySystem,
    heroSystem,
    formationSystem,
    cardSystem,
    gachaSystem,
    eventBus,
    assetManager: {
      bindImageElement(el, assetId) {
        boundAssets.push({ el, assetId });
        if (el && el.setAttribute) el.setAttribute('data-bound-asset', assetId || '');
      },
    },
    audioManager: {
      playClick() {
        audioEvents.push('click');
      },
      playInvalid() {
        audioEvents.push('invalid');
      },
      playSummon(rarity) {
        audioEvents.push(`summon:${rarity}`);
      },
    },
    screenManager: {
      navigate(screenId) {
        navigated.push(screenId);
      },
    },
    notify(msg, type) {
      notifications.push({ msg, type });
    },
  };

  const container = createMockContainer();
  const screen = new SummonScreen(ctx);
  screen.mount(container);

  return {
    ctx,
    screen,
    container,
    gachaSystem,
    economySystem,
    gameState,
    navigated,
    boundAssets,
    notifications,
    audioEvents,
  };
}

test('SummonScreen renders left banner rail, dominant right banner stage, and no top horizontal banner selector', () => {
  const { container } = createSummonHarness();

  // Left vertical banner rail exists with both real banners from banners.json
  const rail = container.querySelector('.summon-banner-rail');
  assert.ok(rail, 'Expected left .summon-banner-rail panel');

  const bannerButtons = container.querySelectorAll('[data-banner-id]');
  assert.equal(bannerButtons.length, 2, 'Expected 2 banner entries in left vertical list');
  assert.equal(bannerButtons[0].getAttribute('data-banner-id'), 'banner_starlight_command');
  assert.equal(bannerButtons[0].getAttribute('data-banner-status'), 'active');
  assert.equal(bannerButtons[1].getAttribute('data-banner-id'), 'banner_tactical_requisition');
  assert.equal(bannerButtons[1].getAttribute('data-banner-status'), 'available');

  // Ensure the old top horizontal .segmented-bar selector was completely removed from the screen bar
  const screenBarMatch = container.innerHTML.match(/<div class="screen-bar">([\s\S]*?)<div class="summon-workspace">/);
  assert.ok(screenBarMatch, 'Expected .screen-bar before .summon-workspace');
  assert.equal(
    screenBarMatch[1].includes('data-banner-id'),
    false,
    'Top screen bar must not contain banner selection controls',
  );
  assert.equal(
    screenBarMatch[1].includes('segmented-bar'),
    false,
    'Old top horizontal segmented banner selector must be removed',
  );

  // Dominant right presentation stage exists with artwork and banner metadata
  assert.ok(container.querySelector('.summon-stage'), 'Expected right .summon-stage area');
  const featuredImg = container.querySelector('#banner-featured-img');
  assert.ok(featuredImg, 'Expected #banner-featured-img');
  assert.equal(featuredImg.getAttribute('data-bound-asset'), 'hero_portrait_astra');
  assert.ok(container.innerHTML.includes('Starlight Sovereign'));
  assert.ok(container.innerHTML.includes('SSR 3%'));
  assert.ok(container.innerHTML.includes('SR 17%'));
  assert.ok(container.innerHTML.includes('R 80%'));
  assert.ok(container.innerHTML.includes('Permanent Banner'));
});

test('Bottom-right pull controls render in exact order: [Pulling History] [1x Pull] [10x Pull]', () => {
  const { container } = createSummonHarness();

  const historyBtn = container.querySelector('#btn-summon-history');
  const singleBtn = container.querySelector('#btn-pull-single');
  const tenBtn = container.querySelector('#btn-pull-ten');

  assert.ok(historyBtn, 'Expected #btn-summon-history button');
  assert.ok(singleBtn, 'Expected #btn-pull-single button');
  assert.ok(tenBtn, 'Expected #btn-pull-ten button');

  assert.ok(
    historyBtn.index < singleBtn.index && singleBtn.index < tenBtn.index,
    'Exact horizontal DOM order must be [Pulling History] [1x Pull] [10x Pull]',
  );

  // Pulling History is a compact secondary button immediately before 1x Pull
  assert.ok((historyBtn.getAttribute('class') || '').includes('btn-secondary'));
  assert.ok((historyBtn.getAttribute('class') || '').includes('btn-sm'));
  // 10x Pull is visually prominent gold large button
  assert.ok((tenBtn.getAttribute('class') || '').includes('btn-gold'));
  assert.ok((tenBtn.getAttribute('class') || '').includes('btn-lg'));

  // Costs are displayed clearly
  assert.ok(container.innerHTML.includes('160 Astrite'));
  assert.ok(container.innerHTML.includes('1,600 Astrite'));
});

test('Switching banners updates main presentation stage, artwork binding, and active status', () => {
  const { container, gachaSystem } = createSummonHarness();

  const tacticalBtn = container
    .querySelectorAll('[data-banner-id]')
    .find((b) => b.getAttribute('data-banner-id') === 'banner_tactical_requisition');
  assert.ok(tacticalBtn);
  tacticalBtn.click();

  assert.equal(gachaSystem.getActiveBanner().id, 'banner_tactical_requisition');

  const updatedButtons = container.querySelectorAll('[data-banner-id]');
  assert.equal(updatedButtons[0].getAttribute('data-banner-status'), 'available');
  assert.equal(updatedButtons[1].getAttribute('data-banner-status'), 'active');

  const featuredImg = container.querySelector('#banner-featured-img');
  assert.equal(featuredImg.getAttribute('data-bound-asset'), 'hero_portrait_seraphina');
  assert.ok(container.innerHTML.includes('Astral Armory Supply'));
  assert.ok(container.innerHTML.includes('Featured Requisitions'));
});

test('1x Pull and 10x Pull execute on active banner, deduct currency, show results overlay, and inspect navigates cleanly', () => {
  const { container, economySystem, gachaSystem, navigated } = createSummonHarness({
    startingAstrite: 3200,
  });

  // Execute 1x Pull
  container.querySelector('#btn-pull-single').click();
  assert.equal(economySystem.getBalance('astrite'), 3040);
  assert.equal(gachaSystem.getPityStatus().totalPulls, 1);

  // Results overlay opens automatically with 1 result card
  assert.ok(container.querySelector('.summon-overlay'), 'Expected results overlay after 1x pull');
  let resultCards = container.querySelectorAll('.summon-result-card');
  assert.equal(resultCards.length, 1);

  // Close results overlay
  container.querySelector('[data-close-overlay]').click();
  assert.equal(container.querySelector('.summon-overlay'), null);

  // Switch to Tactical banner and execute 10x Pull
  const tacticalBtn = container
    .querySelectorAll('[data-banner-id]')
    .find((b) => b.getAttribute('data-banner-id') === 'banner_tactical_requisition');
  tacticalBtn.click();

  container.querySelector('#btn-pull-ten').click();
  assert.equal(economySystem.getBalance('astrite'), 1440);
  assert.equal(gachaSystem.getPityStatus().totalPulls, 11);

  resultCards = container.querySelectorAll('.summon-result-card');
  assert.equal(resultCards.length, 10, 'Expected 10 result cards in overlay after 10x pull');

  // Clicking a result card navigates to heroes / formation / inventory
  resultCards[0].click();
  assert.equal(navigated.length, 1);
  assert.ok(['heroes', 'formation', 'inventory'].includes(navigated[0]));
});

test('Pulling History button opens history interface displaying recorded pulls', () => {
  const { container } = createSummonHarness({ startingAstrite: 2000 });

  // Perform a 1x pull first so history has a record
  container.querySelector('#btn-pull-single').click();
  container.querySelector('[data-close-overlay]').click();

  // Open Pulling History
  container.querySelector('#btn-summon-history').click();
  const overlay = container.querySelector('.summon-overlay');
  assert.ok(overlay, 'Expected Pulling History overlay');
  assert.ok(container.innerHTML.includes('Pulling History'));
  assert.ok(container.innerHTML.includes('Total Pulls 1'));
  assert.ok(container.querySelectorAll('.summon-history-row').length === 1);

  // Close history
  container.querySelector('[data-close-overlay]').click();
  assert.equal(container.querySelector('.summon-overlay'), null);
});

test('Currency validation disables unaffordable pull buttons and shows clear unavailable state', () => {
  // Case 1: Enough for 1x (160) but not 10x (1600)
  const partial = createSummonHarness({ startingAstrite: 500 });
  assert.equal(partial.container.querySelector('#btn-pull-single').disabled, false);
  assert.equal(partial.container.querySelector('#btn-pull-ten').disabled, true);
  assert.ok(partial.container.querySelector('.summon-unavailable-note'));
  assert.ok(partial.container.innerHTML.includes('1,100 more Astrite for 10x Pull'));

  // Clicking disabled 10x does nothing
  partial.container.querySelector('#btn-pull-ten').click();
  assert.equal(partial.economySystem.getBalance('astrite'), 500);

  // Case 2: Cannot afford even 1x Pull
  const broke = createSummonHarness({ startingAstrite: 80 });
  assert.equal(broke.container.querySelector('#btn-pull-single').disabled, true);
  assert.equal(broke.container.querySelector('#btn-pull-ten').disabled, true);
  assert.ok(broke.container.innerHTML.includes('Insufficient Astrite'));
});

test('Expired banner status is clearly distinguished and blocks pulls without inventing dates for permanent banners', () => {
  const expiredBanner = {
    id: 'banner_past_event',
    bannerType: 'commander',
    name: 'Eclipse Archive',
    subtitle: 'Concluded limited recruitment banner.',
    featuredHeroIds: ['seraphina'],
    featuredAssetId: 'hero_portrait_seraphina',
    currency: 'astrite',
    singleCost: 160,
    tenCost: 1600,
    endAt: '2025-01-01T00:00:00Z',
    rates: { SSR: 0.03, SR: 0.17, R: 0.8 },
    pityConfig: { ssrHardPity: 80, tenPullMinRarity: 'SR' },
    pool: { SSR: ['seraphina'], SR: ['kael'], R: ['lyra'] },
  };

  assert.equal(getBannerStatus(expiredBanner, 'banner_past_event', Date.parse('2026-06-01T00:00:00Z')), 'expired');
  assert.equal(formatBannerDuration(expiredBanner, Date.parse('2026-06-01T00:00:00Z')), 'Ended 2025-01-01');
  assert.equal(formatBannerDuration({ id: 'perm' }), 'Permanent Banner');

  const { container, economySystem } = createSummonHarness({
    extraBanners: [expiredBanner],
    startingAstrite: 3200,
  });

  const expiredBtn = container
    .querySelectorAll('[data-banner-id]')
    .find((b) => b.getAttribute('data-banner-id') === 'banner_past_event');
  assert.ok(expiredBtn);
  assert.equal(expiredBtn.getAttribute('data-banner-status'), 'expired');

  // Selecting the expired banner shows Expired state and disables pull controls
  expiredBtn.click();
  assert.equal(container.querySelector('#btn-pull-single').disabled, true);
  assert.equal(container.querySelector('#btn-pull-ten').disabled, true);
  assert.ok(container.innerHTML.includes('This banner has expired.'));
  assert.ok(container.innerHTML.includes('Ended 2025-01-01'));
  assert.equal(economySystem.getBalance('astrite'), 3200);
});
