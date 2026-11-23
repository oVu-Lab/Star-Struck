/**
 * CombatSystem — Unified damage, defense mitigation, critical hit, healing,
 * status-effect, boss ability telegraph/resolution, death handling, and
 * ultimate energy generation pipeline.
 */

import { UNIT_STATES } from './UnitManager.js';
import { resolveUnitAttackVfxProfile } from '../rendering/UnitAttackVfxConfig.js';

export class CombatSystem {
  constructor({ eventBus, dataRegistry = null, rng = Math.random } = {}) {
    this._eventBus = eventBus;
    this._data = dataRegistry;
    this._rng = rng;
    this._stats = this._createEmptyStats();
    this._telegraphs = [];
    this._elapsedSec = 0;
  }

  _createEmptyStats() {
    return {
      enemiesDefeated: 0,
      alliesDefeated: 0,
      damageDealt: 0,
      damageReceived: 0,
      healingPerformed: 0,
      criticalHits: 0,
      ultimatesUsed: 0,
    };
  }

  setDataRegistry(dataRegistry) {
    this._data = dataRegistry;
  }

  setElapsedTime(elapsedSec) {
    this._elapsedSec = Math.max(0, Number(elapsedSec) || 0);
  }

  resetStats() {
    this._stats = this._createEmptyStats();
    this._telegraphs = [];
    this._elapsedSec = 0;
  }

  getStats() {
    return { ...this._stats };
  }

  getTelegraphs() {
    return this._telegraphs;
  }

  _getBalance() {
    return this._data?.balance || {};
  }

  /**
   * Configurable damage formula supporting physical/magical mitigation,
   * armor pierce, and critical strikes.
   */
  calculateDamage({
    attack,
    defense,
    attackType = 'physical',
    armorPierce = 0,
    critChance = 0,
    critMultiplier = 1.5,
  }) {
    const cfg = this._getBalance().combat || {};
    const minDamage = cfg.minDamage ?? 5;
    const defScale =
      attackType === 'magical'
        ? (cfg.magicalDefenseScale ?? 0.65)
        : (cfg.physicalDefenseScale ?? 1.0);

    const effDef = Math.max(0, defense * (1 - Math.min(0.9, Math.max(0, armorPierce))));
    const mitigation = 100 / (100 + effDef * defScale);
    let dmg = attack * mitigation;

    const isCrit = critChance > 0 && this._rng() < critChance;
    if (isCrit) {
      dmg *= critMultiplier;
    }

    return {
      amount: Math.max(minDamage, Math.round(dmg)),
      isCrit,
      attackType,
    };
  }

  /**
   * Resolves damage on a target unit through shield absorption, HP update,
   * statistics accounting, ultimate energy gain, and single-execution death handling.
   */
  applyDamage({
    source = null,
    target,
    rawAttack,
    attackType = 'physical',
    armorPierce = 0,
    critChance = 0,
    critMultiplier = 1.5,
    unitManager,
    skillSystem = null,
    bypassMitigation = false,
  }) {
    if (!target || target.state === UNIT_STATES.DEAD || target.hp <= 0 || target.deadProcessed) {
      return { applied: false, amount: 0, killed: false, isCrit: false };
    }

    const effDefense = unitManager
      ? unitManager.getEffectiveStat(target, 'defense')
      : target.defense;

    let amount;
    let isCrit = false;
    if (bypassMitigation) {
      amount = Math.max(1, Math.round(rawAttack));
    } else {
      const calc = this.calculateDamage({
        attack: rawAttack,
        defense: effDefense,
        attackType,
        armorPierce,
        critChance,
        critMultiplier,
      });
      amount = calc.amount;
      isCrit = calc.isCrit;
    }

    let remaining = amount;
    let absorbed = 0;
    if (target.shield > 0) {
      absorbed = Math.min(target.shield, remaining);
      target.shield = Math.max(0, target.shield - absorbed);
      remaining -= absorbed;
    }

    const hpLost = Math.min(target.hp, remaining);
    target.hp = Math.max(0, target.hp - hpLost);
    target.hitFlash = 0.16;
    if (source) {
      target.lastHitAngle = Math.atan2(target.y - source.y, target.x - source.x);
      target.lastHitReaction = resolveUnitAttackVfxProfile(source)?.hitReaction || attackType;
    } else {
      target.lastHitReaction = attackType;
    }

    // Track battle statistics
    const sourceIsAlly = source ? source.side === 'ally' : target.side === 'enemy';
    if (target.side === 'enemy' && sourceIsAlly) {
      this._stats.damageDealt += amount;
      if (isCrit) this._stats.criticalHits += 1;
    } else if (target.side === 'ally') {
      this._stats.damageReceived += amount;
    }

    // Generate Commander Ultimate Energy strictly from living friendly units
    if (skillSystem) {
      const ultCfg = this._getBalance().ultimateEnergy || {};
      if (source && source.side === 'ally' && source.state !== UNIT_STATES.DEAD && source.hp > 0) {
        skillSystem.addUltimateEnergy(amount * (ultCfg.gainPerDamageDealt ?? 0.045));
      }
      if (target.side === 'ally' && target.hp > 0 && target.state !== UNIT_STATES.DEAD) {
        skillSystem.addUltimateEnergy(amount * (ultCfg.gainPerDamageReceived ?? 0.035));
      }
    }

    this._eventBus?.emit('combat:damage', {
      source,
      target,
      amount,
      absorbed,
      isCrit,
      attackType,
    });

    let killed = false;
    if (target.hp <= 0 && !target.deadProcessed) {
      killed = this._processDeath(target, source, unitManager, skillSystem);
    }

    return { applied: true, amount, absorbed, hpLost, isCrit, killed };
  }

  /**
   * Heals a living unit. Refuses to heal dead units.
   * Applies anti-stall healing dampening in very long battles (>150s) to prevent infinite stalemates.
   */
  applyHeal({ source = null, target, rawHeal, skillSystem = null }) {
    if (!target || target.state === UNIT_STATES.DEAD || target.hp <= 0 || target.deadProcessed) {
      return { applied: false, amount: 0 };
    }
    if (rawHeal <= 0) return { applied: false, amount: 0 };

    const combatCfg = this._getBalance().combat || {};
    const stallStart = combatCfg.antiStallStartSec ?? 150;
    const penaltyStep = combatCfg.antiStallHealPenaltyPer30Sec ?? 0.12;
    const maxPenalty = combatCfg.maxHealPenalty ?? 0.6;
    let antiStallScale = 1.0;
    if (this._elapsedSec > stallStart) {
      const steps = Math.floor((this._elapsedSec - stallStart) / 30) + 1;
      antiStallScale = Math.max(1 - maxPenalty, 1 - steps * penaltyStep);
    }

    const receiverBonus = 1 + (target.healReceivedBonus || 0);
    const amount = Math.max(1, Math.round(rawHeal * receiverBonus * antiStallScale));
    const missing = Math.max(0, target.maxHp - target.hp);
    const actualHeal = Math.min(missing, amount);
    target.hp = Math.min(target.maxHp, target.hp + actualHeal);
    target.healAnim = 0.35;

    if (target.side === 'ally' && actualHeal > 0) {
      this._stats.healingPerformed += actualHeal;
      if (skillSystem) {
        const canGen = !source || (source.side === 'ally' && source.state !== UNIT_STATES.DEAD && source.hp > 0);
        if (canGen) {
          const ultCfg = this._getBalance().ultimateEnergy || {};
          skillSystem.addUltimateEnergy(actualHeal * (ultCfg.gainPerHeal ?? 0.045));
        }
      }
    }

    this._eventBus?.emit('combat:heal', {
      source,
      target,
      amount: actualHeal > 0 ? actualHeal : amount,
      effectiveHeal: actualHeal,
    });

    return { applied: true, amount: actualHeal, attempted: amount };
  }

  _processDeath(unit, killer, unitManager, skillSystem) {
    if (unit.deadProcessed) return false;
    unit.deadProcessed = true;
    unit.hp = 0;
    if (unitManager) {
      unitManager.setUnitState(unit, UNIT_STATES.DEAD);
    } else {
      unit.state = UNIT_STATES.DEAD;
      unit.targetUid = null;
    }

    if (unit.side === 'enemy') {
      this._stats.enemiesDefeated += 1;
      if (skillSystem && killer && killer.side === 'ally' && killer.hp > 0 && killer.state !== UNIT_STATES.DEAD) {
        const ultCfg = this._getBalance().ultimateEnergy || {};
        skillSystem.addUltimateEnergy(ultCfg.gainPerKill ?? 4);
      }
    } else {
      this._stats.alliesDefeated += 1;
    }

    this._eventBus?.emit('battle:unitDefeated', { unit, killer });
    return true;
  }

  /**
   * Main combat tick: cooldowns, melee/ranged/healing/shield attacks, and unit/elite/boss abilities.
   */
  update(dt, { unitManager, projectileSystem, skillSystem = null }) {
    const units = unitManager.getAll();

    // Update active boss/skill telegraphs
    for (let i = this._telegraphs.length - 1; i >= 0; i -= 1) {
      const tg = this._telegraphs[i];
      tg.elapsed += dt;
      if (tg.elapsed >= tg.duration) {
        this._telegraphs.splice(i, 1);
      }
    }

    for (const unit of units) {
      if (unit.state === UNIT_STATES.DEAD || unit.hp <= 0 || unit.deadProcessed) continue;
      if (unit.state === UNIT_STATES.STUNNED || unitManager.hasStatus(unit, 'stun')) continue;

      if (unit.attackCooldown > 0) {
        unit.attackCooldown = Math.max(0, unit.attackCooldown - dt);
      }

      // Unit, Elite & Boss ability cooldowns and casts
      if (unit.abilities && unit.abilities.length > 0) {
        const busyCasting = this._updateUnitAbilities(dt, unit, unitManager, skillSystem);
        if (busyCasting) continue;
      }

      if (unit.state !== UNIT_STATES.ATTACKING && unit.state !== UNIT_STATES.HEALING) {
        continue;
      }

      if (unit.attackCooldown > 0) continue;

      const target = unitManager.getByUid(unit.targetUid);
      if (!target || target.state === UNIT_STATES.DEAD || target.hp <= 0) {
        unit.targetUid = null;
        unitManager.setUnitState(unit, UNIT_STATES.SEEKING_TARGET);
        continue;
      }

      const dist = Math.hypot(target.x - unit.x, target.y - unit.y);
      const reach =
        unit.state === UNIT_STATES.HEALING
          ? (unit.targetMode === 'shield'
              ? unit.supportRange || unit.attackRange
              : unit.healRange || unit.attackRange) +
            target.collisionRadius * 0.65
          : unit.attackRange + target.collisionRadius * 0.65;

      if (dist > reach) {
        unitManager.setUnitState(unit, UNIT_STATES.MOVING);
        continue;
      }

      // Execute heal, shield, or attack
      unit.attackCooldown = unitManager.getEffectiveStat(unit, 'attackInterval') || unit.attackInterval;
      unit.attackAnim = 0.24;

      if (unit.state === UNIT_STATES.HEALING && target.side === unit.side) {
        if (unit.targetMode === 'shield' && unit.shieldPower > 0) {
          if (projectileSystem && unit.projectileConfig) {
            projectileSystem.spawn({
              kind: 'shield',
              sourceUid: unit.uid,
              sourceSide: unit.side,
              sourceUnitId: unit.unitId,
              sourceBossId: unit.bossId || null,
              sourceEliteId: unit.eliteId || null,
              sourceClass: unit.unitClass,
              sourceIsBoss: Boolean(unit.isBoss),
              sourceIsElite: Boolean(unit.isElite),
              x: unit.x,
              y: unit.y,
              targetUid: target.uid,
              targetX: target.x,
              targetY: target.y,
              speed: unit.projectileConfig.speed || 48,
              color: unit.projectileConfig.color || '#38bdf8',
              shieldAmount: unit.shieldPower,
            });
          } else {
            unitManager.applyStatusEffect(target, {
              id: `sup_shield_${unit.uid}`,
              type: 'shield',
              value: unit.shieldPower,
              durationSec: 5.5,
              sourceUid: unit.uid,
            });
          }
          this._eventBus?.emit('combat:attack', { source: unit, target, kind: 'shield' });
          continue;
        }

        const effHeal = unitManager.getEffectiveStat(unit, 'healPower');
        if (projectileSystem && unit.projectileConfig) {
          projectileSystem.spawn({
            kind: 'healing',
            sourceUid: unit.uid,
            sourceSide: unit.side,
            sourceUnitId: unit.unitId,
            sourceBossId: unit.bossId || null,
            sourceEliteId: unit.eliteId || null,
            sourceClass: unit.unitClass,
            sourceIsBoss: Boolean(unit.isBoss),
            sourceIsElite: Boolean(unit.isElite),
            x: unit.x,
            y: unit.y,
            targetUid: target.uid,
            targetX: target.x,
            targetY: target.y,
            speed: unit.projectileConfig.speed || 46,
            color: unit.projectileConfig.color || '#34d399',
            healAmount: effHeal,
          });
        } else {
          this.applyHeal({ source: unit, target, rawHeal: effHeal, skillSystem });
        }
        this._eventBus?.emit('combat:attack', { source: unit, target, kind: 'heal' });
        continue;
      }

      if (target.side === unit.side) continue;

      const effAttack = unitManager.getEffectiveStat(unit, 'attack');
      const effArmorPierce = unitManager.getEffectiveStat(unit, 'armorPierce');
      const isRanged = Boolean(unit.projectileConfig) && unit.attackRange >= 12;

      if (isRanged && projectileSystem) {
        const projCfg = unit.projectileConfig;
        const projColor =
          (unit.unitClass === 'field_cleric' || unit.unitClass === 'defensive_support') &&
          projCfg.attackColor
            ? projCfg.attackColor
            : projCfg.color || (unit.side === 'ally' ? '#38bdf8' : '#f87171');
        projectileSystem.spawn({
          kind: projCfg.splashRadius > 0 ? 'aoe' : projCfg.type === 'healing' || projCfg.type === 'shield' ? 'magical' : projCfg.type || 'magical',
          sourceUid: unit.uid,
          sourceSide: unit.side,
          sourceUnitId: unit.unitId,
          sourceBossId: unit.bossId || null,
          sourceEliteId: unit.eliteId || null,
          sourceClass: unit.unitClass,
          sourceIsBoss: Boolean(unit.isBoss),
          sourceIsElite: Boolean(unit.isElite),
          x: unit.x,
          y: unit.y,
          targetUid: target.uid,
          targetX: target.x,
          targetY: target.y,
          speed: projCfg.speed || 50,
          color: projColor,
          damage: effAttack,
          attackType: unit.attackType || 'magical',
          armorPierce: effArmorPierce,
          critChance: unit.critChance,
          critMultiplier: unit.critMultiplier,
          splashRadius: projCfg.splashRadius || 0,
          onHitEffect: unit.onHitEffect || null,
        });
        this._eventBus?.emit('combat:attack', { source: unit, target, kind: 'ranged' });
      } else {
        this.applyDamage({
          source: unit,
          target,
          rawAttack: effAttack,
          attackType: unit.attackType || 'physical',
          armorPierce: effArmorPierce,
          critChance: unit.critChance,
          critMultiplier: unit.critMultiplier,
          unitManager,
          skillSystem,
        });
        if (unit.onHitEffect && target.hp > 0 && target.state !== UNIT_STATES.DEAD) {
          unitManager.applyStatusEffect(target, {
            ...unit.onHitEffect,
            sourceUid: unit.uid,
          });
        }
        // Melee cleave (e.g. Astral Automaton, Siege Juggernaut, Hyperion, Explosive Payload elites)
        if (unit.cleaveRadius > 0) {
          const enemySide = unit.side === 'ally' ? 'enemy' : 'ally';
          const nearby = unitManager.getBySide(enemySide);
          for (const foe of nearby) {
            if (foe.uid === target.uid) continue;
            if (Math.hypot(foe.x - target.x, foe.y - target.y) <= unit.cleaveRadius) {
              this.applyDamage({
                source: unit,
                target: foe,
                rawAttack: Math.round(effAttack * 0.6),
                attackType: unit.attackType || 'physical',
                armorPierce: effArmorPierce,
                critChance: 0,
                unitManager,
                skillSystem,
              });
            }
          }
        }
        this._eventBus?.emit('combat:attack', { source: unit, target, kind: 'melee' });
      }
    }
  }

  _updateUnitAbilities(dt, unit, unitManager, skillSystem) {
    // Tick ongoing ability cast windup (telegraph)
    if (unit.castingAbility) {
      unit.castingAbility.remaining -= dt;
      if (unit.castingAbility.remaining <= 0) {
        const cast = unit.castingAbility;
        unit.castingAbility = null;
        unitManager.setUnitState(unit, UNIT_STATES.IDLE);
        this._resolveBossAbility(unit, cast.ability, cast.x, cast.y, unitManager, skillSystem);
      }
      return true;
    }

    // Tick cooldowns
    for (const abId of unit.abilities) {
      if ((unit.abilityCooldowns[abId] ?? 0) > 0) {
        unit.abilityCooldowns[abId] = Math.max(0, unit.abilityCooldowns[abId] - dt);
      }
    }

    // Check if an enemy exists before triggering abilities
    const opposingSide = unit.side === 'ally' ? 'enemy' : 'ally';
    const opposing = unitManager.getBySide(opposingSide);
    if (opposing.length === 0) return false;

    for (const abId of unit.abilities) {
      if ((unit.abilityCooldowns[abId] ?? 0) > 0) continue;
      const abDef = this._data?.bossAbilitiesById?.get(abId);
      if (!abDef) continue;

      if (abDef.kind === 'self_heal_shield' && unit.hp > unit.maxHp * 0.85) {
        continue;
      }

      let tx = unit.x;
      let ty = unit.y;
      if (abDef.kind === 'aoe_damage' || abDef.kind === 'drain_aoe') {
        const target = unitManager.getByUid(unit.targetUid) || opposing[0];
        if (!target) continue;
        const dist = Math.hypot(target.x - unit.x, target.y - unit.y);
        if (abDef.targetMode === 'cluster') {
          if (dist > Math.max(unit.attackRange * 1.25, 28)) continue;
          tx = target.x;
          ty = target.y;
        } else if (dist > (abDef.radius || 18) * 1.15) {
          continue; // Wait until enemies are close enough for shockwave
        }
      }

      unit.abilityCooldowns[abId] = abDef.cooldownSec || 10;
      const telegraphDuration = abDef.telegraphSec || 0.6;
      unit.castingAbility = {
        ability: abDef,
        x: tx,
        y: ty,
        remaining: telegraphDuration,
      };
      unitManager.setUnitState(unit, UNIT_STATES.CASTING);

      if (unit.isBoss || unit.isElite || telegraphDuration >= 0.5) {
        this._telegraphs.push({
          id: `tg_${unit.uid}_${abId}_${Date.now()}`,
          x: tx,
          y: ty,
          radius: abDef.radius || 12,
          color: abDef.color || '#f87171',
          label: unit.isBoss || unit.isElite ? abDef.name : '',
          elapsed: 0,
          duration: telegraphDuration,
        });
      }

      this._eventBus?.emit('boss:abilityTelegraph', { unit, ability: abDef, x: tx, y: ty });
      return true;
    }

    return false;
  }

  _resolveBossAbility(caster, ability, x, y, unitManager, skillSystem) {
    if (!caster || caster.state === UNIT_STATES.DEAD || caster.hp <= 0) return;
    const opposingSide = caster.side === 'ally' ? 'enemy' : 'ally';

    if (ability.kind === 'aoe_damage') {
      const radius = ability.radius || 16;
      const rawAttack = unitManager.getEffectiveStat(caster, 'attack') * (ability.damageMultiplier || 1.4);
      const enemies = unitManager.getBySide(opposingSide);
      for (const foe of enemies) {
        if (Math.hypot(foe.x - x, foe.y - y) <= radius) {
          this.applyDamage({
            source: caster,
            target: foe,
            rawAttack,
            attackType: ability.attackType || 'magical',
            armorPierce: ability.armorPierce ?? caster.armorPierce ?? 0,
            critChance: caster.critChance * 0.5,
            critMultiplier: caster.critMultiplier,
            unitManager,
            skillSystem,
          });
          if (foe.hp > 0 && foe.state !== UNIT_STATES.DEAD) {
            if (ability.stunSec) {
              unitManager.applyStatusEffect(foe, {
                type: 'stun',
                value: 1,
                durationSec: ability.stunSec,
                sourceUid: caster.uid,
              });
            }
            if (ability.slowValue) {
              unitManager.applyStatusEffect(foe, {
                id: `${ability.id}_slow`,
                type: 'debuff_slow',
                value: ability.slowValue,
                durationSec: ability.slowSec || 3.5,
                sourceUid: caster.uid,
              });
            }
            if (ability.defenseShred) {
              unitManager.applyStatusEffect(foe, {
                id: `${ability.id}_shred`,
                type: 'debuff_defense',
                value: ability.defenseShred,
                durationSec: ability.shredDurationSec || 4.5,
                sourceUid: caster.uid,
              });
            }
            if (ability.burnDamagePerSec) {
              unitManager.applyStatusEffect(foe, {
                id: `${ability.id}_burn`,
                type: 'burn',
                value: ability.burnDamagePerSec,
                durationSec: ability.burnDurationSec || 3.5,
                sourceUid: caster.uid,
              });
            }
          }
        }
      }
    } else if (ability.kind === 'drain_aoe') {
      const radius = ability.radius || 18;
      const rawAttack = unitManager.getEffectiveStat(caster, 'attack') * (ability.damageMultiplier || 1.25);
      const enemies = unitManager.getBySide(opposingSide);
      let hits = 0;
      for (const foe of enemies) {
        if (Math.hypot(foe.x - x, foe.y - y) <= radius) {
          const res = this.applyDamage({
            source: caster,
            target: foe,
            rawAttack,
            attackType: ability.attackType || 'magical',
            critChance: 0,
            unitManager,
            skillSystem,
          });
          if (res.applied) hits += 1;
        }
      }
      if (hits > 0 && ability.shieldPerHit) {
        unitManager.applyStatusEffect(caster, {
          id: `${ability.id}_drain_shd`,
          type: 'shield',
          value: Math.min(900, hits * ability.shieldPerHit),
          durationSec: ability.durationSec || 6.0,
        });
      }
    } else if (ability.kind === 'self_heal_shield') {
      if (ability.healPercent) {
        this.applyHeal({
          source: caster,
          target: caster,
          rawHeal: Math.round(caster.maxHp * ability.healPercent),
          skillSystem,
        });
      }
      if (ability.shieldAmount) {
        unitManager.applyStatusEffect(caster, {
          id: `${ability.id}_shd`,
          type: 'shield',
          value: ability.shieldAmount,
          durationSec: ability.durationSec || 6.0,
        });
      }
    } else if (ability.kind === 'self_buff') {
      if (ability.attackBonus) {
        unitManager.applyStatusEffect(caster, {
          id: `${ability.id}_atk`,
          type: 'buff_attack',
          value: ability.attackBonus,
          durationSec: ability.durationSec || 4.0,
        });
      }
      if (ability.speedBonus) {
        unitManager.applyStatusEffect(caster, {
          id: `${ability.id}_spd`,
          type: 'buff_speed',
          value: ability.speedBonus,
          durationSec: ability.durationSec || 4.0,
        });
      }
    } else if (ability.kind === 'ally_barrier') {
      const radius = ability.radius || 20;
      const allies = unitManager.getBySide(caster.side);
      for (const ally of allies) {
        if (Math.hypot(ally.x - caster.x, ally.y - caster.y) <= radius) {
          if (ability.defenseBonus) {
            unitManager.applyStatusEffect(ally, {
              id: `${ability.id}_def`,
              type: 'buff_defense',
              value: ability.defenseBonus,
              durationSec: ability.durationSec || 5.0,
            });
          }
          if (ability.shieldAmount) {
            unitManager.applyStatusEffect(ally, {
              id: `${ability.id}_shd`,
              type: 'shield',
              value: ability.shieldAmount,
              durationSec: ability.durationSec || 5.0,
            });
          }
        }
      }
    } else if (ability.kind === 'summon') {
      for (const entry of ability.units || []) {
        for (let i = 0; i < (entry.count || 1); i += 1) {
          if (!unitManager.canSpawn(caster.side).ok) break;
          const offsetY = (i % 2 === 0 ? 1 : -1) * (5 + i * 3);
          unitManager.spawnUnit({
            unitId: entry.unitId,
            side: caster.side,
            x: caster.x + (caster.side === 'enemy' ? 4 : -4),
            y: caster.y + offsetY,
            level: caster.level,
          });
        }
      }
    } else if (ability.kind === 'ally_buff') {
      const radius = ability.radius || 28;
      const allies = unitManager.getBySide(caster.side);
      for (const ally of allies) {
        if (Math.hypot(ally.x - caster.x, ally.y - caster.y) <= radius) {
          if (ability.attackBonus) {
            unitManager.applyStatusEffect(ally, {
              id: `${ability.id}_atk`,
              type: 'buff_attack',
              value: ability.attackBonus,
              durationSec: ability.durationSec || 6,
            });
          }
          if (ability.speedBonus) {
            unitManager.applyStatusEffect(ally, {
              id: `${ability.id}_spd`,
              type: 'buff_speed',
              value: ability.speedBonus,
              durationSec: ability.durationSec || 6,
            });
          }
        }
      }
    } else if (ability.kind === 'self_defense') {
      if (ability.defenseBonus) {
        unitManager.applyStatusEffect(caster, {
          id: `${ability.id}_def`,
          type: 'buff_defense',
          value: ability.defenseBonus,
          durationSec: ability.durationSec || 5,
        });
      }
      if (ability.shieldAmount) {
        unitManager.applyStatusEffect(caster, {
          id: `${ability.id}_shd`,
          type: 'shield',
          value: ability.shieldAmount,
          durationSec: ability.durationSec || 5,
        });
      }
    }

    this._eventBus?.emit('boss:abilityResolved', { unit: caster, ability, x, y });
  }
}
