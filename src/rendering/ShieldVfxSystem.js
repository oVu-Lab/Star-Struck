/**
 * ShieldVfxSystem — Object-pooled runtime manager for Star Struck's Shield VFX.
 *
 * Manages:
 * - Per-unit active shield state (formation choreography, reinforcement surge,
 *   proportional strength tracking, subtle proximity tension, persistent low-HP cracks)
 * - Fixed-capacity pooled localized hit impulses (up to 5 concurrent hits per unit)
 * - Pooled world-space transient sequences for Shield Break (fracture + 2.5D tumbling fragments)
 *   and Shield Expiration (calm upward dissolve + rising motes)
 * - Graphics quality scaling ('low' | 'medium' | 'high') & clean teardown on battle reset
 */

import { getShieldTheme, resolveShieldTheme } from './ShieldVfxConfig.js';

export const MAX_CONCURRENT_HITS_PER_SHIELD = 5;
export const MAX_TRANSIENT_SHIELD_EFFECTS = 28;
const MAX_FRAGMENTS_PER_BREAK = 22;
const MAX_MOTES_PER_EXPIRE = 14;
const MAX_CRACK_ANCHORS = 4;

const FORMATION_DURATION_SEC = 0.44;
const REINFORCE_DURATION_SEC = 0.34;
const BREAK_DURATION_SEC = 0.64;
const EXPIRE_DURATION_SEC = 0.56;

function seededRand(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hashString(str) {
  let h = 2166136261 >>> 0;
  const text = String(str || 'shd');
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function createEmptyHitImpulse() {
  return {
    active: false,
    surfaceAngle: 0,
    severity: 0.5,
    age: 0,
    duration: 0.32,
    isCrit: false,
    attackType: 'physical',
    seed: 1,
  };
}

function createEmptyCrackAnchor() {
  return {
    active: false,
    angle: 0,
    seed: 1,
    intensity: 0.6,
  };
}

function createEmptyFragment() {
  return {
    ox: 0,
    oy: 0,
    vx: 0,
    vy: 0,
    rot: 0,
    vrot: 0,
    tilt: 0,
    vtilt: 0,
    size: 4,
    aspect: 1,
    colorIdx: 0,
    delay: 0,
    drag: 2.2,
    gravity: 22,
  };
}

function createEmptyShieldState() {
  const hitImpulses = [];
  for (let i = 0; i < MAX_CONCURRENT_HITS_PER_SHIELD; i += 1) {
    hitImpulses.push(createEmptyHitImpulse());
  }
  const cracks = [];
  for (let i = 0; i < MAX_CRACK_ANCHORS; i += 1) {
    cracks.push(createEmptyCrackAnchor());
  }
  return {
    uid: '',
    themeId: 'aegis_prism',
    phase: 'forming', // 'forming' | 'active'
    formAge: 0,
    formDuration: FORMATION_DURATION_SEC,
    formProgress: 0,
    reinforceAge: REINFORCE_DURATION_SEC,
    reinforceDuration: REINFORCE_DURATION_SEC,
    reinforcePulse: 0,
    strengthRatio: 1,
    targetStrengthRatio: 1,
    shieldAmount: 0,
    shieldMax: 1,
    idleTime: 0,
    proximityTension: 0,
    hitGlowBoost: 0,
    lastHitAngle: 0,
    hasBeenHit: false,
    seed: 1,
    hitImpulses,
    activeHitCount: 0,
    cracks,
    crackCount: 0,
  };
}

function createEmptyTransientEffect() {
  const fragments = [];
  for (let i = 0; i < MAX_FRAGMENTS_PER_BREAK; i += 1) {
    fragments.push(createEmptyFragment());
  }
  return {
    kind: 'break', // 'break' | 'expire'
    uid: '',
    x: 50,
    y: 50,
    visualScale: 1,
    unitId: '',
    unitClass: '',
    isBoss: false,
    isElite: false,
    facing: 1,
    themeId: 'aegis_prism',
    impactAngle: 0,
    severity: 0.85,
    age: 0,
    duration: BREAK_DURATION_SEC,
    seed: 1,
    fragmentCount: 0,
    fragments,
  };
}

export class ShieldVfxSystem {
  constructor({ quality = 'high' } = {}) {
    this._quality = quality;
    this._activeStates = new Map();
    this._statePool = [];
    this._transientEffects = [];
    this._transientPool = [];
    this._seq = 1;
    this._lastQualityScale = this._resolveQualityScale(quality);
  }

  _resolveQualityScale(quality) {
    if (quality === 'low') return 0.55;
    if (quality === 'medium') return 0.8;
    return 1.0;
  }

  setQuality(quality) {
    this._quality = quality || 'high';
    this._lastQualityScale = this._resolveQualityScale(this._quality);
  }

  getQuality() {
    return this._quality;
  }

  _acquireState() {
    return this._statePool.length > 0 ? this._statePool.pop() : createEmptyShieldState();
  }

  _releaseState(state) {
    if (!state) return;
    for (let i = 0; i < state.hitImpulses.length; i += 1) {
      state.hitImpulses[i].active = false;
    }
    for (let i = 0; i < state.cracks.length; i += 1) {
      state.cracks[i].active = false;
    }
    state.activeHitCount = 0;
    state.crackCount = 0;
    if (this._statePool.length < 64) {
      this._statePool.push(state);
    }
  }

  _acquireTransient() {
    return this._transientPool.length > 0
      ? this._transientPool.pop()
      : createEmptyTransientEffect();
  }

  _releaseTransient(fx) {
    if (!fx) return;
    fx.fragmentCount = 0;
    if (this._transientPool.length < MAX_TRANSIENT_SHIELD_EFFECTS) {
      this._transientPool.push(fx);
    }
  }

  _resetStateForNewShield(state, unit, themeId, shieldAmount, shieldMax) {
    const seq = this._seq++;
    state.uid = unit.uid;
    state.themeId = themeId;
    state.phase = 'forming';
    state.formAge = 0;
    state.formDuration = FORMATION_DURATION_SEC;
    state.formProgress = 0;
    state.reinforceAge = REINFORCE_DURATION_SEC;
    state.reinforceDuration = REINFORCE_DURATION_SEC;
    state.reinforcePulse = 0;
    state.shieldAmount = Math.max(0, shieldAmount);
    state.shieldMax = Math.max(1, shieldMax || shieldAmount || 1);
    const ratio = clamp(state.shieldAmount / state.shieldMax, 0, 1);
    state.strengthRatio = ratio;
    state.targetStrengthRatio = ratio;
    state.idleTime = (hashString(unit.uid) % 1000) * 0.00628;
    state.proximityTension = 0;
    state.hitGlowBoost = 0;
    state.lastHitAngle = (unit.facing ?? 1) >= 0 ? 0 : Math.PI;
    state.hasBeenHit = false;
    state.seed = hashString(`${unit.uid}_${seq}_${themeId}`);
    state.activeHitCount = 0;
    state.crackCount = 0;
    for (let i = 0; i < state.hitImpulses.length; i += 1) {
      state.hitImpulses[i].active = false;
    }
    for (let i = 0; i < state.cracks.length; i += 1) {
      state.cracks[i].active = false;
    }
  }

  /**
   * Called whenever a shield is applied or refreshed on a unit.
   */
  onShieldApplied({
    unit,
    amount = 0,
    totalShield = null,
    shieldMax = null,
    themeId = null,
    isRefresh = false,
    instant = false,
  } = {}) {
    if (!unit || !unit.uid) return null;
    const resolvedAmount = totalShield !== null ? totalShield : Math.max(0, unit.shield || amount);
    if (resolvedAmount <= 0) return null;

    const resolvedTheme = getShieldTheme(
      themeId || unit.shieldThemeId || resolveShieldTheme({ targetUnit: unit }).id,
    ).id;
    const resolvedMax = Math.max(1, shieldMax || unit.shieldMax || resolvedAmount);
    const existing = this._activeStates.get(unit.uid);

    if (existing && (isRefresh || existing.shieldAmount > 0)) {
      const themeChanged = existing.themeId !== resolvedTheme;
      existing.themeId = resolvedTheme;
      existing.shieldAmount = resolvedAmount;
      existing.shieldMax = Math.max(existing.shieldMax, resolvedMax);
      existing.targetStrengthRatio = clamp(resolvedAmount / existing.shieldMax, 0, 1);
      existing.reinforceAge = 0;
      existing.reinforceDuration = REINFORCE_DURATION_SEC;
      existing.reinforcePulse = 1;
      if (themeChanged && existing.phase === 'active') {
        // Gentle re-forming sheen when a completely different shield source takes over
        existing.formAge = existing.formDuration * 0.45;
        existing.formProgress = 0.45;
        existing.phase = 'forming';
      }
      // Heal cracks when shield is strongly restored
      if (existing.targetStrengthRatio > 0.55) {
        existing.crackCount = 0;
        for (let i = 0; i < existing.cracks.length; i += 1) {
          existing.cracks[i].active = false;
        }
      }
      return existing;
    }

    const state = existing || this._acquireState();
    this._resetStateForNewShield(state, unit, resolvedTheme, resolvedAmount, resolvedMax);
    if (instant) {
      state.phase = 'active';
      state.formAge = state.formDuration;
      state.formProgress = 1;
    }
    this._activeStates.set(unit.uid, state);
    return state;
  }

  /**
   * Called when incoming damage is absorbed by a unit's shield.
   * Records a localized impact impulse at the true impact surface angle.
   */
  onShieldHit({
    unit,
    absorbed = 0,
    remainingShield = null,
    shieldMax = null,
    impactAngle = null,
    severity = null,
    isCrit = false,
    attackType = 'physical',
  } = {}) {
    if (!unit || !unit.uid || absorbed <= 0) return null;

    let state = this._activeStates.get(unit.uid);
    if (!state) {
      // Ensure unit has a visual state if shield was seeded directly before event binding
      const fallbackMax = Math.max(1, shieldMax || unit.shieldMax || (unit.shield || 0) + absorbed);
      state = this.onShieldApplied({
        unit,
        totalShield: Math.max(1, (remainingShield ?? unit.shield ?? 0) + absorbed),
        shieldMax: fallbackMax,
        themeId: unit.shieldThemeId,
        instant: true,
      });
    }
    if (!state) return null;

    const rem = remainingShield !== null ? Math.max(0, remainingShield) : Math.max(0, unit.shield || 0);
    const maxVal = Math.max(1, shieldMax || unit.shieldMax || state.shieldMax || rem + absorbed);
    state.shieldAmount = rem;
    state.shieldMax = maxVal;
    state.targetStrengthRatio = clamp(rem / maxVal, 0, 1);

    const resolvedAngle = Number.isFinite(impactAngle)
      ? impactAngle
      : (unit.facing ?? 1) >= 0
        ? 0
        : Math.PI;

    // Proportional hit severity: light chip (0.24) -> standard (0.55) -> heavy/crit (1.0)
    const computedSeverity =
      typeof severity === 'number' && Number.isFinite(severity)
        ? clamp(severity, 0.2, 1.0)
        : clamp(
            (absorbed / Math.max(45, maxVal * 0.42)) * 0.72 + (isCrit ? 0.34 : 0.08),
            0.22,
            1.0,
          );

    // Pick inactive slot or recycle the oldest impulse so rapid multi-hits never overflow or turn chaotic
    let slot = null;
    let oldestAge = -1;
    for (let i = 0; i < state.hitImpulses.length; i += 1) {
      const candidate = state.hitImpulses[i];
      if (!candidate.active) {
        slot = candidate;
        break;
      }
      if (candidate.age > oldestAge) {
        oldestAge = candidate.age;
        slot = candidate;
      }
    }

    if (slot) {
      const seq = this._seq++;
      slot.active = true;
      slot.surfaceAngle = resolvedAngle;
      slot.severity = computedSeverity;
      slot.age = 0;
      slot.duration = 0.28 + computedSeverity * 0.20 + (isCrit ? 0.08 : 0);
      slot.isCrit = Boolean(isCrit);
      slot.attackType = attackType || 'physical';
      slot.seed = hashString(`${unit.uid}_hit_${seq}`);
    }

    state.lastHitAngle = resolvedAngle;
    state.hasBeenHit = true;
    state.hitGlowBoost = Math.min(1, Math.max(state.hitGlowBoost, 0.35 + computedSeverity * 0.65));

    // Anchor hairline cracks near impact angles so low-shield fractures originate from actual hits
    this._recordCrackAnchor(state, resolvedAngle, computedSeverity);

    return slot;
  }

  _recordCrackAnchor(state, angle, severity) {
    // Avoid stacking two crack anchors on nearly the exact same angle
    for (let i = 0; i < state.cracks.length; i += 1) {
      const c = state.cracks[i];
      if (!c.active) continue;
      let diff = Math.abs(c.angle - angle) % (Math.PI * 2);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff < 0.55) {
        c.intensity = Math.min(1, Math.max(c.intensity, 0.55 + severity * 0.45));
        return;
      }
    }
    const idx = state.crackCount % MAX_CRACK_ANCHORS;
    const crack = state.cracks[idx];
    crack.active = true;
    crack.angle = angle;
    crack.seed = hashString(`${state.uid}_crk_${this._seq++}`);
    crack.intensity = clamp(0.5 + severity * 0.5, 0.45, 1.0);
    state.crackCount = Math.min(MAX_CRACK_ANCHORS, state.crackCount + 1);
  }

  /**
   * Called when combat damage depletes a unit's shield from >0 to 0.
   * Triggers a distinct 3-phase Shield Break shatter animation with themed 2.5D fragments.
   */
  onShieldBroken({
    unit,
    themeId = null,
    impactAngle = null,
    severity = 0.9,
  } = {}) {
    if (!unit || !unit.uid) return null;

    const prevState = this._activeStates.get(unit.uid);
    const resolvedThemeId = getShieldTheme(
      themeId || prevState?.themeId || unit.shieldThemeId || resolveShieldTheme({ targetUnit: unit }).id,
    ).id;
    const resolvedAngle = Number.isFinite(impactAngle)
      ? impactAngle
      : prevState?.hasBeenHit
        ? prevState.lastHitAngle
        : (unit.facing ?? 1) >= 0
          ? 0
          : Math.PI;

    if (prevState) {
      this._activeStates.delete(unit.uid);
      this._releaseState(prevState);
    }

    const theme = getShieldTheme(resolvedThemeId);
    const fx = this._spawnTransient('break', unit, resolvedThemeId, resolvedAngle, clamp(severity, 0.5, 1.0));
    if (!fx) return null;

    const desiredCount = Math.max(
      8,
      Math.min(MAX_FRAGMENTS_PER_BREAK, Math.round((theme.fragmentCount || 16) * this._lastQualityScale)),
    );
    const rand = seededRand(fx.seed);
    fx.fragmentCount = desiredCount;

    const ix = Math.cos(resolvedAngle);
    const iy = Math.sin(resolvedAngle);

    for (let i = 0; i < desiredCount; i += 1) {
      const frag = fx.fragments[i];
      // Distribute fragments around shell surface with slight clustering near impact
      const baseTheta = (i / desiredCount) * Math.PI * 2 + (rand() - 0.5) * 0.32;
      const radialFraction = 0.58 + rand() * 0.42;
      frag.ox = Math.cos(baseTheta) * radialFraction;
      frag.oy = Math.sin(baseTheta) * radialFraction;

      // Velocity: outward radial burst + slight impulse away from the breaking hit
      const speed = 34 + rand() * 54 + (1 - Math.min(1, Math.abs(Math.atan2(Math.sin(baseTheta - resolvedAngle), Math.cos(baseTheta - resolvedAngle))) / Math.PI)) * 26;
      const outX = Math.cos(baseTheta) - ix * 0.28;
      const outY = Math.sin(baseTheta) - iy * 0.22;
      const outLen = Math.max(0.25, Math.hypot(outX, outY));
      frag.vx = (outX / outLen) * speed;
      frag.vy = (outY / outLen) * speed - (10 + rand() * 18);
      frag.rot = baseTheta + (rand() - 0.5) * 1.2;
      frag.vrot = (rand() - 0.5) * 9.5;
      frag.tilt = rand() * Math.PI;
      frag.vtilt = 4.5 + rand() * 7.5;
      frag.size = 3.2 + rand() * 3.8;
      frag.aspect = 0.55 + rand() * 0.7;
      frag.colorIdx = i % (theme.palette.fragments?.length || 3);
      // Fragments closest to the impact shatter slightly sooner than far side
      const angDist = Math.abs(Math.atan2(Math.sin(baseTheta - resolvedAngle), Math.cos(baseTheta - resolvedAngle))) / Math.PI;
      frag.delay = 0.09 + angDist * 0.08 + rand() * 0.025;
      frag.drag = 1.9 + rand() * 1.1;
      frag.gravity = 24 + rand() * 26;
    }

    return fx;
  }

  /**
   * Called when a timed shield status expires naturally and remaining shield reaches 0.
   * Triggers a calm, distinct upward dissolve (never a combat shatter).
   */
  onShieldExpired({ unit, themeId = null } = {}) {
    if (!unit || !unit.uid) return null;

    const prevState = this._activeStates.get(unit.uid);
    const resolvedThemeId = getShieldTheme(
      themeId || prevState?.themeId || unit.shieldThemeId || resolveShieldTheme({ targetUnit: unit }).id,
    ).id;

    if (prevState) {
      this._activeStates.delete(unit.uid);
      this._releaseState(prevState);
    }

    const fx = this._spawnTransient('expire', unit, resolvedThemeId, 0, 0.5);
    if (!fx) return null;

    const moteCount = Math.max(
      6,
      Math.min(MAX_MOTES_PER_EXPIRE, Math.round(12 * this._lastQualityScale)),
    );
    const rand = seededRand(fx.seed);
    fx.fragmentCount = moteCount;
    for (let i = 0; i < moteCount; i += 1) {
      const m = fx.fragments[i];
      const theta = (i / moteCount) * Math.PI * 2 + (rand() - 0.5) * 0.4;
      const rad = 0.72 + rand() * 0.28;
      m.ox = Math.cos(theta) * rad;
      m.oy = Math.sin(theta) * rad;
      m.vx = Math.cos(theta) * (6 + rand() * 10);
      m.vy = -(16 + rand() * 22);
      m.rot = rand() * Math.PI * 2;
      m.vrot = (rand() - 0.5) * 2.4;
      m.tilt = 0;
      m.vtilt = 0;
      m.size = 1.8 + rand() * 2.2;
      m.aspect = 1;
      m.colorIdx = i % 3;
      m.delay = rand() * 0.14;
      m.drag = 1.2;
      m.gravity = -8;
    }
    return fx;
  }

  _spawnTransient(kind, unit, themeId, impactAngle, severity) {
    if (this._transientEffects.length >= MAX_TRANSIENT_SHIELD_EFFECTS) {
      const oldest = this._transientEffects.shift();
      this._releaseTransient(oldest);
    }
    const fx = this._acquireTransient();
    const seq = this._seq++;
    fx.kind = kind;
    fx.uid = unit.uid;
    fx.x = unit.x;
    fx.y = unit.y;
    fx.visualScale = unit.visualScale || 1;
    fx.unitId = unit.unitId || '';
    fx.unitClass = unit.unitClass || '';
    fx.isBoss = Boolean(unit.isBoss);
    fx.isElite = Boolean(unit.isElite);
    fx.facing = (unit.facing ?? (unit.side === 'enemy' ? -1 : 1)) >= 0 ? 1 : -1;
    fx.themeId = themeId;
    fx.impactAngle = impactAngle;
    fx.severity = severity;
    fx.age = 0;
    fx.duration = kind === 'break' ? BREAK_DURATION_SEC : EXPIRE_DURATION_SEC;
    fx.seed = hashString(`${unit.uid}_${kind}_${seq}`);
    fx.fragmentCount = 0;
    this._transientEffects.push(fx);
    return fx;
  }

  onUnitRemoved(uid) {
    const state = this._activeStates.get(uid);
    if (state) {
      this._activeStates.delete(uid);
      this._releaseState(state);
    }
  }

  /**
   * Advances all active shield states, localized hit impulses, subtle proximity tension,
   * and transient break/expiration animations.
   */
  update(dt, units = [], projectiles = []) {
    if (!Number.isFinite(dt) || dt <= 0) return;

    const unitMap = new Map();
    for (let i = 0; i < units.length; i += 1) {
      const u = units[i];
      if (!u || !u.uid) continue;
      unitMap.set(u.uid, u);

      // Sync shield state if unit has an active shield (including initialShield or direct test spawns)
      if (u.shield > 0 && u.hp > 0 && u.state !== 'Dead') {
        let state = this._activeStates.get(u.uid);
        if (!state) {
          state = this.onShieldApplied({
            unit: u,
            totalShield: u.shield,
            shieldMax: u.shieldMax || u.shield,
            themeId: u.shieldThemeId,
          });
        }
        if (state) {
          state.shieldAmount = u.shield;
          state.shieldMax = Math.max(1, u.shieldMax || state.shieldMax || u.shield);
          state.targetStrengthRatio = clamp(u.shield / state.shieldMax, 0, 1);
          if (u.shieldThemeId && state.themeId !== u.shieldThemeId) {
            state.themeId = getShieldTheme(u.shieldThemeId).id;
          }
        }
      }
    }

    // Update active shield states
    for (const [uid, state] of this._activeStates.entries()) {
      const unit = unitMap.get(uid);
      if (!unit || unit.hp <= 0 || unit.state === 'Dead' || unit.shield <= 0) {
        this._activeStates.delete(uid);
        this._releaseState(state);
        continue;
      }

      state.idleTime += dt;

      if (state.phase === 'forming') {
        state.formAge += dt;
        state.formProgress = clamp(state.formAge / Math.max(0.05, state.formDuration), 0, 1);
        if (state.formProgress >= 1) {
          state.phase = 'active';
          state.formProgress = 1;
        }
      }

      if (state.reinforceAge < state.reinforceDuration) {
        state.reinforceAge = Math.min(state.reinforceDuration, state.reinforceAge + dt);
        const rt = state.reinforceAge / Math.max(0.05, state.reinforceDuration);
        state.reinforcePulse = Math.max(0, 1 - rt);
      } else {
        state.reinforcePulse = 0;
      }

      // Smooth strength ratio interpolation for responsive visual wear without jitter
      const diff = state.targetStrengthRatio - state.strengthRatio;
      state.strengthRatio = clamp(state.strengthRatio + diff * Math.min(1, dt * 11), 0, 1);

      if (state.hitGlowBoost > 0) {
        state.hitGlowBoost = Math.max(0, state.hitGlowBoost - dt * 2.8);
      }

      // Tick localized hit impulses
      let activeHits = 0;
      for (let i = 0; i < state.hitImpulses.length; i += 1) {
        const hit = state.hitImpulses[i];
        if (!hit.active) continue;
        hit.age += dt;
        if (hit.age >= hit.duration) {
          hit.active = false;
        } else {
          activeHits += 1;
        }
      }
      state.activeHitCount = activeHits;

      // Compute subtle proximity tension when hostile units or incoming projectiles are close
      let threat = 0;
      for (let i = 0; i < units.length; i += 1) {
        const other = units[i];
        if (!other || other.side === unit.side || other.hp <= 0 || other.state === 'Dead') continue;
        const d = Math.hypot(other.x - unit.x, other.y - unit.y);
        if (d < 13) {
          const t = (1 - d / 13) * (other.state === 'Attacking' ? 0.95 : 0.45);
          if (t > threat) threat = t;
        }
      }
      if (projectiles && projectiles.length > 0) {
        for (let i = 0; i < projectiles.length; i += 1) {
          const p = projectiles[i];
          if (!p || p.sourceSide === unit.side || p.kind === 'healing' || p.kind === 'shield') continue;
          const d = Math.hypot(p.x - unit.x, p.y - unit.y);
          if (d < 15) {
            const t = (1 - d / 15) * 0.9;
            if (t > threat) threat = t;
          }
        }
      }
      state.proximityTension += (clamp(threat, 0, 1) - state.proximityTension) * Math.min(1, dt * 6);
    }

    // Update transient break & expiration effects
    for (let i = this._transientEffects.length - 1; i >= 0; i -= 1) {
      const fx = this._transientEffects[i];
      fx.age += dt;
      if (fx.age >= fx.duration) {
        this._transientEffects.splice(i, 1);
        this._releaseTransient(fx);
        continue;
      }

      // Keep break/expire anchored to unit if unit is still alive during early phase
      const anchor = unitMap.get(fx.uid);
      if (anchor && anchor.hp > 0 && anchor.state !== 'Dead' && fx.age < 0.2) {
        fx.x = anchor.x;
        fx.y = anchor.y;
      }
    }
  }

  getUnitShieldState(uid) {
    return this._activeStates.get(uid) || null;
  }

  getActiveStateCount() {
    return this._activeStates.size;
  }

  getTransientEffects() {
    return this._transientEffects;
  }

  reset() {
    for (const state of this._activeStates.values()) {
      this._releaseState(state);
    }
    this._activeStates.clear();
    while (this._transientEffects.length > 0) {
      this._releaseTransient(this._transientEffects.pop());
    }
  }
}
