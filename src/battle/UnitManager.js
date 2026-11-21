/**
 * UnitManager — Runtime unit entity container, cap enforcement (25 friendly / 25 enemy / 50 total),
 * deterministic state machine, status effect management, and elite/boss spawning.
 * Pure runtime container; never persisted to localStorage.
 */

export const UNIT_STATES = Object.freeze({
  IDLE: 'Idle',
  SEEKING_TARGET: 'SeekingTarget',
  MOVING: 'Moving',
  ATTACKING: 'Attacking',
  CASTING: 'Casting',
  HEALING: 'Healing',
  STUNNED: 'Stunned',
  DEAD: 'Dead',
});

const VALID_STATE_SET = new Set(Object.values(UNIT_STATES));

export class UnitManager {
  constructor({ dataRegistry, eventBus, battlefield = null }) {
    this._data = dataRegistry;
    this._eventBus = eventBus;
    this._battlefield = battlefield;
    this._units = [];
    this._nextId = 1;
  }

  setBattlefield(battlefield) {
    this._battlefield = battlefield;
  }

  getCaps() {
    const caps = this._data?.balance?.unitCaps || {};
    return {
      maxFriendly: caps.maxFriendly ?? 25,
      maxEnemy: caps.maxEnemy ?? 25,
      maxTotal: caps.maxTotal ?? 50,
    };
  }

  getActiveCount(side = null) {
    let count = 0;
    for (const u of this._units) {
      if (u.state === UNIT_STATES.DEAD || u.hp <= 0) continue;
      if (side && u.side !== side) continue;
      count += 1;
    }
    return count;
  }

  canSpawn(side) {
    const caps = this.getCaps();
    const totalActive = this.getActiveCount();
    if (totalActive >= caps.maxTotal) {
      return { ok: false, reason: `Battlefield unit cap (${caps.maxTotal}) reached.` };
    }
    const sideActive = this.getActiveCount(side);
    const sideCap = side === 'ally' ? caps.maxFriendly : caps.maxEnemy;
    if (sideActive >= sideCap) {
      return {
        ok: false,
        reason:
          side === 'ally'
            ? `Friendly unit limit (${sideCap}/${sideCap}) reached.`
            : `Enemy unit limit (${sideCap}/${sideCap}) reached.`,
      };
    }
    return { ok: true };
  }

  /**
   * Transitions a unit's state deterministically while preventing contradictory transitions.
   * Dead is terminal. Stunned blocks active combat/movement transitions.
   */
  setUnitState(unit, nextState) {
    if (!unit || !VALID_STATE_SET.has(nextState)) return false;
    if (unit.state === UNIT_STATES.DEAD) return false;
    if (nextState === UNIT_STATES.DEAD) {
      unit.state = UNIT_STATES.DEAD;
      unit.targetUid = null;
      unit.vx = 0;
      unit.vy = 0;
      unit.path = [];
      unit.castingAbility = null;
      return true;
    }
    if (this.hasStatus(unit, 'stun') && nextState !== UNIT_STATES.STUNNED) {
      unit.state = UNIT_STATES.STUNNED;
      return false;
    }
    unit.state = nextState;
    return true;
  }

  /**
   * Spawns a standard, elite, or boss unit in world coordinates.
   */
  spawnUnit({
    unitId,
    eliteId = null,
    bossId = null,
    side = 'ally',
    x = null,
    y = null,
    level = 1,
    tier = 1,
    statMultiplier = 1,
    commanderPassive = null,
    restrictToRegion = null,
  }) {
    const capCheck = this.canSpawn(side);
    if (!capCheck.ok) {
      return null;
    }

    const bossDef = bossId ? this._data.bossesById?.get(bossId) : null;
    const eliteDef = eliteId ? this._data.elitesById?.get(eliteId) : null;
    const resolvedBaseId = bossDef?.baseUnitId || eliteDef?.baseUnitId || unitId;
    const baseDef =
      this._data.allUnitsById?.get(resolvedBaseId) || this._data.unitsById?.get(resolvedBaseId);
    if (!baseDef) return null;

    const unitBonusPerLv = this._data.balance?.progression?.unitLevelStatBonus ?? 0.08;
    const lvlScale = 1 + Math.max(0, level - 1) * (side === 'ally' ? unitBonusPerLv : 0.1);
    const totalMult = statMultiplier * lvlScale;

    let maxHp;
    let attack;
    let defense;
    let moveSpeed;
    let attackRange;
    let preferredRange;
    let detectionRange;
    let attackInterval;
    let attackType;
    let armorPierce;
    let healPower;
    let healRange;
    let shieldPower = 0;
    let supportRange = 0;
    let critChance;
    let critMultiplier;
    let projectileConfig;
    let collisionRadius;
    let visualScale = 1.0;
    let abilities = [];
    let cleaveRadius = 0;
    let ccImmune = false;
    let onHitEffect = baseDef.onHitEffect ? { ...baseDef.onHitEffect } : null;
    let initialShield = 0;
    let regenConfig = null;
    const modifierIds = [];
    const modifierNames = [];

    if (bossDef) {
      const s = bossDef.stats;
      maxHp = Math.round(s.maxHp * totalMult);
      attack = Math.round(s.attack * totalMult);
      defense = Math.round(s.defense * totalMult);
      moveSpeed = s.moveSpeed;
      attackRange = s.attackRange;
      preferredRange = s.preferredRange ?? s.attackRange * 0.85;
      detectionRange = s.detectionRange ?? 100;
      attackInterval = s.attackInterval ?? 1.25;
      attackType = s.attackType || 'physical';
      armorPierce = s.armorPierce ?? 0;
      healPower = Math.round((s.healPower || 0) * totalMult);
      healRange = s.healRange || 0;
      critChance = s.critChance ?? 0.12;
      critMultiplier = s.critMultiplier ?? 1.5;
      projectileConfig = bossDef.projectile
        ? { ...bossDef.projectile }
        : baseDef.projectile
          ? { ...baseDef.projectile }
          : null;
      collisionRadius = bossDef.collisionRadius ?? 3.4;
      visualScale = bossDef.visualScale ?? 1.55;
      abilities = [...(bossDef.abilities || [])];
      cleaveRadius = bossDef.cleaveRadius ?? 0;
      ccImmune = Boolean(bossDef.ccImmune);
    } else {
      const s = baseDef.stats;
      const eMult = eliteDef?.statMultipliers || {};
      maxHp = Math.round(s.maxHp * totalMult * (eMult.maxHp ?? 1));
      attack = Math.round(s.attack * totalMult * (eMult.attack ?? 1));
      defense = Math.round(s.defense * totalMult * (eMult.defense ?? 1));
      moveSpeed = s.moveSpeed * (eMult.moveSpeed ?? 1);
      attackRange = s.attackRange;
      preferredRange = s.preferredRange ?? s.attackRange * 0.85;
      detectionRange = s.detectionRange ?? 100;
      attackInterval = s.attackInterval ?? 1.2;
      attackType = s.attackType || 'physical';
      armorPierce = s.armorPierce ?? 0;
      healPower = Math.round((s.healPower || 0) * totalMult);
      healRange = s.healRange ?? (healPower > 0 ? attackRange : 0);
      shieldPower = Math.round((s.shieldPower || 0) * totalMult);
      supportRange = s.supportRange ?? (shieldPower > 0 ? attackRange : 0);
      critChance = s.critChance ?? this._data.balance?.combat?.defaultCritChance ?? 0.08;
      critMultiplier = s.critMultiplier ?? this._data.balance?.combat?.defaultCritMultiplier ?? 1.5;
      projectileConfig = baseDef.projectile ? { ...baseDef.projectile } : null;
      collisionRadius = baseDef.collisionRadius ?? 2.2;
      visualScale =
        eliteDef?.visualScale ?? baseDef.visualScale ?? (tier >= 3 ? 1.18 : tier === 2 ? 1.08 : 1.0);
      cleaveRadius = baseDef.cleaveRadius ?? 0;
      ccImmune = Boolean(baseDef.ccImmune);
      abilities = Array.from(
        new Set([...(baseDef.abilities || []), ...(eliteDef?.abilities || [])]),
      );

      // Apply configurable Elite Modifiers
      const allModIds = Array.from(
        new Set([...(eliteDef?.modifiers || []), ...(arguments[0]?.extraModifiers || [])]),
      );
      for (const modId of allModIds) {
        const mod = this._data.eliteModifiersById?.get(modId);
        if (!mod) continue;
        modifierIds.push(mod.id);
        modifierNames.push(mod.name);
        if (mod.statMultipliers) {
          if (mod.statMultipliers.maxHp) maxHp = Math.round(maxHp * mod.statMultipliers.maxHp);
          if (mod.statMultipliers.attack) attack = Math.round(attack * mod.statMultipliers.attack);
          if (mod.statMultipliers.defense) defense = Math.round(defense * mod.statMultipliers.defense);
          if (mod.statMultipliers.moveSpeed) moveSpeed = Number((moveSpeed * mod.statMultipliers.moveSpeed).toFixed(2));
          if (mod.statMultipliers.attackInterval) {
            attackInterval = Number(Math.max(0.35, attackInterval * mod.statMultipliers.attackInterval).toFixed(2));
          }
        }
        if (mod.initialShield) initialShield += mod.initialShield;
        if (mod.cleaveRadius) cleaveRadius = Math.max(cleaveRadius, mod.cleaveRadius);
        if (mod.splashRadius && projectileConfig) {
          projectileConfig.splashRadius = Math.max(projectileConfig.splashRadius || 0, mod.splashRadius);
        }
        if (mod.auraAbility && !abilities.includes(mod.auraAbility)) {
          abilities.push(mod.auraAbility);
        }
        if (mod.regenPercentPerTick > 0) {
          regenConfig = {
            percent: mod.regenPercentPerTick,
            intervalSec: mod.regenIntervalSec || 2.0,
            timer: mod.regenIntervalSec || 2.0,
          };
        }
      }
    }

    // Apply off-field Commander army passive to friendly units
    let healReceivedBonus = 0;
    if (side === 'ally' && commanderPassive?.effect) {
      const eff = commanderPassive.effect;
      if (eff.stat === 'maxHp' && eff.modifierType === 'percent') {
        maxHp = Math.round(maxHp * (1 + eff.value));
      } else if (eff.stat === 'attack' && eff.modifierType === 'percent') {
        attack = Math.round(attack * (1 + eff.value));
      } else if (eff.stat === 'defense' && eff.modifierType === 'percent') {
        defense = Math.round(defense * (1 + eff.value));
      } else if (eff.stat === 'moveSpeed' && eff.modifierType === 'percent') {
        moveSpeed = Number((moveSpeed * (1 + eff.value)).toFixed(2));
      } else if (eff.stat === 'healReceived' && eff.modifierType === 'percent') {
        healReceivedBonus = eff.value;
      }
      if (eff.secondaryStat === 'critChance' && typeof eff.secondaryValue === 'number') {
        critChance = Number((critChance + eff.secondaryValue).toFixed(3));
      }
    }

    // Resolve safe walkable spawn coordinates in world space (0..100).
    // Constrain to the side's deployment region when requested or when x is omitted.
    const hasExplicitX = typeof x === 'number' && Number.isFinite(x);
    const shouldRestrict = restrictToRegion ?? !hasExplicitX;
    const regionName = shouldRestrict ? (side === 'ally' ? 'friendly' : 'enemy') : null;
    let spawnX = hasExplicitX ? x : side === 'ally' ? 16 : 84;
    let spawnY = typeof y === 'number' && Number.isFinite(y) ? y : 50;
    if (this._battlefield) {
      const resolved = this._battlefield.findNearestWalkable(spawnX, spawnY, regionName);
      spawnX = resolved.x;
      spawnY = resolved.y;
    }

    const abilityCooldowns = {};
    for (const abId of abilities) {
      const abDef = this._data.bossAbilitiesById?.get(abId);
      abilityCooldowns[abId] = abDef ? Math.max(2.5, abDef.cooldownSec * 0.45) : 5;
    }

    const entity = {
      uid: `unit_${this._nextId++}`,
      unitId: baseDef.id,
      bossId: bossDef?.id || null,
      eliteId: eliteDef?.id || null,
      name: bossDef?.name || eliteDef?.name || baseDef.name,
      displayNameZh: bossDef?.displayNameZh || eliteDef?.displayNameZh || baseDef.displayNameZh || baseDef.name,
      unitClass: bossDef?.unitClass || eliteDef?.unitClass || baseDef.unitClass || baseDef.id,
      role: baseDef.role,
      side, // 'ally' | 'enemy'
      team: side,
      isElite: Boolean(eliteDef),
      isBoss: Boolean(bossDef),
      visualScale,
      spriteAssetId: baseDef.spriteAssetId,
      tintColor: bossDef?.appearance?.tintColor || baseDef.tintColor || null,
      auraColor: bossDef?.appearance?.auraColor || null,
      modifierIds,
      modifierNames,
      regenConfig,
      level,
      tier,
      x: spawnX,
      y: spawnY,
      vx: 0,
      vy: 0,
      facing: side === 'ally' ? 1 : -1,
      collisionRadius,
      maxHp,
      hp: maxHp,
      shield: initialShield,
      attack,
      defense,
      moveSpeed,
      attackRange,
      preferredRange,
      detectionRange,
      attackInterval,
      attackSpeed: Number((1 / Math.max(0.2, attackInterval)).toFixed(2)),
      attackType,
      armorPierce,
      cleaveRadius,
      ccImmune,
      onHitEffect,
      projectileConfig,
      healPower,
      healRange,
      shieldPower,
      supportRange,
      healReceivedBonus,
      critChance,
      critMultiplier,
      targetPriority: baseDef.targetPriority || 'nearest',
      tags: [...(baseDef.tags || [])],
      skills: [...(baseDef.skills || []), ...abilities],
      abilities,
      abilityCooldowns,
      castingAbility: null,
      attackCooldown: 0.15,
      state: UNIT_STATES.IDLE,
      targetUid: null,
      targetMode: 'attack', // 'attack' | 'heal' | 'shield'
      unreachableTimer: 0,
      path: [],
      pathTimer: (this._nextId % 6) * 0.07,
      statusEffects: [],
      hitFlash: 0,
      attackAnim: 0,
      healAnim: 0,
      deathTimer: 0,
      deadProcessed: false,
      phase: (this._nextId * 1.13) % (Math.PI * 2),
    };

    this._units.push(entity);
    this._eventBus?.emit('battle:unitSpawned', { unit: entity });
    return entity;
  }

  getByUid(uid) {
    if (!uid) return null;
    for (const u of this._units) {
      if (u.uid === uid) return u;
    }
    return null;
  }

  getAll() {
    return this._units;
  }

  getAlive() {
    return this._units.filter((u) => u.state !== UNIT_STATES.DEAD && u.hp > 0);
  }

  getBySide(side) {
    return this._units.filter((u) => u.side === side && u.state !== UNIT_STATES.DEAD && u.hp > 0);
  }

  getActiveBoss() {
    return (
      this._units.find((u) => u.isBoss && u.state !== UNIT_STATES.DEAD && u.hp > 0) || null
    );
  }

  /**
   * Adds or refreshes a timed status effect on a living unit.
   */
  applyStatusEffect(unit, effect) {
    if (!unit || unit.state === UNIT_STATES.DEAD || unit.hp <= 0) return false;
    if (effect.type === 'stun' && unit.ccImmune) {
      return false;
    }

    const entry = {
      id: effect.id || `${effect.type}_${Date.now()}`,
      type: effect.type, // 'buff_attack' | 'buff_defense' | 'buff_speed' | 'buff_attack_speed' | 'buff_armor_pierce' | 'buff_heal' | 'debuff_defense' | 'debuff_attack' | 'debuff_slow' | 'shield' | 'stun' | 'burn' | 'mark'
      value: effect.value ?? 0,
      remaining: effect.durationSec ?? 5,
      duration: effect.durationSec ?? 5,
      tickTimer: effect.tickInterval ?? 1.0,
      sourceUid: effect.sourceUid || null,
    };

    if (entry.type === 'shield') {
      unit.shield = Math.max(unit.shield, 0) + Math.max(0, entry.value);
    }

    const existingIdx = unit.statusEffects.findIndex(
      (s) => s.id === entry.id || (s.type === entry.type && entry.type === 'stun'),
    );
    if (existingIdx >= 0) {
      const existing = unit.statusEffects[existingIdx];
      existing.remaining = Math.max(existing.remaining, entry.remaining);
      existing.value = Math.max(existing.value, entry.value);
    } else {
      unit.statusEffects.push(entry);
    }

    if (entry.type === 'stun') {
      unit.state = UNIT_STATES.STUNNED;
      unit.castingAbility = null;
    }
    return true;
  }

  /**
   * Removes negative status effects (stun, slow, burn, defense/attack shred, mark).
   */
  cleanseDebuffs(unit) {
    if (!unit || !Array.isArray(unit.statusEffects)) return 0;
    const debuffTypes = new Set([
      'stun',
      'debuff_slow',
      'debuff_defense',
      'debuff_attack',
      'burn',
      'mark',
    ]);
    const before = unit.statusEffects.length;
    unit.statusEffects = unit.statusEffects.filter((eff) => !debuffTypes.has(eff.type));
    const removed = before - unit.statusEffects.length;
    if (unit.state === UNIT_STATES.STUNNED && !this.hasStatus(unit, 'stun')) {
      unit.state = UNIT_STATES.IDLE;
    }
    return removed;
  }

  hasStatus(unit, type) {
    if (!unit || !Array.isArray(unit.statusEffects)) return false;
    return unit.statusEffects.some((s) => s.type === type && s.remaining > 0);
  }

  /**
   * Computes effective stat value factoring in active buffs and debuffs.
   */
  getEffectiveStat(unit, statName) {
    if (!unit) return 0;
    const base = unit[statName] ?? 0;
    let pctMod = 0;

    if (statName === 'armorPierce') {
      let addMod = 0;
      for (const eff of unit.statusEffects || []) {
        if (eff.remaining > 0 && eff.type === 'buff_armor_pierce') {
          addMod += eff.value;
        }
      }
      return Math.min(0.9, Math.max(0, base + addMod));
    }

    if (statName === 'attackInterval') {
      let spdBonus = 0;
      for (const eff of unit.statusEffects || []) {
        if (eff.remaining > 0 && eff.type === 'buff_attack_speed') {
          spdBonus += eff.value;
        }
      }
      return Math.max(0.28, base / Math.max(0.4, 1 + spdBonus));
    }

    for (const eff of unit.statusEffects || []) {
      if (eff.remaining <= 0) continue;
      if (statName === 'attack') {
        if (eff.type === 'buff_attack') pctMod += eff.value;
        else if (eff.type === 'debuff_attack') pctMod -= eff.value;
      } else if (statName === 'defense') {
        if (eff.type === 'buff_defense') pctMod += eff.value;
        else if (eff.type === 'debuff_defense') pctMod -= eff.value;
      } else if (statName === 'moveSpeed') {
        if (eff.type === 'buff_speed') pctMod += eff.value;
        else if (eff.type === 'debuff_slow') pctMod -= eff.value;
      } else if (statName === 'healPower') {
        if (eff.type === 'buff_heal') pctMod += eff.value;
      }
    }

    const multiplier = Math.max(0.25, 1 + pctMod);
    return base * multiplier;
  }

  /**
   * Ticks visual animation timers, status effect durations, elite regen, and removes finished dead units.
   */
  updateTimers(dt, onDotTick = null, onRegenTick = null) {
    const deathDuration = this._data?.balance?.combat?.deathAnimDurationSec ?? 0.45;

    for (const unit of this._units) {
      if (unit.hitFlash > 0) unit.hitFlash = Math.max(0, unit.hitFlash - dt);
      if (unit.attackAnim > 0) unit.attackAnim = Math.max(0, unit.attackAnim - dt);
      if (unit.healAnim > 0) unit.healAnim = Math.max(0, unit.healAnim - dt);

      if (unit.state === UNIT_STATES.DEAD) {
        unit.deathTimer += dt;
        continue;
      }

      // Elite Regenerative Core modifier tick
      if (unit.regenConfig && unit.hp > 0 && unit.hp < unit.maxHp) {
        unit.regenConfig.timer -= dt;
        if (unit.regenConfig.timer <= 0) {
          unit.regenConfig.timer += unit.regenConfig.intervalSec;
          const amount = Math.max(1, Math.round(unit.maxHp * unit.regenConfig.percent));
          if (onRegenTick) {
            onRegenTick(unit, amount);
          } else {
            unit.hp = Math.min(unit.maxHp, unit.hp + amount);
          }
        }
      }

      let wasStunned = false;
      for (let i = unit.statusEffects.length - 1; i >= 0; i -= 1) {
        const eff = unit.statusEffects[i];
        if (eff.type === 'stun') wasStunned = true;
        eff.remaining -= dt;

        if (eff.type === 'burn' && eff.remaining > 0 && onDotTick) {
          eff.tickTimer -= dt;
          if (eff.tickTimer <= 0) {
            eff.tickTimer += 1.0;
            onDotTick(unit, eff);
          }
        }

        if (eff.remaining <= 0) {
          if (eff.type === 'shield') {
            unit.shield = Math.max(0, unit.shield - eff.value);
          }
          unit.statusEffects.splice(i, 1);
        }
      }

      if (wasStunned && !this.hasStatus(unit, 'stun') && unit.state === UNIT_STATES.STUNNED) {
        unit.state = UNIT_STATES.IDLE;
      }
    }

    // Remove dead units once their death animation completes
    this._units = this._units.filter(
      (u) => !(u.state === UNIT_STATES.DEAD && u.deathTimer >= deathDuration),
    );
  }

  /**
   * Immediately prunes units that have finished dying (or all dead units if immediate=true).
   */
  pruneDefeated(immediate = false) {
    const deathDuration = this._data?.balance?.combat?.deathAnimDurationSec ?? 0.45;
    this._units = this._units.filter((u) => {
      if (u.state !== UNIT_STATES.DEAD && u.hp > 0) return true;
      return immediate ? false : u.deathTimer < deathDuration;
    });
  }

  clear() {
    this._units = [];
    this._nextId = 1;
  }
}
