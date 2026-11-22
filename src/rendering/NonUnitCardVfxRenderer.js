/**
 * NonUnitCardVfxRenderer — Multi-layered anime-fantasy battlefield VFX renderer
 * for ALL 18 non-Unit cards in Star Struck (6 Skill, 6 Tactic, 6 Support).
 *
 * Strictly scoped to non-Unit card effects (`fx_*`). Unit cards are untouched.
 *
 * Round 2 Artistic Enrichment Standards:
 * - Preserves Round 1's exact geometric precision: mirror-symmetrical arrows &
 *   chevrons, sculpted tapered lances & spires, balanced N-fold sigils, and silky
 *   analytical Bezier/spiral/helix ribbons.
 * - Deliberate 4-phase choreography on every card:
 *     1. Anticipation (atmospheric pool, sigil ignition, gathering cues)
 *     2. Build-up (converging trails, charging energy, motion escalation)
 *     3. Peak / Release (hero focal composition, layered bursts, shockwave ripples,
 *        localized arena lighting — synchronized with AnimationManager camera impulses)
 *     4. Dissipation (natural particle dispersal, lingering trails, graceful fade-out)
 * - Astral Nova serves as the celestial reference showcase (3-tier parallax starfield,
 *   smooth curved orbital stardust trails, multi-layer starburst + radial rays +
 *   spatial waves, temporary celestial nebula depth, natural dispersal).
 * - Distinct artistic identity for all other 17 cards (zero cloning across cards).
 * - Battlefield readability preserved: translucent atmospheric depth never obscures
 *   living units or health bars.
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
  drawNebulaAtmosphere,
  drawAmbientGroundLight,
  drawShockwaveRipple,
  drawStarfieldLayer,
  drawLuminousTrailParticles,
  drawArtisticParticles,
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
    Array.isArray(fx.targets) && fx.targets.length > 0
      ? fx.targets
      : Array.isArray(fx.points) && fx.points.length > 0
        ? fx.points
        : fallbackWorldPoints;
  return raw.slice(0, 7).map((pt) => bf.worldToScreen(pt.x, pt.y, w, h));
}

function getWorldRadii(fx, p, fallbackWorldR = 16) {
  const r = fx.radius || fallbackWorldR;
  const rx = r * (p.scaleX || p.scale * 1.15 || 8.5);
  const ry = r * (p.scaleY || p.scale * 0.56 || 4.1);
  return { rx, ry };
}

// ============================================================================
// A. SKILL CARDS (6) — High-Spectacle 4-Phase Choreography
// ============================================================================

/**
 * 1. Astral Nova — Reference Celestial Event Showcase
 *   Phase 1 Anticipation (0.00–0.22): Temporary localized celestial nebula pools on
 *     the battlefield; 3-tier parallax starfield begins converging; astrolabe ground
 *     sigil traces open.
 *   Phase 2 Build-up (0.16–0.36): 4 smooth curved orbital celestial trails spiral
 *     inward carrying luminous moving stardust & occasional star glints; singularity
 *     core compresses into a blinding white-gold seed.
 *   Phase 3 Peak Burst (0.35–0.68): Synchronized with camera impulse — radiant
 *     white-gold detonation flash, 12 delicate alternating long/short radial rays,
 *     multi-layer 8-point + 4-point celestial starburst, dual expanding translucent
 *     spatial shockwave ripples, localized battlefield floor illumination.
 *   Phase 4 Dissipation (0.60–1.00): Natural radial star dispersal with trailing
 *     starlight streaks, soft nebula lift, lingering twinkling stellar glints.
 */
function renderAstralNova(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const { rx, ry } = getWorldRadii(fx, p, 22);
  const peakT = 0.35;
  const seed = fx.seed || 701;

  const baseRx = Math.min(Math.max(rx, 96 * vs), 156 * vs) * richness;
  const baseRy = baseRx * 0.5;

  if (layer === 'ground') {
    const nebulaEnv = smoothWindow(t, 0.14, 0.54, 1);
    const sigilEnv = smoothWindow(t, 0.08, 0.56, 1);
    const preRatio = clamp01(t / peakT);
    const postRatio = clamp01((t - peakT) / (1 - peakT));

    // Environmental Depth: temporary localized celestial nebula atmosphere (keeps units visible)
    drawNebulaAtmosphere(ctx, p.x, p.y, baseRx * (1.05 + postRatio * 0.32), baseRy * (1.12 + postRatio * 0.28), {
      innerColor: pal.primary,
      midColor: '#1e3a8a',
      outerColor: '#090e24',
      accentColor: pal.secondary,
      alpha: nebulaEnv * 0.58,
      rotation: reduced ? 0 : t * 0.4,
      lobes: 4,
    });

    // Localized battlefield floor illumination peaking sharply at Nova Release
    const floorLight = t < peakT ? 0.24 + preRatio * 0.38 : Math.pow(1 - postRatio, 1.4) * 0.92;
    drawAmbientGroundLight(
      ctx,
      p.x,
      p.y,
      baseRx * (0.72 + postRatio * 0.65),
      baseRy * (0.72 + postRatio * 0.65),
      {
        color: pal.primary,
        secondaryColor: pal.accent,
        coreColor: pal.core,
        alpha: floorLight * 0.72,
      },
    );

    // 8-fold celestial astrolabe ground sigil (contracts slightly before release, then expands)
    const sigilScale =
      t < peakT
        ? 0.42 + easeOutCubic(preRatio) * 0.42 - Math.pow(preRatio, 3) * 0.12
        : 0.72 + easeOutQuart(postRatio) * 0.48;

    drawSymmetricalSigilRing(ctx, p.x, p.y, baseRx * 0.88 * sigilScale, baseRy * 0.88 * sigilScale, {
      count: 8,
      arcFill: 0.62,
      rotation: reduced ? 0 : t * 0.68,
      lineWidth: 1.9 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: sigilEnv * 0.84,
      tickStyle: 'compass',
      tickLength: 0.14,
      innerRingRatio: 0.72,
      innerAlpha: 0.44,
    });

    drawSymmetricalSigilRing(ctx, p.x, p.y, baseRx * 0.48 * sigilScale, baseRy * 0.48 * sigilScale, {
      count: 4,
      arcFill: 0.54,
      rotation: reduced ? Math.PI * 0.25 : -t * 1.15,
      lineWidth: 1.35 * vs,
      color: pal.accent,
      coreColor: pal.core,
      alpha: sigilEnv * (tier >= 2 ? 0.78 : 0.62),
      tickStyle: 'diamond',
    });

    // Ground spatial shockwave ripples expanding from peak release
    if (t >= peakT - 0.02) {
      const wt1 = clamp01((t - peakT) / (1 - peakT));
      if (wt1 > 0 && wt1 < 1) {
        const wScale = 0.24 + easeOutQuart(wt1) * 1.18;
        drawShockwaveRipple(ctx, p.x, p.y, baseRx * wScale, baseRy * wScale, {
          width: (5.6 - wt1 * 3.4) * richness * vs,
          color: pal.primary,
          secondaryColor: pal.accent,
          coreColor: pal.core,
          alpha: Math.pow(1 - wt1, 1.3) * 0.88,
        });
      }
      const wt2 = clamp01((t - (peakT + 0.08)) / (1 - (peakT + 0.08)));
      if (wt2 > 0 && wt2 < 1) {
        const wScale2 = 0.18 + easeOutCubic(wt2) * 1.02;
        drawShockwaveRipple(ctx, p.x, p.y, baseRx * wScale2, baseRy * wScale2, {
          width: (3.8 - wt2 * 2.2) * richness * vs,
          color: pal.secondary,
          secondaryColor: pal.accent,
          coreColor: pal.core,
          alpha: Math.pow(1 - wt2, 1.4) * 0.72,
        });
      }
    }
    return;
  }

  // SKY LAYER — Coordinated Multi-Layer Celestial Spectacle
  const cy = p.y - 20 * vs;
  const preRatio = clamp01(t / peakT);
  const postRatio = clamp01((t - peakT) / (1 - peakT));
  const fieldRx = baseRx * 1.28;
  const fieldRy = baseRx * 0.72;

  // Layer 1: Subtle vertical celestial twilight veil behind starburst (keeps units clear)
  const skyNebulaAlpha = smoothWindow(t, 0.12, 0.5, 1) * 0.34;
  drawNebulaAtmosphere(ctx, p.x, cy, fieldRx * 0.85, fieldRy * 0.85, {
    innerColor: pal.primary,
    midColor: '#1d4ed8',
    outerColor: '#0c1230',
    accentColor: pal.secondary,
    alpha: skyNebulaAlpha,
    rotation: reduced ? 0 : -t * 0.3,
    lobes: 3,
  });

  // Layer 2: Multi-depth Parallax Starfield (converges during 0..0.35, disperses with trails during 0.35..1.0)
  drawStarfieldLayer(ctx, p.x, cy, fieldRx, fieldRy, {
    count: 46 + tier * 8,
    t,
    phaseSplit: peakT,
    seed: seed + 17,
    colors: [pal.glow, pal.accent, pal.spark, pal.core, pal.primary],
    coreColor: pal.core,
    alpha: 0.96,
    vs,
    reduced,
    mode: 'converge_disperse',
  });

  // Layer 3: Curved Orbital Celestial Trails with moving luminous stardust & bright star glints
  const trailEnv = smoothWindow(t, 0.08, 0.44, 0.82);
  if (trailEnv > 0.02) {
    const orbitCount = tier >= 3 ? 4 : 3;
    const baseSpin = reduced ? 0 : t * 2.4;
    for (let i = 0; i < orbitCount; i += 1) {
      const startA = baseSpin + (i * Math.PI * 2) / orbitCount + 0.3;
      const outerR = baseRx * (t < peakT ? 1.18 - preRatio * 0.32 : 0.86 + easeOutCubic(postRatio) * 0.42);
      const innerR = Math.max(10 * vs, baseRx * (t < peakT ? 0.16 : 0.24 + postRatio * 0.25));
      const tiltRy = 0.48 + (i % 2) * 0.14;
      const span = Math.PI * 1.18;
      const sampleFn = (u) => sampleLogSpiral(p.x, cy, outerR, innerR, startA, span, tiltRy, u);

      const uEnd = t < peakT ? 0.15 + easeOutCubic(preRatio) * 0.85 : 1;
      const uStart = t < peakT ? 0.02 : clamp01(postRatio * 0.72);
      if (uEnd > uStart + 0.04) {
        drawAnalyticalRibbon(ctx, sampleFn, {
          uStart,
          uEnd,
          steps: 40,
          maxWidth: (3.8 - (i % 2) * 0.6) * richness * vs,
          color: i % 2 === 0 ? pal.primary : pal.accent,
          coreColor: pal.core,
          alpha: trailEnv * (t < peakT ? 0.86 : 0.62),
          taperProfile: 'comet',
          coreRatio: 0.44,
          glowAlpha: 0.2,
        });

        // Moving luminous stardust & occasional crisp 4-point star glints gliding along the orbit
        drawLuminousTrailParticles(ctx, sampleFn, {
          uStart,
          uEnd,
          count: 10 + tier * 2,
          t: t * 1.6,
          seed: seed + 101 + i * 37,
          color: i % 2 === 0 ? pal.glow : pal.spark,
          secondaryColor: pal.accent,
          coreColor: pal.core,
          alpha: trailEnv * 0.92,
          vs,
          scatter: 4.5,
          glintEvery: 4,
        });
      }
    }
  }

  // Layer 4: Pre-release Compressing Singularity Seed (Anticipation & Build-up)
  if (t < peakT + 0.08) {
    const chargeEnv = t < peakT ? easeInOutQuad(preRatio) : Math.max(0, 1 - (t - peakT) / 0.08);
    const seedR = (10 + chargeEnv * 18) * richness * vs;
    drawSoftBloom(ctx, p.x, cy, seedR * 2.2, pal.core, pal.accent, chargeEnv * 0.78);
    drawEllipticalHalo(ctx, p.x, cy, seedR * (1.7 - chargeEnv * 0.65), seedR * (1.7 - chargeEnv * 0.65) * 0.56, {
      lineWidth: 1.8 * vs,
      color: pal.accent,
      coreColor: pal.core,
      alpha: chargeEnv * 0.86,
    });
    drawStarFlare(
      ctx,
      p.x,
      cy,
      seedR * 1.35,
      0.16,
      pal.accent,
      pal.core,
      chargeEnv * 0.96,
      reduced ? 0 : t * 2.8,
      4,
    );
  }

  // Layer 5: NOVA BURST PEAK & GRACEFUL DISSIPATION (t >= peakT - 0.02)
  if (t >= peakT - 0.02) {
    const bt = clamp01((t - (peakT - 0.02)) / (1 - (peakT - 0.02)));
    const burstAlpha = smoothWindow(bt, 0.05, 0.2, 0.92);
    const flashPeak = Math.pow(Math.max(0, 1 - bt * 2.85), 1.5);
    const baseRot = reduced ? 0 : bt * 0.34;

    // Bright white-gold central flash & luminous corona
    if (flashPeak > 0.015) {
      drawSoftBloom(ctx, p.x, cy, (76 + bt * 38) * richness * vs, pal.core, pal.accent, flashPeak * 0.94);
      drawSoftBloom(ctx, p.x, cy, (44 + bt * 18) * richness * vs, '#ffffff', pal.secondary, flashPeak * 0.78);
    }

    // 12 delicate alternating long/short tapered radial starburst rays
    const rayCount = 12;
    const rayGrow = easeOutQuart(Math.min(1, bt * 1.75));
    const rayInner = (8 + bt * 28) * vs;
    for (let i = 0; i < rayCount; i += 1) {
      const a = baseRot + (i * Math.PI * 2) / rayCount;
      const isMajor = i % 3 === 0;
      const isMid = i % 3 === 1;
      const rayLen = (isMajor ? 88 : isMid ? 60 : 40) * richness * vs * rayGrow;
      const x1 = p.x + Math.cos(a) * rayInner;
      const y1 = cy + Math.sin(a) * rayInner * 0.76;
      const x2 = p.x + Math.cos(a) * (rayInner + rayLen);
      const y2 = cy + Math.sin(a) * (rayInner + rayLen) * 0.76;
      drawTaperedNeedle(ctx, x1, y1, x2, y2, {
        width: (isMajor ? 4.2 : isMid ? 2.6 : 1.7) * richness * vs * (1 - bt * 0.45),
        color: isMajor ? pal.primary : isMid ? pal.accent : pal.secondary,
        coreColor: pal.core,
        alpha: burstAlpha * (isMajor ? 0.94 : isMid ? 0.8 : 0.64),
        peakRatio: 0.3,
      });
    }

    // Multi-layer expanding translucent energy waves in vertical plane
    const waveR1 = (18 + easeOutQuart(bt) * 86) * richness * vs;
    drawShockwaveRipple(ctx, p.x, cy, waveR1, waveR1 * 0.52, {
      width: (4.4 - bt * 2.6) * richness * vs,
      color: pal.primary,
      secondaryColor: pal.accent,
      coreColor: pal.core,
      alpha: Math.pow(1 - bt, 1.35) * 0.85,
      rotation: -0.14,
    });

    if (bt > 0.08) {
      const bt2 = clamp01((bt - 0.08) / 0.92);
      const waveR2 = (14 + easeOutCubic(bt2) * 72) * richness * vs;
      drawEllipticalHalo(ctx, p.x, cy, waveR2, waveR2 * 0.58, {
        lineWidth: (2.2 - bt2 * 1.2) * vs,
        color: pal.secondary,
        coreColor: pal.core,
        alpha: Math.pow(1 - bt2, 1.5) * 0.72,
        rotation: 0.2,
      });
    }

    // Dominant multi-point faceted celestial starburst (8-point + offset 4-point warm gold crest)
    const starR = (38 + easeOutQuart(bt) * 34) * richness * vs * (1 - bt * 0.22);
    drawStarFlare(ctx, p.x, cy, starR, 0.13, pal.primary, pal.core, burstAlpha * 0.98, baseRot, 4);
    drawStarFlare(
      ctx,
      p.x,
      cy,
      starR * 0.74,
      0.15,
      pal.accent,
      pal.core,
      burstAlpha * 0.92,
      baseRot + Math.PI * 0.25,
      4,
    );
    drawStarFlare(
      ctx,
      p.x,
      cy,
      starR * 0.42,
      0.2,
      pal.secondary,
      '#ffffff',
      burstAlpha * 0.88,
      -baseRot * 1.4,
      8,
    );

    // Distinct orbiting 4-point hero stellar glints dispersing cleanly around the burst
    const glintCount = 6 + tier * 2;
    for (let g = 0; g < glintCount; g += 1) {
      const ga = baseRot * 1.2 + (g * Math.PI * 2) / glintCount + 0.22;
      const gDist = (26 + easeOutQuart(bt) * (66 + (g % 3) * 16)) * richness * vs;
      const gx = p.x + Math.cos(ga) * gDist;
      const gy = cy + Math.sin(ga) * gDist * 0.56;
      const gAlpha = Math.pow(1 - bt, 1.2) * (0.65 + 0.35 * Math.sin(bt * 16 + g));
      drawStarFlare(
        ctx,
        gx,
        gy,
        (6.8 + (g % 2) * 3.4) * vs * (1 - bt * 0.35),
        0.16,
        g % 2 === 0 ? pal.accent : pal.glow,
        pal.core,
        gAlpha,
        ga * 0.4,
        4,
      );
    }
  }
}

/**
 * 2. Sanctuary Wave — Restorative Lotus Tide (4-Phase Serenity)
 *   Anticipation: Soft emerald dew pool & gentle floor light.
 *   Build-up: Unfurling 6-petal lotus crest + rising translucent emerald-gold mist petals.
 *   Peak: Sweeping translucent crescent sanctuary tides with sunlit dew motes + ally blooms.
 *   Dissipation: Gently drifting luminous petals & calm concentric water-light ripples.
 */
function renderSanctuaryWave(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const allies = resolvePoints(fx, bf, w, h, [{ x: fx.x, y: fx.y }]);
  const { rx } = getWorldRadii(fx, p, 22);
  const seed = fx.seed || 202;

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.1, 0.46, 1);
    const unfurl = 0.24 + easeOutCubic(Math.min(1, t * 1.45)) * 0.82;
    const lotusRx = Math.min(rx, 92 * vs) * richness * unfurl;
    const lotusRy = lotusRx * 0.48;

    drawAmbientGroundLight(ctx, p.x, p.y, lotusRx * 1.32, lotusRy * 1.32, {
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.58,
    });

    // Dominant Ground Hero: exact 6-petal symmetrical lotus crest
    drawLotusCrest(ctx, p.x, p.y, lotusRx, lotusRy, {
      petals: 6,
      rotation: reduced ? 0 : t * 0.38,
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.88,
    });

    // Three staggered calm expanding water-light ripples
    for (let ring = 0; ring < 3; ring += 1) {
      const rt = clamp01((t - ring * 0.15) / 0.82);
      if (rt <= 0) continue;
      const rGrow = 0.38 + easeOutCubic(rt) * 0.92;
      drawEllipticalHalo(ctx, p.x, p.y, lotusRx * 1.15 * rGrow, lotusRy * 1.15 * rGrow, {
        lineWidth: (2.0 - ring * 0.35) * vs,
        color: ring % 2 === 0 ? pal.primary : pal.secondary,
        coreColor: pal.core,
        alpha: Math.pow(1 - rt, 1.35) * 0.68,
      });
    }
    return;
  }

  // Sky layer — Crescent sanctuary tides + sunlit dew stardust + floating petals
  const alpha = smoothWindow(t, 0.12, 0.42, 1);
  const spanX = 104 * richness * vs;
  const riseBase = (reduced ? 22 : 4 + easeOutCubic(t) * 52) * vs;
  const waveCount = tier >= 3 ? 3 : 2;

  // Soft sunlit sanctuary haze above lotus
  drawNebulaAtmosphere(ctx, p.x, p.y - 24 * vs, spanX * 0.9, 54 * vs, {
    innerColor: pal.primary,
    midColor: '#065f46',
    outerColor: '#042f2e',
    accentColor: pal.secondary,
    alpha: alpha * 0.34,
    lobes: 3,
  });

  for (let i = 0; i < waveCount; i += 1) {
    const wt = clamp01((t - 0.08 - i * 0.11) / 0.84);
    if (wt <= 0) continue;
    const wAlpha = smoothWindow(wt, 0.14, 0.38, 1);
    const yLift = riseBase + i * 16 * vs;
    const spread = spanX * (0.68 + easeOutCubic(wt) * 0.48);
    const p0 = { x: p.x - spread, y: p.y - yLift + 14 * vs };
    const p1 = { x: p.x - spread * 0.38, y: p.y - yLift - 28 * vs };
    const p2 = { x: p.x + spread * 0.38, y: p.y - yLift - 28 * vs };
    const p3 = { x: p.x + spread, y: p.y - yLift + 14 * vs };
    const sampleFn = (u) => sampleCubicBezier(p0, p1, p2, p3, u);

    drawAnalyticalRibbon(ctx, sampleFn, {
      uStart: 0,
      uEnd: 1,
      steps: 40,
      maxWidth: (5.6 - i * 1.1) * richness * vs,
      color: i === 0 ? pal.primary : pal.secondary,
      coreColor: pal.core,
      alpha: wAlpha * (1 - i * 0.16) * 0.88,
      taperProfile: 'crescent',
      coreRatio: 0.46,
    });

    drawLuminousTrailParticles(ctx, sampleFn, {
      uStart: 0.06,
      uEnd: 0.94,
      count: 10,
      t: wt,
      seed: seed + i * 29,
      color: pal.glow,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: wAlpha * 0.86,
      vs,
      scatter: 5.5,
      glintEvery: 5,
    });
  }

  // Rising luminous emerald-gold petals throughout Peak & Dissipation
  drawArtisticParticles(ctx, p.x, p.y - 6 * vs, spanX * 0.78, 48 * vs, {
    count: 18 + tier * 4,
    t,
    seed: seed + 91,
    shape: 'petal',
    motion: 'rise',
    color: pal.primary,
    secondaryColor: pal.secondary,
    coreColor: pal.core,
    alpha: 0.88,
    vs,
    reduced,
  });

  // Gentle restorative halo + diamond motes on healed allies
  for (let i = 0; i < allies.length; i += 1) {
    const ap = allies[i];
    const lift = (reduced ? 18 : 8 + easeOutCubic(t) * 34) * vs;
    drawSoftBloom(ctx, ap.x, ap.y - 14 * vs, 20 * vs, pal.core, pal.primary, alpha * 0.36);
    drawDiamondPrism(ctx, ap.x, ap.y - lift, 4.4 * vs, 6.4 * vs, 0, {
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.84,
    });
  }
}

/**
 * 3. Stasis Pulse — Crystalline Timepiece Lock (4-Phase Chrono Freeze)
 *   Anticipation: Amethyst temporal dim & 12-hour chrono dial ignites.
 *   Build-up: Clock hands sweep briskly while crystalline time-dust converges inward.
 *   Peak (t ≈ 0.34): Crisp freeze detent — hands halt, 4 beveled crystal pylons lock in,
 *     prismatic glass shockwave ripple & radial refraction glint fire (synced with impulse).
 *   Dissipation: Suspended amethyst frost-shards drift & dissolve gracefully.
 */
function renderStasisPulse(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const { rx } = getWorldRadii(fx, p, 20);
  const dialRx = Math.min(rx, 94 * vs) * richness;
  const dialRy = dialRx * 0.48;
  const lockAt = 0.34;
  const seed = fx.seed || 303;

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.08, 0.5, 1);
    const snap = 0.42 + easeOutQuart(Math.min(1, t / lockAt)) * 0.58;
    const curRx = dialRx * snap;
    const curRy = dialRy * snap;

    drawNebulaAtmosphere(ctx, p.x, p.y, curRx * 1.24, curRy * 1.24, {
      innerColor: pal.primary,
      midColor: '#3b0764',
      outerColor: '#120826',
      accentColor: pal.accent,
      alpha: alpha * 0.48,
      lobes: 3,
    });
    drawAmbientGroundLight(ctx, p.x, p.y, curRx * 1.05, curRy * 1.05, {
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.5,
    });

    // Precision 12-hour timepiece ring
    drawSymmetricalSigilRing(ctx, p.x, p.y, curRx, curRy, {
      count: 12,
      arcFill: 0.58,
      rotation: -Math.PI * 0.5,
      lineWidth: 1.8 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.88,
      tickStyle: 'radial',
      tickLength: 0.14,
      innerRingRatio: 0.74,
      innerAlpha: 0.5,
    });

    // Sweeping chrono clock hands that decelerate and snap-freeze at lockAt
    const freezePhase = easeOutQuart(Math.min(1, t / lockAt));
    const minuteA = -Math.PI * 0.5 + (reduced ? 0.6 : freezePhase * Math.PI * 1.5);
    const hourA = -Math.PI * 0.5 + (reduced ? -0.8 : -freezePhase * Math.PI * 0.5);

    drawTaperedNeedle(
      ctx,
      p.x,
      p.y,
      p.x + Math.cos(minuteA) * curRx * 0.72,
      p.y + Math.sin(minuteA) * curRy * 0.72,
      { width: 2.9 * vs, color: pal.accent, coreColor: pal.core, alpha: alpha * 0.94, peakRatio: 0.22 },
    );
    drawTaperedNeedle(
      ctx,
      p.x,
      p.y,
      p.x + Math.cos(hourA) * curRx * 0.48,
      p.y + Math.sin(hourA) * curRy * 0.48,
      { width: 3.5 * vs, color: pal.primary, coreColor: pal.core, alpha: alpha * 0.9, peakRatio: 0.25 },
    );

    // Freeze lock ground ripple
    if (t >= lockAt) {
      const ft = clamp01((t - lockAt) / (1 - lockAt));
      const rGrow = 0.45 + easeOutQuart(ft) * 0.95;
      drawShockwaveRipple(ctx, p.x, p.y, dialRx * rGrow, dialRy * rGrow, {
        width: (4.4 - ft * 2.8) * vs,
        color: pal.primary,
        secondaryColor: pal.accent,
        coreColor: pal.core,
        alpha: Math.pow(1 - ft, 1.35) * 0.82,
      });
    }
    return;
  }

  // Sky layer — Build-up converging chrono-dust -> Peak crystal pylon snap & refraction -> Dissipation suspended shards
  const alpha = smoothWindow(t, 0.08, 0.46, 1);
  const cy = p.y - 22 * vs;

  if (t < lockAt + 0.06) {
    drawArtisticParticles(ctx, p.x, cy, dialRx * 1.05, 58 * vs, {
      count: 16,
      t: clamp01(t / (lockAt + 0.06)),
      seed: seed + 13,
      shape: 'diamond',
      motion: 'converge',
      color: pal.secondary,
      secondaryColor: pal.accent,
      coreColor: pal.core,
      alpha: 0.82,
      vs,
      reduced,
    });
  }

  const lockIn = easeOutBackClamped(Math.min(1, t / lockAt), 0.75);
  const orbitRx = (76 - lockIn * 16) * richness * vs;
  const orbitRy = (48 - lockIn * 9) * richness * vs;

  // Prismatic freeze shockwave at lock moment
  if (t >= lockAt - 0.02) {
    const ft = clamp01((t - (lockAt - 0.02)) / (1 - (lockAt - 0.02)));
    const pulseR = (20 + easeOutQuart(ft) * 76) * richness * vs;
    drawShockwaveRipple(ctx, p.x, cy, pulseR, pulseR * 0.5, {
      width: (3.8 - ft * 2.2) * vs,
      color: pal.secondary,
      secondaryColor: pal.accent,
      coreColor: pal.core,
      alpha: Math.pow(1 - ft, 1.35) * 0.78,
    });

    const detentFlash = Math.max(0, 1 - ft * 3.4);
    if (detentFlash > 0.02) {
      drawSoftBloom(ctx, p.x, cy, 48 * richness * vs, pal.core, pal.secondary, detentFlash * 0.72);
    }

    // Suspended frost-crystal shards drifting softly during dissipation
    drawArtisticParticles(ctx, p.x, cy, dialRx * 0.92, 54 * vs, {
      count: 14 + tier * 3,
      t: ft,
      seed: seed + 59,
      shape: 'shard',
      motion: 'radial',
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: 0.84,
      vs,
      reduced,
    });
  }

  // 4 cleanly separated cardinal crystal pylons
  const prismSpecs = [
    { x: -orbitRx, y: 0, rx: 8.4, ry: 15.6, a: 0.94 },
    { x: orbitRx, y: 0, rx: 8.4, ry: 15.6, a: 0.94 },
    { x: 0, y: -orbitRy * 0.62, rx: 6.4, ry: 12.0, a: 0.82 },
    { x: 0, y: orbitRy * 0.52, rx: 7.0, ry: 13.0, a: 0.88 },
  ];
  for (let i = 0; i < prismSpecs.length; i += 1) {
    const ps = prismSpecs[i];
    drawDiamondPrism(ctx, p.x + ps.x, cy + ps.y, ps.rx * richness * vs, ps.ry * richness * vs, 0, {
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * ps.a,
    });
  }

  // Central stasis apex diamond star
  const apexPulse = t >= lockAt ? 1 + Math.max(0, 1 - (t - lockAt) * 4) * 0.6 : 0.7 + (t / lockAt) * 0.3;
  drawStarFlare(ctx, p.x, cy, 14 * richness * vs * apexPulse, 0.18, pal.accent, pal.core, alpha * 0.96, 0, 4);
}

/**
 * 4. Orbital Lance — Precision Sky-to-Ground Celestial Spear (4-Phase Strike)
 *   Anticipation (0.00–0.16): Ground orbital lock reticle tightens & golden dust gathers.
 *   Build-up (0.10–0.22): Descending orbital alignment rings + high-altitude lance plunge.
 *   Peak (0.20–0.58): Lance slams down (synced with downward camera impulse), warm floor
 *     illumination, spatial shockwave ripple, twin curved shock-crescents, impact starburst.
 *   Dissipation (0.55–1.00): Narrowing incandescent filament + rising embers & vertical needles.
 */
function renderOrbitalLance(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const impactT = 0.20;
  const seed = fx.seed || 404;

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.04, 0.44, 1);
    const lockShrink = 1.32 - easeOutQuart(Math.min(1, t / impactT)) * 0.52;
    const postT = clamp01((t - impactT) / (1 - impactT));
    const blastGrow = 0.54 + easeOutQuart(postT) * 0.86;
    const rx = 62 * richness * vs * (t < impactT ? lockShrink : blastGrow);
    const ry = rx * 0.48;

    drawAmbientGroundLight(ctx, p.x, p.y, rx * 1.4, ry * 1.4, {
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: (t < impactT ? 0.36 : Math.pow(1 - postT, 1.25) * 0.9) * 0.72,
    });

    drawSymmetricalSigilRing(ctx, p.x, p.y, rx, ry, {
      count: 4,
      arcFill: 0.58,
      rotation: Math.PI * 0.25,
      lineWidth: 2.0 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.9,
      tickStyle: 'compass',
      tickLength: 0.18,
      innerRingRatio: 0.56,
      innerAlpha: 0.54,
    });

    if (t >= impactT) {
      drawShockwaveRipple(ctx, p.x, p.y, 24 * vs + easeOutQuart(postT) * 92 * richness * vs, (24 * vs + easeOutQuart(postT) * 92 * richness * vs) * 0.48, {
        width: (5.2 - postT * 3.4) * richness * vs,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: Math.pow(1 - postT, 1.35) * 0.88,
      });
    }
    return;
  }

  // Sky layer
  const topY = Math.max(-28, p.y - 300 * vs);

  // Anticipation: converging golden alignment dust & overhead beacon glint
  if (t < impactT + 0.08) {
    const preT = clamp01(t / impactT);
    drawArtisticParticles(ctx, p.x, p.y - 16 * vs, 64 * vs, 44 * vs, {
      count: 14,
      t: preT,
      seed: seed + 11,
      shape: 'ember',
      motion: 'converge',
      color: pal.secondary,
      secondaryColor: pal.accent,
      coreColor: pal.core,
      alpha: 0.85 * (1 - clamp01((t - impactT) / 0.08)),
      vs,
      reduced,
    });
    // High-altitude orbital focus ring
    drawEllipticalHalo(ctx, p.x, p.y - 130 * vs, (28 - preT * 12) * vs, (9 - preT * 4) * vs, {
      lineWidth: 1.6 * vs,
      color: pal.secondary,
      coreColor: pal.core,
      alpha: smoothWindow(preT, 0.15, 0.7, 1) * 0.85,
    });
  }

  // Plunging sculpted celestial lance spear
  const strikeT = clamp01((t - 0.08) / 0.13);
  const lanceTipY = reduced ? p.y : topY + (p.y - topY) * easeOutQuart(strikeT);
  const beamAlpha = smoothWindow(t, 0.08, 0.34, 1);
  const widthDecay = 1 - clamp01((t - 0.26) / 0.74) * 0.68;

  if (t >= 0.07) {
    drawTaperedBeamSpire(ctx, p.x, lanceTipY, topY, {
      baseWidth: 26 * richness * vs * widthDecay,
      topWidth: 7.0 * richness * vs * widthDecay,
      tipHeight: 36 * richness * vs,
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: beamAlpha * 0.96,
      mode: 'lance',
    });
  }

  // Impact detonation + twin curved shock-crescents + rising embers
  if (t >= impactT) {
    const it = clamp01((t - impactT) / (1 - impactT));
    const iAlpha = Math.pow(1 - it, 1.35) * 0.96;
    const flash = Math.max(0, 1 - it * 3.2);
    const wingSpan = (32 + easeOutQuart(it) * 76) * richness * vs;
    const wingLift = (16 + easeOutCubic(it) * 38) * richness * vs;

    if (flash > 0.02) {
      drawSoftBloom(ctx, p.x, p.y - 10 * vs, 64 * richness * vs, pal.core, pal.secondary, flash * 0.86);
    }

    for (const dir of [-1, 1]) {
      const p0 = { x: p.x + dir * 4 * vs, y: p.y - 4 * vs };
      const p1 = { x: p.x + dir * wingSpan * 0.55, y: p.y - wingLift * 0.22 };
      const p2 = { x: p.x + dir * wingSpan, y: p.y - wingLift };
      const sampleFn = (u) => sampleQuadBezier(p0, p1, p2, u);
      drawAnalyticalRibbon(ctx, sampleFn, {
        uStart: 0,
        uEnd: 1,
        steps: 30,
        maxWidth: (5.6 - it * 2.5) * richness * vs,
        color: pal.secondary,
        coreColor: pal.core,
        alpha: iAlpha * 0.88,
        taperProfile: 'taper_out',
        coreRatio: 0.46,
      });
      drawLuminousTrailParticles(ctx, sampleFn, {
        uStart: 0.1,
        uEnd: 0.95,
        count: 7,
        t: it * 1.4,
        seed: seed + (dir > 0 ? 41 : 73),
        color: pal.secondary,
        secondaryColor: pal.accent,
        coreColor: pal.core,
        alpha: iAlpha * 0.85,
        vs,
        scatter: 3.5,
        glintEvery: 4,
      });
    }

    // Two ascending orbital collar rings around the lance shaft
    for (let r = 0; r < (tier >= 2 ? 2 : 1); r += 1) {
      const collarY = p.y - (44 + r * 38 + it * 64) * vs;
      const collarR = (18 + r * 6 + it * 22) * richness * vs;
      drawEllipticalHalo(ctx, p.x, collarY, collarR, collarR * 0.32, {
        lineWidth: (2.0 - r * 0.4) * vs,
        color: r === 0 ? pal.secondary : pal.primary,
        coreColor: pal.core,
        alpha: iAlpha * (0.8 - r * 0.16),
      });
    }

    // Rising incandescent embers & upward impact sparks
    drawArtisticParticles(ctx, p.x, p.y - 4 * vs, 44 * richness * vs, 74 * vs, {
      count: 20 + tier * 4,
      t: it,
      seed: seed + 123,
      shape: 'ember',
      motion: 'rise',
      color: pal.primary,
      secondaryColor: pal.accent,
      coreColor: pal.core,
      alpha: 0.92,
      vs,
      reduced,
    });

    // Crisp multi-point impact starburst at ground touchdown
    drawStarFlare(ctx, p.x, p.y - 6 * vs, (28 + (1 - it) * 18) * richness * vs, 0.14, pal.primary, pal.core, iAlpha, 0, 4);
    drawStarFlare(ctx, p.x, p.y - 6 * vs, (16 + (1 - it) * 10) * richness * vs, 0.18, pal.accent, pal.core, iAlpha * 0.85, Math.PI * 0.25, 4);
  }
}

/**
 * 5. Gravity Vortex — Logarithmic Singularity Well (4-Phase Implosion)
 *   Anticipation: Deep violet gravity well pools on arena floor.
 *   Build-up: 3–4 smooth 40-segment logarithmic spiral arms wind faster while multi-size
 *     stardust & diamond shards orbit strictly along the spiral curves.
 *   Peak (t ≈ 0.40): Event-horizon compression flash & spatial distortion ripple (synced impulse).
 *   Dissipation: Quiet inward collapse pulse & drifting violet dust.
 */
function renderGravityVortex(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const { rx } = getWorldRadii(fx, p, 22);
  const maxR = Math.min(Math.max(rx, 82 * vs), 124 * vs) * richness;
  const ryRatio = 0.5;
  const collapseT = 0.40;
  const seed = fx.seed || 505;

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.08, 0.48, 1);
    const pull = 1.12 - easeOutCubic(t) * 0.46;

    // Deep cosmic violet singularity atmosphere
    drawNebulaAtmosphere(ctx, p.x, p.y, maxR * 1.24, maxR * 1.24 * ryRatio, {
      innerColor: pal.primary,
      midColor: '#2e1065',
      outerColor: '#09051a',
      accentColor: pal.secondary,
      alpha: alpha * 0.62,
      rotation: reduced ? 0 : -t * 1.4,
      lobes: 4,
    });

    // Dark event-horizon well for crisp luminous contrast
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1, ryRatio);
    if (typeof ctx.createRadialGradient === 'function') {
      const well = ctx.createRadialGradient(0, 0, 0, 0, 0, maxR * 0.52);
      well.addColorStop(0, `rgba(9, 5, 24, ${(alpha * 0.78).toFixed(3)})`);
      well.addColorStop(0.58, withAlpha(pal.primary, alpha * 0.24));
      well.addColorStop(1, withAlpha(pal.primary, 0));
      ctx.fillStyle = well;
    } else {
      ctx.fillStyle = `rgba(9, 5, 24, ${(alpha * 0.5).toFixed(3)})`;
    }
    ctx.beginPath();
    ctx.arc(0, 0, maxR * 0.52, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawSymmetricalSigilRing(ctx, p.x, p.y, maxR * pull, maxR * pull * ryRatio, {
      count: 6,
      arcFill: 0.54,
      rotation: reduced ? 0 : -t * 2.5,
      lineWidth: 1.65 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.78,
      innerRingRatio: 0.42,
      innerAlpha: 0.56,
    });

    if (t >= collapseT) {
      const ct = clamp01((t - collapseT) / (1 - collapseT));
      const warpR = maxR * (0.28 + easeOutQuart(ct) * 0.92);
      drawShockwaveRipple(ctx, p.x, p.y, warpR, warpR * ryRatio, {
        width: (4.2 - ct * 2.6) * vs,
        color: pal.secondary,
        secondaryColor: pal.accent,
        coreColor: pal.core,
        alpha: Math.pow(1 - ct, 1.4) * 0.82,
      });
    }
    return;
  }

  // Sky layer — 3-4 smooth 40-segment logarithmic spiral arms + spiral-riding stardust
  const alpha = smoothWindow(t, 0.08, 0.42, 1);
  const armCount = tier >= 3 ? 4 : 3;
  const spin = reduced ? 0 : -t * 3.8;
  const cy = p.y - 6 * vs;

  for (let arm = 0; arm < armCount; arm += 1) {
    const startA = spin + (arm * Math.PI * 2) / armCount;
    const outerR = maxR * (1.02 - t * 0.2);
    const innerR = Math.max(8 * vs, maxR * 0.13);
    const sampleFn = (u) => sampleLogSpiral(p.x, cy, outerR, innerR, startA, Math.PI * 1.48, ryRatio, u);

    drawAnalyticalRibbon(ctx, sampleFn, {
      uStart: 0.03,
      uEnd: 0.98,
      steps: 40,
      maxWidth: (4.8 - (arm % 2) * 0.7) * richness * vs,
      color: arm % 2 === 0 ? pal.primary : pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.9,
      taperProfile: 'comet',
      coreRatio: 0.44,
    });

    drawLuminousTrailParticles(ctx, sampleFn, {
      uStart: 0.05,
      uEnd: 0.96,
      count: 9,
      t: t * 1.8,
      seed: seed + arm * 53,
      color: pal.glow,
      secondaryColor: pal.accent,
      coreColor: pal.core,
      alpha: alpha * 0.88,
      vs,
      scatter: 4.0,
      glintEvery: 5,
    });
  }

  // Swirling inward gravity dust & crystal fragments
  drawArtisticParticles(ctx, p.x, cy, maxR * 0.96, maxR * 0.96 * ryRatio, {
    count: 16 + tier * 3,
    t,
    seed: seed + 141,
    shape: 'diamond',
    motion: 'swirl',
    color: pal.secondary,
    secondaryColor: pal.accent,
    coreColor: pal.core,
    alpha: 0.86,
    vs,
    reduced,
  });

  // Event-horizon peak flash at collapseT
  if (t >= collapseT - 0.04) {
    const ct = clamp01((t - (collapseT - 0.04)) / (1 - (collapseT - 0.04)));
    const pulse = Math.max(0, 1 - ct * 2.8);
    if (pulse > 0.02) {
      drawSoftBloom(ctx, p.x, cy, 46 * richness * vs, pal.core, pal.secondary, pulse * 0.82);
      drawStarFlare(ctx, p.x, cy, 22 * richness * vs * pulse, 0.16, pal.accent, pal.core, pulse * 0.95, spin * 0.4, 4);
    }
  }

  // Crisp luminous accretion horizon ring
  const horizonR = (15 + Math.sin(t * Math.PI) * 6) * richness * vs;
  drawEllipticalHalo(ctx, p.x, cy, horizonR, horizonR * ryRatio, {
    lineWidth: 2.3 * vs,
    color: pal.accent,
    coreColor: pal.core,
    alpha: alpha * 0.95,
  });
}

/**
 * 6. Chain Lightning — Stepped Anime Voltaic Cascade (4-Phase Arc)
 *   Anticipation: Charged cyan ozone ground halos & static sparks on targets.
 *   Build-up: Overhead storm flash ignites above primary target.
 *   Peak (t ≈ 0.14–0.52): Sequential stepped anime lightning cascade with fine secondary
 *     arc filaments, crisp 4-spark target detonations & localized electric floor glow.
 *   Dissipation: Crackling residual electric sparks fading out cleanly.
 */
function renderChainLightning(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const targets = resolvePoints(fx, bf, w, h, [
    { x: fx.x, y: fx.y },
    { x: Math.min(92, fx.x + 12), y: Math.max(12, fx.y - 10) },
    { x: Math.min(94, fx.x + 18), y: Math.min(88, fx.y + 12) },
  ]);
  const seedBase = fx.seed || 61;

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.05, 0.42, 1);
    for (let i = 0; i < targets.length; i += 1) {
      const tp = targets[i];
      const hopT = clamp01((t - i * 0.07) / 0.86);
      if (hopT <= 0) continue;
      const r = (16 + easeOutCubic(hopT) * 18) * richness * vs;
      drawAmbientGroundLight(ctx, tp.x, tp.y, r * 1.45, r * 0.72, {
        color: pal.primary,
        secondaryColor: pal.accent,
        coreColor: pal.core,
        alpha: alpha * (1 - hopT * 0.45) * 0.65,
      });
      drawSymmetricalSigilRing(ctx, tp.x, tp.y, r, r * 0.48, {
        count: 4,
        arcFill: 0.5,
        rotation: i * 0.4 + (reduced ? 0 : hopT * 1.6),
        lineWidth: 1.65 * vs,
        color: pal.primary,
        coreColor: pal.core,
        alpha: alpha * (1 - hopT * 0.35) * 0.84,
        tickStyle: 'radial',
        tickLength: 0.22,
      });
    }
    return;
  }

  // Sky layer
  const alpha = smoothWindow(t, 0.04, 0.36, 1);
  const stepIndex = reduced ? 0 : Math.floor(t * 7);

  if (targets.length > 0) {
    const first = targets[0];
    // Overhead ionized storm flash
    const stormFlash = smoothWindow(t, 0.04, 0.24, 0.58);
    if (stormFlash > 0.02) {
      drawSoftBloom(ctx, first.x - 10 * vs, first.y - 118 * vs, 44 * vs, pal.core, pal.primary, stormFlash * 0.62);
    }

    // Primary sky-to-target lightning bolt
    drawSteppedLightningBolt(ctx, first.x - 14 * vs, first.y - 140 * vs, first.x, first.y - 14 * vs, {
      segments: 7,
      amplitude: 10.5 * vs,
      width: 3.8 * richness * vs,
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.96,
      seed: seedBase,
      stepIndex,
    });
    // Crisp secondary braided arc along the sky strike
    drawSteppedLightningBolt(ctx, first.x - 14 * vs, first.y - 140 * vs, first.x, first.y - 14 * vs, {
      segments: 6,
      amplitude: 16 * vs,
      width: 1.5 * vs,
      color: pal.accent,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.55,
      seed: seedBase + 131,
      stepIndex,
    });
  }

  // Sequential chain arcs between struck enemies
  for (let i = 0; i < targets.length - 1; i += 1) {
    const hopDelay = 0.07 + i * 0.07;
    const hopT = clamp01((t - hopDelay) / 0.78);
    if (hopT <= 0) continue;
    const a = targets[i];
    const b = targets[i + 1];
    const hopAlpha = smoothWindow(hopT, 0.06, 0.38, 1);

    drawSteppedLightningBolt(ctx, a.x, a.y - 14 * vs, b.x, b.y - 14 * vs, {
      segments: 7,
      amplitude: 11 * vs,
      width: (3.4 - i * 0.2) * richness * vs,
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: hopAlpha * 0.96,
      seed: seedBase + (i + 1) * 37,
      stepIndex,
    });

    if (tier >= 2 || i === 0) {
      drawSteppedLightningBolt(ctx, a.x, a.y - 14 * vs, b.x, b.y - 14 * vs, {
        segments: 6,
        amplitude: 15 * vs,
        width: 1.55 * vs,
        color: pal.accent,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: hopAlpha * 0.62,
        seed: seedBase + 199 + i * 29,
        stepIndex,
      });
    }
  }

  // Impact star detonations + crackling radial sparks on each struck target
  for (let i = 0; i < targets.length; i += 1) {
    const hopT = clamp01((t - 0.05 - i * 0.07) / 0.85);
    if (hopT <= 0) continue;
    const tp = targets[i];
    const impA = smoothWindow(hopT, 0.06, 0.32, 1);

    drawSoftBloom(ctx, tp.x, tp.y - 14 * vs, 22 * richness * vs, pal.core, pal.primary, impA * 0.56);
    drawStarFlare(
      ctx,
      tp.x,
      tp.y - 14 * vs,
      (18 - i * 1.4) * richness * vs * (1 - hopT * 0.28),
      0.15,
      pal.accent,
      pal.core,
      impA * 0.96,
      Math.PI * 0.25,
      4,
    );
    drawArtisticParticles(ctx, tp.x, tp.y - 14 * vs, 28 * vs, 24 * vs, {
      count: 8 + tier * 2,
      t: hopT,
      seed: seedBase + 300 + i * 43,
      shape: 'spark',
      motion: 'radial',
      color: pal.primary,
      secondaryColor: pal.accent,
      coreColor: pal.core,
      alpha: 0.9,
      vs,
      reduced,
    });
  }
}

// ============================================================================
// B. TACTIC CARDS (6) — Precision Arrows, Chevrons, Shields & Reticles
// ============================================================================

/**
 * 7. Full Assault — Forward Phalanx Surge (4-Phase Charge)
 *   Anticipation: Battle-standard golden ground light & forward ember sparks behind allies.
 *   Build-up: Vanguard formation chevron charges up.
 *   Peak (t ≈ 0.24–0.58): 3–4 nested razor-symmetrical beveled golden chevrons (») surge
 *     rigidly forward with flanking curved wind-ribbons & horizontal slipstream needles.
 *   Dissipation: Streaming golden battle-sparks & warm battle-fervor trail fade smoothly.
 */
function renderFullAssault(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const allies = resolvePoints(fx, bf, w, h, [{ x: 30, y: 50 }]);
  const startW = bf.worldToScreen(22, 50, w, h);
  const endW = bf.worldToScreen(76, 50, w, h);
  const sweep = reduced ? 0.5 : easeOutCubic(clamp01((t - 0.06) / 0.88));
  const leadX = startW.x + (endW.x - startW.x) * sweep;
  const centerY = startW.y;
  const seed = fx.seed || 707;

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.08, 0.44, 1);
    drawAmbientGroundLight(ctx, leadX - 24 * vs, centerY, 96 * richness * vs, 44 * richness * vs, {
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.56,
    });
    drawSymmetricalSigilRing(ctx, startW.x + 28 * vs, centerY, 50 * richness * vs, 24 * richness * vs, {
      count: 4,
      arcFill: 0.5,
      rotation: 0,
      lineWidth: 1.6 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.66,
      tickStyle: 'diamond',
    });
    return;
  }

  // Sky layer
  const alpha = smoothWindow(t, 0.08, 0.4, 1);
  const chevronCount = tier >= 3 ? 4 : 3;
  const spacing = 22 * richness * vs;
  const cy = centerY - 16 * vs;

  // Flanking symmetrical upper & lower golden wind-sweep ribbons framing the charge
  if (t >= 0.1) {
    const rt = clamp01((t - 0.1) / 0.82);
    for (const dir of [-1, 1]) {
      const p0 = { x: startW.x - 10 * vs, y: cy + dir * 32 * vs };
      const p1 = { x: leadX - 24 * vs, y: cy + dir * 44 * vs };
      const p2 = { x: leadX + 18 * vs, y: cy + dir * 20 * vs };
      drawAnalyticalRibbon(ctx, (u) => sampleQuadBezier(p0, p1, p2, u), {
        uStart: clamp01(rt * 0.55 - 0.15),
        uEnd: Math.min(1, 0.25 + rt * 0.9),
        steps: 32,
        maxWidth: 3.4 * richness * vs,
        color: pal.secondary,
        coreColor: pal.core,
        alpha: alpha * 0.72,
        taperProfile: 'comet',
        coreRatio: 0.44,
      });
    }
  }

  // Dominant Hero: 3-4 nested rigid razor-symmetrical beveled chevrons (»)
  for (let i = 0; i < chevronCount; i += 1) {
    const scale = 1 - i * 0.14;
    const cx = leadX - i * spacing;
    const cAlpha = alpha * (1 - i * 0.16);
    drawPrecisionChevron(ctx, cx, cy, 0, {
      halfHeight: 48 * richness * vs * scale,
      depth: 24 * richness * vs * scale,
      thickness: 6.4 * richness * vs * scale,
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: cAlpha * 0.94,
    });
  }

  // Forward streaming battle-fervor sparks across the surge corridor
  drawArtisticParticles(ctx, leadX - 26 * vs, cy, 78 * richness * vs, 44 * vs, {
    count: 18 + tier * 3,
    t,
    seed: seed + 17,
    shape: 'spark',
    motion: 'forward',
    color: pal.primary,
    secondaryColor: pal.secondary,
    coreColor: pal.core,
    alpha: 0.88,
    vs,
    reduced,
  });

  // Straight horizontal slipstream needles on allies
  if (!reduced) {
    for (let i = 0; i < allies.length; i += 1) {
      const ap = allies[i];
      const slide = easeOutCubic(t) * 28 * vs;
      drawTaperedNeedle(ctx, ap.x - 32 * vs + slide * 0.35, ap.y - 16 * vs, ap.x + 26 * vs + slide, ap.y - 16 * vs, {
        width: 3.1 * vs,
        color: pal.secondary,
        coreColor: pal.core,
        alpha: alpha * 0.82,
        peakRatio: 0.74,
      });
    }
  }
}

/**
 * 8. Focus Fire — Tactical Precision Lock-On (4-Phase Target Acquisition)
 *   Anticipation: Crimson-gold optical scan ring sweeps onto target ground.
 *   Build-up: Razor-straight sightlines trace from allies with traveling target pulses
 *     while 4 chamfered corner brackets contract smoothly inward.
 *   Peak (t ≈ 0.28): Crisp lock-on detent flash (subtle micro-tap impulse), glowing
 *     diamond crosshair, concentric crimson-gold optical echo wave & pinpoint sparks.
 *   Dissipation: High-precision target lock holds steady and fades cleanly.
 */
function renderFocusFire(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const allies = resolvePoints(fx, bf, w, h, [{ x: 28, y: 44 }, { x: 30, y: 60 }]);
  const lockAt = 0.28;
  const seed = fx.seed || 808;

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.06, 0.48, 1);
    const lock = easeOutQuart(Math.min(1, t / lockAt));
    const rx = (58 - lock * 24) * richness * vs;
    const ry = rx * 0.48;
    drawAmbientGroundLight(ctx, p.x, p.y, rx * 1.3, ry * 1.3, {
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.5,
    });
    drawSymmetricalSigilRing(ctx, p.x, p.y, rx, ry, {
      count: 4,
      arcFill: 0.56,
      rotation: reduced ? Math.PI * 0.25 : Math.PI * 0.25 + (1 - lock) * 0.72,
      lineWidth: 2.0 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.9,
      tickStyle: 'compass',
      tickLength: 0.2,
    });
    return;
  }

  // Sky layer
  const alpha = smoothWindow(t, 0.06, 0.44, 1);
  const lockT = Math.min(1, t / lockAt);
  const contract = reduced ? 1 : easeOutBackClamped(lockT, 0.85);
  const cy = p.y - 16 * vs;
  const reticleR = Math.max(19 * vs, (46 - contract * 18) * richness * vs);
  const rot = reduced ? 0 : (1 - easeOutQuart(lockT)) * 0.62;

  // Razor-straight converging sightline needles with traveling optical light pulses
  if (!reduced) {
    const beamProgress = easeOutCubic(Math.min(1, t / (lockAt * 1.05)));
    for (let i = 0; i < Math.min(4, allies.length); i += 1) {
      const ap = allies[i];
      const sx = ap.x;
      const sy = ap.y - 14 * vs;
      const ex = sx + (p.x - sx) * beamProgress;
      const ey = sy + (cy - sy) * beamProgress;
      drawTaperedNeedle(ctx, sx, sy, ex, ey, {
        width: 2.3 * vs,
        color: pal.primary,
        coreColor: pal.core,
        alpha: alpha * 0.68,
        peakRatio: 0.82,
      });

      // Traveling optical lock bead racing along the straight sightline
      const beadU = clamp01((t * 2.2 + i * 0.12) % 1);
      if (t < 0.72) {
        const bx = sx + (ex - sx) * beadU;
        const by = sy + (ey - sy) * beadU;
        drawStarFlare(ctx, bx, by, 5.2 * vs, 0.2, pal.secondary, pal.core, alpha * 0.88, 0, 4);
      }
    }
  }

  // Peak lock-on detent echo brackets & precision sparks
  if (t >= lockAt - 0.02) {
    const pt = clamp01((t - (lockAt - 0.02)) / (1 - (lockAt - 0.02)));
    const echoR = reticleR * (0.98 + easeOutQuart(pt) * 0.72);
    drawSymmetricalSigilRing(ctx, p.x, cy, echoR, echoR, {
      count: 4,
      arcFill: 0.42,
      rotation: Math.PI * 0.25 + pt * 0.22,
      lineWidth: (2.0 - pt * 1.1) * vs,
      color: pal.secondary,
      coreColor: pal.core,
      alpha: Math.pow(1 - pt, 1.55) * 0.84,
      tickStyle: 'radial',
      tickLength: 0.14,
    });
    const flash = Math.max(0, 1 - pt * 3.8);
    if (flash > 0.02) {
      drawSoftBloom(ctx, p.x, cy, 34 * richness * vs, pal.core, pal.primary, flash * 0.72);
    }
    drawArtisticParticles(ctx, p.x, cy, 32 * richness * vs, 32 * richness * vs, {
      count: 10 + tier * 2,
      t: pt,
      seed: seed + 31,
      shape: 'spark',
      motion: 'radial',
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: 0.84,
      vs,
      reduced,
    });
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
 * 9. Emergency Defense — Imperial Bastion Aegis Wall (4-Phase Bulwark)
 *   Anticipation: Grounded hexagonal bastion floor sigil & cool sapphire light pool.
 *   Build-up: Central imperial bastion shield rises cleanly with ascending ward diamonds.
 *   Peak (t ≈ 0.28): Flanking symmetrical wing shields unfurl, crowning golden-sapphire
 *     ribbon sweeps across carrying ward stardust, localized protective aura sheen.
 *   Dissipation: Serene floating crystal ward diamonds & graceful receding shield outline.
 */
function renderEmergencyDefense(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const center = bf.worldToScreen(fx.x, 50, w, h);
  const seed = fx.seed || 909;

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.08, 0.48, 1);
    const expand = 0.32 + easeOutCubic(t) * 0.7;
    drawAmbientGroundLight(ctx, center.x, center.y, 88 * richness * vs * expand, 42 * richness * vs * expand, {
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.56,
    });
    drawSymmetricalSigilRing(ctx, center.x, center.y, 68 * richness * vs * expand, 32 * richness * vs * expand, {
      count: 6,
      arcFill: 0.6,
      rotation: Math.PI / 6,
      lineWidth: 1.85 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.86,
      tickStyle: 'diamond',
      innerRingRatio: 0.68,
      innerAlpha: 0.48,
    });
    return;
  }

  // Sky layer
  const alpha = smoothWindow(t, 0.08, 0.44, 1);
  const rise = reduced ? 1 : easeOutBackClamped(Math.min(1, t * 2.5), 0.65);
  const wingSpread = reduced ? 1 : easeOutCubic(clamp01((t - 0.1) / 0.32));
  const cy = center.y - (26 + rise * 9) * vs;

  // Soft protective sapphire aura behind bastion crest
  drawNebulaAtmosphere(ctx, center.x, cy, 82 * richness * vs, 56 * richness * vs, {
    innerColor: pal.primary,
    midColor: '#0c4a6e',
    outerColor: '#082f49',
    accentColor: pal.secondary,
    alpha: alpha * 0.36,
    lobes: 3,
  });

  // Flanking symmetrical wing shields unfurling cleanly at Build-up -> Peak
  if (wingSpread > 0.02) {
    const wingOffsetX = 44 * richness * vs * wingSpread;
    const wingOffsetY = 8 * vs;
    for (const dir of [-1, 1]) {
      drawBastionShield(ctx, center.x + dir * wingOffsetX, cy + wingOffsetY, 27 * richness * vs, 40 * richness * vs, {
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: alpha * wingSpread * (tier >= 2 ? 0.78 : 0.62),
      });
    }
  }

  // Dominant central bastion shield crest
  drawBastionShield(ctx, center.x, cy, 48 * richness * vs * (0.76 + rise * 0.24), 66 * richness * vs * (0.76 + rise * 0.24), {
    color: pal.primary,
    secondaryColor: pal.secondary,
    coreColor: pal.core,
    alpha: alpha * 0.96,
  });

  // Crowning golden-sapphire protective ribbon with gliding ward glints
  const crownT = clamp01((t - 0.12) / 0.36);
  if (crownT > 0.02) {
    const p0 = { x: center.x - 62 * richness * vs, y: cy + 14 * vs };
    const p1 = { x: center.x, y: cy - 52 * richness * vs };
    const p2 = { x: center.x + 62 * richness * vs, y: cy + 14 * vs };
    const sampleFn = (u) => sampleQuadBezier(p0, p1, p2, u);
    const half = 0.46 * easeOutCubic(crownT);
    drawAnalyticalRibbon(ctx, sampleFn, {
      uStart: 0.5 - half,
      uEnd: 0.5 + half,
      steps: 36,
      maxWidth: 3.8 * richness * vs,
      color: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.78,
      taperProfile: 'crescent',
      coreRatio: 0.46,
    });
    drawLuminousTrailParticles(ctx, sampleFn, {
      uStart: 0.5 - half,
      uEnd: 0.5 + half,
      count: 10,
      t,
      seed: seed + 19,
      color: pal.glow,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.86,
      vs,
      scatter: 4.0,
      glintEvery: 4,
    });
  }

  // Ascending luminous ward diamonds
  drawArtisticParticles(ctx, center.x, center.y - 6 * vs, 64 * richness * vs, 48 * vs, {
    count: 14 + tier * 3,
    t,
    seed: seed + 61,
    shape: 'diamond',
    motion: 'rise',
    color: pal.primary,
    secondaryColor: pal.secondary,
    coreColor: pal.core,
    alpha: 0.84,
    vs,
    reduced,
  });
}

/**
 * 10. Flank Maneuver — Mirror-Symmetric Twin Pincer Arrows (4-Phase Envelopment)
 *   Anticipation: Dual flank corridor markers & cyan slipstream cues ignite.
 *   Build-up: Twin mirror-symmetric cubic-Bezier arrow arcs sweep wide around North
 *     & South flanks carrying moving aero-stardust along both curves.
 *   Peak (t ≈ 0.38–0.65): Arrowheads converge sharply on enemy flanks with twin curved
 *     sonic-wake arcs & convergence star glints.
 *   Dissipation: Lingering aerodynamic wind-trails & crisp cyan sparks fade smoothly.
 */
function renderFlankManeuver(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const northMid = bf.worldToScreen(52, 20, w, h);
  const southMid = bf.worldToScreen(52, 80, w, h);
  const seed = fx.seed || 1010;

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.08, 0.46, 1);
    for (const mp of [northMid, southMid]) {
      drawAmbientGroundLight(ctx, mp.x, mp.y, 44 * richness * vs, 20 * richness * vs, {
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: alpha * 0.44,
      });
      drawSymmetricalSigilRing(ctx, mp.x, mp.y, 36 * richness * vs, 16 * richness * vs, {
        count: 4,
        arcFill: 0.5,
        rotation: 0,
        lineWidth: 1.5 * vs,
        color: pal.primary,
        coreColor: pal.core,
        alpha: alpha * 0.68,
        tickStyle: 'diamond',
      });
    }
    return;
  }

  // Sky layer
  const alpha = smoothWindow(t, 0.08, 0.42, 1);
  const uHead = reduced ? 0.92 : easeOutCubic(Math.min(1, t * 1.48));
  const uTail = Math.max(0, uHead - 0.64);

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
        steps: 40,
        maxWidth: 6.4 * richness * vs,
        color: pal.primary,
        coreColor: pal.core,
        alpha: alpha * 0.92,
        taperProfile: 'comet',
        coreRatio: 0.46,
      });

      // Aerodynamic luminous slipstream dust riding both curved flank trajectories
      drawLuminousTrailParticles(ctx, sampleFn, {
        uStart: uTail,
        uEnd: uHead,
        count: 10 + tier * 2,
        t: t * 1.7,
        seed: seed + i * 47,
        color: pal.glow,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: alpha * 0.9,
        vs,
        scatter: 4.5,
        glintEvery: 4,
      });

      // Exact tangent-aligned symmetrical arrowhead riding the leading tip
      const tip = sampleFn(uHead);
      const tangentAngle = Math.atan2(tip.ty, tip.tx);
      drawPrecisionArrow(ctx, tip.x, tip.y, tangentAngle, {
        headLength: 21 * richness * vs,
        headHalfWidth: 12 * richness * vs,
        barbBack: 7.5 * richness * vs,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: alpha * 0.96,
        withShaft: false,
      });

      // Convergence sonic glint & spark flare when pincer tips close in
      if (uHead > 0.72) {
        const convT = clamp01((uHead - 0.72) / 0.28);
        drawStarFlare(ctx, tip.x, tip.y, (10 + convT * 6) * richness * vs, 0.16, pal.secondary, pal.core, alpha * 0.92, tangentAngle, 4);
      }
    }
  }

  // Subtle convergence wake sparkles between both closing pincers at Peak/Dissipation
  if (t > 0.34) {
    const convAnchor = bf.worldToScreen(76, 50, w, h, 4);
    drawArtisticParticles(ctx, convAnchor.x, convAnchor.y, 42 * vs, 38 * vs, {
      count: 12 + tier * 2,
      t: clamp01((t - 0.34) / 0.66),
      seed: seed + 199,
      shape: 'spark',
      motion: 'radial',
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: 0.85,
      vs,
      reduced,
    });
  }
}

/**
 * 11. Siege Formation — Unified Precision Spearhead Breakthrough (4-Phase Thrust)
 *   Anticipation: Fiery formation sigil & rear spear-charge ring ignite.
 *   Build-up: Recessed vanguard chevron & compressing fiery embers gather behind spearhead.
 *   Peak (t ≈ 0.24–0.58): Unified razor-symmetrical closed-polygon precision spearhead arrow
 *     lunges forward (synced horizontal impulse) with twin curved shock-ribbons, fiery
 *     slipstream embers, apex star flare & aligned mini spear-tips on allies.
 *   Dissipation: Incandescent ember wake & crisp apex glint fade smoothly.
 */
function renderSiegeFormation(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const allies = resolvePoints(fx, bf, w, h, [{ x: 34, y: 44 }, { x: 34, y: 56 }]);
  const lunge = reduced ? 0.5 : easeOutQuart(clamp01((t - 0.08) / 0.84));
  const anchor = bf.worldToScreen(28 + lunge * 38, 50, w, h);
  const seed = fx.seed || 1111;

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.08, 0.44, 1);
    drawAmbientGroundLight(ctx, anchor.x, anchor.y, 82 * richness * vs, 38 * richness * vs, {
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.6,
    });
    drawSymmetricalSigilRing(ctx, anchor.x, anchor.y, 52 * richness * vs, 25 * richness * vs, {
      count: 4,
      arcFill: 0.56,
      rotation: 0,
      lineWidth: 1.85 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.84,
      tickStyle: 'diamond',
    });
    return;
  }

  // Sky layer
  const alpha = smoothWindow(t, 0.06, 0.38, 1);
  const cy = anchor.y - 16 * vs;
  const apexX = anchor.x + 14 * vs + 35 * richness * vs;

  // Twin sleek aerodynamic Mach-cone ribbons hugging the spearhead shoulder
  if (t >= 0.12 && t <= 0.78) {
    const wt = clamp01((t - 0.12) / 0.66);
    const coneAlpha = alpha * Math.pow(1 - wt, 1.35) * 0.78;
    for (const dir of [-1, 1]) {
      const p0 = { x: apexX - 4 * vs, y: cy };
      const p1 = { x: anchor.x + 2 * vs, y: cy + dir * (20 + wt * 6) * richness * vs };
      const p2 = { x: anchor.x - 56 * richness * vs, y: cy + dir * (28 + wt * 8) * richness * vs };
      const sampleFn = (u) => sampleQuadBezier(p0, p1, p2, u);
      drawAnalyticalRibbon(ctx, sampleFn, {
        uStart: 0.04,
        uEnd: Math.min(1, 0.32 + wt * 0.85),
        steps: 30,
        maxWidth: 3.2 * richness * vs,
        color: pal.secondary,
        coreColor: pal.core,
        alpha: coneAlpha,
        taperProfile: 'taper_out',
        coreRatio: 0.45,
      });
    }
  }

  // Recessed symmetrical vanguard flank chevron behind the spearhead
  drawPrecisionChevron(ctx, anchor.x - 24 * richness * vs, cy, 0, {
    halfHeight: 40 * richness * vs,
    depth: 20 * richness * vs,
    thickness: 4.6 * richness * vs,
    color: pal.primary,
    secondaryColor: pal.secondary,
    coreColor: pal.core,
    alpha: alpha * (tier >= 2 ? 0.62 : 0.5),
  });

  // Dominant Hero: Unified, razor-symmetrical closed-polygon precision spearhead arrow
  drawPrecisionArrow(ctx, anchor.x + 14 * vs, cy, 0, {
    shaftLength: 86 * richness * vs,
    shaftHalfWidth: 4.4 * richness * vs,
    tailHalfWidth: 1.2 * vs,
    headLength: 35 * richness * vs,
    headHalfWidth: 18.5 * richness * vs,
    barbBack: 10 * richness * vs,
    color: pal.primary,
    secondaryColor: pal.secondary,
    coreColor: pal.core,
    alpha: alpha * 0.98,
    withShaft: true,
  });

  // Piercing white-gold apex burst glint + shock-collar halo
  drawSoftBloom(ctx, apexX, cy, 24 * richness * vs, pal.core, pal.secondary, alpha * 0.62);
  drawStarFlare(ctx, apexX, cy, 16 * richness * vs, 0.15, pal.secondary, pal.core, alpha * 0.96, 0, 4);

  // Fiery slipstream embers streaming through the breakthrough wake
  drawArtisticParticles(ctx, anchor.x - 20 * vs, cy, 74 * richness * vs, 34 * vs, {
    count: 16 + tier * 3,
    t,
    seed: seed + 43,
    shape: 'ember',
    motion: 'forward',
    color: pal.primary,
    secondaryColor: pal.secondary,
    coreColor: pal.core,
    alpha: 0.88,
    vs,
    reduced,
  });

  // Aligned precision mini spear-arrows on allies
  if (!reduced) {
    for (let i = 0; i < Math.min(4, allies.length); i += 1) {
      const ap = allies[i];
      drawPrecisionArrow(ctx, ap.x + 14 * vs, ap.y - 14 * vs, 0, {
        shaftLength: 19 * vs,
        shaftHalfWidth: 1.65 * vs,
        tailHalfWidth: 0.5 * vs,
        headLength: 9.5 * vs,
        headHalfWidth: 5.2 * vs,
        barbBack: 3.2 * vs,
        color: pal.secondary,
        secondaryColor: pal.accent,
        coreColor: pal.core,
        alpha: alpha * 0.78,
        withShaft: true,
      });
    }
  }
}

/**
 * 12. Suppressive Volley — Synchronized Parabolic Arrow Barrage (4-Phase Salvo)
 *   Anticipation: Ally backline launch glints & enemy suppression zone sigil lock in.
 *   Build-up: Staggered 32-segment parabolic trajectory arrows arc skyward with luminous
 *     stardust gliding cleanly along each trajectory.
 *   Peak (t ≈ 0.36–0.70): Synchronized barrage touchdowns across enemy zone with pinpoint
 *     impact shock rings, upward impact sparks & localized volley illumination.
 *   Dissipation: Drifting arrow-light embers & fading zone sigil.
 */
function renderSuppressiveVolley(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const enemyZone = bf.worldToScreen(72, 50, w, h);
  const seed = fx.seed || 1212;

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.08, 0.48, 1);
    const rx = 78 * richness * vs;
    const ry = rx * 0.46;
    drawAmbientGroundLight(ctx, enemyZone.x, enemyZone.y, rx * 1.25, ry * 1.25, {
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.48,
    });
    drawSymmetricalSigilRing(ctx, enemyZone.x, enemyZone.y, rx, ry, {
      count: 6,
      arcFill: 0.56,
      rotation: reduced ? 0 : -t * 0.88,
      lineWidth: 1.75 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.84,
      tickStyle: 'radial',
      tickLength: 0.14,
      innerRingRatio: 0.62,
      innerAlpha: 0.42,
    });
    return;
  }

  // Sky layer
  const volleyCount = 5 + tier;
  for (let i = 0; i < volleyCount; i += 1) {
    const laneFrac = volleyCount > 1 ? i / (volleyCount - 1) : 0.5;
    const delay = laneFrac * 0.22;
    const vt = clamp01((t - delay) / 0.72);
    if (vt <= 0 || vt >= 1) continue;

    const laneY = 20 + laneFrac * 60;
    const staggerX = i % 2 === 0 ? -4 : 5;
    const startPt = bf.worldToScreen(20 + staggerX * 0.4, laneY, w, h, 8);
    const endPt = bf.worldToScreen(64 + (i % 3) * 7, laneY + (i % 2 === 0 ? -3 : 3), w, h, 0);
    const ctrlPt = {
      x: (startPt.x + endPt.x) * 0.5,
      y: Math.min(startPt.y, endPt.y) - (72 + (i % 2) * 16) * vs,
    };

    const sampleFn = (u) => sampleQuadBezier(startPt, ctrlPt, endPt, u);
    const uHead = reduced ? 0.92 : easeOutCubic(Math.min(1, vt * 1.42));
    const uTail = Math.max(0, uHead - 0.44);
    const vAlpha = smoothWindow(vt, 0.06, 0.34, 1);

    // Subtle bow-launch glint at backline origin during launch
    if (vt < 0.24) {
      const lGlow = 1 - vt / 0.24;
      drawStarFlare(ctx, startPt.x, startPt.y, 7.5 * vs * lGlow, 0.18, pal.secondary, pal.core, lGlow * 0.85, 0, 4);
    }

    if (uHead > uTail + 0.02) {
      drawAnalyticalRibbon(ctx, sampleFn, {
        uStart: uTail,
        uEnd: uHead,
        steps: 32,
        maxWidth: 3.6 * richness * vs,
        color: i % 2 === 0 ? pal.primary : pal.secondary,
        coreColor: pal.core,
        alpha: vAlpha * 0.88,
        taperProfile: 'comet',
        coreRatio: 0.46,
      });

      drawLuminousTrailParticles(ctx, sampleFn, {
        uStart: uTail,
        uEnd: uHead,
        count: 5,
        t: vt * 1.5,
        seed: seed + i * 23,
        color: pal.glow,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: vAlpha * 0.82,
        vs,
        scatter: 2.8,
        glintEvery: 5,
      });

      const tip = sampleFn(uHead);
      const angle = Math.atan2(tip.ty, tip.tx);
      drawPrecisionArrow(ctx, tip.x, tip.y, angle, {
        headLength: 11 * richness * vs,
        headHalfWidth: 5.0 * richness * vs,
        barbBack: 3.6 * richness * vs,
        color: i % 2 === 0 ? pal.primary : pal.secondary,
        secondaryColor: pal.accent,
        coreColor: pal.core,
        alpha: vAlpha * 0.96,
        withShaft: false,
      });
    }

    // Crisp impact shock ring + star flare upon touchdown
    if (uHead > 0.86) {
      const impT = clamp01((vt - 0.56) / 0.44);
      const impA = Math.pow(1 - impT, 1.35);
      drawEllipticalHalo(ctx, endPt.x, endPt.y, (8 + impT * 18) * vs, (4 + impT * 8.5) * vs, {
        lineWidth: 1.5 * vs,
        color: i % 2 === 0 ? pal.primary : pal.secondary,
        coreColor: pal.core,
        alpha: impA * 0.78,
      });
      drawStarFlare(ctx, endPt.x, endPt.y - 3 * vs, 11 * richness * vs * (1 - impT * 0.4), 0.16, pal.secondary, pal.core, impA * 0.95, 0, 4);
    }
  }

  // Upward volley impact sparks across enemy zone during Peak & Dissipation
  if (t > 0.32) {
    drawArtisticParticles(ctx, enemyZone.x, enemyZone.y, 64 * richness * vs, 38 * vs, {
      count: 14 + tier * 3,
      t: clamp01((t - 0.32) / 0.68),
      seed: seed + 177,
      shape: 'spark',
      motion: 'rise',
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: 0.85,
      vs,
      reduced,
    });
  }
}

// ============================================================================
// C. SUPPORT CARDS (6) — Wards, Conduits, Helices, Constellations & Spires
// ============================================================================

/**
 * 13. Aegis Blessing — Luminous Crescent Canopy Ward (4-Phase Shielding)
 *   Anticipation: Sapphire foot sigils & gentle upward ward light under each ally.
 *   Build-up: Smooth crescent dome canopies sweep cleanly down from apex with ascending diamonds.
 *   Peak: Apex diamond keystones ignite with soft halo echo rings & translucent dome sheen.
 *   Dissipation: Serene protective shimmer & gently rising micro-diamonds.
 */
function renderAegisBlessing(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const allies = resolvePoints(fx, bf, w, h, [{ x: fx.x, y: fx.y }]);
  const seed = fx.seed || 1313;

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.08, 0.46, 1);
    for (let i = 0; i < allies.length; i += 1) {
      const ap = allies[i];
      const r = (19 + easeOutCubic(t) * 7) * richness * vs;
      drawAmbientGroundLight(ctx, ap.x, ap.y, r * 1.4, r * 0.7, {
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: alpha * 0.52,
      });
      drawSymmetricalSigilRing(ctx, ap.x, ap.y, r, r * 0.48, {
        count: 4,
        arcFill: 0.62,
        rotation: reduced ? 0 : t * 0.85 + i * 0.4,
        lineWidth: 1.55 * vs,
        color: pal.primary,
        coreColor: pal.core,
        alpha: alpha * 0.86,
        tickStyle: 'diamond',
      });
    }
    return;
  }

  // Sky layer
  const alpha = smoothWindow(t, 0.08, 0.44, 1);
  const sweepSpan = reduced ? 1 : easeOutCubic(Math.min(1, t * 2.1));

  for (let i = 0; i < allies.length; i += 1) {
    const ap = allies[i];
    const domeR = (24 + easeOutCubic(t) * 5.5) * richness * vs;
    const domeCy = ap.y - 12 * vs;

    // Translucent top-lit sapphire dome canopy fill
    ctx.save();
    ctx.beginPath();
    ctx.arc(ap.x, domeCy, domeR, Math.PI * 1.03, Math.PI * 1.97);
    ctx.closePath();
    if (typeof ctx.createLinearGradient === 'function') {
      const grad = ctx.createLinearGradient(ap.x, domeCy - domeR, ap.x, domeCy);
      grad.addColorStop(0, withAlpha(pal.core, alpha * 0.24));
      grad.addColorStop(0.45, withAlpha(pal.primary, alpha * 0.16));
      grad.addColorStop(1, withAlpha(pal.primary, 0));
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = withAlpha(pal.primary, alpha * 0.14);
    }
    ctx.fill();
    ctx.restore();

    const halfArc = Math.PI * 0.47 * sweepSpan;
    const sampleFn = (u) => {
      const a = -Math.PI * 0.5 - halfArc + u * halfArc * 2;
      return {
        x: ap.x + Math.cos(a) * domeR,
        y: domeCy + Math.sin(a) * domeR,
        tx: -Math.sin(a) * domeR,
        ty: Math.cos(a) * domeR,
      };
    };

    drawAnalyticalRibbon(ctx, sampleFn, {
      uStart: 0,
      uEnd: 1,
      steps: 34,
      maxWidth: 4.5 * richness * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.94,
      taperProfile: 'crescent',
      coreRatio: 0.46,
    });

    drawEllipticalHalo(ctx, ap.x, domeCy, domeR * 0.84, domeR * 0.84, {
      lineWidth: 1.0 * vs,
      color: pal.secondary,
      coreColor: null,
      alpha: alpha * 0.64,
      startAngle: -Math.PI * 0.5 - halfArc * 0.82,
      endAngle: -Math.PI * 0.5 + halfArc * 0.82,
    });

    // Apex diamond keystone ignition + soft echo ring at Peak
    const apexY = domeCy - domeR - 3 * vs;
    if (t > 0.24) {
      const pt = clamp01((t - 0.24) / 0.62);
      drawEllipticalHalo(ctx, ap.x, apexY, (6 + pt * 14) * vs, (6 + pt * 14) * vs, {
        lineWidth: 1.2 * vs,
        color: pal.secondary,
        coreColor: pal.core,
        alpha: Math.pow(1 - pt, 1.5) * 0.72,
      });
    }
    drawDiamondPrism(ctx, ap.x, apexY, 4.6 * richness * vs, 6.5 * richness * vs, 0, {
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.96,
    });

    // Subtle rising ward micro-diamonds
    drawArtisticParticles(ctx, ap.x, ap.y - 6 * vs, 18 * vs, 28 * vs, {
      count: 4 + tier,
      t,
      seed: seed + i * 31,
      shape: 'diamond',
      motion: 'rise',
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: 0.78,
      vs,
      reduced,
    });
  }
}

/**
 * 14. Overclock Core — Geometric Leyline Power Conduit (4-Phase Surge)
 *   Anticipation: Golden-cyan conduit floor astrolabe powers up with localized warm light.
 *   Build-up: Rotating geometric diamond core charges with inward-gathering energy motes.
 *   Peak: Smooth Bezier leyline conduits stream luminous energy pulses cleanly into every
 *     ally with synchronized charge-complete star flares.
 *   Dissipation: Lingering golden circuit sparks & calm core glow fade smoothly.
 */
function renderOverclockCore(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const allies = resolvePoints(fx, bf, w, h, [{ x: fx.x, y: fx.y }]);
  const seed = fx.seed || 1414;

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.08, 0.46, 1);
    const grow = 0.28 + easeOutQuart(t) * 0.8;
    const rx = 68 * richness * vs * grow;
    const ry = rx * 0.48;
    drawAmbientGroundLight(ctx, p.x, p.y, rx * 1.24, ry * 1.24, {
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.56,
    });
    drawSymmetricalSigilRing(ctx, p.x, p.y, rx, ry, {
      count: 6,
      arcFill: 0.58,
      rotation: reduced ? 0 : t * 1.15,
      lineWidth: 1.85 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.88,
      tickStyle: 'diamond',
      innerRingRatio: 0.62,
      innerAlpha: 0.5,
    });
    drawSymmetricalSigilRing(ctx, p.x, p.y, rx * 0.44, ry * 0.44, {
      count: 4,
      arcFill: 0.54,
      rotation: reduced ? Math.PI * 0.25 : -t * 1.7,
      lineWidth: 1.35 * vs,
      color: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.78,
    });
    return;
  }

  // Sky layer
  const alpha = smoothWindow(t, 0.06, 0.42, 1);
  const coreY = p.y - 34 * vs;
  const flowHead = reduced ? 1 : easeOutCubic(clamp01((t - 0.1) / 0.42));

  // Build-up: converging golden-cyan energy sparks feeding the central core
  if (t < 0.36) {
    drawArtisticParticles(ctx, p.x, coreY, 54 * vs, 38 * vs, {
      count: 14,
      t: clamp01(t / 0.36),
      seed: seed + 17,
      shape: 'spark',
      motion: 'converge',
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: 0.85,
      vs,
      reduced,
    });
  }

  // Smooth analytical Bezier leyline conduits with traveling luminous charge motes
  if (!reduced && flowHead > 0.02) {
    for (let i = 0; i < allies.length; i += 1) {
      const ap = allies[i];
      const p0 = { x: p.x, y: coreY };
      const p2 = { x: ap.x, y: ap.y - 12 * vs };
      const mid = {
        x: (p0.x + p2.x) * 0.5 + (ap.x >= p.x ? 14 : -14) * vs,
        y: Math.min(p0.y, p2.y) - 24 * vs,
      };
      const sampleFn = (u) => sampleQuadBezier(p0, mid, p2, u);

      drawAnalyticalRibbon(ctx, sampleFn, {
        uStart: 0,
        uEnd: flowHead,
        steps: 34,
        maxWidth: 3.8 * richness * vs,
        color: i % 2 === 0 ? pal.primary : pal.secondary,
        coreColor: pal.core,
        alpha: alpha * 0.86,
        taperProfile: 'spindle',
        coreRatio: 0.46,
      });

      drawLuminousTrailParticles(ctx, sampleFn, {
        uStart: 0.04,
        uEnd: flowHead,
        count: 7,
        t: t * 1.9,
        seed: seed + 61 + i * 29,
        color: pal.secondary,
        secondaryColor: pal.primary,
        coreColor: pal.core,
        alpha: alpha * 0.9,
        vs,
        scatter: 3.0,
        glintEvery: 4,
      });

      if (flowHead > 0.72) {
        drawSoftBloom(ctx, ap.x, ap.y - 16 * vs, 16 * vs, pal.core, pal.secondary, alpha * 0.55);
        drawStarFlare(ctx, ap.x, ap.y - 16 * vs, 9.5 * richness * vs, 0.16, pal.secondary, pal.core, alpha * 0.94, i * 0.4, 4);
      }
    }
  }

  // Central rotating geometric diamond conduit core + peak charge ring
  const coreR = (18 + Math.sin(t * Math.PI) * 5.5) * richness * vs;
  drawSoftBloom(ctx, p.x, coreY, coreR * 2.1, pal.core, pal.primary, alpha * 0.52);
  drawDiamondPrism(ctx, p.x, coreY, coreR * 0.78, coreR, reduced ? 0 : t * 0.72, {
    color: pal.primary,
    secondaryColor: pal.accent,
    coreColor: pal.core,
    alpha: alpha * 0.96,
  });
  drawEllipticalHalo(ctx, p.x, coreY, coreR * 1.18, coreR * 1.18, {
    lineWidth: (tier >= 2 ? 1.7 : 1.25) * vs,
    color: pal.secondary,
    coreColor: pal.core,
    alpha: alpha * 0.78,
  });
  drawStarFlare(ctx, p.x, coreY, coreR * 1.42, 0.14, pal.primary, pal.core, alpha * 0.96, 0, 4);

  // Dissipation lingering circuit sparks
  if (t > 0.34) {
    drawArtisticParticles(ctx, p.x, coreY, 44 * vs, 34 * vs, {
      count: 10 + tier * 2,
      t: clamp01((t - 0.34) / 0.66),
      seed: seed + 193,
      shape: 'spark',
      motion: 'radial',
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: 0.82,
      vs,
      reduced,
    });
  }
}

/**
 * 15. Mending Aura — Ascending Double-Helix Recovery Ribbon (4-Phase Restoration)
 *   Anticipation: Soft emerald-champagne ground light pool.
 *   Build-up: Concentric recovery ripples & ascending 36-segment analytical double-helix
 *     ribbons carrying luminous restorative stardust around each ally.
 *   Peak: Symmetrical 4-petal recovery crests bloom cleanly with warm ivory glow & petals.
 *   Dissipation: Gently drifting golden-emerald motes & fading calm ripples.
 */
function renderMendingAura(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const allies = resolvePoints(fx, bf, w, h, [{ x: fx.x, y: fx.y }]);
  const seed = fx.seed || 1515;

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.08, 0.46, 1);
    drawAmbientGroundLight(ctx, p.x, p.y, 76 * richness * vs, 36 * richness * vs, {
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.48,
    });
    for (let wIdx = 0; wIdx < 3; wIdx += 1) {
      const wt = clamp01((t - wIdx * 0.14) / 0.84);
      if (wt <= 0) continue;
      const rx = (22 + easeOutCubic(wt) * 68) * richness * vs;
      drawEllipticalHalo(ctx, p.x, p.y, rx, rx * 0.48, {
        lineWidth: (1.8 - wIdx * 0.32) * vs,
        color: wIdx % 2 === 0 ? pal.primary : pal.secondary,
        coreColor: pal.core,
        alpha: Math.pow(1 - wt, 1.35) * 0.72,
      });
    }
    for (let i = 0; i < allies.length; i += 1) {
      drawSoftBloom(ctx, allies[i].x, allies[i].y, 24 * richness * vs, pal.core, pal.primary, alpha * 0.4, 0.5);
    }
    return;
  }

  // Sky layer
  const alpha = smoothWindow(t, 0.08, 0.44, 1);
  const climb = reduced ? 1 : easeOutCubic(Math.min(1, t * 1.38));
  const helixH = (38 + climb * 18) * richness * vs;

  for (let i = 0; i < allies.length; i += 1) {
    const ap = allies[i];
    if (!reduced) {
      for (let strand = 0; strand < 2; strand += 1) {
        const phase0 = strand * Math.PI + t * 3.8 + i * 0.8;
        const sampleFn = (u) => sampleHelixArc(ap.x, ap.y - 2 * vs, helixH, 13 * richness * vs, phase0, 1.18, u);
        const uEnd = Math.min(1, 0.24 + climb * 0.76);
        drawAnalyticalRibbon(ctx, sampleFn, {
          uStart: 0.04,
          uEnd,
          steps: 36,
          maxWidth: 3.3 * richness * vs,
          color: strand === 0 ? pal.primary : pal.secondary,
          coreColor: pal.core,
          alpha: alpha * 0.86,
          taperProfile: 'spindle',
          coreRatio: 0.46,
        });
        if (strand === 0) {
          drawLuminousTrailParticles(ctx, sampleFn, {
            uStart: 0.06,
            uEnd,
            count: 6,
            t: t * 1.4,
            seed: seed + i * 37,
            color: pal.glow,
            secondaryColor: pal.secondary,
            coreColor: pal.core,
            alpha: alpha * 0.88,
            vs,
            scatter: 3.2,
            glintEvery: 5,
          });
        }
      }
    }

    // Blooming 4-petal recovery crest with warm ivory halo
    const crestY = ap.y - (24 + climb * 19) * vs;
    drawSoftBloom(ctx, ap.x, crestY, 18 * richness * vs, pal.core, pal.secondary, alpha * 0.48);
    drawLotusCrest(ctx, ap.x, crestY, 10 * richness * vs, 10 * richness * vs, {
      petals: 4,
      rotation: Math.PI * 0.25,
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.94,
    });

    // Soft rising recovery petals
    drawArtisticParticles(ctx, ap.x, ap.y - 8 * vs, 18 * vs, 30 * vs, {
      count: 4 + tier,
      t,
      seed: seed + 101 + i * 29,
      shape: 'petal',
      motion: 'rise',
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: 0.82,
      vs,
      reduced,
    });
  }
}

/**
 * 16. Starlight Catalyst — Celestial Constellation Ignition (4-Phase Alignment)
 *   Anticipation: Warm champagne-gold ground sigil & twinkling star-seeds above allies.
 *   Build-up: Razor-straight hairline constellation filaments trace cleanly between allies
 *     with traveling star-beads.
 *   Peak (t ≈ 0.34): Dominant 8-point celestial star crest ignites with twin graceful
 *     ascending starlight arcs carrying fine stardust & crisp starburst glints on all nodes.
 *   Dissipation: Lingering constellation shimmer & gently ascending warm stardust.
 */
function renderStarlightCatalyst(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const allies = resolvePoints(fx, bf, w, h, [{ x: fx.x, y: fx.y }]);
  const seed = fx.seed || 1616;

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.08, 0.46, 1);
    const grow = 0.32 + easeOutQuart(t) * 0.78;
    const rx = 74 * richness * vs * grow;
    const ry = rx * 0.48;
    drawAmbientGroundLight(ctx, p.x, p.y, rx * 1.28, ry * 1.28, {
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.56,
    });
    drawSymmetricalSigilRing(ctx, p.x, p.y, rx, ry, {
      count: 6,
      arcFill: 0.56,
      rotation: reduced ? 0 : t * 0.72,
      lineWidth: 1.85 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.88,
      tickStyle: 'diamond',
      innerRingRatio: 0.66,
      innerAlpha: 0.46,
    });
    return;
  }

  // Sky layer
  const alpha = smoothWindow(t, 0.06, 0.44, 1);
  const cy = p.y - 26 * vs;
  const igniteT = clamp01((t - 0.16) / 0.32);
  const starScale = (24 + easeOutBackClamped(igniteT, 0.85) * 18) * richness * vs * (1 - clamp01((t - 0.55) / 0.45) * 0.25);
  const rot = reduced ? 0 : t * 0.38;

  // Razor-straight delicate constellation line-segments linking allies with traveling star-beads
  if (allies.length >= 2) {
    const traceProgress = reduced ? 1 : easeOutCubic(Math.min(1, t * 2.1));
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < allies.length - 1; i += 1) {
      const a = allies[i];
      const b = allies[i + 1];
      const ay = a.y - 18 * vs;
      const by = b.y - 18 * vs;
      const ex = a.x + (b.x - a.x) * traceProgress;
      const ey = ay + (by - ay) * traceProgress;

      ctx.strokeStyle = withAlpha(pal.primary, alpha * 0.62);
      ctx.lineWidth = 2.1 * vs;
      ctx.beginPath();
      ctx.moveTo(a.x, ay);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      ctx.strokeStyle = withAlpha(pal.core, alpha * 0.92);
      ctx.lineWidth = 0.9 * vs;
      ctx.beginPath();
      ctx.moveTo(a.x, ay);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Traveling starlight bead along the constellation link
      if (!reduced && traceProgress > 0.2) {
        const bu = (t * 1.9 + i * 0.25) % 1;
        const bx = a.x + (ex - a.x) * bu;
        const byPt = ay + (ey - ay) * bu;
        drawStarFlare(ctx, bx, byPt, 4.8 * vs, 0.18, pal.secondary, pal.core, alpha * 0.9, 0, 4);
      }
    }
    ctx.restore();
  }

  // Twin mirror-symmetric ascending starlight ribbon arcs carrying fine stardust
  if (!reduced) {
    const rise = easeOutCubic(t) * 66 * richness * vs;
    for (const dir of [-1, 1]) {
      const p0 = { x: p.x + dir * 24 * vs, y: p.y - 4 * vs };
      const p1 = { x: p.x + dir * 42 * vs, y: p.y - 34 * vs - rise * 0.5 };
      const p2 = { x: p.x + dir * 16 * vs, y: p.y - 56 * vs - rise };
      const sampleFn = (u) => sampleQuadBezier(p0, p1, p2, u);
      drawAnalyticalRibbon(ctx, sampleFn, {
        uStart: 0,
        uEnd: 1,
        steps: 32,
        maxWidth: 3.6 * richness * vs,
        color: pal.primary,
        coreColor: pal.core,
        alpha: alpha * 0.78,
        taperProfile: 'spindle',
        coreRatio: 0.46,
      });
      drawLuminousTrailParticles(ctx, sampleFn, {
        uStart: 0.08,
        uEnd: 0.94,
        count: 8,
        t: t * 1.5,
        seed: seed + (dir > 0 ? 29 : 67),
        color: pal.secondary,
        secondaryColor: pal.primary,
        coreColor: pal.core,
        alpha: alpha * 0.88,
        vs,
        scatter: 4.0,
        glintEvery: 4,
      });
    }
  }

  // Dominant 8-point faceted celestial starlight crest + warm corona & peak ring
  drawSoftBloom(ctx, p.x, cy, starScale * 1.45, pal.core, pal.primary, alpha * 0.62);
  if (t > 0.26) {
    const rt = clamp01((t - 0.26) / 0.68);
    drawEllipticalHalo(ctx, p.x, cy, (14 + easeOutQuart(rt) * 48) * richness * vs, (8 + easeOutQuart(rt) * 26) * richness * vs, {
      lineWidth: (2.0 - rt * 1.2) * vs,
      color: pal.secondary,
      coreColor: pal.core,
      alpha: Math.pow(1 - rt, 1.4) * 0.76,
    });
  }
  drawStarFlare(ctx, p.x, cy, starScale, 0.13, pal.primary, pal.core, alpha * 0.98, rot, 4);
  drawStarFlare(ctx, p.x, cy, starScale * 0.68, 0.14, pal.secondary, pal.core, alpha * 0.9, rot + Math.PI * 0.25, 4);

  // Pinpoint constellation star nodes on each linked ally
  for (let i = 0; i < allies.length; i += 1) {
    drawStarFlare(ctx, allies[i].x, allies[i].y - 18 * vs, 9.8 * richness * vs, 0.16, pal.primary, pal.core, alpha * 0.94, 0, 4);
  }

  // Gently rising warm stardust throughout Peak & Dissipation
  drawArtisticParticles(ctx, p.x, p.y - 14 * vs, 58 * richness * vs, 48 * vs, {
    count: 14 + tier * 3,
    t,
    seed: seed + 149,
    shape: 'star',
    motion: 'rise',
    color: pal.primary,
    secondaryColor: pal.secondary,
    coreColor: pal.core,
    alpha: 0.86,
    vs,
    reduced,
  });
}

/**
 * 17. Cleanse Beacon — Sculpted Sanctuary Light Spire (4-Phase Purification)
 *   Anticipation: Soft pearl-jade sanctuary floor sigil & serene upward light haze.
 *   Build-up: Sculpted tapered sanctuary spire descends cleanly onto feathered floor pedestal.
 *   Peak (t ≈ 0.28–0.65): Twin/triple ascending purification halo rings glide smoothly up the
 *     spire while luminous purifying motes & ally purification rings rise cleanly.
 *   Dissipation: Ethereal pearl mist & softly lifting star glints fade out naturally.
 */
function renderCleanseBeacon(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const allies = resolvePoints(fx, bf, w, h, [{ x: fx.x, y: fx.y }]);
  const seed = fx.seed || 1717;

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.08, 0.48, 1);
    const grow = 0.28 + easeOutQuart(t) * 0.9;
    const rx = 78 * richness * vs * grow;
    const ry = rx * 0.48;
    drawAmbientGroundLight(ctx, p.x, p.y, rx * 1.28, ry * 1.28, {
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.58,
    });
    drawSymmetricalSigilRing(ctx, p.x, p.y, rx, ry, {
      count: 6,
      arcFill: 0.62,
      rotation: reduced ? 0 : t * 0.58,
      lineWidth: 1.85 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.88,
      tickStyle: 'diamond',
      innerRingRatio: 0.64,
      innerAlpha: 0.48,
    });
    return;
  }

  // Sky layer
  const alpha = smoothWindow(t, 0.08, 0.42, 1);
  const topY = Math.max(-24, p.y - 256 * vs);
  const descend = reduced ? 1 : easeOutCubic(Math.min(1, t * 3.4));
  const spireBottomY = topY + (p.y - topY) * descend;
  const widthFade = 1 - clamp01((t - 0.35) / 0.65) * 0.42;

  // Serene pearl-jade atmospheric glow framing the spire base
  drawNebulaAtmosphere(ctx, p.x, p.y - 34 * vs, 74 * richness * vs, 64 * vs, {
    innerColor: pal.primary,
    midColor: '#065f46',
    outerColor: '#052e26',
    accentColor: pal.accent,
    alpha: alpha * 0.32,
    lobes: 3,
  });

  drawTaperedBeamSpire(ctx, p.x, spireBottomY, topY, {
    baseWidth: 46 * richness * vs * widthFade,
    topWidth: 15 * richness * vs * widthFade,
    color: pal.primary,
    secondaryColor: pal.secondary,
    coreColor: pal.core,
    alpha: alpha * 0.94,
    mode: 'spire',
  });

  // Ascending purification halo rings gliding smoothly up the spire
  const ringCount = tier >= 2 ? 3 : 2;
  for (let r = 0; r < ringCount; r += 1) {
    const rt = clamp01((t - 0.08 - r * 0.14) / 0.8);
    if (rt <= 0) continue;
    const riseY = p.y - (8 + (reduced ? 30 + r * 24 : easeOutCubic(rt) * 156)) * vs;
    const ringRx = (34 - rt * 10) * richness * vs;
    drawEllipticalHalo(ctx, p.x, riseY, ringRx, ringRx * 0.34, {
      lineWidth: 1.9 * vs,
      color: r % 2 === 0 ? pal.primary : pal.accent,
      coreColor: pal.core,
      alpha: smoothWindow(rt, 0.08, 0.45, 1) * 0.92,
    });
  }

  // Softly ascending pearl-jade purification star-motes around the spire
  drawArtisticParticles(ctx, p.x, p.y - 10 * vs, 44 * richness * vs, 86 * vs, {
    count: 18 + tier * 4,
    t,
    seed: seed + 71,
    shape: 'star',
    motion: 'rise',
    color: pal.primary,
    secondaryColor: pal.accent,
    coreColor: pal.core,
    alpha: 0.88,
    vs,
    reduced,
  });

  // Clean purifying ring + top star glint rising over each cleansed ally
  for (let i = 0; i < allies.length; i += 1) {
    const ap = allies[i];
    const rise = (reduced ? 18 : 6 + easeOutCubic(t) * 34) * vs;
    drawEllipticalHalo(ctx, ap.x, ap.y - rise, 16 * richness * vs, 7 * richness * vs, {
      lineWidth: 1.6 * vs,
      color: pal.primary,
      coreColor: pal.core,
      alpha: alpha * 0.84,
    });
    drawStarFlare(ctx, ap.x, ap.y - rise - 8 * vs, 8.2 * richness * vs, 0.16, pal.accent, pal.core, alpha * 0.92, 0, 4);
  }
}

/**
 * 18. Haste Relay — Aero-Velocity Chrono Chevrons (4-Phase Acceleration)
 *   Anticipation: Crisp azure-gold chrono foot dials spin up under allies.
 *   Build-up: Aerodynamic slipstream sparks gather behind allies.
 *   Peak (t ≈ 0.22–0.58): Paired symmetrical beveled aero-chevrons (») + razor-straight
 *     horizontal tailwind needle streaks + trailing speed-sparks snap forward across each ally.
 *   Dissipation: Brisk trailing wind-sparks & decelerating foot rings fade cleanly.
 */
function renderHasteRelay(ctx, bf, w, h, fx, layer, t, p, pal, reduced) {
  const { tier, richness } = getTierScale(fx);
  const vs = getViewportScale(p);
  const allies = resolvePoints(fx, bf, w, h, [{ x: fx.x, y: fx.y }]);
  const seed = fx.seed || 1818;

  if (layer === 'ground') {
    const alpha = smoothWindow(t, 0.06, 0.44, 1);
    for (let i = 0; i < allies.length; i += 1) {
      const ap = allies[i];
      const rx = (19 + easeOutCubic(t) * 11) * richness * vs;
      drawAmbientGroundLight(ctx, ap.x, ap.y, rx * 1.3, rx * 0.65, {
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: alpha * 0.46,
      });
      drawSymmetricalSigilRing(ctx, ap.x, ap.y, rx, rx * 0.48, {
        count: 4,
        arcFill: 0.52,
        rotation: reduced ? 0 : t * 3.5 + i * 0.6,
        lineWidth: 1.65 * vs,
        color: pal.primary,
        coreColor: pal.core,
        alpha: alpha * 0.86,
        tickStyle: 'radial',
        tickLength: 0.18,
      });
    }
    return;
  }

  // Sky layer
  const alpha = smoothWindow(t, 0.06, 0.38, 1);
  const slide = reduced ? 0 : easeOutCubic(clamp01((t - 0.04) / 0.88)) * 32 * vs;

  for (let i = 0; i < allies.length; i += 1) {
    const ap = allies[i];
    const cy = ap.y - 15 * vs;

    // Leading + trailing pair of exact symmetrical beveled aero-chevrons
    drawPrecisionChevron(ctx, ap.x + 5 * vs + slide * 0.58, cy, 0, {
      halfHeight: 17 * richness * vs,
      depth: 11 * richness * vs,
      thickness: 3.5 * richness * vs,
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: alpha * 0.94,
    });
    drawPrecisionChevron(ctx, ap.x - 10 * vs + slide * 0.44, cy, 0, {
      halfHeight: 13 * richness * vs,
      depth: 8.8 * richness * vs,
      thickness: 2.7 * richness * vs,
      color: pal.secondary,
      secondaryColor: pal.accent,
      coreColor: pal.core,
      alpha: alpha * 0.76,
    });

    // Razor-straight horizontal tailwind needle streaks + forward speed sparks
    if (!reduced) {
      drawTaperedNeedle(ctx, ap.x - 38 * vs + slide * 0.24, cy - 8 * vs, ap.x + 24 * vs + slide * 0.8, cy - 8 * vs, {
        width: 2.8 * vs,
        color: pal.primary,
        coreColor: pal.core,
        alpha: alpha * 0.88,
        peakRatio: 0.74,
      });
      drawTaperedNeedle(ctx, ap.x - 30 * vs + slide * 0.2, cy + 7 * vs, ap.x + 28 * vs + slide * 0.74, cy + 7 * vs, {
        width: 2.2 * vs,
        color: pal.secondary,
        coreColor: pal.core,
        alpha: alpha * 0.78,
        peakRatio: 0.74,
      });

      drawArtisticParticles(ctx, ap.x + slide * 0.2, cy, 34 * vs, 16 * vs, {
        count: 5 + tier,
        t,
        seed: seed + i * 41,
        shape: 'spark',
        motion: 'forward',
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: 0.84,
        vs,
        reduced,
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
