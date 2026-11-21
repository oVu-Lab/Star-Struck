/**
 * ProjectileSystem — Object-pooled 2D world-coordinate projectiles for ranged
 * attacks, magical bolts, area-of-effect impacts, and healing orbs.
 */

import { UNIT_STATES } from './UnitManager.js';

export class ProjectileSystem {
  constructor({ maxActive = 120, eventBus = null } = {}) {
    this._maxActive = maxActive;
    this._eventBus = eventBus;
    this._active = [];
    this._pool = [];
    this._nextId = 1;
  }

  _acquire() {
    return this._pool.length > 0 ? this._pool.pop() : {};
  }

  _release(proj) {
    if (this._pool.length < this._maxActive) {
      this._pool.push(proj);
    }
  }

  spawn({
    kind = 'basic', // 'basic' | 'magical' | 'aoe' | 'healing' | 'shield'
    sourceUid = null,
    sourceSide = 'ally',
    x,
    y,
    targetUid = null,
    targetX,
    targetY,
    speed = 48,
    color = '#38bdf8',
    damage = 0,
    healAmount = 0,
    shieldAmount = 0,
    attackType = 'magical',
    armorPierce = 0,
    critChance = 0,
    critMultiplier = 1.5,
    splashRadius = 0,
    onHitEffect = null,
    maxLifetime = 3.5,
  }) {
    if (this._active.length >= this._maxActive) {
      const oldest = this._active.shift();
      if (oldest) this._release(oldest);
    }

    const totalDist = Math.max(0.5, Math.hypot(targetX - x, targetY - y));
    const proj = this._acquire();
    proj.id = `proj_${this._nextId++}`;
    proj.kind = kind;
    proj.sourceUid = sourceUid;
    proj.sourceSide = sourceSide;
    proj.startX = x;
    proj.startY = y;
    proj.x = x;
    proj.y = y;
    proj.z = 2.5;
    proj.targetUid = targetUid;
    proj.targetX = targetX;
    proj.targetY = targetY;
    proj.speed = speed;
    proj.color = color;
    proj.damage = damage;
    proj.healAmount = healAmount;
    proj.shieldAmount = shieldAmount;
    proj.attackType = attackType;
    proj.armorPierce = armorPierce;
    proj.critChance = critChance;
    proj.critMultiplier = critMultiplier;
    proj.splashRadius = splashRadius;
    proj.onHitEffect = onHitEffect;
    proj.age = 0;
    proj.maxLifetime = maxLifetime;
    proj.totalDist = totalDist;
    proj.traveled = 0;

    this._active.push(proj);
    return proj;
  }

  update(dt, { unitManager = null, combatSystem = null, skillSystem = null } = {}) {
    for (let i = this._active.length - 1; i >= 0; i -= 1) {
      const p = this._active[i];
      p.age += dt;

      if (p.age >= p.maxLifetime) {
        this._active.splice(i, 1);
        this._release(p);
        continue;
      }

      // Homing onto living target if targetUid is bound
      let targetUnit = null;
      if (p.targetUid && unitManager) {
        const candidate = unitManager.getByUid(p.targetUid);
        if (candidate && candidate.state !== UNIT_STATES.DEAD && candidate.hp > 0) {
          targetUnit = candidate;
          p.targetX = candidate.x;
          p.targetY = candidate.y;
        }
      }

      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;

      if (dist <= Math.max(1.4, step)) {
        p.x = p.targetX;
        p.y = p.targetY;
        this._resolveImpact(p, targetUnit, unitManager, combatSystem, skillSystem);
        this._active.splice(i, 1);
        this._release(p);
        continue;
      }

      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
      p.traveled += step;

      // Parabolic arc height for isometric readability
      const progress = Math.min(1, p.traveled / Math.max(1, p.totalDist));
      const arcPeak = p.kind === 'aoe' ? 9 : p.kind === 'healing' || p.kind === 'shield' ? 5.5 : 4.0;
      p.z = 2.0 + Math.sin(progress * Math.PI) * arcPeak;
    }
  }

  _resolveImpact(proj, targetUnit, unitManager, combatSystem, skillSystem) {
    if (!combatSystem || !unitManager) {
      this._eventBus?.emit('projectile:impact', { projectile: proj });
      return;
    }

    const source = proj.sourceUid ? unitManager.getByUid(proj.sourceUid) : null;

    if (proj.kind === 'healing') {
      if (targetUnit && targetUnit.state !== UNIT_STATES.DEAD && targetUnit.hp > 0) {
        combatSystem.applyHeal({
          source,
          target: targetUnit,
          rawHeal: proj.healAmount,
          skillSystem,
        });
      }
      this._eventBus?.emit('projectile:impact', { projectile: proj, target: targetUnit });
      return;
    }

    if (proj.kind === 'shield') {
      if (targetUnit && targetUnit.state !== UNIT_STATES.DEAD && targetUnit.hp > 0) {
        unitManager.applyStatusEffect(targetUnit, {
          id: `proj_shield_${source?.uid || 'sup'}`,
          type: 'shield',
          value: proj.shieldAmount || 80,
          durationSec: 5.5,
          sourceUid: source?.uid || null,
        });
        unitManager.applyStatusEffect(targetUnit, {
          id: `proj_def_${source?.uid || 'sup'}`,
          type: 'buff_defense',
          value: 0.18,
          durationSec: 5.5,
          sourceUid: source?.uid || null,
        });
        targetUnit.healAnim = 0.3;
        this._eventBus?.emit('combat:shield', {
          source,
          target: targetUnit,
          amount: proj.shieldAmount || 80,
        });
      }
      this._eventBus?.emit('projectile:impact', { projectile: proj, target: targetUnit });
      return;
    }

    if (proj.splashRadius > 0 || proj.kind === 'aoe') {
      const radius = Math.max(4, proj.splashRadius);
      const enemySide = proj.sourceSide === 'ally' ? 'enemy' : 'ally';
      const foes = unitManager.getBySide(enemySide);
      for (const foe of foes) {
        if (Math.hypot(foe.x - proj.x, foe.y - proj.y) <= radius) {
          combatSystem.applyDamage({
            source,
            target: foe,
            rawAttack: proj.damage,
            attackType: proj.attackType,
            armorPierce: proj.armorPierce,
            critChance: proj.critChance,
            critMultiplier: proj.critMultiplier,
            unitManager,
            skillSystem,
          });
          if (proj.onHitEffect && foe.hp > 0 && foe.state !== UNIT_STATES.DEAD) {
            unitManager.applyStatusEffect(foe, {
              ...proj.onHitEffect,
              sourceUid: source?.uid || null,
            });
          }
        }
      }
      this._eventBus?.emit('projectile:impact', { projectile: proj, aoe: true, radius });
      return;
    }

    // Direct single-target hit
    let victim = targetUnit;
    if (!victim || victim.state === UNIT_STATES.DEAD || victim.hp <= 0) {
      // Find a nearby enemy at impact coordinates if original target died mid-flight
      const enemySide = proj.sourceSide === 'ally' ? 'enemy' : 'ally';
      const foes = unitManager.getBySide(enemySide);
      let nearest = null;
      let nearestDist = 4.5;
      for (const foe of foes) {
        const d = Math.hypot(foe.x - proj.x, foe.y - proj.y);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = foe;
        }
      }
      victim = nearest;
    }

    if (victim) {
      combatSystem.applyDamage({
        source,
        target: victim,
        rawAttack: proj.damage,
        attackType: proj.attackType,
        armorPierce: proj.armorPierce,
        critChance: proj.critChance,
        critMultiplier: proj.critMultiplier,
        unitManager,
        skillSystem,
      });
      if (proj.onHitEffect && victim.hp > 0 && victim.state !== UNIT_STATES.DEAD) {
        unitManager.applyStatusEffect(victim, {
          ...proj.onHitEffect,
          sourceUid: source?.uid || null,
        });
      }
    }

    this._eventBus?.emit('projectile:impact', { projectile: proj, target: victim });
  }

  getAll() {
    return this._active;
  }

  clear() {
    while (this._active.length > 0) {
      this._release(this._active.pop());
    }
  }
}
