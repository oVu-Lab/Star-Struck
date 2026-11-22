/**
 * MissionsScreen — Unified Missions Center housing Daily, Weekly, Seasonal,
 * and Main Mission (chronological chapter timeline + stage selection).
 */

import { formatNumber } from '../utils/MathUtils.js';

const MISSION_CATEGORIES = [
  { id: 'daily', label: 'Daily', kicker: '00:00 UTC Reset' },
  { id: 'weekly', label: 'Weekly', kicker: 'Mon 00:00 UTC' },
  { id: 'seasonal', label: 'Seasonal', kicker: 'Limited Events' },
  { id: 'main', label: 'Main Mission', kicker: 'Campaign Stages' },
];

const VALID_CATEGORY_IDS = new Set(MISSION_CATEGORIES.map((c) => c.id));

const CHAPTER_STATUS_LABELS = {
  completed: 'Completed',
  current: 'Current',
  available: 'Available',
  locked: 'Locked',
};

/**
 * Explicit data-driven mapping from mission metric to an existing destination screen.
 * Unknown or unsupported metrics resolve to null rather than falling back to Home.
 */
export const MISSION_DESTINATION_MAP = {
  battles_played: { screenId: 'battle', label: 'Go to Battle' },
  battles_won: { screenId: 'battle', label: 'Go to Battle' },
  enemies_defeated: { screenId: 'battle', label: 'Go to Battle' },
  cards_merged: { screenId: 'battle', label: 'Go to Battle' },
  cards_played: { screenId: 'battle', label: 'Go to Battle' },
  ultimates_used: { screenId: 'battle', label: 'Go to Battle' },
  units_upgraded: { screenId: 'formation', label: 'Go to Formation', formationTab: 'squad' },
  summons_performed: { screenId: 'summon', label: 'Go to Summon' },
};

export function resolveMissionDestination(mission, ctx = {}) {
  const metric = mission?.metric;
  if (!metric || !Object.prototype.hasOwnProperty.call(MISSION_DESTINATION_MAP, metric)) {
    return null;
  }
  const mapping = MISSION_DESTINATION_MAP[metric];
  const screenManager = ctx?.screenManager;
  if (screenManager && typeof screenManager.has === 'function' && !screenManager.has(mapping.screenId)) {
    return null;
  }
  return {
    screenId: mapping.screenId,
    label: mapping.label,
    formationTab: mapping.formationTab || null,
    metric,
  };
}

function renderRewardIconSvg(kind) {
  switch (kind) {
    case 'astrite':
      return `<svg class="mission-reward-icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M10 1.5L12.7 7.3L18.5 10L12.7 12.7L10 18.5L7.3 12.7L1.5 10L7.3 7.3Z" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    case 'credits':
      return `<svg class="mission-reward-icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><polygon points="10,2 17,6 17,14 10,18 3,14 3,6" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="10" cy="10" r="3" fill="currentColor" fill-opacity="0.55"/></svg>`;
    case 'playerXp':
      return `<svg class="mission-reward-icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M4 13L10 7L16 13M4 8.5L10 2.5L16 8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 17H15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    case 'item_xp_chip':
      return `<svg class="mission-reward-icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><rect x="4.5" y="4.5" width="11" height="11" rx="1.5" fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-width="1.4"/><path d="M7.5 1.8V4.5M12.5 1.8V4.5M7.5 15.5V18.2M12.5 15.5V18.2M1.8 7.5H4.5M1.8 12.5H4.5M15.5 7.5H18.2M15.5 12.5H18.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
    case 'item_aegis_core':
      return `<svg class="mission-reward-icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M10 2L16.5 4.5V9.8C16.5 13.7 13.7 16.8 10 18C6.3 16.8 3.5 13.7 3.5 9.8V4.5L10 2Z" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="10" cy="9.5" r="2.2" fill="currentColor"/></svg>`;
    case 'item_stamina_cell':
      return `<svg class="mission-reward-icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M11.2 2L5.5 10.6H10L8.8 18L14.5 9.4H10L11.2 2Z" fill="currentColor" fill-opacity="0.24" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    default:
      return `<svg class="mission-reward-icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M10 2.5L16.5 6.2V13.8L10 17.5L3.5 13.8V6.2L10 2.5Z" fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M3.5 6.2L10 10L16.5 6.2M10 10V17.5" stroke="currentColor" stroke-width="1.2"/></svg>`;
  }
}

function buildRewardItems(rewards) {
  if (!rewards) return [];
  const items = [];
  if (rewards.astrite > 0) {
    items.push({
      kind: 'astrite',
      name: 'Astrite',
      qtyText: `+${formatNumber(rewards.astrite)}`,
      label: `+${formatNumber(rewards.astrite)} Astrite`,
      tone: 'gold',
    });
  }
  if (rewards.credits > 0) {
    items.push({
      kind: 'credits',
      name: 'Credits',
      qtyText: `+${formatNumber(rewards.credits)}`,
      label: `+${formatNumber(rewards.credits)} Credits`,
      tone: 'bronze',
    });
  }
  if (rewards.playerXp > 0) {
    items.push({
      kind: 'playerXp',
      name: 'Commander XP',
      qtyText: `+${formatNumber(rewards.playerXp)}`,
      label: `+${formatNumber(rewards.playerXp)} Commander XP`,
      tone: 'blue',
    });
  }
  if (Array.isArray(rewards.materials)) {
    for (const mat of rewards.materials) {
      if (mat && mat.quantity > 0) {
        const name = mat.name || mat.id;
        items.push({
          kind: mat.id || 'material',
          name,
          qtyText: `×${formatNumber(mat.quantity)}`,
          label: `${name} ×${mat.quantity}`,
          tone: 'slate',
        });
      }
    }
  }
  return items;
}

function formatRewardParts(rewards) {
  return buildRewardItems(rewards).map((item) => ({
    ...item,
    gold: item.tone === 'gold',
  }));
}

function renderRewardChips(rewards) {
  const items = buildRewardItems(rewards);
  if (items.length === 0) {
    return `<span class="meta-line">None</span>`;
  }
  return items
    .map(
      (item) => `
        <span class="mission-reward-item is-${item.tone} ${item.tone === 'gold' ? 'is-gold' : ''}" data-reward-kind="${item.kind}">
          <span class="mission-reward-item__icon">${renderRewardIconSvg(item.kind)}</span>
          <span class="mission-reward-item__name">${item.name}</span>
          <span class="mission-reward-item__qty tabular-nums">${item.qtyText}</span>
        </span>
      `,
    )
    .join('');
}

function formatIsoDateShort(iso) {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso || '';
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day} UTC`;
}

export class MissionsScreen {
  constructor(ctx) {
    this._ctx = ctx;
    this._container = null;
    this._unsubs = [];
    this._countdownTimer = null;
    this._shouldScrollTimeline = false;
    this._timelineScrollTop = 0;
    this._missionListScrollTop = 0;
    this._returnCategory = null;
    this._hasRendered = false;
    this._lastCategory = null;
    this._lastChapter = null;
    this._lastClaimedMissionId = null;
  }

  mount(container, params = {}) {
    this._container = container;
    this._hasRendered = false;
    this._lastCategory = null;
    this._lastChapter = null;
    this._lastClaimedMissionId = null;
    this._ctx.missionSystem?.ensureResets?.();

    let requested = 'daily';
    if (params && VALID_CATEGORY_IDS.has(params.category)) {
      requested = params.category;
      this._returnCategory = null;
    } else if (this._returnCategory && VALID_CATEGORY_IDS.has(this._returnCategory)) {
      requested = this._returnCategory;
      this._returnCategory = null;
    }

    if (requested === 'main') {
      this._syncToCurrentProgression({ missionsCategory: 'main' });
    } else {
      this._ctx.gameState.setUI({ missionsCategory: requested });
    }

    this.render();

    this._unsubs.push(
      this._ctx.eventBus.on('state:changed', () => this.render()),
      this._ctx.eventBus.on('missions:updated', () => this.render()),
      this._ctx.eventBus.on('missions:claimed', () => this.render()),
      this._ctx.eventBus.on('missions:reset', () => this.render()),
    );

    if (typeof setInterval === 'function') {
      this._countdownTimer = setInterval(() => {
        if (!this._container) return;
        const cat = this._getActiveCategory();
        if (cat === 'daily' || cat === 'weekly' || cat === 'seasonal') {
          this._ctx.missionSystem?.ensureResets?.();
          this.render();
        }
      }, 60000);
      this._countdownTimer?.unref?.();
    }
  }

  unmount() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
    this._hasRendered = false;
    this._lastCategory = null;
    this._lastChapter = null;
    this._lastClaimedMissionId = null;
    this._container = null;
  }

  _getActiveCategory() {
    const cat = this._ctx.gameState.ui.missionsCategory;
    return VALID_CATEGORY_IDS.has(cat) ? cat : 'daily';
  }

  /**
   * Aligns transient Main Mission browse state with the player's actual saved
   * progression without mutating persistent save data.
   */
  _syncToCurrentProgression(extraUi = {}) {
    const { progressionSystem, gameState } = this._ctx;
    const currentStage = progressionSystem.getCurrentProgressionStage();
    const currentChapter = currentStage?.chapter || 1;
    this._shouldScrollTimeline = true;
    gameState.setUI({
      ...extraUi,
      missionsSelectedChapter: currentChapter,
      missionsSelectedStageId: currentStage?.id || null,
    });
  }

  _selectCategory(categoryId) {
    if (!VALID_CATEGORY_IDS.has(categoryId)) return;
    this._missionListScrollTop = 0;
    this._returnCategory = null;
    if (categoryId === 'main') {
      this._syncToCurrentProgression({ missionsCategory: 'main' });
    } else {
      this._ctx.missionSystem?.ensureResets?.();
      this._ctx.gameState.setUI({ missionsCategory: categoryId });
    }
    this.render();
  }

  _pickDefaultStageForChapter(chapterObj, currentProgStage) {
    if (!chapterObj || !Array.isArray(chapterObj.stages) || chapterObj.stages.length === 0) {
      return null;
    }
    if (chapterObj.isCurrent && currentProgStage) {
      const match = chapterObj.stages.find((s) => s.id === currentProgStage.id);
      if (match) return match.id;
    }
    const unlockedUncleared = chapterObj.stages.find((s) => s.unlocked && !s.cleared);
    if (unlockedUncleared) return unlockedUncleared.id;
    const firstUnlocked = chapterObj.stages.find((s) => s.unlocked);
    if (firstUnlocked) return firstUnlocked.id;
    return chapterObj.stages[0].id;
  }

  _navigateToMissionDestination(mission, category) {
    const dest = resolveMissionDestination(mission, this._ctx);
    if (!dest) {
      this._ctx.notify?.('No direct destination is available for this mission type.', 'warn');
      return false;
    }

    const { progressionSystem, gameState, screenManager, audioManager } = this._ctx;

    if (dest.screenId === 'battle') {
      const selected = progressionSystem?.getSelectedStage?.();
      if (!selected || !progressionSystem?.isStageUnlocked?.(selected.id)) {
        const fallback = progressionSystem?.getCurrentProgressionStage?.();
        if (fallback && progressionSystem?.isStageUnlocked?.(fallback.id)) {
          progressionSystem.selectStage(fallback.id);
        }
      }
    } else if (dest.screenId === 'formation' && dest.formationTab) {
      gameState?.setUI?.({ formationTab: dest.formationTab });
    }

    this._returnCategory = VALID_CATEGORY_IDS.has(category) ? category : null;
    audioManager?.playClick?.();
    const navigated = screenManager?.navigate?.(dest.screenId);
    if (navigated === false) {
      this._returnCategory = null;
      this._ctx.notify?.('Destination screen is currently unavailable.', 'warn');
      return false;
    }
    return true;
  }

  _getCategoryMeta(catId, summaries, currentProgStage, allStages) {
    if (catId === 'main') {
      const totalCleared = allStages.filter((s) => s.cleared).length;
      return {
        badgeText: `${totalCleared}/${allStages.length}`,
        badgeTone: 'neutral',
        subtext: currentProgStage ? `Stage ${currentProgStage.code}` : 'Campaign',
      };
    }

    const summary = summaries[catId];
    if (!summary) {
      return { badgeText: '—', badgeTone: 'neutral', subtext: 'Unavailable' };
    }

    if (catId === 'seasonal' && !summary.event) {
      return {
        badgeText: 'None',
        badgeTone: 'muted',
        subtext: summary.upcomingEvent ? 'Scheduled' : 'No Active Event',
      };
    }

    if (summary.claimableCount > 0) {
      return {
        badgeText: `${summary.claimableCount} Ready`,
        badgeTone: 'gold',
        subtext: `${summary.completedCount}/${summary.totalCount} Complete`,
      };
    }

    return {
      badgeText: `${summary.completedCount}/${summary.totalCount}`,
      badgeTone: summary.totalCount > 0 && summary.completedCount === summary.totalCount ? 'ally' : 'neutral',
      subtext: summary.totalCount > 0 && summary.completedCount === summary.totalCount ? 'Completed' : 'In Progress',
    };
  }

  render() {
    if (!this._container) return;

    const prevTimelineScroll = this._container.querySelector('.chapter-timeline-scroll');
    if (prevTimelineScroll && typeof prevTimelineScroll.scrollTop === 'number') {
      this._timelineScrollTop = prevTimelineScroll.scrollTop;
    }
    const prevListScroll = this._container.querySelector('.missions-list-scroll');
    if (prevListScroll && typeof prevListScroll.scrollTop === 'number') {
      this._missionListScrollTop = prevListScroll.scrollTop;
    }

    const activeCategory = this._getActiveCategory();
    const { missionSystem, progressionSystem, audioManager } = this._ctx;
    const summaries = {
      daily: missionSystem?.getCategorySummary?.('daily') || null,
      weekly: missionSystem?.getCategorySummary?.('weekly') || null,
      seasonal: missionSystem?.getCategorySummary?.('seasonal') || null,
    };
    const totalClaimable =
      (summaries.daily?.claimableCount || 0) +
      (summaries.weekly?.claimableCount || 0) +
      (summaries.seasonal?.claimableCount || 0);
    const currentProgStage = progressionSystem.getCurrentProgressionStage();
    const allStages = progressionSystem.getStages();

    const settledClass = this._hasRendered ? ' is-settled' : '';
    const categoryChanged =
      this._hasRendered && Boolean(this._lastCategory && this._lastCategory !== activeCategory);

    this._container.innerHTML = `
      <section class="screen-frame${settledClass}" aria-label="Missions Center">
        <div class="screen-bar">
          <div class="screen-bar__lead">
            <h1 class="screen-title">Missions Center</h1>
            <span class="meta-line tabular-nums">
              <span>${
                activeCategory === 'main' && currentProgStage
                  ? `Main Campaign · Ch.${currentProgStage.chapter} Stage ${currentProgStage.code}`
                  : 'Tactical Directives & Campaign Operations'
              }</span>
            </span>
          </div>

          <div class="meta-line tabular-nums">
            <span>${
              totalClaimable > 0
                ? `${totalClaimable} Claimable Reward${totalClaimable > 1 ? 's' : ''}`
                : 'All Completed Rewards Claimed'
            }</span>
          </div>
        </div>

        <div class="missions-center">
          <aside class="surface missions-category-pane" aria-label="Mission Categories">
            <div class="missions-category-pane__head">
              <div class="section-kicker section-kicker--gold">Categories</div>
              <h2 class="section-heading">Mission Board</h2>
            </div>

            <div class="missions-category-list" role="tablist" aria-orientation="vertical" aria-label="Mission Categories">
              ${MISSION_CATEGORIES.map((cat) => {
                const isActive = activeCategory === cat.id;
                const meta = this._getCategoryMeta(cat.id, summaries, currentProgStage, allStages);
                const claimableCount = summaries[cat.id]?.claimableCount || 0;
                return `
                  <button
                    type="button"
                    role="tab"
                    class="missions-category-btn ${isActive ? 'is-active' : ''}"
                    data-mission-tab="${cat.id}"
                    aria-selected="${isActive ? 'true' : 'false'}"
                  >
                    <span class="missions-category-btn__top">
                      <span class="missions-category-btn__title">${cat.label}</span>
                      <span class="missions-category-btn__badge is-${meta.badgeTone} tabular-nums" ${
                        claimableCount > 0 ? `aria-label="${claimableCount} claimable"` : ''
                      }>${meta.badgeText}</span>
                    </span>
                    <span class="missions-category-btn__sub">${cat.kicker} · ${meta.subtext}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </aside>

          <div id="missions-body" class="missions-detail-pane${categoryChanged ? ' motion-tab-enter' : ''}"></div>
        </div>
      </section>
    `;

    for (const btn of this._container.querySelectorAll('[data-mission-tab]')) {
      btn.addEventListener('click', () => {
        audioManager?.playClick?.();
        this._selectCategory(btn.getAttribute('data-mission-tab'));
      });
    }

    const bodyEl = this._container.querySelector('#missions-body');
    const prevLastCategory = this._lastCategory;
    this._lastCategory = activeCategory;
    if (!bodyEl) {
      this._hasRendered = true;
      return;
    }

    if (activeCategory === 'main') {
      this._renderMainMissionView(bodyEl, categoryChanged);
    } else {
      this._renderMissionListView(bodyEl, activeCategory, summaries[activeCategory]);
    }

    void prevLastCategory;
    this._hasRendered = true;
  }

  _renderMissionListView(bodyEl, category, precomputedSummary = null) {
    const { missionSystem, audioManager, notify } = this._ctx;
    const summary = precomputedSummary || missionSystem?.getCategorySummary?.(category);

    if (!summary) {
      bodyEl.innerHTML = `
        <div class="surface seasonal-empty-card">
          <div class="section-kicker">Missions Center</div>
          <h2 class="seasonal-empty-card__title">Mission System Unavailable</h2>
          <p class="seasonal-empty-card__desc">Mission tracking data could not be loaded for this session.</p>
        </div>
      `;
      return;
    }

    if (category === 'seasonal' && !summary.event) {
      const upcoming = summary.upcomingEvent;
      bodyEl.innerHTML = `
        <div class="missions-list-shell">
          <div class="surface seasonal-empty-card" role="status">
            <div class="section-kicker section-kicker--gold">Seasonal Campaigns</div>
            <h2 class="seasonal-empty-card__title">No Active Seasonal Event</h2>
            <p class="seasonal-empty-card__desc">
              No limited-time seasonal campaign is currently live. When a seasonal event window is active in mission configuration, its event objectives, progress trackers, expiration countdown, and milestone rewards will appear here.
            </p>
            ${
              upcoming
                ? `
                  <div class="seasonal-upcoming-box">
                    <div class="section-kicker">Scheduled Upcoming Event</div>
                    <strong>${upcoming.title}</strong>
                    <p>${upcoming.description}</p>
                    <div class="meta-line tabular-nums">
                      <span>Window: ${formatIsoDateShort(upcoming.startAt)} — ${formatIsoDateShort(upcoming.endAt)}</span>
                    </div>
                  </div>
                `
                : `
                  <div class="meta-line">
                    <span>Active Event: None</span>
                    <span class="meta-sep" aria-hidden="true">·</span>
                    <span>Check Daily, Weekly, or Main Mission for current objectives.</span>
                  </div>
                `
            }
          </div>
        </div>
      `;
      return;
    }

    const headingMeta =
      category === 'daily'
        ? {
            kicker: 'Daily Operations',
            title: 'Daily Missions',
            desc: 'Complete daily tactical directives through real battles, card merges, and commander ultimates.',
          }
        : category === 'weekly'
          ? {
              kicker: 'Weekly Commissions',
              title: 'Weekly Missions',
              desc: 'Sustained campaign goals across victories, squad upgrades, merges, and recruitment.',
            }
          : {
              kicker: 'Active Seasonal Event',
              title: summary.event.title,
              desc: summary.event.description,
            };

    const sortedMissions = [...summary.missions].sort((a, b) => {
      const rank = (m) => (m.claimable ? 0 : !m.claimed ? 1 : 2);
      return rank(a) - rank(b);
    });

    const pct =
      summary.totalCount > 0
        ? Math.round((summary.completedCount / summary.totalCount) * 100)
        : 0;

    bodyEl.innerHTML = `
      <div class="missions-list-shell">
        <header class="surface missions-summary-bar">
          <div class="missions-summary-bar__info">
            <div class="section-kicker ${category === 'seasonal' ? 'section-kicker--gold' : ''}">
              ${headingMeta.kicker}
            </div>
            <h2 class="missions-summary-bar__title">${headingMeta.title}</h2>
            <p class="missions-summary-bar__desc">${headingMeta.desc}</p>
          </div>

          <div class="missions-summary-bar__meta">
            <div class="missions-summary-bar__stats">
              <div class="missions-stat-block">
                <span class="home-metric__label">Completion</span>
                <span class="home-metric__value tabular-nums">${summary.completedCount} / ${summary.totalCount}</span>
              </div>
              <div class="missions-stat-block">
                <span class="home-metric__label">${category === 'seasonal' ? 'Event Expiration' : 'Reset Schedule'}</span>
                <span class="missions-reset-value tabular-nums">${summary.resetLabel}</span>
              </div>
            </div>

            <div class="missions-summary-bar__actions">
              <div class="progress-track missions-summary-bar__progress" aria-label="Category completion progress">
                <div class="progress-fill ${pct === 100 ? 'progress-fill--gold' : ''}" style="width: ${pct}%;"></div>
              </div>
              <button
                type="button"
                class="btn btn-gold btn-sm"
                data-action="claim-all"
                ${summary.claimableCount === 0 ? 'disabled' : ''}
              >
                ${summary.claimableCount > 0 ? `Claim All (${summary.claimableCount})` : 'All Claimed / Pending'}
              </button>
            </div>
          </div>
        </header>

        <div class="scroll-pane missions-list-scroll" aria-label="${headingMeta.title} list">
          ${
            sortedMissions.length === 0
              ? `
                <div class="surface seasonal-empty-card">
                  <h3 class="seasonal-empty-card__title">No Missions Configured</h3>
                  <p class="seasonal-empty-card__desc">There are currently no missions assigned to this category.</p>
                </div>
              `
              : sortedMissions
                  .map((m) => {
                    const hasProgressBar = Number.isFinite(Number(m.target)) && Number(m.target) > 0;
                    const statusLabel = m.claimable
                      ? 'Ready to Claim'
                      : m.claimed
                        ? 'Claimed'
                        : 'In Progress';
                    const stateClass = m.claimable
                      ? 'is-claimable'
                      : m.claimed
                        ? 'is-claimed'
                        : 'is-progress';
                    const dest = !m.completed ? resolveMissionDestination(m, this._ctx) : null;

                    let actionMarkup = '';
                    if (m.claimable) {
                      actionMarkup = `
                        <button
                          type="button"
                          class="btn btn-gold btn-sm"
                          data-claim-mission="${m.id}"
                        >
                          Claim
                        </button>
                      `;
                    } else if (m.claimed) {
                      actionMarkup = `
                        <button
                          type="button"
                          class="btn btn-ghost btn-sm mission-claimed-btn"
                          data-mission-claimed="${m.id}"
                          disabled
                          aria-disabled="true"
                        >
                          Claimed
                        </button>
                      `;
                    } else if (dest) {
                      actionMarkup = `
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          data-mission-go="${m.id}"
                          data-go-screen="${dest.screenId}"
                        >
                          ${dest.label}
                        </button>
                      `;
                    } else {
                      actionMarkup = `
                        <button
                          type="button"
                          class="btn btn-ghost btn-sm"
                          data-mission-unavailable="${m.id}"
                          disabled
                          aria-disabled="true"
                          title="No direct navigation destination available for this mission"
                        >
                          No Destination
                        </button>
                      `;
                    }

                    const pulseClass =
                      m.id === this._lastClaimedMissionId ? ' motion-pulse-commit' : '';
                    return `
                      <article class="mission-row-card ${stateClass}${pulseClass}" data-mission-id="${m.id}">
                        <div class="mission-row-card__main">
                          <div class="mission-row-card__head">
                            <div class="mission-row-card__title-group">
                              <h3 class="mission-row-card__title">${m.title}</h3>
                              <span class="mission-state-tag ${stateClass}">${statusLabel}</span>
                            </div>
                            <span class="mission-row-card__counter tabular-nums">${m.progress} / ${m.target}</span>
                          </div>
                          <p class="mission-row-card__desc">${m.description}</p>
                          ${
                            hasProgressBar
                              ? `
                                <div class="progress-track" aria-label="${m.title} progress">
                                  <div
                                    class="progress-fill ${m.completed ? 'progress-fill--gold' : ''}"
                                    style="width: ${m.pct}%;"
                                  ></div>
                                </div>
                              `
                              : ''
                          }
                        </div>

                        <div class="mission-row-card__rewards" aria-label="Mission rewards">
                          <span class="home-metric__label">Rewards</span>
                          <div class="mission-reward-list tabular-nums">
                            ${renderRewardChips(m.rewards)}
                          </div>
                        </div>

                        <div class="mission-row-card__action">
                          ${actionMarkup}
                        </div>
                      </article>
                    `;
                  })
                  .join('')
          }
        </div>
      </div>
    `;

    this._lastClaimedMissionId = null;

    const listScrollEl = bodyEl.querySelector('.missions-list-scroll');
    if (listScrollEl && typeof this._missionListScrollTop === 'number') {
      listScrollEl.scrollTop = this._missionListScrollTop;
    }

    bodyEl.querySelector('[data-action="claim-all"]')?.addEventListener('click', () => {
      const res = missionSystem.claimAllClaimable(category);
      if (res.ok) {
        audioManager?.playReward?.();
        const rewardText = formatRewardParts(res.rewards)
          .map((r) => r.label)
          .join(' · ');
        notify?.(`Claimed ${res.count} mission reward${res.count > 1 ? 's' : ''}: ${rewardText}`, 'success');
      }
    });

    for (const btn of bodyEl.querySelectorAll('[data-claim-mission]')) {
      btn.addEventListener('click', () => {
        const missionId = btn.getAttribute('data-claim-mission');
        this._lastClaimedMissionId = missionId;
        const res = missionSystem.claimMission(category, missionId);
        if (res.ok) {
          audioManager?.playReward?.();
          const rewardText = formatRewardParts(res.rewards)
            .map((r) => r.label)
            .join(' · ');
          notify?.(`Reward claimed: ${rewardText}`, 'success');
        } else {
          this._lastClaimedMissionId = null;
          if (res.reason) notify?.(res.reason, 'warn');
        }
      });
    }

    for (const btn of bodyEl.querySelectorAll('[data-mission-go]')) {
      btn.addEventListener('click', () => {
        const missionId = btn.getAttribute('data-mission-go');
        const mission = sortedMissions.find((item) => item.id === missionId);
        if (!mission) return;
        this._navigateToMissionDestination(mission, category);
      });
    }
  }

  _renderMainMissionView(bodyEl, categoryChanged = false) {
    const {
      progressionSystem,
      gameState,
      dataRegistry,
      assetManager,
      screenManager,
      audioManager,
      notify,
    } = this._ctx;

    const chapters = progressionSystem.getChapters();
    const currentProgStage = progressionSystem.getCurrentProgressionStage();
    const allStages = progressionSystem.getStages();
    const totalCleared = allStages.filter((s) => s.cleared).length;

    let selectedChapterNum = gameState.ui.missionsSelectedChapter;
    let selectedChapter = chapters.find((ch) => ch.chapter === selectedChapterNum) || null;
    if (!selectedChapter) {
      selectedChapterNum = currentProgStage?.chapter || chapters[0]?.chapter || 1;
      selectedChapter = chapters.find((ch) => ch.chapter === selectedChapterNum) || chapters[0] || null;
      gameState.setUI({ missionsSelectedChapter: selectedChapter?.chapter || 1 });
    }

    const chapterStages = selectedChapter?.stages || [];
    let selectedStageId = gameState.ui.missionsSelectedStageId;
    let selectedStage = chapterStages.find((s) => s.id === selectedStageId) || null;
    if (!selectedStage) {
      selectedStageId = this._pickDefaultStageForChapter(selectedChapter, currentProgStage);
      selectedStage = chapterStages.find((s) => s.id === selectedStageId) || chapterStages[0] || null;
      gameState.setUI({ missionsSelectedStageId: selectedStage?.id || null });
    }

    const terrainDef = selectedStage?.terrainId
      ? dataRegistry.terrainsById?.get(selectedStage.terrainId)
      : null;
    const bossDef = selectedStage?.bossId
      ? dataRegistry.bossesById?.get(selectedStage.bossId)
      : null;
    const stageUnlockReq =
      selectedStage && !selectedStage.unlocked && selectedStage.unlockAfter
        ? dataRegistry.stagesById?.get(selectedStage.unlockAfter)
        : null;

    const bonusUnitNames = (selectedStage?.rewards?.bonusUnits || [])
      .map((uid) => dataRegistry.unitsById?.get(uid)?.name || uid);
    const bonusCardNames = (selectedStage?.rewards?.bonusCards || [])
      .map((cid) => dataRegistry.cardsById?.get(cid)?.name || cid);
    const firstClearUnlocks = [...bonusUnitNames, ...bonusCardNames];

    bodyEl.innerHTML = `
      <div class="main-mission-workspace">
        <aside class="surface chapter-timeline-pane" aria-label="Campaign Chapter Timeline">
          <div class="chapter-timeline-pane__head">
            <div>
              <div class="section-kicker">Main Campaign</div>
              <h2 class="section-heading">Chapter Timeline</h2>
            </div>
            <span class="meta-line tabular-nums">${totalCleared} / ${allStages.length} Cleared</span>
          </div>

          <div class="chapter-timeline-scroll" tabindex="0" aria-label="Scrollable chapter list">
            <div class="chapter-timeline-list" role="listbox" aria-label="Campaign chapters">
              ${chapters
                .map((ch) => {
                  const isSelected = ch.chapter === selectedChapter?.chapter;
                  const statusLabel = CHAPTER_STATUS_LABELS[ch.status] || 'Available';
                  const markerGlyph =
                    ch.status === 'completed'
                      ? '✓'
                      : ch.status === 'current'
                        ? '◆'
                        : ch.status === 'locked'
                          ? '×'
                          : '○';
                  return `
                    <button
                      type="button"
                      role="option"
                      class="chapter-node is-${ch.status} ${isSelected ? 'is-selected' : ''}"
                      data-chapter="${ch.chapter}"
                      aria-selected="${isSelected ? 'true' : 'false'}"
                    >
                      <span class="chapter-node__track" aria-hidden="true">
                        <span class="chapter-node__marker">${markerGlyph}</span>
                      </span>
                      <span class="chapter-node__card">
                        <span class="chapter-node__top">
                          <span class="chapter-node__num tabular-nums">Chapter ${String(ch.chapter).padStart(2, '0')}</span>
                          <span class="chapter-node__status is-${ch.status}">${statusLabel}</span>
                        </span>
                        <span class="chapter-node__title">${ch.title}</span>
                        <span class="chapter-node__realm">${ch.realm}</span>
                        <span class="chapter-node__progress">
                          <span class="progress-track">
                            <span
                              class="progress-fill ${ch.status === 'completed' ? 'progress-fill--gold' : ''}"
                              style="width: ${ch.progressPct}%;"
                            ></span>
                          </span>
                          <span class="chapter-node__count tabular-nums">${ch.clearedCount}/${ch.totalCount}</span>
                        </span>
                      </span>
                    </button>
                  `;
                })
                .join('')}
            </div>
          </div>
        </aside>

        <section class="chapter-detail-pane${
          this._hasRendered &&
          !categoryChanged &&
          this._lastChapter !== null &&
          selectedChapter &&
          this._lastChapter !== selectedChapter.chapter
            ? ' motion-detail-enter'
            : ''
        }" aria-label="Selected Chapter Stages">
          ${
            selectedChapter
              ? `
                <header class="chapter-hero-banner is-${selectedChapter.status}">
                  <img
                    id="chapter-banner-art"
                    class="chapter-hero-banner__art"
                    alt="${selectedChapter.title} artwork"
                  />
                  <div class="chapter-hero-banner__scrim">
                    <div class="chapter-hero-banner__top">
                      <span class="section-kicker section-kicker--gold">
                        Chapter ${String(selectedChapter.chapter).padStart(2, '0')} · ${selectedChapter.realm}
                      </span>
                      <span class="chapter-banner-status is-${selectedChapter.status}">
                        ${CHAPTER_STATUS_LABELS[selectedChapter.status] || 'Available'} · ${selectedChapter.clearedCount}/${selectedChapter.totalCount} Cleared
                      </span>
                    </div>
                    <h2 class="chapter-hero-banner__title">${selectedChapter.title}</h2>
                    <p class="chapter-hero-banner__desc">${selectedChapter.description}</p>
                    ${
                      selectedChapter.status === 'locked' && selectedChapter.unlockRequirement
                        ? `
                          <div class="chapter-locked-notice">
                            Chapter Locked — Clear Stage ${selectedChapter.unlockRequirement.code} (${selectedChapter.unlockRequirement.name}) to unlock.
                          </div>
                        `
                        : ''
                    }
                  </div>
                </header>

                <div class="surface chapter-stages-panel">
                  <div class="workspace-pane__head">
                    <div>
                      <span class="section-heading">Chapter ${selectedChapter.chapter} Stages</span>
                      <span class="meta-sep" aria-hidden="true">·</span>
                      <span class="meta-line" style="display:inline;">Select a stage to inspect objectives &amp; deploy</span>
                    </div>
                    ${
                      currentProgStage && selectedChapter.chapter !== currentProgStage.chapter
                        ? `
                          <button type="button" class="btn btn-ghost btn-sm" data-action="jump-current">
                            Return to Current (Stage ${currentProgStage.code})
                          </button>
                        `
                        : ''
                    }
                  </div>

                  <div class="scroll-pane chapter-stages-grid" aria-label="Chapter stages">
                    ${chapterStages
                      .map((s) => {
                        const isSelected = s.id === selectedStage?.id;
                        const isCurrent = s.id === currentProgStage?.id;
                        const stateLabel = !s.unlocked
                          ? 'Locked'
                          : isCurrent
                            ? 'Current Stage'
                            : s.cleared
                              ? `Cleared${s.bestRating ? ` · ${s.bestRating}` : ''}`
                              : 'Available';
                        const stateClass = !s.unlocked
                          ? 'is-locked'
                          : isCurrent
                            ? 'is-current'
                            : s.cleared
                              ? 'is-cleared'
                              : 'is-available';
                        return `
                          <button
                            type="button"
                            class="mission-stage-card ${stateClass} ${isSelected ? 'is-selected' : ''}"
                            data-stage-id="${s.id}"
                            aria-pressed="${isSelected ? 'true' : 'false'}"
                          >
                            <div class="mission-stage-card__top">
                              <span class="mission-stage-card__code tabular-nums">Stage ${s.code}</span>
                              <span class="mission-stage-card__state ${stateClass}">${stateLabel}</span>
                            </div>
                            <div class="mission-stage-card__name">${s.name}</div>
                            <div class="meta-line tabular-nums">
                              <span>${s.difficulty}</span>
                              <span class="meta-sep" aria-hidden="true">·</span>
                              <span>${s.waves?.length || 0} Waves</span>
                              <span class="meta-sep" aria-hidden="true">·</span>
                              <span>Rec. Lv.${s.recommendedLevel}</span>
                            </div>
                            ${
                              s.bossId
                                ? `<div class="mission-stage-card__boss">Boss Encounter</div>`
                                : ''
                            }
                          </button>
                        `;
                      })
                      .join('')}
                  </div>
                </div>

                ${
                  selectedStage
                    ? `
                      <div class="surface stage-briefing-panel" aria-label="Selected Stage Briefing">
                        <div class="stage-briefing-panel__main">
                          <div class="stage-briefing-panel__head">
                            <div>
                              <div class="section-kicker">
                                Stage ${selectedStage.code} · ${terrainDef?.realmTitle || terrainDef?.name || selectedChapter.realm}
                                ${selectedStage.id === currentProgStage?.id ? ' · Active Progression' : ''}
                              </div>
                              <h3 class="stage-briefing-panel__title">${selectedStage.name}</h3>
                            </div>
                            <span class="meta-line tabular-nums">
                              ${
                                !selectedStage.unlocked
                                  ? 'Locked'
                                  : selectedStage.cleared
                                    ? `Best Rating: ${selectedStage.bestRating || 'Cleared'}`
                                    : 'First-Clear Bonus Ready'
                              }
                            </span>
                          </div>

                          <p class="stage-briefing-panel__desc">${selectedStage.description}</p>

                          <div class="stage-briefing-meta-grid">
                            <div class="stage-briefing-cell">
                              <span class="home-metric__label">Encounter</span>
                              <span class="stage-briefing-cell__val tabular-nums">
                                ${selectedStage.difficulty} · ${selectedStage.waves?.length || 0} Waves · Rec. Lv.${selectedStage.recommendedLevel}
                              </span>
                            </div>
                            <div class="stage-briefing-cell">
                              <span class="home-metric__label">Boss Threat</span>
                              <span class="stage-briefing-cell__val ${bossDef ? 'boss-threat-value' : ''}">
                                ${bossDef ? `${bossDef.name} (${bossDef.title || 'Boss'})` : 'Standard Garrison'}
                              </span>
                            </div>
                            <div class="stage-briefing-cell stage-briefing-cell--wide">
                              <span class="home-metric__label">${selectedStage.cleared ? 'Repeat & Base Rewards' : 'First-Clear Rewards'}</span>
                              <div class="mission-reward-list tabular-nums">
                                ${renderRewardChips(selectedStage.rewards)}
                                ${
                                  !selectedStage.cleared && firstClearUnlocks.length > 0
                                    ? `<span class="mission-reward-item is-gold">Unlocks: ${firstClearUnlocks.join(', ')}</span>`
                                    : ''
                                }
                              </div>
                            </div>
                          </div>
                        </div>

                        <div class="stage-briefing-panel__cta">
                          ${
                            !selectedStage.unlocked
                              ? `
                                <p class="stage-locked-hint">
                                  ${
                                    stageUnlockReq
                                      ? `Clear Stage ${stageUnlockReq.code} (${stageUnlockReq.name}) to unlock.`
                                      : 'Complete preceding campaign stages to unlock.'
                                  }
                                </p>
                              `
                              : ''
                          }
                          <button
                            type="button"
                            class="btn btn-primary btn-lg"
                            data-action="start-battle"
                            data-stage-id="${selectedStage.id}"
                            ${selectedStage.unlocked ? '' : 'disabled'}
                          >
                            ${selectedStage.unlocked ? `Start Battle · ${selectedStage.code}` : 'Stage Locked'}
                          </button>
                        </div>
                      </div>
                    `
                    : ''
                }
              `
              : ''
          }
        </section>
      </div>
    `;

    // Bind chapter banner artwork via AssetManager
    const bannerArtEl = bodyEl.querySelector('#chapter-banner-art');
    if (bannerArtEl && selectedChapter && assetManager?.bindImageElement) {
      assetManager.bindImageElement(bannerArtEl, selectedChapter.artworkAssetId);
    }

    // Restore or smoothly scroll timeline to selected chapter
    const scrollEl = bodyEl.querySelector('.chapter-timeline-scroll');
    if (scrollEl) {
      if (this._shouldScrollTimeline && selectedChapter) {
        const selectedNode = scrollEl.querySelector(
          `[data-chapter="${selectedChapter.chapter}"]`,
        );
        if (selectedNode && typeof selectedNode.scrollIntoView === 'function') {
          selectedNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        this._shouldScrollTimeline = false;
      } else if (typeof this._timelineScrollTop === 'number') {
        scrollEl.scrollTop = this._timelineScrollTop;
      }
    }

    // Chapter timeline clicks (browse only — never mutates saved progression)
    for (const node of bodyEl.querySelectorAll('[data-chapter]')) {
      node.addEventListener('click', () => {
        const chNum = Number(node.getAttribute('data-chapter'));
        const targetCh = chapters.find((c) => c.chapter === chNum);
        if (!targetCh) return;
        audioManager?.playClick?.();
        const nextStageId = this._pickDefaultStageForChapter(targetCh, currentProgStage);
        this._shouldScrollTimeline = true;
        gameState.setUI({
          missionsSelectedChapter: chNum,
          missionsSelectedStageId: nextStageId,
        });
        this.render();
      });
    }

    // Jump back to current progression chapter & stage
    bodyEl.querySelector('[data-action="jump-current"]')?.addEventListener('click', () => {
      audioManager?.playClick?.();
      this._syncToCurrentProgression();
      this.render();
    });

    // Stage card clicks (browse only — never mutates saved progression)
    for (const card of bodyEl.querySelectorAll('.mission-stage-card[data-stage-id]')) {
      card.addEventListener('click', () => {
        const stageId = card.getAttribute('data-stage-id');
        if (!stageId) return;
        audioManager?.playClick?.();
        gameState.setUI({ missionsSelectedStageId: stageId });
        this.render();
      });
    }

    // Start Battle CTA — strictly unlocked stages only, preserves existing battle launch flow
    bodyEl.querySelector('[data-action="start-battle"]')?.addEventListener('click', () => {
      if (!selectedStage) return;
      if (!progressionSystem.isStageUnlocked(selectedStage.id)) {
        notify?.('This stage is still locked.', 'warn');
        return;
      }
      const res = progressionSystem.selectStage(selectedStage.id);
      if (!res.ok) {
        notify?.(res.reason || 'Unable to select stage.', 'warn');
        return;
      }
      audioManager?.playClick?.();
      screenManager.navigate('battle');
    });

    this._lastChapter = selectedChapter?.chapter ?? null;
  }
}
