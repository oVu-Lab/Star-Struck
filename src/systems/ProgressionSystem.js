/**
 * ProgressionSystem — Campaign stage selection, unlock state, stage ratings,
 * battle reward distribution with duplicate prevention, and player XP.
 */

const RATING_RANK = { S: 4, A: 3, B: 2, C: 1 };

export class ProgressionSystem {
  constructor({ dataRegistry, gameState, formationSystem = null, cardSystem = null, saveManager, eventBus }) {
    this._data = dataRegistry;
    this._state = gameState;
    this._formation = formationSystem;
    this._cards = cardSystem;
    this._save = saveManager;
    this._eventBus = eventBus;
    this._claimedSessions = new Set(this._state.progression?.claimedSessions || []);
  }

  getStages() {
    const unlocked = new Set(this._state.progression.unlockedStages);
    const cleared = new Set(this._state.progression.clearedStages);
    const ratings = this._state.progression.stageRatings || {};
    return this._data.stages.map((stage) => ({
      ...stage,
      unlocked: unlocked.has(stage.id) || (stage.unlockAfter ? cleared.has(stage.unlockAfter) : false),
      cleared: cleared.has(stage.id),
      bestRating: ratings[stage.id] || null,
    }));
  }

  isStageUnlocked(stageId) {
    const stage = this._data.stagesById.get(stageId);
    if (!stage) return false;
    if ((this._state.progression.unlockedStages || []).includes(stageId)) return true;
    if (stage.unlockAfter && (this._state.progression.clearedStages || []).includes(stage.unlockAfter)) {
      return true;
    }
    return false;
  }

  getSelectedStage() {
    const stageId = this._state.progression.selectedStageId;
    return this._data.stagesById.get(stageId) || this._data.stages[0] || null;
  }

  /**
   * Returns the furthest campaign stage currently unlocked according to saved progression.
   * Preserves chronological order from data/stages.json and never returns a locked stage.
   */
  getHighestUnlockedStage() {
    const stages = this.getStages();
    if (stages.length === 0) return null;
    const unlocked = stages.filter((s) => s.unlocked);
    return unlocked[unlocked.length - 1] || stages[0];
  }

  /**
   * Resolves which unlocked stage should be loaded for Battle entry:
   * - If an unlocked requestedStageId is provided, uses it and preserves explicit selection.
   * - If the player explicitly chose an unlocked stage via Main Missions / Formation / Next Stage,
   *   preserves that unlocked selection.
   * - Otherwise (fresh Battle entry / after page reload / after unlocking a new frontier stage),
   *   defaults to the highest currently unlocked stage.
   */
  resolveBattleEntryStage({
    requestedStageId = null,
    preserveSelected = null,
    sync = true,
  } = {}) {
    let resolved = null;
    let isExplicit = false;

    if (requestedStageId && this.isStageUnlocked(requestedStageId)) {
      resolved = this._data.stagesById.get(requestedStageId) || null;
      isExplicit = Boolean(resolved);
    }

    if (!resolved) {
      const pickedId = this._state.ui?.missionsPickedStageId;
      if (pickedId && this.isStageUnlocked(pickedId)) {
        resolved = this._data.stagesById.get(pickedId) || null;
        isExplicit = Boolean(resolved);
      }
    }

    if (!resolved) {
      const shouldPreserve =
        preserveSelected !== null
          ? Boolean(preserveSelected)
          : Boolean(this._state.ui?.battleStageExplicitlySelected);
      if (shouldPreserve) {
        const savedId = this._state.progression?.selectedStageId;
        if (savedId && this.isStageUnlocked(savedId)) {
          resolved = this._data.stagesById.get(savedId) || null;
          isExplicit = Boolean(resolved);
        }
      }
    }

    if (!resolved) {
      resolved = this.getHighestUnlockedStage();
      isExplicit = false;
    }

    if (resolved && !this.isStageUnlocked(resolved.id)) {
      resolved = this.getHighestUnlockedStage();
      isExplicit = false;
    }

    if (sync && resolved) {
      if (this._state.progression?.selectedStageId !== resolved.id) {
        this._state.mutatePersistent('progression', (draft) => {
          draft.progression.selectedStageId = resolved.id;
        });
        this._save?.save(this._state.toSerializableSave());
      }
      if (this._state.battle?.stageId !== resolved.id) {
        this._state.setBattle?.({ stageId: resolved.id });
      }
      if (this._state.setUI && this._state.ui) {
        const uiPatch = {};
        if (this._state.ui.missionsPickedStageId) {
          uiPatch.missionsPickedStageId = null;
        }
        if (Boolean(this._state.ui.battleStageExplicitlySelected) !== isExplicit) {
          uiPatch.battleStageExplicitlySelected = isExplicit;
        }
        if (Object.keys(uiPatch).length > 0) {
          this._state.setUI(uiPatch);
        }
      }
    }

    return resolved;
  }

  /**
   * Resolves the player's actual current campaign progression stage without mutating saved state.
   * Priority:
   * 1. Saved selectedStageId if unlocked and not yet cleared.
   * 2. Earliest unlocked, uncleared campaign stage (campaign frontier).
   * 3. Saved selectedStageId if unlocked (e.g. after clearing all stages).
   * 4. Last unlocked stage or first stage fallback.
   */
  getCurrentProgressionStage() {
    const stages = this.getStages();
    if (stages.length === 0) return null;

    const savedId = this._state.progression?.selectedStageId;
    const savedStage = stages.find((s) => s.id === savedId) || null;
    if (savedStage && savedStage.unlocked && !savedStage.cleared) {
      return savedStage;
    }

    const frontier = stages.find((s) => s.unlocked && !s.cleared) || null;
    if (frontier) {
      return frontier;
    }

    if (savedStage && savedStage.unlocked) {
      return savedStage;
    }

    const unlocked = stages.filter((s) => s.unlocked);
    return unlocked[unlocked.length - 1] || stages[0];
  }

  getCurrentProgressionChapter() {
    const current = this.getCurrentProgressionStage();
    return current?.chapter || 1;
  }

  /**
   * Returns chronologically ordered campaign chapters with derived status
   * ('completed' | 'current' | 'available' | 'locked') and chapter metadata.
   */
  getChapters() {
    const stages = this.getStages();
    const currentStage = this.getCurrentProgressionStage();
    const currentChapterNum = currentStage?.chapter || 1;
    const grouped = new Map();

    for (const stage of stages) {
      const chNum = Number(stage.chapter || 1);
      if (!grouped.has(chNum)) {
        grouped.set(chNum, []);
      }
      grouped.get(chNum).push(stage);
    }

    const chapterNums = Array.from(grouped.keys()).sort((a, b) => a - b);
    return chapterNums.map((chNum) => {
      const chStages = grouped.get(chNum) || [];
      const meta = this._data.chaptersByNumber?.get(chNum) || null;
      const firstStage = chStages[0] || null;
      const firstTerrain = firstStage?.terrainId
        ? this._data.terrainsById?.get(firstStage.terrainId)
        : null;

      const totalCount = chStages.length;
      const clearedCount = chStages.filter((s) => s.cleared).length;
      const unlockedCount = chStages.filter((s) => s.unlocked).length;
      const isCurrent = chNum === currentChapterNum;
      const allCleared = totalCount > 0 && clearedCount === totalCount;

      let status = 'available';
      if (unlockedCount === 0) {
        status = 'locked';
      } else if (isCurrent) {
        status = 'current';
      } else if (allCleared) {
        status = 'completed';
      }

      let unlockRequirement = null;
      if (status === 'locked' && firstStage?.unlockAfter) {
        const reqStage = this._data.stagesById.get(firstStage.unlockAfter);
        if (reqStage) {
          unlockRequirement = {
            stageId: reqStage.id,
            code: reqStage.code,
            name: reqStage.name,
            chapter: reqStage.chapter || 1,
          };
        }
      }

      return {
        chapter: chNum,
        title: meta?.title || firstStage?.chapterName || `Chapter ${chNum}`,
        realm: meta?.realm || firstTerrain?.realmTitle || firstTerrain?.name || 'Star Struck Realm',
        description:
          meta?.description ||
          firstStage?.description ||
          `Campaign operations across Chapter ${chNum}.`,
        artworkAssetId: meta?.artworkAssetId || firstStage?.backgroundAssetId || 'bg_battle_orbital_ridge',
        stages: chStages,
        totalCount,
        clearedCount,
        unlockedCount,
        progressPct: totalCount > 0 ? Math.round((clearedCount / totalCount) * 100) : 0,
        isCurrent,
        allCleared,
        status,
        unlockRequirement,
        currentStageId: isCurrent ? currentStage?.id || null : null,
      };
    });
  }

  selectStage(stageId, { explicit = true } = {}) {
    if (!this._data.stagesById.has(stageId)) {
      return { ok: false, reason: 'Unknown stage.' };
    }
    if (!this.isStageUnlocked(stageId)) {
      const stage = this._data.stagesById.get(stageId);
      const req = stage?.unlockAfter ? this._data.stagesById.get(stage.unlockAfter) : null;
      return {
        ok: false,
        reason: req ? `Clear Stage ${req.code} (${req.name}) first to unlock.` : 'Stage is locked.',
      };
    }
    this._state.mutatePersistent('progression', (draft) => {
      draft.progression.selectedStageId = stageId;
    });
    this._state.setBattle({ stageId });
    this._state.setUI?.({
      battleStageExplicitlySelected: Boolean(explicit),
      missionsPickedStageId: null,
    });
    this._save.save(this._state.toSerializableSave());
    this._eventBus?.emit('progression:stageSelected', { stageId });
    return { ok: true };
  }

  getNextStageId(currentStageId) {
    const idx = this._data.stages.findIndex((s) => s.id === currentStageId);
    if (idx >= 0 && idx + 1 < this._data.stages.length) {
      return this._data.stages[idx + 1].id;
    }
    return null;
  }

  /**
   * Builds the authoritative mapping of every non-default unlockable card ID
   * to the single earliest campaign stage that first unlocks it.
   */
  getCardFirstUnlockMap() {
    const map = new Map();
    for (const stage of this._data.stages || []) {
      const bonusUnits = Array.isArray(stage.rewards?.bonusUnits) ? stage.rewards.bonusUnits : [];
      const bonusCards = Array.isArray(stage.rewards?.bonusCards) ? stage.rewards.bonusCards : [];

      for (const uid of bonusUnits) {
        const unitDef = this._data.unitsById?.get(uid);
        if (!unitDef || unitDef.unlockedByDefault !== false) continue;
        const cardId = unitDef.cardId || null;
        if (!cardId) continue;
        const cardDef = this._data.cardsById?.get(cardId);
        if (cardDef && cardDef.unlockedByDefault !== false) continue;
        if (!map.has(cardId)) {
          map.set(cardId, {
            stageId: stage.id,
            code: stage.code,
            stageName: stage.name,
            chapter: stage.chapter || 1,
            kind: 'unit',
            unitId: uid,
            cardId,
            name: unitDef.name || cardDef?.name || uid,
          });
        }
      }

      for (const cid of bonusCards) {
        const cardDef = this._data.cardsById?.get(cid);
        if (!cardDef || cardDef.unlockedByDefault !== false) continue;
        if (!map.has(cid)) {
          const isUnitCard = cardDef.category === 'unit' && Boolean(cardDef.unitId);
          const unitDef = isUnitCard ? this._data.unitsById?.get(cardDef.unitId) : null;
          map.set(cid, {
            stageId: stage.id,
            code: stage.code,
            stageName: stage.name,
            chapter: stage.chapter || 1,
            kind: isUnitCard ? 'unit' : 'card',
            unitId: isUnitCard ? cardDef.unitId : null,
            cardId: cid,
            name: unitDef?.name || cardDef.name || cid,
          });
        }
      }
    }
    return map;
  }

  /**
   * Returns deduplicated, authoritative first-unlock entries assigned to `stageId`.
   * Excludes default-unlocked cards and any cards already assigned to an earlier stage.
   */
  getStageConfiguredUnlocks(stageId) {
    const stage = this._data.stagesById?.get(stageId);
    if (!stage) return [];

    const firstUnlockMap = this.getCardFirstUnlockMap();
    const entries = [];
    const seenCardIds = new Set();
    const seenNames = new Set();

    const addEntry = (entry) => {
      if (!entry || !entry.cardId) return;
      const firstStage = firstUnlockMap.get(entry.cardId);
      if (!firstStage || firstStage.stageId !== stageId) return;
      if (seenCardIds.has(entry.cardId)) return;
      const normName = String(entry.name || '').trim().toLowerCase();
      if (normName && seenNames.has(normName)) return;
      seenCardIds.add(entry.cardId);
      if (normName) seenNames.add(normName);
      entries.push(entry);
    };

    for (const uid of stage.rewards?.bonusUnits || []) {
      const unitDef = this._data.unitsById?.get(uid);
      if (!unitDef || unitDef.unlockedByDefault !== false) continue;
      const cardId = unitDef.cardId || null;
      const cardDef = cardId ? this._data.cardsById?.get(cardId) : null;
      addEntry({
        kind: 'unit',
        id: uid,
        unitId: uid,
        cardId,
        name: unitDef.name || cardDef?.name || uid,
      });
    }

    for (const cid of stage.rewards?.bonusCards || []) {
      const cardDef = this._data.cardsById?.get(cid);
      if (!cardDef || cardDef.unlockedByDefault !== false) continue;
      const isUnitCard = cardDef.category === 'unit' && Boolean(cardDef.unitId);
      const unitDef = isUnitCard ? this._data.unitsById?.get(cardDef.unitId) : null;
      addEntry({
        kind: isUnitCard ? 'unit' : 'card',
        id: isUnitCard ? cardDef.unitId : cid,
        unitId: isUnitCard ? cardDef.unitId : null,
        cardId: cid,
        name: unitDef?.name || cardDef.name || cid,
      });
    }

    return entries;
  }

  /**
   * Single source of truth for both UI unlock display and battle reward unlocking.
   * Filters out cards/units already unlocked by the player (defaults, earlier clears, or Gacha).
   */
  getStageUnlockInfo(stageId) {
    const isCleared = (this._state.progression?.clearedStages || []).includes(stageId);
    const configuredUnlocks = this.getStageConfiguredUnlocks(stageId);
    const unlockedCardsSet = new Set(this._state.progression?.unlockedCards || []);
    const ownedUnits = this._state.units?.owned || {};

    const isEntryOwned = (entry) => {
      const cardDef = entry.cardId ? this._data.cardsById?.get(entry.cardId) : null;
      const cardUnlocked =
        !entry.cardId ||
        unlockedCardsSet.has(entry.cardId) ||
        Boolean(cardDef && cardDef.unlockedByDefault !== false);
      if (entry.kind === 'unit' && entry.unitId) {
        return Boolean(ownedUnits[entry.unitId]) && cardUnlocked;
      }
      return cardUnlocked;
    };

    const availableUnlocks = isCleared
      ? []
      : configuredUnlocks.filter((entry) => !isEntryOwned(entry));
    const alreadyUnlocked = isCleared
      ? [...configuredUnlocks]
      : configuredUnlocks.filter((entry) => isEntryOwned(entry));

    return {
      stageId,
      isCleared,
      configuredUnlocks,
      availableUnlocks,
      alreadyUnlocked,
      hasConfiguredUnlocks: configuredUnlocks.length > 0,
      hasAvailableUnlocks: !isCleared && availableUnlocks.length > 0,
    };
  }

  grantPlayerXp(amount) {
    if (!amount || amount <= 0) return;
    this._state.mutatePersistent('player', (draft) => {
      draft.player.xp += amount;
      while (draft.player.xp >= draft.player.xpToNext) {
        draft.player.xp -= draft.player.xpToNext;
        draft.player.level += 1;
        draft.player.xpToNext = Math.round(draft.player.xpToNext * 1.25);
      }
    });
    this._save.save(this._state.toSerializableSave());
  }

  computeStageRating({ victory, survivorRatio = 0, durationSec = 999 }) {
    if (!victory) return '—';
    const r = this._data.balance?.ratings || {};
    const sCfg = r.S || { minSurvivorRatio: 0.72, maxDurationSec: 180 };
    const aCfg = r.A || { minSurvivorRatio: 0.42, maxDurationSec: 240 };
    const bCfg = r.B || { minSurvivorRatio: 0.15, maxDurationSec: 330 };

    if (survivorRatio >= sCfg.minSurvivorRatio && durationSec <= sCfg.maxDurationSec) return 'S';
    if (survivorRatio >= aCfg.minSurvivorRatio && durationSec <= aCfg.maxDurationSec) return 'A';
    if (survivorRatio >= bCfg.minSurvivorRatio && durationSec <= bCfg.maxDurationSec) return 'B';
    return 'C';
  }

  /**
   * Records a battle outcome and applies rewards strictly once per battle sessionId
   * (persisted in claimedSessions to prevent duplicate rewards even across reloads).
   */
  recordBattleOutcome({
    sessionId,
    stageId,
    victory,
    rating = 'C',
    enemiesDefeated = 0,
    economySystem = null,
    heroSystem = null,
  }) {
    if (!sessionId) {
      return { applied: false, reason: 'Missing sessionId.' };
    }
    const persistedClaimed = this._state.progression?.claimedSessions || [];
    if (this._claimedSessions.has(sessionId) || persistedClaimed.includes(sessionId)) {
      return { applied: false, duplicate: true, reason: 'Rewards already applied for this battle.' };
    }
    this._claimedSessions.add(sessionId);

    const stage = this._data.stagesById.get(stageId);
    const stageRewards = stage?.rewards || {};
    const progCfg = this._data.balance?.progression || {};
    const repeatCreditRatio = progCfg.repeatClearCreditRatio ?? 0.7;
    const repeatAstriteRatio = progCfg.repeatClearAstriteRatio ?? 0.35;

    const granted = {
      credits: 0,
      astrite: 0,
      playerXp: 0,
      heroXp: 0,
      unitXp: 0,
      materials: [],
      bonusCards: [],
      bonusUnits: [],
    };

    const isFirstClear =
      victory && !(this._state.progression.clearedStages || []).includes(stageId);

    if (victory) {
      granted.credits = isFirstClear
        ? stageRewards.credits || 0
        : Math.round((stageRewards.credits || 0) * repeatCreditRatio);
      granted.astrite = isFirstClear
        ? stageRewards.astrite || 0
        : Math.round((stageRewards.astrite || 0) * repeatAstriteRatio);
      granted.playerXp = stageRewards.playerXp || 0;
      granted.heroXp = stageRewards.heroXp || 50;
      granted.unitXp = stageRewards.unitXp || 40;
      granted.materials = (stageRewards.materials || []).map((m) => ({
        ...m,
        quantity: isFirstClear ? m.quantity : Math.max(1, Math.floor(m.quantity * 0.5)),
      }));
      const unlockInfo = isFirstClear ? this.getStageUnlockInfo(stageId) : null;
      granted.bonusUnits = unlockInfo
        ? unlockInfo.availableUnlocks.filter((u) => u.kind === 'unit' && u.unitId).map((u) => u.unitId)
        : [];
      granted.bonusCards = unlockInfo
        ? unlockInfo.availableUnlocks.filter((u) => u.kind === 'card' && u.cardId).map((u) => u.cardId)
        : [];
    } else {
      // Consolation battle participation reward on defeat
      granted.credits = Math.round((stageRewards.credits || 200) * 0.2);
      granted.playerXp = Math.round((stageRewards.playerXp || 40) * 0.25);
      granted.heroXp = Math.round((stageRewards.heroXp || 40) * 0.25);
      granted.unitXp = Math.round((stageRewards.unitXp || 40) * 0.25);
    }

    // Apply currencies via EconomySystem if available, else directly
    if (economySystem) {
      if (granted.credits > 0) economySystem.grant('credits', granted.credits);
      if (granted.astrite > 0) economySystem.grant('astrite', granted.astrite);
    } else {
      this._state.mutatePersistent('resources', (draft) => {
        draft.resources.credits += granted.credits;
        draft.resources.astrite += granted.astrite;
      });
    }

    // Player XP
    if (granted.playerXp > 0) {
      this.grantPlayerXp(granted.playerXp);
    }

    // Active Commander XP
    if (granted.heroXp > 0 && heroSystem?.grantCommanderXp) {
      heroSystem.grantCommanderXp(this._state.formation.commanderId, granted.heroXp);
    }

    // Active Squad Unit XP
    if (granted.unitXp > 0 && this._formation?.grantUnitXp) {
      const uniqueSlots = Array.from(new Set(this._state.formation?.unitSlots || []));
      for (const uid of uniqueSlots) {
        this._formation.grantUnitXp(uid, granted.unitXp);
      }
    }

    let unlockedNewStage = false;

    // Persistent progression, inventory materials, unlocked bonus cards & bonus units
    this._state.mutatePersistent('progression', (draft) => {
      if (!Array.isArray(draft.progression.claimedSessions)) {
        draft.progression.claimedSessions = [];
      }
      draft.progression.claimedSessions.push(sessionId);
      if (draft.progression.claimedSessions.length > 60) {
        draft.progression.claimedSessions = draft.progression.claimedSessions.slice(-60);
      }

      if (!draft.progression.battleStats) {
        draft.progression.battleStats = { battlesPlayed: 0, battlesWon: 0, totalEnemiesDefeated: 0 };
      }
      draft.progression.battleStats.battlesPlayed += 1;
      draft.progression.battleStats.totalEnemiesDefeated += Math.max(0, enemiesDefeated);

      if (victory) {
        draft.progression.battleStats.battlesWon += 1;
        if (!draft.progression.clearedStages.includes(stageId)) {
          draft.progression.clearedStages.push(stageId);
        }
        // Unlock next stage & any stages gated on unlockAfter === stageId
        const nextStageId = this.getNextStageId(stageId);
        if (nextStageId && !draft.progression.unlockedStages.includes(nextStageId)) {
          draft.progression.unlockedStages.push(nextStageId);
          unlockedNewStage = true;
        }
        for (const candidate of this._data.stages) {
          if (
            candidate.unlockAfter === stageId &&
            !draft.progression.unlockedStages.includes(candidate.id)
          ) {
            draft.progression.unlockedStages.push(candidate.id);
            unlockedNewStage = true;
          }
        }
        if (!draft.progression.stageRatings) draft.progression.stageRatings = {};
        const prev = draft.progression.stageRatings[stageId];
        if (!prev || (RATING_RANK[rating] || 0) > (RATING_RANK[prev] || 0)) {
          draft.progression.stageRatings[stageId] = rating;
        }
        if (!Array.isArray(draft.progression.unlockedCards)) {
          draft.progression.unlockedCards = [];
        }
        for (const cid of granted.bonusCards) {
          if (!draft.progression.unlockedCards.includes(cid)) {
            draft.progression.unlockedCards.push(cid);
          }
        }
        // Unlock bonus units and their matching unit cards
        if (granted.bonusUnits.length > 0) {
          if (!draft.units) draft.units = { owned: {} };
          if (!draft.units.owned) draft.units.owned = {};
          for (const uid of granted.bonusUnits) {
            if (!draft.units.owned[uid]) {
              draft.units.owned[uid] = { id: uid, level: 1, xp: 0 };
            }
            const unitDef = this._data.unitsById.get(uid);
            if (unitDef?.cardId && !draft.progression.unlockedCards.includes(unitDef.cardId)) {
              draft.progression.unlockedCards.push(unitDef.cardId);
            }
          }
        }
      }

      // Grant upgrade materials to inventory
      for (const mat of granted.materials) {
        const existing = draft.inventory.items.find((it) => it.id === mat.id);
        if (existing) {
          existing.quantity += mat.quantity;
        } else {
          draft.inventory.items.push({
            id: mat.id,
            name: mat.name,
            category: mat.category || 'materials',
            quantity: mat.quantity,
            description: mat.description || 'Battle reward upgrade material.',
          });
        }
      }
    });

    if (unlockedNewStage && this._state.setUI) {
      this._state.setUI({
        battleStageExplicitlySelected: false,
        missionsPickedStageId: null,
      });
    }

    this._save.save(this._state.toSerializableSave());
    this._eventBus?.emit('progression:battleRecorded', {
      sessionId,
      stageId,
      victory,
      rating,
      enemiesDefeated: Math.max(0, enemiesDefeated),
      rewards: granted,
    });

    return { applied: true, isFirstClear, rewards: granted };
  }
}
