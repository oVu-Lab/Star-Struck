/**
 * MovementSystem — Continuous 2D world-coordinate movement combining cached
 * grid A* pathfinding, class-specific positioning (cavalry flanking, archer
 * preferred range kiting), spatial-grid local separation, and obstacle bounds.
 */

import { UNIT_STATES } from './UnitManager.js';

const SPATIAL_CELL_SIZE = 10;

export class MovementSystem {
  constructor({ battlefield = null, pathfinder = null, balance = null } = {}) {
    this._bf = battlefield;
    this._pathfinder = pathfinder;
    this._balance = balance;
    this._spatialGrid = new Map();
  }

  configure({ battlefield, pathfinder, balance }) {
    if (battlefield) this._bf = battlefield;
    if (pathfinder) this._pathfinder = pathfinder;
    if (balance) this._balance = balance;
  }

  _buildSpatialGrid(units) {
    this._spatialGrid.clear();
    for (const u of units) {
      if (u.state === UNIT_STATES.DEAD || u.hp <= 0) continue;
      const gx = Math.floor(u.x / SPATIAL_CELL_SIZE);
      const gy = Math.floor(u.y / SPATIAL_CELL_SIZE);
      const key = `${gx},${gy}`;
      let bucket = this._spatialGrid.get(key);
      if (!bucket) {
        bucket = [];
        this._spatialGrid.set(key, bucket);
      }
      bucket.push(u);
    }
  }

  _getNearbyUnits(unit) {
    const gx = Math.floor(unit.x / SPATIAL_CELL_SIZE);
    const gy = Math.floor(unit.y / SPATIAL_CELL_SIZE);
    const result = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const bucket = this._spatialGrid.get(`${gx + dx},${gy + dy}`);
        if (bucket) {
          for (const other of bucket) {
            if (other.uid !== unit.uid) result.push(other);
          }
        }
      }
    }
    return result;
  }

  update(dt, unitManager, targetingSystem, activeTactic = null) {
    const units = unitManager.getAll();
    const pathInterval = this._balance?.combat?.pathRecalcIntervalSec ?? 0.45;
    const unreachableTimeout = this._balance?.combat?.unreachableTimeoutSec ?? 1.25;

    this._buildSpatialGrid(units);

    for (const unit of units) {
      if (unit.state === UNIT_STATES.DEAD || unit.hp <= 0) {
        unit.vx = 0;
        unit.vy = 0;
        continue;
      }

      if (unit.state === UNIT_STATES.STUNNED || unitManager.hasStatus(unit, 'stun')) {
        unit.vx = 0;
        unit.vy = 0;
        unitManager.setUnitState(unit, UNIT_STATES.STUNNED);
        continue;
      }

      if (unit.state === UNIT_STATES.CASTING) {
        unit.vx = 0;
        unit.vy = 0;
        continue;
      }

      // Acquire or validate target
      const targetInfo = targetingSystem.acquireTarget(
        unit,
        unitManager,
        this._pathfinder,
        activeTactic,
      );

      if (!targetInfo) {
        unit.targetUid = null;
        unit.path = [];
        unit.vx = 0;
        unit.vy = 0;
        unitManager.setUnitState(unit, UNIT_STATES.SEEKING_TARGET);
        this._applySeparationOnly(unit, dt);
        continue;
      }

      const target = targetInfo.target;
      unit.targetUid = target.uid;
      unit.targetMode = targetInfo.mode; // 'attack' | 'heal'

      const dx = target.x - unit.x;
      const dy = target.y - unit.y;
      const dist = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.1) {
        unit.facing = dx >= 0 ? 1 : -1;
      }

      const effectiveRange =
        targetInfo.mode === 'heal'
          ? (unit.healRange || unit.attackRange) + target.collisionRadius * 0.5
          : targetInfo.mode === 'shield'
            ? (unit.supportRange || unit.attackRange) + target.collisionRadius * 0.5
            : unit.attackRange + target.collisionRadius * 0.5;

      // Ranged kiting behavior for fragile ranged/caster classes when melee enemy gets too close
      const isRangedKiter =
        (unit.unitClass === 'arcane_archer' ||
          unit.unitClass === 'fast_ranged' ||
          unit.unitClass === 'aoe_caster' ||
          unit.unitClass === 'crowd_control') &&
        targetInfo.mode === 'attack' &&
        target.attackRange < 10 &&
        dist < unit.preferredRange * 0.52;

      if (isRangedKiter && this._bf) {
        const speed = unitManager.getEffectiveStat(unit, 'moveSpeed') * 0.72;
        const awayX = dist > 0.01 ? -dx / dist : unit.side === 'ally' ? -1 : 1;
        const awayY = dist > 0.01 ? -dy / dist : 0;
        const probeX = unit.x + awayX * speed * dt;
        const probeY = unit.y + awayY * speed * dt;
        if (this._bf.isWorldWalkable(probeX, probeY, unit.collisionRadius * 0.7)) {
          unit.vx = awayX * speed;
          unit.vy = awayY * speed;
          const resolved = this._bf.resolveObstacles(probeX, probeY, unit.collisionRadius);
          unit.x = resolved.x;
          unit.y = resolved.y;
          unitManager.setUnitState(unit, UNIT_STATES.MOVING);
          continue;
        }
      }

      // Already within attack / heal / shield distance
      if (dist <= effectiveRange) {
        unit.vx = 0;
        unit.vy = 0;
        unit.path = [];
        unit.unreachableTimer = 0;
        unitManager.setUnitState(
          unit,
          targetInfo.mode === 'heal' || targetInfo.mode === 'shield'
            ? UNIT_STATES.HEALING
            : UNIT_STATES.ATTACKING,
        );
        this._applySeparationOnly(unit, dt, 0.35);
        continue;
      }

      // Compute desired destination (Swift Cavalry attempts lateral flank on backline targets)
      let goalX = target.x;
      let goalY = target.y;
      if (
        unit.unitClass === 'swift_cavalry' &&
        dist > unit.attackRange * 1.6 &&
        target.attackRange >= 12 &&
        this._bf
      ) {
        const perpSign = (unit.phase % 2) >= 1 ? 1 : -1;
        const nx = dx / Math.max(0.01, dist);
        const ny = dy / Math.max(0.01, dist);
        const flankX = target.x - ny * 7 * perpSign;
        const flankY = target.y + nx * 7 * perpSign;
        if (this._bf.isWorldWalkable(flankX, flankY, unit.collisionRadius * 0.6)) {
          goalX = flankX;
          goalY = flankY;
        }
      }

      // Periodic cached A* pathfinding
      unit.pathTimer -= dt;
      if (unit.pathTimer <= 0 || !unit.path || unit.path.length === 0) {
        unit.pathTimer = pathInterval;
        if (this._pathfinder) {
          const pathRes = this._pathfinder.findPath(unit.x, unit.y, goalX, goalY);
          if (pathRes.reachable && pathRes.waypoints.length > 0) {
            unit.path = pathRes.waypoints;
            unit.unreachableTimer = 0;
          } else {
            unit.unreachableTimer += pathInterval;
            unit.path = [];
            if (unit.unreachableTimer >= unreachableTimeout) {
              targetingSystem.markUnreachable(unit, target.uid);
              unit.targetUid = null;
              unit.unreachableTimer = 0;
              unitManager.setUnitState(unit, UNIT_STATES.SEEKING_TARGET);
              continue;
            }
          }
        } else {
          unit.path = [{ x: goalX, y: goalY }];
        }
      }

      // Advance along current waypoint
      while (unit.path.length > 1) {
        const wp = unit.path[0];
        if (Math.hypot(wp.x - unit.x, wp.y - unit.y) <= 1.8) {
          unit.path.shift();
        } else {
          break;
        }
      }

      const nextWp = unit.path[0] || { x: goalX, y: goalY };
      const wdx = nextWp.x - unit.x;
      const wdy = nextWp.y - unit.y;
      const wDist = Math.hypot(wdx, wdy) || 0.001;
      const moveSpeed = unitManager.getEffectiveStat(unit, 'moveSpeed');

      let steerX = (wdx / wDist) * moveSpeed;
      let steerY = (wdy / wDist) * moveSpeed;

      // Local unit-to-unit separation + anti-stuck tangent deflection
      const sep = this._computeSeparation(unit);
      steerX += sep.x * moveSpeed * 0.85;
      steerY += sep.y * moveSpeed * 0.85;

      // Clamp steering magnitude to unit's max move speed
      const steerMag = Math.hypot(steerX, steerY);
      if (steerMag > moveSpeed) {
        steerX = (steerX / steerMag) * moveSpeed;
        steerY = (steerY / steerMag) * moveSpeed;
      }

      unit.vx = steerX;
      unit.vy = steerY;
      const nextX = unit.x + steerX * dt;
      const nextY = unit.y + steerY * dt;

      if (this._bf) {
        const resolved = this._bf.resolveObstacles(nextX, nextY, unit.collisionRadius);
        unit.x = resolved.x;
        unit.y = resolved.y;
      } else {
        unit.x = nextX;
        unit.y = nextY;
      }

      if (Math.abs(steerX) > 0.2) {
        unit.facing = steerX >= 0 ? 1 : -1;
      }
      unitManager.setUnitState(unit, UNIT_STATES.MOVING);
    }
  }

  _computeSeparation(unit) {
    const neighbors = this._getNearbyUnits(unit);
    let pushX = 0;
    let pushY = 0;
    let overlapCount = 0;

    for (const other of neighbors) {
      const dx = unit.x - other.x;
      const dy = unit.y - other.y;
      const minDist = (unit.collisionRadius + other.collisionRadius) * 0.92;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDist * minDist) {
        overlapCount += 1;
        const dist = Math.sqrt(distSq);
        if (dist > 0.001) {
          const weight = (minDist - dist) / minDist;
          pushX += (dx / dist) * weight;
          pushY += (dy / dist) * weight;
        } else {
          // Exact overlap fallback: deterministic radial angle from phase
          pushX += Math.cos(unit.phase) * 0.7;
          pushY += Math.sin(unit.phase) * 0.7;
        }
      }
    }

    // Small tangent perturbation if heavily crowded so units slide around crowds cleanly
    if (overlapCount >= 3) {
      const sign = unit.phase >= Math.PI ? 1 : -1;
      const tx = -pushY * 0.35 * sign;
      const ty = pushX * 0.35 * sign;
      pushX += tx;
      pushY += ty;
    }

    return { x: pushX, y: pushY };
  }

  _applySeparationOnly(unit, dt, strength = 0.5) {
    const sep = this._computeSeparation(unit);
    if (Math.abs(sep.x) < 0.01 && Math.abs(sep.y) < 0.01) return;
    const step = 6.0 * strength * dt;
    const nextX = unit.x + sep.x * step;
    const nextY = unit.y + sep.y * step;
    if (this._bf) {
      const resolved = this._bf.resolveObstacles(nextX, nextY, unit.collisionRadius);
      unit.x = resolved.x;
      unit.y = resolved.y;
    } else {
      unit.x = nextX;
      unit.y = nextY;
    }
  }
}
