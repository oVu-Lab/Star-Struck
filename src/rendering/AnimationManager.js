/**
 * AnimationManager — Tracks screen-shake envelopes, screen flash veils, pooled
 * floating combat numbers (damage, crits, healing, shields, status callouts),
 * melee slash arcs, chain lightning arcs, expanding AoE/heal/boss rings, and
 * commander ultimate visual effects in world coordinates.
 */

function isReducedMotionActive() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

const MAX_COMBINED_SHAKE = 9.0;

export class AnimationManager {
  constructor({ maxFloatingTexts = 72, maxEffects = 56 } = {}) {
    this._shakeRemaining = 0;
    this._shakeIntensity = 0;
    this._impulses = [];
    this._scheduledFlashes = [];
    this._impulseCounter = 0;
    this._flashRemaining = 0;
    this._flashDuration = 0.25;
    this._flashColor = '#e2b75b';
    this._flashMaxAlpha = 0.24;
    this._elapsed = 0;
    this._maxFloatingTexts = maxFloatingTexts;
    this._maxEffects = maxEffects;
    this._floatingTexts = [];
    this._textPool = [];
    this._effects = [];
    this._effectPool = [];
  }

  triggerScreenShake(intensity = 6, durationSec = 0.35) {
    if (intensity <= 0 || durationSec <= 0 || isReducedMotionActive()) return;
    this._shakeIntensity = Math.min(MAX_COMBINED_SHAKE, Math.max(this._shakeIntensity, intensity));
    this._shakeRemaining = Math.max(this._shakeRemaining, durationSec);
  }

  /**
   * Schedules a peak-synchronized, damped-harmonic camera impulse.
   * Respects prefers-reduced-motion and caps combined amplitude under simultaneous casts.
   */
  scheduleCameraImpulse({
    delaySec = 0,
    intensity = 5,
    durationSec = 0.26,
    dirX = 0,
    dirY = 0,
    reducedMotion = false,
  } = {}) {
    if (reducedMotion || intensity <= 0 || durationSec <= 0 || isReducedMotionActive()) return;
    if (this._impulses.length >= 10) {
      this._impulses.shift();
    }
    this._impulseCounter += 1;
    const dirLen = Math.hypot(dirX, dirY);
    this._impulses.push({
      delay: Math.max(0, Number(delaySec) || 0),
      elapsed: 0,
      duration: Math.max(0.06, Number(durationSec) || 0.24),
      intensity: Math.min(MAX_COMBINED_SHAKE, Math.max(0, Number(intensity) || 0)),
      dirX: dirLen > 1e-4 ? dirX / dirLen : 0,
      dirY: dirLen > 1e-4 ? dirY / dirLen : 0,
      hasDir: dirLen > 1e-4,
      seed: this._impulseCounter * 1.6180339,
    });
  }

  triggerScreenFlash(color = '#e2b75b', durationSec = 0.32, maxAlpha = 0.24) {
    this._flashColor = color;
    this._flashDuration = Math.max(0.08, durationSec);
    this._flashRemaining = Math.max(this._flashRemaining, this._flashDuration);
    this._flashMaxAlpha = Math.min(0.42, Math.max(0.04, maxAlpha));
  }

  scheduleScreenFlash({ delaySec = 0, color = '#e2b75b', durationSec = 0.24, maxAlpha = 0.14 } = {}) {
    if (maxAlpha <= 0.005) return;
    const delay = Math.max(0, Number(delaySec) || 0);
    if (delay <= 0.001) {
      this.triggerScreenFlash(color, durationSec, maxAlpha);
      return;
    }
    if (this._scheduledFlashes.length >= 10) {
      this._scheduledFlashes.shift();
    }
    this._scheduledFlashes.push({
      delay,
      color,
      durationSec: Math.max(0.08, Number(durationSec) || 0.24),
      maxAlpha: Math.min(0.32, Math.max(0.04, Number(maxAlpha) || 0.12)),
    });
  }

  getScreenFlash() {
    if (this._flashRemaining <= 0) return null;
    const ratio = this._flashRemaining / Math.max(0.05, this._flashDuration);
    return {
      color: this._flashColor,
      alpha: ratio * ratio * this._flashMaxAlpha,
    };
  }

  spawnFloatingText({ x, y, text, color = '#edf2fa', isCrit = false, kind = 'damage', duration = 0.85 }) {
    if (this._floatingTexts.length >= this._maxFloatingTexts) {
      const oldest = this._floatingTexts.shift();
      if (oldest) this._textPool.push(oldest);
    }
    const item = this._textPool.length > 0 ? this._textPool.pop() : {};
    item.x = x + (Math.random() - 0.5) * 2.6;
    item.y = y + (Math.random() - 0.5) * 1.6;
    item.z = isCrit ? 6.4 : 5.5;
    item.vz = isCrit ? 12.5 : 8.5;
    item.text = String(text);
    item.color = color;
    item.isCrit = Boolean(isCrit);
    item.kind = kind; // 'damage' | 'crit' | 'heal' | 'shield' | 'status'
    item.age = 0;
    item.duration = duration;
    this._floatingTexts.push(item);
  }

  spawnWorldEffect({
    kind = 'ring',
    x = 50,
    y = 50,
    x2 = null,
    y2 = null,
    angle = 0,
    radius = 14,
    color = '#38bdf8',
    secondaryColor = '#ffffff',
    duration = 0.65,
    cardId = null,
    tier = 1,
    targets = null,
    seed = 0,
    reducedMotion = false,
    profileId = null,
    style = null,
    side = null,
    scale = 1,
    isCrit = false,
    meta = null,
  }) {
    if (this._effects.length >= this._maxEffects) {
      const oldest = this._effects.shift();
      if (oldest) this._effectPool.push(oldest);
    }
    const fx = this._effectPool.length > 0 ? this._effectPool.pop() : {};
    // Supported kinds:
    // 'ring' | 'starfall' | 'volley' | 'tempest' | 'sanctuary' | 'bastion'
    // 'heal_wave' | 'deploy' | 'death' | 'slash' | 'lightning' | 'boss_entrance' | 'tactic_pulse' | 'lance'
    // plus all 18 bespoke non-Unit card effect kinds ('fx_*') and unit attack kinds ('ua_*')
    fx.kind = kind;
    fx.x = x;
    fx.y = y;
    fx.x2 = x2;
    fx.y2 = y2;
    fx.angle = angle;
    fx.radius = radius;
    fx.color = color;
    fx.secondaryColor = secondaryColor;
    fx.cardId = cardId;
    fx.tier = tier;
    fx.targets = Array.isArray(targets) ? targets : null;
    fx.seed = seed || Math.floor(Math.random() * 100000);
    fx.reducedMotion = Boolean(reducedMotion);
    fx.profileId = profileId;
    fx.style = style;
    fx.side = side;
    fx.scale = scale;
    fx.isCrit = Boolean(isCrit);
    fx.meta = meta;
    fx.age = 0;
    fx.duration = duration;
    this._effects.push(fx);
  }

  getFloatingTexts() {
    return this._floatingTexts;
  }

  getWorldEffects() {
    return this._effects;
  }

  removeEffectsBySourceUid(sourceUid, kinds = null) {
    if (!sourceUid) return 0;
    const kindSet = Array.isArray(kinds) ? new Set(kinds) : null;
    let removed = 0;
    for (let i = this._effects.length - 1; i >= 0; i -= 1) {
      const fx = this._effects[i];
      if (fx.meta?.sourceUid !== sourceUid) continue;
      if (kindSet && !kindSet.has(fx.kind)) continue;
      this._effects.splice(i, 1);
      this._effectPool.push(fx);
      removed += 1;
    }
    return removed;
  }

  update(dt) {
    this._elapsed += dt;
    if (this._shakeRemaining > 0) {
      this._shakeRemaining = Math.max(0, this._shakeRemaining - dt);
      if (this._shakeRemaining === 0) {
        this._shakeIntensity = 0;
      }
    }

    for (let i = this._impulses.length - 1; i >= 0; i -= 1) {
      const imp = this._impulses[i];
      if (imp.delay > 0) {
        imp.delay -= dt;
        if (imp.delay < 0) {
          imp.elapsed += -imp.delay;
          imp.delay = 0;
        }
      } else {
        imp.elapsed += dt;
      }
      if (imp.delay <= 0 && imp.elapsed >= imp.duration) {
        this._impulses.splice(i, 1);
      }
    }

    for (let i = this._scheduledFlashes.length - 1; i >= 0; i -= 1) {
      const sf = this._scheduledFlashes[i];
      sf.delay -= dt;
      if (sf.delay <= 0) {
        this.triggerScreenFlash(sf.color, sf.durationSec, sf.maxAlpha);
        this._scheduledFlashes.splice(i, 1);
      }
    }

    if (this._flashRemaining > 0) {
      this._flashRemaining = Math.max(0, this._flashRemaining - dt);
    }

    for (let i = this._floatingTexts.length - 1; i >= 0; i -= 1) {
      const item = this._floatingTexts[i];
      item.age += dt;
      item.z += item.vz * dt;
      item.vz *= Math.max(0, 1 - dt * 2.6);
      if (item.age >= item.duration) {
        this._floatingTexts.splice(i, 1);
        this._textPool.push(item);
      }
    }

    for (let i = this._effects.length - 1; i >= 0; i -= 1) {
      const fx = this._effects[i];
      fx.age += dt;
      if (fx.age >= fx.duration) {
        this._effects.splice(i, 1);
        this._effectPool.push(fx);
      }
    }
  }

  getElapsed() {
    return this._elapsed;
  }

  getActiveShakeIntensity() {
    if (isReducedMotionActive()) return 0;
    let total = 0;
    if (this._shakeRemaining > 0 && this._shakeIntensity > 0) {
      total += this._shakeIntensity * Math.min(1, this._shakeRemaining * 2.5);
    }
    for (let i = 0; i < this._impulses.length; i += 1) {
      const imp = this._impulses[i];
      if (imp.delay > 0) continue;
      const p = Math.max(0, Math.min(1, imp.elapsed / imp.duration));
      const env = Math.pow(1 - p, 1.75) * Math.exp(-2.0 * p);
      total += imp.intensity * env;
    }
    return Math.min(MAX_COMBINED_SHAKE, total);
  }

  getShakeOffset() {
    if (isReducedMotionActive()) {
      return { x: 0, y: 0 };
    }
    let ox = 0;
    let oy = 0;

    if (this._shakeRemaining > 0 && this._shakeIntensity > 0) {
      const factor = this._shakeRemaining * 2.5;
      const amp = this._shakeIntensity * Math.min(1, factor);
      ox += (Math.random() * 2 - 1) * amp;
      oy += (Math.random() * 2 - 1) * amp;
    }

    for (let i = 0; i < this._impulses.length; i += 1) {
      const imp = this._impulses[i];
      if (imp.delay > 0) continue;
      const p = Math.max(0, Math.min(1, imp.elapsed / imp.duration));
      // Brief strong impact impulse with smooth exponential damped-harmonic decay
      const env = Math.pow(1 - p, 1.75) * Math.exp(-2.0 * p);
      const amp = imp.intensity * env;
      const oscX = Math.cos(p * 26 + imp.seed * 7.1);
      const oscY = Math.sin(p * 31 + imp.seed * 11.3);
      if (imp.hasDir) {
        const kick = Math.exp(-6.5 * p);
        ox += (imp.dirX * kick * 0.85 + oscX * 0.45) * amp;
        oy += (imp.dirY * kick * 0.85 + oscY * 0.45) * amp;
      } else {
        ox += oscX * amp;
        oy += oscY * amp * 0.85;
      }
    }

    const mag = Math.hypot(ox, oy);
    if (mag > MAX_COMBINED_SHAKE) {
      const clampScale = MAX_COMBINED_SHAKE / mag;
      ox *= clampScale;
      oy *= clampScale;
    }
    return { x: ox, y: oy };
  }

  clearScreenShake() {
    this._shakeRemaining = 0;
    this._shakeIntensity = 0;
    this._impulses.length = 0;
  }

  clearScreenEffects() {
    this.clearScreenShake();
    this._flashRemaining = 0;
    this._scheduledFlashes.length = 0;
  }

  reset() {
    this.clearScreenEffects();
    this._elapsed = 0;
    while (this._floatingTexts.length > 0) this._textPool.push(this._floatingTexts.pop());
    while (this._effects.length > 0) this._effectPool.push(this._effects.pop());
  }
}
