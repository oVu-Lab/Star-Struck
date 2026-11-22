/**
 * TutorialManager — Orchestrates the 9-step one-action-at-a-time interactive
 * first-battle tutorial covering card slots, timed automatic refill, Level I->II->III
 * position-independent merging, combat, skills, and Commander Ultimates.
 * Uses real CardSystem, BattleManager, and EventBus events.
 */

import { createTutorialStageConfig } from '../battle/TutorialBattleConfig.js';
import { TutorialOverlay } from '../ui/TutorialOverlay.js';

export const TUTORIAL_STAGE_KEYS = Object.freeze({
  SELECT_UNIT: 'stage_1_select_unit',
  DEPLOY_UNIT: 'stage_2_deploy_unit',
  CARD_REFILL: 'stage_3_card_refill',
  MERGE_LV1: 'stage_4_merge_lv1',
  MERGE_LV2: 'stage_5_merge_lv2',
  AUTO_COMBAT: 'stage_6_auto_combat',
  SKILL_CARDS: 'stage_7_skill_cards',
  COMMANDER_ULTIMATE: 'stage_8_commander_ultimate',
  FINISH_BATTLE: 'stage_9_finish_battle',
  COMPLETE: 'stage_complete',
});

export const TUTORIAL_STAGE_ORDER = Object.freeze([
  TUTORIAL_STAGE_KEYS.SELECT_UNIT,
  TUTORIAL_STAGE_KEYS.DEPLOY_UNIT,
  TUTORIAL_STAGE_KEYS.CARD_REFILL,
  TUTORIAL_STAGE_KEYS.MERGE_LV1,
  TUTORIAL_STAGE_KEYS.MERGE_LV2,
  TUTORIAL_STAGE_KEYS.AUTO_COMBAT,
  TUTORIAL_STAGE_KEYS.SKILL_CARDS,
  TUTORIAL_STAGE_KEYS.COMMANDER_ULTIMATE,
  TUTORIAL_STAGE_KEYS.FINISH_BATTLE,
]);

export const TUTORIAL_TOTAL_STEPS = TUTORIAL_STAGE_ORDER.length;

export class TutorialManager {
  constructor({
    gameState,
    saveManager = null,
    eventBus,
    battleManager,
    cardSystem,
    heroSystem,
    unitManager,
    dataRegistry = null,
    audioManager = null,
    notify = null,
  }) {
    this._state = gameState;
    this._save = saveManager;
    this._eventBus = eventBus;
    this._battleManager = battleManager;
    this._cards = cardSystem;
    this._heroes = heroSystem;
    this._units = unitManager;
    this._data = dataRegistry;
    this._audio = audioManager;
    this._notify = notify;

    this._active = false;
    this._isReplay = false;
    this._currentStage = null;
    this._subStep = null;
    this._combatObserved = false;
    this._refillObserved = false;
    this._combatStageStartElapsed = 0;
    this._combatEventCount = 0;
    this._skipConfirmOpen = false;
    this._container = null;
    this._battleScreen = null;
    this._overlay = null;
    this._unsubs = [];
    this._stageConfig = null;
    this._unitTargetSlot = 0;
    this._refillTargetSlot = 0;
    this._skillTargetSlot = 5;
  }

  getTutorialState() {
    return (
      this._state?.persistent?.tutorial || {
        completed: false,
        skipped: false,
        completedAt: null,
      }
    );
  }

  isCompleted() {
    return Boolean(this.getTutorialState().completed);
  }

  isSkipped() {
    return Boolean(this.getTutorialState().skipped);
  }

  shouldAutoLaunch() {
    return !this.isCompleted() && !this.isSkipped();
  }

  shouldLaunch(params = {}) {
    if (params && params.tutorial === true) return true;
    if (params && params.tutorial === false) return false;
    return this.shouldAutoLaunch();
  }

  isActive() {
    return this._active;
  }

  isSkipConfirmOpen() {
    return this._skipConfirmOpen;
  }

  getCurrentStage() {
    return this._currentStage;
  }

  getSubStep() {
    return this._subStep;
  }

  getStepNumber() {
    const idx = TUTORIAL_STAGE_ORDER.indexOf(this._currentStage);
    return idx >= 0 ? idx + 1 : TUTORIAL_TOTAL_STEPS;
  }

  markCompleted() {
    if (!this._state) return;
    this._state.mutatePersistent('tutorial', (draft) => {
      draft.tutorial = {
        completed: true,
        skipped: false,
        completedAt: new Date().toISOString(),
      };
    });
    this._save?.save(this._state.toSerializableSave());
    this._eventBus?.emit('tutorial:completed', {
      tutorial: this.getTutorialState(),
    });
  }

  markSkipped() {
    if (!this._state) return;
    const prevCompleted = this.isCompleted();
    const prevCompletedAt = this.getTutorialState().completedAt || null;
    this._state.mutatePersistent('tutorial', (draft) => {
      draft.tutorial = {
        completed: prevCompleted,
        skipped: true,
        completedAt: prevCompletedAt,
      };
    });
    this._save?.save(this._state.toSerializableSave());
    this._eventBus?.emit('tutorial:skipped', {
      tutorial: this.getTutorialState(),
    });
  }

  /**
   * Launches the dedicated deterministic Tutorial Battle session and begins
   * immediately at Step 1 without altering the player's saved deck or collection.
   */
  startSession({ container = null, battleScreen = null, isReplay = false } = {}) {
    this.abortSession();

    this._active = true;
    this._isReplay = Boolean(isReplay);
    this._container = container;
    this._battleScreen = battleScreen;
    this._skipConfirmOpen = false;
    this._stageConfig = createTutorialStageConfig();

    const canvas = container?.querySelector?.('#battle-canvas') || null;
    this._battleManager.startSession(canvas, {
      stageConfig: this._stageConfig,
      isTutorial: true,
    });

    this._battleManager.beginBattle();
    this._battleManager.stepSimulation(1.0);
    this._battleManager.setTutorialCombatPaused(true);
    this._battleManager.setTutorialRefillPaused(false);
    this._battleManager.setTutorialProtectEnemies(true);

    const overlayRoot = container?.querySelector?.('#tutorial-overlay-root') || null;
    if (overlayRoot) {
      this._overlay = new TutorialOverlay({
        rootEl: overlayRoot,
        containerEl: container,
        battleManager: this._battleManager,
        onContinue: () => this.continueCurrentStage(),
        onRequestSkip: () => this.openSkipConfirm(),
        onCancelSkip: () => this.cancelSkipConfirm(),
        onConfirmSkip: () => this.confirmSkip(),
      });
      this._overlay.mount();
    }

    this._bindEvents();
    this._enterStage(TUTORIAL_STAGE_KEYS.SELECT_UNIT);
    return {
      ok: true,
      stage: this._currentStage,
      battleSession: this._state.battle.sessionId,
    };
  }

  /**
   * Aborts an active tutorial session without marking an incomplete tutorial as completed.
   * Restores normal random generation and cleans up listeners, filters, and overlay DOM.
   */
  abortSession() {
    this._cleanupListeners();
    this._overlay?.unmount?.();
    this._overlay = null;
    this._container?.querySelector?.('.battle-theater')?.classList?.remove('is-tutorial-active');

    if (this._battleManager) {
      this._battleManager.setTutorialActionFilter(null);
      this._battleManager.setTutorialCombatPaused(false);
      this._battleManager.setTutorialRefillPaused(false);
      this._battleManager.setTutorialProtectEnemies(false);
    }
    this._cards?.setCardGenerator?.(null);

    this._active = false;
    this._currentStage = null;
    this._subStep = null;
    this._refillObserved = false;
    this._combatObserved = false;
    this._skipConfirmOpen = false;
    this._container = null;
    this._battleScreen = null;
  }

  _cleanupListeners() {
    for (const unsub of this._unsubs) {
      try {
        unsub();
      } catch {
        // ignore listener teardown errors
      }
    }
    this._unsubs = [];
  }

  _bindEvents() {
    this._cleanupListeners();
    if (!this._eventBus) return;

    this._unsubs.push(
      this._eventBus.on('battle:stateChanged', (patch) => {
        if (!this._active) return;
        this._onBattleStateChanged(patch);
      }),
      this._eventBus.on('cards:played', (payload) => {
        if (!this._active) return;
        this._onCardPlayed(payload);
      }),
      this._eventBus.on('cards:refilled', (payload) => {
        if (!this._active) return;
        this._onCardRefilled(payload);
      }),
      this._eventBus.on('cards:merged', (payload) => {
        if (!this._active) return;
        this._onCardMerged(payload);
      }),
      this._eventBus.on('combat:attack', () => {
        if (!this._active) return;
        this._onCombatAction();
      }),
      this._eventBus.on('combat:damage', () => {
        if (!this._active) return;
        this._onCombatAction();
      }),
      this._eventBus.on('commander:ultimateActivated', () => {
        if (!this._active) return;
        this._onUltimateActivated();
      }),
      this._eventBus.on('battle:completed', (results) => {
        if (!this._active) return;
        this._onBattleCompleted(results);
      }),
    );
  }

  openSkipConfirm() {
    if (!this._active) return;
    this._audio?.playClick?.();
    this._skipConfirmOpen = true;
    this._renderOverlay();
  }

  cancelSkipConfirm() {
    if (!this._active) return;
    this._audio?.playClick?.();
    this._skipConfirmOpen = false;
    this._renderOverlay();
  }

  confirmSkip() {
    if (!this._active) return;
    this._audio?.playClick?.();
    const container = this._container;
    const battleScreen = this._battleScreen;

    this.markSkipped();
    this.abortSession();

    if (battleScreen && typeof battleScreen.startNormalBattleAfterTutorial === 'function') {
      battleScreen.startNormalBattleAfterTutorial();
    } else if (this._battleManager) {
      const canvas = container?.querySelector?.('#battle-canvas') || null;
      this._battleManager.startSession(canvas);
    }
  }

  /**
   * Advances observation/reveal steps on Continue (after refill, Lv.II/III preview, or combat).
   * Action-gated steps ignore Continue until their real action completes.
   */
  continueCurrentStage() {
    if (!this._active) return false;
    this._audio?.playClick?.();

    if (this._currentStage === TUTORIAL_STAGE_KEYS.CARD_REFILL) {
      if (!this._refillObserved) return false;
      this._enterStage(TUTORIAL_STAGE_KEYS.MERGE_LV1);
      return true;
    }

    if (this._currentStage === TUTORIAL_STAGE_KEYS.MERGE_LV1) {
      if (this._subStep !== 'show_lv2') return false;
      this._enterStage(TUTORIAL_STAGE_KEYS.MERGE_LV2);
      return true;
    }

    if (this._currentStage === TUTORIAL_STAGE_KEYS.MERGE_LV2) {
      if (this._subStep !== 'show_lv3') return false;
      this._enterStage(TUTORIAL_STAGE_KEYS.AUTO_COMBAT);
      return true;
    }

    if (this._currentStage === TUTORIAL_STAGE_KEYS.AUTO_COMBAT) {
      if (!this._combatObserved) return false;
      this._enterStage(TUTORIAL_STAGE_KEYS.SKILL_CARDS);
      return true;
    }

    return false;
  }

  _enterStage(stageKey) {
    this._currentStage = stageKey;
    this._skipConfirmOpen = false;

    const slots = this._cards?.getSlots?.() || [];

    if (stageKey === TUTORIAL_STAGE_KEYS.SELECT_UNIT) {
      this._subStep = 'select_unit_card';
      this._battleManager.setTutorialCombatPaused(true);
      this._battleManager.setTutorialRefillPaused(false);
      this._battleManager.setTutorialProtectEnemies(true);
      this._state.setBattle({ selectedCardSlot: -1 });

      this._unitTargetSlot = 0;
      const unitCard = slots[this._unitTargetSlot];
      if (unitCard && (this._state.battle.energy ?? 0) < unitCard.cost) {
        const boosted = Math.max(60, unitCard.cost + 20);
        this._state.setBattle({ energy: boosted, dp: boosted });
      }
      this._battleManager.setTutorialActionFilter((ctx) => this._filterUnitStepAction(ctx));
    } else if (stageKey === TUTORIAL_STAGE_KEYS.DEPLOY_UNIT) {
      this._subStep = 'deploy_to_friendly_zone';
      this._battleManager.setTutorialCombatPaused(true);
      this._battleManager.setTutorialRefillPaused(false);
      this._battleManager.setTutorialProtectEnemies(true);
      this._battleManager.setTutorialActionFilter((ctx) => this._filterUnitStepAction(ctx));
    } else if (stageKey === TUTORIAL_STAGE_KEYS.CARD_REFILL) {
      this._subStep = 'waiting_refill';
      this._refillObserved = Boolean(slots[this._refillTargetSlot]);
      if (this._refillObserved) {
        this._subStep = 'refill_complete';
      }
      this._battleManager.setTutorialCombatPaused(true);
      this._battleManager.setTutorialRefillPaused(false);
      this._battleManager.setTutorialProtectEnemies(true);
      this._state.setBattle({ selectedCardSlot: -1 });
      this._battleManager.setTutorialActionFilter(() => ({ allowed: false }));
    } else if (stageKey === TUTORIAL_STAGE_KEYS.MERGE_LV1) {
      this._subStep = 'select_merge_1a';
      this._battleManager.setTutorialCombatPaused(true);
      this._battleManager.setTutorialRefillPaused(false);
      this._battleManager.setTutorialProtectEnemies(true);
      this._state.setBattle({ selectedCardSlot: -1 });
      this._battleManager.setTutorialActionFilter((ctx) => this._filterMergeAction(ctx));
    } else if (stageKey === TUTORIAL_STAGE_KEYS.MERGE_LV2) {
      this._subStep = 'select_merge_1b';
      this._battleManager.setTutorialCombatPaused(true);
      this._battleManager.setTutorialRefillPaused(false);
      this._battleManager.setTutorialProtectEnemies(true);
      this._state.setBattle({ selectedCardSlot: -1 });
      this._battleManager.setTutorialActionFilter((ctx) => this._filterMergeAction(ctx));
    } else if (stageKey === TUTORIAL_STAGE_KEYS.AUTO_COMBAT) {
      this._subStep = 'observing_combat';
      this._combatObserved = false;
      this._combatEventCount = 0;
      this._combatStageStartElapsed = this._state.battle.elapsedSec || 0;
      this._state.setBattle({ selectedCardSlot: -1 });
      this._battleManager.setTutorialProtectEnemies(true);
      this._battleManager.setTutorialRefillPaused(false);
      this._battleManager.setTutorialCombatPaused(false);
      this._battleManager.setTutorialActionFilter(() => ({ allowed: false }));
    } else if (stageKey === TUTORIAL_STAGE_KEYS.SKILL_CARDS) {
      this._subStep = 'select_skill_card';
      this._battleManager.setTutorialCombatPaused(true);
      this._battleManager.setTutorialRefillPaused(false);
      this._battleManager.setTutorialProtectEnemies(true);
      this._state.setBattle({ selectedCardSlot: -1 });

      const skillIdx = slots.findIndex((c) => c && c.category === 'skill');
      if (skillIdx < 0) {
        this._enterStage(TUTORIAL_STAGE_KEYS.COMMANDER_ULTIMATE);
        return;
      }
      this._skillTargetSlot = skillIdx;
      const skillCard = slots[skillIdx];
      this._cards._cooldowns?.delete?.(skillCard.cardId);
      if ((this._state.battle.energy ?? 0) < skillCard.cost) {
        const nextE = Math.min(100, skillCard.cost + 14);
        this._state.setBattle({ energy: nextE, dp: nextE });
      }
      this._battleManager.setTutorialActionFilter((ctx) => this._filterSkillAction(ctx));
    } else if (stageKey === TUTORIAL_STAGE_KEYS.COMMANDER_ULTIMATE) {
      this._subStep = 'activate_ultimate';
      this._battleManager.setTutorialCombatPaused(true);
      this._battleManager.setTutorialRefillPaused(false);
      this._battleManager.setTutorialProtectEnemies(true);
      this._state.setBattle({
        selectedCardSlot: -1,
        ultimateEnergy: 100,
      });
      this._battleManager.setTutorialActionFilter((ctx) => this._filterUltimateAction(ctx));
    } else if (stageKey === TUTORIAL_STAGE_KEYS.FINISH_BATTLE) {
      this._subStep = 'complete_battle';
      this._battleManager.setTutorialActionFilter(null);
      this._battleManager.setTutorialProtectEnemies(false);
      this._battleManager.setTutorialRefillPaused(false);
      this._battleManager.setTutorialCombatPaused(false);
      this._state.setBattle({ selectedCardSlot: -1 });
    } else if (stageKey === TUTORIAL_STAGE_KEYS.COMPLETE) {
      this._subStep = 'done';
      this._battleManager.setTutorialActionFilter(null);
      this._battleManager.setTutorialProtectEnemies(false);
      this._battleManager.setTutorialRefillPaused(false);
      this._battleManager.setTutorialCombatPaused(false);
    }

    this._battleScreen?._renderCardSlots?.();
    this._battleScreen?._syncHud?.();
    this._eventBus?.emit('tutorial:stageChanged', {
      stage: this._currentStage,
      subStep: this._subStep,
      stepNumber: this.getStepNumber(),
      totalSteps: TUTORIAL_TOTAL_STEPS,
    });
    this._renderOverlay();
  }

  _filterUnitStepAction(ctx) {
    if (ctx.type === 'ultimate') return { allowed: false };
    if (ctx.type === 'card_slot') {
      if (ctx.slotIndex !== this._unitTargetSlot) {
        return { allowed: false };
      }
      if (!ctx.card || ctx.card.category !== 'unit') {
        return { allowed: false };
      }
      if (
        this._currentStage === TUTORIAL_STAGE_KEYS.DEPLOY_UNIT &&
        ctx.selectedCardSlot === ctx.slotIndex
      ) {
        return { allowed: false };
      }
      return { allowed: true };
    }
    if (ctx.type === 'canvas_deploy' || ctx.type === 'play_card') {
      if (ctx.slotIndex !== this._unitTargetSlot) return { allowed: false };
      if (!ctx.card || ctx.card.category !== 'unit') return { allowed: false };
      if (ctx.isFriendlyRegion === false) return { allowed: false };
      return { allowed: true };
    }
    return { allowed: false };
  }

  _filterMergeAction(ctx) {
    if (ctx.type !== 'card_slot') {
      return { allowed: false };
    }
    if (this._subStep === 'select_merge_1a') {
      return { allowed: ctx.slotIndex === 1 };
    }
    if (this._subStep === 'merge_1a') {
      return { allowed: ctx.slotIndex === 4 };
    }
    if (this._subStep === 'select_merge_1b') {
      return { allowed: ctx.slotIndex === 2 };
    }
    if (this._subStep === 'merge_1b') {
      return { allowed: ctx.slotIndex === 3 };
    }
    if (this._subStep === 'select_merge_2') {
      return { allowed: ctx.slotIndex === 4 };
    }
    if (this._subStep === 'merge_2') {
      return { allowed: ctx.slotIndex === 3 };
    }
    return { allowed: false };
  }

  _filterSkillAction(ctx) {
    if (ctx.type === 'ultimate') return { allowed: false };
    if (ctx.type === 'card_slot') {
      if (ctx.slotIndex !== this._skillTargetSlot || !ctx.card || ctx.card.category !== 'skill') {
        return { allowed: false };
      }
      return { allowed: true };
    }
    if (ctx.type === 'canvas_deploy' || ctx.type === 'play_card') {
      if (!ctx.card || ctx.card.category !== 'skill') return { allowed: false };
      return { allowed: true };
    }
    return { allowed: true };
  }

  _filterUltimateAction(ctx) {
    return { allowed: ctx.type === 'ultimate' };
  }

  _onBattleStateChanged(patch) {
    const selected = this._state.battle.selectedCardSlot;
    const slots = this._cards.getSlots();
    const selectedCard = selected >= 0 ? slots[selected] : null;

    if (
      this._currentStage === TUTORIAL_STAGE_KEYS.SELECT_UNIT ||
      this._currentStage === TUTORIAL_STAGE_KEYS.DEPLOY_UNIT
    ) {
      if (
        this._currentStage === TUTORIAL_STAGE_KEYS.SELECT_UNIT &&
        selected === this._unitTargetSlot &&
        selectedCard?.category === 'unit'
      ) {
        this._enterStage(TUTORIAL_STAGE_KEYS.DEPLOY_UNIT);
        return;
      }
      if (
        this._currentStage === TUTORIAL_STAGE_KEYS.DEPLOY_UNIT &&
        (!selectedCard || selected !== this._unitTargetSlot)
      ) {
        this._enterStage(TUTORIAL_STAGE_KEYS.SELECT_UNIT);
        return;
      }
    }

    if (this._currentStage === TUTORIAL_STAGE_KEYS.MERGE_LV1) {
      if (this._subStep === 'select_merge_1a' && selected === 1) {
        this._subStep = 'merge_1a';
        this._renderOverlay();
        return;
      }
      if (this._subStep === 'merge_1a' && selected !== 1) {
        this._subStep = 'select_merge_1a';
        this._renderOverlay();
        return;
      }
    }

    if (this._currentStage === TUTORIAL_STAGE_KEYS.MERGE_LV2) {
      if (this._subStep === 'select_merge_1b' && selected === 2) {
        this._subStep = 'merge_1b';
        this._renderOverlay();
        return;
      }
      if (this._subStep === 'merge_1b' && selected !== 2) {
        this._subStep = 'select_merge_1b';
        this._renderOverlay();
        return;
      }
      if (this._subStep === 'select_merge_2' && selected === 4) {
        this._subStep = 'merge_2';
        this._renderOverlay();
        return;
      }
      if (this._subStep === 'merge_2' && selected !== 4) {
        this._subStep = 'select_merge_2';
        this._renderOverlay();
        return;
      }
    }

    if (this._currentStage === TUTORIAL_STAGE_KEYS.AUTO_COMBAT && !this._combatObserved) {
      const elapsedDelta = (this._state.battle.elapsedSec || 0) - this._combatStageStartElapsed;
      if (elapsedDelta >= 1.4) {
        this._markCombatObserved();
        return;
      }
    }

    if (this._currentStage === TUTORIAL_STAGE_KEYS.SKILL_CARDS) {
      if (this._subStep === 'select_skill_card' && selectedCard?.category === 'skill') {
        this._subStep = 'cast_skill_card';
        this._skillTargetSlot = selected;
        this._renderOverlay();
        return;
      }
      if (this._subStep === 'cast_skill_card' && (!selectedCard || selectedCard.category !== 'skill')) {
        this._subStep = 'select_skill_card';
        this._renderOverlay();
        return;
      }
    }

    if (patch && Object.prototype.hasOwnProperty.call(patch, 'status')) {
      this._renderOverlay();
    }
  }

  _onCardPlayed({ slotIndex, card }) {
    if (!card) return;
    if (
      (this._currentStage === TUTORIAL_STAGE_KEYS.SELECT_UNIT ||
        this._currentStage === TUTORIAL_STAGE_KEYS.DEPLOY_UNIT) &&
      card.category === 'unit'
    ) {
      this._refillTargetSlot = typeof slotIndex === 'number' ? slotIndex : this._unitTargetSlot;
      this._enterStage(TUTORIAL_STAGE_KEYS.CARD_REFILL);
      return;
    }

    if (this._currentStage === TUTORIAL_STAGE_KEYS.SKILL_CARDS && card.category === 'skill') {
      this._enterStage(TUTORIAL_STAGE_KEYS.COMMANDER_ULTIMATE);
    }
  }

  _onCardRefilled({ slotIndex }) {
    if (this._currentStage !== TUTORIAL_STAGE_KEYS.CARD_REFILL) return;
    if (slotIndex !== this._refillTargetSlot) return;
    this._refillObserved = true;
    this._subStep = 'refill_complete';
    this._renderOverlay();
  }

  _onCardMerged({ targetIndex, upgradedCard }) {
    if (!upgradedCard) return;

    if (this._currentStage === TUTORIAL_STAGE_KEYS.MERGE_LV1 && this._subStep === 'merge_1a') {
      if (targetIndex === 4 && upgradedCard.tier === 2) {
        this._subStep = 'show_lv2';
        this._renderOverlay();
      }
      return;
    }

    if (this._currentStage === TUTORIAL_STAGE_KEYS.MERGE_LV2) {
      if (this._subStep === 'merge_1b' && targetIndex === 3 && upgradedCard.tier === 2) {
        this._subStep = 'select_merge_2';
        this._renderOverlay();
        return;
      }
      if (this._subStep === 'merge_2' && targetIndex === 3 && upgradedCard.tier === 3) {
        this._subStep = 'show_lv3';
        this._renderOverlay();
      }
    }
  }

  _onCombatAction() {
    if (this._currentStage !== TUTORIAL_STAGE_KEYS.AUTO_COMBAT || this._combatObserved) return;
    this._combatEventCount += 1;
    const elapsedDelta = (this._state.battle.elapsedSec || 0) - this._combatStageStartElapsed;
    if (this._combatEventCount >= 2 || elapsedDelta >= 1.0) {
      this._markCombatObserved();
    }
  }

  _markCombatObserved() {
    if (this._combatObserved) return;
    this._combatObserved = true;
    this._battleManager.setTutorialCombatPaused(true);
    this._renderOverlay();
  }

  _onUltimateActivated() {
    if (this._currentStage !== TUTORIAL_STAGE_KEYS.COMMANDER_ULTIMATE) return;
    this._enterStage(TUTORIAL_STAGE_KEYS.FINISH_BATTLE);
  }

  _onBattleCompleted(results) {
    if (!this._active) return;
    if (results?.victory) {
      this.markCompleted();
      this._currentStage = TUTORIAL_STAGE_KEYS.COMPLETE;
      this._subStep = 'done';
    }
    this._cleanupListeners();
    this._battleManager.setTutorialActionFilter(null);
    this._battleManager.setTutorialProtectEnemies(false);
    this._battleManager.setTutorialRefillPaused(false);
    this._battleManager.setTutorialCombatPaused(false);
    this._cards?.setCardGenerator?.(null);
    this._overlay?.unmount?.();
    this._overlay = null;
    this._container?.querySelector?.('.battle-theater')?.classList?.remove('is-tutorial-active');
    this._active = false;
  }

  buildViewModel() {
    const stepNumber = this.getStepNumber();

    const base = {
      active: this._active,
      stage: this._currentStage,
      subStep: this._subStep,
      stepNumber,
      totalSteps: TUTORIAL_TOTAL_STEPS,
      stepLabel: `Step ${stepNumber} of ${TUTORIAL_TOTAL_STEPS}`,
      mode: 'spotlight',
      targetKind: 'selector',
      targetSelector: null,
      pointerDirection: 'down',
      title: '',
      body: '',
      showContinue: false,
      continueDisabled: false,
      continueLabel: 'Continue',
      skipConfirmOpen: this._skipConfirmOpen,
    };

    if (this._currentStage === TUTORIAL_STAGE_KEYS.SELECT_UNIT) {
      return {
        ...base,
        targetKind: 'selector',
        targetSelector: `[data-slot-index="${this._unitTargetSlot}"]`,
        pointerDirection: 'down',
        title: 'Select a Unit Card',
        body: 'Six slots draw from your deck. Click it.',
      };
    }

    if (this._currentStage === TUTORIAL_STAGE_KEYS.DEPLOY_UNIT) {
      return {
        ...base,
        targetKind: 'friendly_zone',
        pointerDirection: 'left',
        title: 'Deploy Your Unit',
        body: 'Click here to deploy and start refill.',
      };
    }

    if (this._currentStage === TUTORIAL_STAGE_KEYS.CARD_REFILL) {
      return {
        ...base,
        targetKind: 'selector',
        targetSelector: `[data-slot-index="${this._refillTargetSlot}"]`,
        pointerDirection: 'down',
        title: this._refillObserved ? 'Slot Refilled' : 'Automatic Card Refill',
        body: this._refillObserved
          ? 'A new Level I card appeared! Continue.'
          : 'Empty slots refill automatically after 5 seconds.',
        showContinue: true,
        continueDisabled: !this._refillObserved,
        continueLabel: this._refillObserved ? 'Continue' : 'Refilling...',
      };
    }

    if (this._currentStage === TUTORIAL_STAGE_KEYS.MERGE_LV1) {
      if (this._subStep === 'merge_1a') {
        return {
          ...base,
          targetKind: 'selector',
          targetSelector: '[data-slot-index="4"]',
          pointerDirection: 'down',
          title: 'Merge Any Positions',
          body: "Position doesn't matter. Click its match.",
        };
      }
      if (this._subStep === 'show_lv2') {
        return {
          ...base,
          targetKind: 'selector',
          targetSelector: '[data-slot-index="4"]',
          pointerDirection: 'down',
          title: 'Level II Created',
          body: 'Upgraded to Level II! Emptied slot refills.',
          showContinue: true,
          continueDisabled: false,
          continueLabel: 'Continue',
        };
      }
      return {
        ...base,
        targetKind: 'selector',
        targetSelector: '[data-slot-index="1"]',
        pointerDirection: 'down',
        title: 'Merge Matching Cards',
        body: 'Any two identical cards merge. Click this.',
      };
    }

    if (this._currentStage === TUTORIAL_STAGE_KEYS.MERGE_LV2) {
      if (this._subStep === 'merge_1b') {
        return {
          ...base,
          targetKind: 'selector',
          targetSelector: '[data-slot-index="3"]',
          pointerDirection: 'down',
          title: 'Create Second Level II',
          body: 'Click its match to create Level II.',
        };
      }
      if (this._subStep === 'select_merge_2') {
        return {
          ...base,
          targetKind: 'selector',
          targetSelector: '[data-slot-index="4"]',
          pointerDirection: 'down',
          title: 'Merge Level II Cards',
          body: 'Click this Level II card to upgrade.',
        };
      }
      if (this._subStep === 'merge_2') {
        return {
          ...base,
          targetKind: 'selector',
          targetSelector: '[data-slot-index="3"]',
          pointerDirection: 'down',
          title: 'Upgrade to Level III',
          body: 'Merge two Level II cards into Level III.',
        };
      }
      if (this._subStep === 'show_lv3') {
        return {
          ...base,
          targetKind: 'selector',
          targetSelector: '[data-slot-index="3"]',
          pointerDirection: 'down',
          title: 'Maximum Level III',
          body: 'Level III is the maximum card level.',
          showContinue: true,
          continueDisabled: false,
          continueLabel: 'Continue',
        };
      }
      return {
        ...base,
        targetKind: 'selector',
        targetSelector: '[data-slot-index="2"]',
        pointerDirection: 'down',
        title: 'Prepare Second Level II',
        body: 'Click this card to prepare another merge.',
      };
    }

    if (this._currentStage === TUTORIAL_STAGE_KEYS.AUTO_COMBAT) {
      return {
        ...base,
        targetKind: 'combat_zone',
        pointerDirection: 'none',
        title: 'Watch Your Units Fight',
        body: 'Your units fight automatically.',
        showContinue: true,
        continueDisabled: !this._combatObserved,
        continueLabel: this._combatObserved ? 'Continue' : 'Engaging...',
      };
    }

    if (this._currentStage === TUTORIAL_STAGE_KEYS.SKILL_CARDS) {
      if (this._subStep === 'cast_skill_card') {
        return {
          ...base,
          targetKind: 'enemy_cluster',
          pointerDirection: 'right',
          title: 'Cast Your Skill',
          body: 'Click the enemies to cast your skill.',
        };
      }
      return {
        ...base,
        targetKind: 'selector',
        targetSelector: `[data-slot-index="${this._skillTargetSlot}"]`,
        pointerDirection: 'down',
        title: 'Use a Skill',
        body: 'Click this card to select a skill.',
      };
    }

    if (this._currentStage === TUTORIAL_STAGE_KEYS.COMMANDER_ULTIMATE) {
      return {
        ...base,
        targetKind: 'selector',
        targetSelector: '#btn-trigger-ultimate',
        pointerDirection: 'down',
        title: 'Activate Your Ultimate',
        body: 'Your Ultimate is ready. Click to activate.',
      };
    }

    return {
      ...base,
      mode: 'banner',
      targetKind: 'none',
      pointerDirection: 'none',
      title: 'Finish the Battle',
      body: 'Defeat all enemies to win the battle.',
    };
  }

  _renderOverlay() {
    if (!this._overlay) return;
    this._overlay.render(this.buildViewModel());
  }
}
