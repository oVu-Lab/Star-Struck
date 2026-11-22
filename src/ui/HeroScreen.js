/**
 * HeroScreen (P4 Structural Redesign) — 3-Zone Anime Commander Gallery:
 * Compact Left Roster Rail · Center Full-Height Portrait Stage · Right Tactical Dossier.
 */

import {
  AstraCardRegistry,
  hasCollectibleCommanderCard,
} from './AstraCardMount.js';

export class HeroScreen {
  constructor(ctx) {
    this._ctx = ctx;
    this._unsubs = [];
    this._astraCards = new AstraCardRegistry({ CardClass: ctx?.AstraCardClass });
    this._previewCards = new AstraCardRegistry({
      maxInstances: 1,
      CardClass: ctx?.AstraCardClass,
    });
    this._previewModalEl = null;
    this._previewHeroId = null;
    this._previewKeyHandler = null;
    this._previewCloseTimer = null;
    this._hasRendered = false;
    this._lastHeroId = null;
    this._railScrollTop = 0;
  }

  mount(container) {
    this._container = container;
    this._hasRendered = false;
    this._lastHeroId = null;
    this._railScrollTop = 0;
    this.render();
    this._unsubs.push(
      this._ctx.eventBus.on('state:changed', () => this.render()),
    );
  }

  unmount() {
    this._closeCardPreview({ resumeStage: false, immediate: true });
    this._astraCards.destroyAll();
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._hasRendered = false;
    this._lastHeroId = null;
    this._railScrollTop = 0;
    this._container = null;
  }

  _openCardPreview(hero) {
    if (!hero || !hasCollectibleCommanderCard(hero) || !this._container) return;
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;

    this._closeCardPreview({ resumeStage: false, immediate: true });

    const { assetManager, audioManager, formationSystem } = this._ctx;
    audioManager?.playClick?.();

    this._previewHeroId = hero.id;
    this._astraCards.pauseAll();

    const modal = document.createElement('div');
    modal.id = 'commander-card-preview-modal';
    modal.className = `card-preview-modal theme-${hero.id}`;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', `${hero.name} Interactive Card Preview`);
    modal.setAttribute('data-preview-hero-id', hero.id);

    modal.innerHTML = `
      <div class="card-preview-modal__backdrop" data-close-card-preview></div>
      <div class="card-preview-modal__stage">
        <button
          type="button"
          id="btn-close-card-preview"
          class="card-preview-modal__close"
          data-close-card-preview
          aria-label="Close card preview"
        >
          Close [Esc]
        </button>
        <div
          id="commander-card-preview-slot"
          class="card-preview-modal__card-slot"
          data-commander-preview-slot="${hero.id}"
        ></div>
        <div class="card-preview-modal__hint">
          Move cursor over card to inspect 3D tilt &amp; holographic parallax
        </div>
      </div>
    `;

    this._container.appendChild(modal);
    this._previewModalEl = modal;

    const previewSlot = modal.querySelector('#commander-card-preview-slot');
    this._previewCards.mount(previewSlot, {
      hero,
      mode: 'preview',
      extraData: {
        activeCommander: hero.id === formationSystem?.getCommanderId?.(),
        previewMode: true,
      },
      selectable: false,
      selected: false,
      studio: false,
      assetManager,
      fallbackAssetId: hero.portraitAssetId,
    });

    for (const closeTarget of modal.querySelectorAll('[data-close-card-preview]')) {
      closeTarget.addEventListener('click', () => {
        audioManager?.playClick?.();
        this._closeCardPreview();
      });
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this._previewKeyHandler = (ev) => {
        if (ev.key === 'Escape') {
          ev.preventDefault?.();
          this._closeCardPreview();
        }
      };
      window.addEventListener('keydown', this._previewKeyHandler);
    }
  }

  _closeCardPreview({ resumeStage = true, immediate = false } = {}) {
    if (this._previewCloseTimer) {
      clearTimeout(this._previewCloseTimer);
      this._previewCloseTimer = null;
    }

    if (
      this._previewKeyHandler &&
      typeof window !== 'undefined' &&
      typeof window.removeEventListener === 'function'
    ) {
      window.removeEventListener('keydown', this._previewKeyHandler);
    }
    this._previewKeyHandler = null;

    const finishClose = (targetModal) => {
      this._previewCards.destroyAll();
      if (targetModal) {
        if (typeof targetModal.remove === 'function') {
          targetModal.remove();
        } else if (this._container?.children) {
          const idx = this._container.children.indexOf(targetModal);
          if (idx !== -1) this._container.children.splice(idx, 1);
        }
      }
      if (this._previewModalEl === targetModal) {
        this._previewModalEl = null;
      }
      this._previewHeroId = null;
      if (resumeStage) {
        this._astraCards.resumeAll({ restoreStatic: true });
      }
    };

    const modal = this._previewModalEl;
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canAnimate =
      !immediate &&
      Boolean(
        modal &&
          modal.isConnected &&
          typeof modal.getBoundingClientRect === 'function' &&
          modal.classList &&
          !reducedMotion,
      );

    if (canAnimate) {
      modal.classList.add('is-closing');
      this._previewCloseTimer = setTimeout(() => {
        this._previewCloseTimer = null;
        finishClose(modal);
      }, 155);
      return;
    }

    finishClose(modal);
  }

  render() {
    if (!this._container) return;
    const prevRail = this._container.querySelector('.hero-rail');
    if (prevRail && typeof prevRail.scrollTop === 'number') {
      this._railScrollTop = prevRail.scrollTop;
    }

    this._closeCardPreview({ resumeStage: false, immediate: true });
    this._astraCards.destroyAll();

    const { heroSystem, formationSystem, gameState, assetManager, audioManager, screenManager } =
      this._ctx;
    const allHeroes = heroSystem.getAllHeroes();
    const ownedCount = heroSystem.getOwnedHeroes().length;
    const filter = gameState.ui.heroFilter || 'ALL';
    const filtered =
      filter === 'ALL' ? allHeroes : allHeroes.filter((hero) => hero.rarity === filter);

    const selectedHero =
      filtered.find((h) => h.id === gameState.ui.selectedHeroId) ||
      filtered[0] ||
      heroSystem.getHeroById(gameState.ui.selectedHeroId) ||
      allHeroes[0];

    const activeCommanderId = formationSystem.getCommanderId();
    const selTheme = selectedHero?.id ? `theme-${selectedHero.id}` : 'theme-astra';
    const selRarity = (selectedHero?.rarity || 'SSR').toLowerCase();

    const hasCollectibleCard = hasCollectibleCommanderCard(selectedHero);
    const settledClass = this._hasRendered ? ' is-settled' : '';
    const heroChanged =
      this._hasRendered &&
      Boolean(selectedHero?.id && this._lastHeroId && selectedHero.id !== this._lastHeroId);
    const detailMotionClass = heroChanged ? ' motion-detail-enter' : '';

    this._container.innerHTML = `
      <section class="screen-frame${settledClass}" aria-label="Commander Heroes">
        <div class="screen-bar">
          <div class="screen-bar__lead">
            <h1 class="screen-title">Commanders</h1>
            <span class="meta-line tabular-nums">
              <span>${ownedCount} / ${allHeroes.length} Recruited</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>Off-field passive auras &amp; commander ultimates</span>
            </span>
          </div>

          <div class="segmented-bar" role="tablist" aria-label="Filter commanders by rarity">
            ${['ALL', 'SSR', 'SR', 'R']
              .map(
                (tier) => `
                  <button
                    type="button"
                    role="tab"
                    aria-selected="${filter === tier}"
                    class="segmented-btn ${filter === tier ? 'is-active' : ''}"
                    data-filter="${tier}"
                  >
                    ${tier === 'ALL' ? 'All' : tier}
                  </button>
                `,
              )
              .join('')}
          </div>
        </div>

        <div class="heroes-workspace">
          <div id="hero-collection-grid" class="hero-rail" aria-label="Commander Roster"></div>

          ${
            selectedHero
              ? `
                ${
                  hasCollectibleCard
                    ? `
                      <div
                        class="hero-art-stage hero-art-stage--collectible ${selTheme}${detailMotionClass}"
                        aria-label="${selectedHero.name} Collectible Commander Card"
                      >
                        <div
                          id="hero-collectible-card-slot"
                          class="hero-art-stage__collectible-slot"
                          data-astra-card-slot="hero-detail"
                          data-commander-card-id="${selectedHero.id}"
                          title="Click card to inspect interactive 3D preview"
                        ></div>
                      </div>
                    `
                    : `
                      <div class="hero-art-stage hero-art-stage--${selRarity} ${selTheme}${detailMotionClass}" aria-label="Commander Portrait">
                        <img id="hero-detail-img" alt="${selectedHero.name}" />
                        <div class="hero-art-stage__scrim">
                          <div class="meta-line">
                            <span class="rarity-${selRarity}">${selectedHero.rarity}</span>
                            <span class="meta-sep" aria-hidden="true">·</span>
                            <span style="color: var(--hero-accent-light); font-weight: 600;">${selectedHero.realm || selectedHero.faction}</span>
                          </div>
                          <strong style="font-size: 1.15rem; font-family: var(--font-display); color: var(--text-on-dark);">
                            ${selectedHero.title}
                          </strong>
                          ${
                            selectedHero.motif
                              ? `<span class="meta-line" style="font-size: 0.76rem;">${selectedHero.motif}</span>`
                              : ''
                          }
                        </div>
                      </div>
                    `
                }

                <aside class="surface surface--celestial hero-dossier ${selTheme}${detailMotionClass}" aria-label="Commander Dossier">
                  <div>
                    <div class="section-kicker section-kicker--gold">${selectedHero.role} · ${selectedHero.faction}</div>
                    <h2 class="hero-dossier__name" style="margin-top: 3px;">${selectedHero.name}</h2>
                    <div class="meta-line tabular-nums" style="margin-top: 6px;">
                      <span class="rarity-${selRarity}">${selectedHero.rarity}</span>
                      <span class="meta-sep" aria-hidden="true">·</span>
                      <span>${selectedHero.owned ? `Level ${selectedHero.level}` : 'Not Recruited'}</span>
                      ${
                        selectedHero.owned
                          ? `<span class="meta-sep" aria-hidden="true">·</span><span>Copies ×${selectedHero.copies}</span>`
                          : ''
                      }
                      ${
                        selectedHero.id === activeCommanderId
                          ? '<span class="meta-sep" aria-hidden="true">·</span><span style="color: var(--hero-accent); font-weight: 700;">Active Commander</span>'
                          : ''
                      }
                    </div>
                  </div>

                  <p class="hero-dossier__bio">${selectedHero.biography}</p>

                  ${
                    selectedHero.baseStats
                      ? `
                        <div class="hero-stats-row tabular-nums">
                          <div class="hero-stat-cell">
                            <span class="hero-stat-cell__label">Command Power</span>
                            <strong class="hero-stat-cell__val">${selectedHero.baseStats.commandPower ?? 100}</strong>
                          </div>
                          <div class="hero-stat-cell">
                            <span class="hero-stat-cell__label">Energy Regen</span>
                            <strong class="hero-stat-cell__val">×${Number(selectedHero.baseStats.energyRegenBonus ?? 1).toFixed(2)}</strong>
                          </div>
                        </div>
                      `
                      : ''
                  }

                  <div class="dossier-skill">
                    <div class="dossier-skill__head">
                      <span class="section-kicker">Army Passive</span>
                      <span class="meta-line">Always Active</span>
                    </div>
                    <div class="dossier-skill__name">${selectedHero.passiveSkill?.name || '—'}</div>
                    <p class="dossier-skill__desc">${selectedHero.passiveSkill?.description || ''}</p>
                  </div>

                  <div class="dossier-skill dossier-skill--ultimate">
                    <div class="dossier-skill__head">
                      <span class="section-kicker section-kicker--gold">Commander Ultimate</span>
                      <span class="meta-line tabular-nums">${selectedHero.ultimateSkill?.energyCost || 100} Ultimate Energy</span>
                    </div>
                    <div class="dossier-skill__name" style="color: var(--hero-accent);">${selectedHero.ultimateSkill?.name || '—'}</div>
                    <p class="dossier-skill__desc">${selectedHero.ultimateSkill?.description || ''}</p>
                  </div>

                  ${
                    selectedHero.synergyHint
                      ? `
                        <div class="hero-synergy-box">
                          <span class="section-kicker">Recommended Synergy</span>
                          <p class="dossier-skill__desc">${selectedHero.synergyHint}</p>
                        </div>
                      `
                      : ''
                  }

                  <div class="btn-row" style="margin-top: auto;">
                    ${
                      selectedHero.owned
                        ? selectedHero.id === activeCommanderId
                          ? `
                            <button
                              type="button"
                              id="btn-assign-commander"
                              class="btn btn-secondary"
                              style="flex: 1;"
                              disabled
                            >
                              Currently Active Commander
                            </button>
                            <button
                              type="button"
                              id="btn-hero-deploy"
                              class="btn btn-primary"
                            >
                              Deploy to Battle
                            </button>
                          `
                          : `
                            <button
                              type="button"
                              id="btn-assign-commander"
                              class="btn ${selectedHero.rarity === 'SSR' ? 'btn-gold' : 'btn-primary'}"
                              style="flex: 1;"
                            >
                              Assign as Active Commander
                            </button>
                          `
                        : `
                          <button
                            type="button"
                            id="btn-go-summon"
                            class="btn btn-gold"
                            style="flex: 1;"
                          >
                            Recruit in Summon Hub
                          </button>
                        `
                    }
                  </div>
                </aside>
              `
              : '<div class="surface" style="padding: 24px;">No commanders match this filter.</div>'
          }
        </div>
      </section>
    `;

    const rail = this._container.querySelector('#hero-collection-grid');
    for (const hero of filtered) {
      const item = document.createElement('button');
      item.type = 'button';
      const heroRarity = (hero.rarity || 'R').toLowerCase();
      item.className = [
        'hero-rail-item',
        `theme-${hero.id}`,
        selectedHero?.id === hero.id ? 'is-selected' : '',
        !hero.owned ? 'is-locked' : '',
      ]
        .filter(Boolean)
        .join(' ');
      item.innerHTML = `
        <div class="hero-rail-item__thumb">
          <img alt="${hero.name}" />
        </div>
        <div class="hero-rail-item__info">
          <div class="hero-rail-item__name">${hero.name}</div>
          <div class="meta-line tabular-nums">
            <span class="rarity-${heroRarity}">${hero.rarity}</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span>${hero.owned ? `Lv.${hero.level}` : 'Locked'}</span>
          </div>
          <div class="meta-line" style="font-size: 0.74rem;">
            ${
              hero.id === activeCommanderId
                ? '<span style="color: var(--hero-accent); font-weight: 700;">Active Commander</span>'
                : `<span>${hero.role}</span>`
            }
          </div>
        </div>
      `;

      const img = item.querySelector('img');
      assetManager.bindImageElement(img, hero.portraitAssetId);

      item.addEventListener('click', () => {
        audioManager.playClick();
        gameState.setUI({ selectedHeroId: hero.id });
        this.render();
      });

      rail.appendChild(item);
    }

    if (rail && typeof this._railScrollTop === 'number') {
      rail.scrollTop = this._railScrollTop;
    }

    if (hasCollectibleCard && selectedHero) {
      const cardSlot = this._container.querySelector('#hero-collectible-card-slot');
      const mountedCard = this._astraCards.mount(cardSlot, {
        hero: selectedHero,
        mode: 'static',
        extraData: {
          activeCommander: selectedHero.id === activeCommanderId,
        },
        selectable: true,
        selected: false,
        studio: false,
        onClick: () => this._openCardPreview(selectedHero),
        assetManager,
        fallbackAssetId: selectedHero.portraitAssetId,
      });
      if (!mountedCard && cardSlot) {
        cardSlot.setAttribute('role', 'button');
        cardSlot.setAttribute('tabindex', '0');
        cardSlot.addEventListener('click', () => this._openCardPreview(selectedHero));
      }
    } else {
      const detailImg = this._container.querySelector('#hero-detail-img');
      if (detailImg && selectedHero) {
        assetManager.bindImageElement(detailImg, selectedHero.portraitAssetId);
      }
    }

    for (const tab of this._container.querySelectorAll('[data-filter]')) {
      tab.addEventListener('click', () => {
        audioManager.playClick();
        gameState.setUI({ heroFilter: tab.getAttribute('data-filter') });
        this.render();
      });
    }

    this._container.querySelector('#btn-assign-commander')?.addEventListener('click', () => {
      if (!selectedHero) return;
      const res = formationSystem.setCommander(selectedHero.id);
      if (res.ok) {
        audioManager.playDeploy();
        this._ctx.notify(`${selectedHero.name} assigned as Active Commander.`, 'success');
      } else {
        audioManager.playInvalid();
        this._ctx.notify(res.reason, 'warn');
      }
    });

    this._container.querySelector('#btn-hero-deploy')?.addEventListener('click', () => {
      audioManager.playClick();
      screenManager.navigate('battle');
    });

    this._container.querySelector('#btn-go-summon')?.addEventListener('click', () => {
      audioManager.playClick();
      screenManager.navigate('summon');
    });

    this._lastHeroId = selectedHero?.id || null;
    this._hasRendered = true;
  }
}
