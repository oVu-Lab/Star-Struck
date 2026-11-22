/**
 * AstraCardMount — Shared Star Struck integration helper for the reusable
 * AstraCard WebGL component.
 *
 * Centralizes:
 *  - Static-card configuration enforcement (ASTRA_CARD_STATIC_OPTIONS)
 *  - Star Struck hero data binding (preserving Astra's original card title artwork)
 *  - WebGL context budget enforcement across multi-card views (e.g. 10x Summon)
 *  - Deterministic lifecycle teardown (destroyAll on re-render / tab change / unmount)
 *  - Graceful fallback when WebGL or browser DOM is unavailable (e.g. Node unit tests)
 */

import {
  AstraCard,
  ASTRA_CARD_STATIC_OPTIONS,
} from '../../astra-cardtemplate/AstraCard.js';

export const ASTRA_HERO_ID = 'astra';
export const MAX_SIMULTANEOUS_ASTRA_CARDS = 6;

/**
 * Supported interactive preview preset for Commander Card Preview Mode:
 * enables mouse-controlled 3D tilt & parallax while keeping automatic rotation off.
 */
export const ASTRA_CARD_PREVIEW_OPTIONS = Object.freeze({
  autoplay: false,
  interactive: true,
  tilt: 1,
  animateEffects: true,
});

/**
 * Data-driven registry of Commanders that have a collectible holographic card.
 * New Commander collectible cards can be registered here without changing UI
 * screen or preview logic.
 */
const COLLECTIBLE_COMMANDER_CARDS = new Map([
  [
    ASTRA_HERO_ID,
    {
      id: ASTRA_HERO_ID,
      displayName: 'ASTRA',
      CardClass: AstraCard,
      assets: null,
      glow: null,
    },
  ],
]);

/**
 * Register a collectible Commander card definition for reusable display & preview.
 *
 * @param {string} heroId
 * @param {object} [config]
 */
export function registerCollectibleCommanderCard(heroId, config = {}) {
  const key = String(heroId || '').toLowerCase();
  if (!key) return;
  COLLECTIBLE_COMMANDER_CARDS.set(key, {
    id: key,
    displayName: config.displayName || key.toUpperCase(),
    CardClass: config.CardClass || AstraCard,
    assets: config.assets || null,
    glow: config.glow ?? null,
  });
}

/**
 * Look up collectible card configuration for a Commander hero object or ID.
 *
 * @param {string|object|null|undefined} heroOrId
 * @returns {object|null}
 */
export function getCommanderCardConfig(heroOrId) {
  if (!heroOrId) return null;
  const key =
    typeof heroOrId === 'string'
      ? heroOrId.toLowerCase()
      : String(heroOrId.id || '').toLowerCase();
  return COLLECTIBLE_COMMANDER_CARDS.get(key) || null;
}

/**
 * Return true when the given Commander has a registered collectible card.
 *
 * @param {string|object|null|undefined} heroOrId
 * @returns {boolean}
 */
export function hasCollectibleCommanderCard(heroOrId) {
  return Boolean(getCommanderCardConfig(heroOrId));
}

/**
 * Return true when a hero object or hero ID refers to Commander Astra.
 *
 * @param {string|object|null|undefined} heroOrId
 * @returns {boolean}
 */
export function isAstraHero(heroOrId) {
  if (!heroOrId) return false;
  if (typeof heroOrId === 'string') {
    return heroOrId.toLowerCase() === ASTRA_HERO_ID;
  }
  return String(heroOrId.id || '').toLowerCase() === ASTRA_HERO_ID;
}

/**
 * Warm cached font, title, and pre-processed card textures without creating any
 * WebGL context. Safe no-op in non-browser environments or for non-collectible heroes.
 *
 * @param {string|object|null|undefined} heroOrId
 * @returns {Promise<void>}
 */
export function preloadCommanderCard(heroOrId) {
  const cfg = getCommanderCardConfig(heroOrId);
  if (!cfg) return Promise.resolve();
  const CardClass = cfg.CardClass || AstraCard;
  if (typeof CardClass?.preload !== 'function') return Promise.resolve();
  try {
    return Promise.resolve(
      CardClass.preload({
        name: cfg.displayName,
        assets: cfg.assets || undefined,
      }),
    ).catch(() => {});
  } catch {
    return Promise.resolve();
  }
}

/**
 * Build the collectible card `data` payload from real Star Struck hero data.
 * Uses the registered card displayName (e.g. 'ASTRA') so the holographic
 * top-band title matches the card artwork while carrying full commander metadata.
 *
 * @param {object|null|undefined} hero
 * @param {object} [extra]
 * @returns {object}
 */
export function buildAstraCardData(hero, extra = {}) {
  const safeHero = hero || {};
  const cardCfg = getCommanderCardConfig(safeHero);
  const cardName =
    cardCfg?.displayName ||
    String(safeHero.name || 'ASTRA')
      .split(' ')[0]
      .toUpperCase();
  return {
    id: safeHero.id || ASTRA_HERO_ID,
    name: cardName,
    fullName: safeHero.name || 'Astra Valen',
    title: safeHero.title || 'Starlight Tactician',
    rarity: safeHero.rarity || 'SSR',
    level: safeHero.level ?? 1,
    copies: safeHero.copies ?? 0,
    owned: Boolean(safeHero.owned),
    role: safeHero.role || 'Tactician',
    faction: safeHero.faction || 'Celestial Order',
    realm: safeHero.realm || 'Celestial Order',
    portraitAssetId: safeHero.portraitAssetId || 'hero_portrait_astra',
    passiveSkill: safeHero.passiveSkill?.name || null,
    ultimateSkill: safeHero.ultimateSkill?.name || null,
    ...extra,
  };
}

/**
 * Check whether the current runtime supports mounting a real DOM + WebGL AstraCard.
 *
 * @param {unknown} container
 * @returns {boolean}
 */
export function canMountWebGLCard(container) {
  if (!container) return false;
  if (typeof HTMLElement === 'undefined' || !(container instanceof HTMLElement)) {
    return false;
  }
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return false;
  }
  if (typeof WebGLRenderingContext === 'undefined') {
    return false;
  }
  return true;
}

/**
 * Render a clean static portrait fallback inside `container` when WebGL cannot
 * be initialized or the simultaneous WebGL context budget is reached.
 *
 * @param {HTMLElement|object} container
 * @param {object} opts
 */
function mountPortraitFallback(container, { hero, assetManager, fallbackAssetId }) {
  if (!container) return;
  const alt = hero?.name || 'Astra Valen';
  const assetId = fallbackAssetId || hero?.portraitAssetId || 'hero_portrait_astra';
  container.setAttribute?.('data-card-state', 'fallback');
  container.innerHTML = `<img class="astra-card-fallback-img" alt="${alt}" />`;
  const img = container.querySelector?.('img');
  if (img && assetManager?.bindImageElement) {
    assetManager.bindImageElement(img, assetId);
  }
}

/**
 * Per-screen lifecycle registry for Commander collectible card instances.
 * Enforces ASTRA_CARD_STATIC_OPTIONS by default, supports interactive preview
 * mode via `mode: 'preview'`, and deterministically cleans up all instances.
 */
export class AstraCardRegistry {
  /**
   * @param {object} [options]
   * @param {number} [options.maxInstances=6]
   * @param {typeof AstraCard} [options.CardClass=AstraCard]
   */
  constructor({ maxInstances = MAX_SIMULTANEOUS_ASTRA_CARDS, CardClass = null } = {}) {
    this._maxInstances = Math.max(1, Number(maxInstances) || MAX_SIMULTANEOUS_ASTRA_CARDS);
    this._CardClassOverride = CardClass || null;
    this._instances = [];
    this._loadTimers = new Map();
  }

  get count() {
    return this._instances.length;
  }

  getInstances() {
    return [...this._instances];
  }

  _clearLoadTimer(card) {
    if (!card) return;
    const timer = this._loadTimers.get(card);
    if (timer) {
      clearTimeout(timer);
      this._loadTimers.delete(card);
    }
  }

  /**
   * Mount a Commander collectible card into `container`.
   * Normal UI uses `mode: 'static'` (stationary); preview modal uses `mode: 'preview'`.
   *
   * @param {HTMLElement|object|null} container
   * @param {object} [opts]
   * @returns {AstraCard|null}
   */
  mount(container, opts = {}) {
    if (!container) return null;

    const {
      hero = null,
      extraData = {},
      mode = 'static',
      selected = false,
      selectable = false,
      studio = false,
      glow = undefined,
      assets = undefined,
      onClick = null,
      onSelect = null,
      onHoverStart = null,
      onHoverEnd = null,
      onReady = null,
      onError = null,
      assetManager = null,
      fallbackAssetId = null,
      loadingTimeoutMs = undefined,
    } = opts;

    if (this._instances.length >= this._maxInstances) {
      mountPortraitFallback(container, { hero, assetManager, fallbackAssetId });
      return null;
    }

    const cardCfg = getCommanderCardConfig(hero);
    const CardClass = this._CardClassOverride || cardCfg?.CardClass || AstraCard;
    const isRealAstraCard = CardClass === AstraCard;
    if (isRealAstraCard && !canMountWebGLCard(container)) {
      mountPortraitFallback(container, { hero, assetManager, fallbackAssetId });
      return null;
    }

    const modePreset =
      mode === 'preview' ? ASTRA_CARD_PREVIEW_OPTIONS : ASTRA_CARD_STATIC_OPTIONS;

    const resolvedGlow = glow !== undefined ? glow : (cardCfg?.glow ?? null);
    const resolvedAssets = assets !== undefined ? assets : (cardCfg?.assets || undefined);
    const resolvedTimeoutMs =
      loadingTimeoutMs !== undefined
        ? Number(loadingTimeoutMs) || 0
        : isRealAstraCard
          ? 10000
          : 0;

    let card = null;
    let settled = false;

    const markReady = (detail) => {
      if (settled) return;
      settled = true;
      this._clearLoadTimer(card);
      container.setAttribute?.('data-card-state', 'ready');
      if (typeof onReady === 'function') {
        onReady(detail, card);
      }
    };

    const triggerFallback = (detail) => {
      if (settled) return;
      settled = true;
      this._clearLoadTimer(card);
      if (card) {
        this.destroyOne(card);
      }
      if (assetManager && container) {
        mountPortraitFallback(container, { hero, assetManager, fallbackAssetId });
      } else {
        container.setAttribute?.('data-card-state', 'fallback');
      }
      if (typeof onError === 'function') {
        onError(detail);
      }
    };

    container.setAttribute?.('data-card-state', 'loading');

    const cardOptions = {
      ...modePreset,
      selectable: Boolean(selectable),
      selected: Boolean(selected),
      studio: Boolean(studio),
      glow: resolvedGlow,
      ...(resolvedAssets ? { assets: resolvedAssets } : {}),
      data: buildAstraCardData(hero, extraData),
      onClick: typeof onClick === 'function' ? onClick : undefined,
      onSelect: typeof onSelect === 'function' ? onSelect : undefined,
      onHoverStart: typeof onHoverStart === 'function' ? onHoverStart : undefined,
      onHoverEnd: typeof onHoverEnd === 'function' ? onHoverEnd : undefined,
      onReady: markReady,
      onError: triggerFallback,
    };

    try {
      card = new CardClass(container, cardOptions);
      this._instances.push(card);

      if (card.ready) {
        markReady(card.getData?.() || cardOptions.data);
      } else {
        if (typeof card.whenReady === 'function') {
          Promise.resolve(card.whenReady()).then(
            () => markReady(card.getData?.() || cardOptions.data),
            (err) => {
              if (!card.destroyed) {
                triggerFallback(err);
              }
            },
          );
        }
        if (resolvedTimeoutMs > 0) {
          const timer = setTimeout(() => {
            if (!settled && card && !card.ready && !card.destroyed) {
              triggerFallback(new Error('AstraCard initialization timed out'));
            }
          }, resolvedTimeoutMs);
          this._loadTimers.set(card, timer);
        }
      }

      return card;
    } catch (error) {
      triggerFallback({ error, card: null });
      return null;
    }
  }

  /**
   * Pause rendering on all currently mounted instances (e.g. while preview modal is open).
   */
  pauseAll() {
    for (const card of this._instances) {
      try {
        card.pause?.();
      } catch {
        // Ignore pause errors on detaching elements
      }
    }
  }

  /**
   * Resume rendering on all currently mounted instances and enforce normal static options.
   */
  resumeAll({ restoreStatic = false } = {}) {
    for (const card of this._instances) {
      try {
        if (restoreStatic && typeof card.setOptions === 'function') {
          card.setOptions({ ...ASTRA_CARD_STATIC_OPTIONS });
        }
        card.resume?.();
        card.resize?.();
      } catch {
        // Ignore resume errors on detaching elements
      }
    }
  }

  /**
   * Destroy a single tracked instance and remove it from the registry.
   *
   * @param {AstraCard|null} card
   */
  destroyOne(card) {
    if (!card) return;
    this._clearLoadTimer(card);
    const idx = this._instances.indexOf(card);
    if (idx !== -1) {
      this._instances.splice(idx, 1);
    }
    try {
      card.destroy?.();
    } catch {
      // Ignore cleanup errors during teardown
    }
  }

  /**
   * Resize all currently mounted AstraCard instances.
   */
  resizeAll() {
    for (const card of this._instances) {
      try {
        card.resize?.();
      } catch {
        // Ignore resize errors on detaching elements
      }
    }
  }

  /**
   * Destroy every mounted AstraCard instance and release its WebGL context.
   */
  destroyAll() {
    for (const timer of this._loadTimers.values()) {
      clearTimeout(timer);
    }
    this._loadTimers.clear();
    const active = this._instances.splice(0, this._instances.length);
    for (const card of active) {
      try {
        card.destroy?.();
      } catch {
        // Ignore cleanup errors during teardown
      }
    }
  }
}

export { AstraCard, ASTRA_CARD_STATIC_OPTIONS };
