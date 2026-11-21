/**
 * MissionsScreen — Unified Missions Center housing Daily, Weekly, Seasonal,
 * and Main Mission (chronological chapter timeline + stage selection).
 */

import { formatNumber } from '../utils/MathUtils.js';

const MISSION_CATEGORIES = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'seasonal', label: 'Seasonal' },
  { id: 'main', label: 'Main Mission' },
];

const VALID_CATEGORY_IDS = new Set(MISSION_CATEGORIES.map((c) => c.id));

const CHAPTER_STATUS_LABELS = {
  completed: 'Completed',
  current: 'Current',
  available: 'Available',
  locked: 'Locked',
};

function formatRewardParts(rewards) {
  if (!rewards) return [];
  const parts = [];
  if (rewards.astrite > 0) parts.push({ label: `+${formatNumber(rewards.astrite)} Astrite`, gold: true });
  if (rewards.credits > 0) parts.push({ label: `+${formatNumber(rewards.credits)} Credits`, gold: false });
  if (rewards.playerXp > 0) parts.push({ label: `+${formatNumber(rewards.playerXp)} Cmdr XP`, gold: false });
  if (Array.isArray(rewards.materials)) {
    for (const mat of rewards.materials) {
      if (mat && mat.quantity > 0) {
        parts.push({ label: `${mat.name || mat.id} ×${mat.quantity}`, gold: false });
      }
    }
  }
  return parts;
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
  }

  mount(container, params = {}) {
    this._container = container;
    this._ctx.missionSystem?.ensureResets?.();

    const requested = params && VALID_CATEGORY_IDS.has(params.category) ? params.category : 'daily';
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

  render() {
    if (!this._container) return;

    const prevScrollEl = this._container.querySelector('.chapter-timeline-scroll');
    if (prevScrollEl && typeof prevScrollEl.scrollTop === 'number') {
      this._timelineScrollTop = prevScrollEl.scrollTop;
    }

    const activeCategory = this._getActiveCategory();
    const { missionSystem, progressionSystem, audioManager } = this._ctx;
    const claimableCounts = {
      daily: missionSystem?.getClaimableCount?.('daily') || 0,
      weekly: missionSystem?.getClaimableCount?.('weekly') || 0,
      seasonal: missionSystem?.getClaimableCount?.('seasonal') || 0,
      main: 0,
    };
    const totalClaimable = claimableCounts.daily + claimableCounts.weekly + claimableCounts.seasonal;
    const currentProgStage = progressionSystem.getCurrentProgressionStage();

    this._container.innerHTML = `
      <section class="screen-frame" aria-label="Missions Center">
        <div class="screen-bar">
          <div class="screen-bar__left">
            <h1 class="screen-bar__title">Missions Center</h1>
            <span class="meta-sep" aria-hidden="true">·</span>
            <span class="meta-line tabular-nums">
              ${
                activeCategory === 'main' && currentProgStage
                  ? `Current Progression: Ch.${currentProgStage.chapter} · Stage ${currentProgStage.code}`
                  : totalClaimable > 0
                    ? `${totalClaimable} Claimable Reward${totalClaimable > 1 ? 's' : ''}`
                    : 'Directives & Main Campaign'
              }
            </span>
          </div>

          <div class="segmented-bar missions-tabs" role="tablist" aria-label="Mission Categories">
            ${MISSION_CATEGORIES.map((cat) => {
              const count = claimableCounts[cat.id] || 0;
              const isActive = activeCategory === cat.id;
              return `
                <button
                  type="button"
                  role="tab"
                  class="segmented-btn ${isActive ? 'is-active' : ''}"
                  data-mission-tab="${cat.id}"
                  aria-selected="${isActive ? 'true' : 'false'}"
                >
                  <span>${cat.label}</span>
                  ${
                    count > 0
                      ? `<span class="missions-tab-count tabular-nums" aria-label="${count} claimable">${count}</span>`
                      : ''
                  }
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <div id="missions-body" class="missions-body"></div>
      </section>
    `;

    for (const btn of this._container.querySelectorAll('[data-mission-tab]')) {
      btn.addEventListener('click', () => {
        audioManager?.playClick?.();
        this._selectCategory(btn.getAttribute('data-mission-tab'));
      });
    }

    const bodyEl = this._container.querySelector('#missions-body');
    if (!bodyEl) return;

    if (activeCategory === 'main') {
      this._renderMainMissionView(bodyEl);
    } else {
      this._renderMissionListView(bodyEl, activeCategory);
    }
  }

  _renderMissionListView(bodyEl, category) {
    const { missionSystem, audioManager, notify } = this._ctx;
    const summary = missionSystem?.getCategorySummary?.(category);

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
                    const rewardParts = formatRewardParts(m.rewards);
                    const stateClass = m.claimable
                      ? 'is-claimable'
                      : m.claimed
                        ? 'is-claimed'
                        : '';
                    return `
                      <article class="mission-row-card ${stateClass}" data-mission-id="${m.id}">
                        <div class="mission-row-card__main">
                          <div class="mission-row-card__head">
                            <h3 class="mission-row-card__title">${m.title}</h3>
                            <span class="mission-row-card__counter tabular-nums">${m.progress} / ${m.target}</span>
                          </div>
                          <p class="mission-row-card__desc">${m.description}</p>
                          <div class="progress-track" aria-label="${m.title} progress">
                            <div
                              class="progress-fill ${m.completed ? 'progress-fill--gold' : ''}"
                              style="width: ${m.pct}%;"
                            ></div>
                          </div>
                        </div>

                        <div class="mission-row-card__rewards" aria-label="Mission rewards">
                          <span class="home-metric__label">Rewards</span>
                          <div class="mission-reward-list tabular-nums">
                            ${rewardParts
                              .map(
                                (r) => `
                                  <span class="mission-reward-item ${r.gold ? 'is-gold' : ''}">${r.label}</span>
                                `,
                              )
                              .join('')}
                          </div>
                        </div>

                        <div class="mission-row-card__action">
                          ${
                            m.claimable
                              ? `
                                <button
                                  type="button"
                                  class="btn btn-gold btn-sm"
                                  data-claim-mission="${m.id}"
                                >
                                  Claim
                                </button>
                              `
                              : m.claimed
                                ? `<span class="mission-state-tag is-claimed">Claimed</span>`
                                : `<span class="mission-state-tag is-progress">In Progress</span>`
                          }
                        </div>
                      </article>
                    `;
                  })
                  .join('')
          }
        </div>
      </div>
    `;

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
        const res = missionSystem.claimMission(category, missionId);
        if (res.ok) {
          audioManager?.playReward?.();
          const rewardText = formatRewardParts(res.rewards)
            .map((r) => r.label)
            .join(' · ');
          notify?.(`Reward claimed: ${rewardText}`, 'success');
        } else if (res.reason) {
          notify?.(res.reason, 'warn');
        }
      });
    }
  }

  _renderMainMissionView(bodyEl) {
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

    const rewardParts = selectedStage ? formatRewardParts(selectedStage.rewards) : [];
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

        <section class="chapter-detail-pane" aria-label="Selected Chapter Stages">
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
                                ${rewardParts
                                  .map(
                                    (r) => `<span class="mission-reward-item ${r.gold ? 'is-gold' : ''}">${r.label}</span>`,
                                  )
                                  .join('')}
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
  }
}
