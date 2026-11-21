/**
 * SummonScreen — Three-Part Anime Gacha Recruitment Experience.
 *
 * Composition:
 *  - LEFT: Compact vertical banner selection rail (Active / Available / Expired).
 *  - RIGHT: Dominant full-stage banner presentation with large character artwork,
 *    featured roster details, real drop rates, pity progress, and duration info.
 *  - BOTTOM-RIGHT: Pull controls in exact order:
 *      [Pulling History] [1x Pull] [10x Pull]
 *  - OVERLAYS: Pull Results showcase (auto-opened after pulling) and Pulling History
 *    record viewer (opened via the Pulling History button).
 */

import { formatNumber } from '../utils/MathUtils.js';
import { AstraCardRegistry, isAstraHero } from './AstraCardMount.js';

/**
 * Determine a banner's availability status using only real banner metadata.
 * Never fabricates expiration dates; permanent banners remain live unless an
 * explicit `endAt` / `expiresAt` timestamp in the past is present.
 *
 * @param {object} banner
 * @param {string|null} activeBannerId
 * @param {number} [nowMs]
 * @returns {'active'|'available'|'expired'}
 */
export function getBannerStatus(banner, activeBannerId, nowMs = Date.now()) {
  const endRaw = banner?.endAt || banner?.expiresAt || null;
  if (endRaw) {
    const endTs = Date.parse(endRaw);
    if (!Number.isNaN(endTs) && endTs <= nowMs) {
      return 'expired';
    }
  }
  return banner?.id === activeBannerId ? 'active' : 'available';
}

/**
 * Format honest banner duration/availability text from real banner fields.
 * Returns "Permanent Banner" when no expiration metadata is configured.
 *
 * @param {object} banner
 * @param {number} [nowMs]
 * @returns {string}
 */
export function formatBannerDuration(banner, nowMs = Date.now()) {
  const endRaw = banner?.endAt || banner?.expiresAt || null;
  if (!endRaw) {
    return 'Permanent Banner';
  }
  const endTs = Date.parse(endRaw);
  if (Number.isNaN(endTs)) {
    return 'Permanent Banner';
  }
  const dateLabel = new Date(endTs).toISOString().slice(0, 10);
  if (endTs <= nowMs) {
    return `Ended ${dateLabel}`;
  }
  const remainingHours = Math.max(1, Math.ceil((endTs - nowMs) / 3600000));
  if (remainingHours >= 24) {
    const days = Math.floor(remainingHours / 24);
    const hours = remainingHours % 24;
    return `Ends ${dateLabel} (${days}d ${hours}h left)`;
  }
  return `Ends ${dateLabel} (${remainingHours}h left)`;
}

/**
 * Resolve featured items for display from existing DataRegistry records.
 *
 * @param {object} banner
 * @param {object} dataRegistry
 * @returns {Array<{id: string, name: string, subtitle: string, rarity: string, assetId: string, kind: 'hero'|'card'}>}
 */
function resolveFeaturedItems(banner, dataRegistry) {
  if (!banner || !dataRegistry) return [];
  const items = [];
  const isTactical = banner.bannerType === 'tactical';

  if (isTactical && Array.isArray(banner.featuredCardIds)) {
    for (const cardId of banner.featuredCardIds) {
      const card = dataRegistry.cardsById?.get(cardId);
      if (!card) continue;
      const unitDef = card.unitId ? dataRegistry.unitsById?.get(card.unitId) : null;
      items.push({
        id: card.id,
        name: card.name,
        subtitle: card.category ? `${card.category.charAt(0).toUpperCase() + card.category.slice(1)} Card` : 'Tactical Card',
        rarity: card.rarity || 'SR',
        assetId: unitDef?.spriteAssetId || card.iconAssetId || '',
        kind: 'card',
      });
    }
  } else if (Array.isArray(banner.featuredHeroIds)) {
    for (const heroId of banner.featuredHeroIds) {
      const hero = dataRegistry.heroesById?.get(heroId);
      if (!hero) continue;
      items.push({
        id: hero.id,
        name: hero.name,
        subtitle: hero.title || hero.role || 'Commander',
        rarity: hero.rarity || 'SSR',
        assetId: hero.portraitAssetId || '',
        kind: 'hero',
      });
    }
  }

  return items;
}

export class SummonScreen {
  constructor(ctx) {
    this._ctx = ctx;
    this._unsubs = [];
    this._overlayMode = null; // null | 'history' | 'results'
    this._astraCards = new AstraCardRegistry({
      maxInstances: 6,
      CardClass: ctx?.AstraCardClass,
    });
    this._onKeyDown = (event) => {
      if (event.key === 'Escape' && this._overlayMode) {
        this._overlayMode = null;
        this.render();
      }
    };
  }

  mount(container) {
    this._container = container;
    this._overlayMode = null;
    this.render();
    this._unsubs.push(
      this._ctx.eventBus.on('state:changed', () => this.render()),
    );
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('keydown', this._onKeyDown);
    }
  }

  unmount() {
    this._astraCards.destroyAll();
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    if (typeof window !== 'undefined' && window.removeEventListener) {
      window.removeEventListener('keydown', this._onKeyDown);
    }
    this._overlayMode = null;
    this._container = null;
  }

  render() {
    if (!this._container) return;
    this._astraCards.destroyAll();
    const {
      gachaSystem,
      economySystem,
      gameState,
      dataRegistry,
      assetManager,
      audioManager,
      screenManager,
    } = this._ctx;

    const nowMs = Date.now();
    const banners = gachaSystem.getBanners();
    const banner = gachaSystem.getActiveBanner();
    const isTactical = banner?.bannerType === 'tactical';
    const bannerStatus = getBannerStatus(banner, banner?.id, nowMs);
    const isExpired = bannerStatus === 'expired';
    const durationLabel = formatBannerDuration(banner, nowMs);
    const pity = gachaSystem.getPityStatus();
    const currencyId = banner?.currency || 'astrite';
    const currencyLabel = currencyId === 'astrite' ? 'Astrite' : currencyId;
    const balance = economySystem.getBalance(currencyId);
    const singleCost = banner?.singleCost ?? 160;
    const tenCost = banner?.tenCost ?? 1600;
    const canAffordSingle = !isExpired && balance >= singleCost;
    const canAffordTen = !isExpired && balance >= tenCost;
    const results = gameState.ui.lastSummonResults || [];

    const pityPct = Math.min(100, Math.round((pity.ssrPity / Math.max(1, pity.ssrHardPity)) * 100));
    const ssrRate = Math.round((banner?.rates?.SSR ?? 0.03) * 100);
    const srRate = Math.round((banner?.rates?.SR ?? 0.17) * 100);
    const rRate = Math.round((banner?.rates?.R ?? 0.8) * 100);
    const featuredItems = resolveFeaturedItems(banner, dataRegistry);
    const leadFeatured = featuredItems[0] || null;

    const featuredRarities = Array.from(
      new Set(featuredItems.map((item) => item.rarity).filter(Boolean)),
    );
    const featuredRarityLabel =
      featuredRarities.length > 0 ? featuredRarities.join(' / ') : isTactical ? 'SR / SSR' : 'SSR';

    const unavailableNotice = isExpired
      ? 'This banner has expired.'
      : !canAffordSingle
        ? `Insufficient ${currencyLabel} (${formatNumber(balance)} available)`
        : !canAffordTen
          ? `Need ${formatNumber(tenCost - balance)} more ${currencyLabel} for 10x Pull`
          : '';

    this._container.innerHTML = `
      <section class="screen-frame summon-screen" aria-label="Summon and Recruitment">
        <div class="screen-bar">
          <div class="screen-bar__lead">
            <h1 class="screen-title">Summon</h1>
            <span class="screen-subtitle">Starlight Recruitment &amp; Armory Requisition</span>
          </div>

          <div class="meta-line tabular-nums">
            <span class="summon-balance-readout">${formatNumber(balance)} ${currencyLabel}</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span>SSR Pity ${pity.ssrPity} / ${pity.ssrHardPity}</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span>Total Pulls ${pity.totalPulls}</span>
          </div>
        </div>

        <div class="summon-workspace">
          <!-- LEFT: Compact Vertical Banner Selection Panel -->
          <aside class="surface summon-banner-rail" aria-label="Banner Selection">
            <div class="summon-banner-rail__head">
              <span class="section-kicker section-kicker--gold">Banners</span>
              <span class="summon-banner-rail__count tabular-nums">${banners.length}</span>
            </div>

            <div class="summon-banner-list" role="tablist" aria-label="Available Banners" aria-orientation="vertical">
              ${banners
                .map((entry) => {
                  const status = getBannerStatus(entry, banner?.id, nowMs);
                  const isSelected = entry.id === banner?.id;
                  const statusText =
                    status === 'expired' ? 'Expired' : status === 'active' ? 'Active' : 'Available';
                  const typeLabel = entry.bannerType === 'tactical' ? 'Tactical Supply' : 'Commanders';
                  return `
                    <button
                      type="button"
                      role="tab"
                      aria-selected="${isSelected}"
                      class="summon-banner-item is-${status}${isSelected ? ' is-selected' : ''}"
                      data-banner-id="${entry.id}"
                      data-banner-status="${status}"
                    >
                      <span class="summon-banner-item__thumb">
                        <img data-banner-thumb="${entry.featuredAssetId || ''}" alt="${entry.name}" />
                      </span>
                      <span class="summon-banner-item__body">
                        <span class="summon-banner-item__name">${entry.name}</span>
                        <span class="summon-banner-item__meta">
                          <span class="summon-banner-item__type">${typeLabel}</span>
                          <span class="summon-banner-status is-${status}">${statusText}</span>
                        </span>
                      </span>
                    </button>
                  `;
                })
                .join('')}
            </div>
          </aside>

          <!-- RIGHT: Dominant Main Banner Presentation Stage -->
          <div class="summon-stage${isExpired ? ' is-expired' : ''}" aria-label="Banner Presentation">
            <div class="summon-stage__media">
              <img id="banner-featured-img" alt="${banner?.name || 'Featured Banner'}" />
              <div class="summon-stage__scrim"></div>
            </div>

            <div class="summon-stage__content">
              <div class="summon-stage__top">
                <div class="summon-stage__eyebrow">
                  <span class="summon-stage__kicker">
                    ${isTactical ? 'Tactical Requisition Banner' : 'Featured Commander Banner'}
                  </span>
                  <span class="summon-stage__dot" aria-hidden="true">·</span>
                  <span class="summon-stage__rarity">Featured ${featuredRarityLabel}</span>
                </div>
                <div class="summon-stage__duration${isExpired ? ' is-expired' : ''}">
                  ${durationLabel}
                </div>
              </div>

              <div class="summon-stage__hero">
                <h2 class="summon-stage__title">${banner?.name || 'Starlight Sovereign'}</h2>
                <p class="summon-stage__desc">
                  ${
                    banner?.subtitle ||
                    (isTactical
                      ? 'Requisition Unit, Skill, Tactic, and Support cards. Duplicates convert into Credits and XP Chips.'
                      : 'Recruit off-field Commanders with army-wide passives and commander ultimates.')
                  }
                </p>

                ${
                  featuredItems.length > 0
                    ? `
                      <div class="summon-featured-block" aria-label="Featured Roster">
                        <div class="summon-featured-block__label">
                          ${isTactical ? 'Featured Requisitions' : 'Featured Commanders'}
                        </div>
                        <div class="summon-featured-strip">
                          ${featuredItems
                            .map(
                              (item) => `
                                <div class="summon-featured-chip is-${item.rarity.toLowerCase()}">
                                  <span class="summon-featured-chip__thumb ${item.kind === 'hero' ? 'is-portrait' : ''}">
                                    <img data-featured-art="${item.assetId}" alt="${item.name}" />
                                  </span>
                                  <span class="summon-featured-chip__info">
                                    <span class="summon-featured-chip__rarity rarity-${item.rarity.toLowerCase()}">${item.rarity}</span>
                                    <strong class="summon-featured-chip__name">${item.name}</strong>
                                    <span class="summon-featured-chip__sub">${item.subtitle}</span>
                                  </span>
                                </div>
                              `,
                            )
                            .join('')}
                        </div>
                      </div>
                    `
                    : ''
                }
              </div>

              ${
                leadFeatured && !isTactical
                  ? `
                    <div class="summon-stage__spotlight" aria-hidden="true">
                      <span class="summon-stage__spotlight-rarity">${leadFeatured.rarity} Commander</span>
                      <strong class="summon-stage__spotlight-name">${leadFeatured.name}</strong>
                      <span class="summon-stage__spotlight-title">${leadFeatured.subtitle}</span>
                    </div>
                  `
                  : ''
              }

              <div class="summon-stage__footer">
                <div class="summon-rates-summary">
                  <div class="summon-rates-row tabular-nums">
                    <span class="summon-rates-label">Drop Rates</span>
                    <span class="summon-rate-ssr">SSR ${ssrRate}%</span>
                    <span class="summon-rates-sep">·</span>
                    <span class="summon-rate-sr">SR ${srRate}%</span>
                    <span class="summon-rates-sep">·</span>
                    <span class="summon-rate-r">R ${rRate}%</span>
                  </div>
                  <div class="summon-pity-inline">
                    <span class="summon-pity-inline__text tabular-nums">
                      10x Guarantee: ≥1 ${banner?.pityConfig?.tenPullMinRarity || 'SR'} · Shared SSR Pity
                      <strong>${pity.ssrPity} / ${pity.ssrHardPity}</strong>
                    </span>
                    <div class="progress-track summon-pity-track" aria-label="SSR Pity Progress">
                      <div class="progress-fill progress-fill--gold" style="width: ${pityPct}%;"></div>
                    </div>
                  </div>
                </div>

                <!-- BOTTOM-RIGHT: Pull Controls in Exact Order [Pulling History] [1x Pull] [10x Pull] -->
                <div class="summon-pull-dock">
                  ${
                    unavailableNotice
                      ? `<div class="summon-unavailable-note" role="status">${unavailableNotice}</div>`
                      : ''
                  }
                  <div class="summon-pull-actions">
                    <button
                      type="button"
                      id="btn-summon-history"
                      class="btn btn-secondary btn-sm summon-history-btn"
                      aria-label="Pulling History"
                    >
                      Pulling History
                    </button>

                    <button
                      type="button"
                      id="btn-pull-single"
                      class="btn btn-primary summon-pull-btn${!canAffordSingle ? ' is-unavailable' : ''}"
                      ${!canAffordSingle ? 'disabled' : ''}
                    >
                      <span class="summon-pull-btn__label">1x Pull</span>
                      <span class="summon-pull-btn__cost tabular-nums">${formatNumber(singleCost)} ${currencyLabel}</span>
                    </button>

                    <button
                      type="button"
                      id="btn-pull-ten"
                      class="btn btn-gold btn-lg summon-pull-btn summon-pull-btn--ten${!canAffordTen ? ' is-unavailable' : ''}"
                      ${!canAffordTen ? 'disabled' : ''}
                    >
                      <span class="summon-pull-btn__label">10x Pull</span>
                      <span class="summon-pull-btn__cost tabular-nums">${formatNumber(tenCost)} ${currencyLabel}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        ${this._renderOverlay({ banner, isTactical, pity, results, dataRegistry })}
      </section>
    `;

    // Bind main banner artwork
    const imgEl = this._container.querySelector('#banner-featured-img');
    if (imgEl && banner) {
      assetManager.bindImageElement(imgEl, banner.featuredAssetId);
    }

    // Bind left banner rail thumbnails
    for (const thumbEl of this._container.querySelectorAll('[data-banner-thumb]')) {
      const aid = thumbEl.getAttribute('data-banner-thumb');
      if (aid) assetManager.bindImageElement(thumbEl, aid);
    }

    // Bind featured roster artwork
    for (const featEl of this._container.querySelectorAll('[data-featured-art]')) {
      const aid = featEl.getAttribute('data-featured-art');
      if (aid) assetManager.bindImageElement(featEl, aid);
    }

    // Bind pull result thumbnails (when Results overlay is open)
    for (const artEl of this._container.querySelectorAll('[data-pull-art]')) {
      const aid = artEl.getAttribute('data-pull-art');
      if (aid) assetManager.bindImageElement(artEl, aid);
    }

    // Mount static AstraCard instances for Commander Astra pull results
    if (this._overlayMode === 'results') {
      for (const slotEl of this._container.querySelectorAll('[data-astra-result-slot]')) {
        const resultIdx = Number(slotEl.getAttribute('data-astra-result-slot'));
        const entry = results[resultIdx];
        if (!entry || entry.itemType === 'card') continue;
        const heroDef = entry.hero || dataRegistry?.heroesById?.get(entry.heroId) || null;
        if (!isAstraHero(heroDef || entry.heroId)) continue;
        this._astraCards.mount(slotEl, {
          hero: heroDef,
          extraData: {
            isNew: Boolean(entry.isNew),
            bonusCard: entry.bonusCard?.name || null,
            pullIndex: resultIdx,
          },
          selectable: false,
          selected: false,
          studio: false,
          assetManager,
          fallbackAssetId: heroDef?.portraitAssetId || 'hero_portrait_astra',
        });
      }
    }

    // Banner selection clicks
    for (const tab of this._container.querySelectorAll('[data-banner-id]')) {
      tab.addEventListener('click', () => {
        const nextBannerId = tab.getAttribute('data-banner-id');
        if (!nextBannerId) return;
        audioManager.playClick();
        gachaSystem.setActiveBanner(nextBannerId);
        this.render();
      });
    }

    // Pulling History button
    this._container.querySelector('#btn-summon-history')?.addEventListener('click', () => {
      audioManager.playClick();
      gameState.setUI({ summonSideTab: 'history' });
      this._overlayMode = 'history';
      this.render();
    });

    // Pull execution
    const executePull = (count) => {
      if (isExpired) {
        audioManager.playInvalid();
        this._ctx.notify('This banner has expired.', 'warn');
        return;
      }
      const res = gachaSystem.pull(count);
      if (!res.ok) {
        audioManager.playInvalid();
        this._ctx.notify(res.reason, 'warn');
        return;
      }
      const bestRarity = res.results.some((r) => r.rarity === 'SSR')
        ? 'SSR'
        : res.results.some((r) => r.rarity === 'SR')
          ? 'SR'
          : 'R';
      audioManager.playSummon(bestRarity);
      gameState.setUI({ summonSideTab: 'results' });
      this._overlayMode = 'results';
      const noun = isTactical ? 'Tactical Card' : 'Commander';
      this._ctx.notify(
        `Obtained ${count} ${noun}${count > 1 ? 's' : ''}!`,
        bestRarity === 'SSR' ? 'success' : 'info',
      );
      this.render();
    };

    this._container.querySelector('#btn-pull-single')?.addEventListener('click', () => executePull(1));
    this._container.querySelector('#btn-pull-ten')?.addEventListener('click', () => executePull(10));

    // Overlay close & mode switch bindings
    for (const closeBtn of this._container.querySelectorAll('[data-close-overlay]')) {
      closeBtn.addEventListener('click', () => {
        audioManager.playClick();
        this._overlayMode = null;
        this.render();
      });
    }

    const overlayBackdrop = this._container.querySelector('.summon-overlay');
    if (overlayBackdrop) {
      overlayBackdrop.addEventListener('click', (event) => {
        if (event.target === overlayBackdrop) {
          audioManager.playClick();
          this._overlayMode = null;
          this.render();
        }
      });
    }

    this._container.querySelector('[data-open-history]')?.addEventListener('click', () => {
      audioManager.playClick();
      gameState.setUI({ summonSideTab: 'history' });
      this._overlayMode = 'history';
      this.render();
    });

    // Pull result item inspection navigation (preserved from existing implementation)
    const inspectResult = (cardEl) => {
      const inspectType = cardEl.getAttribute('data-inspect-type');
      const inspectId = cardEl.getAttribute('data-inspect-id');
      if (!inspectId) return;
      audioManager.playClick();
      this._overlayMode = null;
      this._astraCards.destroyAll();
      if (inspectType === 'hero') {
        gameState.setUI({ selectedHeroId: inspectId });
        screenManager.navigate('heroes');
      } else if (inspectType === 'unit') {
        gameState.setUI({ formationTab: 'squad', selectedRosterUnitId: inspectId });
        screenManager.navigate('formation');
      } else {
        gameState.setUI({
          inventoryFilter: 'cards',
          inventoryCardCat: 'all',
          selectedInventoryId: inspectId,
        });
        screenManager.navigate('inventory');
      }
    };

    for (const cardBtn of this._container.querySelectorAll('[data-inspect-type]')) {
      cardBtn.addEventListener('click', () => inspectResult(cardBtn));
      if (cardBtn.getAttribute('role') === 'button') {
        cardBtn.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inspectResult(cardBtn);
          }
        });
      }
    }
  }

  _renderOverlay({ banner, isTactical, pity, results, dataRegistry }) {
    if (!this._overlayMode) return '';

    if (this._overlayMode === 'history') {
      return `
        <div class="summon-overlay" role="dialog" aria-modal="true" aria-label="Pulling History">
          <div class="modal-dialog summon-overlay__dialog summon-overlay__dialog--history">
            <div class="summon-overlay__head">
              <div>
                <div class="section-kicker section-kicker--gold">Recruitment Log</div>
                <h2 class="modal-dialog__title">Pulling History</h2>
                <div class="meta-line tabular-nums" style="margin-top: 4px;">
                  <span>Total Pulls ${pity.totalPulls}</span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span>SSR Pity ${pity.ssrPity} / ${pity.ssrHardPity}</span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span>Showing ${pity.history.length} recent</span>
                </div>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" data-close-overlay>Close</button>
            </div>

            <div class="hairline"></div>

            <div class="scroll-pane summon-overlay__body">
              ${
                pity.history.length === 0
                  ? '<p class="summon-empty-note">No recruitment records yet. Perform a 1x or 10x pull to record results here.</p>'
                  : `
                    <div class="kv-list">
                      ${pity.history
                        .map((item) => {
                          const label =
                            item.itemType === 'card'
                              ? dataRegistry.cardsById.get(item.cardId)?.name || item.cardId
                              : dataRegistry.heroesById.get(item.heroId)?.name || item.heroId;
                          const bannerName =
                            dataRegistry.bannersById?.get(item.bannerId)?.name || item.bannerId || '';
                          return `
                            <div class="kv-row summon-history-row">
                              <span class="kv-label">
                                <span class="rarity-${item.rarity.toLowerCase()}">${item.rarity}</span>
                                · <strong>${label}</strong>
                                ${bannerName ? `<span class="summon-history-row__banner">(${bannerName})</span>` : ''}
                              </span>
                              <span class="kv-value" style="font-size: 0.78rem; color: ${item.isNew ? 'var(--accent-blue-bright)' : 'var(--text-muted)'};">
                                ${item.isNew ? 'New' : 'Copy'}
                              </span>
                            </div>
                          `;
                        })
                        .join('')}
                    </div>
                  `
              }
            </div>

            <div class="btn-row modal-dialog__actions">
              <button type="button" class="btn btn-primary btn-sm" data-close-overlay>Done</button>
            </div>
          </div>
        </div>
      `;
    }

    // Results overlay
    const featuredDrop =
      results.find((r) => r.rarity === 'SSR') || results.find((r) => r.rarity === 'SR') || null;
    const featuredDropName = featuredDrop
      ? featuredDrop.itemType === 'card'
        ? featuredDrop.card?.name || featuredDrop.cardId
        : featuredDrop.hero?.name || featuredDrop.heroId
      : null;

    return `
      <div class="summon-overlay" role="dialog" aria-modal="true" aria-label="Summon Results">
        <div class="modal-dialog summon-overlay__dialog summon-overlay__dialog--results">
          <div class="summon-overlay__head">
            <div>
              <div class="section-kicker section-kicker--gold">${banner?.name || 'Recruitment'}</div>
              <h2 class="modal-dialog__title">
                ${isTactical ? 'Requisition Results' : 'Recruitment Results'} (${results.length})
              </h2>
            </div>
            <button type="button" class="btn btn-ghost btn-sm" data-close-overlay>Close</button>
          </div>

          <div class="hairline"></div>

          <div class="scroll-pane summon-overlay__body">
            ${
              featuredDrop
                ? `
                  <div class="summon-highlight-banner is-${featuredDrop.rarity.toLowerCase()}">
                    <span class="rarity-${featuredDrop.rarity.toLowerCase()}">${featuredDrop.rarity} Highlight</span>
                    <strong>${featuredDropName}</strong>
                    <span class="meta-line" style="font-size: 0.72rem;">Click any pull to inspect or equip</span>
                  </div>
                `
                : ''
            }
            <div class="summon-results-grid summon-results-grid--modal">
              ${results
                .map((entry, idx) => {
                  if (entry.itemType === 'card') {
                    const unitDef = entry.unitUnlocked
                      ? dataRegistry.unitsById.get(entry.unitUnlocked)
                      : null;
                    const unitName = unitDef?.name || entry.unitUnlocked || null;
                    const artId = unitDef?.spriteAssetId || entry.card?.iconAssetId || '';
                    const detail = entry.isNew
                      ? unitName
                        ? `New + Unit (${unitName})`
                        : 'New Tactical Card'
                      : entry.duplicateReward
                        ? `Copy (+${entry.duplicateReward.credits} Cr, +${entry.duplicateReward.xpChips} Chips)`
                        : 'Duplicate Card';
                    return `
                      <button
                        type="button"
                        class="summon-result-card is-${entry.rarity.toLowerCase()}"
                        style="--stagger-idx: ${idx};"
                        data-inspect-type="${entry.unitUnlocked ? 'unit' : 'card'}"
                        data-inspect-id="${entry.unitUnlocked || entry.cardId}"
                        title="Inspect ${entry.card?.name || entry.cardId}"
                      >
                        <div class="summon-result-card__head">
                          <span class="summon-result-card__thumb">
                            <img data-pull-art="${artId}" alt="${entry.card?.name || entry.cardId}" />
                          </span>
                          <div class="summon-result-card__meta">
                            <span class="rarity-${entry.rarity.toLowerCase()}" style="font-size: 0.72rem;">${entry.rarity} · Card</span>
                            <strong style="font-size: 0.86rem; color: var(--text-primary);">${entry.card?.name || entry.cardId}</strong>
                          </div>
                        </div>
                        <span style="font-size: 0.72rem; color: var(--text-secondary);">${detail}</span>
                      </button>
                    `;
                  }
                  const bonusText = entry.bonusCard
                    ? `Copy + ${entry.bonusCard.name}`
                    : entry.isNew
                      ? 'New Commander'
                      : 'Duplicate Copy';
                  const heroId = entry.hero?.id || entry.heroId;
                  const heroName = entry.hero?.name || entry.heroId;
                  if (isAstraHero(heroId)) {
                    return `
                      <div
                        role="button"
                        tabindex="0"
                        class="summon-result-card is-${entry.rarity.toLowerCase()} summon-result-card--astra"
                        style="--stagger-idx: ${idx};"
                        data-inspect-type="hero"
                        data-inspect-id="${heroId}"
                        title="Inspect ${heroName}"
                      >
                        <div class="summon-result-card__astra-slot" data-astra-result-slot="${idx}"></div>
                        <div class="summon-result-card__meta summon-result-card__meta--astra">
                          <span class="rarity-${entry.rarity.toLowerCase()}" style="font-size: 0.72rem;">${entry.rarity} · Commander</span>
                          <strong style="font-size: 0.88rem; color: var(--text-primary);">${heroName}</strong>
                          <span style="font-size: 0.72rem; color: var(--text-secondary);">${bonusText}</span>
                        </div>
                      </div>
                    `;
                  }
                  const artId = entry.hero?.portraitAssetId || '';
                  return `
                    <button
                      type="button"
                      class="summon-result-card is-${entry.rarity.toLowerCase()}"
                      style="--stagger-idx: ${idx};"
                      data-inspect-type="hero"
                      data-inspect-id="${heroId}"
                      title="Inspect ${heroName}"
                    >
                      <div class="summon-result-card__head">
                        <span class="summon-result-card__thumb summon-result-card__thumb--portrait">
                          <img data-pull-art="${artId}" alt="${heroName}" />
                        </span>
                        <div class="summon-result-card__meta">
                          <span class="rarity-${entry.rarity.toLowerCase()}" style="font-size: 0.72rem;">${entry.rarity} · Commander</span>
                          <strong style="font-size: 0.86rem; color: var(--text-primary);">${heroName}</strong>
                        </div>
                      </div>
                      <span style="font-size: 0.72rem; color: var(--text-secondary);">${bonusText}</span>
                    </button>
                  `;
                })
                .join('')}
            </div>
          </div>

          <div class="btn-row modal-dialog__actions">
            <button type="button" class="btn btn-secondary btn-sm" data-open-history>Pulling History</button>
            <button type="button" class="btn btn-primary btn-sm" data-close-overlay>Confirm</button>
          </div>
        </div>
      </div>
    `;
  }
}
