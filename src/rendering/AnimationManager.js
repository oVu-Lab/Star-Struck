/**
 * AnimationManager — Tracks screen-shake envelopes, screen flash veils, pooled
 * floating combat numbers (damage, crits, healing, shields, status callouts),
 * melee slash arcs, chain lightning arcs, expanding AoE/heal/boss rings, and
 * commander ultimate visual effects in world coordinates.
 */

export class AnimationManager {
  constructor({ maxFloatingTexts = 72, maxEffects = 56 } = {}) {
    this._shakeRemaining = 0;
    this._shakeIntensity = 0;
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
    this._shakeIntensity = Math.max(this._shakeIntensity, intensity);
    this._shakeRemaining = Math.max(this._shakeRemaining, durationSec);
  }

  triggerScreenFlash(color = '#e2b75b', durationSec = 0.32, maxAlpha = 0.24) {
    this._flashColor = color;
    this._flashDuration = Math.max(0.08, durationSec);
    this._flashRemaining = Math.max(this._flashRemaining, this._flashDuration);
    this._flashMaxAlpha = Math.min(0.42, Math.max(0.05, maxAlpha));
  }

  getScreenFlash() {
    if (this._flashRemaining <= 0) return null;
    const ratio = this._flashRemaining / Math.max(0.05, this._flashDuration);
    return {
      color: this._flashColor,
      alpha: ratio * this._flashMaxAlpha,
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
  }) {
    if (this._effects.length >= this._maxEffects) {
      const oldest = this._effects.shift();
      if (oldest) this._effectPool.push(oldest);
    }
    const fx = this._effectPool.length > 0 ? this._effectPool.pop() : {};
    // Supported kinds:
    // 'ring' | 'starfall' | 'volley' | 'tempest' | 'sanctuary' | 'bastion'
    // 'heal_wave' | 'deploy' | 'death' | 'slash' | 'lightning' | 'boss_entrance' | 'tactic_pulse' | 'lance'
    fx.kind = kind;
    fx.x = x;
    fx.y = y;
    fx.x2 = x2;
    fx.y2 = y2;
    fx.angle = angle;
    fx.radius = radius;
    fx.color = color;
    fx.secondaryColor = secondaryColor;
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

  update(dt) {
    this._elapsed += dt;
    if (this._shakeRemaining > 0) {
      this._shakeRemaining = Math.max(0, this._shakeRemaining - dt);
      if (this._shakeRemaining === 0) {
        this._shakeIntensity = 0;
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

  getShakeOffset() {
    if (this._shakeRemaining <= 0 || this._shakeIntensity <= 0) {
      return { x: 0, y: 0 };
    }
    const factor = this._shakeRemaining * 2.5;
    const amp = this._shakeIntensity * Math.min(1, factor);
    return {
      x: (Math.random() * 2 - 1) * amp,
      y: (Math.random() * 2 - 1) * amp,
    };
  }

  clearScreenShake() {
    this._shakeRemaining = 0;
    this._shakeIntensity = 0;
  }

  clearScreenEffects() {
    this.clearScreenShake();
    this._flashRemaining = 0;
  }

  reset() {
    this.clearScreenEffects();
    this._elapsed = 0;
    while (this._floatingTexts.length > 0) this._textPool.push(this._floatingTexts.pop());
    while (this._effects.length > 0) this._effectPool.push(this._effects.pop());
  }
}
