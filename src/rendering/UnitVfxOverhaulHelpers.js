/**
 * UnitVfxOverhaulHelpers — High-Craft Object-Identity VFX Primitives,
 * Unit-Specific Preparation Phase Choreography, and Tactical Skill Telegraphs
 * for ALL 33 Star Struck units.
 *
 * Designed specifically to match the scale, silhouette, and 2.5D object identity
 * of the redesigned unit models (64-106px * visualScale) at normal gameplay zoom.
 */

import { UNIT_STATES } from '../battle/UnitManager.js';
import { resolveUnitAttackVfxProfile } from './UnitAttackVfxConfig.js';
import {
  clamp01,
  easeOutCubic,
  easeOutQuart,
  withAlpha,
  drawAnalyticalRibbon,
  drawSoftBloom,
  drawEllipticalHalo,
  drawSymmetricalSigilRing,
  drawPrecisionChevron,
  drawTaperedNeedle,
  drawPrecisionReticle,
  drawDiamondPrism,
  drawStarFlare,
  drawLotusCrest,
  drawSteppedLightningBolt,
  createDetRng,
} from './NonUnitVfxGeometry.js';
import { drawHexShieldTile } from './UnitObjectModelHelpers.js';
import {
  ratchetStepAngle,
  organicContourFactor,
  drawBoilingPlasmaBody,
  drawSolarPrepMotion,
  drawChronoPrepMotion,
  drawCrystalPrepMotion,
} from './UnitVfxMotionEngine.js';
import {
  drawLunarPrepMotion,
  drawArtilleryPrepMotion,
  drawShieldPrepMotion,
  drawLaserPrepMotion,
} from './UnitVfxMotionFamilies.js';

function safeR(v, min = 0.5) {
  return Number.isFinite(v) && v > min ? v : min;
}

// ============================================================================
// 1. Bespoke Object-Identity VFX Primitives (Solar, Chrono, Lunar, Crystal,
//    Artillery, Cathedral, Electric, Shockwave, Heat Distortion)
// ============================================================================

/**
 * Multi-layered granulated solar orb + prominence loops + rotating corona flare petals
 * + radial sun-beams + heat-shimmer arcs.
 */
export function drawSolarCoronaOrb(ctx, cx, cy, radius, {
  primary = '#fb923c',
  secondary = '#fde047',
  core = '#fffbeb',
  glow = '#ea580c',
  alpha = 0.96,
  spin = 0,
  flareCount = 8,
  coronaRings = 2,
  heatShimmer = true,
  scale = 1,
} = {}) {
  const r = safeR(radius, 2);
  if (alpha <= 0.015) return;

  ctx.save();
  ctx.translate(cx, cy);

  // Outer solar atmospheric bloom
  drawSoftBloom(ctx, 0, 0, r * 2.25, core, glow, alpha * 0.56);

  // Concentric radiant corona rings & heat-distortion arcs
  for (let ring = 0; ring < coronaRings; ring += 1) {
    const rr = r * (1.28 + ring * 0.42);
    const dir = ring % 2 === 0 ? 1 : -1;
    drawSymmetricalSigilRing(ctx, 0, 0, rr, rr * 0.94, {
      count: flareCount,
      arcFill: 0.58,
      rotation: spin * dir * (0.75 + ring * 0.3),
      lineWidth: Math.max(1.2, (2.2 - ring * 0.5) * scale),
      color: ring === 0 ? secondary : primary,
      coreColor: core,
      alpha: alpha * (0.86 - ring * 0.22),
      tickStyle: ring === 0 ? 'compass' : 'none',
    });
  }

  // Prominent curved solar flare tongues erupting from photosphere rim
  ctx.save();
  ctx.rotate(spin * 0.55);
  for (let i = 0; i < flareCount; i += 1) {
    const a = (i * Math.PI * 2) / flareCount;
    const isMajor = i % 2 === 0;
    const tipR = r * (isMajor ? 1.85 : 1.48);
    const baseSpread = isMajor ? 0.24 : 0.17;
    const bx0 = Math.cos(a - baseSpread) * r * 0.78;
    const by0 = Math.sin(a - baseSpread) * r * 0.78;
    const bx1 = Math.cos(a + baseSpread) * r * 0.78;
    const by1 = Math.sin(a + baseSpread) * r * 0.78;
    const ctrlA = a + (isMajor ? 0.18 : -0.14);
    const tx = Math.cos(a) * tipR;
    const ty = Math.sin(a) * tipR;
    const cx1 = Math.cos(ctrlA) * (r * 1.38);
    const cy1 = Math.sin(ctrlA) * (r * 1.38);

    ctx.beginPath();
    ctx.moveTo(bx0, by0);
    ctx.quadraticCurveTo(cx1, cy1, tx, ty);
    ctx.quadraticCurveTo(Math.cos(a + baseSpread * 0.5) * r * 1.15, Math.sin(a + baseSpread * 0.5) * r * 1.15, bx1, by1);
    ctx.closePath();
    ctx.fillStyle = withAlpha(isMajor ? secondary : primary, alpha * (isMajor ? 0.78 : 0.58));
    ctx.fill();
  }
  ctx.restore();

  // Granulated multi-stop photosphere disc
  if (typeof ctx.createRadialGradient === 'function') {
    const sunGrad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.08, 0, 0, r);
    sunGrad.addColorStop(0, withAlpha(core, alpha));
    sunGrad.addColorStop(0.45, withAlpha(secondary, alpha * 0.96));
    sunGrad.addColorStop(0.82, withAlpha(primary, alpha * 0.92));
    sunGrad.addColorStop(1, withAlpha(glow, alpha * 0.4));
    ctx.fillStyle = sunGrad;
  } else {
    ctx.fillStyle = withAlpha(secondary, alpha * 0.92);
  }
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // Internal convective solar prominence arcs
  ctx.strokeStyle = withAlpha(core, alpha * 0.85);
  ctx.lineWidth = Math.max(1.0, 1.45 * scale);
  for (let k = 0; k < 3; k += 1) {
    const a0 = spin * 0.9 + (k * Math.PI * 2) / 3;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.68, a0, a0 + 0.95);
    ctx.stroke();
  }

  // Crisp heat-shimmer wavy refraction arcs outside corona
  if (heatShimmer) {
    drawHeatShimmerArcs(ctx, 0, 0, r * 1.65, r * 1.65, {
      color: secondary,
      alpha: alpha * 0.48,
      phase: spin * 2.2,
      count: 3,
      lineWidth: Math.max(1.0, 1.35 * scale),
    });
  }

  // Crisp inner white-gold star glint
  drawStarFlare(ctx, 0, 0, r * 1.15, 0.16, secondary, core, alpha * 0.92, spin * 0.35, 4);
  ctx.restore();
}

/**
 * Wavy heat-distortion refraction arcs (Solar, Magma, Artillery, Plasma).
 */
export function drawHeatShimmerArcs(ctx, cx, cy, rx, ry, {
  color = '#fde047',
  alpha = 0.45,
  phase = 0,
  count = 3,
  lineWidth = 1.4,
} = {}) {
  if (alpha <= 0.015 || rx < 4) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = withAlpha(color, alpha);
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i += 1) {
    const baseA = (i * Math.PI * 2) / count + phase * 0.25;
    const steps = 12;
    ctx.beginPath();
    for (let s = 0; s <= steps; s += 1) {
      const u = s / steps;
      const a = baseA + (u - 0.5) * 0.85;
      const wave = Math.sin(u * Math.PI * 4 + phase * 2.4 + i * 1.7) * (rx * 0.065);
      const px = Math.cos(a) * (rx + wave);
      const py = Math.sin(a) * (ry + wave * (ry / Math.max(1, rx)));
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Large, unmistakable Roman Clock-Face + Interlocking Brass/Temporal Gears
 * + Counter-Rotating Astrolabe Rings + Sweeping Clock-Hand Energy Blades.
 */
export function drawChronoMechanism(ctx, cx, cy, rx, ry, {
  primary = '#a78bfa',
  secondary = '#f5d37a',
  core = '#faf5ff',
  alpha = 0.94,
  rotation = 0,
  handAngle1 = -1.2,
  handAngle2 = 0.8,
  handAngle3 = null,
  lineWidth = 2.0,
  gearCount = 2,
  showWaveRings = true,
  bladeHands = true,
} = {}) {
  const safeRx = safeR(rx, 4);
  const safeRy = safeR(ry, 2);
  if (alpha <= 0.015) return;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, safeRy / safeRx);

  // Subtle luminous dial backing so the clock-face reads cleanly over busy terrain
  if (typeof ctx.createRadialGradient === 'function') {
    const bg = ctx.createRadialGradient(0, 0, safeRx * 0.08, 0, 0, safeRx * 1.05);
    bg.addColorStop(0, withAlpha(core, alpha * 0.24));
    bg.addColorStop(0.55, withAlpha(primary, alpha * 0.16));
    bg.addColorStop(1, withAlpha(primary, 0));
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(0, 0, safeRx * 1.05, 0, Math.PI * 2);
    ctx.fill();
  }

  // Outer temporal distortion wave rings
  if (showWaveRings) {
    ctx.strokeStyle = withAlpha(primary, alpha * 0.42);
    ctx.lineWidth = Math.max(1.0, lineWidth * 0.65);
    ctx.setLineDash([safeRx * 0.24, safeRx * 0.12]);
    ctx.beginPath();
    ctx.arc(0, 0, safeRx * 1.16, rotation * 0.6, rotation * 0.6 + Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Interlocking luminous spoked arcane-gold/violet gears nested inside the bezel
  const drawArcaneGear = (gx, gy, outerR, innerR, teeth, rot, fillCol, strokeCol, lw) => {
    const rOut = safeR(outerR, 3);
    const rIn = safeR(innerR, 2);
    const count = Math.max(6, Math.round(teeth));
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(rot);

    ctx.beginPath();
    for (let i = 0; i < count; i += 1) {
      const a0 = (i / count) * Math.PI * 2;
      const a1 = ((i + 0.22) / count) * Math.PI * 2;
      const a2 = ((i + 0.54) / count) * Math.PI * 2;
      const a3 = ((i + 0.76) / count) * Math.PI * 2;
      const pts = [
        [Math.cos(a0) * rIn, Math.sin(a0) * rIn],
        [Math.cos(a1) * rOut, Math.sin(a1) * rOut],
        [Math.cos(a2) * rOut, Math.sin(a2) * rOut],
        [Math.cos(a3) * rIn, Math.sin(a3) * rIn],
      ];
      for (let k = 0; k < pts.length; k += 1) {
        if (i === 0 && k === 0) ctx.moveTo(pts[k][0], pts[k][1]);
        else ctx.lineTo(pts[k][0], pts[k][1]);
      }
    }
    ctx.closePath();
    ctx.fillStyle = fillCol;
    ctx.fill();
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = lw;
    ctx.stroke();

    // Inner luminous gear rim & delicate radial spokes (transparent interior — zero dark blobs)
    const hubR = rIn * 0.34;
    const midR = rIn * 0.78;
    ctx.beginPath();
    ctx.arc(0, 0, midR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, hubR, 0, Math.PI * 2);
    ctx.stroke();

    const spokes = count >= 10 ? 6 : 4;
    ctx.beginPath();
    for (let s = 0; s < spokes; s += 1) {
      const sa = (s * Math.PI * 2) / spokes;
      ctx.moveTo(Math.cos(sa) * hubR, Math.sin(sa) * hubR);
      ctx.lineTo(Math.cos(sa) * midR, Math.sin(sa) * midR);
    }
    ctx.stroke();
    ctx.restore();
  };

  if (gearCount >= 1) {
    drawArcaneGear(
      0,
      0,
      safeRx * 0.56,
      safeRx * 0.44,
      12,
      rotation * 1.2,
      withAlpha(primary, alpha * 0.14),
      withAlpha(secondary, alpha * 0.84),
      Math.max(1.0, lineWidth * 0.58),
    );
  }
  if (gearCount >= 2) {
    const gx = Math.cos(rotation * 0.45 + 0.7) * safeRx * 0.44;
    const gy = Math.sin(rotation * 0.45 + 0.7) * safeRx * 0.44;
    drawArcaneGear(
      gx,
      gy,
      safeRx * 0.28,
      safeRx * 0.21,
      8,
      -rotation * 2.1,
      withAlpha(secondary, alpha * 0.14),
      withAlpha(core, alpha * 0.84),
      Math.max(0.9, lineWidth * 0.5),
    );
  }
  if (gearCount >= 3) {
    const gx2 = Math.cos(rotation * 0.45 + Math.PI + 0.7) * safeRx * 0.44;
    const gy2 = Math.sin(rotation * 0.45 + Math.PI + 0.7) * safeRx * 0.44;
    drawArcaneGear(
      gx2,
      gy2,
      safeRx * 0.25,
      safeRx * 0.19,
      8,
      -rotation * 2.4,
      withAlpha(primary, alpha * 0.14),
      withAlpha(secondary, alpha * 0.8),
      Math.max(0.9, lineWidth * 0.48),
    );
  }

  // Twin counter-rotating bezel rings
  ctx.strokeStyle = withAlpha(primary, alpha * 0.94);
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(0, 0, safeRx, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = withAlpha(secondary, alpha * 0.86);
  ctx.lineWidth = Math.max(1.0, lineWidth * 0.62);
  ctx.beginPath();
  ctx.arc(0, 0, safeRx * 0.82, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = withAlpha(core, alpha * 0.72);
  ctx.lineWidth = Math.max(0.8, lineWidth * 0.42);
  ctx.beginPath();
  ctx.arc(0, 0, safeRx * 0.92, 0, Math.PI * 2);
  ctx.stroke();

  // 12 bold Roman/cardinal numeral hour ticks + cardinal diamond markers
  for (let i = 0; i < 12; i += 1) {
    const a = rotation * 0.35 + (i * Math.PI * 2) / 12;
    const isCard = i % 3 === 0;
    const r0 = safeRx * (isCard ? 0.64 : 0.78);
    const r1 = safeRx * 0.99;
    ctx.strokeStyle = withAlpha(isCard ? secondary : core, alpha * (isCard ? 0.98 : 0.72));
    ctx.lineWidth = isCard ? lineWidth * 1.15 : Math.max(0.8, lineWidth * 0.55);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.stroke();

    if (isCard) {
      const mx = Math.cos(a) * safeRx;
      const my = Math.sin(a) * safeRx;
      const nr = Math.max(2.2, safeRx * 0.075);
      ctx.fillStyle = withAlpha(core, alpha * 0.96);
      ctx.beginPath();
      ctx.moveTo(mx, my - nr);
      ctx.lineTo(mx + nr, my);
      ctx.lineTo(mx, my + nr);
      ctx.lineTo(mx - nr, my);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Sweeping clock-hand energy blades (faceted sword-like clock hands)
  const drawBladeHand = (ang, lenRatio, widthRatio, col, innerCol) => {
    ctx.save();
    ctx.rotate(ang);
    const len = safeRx * lenRatio;
    const hw = Math.max(1.5, safeRx * widthRatio);
    ctx.beginPath();
    ctx.moveTo(-len * 0.16, 0);
    ctx.lineTo(len * 0.22, -hw);
    ctx.lineTo(len, 0);
    ctx.lineTo(len * 0.22, hw);
    ctx.closePath();
    ctx.fillStyle = withAlpha(col, alpha * 0.94);
    ctx.fill();
    ctx.strokeStyle = withAlpha(innerCol, alpha * 0.95);
    ctx.lineWidth = Math.max(0.9, lineWidth * 0.5);
    ctx.stroke();
    ctx.restore();
  };

  if (bladeHands) {
    drawBladeHand(handAngle1, 0.94, 0.085, core, secondary);
    drawBladeHand(handAngle2, 0.68, 0.105, secondary, core);
    if (handAngle3 !== null) {
      drawBladeHand(handAngle3, 1.06, 0.055, primary, core);
    }
  } else {
    ctx.lineCap = 'round';
    ctx.strokeStyle = withAlpha(core, alpha);
    ctx.lineWidth = Math.max(1.6, lineWidth);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(handAngle1) * safeRx * 0.85, Math.sin(handAngle1) * safeRx * 0.85);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(secondary, alpha);
    ctx.lineWidth = Math.max(1.8, lineWidth * 1.15);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(handAngle2) * safeRx * 0.6, Math.sin(handAngle2) * safeRx * 0.6);
    ctx.stroke();
  }

  // Central jeweled escapement pinion
  ctx.fillStyle = withAlpha(core, alpha);
  ctx.strokeStyle = withAlpha(secondary, alpha);
  ctx.lineWidth = Math.max(1.0, lineWidth * 0.6);
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(2.6, safeRx * 0.11), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/**
 * Large, razor-sharp Lunar Crescent Energy Wave with luminous outer bevel,
 * dark-void concave shadow, orbiting celestial motes, and multi-strand moonlight trails.
 */
export function drawLunarCrescentWave(ctx, cx, cy, radius, angle, {
  primary = '#ec4899',
  secondary = '#f5d0fe',
  core = '#ffffff',
  voidColor = '#1e1035',
  alpha = 0.96,
  thickness = 0.42,
  orbitCount = 4,
  phase = 0,
  scale = 1,
} = {}) {
  const r = safeR(radius, 4);
  if (alpha <= 0.015) return;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // Soft celestial bloom behind the crescent
  drawSoftBloom(ctx, r * 0.22, 0, r * 1.45, core, primary, alpha * 0.46);

  // Outer sweeping moonlight aura shell
  const traceCrescent = (rad, thick) => {
    const innerShift = rad * (1 - thick);
    ctx.beginPath();
    ctx.arc(0, 0, rad, -Math.PI * 0.64, Math.PI * 0.64, false);
    ctx.arc(-innerShift * 0.72, 0, rad * 0.92, Math.PI * 0.56, -Math.PI * 0.56, true);
    ctx.closePath();
  };

  // Glow layer
  traceCrescent(r * 1.14, Math.min(0.62, thickness * 1.25));
  ctx.fillStyle = withAlpha(primary, alpha * 0.34);
  ctx.fill();

  // Primary luminous crescent body
  traceCrescent(r, thickness);
  if (typeof ctx.createLinearGradient === 'function') {
    const grad = ctx.createLinearGradient(-r * 0.4, 0, r, 0);
    grad.addColorStop(0, withAlpha(voidColor, alpha * 0.7));
    grad.addColorStop(0.35, withAlpha(primary, alpha * 0.94));
    grad.addColorStop(0.78, withAlpha(secondary, alpha * 0.98));
    grad.addColorStop(1, withAlpha(core, alpha));
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = withAlpha(primary, alpha * 0.94);
  }
  ctx.fill();

  // Razor white-silver leading lunar rim
  ctx.strokeStyle = withAlpha(core, alpha * 0.96);
  ctx.lineWidth = Math.max(1.4, 2.2 * scale);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.98, -Math.PI * 0.58, Math.PI * 0.58);
  ctx.stroke();

  // Secondary moonlight ribbon streamers trailing off the crescent horns
  for (const sgn of [-1, 1]) {
    const tipX = Math.cos(sgn * Math.PI * 0.62) * r;
    const tipY = Math.sin(sgn * Math.PI * 0.62) * r;
    drawTaperedNeedle(ctx, tipX - r * 0.95, tipY + sgn * r * 0.12, tipX, tipY, {
      width: Math.max(1.8, 3.2 * scale),
      color: secondary,
      coreColor: core,
      alpha: alpha * 0.85,
      peakRatio: 0.78,
    });
  }

  // Orbiting celestial shards / micro-moons along the lunar wake
  for (let i = 0; i < orbitCount; i += 1) {
    const a = -0.9 + (i / Math.max(1, orbitCount - 1)) * 1.8 + Math.sin(phase * 3 + i) * 0.12;
    const dist = r * (0.72 + (i % 2) * 0.48);
    const ox = Math.cos(a) * dist - r * 0.25;
    const oy = Math.sin(a) * dist;
    drawStarFlare(ctx, ox, oy, (3.2 + (i % 2) * 2.2) * scale, 0.18, secondary, core, alpha * 0.9, phase + i, 4);
  }

  ctx.restore();
}

/**
 * Large, multifaceted beveled Crystal Projectile / Spear / Formation with
 * visible geometric facets, specular split planes, and chromatic refracted light rays.
 */
export function drawMultifacetedCrystal(ctx, cx, cy, length, width, angle, {
  primary = '#38bdf8',
  secondary = '#e0f2fe',
  core = '#ffffff',
  facetDark = '#1e3a8a',
  alpha = 0.96,
  refractionRays = 4,
  phase = 0,
  scale = 1,
} = {}) {
  const len = safeR(length, 6);
  const w = safeR(width, 3);
  if (alpha <= 0.015) return;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // Soft prismatic bloom
  drawSoftBloom(ctx, len * 0.1, 0, Math.max(len * 0.82, w * 1.8), core, primary, alpha * 0.42);

  // Refracted light dispersion rays angling off the crystal shoulders
  if (refractionRays > 0) {
    for (let i = 0; i < refractionRays; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const tier = Math.floor(i / 2);
      const rayA = side * (0.48 + tier * 0.36) + Math.sin(phase * 2.5 + i) * 0.08;
      const rayLen = len * (0.52 - tier * 0.1);
      const ox = len * (0.05 - tier * 0.18);
      drawTaperedNeedle(ctx, ox, 0, ox + Math.cos(rayA) * rayLen, Math.sin(rayA) * rayLen, {
        width: Math.max(1.2, 2.0 * scale),
        color: i % 2 === 0 ? secondary : primary,
        coreColor: core,
        alpha: alpha * 0.72,
        peakRatio: 0.25,
      });
    }
  }

  // 6-vertex beveled crystal body (front tip, upper/lower front shoulders, rear tail)
  const tipX = len * 0.56;
  const tailX = -len * 0.48;
  const shFrontX = len * 0.14;
  const shBackX = -len * 0.2;
  const hw = w * 0.5;

  // Upper illuminated facet
  ctx.beginPath();
  ctx.moveTo(tipX, 0);
  ctx.lineTo(shFrontX, -hw);
  ctx.lineTo(shBackX, -hw * 0.68);
  ctx.lineTo(tailX, 0);
  ctx.closePath();
  ctx.fillStyle = withAlpha(secondary, alpha * 0.94);
  ctx.fill();

  // Lower shadowed refractive facet
  ctx.beginPath();
  ctx.moveTo(tipX, 0);
  ctx.lineTo(shFrontX, hw);
  ctx.lineTo(shBackX, hw * 0.68);
  ctx.lineTo(tailX, 0);
  ctx.closePath();
  ctx.fillStyle = withAlpha(primary, alpha * 0.88);
  ctx.fill();

  // Deep inner shadow wedge along bottom-rear bevel for 3D crystal thickness
  ctx.beginPath();
  ctx.moveTo(shFrontX, 0);
  ctx.lineTo(shFrontX, hw);
  ctx.lineTo(shBackX, hw * 0.68);
  ctx.lineTo(tailX, 0);
  ctx.closePath();
  ctx.fillStyle = withAlpha(facetDark, alpha * 0.42);
  ctx.fill();

  // Bright central prismatic core kite
  ctx.beginPath();
  ctx.moveTo(tipX * 0.88, 0);
  ctx.lineTo(shFrontX * 0.8, -hw * 0.44);
  ctx.lineTo(shBackX * 0.8, 0);
  ctx.lineTo(shFrontX * 0.8, hw * 0.44);
  ctx.closePath();
  ctx.fillStyle = withAlpha(core, alpha * 0.96);
  ctx.fill();

  // Crisp facet ridge lines & outer rim
  ctx.strokeStyle = withAlpha(core, alpha * 0.92);
  ctx.lineWidth = Math.max(1.0, 1.45 * scale);
  ctx.beginPath();
  ctx.moveTo(tipX, 0);
  ctx.lineTo(shFrontX, -hw);
  ctx.lineTo(shBackX, -hw * 0.68);
  ctx.lineTo(tailX, 0);
  ctx.lineTo(shBackX, hw * 0.68);
  ctx.lineTo(shFrontX, hw);
  ctx.closePath();
  ctx.stroke();

  // Internal ridge spine
  ctx.strokeStyle = withAlpha(core, alpha * 0.88);
  ctx.lineWidth = Math.max(0.85, 1.15 * scale);
  ctx.beginPath();
  ctx.moveTo(tailX, 0);
  ctx.lineTo(tipX, 0);
  ctx.moveTo(shFrontX, -hw);
  ctx.lineTo(shFrontX * 0.65, 0);
  ctx.lineTo(shFrontX, hw);
  ctx.stroke();

  // Specular star glint on leading facet
  drawStarFlare(ctx, tipX * 0.62, -hw * 0.16, Math.max(4.5, w * 0.58), 0.14, secondary, core, alpha * 0.92, 0.35, 4);

  ctx.restore();
}

/**
 * High-visibility expanding double-rimmed shockwave ring with directional bevels
 * and rune/circuit notches for weighty melee & AoE impacts.
 */
export function drawRuneShockwaveRing(ctx, cx, cy, rx, ry, {
  primary = '#38bdf8',
  secondary = '#bae6fd',
  core = '#ffffff',
  alpha = 0.9,
  lineWidth = 3.0,
  notches = 8,
  rotation = 0,
} = {}) {
  const sRx = safeR(rx, 4);
  const sRy = safeR(ry, 2);
  if (alpha <= 0.015) return;

  ctx.save();
  // Soft inner energy wash
  drawSoftBloom(ctx, cx, cy, sRx * 1.05, core, primary, alpha * 0.34, sRy / sRx);

  // Outer thick colored shock rim
  ctx.strokeStyle = withAlpha(primary, alpha * 0.92);
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.ellipse(cx, cy, sRx, sRy, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Bright core filament
  ctx.strokeStyle = withAlpha(core, alpha * 0.94);
  ctx.lineWidth = Math.max(1.0, lineWidth * 0.42);
  ctx.beginPath();
  ctx.ellipse(cx, cy, sRx * 0.94, sRy * 0.94, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Secondary trailing echo ring
  ctx.strokeStyle = withAlpha(secondary, alpha * 0.62);
  ctx.lineWidth = Math.max(1.0, lineWidth * 0.55);
  ctx.beginPath();
  ctx.ellipse(cx, cy, sRx * 0.72, sRy * 0.72, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Radial bevel ticks
  if (notches > 0) {
    ctx.strokeStyle = withAlpha(core, alpha * 0.85);
    ctx.lineWidth = Math.max(1.0, lineWidth * 0.48);
    for (let i = 0; i < notches; i += 1) {
      const a = rotation + (i * Math.PI * 2) / notches;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * sRx * 0.78, cy + Math.sin(a) * sRy * 0.78);
      ctx.lineTo(cx + Math.cos(a) * sRx * 1.12, cy + Math.sin(a) * sRy * 1.12);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Stylized artillery smoke ring & glowing ember blast dome for Bombardiers / Siege units.
 */
export function drawArtillerySmokePlume(ctx, cx, cy, radius, {
  primary = '#f97316',
  secondary = '#fde047',
  smokeColor = '#64748b',
  alpha = 0.9,
  seed = 19,
  puffCount = 6,
} = {}) {
  const r = safeR(radius, 4);
  if (alpha <= 0.015) return;
  const rng = createDetRng(seed);

  ctx.save();
  // Warm under-lit ember halo behind the blast plume
  drawSoftBloom(ctx, cx, cy, r * 1.12, '#fffbeb', primary, alpha * 0.58, 0.72);

  for (let i = 0; i < puffCount; i += 1) {
    const a = (i * Math.PI * 2) / puffCount + (rng() - 0.5) * 0.35;
    const dist = r * (0.44 + rng() * 0.4);
    const pr = r * (0.28 + rng() * 0.18);
    const px = cx + Math.cos(a) * dist;
    const py = cy + Math.sin(a) * dist * 0.62 - pr * 0.28;
    ctx.fillStyle = withAlpha(smokeColor, alpha * 0.54);
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(primary, alpha * 0.78);
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.arc(px, py, pr * 0.92, -Math.PI * 0.9, Math.PI * 0.15);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(secondary, alpha * 0.62);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(px, py, pr * 0.82, -Math.PI * 0.75, -Math.PI * 0.1);
    ctx.stroke();
  }
  drawSoftBloom(ctx, cx, cy, r * 0.92, '#fffbeb', secondary, alpha * 0.82);
  ctx.restore();
}

// ============================================================================
// 2. Unit-Specific PREPARATION PHASE VFX (Normal Attack Prep & Major Skill Charge)
// ============================================================================

/**
 * Renders live Preparation Phase VFX synced directly to `anim.attackPrep` (0..1)
 * and `anim.castProgress` (0..1) around each unit's redesigned 2.5D object model.
 *
 * Called twice in BattleRenderer._drawUnit:
 * - layer = 'back'  (before drawChibiObjectUnit: ground halos, expanding domain sigils, wings/corona)
 * - layer = 'front' (after drawChibiObjectUnit: weapon/emitter charge convergence, flares, gears, shards)
 */
export function drawUnitAttackPrepVfx(
  ctx,
  unit,
  layout,
  elapsed = 0,
  layer = 'front',
  reducedMotion = false,
) {
  if (!unit || unit.state === UNIT_STATES.DEAD || unit.state === UNIT_STATES.STUNNED) return;
  const anim = layout?.anim;
  if (!anim) return;

  const isSkillPrep = unit.state === UNIT_STATES.CASTING || (anim.castProgress || 0) > 0.02;
  const prepT = clamp01(anim.attackPrep || 0);
  const castT = clamp01(anim.castProgress || (unit.state === UNIT_STATES.CASTING ? 0.55 : 0));
  const intensity = isSkillPrep ? castT : prepT;
  if (intensity <= 0.04) return;

  const profileId = unit.bossId || unit.eliteId || unit.unitId || unit.id;
  const profile = resolveUnitAttackVfxProfile(profileId, { mode: 'attack', side: unit.side });
  const pal = profile.palette;
  const design = layout.design;
  const spriteSize = layout.spriteSize || 68;
  const halfSize = spriteSize * 0.5;
  const s = spriteSize / 64;
  const facing = unit.facing || 1;
  const cx = layout.drawX;
  const cy = layout.centerY;
  const groundY = layout.drawY + spriteSize * 0.72;
  const em = profile.emitter || { screenForwardPx: 20, screenYOffsetPx: -2 };
  const emX = cx + facing * (em.screenForwardPx || 20) * (s * 0.85);
  const emY = cy + (em.screenYOffsetPx || -2) * (s * 0.85);

  const ease = easeOutCubic(intensity);
  const pulse = reducedMotion ? 1 : 0.92 + Math.sin(elapsed * (isSkillPrep ? 14 : 18)) * 0.1;
  const chargeScale = isSkillPrep ? 1.55 : 1.0;

  ctx.save();

  // ---- BACK LAYER: Clean translucent ground anticipation (never covers the unit!) ----
  if (layer === 'back') {
    const auraR = halfSize * (isSkillPrep ? 1.05 + ease * 0.22 : 0.72 + ease * 0.14);
    drawSoftBloom(ctx, cx, cy, auraR, pal.core, pal.primary, (isSkillPrep ? 0.3 : 0.15) * ease);

    if (isSkillPrep) {
      const rx = halfSize * (0.95 + ease * 0.25);
      const ry = rx * 0.46;
      drawSoftBloom(ctx, cx, groundY, rx * 1.05, pal.secondary, pal.primary, 0.22 * ease, 0.46);
      // Rising energy filaments flanking the casting unit without covering its silhouette
      if (!reducedMotion) {
        const streamCount = design?.rosterGroup === 'boss' ? 5 : 3;
        for (let i = 0; i < streamCount; i += 1) {
          const frac = ((elapsed * 1.9 + i / streamCount) % 1);
          const ox = Math.cos(i * 2.1 + elapsed * 1.5) * halfSize * 0.82;
          const sy0 = groundY - frac * spriteSize * 0.25;
          const sy1 = sy0 - spriteSize * (0.32 + ease * 0.24);
          drawTaperedNeedle(ctx, cx + ox, sy0, cx + ox, sy1, {
            width: 1.9 * s,
            color: i % 2 === 0 ? pal.primary : pal.secondary,
            coreColor: pal.core,
            alpha: Math.sin(frac * Math.PI) * ease * 0.78,
            peakRatio: 0.72,
          });
        }
      }
    }
    ctx.restore();
    return;
  }

  // ---- FRONT LAYER: Component-aligned Preparation Energy Convergence ----
  const isSolar = profileId === 'solar_pyromancer' || profileId === 'boss_astral_leviathan';
  const isChrono = profileId === 'chrono_weaver' || profileId === 'boss_chrono_arbiter' || profileId === 'elite_chrono_enforcer';
  const isCrystal =
    profileId === 'arcane_archer' ||
    profileId === 'enemy_stasis_weaver' ||
    profileId === 'enemy_cryo_warden' ||
    profileId === 'elite_cryo_archwarden' ||
    profileId === 'elite_astral_sniper' ||
    profileId === 'boss_relay_archon';
  const isLunar =
    profileId === 'enemy_rift_stalker' ||
    profileId === 'enemy_dread_bannerman' ||
    profileId === 'elite_abyssal_executioner' ||
    profileId === 'boss_obsidian_sovereign';
  const isLaser =
    profileId === 'pulse_skirmisher' ||
    profileId === 'aegis_sentinel' ||
    profileId === 'enemy_obsidian_marksman';
  const isArtillery =
    profileId === 'enemy_inferno_bombardier' ||
    profileId === 'elite_inferno_captain' ||
    profileId === 'enemy_siege_juggernaut' ||
    profileId === 'elite_siege_colossus' ||
    profileId === 'vanguard_breaker';
  const isLightning = profileId === 'elite_storm_lancer';
  const isShield =
    profileId === 'heavy_shield_guard' ||
    profileId === 'elite_iron_bulwark' ||
    profileId === 'boss_bastion_warden';

  if (isSolar) {
    // Flowing plasma filaments drawing from solar rings into an igniting boiling kernel
    drawSolarPrepMotion(ctx, cx, cy, emX, emY, facing, s, intensity, isSkillPrep, elapsed, pal, reducedMotion);
  } else if (isChrono) {
    // Ratcheting mechanical escapement arcs & converging hands + hourglass sand inflow
    drawChronoPrepMotion(ctx, cx, cy, emX, emY, facing, s, intensity, isSkillPrep, elapsed, pal, reducedMotion);
  } else if (isCrystal) {
    // 3D-tumbling crystal facets magnetically snapping together at weapon emitter
    drawCrystalPrepMotion(ctx, cx, cy, emX, emY, facing, s, intensity, isSkillPrep, elapsed, pal, reducedMotion);
  } else if (isLunar) {
    // Twin whipping crescent ribbons + orbiting silver-crimson moonlets
    drawLunarPrepMotion(ctx, cx, cy, emX, emY, facing, s, intensity, isSkillPrep, elapsed, pal, reducedMotion);
  } else if (isLaser) {
    // Tight photonic capacitor rays converging cleanly into optical emitter
    drawLaserPrepMotion(ctx, cx, cy, emX, emY, facing, s, intensity, isSkillPrep, elapsed, pal, reducedMotion);
  } else if (isArtillery) {
    // Boiling pressurized furnace core + rising curling smoke puffs & sparks
    drawArtilleryPrepMotion(ctx, cx, cy, emX, emY, facing, s, intensity, isSkillPrep, elapsed, pal, reducedMotion);
  } else if (isLightning) {
    // Biological stepped lightning leaders snapping into the storm lance tip
    drawSoftBloom(ctx, emX, emY, (9 + ease * 8) * s * (isSkillPrep ? 1.25 : 1.0), pal.core, pal.primary, 0.56 * ease);
    const arcCount = isSkillPrep ? 3 : 2;
    const stepIdx = Math.floor(elapsed * 14);
    for (let i = 0; i < arcCount; i += 1) {
      const a = elapsed * 4.2 + (i * Math.PI * 2) / arcCount;
      const dist = (13 + ease * 7) * s * (isSkillPrep ? 1.25 : 1.0);
      drawSteppedLightningBolt(
        ctx,
        emX + Math.cos(a) * dist,
        emY + Math.sin(a) * dist,
        emX,
        emY,
        {
          segments: 4,
          amplitude: 3.4 * s,
          width: 1.7 * s,
          color: pal.primary,
          secondaryColor: pal.secondary,
          coreColor: pal.core,
          alpha: 0.92 * ease,
          seed: 71 + i * 19,
          stepIndex: stepIdx,
        },
      );
    }
  } else if (isShield) {
    // Staggered flipping hard-light hex plates unfolding ahead of shield face
    drawShieldPrepMotion(ctx, cx, cy, emX, emY, facing, s, intensity, isSkillPrep, elapsed, pal);
  } else {
    // Flowing converging energy filaments + organic pulsing core (zero rigid sigil stamp)
    const scaleMod = isSkillPrep ? 1.28 : 1.0;
    drawSoftBloom(ctx, emX, emY, (8 + ease * 7) * s * scaleMod, pal.core, pal.primary, 0.52 * ease);
    if (!reducedMotion) {
      const strands = isSkillPrep ? 4 : 3;
      for (let i = 0; i < strands; i += 1) {
        const baseA = elapsed * 2.8 * facing + (i * Math.PI * 2) / strands;
        const startR = (16 * (1 - ease * 0.52) + 4) * s * scaleMod;
        drawAnalyticalRibbon(
          ctx,
          (u) => {
            const r = startR * (1 - u);
            const a = baseA + u * 1.15 * facing;
            return { x: emX + Math.cos(a) * r, y: emY + Math.sin(a) * r * 0.85 };
          },
          {
            steps: 9,
            maxWidth: (isSkillPrep ? 2.6 : 2.0) * s * ease,
            color: i % 2 === 0 ? pal.primary : pal.secondary,
            coreColor: pal.core,
            alpha: 0.86 * ease,
            taperProfile: 'comet',
            coreRatio: 0.48,
            glowAlpha: 0.16,
          },
        );
      }
    }
    drawStarFlare(ctx, emX, emY, (5.5 + ease * 6.5) * s * scaleMod, 0.15, pal.secondary, pal.core, 0.92 * ease, elapsed * 2, 4);
  }

  ctx.restore();
}

// ============================================================================
// 3. Upgraded Architectural Skill Telegraph Renderer (Preparation Warning Zone)
// ============================================================================

export function drawEnhancedAbilityTelegraph(ctx, bf, w, h, tg, elapsed = 0) {
  const p = bf.worldToScreen(tg.x, tg.y, w, h);
  const progress = clamp01(tg.elapsed / Math.max(0.05, tg.duration));
  const ease = easeOutQuart(progress);
  const rx = safeR(tg.radius * (p.scaleX ?? p.scale * 0.85), 14);
  const ry = safeR(tg.radius * (p.scaleY ?? p.scale * 0.46), 8);
  const color = tg.color || '#f87171';
  const abId = tg.abilityId || '';
  const pulse = 0.86 + Math.sin(elapsed * 12) * 0.14;

  ctx.save();

  // Translucent tactical ground wash (keeps units inside 100% readable)
  if (typeof ctx.createRadialGradient === 'function') {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1, ry / rx);
    const wash = ctx.createRadialGradient(0, 0, rx * 0.15, 0, 0, rx);
    wash.addColorStop(0, withAlpha(color, 0.04 + progress * 0.1));
    wash.addColorStop(0.78, withAlpha(color, 0.12 + progress * 0.14));
    wash.addColorStop(1, withAlpha(color, 0.02));
    ctx.fillStyle = wash;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Animated sweeping open perimeter brackets (living lock-on perimeter, not a static ring stamp)
  const bracketCount = abId.startsWith('boss_') ? 4 : 3;
  for (let b = 0; b < bracketCount; b += 1) {
    const startA = elapsed * 0.95 + (b * Math.PI * 2) / bracketCount;
    const span = (Math.PI * 2) / bracketCount * (0.48 + progress * 0.16);
    drawAnalyticalRibbon(
      ctx,
      (u) => {
        const a = startA + u * span;
        const wob = organicContourFactor(a, elapsed * 4, 7, 0.03);
        return { x: p.x + Math.cos(a) * rx * wob, y: p.y + Math.sin(a) * ry * wob };
      },
      {
        steps: 12,
        maxWidth: (2.6 + progress * 1.4) * pulse,
        color,
        coreColor: '#fffbeb',
        alpha: (0.68 + progress * 0.28) * pulse,
        taperProfile: 'spindle',
        coreRatio: 0.42,
        glowAlpha: 0.18,
      },
    );
  }

  // Expanding inner detonation timer edge (delicate crisp leading wave)
  drawEllipticalHalo(ctx, p.x, p.y, rx * ease, ry * ease, {
    lineWidth: 2.0,
    color,
    coreColor: '#ffffff',
    alpha: 0.5 + progress * 0.42,
  });

  // Ability-specific animated focal choreography (no heavy opaque stamps!)
  if (abId === 'unit_solar_flare' || abId === 'boss_orbital_cataclysm') {
    // Gathering boiling solar plasma kernel + inward thermal convection wisps
    drawBoilingPlasmaBody(ctx, p.x, p.y, Math.min(rx, ry) * (0.2 + progress * 0.22), {
      primary: color,
      secondary: '#fde047',
      core: '#fffbeb',
      glow: '#ea580c',
      alpha: 0.42 + progress * 0.45,
      phase: elapsed * 7.5,
      seed: 19,
      turbulence: 0.3,
      samples: 10,
    });
    for (let k = 0; k < 4; k += 1) {
      const baseA = elapsed * 1.6 + (k * Math.PI) / 2;
      drawAnalyticalRibbon(
        ctx,
        (u) => {
          const rMul = (1 - u) * 0.95 + 0.14;
          const a = baseA + u * 0.85;
          return { x: p.x + Math.cos(a) * rx * rMul, y: p.y + Math.sin(a) * ry * rMul };
        },
        {
          steps: 10,
          maxWidth: 2.2 + progress * 1.2,
          color: '#fde047',
          coreColor: '#fffbeb',
          alpha: 0.48 + progress * 0.42,
          taperProfile: 'comet',
          coreRatio: 0.4,
          glowAlpha: 0.16,
        },
      );
    }
  } else if (
    abId === 'unit_chrono_snare' ||
    abId === 'enemy_stasis_field' ||
    abId === 'boss_chrono_lock' ||
    abId === 'boss_chrono_fracture' ||
    abId === 'boss_temporal_collapse'
  ) {
    // Ratcheting mechanical temporal calipers snapping into alignment
    const tick = ratchetStepAngle(progress, 6, Math.PI / 3);
    for (let c = 0; c < 2; c += 1) {
      const a0 = tick * (c === 0 ? 1 : -0.75) + c * Math.PI;
      drawAnalyticalRibbon(
        ctx,
        (u) => {
          const a = a0 + (u - 0.5) * 1.45;
          return { x: p.x + Math.cos(a) * rx * 0.72, y: p.y + Math.sin(a) * ry * 0.72 };
        },
        {
          steps: 12,
          maxWidth: 2.6,
          color: c === 0 ? color : '#f5d37a',
          coreColor: '#faf5ff',
          alpha: 0.65 + progress * 0.3,
          taperProfile: 'spindle',
          coreRatio: 0.45,
          glowAlpha: 0.16,
        },
      );
    }
    const handA = -Math.PI * 0.5 + tick * 1.5;
    drawTaperedNeedle(ctx, p.x, p.y, p.x + Math.cos(handA) * rx * 0.68, p.y + Math.sin(handA) * ry * 0.68, {
      width: 2.4,
      color: '#f5d37a',
      coreColor: '#ffffff',
      alpha: 0.78 + progress * 0.2,
      peakRatio: 0.6,
    });
  } else if (
    abId === 'unit_aegis_pulse' ||
    abId === 'unit_aegis_matrix' ||
    abId === 'unit_bulwark_guard' ||
    abId === 'boss_aegis_shell' ||
    abId === 'boss_bastion_wall' ||
    abId === 'boss_iron_domain' ||
    abId === 'mod_ability_bulwark_aura'
  ) {
    // Unfolding animated hex corners locking toward perimeter
    for (let k = 0; k < 6; k += 1) {
      const a = (k * Math.PI) / 3 + elapsed * 0.45;
      const hx = p.x + Math.cos(a) * rx * (0.58 + ease * 0.18);
      const hy = p.y + Math.sin(a) * ry * (0.58 + ease * 0.18);
      const nextA = ((k + 1) * Math.PI) / 3 + elapsed * 0.45;
      const nx = p.x + Math.cos(nextA) * rx * (0.58 + ease * 0.18);
      const ny = p.y + Math.sin(nextA) * ry * (0.58 + ease * 0.18);
      ctx.strokeStyle = withAlpha(color, 0.55 + progress * 0.35);
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + (nx - hx) * (0.35 + progress * 0.5), hy + (ny - hy) * (0.35 + progress * 0.5));
      ctx.stroke();
    }
  } else if (abId === 'boss_eclipse_wave' || abId === 'boss_execution_cleave') {
    // Sweeping twin lunar crescent wisps around telegraph edge
    for (const dir of [-1, 1]) {
      const baseA = elapsed * 1.4 * dir + (dir > 0 ? 0 : Math.PI);
      drawAnalyticalRibbon(
        ctx,
        (u) => {
          const a = baseA + (u - 0.5) * 1.7;
          return { x: p.x + Math.cos(a) * rx * 0.78, y: p.y + Math.sin(a) * ry * 0.78 };
        },
        {
          steps: 12,
          maxWidth: 3.2,
          color: dir > 0 ? color : '#fecdd3',
          coreColor: '#ffffff',
          alpha: 0.76,
          taperProfile: 'crescent',
          coreRatio: 0.42,
          glowAlpha: 0.18,
        },
      );
    }
  } else {
    // Tightening animated crosshair brackets
    const rIn = Math.min(rx, ry) * (0.95 - progress * 0.35);
    for (let k = 0; k < 4; k += 1) {
      const a = -elapsed * 0.9 + (k * Math.PI) / 2;
      drawTaperedNeedle(
        ctx,
        p.x + Math.cos(a) * rIn * 1.25,
        p.y + Math.sin(a) * rIn * 0.65,
        p.x + Math.cos(a) * rIn * 0.55,
        p.y + Math.sin(a) * rIn * 0.28,
        {
          width: 2.0,
          color,
          coreColor: '#ffffff',
          alpha: 0.78,
          peakRatio: 0.75,
        },
      );
    }
  }

  // Crisp tactical warning badge
  if (tg.label) {
    ctx.font = '700 10.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    const ly = p.y - ry * 0.42;
    ctx.fillStyle = 'rgba(6, 9, 18, 0.88)';
    const tw = ctx.measureText(tg.label).width;
    ctx.fillRect(p.x - tw * 0.5 - 6, ly - 10, tw + 12, 14);
    ctx.strokeStyle = withAlpha(color, 0.85);
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x - tw * 0.5 - 6, ly - 10, tw + 12, 14);
    ctx.fillStyle = '#fef3c7';
    ctx.fillText(tg.label, p.x, ly);
  }

  ctx.restore();
}
