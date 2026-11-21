/**
 * GameState — Central runtime store clearly separating persistent save data
 * from transient UI and active battle session state.
 */

import { deepClone } from '../utils/StorageUtils.js';

export class GameState {
  constructor(initialPersistentState, eventBus) {
    this._eventBus = eventBus;
    this._persistent = deepClone(initialPersistentState);

    // Transient UI state (never persisted to localStorage)
    this.ui = {
      activeScreen: 'home',
      selectedHeroId: this._persistent.formation?.commanderId || 'astra',
      heroFilter: 'ALL',
      inventoryFilter: 'all',
      inventoryCardCat: 'all',
      selectedInventoryId: null,
      formationTab: 'squad',
      summonSideTab: 'results',
      selectedBannerId: 'banner_starlight_command',
      chapterFilter: 'all',
      cardCategoryFilter: 'all',
      lastSummonResults: [],
    };

    // Transient battle session state (never persisted to localStorage)
    this.battle = {
      sessionId: null,
      status: 'idle', // 'idle' | 'preparation' | 'running' | 'paused' | 'victory' | 'defeat' | 'results'
      phase: 'preparation', // 'preparation' | 'battle_start' | 'active_combat' | 'wave_transition' | 'victory' | 'defeat' | 'results'
      stageId: this._persistent.progression?.selectedStageId || 'stage_1_1',
      speedMultiplier: this._persistent.settings?.battleSpeed || 1,
      elapsedSec: 0,
      waveIndex: 1,
      totalWaves: 3,
      waveLabel: '',
      isBossWave: false,
      friendlyCount: 0,
      friendlyCap: 25,
      enemyCount: 0,
      enemyCap: 25,
      energy: 60,
      maxEnergy: 100,
      dp: 60, // Alias for compatibility
      maxDp: 100,
      ultimateEnergy: 0,
      ultimateMaxEnergy: 100,
      selectedCardSlot: -1,
      remainingDeckCount: 6,
      activeTactic: null,
      bannerText: '',
      bossInfo: null, // { name, hp, maxHp, castingName }
      results: null,
    };
  }

  get persistent() {
    return this._persistent;
  }

  get player() {
    return this._persistent.player;
  }

  get resources() {
    return this._persistent.resources;
  }

  get heroes() {
    return this._persistent.heroes;
  }

  get units() {
    return this._persistent.units;
  }

  get formation() {
    return this._persistent.formation;
  }

  get progression() {
    return this._persistent.progression;
  }

  get gacha() {
    return this._persistent.gacha;
  }

  get inventory() {
    return this._persistent.inventory;
  }

  get settings() {
    return this._persistent.settings;
  }

  replacePersistent(nextPersistent) {
    this._persistent = deepClone(nextPersistent);
    this.ui.selectedHeroId = this._persistent.formation.commanderId;
    this.battle.stageId = this._persistent.progression.selectedStageId;
    this.battle.speedMultiplier = this._persistent.settings.battleSpeed;
    this._eventBus?.emit('state:changed', { scope: 'all' });
  }

  mutatePersistent(scope, mutator) {
    mutator(this._persistent);
    this._persistent.updatedAt = new Date().toISOString();
    this._eventBus?.emit('state:changed', { scope });
  }

  setUI(patch) {
    Object.assign(this.ui, patch);
    this._eventBus?.emit('ui:changed', patch);
  }

  setBattle(patch) {
    Object.assign(this.battle, patch);
    this._eventBus?.emit('battle:stateChanged', patch);
  }

  /**
   * Produces a clean snapshot strictly limited to persistent fields.
   */
  toSerializableSave() {
    return deepClone(this._persistent);
  }
}
