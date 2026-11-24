/**
 * UnitVfxMotionFamilies — Motion-First Procedural Animation Families for all
 * remaining archetypes across the 33-unit Star Struck roster:
 *   1. Lunar / Void-Blade (fluid deforming crescents & shearing mist petals)
 *   2. Cryo / Stasis / Prism 3D-Crystal (converging & tumbling 3D facets + frost sublimation)
 *   3. Molten Artillery / Heavy Seismic (curling smoke puffs + ballistic molten droplets)
 *   4. Kinetic Shield / Bastion (staggered cascading hard-light hex propagation)
 *   5. Aerodynamic Wind & Branching Storm Lightning (laminar eddies & crackling leaders)
 *   6. Sacred Buoyant Light & Viscous Corrupted Siphon (rising motes & peristaltic tendrils)
 *   7. 3D Gyroscopic Orbital & Void-Rift Tear (depth-sorted gyro rings & unzipping slits)
 *   8. Optical Laser Capacitor & Ionized Cooling (preserves 5-phase progressive laser contract)
 *
 * Strictly visual — never alters combat simulation timing, damage, or hitboxes.
 */

import {
  clamp01,
  easeOutCubic,
  easeOutQuart,
  smoothWindow,
  withAlpha,
  sampleQuadBezier,
  sampleCubicBezier,
  drawAnalyticalRibbon,
  drawSoftBloom,
  drawTaperedNeedle,
  drawTaperedBeamSpire,
  drawSteppedLightningBolt,
  createDetRng,
} from './NonUnitVfxGeometry.js';
import {
  easeInCubic,
  easeOutExpo,
  easeInOutBack,
  ratchetStepAngle,
  evaluateImpactStages,
  organicContourFactor,
  drawBoilingPlasmaBody,
  drawCrystalFacet3D,
} from './UnitVfxMotionEngine.js';

function safePos(v, min = 0.5) {
  return Number.isFinite(v) && v > min ? v : min;
}

// ============================================================================
// 1. LUNAR / VOID-BLADE MOTION FAMILY
//    (enemy_rift_stalker, enemy_dread_bannerman, elite_abyssal_executioner,
//     boss_obsidian_sovereign)
// ============================================================================

export function drawLunarPrepMotion(ctx, cx, cy, emX, emY, facing, s, intensity, isSkillPrep, elapsed, pal, reducedMotion = false) {
  const ease = easeOutCubic(intensity);
  const scaleMod = isSkillPrep ? 1.28 : 1.0;
  const dirAngle = facing > 0 ? 0 : Math.PI;

  ctx.save();
  // Twin curved moonlight ribbons whipping inward around the emitter horns
  for (const side of [-1, 1]) {
    const sweep = (1 - ease) * 1.15;
    const r = (15 - ease * 4) * s * scaleMod;
    drawAnalyticalRibbon(
      ctx,
      (u) => {
        const a = dirAngle + side * (0.25 + u * 1.25 + sweep * (1 - u));
        const rad = r * (0.72 + Math.sin(u * Math.PI) * 0.35);
        return {
          x: emX + Math.cos(a) * rad,
          y: emY + Math.sin(a) * rad * 0.85,
        };
      },
      {
        steps: 10,
        maxWidth: (isSkillPrep ? 3.2 : 2.4) * s * ease,
        color: side > 0 ? pal.primary : pal.secondary,
        coreColor: pal.core,
        alpha: 0.88 * ease,
        taperProfile: 'comet',
        coreRatio: 0.45,
        glowAlpha: 0.2,
      },
    );
  }

  // Orbiting silver-crimson moonlet motes condensing toward blade edge
  if (!reducedMotion) {
    const count = isSkillPrep ? 5 : 3;
    for (let i = 0; i < count; i += 1) {
      const a = elapsed * 4.5 * facing + (i * Math.PI * 2) / count;
      const dist = (17 * (1 - ease * 0.55) + 4) * s * scaleMod;
      const mx = emX + Math.cos(a) * dist;
      const my = emY + Math.sin(a) * dist * 0.65;
      ctx.fillStyle = withAlpha(i % 2 === 0 ? pal.core : pal.secondary, ease * 0.9);
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(1.0, (1.8 + (i % 2) * 0.7) * s), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  drawSoftBloom(ctx, emX, emY, (8 + ease * 7) * s * scaleMod, pal.core, pal.primary, ease * 0.5);
  ctx.restore();
}

/**
 * Living, velocity-deforming Lunar Crescent Energy Wave:
 * Multi-strand flowing crescent ribbons whose horns whip/lag behind motion
 * with orbiting moonlets and shearing dissipation petals (ZERO rigid crescent stamp!).
 */
export function drawLunarFlowWaveMotion(ctx, cx, cy, heading, s, t, seed, pal, {
  radiusScale = 1.0,
  isBoss = false,
  reducedMotion = false,
} = {}) {
  const ease = easeOutExpo(t);
  const fade = Math.max(0, 1 - easeInCubic(clamp01((t - 0.55) / 0.45)));
  if (fade <= 0.015) return;

  const ux = Math.cos(heading);
  const uy = Math.sin(heading);
  const nx = -uy;
  const ny = ux;
  const r = (isBoss ? 26 : 18) * s * radiusScale * (0.62 + ease * 0.55);
  // Horns lag dynamically behind the forward surge, then flare open as wave dissipates!
  const hornLag = (1 - ease) * 0.42 + t * 0.28;
  const span = Math.PI * (0.48 + ease * 0.16);

  ctx.save();
  drawSoftBloom(ctx, cx + ux * r * 0.2, cy + uy * r * 0.2, r * 1.15, pal.core, pal.primary, fade * 0.42);

  // Outer flowing crescent blade ribbon (deforms dynamically along heading + horn lag)
  const evalCrescent = (u, rMul = 1.0, lagMul = 1.0) => {
    const signed = (u - 0.5) * 2; // -1 .. +1
    const a = signed * span;
    const bend = Math.abs(signed) * Math.abs(signed) * hornLag * lagMul;
    const lx = (Math.cos(a) - bend * 0.9) * r * rMul;
    const ly = Math.sin(a) * r * 0.92 * rMul;
    return {
      x: cx + lx * ux - ly * uy,
      y: cy + lx * uy + ly * ux,
    };
  };

  drawAnalyticalRibbon(ctx, (u) => evalCrescent(u, 1.0, 1.0), {
    steps: 18,
    maxWidth: (isBoss ? 8.5 : 5.8) * s * radiusScale * (1 - t * 0.45),
    color: pal.primary,
    coreColor: pal.core,
    alpha: fade * 0.96,
    taperProfile: 'crescent',
    coreRatio: 0.42,
    glowWidthMultiplier: 1.85,
    glowAlpha: 0.26,
  });

  // Secondary inner lagging moonlight echo strand (different velocity & thinner profile!)
  drawAnalyticalRibbon(ctx, (u) => evalCrescent(u, 0.78, 1.55), {
    steps: 14,
    maxWidth: (isBoss ? 4.2 : 3.0) * s * radiusScale * (1 - t * 0.4),
    color: pal.secondary,
    coreColor: pal.core,
    alpha: fade * 0.78,
    taperProfile: 'spindle',
    coreRatio: 0.5,
    glowAlpha: 0.16,
  });

  // Trailing whipped moonlight streamers peeling off both crescent horns
  if (!reducedMotion) {
    for (const side of [-1, 1]) {
      const hornTip = evalCrescent(side > 0 ? 0.96 : 0.04, 1.0, 1.0);
      const flutter = Math.sin(t * 14 + side * 2.1 + (seed || 3)) * 5 * s;
      const tailEnd = {
        x: hornTip.x - ux * (20 + ease * 14) * s * radiusScale + nx * (side * 6 * s + flutter),
        y: hornTip.y - uy * (20 + ease * 14) * s * radiusScale + ny * (side * 6 * s + flutter),
      };
      const ctrl = {
        x: (hornTip.x + tailEnd.x) * 0.5 - nx * flutter * 0.6,
        y: (hornTip.y + tailEnd.y) * 0.5 - ny * flutter * 0.6,
      };
      drawAnalyticalRibbon(ctx, (u) => sampleQuadBezier(tailEnd, ctrl, hornTip, u), {
        steps: 10,
        maxWidth: (isBoss ? 3.2 : 2.3) * s * fade,
        color: pal.secondary,
        coreColor: pal.core,
        alpha: fade * 0.8,
        taperProfile: 'comet',
        coreRatio: 0.45,
        glowAlpha: 0.14,
      });
    }

    // Orbiting / shearing crescent mist motes peeling off into dark-silver dissipation
    const rng = createDetRng((seed || 17) + 29);
    const moteCount = isBoss ? 8 : 5;
    for (let i = 0; i < moteCount; i += 1) {
      const u = 0.15 + (i / Math.max(1, moteCount - 1)) * 0.7;
      const anchor = evalCrescent(u, 0.92, 1.1);
      const drift = easeOutCubic(t) * (8 + rng() * 14) * s * radiusScale;
      const mx = anchor.x - ux * drift + nx * (rng() - 0.5) * 10 * s;
      const my = anchor.y - uy * drift + ny * (rng() - 0.5) * 10 * s - t * 6 * s;
      ctx.fillStyle = withAlpha(i % 2 === 0 ? pal.core : pal.secondary, fade * 0.85);
      ctx.beginPath();
      ctx.ellipse(mx, my, safePos((2.8 - t * 1.4) * s, 0.8), safePos((1.2 - t * 0.5) * s, 0.6), heading + (rng() - 0.5) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ============================================================================
// 2. CRYO / STASIS / PRISM 3D-CRYSTAL FAMILY
//    (enemy_cryo_warden, enemy_stasis_weaver, elite_cryo_archwarden,
//     elite_astral_sniper, boss_relay_archon)
// ============================================================================

export function drawConvergingCrystalsMotion(ctx, startP, targetP, progress, s, elapsed, seed, pal, {
  lanes = [-20, 0, 20],
  isBoss = false,
  reducedMotion = false,
} = {}) {
  const adx = targetP.x - startP.x;
  const ady = targetP.y - startP.y;
  const dist = Math.max(10, Math.hypot(adx, ady));
  const anx = -ady / dist;
  const any = adx / dist;

  ctx.save();
  const positions = [];
  for (let i = 0; i < lanes.length; i += 1) {
    const lat = lanes[i] * s;
    const centerIdx = (lanes.length - 1) * 0.5;
    const stagger = Math.abs(i - centerIdx) * 0.055;
    const rawU = clamp01((progress - stagger * 0.45) / Math.max(0.1, 1 - stagger * 0.45));
    // Smooth acceleration into target convergence
    const uNow = rawU < 0.35 ? easeOutCubic(rawU / 0.35) * 0.32 : 0.32 + Math.pow((rawU - 0.35) / 0.65, 1.18) * 0.68;

    const origin = {
      x: startP.x + anx * lat * 0.32,
      y: startP.y + any * lat * 0.32,
    };
    const c1 = { x: startP.x + adx * 0.3 + anx * lat, y: startP.y + ady * 0.3 + any * lat - 6 * s };
    const c2 = { x: startP.x + adx * 0.74 + anx * lat * 0.58, y: startP.y + ady * 0.74 + any * lat * 0.58 };
    const sample = (u) => sampleCubicBezier(origin, c1, c2, targetP, u);
    const cur = sample(uNow);
    const localHeading = Math.atan2(cur.ty, cur.tx);
    const isCenter = Math.abs(i - centerIdx) < 0.5;
    positions.push(cur);

    // Prismatic refraction contrail
    drawAnalyticalRibbon(ctx, sample, {
      uStart: Math.max(0, uNow - 0.44),
      uEnd: uNow,
      steps: 14,
      maxWidth: (isCenter ? 3.8 : 2.6) * s * (isBoss ? 1.12 : 1),
      color: i % 2 === 0 ? pal.primary : pal.secondary,
      coreColor: pal.core,
      alpha: 0.86,
      taperProfile: 'comet',
      coreRatio: 0.48,
      glowWidthMultiplier: 1.65,
      glowAlpha: 0.22,
    });

    // Real 3D-tumbling crystal facet catching dynamic specular light!
    drawCrystalFacet3D(
      ctx,
      cur.x,
      cur.y,
      (isCenter ? (isBoss ? 22 : 18) : (isBoss ? 16 : 13.5)) * s,
      (isCenter ? (isBoss ? 7.4 : 6.0) : (isBoss ? 5.6 : 4.6)) * s,
      {
        yaw: localHeading,
        pitch: 0.22 + Math.sin(elapsed * 4 + i) * 0.12,
        roll: elapsed * (5.5 + i * 1.4) * (i % 2 === 0 ? 1 : -1) + (seed || 0) * 0.1,
        primary: i % 2 === 0 ? pal.primary : pal.secondary,
        secondary: pal.secondary,
        core: pal.core,
        shadow: pal.glow || '#1e1b4b',
        alpha: 0.98,
      },
    );
  }

  // Translucent shimmering harmonic refraction filaments connecting converging shards
  if (!reducedMotion && positions.length >= 3) {
    ctx.strokeStyle = withAlpha(pal.secondary, 0.48 + Math.sin(elapsed * 16) * 0.16);
    ctx.lineWidth = 1.25 * s;
    ctx.beginPath();
    ctx.moveTo(positions[0].x, positions[0].y);
    for (let i = 1; i < positions.length; i += 1) {
      ctx.lineTo(positions[i].x, positions[i].y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function drawGlacialLanceMotion(ctx, pos, heading, progress, s, elapsed, seed, pal, {
  isTri = false,
  reducedMotion = false,
} = {}) {
  const ux = Math.cos(heading);
  const uy = Math.sin(heading);
  const nx = -uy;
  const ny = ux;

  ctx.save();
  const drawSingleIce = (ox, oy, sc, alphaMul, idx) => {
    // Frost contrail ribbon + curling icy vapor wisps
    const tailLen = (30 + smoothWindow(progress, 0.1, 0.5, 1.0) * 14) * s * sc;
    drawTaperedNeedle(ctx, ox - ux * tailLen, oy - uy * tailLen, ox + ux * 5 * s * sc, oy + uy * 5 * s * sc, {
      width: 4.2 * s * sc,
      color: pal.secondary,
      coreColor: pal.core,
      alpha: 0.84 * alphaMul,
      peakRatio: 0.84,
    });
    if (!reducedMotion) {
      for (let v = 0; v < 3; v += 1) {
        const lag = (10 + v * 9) * s * sc;
        const curl = Math.sin(elapsed * 8 + v * 2.2 + idx) * (3 + v * 1.5) * s * sc;
        const vx = ox - ux * lag + nx * curl;
        const vy = oy - uy * lag + ny * curl - v * 1.8 * s;
        ctx.fillStyle = withAlpha(pal.secondary, (0.44 - v * 0.12) * alphaMul);
        ctx.beginPath();
        ctx.arc(vx, vy, (2.6 + v * 1.2) * s * sc, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 3D-faceted spinning glacial icicle lance
    drawCrystalFacet3D(ctx, ox + ux * 2 * s * sc, oy + uy * 2 * s * sc, 24 * s * sc, 7.8 * s * sc, {
      yaw: heading,
      pitch: 0.18,
      roll: elapsed * (5.2 + idx * 1.5),
      primary: pal.primary,
      secondary: pal.secondary,
      core: pal.core,
      shadow: '#0c4a6e',
      alpha: 0.98 * alphaMul,
    });
  };

  drawSoftBloom(ctx, pos.x, pos.y, 13 * s, pal.core, pal.primary, 0.45);
  drawSingleIce(pos.x, pos.y, isTri ? 1.08 : 1.0, 1.0, 0);
  if (isTri) {
    // Wing shards breathe slightly outward then tighten into V-formation
    const spread = (10.5 - progress * 3.5) * s;
    for (const side of [-1, 1]) {
      drawSingleIce(
        pos.x - ux * 11 * s + nx * side * spread,
        pos.y - uy * 11 * s + ny * side * spread,
        0.74,
        0.92,
        side > 0 ? 1 : 2,
      );
    }
  }
  ctx.restore();
}

export function drawCrystalCageImpactMotion(ctx, px, py, s, t, seed, pal, {
  shardCount = 6,
  isSkill = false,
  isCage = true,
  reducedMotion = false,
} = {}) {
  const st = evaluateImpactStages(t, 0.18, 0.66);
  const rng = createDetRng((seed || 89) + 13);
  const scaleMul = isSkill ? 1.4 : 1.1;

  ctx.save();
  const baseR = (isCage ? 21 : 17) * s * scaleMul;

  if (st.phase === 'pinch') {
    const lock = easeOutCubic(st.pinchT);
    drawSoftBloom(ctx, px, py, (10 + lock * 10) * s * scaleMul, pal.core, pal.primary, lock * 0.56);
    for (let i = 0; i < shardCount; i += 1) {
      const a = (i / shardCount) * Math.PI * 2 + 0.3;
      const dist = baseR * (1.45 - lock * 0.52);
      drawCrystalFacet3D(ctx, px + Math.cos(a) * dist, py + Math.sin(a) * dist * 0.68, 13 * s * scaleMul, 4.8 * s * scaleMul, {
        yaw: a + Math.PI,
        pitch: 0.25,
        roll: st.pinchT * 3 + i,
        primary: pal.primary,
        secondary: pal.secondary,
        core: pal.core,
        shadow: pal.glow || '#0c4a6e',
        alpha: lock * 0.96,
      });
    }
    ctx.restore();
    return;
  }

  const burst = easeOutExpo(st.burstT);
  const cool = easeInCubic(st.coolT);
  const fade = Math.max(0, 1 - cool);

  drawSoftBloom(ctx, px, py, (16 + burst * 14) * s * scaleMul, pal.core, pal.primary, 0.45 * fade);

  const ringPts = [];
  for (let i = 0; i < shardCount; i += 1) {
    const baseA = (i / shardCount) * Math.PI * 2 + 0.3 + (isCage ? burst * 0.45 : 0);
    // Cage holds tight then shatters outward on coolT; snowflake bursts outward with gravity immediately!
    const dist = isCage
      ? baseR * (0.88 + cool * 0.95)
      : baseR * (0.45 + burst * 0.9 + cool * 0.55);
    const sx = px + Math.cos(baseA) * dist;
    const grav = isCage ? cool * cool * 12 * s : st.burstT * st.burstT * 10 * s + cool * cool * 16 * s;
    const sy = py + Math.sin(baseA) * dist * 0.68 - (isCage ? 0 : Math.sin(st.burstT * Math.PI) * 8 * s) + grav;
    ringPts.push({ x: sx, y: sy });

    drawCrystalFacet3D(
      ctx,
      sx,
      sy,
      (13.5 - cool * 5.5) * s * scaleMul,
      (4.8 - cool * 1.8) * s * scaleMul,
      {
        yaw: isCage ? baseA + Math.PI + cool * 1.6 : baseA + cool * 2.2,
        pitch: 0.24 + rng() * 0.4,
        roll: t * (5 + (i % 3) * 2.5) * (i % 2 === 0 ? 1 : -1),
        primary: i % 2 === 0 ? pal.primary : pal.secondary,
        secondary: pal.secondary,
        core: pal.core,
        shadow: pal.glow || '#0c4a6e',
        alpha: fade * 0.96,
      },
    );
  }

  // Shimmering crystalline lattice threads while cage holds during burst phase
  if (isCage && !reducedMotion && st.coolT < 0.45 && ringPts.length >= 3) {
    const wireAlpha = (1 - st.coolT / 0.45) * 0.62;
    ctx.strokeStyle = withAlpha(pal.secondary, wireAlpha);
    ctx.lineWidth = 1.25 * s;
    ctx.beginPath();
    ctx.moveTo(ringPts[0].x, ringPts[0].y);
    for (let i = 1; i < ringPts.length; i += 1) ctx.lineTo(ringPts[i].x, ringPts[i].y);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

// ============================================================================
// 3. MOLTEN ARTILLERY / HEAVY SEISMIC MOTION FAMILY
//    (vanguard_breaker, enemy_inferno_bombardier, elite_inferno_captain,
//     enemy_siege_juggernaut, elite_siege_colossus, boss_astral_leviathan)
// ============================================================================

export function drawArtilleryPrepMotion(ctx, cx, cy, emX, emY, facing, s, intensity, isSkillPrep, elapsed, pal, reducedMotion = false) {
  const ease = easeOutCubic(intensity);
  const scaleMod = isSkillPrep ? 1.28 : 1.0;

  ctx.save();
  // Pressurizing molten furnace core pulsing inside muzzle/hammer
  drawBoilingPlasmaBody(ctx, emX, emY, (3.2 + easeInCubic(intensity) * 5.6) * s * scaleMod, {
    primary: pal.primary,
    secondary: pal.secondary,
    core: pal.core,
    glow: pal.glow,
    alpha: 0.48 + ease * 0.48,
    phase: elapsed * 6.5,
    seed: 29,
    turbulence: 0.28,
    samples: 10,
  });

  // Rising dark-ash curling smoke wisps & hot furnace sparks venting out of chamber
  if (!reducedMotion) {
    const puffCount = isSkillPrep ? 4 : 3;
    for (let i = 0; i < puffCount; i += 1) {
      const life = ((elapsed * 1.7 + i / puffCount) % 1);
      const px = emX - facing * life * 6 * s + Math.sin(life * 5 + i * 2) * 4 * s;
      const py = emY - life * (16 + i * 3) * s * scaleMod;
      const r = (2.2 + life * 3.8) * s * scaleMod;
      ctx.fillStyle = withAlpha('#64748b', Math.sin(life * Math.PI) * ease * 0.42);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      if (life < 0.65) {
        ctx.fillStyle = withAlpha(pal.secondary, (1 - life / 0.65) * ease * 0.9);
        ctx.beginPath();
        ctx.arc(px + 2 * s, py + 1 * s, Math.max(0.9, (1.8 - life) * s), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

export function drawArtillerySmokeTrail(ctx, pos, heading, progress, s, elapsed, seed, pal, isElite = false, reducedMotion = false) {
  const ux = Math.cos(heading);
  const uy = Math.sin(heading);
  const nx = -uy;
  const ny = ux;

  ctx.save();
  // Incandescent turbulent exhaust plume
  drawTaperedNeedle(ctx, pos.x - ux * 28 * s, pos.y - uy * 28 * s, pos.x - ux * 3 * s, pos.y - uy * 3 * s, {
    width: (isElite ? 6.8 : 5.4) * s,
    color: pal.primary,
    coreColor: pal.secondary,
    alpha: 0.86,
    peakRatio: 0.8,
  });

  // Detached curling billowing smoke puffs expanding & rising buoyantly behind shell!
  if (!reducedMotion) {
    const puffCount = isElite ? 5 : 4;
    for (let i = 0; i < puffCount; i += 1) {
      const lag = (7 + i * 8.5) * s;
      const curl = Math.sin(elapsed * 7 + i * 1.9 + (seed || 5)) * (2.5 + i * 1.4) * s;
      const rise = -(i * i * 1.4) * s;
      const px = pos.x - ux * lag + nx * curl;
      const py = pos.y - uy * lag + ny * curl + rise;
      const pr = (3.0 + i * 1.35) * s * (isElite ? 1.15 : 1);
      const fade = Math.max(0.1, 0.56 - i * 0.11);
      ctx.fillStyle = withAlpha('#475569', fade);
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      // Under-lit warm ember rim on closest puffs
      if (i < 2) {
        ctx.strokeStyle = withAlpha(pal.primary, fade * 1.1);
        ctx.lineWidth = 1.2 * s;
        ctx.beginPath();
        ctx.arc(px, py, pr * 0.88, heading - 1.1, heading + 1.1);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

export function drawArtilleryBlastMotion(ctx, px, py, s, t, seed, pal, {
  isBoss = false,
  reducedMotion = false,
} = {}) {
  const st = evaluateImpactStages(t, 0.14, 0.66);
  const rng = createDetRng((seed || 73) + 11);
  const scaleMul = isBoss ? 1.55 : 1.22;

  ctx.save();
  if (st.phase === 'pinch') {
    const p = easeOutCubic(st.pinchT);
    drawSoftBloom(ctx, px, py, (12 + p * 12) * s * scaleMul, '#ffffff', pal.secondary, 0.85 * p);
    ctx.restore();
    return;
  }

  const burst = easeOutExpo(st.burstT);
  const cool = easeInCubic(st.coolT);
  const fade = Math.max(0, 1 - cool);

  // Expanding warm blast flash
  drawSoftBloom(ctx, px, py - burst * 6 * s, (20 + burst * 18) * s * scaleMul, pal.core, pal.primary, 0.55 * fade * (1 - st.burstT * 0.35));

  // Rising, swirling dark ash puffs under-lit with orange fire
  const smokeCount = isBoss ? 6 : 5;
  for (let i = 0; i < smokeCount; i += 1) {
    const age = clamp01((t - 0.1 - i * 0.035) / 0.88);
    if (age <= 0.02) continue;
    const pEase = easeOutCubic(age);
    const pFade = Math.max(0, 1 - easeInCubic(clamp01((age - 0.38) / 0.62)));
    const a = -Math.PI * 0.92 + (i / Math.max(1, smokeCount - 1)) * Math.PI * 0.84 + (rng() - 0.5) * 0.25;
    const dist = (10 + rng() * 14) * s * scaleMul * pEase;
    const sx = px + Math.cos(a) * dist + Math.sin(age * 4.5 + i) * 4 * s;
    const sy = py + Math.sin(a) * dist * 0.55 - age * age * (18 + rng() * 10) * s * scaleMul;
    const sr = (5.5 + pEase * 6.5) * s * scaleMul;
    ctx.fillStyle = withAlpha('#334155', pFade * 0.56);
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
    // Glowing under-lit ember belly
    ctx.fillStyle = withAlpha(age < 0.45 ? pal.secondary : pal.primary, pFade * (0.72 - age * 0.4));
    ctx.beginPath();
    ctx.arc(sx, sy + sr * 0.25, sr * 0.62, 0, Math.PI * 2);
    ctx.fill();
  }

  // Central boiling incandescent blast dome
  if (st.burstT < 0.82) {
    const coreFade = 1 - st.burstT / 0.82;
    drawBoilingPlasmaBody(ctx, px, py - burst * 8 * s, (9 + burst * 7) * s * scaleMul * (0.45 + coreFade * 0.55), {
      primary: pal.primary,
      secondary: pal.secondary,
      core: pal.core,
      glow: pal.glow,
      alpha: coreFade * 0.94,
      phase: t * 11,
      seed,
      stretchY: 1.2,
      turbulence: 0.38,
      samples: 12,
    });
  }

  // Ballistic gravity-bouncing incandescent molten shrapnel & rock fragments!
  if (!reducedMotion) {
    const fragCount = isBoss ? 12 : 8;
    const age = clamp01((t - 0.08) / 0.92);
    for (let k = 0; k < fragCount; k += 1) {
      const ang = -Math.PI * 0.95 + rng() * Math.PI * 0.9;
      const spd = (24 + rng() * 28) * s * scaleMul;
      const vx = Math.cos(ang) * spd;
      const vy = Math.sin(ang) * spd * 0.85 - (14 + rng() * 14) * s * scaleMul;
      const dragT = easeOutCubic(age);
      const fx = px + vx * dragT;
      let fy = py + vy * dragT + 0.5 * (56 * s * scaleMul) * age * age;
      const floorY = py + (8 + rng() * 5) * s;
      if (fy > floorY) {
        fy = floorY - Math.min((fy - floorY) * 0.34, 5.5 * s);
      }
      const coolR = clamp01(age * 1.15);
      const col = coolR < 0.35 ? pal.core : coolR < 0.7 ? pal.secondary : pal.primary;
      drawTaperedNeedle(ctx, fx - vx * 0.04, fy - (vy + 45 * age) * 0.03, fx, fy, {
        width: Math.max(1.2, (2.8 - coolR * 1.6) * s),
        color: col,
        coreColor: pal.core,
        alpha: (1 - coolR) * fade * 0.95,
        peakRatio: 0.78,
      });
    }
  }
  ctx.restore();
}

// ============================================================================
// 4. KINETIC SHIELD / CASCADING HARD-LIGHT BASTION FAMILY
//    (heavy_shield_guard, elite_iron_bulwark, boss_bastion_warden, shield supports)
// ============================================================================

function drawAnimatedHexCell(ctx, cx, cy, r, tilt, flipScale, pal, alpha) {
  if (alpha <= 0.015 || r < 2 || flipScale <= 0.05) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.scale(flipScale, 1);

  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = (i * Math.PI) / 3;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = withAlpha(pal.primary, alpha * 0.22);
  ctx.fill();
  ctx.strokeStyle = withAlpha(pal.secondary, alpha * 0.92);
  ctx.lineWidth = Math.max(1.1, r * 0.16);
  ctx.stroke();

  // Inner bright specular bevel arc along leading face
  ctx.strokeStyle = withAlpha(pal.core, alpha * 0.85);
  ctx.lineWidth = Math.max(0.8, r * 0.09);
  ctx.beginPath();
  ctx.moveTo(Math.cos(-Math.PI / 3) * r * 0.72, Math.sin(-Math.PI / 3) * r * 0.72);
  ctx.lineTo(r * 0.72, 0);
  ctx.lineTo(Math.cos(Math.PI / 3) * r * 0.72, Math.sin(Math.PI / 3) * r * 0.72);
  ctx.stroke();
  ctx.restore();
}

export function drawShieldPrepMotion(ctx, cx, cy, emX, emY, facing, s, intensity, isSkillPrep, elapsed, pal) {
  const dirA = facing > 0 ? 0 : Math.PI;
  const cells = isSkillPrep ? [-1, 0, 1] : [0];

  ctx.save();
  for (let i = 0; i < cells.length; i += 1) {
    const off = cells[i];
    const stagger = clamp01((intensity - Math.abs(off) * 0.18) / Math.max(0.1, 1 - Math.abs(off) * 0.18));
    if (stagger <= 0.02) continue;
    const flip = clamp01(easeInOutBack(stagger, 1.05));
    const r = (isSkillPrep ? 8.2 : 7.0) * s * (0.65 + flip * 0.35);
    const ox = emX + facing * (2 + flip * 4 - Math.abs(off) * 3) * s;
    const oy = emY + off * 11 * s;
    drawAnimatedHexCell(ctx, ox, oy, r, dirA + off * 0.16, flip, pal, stagger * 0.94);
  }
  ctx.restore();
}

export function drawShieldWaveMotion(ctx, px, py, heading, s, t, seed, pal, {
  plateCount = 3,
  isBoss = false,
  reducedMotion = false,
} = {}) {
  const st = evaluateImpactStages(t, 0.14, 0.7);
  const ux = Math.cos(heading);
  const uy = Math.sin(heading);
  const nx = -uy;
  const ny = ux;
  const scaleMul = isBoss ? 1.32 : 1.05;

  ctx.save();
  // Stage 1: Brief kinetic compression flash at shield face
  if (st.phase === 'pinch') {
    const p = easeOutCubic(st.pinchT);
    drawSoftBloom(ctx, px, py, (10 + p * 8) * s * scaleMul, pal.core, pal.primary, p * 0.65);
  }

  // Stage 2 & 3: Staggered sequential cascading hard-light hex wave propagation + metallic bounce chips!
  const half = (plateCount - 1) * 0.5;
  for (let i = 0; i < plateCount; i += 1) {
    const idx = i - half;
    const delay = Math.abs(idx) * 0.09;
    const lt = clamp01((t - delay) / Math.max(0.15, 1 - delay));
    if (lt <= 0.01) continue;
    const surge = easeOutExpo(lt);
    const fade = Math.max(0, 1 - easeInCubic(clamp01((lt - 0.45) / 0.55)));
    const flip = clamp01(lt < 0.25 ? lt / 0.25 : 1 - clamp01((lt - 0.65) / 0.35) * 0.5);

    const fwd = (5 + surge * (isBoss ? 22 : 16) - Math.abs(idx) * 4) * s * scaleMul;
    const lat = idx * (11 + surge * 6) * s * scaleMul;
    const cx = px + ux * fwd + nx * lat;
    const cy = py + uy * fwd + ny * lat;
    const r = (isBoss ? 9.5 : 7.6) * s * scaleMul * (1 - Math.abs(idx) * 0.12);
    drawAnimatedHexCell(ctx, cx, cy, r, heading + idx * 0.24, flip, pal, fade * 0.94);
  }

  // Directional kinetic compression wake arc
  const waveEase = easeOutExpo(t);
  const waveFade = Math.max(0, 1 - easeInCubic(t));
  const waveR = (12 + waveEase * 18) * s * scaleMul;
  drawAnalyticalRibbon(
    ctx,
    (u) => {
      const a = heading + (u - 0.5) * 1.45;
      return {
        x: px + Math.cos(a) * waveR,
        y: py + Math.sin(a) * waveR * 0.82,
      };
    },
    {
      steps: 14,
      maxWidth: (isBoss ? 5.2 : 3.8) * s * waveFade,
      color: pal.primary,
      coreColor: pal.core,
      alpha: waveFade * 0.92,
      taperProfile: 'crescent',
      coreRatio: 0.45,
      glowAlpha: 0.22,
    },
  );

  // Ballistic metallic impact chips bouncing off floor with gravity
  if (!reducedMotion) {
    const rng = createDetRng((seed || 37) + 19);
    const chips = isBoss ? 8 : 5;
    for (let c = 0; c < chips; c += 1) {
      const ang = heading + (rng() - 0.5) * 1.5;
      const spd = (18 + rng() * 20) * s * scaleMul;
      const age = clamp01((t - 0.08) / 0.92);
      const cx = px + Math.cos(ang) * spd * easeOutCubic(age);
      let cy = py + Math.sin(ang) * spd * 0.6 * easeOutCubic(age) - (8 + rng() * 8) * s * age + 24 * s * age * age;
      const floorY = py + 9 * s;
      if (cy > floorY) cy = floorY - (cy - floorY) * 0.35;
      ctx.fillStyle = withAlpha(c % 2 === 0 ? pal.secondary : pal.core, (1 - age) * 0.92);
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1.0, (2.2 - age * 1.2) * s), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ============================================================================
// 5. AERODYNAMIC WIND & BRANCHING STORM LIGHTNING FAMILY
//    (wind_cavalry, elite_storm_lancer)
// ============================================================================

export function drawWindLanceMotion(ctx, startP, targetP, heading, s, t, seed, pal, reducedMotion = false) {
  const ease = easeOutExpo(t);
  const fade = Math.max(0, 1 - easeInCubic(clamp01((t - 0.48) / 0.52)));
  if (fade <= 0.015) return;

  const ux = Math.cos(heading);
  const uy = Math.sin(heading);
  const nx = -uy;
  const ny = ux;
  const tipX = targetP.x + ux * (16 + ease * 14) * s;
  const tipY = targetP.y + uy * (16 + ease * 14) * s;

  ctx.save();
  // Razor aerodynamic gale spearhead needle
  drawTaperedNeedle(ctx, startP.x - ux * 6 * s, startP.y - uy * 6 * s, tipX, tipY, {
    width: 5.4 * s * (1 - t * 0.4),
    color: pal.primary,
    coreColor: pal.core,
    alpha: fade * 0.96,
    peakRatio: 0.74,
  });

  // Twin whipping laminar airflow ribbons curling into spinning vortex eddies behind the thrust!
  for (const side of [-1, 1]) {
    const amp = side * (9 + ease * 11) * s;
    const p0 = { x: startP.x, y: startP.y };
    const p1 = { x: targetP.x - ux * 6 * s + nx * amp, y: targetP.y - uy * 6 * s + ny * amp };
    const p2 = {
      x: tipX - ux * (4 + t * 10) * s + nx * amp * (0.45 + t * 0.45),
      y: tipY - uy * (4 + t * 10) * s + ny * amp * (0.45 + t * 0.45),
    };
    drawAnalyticalRibbon(ctx, (u) => sampleQuadBezier(p0, p1, p2, u), {
      uStart: clamp01(t * 0.55 - 0.1),
      uEnd: Math.min(1, 0.35 + ease * 0.65),
      steps: 14,
      maxWidth: 3.0 * s * fade,
      color: side > 0 ? pal.secondary : pal.primary,
      coreColor: pal.core,
      alpha: fade * 0.88,
      taperProfile: 'comet',
      coreRatio: 0.45,
      glowAlpha: 0.18,
    });

    // Detached curling laminar eddy spiral shedding off the flank during follow-through
    if (!reducedMotion && t > 0.22) {
      const eddyT = clamp01((t - 0.22) / 0.78);
      const ecx = targetP.x - ux * (6 + eddyT * 10) * s + nx * side * (11 + eddyT * 8) * s;
      const ecy = targetP.y - uy * (6 + eddyT * 10) * s + ny * side * (11 + eddyT * 8) * s;
      const eddyFade = Math.sin(eddyT * Math.PI) * 0.8;
      drawAnalyticalRibbon(
        ctx,
        (u) => {
          const a = side * (u * Math.PI * 2.1 + eddyT * 5.2);
          const rad = (2.0 + u * 6.5) * s * (0.65 + eddyT * 0.5);
          return { x: ecx + Math.cos(a) * rad, y: ecy + Math.sin(a) * rad * 0.75 };
        },
        {
          steps: 12,
          maxWidth: 1.8 * s * eddyFade,
          color: pal.secondary,
          coreColor: pal.core,
          alpha: eddyFade,
          taperProfile: 'spindle',
          coreRatio: 0.4,
          glowAlpha: 0.12,
        },
      );
    }
  }
  ctx.restore();
}

export function drawStormLanceMotion(ctx, startP, targetP, heading, s, t, seed, pal, reducedMotion = false) {
  const ease = easeOutExpo(t);
  const fade = Math.max(0, 1 - easeInCubic(clamp01((t - 0.5) / 0.5)));
  if (fade <= 0.015) return;

  const ux = Math.cos(heading);
  const uy = Math.sin(heading);
  const nx = -uy;
  const ny = ux;
  const tipX = targetP.x + ux * (18 + ease * 14) * s;
  const tipY = targetP.y + uy * (18 + ease * 14) * s;
  const stepIdx = Math.floor(t * 7);

  ctx.save();
  drawSoftBloom(ctx, targetP.x, targetP.y, (14 + ease * 10) * s, pal.core, pal.primary, fade * 0.56);
  drawTaperedNeedle(ctx, startP.x, startP.y, tipX, tipY, {
    width: 6.2 * s * (1 - t * 0.4),
    color: pal.primary,
    coreColor: pal.core,
    alpha: fade * 0.96,
    peakRatio: 0.72,
  });

  // Irregular snapping biological lightning leaders (updates crisply at discrete discharge steps!)
  for (let b = 0; b < 2; b += 1) {
    drawSteppedLightningBolt(ctx, startP.x, startP.y, tipX, tipY, {
      segments: 7,
      amplitude: (b === 0 ? 11 : 7) * s,
      width: (b === 0 ? 2.6 : 1.7) * s * (1 - t * 0.35),
      color: b === 0 ? pal.secondary : pal.primary,
      secondaryColor: pal.primary,
      coreColor: pal.core,
      alpha: fade * 0.96,
      seed: (seed || 17) + b * 61,
      stepIndex: stepIdx,
    });
  }

  // Ground-seeking forked discharge branch + bouncing electric sparks
  if (!reducedMotion) {
    const rng = createDetRng((seed || 17) + stepIdx * 13);
    const branchX = targetP.x + nx * (rng() > 0.5 ? 1 : -1) * (14 + rng() * 10) * s;
    const branchY = targetP.y + (10 + rng() * 8) * s;
    drawSteppedLightningBolt(ctx, targetP.x, targetP.y, branchX, branchY, {
      segments: 4,
      amplitude: 5 * s,
      width: 1.5 * s * fade,
      color: pal.secondary,
      secondaryColor: pal.primary,
      coreColor: pal.core,
      alpha: fade * 0.88,
      seed: (seed || 17) + 109,
      stepIndex: stepIdx,
    });
    for (let k = 0; k < 6; k += 1) {
      const a = heading + (rng() - 0.5) * 2.4;
      const dist = (10 + ease * 22 * rng()) * s;
      const sx = targetP.x + Math.cos(a) * dist;
      let sy = targetP.y + Math.sin(a) * dist * 0.65 + 24 * s * t * t - 10 * s * t;
      if (sy > targetP.y + 10 * s) sy = targetP.y + 10 * s - (sy - (targetP.y + 10 * s)) * 0.4;
      ctx.fillStyle = withAlpha(k % 2 === 0 ? '#ffffff' : pal.primary, fade * 0.94);
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(1.0, (2.2 - t * 1.2) * s), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ============================================================================
// 6. SACRED BUOYANT LIGHT & VISCOUS CORRUPTED SIPHON FAMILY
//    (field_cleric offense/heal, enemy_corrupted_acolyte offense/heal)
// ============================================================================

export function drawSacredJudgmentMotion(ctx, startP, targetP, targetGroundP, progress, s, elapsed, seed, pal, reducedMotion = false) {
  const gatherT = clamp01(progress / 0.48);
  const dropT = clamp01((progress - 0.34) / 0.66);
  const skyY = targetP.y - 54 * s;

  ctx.save();
  // Warm radiant ground focus bloom (soft & open, zero heavy flat stamp)
  drawSoftBloom(ctx, targetGroundP.x, targetGroundP.y, (16 + easeOutCubic(gatherT) * 10) * s, pal.core, pal.primary, 0.38, 0.46);

  // Rising buoyant S-curve golden invocation motes ascending from ground into overhead focal spire
  if (!reducedMotion) {
    for (let i = 0; i < 6; i += 1) {
      const mT = ((elapsed * 1.9 + i / 6) % 1);
      const sway = Math.sin(mT * Math.PI * 2 + i * 1.4) * 9 * s * (1 - mT * 0.65);
      const mx = targetGroundP.x + sway;
      const my = targetGroundP.y - mT * 52 * s;
      ctx.fillStyle = withAlpha(i % 2 === 0 ? pal.core : pal.secondary, Math.sin(mT * Math.PI) * 0.9);
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(1.0, (2.2 - mT * 0.8) * s), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Slender living golden prayer filament arching from cleric to overhead focal point
  const invFade = Math.max(0, 1 - dropT * 0.65);
  if (invFade > 0.05) {
    const ctrl = {
      x: (startP.x + targetP.x) * 0.5,
      y: Math.min(startP.y, skyY) - 10 * s,
    };
    drawAnalyticalRibbon(ctx, (u) => sampleQuadBezier(startP, ctrl, { x: targetP.x, y: skyY }, u), {
      uStart: 0,
      uEnd: clamp01(progress * 2.3),
      steps: 14,
      maxWidth: 2.3 * s,
      color: pal.secondary,
      coreColor: pal.core,
      alpha: invFade * 0.78,
      taperProfile: 'spindle',
      coreRatio: 0.5,
      glowAlpha: 0.16,
    });
  }

  // Condensing descending judgment light column + twin spiraling ribbon streams!
  if (dropT > 0.01) {
    const dropEase = easeOutExpo(dropT);
    const tipY = skyY + (targetGroundP.y - skyY) * dropEase;
    drawTaperedBeamSpire(ctx, targetP.x, tipY, skyY - 12 * s, {
      baseWidth: (9.5 + dropEase * 5) * s,
      topWidth: 2.2 * s,
      tipHeight: 16 * s,
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: 0.94,
      mode: 'lance',
    });
    if (!reducedMotion) {
      for (const side of [-1, 1]) {
        drawAnalyticalRibbon(
          ctx,
          (u) => {
            const y = skyY + (tipY - skyY) * u;
            const x = targetP.x + Math.sin(u * Math.PI * 2.4 - elapsed * 10 + (side > 0 ? 0 : Math.PI)) * (7 * (1 - u * 0.4)) * s;
            return { x, y };
          },
          {
            steps: 14,
            maxWidth: 2.2 * s,
            color: pal.secondary,
            coreColor: pal.core,
            alpha: 0.84,
            taperProfile: 'comet',
            coreRatio: 0.45,
            glowAlpha: 0.14,
          },
        );
      }
    }
  }
  ctx.restore();
}

export function drawCorruptedSiphonMotion(ctx, startP, targetP, progress, s, elapsed, seed, pal, {
  isHeal = false,
  reducedMotion = false,
} = {}) {
  const adx = targetP.x - startP.x;
  const ady = targetP.y - startP.y;
  const dist = Math.max(10, Math.hypot(adx, ady));
  const anx = -ady / dist;
  const any = adx / dist;
  const reach = clamp01(progress / 0.46);

  ctx.save();
  // Twin undulating viscous dark-violet siphon tendrils writhing organically along axis
  const strands = isHeal ? 1 : 2;
  for (let i = 0; i < strands; i += 1) {
    const sgn = i === 0 ? 1 : -1;
    const wave = (11 + Math.sin(elapsed * 7 + i * 2) * 3.5) * s * sgn;
    const c1 = { x: startP.x + adx * 0.34 + anx * wave, y: startP.y + ady * 0.34 + any * wave - 4 * s };
    const c2 = { x: startP.x + adx * 0.68 - anx * wave * 0.85, y: startP.y + ady * 0.68 - any * wave * 0.85 + 3 * s };
    drawAnalyticalRibbon(ctx, (u) => sampleCubicBezier(startP, c1, c2, targetP, u), {
      uStart: isHeal ? Math.max(0, progress - 0.65) : 0,
      uEnd: isHeal ? progress : reach,
      steps: 18,
      maxWidth: (i === 0 ? 3.8 : 2.5) * s,
      color: i === 0 ? pal.primary : pal.secondary,
      coreColor: pal.core,
      alpha: 0.9,
      taperProfile: isHeal ? 'comet' : 'spindle',
      coreRatio: 0.4,
      glowWidthMultiplier: 1.7,
      glowAlpha: 0.24,
    });

    // Traveling peristaltic energy droplets pulsing along the tendril!
    if (!reducedMotion) {
      for (let d = 0; d < 3; d += 1) {
        const du = ((elapsed * 2.2 + d / 3) % 1) * (isHeal ? progress : reach);
        const pt = sampleCubicBezier(startP, c1, c2, targetP, du);
        const dr = (2.4 + Math.sin(du * Math.PI) * 1.4) * s;
        ctx.fillStyle = withAlpha(d % 2 === 0 ? pal.core : pal.secondary, 0.9);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, dr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Organic pulsing siphon flare at target contact point
  if (!isHeal && reach > 0.6) {
    const lockT = clamp01((progress - 0.3) / 0.7);
    drawBoilingPlasmaBody(ctx, targetP.x, targetP.y, (5.5 + lockT * 3.5) * s, {
      primary: pal.primary,
      secondary: pal.secondary,
      core: pal.core,
      glow: pal.glow,
      alpha: 0.86,
      phase: elapsed * 8,
      seed: seed || 13,
      turbulence: 0.34,
      samples: 10,
    });
  }
  ctx.restore();
}

// ============================================================================
// 7. 3D GYROSCOPIC ORBITAL & VOID-RIFT TEAR MELEE FAMILY
//    (astral_construct, enemy_void_vanguard, enemy_abyssal_ravager)
// ============================================================================

export function drawGyroOrbitalMotion(ctx, cx, cy, heading, s, t, pal, { isSkill = false, reducedMotion = false } = {}) {
  const ease = easeOutExpo(t);
  const fade = Math.max(0, 1 - easeInCubic(clamp01((t - 0.5) / 0.5)));
  if (fade <= 0.015) return;

  const r = (isSkill ? 28 : 22) * s * (0.65 + ease * 0.45);
  ctx.save();
  drawSoftBloom(ctx, cx, cy, r * 0.95, pal.core, pal.primary, fade * 0.45);

  // Two counter-precessing 3D inclined gyroscopic rail arcs (open dynamic sweeps, zero flat sticker)
  for (const tilt of [-0.52, 0.52]) {
    const spin = heading + t * (tilt > 0 ? 4.8 : -3.9);
    const arcSpan = Math.PI * (0.95 - t * 0.35);
    drawAnalyticalRibbon(
      ctx,
      (u) => {
        const a = spin + (u - 0.5) * arcSpan;
        const lx = Math.cos(a) * r;
        const ly = Math.sin(a) * r * 0.42;
        const ct = Math.cos(tilt);
        const st = Math.sin(tilt);
        return {
          x: cx + lx * ct - ly * st,
          y: cy + lx * st + ly * ct,
        };
      },
      {
        steps: 16,
        maxWidth: (isSkill ? 4.4 : 3.6) * s * fade,
        color: tilt > 0 ? pal.primary : pal.secondary,
        coreColor: pal.core,
        alpha: fade * 0.94,
        taperProfile: 'comet',
        coreRatio: 0.48,
        glowWidthMultiplier: 1.7,
        glowAlpha: 0.22,
      },
    );
  }

  // Orbiting plasma node tracking leading tip of primary gyro rail
  if (!reducedMotion) {
    const tipA = heading + t * 4.8 + Math.PI * 0.3;
    const lx = Math.cos(tipA) * r;
    const ly = Math.sin(tipA) * r * 0.42;
    const nx = cx + lx * Math.cos(0.52) - ly * Math.sin(0.52);
    const ny = cy + lx * Math.sin(0.52) + ly * Math.cos(0.52);
    drawSoftBloom(ctx, nx, ny, 7 * s * fade, pal.core, pal.secondary, fade * 0.85);
  }
  ctx.restore();
}

export function drawVoidRiftTearMotion(ctx, cx, cy, heading, s, t, seed, pal, {
  dualBeat = false,
  reducedMotion = false,
} = {}) {
  const beats = dualBeat
    ? [
        { delay: 0.0, ang: heading - 0.56, col: pal.primary },
        { delay: 0.16, ang: heading + 0.56, col: pal.secondary },
      ]
    : [{ delay: 0.0, ang: heading, col: pal.primary }];

  ctx.save();
  for (let b = 0; b < beats.length; b += 1) {
    const lt = clamp01((t - beats[b].delay) / Math.max(0.15, 1 - beats[b].delay));
    if (lt <= 0.01) continue;
    // Unzips rapidly (0..0.32), holds jagged void tear briefly, then stitches shut smoothly!
    const unzip = lt < 0.32 ? easeOutExpo(lt / 0.32) : 1;
    const stitch = lt > 0.55 ? easeInCubic((lt - 0.55) / 0.45) : 0;
    const fade = Math.max(0, 1 - stitch);
    const len = (24 + unzip * 14) * s * (1 - stitch * 0.45);
    const openW = (5.2 * unzip * (1 - stitch * 0.85)) * s;
    const a = beats[b].ang;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const nx = -uy;
    const ny = ux;
    const rng = createDetRng((seed || 41) + b * 23);

    // Dark void tear interior bordered by crackling jagged crimson-white energy lips
    ctx.beginPath();
    const steps = 8;
    const topPts = [];
    const botPts = [];
    for (let i = 0; i <= steps; i += 1) {
      const u = i / steps;
      const along = (u - 0.5) * len * 2;
      const bell = Math.sin(u * Math.PI);
      const jag = (i === 0 || i === steps ? 0 : (rng() - 0.5) * 3.6 * s) * bell;
      topPts.push({ x: cx + ux * along + nx * (openW * bell + jag), y: cy + uy * along + ny * (openW * bell + jag) });
      botPts.push({ x: cx + ux * along - nx * (openW * bell - jag), y: cy + uy * along - ny * (openW * bell - jag) });
    }
    ctx.moveTo(topPts[0].x, topPts[0].y);
    for (let i = 1; i <= steps; i += 1) ctx.lineTo(topPts[i].x, topPts[i].y);
    for (let i = steps; i >= 0; i -= 1) ctx.lineTo(botPts[i].x, botPts[i].y);
    ctx.closePath();
    ctx.fillStyle = `rgba(18, 4, 16, ${(fade * 0.78).toFixed(3)})`;
    ctx.fill();
    ctx.strokeStyle = withAlpha(beats[b].col, fade * 0.96);
    ctx.lineWidth = Math.max(1.2, 2.4 * s * fade);
    ctx.stroke();

    // Bright razor inner seam spark
    drawTaperedNeedle(ctx, cx - ux * len * 0.82, cy - uy * len * 0.82, cx + ux * len * 0.82, cy + uy * len * 0.82, {
      width: 2.6 * s * fade,
      color: beats[b].col,
      coreColor: pal.core,
      alpha: fade * 0.94,
      peakRatio: 0.5,
    });

    // Serrated tearing sparks spraying perpendicular to rift seam
    if (!reducedMotion && lt > 0.1) {
      for (let k = 0; k < 4; k += 1) {
        const side = k % 2 === 0 ? 1 : -1;
        const drift = easeOutCubic(lt) * (12 + k * 4) * s;
        const sx = cx + ux * ((k - 1.5) * 6 * s) + nx * side * drift;
        const sy = cy + uy * ((k - 1.5) * 6 * s) + ny * side * drift;
        ctx.fillStyle = withAlpha(k % 2 === 0 ? pal.core : beats[b].col, fade * 0.92);
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(0.9, (2.0 - lt * 1.1) * s), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

// ============================================================================
// 8. OPTICAL LASER CAPACITOR PREP MOTION (preserves 5-phase progressive beam!)
// ============================================================================

export function drawLaserPrepMotion(ctx, cx, cy, emX, emY, facing, s, intensity, isSkillPrep, elapsed, pal, reducedMotion = false) {
  const ease = easeOutCubic(intensity);
  const scaleMod = isSkillPrep ? 1.24 : 1.0;
  const dirA = facing > 0 ? 0 : Math.PI;

  ctx.save();
  // Smooth inward photonic capacitor draw converging directly into optical focal point
  drawSoftBloom(ctx, emX, emY, (5.5 + easeInCubic(intensity) * 9.5) * s * scaleMod, '#ffffff', pal.primary, 0.38 + ease * 0.54);
  if (!reducedMotion) {
    const rays = isSkillPrep ? 5 : 4;
    for (let i = 0; i < rays; i += 1) {
      const a = dirA + ((i - (rays - 1) * 0.5) * 0.55) + Math.sin(elapsed * 6 + i) * 0.08;
      const dist = (17 * (1 - ease * 0.72) + 2) * s * scaleMod;
      drawTaperedNeedle(ctx, emX + Math.cos(a) * dist, emY + Math.sin(a) * dist, emX, emY, {
        width: 1.7 * s * scaleMod,
        color: pal.secondary,
        coreColor: '#ffffff',
        alpha: ease * 0.9,
        peakRatio: 0.88,
      });
    }
  }
  // Pinpoint coherent cross-glint
  const gl = (5 + easeInCubic(intensity) * 8) * s * scaleMod;
  drawTaperedNeedle(ctx, emX - gl, emY, emX + gl, emY, {
    width: 1.8 * s,
    color: pal.secondary,
    coreColor: '#ffffff',
    alpha: ease * 0.96,
    peakRatio: 0.5,
  });
  drawTaperedNeedle(ctx, emX, emY - gl * 0.65, emX, emY + gl * 0.65, {
    width: 1.5 * s,
    color: pal.primary,
    coreColor: '#ffffff',
    alpha: ease * 0.92,
    peakRatio: 0.5,
  });
  ctx.restore();
}
