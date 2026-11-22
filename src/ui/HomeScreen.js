/**
 * HomeScreen — Star Struck Command Bridge.
 * LEFT: Strictly four near-square, clearly separated feature cards in a 2×2 grid
 *       (Missions, Summon, Formation, Commanders) occupying the majority of the screen.
 * RIGHT: Compact Commander status bar + Active Commander anime showcase (~1/3 width).
 * Main Story / stage selection lives exclusively inside Missions -> Main Mission.
 */

import { formatNumber } from '../utils/MathUtils.js';

export class HomeScreen {
  constructor(ctx) {
    this._ctx = ctx;
    this._container = null;
    this._unsubs = [];
    this._hasRendered = false;
  }

  mount(container) {
    this._container = container;
    this._hasRendered = false;
    this._ctx.missionSystem?.ensureResets?.();
    this.render();
    this._unsubs.push(
      this._ctx.eventBus.on('state:changed', () => this.render()),
      this._ctx.eventBus.on('missions:updated', () => this.render()),
      this._ctx.eventBus.on('missions:claimed', () => this.render()),
    );
  }

  unmount() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._hasRendered = false;
    this._container = null;
  }

  render() {
    if (!this._container) return;
    const {
      gameState,
      heroSystem,
      formationSystem,
      cardSystem,
      progressionSystem,
      missionSystem,
      dataRegistry,
      assetManager,
      screenManager,
      audioManager,
    } = this._ctx;

    const player = gameState.player;
    const resources = gameState.resources;
    const commander = heroSystem.getActiveCommander();
    const stage = progressionSystem.getCurrentProgressionStage() || progressionSystem.getSelectedStage();
    const stages = progressionSystem.getStages();
    const clearedCount = stages.filter((s) => s.cleared).length;
    const currentChapter = stage?.chapter || 1;
    const chapterMeta = dataRegistry.chaptersByNumber?.get(currentChapter) || null;
    const terrainDef = stage?.terrainId ? dataRegistry.terrainsById?.get(stage.terrainId) : null;
    const realmDisplay =
      terrainDef?.realmTitle || terrainDef?.name || chapterMeta?.realm || 'Celestial Citadel';

    const ownedHeroes = heroSystem.getOwnedHeroes().length;
    const totalHeroes = heroSystem.getAllHeroes().length;
    const unlockedUnits = formationSystem.getUnlockedUnits().length;
    const totalUnits = dataRegistry.units.length;
    const unlockedCards = cardSystem.getUnlockedCardIds().length;
    const totalCards = dataRegistry.cards.length;
    const deckCount = (gameState.formation?.deck || []).length;
    const claimableMissions = missionSystem?.getClaimableCount?.() || 0;

    const leadUnitId = gameState.formation?.unitSlots?.[0] || 'heavy_shield_guard';
    const leadUnit = dataRegistry.unitsById?.get(leadUnitId);
    const formationAssetId = leadUnit?.spriteAssetId || 'unit_heavy_shield_guard';

    const xpPct = Math.min(100, Math.round((player.xp / Math.max(1, player.xpToNext)) * 100));
    const themeClass = commander?.id ? `theme-${commander.id}` : 'theme-astra';
    const rarityLower = (commander?.rarity || 'SSR').toLowerCase();
    const commanderBanner =
      (dataRegistry.banners || []).find((b) => b.bannerType !== 'tactical') || dataRegistry.banners?.[0];
    const commanderHardPity = commanderBanner?.pityConfig?.ssrHardPity ?? 30;

    const settledClass = this._hasRendered ? ' is-settled' : '';

    this._container.innerHTML = `
      <section class="screen-frame${settledClass}" aria-label="Command Home">
        <div class="home-bridge">
          <nav class="home-nav-stack" aria-label="Primary Feature Navigation">
            <button type="button" class="home-nav-card home-nav-card--missions" data-nav="missions">
              <span class="home-nav-card__head">
                <span class="home-nav-card__kicker">Directives &amp; Campaign</span>
                ${
                  claimableMissions > 0
                    ? `<span class="home-nav-card__stat is-alert tabular-nums">${claimableMissions} Ready</span>`
                    : `<span class="home-nav-card__stat tabular-nums">${clearedCount}/${stages.length}</span>`
                }
              </span>
              <span class="home-nav-card__art">
                <img id="home-nav-art-missions" alt="" aria-hidden="true" />
              </span>
              <span class="home-nav-card__footer">
                <span class="home-nav-card__body">
                  <span class="home-nav-card__title">Missions</span>
                  <span class="home-nav-card__meta tabular-nums">
                    ${
                      claimableMissions > 0
                        ? `${claimableMissions} Claimable · Ch.${currentChapter} ${realmDisplay}`
                        : `Daily · Weekly · Seasonal · Ch.${currentChapter}`
                    }
                  </span>
                </span>
                <span class="home-nav-card__arrow" aria-hidden="true">→</span>
              </span>
            </button>

            <button type="button" class="home-nav-card home-nav-card--gold" data-nav="summon">
              <span class="home-nav-card__head">
                <span class="home-nav-card__kicker">Astral Recruitment</span>
                <span class="home-nav-card__stat tabular-nums">Pity ${gameState.gacha.ssrPity}/${commanderHardPity}</span>
              </span>
              <span class="home-nav-card__art home-nav-card__art--gold">
                <img id="home-nav-art-summon" alt="" aria-hidden="true" />
              </span>
              <span class="home-nav-card__footer">
                <span class="home-nav-card__body">
                  <span class="home-nav-card__title">Summon</span>
                  <span class="home-nav-card__meta tabular-nums">
                    ${formatNumber(resources.astrite)} Astrite · Featured Banners
                  </span>
                </span>
                <span class="home-nav-card__arrow" aria-hidden="true">→</span>
              </span>
            </button>

            <button type="button" class="home-nav-card" data-nav="formation">
              <span class="home-nav-card__head">
                <span class="home-nav-card__kicker">Squad &amp; Tactical Deck</span>
                <span class="home-nav-card__stat tabular-nums">${unlockedUnits}/${totalUnits} Units</span>
              </span>
              <span class="home-nav-card__art">
                <img id="home-nav-art-formation" alt="" aria-hidden="true" />
              </span>
              <span class="home-nav-card__footer">
                <span class="home-nav-card__body">
                  <span class="home-nav-card__title">Formation</span>
                  <span class="home-nav-card__meta tabular-nums">
                    4-Unit Lineup · ${deckCount}-Card Battle Deck
                  </span>
                </span>
                <span class="home-nav-card__arrow" aria-hidden="true">→</span>
              </span>
            </button>

            <button type="button" class="home-nav-card" data-nav="heroes">
              <span class="home-nav-card__head">
                <span class="home-nav-card__kicker">Passives &amp; Ultimates</span>
                <span class="home-nav-card__stat tabular-nums">${ownedHeroes}/${totalHeroes}</span>
              </span>
              <span class="home-nav-card__art home-nav-card__art--portrait">
                <img id="home-nav-art-commanders" alt="" aria-hidden="true" />
              </span>
              <span class="home-nav-card__footer">
                <span class="home-nav-card__body">
                  <span class="home-nav-card__title">Commanders</span>
                  <span class="home-nav-card__meta tabular-nums">
                    Active: ${commander?.name || 'Astra Valen'} · Lv.${commander?.level || 1}
                  </span>
                </span>
                <span class="home-nav-card__arrow" aria-hidden="true">→</span>
              </span>
            </button>
          </nav>

          <div class="home-right">
            <div class="home-rank-strip" aria-label="Commander Progression Summary">
              <div class="home-rank-strip__top">
                <div class="meta-line">
                  <strong style="color: var(--text-primary); font-family: var(--font-display);">Commander Lv.${player.level}</strong>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span class="tabular-nums">XP ${player.xp}/${player.xpToNext}</span>
                </div>
                <span class="meta-line tabular-nums">Stamina ${resources.stamina}/${resources.maxStamina}</span>
              </div>

              <div class="home-rank-strip__bottom">
                <div class="progress-track home-rank-strip__bar" aria-label="Commander XP progress">
                  <div class="progress-fill" style="width: ${xpPct}%;"></div>
                </div>
                <div class="home-rank-strip__actions">
                  <button type="button" class="btn btn-secondary btn-xs" data-nav="inventory">
                    Inventory (${unlockedCards}/${totalCards})
                  </button>
                  ${
                    clearedCount === 0
                      ? '<button type="button" class="btn btn-ghost btn-xs" data-action="open-guide">Guide</button>'
                      : ''
                  }
                </div>
              </div>
            </div>

            <aside class="home-commander-stage ${themeClass}" aria-label="Active Commander Showcase">
              <img id="home-commander-img" class="home-commander-stage__art" alt="${commander?.name || 'Commander'}" />

              <div class="home-commander-stage__top">
                <div class="section-kicker section-kicker--gold">
                  ${commander?.realm || 'Active Commander'}
                </div>
                <button type="button" class="btn btn-ghost btn-sm" data-nav="heroes">
                  Switch
                </button>
              </div>

              <div class="home-commander-stage__scrim">
                <div class="meta-line">
                  <span class="rarity-${rarityLower}">${commander?.rarity || 'SSR'}</span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span class="tabular-nums">Lv.${commander?.level || 1}</span>
                  <span class="meta-sep" aria-hidden="true">·</span>
                  <span>${commander?.role || 'Vanguard Commander'}</span>
                </div>
                <h2 class="home-commander-stage__name">${commander?.name || 'Astra Valen'}</h2>
                <div class="meta-line" style="color: var(--hero-accent-light);">${commander?.title || 'Starlight Tactician'}</div>

                <div class="home-commander-stage__skills">
                  <div class="home-skill-mini">
                    <span class="home-skill-mini__kicker">Army Passive</span>
                    <span class="home-skill-mini__name">${commander?.passiveSkill?.name || '—'}</span>
                    <span class="home-skill-mini__desc">${commander?.passiveSkill?.description || ''}</span>
                  </div>
                  <div class="home-skill-mini">
                    <span class="home-skill-mini__kicker">Commander Ultimate</span>
                    <span class="home-skill-mini__name" style="color: var(--hero-accent-light);">${commander?.ultimateSkill?.name || '—'}</span>
                    <span class="home-skill-mini__desc">${commander?.ultimateSkill?.description || ''}</span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    `;

    // Bind visual assets centrally via AssetManager
    if (assetManager?.bindImageElement) {
      const missionsArt = this._container.querySelector('#home-nav-art-missions');
      const summonArt = this._container.querySelector('#home-nav-art-summon');
      const formationArt = this._container.querySelector('#home-nav-art-formation');
      const commandersArt = this._container.querySelector('#home-nav-art-commanders');
      const showcaseArt = this._container.querySelector('#home-commander-img');

      // Keep the left Commanders nav button on its default SVG portrait while restoring
      // Astra's standalone character PNG illustration on the right-side Commander Preview
      const navCommanderAssetId =
        commander?.id === 'astra' || commander?.portraitAssetId === 'hero_portrait_astra'
          ? 'hero_portrait_astra_home'
          : commander?.portraitAssetId;
      const showcaseCommanderAssetId = commander?.portraitAssetId || 'hero_portrait_astra';

      if (missionsArt) assetManager.bindImageElement(missionsArt, 'ui_emblem');
      if (summonArt) assetManager.bindImageElement(summonArt, 'effect_astral_burst');
      if (formationArt) assetManager.bindImageElement(formationArt, formationAssetId);
      if (commandersArt && navCommanderAssetId) {
        assetManager.bindImageElement(commandersArt, navCommanderAssetId);
      }
      if (showcaseArt && showcaseCommanderAssetId) {
        assetManager.bindImageElement(showcaseArt, showcaseCommanderAssetId);
      }
    }

    this._container.querySelector('[data-action="open-guide"]')?.addEventListener('click', () => {
      audioManager?.playClick?.();
      this._ctx.openGuide?.();
    });

    for (const el of this._container.querySelectorAll('[data-nav]')) {
      el.addEventListener('click', () => {
        audioManager?.playClick?.();
        const target = el.getAttribute('data-nav');
        if (target) {
          screenManager.navigate(target);
        }
      });
    }

    this._hasRendered = true;
  }
}
