/**
 * MissionSystem — Unified data-driven mission tracker, UTC date-based Daily/Weekly
 * reset manager, explicit Seasonal event evaluator, and reward claim distributor.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Returns deterministic UTC date key: YYYY-MM-DD
 */
export function getDailyPeriodKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns deterministic ISO-8601 UTC week key (Monday start): YYYY-Www
 */
export function getWeeklyPeriodKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = utc.getUTCDay() || 7; // Mon=1..Sun=7
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utc - yearStart) / DAY_MS + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Returns next UTC midnight (00:00:00Z).
 */
export function getNextDailyResetDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0));
}

/**
 * Returns next UTC Monday 00:00:00Z.
 */
export function getNextWeeklyResetDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const dayOfWeek = d.getUTCDay(); // Sun=0, Mon=1..Sat=6
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysUntilMonday, 0, 0, 0, 0),
  );
}

/**
 * Formats a positive millisecond duration into a compact readable countdown.
 */
export function formatResetCountdown(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalMinutes = Math.floor(safeMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${Math.max(1, minutes)}m`;
}

export class MissionSystem {
  constructor({
    dataRegistry,
    gameState,
    economySystem,
    progressionSystem,
    saveManager,
    eventBus,
    clock = () => new Date(),
  }) {
    this._data = dataRegistry;
    this._state = gameState;
    this._economy = economySystem;
    this._progression = progressionSystem;
    this._save = saveManager;
    this._eventBus = eventBus;
    this._clock = clock;
    this._unsubs = [];

    this.ensureResets();
    this._bindEventListeners();
  }

  _now(overrideNow = null) {
    if (overrideNow instanceof Date) return overrideNow;
    if (overrideNow !== null && overrideNow !== undefined) return new Date(overrideNow);
    return this._clock();
  }

  _bindEventListeners() {
    if (!this._eventBus) return;

    this._unsubs.push(
      this._eventBus.on('progression:battleRecorded', (payload) => {
        if (!payload) return;
        const updates = [{ metric: 'battles_played', amount: 1 }];
        if (payload.victory) {
          updates.push({ metric: 'battles_won', amount: 1 });
        }
        if (typeof payload.enemiesDefeated === 'number' && payload.enemiesDefeated > 0) {
          updates.push({ metric: 'enemies_defeated', amount: payload.enemiesDefeated });
        }
        this.recordMetricsBatch(updates);
      }),
      this._eventBus.on('cards:merged', () => {
        this.recordMetric('cards_merged', 1);
      }),
      this._eventBus.on('cards:played', () => {
        this.recordMetric('cards_played', 1);
      }),
      this._eventBus.on('commander:ultimateActivated', () => {
        this.recordMetric('ultimates_used', 1);
      }),
      this._eventBus.on('gacha:pulled', (payload) => {
        const count = Number(payload?.count || payload?.results?.length || 1);
        if (count > 0) this.recordMetric('summons_performed', count);
      }),
      this._eventBus.on('formation:unitUpgraded', () => {
        this.recordMetric('units_upgraded', 1);
      }),
    );
  }

  destroy() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
  }

  _ensureMissionStateContainer() {
    if (!this._state.persistent.missions || typeof this._state.persistent.missions !== 'object') {
      this._state.mutatePersistent('missions', (draft) => {
        draft.missions = {
          daily: { periodKey: '', progress: {}, claimed: [] },
          weekly: { periodKey: '', progress: {}, claimed: [] },
          seasonal: {},
        };
      });
    }
    return this._state.persistent.missions;
  }

  /**
   * Checks current UTC date/week keys and resets Daily or Weekly mission buckets
   * whenever a period boundary has crossed.
   */
  ensureResets(nowOverride = null) {
    const now = this._now(nowOverride);
    const dailyKey = getDailyPeriodKey(now);
    const weeklyKey = getWeeklyPeriodKey(now);
    const store = this._ensureMissionStateContainer();

    const dailyChanged = store.daily?.periodKey !== dailyKey;
    const weeklyChanged = store.weekly?.periodKey !== weeklyKey;

    if (!dailyChanged && !weeklyChanged) {
      return { dailyReset: false, weeklyReset: false, dailyKey, weeklyKey };
    }

    this._state.mutatePersistent('missions', (draft) => {
      if (!draft.missions) {
        draft.missions = {
          daily: { periodKey: '', progress: {}, claimed: [] },
          weekly: { periodKey: '', progress: {}, claimed: [] },
          seasonal: {},
        };
      }
      if (dailyChanged) {
        draft.missions.daily = {
          periodKey: dailyKey,
          progress: {},
          claimed: [],
        };
      }
      if (weeklyChanged) {
        draft.missions.weekly = {
          periodKey: weeklyKey,
          progress: {},
          claimed: [],
        };
      }
      if (!draft.missions.seasonal || typeof draft.missions.seasonal !== 'object') {
        draft.missions.seasonal = {};
      }
    });

    this._save?.save(this._state.toSerializableSave());
    this._eventBus?.emit('missions:reset', {
      dailyReset: dailyChanged,
      weeklyReset: weeklyChanged,
      dailyKey,
      weeklyKey,
    });

    return { dailyReset: dailyChanged, weeklyReset: weeklyChanged, dailyKey, weeklyKey };
  }

  getConfiguredSeasonalEvents() {
    return this._data.missions?.seasonalEvents || [];
  }

  /**
   * Returns the currently active seasonal event strictly based on explicit startAt/endAt config.
   * Returns null when no event is configured or active.
   */
  getActiveSeasonalEvent(nowOverride = null) {
    const nowMs = this._now(nowOverride).getTime();
    const events = this.getConfiguredSeasonalEvents();
    for (const ev of events) {
      const startMs = Date.parse(ev.startAt);
      const endMs = Date.parse(ev.endAt);
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && nowMs >= startMs && nowMs < endMs) {
        return ev;
      }
    }
    return null;
  }

  /**
   * Returns the earliest future scheduled seasonal event, if any is explicitly configured.
   */
  getUpcomingSeasonalEvent(nowOverride = null) {
    const nowMs = this._now(nowOverride).getTime();
    const upcoming = this.getConfiguredSeasonalEvents()
      .filter((ev) => {
        const startMs = Date.parse(ev.startAt);
        return Number.isFinite(startMs) && startMs > nowMs;
      })
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
    return upcoming[0] || null;
  }

  recordMetric(metric, amount = 1, nowOverride = null) {
    return this.recordMetricsBatch([{ metric, amount }], nowOverride);
  }

  recordMetricsBatch(updates = [], nowOverride = null) {
    const valid = updates.filter(
      (u) => u && typeof u.metric === 'string' && typeof u.amount === 'number' && u.amount > 0,
    );
    if (valid.length === 0) return false;

    const now = this._now(nowOverride);
    this.ensureResets(now);
    const activeSeasonal = this.getActiveSeasonalEvent(now);

    this._state.mutatePersistent('missions', (draft) => {
      for (const { metric, amount } of valid) {
        const add = Math.floor(amount);
        if (add <= 0) continue;

        if (!draft.missions.daily.progress) draft.missions.daily.progress = {};
        draft.missions.daily.progress[metric] = (draft.missions.daily.progress[metric] || 0) + add;

        if (!draft.missions.weekly.progress) draft.missions.weekly.progress = {};
        draft.missions.weekly.progress[metric] = (draft.missions.weekly.progress[metric] || 0) + add;

        if (activeSeasonal) {
          if (!draft.missions.seasonal) draft.missions.seasonal = {};
          if (!draft.missions.seasonal[activeSeasonal.id]) {
            draft.missions.seasonal[activeSeasonal.id] = { progress: {}, claimed: [] };
          }
          const sProg = draft.missions.seasonal[activeSeasonal.id].progress;
          sProg[metric] = (sProg[metric] || 0) + add;
        }
      }
    });

    this._save?.save(this._state.toSerializableSave());
    this._eventBus?.emit('missions:updated', { updates: valid });
    return true;
  }

  _getBucketForCategory(category, now) {
    const store = this._ensureMissionStateContainer();
    if (category === 'daily') {
      return {
        defs: this._data.missions?.daily || [],
        bucket: store.daily || { periodKey: getDailyPeriodKey(now), progress: {}, claimed: [] },
        event: null,
      };
    }
    if (category === 'weekly') {
      return {
        defs: this._data.missions?.weekly || [],
        bucket: store.weekly || { periodKey: getWeeklyPeriodKey(now), progress: {}, claimed: [] },
        event: null,
      };
    }
    if (category === 'seasonal') {
      const activeEvent = this.getActiveSeasonalEvent(now);
      if (!activeEvent) {
        return { defs: [], bucket: { progress: {}, claimed: [] }, event: null };
      }
      const bucket = store.seasonal?.[activeEvent.id] || { progress: {}, claimed: [] };
      return {
        defs: activeEvent.missions || [],
        bucket,
        event: activeEvent,
      };
    }
    return { defs: [], bucket: { progress: {}, claimed: [] }, event: null };
  }

  getMissions(category, nowOverride = null) {
    const now = this._now(nowOverride);
    if (category === 'daily' || category === 'weekly') {
      this.ensureResets(now);
    }
    const { defs, bucket } = this._getBucketForCategory(category, now);
    const progressMap = bucket.progress || {};
    const claimedSet = new Set(bucket.claimed || []);

    return defs.map((def) => {
      const rawProgress = Math.max(0, Number(progressMap[def.metric] || 0));
      const target = Math.max(1, Number(def.target || 1));
      const progress = Math.min(rawProgress, target);
      const completed = rawProgress >= target;
      const claimed = claimedSet.has(def.id);
      const claimable = completed && !claimed;
      const pct = Math.min(100, Math.round((progress / target) * 100));

      return {
        ...def,
        category,
        progress,
        rawProgress,
        target,
        pct,
        completed,
        claimed,
        claimable,
      };
    });
  }

  getCategorySummary(category, nowOverride = null) {
    const now = this._now(nowOverride);
    if (category === 'daily' || category === 'weekly') {
      this.ensureResets(now);
    }

    const missions = this.getMissions(category, now);
    const totalCount = missions.length;
    const completedCount = missions.filter((m) => m.completed).length;
    const claimedCount = missions.filter((m) => m.claimed).length;
    const claimableCount = missions.filter((m) => m.claimable).length;

    let periodKey = '';
    let resetAt = null;
    let msRemaining = 0;
    let resetLabel = '';
    let event = null;
    let upcomingEvent = null;

    if (category === 'daily') {
      periodKey = getDailyPeriodKey(now);
      resetAt = getNextDailyResetDate(now);
      msRemaining = Math.max(0, resetAt.getTime() - now.getTime());
      resetLabel = `Resets in ${formatResetCountdown(msRemaining)} (00:00 UTC)`;
    } else if (category === 'weekly') {
      periodKey = getWeeklyPeriodKey(now);
      resetAt = getNextWeeklyResetDate(now);
      msRemaining = Math.max(0, resetAt.getTime() - now.getTime());
      resetLabel = `Resets in ${formatResetCountdown(msRemaining)} (Mon 00:00 UTC)`;
    } else if (category === 'seasonal') {
      event = this.getActiveSeasonalEvent(now);
      if (event) {
        periodKey = event.id;
        resetAt = new Date(event.endAt);
        msRemaining = Math.max(0, resetAt.getTime() - now.getTime());
        resetLabel = `Ends in ${formatResetCountdown(msRemaining)}`;
      } else {
        upcomingEvent = this.getUpcomingSeasonalEvent(now);
        resetLabel = 'No Active Event';
      }
    }

    return {
      category,
      periodKey,
      resetAt,
      msRemaining,
      resetLabel,
      event,
      upcomingEvent,
      missions,
      totalCount,
      completedCount,
      claimedCount,
      claimableCount,
    };
  }

  getClaimableCount(category = null, nowOverride = null) {
    const now = this._now(nowOverride);
    if (category) {
      return this.getMissions(category, now).filter((m) => m.claimable).length;
    }
    return (
      this.getClaimableCount('daily', now) +
      this.getClaimableCount('weekly', now) +
      this.getClaimableCount('seasonal', now)
    );
  }

  /**
   * Claims rewards for a completed mission strictly once per period/event.
   */
  claimMission(category, missionId, nowOverride = null) {
    const now = this._now(nowOverride);
    if (category === 'daily' || category === 'weekly') {
      this.ensureResets(now);
    }

    const { defs, bucket, event } = this._getBucketForCategory(category, now);
    if (category === 'seasonal' && !event) {
      return { ok: false, reason: 'No active seasonal event.' };
    }

    const def = defs.find((m) => m.id === missionId);
    if (!def) {
      return { ok: false, reason: 'Unknown mission.' };
    }

    const claimedList = bucket.claimed || [];
    if (claimedList.includes(missionId)) {
      return { ok: false, duplicate: true, reason: 'Reward already claimed.' };
    }

    const rawProgress = Math.max(0, Number(bucket.progress?.[def.metric] || 0));
    if (rawProgress < def.target) {
      return { ok: false, reason: 'Mission objectives are not yet complete.' };
    }

    const rewards = def.rewards || {};
    const granted = {
      credits: Math.max(0, Math.floor(rewards.credits || 0)),
      astrite: Math.max(0, Math.floor(rewards.astrite || 0)),
      playerXp: Math.max(0, Math.floor(rewards.playerXp || 0)),
      materials: Array.isArray(rewards.materials) ? rewards.materials.map((m) => ({ ...m })) : [],
    };

    // Mark claimed first inside persistent state (and grant materials atomically)
    this._state.mutatePersistent('missions', (draft) => {
      if (category === 'daily') {
        if (!Array.isArray(draft.missions.daily.claimed)) draft.missions.daily.claimed = [];
        draft.missions.daily.claimed.push(missionId);
      } else if (category === 'weekly') {
        if (!Array.isArray(draft.missions.weekly.claimed)) draft.missions.weekly.claimed = [];
        draft.missions.weekly.claimed.push(missionId);
      } else if (category === 'seasonal' && event) {
        if (!draft.missions.seasonal) draft.missions.seasonal = {};
        if (!draft.missions.seasonal[event.id]) {
          draft.missions.seasonal[event.id] = { progress: {}, claimed: [] };
        }
        draft.missions.seasonal[event.id].claimed.push(missionId);
      }

      for (const mat of granted.materials) {
        const qty = Math.max(0, Math.floor(mat.quantity || 0));
        if (!mat.id || qty <= 0) continue;
        const existing = draft.inventory.items.find((it) => it.id === mat.id);
        if (existing) {
          existing.quantity += qty;
        } else {
          draft.inventory.items.push({
            id: mat.id,
            name: mat.name || mat.id,
            category: mat.category || 'materials',
            quantity: qty,
            description: mat.description || 'Mission reward material.',
          });
        }
      }
    });

    // Grant currencies through EconomySystem
    if (this._economy) {
      if (granted.credits > 0) this._economy.grant('credits', granted.credits);
      if (granted.astrite > 0) this._economy.grant('astrite', granted.astrite);
    } else {
      this._state.mutatePersistent('resources', (draft) => {
        draft.resources.credits += granted.credits;
        draft.resources.astrite += granted.astrite;
      });
    }

    // Grant Commander XP through ProgressionSystem
    if (granted.playerXp > 0) {
      if (this._progression?.grantPlayerXp) {
        this._progression.grantPlayerXp(granted.playerXp);
      } else {
        this._state.mutatePersistent('player', (draft) => {
          draft.player.xp += granted.playerXp;
        });
      }
    }

    this._save?.save(this._state.toSerializableSave());
    this._eventBus?.emit('missions:claimed', {
      category,
      missionId,
      eventId: event?.id || null,
      rewards: granted,
    });

    return { ok: true, missionId, category, rewards: granted };
  }

  claimAllClaimable(category, nowOverride = null) {
    const now = this._now(nowOverride);
    const claimable = this.getMissions(category, now).filter((m) => m.claimable);
    const claimedIds = [];
    const totals = { credits: 0, astrite: 0, playerXp: 0, materials: [] };

    for (const mission of claimable) {
      const res = this.claimMission(category, mission.id, now);
      if (res.ok) {
        claimedIds.push(mission.id);
        totals.credits += res.rewards.credits;
        totals.astrite += res.rewards.astrite;
        totals.playerXp += res.rewards.playerXp;
        for (const mat of res.rewards.materials) {
          const found = totals.materials.find((x) => x.id === mat.id);
          if (found) found.quantity += mat.quantity;
          else totals.materials.push({ ...mat });
        }
      }
    }

    return { ok: claimedIds.length > 0, count: claimedIds.length, claimedIds, rewards: totals };
  }
}
