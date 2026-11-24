/**
 * NonUnitCardPlayVfx — Dedicated Card Play Animation & Sleek Single-Arc Light
 * Trail controller exclusively for non-Unit cards (Skill, Tactic, Support).
 *
 * Strictly ignores Unit cards (`category === 'unit'`).
 *
 * Architecture:
 * - Floating ghost card layer (`#card-play-ghost-layer`) retains the smooth CSS
 *   perspective lift, scale/tilt transition, dual light sweeps, luminous rim,
 *   and dissolve while the dock slot refills.
 * - Transparent theater Canvas 2D overlay (`#card-play-vfx-canvas`) draws:
 *     1) A restrained symmetrical 4-arc focus ring & crisp corner glints around
 *        the lifting card apex
 *     2) A subtle, sleek single-arc analytical cubic-Bezier light trail gliding
 *        from the card's lift apex to the battlefield resolution anchor (or
 *        Command Energy Core / Commander Ult) with a crisp leading star glint
 *        and clean arrival pulse
 *
 * Guarantees bounded concurrency, clean RAF teardown, reduced-motion compliance,
 * and safe execution in headless Node test environments.
 */

import { getNonUnitCardVfxProfile, isNonUnitCard } from './NonUnitCardVfxConfig.js';
import {
  clamp01,
  easeOutCubic,
  smoothWindow,
  withAlpha,
  sampleCubicBezier,
  drawAnalyticalRibbon,
  drawSoftBloom,
  drawEllipticalHalo,
  drawSymmetricalSigilRing,
  drawStarFlare,
  drawDiamondPrism,
  drawTaperedNeedle,
} from './NonUnitVfxGeometry.js';

const MAX_ACTIVE_PLAYS = 8;
const TWO_PI = Math.PI * 2;

const CATEGORY_LABELS = {
  skill: 'Skill',
  tactic: 'Tactic',
  support: 'Support',
};

function isReducedMotionPreferred() {
  return Boolean(
    typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
}

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export class NonUnitCardPlayVfx {
  constructor(canvas, ghostLayer, { assetManager = null } = {}) {
    this._canvas = canvas || null;
    this._ctx =
      this._canvas && typeof this._canvas.getContext === 'function'
        ? this._canvas.getContext('2d')
        : null;
    this._ghostLayer = ghostLayer || null;
    this._assetManager = assetManager || null;
    this._activePlays = [];
    this._ghostTimers = new Set();
    this._rafId = null;
    this._width = 1200;
    this._height = 700;
    this._dpr = 1;
    this._playSeq = 0;

    this.resize();
  }

  resize() {
    if (!this._canvas) return;
    const rect =
      typeof this._canvas.getBoundingClientRect === 'function'
        ? this._canvas.getBoundingClientRect()
        : null;
    const w = Math.max(320, Math.round(rect?.width || 1200));
    const h = Math.max(260, Math.round(rect?.height || 700));
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    this._width = w;
    this._height = h;
    this._dpr = dpr;
    this._canvas.width = Math.round(w * dpr);
    this._canvas.height = Math.round(h * dpr);
  }

  getActiveCount() {
    return this._activePlays.length;
  }

  /**
   * Triggers the card-play lift + subtle single-arc light trail for a non-Unit card.
   * Returns false immediately for Unit cards or invalid inputs.
   */
  playNonUnitCard({
    card,
    slotIndex = 0,
    slotRect = null,
    theaterRect = null,
    targetScreenPos = null,
    energyCoreRect = null,
    commanderCardRect = null,
    reducedMotion = null,
  } = {}) {
    if (!isNonUnitCard(card)) return false;
    const profile = getNonUnitCardVfxProfile(card);
    if (!profile) return false;

    const reduced = reducedMotion !== null ? Boolean(reducedMotion) : isReducedMotionPreferred();
    this.resize();

    const tRect =
      theaterRect ||
      (this._canvas && typeof this._canvas.getBoundingClientRect === 'function'
        ? this._canvas.getBoundingClientRect()
        : { left: 0, top: 0, width: this._width, height: this._height });

    const baseLeft = Number.isFinite(tRect?.left) ? tRect.left : 0;
    const baseTop = Number.isFinite(tRect?.top) ? tRect.top : 0;
    const viewW = Math.max(320, tRect?.width || this._width);
    const viewH = Math.max(260, tRect?.height || this._height);

    // Compute card origin inside theater coordinates
    let cardX = viewW * (0.28 + (slotIndex / 5) * 0.44);
    let cardY = viewH - 94;
    let cardW = 104;
    let cardH = 136;

    if (slotRect && slotRect.width > 0 && slotRect.height > 0) {
      cardW = slotRect.width;
      cardH = slotRect.height;
      cardX = slotRect.left - baseLeft + cardW * 0.5;
      cardY = slotRect.top - baseTop + cardH * 0.5;
    }

    // Compute primary destination coordinates inside theater
    const motion = profile.playMotion;
    let destX = targetScreenPos?.x ?? viewW * 0.55;
    let destY = targetScreenPos?.y ?? viewH * 0.44;
    let secondaryDest = null;

    if (motion.destinationType === 'energy_core' && energyCoreRect && energyCoreRect.width > 0) {
      destX = energyCoreRect.left - baseLeft + energyCoreRect.width * 0.5;
      destY = energyCoreRect.top - baseTop + energyCoreRect.height * 0.45;
      if (targetScreenPos) {
        secondaryDest = { x: targetScreenPos.x, y: targetScreenPos.y };
      }
    } else if (
      motion.destinationType === 'commander_ult' &&
      commanderCardRect &&
      commanderCardRect.width > 0
    ) {
      destX = commanderCardRect.left - baseLeft + commanderCardRect.width * 0.5;
      destY = commanderCardRect.top - baseTop + commanderCardRect.height * 0.48;
      if (targetScreenPos) {
        secondaryDest = { x: targetScreenPos.x, y: targetScreenPos.y };
      }
    }

    const tier = Math.max(1, Math.min(3, Number(card.tier) || 1));
    const liftY = reduced ? -18 : motion.liftY * (1 + (tier - 1) * 0.08);
    const releaseX = cardX;
    const releaseY = cardY + liftY - cardH * 0.14;

    // 1. Spawn retained CSS floating DOM ghost card (smooth perspective lift + dual light sweeps)
    const ghostEl = this._spawnGhostCard({
      card,
      profile,
      tier,
      left: cardX - cardW * 0.5,
      top: cardY - cardH * 0.5,
      width: cardW,
      height: cardH,
      liftY,
      reduced,
    });

    // 2. Enqueue sleek Canvas single-arc trail sequence
    if (this._activePlays.length >= MAX_ACTIVE_PLAYS) {
      const oldest = this._activePlays.shift();
      if (oldest?.ghostEl?.remove) oldest.ghostEl.remove();
    }

    this._playSeq += 1;
    const seed = this._playSeq * 97 + slotIndex * 13;
    const durationMs = reduced ? 280 : tier >= 3 ? 840 : tier === 2 ? 780 : 720;
    const sparks = reduced ? [] : this._createReleaseSparks(releaseX, releaseY, profile, tier);

    this._activePlays.push({
      id: this._playSeq,
      cardId: card.cardId,
      category: card.category,
      tier,
      profile,
      seed,
      startMs: nowMs(),
      durationMs,
      reduced,
      cardX,
      cardY,
      cardW,
      cardH,
      liftY,
      releaseX,
      releaseY,
      destX,
      destY,
      secondaryDest,
      sparks,
      ghostEl,
    });

    this._ensureLoop();
    return true;
  }

  _spawnGhostCard({ card, profile, tier, left, top, width, height, liftY, reduced }) {
    if (!this._ghostLayer || typeof document === 'undefined') return null;

    if (this._ghostLayer.children && this._ghostLayer.children.length >= MAX_ACTIVE_PLAYS) {
      this._ghostLayer.children[0]?.remove?.();
    }

    const pal = profile.palette;
    const motion = profile.playMotion;
    const ghost = document.createElement('div');
    ghost.className = [
      'card-play-ghost',
      `card-play-ghost--${card.category}`,
      `card-play-ghost--tier-${tier}`,
      `card-play-ghost--${card.cardId}`,
      reduced ? 'is-reduced-motion' : '',
    ]
      .filter(Boolean)
      .join(' ');
    ghost.setAttribute('aria-hidden', 'true');

    ghost.style.left = `${Math.round(left)}px`;
    ghost.style.top = `${Math.round(top)}px`;
    ghost.style.width = `${Math.round(width)}px`;
    ghost.style.height = `${Math.round(height)}px`;

    if (typeof ghost.style.setProperty === 'function') {
      ghost.style.setProperty('--vfx-primary', pal.primary);
      ghost.style.setProperty('--vfx-secondary', pal.secondary);
      ghost.style.setProperty('--vfx-accent', pal.accent);
      ghost.style.setProperty('--vfx-core', pal.core);
      ghost.style.setProperty('--vfx-lift-y', `${Math.round(liftY)}px`);
      ghost.style.setProperty('--vfx-scale-peak', String(reduced ? 1.03 : motion.scalePeak));
      ghost.style.setProperty('--vfx-tilt-x', `${reduced ? 0 : motion.tiltX}deg`);
      ghost.style.setProperty('--vfx-tilt-z', `${reduced ? 0 : motion.tiltZ}deg`);
      ghost.style.setProperty('--vfx-sweep-angle', `${motion.sweepAngle}deg`);
    }

    const catLabel = CATEGORY_LABELS[card.category] || 'Tactic';
    const levelLabel = card.levelLabel || (tier >= 3 ? 'Lv.III' : tier === 2 ? 'Lv.II' : 'Lv.I');
    const resolvedArtId = card.artAssetId || card.iconAssetId;
    const isTransparentFg = Boolean(resolvedArtId && this._assetManager?.getConfig?.(resolvedArtId)?.format === 'png');
    const hasLayeredFg = Boolean(card.backgroundAssetId || isTransparentFg);

    ghost.innerHTML = `
      <span class="card-play-ghost__aura"></span>
      <div class="card-play-ghost__face">
        <div class="card-play-ghost__top">
          <span class="card-play-ghost__cost tabular-nums">${card.cost ?? ''}</span>
          <span class="card-play-ghost__tier tabular-nums">${levelLabel}</span>
        </div>
        <div class="card-play-ghost__art${hasLayeredFg ? ' is-layered-art' : ''}">
          ${card.backgroundAssetId ? '<img class="card-play-ghost__bg" alt="" aria-hidden="true" />' : ''}
          <img class="card-play-ghost__img${hasLayeredFg ? ' is-layered-fg' : ''}" alt="" />
          <span class="card-play-ghost__category">${catLabel}</span>
        </div>
        <div class="card-play-ghost__name">${card.name || ''}</div>
        <span class="card-play-ghost__sweep card-play-ghost__sweep--a"></span>
        <span class="card-play-ghost__sweep card-play-ghost__sweep--b"></span>
        <span class="card-play-ghost__rim"></span>
      </div>
    `;

    const bgImg = ghost.querySelector?.('.card-play-ghost__bg');
    if (bgImg && card.backgroundAssetId && this._assetManager?.bindImageElement) {
      this._assetManager.bindImageElement(bgImg, card.backgroundAssetId);
    }
    const img = ghost.querySelector?.('.card-play-ghost__img');
    if (img && resolvedArtId && this._assetManager?.bindImageElement) {
      this._assetManager.bindImageElement(img, resolvedArtId);
    }

    this._ghostLayer.appendChild(ghost);

    const removeAfterMs = reduced ? 270 : 700;
    const timer = setTimeout(() => {
      this._ghostTimers.delete(timer);
      ghost.remove?.();
    }, removeAfterMs);
    this._ghostTimers.add(timer);
    return ghost;
  }

  /**
   * Deterministic, restrained set of 6–8 crisp luminous release motes (never a noisy blast).
   */
  _createReleaseSparks(rx, ry, profile, tier) {
    const count = 6 + (tier - 1) * 2;
    const pal = profile.palette;
    const sparks = [];
    for (let i = 0; i < count; i += 1) {
      const ang = -Math.PI * 0.85 + (i / Math.max(1, count - 1)) * Math.PI * 0.7;
      const speed = 58 + (i % 3) * 26;
      sparks.push({
        x: rx,
        y: ry,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed - 18,
        size: 2.2 + (i % 2) * 1.1,
        shape: i % 2 === 0 ? 'star' : 'diamond',
        color: i % 2 === 0 ? pal.primary : pal.secondary,
        core: pal.core,
        delay: 0.16 + (i % 3) * 0.025,
        life: 0.36 + (i % 2) * 0.08,
      });
    }
    return sparks;
  }

  _ensureLoop() {
    if (this._rafId !== null) return;
    if (typeof requestAnimationFrame !== 'function') {
      this._renderFrame(nowMs());
      return;
    }
    const tick = (ts) => {
      this._rafId = null;
      this._renderFrame(ts || nowMs());
      if (this._activePlays.length > 0) {
        this._rafId = requestAnimationFrame(tick);
      }
    };
    this._rafId = requestAnimationFrame(tick);
  }

  _renderFrame(now) {
    const ctx = this._ctx;
    if (ctx) {
      ctx.save();
      ctx.setTransform?.(this._dpr, 0, 0, this._dpr, 0, 0);
      ctx.clearRect?.(0, 0, this._width, this._height);
    }

    for (let i = this._activePlays.length - 1; i >= 0; i -= 1) {
      const play = this._activePlays[i];
      const elapsed = now - play.startMs;
      const t = clamp01(elapsed / Math.max(1, play.durationMs));
      if (t >= 1) {
        this._activePlays.splice(i, 1);
        continue;
      }
      if (ctx) {
        this._drawPlay(ctx, play, t);
      }
    }

    if (ctx) {
      ctx.restore();
    }
  }

  _drawPlay(ctx, play, t) {
    const { profile, tier, reduced, cardX, cardY, cardW, cardH, liftY, releaseX, releaseY, destX, destY } = play;
    const pal = profile.palette;
    const tierBoost = tier === 3 ? 1.18 : tier === 2 ? 1.09 : 1.0;

    if (reduced) {
      const a = smoothWindow(t, 0.12, 0.35, 1);
      drawSoftBloom(ctx, releaseX, releaseY, 34 * tierBoost, pal.core, pal.primary, a * 0.42);
      drawStarFlare(ctx, destX, destY, 16 * tierBoost, 0.16, pal.primary, pal.core, a * 0.85, 0, 4);
      return;
    }

    const liftProg = easeOutCubic(Math.min(1, t / 0.34));
    const curX = cardX;
    const curY = cardY + liftY * liftProg;

    // Stage 1 (0.00 - 0.34): Restrained symmetrical 4-arc focus halo & crisp card corner glints
    const gatherAlpha = smoothWindow(t, 0.08, 0.22, 0.36);
    if (gatherAlpha > 0.01) {
      const focusR = (Math.max(cardW, cardH) * 0.46) * (1.12 - liftProg * 0.18);
      drawSymmetricalSigilRing(ctx, curX, curY, focusR, focusR * 0.62, {
        count: 4,
        arcFill: 0.44,
        rotation: t * 1.4,
        lineWidth: 1.4,
        color: pal.primary,
        coreColor: pal.core,
        alpha: gatherAlpha * 0.62,
      });

      const glintR = 9.5 * tierBoost;
      drawStarFlare(ctx, curX + cardW * 0.44, curY - cardH * 0.44, glintR, 0.18, pal.accent, pal.core, gatherAlpha * 0.88, t * 1.6, 4);
      drawStarFlare(ctx, curX - cardW * 0.44, curY + cardH * 0.38, glintR * 0.72, 0.18, pal.primary, pal.core, gatherAlpha * 0.68, -t * 1.4, 4);
    }

    // Stage 2 (0.16 - 0.50): Crisp apex release glint + restrained micro-motes
    const flareAlpha = smoothWindow(t, 0.16, 0.26, 0.46);
    if (flareAlpha > 0.01) {
      const r = (13 + easeOutCubic((t - 0.16) / 0.3) * 11) * tierBoost;
      drawSoftBloom(ctx, releaseX, releaseY, r * 1.25, pal.core, pal.primary, flareAlpha * 0.32);
      drawStarFlare(ctx, releaseX, releaseY, r, 0.15, pal.primary, pal.core, flareAlpha * 0.85, t * 0.9, 4);
    }

    for (let i = 0; i < play.sparks.length; i += 1) {
      const sp = play.sparks[i];
      const u = (t - sp.delay) / sp.life;
      if (u <= 0 || u >= 1) continue;
      const a = smoothWindow(u, 0.12, 0.35, 1) * 0.78;
      const px = sp.x + sp.vx * u * 0.62;
      const py = sp.y + sp.vy * u * 0.62 + 16 * u * u;
      if (sp.shape === 'star') {
        drawStarFlare(ctx, px, py, sp.size * 2.2, 0.2, sp.color, sp.core, a, u * 1.6, 4);
      } else {
        drawDiamondPrism(ctx, px, py, sp.size * 0.85, sp.size * 1.35, 0, {
          color: sp.color,
          secondaryColor: pal.accent,
          coreColor: sp.core,
          alpha: a,
        });
      }
    }

    // Stage 3 (0.18 - 0.98): Subtle, sleek single-arc analytical light trail
    const bridgeT = clamp01((t - 0.18) / 0.78);
    if (bridgeT > 0) {
      this._drawSingleArcTrail(ctx, play, bridgeT, releaseX, releaseY, destX, destY, tierBoost, 1.0);
      // Secondary subtle whisper filament only for HUD-linked support cards (Overclock / Catalyst)
      if (play.secondaryDest) {
        this._drawSingleArcTrail(
          ctx,
          play,
          bridgeT,
          releaseX,
          releaseY,
          play.secondaryDest.x,
          play.secondaryDest.y,
          tierBoost * 0.72,
          0.55,
        );
      }
    }
  }

  /**
   * Renders ONE smooth, restrained 40-segment analytical cubic Bezier light trail
   * with a crisp leading star glint and subtle arrival halo pulse.
   */
  _drawSingleArcTrail(ctx, play, bridgeT, x0, y0, x1, y1, tierBoost, intensityMul) {
    const pal = play.profile.palette;
    const arcType = play.profile.playMotion.ribbonArc;
    const alpha = smoothWindow(bridgeT, 0.08, 0.3, 1) * intensityMul;
    if (alpha <= 0.015) return;

    const headU = easeOutCubic(Math.min(1, bridgeT * 1.42));
    const tailU = Math.max(0, headU - 0.48);

    // Subtle graceful arc elevation tuned per card archetype (always a single smooth curve)
    const dx = x1 - x0;
    const liftArch =
      arcType === 'orbital_ascend'
        ? 112
        : arcType === 'high_meteor' || arcType === 'barrage_arc'
          ? 88
          : arcType === 'laser_sight' || arcType === 'wedge_thrust'
            ? 34
            : 64;

    const p0 = { x: x0, y: y0 };
    const p1 = { x: x0 + dx * 0.28, y: Math.min(y0, y1) - liftArch };
    const p2 = { x: x0 + dx * 0.72, y: Math.min(y0, y1) - liftArch * 0.62 };
    const p3 = { x: x1, y: y1 };
    const sampleFn = (u) => sampleCubicBezier(p0, p1, p2, p3, u);

    if (headU > tailU + 0.015) {
      drawAnalyticalRibbon(ctx, sampleFn, {
        uStart: tailU,
        uEnd: headU,
        steps: 40,
        maxWidth: 4.4 * tierBoost,
        color: pal.primary,
        coreColor: pal.core,
        alpha: alpha * 0.84,
        taperProfile: 'comet',
        coreRatio: 0.46,
        glowWidthMultiplier: 1.75,
        glowAlpha: 0.2,
      });

      // Crisp leading star glint riding the exact analytical tip
      const head = sampleFn(headU);
      const ang = Math.atan2(head.ty, head.tx);
      drawTaperedNeedle(
        ctx,
        head.x - Math.cos(ang) * 14 * tierBoost,
        head.y - Math.sin(ang) * 14 * tierBoost,
        head.x + Math.cos(ang) * 5 * tierBoost,
        head.y + Math.sin(ang) * 5 * tierBoost,
        {
          width: 2.6 * tierBoost,
          color: pal.secondary,
          coreColor: pal.core,
          alpha: alpha * 0.9,
          peakRatio: 0.72,
        },
      );
      drawStarFlare(ctx, head.x, head.y, 10.5 * tierBoost, 0.16, pal.primary, pal.core, alpha * 0.94, bridgeT * 2.2, 4);
    }

    // Restrained arrival halo ring upon reaching destination
    if (bridgeT > 0.36) {
      const arrT = clamp01((bridgeT - 0.36) / 0.64);
      const arrA = smoothWindow(arrT, 0.1, 0.32, 1) * intensityMul;
      const arrR = (14 + easeOutCubic(arrT) * 20) * tierBoost;
      drawEllipticalHalo(ctx, x1, y1, arrR, arrR * 0.5, {
        lineWidth: 1.4,
        color: pal.primary,
        coreColor: pal.core,
        alpha: arrA * 0.72,
      });
      drawStarFlare(ctx, x1, y1, 13 * tierBoost * (1 - arrT * 0.45), 0.16, pal.secondary, pal.core, arrA * 0.86, 0, 4);
    }
  }

  /**
   * Immediately halts all animations, clears canvas, removes any active ghost
   * elements, and cancels all pending timers and animation frames.
   */
  stop() {
    if (this._rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    for (const timer of this._ghostTimers) {
      clearTimeout(timer);
    }
    this._ghostTimers.clear();

    for (const play of this._activePlays) {
      play.ghostEl?.remove?.();
    }
    this._activePlays = [];

    if (this._ghostLayer) {
      this._ghostLayer.innerHTML = '';
    }
    if (this._ctx) {
      this._ctx.save();
      this._ctx.setTransform?.(this._dpr, 0, 0, this._dpr, 0, 0);
      this._ctx.clearRect?.(0, 0, this._width, this._height);
      this._ctx.restore();
    }
  }
}
