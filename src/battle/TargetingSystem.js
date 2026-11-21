/**
 * TargetingSystem — Automatic class-driven target acquisition with priority rules,
 * accessibility checks, active tactic modifiers, and hysteresis stability.
 */

import { UNIT_STATES } from './UnitManager.js';

export class TargetingSystem {
  constructor({ balance = null } = {}) {
    this._balance = balance;
    // Map<unitUid, Map<targetUid, expirySimTime>>
    this._unreachableBlacklist = new Map();
    this._simTime = 0;
  }

  configure({ balance }) {
    if (balance) this._balance = balance;
  }

  tick(dt) {
    this._simTime += dt;
  }

  reset() {
    this._unreachableBlacklist.clear();
    this._simTime = 0;
  }

  markUnreachable(unit, targetUid, durationSec = 2.5) {
    if (!unit || !targetUid) return;
    let map = this._unreachableBlacklist.get(unit.uid);
    if (!map) {
      map = new Map();
      this._unreachableBlacklist.set(unit.uid, map);
    }
    map.set(targetUid, this._simTime + durationSec);
  }

  _isBlacklisted(unit, targetUid) {
    const map = this._unreachableBlacklist.get(unit.uid);
    if (!map) return false;
    const until = map.get(targetUid);
    if (until === undefined) return false;
    if (this._simTime >= until) {
      map.delete(targetUid);
      return false;
    }
    return true;
  }

  /**
   * Acquires or validates a unit's current target with switching hysteresis.
   * Returns { mode: 'attack' | 'heal', target, score, distance } or null.
   */
  acquireTarget(unit, unitManager, pathfinder = null, activeTactic = null) {
    if (!unit || unit.state === UNIT_STATES.DEAD || unit.hp <= 0) return null;

    const switchThreshold = this._balance?.combat?.targetSwitchThreshold ?? 1.22;

    // 1. Field Cleric prioritizes living injured allies first
    if (unit.unitClass === 'field_cleric' && unit.healPower > 0) {
      const healPick = this._pickHealTarget(unit, unitManager, switchThreshold);
      if (healPick) return healPick;
    }

    // 1b. Defensive Support (Aegis Sentinel / Cryo Warden) prioritizes unshielded allies
    if (unit.unitClass === 'defensive_support' && unit.shieldPower > 0) {
      const shieldPick = this._pickShieldTarget(unit, unitManager, switchThreshold);
      if (shieldPick) return shieldPick;
    }

    // 2. Hostile target selection for all classes (and Support fallback when allies are healthy/shielded)
    return this._pickEnemyTarget(unit, unitManager, pathfinder, activeTactic, switchThreshold);
  }

  _pickShieldTarget(unit, unitManager, switchThreshold) {
    const allies = unitManager.getBySide(unit.side);
    const needShield = allies.filter(
      (ally) =>
        ally.state !== UNIT_STATES.DEAD &&
        ally.hp > 0 &&
        (ally.shield || 0) < unit.shieldPower * 0.65,
    );
    if (needShield.length === 0) return null;

    const scoreAlly = (ally) => {
      const dist = Math.hypot(ally.x - unit.x, ally.y - unit.y);
      const hpRatio = ally.hp / Math.max(1, ally.maxHp);
      const frontlineBonus = ally.attackRange < 10 ? 1.4 : 1.0;
      const inRangeBonus = dist <= (unit.supportRange || unit.attackRange) ? 1.3 : 1.0;
      const selfPenalty = ally.uid === unit.uid ? 0.8 : 1.0;
      return (1.2 - hpRatio * 0.5) * frontlineBonus * inRangeBonus * selfPenalty / (1 + dist * 0.035);
    };

    let currentTarget = null;
    let currentScore = 0;
    if (unit.targetMode === 'shield' && unit.targetUid) {
      const cur = unitManager.getByUid(unit.targetUid);
      if (cur && cur.side === unit.side && cur.state !== UNIT_STATES.DEAD && cur.hp > 0 && (cur.shield || 0) < unit.shieldPower * 0.65) {
        currentTarget = cur;
        currentScore = scoreAlly(cur);
      }
    }

    let best = null;
    let bestScore = -1;
    for (const ally of needShield) {
      const sc = scoreAlly(ally);
      if (sc > bestScore) {
        bestScore = sc;
        best = ally;
      }
    }
    if (!best) return null;

    if (currentTarget && best.uid !== currentTarget.uid && bestScore < currentScore * switchThreshold) {
      return {
        mode: 'shield',
        target: currentTarget,
        score: currentScore,
        distance: Math.hypot(currentTarget.x - unit.x, currentTarget.y - unit.y),
      };
    }

    return {
      mode: 'shield',
      target: best,
      score: bestScore,
      distance: Math.hypot(best.x - unit.x, best.y - unit.y),
    };
  }

  _pickHealTarget(unit, unitManager, switchThreshold) {
    const allies = unitManager.getBySide(unit.side);
    const injured = allies.filter(
      (ally) => ally.state !== UNIT_STATES.DEAD && ally.hp > 0 && ally.hp < ally.maxHp * 0.96,
    );
    if (injured.length === 0) return null;

    const scoreAlly = (ally) => {
      const dist = Math.hypot(ally.x - unit.x, ally.y - unit.y);
      const hpRatio = ally.hp / Math.max(1, ally.maxHp);
      const missingRatio = 1 - hpRatio;
      const criticalBonus = hpRatio < 0.45 ? 1.65 : hpRatio < 0.7 ? 1.25 : 1.0;
      const valueBonus =
        (ally.unitClass === 'heavy_defender' || ally.unitClass === 'summoned_construct' ? 1.18 : 1.0) *
        (1 + (ally.tier - 1) * 0.15) *
        (ally.uid === unit.uid ? 0.88 : 1.0);
      const inRangeBonus = dist <= (unit.healRange || unit.attackRange) ? 1.3 : 1.0;
      const distFactor = 1 / (1 + dist * 0.035);
      return (0.4 + missingRatio * 2.4) * criticalBonus * valueBonus * inRangeBonus * distFactor;
    };

    let currentTarget = null;
    let currentScore = 0;
    if (unit.targetMode === 'heal' && unit.targetUid) {
      const cur = unitManager.getByUid(unit.targetUid);
      if (cur && cur.side === unit.side && cur.state !== UNIT_STATES.DEAD && cur.hp > 0 && cur.hp < cur.maxHp * 0.98) {
        currentTarget = cur;
        currentScore = scoreAlly(cur);
      }
    }

    let best = null;
    let bestScore = -1;
    for (const ally of injured) {
      const score = scoreAlly(ally);
      if (score > bestScore) {
        bestScore = score;
        best = ally;
      }
    }

    if (!best) return null;

    if (currentTarget && best.uid !== currentTarget.uid && bestScore < currentScore * switchThreshold) {
      return {
        mode: 'heal',
        target: currentTarget,
        score: currentScore,
        distance: Math.hypot(currentTarget.x - unit.x, currentTarget.y - unit.y),
      };
    }

    return {
      mode: 'heal',
      target: best,
      score: bestScore,
      distance: Math.hypot(best.x - unit.x, best.y - unit.y),
    };
  }

  _pickEnemyTarget(unit, unitManager, pathfinder, activeTactic, switchThreshold) {
    const enemySide = unit.side === 'ally' ? 'enemy' : 'ally';
    const enemies = unitManager.getBySide(enemySide);
    if (enemies.length === 0) return null;

    const allies = unitManager.getBySide(unit.side);

    const scoreEnemy = (enemy, allowBlacklistPenalty = true) => {
      const dist = Math.hypot(enemy.x - unit.x, enemy.y - unit.y);
      if (dist > unit.detectionRange) return -1;

      const distFactor = 1 / (1 + dist * 0.045);
      const hpRatio = enemy.hp / Math.max(1, enemy.maxHp);
      const threat =
        (enemy.attack / Math.max(0.4, enemy.attackInterval)) * 0.015 +
        (enemy.isBoss ? 1.4 : enemy.isElite ? 0.65 : 0) +
        (enemy.healPower > 0 || enemy.shieldPower > 0 ? 0.5 : 0);

      let classWeight = 1.0;

      if (unit.unitClass === 'heavy_defender' || unit.unitClass === 'summoned_construct') {
        // Prioritizes nearby frontline / melee threats and enemies threatening nearby allies
        const isFrontline =
          enemy.unitClass === 'heavy_defender' ||
          enemy.unitClass === 'summoned_construct' ||
          enemy.attackRange < 10;
        classWeight = isFrontline ? 1.45 : 0.92;
        for (const ally of allies) {
          if (ally.uid === unit.uid) continue;
          if (ally.attackRange >= 12 && Math.hypot(enemy.x - ally.x, enemy.y - ally.y) < 15) {
            classWeight += 0.45;
            break;
          }
        }
      } else if (unit.unitClass === 'anti_armor_melee') {
        // Prioritizes heavily armored targets, constructs, elites, and bosses
        const armorScore = 1 + Math.min(1.4, (enemy.defense || 0) / 30);
        const bossBonus = enemy.isBoss ? 1.45 : enemy.isElite ? 1.25 : 1.0;
        classWeight = armorScore * bossBonus;
      } else if (unit.unitClass === 'swift_cavalry') {
        // Prioritizes enemy ranged, healers, and low-defense vulnerable targets
        const isBackline =
          enemy.unitClass === 'arcane_archer' ||
          enemy.unitClass === 'field_cleric' ||
          enemy.attackRange >= 12;
        const lowDefenseBonus = enemy.defense <= 16 ? 1.25 : 0.95;
        classWeight = (isBackline ? 1.75 : 0.9) * lowDefenseBonus * (1 + (1 - hpRatio) * 0.35);
      } else if (unit.unitClass === 'arcane_archer') {
        // Prioritizes high-threat targets (bosses, elites, high DPS) and enemies in range
        const inRangeBonus = dist <= unit.attackRange ? 1.35 : 0.95;
        classWeight = (1.0 + threat * 0.55) * inRangeBonus;
      } else if (unit.unitClass === 'fast_ranged') {
        // Prioritizes closest advancing threats in firing range
        const inRangeBonus = dist <= unit.attackRange ? 1.5 : 0.95;
        classWeight = (1.1 + (enemy.moveSpeed >= 13 ? 0.35 : 0)) * inRangeBonus;
      } else if (unit.unitClass === 'aoe_caster') {
        // Prioritizes dense enemy clusters for maximum splash coverage
        let neighbors = 0;
        for (const other of enemies) {
          if (other.uid !== enemy.uid && Math.hypot(other.x - enemy.x, other.y - enemy.y) <= 10) {
            neighbors += 1;
          }
        }
        const inRangeBonus = dist <= unit.attackRange ? 1.25 : 0.95;
        classWeight = (1.0 + neighbors * 0.45) * inRangeBonus;
      } else if (unit.unitClass === 'crowd_control') {
        // Prioritizes fast/high-DPS threats that are not currently stunned
        const fastBonus = enemy.moveSpeed >= 13 ? 1.45 : 1.0;
        const stunPenalty = unitManager.hasStatus(enemy, 'stun') ? 0.65 : 1.15;
        classWeight = fastBonus * stunPenalty * (1 + threat * 0.35);
      } else {
        // Field Cleric / Support combat fallback: nearest weakened enemy
        classWeight = 1.0 + (1 - hpRatio) * 0.4;
      }

      // Active friendly Tactic card influence
      if (unit.side === 'ally' && activeTactic) {
        if (activeTactic.mode === 'focus_fire' && activeTactic.markedTargetUid === enemy.uid) {
          classWeight *= 2.4;
        } else if (activeTactic.mode === 'full_assault') {
          classWeight *= 1.15;
        } else if (activeTactic.mode === 'emergency_defense' && dist < 24) {
          classWeight *= 1.3;
        } else if (activeTactic.mode === 'flank_maneuver') {
          if (enemy.attackRange >= 12 || enemy.healPower > 0 || enemy.shieldPower > 0) {
            classWeight *= 2.1;
          }
        }
      }

      // Marked status debuff also attracts focus
      if (unitManager.hasStatus(enemy, 'mark')) {
        classWeight *= 1.8;
      }

      // Accessibility penalty for temporarily blacklisted targets
      if (allowBlacklistPenalty && this._isBlacklisted(unit, enemy.uid)) {
        classWeight *= 0.12;
      }

      return distFactor * classWeight * (1 + threat * 0.25);
    };

    // Evaluate existing target for hysteresis stability
    let currentTarget = null;
    let currentScore = 0;
    if (unit.targetMode === 'attack' && unit.targetUid) {
      const cur = unitManager.getByUid(unit.targetUid);
      if (
        cur &&
        cur.side === enemySide &&
        cur.state !== UNIT_STATES.DEAD &&
        cur.hp > 0 &&
        !this._isBlacklisted(unit, cur.uid)
      ) {
        const curDist = Math.hypot(cur.x - unit.x, cur.y - unit.y);
        if (curDist <= unit.detectionRange) {
          currentTarget = cur;
          currentScore = scoreEnemy(cur, true);
        }
      }
    }

    let best = null;
    let bestScore = -1;
    for (const enemy of enemies) {
      const score = scoreEnemy(enemy, true);
      if (score > bestScore) {
        bestScore = score;
        best = enemy;
      }
    }

    if (!best) return null;

    // Optional reachability check if pathfinder provided and best is outside attack range
    if (
      pathfinder &&
      Math.hypot(best.x - unit.x, best.y - unit.y) > unit.attackRange &&
      !pathfinder.isReachable(unit.x, unit.y, best.x, best.y)
    ) {
      this.markUnreachable(unit, best.uid, 2.0);
      // Try finding an alternate reachable enemy
      let altBest = null;
      let altScore = -1;
      for (const enemy of enemies) {
        if (enemy.uid === best.uid) continue;
        const sc = scoreEnemy(enemy, true);
        if (
          sc > altScore &&
          (Math.hypot(enemy.x - unit.x, enemy.y - unit.y) <= unit.attackRange ||
            pathfinder.isReachable(unit.x, unit.y, enemy.x, enemy.y))
        ) {
          altScore = sc;
          altBest = enemy;
        }
      }
      if (altBest) {
        best = altBest;
        bestScore = altScore;
      }
    }

    // Hysteresis: retain current target unless new candidate exceeds threshold
    if (
      currentTarget &&
      best.uid !== currentTarget.uid &&
      bestScore < currentScore * switchThreshold
    ) {
      return {
        mode: 'attack',
        target: currentTarget,
        score: currentScore,
        distance: Math.hypot(currentTarget.x - unit.x, currentTarget.y - unit.y),
      };
    }

    return {
      mode: 'attack',
      target: best,
      score: bestScore,
      distance: Math.hypot(best.x - unit.x, best.y - unit.y),
    };
  }
}
