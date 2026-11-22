/**
 * NonUnitCardVfxRenderer — Precision anime-sigil & tapered-vector-arc battlefield
 * renderer for all 18 non-Unit cards in Star Struck (6 Skill, 6 Tactic, 6 Support).
 *
 * Strictly scoped to non-Unit card effects (`fx_*`). Unit cards are untouched.
 *
 * Quality standards enforced across all 18 renderers:
 * - Clear visual hierarchy: ONE dominant focal silhouette per card; supporting
 *   sigils, glows, and secondary accents remain restrained.
 * - Distinct identity: every card has its own primary silhouette, composition,
 *   and animation choreography (never color/rotation clones).
 * - Viewport-responsive scale: dimensions adapt cleanly to Battlefield projection
 *   scale across standard, compact, and ultrawide viewports.
 * - Exact geometry: unified symmetrical arrows/chevrons, analytical high-segment
 *   tapered curves, balanced N-fold sigils, zero flat `fillRect` beam slabs, and
 *   zero random per-frame arc jitter.
 */

import {
  NON_UNIT_CARD_VFX_PROFILES,
  NON_UNIT_WORLD_FX_KINDS,
} from './NonUnitCardVfxConfig.js';
import {
  clamp01,
  easeOutCubic,
  easeOutQuart,
  easeInOutQuad,
  easeOutBackClamped,
  smoothWindow,
  withAlpha,
  sampleQuadBezier,
  sampleCubicBezier,
  sampleLogSpiral,
  sampleHelixArc,
  drawAnalyticalRibbon,
  drawSoftBloom,
  drawEllipticalHalo,
  drawSymmetricalSigilRing,
  drawPrecisionArrow,
  drawPrecisionChevron,
  drawTaperedNeedle,
  drawTaperedBeamSpire,
  drawBastionShield,
  drawPrecisionReticle,
  drawDiamondPrism,
  drawStarFlare,
  drawLotusCrest,
  drawSteppedLightningBolt,
} from './NonUnitVfxGeometry.js';

const PROFILE_BY_WORLD_KIND = new Map(
  Object.values(NON_UNIT_CARD_VFX_PROFILES).map((p) => [p.worldFxKind, p]),
);

function getTierScale(fx) {
  const tier = Math.max(1, Math.min(3, Number(fx?.tier) || 1));
  return {
    tier,
    richness: tier === 3 ? 1.24 : tier === 2 ? 1.12 : 1.0,
    extra: tier - 1,
  };
}

function getViewportScale(p) {
  return Math.max(0.68, Math.min(1.22, (p?.scale || 7.1) / 7.1));
}

function resolvePoints(fx, bf, w, h, fallbackWorldPoints = []) {
  const raw =
    Array.isArray(fx.points) && fx.points.length > 0 ? fx.points : fallbackWorldPoints;
  return raw.slice(0, 7).map((pt) => bf.worldToScreen(pt.x, pt.y, w, h));
}

function getWorldRadii(fx, p, fallbackWorldR = 16) {
  const r = fx.radius || fallbackWorldR;
  const rx = r * (p.scaleX || p.scale * 1.15 || 8.5);
  const ry = r * (p.scaleY || p.scale * 0.56 || 4.1);
  return { rx, ry };
}

// ============================================================================
// A. SKILL CARDS (6) — Distinct Silhouettes & Choreographies
// ============================================================================

/**
 * 1. Astral Nova — Celestial Starburst Detonation
 * Dominant Hero: Expanding 8-point faceted celestial nova star-crest with razor
 *                straight radial needle flares.
 * Supporting:    Balanced 8-fold astrolabe ground sigil + crisp single shock halo.
 */
function renderAstralNova(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const { rx, ry } = getWorldRadii(fx, p, 20);
  const grow = 0.24 + easeOutQuart(t) * 0.88;

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.06, 0.34, 1);
    drawSoftBloom(ctx, p.x, p.y, rx * 0.92 * grow, pal.core, pal.primary, alpha * 0.32, ry / Math.max(1, rx));
    drawSymmetricalSigilRing(ctx, p.x, p.y, rx * grow, ry * grow, {
      count: 8,
      arcFill: 0.62,
      rotation: reduced ? 0 : t * 0.55,
      lineWidth: 1.9 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.78,
      tickStyle: 'compass',
      tickLength: 0.13,
      innerRingRatio: 0.72,
      innerAlpha: 0.42,
    });
    if (tier >= 2) {
      drawSymmetricalSigilRing(ctx, p.x, p.y, rx * 0.52 * grow, ry * 0.52 * grow, {
        count: 4,
        arcFill: 0.54,
        rotation: reduced ? Math.PI * 0.25 : -t * 0.9,
        lineWidth: 1.4 * vs,
        color: pal.accent,
        coreColor: pal.core,
        alpha: alpha * 0.64,
        tickStyle: 'diamond',
      });
    }
    return;
  }

  // Sky layer — Dominant Hero: 8-point faceted celestial nova burst + straight needle rays
  const alpha = smoothWindow(t, 0.05, 0.24, 1);
  const cy = p.y - 16 * vs;
  const flash = Math.max(0, 1 - t * 2.4);
  const starR = (28 + easeOutQuart(t) * 34) * richness * vs;

  if (flash > 0.02) {
    drawSoftBloom(ctx, p.x, cy, 46 * richness * vs, pal.core, pal.secondary, flash * 0.55);
  }

  // Crisp 8-ray radial needle flares (strictly straight, alternating primary/accent)
  const rayCount = 8;
  const baseRot = reduced ? 0 : t * 0.28;
  const rayProgress = easeOutCubic(Math.min(1, t * 1.45));
  const innerStart = (10 + t * 16) * vs;
  for (let i = 0; i < rayCount; i += 1) {
    const a = baseRot + (i * Math.PI * 2) / rayCount;
    const isMajor = i % 2 === 0;
    const len = (isMajor ? 62 : 40) * richness * vs * rayProgress;
    const x1 = p.x + Math.cos(a) * innerStart;
    const y1 = cy + Math.sin(a) * innerStart * 0.82;
    const x2 = p.x + Math.cos(a) * (innerStart + len);
    const y2 = cy + Math.sin(a) * (innerStart + len) * 0.82;
    drawTaperedNeedle(ctx, x1, y1, x2, y2, {
      width: (isMajor ? 3.8 : 2.3) * richness * vs,
      color: isMajor ? pal.primary : pal.secondary,
      coreColor: pal.core,
      alpha: alpha * (isMajor ? 0.88 : 0.72),
      peakRatio: 0.35,
    });
  }

  // Dominant faceted celestial star crest (counter-layered 4+4 = 8-point silhouette)
  drawStarFlare(ctx, p.x, cy, starR, 0.14, pal.primary, pal.core, alpha * 0.96, baseRot, 4);
  drawStarFlare(
    ctx,
    p.x,
    cy,
    starR * 0.66,
    0.16,
    pal.accent,
    pal.core,
    alpha * 0.86,
    baseRot + Math.PI * 0.25,
    4,
  );

  // Single crisp vertical-plane shockwave halo
  const haloR = (16 + easeOutCubic(t) * 56) * richness * vs;
  drawEllipticalHalo(ctx, p.x, cy, haloR, haloR * 0.44, {
    lineWidth: (2.2 - t * 1.2) * vs,
    color: pal.primary,
    coreColor: pal.core,
    alpha: (1 - t) * 0.62,
  });
}

/**
 * 2. Sanctuary Wave — Restorative Lotus Tide
 * Dominant Hero: Symmetrical 6-petal glowing lotus crest unfurling on the arena floor,
 *                crowned by two silky ascending crescent sanctuary waves.
 * Supporting:    Calm concentric emerald ripples + delicate floating diamond motes.
 */
function renderSanctuaryWave(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const allies = resolvePoints(fx, bf, w, h, [{ x: fx.x, y: fx.y }]);
  const { rx, ry } = getWorldRadii(fx, p, 22);

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.08, 0.38, 1);
    const unfurl = 0.28 + easeOutCubic(Math.min(1, t * 1.35)) * 0.78;
    const lotusRx = Math.min(rx, 86 * vs) * richness * unfurl;
    const lotusRy = lotusRx * 0.48;

    drawSoftBloom(ctx, p.x, p.y, lotusRx * 1.1, pal.core, pal.primary, alpha * 0.3, 0.48);

    // Dominant Ground Hero: exact 6-petal symmetrical lotus crest
    drawLotusCrest(ctx, p.x, p.y, lotusRx, lotusRy, {
      petals: 6,
      rotation: reduced ? 0 : t * 0.35,
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.86,
    });

    // Two calm expanding concentric water-light ripples
    for (let ring = 0; ring < 2; ring += 1) {
      const rt = clamp01((t - ring * 0.16) / 0.84);
      if (rt <= 0) continue;
      const rGrow = 0.42 + easeOutCubic(rt) * 0.82;
      drawEllipticalHalo(ctx, p.x, p.y, lotusRx * 1.12 * rGrow, lotusRy * 1.12 * rGrow, {
        lineWidth: (1.8 - ring * 0.4) * vs,
        color: ring === 0 ? pal.primary : pal.secondary,
        coreColor: pal.core,
        alpha: (1 - rt) * 0.65,
      });
    }
    return;
  }

  // Sky layer — Silky analytical crescent sanctuary waves sweeping upward
  const alpha = smoothWindow(t, 0.06, 0.32, 1);
  const spanX = 96 * richness * vs;
  const riseBase = (reduced ? 20 : 6 + easeOutCubic(t) * 44) * vs;
  const waveCount = tier >= 3 ? 3 : 2;

  for (let i = 0; i < waveCount; i += 1) {
    const wt = clamp01((t - i * 0.1) / 0.9);
    if (wt <= 0) continue;
    const yLift = riseBase + i * 16 * vs;
    const spread = spanX * (0.72 + easeOutCubic(wt) * 0.44);
    const p0 = { x: p.x - spread, y: p.y - yLift + 12 * vs };
    const p1 = { x: p.x - spread * 0.38, y: p.y - yLift - 26 * vs };
    const p2 = { x: p.x + spread * 0.38, y: p.y - yLift - 26 * vs };
    const p3 = { x: p.x + spread, y: p.y - yLift + 12 * vs };

    drawAnalyticalRibbon(ctx, (u) => sampleCubicBezier(p0, p1, p2, p3, u), {
      uStart: 0,
      uEnd: 1,
      steps: 38,
      maxWidth: (5.2 - i * 1.1) * richness * vs,
      color: i === 0 ? pal.primary : pal.secondary,
      coreColor: pal.core,
      alpha: alpha * (1 - i * 0.18) * 0.85,
      taperProfile: 'crescent',
      coreRatio: 0.44,
    });
  }

  // Quiet restorative diamond motes rising above healed allies
  for (let i = 0; i < allies.length; i += 1) {
    const ap = allies[i];
    const lift = (reduced ? 18 : 10 + easeOutCubic(t) * 32) * vs;
    drawDiamondPrism(ctx, ap.x, ap.y - lift, 4.2 * vs, 6.2 * vs, 0, {
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.78,
    });
  }
}

/**
 * 3. Stasis Pulse — Crystalline Timepiece Lock
 * Dominant Hero: Exact 12-hour concentric chrono-clock dial with sweeping clock hands
 *                that snap to a frozen halt + 4 symmetrical beveled amethyst prisms
 *                locking inward around the frozen zone.
 * Supporting:    Clean circular refraction pulse halo.
 */
function renderStasisPulse(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const { rx, ry } = getWorldRadii(fx, p, 19);
  const dialRx = Math.min(rx, 88 * vs) * richness;
  const dialRy = dialRx * 0.48;

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.06, 0.38, 1);
    const snap = 0.45 + easeOutQuart(Math.min(1, t * 2.2)) * 0.55;
    const curRx = dialRx * snap;
    const curRy = dialRy * snap;

    drawSoftBloom(ctx, p.x, p.y, curRx * 0.9, pal.core, pal.primary, alpha * 0.28, 0.48);

    // Precision 12-hour timepiece ring (exact 12 symmetrical segments & hour ticks)
    drawSymmetricalSigilRing(ctx, p.x, p.y, curRx, curRy, {
      count: 12,
      arcFill: 0.58,
      rotation: -Math.PI * 0.5,
      lineWidth: 1.75 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.84,
      tickStyle: 'radial',
      tickLength: 0.14,
      innerRingRatio: 0.74,
      innerAlpha: 0.48,
    });

    // Sweeping chrono clock hands that decelerate and freeze at t = 0.38
    const freezePhase = easeOutQuart(Math.min(1, t / 0.38));
    const minuteA = -Math.PI * 0.5 + (reduced ? 0.6 : freezePhase * Math.PI * 1.45);
    const hourA = -Math.PI * 0.5 + (reduced ? -0.8 : -freezePhase * Math.PI * 0.45);

    drawTaperedNeedle(
      ctx,
      p.x,
      p.y,
      p.x + Math.cos(minuteA) * curRx * 0.72,
      p.y + Math.sin(minuteA) * curRy * 0.72,
      { width: 2.8 * vs, color: pal.accent, coreColor: pal.core, alpha: alpha * 0.9, peakRatio: 0.22 },
    );
    drawTaperedNeedle(
      ctx,
      p.x,
      p.y,
      p.x + Math.cos(hourA) * curRx * 0.48,
      p.y + Math.sin(hourA) * curRy * 0.48,
      { width: 3.4 * vs, color: pal.primary, coreColor: pal.core, alpha: alpha * 0.88, peakRatio: 0.25 },
    );
    return;
  }

  // Sky layer — 4 cleanly separated symmetrical beveled crystal prisms locking inward
  const alpha = smoothWindow(t, 0.05, 0.34, 1);
  const lockIn = easeOutBackClamped(Math.min(1, t * 2.2), 0.65);
  const orbitRx = (70 - lockIn * 14) * richness * vs;
  const orbitRy = (46 - lockIn * 8) * richness * vs;
  const cy = p.y - 22 * vs;

  // Crisp crystalline refraction ring
  const pulseR = (18 + easeOutCubic(t) * 62) * richness * vs;
  drawEllipticalHalo(ctx, p.x, cy, pulseR, pulseR * 0.48, {
    lineWidth: 1.7 * vs,
    color: pal.secondary,
    coreColor: pal.core,
    alpha: (1 - t) * 0.58,
  });

  // 4 cleanly separated cardinal crystal pylons (wide left/right + compact foreground/background)
  const prismSpecs = [
    { x: -orbitRx, y: 0, rx: 8.0, ry: 15.0, a: 0.92 },
    { x: orbitRx, y: 0, rx: 8.0, ry: 15.0, a: 0.92 },
    { x: 0, y: -orbitRy * 0.62, rx: 6.2, ry: 11.5, a: 0.78 },
    { x: 0, y: orbitRy * 0.52, rx: 6.8, ry: 12.5, a: 0.86 },
  ];
  for (let i = 0; i < prismSpecs.length; i += 1) {
    const ps = prismSpecs[i];
    drawDiamondPrism(
      ctx,
      p.x + ps.x,
      cy + ps.y,
      ps.rx * richness * vs,
      ps.ry * richness * vs,
      0,
      {
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: alpha * ps.a,
      },
    );
  }

  // Central stasis apex diamond
  drawStarFlare(ctx, p.x, cy, 13 * richness * vs, 0.2, pal.accent, pal.core, alpha * 0.92, 0, 4);
}

/**
 * 4. Orbital Lance — Precision Sky-to-Ground Celestial Spear
 * Dominant Hero: Sculpted, razor-tapered vertical celestial lance needle plunging from
 *                above into the target with a pointed diamond tip + twin angled
 *                impact shock-crescents (zero flat `fillRect` slabs).
 * Supporting:    Symmetrical concentric orbital lock-on ground sigil.
 */
function renderOrbitalLance(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.02, 0.32, 1);
    const lockShrink = 1.25 - easeOutQuart(Math.min(1, t * 3.5)) * 0.45;
    const blastGrow = t > 0.14 ? 0.45 + easeOutQuart((t - 0.14) / 0.86) * 0.85 : 0.45;
    const rx = 56 * richness * vs * (t < 0.14 ? lockShrink : blastGrow);
    const ry = rx * 0.48;

    drawSoftBloom(ctx, p.x, p.y, rx * 1.1, pal.core, pal.primary, alpha * 0.42, 0.48);
    drawSymmetricalSigilRing(ctx, p.x, p.y, rx, ry, {
      count: 4,
      arcFill: 0.58,
      rotation: Math.PI * 0.25,
      lineWidth: 2.0 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.88,
      tickStyle: 'compass',
      tickLength: 0.18,
      innerRingRatio: 0.56,
      innerAlpha: 0.52,
    });
    return;
  }

  // Sky layer — Sculpted tapered celestial lance spear + impact shock crescents
  const topY = Math.max(-24, p.y - 290 * vs);
  const strikeT = clamp01((t - 0.06) / 0.16);
  const lanceTipY = reduced ? p.y : topY + (p.y - topY) * easeOutQuart(strikeT);
  const beamAlpha = smoothWindow(t, 0.06, 0.28, 1);
  const widthDecay = 1 - clamp01((t - 0.22) / 0.78) * 0.65;

  drawTaperedBeamSpire(ctx, p.x, lanceTipY, topY, {
    baseWidth: 24 * richness * vs * widthDecay,
    topWidth: 6.5 * richness * vs * widthDecay,
    tipHeight: 34 * richness * vs,
    color: pal.primary,
    secondaryColor: pal.secondary,
    coreColor: pal.core,
    alpha: beamAlpha * 0.96,
    mode: 'lance',
  });

  // Impact moment: twin symmetrical sweeping shock-crescents + crisp impact star
  if (t >= 0.14) {
    const it = clamp01((t - 0.14) / 0.86);
    const iAlpha = (1 - it * it) * 0.92;
    const wingSpan = (28 + easeOutQuart(it) * 68) * richness * vs;
    const wingLift = (14 + easeOutCubic(it) * 34) * richness * vs;

    for (const dir of [-1, 1]) {
      const p0 = { x: p.x + dir * 4 * vs, y: p.y - 4 * vs };
      const p1 = { x: p.x + dir * wingSpan * 0.55, y: p.y - wingLift * 0.25 };
      const p2 = { x: p.x + dir * wingSpan, y: p.y - wingLift };
      drawAnalyticalRibbon(ctx, (u) => sampleQuadBezier(p0, p1, p2, u), {
        uStart: 0,
        uEnd: 1,
        steps: 28,
        maxWidth: (5.2 - it * 2.2) * richness * vs,
        color: pal.secondary,
        coreColor: pal.core,
        alpha: iAlpha * 0.84,
        taperProfile: 'taper_out',
        coreRatio: 0.45,
      });
    }

    // Concentric sky-ring collar elevated clearly above the impact zone
    const collarY = p.y - (52 + it * 56) * vs;
    const collarR = (16 + it * 20) * richness * vs;
    drawEllipticalHalo(ctx, p.x, collarY, collarR, collarR * 0.32, {
      lineWidth: (tier >= 2 ? 1.9 : 1.4) * vs,
      color: pal.secondary,
      coreColor: pal.core,
      alpha: iAlpha * 0.76,
    });

    drawStarFlare(ctx, p.x, p.y - 6 * vs, (24 + (1 - it) * 14) * richness * vs, 0.14, pal.primary, pal.core, iAlpha, 0, 4);
  }
}

/**
 * 5. Gravity Vortex — Logarithmic Singularity Well
 * Dominant Hero: Three silky 40-segment logarithmic spiral vector arms coiling inward
 *                toward a dark-violet event-horizon core with bright gold-white rim.
 * Supporting:    Contracting outer gravity halo + 6 inward-gliding diamond motes.
 */
function renderGravityVortex(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const { rx } = getWorldRadii(fx, p, 20);
  const maxR = Math.min(rx, 92 * vs) * richness;
  const ryRatio = 0.5;

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.08, 0.38, 1);
    const pull = 1.08 - easeOutCubic(t) * 0.42;

    // Deep singularity contrast well (subtle dark core so bright rim reads crisply)
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1, ryRatio);
    if (typeof ctx.createRadialGradient === 'function') {
      const well = ctx.createRadialGradient(0, 0, 0, 0, 0, maxR * 0.55);
      well.addColorStop(0, `rgba(12, 8, 32, ${(alpha * 0.68).toFixed(3)})`);
      well.addColorStop(0.55, withAlpha(pal.primary, alpha * 0.24));
      well.addColorStop(1, withAlpha(pal.primary, 0));
      ctx.fillStyle = well;
    } else {
      ctx.fillStyle = `rgba(12, 8, 32, ${(alpha * 0.45).toFixed(3)})`;
    }
    ctx.beginPath();
    ctx.arc(0, 0, maxR * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Contracting symmetrical gravity well halo
    drawSymmetricalSigilRing(ctx, p.x, p.y, maxR * pull, maxR * pull * ryRatio, {
      count: 6,
      arcFill: 0.52,
      rotation: reduced ? 0 : -t * 2.2,
      lineWidth: 1.6 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.72,
      innerRingRatio: 0.42,
      innerAlpha: 0.55,
    });
    return;
  }

  // Sky layer — Dominant Hero: 3 smooth 40-segment logarithmic spiral arms
  const alpha = smoothWindow(t, 0.06, 0.34, 1);
  const armCount = tier >= 3 ? 4 : 3;
  const spin = reduced ? 0 : -t * 3.4;

  for (let arm = 0; arm < armCount; arm += 1) {
    const startA = spin + (arm * Math.PI * 2) / armCount;
    const outerR = maxR * (0.98 - t * 0.16);
    const innerR = Math.max(8 * vs, maxR * 0.14);

    drawAnalyticalRibbon(
      ctx,
      (u) => sampleLogSpiral(p.x, p.y - 4 * vs, outerR, innerR, startA, Math.PI * 1.42, ryRatio, u),
      {
        uStart: 0.04,
        uEnd: 0.98,
        steps: 40,
        maxWidth: (4.6 - (arm % 2) * 0.7) * richness * vs,
        color: arm % 2 === 0 ? pal.primary : pal.secondary,
        coreColor: pal.core,
        alpha: alpha * 0.88,
        taperProfile: 'comet',
        coreRatio: 0.42,
      },
    );
  }

  // Crisp luminous accretion horizon ring around singularity core
  const horizonR = (14 + Math.sin(t * Math.PI) * 5) * richness * vs;
  drawEllipticalHalo(ctx, p.x, p.y - 4 * vs, horizonR, horizonR * ryRatio, {
    lineWidth: 2.2 * vs,
    color: pal.accent,
    coreColor: pal.core,
    alpha: alpha * 0.94,
  });

  // 6 inward-gliding symmetrical diamond motes
  if (!reduced) {
    for (let i = 0; i < 6; i += 1) {
      const a = spin * 0.7 + (i * Math.PI * 2) / 6;
      const dist = maxR * (0.82 - easeInOutQuad(t) * 0.58);
      const mx = p.x + Math.cos(a) * dist;
      const my = p.y - 4 * vs + Math.sin(a) * dist * ryRatio;
      drawDiamondPrism(ctx, mx, my, 2.8 * vs, 4.2 * vs, a, {
        color: pal.secondary,
        secondaryColor: pal.accent,
        coreColor: pal.core,
        alpha: alpha * 0.82,
      });
    }
  }
}

/**
 * 6. Chain Lightning — Stepped Anime Voltaic Arcs
 * Dominant Hero: Crisp tapered stepped-cadence anime lightning bolts chaining sequentially
 *                between targets (controlled ~9 Hz cadence, zero jittery noise),
 *                anchored by crisp 4-spark impact stars at each struck target.
 * Supporting:    Compact symmetrical electric foot rings on struck enemies.
 */
function renderChainLightning(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const targets = resolvePoints(fx, bf, w, h, [
    { x: fx.x, y: fx.y },
    { x: Math.min(92, fx.x + 12), y: Math.max(12, fx.y - 10) },
    { x: Math.min(94, fx.x + 18), y: Math.min(88, fx.y + 12) },
  ]);

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.04, 0.3, 1);
    for (let i = 0; i < targets.length; i += 1) {
      const tp = targets[i];
      const hopT = clamp01((t - i * 0.07) / 0.86);
      if (hopT <= 0) continue;
      const r = (15 + easeOutCubic(hopT) * 14) * richness * vs;
      drawSymmetricalSigilRing(ctx, tp.x, tp.y, r, r * 0.48, {
        count: 4,
        arcFill: 0.5,
        rotation: i * 0.4 + (reduced ? 0 : hopT * 1.4),
        lineWidth: 1.6 * vs,
        color: pal.primary,
        coreColor: pal.core,
        alpha: alpha * (1 - hopT * 0.35) * 0.78,
        tickStyle: 'radial',
        tickLength: 0.2,
      });
    }
    return;
  }

  // Sky layer — Crisp stepped anime lightning cascade from sky into first target, then target->target
  const alpha = smoothWindow(t, 0.02, 0.26, 1);
  const stepIndex = reduced ? 0 : Math.floor(t * 7);
  const seedBase = fx.seed || 61;

  if (targets.length > 0) {
    const first = targets[0];
    // Initial sky-to-primary-target strike
    drawSteppedLightningBolt(ctx, first.x - 14 * vs, first.y - 135 * vs, first.x, first.y - 14 * vs, {
      segments: 7,
      amplitude: 10 * vs,
      width: 3.6 * richness * vs,
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.94,
      seed: seedBase,
      stepIndex,
    });
  }

  // Sequential chain arcs between enemies
  for (let i = 0; i < targets.length - 1; i += 1) {
    const hopDelay = 0.06 + i * 0.07;
    const hopT = clamp01((t - hopDelay) / 0.78);
    if (hopT <= 0) continue;
    const a = targets[i];
    const b = targets[i + 1];
    const hopAlpha = smoothWindow(hopT, 0.05, 0.35, 1);

    drawSteppedLightningBolt(ctx, a.x, a.y - 14 * vs, b.x, b.y - 14 * vs, {
      segments: 7,
      amplitude: 11 * vs,
      width: (3.2 - i * 0.2) * richness * vs,
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: hopAlpha * 0.96,
      seed: seedBase + (i + 1) * 37,
      stepIndex,
    });

    if (tier >= 2 && i === 0) {
      drawSteppedLightningBolt(ctx, a.x, a.y - 14 * vs, b.x, b.y - 14 * vs, {
        segments: 6,
        amplitude: 15 * vs,
        width: 1.6 * vs,
        color: pal.accent,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: hopAlpha * 0.62,
        seed: seedBase + 199,
        stepIndex,
      });
    }
  }

  // Clean impact star flares at each struck target
  for (let i = 0; i < targets.length; i += 1) {
    const hopT = clamp01((t - i * 0.07) / 0.82);
    if (hopT <= 0) continue;
    const tp = targets[i];
    drawStarFlare(
      ctx,
      tp.x,
      tp.y - 14 * vs,
      (16 - i * 1.4) * richness * vs * (1 - hopT * 0.3),
      0.16,
      pal.accent,
      pal.core,
      smoothWindow(hopT, 0.05, 0.3, 1) * 0.94,
      Math.PI * 0.25,
      4,
    );
  }
}

// ============================================================================
// B. TACTIC CARDS (6) — Precision Arrows, Chevrons, Shields & Reticles
// ============================================================================

/**
 * 7. Full Assault — Forward Phalanx Surge
 * Dominant Hero: Three nested razor-symmetrical closed-polygon beveled golden chevrons (»)
 *                gliding rigidly forward across the battlefield centerline without warping.
 * Supporting:    Clean straight horizontal slipstream needles behind allies.
 */
function renderFullAssault(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const allies = resolvePoints(fx, bf, w, h, [{ x: 30, y: 50 }]);
  const startW = bf.worldToScreen(22, 50, w, h);
  const endW = bf.worldToScreen(76, 50, w, h);
  const sweep = reduced ? 0.5 : easeOutCubic(t);
  const leadX = startW.x + (endW.x - startW.x) * sweep;
  const centerY = startW.y;

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.06, 0.36, 1);
    drawSoftBloom(ctx, leadX - 24 * vs, centerY, 82 * richness * vs, pal.core, pal.primary, alpha * 0.26, 0.42);
    // Clean symmetrical forward-surge ground arc trailing the phalanx
    drawSymmetricalSigilRing(ctx, startW.x + 28 * vs, centerY, 46 * richness * vs, 22 * richness * vs, {
      count: 4,
      arcFill: 0.48,
      rotation: 0,
      lineWidth: 1.5 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.56,
    });
    return;
  }

  // Sky layer — Dominant Hero: 3 nested rigid symmetrical beveled chevrons (»)
  const alpha = smoothWindow(t, 0.05, 0.28, 1);
  const chevronCount = tier >= 3 ? 4 : 3;
  const spacing = 22 * richness * vs;
  const cy = centerY - 16 * vs;

  for (let i = 0; i < chevronCount; i += 1) {
    const scale = 1 - i * 0.14;
    const cx = leadX - i * spacing;
    const cAlpha = alpha * (1 - i * 0.18);
    drawPrecisionChevron(ctx, cx, cy, 0, {
      halfHeight: 46 * richness * vs * scale,
      depth: 24 * richness * vs * scale,
      thickness: 6.2 * richness * vs * scale,
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: cAlpha * 0.9,
    });
  }

  // Straight horizontal slipstream needles flanking allies (zero wavy sine kinks)
  if (!reduced) {
    for (let i = 0; i < allies.length; i += 1) {
      const ap = allies[i];
      const slide = easeOutCubic(t) * 26 * vs;
      drawTaperedNeedle(ctx, ap.x - 32 * vs + slide * 0.35, ap.y - 16 * vs, ap.x + 24 * vs + slide, ap.y - 16 * vs, {
        width: 3.0 * vs,
        color: pal.secondary,
        coreColor: pal.core,
        alpha: alpha * 0.78,
        peakRatio: 0.74,
      });
    }
  }
}

/**
 * 8. Focus Fire — Tactical Precision Lock-On
 * Dominant Hero: Four exact chamfered crimson-gold targeting brackets contracting
 *                symmetrically around the marked target onto a diamond crosshair,
 *                linked by razor-straight tapered needle sightlines from allies.
 * Supporting:    Balanced 4-arc target lock ground sigil.
 */
function renderFocusFire(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const allies = resolvePoints(fx, bf, w, h, [{ x: 28, y: 44 }, { x: 30, y: 60 }]);

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.05, 0.36, 1);
    const lock = easeOutQuart(Math.min(1, t * 2.4));
    const rx = (52 - lock * 22) * richness * vs;
    const ry = rx * 0.48;
    drawSoftBloom(ctx, p.x, p.y, rx * 1.15, pal.core, pal.primary, alpha * 0.3, 0.48);
    drawSymmetricalSigilRing(ctx, p.x, p.y, rx, ry, {
      count: 4,
      arcFill: 0.56,
      rotation: reduced ? Math.PI * 0.25 : Math.PI * 0.25 + (1 - lock) * 0.65,
      lineWidth: 1.9 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.86,
      tickStyle: 'compass',
      tickLength: 0.2,
    });
    return;
  }

  // Sky layer — Dominant Hero: exact 4-corner contracting tactical reticle + straight sightlines
  const alpha = smoothWindow(t, 0.04, 0.3, 1);
  const lockT = Math.min(1, t * 2.6);
  const contract = reduced ? 1 : easeOutBackClamped(lockT, 0.85);
  const cy = p.y - 16 * vs;
  const reticleR = Math.max(18 * vs, (42 - contract * 16) * richness * vs);
  const rot = reduced ? 0 : (1 - easeOutQuart(lockT)) * 0.55;

  // Razor-straight converging sightline needles from allies to the locked target
  if (!reduced) {
    const beamProgress = easeOutCubic(Math.min(1, t * 2.2));
    for (let i = 0; i < Math.min(4, allies.length); i += 1) {
      const ap = allies[i];
      const sx = ap.x;
      const sy = ap.y - 14 * vs;
      const ex = sx + (p.x - sx) * beamProgress;
      const ey = sy + (cy - sy) * beamProgress;
      drawTaperedNeedle(ctx, sx, sy, ex, ey, {
        width: 2.2 * vs,
        color: pal.primary,
        coreColor: pal.core,
        alpha: alpha * 0.62,
        peakRatio: 0.82,
      });
    }
  }

  drawPrecisionReticle(ctx, p.x, cy, reticleR, {
    rotation: rot,
    color: pal.primary,
    secondaryColor: pal.secondary,
    coreColor: pal.core,
    alpha: alpha * 0.96,
  });
}

/**
 * 9. Emergency Defense — Imperial Bastion Aegis Wall
 * Dominant Hero: Ornate symmetrical pointed-crest anime bastion shield rising vertically
 *                along the ally frontline, flanked by two recessed wing-shields.
 * Supporting:    Grounded 6-fold defensive ward sigil + restrained horizontal ward arc.
 */
function renderEmergencyDefense(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const center = bf.worldToScreen(fx.x, 50, w, h);

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.06, 0.38, 1);
    const expand = 0.35 + easeOutCubic(t) * 0.65;
    drawSoftBloom(ctx, center.x, center.y, 74 * richness * vs * expand, pal.core, pal.primary, alpha * 0.32, 0.48);
    drawSymmetricalSigilRing(ctx, center.x, center.y, 64 * richness * vs * expand, 30 * richness * vs * expand, {
      count: 6,
      arcFill: 0.6,
      rotation: Math.PI / 6,
      lineWidth: 1.8 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.82,
      tickStyle: 'diamond',
      innerRingRatio: 0.68,
      innerAlpha: 0.45,
    });
    return;
  }

  // Sky layer — Dominant Hero: central imperial bastion shield + symmetrical flanking wing shields
  const alpha = smoothWindow(t, 0.05, 0.32, 1);
  const rise = reduced ? 1 : easeOutBackClamped(Math.min(1, t * 2.4), 0.6);
  const wingSpread = reduced ? 1 : easeOutCubic(Math.min(1, t * 2.1));
  const cy = center.y - (26 + rise * 8) * vs;

  // Flanking symmetrical wing shields (recessed behind main crest)
  const wingOffsetX = 42 * richness * vs * wingSpread;
  const wingOffsetY = 8 * vs;
  for (const dir of [-1, 1]) {
    drawBastionShield(ctx, center.x + dir * wingOffsetX, cy + wingOffsetY, 26 * richness * vs, 38 * richness * vs, {
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * (tier >= 2 ? 0.72 : 0.56),
    });
  }

  // Dominant central bastion shield crest
  drawBastionShield(ctx, center.x, cy, 46 * richness * vs * (0.78 + rise * 0.22), 64 * richness * vs * (0.78 + rise * 0.22), {
    color: pal.primary,
    secondaryColor: pal.secondary,
    coreColor: pal.core,
    alpha: alpha * 0.96,
  });

  // Subtle arching protective ribbon crowning the bastion
  const p0 = { x: center.x - 56 * richness * vs, y: cy + 12 * vs };
  const p1 = { x: center.x, y: cy - 48 * richness * vs };
  const p2 = { x: center.x + 56 * richness * vs, y: cy + 12 * vs };
  drawAnalyticalRibbon(ctx, (u) => sampleQuadBezier(p0, p1, p2, u), {
    uStart: 0.05,
    uEnd: 0.95,
    steps: 34,
    maxWidth: 3.4 * richness * vs,
    color: pal.secondary,
    coreColor: pal.core,
    alpha: alpha * 0.68,
    taperProfile: 'crescent',
    coreRatio: 0.45,
  });
}

/**
 * 10. Flank Maneuver — Mirror-Symmetric Twin Pincer Arrows
 * Dominant Hero: Two mirror-symmetric silky 38-segment curved cubic Bezier tactical
 *                arrow arcs sweeping around North & South flanks and converging inward,
 *                each tipped with an exact tangent-aligned symmetrical arrowhead.
 * Supporting:    Quiet directional slipstream glints along each flank corridor.
 */
function renderFlankManeuver(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const northMid = bf.worldToScreen(52, 20, w, h);
  const southMid = bf.worldToScreen(52, 80, w, h);

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.06, 0.36, 1);
    for (const mp of [northMid, southMid]) {
      drawSymmetricalSigilRing(ctx, mp.x, mp.y, 34 * richness * vs, 15 * richness * vs, {
        count: 4,
        arcFill: 0.5,
        rotation: 0,
        lineWidth: 1.4 * vs,
        color: pal.primary,
        coreColor: pal.core,
        alpha: alpha * 0.62,
      });
    }
    return;
  }

  // Sky layer — Dominant Hero: mirror-symmetric north & south curved pincer arrows
  const alpha = smoothWindow(t, 0.05, 0.3, 1);
  const uHead = reduced ? 0.92 : easeOutCubic(Math.min(1, t * 1.45));
  const uTail = Math.max(0, uHead - 0.62);

  const flankSpecs = [
    {
      p0: bf.worldToScreen(16, 42, w, h, 4),
      p1: bf.worldToScreen(34, 10, w, h, 8),
      p2: bf.worldToScreen(64, 10, w, h, 8),
      p3: bf.worldToScreen(78, 38, w, h, 4),
    },
    {
      p0: bf.worldToScreen(16, 58, w, h, 4),
      p1: bf.worldToScreen(34, 90, w, h, 8),
      p2: bf.worldToScreen(64, 90, w, h, 8),
      p3: bf.worldToScreen(78, 62, w, h, 4),
    },
  ];

  for (let i = 0; i < flankSpecs.length; i += 1) {
    const spec = flankSpecs[i];
    const sampleFn = (u) => sampleCubicBezier(spec.p0, spec.p1, spec.p2, spec.p3, u);

    if (uHead > uTail + 0.02) {
      drawAnalyticalRibbon(ctx, sampleFn, {
        uStart: uTail,
        uEnd: uHead,
        steps: 38,
        maxWidth: 6.2 * richness * vs,
        color: pal.primary,
        coreColor: pal.core,
        alpha: alpha * 0.9,
        taperProfile: 'comet',
        coreRatio: 0.44,
      });

      // Exact tangent-aligned symmetrical arrowhead riding the leading tip of the curve
      const tip = sampleFn(uHead);
      const tangentAngle = Math.atan2(tip.ty, tip.tx);
      drawPrecisionArrow(ctx, tip.x, tip.y, tangentAngle, {
        headLength: 20 * richness * vs,
        headHalfWidth: 11.5 * richness * vs,
        barbBack: 7 * richness * vs,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: alpha * 0.96,
        withShaft: false,
      });
    }
  }
}

/**
 * 11. Siege Formation — Unified Precision Spearhead Breakthrough
 * (Directly rebuilds the flagship reported crooked-arrow defect!)
 * Dominant Hero: ONE unified, mathematically exact closed-polygon precision spearhead
 *                arrow (straight aligned shaft, razor-symmetrical beveled arrowhead,
 *                seamless shaft-to-head junction, crisp inner white-gold spine) flanked
 *                by twin symmetrical parallel vanguard vanes, advancing rigidly forward.
 * Supporting:    Symmetrical 4-arc formation anchor crest + compact aligned spear-tips on allies.
 */
function renderSiegeFormation(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const allies = resolvePoints(fx, bf, w, h, [{ x: 34, y: 44 }, { x: 34, y: 56 }]);
  const lunge = reduced ? 0.5 : easeOutQuart(t);
  const anchor = bf.worldToScreen(30 + lunge * 36, 50, w, h);

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.05, 0.34, 1);
    drawSoftBloom(ctx, anchor.x, anchor.y, 68 * richness * vs, pal.core, pal.primary, alpha * 0.34, 0.46);
    drawSymmetricalSigilRing(ctx, anchor.x, anchor.y, 48 * richness * vs, 23 * richness * vs, {
      count: 4,
      arcFill: 0.56,
      rotation: 0,
      lineWidth: 1.8 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.78,
      tickStyle: 'diamond',
    });
    return;
  }

  // Sky layer — Dominant Hero: Unified Precision Spearhead Arrow + Recessed Vanguard Halo Chevron
  const alpha = smoothWindow(t, 0.04, 0.28, 1);
  const cy = anchor.y - 16 * vs;

  // Recessed symmetrical vanguard flank chevron positioned cleanly behind the spearhead
  drawPrecisionChevron(ctx, anchor.x - 24 * richness * vs, cy, 0, {
    halfHeight: 38 * richness * vs,
    depth: 20 * richness * vs,
    thickness: 4.4 * richness * vs,
    color: pal.primary,
    secondaryColor: pal.secondary,
    coreColor: pal.core,
    alpha: alpha * (tier >= 2 ? 0.56 : 0.46),
  });

  // Unified, razor-symmetrical closed-polygon precision spearhead arrow (angle = 0 exact horizontal)
  drawPrecisionArrow(ctx, anchor.x + 14 * vs, cy, 0, {
    shaftLength: 84 * richness * vs,
    shaftHalfWidth: 4.2 * richness * vs,
    tailHalfWidth: 1.2 * vs,
    headLength: 34 * richness * vs,
    headHalfWidth: 18 * richness * vs,
    barbBack: 10 * richness * vs,
    color: pal.primary,
    secondaryColor: pal.secondary,
    coreColor: pal.core,
    alpha: alpha * 0.96,
    withShaft: true,
  });

  // Crisp piercing tip glint exactly at the arrow apex
  const apexX = anchor.x + 14 * vs + 34 * richness * vs;
  drawStarFlare(ctx, apexX, cy, 14 * richness * vs, 0.16, pal.secondary, pal.core, alpha * 0.94, 0, 4);

  // Subtle aligned mini spear-needles on allies
  if (!reduced) {
    for (let i = 0; i < Math.min(4, allies.length); i += 1) {
      const ap = allies[i];
      drawPrecisionArrow(ctx, ap.x + 14 * vs, ap.y - 14 * vs, 0, {
        shaftLength: 18 * vs,
        shaftHalfWidth: 1.6 * vs,
        tailHalfWidth: 0.5 * vs,
        headLength: 9 * vs,
        headHalfWidth: 5 * vs,
        barbBack: 3 * vs,
        color: pal.secondary,
        secondaryColor: pal.accent,
        coreColor: pal.core,
        alpha: alpha * 0.72,
        withShaft: true,
      });
    }
  }
}

/**
 * 12. Suppressive Volley — Synchronized Parabolic Arrow Barrage
 * Dominant Hero: Choreographed salvo of silky 32-segment parabolic trajectory arcs
 *                tipped with crisp miniature tangent-aligned arrow darts raining cleanly
 *                into the enemy zone.
 * Supporting:    Symmetrical 6-fold suppression zone ground sigil + pinpoint impact flares.
 */
function renderSuppressiveVolley(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const enemyZone = bf.worldToScreen(72, 50, w, h);

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.1, 0.34, 1);
    const rx = 74 * richness * vs;
    const ry = rx * 0.46;
    drawSoftBloom(ctx, enemyZone.x, enemyZone.y, rx, pal.core, pal.primary, alpha * 0.28, 0.46);
    drawSymmetricalSigilRing(ctx, enemyZone.x, enemyZone.y, rx, ry, {
      count: 6,
      arcFill: 0.56,
      rotation: reduced ? 0 : -t * 0.85,
      lineWidth: 1.7 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.78,
      tickStyle: 'radial',
      tickLength: 0.14,
      innerRingRatio: 0.62,
      innerAlpha: 0.4,
    });
    return;
  }

  // Sky layer — Dominant Hero: deterministic evenly spaced parabolic arrow barrage
  const volleyCount = 5 + tier;
  for (let i = 0; i < volleyCount; i += 1) {
    const laneFrac = volleyCount > 1 ? i / (volleyCount - 1) : 0.5;
    const delay = laneFrac * 0.24;
    const vt = clamp01((t - delay) / 0.68);
    if (vt <= 0 || vt >= 1) continue;

    const laneY = 20 + laneFrac * 60;
    const staggerX = (i % 2 === 0 ? -4 : 5);
    const startPt = bf.worldToScreen(20 + staggerX * 0.4, laneY, w, h, 8);
    const endPt = bf.worldToScreen(64 + (i % 3) * 7, laneY + (i % 2 === 0 ? -3 : 3), w, h, 0);
    const ctrlPt = {
      x: (startPt.x + endPt.x) * 0.5,
      y: Math.min(startPt.y, endPt.y) - (68 + (i % 2) * 16) * vs,
    };

    const sampleFn = (u) => sampleQuadBezier(startPt, ctrlPt, endPt, u);
    const uHead = reduced ? 0.92 : easeOutCubic(Math.min(1, vt * 1.38));
    const uTail = Math.max(0, uHead - 0.42);
    const vAlpha = smoothWindow(vt, 0.06, 0.3, 1);

    if (uHead > uTail + 0.02) {
      drawAnalyticalRibbon(ctx, sampleFn, {
        uStart: uTail,
        uEnd: uHead,
        steps: 32,
        maxWidth: 3.4 * richness * vs,
        color: i % 2 === 0 ? pal.primary : pal.secondary,
        coreColor: pal.core,
        alpha: vAlpha * 0.86,
        taperProfile: 'comet',
        coreRatio: 0.46,
      });

      // Exact tangent-aligned miniature dart arrowhead at trajectory tip
      const tip = sampleFn(uHead);
      const angle = Math.atan2(tip.ty, tip.tx);
      drawPrecisionArrow(ctx, tip.x, tip.y, angle, {
        headLength: 10.5 * richness * vs,
        headHalfWidth: 4.8 * richness * vs,
        barbBack: 3.5 * richness * vs,
        color: i % 2 === 0 ? pal.primary : pal.secondary,
        secondaryColor: pal.accent,
        coreColor: pal.core,
        alpha: vAlpha * 0.95,
        withShaft: false,
      });
    }

    // Crisp impact flare upon landing
    if (uHead > 0.88) {
      const impA = (1 - vt) * 1.8;
      drawStarFlare(ctx, endPt.x, endPt.y - 3 * vs, 9.5 * richness * vs, 0.18, pal.secondary, pal.core, impA, 0, 4);
    }
  }
}

// ============================================================================
// C. SUPPORT CARDS (6) — Wards, Conduits, Helices, Constellations & Spires
// ============================================================================

/**
 * 13. Aegis Blessing — Luminous Crescent Canopy Ward
 * Dominant Hero: Refined translucent sapphire-ivory crescent ward canopies arching over
 *                each ally (smooth analytical tapered upper dome shell + crisp apex
 *                diamond keystone crest).
 * Supporting:    Balanced 4-arc protective foot sigil beneath each ally.
 */
function renderAegisBlessing(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const allies = resolvePoints(fx, bf, w, h, [{ x: fx.x, y: fx.y }]);

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.05, 0.34, 1);
    for (let i = 0; i < allies.length; i += 1) {
      const ap = allies[i];
      const r = (18 + easeOutCubic(t) * 6) * richness * vs;
      drawSoftBloom(ctx, ap.x, ap.y, r * 1.25, pal.core, pal.primary, alpha * 0.3, 0.5);
      drawSymmetricalSigilRing(ctx, ap.x, ap.y, r, r * 0.48, {
        count: 4,
        arcFill: 0.62,
        rotation: reduced ? 0 : t * 0.8 + i * 0.4,
        lineWidth: 1.5 * vs,
        color: pal.primary,
        coreColor: pal.core,
        alpha: alpha * 0.82,
        tickStyle: 'diamond',
      });
    }
    return;
  }

  // Sky layer — Dominant Hero: Tapered analytical crescent ward canopies + apex diamond keystones
  const alpha = smoothWindow(t, 0.05, 0.32, 1);
  const sweepSpan = reduced ? 1 : easeOutCubic(Math.min(1, t * 2.1));

  for (let i = 0; i < allies.length; i += 1) {
    const ap = allies[i];
    const domeR = (23 + easeOutCubic(t) * 5) * richness * vs;
    const domeCy = ap.y - 12 * vs;

    // Soft translucent inner dome fill
    ctx.save();
    ctx.beginPath();
    ctx.arc(ap.x, domeCy, domeR, Math.PI * 1.03, Math.PI * 1.97);
    ctx.closePath();
    ctx.fillStyle = withAlpha(pal.primary, alpha * 0.14);
    ctx.fill();
    ctx.restore();

    // Smooth analytical tapered upper crescent canopy
    const halfArc = Math.PI * 0.47 * sweepSpan;
    drawAnalyticalRibbon(
      ctx,
      (u) => {
        const a = -Math.PI * 0.5 - halfArc + u * halfArc * 2;
        return {
          x: ap.x + Math.cos(a) * domeR,
          y: domeCy + Math.sin(a) * domeR,
          tx: -Math.sin(a) * domeR,
          ty: Math.cos(a) * domeR,
        };
      },
      {
        uStart: 0,
        uEnd: 1,
        steps: 32,
        maxWidth: 4.4 * richness * vs,
        color: pal.primary,
        coreColor: pal.core,
        alpha: alpha * 0.92,
        taperProfile: 'crescent',
        coreRatio: 0.45,
      },
    );

    // Subtle secondary inner rim arc
    drawEllipticalHalo(ctx, ap.x, domeCy, domeR * 0.84, domeR * 0.84, {
      lineWidth: 0.95 * vs,
      color: pal.secondary,
      coreColor: null,
      alpha: alpha * 0.58,
      startAngle: -Math.PI * 0.5 - halfArc * 0.82,
      endAngle: -Math.PI * 0.5 + halfArc * 0.82,
    });

    // Crisp symmetrical diamond keystone floating at dome apex
    drawDiamondPrism(ctx, ap.x, domeCy - domeR - 3 * vs, 4.4 * richness * vs, 6.2 * richness * vs, 0, {
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.94,
    });
  }
}

/**
 * 14. Overclock Core — Geometric Leyline Power Conduit
 * Dominant Hero: Crisp rotating golden-cyan geometric diamond astrolabe core igniting
 *                in the Ally Zone, feeding smooth 36-segment analytical Bezier energy
 *                conduit arcs cleanly into every allied unit.
 * Supporting:    Balanced dual-ring conduit floor sigil + crisp charge ticks on allies.
 */
function renderOverclockCore(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const allies = resolvePoints(fx, bf, w, h, [{ x: fx.x, y: fx.y }]);

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.05, 0.34, 1);
    const grow = 0.3 + easeOutQuart(t) * 0.78;
    const rx = 64 * richness * vs * grow;
    const ry = rx * 0.48;
    drawSoftBloom(ctx, p.x, p.y, rx * 1.05, pal.core, pal.primary, alpha * 0.34, 0.48);
    drawSymmetricalSigilRing(ctx, p.x, p.y, rx, ry, {
      count: 6,
      arcFill: 0.58,
      rotation: reduced ? 0 : t * 1.1,
      lineWidth: 1.8 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.84,
      tickStyle: 'diamond',
      innerRingRatio: 0.62,
      innerAlpha: 0.48,
    });
    drawSymmetricalSigilRing(ctx, p.x, p.y, rx * 0.44, ry * 0.44, {
      count: 4,
      arcFill: 0.54,
      rotation: reduced ? Math.PI * 0.25 : -t * 1.6,
      lineWidth: 1.3 * vs,
      color: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.72,
    });
    return;
  }

  // Sky layer — Dominant Hero: Rotating diamond conduit core + silky Bezier leyline arcs to allies
  const alpha = smoothWindow(t, 0.04, 0.3, 1);
  const coreY = p.y - 20 * vs;
  const flowHead = reduced ? 1 : easeOutCubic(Math.min(1, t * 1.85));

  // Smooth analytical Bezier energy conduit arcs linking core anchor to allies
  if (!reduced) {
    for (let i = 0; i < allies.length; i += 1) {
      const ap = allies[i];
      const p0 = { x: p.x, y: coreY };
      const p2 = { x: ap.x, y: ap.y - 14 * vs };
      const mid = {
        x: (p0.x + p2.x) * 0.5,
        y: Math.min(p0.y, p2.y) - 24 * vs,
      };
      drawAnalyticalRibbon(ctx, (u) => sampleQuadBezier(p0, mid, p2, u), {
        uStart: 0,
        uEnd: flowHead,
        steps: 34,
        maxWidth: 3.6 * richness * vs,
        color: i % 2 === 0 ? pal.primary : pal.secondary,
        coreColor: pal.core,
        alpha: alpha * 0.82,
        taperProfile: 'spindle',
        coreRatio: 0.46,
      });

      if (flowHead > 0.72) {
        drawStarFlare(ctx, ap.x, ap.y - 16 * vs, 8.5 * richness * vs, 0.18, pal.secondary, pal.core, alpha * 0.9, i * 0.4, 4);
      }
    }
  }

  // Central diamond geometric power core (layered square-diamond astrolabe)
  const coreR = (17 + Math.sin(t * Math.PI) * 5) * richness * vs;
  drawDiamondPrism(ctx, p.x, coreY, coreR * 0.78, coreR, reduced ? 0 : t * 0.65, {
    color: pal.primary,
    secondaryColor: pal.accent,
    coreColor: pal.core,
    alpha: alpha * 0.94,
  });
  drawEllipticalHalo(ctx, p.x, coreY, coreR * 1.15, coreR * 1.15, {
    lineWidth: (tier >= 2 ? 1.6 : 1.2) * vs,
    color: pal.secondary,
    coreColor: pal.core,
    alpha: alpha * 0.72,
  });
  drawStarFlare(ctx, p.x, coreY, coreR * 1.35, 0.14, pal.primary, pal.core, alpha * 0.94, 0, 4);
}

/**
 * 15. Mending Aura — Ascending Double-Helix Recovery Ribbon
 * Dominant Hero: Smooth 36-segment analytical emerald-champagne double-helix ribbons
 *                spiraling gracefully upward around each ally, crowned by a crisp
 *                symmetrical 4-petal recovery emblem.
 * Supporting:    Calm concentric recovery ground ripples.
 */
function renderMendingAura(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const allies = resolvePoints(fx, bf, w, h, [{ x: fx.x, y: fx.y }]);

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.06, 0.36, 1);
    for (let wIdx = 0; wIdx < 2; wIdx += 1) {
      const wt = clamp01((t - wIdx * 0.15) / 0.85);
      if (wt <= 0) continue;
      const rx = (22 + easeOutCubic(wt) * 62) * richness * vs;
      drawEllipticalHalo(ctx, p.x, p.y, rx, rx * 0.48, {
        lineWidth: (1.7 - wIdx * 0.35) * vs,
        color: wIdx === 0 ? pal.primary : pal.secondary,
        coreColor: pal.core,
        alpha: (1 - wt) * 0.72,
      });
    }
    for (let i = 0; i < allies.length; i += 1) {
      drawSoftBloom(ctx, allies[i].x, allies[i].y, 22 * richness * vs, pal.core, pal.primary, alpha * 0.34, 0.5);
    }
    return;
  }

  // Sky layer — Dominant Hero: silky 36-segment analytical double-helix ribbons around allies
  const alpha = smoothWindow(t, 0.05, 0.32, 1);
  const climb = reduced ? 1 : easeOutCubic(Math.min(1, t * 1.35));
  const helixH = (36 + climb * 16) * richness * vs;

  for (let i = 0; i < allies.length; i += 1) {
    const ap = allies[i];
    if (!reduced) {
      for (let strand = 0; strand < 2; strand += 1) {
        const phase0 = strand * Math.PI + t * 3.8 + i * 0.8;
        drawAnalyticalRibbon(
          ctx,
          (u) => sampleHelixArc(ap.x, ap.y - 2 * vs, helixH, 12.5 * richness * vs, phase0, 1.15, u),
          {
            uStart: 0.04,
            uEnd: Math.min(1, 0.25 + climb * 0.75),
            steps: 36,
            maxWidth: 3.1 * richness * vs,
            color: strand === 0 ? pal.primary : pal.secondary,
            coreColor: pal.core,
            alpha: alpha * 0.82,
            taperProfile: 'spindle',
            coreRatio: 0.44,
          },
        );
      }
    }

    // Symmetrical 4-petal recovery crest blooming above each ally
    const crestY = ap.y - (24 + climb * 18) * vs;
    drawLotusCrest(ctx, ap.x, crestY, 9.5 * richness * vs, 9.5 * richness * vs, {
      petals: 4,
      rotation: Math.PI * 0.25,
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.9,
    });
  }
}

/**
 * 16. Starlight Catalyst — Celestial Constellation Ignition
 * Dominant Hero: Iconic crisp 8-point faceted white-gold starlight sigil hovering above
 *                the Ally Zone, linking allied units via truly straight hairline
 *                constellation segments with pinpoint diamond star nodes at every vertex.
 * Supporting:    Balanced 6-fold gold ground sigil + two sleek gently curving ascending arcs.
 */
function renderStarlightCatalyst(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const allies = resolvePoints(fx, bf, w, h, [{ x: fx.x, y: fx.y }]);

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.05, 0.34, 1);
    const grow = 0.34 + easeOutQuart(t) * 0.74;
    const rx = 68 * richness * vs * grow;
    const ry = rx * 0.48;
    drawSoftBloom(ctx, p.x, p.y, rx * 1.05, pal.core, pal.primary, alpha * 0.38, 0.48);
    drawSymmetricalSigilRing(ctx, p.x, p.y, rx, ry, {
      count: 6,
      arcFill: 0.56,
      rotation: reduced ? 0 : t * 0.7,
      lineWidth: 1.8 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.84,
      tickStyle: 'diamond',
      innerRingRatio: 0.66,
      innerAlpha: 0.42,
    });
    return;
  }

  // Sky layer — Dominant Hero: crisp 8-point starlight crest + razor-straight constellation lines
  const alpha = smoothWindow(t, 0.04, 0.3, 1);
  const cy = p.y - 24 * vs;
  const starScale = (28 + Math.sin(t * Math.PI) * 14) * richness * vs;
  const rot = reduced ? 0 : t * 0.35;

  // Truly straight delicate constellation line-segments linking allies cleanly
  if (allies.length >= 2) {
    const traceProgress = reduced ? 1 : easeOutCubic(Math.min(1, t * 2.0));
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < allies.length - 1; i += 1) {
      const a = allies[i];
      const b = allies[i + 1];
      const ex = a.x + (b.x - a.x) * traceProgress;
      const ey = (a.y - 18 * vs) + ((b.y - 18 * vs) - (a.y - 18 * vs)) * traceProgress;

      ctx.strokeStyle = withAlpha(pal.primary, alpha * 0.58);
      ctx.lineWidth = 2.0 * vs;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - 18 * vs);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      ctx.strokeStyle = withAlpha(pal.core, alpha * 0.88);
      ctx.lineWidth = 0.85 * vs;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - 18 * vs);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Two smooth mirror-symmetric ascending starlight ribbon arcs flanking the central star
  if (!reduced) {
    const rise = easeOutCubic(t) * 62 * richness * vs;
    for (const dir of [-1, 1]) {
      const p0 = { x: p.x + dir * 24 * vs, y: p.y - 4 * vs };
      const p1 = { x: p.x + dir * 40 * vs, y: p.y - 34 * vs - rise * 0.5 };
      const p2 = { x: p.x + dir * 16 * vs, y: p.y - 54 * vs - rise };
      drawAnalyticalRibbon(ctx, (u) => sampleQuadBezier(p0, p1, p2, u), {
        uStart: 0,
        uEnd: 1,
        steps: 32,
        maxWidth: 3.4 * richness * vs,
        color: pal.primary,
        coreColor: pal.core,
        alpha: alpha * 0.7,
        taperProfile: 'spindle',
        coreRatio: 0.45,
      });
    }
  }

  // Dominant 8-point faceted celestial starlight sigil
  drawStarFlare(ctx, p.x, cy, starScale, 0.13, pal.primary, pal.core, alpha * 0.96, rot, 4);
  drawStarFlare(ctx, p.x, cy, starScale * 0.68, 0.14, pal.secondary, pal.core, alpha * 0.88, rot + Math.PI * 0.25, 4);

  // Pinpoint star nodes on each linked ally
  for (let i = 0; i < allies.length; i += 1) {
    drawStarFlare(ctx, allies[i].x, allies[i].y - 18 * vs, 9.2 * richness * vs, 0.18, pal.primary, pal.core, alpha * 0.92, 0, 4);
  }
}

/**
 * 17. Cleanse Beacon — Sculpted Sanctuary Light Spire
 * Dominant Hero: Graceful tapered pearl-jade sanctuary spire curving cleanly into a
 *                feathered elliptical floor pedestal (zero flat `fillRect` cutoff),
 *                encircled by twin ascending purification halo rings.
 * Supporting:    Balanced 6-fold sanctuary floor sigil + rising halo rings on allies.
 */
function renderCleanseBeacon(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const allies = resolvePoints(fx, bf, w, h, [{ x: fx.x, y: fx.y }]);

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.06, 0.36, 1);
    const grow = 0.28 + easeOutQuart(t) * 0.88;
    const rx = 74 * richness * vs * grow;
    const ry = rx * 0.48;
    drawSoftBloom(ctx, p.x, p.y, rx * 1.05, pal.core, pal.primary, alpha * 0.36, 0.48);
    drawSymmetricalSigilRing(ctx, p.x, p.y, rx, ry, {
      count: 6,
      arcFill: 0.62,
      rotation: reduced ? 0 : t * 0.55,
      lineWidth: 1.8 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.84,
      tickStyle: 'diamond',
      innerRingRatio: 0.64,
      innerAlpha: 0.46,
    });
    return;
  }

  // Sky layer — Dominant Hero: sculpted flared sanctuary light spire + ascending purification rings
  const alpha = smoothWindow(t, 0.05, 0.3, 1);
  const topY = Math.max(-24, p.y - 250 * vs);
  const widthFade = 1 - t * 0.35;

  drawTaperedBeamSpire(ctx, p.x, p.y, topY, {
    baseWidth: 44 * richness * vs * widthFade,
    topWidth: 14 * richness * vs * widthFade,
    color: pal.primary,
    secondaryColor: pal.secondary,
    coreColor: pal.core,
    alpha: alpha * 0.92,
    mode: 'spire',
  });

  // Twin symmetrical purification halo rings ascending smoothly up the spire
  const ringCount = tier >= 2 ? 3 : 2;
  for (let r = 0; r < ringCount; r += 1) {
    const rt = clamp01((t - r * 0.14) / 0.82);
    if (rt <= 0) continue;
    const riseY = p.y - (8 + (reduced ? 30 + r * 24 : easeOutCubic(rt) * 145)) * vs;
    const ringRx = (32 - rt * 10) * richness * vs;
    drawEllipticalHalo(ctx, p.x, riseY, ringRx, ringRx * 0.34, {
      lineWidth: 1.8 * vs,
      color: r % 2 === 0 ? pal.primary : pal.accent,
      coreColor: pal.core,
      alpha: smoothWindow(rt, 0.08, 0.45, 1) * 0.88,
    });
  }

  // Clean purifying ring + top star glint rising over each cleansed ally
  for (let i = 0; i < allies.length; i += 1) {
    const ap = allies[i];
    const rise = (reduced ? 18 : 6 + easeOutCubic(t) * 32) * vs;
    drawEllipticalHalo(ctx, ap.x, ap.y - rise, 15 * richness * vs, 6.5 * richness * vs, {
      lineWidth: 1.5 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.78,
    });
    drawStarFlare(ctx, ap.x, ap.y - rise - 8 * vs, 7.5 * richness * vs, 0.18, pal.accent, pal.core, alpha * 0.88, 0, 4);
  }
}

/**
 * 18. Haste Relay — Aero-Velocity Chrono Chevrons
 * Dominant Hero: Crisp unit-anchored paired symmetrical azure-gold velocity chevrons (»)
 *                and razor-straight horizontal tailwind needle-streaks snapping cleanly
 *                across each ally, paired with briskly spinning 4-tick chrono foot-dials.
 * Supporting:    Compact velocity ring beneath each hastened ally.
 */
function renderHasteRelay(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const allies = resolvePoints(fx, bf, w, h, [{ x: fx.x, y: fx.y }]);

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.05, 0.34, 1);
    for (let i = 0; i < allies.length; i += 1) {
      const ap = allies[i];
      const rx = (18 + easeOutCubic(t) * 10) * richness * vs;
      drawSymmetricalSigilRing(ctx, ap.x, ap.y, rx, rx * 0.48, {
        count: 4,
        arcFill: 0.52,
        rotation: reduced ? 0 : t * 3.2 + i * 0.6,
        lineWidth: 1.6 * vs,
        color: pal.primary,
        coreColor: pal.core,
        alpha: alpha * 0.8,
        tickStyle: 'radial',
        tickLength: 0.18,
      });
    }
    return;
  }

  // Sky layer — Dominant Hero: crisp paired aero-chevrons + straight tailwind needle-streaks per ally
  const alpha = smoothWindow(t, 0.04, 0.28, 1);
  const slide = reduced ? 0 : easeOutCubic(t) * 28 * vs;

  for (let i = 0; i < allies.length; i += 1) {
    const ap = allies[i];
    const cy = ap.y - 15 * vs;

    // Leading + trailing pair of exact symmetrical beveled aero-chevrons
    drawPrecisionChevron(ctx, ap.x + 4 * vs + slide * 0.55, cy, 0, {
      halfHeight: 16 * richness * vs,
      depth: 10.5 * richness * vs,
      thickness: 3.4 * richness * vs,
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.92,
    });
    drawPrecisionChevron(ctx, ap.x - 10 * vs + slide * 0.42, cy, 0, {
      halfHeight: 12.5 * richness * vs,
      depth: 8.5 * richness * vs,
      thickness: 2.6 * richness * vs,
      color: pal.secondary,
      secondaryColor: pal.accent,
      coreColor: pal.core,
      alpha: alpha * 0.7,
    });

    // Razor-straight horizontal tailwind needle streaks
    if (!reduced) {
      drawTaperedNeedle(ctx, ap.x - 36 * vs + slide * 0.25, cy - 8 * vs, ap.x + 22 * vs + slide * 0.78, cy - 8 * vs, {
        width: 2.6 * vs,
        color: pal.primary,
        coreColor: pal.core,
        alpha: alpha * 0.84,
        peakRatio: 0.72,
      });
      drawTaperedNeedle(ctx, ap.x - 28 * vs + slide * 0.2, cy + 7 * vs, ap.x + 26 * vs + slide * 0.72, cy + 7 * vs, {
        width: 2.1 * vs,
        color: pal.secondary,
        coreColor: pal.core,
        alpha: alpha * 0.74,
        peakRatio: 0.72,
      });
    }
  }
}

// ============================================================================
// Dispatcher
// ============================================================================

const RENDERERS = Object.freeze({
  fx_astral_nova: renderAstralNova,
  fx_sanctuary_wave: renderSanctuaryWave,
  fx_stasis_pulse: renderStasisPulse,
  fx_orbital_lance: renderOrbitalLance,
  fx_gravity_vortex: renderGravityVortex,
  fx_chain_lightning: renderChainLightning,
  fx_full_assault: renderFullAssault,
  fx_focus_fire: renderFocusFire,
  fx_emergency_defense: renderEmergencyDefense,
  fx_flank_maneuver: renderFlankManeuver,
  fx_siege_formation: renderSiegeFormation,
  fx_suppressive_volley: renderSuppressiveVolley,
  fx_aegis_blessing: renderAegisBlessing,
  fx_overclock_core: renderOverclockCore,
  fx_mending_aura: renderMendingAura,
  fx_starlight_catalyst: renderStarlightCatalyst,
  fx_cleanse_beacon: renderCleanseBeacon,
  fx_haste_relay: renderHasteRelay,
});

export function isNonUnitWorldEffect(kind) {
  return NON_UNIT_WORLD_FX_KINDS.has(kind);
}

export function drawNonUnitWorldEffect(ctx, bf, w, h, fx, layer) {
  const fn = RENDERERS[fx?.kind];
  if (!fn) return false;
  const profile = PROFILE_BY_WORLD_KIND.get(fx.kind);
  const pal = profile?.palette || {
    primary: fx.color || '#38bdf8',
    secondary: fx.secondaryColor || '#f5d37a',
    accent: '#fef08a',
    core: '#fffdf4',
    glow: fx.color || '#7dd3fc',
    ribbon: '#ffffff',
    spark: '#fef3c7',
  };
  const t = clamp01(fx.age / Math.max(0.05, fx.duration || 0.9));
  const p = bf.worldToScreen(fx.x, fx.y, w, h);
  const reduced = Boolean(
    fx.reducedMotion ||
      (typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  );

  ctx.save();
  fn(ctx, bf, w, h, fx, layer, t, p, pal, reduced);
  ctx.restore();
  return true;
}
