/**
 * BattleManager — Orchestrates the complete P1 battle lifecycle:
 * Preparation -> Battle Start -> Active Combat <-> Wave Transition -> Victory/Defeat -> Results.
 *
 * Uses fixed time-step simulation (60Hz) for deterministic behavior at 1x, 2x, and 3x speeds,
 * supports headless stepping for automated integration testing, and never persists transient
 * battle state to localStorage.
 */

import { Battlefield } from './Battlefield.js';
import { Pathfinder } from './Pathfinder.js';
import { UNIT_STATES } from './UnitManager.js';
import { CARD_CATEGORIES } from '../systems/CardSystem.js';
import { getNonUnitCardVfxProfile, isNonUnitCard } from '../rendering/NonUnitCardVfxConfig.js';
import {
  UNIT_ATTACK_FX_KINDS,
  resolveUnitAttackVfxProfile,
} from '../rendering/UnitAttackVfxConfig.js';

export const BATTLE_PHASES = Object.freeze({
  PREPARATION: 'preparation',
  BATTLE_START: 'battle_start',
  ACTIVE_COMBAT: 'active_combat',
  WAVE_TRANSITION: 'wave_transition',
  VICTORY: 'victory',
  DEFEAT: 'defeat',
  RESULTS: 'results',
});

const VALID_TRANSITIONS = Object.freeze({
  [BATTLE_PHASES.PREPARATION]: new Set([BATTLE_PHASES.BATTLE_START]),
  [BATTLE_PHASES.BATTLE_START]: new Set([BATTLE_PHASES.ACTIVE_COMBAT]),
  [BATTLE_PHASES.ACTIVE_COMBAT]: new Set([
    BATTLE_PHASES.WAVE_TRANSITION,
    BATTLE_PHASES.VICTORY,
    BATTLE_PHASES.DEFEAT,
  ]),
  [BATTLE_PHASES.WAVE_TRANSITION]: new Set([
    BATTLE_PHASES.ACTIVE_COMBAT,
    BATTLE_PHASES.VICTORY,
    BATTLE_PHASES.DEFEAT,
  ]),
  [BATTLE_PHASES.VICTORY]: new Set([BATTLE_PHASES.RESULTS]),
  [BATTLE_PHASES.DEFEAT]: new Set([BATTLE_PHASES.RESULTS]),
  [BATTLE_PHASES.RESULTS]: new Set([BATTLE_PHASES.PREPARATION]),
});

const FIXED_DT = 1 / 60;
const ALLOWED_SPEEDS = [1, 2, 3];

export class BattleManager {
  constructor({
    dataRegistry,
    gameState,
    eventBus,
    progressionSystem,
    economySystem = null,
    heroSystem = null,
    cardSystem,
    unitManager,
    targetingSystem,
    movementSystem,
    combatSystem,
    projectileSystem,
    skillSystem,
    waveManager,
    battleRenderer,
    animationManager,
    particleSystem,
    audioManager,
  }) {
    this._data = dataRegistry;
    this._state = gameState;
    this._eventBus = eventBus;
    this._progression = progressionSystem;
    this._economy = economySystem;
    this._heroes = heroSystem;
    this._cards = cardSystem;
    this._units = unitManager;
    this._targeting = targetingSystem;
    this._movement = movementSystem;
    this._combat = combatSystem;
    this._projectiles = projectileSystem;
    this._skills = skillSystem;
    this._waves = waveManager;
    this._renderer = battleRenderer;
    this._anim = animationManager;
    this._particles = particleSystem;
    this._audio = audioManager;

    this.battlefield = new Battlefield({ balance: dataRegistry?.balance });
    this.pathfinder = new Pathfinder(this.battlefield);

    this._rafId = null;
    this._loopActive = false;
    this._loopSessionToken = 0;
    this._lastTimestamp = 0;
    this._accumulator = 0;
    this._activeStage = null;
    this._phase = BATTLE_PHASES.PREPARATION;
    this._phaseTimer = 0;
    this._activeTactic = null;
    this._selectedPrepUnitUid = null;
    this._initialAllyCount = 0;
    this._totalAlliesDeployed = 0;
    this._debugMode = false;
    this._sessionId = null;
    this._rewardsApplied = false;
    this._pointerWorld = null;
    this._hoverDais = false;
    this._isTutorial = false;
    this._tutorialCombatPaused = false;
    this._tutorialRefillPaused = false;
    this._tutorialProtectEnemies = false;
    this._tutorialActionFilter = null;
    this._unsubs = [];

    this._bindCombatFeedback();
  }

  isTutorialSession() {
    return this._isTutorial;
  }

  setTutorialCombatPaused(paused) {
    this._tutorialCombatPaused = Boolean(paused);
  }

  setTutorialRefillPaused(paused) {
    this._tutorialRefillPaused = Boolean(paused);
  }

  setTutorialProtectEnemies(protect) {
    this._tutorialProtectEnemies = Boolean(protect);
  }

  setTutorialActionFilter(filterFn) {
    this._tutorialActionFilter = typeof filterFn === 'function' ? filterFn : null;
  }

  _spawnWorldParticles(worldX, worldY, color, count, mode = 'burst') {
    if (!this._renderer || !this._particles || !this.battlefield) return;
    const { width, height } = this._renderer.getDimensions();
    const p = this.battlefield.worldToScreen(worldX, worldY, width, height, 3);
    if (mode === 'rising') {
      this._particles.spawnRising(p.x, p.y - 12, color, count);
    } else {
      this._particles.spawnBurst(p.x, p.y - 10, color, count);
    }
  }

  _spawnNonUnitCardVfx(
    card,
    { x = 50, y = 50, radius = 24, targets = null, particleMode = 'burst', extraBurstTargets = null } = {},
  ) {
    const profile = getNonUnitCardVfxProfile(card);
    if (!profile) return { x, y };

    const tier = Math.max(1, Math.min(3, Number(card?.tier) || 1));
    const pal = profile.palette;
    const bfCfg = profile.battlefield || {};
    const targetCoords = Array.isArray(targets)
      ? targets
          .filter((t) => t && typeof t.x === 'number' && typeof t.y === 'number')
          .slice(0, 10)
          .map((t) => ({ x: t.x, y: t.y }))
      : null;

    this._anim?.spawnWorldEffect({
      kind: profile.worldFxKind,
      x,
      y,
      radius,
      color: pal.primary,
      secondaryColor: pal.secondary,
      duration: profile.duration * (1 + (tier - 1) * 0.08),
      cardId: card?.cardId || profile.cardId,
      tier,
      targets: targetCoords,
    });

    if (this._renderer && this._particles && this.battlefield) {
      const { width, height } = this._renderer.getDimensions();
      const p = this.battlefield.worldToScreen(x, y, width, height, 3);
      const baseCount = Math.round((bfCfg.particleCount || 16) * (1 + (tier - 1) * 0.22));
      if (typeof this._particles.spawnThemed === 'function') {
        this._particles.spawnThemed(p.x, p.y - 10, {
          color: pal.primary,
          secondaryColor: pal.secondary,
          coreColor: pal.core,
          count: baseCount,
          mode: particleMode,
          shape: bfCfg.particleShape || 'spark',
          secondaryShape: bfCfg.secondaryParticleShape || 'star',
          speedScale: 1 + (tier - 1) * 0.14,
          spreadX: particleMode === 'rising' ? 38 : 22,
          spreadY: particleMode === 'rising' ? 16 : 12,
        });
        if (Array.isArray(extraBurstTargets) && extraBurstTargets.length > 0) {
          for (let i = 0; i < Math.min(extraBurstTargets.length, 6); i += 1) {
            const et = extraBurstTargets[i];
            if (!et || typeof et.x !== 'number' || typeof et.y !== 'number') continue;
            const ep = this.battlefield.worldToScreen(et.x, et.y, width, height, 3);
            this._particles.spawnThemed(ep.x, ep.y - 10, {
              color: pal.primary,
              secondaryColor: pal.spark || pal.secondary,
              coreColor: pal.core,
              count: 5 + tier,
              mode: particleMode,
              shape: bfCfg.particleShape || 'spark',
              secondaryShape: bfCfg.secondaryParticleShape || 'star',
              speedScale: 0.85,
              spreadX: 12,
              spreadY: 8,
            });
          }
        }
      } else {
        this._spawnWorldParticles(x, y, pal.primary, baseCount, particleMode === 'rising' ? 'rising' : 'burst');
      }
    }

    const durationScale = 1 + (tier - 1) * 0.08;
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (bfCfg.shakeIntensity > 0) {
      const shakeIntensity = bfCfg.shakeIntensity * (1 + (tier - 1) * 0.14);
      const shakeDuration = bfCfg.shakeDuration || 0.24;
      const shakeDelay = (bfCfg.shakeDelay || 0) * durationScale;
      if (typeof this._anim?.scheduleCameraImpulse === 'function') {
        this._anim.scheduleCameraImpulse({
          delaySec: shakeDelay,
          intensity: shakeIntensity,
          durationSec: shakeDuration,
          dirX: bfCfg.shakeDirX || 0,
          dirY: bfCfg.shakeDirY || 0,
          reducedMotion,
        });
      } else {
        this._anim?.triggerScreenShake(shakeIntensity, shakeDuration);
      }
    }
    if (bfCfg.flashAlpha > 0) {
      const flashAlpha = Math.min(0.22, bfCfg.flashAlpha * (1 + (tier - 1) * 0.12));
      const flashDuration = bfCfg.flashDuration || 0.24;
      const flashDelay = (bfCfg.flashDelay || 0) * durationScale;
      if (typeof this._anim?.scheduleScreenFlash === 'function') {
        this._anim.scheduleScreenFlash({
          delaySec: flashDelay,
          color: bfCfg.flashColor || pal.primary,
          durationSec: flashDuration,
          maxAlpha: flashAlpha,
        });
      } else {
        this._anim?.triggerScreenFlash(bfCfg.flashColor || pal.primary, flashDuration, flashAlpha);
      }
    }

    return { x, y };
  }

  _isCombatVisualActive() {
    return (
      this._phase === BATTLE_PHASES.BATTLE_START ||
      this._phase === BATTLE_PHASES.ACTIVE_COMBAT ||
      this._phase === BATTLE_PHASES.WAVE_TRANSITION
    );
  }

  _spawnDirectionalAttackParticles(worldX, worldY, angle, profile) {
    if (!this._renderer || !this._particles || !this.battlefield || !profile) return;
    const { width, height } = this._renderer.getDimensions();
    const p = this.battlefield.worldToScreen(worldX, worldY, width, height, 3);
    const pal = profile.palette || {};
    const cfg = profile.particles || {};
    if (typeof this._particles.spawnDirectional === 'function') {
      this._particles.spawnDirectional(p.x, p.y - 8, angle, {
        color: pal.primary || '#38bdf8',
        secondaryColor: pal.spark || pal.secondary || '#f5d37a',
        coreColor: pal.core || '#fffdf4',
        count: cfg.count || 6,
        shape: cfg.shape || 'streak',
        secondaryShape: cfg.secondaryShape || 'spark',
        mode: cfg.mode || 'cone',
        speedScale: cfg.speedScale || 1,
      });
    } else {
      this._spawnWorldParticles(
        worldX,
        worldY,
        pal.primary || '#38bdf8',
        cfg.count || 6,
        cfg.mode === 'rising' ? 'rising' : 'burst',
      );
    }
  }

  _spawnEmitterChargeParticles(source, angle, profile) {
    if (!this._renderer || !this._particles || !this.battlefield || !source || !profile?.beamSpec) return;
    if (typeof this._particles.spawnDirectional !== 'function') return;
    const { width, height } = this._renderer.getDimensions();
    const p0 = this.battlefield.worldToScreen(source.x, source.y, width, height, 0);
    const uScale = (source.visualScale || 1) * Math.max(0.76, Math.min(1.26, p0.scale / 8.0));
    const em = profile.emitter || { screenForwardPx: 12, screenYOffsetPx: -1 };
    const ex = p0.x + (source.facing || 1) * (em.screenForwardPx || 12) * uScale;
    const ey = p0.y - 44 * uScale * 0.3 + (em.screenYOffsetPx || 0) * uScale;
    const pal = profile.palette || {};
    this._particles.spawnDirectional(ex, ey, angle, {
      color: pal.primary || '#38bdf8',
      secondaryColor: pal.core || '#fffdf4',
      coreColor: pal.core || '#fffdf4',
      count: profile.beamSpec.beamKind === 'pulse_burst' ? 3 : 5,
      shape: 'spark',
      secondaryShape: 'diamond',
      mode: 'inward',
      speedScale: 0.55,
    });
  }

  _triggerAttackCameraImpulse(profile, angle = 0, { isCrit = false } = {}) {
    if (!this._isCombatVisualActive() || !profile?.cameraImpulse) return;
    const imp = profile.cameraImpulse;
    if (!imp || imp.intensity <= 0) return;
    if (imp.critOnly && !isCrit) return;
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    const intensity = isCrit ? imp.intensity * 1.25 : imp.intensity;
    if (typeof this._anim?.scheduleCameraImpulse === 'function') {
      this._anim.scheduleCameraImpulse({
        delaySec: 0,
        intensity,
        durationSec: imp.duration || 0.16,
        dirX: Math.cos(angle),
        dirY: Math.sin(angle) * 0.55,
        reducedMotion,
      });
    } else {
      this._anim?.triggerScreenShake?.(intensity, imp.duration || 0.16);
    }
  }

  _bindCombatFeedback() {
    if (!this._eventBus) return;
    this._unsubs.push(
      this._eventBus.on('combat:attack', ({ source, target, kind }) => {
        if (!source || !target) return;
        const mode = kind === 'heal' ? 'heal' : kind === 'shield' ? 'shield' : 'attack';
        const profile = resolveUnitAttackVfxProfile(source, { mode, side: source.side });
        const pal = profile.palette;
        const worldAngle = Math.atan2(target.y - source.y, target.x - source.x);

        // Compute screen-space strike angle when renderer is attached so directional
        // cast flashes and particles align accurately in 2.5D perspective
        let screenAngle = worldAngle;
        if (this._renderer && this.battlefield) {
          const { width, height } = this._renderer.getDimensions();
          const sp = this.battlefield.worldToScreen(source.x, source.y, width, height, 3.2);
          const tp = this.battlefield.worldToScreen(target.x, target.y, width, height, 3.2);
          if (Math.hypot(tp.x - sp.x, tp.y - sp.y) > 1) {
            screenAngle = Math.atan2(tp.y - sp.y, tp.x - sp.x);
          }
        }

        // Phase 1: Anticipation / muzzle / cast sigil at attacker origin
        if (profile.castStyle) {
          this._anim?.spawnWorldEffect({
            kind: UNIT_ATTACK_FX_KINDS.CAST,
            x: source.x,
            y: source.y,
            angle: screenAngle,
            radius: 4.5,
            color: pal.primary,
            secondaryColor: pal.secondary,
            duration: profile.castDuration || 0.18,
            profileId: profile.id,
            style: profile.castStyle,
            side: source.side,
            scale: source.visualScale || profile.scale || 1,
            meta: {
              mode,
              sourceUid: source.uid,
              targetUid: target.uid,
              sourceFacing: source.facing || 1,
            },
          });
        }
        if (mode === 'attack' && profile.beamSpec) {
          this._spawnEmitterChargeParticles(source, screenAngle, profile);
        }

        if (kind === 'melee') {
          // Phase 2 & 3: Bespoke melee choreography + directional impact particles
          this._anim?.spawnWorldEffect({
            kind: UNIT_ATTACK_FX_KINDS.MELEE,
            x: target.x,
            y: target.y,
            x2: source.x,
            y2: source.y,
            angle: screenAngle,
            radius: Math.max(source.cleaveRadius || 0, 4.5),
            color: pal.primary,
            secondaryColor: pal.secondary,
            duration: profile.duration || 0.28,
            profileId: profile.id,
            style: profile.meleeStyle,
            side: source.side,
            scale: source.visualScale || profile.scale || 1,
            meta: { mode: 'attack' },
          });
          this._spawnDirectionalAttackParticles(target.x, target.y, screenAngle, profile);
          this._triggerAttackCameraImpulse(profile, screenAngle, { isCrit: false });
        } else if (kind === 'ranged') {
          this._audio?.playProjectile?.();
        }
      }),
      this._eventBus.on('battle:unitSpawned', ({ unit }) => {
        if (!this._isTutorial || !unit || unit.side !== 'enemy') return;
        const scaling = this._activeStage?.tutorialScaling;
        if (!scaling) return;
        const hpScale = unit.isBoss ? (scaling.bossHpScale ?? 0.22) : (scaling.enemyHpScale ?? 0.42);
        const atkScale = unit.isBoss ? (scaling.bossAttackScale ?? 0.3) : (scaling.enemyAttackScale ?? 0.35);
        unit.maxHp = Math.max(40, Math.round(unit.maxHp * hpScale));
        unit.hp = unit.maxHp;
        unit.attack = Math.max(5, Math.round(unit.attack * atkScale));
        unit.defense = Math.max(2, Math.round(unit.defense * 0.5));
      }),
      this._eventBus.on('combat:damage', ({ source, target, amount, absorbed, isCrit, attackType }) => {
        if (!target) return;
        if (this._isTutorial && this._tutorialProtectEnemies && target.side === 'enemy') {
          const otherLiving = this._units.getBySide('enemy').filter((u) => u.uid !== target.uid);
          const floorHp = Math.max(1, Math.ceil(target.maxHp * 0.25));
          if (otherLiving.length === 0 && target.hp < floorHp) {
            target.hp = floorHp;
          }
        }
        this._anim?.spawnFloatingText({
          x: target.x,
          y: target.y,
          text: isCrit ? `-${amount}!` : `-${amount}`,
          color: isCrit ? '#fbbf24' : target.side === 'enemy' ? '#edf2fa' : '#f87171',
          isCrit,
          kind: isCrit ? 'crit' : 'damage',
        });
        if (isCrit || (absorbed && absorbed > 0)) {
          const profile = source ? resolveUnitAttackVfxProfile(source, { side: source.side }) : null;
          const hitAngle =
            typeof target.lastHitAngle === 'number'
              ? target.lastHitAngle
              : source
                ? Math.atan2(target.y - source.y, target.x - source.x)
                : 0;
          this._anim?.spawnWorldEffect({
            kind: UNIT_ATTACK_FX_KINDS.HIT,
            x: target.x,
            y: target.y,
            angle: hitAngle,
            radius: 4,
            color: absorbed > 0 && !isCrit ? '#38bdf8' : '#fbbf24',
            secondaryColor: '#fffdf4',
            duration: 0.22,
            profileId: profile?.id || null,
            side: source?.side || 'ally',
            scale: target.visualScale || 1,
            isCrit: Boolean(isCrit),
            meta: { absorbed: absorbed || 0, mode: 'attack' },
          });
          if (isCrit) {
            this._spawnWorldParticles(target.x, target.y, '#fbbf24', 6, 'burst');
            if (profile) {
              this._triggerAttackCameraImpulse(profile, hitAngle, { isCrit: true });
            }
          }
        }
        this._audio?.playHit(isCrit, attackType);
      }),
      this._eventBus.on('combat:heal', ({ target, amount }) => {
        if (!target || amount <= 0) return;
        this._anim?.spawnFloatingText({
          x: target.x,
          y: target.y,
          text: `+${amount}`,
          color: '#34d399',
          isCrit: false,
          kind: 'heal',
        });
        this._spawnWorldParticles(target.x, target.y, '#34d399', 4, 'rising');
        this._audio?.playHeal();
      }),
      this._eventBus.on('combat:shield', ({ target, amount }) => {
        if (!target || amount <= 0) return;
        this._anim?.spawnFloatingText({
          x: target.x,
          y: target.y,
          text: `+${Math.round(amount)} SHD`,
          color: '#38bdf8',
          isCrit: false,
          kind: 'shield',
        });
        this._spawnWorldParticles(target.x, target.y, '#38bdf8', 4, 'rising');
        this._audio?.playShield?.();
      }),
      this._eventBus.on('projectile:impact', ({ projectile, aoe, radius }) => {
        if (!projectile) return;
        const mode =
          projectile.kind === 'healing'
            ? 'heal'
            : projectile.kind === 'shield'
              ? 'shield'
              : 'attack';
        const profile = resolveUnitAttackVfxProfile(projectile, {
          mode,
          side: projectile.sourceSide,
        });
        const pal = profile.palette;

        let impactAngle = Math.atan2(
          projectile.y - (projectile.startY ?? projectile.y),
          projectile.x - (projectile.startX ?? projectile.x - 1),
        );
        if (this._renderer && this.battlefield && typeof projectile.startX === 'number') {
          const { width, height } = this._renderer.getDimensions();
          const sp = this.battlefield.worldToScreen(projectile.startX, projectile.startY, width, height, 3);
          const ep = this.battlefield.worldToScreen(projectile.x, projectile.y, width, height, 3);
          if (Math.hypot(ep.x - sp.x, ep.y - sp.y) > 1) {
            impactAngle = Math.atan2(ep.y - sp.y, ep.x - sp.x);
          }
        }

        const impactRadius = aoe
          ? Math.max(6, radius || projectile.splashRadius || 8)
          : Math.max(4, radius || projectile.splashRadius || 4.8);
        const sourceUnit = projectile.sourceUid ? this._units.getByUid(projectile.sourceUid) : null;
        const sourceFacing =
          sourceUnit?.facing ?? (projectile.x >= (projectile.startX ?? projectile.x) ? 1 : -1);
        const impactDuration =
          (mode === 'attack' && profile.beamSpec?.dissipateDuration) ||
          profile.duration ||
          (aoe ? 0.44 : 0.28);

        this._anim?.spawnWorldEffect({
          kind: UNIT_ATTACK_FX_KINDS.IMPACT,
          x: projectile.x,
          y: projectile.y,
          angle: impactAngle,
          radius: impactRadius,
          color: pal.primary,
          secondaryColor: pal.secondary,
          duration: impactDuration,
          profileId: profile.id,
          style: profile.impactStyle,
          side: projectile.sourceSide,
          scale: profile.scale || 1,
          meta: {
            mode,
            aoe: Boolean(aoe),
            sourceUid: projectile.sourceUid || null,
            targetUid: projectile.targetUid || null,
            startX: projectile.startX,
            startY: projectile.startY,
            sourceFacing,
          },
        });

        this._spawnDirectionalAttackParticles(projectile.x, projectile.y, impactAngle, profile);
        if (aoe || profile.isBoss) {
          this._triggerAttackCameraImpulse(profile, impactAngle, { isCrit: false });
        }
      }),
      this._eventBus.on('battle:unitDefeated', ({ unit }) => {
        if (!unit) return;
        this._anim?.removeEffectsBySourceUid?.(unit.uid, [UNIT_ATTACK_FX_KINDS.CAST]);
        const fxColor = unit.isBoss ? (unit.auraColor || '#e2b75b') : unit.side === 'ally' ? '#38bdf8' : '#f87171';
        this._anim?.spawnWorldEffect({
          kind: 'death',
          x: unit.x,
          y: unit.y,
          radius: unit.isBoss ? 18 : 7,
          color: fxColor,
          duration: unit.isBoss ? 0.85 : 0.55,
        });
        this._spawnWorldParticles(unit.x, unit.y, fxColor, unit.isBoss ? 22 : 7, 'burst');
        this._audio?.playUnitDeath?.(Boolean(unit.isBoss));
        if (unit.isBoss && this._isCombatVisualActive()) {
          this._anim?.triggerScreenShake(11, 0.55);
          this._anim?.triggerScreenFlash('#e2b75b', 0.4, 0.24);
        }
      }),
      this._eventBus.on('boss:abilityResolved', ({ unit, ability, x, y }) => {
        if (!ability) return;
        const profile = unit ? resolveUnitAttackVfxProfile(unit, { side: unit.side }) : null;
        const abColor = ability.color || profile?.palette?.primary || '#f87171';
        this._anim?.spawnWorldEffect({
          kind: UNIT_ATTACK_FX_KINDS.ABILITY,
          x: x ?? unit?.x ?? 50,
          y: y ?? unit?.y ?? 50,
          radius: ability.radius || 16,
          color: abColor,
          secondaryColor: profile?.palette?.secondary || '#fffdf4',
          duration: 0.65,
          profileId: profile?.id || null,
          side: unit?.side || 'enemy',
          scale: unit?.visualScale || profile?.scale || 1,
          meta: { abilityKind: ability.kind, abilityId: ability.id },
        });
        this._spawnWorldParticles(x ?? unit?.x ?? 50, y ?? unit?.y ?? 50, abColor, 12, 'burst');
        if ((unit?.isBoss || unit?.isElite) && this._isCombatVisualActive()) {
          this._anim?.triggerScreenShake(unit.isBoss ? 6 : 3, 0.28);
          this._audio?.playSkill();
        }
      }),
      this._eventBus.on('battle:bossSpawned', ({ boss }) => {
        if (!boss) return;
        this._anim?.spawnWorldEffect({
          kind: 'boss_entrance',
          x: boss.x,
          y: boss.y,
          radius: 26,
          color: boss.auraColor || '#ef4444',
          secondaryColor: '#e2b75b',
          duration: 1.15,
        });
        if (this._isCombatVisualActive()) {
          this._anim?.triggerScreenShake(8, 0.45);
          this._anim?.triggerScreenFlash(boss.auraColor || '#ef4444', 0.38, 0.22);
        }
        this._spawnWorldParticles(boss.x, boss.y, boss.auraColor || '#e2b75b', 18, 'burst');
        this._audio?.playBossEntrance?.();
        this._audio?.setBgmMode?.('boss');
      }),
    );
  }

  setDebugMode(enabled) {
    this._debugMode = Boolean(enabled);
    if (this._renderer?.setDebugMode) {
      this._renderer.setDebugMode(this._debugMode);
    }
    return this._debugMode;
  }

  toggleDebugMode() {
    return this.setDebugMode(!this._debugMode);
  }

  isDebugMode() {
    return this._debugMode;
  }

  getPhase() {
    return this._phase;
  }

  getSelectedPrepUnitUid() {
    return this._selectedPrepUnitUid;
  }

  getSelectedPrepUnit() {
    if (!this._selectedPrepUnitUid) return null;
    return this._units.getByUid(this._selectedPrepUnitUid) || null;
  }

  getSelectedCardSnapshot() {
    const idx = this._state?.battle?.selectedCardSlot ?? -1;
    if (idx < 0) return null;
    const slots = this._cards?.getSlots?.() || [];
    return slots[idx] || null;
  }

  handleCanvasHover(screenX, screenY) {
    if (!this._renderer) return;
    const { width, height } = this._renderer.getDimensions();
    this._pointerWorld = this.battlefield.screenToWorld(screenX, screenY, width, height);
    this._hoverDais =
      (this._phase === BATTLE_PHASES.ACTIVE_COMBAT ||
        this._phase === BATTLE_PHASES.WAVE_TRANSITION) &&
      Boolean(this._renderer.hitTestCommanderDais?.(screenX, screenY));
  }

  clearCanvasHover() {
    this._pointerWorld = null;
    this._hoverDais = false;
  }

  /**
   * Transitions the battle lifecycle phase with validation against invalid jumps.
   */
  transitionPhase(nextPhase) {
    if (this._phase === nextPhase) return true;
    const allowed = VALID_TRANSITIONS[this._phase];
    if (!allowed || !allowed.has(nextPhase)) {
      return false;
    }
    const prev = this._phase;
    this._phase = nextPhase;
    this._phaseTimer = 0;

    let status = 'running';
    if (nextPhase === BATTLE_PHASES.PREPARATION) status = 'preparation';
    else if (nextPhase === BATTLE_PHASES.VICTORY) status = 'victory';
    else if (nextPhase === BATTLE_PHASES.DEFEAT) status = 'defeat';
    else if (nextPhase === BATTLE_PHASES.RESULTS) status = 'results';

    if (
      nextPhase === BATTLE_PHASES.PREPARATION ||
      nextPhase === BATTLE_PHASES.VICTORY ||
      nextPhase === BATTLE_PHASES.DEFEAT ||
      nextPhase === BATTLE_PHASES.RESULTS
    ) {
      this._anim?.clearScreenShake?.();
    }

    this._state.setBattle({ phase: nextPhase, status });
    this._eventBus?.emit('battle:phaseChanged', { from: prev, to: nextPhase });
    return true;
  }

  /**
   * Initializes a new battle session in Preparation phase.
   * Works both with a Canvas element (browser) and without one (headless tests).
   */
  startSession(
    canvas = null,
    {
      stageId = null,
      customDeckIds = null,
      initialSlots = null,
      cardGenerator = null,
      stageConfig = null,
      isTutorial = false,
      enforceUnlock = false,
    } = {},
  ) {
    this.stopSession();

    let stage = null;
    if (stageConfig) {
      stage = stageConfig;
    } else if (stageId) {
      const candidate = this._data?.stagesById?.get(stageId) || null;
      if (candidate && (!enforceUnlock || !this._progression || this._progression.isStageUnlocked(candidate.id))) {
        stage = candidate;
      }
    }
    if (!stage && this._progression) {
      const selected = this._progression.getSelectedStage();
      if (selected && this._progression.isStageUnlocked(selected.id)) {
        stage = selected;
      } else if (typeof this._progression.getHighestUnlockedStage === 'function') {
        stage = this._progression.getHighestUnlockedStage();
      } else {
        stage = selected;
      }
    }
    if (!stage) {
      stage = this._data?.stages?.[0] || null;
    }
    this._activeStage = stage;
    this._isTutorial = Boolean(isTutorial || stage?.isTutorial);
    this._tutorialCombatPaused = false;
    this._tutorialRefillPaused = false;
    this._tutorialProtectEnemies = false;
    this._tutorialActionFilter = null;
    this._sessionId = `battle_${stage?.id || 'stage'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this._rewardsApplied = false;
    this._phase = BATTLE_PHASES.PREPARATION;
    this._phaseTimer = 0;
    this._accumulator = 0;
    this._activeTactic = null;
    this._selectedPrepUnitUid = null;

    // Load data-driven terrain for this stage
    const terrainCfg = stage?.terrainId
      ? this._data?.terrainsById?.get(stage.terrainId)
      : this._data?.terrains?.[0] || null;
    this.battlefield = new Battlefield({
      balance: this._data?.balance,
      terrainConfig: terrainCfg,
    });
    this.pathfinder = new Pathfinder(this.battlefield);

    // Wire subsystems to current battlefield & balance
    this._units.setBattlefield(this.battlefield);
    this._units.clear();
    this._projectiles.clear();
    this._targeting.configure({ balance: this._data?.balance });
    this._targeting.reset();
    this._movement.configure({
      battlefield: this.battlefield,
      pathfinder: this.pathfinder,
      balance: this._data?.balance,
    });
    this._combat.setDataRegistry(this._data);
    this._combat.resetStats();
    this._anim?.reset();
    this._waves.configure(stage, this._data?.balance);

    const resolvedDeckIds =
      customDeckIds ||
      (this._isTutorial && Array.isArray(stage?.tutorialDeckIds) ? stage.tutorialDeckIds : null);
    const resolvedInitialSlots =
      initialSlots ||
      (this._isTutorial && Array.isArray(stage?.tutorialInitialSlots)
        ? stage.tutorialInitialSlots
        : null);
    let resolvedCardGenerator = cardGenerator || null;
    if (!resolvedCardGenerator && this._isTutorial && Array.isArray(stage?.tutorialRefillSequence)) {
      let seqIdx = 0;
      const seq = stage.tutorialRefillSequence;
      resolvedCardGenerator = () => {
        const cardId = seq[seqIdx % seq.length];
        seqIdx += 1;
        return cardId;
      };
    }

    this._cards.initHand({
      customDeckIds: resolvedDeckIds,
      initialSlots: resolvedInitialSlots,
      cardGenerator: resolvedCardGenerator,
    });

    const energyCfg =
      (this._isTutorial && stage?.energyConfig) ||
      this._data?.balance?.commandEnergy || { max: 100, starting: 60 };
    const ultCfg = this._data?.balance?.ultimateEnergy || { max: 100, starting: 0 };
    const caps = this._units.getCaps();

    this._seedInitialFriendlyArmy(stage);

    this._state.setBattle({
      sessionId: this._sessionId,
      status: 'preparation',
      phase: BATTLE_PHASES.PREPARATION,
      stageId: stage?.id || 'stage_1_1',
      isTutorial: this._isTutorial,
      speedMultiplier: this._getDefaultBattleSpeed(),
      elapsedSec: 0,
      waveIndex: 1,
      totalWaves: this._waves.getTotalWaves(),
      waveLabel: stage?.waves?.[0]?.label || 'Wave 1',
      isBossWave: false,
      friendlyCount: this._units.getActiveCount('ally'),
      friendlyCap: caps.maxFriendly,
      enemyCount: 0,
      enemyCap: caps.maxEnemy,
      energy: energyCfg.starting,
      maxEnergy: energyCfg.max,
      dp: energyCfg.starting,
      maxDp: energyCfg.max,
      ultimateEnergy: ultCfg.starting,
      ultimateMaxEnergy: ultCfg.max,
      selectedCardSlot: -1,
      activeTactic: null,
      bannerText: 'Arrange your starting squad in the friendly zone, then press Start Battle.',
      bossInfo: null,
      results: null,
    });

    if (canvas && this._renderer) {
      this._renderer.attach(canvas);
      this._renderer.setBattlefield(this.battlefield);
      this._renderer.setDebugMode(this._debugMode);
      this._loopActive = true;
      this._loopSessionToken += 1;
      const loopToken = this._loopSessionToken;
      this._lastTimestamp = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this._loop(this._lastTimestamp, loopToken);
    }

    return {
      sessionId: this._sessionId,
      stage,
      phase: this._phase,
    };
  }

  _getOwnedUnitLevel(unitId) {
    return this._state.units?.owned?.[unitId]?.level || 1;
  }

  _seedInitialFriendlyArmy(stage) {
    const { passive } = this._skills.getActiveCommanderSkills();
    const formationSlots = this._state.formation?.unitSlots || [
      'heavy_shield_guard',
      'wind_cavalry',
      'arcane_archer',
      'field_cleric',
    ];
    const basePositions = [
      { x: 23, y: 36 },
      { x: 21, y: 64 },
      { x: 12, y: 34 },
      { x: 12, y: 66 },
    ];

    const initialSpecs =
      Array.isArray(stage?.initialAllies) && stage.initialAllies.length > 0
        ? stage.initialAllies.map((entry, idx) => ({
            unitId: formationSlots[idx % formationSlots.length] || entry.unitId,
            x: entry.x,
            y: entry.y,
          }))
        : formationSlots.map((unitId, idx) => ({
            unitId,
            x: basePositions[idx]?.x ?? 16,
            y: basePositions[idx]?.y ?? 25 + idx * 16,
          }));

    let spawned = 0;
    for (const spec of initialSpecs) {
      const unit = this._units.spawnUnit({
        unitId: spec.unitId,
        side: 'ally',
        x: spec.x,
        y: spec.y,
        level: this._getOwnedUnitLevel(spec.unitId),
        tier: 1,
        commanderPassive: passive,
        restrictToRegion: true,
      });
      if (unit) spawned += 1;
    }

    this._initialAllyCount = spawned;
    this._totalAlliesDeployed = spawned;
  }

  /**
   * Preparation Phase: selects or moves a friendly unit inside the friendly deployment region.
   */
  handleCanvasPointer(screenX, screenY) {
    if (!this._renderer) return null;
    const { width, height } = this._renderer.getDimensions();
    const world = this.battlefield.screenToWorld(screenX, screenY, width, height);

    if (this._phase === BATTLE_PHASES.PREPARATION) {
      const allies = this._units.getBySide('ally');
      let clickedUnit = null;
      let bestDist = 5.5;
      for (const ally of allies) {
        const d = Math.hypot(ally.x - world.x, ally.y - world.y);
        if (d < bestDist) {
          bestDist = d;
          clickedUnit = ally;
        }
      }

      if (clickedUnit) {
        this._selectedPrepUnitUid =
          this._selectedPrepUnitUid === clickedUnit.uid ? null : clickedUnit.uid;
        this._audio?.playClick();
        return { action: 'prep_selected', unit: clickedUnit, world };
      }

      if (this._selectedPrepUnitUid) {
        const res = this.movePrepUnit(this._selectedPrepUnitUid, world.x, world.y);
        if (res.ok) {
          this._audio?.playDeploy();
        }
        return { action: 'prep_moved', ...res, world };
      }
      return { action: 'none', world };
    }

    // During active combat, clicking the Commander Dais triggers the Commander Ultimate
    if (
      (this._phase === BATTLE_PHASES.ACTIVE_COMBAT ||
        this._phase === BATTLE_PHASES.WAVE_TRANSITION) &&
      this._renderer.hitTestCommanderDais?.(screenX, screenY)
    ) {
      const ultRes = this.triggerUltimate();
      return { action: 'commander_dais', ...ultRes, world };
    }

    // During active combat, clicking the battlefield deploys a selected card at that world point
    if (
      (this._phase === BATTLE_PHASES.ACTIVE_COMBAT ||
        this._phase === BATTLE_PHASES.WAVE_TRANSITION) &&
      this._state.battle.selectedCardSlot !== -1
    ) {
      const slotIndex = this._state.battle.selectedCardSlot;
      if (this._tutorialActionFilter) {
        const filterRes = this._tutorialActionFilter({
          type: 'canvas_deploy',
          slotIndex,
          card: this.getSelectedCardSnapshot(),
          world,
          isFriendlyRegion: this.battlefield.isInsideFriendlyRegion(world.x, world.y),
        });
        if (filterRes && filterRes.allowed === false) {
          this._audio?.playInvalid?.();
          return {
            action: 'played',
            ok: false,
            reason: filterRes.reason || 'Click inside the highlighted area.',
            world,
          };
        }
      }
      const res = this.playCardSlot(slotIndex, world);
      return { action: 'played', ...res, world };
    }

    return { action: 'none', world };
  }

  movePrepUnit(unitUid, worldX, worldY) {
    if (this._phase !== BATTLE_PHASES.PREPARATION) {
      return { ok: false, reason: 'Units can only be repositioned during Preparation.' };
    }
    const unit = this._units.getByUid(unitUid);
    if (!unit || unit.side !== 'ally') {
      return { ok: false, reason: 'Friendly unit not found.' };
    }
    if (!this.battlefield.isInsideFriendlyRegion(worldX, worldY)) {
      return { ok: false, reason: 'Units must be positioned inside the left friendly deployment region.' };
    }
    const safe = this.battlefield.findNearestWalkable(worldX, worldY, 'friendly');
    unit.x = safe.x;
    unit.y = safe.y;
    this._eventBus?.emit('battle:prepUpdated', { unit });
    return { ok: true, x: safe.x, y: safe.y };
  }

  cyclePrepUnitClass(unitUid) {
    if (this._phase !== BATTLE_PHASES.PREPARATION) {
      return { ok: false, reason: 'Can only swap unit classes during Preparation.' };
    }
    const unit = this._units.getByUid(unitUid);
    if (!unit || unit.side !== 'ally') return { ok: false };
    const ownedMap = this._state.units?.owned;
    const unitList = ownedMap
      ? this._data.units.filter((u) => Boolean(ownedMap[u.id]))
      : this._data.units;
    if (unitList.length === 0) return { ok: false };
    const curIdx = unitList.findIndex((u) => u.id === unit.unitId);
    const nextDef = unitList[(curIdx + 1) % unitList.length];
    if (!nextDef) return { ok: false };

    const { x, y } = unit;
    // Remove old prep unit and spawn replacement at same coordinates
    const all = this._units.getAll();
    const idx = all.findIndex((u) => u.uid === unit.uid);
    if (idx >= 0) all.splice(idx, 1);

    const { passive } = this._skills.getActiveCommanderSkills();
    const replacement = this._units.spawnUnit({
      unitId: nextDef.id,
      side: 'ally',
      x,
      y,
      level: this._getOwnedUnitLevel(nextDef.id),
      tier: 1,
      commanderPassive: passive,
      restrictToRegion: true,
    });
    this._selectedPrepUnitUid = replacement?.uid || null;
    this._audio?.playClick();
    this._eventBus?.emit('battle:prepUpdated', { unit: replacement });
    return { ok: true, unit: replacement };
  }

  /**
   * Switches the active off-field Commander during Preparation phase and refreshes
   * starting friendly units so the newly selected commander's passive takes immediate effect.
   */
  setPrepCommander(heroId) {
    if (this._phase !== BATTLE_PHASES.PREPARATION) {
      return { ok: false, reason: 'Commander can only be switched during Preparation.' };
    }
    if (!this._heroes?.isOwned(heroId)) {
      return { ok: false, reason: 'Commander is not owned yet.' };
    }
    this._state.mutatePersistent('formation', (p) => {
      p.formation.commanderId = heroId;
    });

    // Preserve exact unit positions and classes while re-applying new commander passive
    const snapshot = this._units.getBySide('ally').map((u) => ({
      unitId: u.unitId,
      x: u.x,
      y: u.y,
    }));
    this._units.clear();
    const { passive } = this._skills.getActiveCommanderSkills();
    for (const spec of snapshot) {
      this._units.spawnUnit({
        unitId: spec.unitId,
        side: 'ally',
        x: spec.x,
        y: spec.y,
        level: this._getOwnedUnitLevel(spec.unitId),
        tier: 1,
        commanderPassive: passive,
        restrictToRegion: true,
      });
    }
    this._selectedPrepUnitUid = null;
    this._audio?.playClick();
    this._eventBus?.emit('battle:prepUpdated', { commanderId: heroId });
    return { ok: true, commanderId: heroId };
  }

  /**
   * Starts active combat from Preparation phase.
   */
  beginBattle() {
    if (this._phase !== BATTLE_PHASES.PREPARATION) {
      return { ok: false, reason: 'Battle has already started.' };
    }
    this._selectedPrepUnitUid = null;
    this.transitionPhase(BATTLE_PHASES.BATTLE_START);
    this._state.setBattle({
      bannerText: `Wave 1 · ${this._activeStage?.waves?.[0]?.label || 'Engage!'}`,
    });
    this._audio?.playWave();
    this._audio?.setBgmMode?.('battle');
    return { ok: true };
  }

  stopSession() {
    this._loopActive = false;
    this._loopSessionToken += 1;
    if (this._rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    const wasTutorial = this._isTutorial;
    this._accumulator = 0;
    this._phaseTimer = 0;
    this._pointerWorld = null;
    this._hoverDais = false;
    this._isTutorial = false;
    this._tutorialCombatPaused = false;
    this._tutorialRefillPaused = false;
    this._tutorialProtectEnemies = false;
    this._tutorialActionFilter = null;
    this._cards?.clearBattleTimers?.();
    if (wasTutorial) {
      this._cards?.setCardGenerator?.(null);
    }
    this._projectiles?.clear?.();
    this._anim?.reset?.();
    this._particles?.clear?.();
    this._renderer?.detach();
    this._state.setBattle({
      status: 'idle',
      isTutorial: false,
      speedMultiplier: this._getDefaultBattleSpeed(),
      selectedCardSlot: -1,
      bannerText: '',
    });
  }

  _getDefaultBattleSpeed() {
    const configured = this._state.settings?.battleSpeed;
    return ALLOWED_SPEEDS.includes(configured) ? configured : 1;
  }

  handleResize() {
    this._renderer?.resize();
  }

  togglePause() {
    if (
      this._phase !== BATTLE_PHASES.ACTIVE_COMBAT &&
      this._phase !== BATTLE_PHASES.WAVE_TRANSITION &&
      this._phase !== BATTLE_PHASES.BATTLE_START
    ) {
      return this._state.battle.status;
    }
    const next = this._state.battle.status === 'paused' ? 'running' : 'paused';
    this._state.setBattle({ status: next });
    this._audio?.playClick();
    return next;
  }

  setPaused(paused) {
    if (
      this._phase !== BATTLE_PHASES.ACTIVE_COMBAT &&
      this._phase !== BATTLE_PHASES.WAVE_TRANSITION &&
      this._phase !== BATTLE_PHASES.BATTLE_START
    ) {
      return this._state.battle.status;
    }
    const next = paused ? 'paused' : 'running';
    this._state.setBattle({ status: next });
    return next;
  }

  cycleSpeed() {
    const cur = this._state.battle.speedMultiplier || 1;
    const idx = ALLOWED_SPEEDS.indexOf(cur);
    const next = ALLOWED_SPEEDS[(idx + 1) % ALLOWED_SPEEDS.length];
    this._state.setBattle({ speedMultiplier: next });
    this._audio?.playClick();
    return next;
  }

  toggleSpeed() {
    return this.cycleSpeed();
  }

  setSpeed(speed) {
    if (!ALLOWED_SPEEDS.includes(speed)) return this._state.battle.speedMultiplier;
    this._state.setBattle({ speedMultiplier: speed });
    return speed;
  }

  /**
   * Handles 6-slot tactical card interactions:
   * - Clicking an unselected occupied card selects it.
   * - Clicking another matching identical card of the same level (< Lv.III) in any slot merges them without spawning a unit.
   * - Clicking the already-selected card plays/deploys it immediately.
   */
  interactWithCardSlot(slotIndex) {
    if (
      this._phase !== BATTLE_PHASES.ACTIVE_COMBAT &&
      this._phase !== BATTLE_PHASES.WAVE_TRANSITION
    ) {
      return {
        action: 'blocked',
        ok: false,
        reason:
          this._phase === BATTLE_PHASES.PREPARATION
            ? 'Press Start Battle before playing tactical cards.'
            : 'Cards cannot be played after the battle has ended.',
      };
    }

    const slots = this._cards.getSlots();
    const clickedCard = slots[slotIndex];
    const selected = this._state.battle.selectedCardSlot;

    if (!clickedCard) {
      this._state.setBattle({ selectedCardSlot: -1 });
      return { action: 'empty', ok: false, reason: 'Empty card slot.' };
    }

    if (this._tutorialActionFilter) {
      const filterRes = this._tutorialActionFilter({
        type: 'card_slot',
        slotIndex,
        card: clickedCard,
        selectedCardSlot: selected,
      });
      if (filterRes && filterRes.allowed === false) {
        return {
          action: 'blocked',
          ok: false,
          reason: filterRes.reason || 'Follow the highlighted tutorial step.',
        };
      }
    }

    if (selected === -1) {
      this._state.setBattle({ selectedCardSlot: slotIndex });
      this._audio?.playCardSelect ? this._audio.playCardSelect() : this._audio?.playClick();
      return { action: 'selected', ok: true, slotIndex };
    }

    if (selected === slotIndex) {
      return { action: 'played', ...this.playCardSlot(slotIndex) };
    }

    if (this._cards.canMerge(selected, slotIndex)) {
      const mergeRes = this._cards.mergeAdjacent(selected, slotIndex);
      this._state.setBattle({
        selectedCardSlot: -1,
      });
      if (mergeRes.ok) {
        this._audio?.playMerge(mergeRes.upgradedCard?.tier || 2);
      }
      return { action: 'merged', ...mergeRes };
    }

    // Switch selection to the newly clicked slot
    this._state.setBattle({ selectedCardSlot: slotIndex });
    this._audio?.playCardSelect ? this._audio.playCardSelect() : this._audio?.playClick();
    return { action: 'selected', ok: true, slotIndex };
  }

  /**
   * Plays a specific card slot, applying Unit / Skill / Tactic / Support effects.
   */
  playCardSlot(slotIndex, targetWorld = null) {
    if (
      this._phase !== BATTLE_PHASES.ACTIVE_COMBAT &&
      this._phase !== BATTLE_PHASES.WAVE_TRANSITION
    ) {
      return { ok: false, reason: 'Cards can only be played during active combat.' };
    }

    const previewCard = this._cards.getSlots()[slotIndex];
    if (this._tutorialActionFilter && previewCard) {
      const isFriendlyRegion =
        targetWorld && typeof targetWorld.x === 'number' && typeof targetWorld.y === 'number'
          ? this.battlefield.isInsideFriendlyRegion(targetWorld.x, targetWorld.y)
          : null;
      const filterRes = this._tutorialActionFilter({
        type: 'play_card',
        slotIndex,
        card: previewCard,
        world: targetWorld,
        isFriendlyRegion,
      });
      if (filterRes && filterRes.allowed === false) {
        this._audio?.playInvalid?.();
        return { ok: false, reason: filterRes.reason || 'Follow the current tutorial step.' };
      }
    }

    const result = this._cards.playCard(slotIndex, { unitManager: this._units });
    this._state.setBattle({
      selectedCardSlot: -1,
    });

    if (!result.ok) {
      this._audio?.playInvalid?.();
      return result;
    }

    const card = result.card;
    const outcome = this._executeCardEffect(card, targetWorld);

    if (isNonUnitCard(card)) {
      this._eventBus?.emit('cards:nonUnitPlayed', {
        slotIndex,
        card,
        outcome,
        targetWorld,
        vfxAnchor: outcome?.vfxAnchor || null,
      });
    }

    this._syncCountersToState();
    return { ok: true, card, outcome };
  }

  _executeCardEffect(card, targetWorld = null) {
    const tierKey = String(card.tier || 1);

    // 1. UNIT CARD — Spawns unit(s) inside the left friendly deployment region
    if (card.category === CARD_CATEGORIES.UNIT) {
      const { passive } = this._skills.getActiveCommanderSkills();
      const count = card.spawnCount || 1;
      const region = this.battlefield.regions.friendly;
      const spawned = [];

      for (let i = 0; i < count; i += 1) {
        if (!this._units.canSpawn('ally').ok) break;
        const baseX =
          targetWorld && this.battlefield.isInsideFriendlyRegion(targetWorld.x, targetWorld.y)
            ? targetWorld.x
            : region.minX + 6 + Math.random() * Math.max(4, region.maxX - region.minX - 10);
        const baseY =
          targetWorld && this.battlefield.isInsideFriendlyRegion(targetWorld.x, targetWorld.y)
            ? targetWorld.y + (i - (count - 1) * 0.5) * 6
            : region.minY + 10 + Math.random() * Math.max(10, region.maxY - region.minY - 20);

        const ownedLevel = this._getOwnedUnitLevel(card.unitId);
        const unit = this._units.spawnUnit({
          unitId: card.unitId,
          side: 'ally',
          x: baseX,
          y: baseY,
          level: ownedLevel + Math.max(0, (card.unitLevel || 1) - 1),
          tier: card.tier,
          statMultiplier: card.statMultiplier || 1,
          commanderPassive: passive,
          restrictToRegion: true,
        });
        if (unit) {
          spawned.push(unit);
          this._totalAlliesDeployed += 1;
          this._anim?.spawnWorldEffect({
            kind: 'deploy',
            x: unit.x,
            y: unit.y,
            radius: 6 + card.tier * 1.8,
            color: card.tier > 1 ? '#e2b75b' : '#38bdf8',
            secondaryColor: card.tier >= 3 ? '#fde68a' : '#7dd3fc',
            duration: card.tier > 1 ? 0.65 : 0.5,
          });
          this._spawnWorldParticles(
            unit.x,
            unit.y,
            card.tier > 1 ? '#fbbf24' : '#38bdf8',
            card.tier >= 3 ? 14 : card.tier === 2 ? 9 : 5,
            'rising',
          );
          if (card.tier > 1 && i === 0) {
            this._anim?.spawnFloatingText({
              x: unit.x,
              y: unit.y,
              text: `${card.tier >= 3 ? 'Lv.III' : 'Lv.II'} ${unit.name}`,
              color: '#fde68a',
              isCrit: card.tier >= 3,
              kind: 'buff',
            });
          }
        }
      }

      this._audio?.playDeploy();
      return { kind: 'unit_spawn', spawned };
    }

    const eff = card.effect || {};

    // 2. SKILL CARD — Resolves real combat damage, healing, shields, or crowd control
    if (card.category === CARD_CATEGORIES.SKILL) {
      this._audio?.playSkill();
      if (eff.kind === 'aoe_damage' || eff.kind === 'crowd_control') {
        const enemies = this._units.getBySide('enemy');
        const center = this._pickEnemyClusterCenter(enemies, targetWorld);
        const radius = eff.radiusByTier?.[tierKey] ?? 18;
        const damage = eff.damageByTier?.[tierKey] ?? 140;
        const stunSec = eff.stunSecByTier?.[tierKey] ?? 0;
        let hitCount = 0;
        const hitPositions = [];

        let statusTagged = false;
        for (const enemy of enemies) {
          if (Math.hypot(enemy.x - center.x, enemy.y - center.y) <= radius) {
            hitPositions.push({ x: enemy.x, y: enemy.y });
            const res = this._combat.applyDamage({
              source: null,
              target: enemy,
              rawAttack: damage,
              attackType: eff.attackType || 'magical',
              critChance: 0.1,
              unitManager: this._units,
              skillSystem: this._skills,
            });
            if (res.applied) hitCount += 1;
            if (eff.burnDamagePerSec && enemy.hp > 0 && enemy.state !== UNIT_STATES.DEAD) {
              this._units.applyStatusEffect(enemy, {
                id: `${card.cardId}_burn`,
                type: 'burn',
                value: Math.round(eff.burnDamagePerSec * (1 + (card.tier - 1) * 0.4)),
                durationSec: eff.burnDurationSec || 3.5,
              });
              if (!statusTagged) {
                this._anim?.spawnFloatingText({
                  x: enemy.x,
                  y: enemy.y,
                  text: 'BURN',
                  color: '#fb923c',
                  kind: 'status',
                });
                statusTagged = true;
              }
            }
            if (stunSec > 0 && enemy.hp > 0 && enemy.state !== UNIT_STATES.DEAD) {
              this._units.applyStatusEffect(enemy, {
                id: `${card.cardId}_stun`,
                type: 'stun',
                value: 1,
                durationSec: stunSec,
              });
              if (!statusTagged) {
                this._anim?.spawnFloatingText({
                  x: enemy.x,
                  y: enemy.y,
                  text: 'STUN',
                  color: '#fbbf24',
                  kind: 'status',
                });
                statusTagged = true;
              }
            }
          }
        }

        const vfxAnchor = this._spawnNonUnitCardVfx(card, {
          x: center.x,
          y: center.y,
          radius,
          targets: hitPositions.length > 0 ? hitPositions : [center],
          particleMode: eff.kind === 'crowd_control' ? 'inward' : 'burst',
          extraBurstTargets: hitPositions.slice(0, 4),
        });
        return { kind: eff.kind, center, radius, hitCount, vfxAnchor };
      }

      if (eff.kind === 'single_nuke') {
        const enemies = this._units.getBySide('enemy');
        const target =
          enemies.find((e) => e.isBoss) ||
          enemies.find((e) => e.isElite) ||
          [...enemies].sort((a, b) => b.maxHp + b.attack * 3 - (a.maxHp + a.attack * 3))[0] ||
          null;
        if (target) {
          const damage = eff.damageByTier?.[tierKey] ?? 280;
          const res = this._combat.applyDamage({
            source: null,
            target,
            rawAttack: damage,
            attackType: eff.attackType || 'physical',
            armorPierce: eff.armorPierce ?? 0.55,
            critChance: 0.15,
            unitManager: this._units,
            skillSystem: this._skills,
          });
          const shred = eff.defenseShredByTier?.[tierKey] ?? 0.2;
          if (shred > 0 && target.hp > 0 && target.state !== UNIT_STATES.DEAD) {
            this._units.applyStatusEffect(target, {
              id: `${card.cardId}_shred`,
              type: 'debuff_defense',
              value: shred,
              durationSec: eff.shredDurationSec || 5.0,
            });
            this._anim?.spawnFloatingText({
              x: target.x,
              y: target.y,
              text: 'SUNDER',
              color: '#f87171',
              kind: 'status',
            });
          }
          const vfxAnchor = this._spawnNonUnitCardVfx(card, {
            x: target.x,
            y: target.y,
            radius: 13,
            targets: [{ x: target.x, y: target.y }],
            particleMode: 'burst',
          });
          return { kind: 'single_nuke', targetUid: target.uid, damage: res.amount, vfxAnchor };
        }
        const fallbackAnchor = targetWorld || { x: 68, y: 50 };
        const vfxAnchor = this._spawnNonUnitCardVfx(card, {
          x: fallbackAnchor.x,
          y: fallbackAnchor.y,
          radius: 13,
          targets: [fallbackAnchor],
          particleMode: 'burst',
        });
        return { kind: 'single_nuke', targetUid: null, damage: 0, vfxAnchor };
      }

      if (eff.kind === 'aoe_debuff') {
        const enemies = this._units.getBySide('enemy');
        const center = this._pickEnemyClusterCenter(enemies, targetWorld);
        const radius = eff.radiusByTier?.[tierKey] ?? 22;
        const damage = eff.damageByTier?.[tierKey] ?? 95;
        const slow = eff.slowByTier?.[tierKey] ?? 0.35;
        const shred = eff.defenseShredByTier?.[tierKey] ?? 0.22;
        const durationSec = eff.durationSecByTier?.[tierKey] ?? 5.5;
        let hitCount = 0;
        let debuffTagged = false;
        const hitPositions = [];

        for (const enemy of enemies) {
          if (Math.hypot(enemy.x - center.x, enemy.y - center.y) <= radius) {
            hitPositions.push({ x: enemy.x, y: enemy.y });
            const res = this._combat.applyDamage({
              source: null,
              target: enemy,
              rawAttack: damage,
              attackType: eff.attackType || 'magical',
              critChance: 0.05,
              unitManager: this._units,
              skillSystem: this._skills,
            });
            if (res.applied) hitCount += 1;
            if (enemy.hp > 0 && enemy.state !== UNIT_STATES.DEAD) {
              if (slow > 0) {
                this._units.applyStatusEffect(enemy, {
                  id: `${card.cardId}_slow`,
                  type: 'debuff_slow',
                  value: slow,
                  durationSec,
                });
              }
              if (shred > 0) {
                this._units.applyStatusEffect(enemy, {
                  id: `${card.cardId}_shred`,
                  type: 'debuff_defense',
                  value: shred,
                  durationSec,
                });
              }
              if (!debuffTagged && (slow > 0 || shred > 0)) {
                this._anim?.spawnFloatingText({
                  x: enemy.x,
                  y: enemy.y,
                  text: slow > 0 ? 'SLOW + SUNDER' : 'SUNDER',
                  color: '#a5b4fc',
                  kind: 'status',
                });
                debuffTagged = true;
              }
            }
          }
        }
        const vfxAnchor = this._spawnNonUnitCardVfx(card, {
          x: center.x,
          y: center.y,
          radius,
          targets: hitPositions.length > 0 ? hitPositions : [center],
          particleMode: 'inward',
        });
        return { kind: 'aoe_debuff', center, radius, hitCount, vfxAnchor };
      }

      if (eff.kind === 'chain_damage') {
        const enemies = this._units.getBySide('enemy');
        const maxTargets = eff.targetsByTier?.[tierKey] ?? 3;
        const damage = eff.damageByTier?.[tierKey] ?? 165;
        const atkDebuff = eff.attackDebuffByTier?.[tierKey] ?? 0.15;
        const sorted = [...enemies].sort((a, b) => {
          const scoreA = (a.isBoss ? 500 : a.isElite ? 200 : 0) + a.attack;
          const scoreB = (b.isBoss ? 500 : b.isElite ? 200 : 0) + b.attack;
          return scoreB - scoreA;
        });
        const targets = sorted.slice(0, maxTargets);
        let hitCount = 0;
        const chainPositions = [];
        for (const enemy of targets) {
          chainPositions.push({ x: enemy.x, y: enemy.y });
          const res = this._combat.applyDamage({
            source: null,
            target: enemy,
            rawAttack: damage,
            attackType: eff.attackType || 'magical',
            critChance: 0.12,
            unitManager: this._units,
            skillSystem: this._skills,
          });
          if (res.applied) hitCount += 1;
          if (atkDebuff > 0 && enemy.hp > 0 && enemy.state !== UNIT_STATES.DEAD) {
            this._units.applyStatusEffect(enemy, {
              id: `${card.cardId}_atkdebuff`,
              type: 'debuff_attack',
              value: atkDebuff,
              durationSec: eff.durationSec || 4.5,
            });
          }
        }
        const primaryPos = chainPositions[0] || targetWorld || { x: 66, y: 50 };
        const vfxAnchor = this._spawnNonUnitCardVfx(card, {
          x: primaryPos.x,
          y: primaryPos.y,
          radius: 14,
          targets: chainPositions.length > 0 ? chainPositions : [primaryPos],
          particleMode: 'burst',
          extraBurstTargets: chainPositions.slice(1, 5),
        });
        return { kind: 'chain_damage', hitCount, vfxAnchor };
      }

      if (eff.kind === 'group_heal') {
        const allies = this._units.getBySide('ally');
        const healAmt = eff.healByTier?.[tierKey] ?? 135;
        const shieldAmt = eff.shieldByTier?.[tierKey] ?? 45;
        let healedCount = 0;
        for (const ally of allies) {
          const res = this._combat.applyHeal({
            source: null,
            target: ally,
            rawHeal: healAmt,
            skillSystem: this._skills,
          });
          if (res.applied) healedCount += 1;
          if (shieldAmt > 0) {
            this._units.applyStatusEffect(ally, {
              id: `${card.cardId}_shd`,
              type: 'shield',
              value: shieldAmt,
              durationSec: eff.durationSec || 6,
            });
          }
        }
        const allyCoords = allies.map((a) => ({ x: a.x, y: a.y }));
        const centerX = allyCoords.length > 0
          ? allyCoords.reduce((sum, pt) => sum + pt.x, 0) / allyCoords.length
          : 38;
        const centerY = allyCoords.length > 0
          ? allyCoords.reduce((sum, pt) => sum + pt.y, 0) / allyCoords.length
          : 50;
        const vfxAnchor = this._spawnNonUnitCardVfx(card, {
          x: centerX,
          y: centerY,
          radius: 38,
          targets: allyCoords,
          particleMode: 'rising',
          extraBurstTargets: allyCoords.slice(0, 4),
        });
        return { kind: 'group_heal', healedCount, vfxAnchor };
      }
    }

    // 3. TACTIC CARD — Alters friendly army tactical behavior & applies army buffs
    if (card.category === CARD_CATEGORIES.TACTIC) {
      this._audio?.playSkill();
      const durationSec = eff.durationSecByTier?.[tierKey] ?? 7;
      const allies = this._units.getBySide('ally');
      let markedTargetUid = null;
      let focusTarget = null;
      let suppressedEnemies = null;

      if (eff.tacticMode === 'full_assault') {
        const atkBonus = eff.attackBonusByTier?.[tierKey] ?? 0.25;
        const spdBonus = eff.speedBonusByTier?.[tierKey] ?? 0.22;
        for (const ally of allies) {
          this._units.applyStatusEffect(ally, {
            id: 'tactic_assault_atk',
            type: 'buff_attack',
            value: atkBonus,
            durationSec,
          });
          this._units.applyStatusEffect(ally, {
            id: 'tactic_assault_spd',
            type: 'buff_speed',
            value: spdBonus,
            durationSec,
          });
        }
      } else if (eff.tacticMode === 'focus_fire') {
        const enemies = this._units.getBySide('enemy');
        const primary =
          enemies.find((e) => e.isBoss) ||
          enemies.find((e) => e.isElite) ||
          [...enemies].sort((a, b) => b.attack - a.attack)[0] ||
          null;
        if (primary) {
          focusTarget = { x: primary.x, y: primary.y };
          markedTargetUid = primary.uid;
          const defRed = eff.defenseReductionByTier?.[tierKey] ?? 0.22;
          this._units.applyStatusEffect(primary, {
            id: 'tactic_focus_mark',
            type: 'mark',
            value: 1,
            durationSec,
          });
          this._units.applyStatusEffect(primary, {
            id: 'tactic_focus_shred',
            type: 'debuff_defense',
            value: defRed,
            durationSec,
          });
        }
        const atkBonus = eff.attackBonusByTier?.[tierKey] ?? 0.15;
        for (const ally of allies) {
          this._units.applyStatusEffect(ally, {
            id: 'tactic_focus_atk',
            type: 'buff_attack',
            value: atkBonus,
            durationSec,
          });
        }
      } else if (eff.tacticMode === 'emergency_defense') {
        const defBonus = eff.defenseBonusByTier?.[tierKey] ?? 0.35;
        const shieldAmt = eff.shieldByTier?.[tierKey] ?? 90;
        for (const ally of allies) {
          this._units.applyStatusEffect(ally, {
            id: 'tactic_def_boost',
            type: 'buff_defense',
            value: defBonus,
            durationSec,
          });
          this._units.applyStatusEffect(ally, {
            id: 'tactic_def_shield',
            type: 'shield',
            value: shieldAmt,
            durationSec,
          });
        }
      } else if (eff.tacticMode === 'flank_maneuver') {
        const spdBonus = eff.speedBonusByTier?.[tierKey] ?? 0.32;
        const atkBonus = eff.attackBonusByTier?.[tierKey] ?? 0.16;
        for (const ally of allies) {
          this._units.applyStatusEffect(ally, {
            id: 'tactic_flank_spd',
            type: 'buff_speed',
            value: spdBonus,
            durationSec,
          });
          this._units.applyStatusEffect(ally, {
            id: 'tactic_flank_atk',
            type: 'buff_attack',
            value: atkBonus,
            durationSec,
          });
        }
      } else if (eff.tacticMode === 'siege_formation') {
        const atkBonus = eff.attackBonusByTier?.[tierKey] ?? 0.22;
        const pierceBonus = eff.armorPierceBonusByTier?.[tierKey] ?? 0.25;
        for (const ally of allies) {
          this._units.applyStatusEffect(ally, {
            id: 'tactic_siege_atk',
            type: 'buff_attack',
            value: atkBonus,
            durationSec,
          });
          this._units.applyStatusEffect(ally, {
            id: 'tactic_siege_pierce',
            type: 'buff_armor_pierce',
            value: pierceBonus,
            durationSec,
          });
        }
      } else if (eff.tacticMode === 'suppressive_volley') {
        const atkSpdBonus = eff.attackSpeedBonusByTier?.[tierKey] ?? 0.24;
        const enemySlow = eff.enemySlowByTier?.[tierKey] ?? 0.25;
        for (const ally of allies) {
          this._units.applyStatusEffect(ally, {
            id: 'tactic_suppress_aspd',
            type: 'buff_attack_speed',
            value: atkSpdBonus,
            durationSec,
          });
        }
        const enemies = this._units.getBySide('enemy');
        suppressedEnemies = enemies.map((e) => ({ x: e.x, y: e.y }));
        for (const enemy of enemies) {
          this._units.applyStatusEffect(enemy, {
            id: 'tactic_suppress_slow',
            type: 'debuff_slow',
            value: enemySlow,
            durationSec,
          });
        }
      }

      this._activeTactic = {
        mode: eff.tacticMode,
        name: card.name,
        remaining: durationSec,
        duration: durationSec,
        markedTargetUid,
        color: eff.color || '#f59e0b',
      };

      const allyCoords = allies.map((a) => ({ x: a.x, y: a.y }));
      const isFocus = eff.tacticMode === 'focus_fire';
      const isVolley = eff.tacticMode === 'suppressive_volley';
      const isSurge =
        eff.tacticMode === 'full_assault' ||
        eff.tacticMode === 'flank_maneuver' ||
        eff.tacticMode === 'siege_formation';
      const fxX = isFocus ? (focusTarget?.x ?? 68) : isVolley ? 66 : 34;
      const fxY = isFocus ? (focusTarget?.y ?? 50) : 50;

      const vfxAnchor = this._spawnNonUnitCardVfx(card, {
        x: fxX,
        y: fxY,
        radius: 36,
        targets: isVolley ? suppressedEnemies || [] : allyCoords,
        particleMode: isFocus ? 'burst' : isSurge ? 'surge' : 'rising',
        extraBurstTargets: isFocus && focusTarget ? [focusTarget] : allyCoords.slice(0, 4),
      });

      this._anim?.spawnFloatingText({
        x: isFocus && focusTarget ? focusTarget.x : 34,
        y: isFocus && focusTarget ? focusTarget.y - 4 : 44,
        text: card.name.toUpperCase(),
        color: eff.color || '#fbbf24',
        isCrit: true,
        kind: 'tactic',
      });
      this._state.setBattle({ activeTactic: { ...this._activeTactic } });
      return { kind: 'tactic', tactic: this._activeTactic, vfxAnchor };
    }

    // 4. SUPPORT CARD — Persistent/timed buffs, shields, healing enhancement, cleanse, haste, energy/ultimate recovery
    if (card.category === CARD_CATEGORIES.SUPPORT) {
      this._audio?.playHeal();
      const allies = this._units.getBySide('ally');
      const allyCoords = allies.map((a) => ({ x: a.x, y: a.y }));
      const durationSec = eff.durationSecByTier?.[tierKey] ?? 9;
      const anchor = allies[0] ? { x: allies[0].x, y: allies[0].y } : { x: 32, y: 50 };

      if (eff.kind === 'support_buff') {
        const defBonus = eff.defenseBonusByTier?.[tierKey] ?? 0.28;
        const shieldAmt = eff.shieldByTier?.[tierKey] ?? 120;
        for (const ally of allies) {
          this._units.applyStatusEffect(ally, {
            id: `${card.cardId}_def`,
            type: 'buff_defense',
            value: defBonus,
            durationSec,
          });
          this._units.applyStatusEffect(ally, {
            id: `${card.cardId}_shd`,
            type: 'shield',
            value: shieldAmt,
            durationSec,
          });
        }
        const vfxAnchor = this._spawnNonUnitCardVfx(card, {
          x: anchor.x,
          y: anchor.y,
          radius: 34,
          targets: allyCoords,
          particleMode: 'rising',
          extraBurstTargets: allyCoords.slice(0, 4),
        });
        this._anim?.spawnFloatingText({
          x: anchor.x,
          y: anchor.y,
          text: `WARD +${Math.round(shieldAmt)}`,
          color: '#7dd3fc',
          isCrit: true,
          kind: 'buff',
        });
        return { kind: 'support_buff', affected: allies.length, vfxAnchor };
      }

      if (eff.kind === 'energy_and_buff') {
        const gain = eff.energyGainByTier?.[tierKey] ?? 28;
        const atkBonus = eff.attackBonusByTier?.[tierKey] ?? 0.14;
        const nextEnergy = Math.min(
          this._state.battle.maxEnergy,
          this._state.battle.energy + gain,
        );
        this._state.setBattle({ energy: nextEnergy, dp: nextEnergy });
        for (const ally of allies) {
          this._units.applyStatusEffect(ally, {
            id: `${card.cardId}_atk`,
            type: 'buff_attack',
            value: atkBonus,
            durationSec,
          });
        }
        const vfxAnchor = this._spawnNonUnitCardVfx(card, {
          x: anchor.x,
          y: anchor.y,
          radius: 32,
          targets: allyCoords,
          particleMode: 'rising',
          extraBurstTargets: allyCoords.slice(0, 4),
        });
        this._anim?.spawnFloatingText({
          x: anchor.x,
          y: anchor.y,
          text: `+${gain} ENERGY`,
          color: '#38bdf8',
          isCrit: true,
          kind: 'buff',
        });
        return { kind: 'energy_and_buff', energyGained: gain, affected: allies.length, vfxAnchor };
      }

      if (eff.kind === 'heal_enhancement') {
        const healBonus = eff.healBonusByTier?.[tierKey] ?? 0.35;
        const instantHeal = eff.instantHealByTier?.[tierKey] ?? 70;
        for (const ally of allies) {
          this._units.applyStatusEffect(ally, {
            id: `${card.cardId}_heal`,
            type: 'buff_heal',
            value: healBonus,
            durationSec,
          });
          this._combat.applyHeal({
            source: null,
            target: ally,
            rawHeal: instantHeal,
            skillSystem: this._skills,
          });
        }
        const vfxAnchor = this._spawnNonUnitCardVfx(card, {
          x: anchor.x,
          y: anchor.y,
          radius: 36,
          targets: allyCoords,
          particleMode: 'rising',
          extraBurstTargets: allyCoords.slice(0, 4),
        });
        this._anim?.spawnFloatingText({
          x: anchor.x,
          y: anchor.y,
          text: `MEND +${Math.round(healBonus * 100)}%`,
          color: '#34d399',
          isCrit: true,
          kind: 'heal',
        });
        return { kind: 'heal_enhancement', affected: allies.length, vfxAnchor };
      }

      if (eff.kind === 'ultimate_charge') {
        const ultGain = eff.ultimateGainByTier?.[tierKey] ?? 26;
        const atkBonus = eff.attackBonusByTier?.[tierKey] ?? 0.12;
        this._skills.addUltimateEnergy(ultGain);
        for (const ally of allies) {
          this._units.applyStatusEffect(ally, {
            id: `${card.cardId}_atk`,
            type: 'buff_attack',
            value: atkBonus,
            durationSec,
          });
        }
        const vfxAnchor = this._spawnNonUnitCardVfx(card, {
          x: anchor.x,
          y: anchor.y,
          radius: 34,
          targets: allyCoords,
          particleMode: 'rising',
          extraBurstTargets: allyCoords.slice(0, 4),
        });
        this._anim?.spawnFloatingText({
          x: anchor.x,
          y: anchor.y,
          text: `+${ultGain} ULT`,
          color: '#fde68a',
          isCrit: true,
          kind: 'buff',
        });
        return { kind: 'ultimate_charge', ultimateGained: ultGain, affected: allies.length, vfxAnchor };
      }

      if (eff.kind === 'cleanse_and_ward') {
        const instantHeal = eff.instantHealByTier?.[tierKey] ?? 65;
        const shieldAmt = eff.shieldByTier?.[tierKey] ?? 60;
        let cleansedTotal = 0;
        for (const ally of allies) {
          cleansedTotal += this._units.cleanseDebuffs(ally);
          this._combat.applyHeal({
            source: null,
            target: ally,
            rawHeal: instantHeal,
            skillSystem: this._skills,
          });
          this._units.applyStatusEffect(ally, {
            id: `${card.cardId}_shd`,
            type: 'shield',
            value: shieldAmt,
            durationSec,
          });
        }
        const vfxAnchor = this._spawnNonUnitCardVfx(card, {
          x: 38,
          y: 50,
          radius: 36,
          targets: allyCoords,
          particleMode: 'rising',
          extraBurstTargets: allyCoords.slice(0, 4),
        });
        this._anim?.spawnFloatingText({
          x: anchor.x,
          y: anchor.y,
          text: cleansedTotal > 0 ? `CLEANSED (${cleansedTotal})` : 'PURIFY + WARD',
          color: '#6ee7b7',
          isCrit: true,
          kind: 'heal',
        });
        return { kind: 'cleanse_and_ward', affected: allies.length, cleansedTotal, vfxAnchor };
      }

      if (eff.kind === 'haste_buff') {
        const atkSpdBonus = eff.attackSpeedBonusByTier?.[tierKey] ?? 0.26;
        const spdBonus = eff.speedBonusByTier?.[tierKey] ?? 0.18;
        for (const ally of allies) {
          this._units.applyStatusEffect(ally, {
            id: `${card.cardId}_aspd`,
            type: 'buff_attack_speed',
            value: atkSpdBonus,
            durationSec,
          });
          this._units.applyStatusEffect(ally, {
            id: `${card.cardId}_spd`,
            type: 'buff_speed',
            value: spdBonus,
            durationSec,
          });
        }
        const vfxAnchor = this._spawnNonUnitCardVfx(card, {
          x: anchor.x,
          y: anchor.y,
          radius: 34,
          targets: allyCoords,
          particleMode: 'surge',
          extraBurstTargets: allyCoords.slice(0, 4),
        });
        this._anim?.spawnFloatingText({
          x: anchor.x,
          y: anchor.y,
          text: `HASTE +${Math.round(atkSpdBonus * 100)}%`,
          color: '#7dd3fc',
          isCrit: true,
          kind: 'buff',
        });
        return { kind: 'haste_buff', affected: allies.length, vfxAnchor };
      }
    }

    return { kind: 'none' };
  }

  _pickEnemyClusterCenter(enemies, preferredPoint = null) {
    if (preferredPoint && preferredPoint.x >= 2 && preferredPoint.x <= 98 && preferredPoint.y >= 2 && preferredPoint.y <= 98) {
      return preferredPoint;
    }
    if (!enemies || enemies.length === 0) return { x: 64, y: 50 };
    // Pick enemy with most nearby neighbors (or boss)
    let best = enemies[0];
    let bestNeighbors = -1;
    for (const candidate of enemies) {
      let count = candidate.isBoss ? 2 : 0;
      for (const other of enemies) {
        if (Math.hypot(other.x - candidate.x, other.y - candidate.y) <= 18) count += 1;
      }
      if (count > bestNeighbors) {
        bestNeighbors = count;
        best = candidate;
      }
    }
    return { x: best.x, y: best.y };
  }

  triggerUltimate() {
    if (
      this._phase !== BATTLE_PHASES.ACTIVE_COMBAT &&
      this._phase !== BATTLE_PHASES.WAVE_TRANSITION
    ) {
      return { ok: false, reason: 'Ultimate can only be activated during active combat.' };
    }
    if (this._tutorialActionFilter) {
      const filterRes = this._tutorialActionFilter({ type: 'ultimate' });
      if (filterRes && filterRes.allowed === false) {
        return { ok: false, reason: filterRes.reason || 'Follow the current tutorial step first.' };
      }
    }
    const res = this._skills.activateUltimate({
      unitManager: this._units,
      combatSystem: this._combat,
    });
    if (res.ok) {
      this._combat._stats.ultimatesUsed += 1;
      const ultColor = res.skill?.effect?.color || '#e2b75b';
      const cmdId = res.commander?.id || 'astra';
      const fxKind =
        cmdId === 'kael'
          ? 'tempest'
          : cmdId === 'lyra'
            ? 'sanctuary'
            : cmdId === 'seraphina'
              ? 'volley'
              : cmdId === 'vanguard_zero'
                ? 'bastion'
                : 'starfall';

      this._anim?.triggerScreenShake(9, 0.5);
      this._anim?.triggerScreenFlash(ultColor, 0.42, 0.25);
      this._anim?.spawnWorldEffect({
        kind: fxKind,
        x: 50,
        y: 50,
        radius: 50,
        color: ultColor,
        secondaryColor: cmdId === 'astra' ? '#ffffff' : '#edf2fa',
        duration: 1.25,
      });
      if (this._renderer && this._particles) {
        const { width, height } = this._renderer.getDimensions();
        this._particles.spawnBurst(width * 0.5, height * 0.45, ultColor, 26, { speedScale: 1.35 });
      }
      this._audio?.playUltimate();
      this._syncCountersToState();
    }
    return res;
  }

  /**
   * Executes one deterministic fixed simulation step of `dt` seconds.
   * Exposed publicly so integration tests can advance full battles reliably.
   */
  stepSimulation(dt) {
    if (this._state.battle.status === 'paused') return;
    if (
      this._phase === BATTLE_PHASES.PREPARATION ||
      this._phase === BATTLE_PHASES.VICTORY ||
      this._phase === BATTLE_PHASES.DEFEAT ||
      this._phase === BATTLE_PHASES.RESULTS
    ) {
      this._anim?.update(dt);
      return;
    }

    this._phaseTimer += dt;
    this._anim?.update(dt);
    this._targeting.tick(dt);

    // Phase: BATTLE_START brief tactical intro -> spawns Wave 1
    if (this._phase === BATTLE_PHASES.BATTLE_START) {
      const startDur = this._data?.balance?.combat?.battleStartDurationSec ?? 0.85;
      if (this._phaseTimer >= startDur) {
        this._waves.spawnInitialWave(this._units, this.battlefield);
        this.transitionPhase(BATTLE_PHASES.ACTIVE_COMBAT);
        this._state.setBattle({
          bannerText: '',
          waveIndex: this._waves.getCurrentWave(),
          waveLabel: this._waves.getCurrentWaveConfig()?.label || 'Wave 1',
          isBossWave: Boolean(this._waves.getCurrentWaveConfig()?.boss),
        });
        this._syncCountersToState();
      }
      return;
    }

    // Active Combat & Wave Transition simulation
    const energyCfg =
      (this._isTutorial && this._activeStage?.energyConfig) ||
      this._data?.balance?.commandEnergy || { max: 100, regenPerSecond: 4.2 };
    const regenRate = (energyCfg.regenPerSecond ?? 4.2) * this._skills.getCommandEnergyRegenMultiplier();
    const curEnergy = this._state.battle.energy ?? 0;
    const nextEnergy = Math.min(energyCfg.max ?? 100, curEnergy + regenRate * dt);

    // Tutorial combat pause holds unit movement, attacks, and waves while keeping
    // cooldown recovery, slot refills, and Command Energy regen observable in real time.
    if (this._tutorialCombatPaused) {
      this._cards.updateCooldowns(dt);
      if (!this._tutorialRefillPaused) {
        this._cards.updateRefills(dt);
      }
      this._syncCountersToState({
        energy: nextEnergy,
        dp: nextEnergy,
      });
      return;
    }

    const nextElapsed = (this._state.battle.elapsedSec || 0) + dt;
    this._combat.setElapsedTime(nextElapsed);

    // 2. Card cooldowns & timed slot refills
    this._cards.updateCooldowns(dt);
    this._cards.updateRefills(dt);

    // 3. Active tactic timer
    if (this._activeTactic) {
      this._activeTactic.remaining -= dt;
      if (this._activeTactic.remaining <= 0) {
        this._activeTactic = null;
      }
    }

    // 4. Unit status effect timers, Burn DoT & Elite Regenerative Core
    this._units.updateTimers(
      dt,
      (victim, burnEffect) => {
        this._combat.applyDamage({
          source: null,
          target: victim,
          rawAttack: burnEffect.value,
          attackType: 'magical',
          unitManager: this._units,
          skillSystem: this._skills,
          bypassMitigation: true,
        });
      },
      (regenUnit, amount) => {
        this._combat.applyHeal({
          source: regenUnit,
          target: regenUnit,
          rawHeal: amount,
          skillSystem: null,
        });
      },
    );

    // 5. Wave spawning & wave transitions
    const waveUpdate = this._waves.update(dt, this._units, this.battlefield);
    if (waveUpdate.phaseHint === 'wave_transition' && this._phase === BATTLE_PHASES.ACTIVE_COMBAT) {
      this.transitionPhase(BATTLE_PHASES.WAVE_TRANSITION);
      const nextWaveCfg = this._waves.getNextWaveConfig();
      const nextNum = this._waves.getCurrentWave() + 1;
      const isBossNext = Boolean(nextWaveCfg?.boss || nextWaveCfg?.isBossWave);
      this._state.setBattle({
        bannerText: isBossNext
          ? `WARNING · Wave ${nextNum} Boss Incoming!`
          : `Wave ${nextNum} Incoming · ${nextWaveCfg?.label || 'Reinforcements'}`,
      });
      this._audio?.playWave();
    } else if (
      waveUpdate.phaseHint === 'active_combat' &&
      this._phase === BATTLE_PHASES.WAVE_TRANSITION
    ) {
      this.transitionPhase(BATTLE_PHASES.ACTIVE_COMBAT);
      const curCfg = this._waves.getCurrentWaveConfig();
      this._state.setBattle({
        bannerText: curCfg?.boss ? `BOSS ENGAGED · ${curCfg.label}` : '',
        waveIndex: this._waves.getCurrentWave(),
        waveLabel: curCfg?.label || `Wave ${this._waves.getCurrentWave()}`,
        isBossWave: Boolean(curCfg?.boss || curCfg?.isBossWave),
      });
    }

    // 6. Movement, Pathfinding, Collision Separation & Targeting
    this._movement.update(dt, this._units, this._targeting, this._activeTactic);

    // 7. Combat resolution (melee, ranged launches, healing, boss abilities)
    this._combat.update(dt, {
      unitManager: this._units,
      projectileSystem: this._projectiles,
      skillSystem: this._skills,
    });

    // 8. Projectiles flight & impact
    this._projectiles.update(dt, {
      unitManager: this._units,
      combatSystem: this._combat,
      skillSystem: this._skills,
    });

    // 9. Sync live HUD telemetry
    this._syncCountersToState({
      elapsedSec: nextElapsed,
      energy: nextEnergy,
      dp: nextEnergy,
      activeTactic: this._activeTactic ? { ...this._activeTactic } : null,
    });

    // 10. Mutually exclusive Victory & Defeat evaluation
    this._evaluateBattleOutcome();
  }

  _syncCountersToState(extraPatch = {}) {
    const boss = this._units.getActiveBoss();
    const bossInfo = boss
      ? {
          name: boss.name,
          displayNameZh: boss.displayNameZh,
          hp: Math.max(0, Math.round(boss.hp)),
          maxHp: boss.maxHp,
          shield: Math.round(boss.shield || 0),
          castingName: boss.castingAbility?.ability?.name || null,
        }
      : null;

    this._state.setBattle({
      friendlyCount: this._units.getActiveCount('ally'),
      enemyCount: this._units.getActiveCount('enemy'),
      waveIndex: this._waves.getCurrentWave(),
      bossInfo,
      ...extraPatch,
    });
  }

  _evaluateBattleOutcome() {
    if (
      this._phase !== BATTLE_PHASES.ACTIVE_COMBAT &&
      this._phase !== BATTLE_PHASES.WAVE_TRANSITION
    ) {
      return;
    }

    const activeAllies = this._units.getActiveCount('ally');
    const activeEnemies = this._units.getActiveCount('enemy');

    // VICTORY: All waves spawned, no pending spawns, all enemies & boss defeated
    const allSpawned = this._waves.allWavesSpawned();
    const bossCleared = !this._waves.stageHasBoss() || (this._waves.isBossSpawned() && !this._units.getActiveBoss());
    if (allSpawned && activeEnemies === 0 && bossCleared) {
      this._finalizeBattle(true);
      return;
    }

    // DEFEAT: All friendly units defeated AND no valid reinforcement unit card remains in hand or deck
    // Deck exhaustion alone NEVER causes defeat while friendly units are still fighting!
    if (activeAllies === 0 && !this._cards.hasRemainingUnitCards()) {
      this._finalizeBattle(false);
    }
  }

  _finalizeBattle(victory) {
    if (this._rewardsApplied) return;
    this._rewardsApplied = true;

    // Immediately stop all battle screen-shake/flash effects, active projectiles, pending refills, and transient pointer state
    this._cards?.clearBattleTimers?.();
    this._projectiles?.clear?.();
    this._anim?.clearScreenEffects?.();
    this._pointerWorld = null;
    this._hoverDais = false;
    this._accumulator = 0;

    this.transitionPhase(victory ? BATTLE_PHASES.VICTORY : BATTLE_PHASES.DEFEAT);

    const stats = this._combat.getStats();
    const durationSec = Math.max(1, Math.round(this._state.battle.elapsedSec || 0));
    const survivors = this._units.getActiveCount('ally');
    const deployedTotal = Math.max(1, this._totalAlliesDeployed);
    const survivorRatio = survivors / deployedTotal;

    const rating = this._progression.computeStageRating({
      victory,
      survivorRatio,
      durationSec,
    });

    const outcomeRes = this._isTutorial
      ? {
          applied: false,
          isFirstClear: false,
          rewards: {
            credits: 0,
            astrite: 0,
            playerXp: 0,
            heroXp: 0,
            unitXp: 0,
            materials: [],
            bonusCards: [],
            bonusUnits: [],
          },
        }
      : this._progression.recordBattleOutcome({
          sessionId: this._sessionId,
          stageId: this._activeStage?.id || 'stage_1_1',
          victory,
          rating,
          enemiesDefeated: stats.enemiesDefeated,
          economySystem: this._economy,
          heroSystem: this._heroes,
        });

    const resultsPayload = {
      sessionId: this._sessionId,
      stageId: this._activeStage?.id || 'stage_1_1',
      stageCode: this._activeStage?.code || '1-1',
      stageName: this._activeStage?.name || 'Stage',
      isTutorial: this._isTutorial,
      victory,
      rating,
      durationSec,
      enemiesDefeated: stats.enemiesDefeated,
      friendlySurvivors: survivors,
      totalAlliesDeployed: deployedTotal,
      damageDealt: stats.damageDealt,
      damageReceived: stats.damageReceived,
      healingPerformed: stats.healingPerformed,
      criticalHits: stats.criticalHits,
      ultimatesUsed: stats.ultimatesUsed,
      rewards: outcomeRes.rewards || {
        credits: 0,
        astrite: 0,
        playerXp: 0,
        heroXp: 0,
        unitXp: 0,
        materials: [],
        bonusCards: [],
        bonusUnits: [],
      },
      isFirstClear: Boolean(outcomeRes.isFirstClear),
      nextStageId: this._isTutorial
        ? null
        : victory
          ? this._progression.getNextStageId(this._activeStage?.id)
          : null,
    };

    this._audio?.setBgmMode?.('menu');
    if (victory) this._audio?.playVictory();
    else this._audio?.playDefeat();

    this.transitionPhase(BATTLE_PHASES.RESULTS);
    this._state.setBattle({
      bannerText: '',
      results: resultsPayload,
    });
    this._eventBus?.emit('battle:completed', resultsPayload);
  }

  _loop(timestamp, token = this._loopSessionToken) {
    if (!this._loopActive || token !== this._loopSessionToken) {
      this._rafId = null;
      return;
    }
    this._rafId = requestAnimationFrame((ts) => this._loop(ts, token));
    const rawDt = Math.min(0.05, Math.max(0, (timestamp - this._lastTimestamp) / 1000));
    this._lastTimestamp = timestamp;

    const dims = this._renderer?.getDimensions() || { width: 1200, height: 500 };

    if (this._state.battle.status === 'running') {
      const scaledDt = rawDt * (this._state.battle.speedMultiplier || 1);
      this._accumulator = Math.min(0.25, this._accumulator + scaledDt);
      while (this._accumulator >= FIXED_DT) {
        this.stepSimulation(FIXED_DT);
        this._accumulator -= FIXED_DT;
      }
      this._particles?.update(rawDt, dims.width, dims.height);
    } else if (
      this._phase === BATTLE_PHASES.PREPARATION ||
      this._phase === BATTLE_PHASES.VICTORY ||
      this._phase === BATTLE_PHASES.DEFEAT ||
      this._phase === BATTLE_PHASES.RESULTS
    ) {
      if (this._phase !== BATTLE_PHASES.PREPARATION) {
        this._anim?.clearScreenShake?.();
      }
      this._anim?.update(rawDt);
      this._particles?.update(rawDt, dims.width, dims.height);
    }

    this._renderer?.render({
      stage: this._activeStage,
      battlefield: this.battlefield,
      phase: this._phase,
      units: this._units.getAll(),
      projectiles: this._projectiles.getAll(),
      telegraphs: this._combat.getTelegraphs(),
      selectedPrepUnitUid: this._selectedPrepUnitUid,
      activeTactic: this._activeTactic,
      commander: this._heroes?.getActiveCommander?.() || null,
      ultimateEnergy: this._state?.battle?.ultimateEnergy ?? 0,
      pointerWorld: this._pointerWorld,
      hoverDais: this._hoverDais,
      selectedCard: this.getSelectedCardSnapshot(),
    });
  }
}
