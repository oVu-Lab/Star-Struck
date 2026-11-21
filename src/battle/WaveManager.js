/**
 * WaveManager — Multi-wave enemy encounter scheduler supporting normal squads,
 * elites, bosses, right-side enemy deployment, and wave transition countdowns.
 */

export class WaveManager {
  constructor({ eventBus, balance = null } = {}) {
    this._eventBus = eventBus;
    this._balance = balance;
    this._waves = [];
    this._currentWaveIndex = -1; // 0-based index of last spawned wave
    this._pendingQueue = []; // Units queued to spawn if cap was temporarily hit
    this._transitionTimer = 0;
    this._inTransition = false;
    this._stageHasBoss = false;
    this._bossSpawned = false;
  }

  configure(stage, balance = null) {
    if (balance) this._balance = balance;
    this._waves = Array.isArray(stage?.waves) ? stage.waves : [];
    this._currentWaveIndex = -1;
    this._pendingQueue = [];
    this._transitionTimer = 0;
    this._inTransition = false;
    this._stageHasBoss = this._waves.some((w) => Boolean(w.boss));
    this._bossSpawned = false;
  }

  getTotalWaves() {
    return Math.max(1, this._waves.length);
  }

  getCurrentWave() {
    return Math.max(1, this._currentWaveIndex + 1);
  }

  getCurrentWaveConfig() {
    if (this._currentWaveIndex < 0 || this._currentWaveIndex >= this._waves.length) return null;
    return this._waves[this._currentWaveIndex];
  }

  getNextWaveConfig() {
    const nextIdx = this._currentWaveIndex + 1;
    if (nextIdx >= this._waves.length) return null;
    return this._waves[nextIdx];
  }

  hasRemainingWaves() {
    return this._currentWaveIndex + 1 < this._waves.length;
  }

  hasPendingSpawns() {
    return this._pendingQueue.length > 0;
  }

  allWavesSpawned() {
    return !this.hasRemainingWaves() && this._pendingQueue.length === 0;
  }

  isInTransition() {
    return this._inTransition;
  }

  getTransitionRemaining() {
    return Math.max(0, this._transitionTimer);
  }

  stageHasBoss() {
    return this._stageHasBoss;
  }

  isBossSpawned() {
    return this._bossSpawned;
  }

  /**
   * Immediately spawns Wave 1 when battle transitions from preparation into combat.
   */
  spawnInitialWave(unitManager, battlefield) {
    if (this._waves.length === 0) return [];
    return this._spawnWaveIndex(0, unitManager, battlefield);
  }

  /**
   * Advances wave spawning, pending overflow queue, and inter-wave transitions.
   * Returns { phaseHint: 'active_combat' | 'wave_transition', spawned: Unit[] }.
   */
  update(dt, unitManager, battlefield) {
    const spawned = [];

    // Drain any queued spawns if enemy cap freed up
    if (this._pendingQueue.length > 0) {
      while (this._pendingQueue.length > 0 && unitManager.canSpawn('enemy').ok) {
        const spec = this._pendingQueue.shift();
        const u = this._spawnEnemySpec(spec, unitManager, battlefield);
        if (u) spawned.push(u);
      }
    }

    const activeEnemies = unitManager.getActiveCount('enemy');

    if (this._inTransition) {
      this._transitionTimer -= dt;
      if (this._transitionTimer <= 0) {
        this._inTransition = false;
        const nextIdx = this._currentWaveIndex + 1;
        if (nextIdx < this._waves.length) {
          const waveUnits = this._spawnWaveIndex(nextIdx, unitManager, battlefield);
          spawned.push(...waveUnits);
        }
        return { phaseHint: 'active_combat', spawned };
      }
      return { phaseHint: 'wave_transition', spawned };
    }

    // If all current enemies are cleared and more waves exist, enter wave transition
    if (activeEnemies === 0 && this._pendingQueue.length === 0 && this.hasRemainingWaves()) {
      const nextWave = this.getNextWaveConfig();
      const duration =
        nextWave?.delaySec ?? this._balance?.combat?.waveTransitionDurationSec ?? 2.4;
      this._inTransition = true;
      this._transitionTimer = Math.max(0.4, duration);
      this._eventBus?.emit('battle:waveTransition', {
        completedWave: this.getCurrentWave(),
        nextWave: this._currentWaveIndex + 2,
        totalWaves: this.getTotalWaves(),
        isBossWave: Boolean(nextWave?.boss || nextWave?.isBossWave),
        label: nextWave?.label || `Wave ${this._currentWaveIndex + 2}`,
        duration: this._transitionTimer,
      });
      return { phaseHint: 'wave_transition', spawned };
    }

    return { phaseHint: 'active_combat', spawned };
  }

  _spawnWaveIndex(waveIdx, unitManager, battlefield) {
    const wave = this._waves[waveIdx];
    if (!wave) return [];

    this._currentWaveIndex = waveIdx;
    const enemyLevel = wave.enemyLevel ?? 1;
    const specs = [];

    for (const group of wave.units || []) {
      const count = Math.max(1, group.count || 1);
      for (let i = 0; i < count; i += 1) {
        specs.push({ kind: 'unit', unitId: group.unitId, level: enemyLevel });
      }
    }

    for (const group of wave.elites || []) {
      const count = Math.max(1, group.count || 1);
      for (let i = 0; i < count; i += 1) {
        specs.push({
          kind: 'elite',
          eliteId: group.eliteId,
          extraModifiers: group.extraModifiers || [],
          level: enemyLevel,
        });
      }
    }

    if (wave.boss?.bossId) {
      specs.push({ kind: 'boss', bossId: wave.boss.bossId, level: enemyLevel });
    }

    const total = specs.length;
    const region = battlefield?.regions?.enemy || { minX: 72, maxX: 96, minY: 12, maxY: 88 };
    const spawned = [];

    specs.forEach((spec, idx) => {
      const frac = total <= 1 ? 0.5 : idx / (total - 1);
      const y = region.minY + 6 + frac * Math.max(10, region.maxY - region.minY - 12);

      const defLookup = unitManager._data?.allUnitsById || unitManager._data?.unitsById;
      const resolvedDef = spec.unitId ? defLookup?.get(spec.unitId) : null;
      const isRangedOrSupport =
        spec.unitId === 'arcane_archer' ||
        spec.unitId === 'field_cleric' ||
        Boolean(
          resolvedDef &&
            ((resolvedDef.stats?.attackRange || 0) >= 12 ||
              (resolvedDef.stats?.healPower || 0) > 0 ||
              (resolvedDef.stats?.shieldPower || 0) > 0),
        );

      const x =
        spec.kind === 'boss'
          ? region.maxX - 8
          : isRangedOrSupport
            ? region.maxX - 6
            : region.minX + 6 + (idx % 3) * 3.5;

      const positionedSpec = { ...spec, x, y };
      if (unitManager.canSpawn('enemy').ok) {
        const unit = this._spawnEnemySpec(positionedSpec, unitManager, battlefield);
        if (unit) spawned.push(unit);
      } else {
        this._pendingQueue.push(positionedSpec);
      }
    });

    const bossUnit = spawned.find((u) => u.isBoss) || null;
    this._eventBus?.emit('battle:waveSpawned', {
      waveNumber: waveIdx + 1,
      totalWaves: this.getTotalWaves(),
      label: wave.label || `Wave ${waveIdx + 1}`,
      isBossWave: Boolean(wave.boss || wave.isBossWave),
      boss: bossUnit,
      count: spawned.length,
    });

    return spawned;
  }

  _spawnEnemySpec(spec, unitManager) {
    const unit = unitManager.spawnUnit({
      unitId: spec.unitId || null,
      eliteId: spec.eliteId || null,
      bossId: spec.bossId || null,
      extraModifiers: spec.extraModifiers || [],
      side: 'enemy',
      x: spec.x,
      y: spec.y,
      level: spec.level || 1,
      restrictToRegion: true,
    });
    if (unit?.isBoss) {
      this._bossSpawned = true;
      this._eventBus?.emit('battle:bossSpawned', { boss: unit });
    }
    return unit;
  }

  reset() {
    this._currentWaveIndex = -1;
    this._pendingQueue = [];
    this._transitionTimer = 0;
    this._inTransition = false;
    this._bossSpawned = false;
  }
}
