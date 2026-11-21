/**
 * HeroScreen (P4 Structural Redesign) — 3-Zone Anime Commander Gallery:
 * Compact Left Roster Rail · Center Full-Height Portrait Stage · Right Tactical Dossier.
 */

export class HeroScreen {
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

    this._container.innerHTML = `
      <section class="screen-frame" aria-label="Commander Heroes">
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
                <div class="hero-art-stage hero-art-stage--${selRarity} ${selTheme}" aria-label="Commander Portrait">
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

                <aside class="surface surface--celestial hero-dossier ${selTheme}" aria-label="Commander Dossier">
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

    const detailImg = this._container.querySelector('#hero-detail-img');
    if (detailImg && selectedHero) {
      assetManager.bindImageElement(detailImg, selectedHero.portraitAssetId);
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
  }
}
