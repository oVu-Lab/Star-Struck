/**
 * HomeScreen (P4 Structural Redesign) — Full-Viewport Orbital Command Bridge
 * pairing a focused Next Operation launch hub and 2x2 quick-access grid with a
 * tall full-height Active Commander anime showcase.
 */

import { formatNumber } from '../utils/MathUtils.js';

export class HomeScreen {
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
    const {
      gameState,
      heroSystem,
      formationSystem,
      cardSystem,
      progressionSystem,
      dataRegistry,
      assetManager,
      screenManager,
      audioManager,
    } = this._ctx;

    const player = gameState.player;
    const resources = gameState.resources;
    const commander = heroSystem.getActiveCommander();
    const stage = progressionSystem.getSelectedStage();
    const stages = progressionSystem.getStages();
    const clearedCount = stages.filter((s) => s.cleared).length;
    const terrainDef = stage?.terrainId ? dataRegistry.terrainsById?.get(stage.terrainId) : null;
    const realmDisplay = terrainDef?.realmTitle || terrainDef?.name || 'Celestial Citadel';
    const ownedHeroes = heroSystem.getOwnedHeroes().length;
    const totalHeroes = heroSystem.getAllHeroes().length;
    const unlockedUnits = formationSystem.getUnlockedUnits().length;
    const totalUnits = dataRegistry.units.length;
    const unlockedCards = cardSystem.getUnlockedCardIds().length;
    const totalCards = dataRegistry.cards.length;
    const xpPct = Math.min(100, Math.round((player.xp / Math.max(1, player.xpToNext)) * 100));
    const themeClass = commander?.id ? `theme-${commander.id}` : 'theme-astra';
    const rarityLower = (commander?.rarity || 'SSR').toLowerCase();

    this._container.innerHTML = `
      <section class="screen-frame" aria-label="Command Home">
        <div class="home-bridge">
          <div class="home-left">
            <div class="home-rank-strip">
              <div class="meta-line">
                <strong style="color: var(--celestial-ivory); font-family: var(--font-display);">Commander Lv.${player.level}</strong>
                <span class="meta-sep" aria-hidden="true">·</span>
                <span class="tabular-nums">XP ${player.xp} / ${player.xpToNext}</span>
              </div>
              <div class="home-rank-strip__xp">
                <div class="progress-track" aria-label="Commander XP progress">
                  <div class="progress-fill" style="width: ${xpPct}%;"></div>
                </div>
                <span class="meta-line tabular-nums" style="white-space: nowrap;">
                  Stamina ${resources.stamina}/${resources.maxStamina}
                </span>
              </div>
            </div>

            <div class="home-operation-hero">
              <div>
                <div class="section-kicker">Next Campaign Battle · ${realmDisplay}</div>
                <h1 class="home-hero__title">Stage ${stage?.code || '1-1'} · ${stage?.name || 'Outer Bastion'}</h1>
                <p class="home-hero__desc">
                  ${
                    stage?.description ||
                    'Lead multi-realm squads across enchanted battlefields, merge adjacent tactical cards up to Lv.III, and unleash Commander ultimates.'
                  }
                </p>
              </div>

              <div class="home-op-strip">
                <div class="home-metric">
                  <span class="home-metric__label">Encounter Profile</span>
                  <span class="home-metric__value">${stage?.difficulty || 'Standard'} · ${stage?.waves?.length || 3} Waves</span>
                  <span class="meta-line tabular-nums">Rec. Level ${stage?.recommendedLevel || 1}</span>
                </div>
                <div class="home-metric">
                  <span class="home-metric__label">Campaign Progress</span>
                  <span class="home-metric__value tabular-nums">${clearedCount} / ${stages.length} Cleared</span>
                  <span class="meta-line tabular-nums">${unlockedUnits}/${totalUnits} Units · ${unlockedCards}/${totalCards} Cards</span>
                </div>
                <div class="home-metric">
                  <span class="home-metric__label">Realm Treasury</span>
                  <span class="home-metric__value tabular-nums" style="color: var(--accent-gold-bright);">${formatNumber(resources.astrite)} Astrite</span>
                  <span class="meta-line tabular-nums">${formatNumber(resources.credits)} Credits</span>
                </div>
              </div>

              <div class="btn-row">
                <button type="button" class="btn btn-primary btn-lg" data-action="enter-battle">
                  Deploy to Stage ${stage?.code || '1-1'}
                </button>
                <button type="button" class="btn btn-secondary" data-action="open-formation">
                  Formation &amp; Deck
                </button>
                <button type="button" class="btn btn-ghost" data-action="open-stages">
                  Select Stage
                </button>
                ${
                  clearedCount === 0
                    ? '<button type="button" class="btn btn-ghost" data-action="open-guide">How to Play</button>'
                    : ''
                }
              </div>

              ${
                clearedCount === 0
                  ? `
                    <div class="home-onboarding-strip" aria-label="First Battle Quick Guide">
                      <span class="home-onboarding-strip__step"><strong>1.</strong> Place Squad in Ally Zone</span>
                      <span class="meta-sep" aria-hidden="true">→</span>
                      <span class="home-onboarding-strip__step"><strong>2.</strong> Merge Adjacent Identical Cards</span>
                      <span class="meta-sep" aria-hidden="true">→</span>
                      <span class="home-onboarding-strip__step"><strong>3.</strong> Unleash Commander Ultimate</span>
                    </div>
                  `
                  : ''
              }
            </div>

            <div class="home-quick-grid" aria-label="Quick Navigation">
              <button type="button" class="quick-tile" data-nav="heroes">
                <div>
                  <div class="quick-tile__title">Commanders</div>
                  <div class="quick-tile__meta">Passives &amp; Commander Ultimates</div>
                </div>
                <span class="quick-tile__stat tabular-nums">${ownedHeroes}/${totalHeroes}</span>
              </button>

              <button type="button" class="quick-tile" data-nav="formation">
                <div>
                  <div class="quick-tile__title">Formation &amp; Deck</div>
                  <div class="quick-tile__meta">Squad, Upgrades &amp; 12-Card Deck</div>
                </div>
                <span class="quick-tile__stat tabular-nums">${unlockedUnits}/${totalUnits}</span>
              </button>

              <button type="button" class="quick-tile quick-tile--gold" data-nav="summon">
                <div>
                  <div class="quick-tile__title">Recruitment Hub</div>
                  <div class="quick-tile__meta">Commander &amp; Armory Banners</div>
                </div>
                <span class="quick-tile__stat tabular-nums">${gameState.gacha.ssrPity}/80</span>
              </button>

              <button type="button" class="quick-tile" data-nav="inventory">
                <div>
                  <div class="quick-tile__title">Inventory &amp; Armory</div>
                  <div class="quick-tile__meta">Supplies &amp; Collectible Cards</div>
                </div>
                <span class="quick-tile__stat tabular-nums">${unlockedCards}/${totalCards}</span>
              </button>
            </div>
          </div>

          <aside class="home-commander-stage ${themeClass}" aria-label="Active Commander Showcase">
            <img id="home-commander-img" class="home-commander-stage__art" alt="${commander?.name || 'Commander'}" />

            <div class="home-commander-stage__top">
              <div class="section-kicker section-kicker--gold">${commander?.realm || 'Active Commander'}</div>
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
              <div class="meta-line" style="color: var(--hero-accent);">${commander?.title || 'Starlight Tactician'}</div>

              <div class="home-commander-stage__skills">
                <div class="home-skill-mini">
                  <span class="home-skill-mini__kicker">Army Passive</span>
                  <span class="home-skill-mini__name">${commander?.passiveSkill?.name || '—'}</span>
                  <span class="home-skill-mini__desc">${commander?.passiveSkill?.description || ''}</span>
                </div>
                <div class="home-skill-mini">
                  <span class="home-skill-mini__kicker">Commander Ultimate</span>
                  <span class="home-skill-mini__name" style="color: var(--hero-accent);">${commander?.ultimateSkill?.name || '—'}</span>
                  <span class="home-skill-mini__desc">${commander?.ultimateSkill?.description || ''}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    `;

    const imgEl = this._container.querySelector('#home-commander-img');
    if (imgEl && commander) {
      assetManager.bindImageElement(imgEl, commander.portraitAssetId);
    }

    this._container.querySelector('[data-action="enter-battle"]')?.addEventListener('click', () => {
      audioManager.playClick();
      screenManager.navigate('battle');
    });
    this._container.querySelector('[data-action="open-formation"]')?.addEventListener('click', () => {
      audioManager.playClick();
      gameState.setUI({ formationTab: 'squad' });
      screenManager.navigate('formation');
    });
    this._container.querySelector('[data-action="open-stages"]')?.addEventListener('click', () => {
      audioManager.playClick();
      gameState.setUI({ formationTab: 'stages' });
      screenManager.navigate('formation');
    });
    this._container.querySelector('[data-action="open-guide"]')?.addEventListener('click', () => {
      audioManager.playClick();
      this._ctx.openGuide?.();
    });

    for (const tile of this._container.querySelectorAll('[data-nav]')) {
      tile.addEventListener('click', () => {
        audioManager.playClick();
        screenManager.navigate(tile.getAttribute('data-nav'));
      });
    }
  }
}
