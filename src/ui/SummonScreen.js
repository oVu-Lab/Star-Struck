/**
 * SummonScreen (P4 Structural Redesign) — Full-Viewport Recruitment Showcase
 * placing the featured anime banner artwork and summon controls alongside a
 * live holographic Pull Results & History side dock with zero vertical scroll.
 */

import { formatNumber } from '../utils/MathUtils.js';

export class SummonScreen {
  constructor(ctx) {
    this._ctx = ctx;
    this._unsubs = [];
  }

  mount(container) {
    this._container = container;
    this.render();
    this._unsubs.push(
      this._ctx.eventBus.on('state:changed', () => this.render()),
    );
  }

  unmount() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._container = null;
  }

  render() {
    if (!this._container) return;
    const { gachaSystem, economySystem, gameState, dataRegistry, assetManager, audioManager } =
      this._ctx;
    const banners = gachaSystem.getBanners();
    const banner = gachaSystem.getActiveBanner();
    const isTactical = banner?.bannerType === 'tactical';
    const pity = gachaSystem.getPityStatus();
    const astrite = economySystem.getBalance('astrite');
    const results = gameState.ui.lastSummonResults || [];
    const sideTab =
      gameState.ui.summonSideTab || (results.length > 0 ? 'results' : 'history');

    const pityPct = Math.min(100, Math.round((pity.ssrPity / Math.max(1, pity.ssrHardPity)) * 100));

    this._container.innerHTML = `
      <section class="screen-frame" aria-label="Recruitment and Requisition">
        <div class="screen-bar">
          <div class="screen-bar__lead">
            <h1 class="screen-title">Recruitment Hub</h1>
            ${
              banners.length > 1
                ? `
                  <div class="segmented-bar" role="tablist" aria-label="Select Recruitment Banner">
                    ${banners
                      .map(
                        (b) => `
                          <button
                            type="button"
                            role="tab"
                            aria-selected="${b.id === banner?.id}"
                            class="segmented-btn ${b.id === banner?.id ? 'is-active' : ''}"
                            data-banner-id="${b.id}"
                          >
                            ${b.name} (${b.bannerType === 'tactical' ? 'Units & Cards' : 'Commanders'})
                          </button>
                        `,
                      )
                      .join('')}
                  </div>
                `
                : ''
            }
          </div>

          <div class="meta-line tabular-nums">
            <span style="color: var(--accent-gold-bright); font-weight: 700;">${formatNumber(astrite)} Astrite</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span>SSR Pity ${pity.ssrPity} / ${pity.ssrHardPity}</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span>Total ${pity.totalPulls}</span>
          </div>
        </div>

        <div class="summon-workspace">
          <div class="summon-banner-hero">
            <div class="summon-artwork">
              <img id="banner-featured-img" alt="${banner?.name || 'Featured Banner'}" />
              <div class="summon-artwork__scrim">
                <span class="rarity-ssr">${isTactical ? 'Tactical Requisition' : 'Featured SSR Banner'}</span>
                <strong style="font-size: 1.12rem; font-family: var(--font-display); color: var(--celestial-ivory);">
                  ${banner?.name || 'Starlight Sovereign'}
                </strong>
              </div>
            </div>

            <div class="summon-controls-col">
              <div>
                <div class="section-kicker section-kicker--gold">
                  ${isTactical ? 'Armory Supply Drop' : 'Starlight Resonance'}
                </div>
                <h2 style="font-size: 1.55rem; margin-top: 4px; color: var(--celestial-ivory);">
                  ${banner?.name || 'Starlight Sovereign'}
                </h2>
                <p style="margin-top: 6px; font-size: 0.88rem; color: var(--text-secondary);">
                  ${
                    banner?.subtitle ||
                    (isTactical
                      ? 'Requisition Unit, Skill, Tactic, and Support cards. Duplicates convert into Credits and XP Chips.'
                      : 'Recruit off-field Commanders with army-wide passives and orbital ultimates.')
                  }
                </p>
              </div>

              <div class="kv-list">
                <div class="kv-row">
                  <span class="kv-label">Drop Rates</span>
                  <span class="kv-value tabular-nums">
                    <span class="rarity-ssr">SSR ${Math.round((banner?.rates?.SSR || 0.03) * 100)}%</span> ·
                    <span class="rarity-sr">SR ${Math.round((banner?.rates?.SR || 0.17) * 100)}%</span> ·
                    <span class="rarity-r">R ${Math.round((banner?.rates?.R || 0.8) * 100)}%</span>
                  </span>
                </div>
                <div class="kv-row">
                  <span class="kv-label">Ten-Pull Guarantee</span>
                  <span class="kv-value">At least 1 SR or SSR</span>
                </div>
                <div class="kv-row">
                  <span class="kv-label">Shared SSR Hard Pity</span>
                  <span class="kv-value tabular-nums" style="color: var(--accent-gold-bright);">${pity.ssrPity} / ${pity.ssrHardPity}</span>
                </div>
              </div>

              <div>
                <div class="setting-control__top" style="font-size: 0.76rem; margin-bottom: 5px;">
                  <span style="color: var(--text-muted);">Pity Resonance Progress</span>
                  <span class="tabular-nums" style="color: var(--accent-gold-bright);">${pityPct}%</span>
                </div>
                <div class="progress-track" aria-label="SSR Pity Progress">
                  <div class="progress-fill progress-fill--gold" style="width: ${pityPct}%;"></div>
                </div>
              </div>

              <div class="btn-row">
                <button
                  type="button"
                  id="btn-pull-single"
                  class="btn btn-secondary"
                  style="flex: 1;"
                  ${astrite < (banner?.singleCost ?? 160) ? 'disabled' : ''}
                >
                  ${isTactical ? 'Requisition' : 'Recruit'} ×1 (${banner?.singleCost ?? 160})
                </button>
                <button
                  type="button"
                  id="btn-pull-ten"
                  class="btn btn-gold"
                  style="flex: 1.25;"
                  ${astrite < (banner?.tenCost ?? 1600) ? 'disabled' : ''}
                >
                  ${isTactical ? 'Requisition' : 'Recruit'} ×10 (${banner?.tenCost ?? 1600})
                </button>
              </div>
            </div>
          </div>

          <aside class="surface workspace-pane" aria-label="Pull Results and History">
            <div class="workspace-pane__head">
              <div class="segmented-bar" role="tablist" aria-label="Summon output view">
                <button
                  type="button"
                  role="tab"
                  aria-selected="${sideTab === 'results'}"
                  class="segmented-btn ${sideTab === 'results' ? 'is-active' : ''}"
                  data-summon-side="results"
                >
                  Latest Pull (${results.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected="${sideTab === 'history'}"
                  class="segmented-btn ${sideTab === 'history' ? 'is-active' : ''}"
                  data-summon-side="history"
                >
                  History (${pity.history.length})
                </button>
              </div>
            </div>

            <div class="scroll-pane" style="flex: 1;">
              ${
                sideTab === 'results'
                  ? results.length === 0
                    ? `
                      <div style="padding: 24px 8px; color: var(--text-muted); font-size: 0.88rem;">
                        Perform a ×1 or ×10 ${isTactical ? 'requisition' : 'recruitment'} to reveal obtained Commanders, Units, and Tactical Cards here.
                      </div>
                    `
                    : `
                      <div class="summon-results-grid">
                        ${results
                          .map((entry, idx) => {
                            if (entry.itemType === 'card') {
                              const unitName = entry.unitUnlocked
                                ? dataRegistry.unitsById.get(entry.unitUnlocked)?.name || entry.unitUnlocked
                                : null;
                              const detail = entry.isNew
                                ? unitName
                                  ? `New + Unit (${unitName})`
                                  : 'New Tactical Card'
                                : entry.duplicateReward
                                  ? `Copy (+${entry.duplicateReward.credits} Cr, +${entry.duplicateReward.xpChips} Chips)`
                                  : 'Duplicate Card';
                              return `
                                <div class="summon-result-card is-${entry.rarity.toLowerCase()}" style="--stagger-idx: ${idx};">
                                  <span class="rarity-${entry.rarity.toLowerCase()}" style="font-size: 0.74rem;">${entry.rarity} · Card</span>
                                  <strong style="font-size: 0.88rem; color: var(--celestial-ivory);">${entry.card?.name || entry.cardId}</strong>
                                  <span style="font-size: 0.74rem; color: var(--text-secondary);">${detail}</span>
                                </div>
                              `;
                            }
                            const bonusText = entry.bonusCard
                              ? `Copy + ${entry.bonusCard.name}`
                              : entry.isNew
                                ? 'New Commander'
                                : 'Duplicate Copy';
                            return `
                              <div class="summon-result-card is-${entry.rarity.toLowerCase()}" style="--stagger-idx: ${idx};">
                                <span class="rarity-${entry.rarity.toLowerCase()}" style="font-size: 0.74rem;">${entry.rarity} · Commander</span>
                                <strong style="font-size: 0.88rem; color: var(--celestial-ivory);">${entry.hero?.name || entry.heroId}</strong>
                                <span style="font-size: 0.74rem; color: var(--text-secondary);">${bonusText}</span>
                              </div>
                            `;
                          })
                          .join('')}
                      </div>
                    `
                  : pity.history.length === 0
                    ? '<p style="color: var(--text-muted); font-size: 0.88rem; padding: 16px 4px;">No recruitment records yet.</p>'
                    : `
                      <div class="kv-list">
                        ${pity.history
                          .slice(0, 20)
                          .map((item) => {
                            const label =
                              item.itemType === 'card'
                                ? dataRegistry.cardsById.get(item.cardId)?.name || item.cardId
                                : dataRegistry.heroesById.get(item.heroId)?.name || item.heroId;
                            return `
                              <div class="kv-row">
                                <span class="kv-label">
                                  <span class="rarity-${item.rarity.toLowerCase()}">${item.rarity}</span>
                                  · ${label}
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
          </aside>
        </div>
      </section>
    `;

    const imgEl = this._container.querySelector('#banner-featured-img');
    if (imgEl && banner) {
      assetManager.bindImageElement(imgEl, banner.featuredAssetId);
    }

    for (const tab of this._container.querySelectorAll('[data-banner-id]')) {
      tab.addEventListener('click', () => {
        audioManager.playClick();
        gachaSystem.setActiveBanner(tab.getAttribute('data-banner-id'));
        this.render();
      });
    }

    for (const tab of this._container.querySelectorAll('[data-summon-side]')) {
      tab.addEventListener('click', () => {
        audioManager.playClick();
        gameState.setUI({ summonSideTab: tab.getAttribute('data-summon-side') });
        this.render();
      });
    }

    const executePull = (count) => {
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
      const noun = isTactical ? 'Tactical Card' : 'Commander';
      this._ctx.notify(
        `Obtained ${count} ${noun}${count > 1 ? 's' : ''}!`,
        bestRarity === 'SSR' ? 'success' : 'info',
      );
      this.render();
    };

    this._container.querySelector('#btn-pull-single')?.addEventListener('click', () => executePull(1));
    this._container.querySelector('#btn-pull-ten')?.addEventListener('click', () => executePull(10));
  }
}
