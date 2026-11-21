/**
 * AssetManager — Centralized configuration-driven asset registry and loader.
 *
 * Asset Independence Contract:
 * Gameplay logic references heroes, units, and effects strictly by stable IDs.
 * Portrait assets declare the 1152 x 1744 standard canvas where applicable,
 * while battle sprites and UI icons use dimensions suited to their formats.
 */

export const PORTRAIT_CANVAS = Object.freeze({ width: 1152, height: 1744 });

export const ASSETS_CONFIG = {
  // Commander Hero Portraits (1152 x 1744 portrait canvas)
  hero_portrait_astra: {
    id: 'hero_portrait_astra',
    category: 'hero_portrait',
    type: 'image',
    format: 'png',
    src: './astra-cardtemplate/assets-astra/character.png',
    label: 'Astra Valen',
    canvasSize: PORTRAIT_CANVAS,
  },
  hero_bg_astra: {
    id: 'hero_bg_astra',
    category: 'hero_background',
    type: 'image',
    format: 'jpeg',
    src: './astra-cardtemplate/assets-astra/bg.jpeg',
    label: 'Astra Celestial Backdrop',
    canvasSize: PORTRAIT_CANVAS,
  },
  hero_portrait_kael: {
    id: 'hero_portrait_kael',
    category: 'hero_portrait',
    type: 'image',
    format: 'svg',
    src: './assets/heroes/kael.svg',
    label: 'Kael Virel',
    canvasSize: PORTRAIT_CANVAS,
  },
  hero_portrait_lyra: {
    id: 'hero_portrait_lyra',
    category: 'hero_portrait',
    type: 'image',
    format: 'svg',
    src: './assets/heroes/lyra.svg',
    label: 'Lyra Solis',
    canvasSize: PORTRAIT_CANVAS,
  },
  hero_portrait_seraphina: {
    id: 'hero_portrait_seraphina',
    category: 'hero_portrait',
    type: 'image',
    format: 'svg',
    src: './assets/heroes/seraphina.svg',
    label: 'Seraphina Kuros',
    canvasSize: PORTRAIT_CANVAS,
  },
  hero_portrait_vanguard_zero: {
    id: 'hero_portrait_vanguard_zero',
    category: 'hero_portrait',
    type: 'image',
    format: 'svg',
    src: './assets/heroes/vanguard_zero.svg',
    label: 'Orin Vance',
    canvasSize: PORTRAIT_CANVAS,
  },

  // Battlefield Unit Sprites (native sprite format)
  unit_heavy_shield_guard: {
    id: 'unit_heavy_shield_guard',
    category: 'unit_sprite',
    type: 'image',
    format: 'svg',
    src: './assets/units/heavy_shield_guard.svg',
    label: 'Heavy Shield Guard',
    canvasSize: { width: 128, height: 128 },
  },
  unit_wind_cavalry: {
    id: 'unit_wind_cavalry',
    category: 'unit_sprite',
    type: 'image',
    format: 'svg',
    src: './assets/units/wind_cavalry.svg',
    label: 'Wind Cavalry',
    canvasSize: { width: 128, height: 128 },
  },
  unit_arcane_archer: {
    id: 'unit_arcane_archer',
    category: 'unit_sprite',
    type: 'image',
    format: 'svg',
    src: './assets/units/arcane_archer.svg',
    label: 'Arcane Archer',
    canvasSize: { width: 128, height: 128 },
  },
  unit_field_cleric: {
    id: 'unit_field_cleric',
    category: 'unit_sprite',
    type: 'image',
    format: 'svg',
    src: './assets/units/field_cleric.svg',
    label: 'Field Cleric',
    canvasSize: { width: 128, height: 128 },
  },
  unit_vanguard_breaker: {
    id: 'unit_vanguard_breaker',
    category: 'unit_sprite',
    type: 'image',
    format: 'svg',
    src: './assets/units/vanguard_breaker.svg',
    label: 'Vanguard Breaker',
    canvasSize: { width: 128, height: 128 },
  },
  unit_pulse_skirmisher: {
    id: 'unit_pulse_skirmisher',
    category: 'unit_sprite',
    type: 'image',
    format: 'svg',
    src: './assets/units/pulse_skirmisher.svg',
    label: 'Pulse Skirmisher',
    canvasSize: { width: 128, height: 128 },
  },
  unit_solar_pyromancer: {
    id: 'unit_solar_pyromancer',
    category: 'unit_sprite',
    type: 'image',
    format: 'svg',
    src: './assets/units/solar_pyromancer.svg',
    label: 'Solar Pyromancer',
    canvasSize: { width: 128, height: 128 },
  },
  unit_aegis_sentinel: {
    id: 'unit_aegis_sentinel',
    category: 'unit_sprite',
    type: 'image',
    format: 'svg',
    src: './assets/units/aegis_sentinel.svg',
    label: 'Aegis Sentinel',
    canvasSize: { width: 128, height: 128 },
  },
  unit_chrono_weaver: {
    id: 'unit_chrono_weaver',
    category: 'unit_sprite',
    type: 'image',
    format: 'svg',
    src: './assets/units/chrono_weaver.svg',
    label: 'Chrono Weaver',
    canvasSize: { width: 128, height: 128 },
  },
  unit_astral_construct: {
    id: 'unit_astral_construct',
    category: 'unit_sprite',
    type: 'image',
    format: 'svg',
    src: './assets/units/astral_construct.svg',
    label: 'Astral Automaton',
    canvasSize: { width: 128, height: 128 },
  },

  // Tactical Card Emblems
  card_emblem_shield: {
    id: 'card_emblem_shield',
    category: 'card_emblem',
    type: 'image',
    format: 'svg',
    src: './assets/cards/emblem_shield.svg',
    label: 'Shield Card',
    canvasSize: { width: 64, height: 64 },
  },
  card_emblem_cavalry: {
    id: 'card_emblem_cavalry',
    category: 'card_emblem',
    type: 'image',
    format: 'svg',
    src: './assets/cards/emblem_cavalry.svg',
    label: 'Cavalry Card',
    canvasSize: { width: 64, height: 64 },
  },
  card_emblem_archer: {
    id: 'card_emblem_archer',
    category: 'card_emblem',
    type: 'image',
    format: 'svg',
    src: './assets/cards/emblem_archer.svg',
    label: 'Archer Card',
    canvasSize: { width: 64, height: 64 },
  },
  card_emblem_cleric: {
    id: 'card_emblem_cleric',
    category: 'card_emblem',
    type: 'image',
    format: 'svg',
    src: './assets/cards/emblem_cleric.svg',
    label: 'Cleric Card',
    canvasSize: { width: 64, height: 64 },
  },
  card_emblem_breaker: {
    id: 'card_emblem_breaker',
    category: 'card_emblem',
    type: 'image',
    format: 'svg',
    src: './assets/cards/emblem_breaker.svg',
    label: 'Breaker Card',
    canvasSize: { width: 64, height: 64 },
  },
  card_emblem_pyro: {
    id: 'card_emblem_pyro',
    category: 'card_emblem',
    type: 'image',
    format: 'svg',
    src: './assets/cards/emblem_pyro.svg',
    label: 'Pyro Card',
    canvasSize: { width: 64, height: 64 },
  },
  card_emblem_chrono: {
    id: 'card_emblem_chrono',
    category: 'card_emblem',
    type: 'image',
    format: 'svg',
    src: './assets/cards/emblem_chrono.svg',
    label: 'Chrono Card',
    canvasSize: { width: 64, height: 64 },
  },
  card_emblem_construct: {
    id: 'card_emblem_construct',
    category: 'card_emblem',
    type: 'image',
    format: 'svg',
    src: './assets/cards/emblem_construct.svg',
    label: 'Construct Card',
    canvasSize: { width: 64, height: 64 },
  },

  // Battlefield Backgrounds & Effects
  bg_battle_orbital_ridge: {
    id: 'bg_battle_orbital_ridge',
    category: 'background',
    type: 'image',
    format: 'svg',
    src: './assets/backgrounds/orbital_ridge.svg',
    label: 'Orbital Ridge',
    canvasSize: { width: 1600, height: 620 },
  },
  effect_astral_burst: {
    id: 'effect_astral_burst',
    category: 'effect',
    type: 'image',
    format: 'svg',
    src: './assets/effects/astral_burst.svg',
    label: 'Astral Burst',
    canvasSize: { width: 64, height: 64 },
  },
  ui_emblem: {
    id: 'ui_emblem',
    category: 'ui',
    type: 'image',
    format: 'svg',
    src: './assets/ui/astral_emblem.svg',
    label: 'Astral Emblem',
    canvasSize: { width: 64, height: 64 },
  },
};

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generates an inline SVG placeholder Data URI so missing or failed assets
 * never render broken image icons or crash rendering pipelines.
 */
export function createFallbackDataUri(assetId, entry = null) {
  const width = entry?.canvasSize?.width || 256;
  const height = entry?.canvasSize?.height || 256;
  const label = escapeXml(entry?.label || assetId || 'Asset');
  const fontSize = Math.max(12, Math.round(Math.min(width, height) * 0.085));
  const subSize = Math.max(10, Math.round(fontSize * 0.65));

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<rect width="${width}" height="${height}" fill="#101a2f"/>`,
    `<rect x="6" y="6" width="${width - 12}" height="${height - 12}" fill="none" stroke="#38bdf8" stroke-opacity="0.45" stroke-width="2" stroke-dasharray="10 6"/>`,
    `<line x1="12" y1="12" x2="${width - 12}" y2="${height - 12}" stroke="#38bdf8" stroke-opacity="0.16" stroke-width="1.5"/>`,
    `<line x1="${width - 12}" y1="12" x2="12" y2="${height - 12}" stroke="#38bdf8" stroke-opacity="0.16" stroke-width="1.5"/>`,
    `<text x="50%" y="48%" text-anchor="middle" fill="#e2b75b" font-family="sans-serif" font-size="${subSize}" letter-spacing="2">FALLBACK ASSET</text>`,
    `<text x="50%" y="56%" text-anchor="middle" fill="#edf2fa" font-family="sans-serif" font-weight="600" font-size="${fontSize}">${label}</text>`,
    `</svg>`,
  ].join('');

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export class AssetManager {
  constructor({ config = ASSETS_CONFIG, eventBus = null, imageLoader = null } = {}) {
    this._config = { ...config };
    this._eventBus = eventBus;
    this._imageLoader = imageLoader;
    /** @type {Map<string, { status: string, src: string, element: any, isFallback: boolean }>} */
    this._cache = new Map();
  }

  registerAsset(assetId, descriptor) {
    this._config[assetId] = { id: assetId, ...descriptor };
  }

  getConfig(assetId) {
    return this._config[assetId] || null;
  }

  getState(assetId) {
    return this._cache.get(assetId)?.status || 'idle';
  }

  /**
   * Returns a safe image URL immediately (resolved asset path or fallback Data URI).
   */
  getImageSrc(assetId) {
    const cached = this._cache.get(assetId);
    if (cached) return cached.src;
    const entry = this._config[assetId];
    if (!entry || !entry.src) {
      return createFallbackDataUri(assetId, entry);
    }
    return entry.src;
  }

  /**
   * Returns a loaded HTMLImageElement (or null if not yet loaded).
   */
  getImageElement(assetId) {
    return this._cache.get(assetId)?.element || null;
  }

  /**
   * Binds resilient error fallback directly to an <img> element so broken icons never appear.
   */
  bindImageElement(imgEl, assetId) {
    if (!imgEl) return;
    const entry = this._config[assetId];
    const fallbackUri = createFallbackDataUri(assetId, entry);

    imgEl.alt = entry?.label || assetId;
    imgEl.referrerPolicy = 'no-referrer';
    imgEl.onerror = () => {
      if (imgEl.dataset.fallbackApplied === '1') return;
      imgEl.dataset.fallbackApplied = '1';
      imgEl.src = fallbackUri;
      this._cache.set(assetId, {
        status: 'fallback',
        src: fallbackUri,
        element: imgEl,
        isFallback: true,
      });
      this._eventBus?.emit('asset:fallback', { assetId });
    };
    imgEl.src = this.getImageSrc(assetId);
  }

  async loadAsset(assetId) {
    const existing = this._cache.get(assetId);
    if (existing && (existing.status === 'loaded' || existing.status === 'fallback')) {
      return existing;
    }

    const entry = this._config[assetId];
    if (!entry) {
      const fallbackUri = createFallbackDataUri(assetId, null);
      const record = { status: 'fallback', src: fallbackUri, element: null, isFallback: true };
      this._cache.set(assetId, record);
      this._eventBus?.emit('asset:fallback', { assetId, reason: 'unregistered' });
      return record;
    }

    this._cache.set(assetId, { status: 'loading', src: entry.src, element: null, isFallback: false });

    if (entry.type === 'audio') {
      return this._loadAudio(assetId, entry);
    }
    return this._loadImage(assetId, entry);
  }

  async _loadImage(assetId, entry) {
    const fallbackUri = createFallbackDataUri(assetId, entry);
    const loadImpl =
      this._imageLoader ||
      ((src) =>
        new Promise((resolve, reject) => {
          if (typeof Image === 'undefined') {
            reject(new Error('Image constructor unavailable in non-DOM environment'));
            return;
          }
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
          img.src = src;
        }));

    try {
      const element = await loadImpl(entry.src);
      const record = { status: 'loaded', src: entry.src, element, isFallback: false };
      this._cache.set(assetId, record);
      this._eventBus?.emit('asset:loaded', { assetId });
      return record;
    } catch (error) {
      let fallbackEl = null;
      if (typeof Image !== 'undefined' && !this._imageLoader) {
        try {
          fallbackEl = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = fallbackUri;
          });
        } catch {
          fallbackEl = null;
        }
      }
      const record = { status: 'fallback', src: fallbackUri, element: fallbackEl, isFallback: true };
      this._cache.set(assetId, record);
      this._eventBus?.emit('asset:fallback', {
        assetId,
        reason: error instanceof Error ? error.message : String(error),
      });
      return record;
    }
  }

  async _loadAudio(assetId, entry) {
    try {
      if (typeof fetch !== 'function') {
        throw new Error('fetch unavailable');
      }
      const res = await fetch(entry.src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = await res.arrayBuffer();
      const record = { status: 'loaded', src: entry.src, element: buffer, isFallback: false };
      this._cache.set(assetId, record);
      return record;
    } catch {
      const record = { status: 'fallback', src: '', element: null, isFallback: true };
      this._cache.set(assetId, record);
      this._eventBus?.emit('asset:fallback', { assetId, reason: 'audio_unavailable' });
      return record;
    }
  }

  async preloadGroup(assetIds) {
    const ids = Array.isArray(assetIds) ? assetIds : Object.keys(this._config);
    const results = await Promise.all(ids.map((id) => this.loadAsset(id)));
    this._eventBus?.emit('asset:batchComplete', this.getStatusSummary());
    return results;
  }

  getStatusSummary() {
    let loaded = 0;
    let fallback = 0;
    let loading = 0;
    for (const entry of this._cache.values()) {
      if (entry.status === 'loaded') loaded += 1;
      else if (entry.status === 'fallback') fallback += 1;
      else if (entry.status === 'loading') loading += 1;
    }
    return {
      registered: Object.keys(this._config).length,
      cached: this._cache.size,
      loaded,
      fallback,
      loading,
    };
  }
}
