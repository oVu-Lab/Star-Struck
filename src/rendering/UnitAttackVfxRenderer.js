/**
 * UnitAttackVfxRenderer — Round 2 Artistic Refinement & Attack Variety Renderer
 * for ALL 33 units (+4 support modes) in Star Struck.
 *
 * Design pillars:
 * - Zero generic glowing parabolic orbs: 14 distinct ranged/magic/support presentation
 *   structures (railgun beams, sky-descended judgment pillars, intertwining curse tethers,
 *   target-locked solar runes, 3-beat rapid bursts, converging flanking crystal shards,
 *   5-blade prism fans, geodesic hex gates, Roman clockface dials, sculpted ice spears,
 *   ground-skimming banner waves, twin helical support ribbons, and physical mortars only
 *   for the 2 artillery bombardiers).
 * - Zero repetitive ground-crack melee clones: 15 distinct melee choreographies where
 *   ground cracks are strictly reserved for the 3 justified seismic/molten heavies
 *   (Siege Juggernaut, Siege Colossus, Dreadnought Hyperion).
 * - Rich internal fine detail: beveled double-edged slashes with inner rune ticks or
 *   serrated teeth, 8-fold cathedral rosettes, Roman clockface dials with sweeping hands,
 *   geodesic truss hex plates, multi-plane sculpted ice spires, and finned mortar shells
 *   with ground landing crosshairs.
 */

import { UNIT_STATES } from '../battle/UnitManager.js';
import {
  UNIT_ATTACK_FX_KINDS,
  UNIT_ATTACK_FX_KIND_SET,
  resolveUnitAttackVfxProfile,
} from './UnitAttackVfxConfig.js';
import {
  clamp01,
  easeOutCubic,
  easeOutQuart,
  smoothWindow,
  withAlpha,
  sampleQuadBezier,
  sampleCubicBezier,
  sampleHelixArc,
  drawAnalyticalRibbon,
  drawSoftBloom,
  drawEllipticalHalo,
  drawSymmetricalSigilRing,
  drawPrecisionArrow,
  drawPrecisionChevron,
  drawTaperedNeedle,
  drawTaperedBeamSpire,
  drawPrecisionReticle,
  drawDiamondPrism,
  drawStarFlare,
  drawLotusCrest,
  drawSteppedLightningBolt,
  drawProgressiveLaserBeam,
  createDetRng,
} from './NonUnitVfxGeometry.js';
import {
  drawGearWheel,
  drawHexShieldTile,
  drawFacetedCrystal,
  quadTo,
} from './UnitObjectModelHelpers.js';
import { resolveUnitObjectDesign } from './UnitObjectDesignCatalog.js';
import {
  drawSolarCoronaOrb,
  drawHeatShimmerArcs,
  drawChronoMechanism,
  drawLunarCrescentWave,
  drawMultifacetedCrystal,
  drawRuneShockwaveRing,
  drawArtillerySmokePlume,
} from './UnitVfxOverhaulHelpers.js';
import {
  ratchetStepAngle,
  drawBoilingPlasmaBody,
  drawCrystalFacet3D,
  drawSolarCastReleaseMotion,
  drawSolarTravelMotion,
  drawSolarImpactMotion,
  drawChronoCastReleaseMotion,
  drawChronoTravelMotion,
  drawChronoImpactMotion,
  drawCrystalCastReleaseMotion,
  drawCrystalTravelMotion,
  drawCrystalImpactMotion,
} from './UnitVfxMotionEngine.js';
import {
  drawLunarFlowWaveMotion,
  drawConvergingCrystalsMotion,
  drawGlacialLanceMotion,
  drawCrystalCageImpactMotion,
  drawArtillerySmokeTrail,
  drawArtilleryBlastMotion,
  drawShieldWaveMotion,
  drawWindLanceMotion,
  drawStormLanceMotion,
  drawSacredJudgmentMotion,
  drawCorruptedSiphonMotion,
  drawGyroOrbitalMotion,
  drawVoidRiftTearMotion,
} from './UnitVfxMotionFamilies.js';

export function isUnitAttackWorldEffect(kind) {
  return UNIT_ATTACK_FX_KIND_SET.has(kind);
}

function isReducedMotionActive() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Resolves individualized attack VFX scale calibrated to each unit's redesigned
 * 64-106px 2.5D object model silhouette (removes the old 1.45-1.65 boss cap).
 */
function resolveAttackVfxScale(bfScale, profile, fxScale = null, maxCap = 1.65) {
  const baseUnitScale = Math.max(0.76, Math.min(1.18, bfScale / 8.0));
  const profileVfx = profile?.vfxScale || 1.04;
  const relativeFx =
    typeof fxScale === 'number' && Number.isFinite(fxScale) && fxScale > 0
      ? Math.max(0.82, Math.min(1.22, fxScale / Math.max(0.5, profile?.scale || 1)))
      : 1;
  return Math.max(0.8, Math.min(maxCap, baseUnitScale * profileVfx * relativeFx));
}

/**
 * Resolves elevated major skill VFX scale so abilities command clear visual
 * hierarchy over normal attacks while strictly preserving battlefield visibility.
 */
function resolveSkillVfxScale(bfScale, profile, fxScale = null) {
  const baseUnitScale = Math.max(0.78, Math.min(1.2, bfScale / 8.0));
  const skillMul = profile?.skillScale || 1.28;
  const relativeFx =
    typeof fxScale === 'number' && Number.isFinite(fxScale) && fxScale > 0
      ? Math.max(0.85, Math.min(1.22, fxScale / Math.max(0.5, profile?.scale || 1)))
      : 1;
  return Math.max(1.0, Math.min(1.95, baseUnitScale * skillMul * relativeFx));
}

/**
 * Computes screen-space weapon/emitter origin matching UnitObjectModelRenderer
 * (64-106px 2.5D models) so attacks visibly emerge directly from the unit's
 * weapon/core/emitter and mirror symmetrically across facing = +1 / -1.
 */
export function resolveUnitEmitterScreenPoint(
  bf,
  w,
  h,
  unit,
  fallbackX,
  fallbackY,
  facingSign = 1,
  profile = null,
  elapsed = 0,
) {
  const em = profile?.emitter || { screenForwardPx: 20, screenYOffsetPx: -3 };
  if (unit && unit.state !== UNIT_STATES.DEAD) {
    const p0 = bf.worldToScreen(unit.x, unit.y, w, h, 0);
    const uScale = (unit.visualScale || 1) * Math.max(0.76, Math.min(1.26, p0.scale / 8.0));
    const design = resolveUnitObjectDesign(unit, unit.side);
    const spriteSize = (design?.renderSize || 68) * uScale;
    const phase = unit.phase || 0;
    const isMoving = unit.state === UNIT_STATES.MOVING;
    const walkBob = isMoving
      ? Math.abs(Math.sin(elapsed * 9.5 + phase)) * 4.0
      : Math.sin(elapsed * 3.4 + phase) * 1.4;
    const lungeRatio = unit.attackAnim > 0 ? Math.sin((unit.attackAnim / 0.24) * Math.PI) : 0;
    const facing = unit.facing || facingSign || 1;
    const lunge = lungeRatio * 8 * facing;
    const drawX = p0.x + lunge;
    const drawY = p0.y - spriteSize * 0.72 - walkBob;
    const centerY = drawY + spriteSize * 0.48;
    return {
      x: drawX + facing * (em.screenForwardPx ?? 20) * uScale,
      y: centerY + (em.screenYOffsetPx ?? -3) * uScale,
      scale: uScale,
      facing,
    };
  }
  const p0 = bf.worldToScreen(fallbackX, fallbackY, w, h, 0);
  const design = profile?.id ? resolveUnitObjectDesign(profile.id, profile.resolvedSide) : null;
  const uScale = (profile?.scale || 1) * Math.max(0.76, Math.min(1.26, p0.scale / 8.0));
  const spriteSize = (design?.renderSize || 68) * uScale;
  const facing = facingSign || 1;
  return {
    x: p0.x + facing * (em.screenForwardPx ?? 20) * uScale,
    y: p0.y - spriteSize * 0.24 + (em.screenYOffsetPx ?? -3) * uScale,
    scale: uScale,
    facing,
  };
}

/**
 * Resolves live torso-height screen target coordinates matching the 64-106px
 * redesigned 2.5D models for moving targets.
 */
export function resolveLiveTargetScreenPoint(bf, w, h, targetUnit, fallbackX, fallbackY) {
  if (targetUnit && targetUnit.state !== UNIT_STATES.DEAD) {
    const p0 = bf.worldToScreen(targetUnit.x, targetUnit.y, w, h, 0);
    const uScale = (targetUnit.visualScale || 1) * Math.max(0.76, Math.min(1.26, p0.scale / 8.0));
    const design = resolveUnitObjectDesign(targetUnit, targetUnit.side);
    const spriteSize = (design?.renderSize || 68) * uScale;
    return {
      x: p0.x,
      y: p0.y - spriteSize * 0.24,
      groundX: p0.x,
      groundY: p0.y,
      scale: uScale,
    };
  }
  const p0 = bf.worldToScreen(fallbackX, fallbackY, w, h, 0);
  const uScale = Math.max(0.76, Math.min(1.26, p0.scale / 8.0));
  return {
    x: p0.x,
    y: p0.y - 68 * uScale * 0.24,
    groundX: p0.x,
    groundY: p0.y,
    scale: uScale,
  };
}

/**
 * Partitions normalized flight progress [0..1] into progressive beam phases:
 * - 'charging' (uEnd = 0)
 * - 'emission' (uEnd grows smoothly 0 -> 1)
 * - 'full'     (uEnd = 1)
 */
export function computeLaserPhaseState(progress, beamSpec = {}) {
  const p = clamp01(progress);
  const chargeEnd = Math.max(0.04, Math.min(0.4, beamSpec.chargeEnd ?? 0.18));
  const reachEnd = Math.max(chargeEnd + 0.15, Math.min(0.96, beamSpec.reachEnd ?? 0.84));
  if (p < chargeEnd) {
    return {
      phase: 'charging',
      chargeT: clamp01(p / chargeEnd),
      emitT: 0,
      fullT: 0,
      uStart: 0,
      uEnd: 0,
    };
  }
  if (p < reachEnd) {
    const emitT = clamp01((p - chargeEnd) / (reachEnd - chargeEnd));
    return {
      phase: 'emission',
      chargeT: 1,
      emitT,
      fullT: 0,
      uStart: 0,
      uEnd: easeOutCubic(emitT),
    };
  }
  return {
    phase: 'full',
    chargeT: 1,
    emitT: 1,
    fullT: clamp01((p - reachEnd) / Math.max(0.01, 1 - reachEnd)),
    uStart: 0,
    uEnd: 1,
  };
}

// ============================================================================
// Fine-Detail Geometric Primitives (Beveled Blades, Rosettes, Clockfaces,
// Geodesic Hex Plates, Faceted Ice Spires, Finned Mortar Shells)
// ============================================================================

/**
 * Draws a richly detailed beveled crescent slash arc with:
 * - Main analytical tapered silhouette + controlled glow
 * - Razor bright outer metallic/energy bevel edge
 * - Optional inner structural detail: 'none' | 'rune_ticks' | 'circuit' | 'serrated'
 */
function drawBeveledBladeArc(ctx, cx, cy, rx, ry, angleStart, angleEnd, {
  maxWidth = 8,
  color = '#38bdf8',
  secondaryColor = '#bae6fd',
  coreColor = '#fffdf4',
  alpha = 0.9,
  rotation = 0,
  steps = 24,
  detail = 'none',
  detailCount = 7,
} = {}) {
  if (alpha <= 0.015 || rx < 2 || maxWidth < 0.5) return;
  const span = angleEnd - angleStart;
  if (Math.abs(span) < 0.05) return;

  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const evalPt = (u, rMul = 1) => {
    const a = angleStart + span * u;
    const lx = Math.cos(a) * rx * rMul;
    const ly = Math.sin(a) * ry * rMul;
    const ltx = -Math.sin(a) * rx * rMul * span;
    const lty = Math.cos(a) * ry * rMul * span;
    return {
      x: cx + lx * cosR - ly * sinR,
      y: cy + lx * sinR + ly * cosR,
      tx: ltx * cosR - lty * sinR,
      ty: ltx * sinR + lty * cosR,
    };
  };

  // Primary tapered crescent blade body
  drawAnalyticalRibbon(ctx, (u) => evalPt(u, 1), {
    uStart: 0,
    uEnd: 1,
    steps,
    maxWidth,
    color,
    coreColor,
    alpha,
    taperProfile: 'crescent',
    coreRatio: 0.36,
    glowWidthMultiplier: 1.65,
    glowAlpha: 0.22,
  });

  // Outer razor specular bevel line (offset slightly outward along cutting edge)
  drawAnalyticalRibbon(ctx, (u) => evalPt(u, 1.07), {
    uStart: 0.06,
    uEnd: 0.96,
    steps: Math.max(14, Math.round(steps * 0.75)),
    maxWidth: Math.max(1.2, maxWidth * 0.28),
    color: secondaryColor,
    coreColor,
    alpha: alpha * 0.92,
    taperProfile: 'comet',
    coreRatio: 0.62,
    glowWidthMultiplier: 1.0,
    glowAlpha: 0,
  });

  // Fine inner structural detail along the blade interior
  if (detail !== 'none' && detailCount >= 3) {
    ctx.save();
    ctx.lineCap = 'round';
    if (detail === 'serrated') {
      // Razor saw-fang inner teeth along trailing edge
      ctx.fillStyle = withAlpha(secondaryColor, alpha * 0.86);
      ctx.strokeStyle = withAlpha(coreColor, alpha * 0.72);
      ctx.lineWidth = 0.8;
      for (let i = 0; i < detailCount; i += 1) {
        const u0 = 0.14 + (i / detailCount) * 0.72;
        const uMid = u0 + 0.36 / detailCount;
        const u1 = u0 + 0.72 / detailCount;
        const p0 = evalPt(u0, 0.96);
        const pTip = evalPt(uMid, 0.74);
        const p1 = evalPt(u1, 0.96);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(pTip.x, pTip.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else if (detail === 'rune_ticks' || detail === 'circuit') {
      // Inscribed radial rune notches or precision mechanical rail ticks
      for (let i = 0; i < detailCount; i += 1) {
        const u = 0.14 + (i / Math.max(1, detailCount - 1)) * 0.72;
        const pIn = evalPt(u, detail === 'circuit' ? 0.82 : 0.85);
        const pOut = evalPt(u, 1.03);
        ctx.strokeStyle = withAlpha(coreColor, alpha * 0.85);
        ctx.lineWidth = detail === 'circuit' ? 1.35 : 1.1;
        ctx.beginPath();
        ctx.moveTo(pIn.x, pIn.y);
        ctx.lineTo(pOut.x, pOut.y);
        ctx.stroke();

        if (detail === 'circuit' && i % 2 === 0) {
          // Tiny precision node dot on inner rail
          ctx.fillStyle = withAlpha(secondaryColor, alpha * 0.92);
          ctx.beginPath();
          ctx.arc(pIn.x, pIn.y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }
}

/**
 * Draws a geodesic hexagonal hard-light barrier plate with internal triangular
 * truss lines, recessed bevel frame, and glowing corner rivets.
 */
function drawGeodesicHexPlate(ctx, cx, cy, rx, ry, {
  rotation = 0,
  color = '#38bdf8',
  secondaryColor = '#bae6fd',
  coreColor = '#fffdf4',
  fillAlpha = 0.18,
  strokeAlpha = 0.9,
  lineWidth = 1.6,
  withTruss = true,
} = {}) {
  if ((fillAlpha <= 0.01 && strokeAlpha <= 0.01) || rx < 2) return;
  const pts = [];
  for (let i = 0; i < 6; i += 1) {
    const a = rotation + (i * Math.PI) / 3;
    pts.push({ x: Math.cos(a) * rx, y: Math.sin(a) * ry });
  }

  ctx.save();
  ctx.translate(cx, cy);

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < 6; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();

  if (fillAlpha > 0.01) {
    ctx.fillStyle = withAlpha(color, fillAlpha);
    ctx.fill();
  }

  // Internal triangular geodesic truss struts
  if (withTruss && strokeAlpha > 0.05) {
    ctx.strokeStyle = withAlpha(secondaryColor, strokeAlpha * 0.44);
    ctx.lineWidth = Math.max(0.65, lineWidth * 0.45);
    ctx.beginPath();
    for (let i = 0; i < 3; i += 1) {
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i + 3].x, pts[i + 3].y);
    }
    ctx.stroke();

    // Recessed inner hexagon contour
    ctx.strokeStyle = withAlpha(coreColor, strokeAlpha * 0.48);
    ctx.lineWidth = Math.max(0.6, lineWidth * 0.38);
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const px = pts[i].x * 0.64;
      const py = pts[i].y * 0.64;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }

  if (strokeAlpha > 0.01) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 6; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.strokeStyle = withAlpha(color, strokeAlpha);
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    ctx.strokeStyle = withAlpha(coreColor, strokeAlpha * 0.78);
    ctx.lineWidth = Math.max(0.7, lineWidth * 0.42);
    ctx.stroke();

    // Glowing corner rivets on alternating vertices
    ctx.fillStyle = withAlpha(coreColor, strokeAlpha * 0.92);
    const rivetR = Math.max(1.0, lineWidth * 0.65);
    for (let i = 0; i < 6; i += 2) {
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, rivetR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * Draws an ornate 8-fold sacred cathedral rosette seal (nested square/diamond
 * filigree + fine concentric arcs) projected cleanly onto ground or sky planes.
 */
function drawCathedralRosette(ctx, cx, cy, rx, ry, {
  rotation = 0,
  color = '#f5d37a',
  secondaryColor = '#fef08a',
  coreColor = '#fffdf7',
  alpha = 0.88,
  lineWidth = 1.4,
} = {}) {
  if (alpha <= 0.015 || rx < 3 || ry < 1.5) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / Math.max(0.001, rx));
  ctx.rotate(rotation);

  // Outer twin filigree circles
  ctx.strokeStyle = withAlpha(color, alpha * 0.86);
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = withAlpha(coreColor, alpha * 0.72);
  ctx.lineWidth = Math.max(0.65, lineWidth * 0.48);
  ctx.beginPath();
  ctx.arc(0, 0, rx * 0.82, 0, Math.PI * 2);
  ctx.stroke();

  // Dual rotated inscribed squares forming an 8-point sacred octagram
  for (let sq = 0; sq < 2; sq += 1) {
    ctx.save();
    ctx.rotate((sq * Math.PI) / 4);
    ctx.strokeStyle = withAlpha(sq === 0 ? secondaryColor : color, alpha * 0.82);
    ctx.lineWidth = Math.max(0.85, lineWidth * 0.72);
    ctx.beginPath();
    for (let i = 0; i < 4; i += 1) {
      const a = (i * Math.PI) / 2;
      const px = Math.cos(a) * rx * 0.92;
      const py = Math.sin(a) * rx * 0.92;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // 4 cardinal diamond filigree nodes
  ctx.fillStyle = withAlpha(coreColor, alpha * 0.94);
  const nr = Math.max(1.8, rx * 0.09);
  for (let i = 0; i < 4; i += 1) {
    const a = (i * Math.PI) / 2;
    const nx = Math.cos(a) * rx;
    const ny = Math.sin(a) * rx;
    ctx.beginPath();
    ctx.moveTo(nx, ny - nr);
    ctx.lineTo(nx + nr, ny);
    ctx.lineTo(nx, ny + nr);
    ctx.lineTo(nx - nr, ny);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draws a precision chronometer / Roman clockface dial with 12 radial ticks,
 * nested astrolabe ring, and sweeping hour + minute hands.
 */
function drawClockfaceDial(ctx, cx, cy, rx, ry, {
  rotation = 0,
  handAngle1 = -1.2,
  handAngle2 = 0.7,
  color = '#a78bfa',
  secondaryColor = '#f5d37a',
  coreColor = '#faf5ff',
  alpha = 0.9,
  lineWidth = 1.5,
} = {}) {
  if (alpha <= 0.015 || rx < 3 || ry < 1.5) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / Math.max(0.001, rx));

  // Outer brass-violet bezel ring
  ctx.strokeStyle = withAlpha(color, alpha * 0.88);
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = withAlpha(coreColor, alpha * 0.75);
  ctx.lineWidth = Math.max(0.6, lineWidth * 0.42);
  ctx.beginPath();
  ctx.arc(0, 0, rx * 0.76, 0, Math.PI * 2);
  ctx.stroke();

  // 12 precision radial hour ticks (cardinals emphasized in gold)
  for (let i = 0; i < 12; i += 1) {
    const a = rotation + (i * Math.PI * 2) / 12;
    const isCardinal = i % 3 === 0;
    const r0 = rx * (isCardinal ? 0.68 : 0.8);
    const r1 = rx * 0.98;
    ctx.strokeStyle = withAlpha(isCardinal ? secondaryColor : coreColor, alpha * (isCardinal ? 0.95 : 0.65));
    ctx.lineWidth = isCardinal ? lineWidth * 0.95 : Math.max(0.6, lineWidth * 0.45);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.stroke();
  }

  // Tapered minute hand + hour hand
  ctx.lineCap = 'round';
  ctx.strokeStyle = withAlpha(coreColor, alpha * 0.96);
  ctx.lineWidth = Math.max(1.2, lineWidth * 0.95);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(handAngle1) * rx * 0.78, Math.sin(handAngle1) * rx * 0.78);
  ctx.stroke();

  ctx.strokeStyle = withAlpha(secondaryColor, alpha * 0.94);
  ctx.lineWidth = Math.max(1.4, lineWidth * 1.15);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(handAngle2) * rx * 0.52, Math.sin(handAngle2) * rx * 0.52);
  ctx.stroke();

  // Center jewel pivot
  ctx.fillStyle = withAlpha(coreColor, alpha);
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1.6, rx * 0.09), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draws a sculpted multi-plane beveled glacial icicle spear with sunlit top facet,
 * shaded lower facet, internal specular ridge, and rear frost barbs.
 */
function drawFacetedIceSpire(ctx, x, y, angle, length, halfWidth, {
  color = '#38bdf8',
  secondaryColor = '#a5f3fc',
  coreColor = '#f0f9ff',
  alpha = 0.96,
} = {}) {
  if (alpha <= 0.015 || length < 3) return;
  const tipX = length * 0.62;
  const tailX = -length * 0.52;
  const midX = length * 0.06;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Upper bright crystalline facet
  ctx.beginPath();
  ctx.moveTo(tipX, 0);
  ctx.lineTo(midX, -halfWidth);
  ctx.lineTo(tailX, -halfWidth * 0.25);
  ctx.lineTo(tailX - halfWidth * 0.55, 0);
  ctx.closePath();
  ctx.fillStyle = withAlpha(secondaryColor, alpha * 0.86);
  ctx.fill();

  // Lower deeper sapphire facet
  ctx.beginPath();
  ctx.moveTo(tipX, 0);
  ctx.lineTo(tailX - halfWidth * 0.55, 0);
  ctx.lineTo(tailX, halfWidth * 0.25);
  ctx.lineTo(midX, halfWidth);
  ctx.closePath();
  ctx.fillStyle = withAlpha(color, alpha * 0.88);
  ctx.fill();

  // Razor icy outline rim
  ctx.beginPath();
  ctx.moveTo(tipX, 0);
  ctx.lineTo(midX, -halfWidth);
  ctx.lineTo(tailX, -halfWidth * 0.25);
  ctx.lineTo(tailX - halfWidth * 0.55, 0);
  ctx.lineTo(tailX, halfWidth * 0.25);
  ctx.lineTo(midX, halfWidth);
  ctx.closePath();
  ctx.strokeStyle = withAlpha(coreColor, alpha * 0.95);
  ctx.lineWidth = 1.05;
  ctx.lineJoin = 'miter';
  ctx.stroke();

  // Internal crisp specular spine ridge + cross bevel
  ctx.strokeStyle = withAlpha(coreColor, alpha * 0.92);
  ctx.lineWidth = 0.95;
  ctx.beginPath();
  ctx.moveTo(tailX * 0.8, 0);
  ctx.lineTo(tipX * 0.94, 0);
  ctx.moveTo(midX, -halfWidth * 0.78);
  ctx.lineTo(midX + length * 0.08, 0);
  ctx.lineTo(midX, halfWidth * 0.78);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws a banded mechanical artillery mortar canister shell with tail stabilizer
 * fins, dark iron casing ribs, and glowing incendiary noseband.
 */
function drawMechanicalMortarShell(ctx, x, y, angle, sc, pal, isElite = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Rear iron stabilizer fins
  ctx.fillStyle = withAlpha(pal.glow, 0.95);
  ctx.strokeStyle = withAlpha(pal.primary, 0.9);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-4 * sc, -2.6 * sc);
  ctx.lineTo(-11.5 * sc, -6.5 * sc);
  ctx.lineTo(-8.8 * sc, -2.3 * sc);
  ctx.lineTo(-8.8 * sc, 2.3 * sc);
  ctx.lineTo(-11.5 * sc, 6.5 * sc);
  ctx.lineTo(-4 * sc, 2.6 * sc);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Heavy ogive artillery warhead body
  ctx.beginPath();
  ctx.moveTo(11 * sc, 0);
  ctx.lineTo(4 * sc, -4.6 * sc);
  ctx.lineTo(-6.8 * sc, -3.6 * sc);
  ctx.lineTo(-6.8 * sc, 3.6 * sc);
  ctx.lineTo(4 * sc, 4.6 * sc);
  ctx.closePath();
  ctx.fillStyle = withAlpha(pal.primary, 0.94);
  ctx.fill();
  ctx.strokeStyle = withAlpha(pal.core, 0.88);
  ctx.lineWidth = 1.05;
  ctx.stroke();

  // Segmented brass-iron casing bands
  ctx.strokeStyle = withAlpha(pal.glow, 0.88);
  ctx.lineWidth = 1.2 * sc;
  ctx.beginPath();
  ctx.moveTo(-2.2 * sc, -3.9 * sc);
  ctx.lineTo(-2.2 * sc, 3.9 * sc);
  if (isElite) {
    ctx.moveTo(1.2 * sc, -4.3 * sc);
    ctx.lineTo(1.2 * sc, 4.3 * sc);
  }
  ctx.stroke();

  // Superheated incandescent nose cone
  ctx.fillStyle = withAlpha(pal.secondary, 0.98);
  ctx.beginPath();
  ctx.moveTo(10.6 * sc, 0);
  ctx.lineTo(4.2 * sc, -3.2 * sc);
  ctx.lineTo(2.4 * sc, 0);
  ctx.lineTo(4.2 * sc, 3.2 * sc);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = withAlpha(pal.core, 0.98);
  ctx.beginPath();
  ctx.moveTo(10.2 * sc, 0);
  ctx.lineTo(5.6 * sc, -1.6 * sc);
  ctx.lineTo(4.4 * sc, 0);
  ctx.lineTo(5.6 * sc, 1.6 * sc);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Draws radial branching magma/tectonic ground fissures in perspective ellipse space.
 * STRICTLY RESERVED for the 3 justified seismic/molten heavies:
 * Siege Juggernaut, Siege Colossus, and Dreadnought Hyperion.
 */
function drawRadialGroundCracks(ctx, cx, cy, rx, ry, {
  count = 6,
  seed = 1,
  color = '#f97316',
  coreColor = '#fff7ed',
  alpha = 0.78,
  lineWidth = 1.6,
} = {}) {
  if (alpha <= 0.02 || rx < 4) return;
  const rng = createDetRng(seed);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < count; i += 1) {
    const baseA = (i * Math.PI * 2) / count + (rng() - 0.5) * 0.34;
    const r1 = 0.18 + rng() * 0.1;
    const r2 = 0.54 + rng() * 0.14;
    const r3 = 0.88 + rng() * 0.16;
    const kink = (rng() - 0.5) * 0.32;

    const p0x = cx + Math.cos(baseA) * rx * r1;
    const p0y = cy + Math.sin(baseA) * ry * r1;
    const p1x = cx + Math.cos(baseA + kink) * rx * r2;
    const p1y = cy + Math.sin(baseA + kink) * ry * r2;
    const p2x = cx + Math.cos(baseA - kink * 0.4) * rx * r3;
    const p2y = cy + Math.sin(baseA - kink * 0.4) * ry * r3;

    // Dark charred fissure trench underneath the magma glow
    ctx.strokeStyle = `rgba(18, 8, 6, ${(alpha * 0.72).toFixed(3)})`;
    ctx.lineWidth = lineWidth * 2.1;
    ctx.beginPath();
    ctx.moveTo(p0x, p0y);
    ctx.lineTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.stroke();

    // Molten glowing crack seam
    ctx.strokeStyle = withAlpha(color, alpha * 0.88);
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    ctx.strokeStyle = withAlpha(coreColor, alpha * 0.72);
    ctx.lineWidth = Math.max(0.6, lineWidth * 0.42);
    ctx.stroke();

    // Fine secondary fork branch off midpoint
    if (i % 2 === 0) {
      const branchA = baseA + kink + (rng() > 0.5 ? 0.38 : -0.38);
      const bx = p1x + Math.cos(branchA) * rx * 0.28;
      const by = p1y + Math.sin(branchA) * ry * 0.28;
      ctx.strokeStyle = withAlpha(color, alpha * 0.65);
      ctx.lineWidth = Math.max(0.8, lineWidth * 0.6);
      ctx.beginPath();
      ctx.moveTo(p1x, p1y);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Draws a crisp directional kinetic shock-cone pressure wave.
 */
function drawKineticShockCone(ctx, x, y, angle, radius, {
  color = '#93c5fd',
  secondaryColor = '#f5d37a',
  coreColor = '#f8fafc',
  alpha = 0.88,
  spread = 0.72,
  lineWidth = 2.6,
} = {}) {
  if (alpha <= 0.02 || radius < 3) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.lineCap = 'round';

  ctx.strokeStyle = withAlpha(color, alpha * 0.84);
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(-radius * 0.18, 0, radius, -spread, spread);
  ctx.stroke();

  ctx.strokeStyle = withAlpha(coreColor, alpha * 0.92);
  ctx.lineWidth = Math.max(0.9, lineWidth * 0.44);
  ctx.beginPath();
  ctx.arc(-radius * 0.18, 0, radius * 0.96, -spread * 0.82, spread * 0.82);
  ctx.stroke();

  ctx.strokeStyle = withAlpha(secondaryColor, alpha * 0.6);
  ctx.lineWidth = Math.max(1.0, lineWidth * 0.52);
  ctx.beginPath();
  ctx.arc(-radius * 0.18, 0, radius * 0.68, -spread * 0.72, spread * 0.72);
  ctx.stroke();

  ctx.restore();
}

// ============================================================================
// 1. BESPOKE RANGED / MAGICAL / SUPPORT ATTACK RENDERER (14 Distinct Structures)
// ============================================================================

export function drawUnitProjectile(ctx, bf, w, h, proj, elapsed = 0, unitByUid = null) {
  if (!proj) return;
  const mode =
    proj.kind === 'healing' ? 'heal' : proj.kind === 'shield' ? 'shield' : 'attack';
  const profile = resolveUnitAttackVfxProfile(proj, { mode, side: proj.sourceSide });
  const pal = profile.palette;
  const style =
    profile.projectileStyle ||
    (mode === 'heal'
      ? 'sanctuary_lotus_ribbon'
      : mode === 'shield'
        ? 'hex_aegis_matrix'
        : 'arcane_longbow_arrow');

  // Project current visual point, start anchor, and target anchor
  const vx = proj.x + (proj.visualOffsetX || 0);
  const vy = proj.y + (proj.visualOffsetY || 0);
  const vz = Math.max(3.6, (proj.z ?? 2.5) + 1.2);
  const p = bf.worldToScreen(vx, vy, w, h, vz);
  const s = resolveAttackVfxScale(p.scale, profile, null);

  const sourceUnit = proj.sourceUid && unitByUid ? unitByUid.get(proj.sourceUid) : null;
  const targetUnit = proj.targetUid && unitByUid ? unitByUid.get(proj.targetUid) : null;
  const defaultFacing = (proj.targetX ?? proj.x) >= (proj.startX ?? proj.x) ? 1 : -1;

  const emitterP = resolveUnitEmitterScreenPoint(
    bf,
    w,
    h,
    sourceUnit,
    proj.startX ?? vx - 8,
    proj.startY ?? vy,
    defaultFacing,
    profile,
    elapsed,
  );
  const liveTargetP = resolveLiveTargetScreenPoint(
    bf,
    w,
    h,
    targetUnit,
    proj.targetX ?? vx + 10,
    proj.targetY ?? vy,
  );

  const startP = emitterP;
  const targetWorldX = proj.targetX ?? vx + 10;
  const targetWorldY = proj.targetY ?? vy;
  const targetP = liveTargetP;
  const targetGroundP = bf.worldToScreen(targetWorldX, targetWorldY, w, h, 0);

  // Compute screen-space flight heading
  let prevP;
  if (typeof proj.prevX === 'number' && typeof proj.prevY === 'number') {
    prevP = bf.worldToScreen(
      proj.prevX + (proj.prevOffsetX || 0),
      proj.prevY + (proj.prevOffsetY || 0),
      w,
      h,
      proj.prevZ ?? vz,
    );
  }
  let sdx = prevP ? p.x - prevP.x : 0;
  let sdy = prevP ? p.y - prevP.y : 0;
  if (Math.hypot(sdx, sdy) < 0.6) {
    sdx = targetP.x - startP.x;
    sdy = targetP.y - startP.y;
  }
  const heading = Math.atan2(sdy, sdx);
  const ux = Math.cos(heading);
  const uy = Math.sin(heading);
  const nx = -uy;
  const ny = ux;

  // Axis unit vector directly from emitter/caster to target (for beams, bursts, fans)
  const adx = targetP.x - startP.x;
  const ady = targetP.y - startP.y;
  const axisDist = Math.max(8, Math.hypot(adx, ady));
  const aux = adx / axisDist;
  const auy = ady / axisDist;
  const anx = -auy;
  const any = aux;
  const axisAngle = Math.atan2(ady, adx);

  const progress = clamp01((proj.traveled || 0) / Math.max(1, proj.totalDist || 12));
  const spin = (proj.age || 0) * 10 + (proj.seed || 0) * 0.01;
  const reducedMotion = isReducedMotionActive();

  // Ground shadow ONLY for physical aerial projectiles (not beams, sky pillars, or ground runes)
  const isAerialObject =
    style === 'arcane_longbow_arrow' ||
    style === 'inferno_mortar_shell' ||
    style === 'elite_warlord_barrage_shell' ||
    style === 'glacial_icicle_spear' ||
    style === 'elite_trishard_glacial_lance' ||
    style === 'dread_banner_crescent';
  if (isAerialObject) {
    const groundP = bf.worldToScreen(vx, vy, w, h, 0);
    ctx.save();
    ctx.fillStyle = 'rgba(4, 7, 14, 0.28)';
    ctx.beginPath();
    ctx.ellipse(groundP.x, groundP.y + 1, 5.5 * s, 2.3 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  switch (style) {
    // ------------------------------------------------------------------
    // 1. ARCANE ARCHER — Assembled 3D-Tumbling Crystal Lance & Helical Micro-Shard Wake
    // ------------------------------------------------------------------
    case 'arcane_longbow_arrow': {
      drawCrystalTravelMotion(ctx, p, heading, progress, s, elapsed, proj.seed || 31, pal, reducedMotion);
      break;
    }

    // ------------------------------------------------------------------
    // 2. FIELD CLERIC (OFFENSE) — Buoyant Ascending Motes + Spiraling Judgment Light Column
    // ------------------------------------------------------------------
    case 'sacred_judgment_pillar': {
      drawSacredJudgmentMotion(
        ctx,
        startP,
        targetP,
        targetGroundP,
        progress,
        s,
        elapsed,
        proj.seed || 19,
        pal,
        reducedMotion,
      );
      break;
    }

    // ------------------------------------------------------------------
    // 3. FIELD CLERIC (HEAL) — Twin Helical Sanctuary Lotus Ribbons
    // ------------------------------------------------------------------
    case 'sanctuary_lotus_ribbon': {
      // Twin intertwined restorative ribbons weaving smoothly from caster toward p
      for (const dir of [-1, 1]) {
        const p0 = {
          x: startP.x + (p.x - startP.x) * Math.max(0, progress - 0.55),
          y: startP.y + (p.y - startP.y) * Math.max(0, progress - 0.55),
        };
        const wave = Math.sin(spin * 0.7 + (dir > 0 ? 0 : Math.PI)) * 9 * s;
        const c1 = {
          x: p0.x + (p.x - p0.x) * 0.35 + anx * wave,
          y: p0.y + (p.y - p0.y) * 0.35 + any * wave - 5 * s,
        };
        const c2 = {
          x: p0.x + (p.x - p0.x) * 0.72 - anx * wave * 0.75,
          y: p0.y + (p.y - p0.y) * 0.72 - any * wave * 0.75 - 3 * s,
        };
        drawAnalyticalRibbon(ctx, (u) => sampleCubicBezier(p0, c1, c2, p, u), {
          steps: 20,
          maxWidth: 3.1 * s,
          color: dir > 0 ? pal.primary : pal.secondary,
          coreColor: pal.core,
          alpha: 0.84,
          taperProfile: 'comet',
          coreRatio: 0.45,
          glowWidthMultiplier: 1.55,
          glowAlpha: 0.2,
        });
      }
      drawSoftBloom(ctx, p.x, p.y, 12 * s, pal.core, pal.primary, 0.48);
      // 6-petal luminous emerald lotus crest
      drawLotusCrest(ctx, p.x, p.y, 8.2 * s, 8.2 * s, {
        petals: 6,
        rotation: spin * 0.35,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: 0.94,
      });
      break;
    }

    // ------------------------------------------------------------------
    // 4. PULSE SKIRMISHER — Crisp Ultra-Fast Cyan-White Optical Pulse Laser
    // (1 projectile = 1 razor-sharp high-velocity optical beam, zero parallel splayed lines)
    // ------------------------------------------------------------------
    case 'triple_pulse_burst': {
      const beamSpec = profile.beamSpec || { chargeEnd: 0.08, reachEnd: 0.64, coreWidth: 1.45, sheathWidth: 3.8, haloWidth: 13.0 };
      const pState = computeLaserPhaseState(progress, beamSpec);
      const muzzleP = startP;

      if (pState.phase === 'charging') {
        const ct = pState.chargeT;
        drawSoftBloom(ctx, muzzleP.x, muzzleP.y, (4.5 + ct * 5.0) * s, '#ffffff', pal.primary, 0.44 + ct * 0.4);
        if (!reducedMotion) {
          for (let i = 0; i < 3; i += 1) {
            const a = axisAngle + (i - 1) * 0.48;
            const d = (8.5 * (1 - ct) + 1.2) * s;
            drawTaperedNeedle(
              ctx,
              muzzleP.x + Math.cos(a) * d,
              muzzleP.y + Math.sin(a) * d,
              muzzleP.x,
              muzzleP.y,
              {
                width: 1.05 * s,
                color: pal.secondary,
                coreColor: '#ffffff',
                alpha: 0.78 * ct,
                peakRatio: 0.85,
              },
            );
          }
        }
        drawStarFlare(ctx, muzzleP.x, muzzleP.y, (3.2 + ct * 4.2) * s, 0.11, pal.secondary, '#ffffff', 0.96, axisAngle, 4);
        break;
      }

      const uEnd = pState.uEnd;
      const fireSurge = pState.phase === 'emission' ? Math.max(0.32, 1.0 - pState.emitT * 0.55) : 0.42;
      const intensityMul = pState.phase === 'full' ? 1.06 : 0.92 + 0.12 * uEnd;

      drawProgressiveLaserBeam(ctx, muzzleP, targetP, {
        uStart: 0,
        uEnd,
        coreWidth: (beamSpec.coreWidth || 1.45) * s * intensityMul,
        sheathWidth: (beamSpec.sheathWidth || 3.8) * s * intensityMul,
        haloWidth: (beamSpec.haloWidth || 13.0) * s * intensityMul,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: '#ffffff',
        glowColor: pal.glow,
        alpha: 0.97,
        flowPhase: elapsed * 6.5,
        leadingFlare: pState.phase === 'emission' ? 1.0 : 0.58,
        muzzleFlare: fireSurge,
        breakup: 0,
        seed: proj.seed || 17,
        scale: s,
        reducedMotion,
      });
      break;
    }

    // ------------------------------------------------------------------
    // 5. SOLAR PYROMANCER — Radiant Solar Corona Projectile + Sun-Rune Ignition & Eruption
    // ------------------------------------------------------------------
    // 5. SOLAR PYROMANCER — Boiling Deforming Solar Plasma Flare & Buoyant Embers
    // ------------------------------------------------------------------
    case 'solar_rune_ignition': {
      drawSolarTravelMotion(
        ctx,
        startP,
        targetP,
        targetGroundP,
        progress,
        s,
        elapsed,
        proj.seed || 23,
        pal,
        reducedMotion,
      );
      break;
    }

    // ------------------------------------------------------------------
    // 6. AEGIS SENTINEL (OFFENSE) — Concentrated Electric-Blue Optical Laser Beam
    // (Focused pinpoint buildup -> wider concentrated azure-white optical beam, zero inline hex rings)
    // ------------------------------------------------------------------
    case 'hardlight_hex_gate': {
      const beamSpec = profile.beamSpec || { chargeEnd: 0.14, reachEnd: 0.74, coreWidth: 2.0, sheathWidth: 5.6, haloWidth: 20.0 };
      const bState = computeLaserPhaseState(progress, beamSpec);
      const muzzleP = startP;

      if (bState.phase === 'charging') {
        const ct = bState.chargeT;
        drawSoftBloom(ctx, muzzleP.x, muzzleP.y, (6.0 + ct * 7.0) * s, '#ffffff', pal.primary, 0.48 + ct * 0.44);
        if (!reducedMotion) {
          for (let k = 0; k < 4; k += 1) {
            const ang = axisAngle + (k - 1.5) * 0.52;
            const rIn = (12 * (1 - ct) + 1.5) * s;
            drawTaperedNeedle(
              ctx,
              muzzleP.x + Math.cos(ang) * rIn,
              muzzleP.y + Math.sin(ang) * rIn,
              muzzleP.x,
              muzzleP.y,
              {
                width: 1.3 * s,
                color: pal.secondary,
                coreColor: '#ffffff',
                alpha: 0.82 * ct,
                peakRatio: 0.85,
              },
            );
          }
        }
        drawStarFlare(ctx, muzzleP.x, muzzleP.y, (4.0 + ct * 5.2) * s, 0.12, pal.secondary, '#ffffff', 0.96, axisAngle, 4);
        break;
      }

      const uEnd = bState.uEnd;
      const fireSurge = bState.phase === 'emission' ? Math.max(0.38, 1.0 - bState.emitT * 0.52) : 0.5;
      const intensityMul = bState.phase === 'full' ? 1.1 : 0.94 + 0.12 * uEnd;

      drawProgressiveLaserBeam(ctx, muzzleP, targetP, {
        uStart: 0,
        uEnd,
        coreWidth: (beamSpec.coreWidth || 2.0) * s * intensityMul,
        sheathWidth: (beamSpec.sheathWidth || 5.6) * s * intensityMul,
        haloWidth: (beamSpec.haloWidth || 20.0) * s * intensityMul,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: '#ffffff',
        glowColor: pal.glow,
        alpha: 0.98,
        flowPhase: elapsed * 4.4,
        leadingFlare: bState.phase === 'emission' ? 1.05 : 0.68,
        muzzleFlare: fireSurge,
        breakup: 0,
        seed: proj.seed || 51,
        scale: s,
        reducedMotion,
      });
      break;
    }

    // ------------------------------------------------------------------
    // 7. AEGIS SENTINEL & CRYO WARDEN (SHIELD SUPPORT) — Interlocking Geodesic Matrix
    // ------------------------------------------------------------------
    case 'hex_aegis_matrix':
    case 'cryo_crystal_plate': {
      const isCryo = style === 'cryo_crystal_plate';
      // Fine geometric lattice conduit linking support caster to the gliding barrier plates
      ctx.save();
      ctx.strokeStyle = withAlpha(pal.primary, 0.36);
      ctx.lineWidth = 1.3 * s;
      ctx.setLineDash([4 * s, 3 * s]);
      ctx.beginPath();
      ctx.moveTo(startP.x, startP.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      drawSoftBloom(ctx, p.x, p.y, 13 * s, pal.core, pal.primary, 0.45);
      // Twin interlocking geodesic plates locking in formation
      drawGeodesicHexPlate(ctx, p.x + aux * 3 * s, p.y + auy * 3 * s, 8.8 * s, 7.2 * s, {
        rotation: isCryo ? axisAngle : spin * 0.3,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        fillAlpha: 0.24,
        strokeAlpha: 0.96,
        lineWidth: 1.75 * s,
      });
      drawGeodesicHexPlate(ctx, p.x - aux * 4.5 * s, p.y - auy * 4.5 * s, 6.2 * s, 5.2 * s, {
        rotation: isCryo ? axisAngle + Math.PI / 6 : -spin * 0.3,
        color: pal.secondary,
        secondaryColor: pal.core,
        coreColor: pal.core,
        fillAlpha: 0.15,
        strokeAlpha: 0.82,
        lineWidth: 1.2 * s,
      });
      break;
    }

    // ------------------------------------------------------------------
    // 8. CHRONO WEAVER — Time-Dilated Pendulum Needle & Strobe Echoes
    // ------------------------------------------------------------------
    case 'chrono_dial_tether': {
      drawChronoTravelMotion(ctx, startP, targetP, progress, s, elapsed, proj.seed || 41, pal, reducedMotion);
      break;
    }

    // ------------------------------------------------------------------
    // 9. OBSIDIAN MARKSMAN — Clean High-Energy Crimson Optical Laser Beam
    // (Focused pinpoint buildup -> bright firing flash -> fast traveling front + luminous continuous beam)
    // ------------------------------------------------------------------
    case 'obsidian_railgun_beam': {
      const beamSpec = profile.beamSpec || { chargeEnd: 0.14, reachEnd: 0.72, coreWidth: 1.85, sheathWidth: 5.0, haloWidth: 20.0 };
      const rState = computeLaserPhaseState(progress, beamSpec);
      const muzzleP = startP;

      if (rState.phase === 'charging') {
        // Phase 1: Tight concentrated energy buildup at the weapon emitter (no rings, no full beam)
        const ct = rState.chargeT;
        drawSoftBloom(ctx, muzzleP.x, muzzleP.y, (5.5 + ct * 6.5) * s, '#ffffff', pal.primary, 0.45 + ct * 0.42);
        if (!reducedMotion) {
          for (let i = 0; i < 3; i += 1) {
            const a = axisAngle + (i - 1) * 0.55;
            const d = (11 * (1 - ct) + 1.5) * s;
            drawTaperedNeedle(
              ctx,
              muzzleP.x + Math.cos(a) * d,
              muzzleP.y + Math.sin(a) * d,
              muzzleP.x,
              muzzleP.y,
              {
                width: 1.25 * s,
                color: pal.secondary,
                coreColor: '#ffffff',
                alpha: 0.78 * ct,
                peakRatio: 0.85,
              },
            );
          }
        }
        drawStarFlare(ctx, muzzleP.x, muzzleP.y, (3.5 + ct * 5.0) * s, 0.11, pal.secondary, '#ffffff', 0.96, axisAngle, 4);
        break;
      }

      // Phase 2 & 3: Brilliant emission flash -> fast traveling wavefront -> continuous clean optical beam
      const uEnd = rState.uEnd;
      const fireSurge = rState.phase === 'emission' ? Math.max(0.35, 1.0 - rState.emitT * 0.55) : 0.45;
      const intensityMul = rState.phase === 'full' ? 1.08 : 0.92 + 0.12 * uEnd;

      drawProgressiveLaserBeam(ctx, muzzleP, targetP, {
        uStart: 0,
        uEnd,
        coreWidth: (beamSpec.coreWidth || 1.85) * s * intensityMul,
        sheathWidth: (beamSpec.sheathWidth || 5.0) * s * intensityMul,
        haloWidth: (beamSpec.haloWidth || 16.5) * s * intensityMul,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: '#ffffff',
        glowColor: pal.glow,
        alpha: 0.98,
        flowPhase: elapsed * 5.0,
        leadingFlare: rState.phase === 'emission' ? 1.05 : 0.65,
        muzzleFlare: fireSurge,
        breakup: 0,
        seed: proj.seed || 79,
        scale: s,
        reducedMotion,
      });
      break;
    }

    // 10 & 11. CORRUPTED ACOLYTE (OFFENSE & HEAL) — Viscous Peristaltic Siphon Tendrils
    // ------------------------------------------------------------------
    case 'cursed_hex_tether':
    case 'corrupted_siphon_ribbon': {
      drawCorruptedSiphonMotion(ctx, startP, targetP, progress, s, elapsed, proj.seed || 29, pal, {
        isHeal: style === 'corrupted_siphon_ribbon',
        reducedMotion,
      });
      break;
    }

    // ------------------------------------------------------------------
    // 12 & 18. STASIS WEAVER & CHRONO ENFORCER — Converging 3D-Tumbling Crystal Shards
    // ------------------------------------------------------------------
    case 'stasis_tri_crystal':
    case 'elite_phase_ring_shard': {
      const isElite = style === 'elite_phase_ring_shard';
      drawConvergingCrystalsMotion(ctx, startP, targetP, progress, s * (isElite ? 1.08 : 1.0), elapsed, proj.seed || 37, pal, {
        lanes: isElite ? [-22, -8, 8, 22] : [-19, 0, 19],
        isBoss: false,
        reducedMotion,
      });
      break;
    }

    // ------------------------------------------------------------------
    // 13 & 19. INFERNO BOMBARDIER & CAPTAIN — Mechanical Finned Mortar + Curling Smoke Puffs
    // ------------------------------------------------------------------
    case 'inferno_mortar_shell':
    case 'elite_warlord_barrage_shell': {
      const isElite = style === 'elite_warlord_barrage_shell';
      const sc = isElite ? s * 1.12 : s;

      // Subtle animated landing zone brackets at target ground
      const retRx = (12 + Math.sin(progress * Math.PI * 3) * 1.8) * sc;
      const retRy = retRx * 0.48;
      drawEllipticalHalo(ctx, targetGroundP.x, targetGroundP.y, retRx, retRy, {
        lineWidth: 1.4 * sc,
        color: pal.primary,
        coreColor: pal.secondary,
        alpha: 0.52 + progress * 0.28,
        startAngle: progress * 1.5,
        endAngle: progress * 1.5 + Math.PI * 1.4,
      });

      // Curling detached billowing smoke puffs + incandescent propellant exhaust
      drawArtillerySmokeTrail(ctx, p, heading, progress, sc, elapsed, proj.seed || 53, pal, isElite, reducedMotion);
      drawSoftBloom(ctx, p.x, p.y, 12 * sc, pal.secondary, pal.primary, 0.45);
      drawMechanicalMortarShell(ctx, p.x, p.y, heading, sc, pal, isElite);
      break;
    }

    // ------------------------------------------------------------------
    // 14. DREAD BANNERMAN — Fluid Velocity-Deforming War-Standard Crescent Wave
    // ------------------------------------------------------------------
    case 'dread_banner_crescent': {
      const gNow = bf.worldToScreen(vx, vy, w, h, 0);
      drawTaperedNeedle(ctx, gNow.x - ux * 22 * s, gNow.y - uy * 10 * s, gNow.x + ux * 5 * s, gNow.y + uy * 2 * s, {
        width: 3.4 * s,
        color: pal.primary,
        coreColor: pal.secondary,
        alpha: 0.52,
        peakRatio: 0.78,
      });
      drawLunarFlowWaveMotion(ctx, p.x, p.y, heading, s, progress, proj.seed || 61, pal, {
        radiusScale: 0.92,
        isBoss: false,
        reducedMotion,
      });
      break;
    }

    // ------------------------------------------------------------------
    // 15 & 20. CRYO WARDEN & ARCHWARDEN — Spinning 3D Glacial Lances + Curling Frost Vapor
    // ------------------------------------------------------------------
    case 'glacial_icicle_spear':
    case 'elite_trishard_glacial_lance': {
      drawGlacialLanceMotion(ctx, p, heading, progress, s, elapsed, proj.seed || 67, pal, {
        isTri: style === 'elite_trishard_glacial_lance',
        reducedMotion,
      });
      break;
    }

    // ------------------------------------------------------------------
    // 17. ELITE ASTRAL SNIPER — High-Velocity Converging 3D Seeker Crystal Volley
    // ------------------------------------------------------------------
    case 'elite_splitwing_seeker': {
      drawPrecisionReticle(ctx, targetP.x, targetP.y, (12 - progress * 5) * s, {
        rotation: progress * 2.2,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: 0.78,
      });
      drawConvergingCrystalsMotion(ctx, startP, targetP, progress, s * 1.04, elapsed, proj.seed || 71, pal, {
        lanes: [-20, 0, 20],
        isBoss: false,
        reducedMotion,
      });
      break;
    }

    // ------------------------------------------------------------------
    // 21. BOSS AZURE ARCHON KAELIS — 5-Blade Converging 3D-Tumbling Royal Prism Fan
    // ------------------------------------------------------------------
    case 'boss_kaelis_prism_fan': {
      drawConvergingCrystalsMotion(ctx, startP, targetP, progress, s, elapsed, proj.seed || 83, pal, {
        lanes: [-30, -15, 0, 15, 30],
        isBoss: true,
        reducedMotion,
      });
      break;
    }

    // ------------------------------------------------------------------
    // 22. BOSS CHRONO ARBITER VAEL — Time-Dilated Pendulum Lance + Counter-Ratcheting Calipers
    // ------------------------------------------------------------------
    case 'boss_vael_astrolabe_singularity': {
      drawChronoTravelMotion(ctx, startP, targetP, progress, s * 1.18, elapsed, proj.seed || 97, pal, reducedMotion);
      // Ratcheting twin open temporal calipers locking onto target (replaces static boss clockface stamp)
      const calR = (22 - progress * 5) * s;
      const rTick = ratchetStepAngle(progress, 6, Math.PI / 3);
      for (let c = 0; c < 2; c += 1) {
        const a0 = rTick * (c === 0 ? 1 : -0.85) + c * Math.PI;
        drawAnalyticalRibbon(
          ctx,
          (u) => {
            const a = a0 + (u - 0.5) * 1.5;
            return { x: targetP.x + Math.cos(a) * calR, y: targetP.y + Math.sin(a) * calR * 0.72 };
          },
          {
            steps: 12,
            maxWidth: 3.6 * s,
            color: c === 0 ? pal.primary : pal.secondary,
            coreColor: pal.core,
            alpha: 0.88,
            taperProfile: 'crescent',
            coreRatio: 0.45,
            glowAlpha: 0.22,
          },
        );
      }
      break;
    }

    default: {
      drawTaperedNeedle(ctx, p.x - ux * 22 * s, p.y - uy * 22 * s, p.x + ux * 6 * s, p.y + uy * 6 * s, {
        width: 3.6 * s,
        color: proj.color || pal.primary,
        coreColor: pal.core,
        alpha: 0.92,
        peakRatio: 0.72,
      });
      drawSoftBloom(ctx, p.x, p.y, 8 * s, pal.core, proj.color || pal.primary, 0.45);
      break;
    }
  }
}

// ============================================================================
// 2. WORLD ATTACK EFFECTS (Cast Anticipation, 15 Melee Choreographies, Impacts)
// ============================================================================

export function drawUnitAttackWorldEffect(ctx, bf, w, h, fx, layer, unitByUid = null, elapsed = 0) {
  if (!fx) return;
  const t = clamp01(fx.age / Math.max(0.05, fx.duration));
  const profile = resolveUnitAttackVfxProfile(
    {
      vfxProfileId: fx.profileId,
      side: fx.side,
    },
    { mode: fx.meta?.mode || 'attack', side: fx.side },
  );
  const pal = fx.meta?.palette || profile.palette;

  if (fx.kind === UNIT_ATTACK_FX_KINDS.CAST) {
    _drawCastEffect(ctx, bf, w, h, fx, layer, t, profile, pal, unitByUid, elapsed);
  } else if (fx.kind === UNIT_ATTACK_FX_KINDS.MELEE) {
    _drawMeleeEffect(ctx, bf, w, h, fx, layer, t, profile, pal);
  } else if (fx.kind === UNIT_ATTACK_FX_KINDS.IMPACT) {
    _drawImpactEffect(ctx, bf, w, h, fx, layer, t, profile, pal, unitByUid, elapsed);
  } else if (fx.kind === UNIT_ATTACK_FX_KINDS.HIT) {
    _drawHitEffect(ctx, bf, w, h, fx, layer, t, profile, pal);
  } else if (fx.kind === UNIT_ATTACK_FX_KINDS.ABILITY) {
    _drawUnitAbilityEffect(ctx, bf, w, h, fx, layer, t, profile, pal);
  }
}

// ----------------------------------------------------------------------------
// 2A. CAST / ANTICIPATION SIGILS & WEAPON CHARGE FLASHES (ua_cast)
// ----------------------------------------------------------------------------
function _drawCastEffect(ctx, bf, w, h, fx, layer, t, profile, pal, unitByUid = null, elapsed = 0) {
  const sourceUnit = fx.meta?.sourceUid && unitByUid ? unitByUid.get(fx.meta.sourceUid) : null;
  if (sourceUnit && (sourceUnit.state === UNIT_STATES.DEAD || sourceUnit.state === UNIT_STATES.STUNNED)) {
    return;
  }

  const style = fx.style || profile.castStyle || 'bowstring_rune_flash';
  const p = bf.worldToScreen(fx.x, fx.y, w, h, 4.0);
  const gp = bf.worldToScreen(fx.x, fx.y, w, h, 0);
  const s = resolveAttackVfxScale(p.scale, profile, fx.scale);
  const env = smoothWindow(t, 0.2, 0.36, 1.0);
  if (env <= 0.01) return;

  const angle = fx.angle || 0;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);

  if (layer === 'ground') {
    if (style === 'cathedral_halo_seal') {
      const r = (12 + easeOutCubic(t) * 7) * s;
      drawCathedralRosette(ctx, gp.x, gp.y, r, r * 0.48, {
        rotation: t * 1.1,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.78,
        lineWidth: 1.25 * s,
      });
    } else if (style === 'clocktick_rune_pulse' || style === 'boss_astrolabe_gate') {
      const isBoss = style === 'boss_astrolabe_gate';
      const r = (isBoss ? 22 : 14) * s * (0.7 + easeOutCubic(t) * 0.4);
      drawClockfaceDial(ctx, gp.x, gp.y, r, r * 0.48, {
        rotation: -t * 1.4,
        handAngle1: -1.4 + t * 2.5,
        handAngle2: 0.4 - t * 1.2,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.8,
        lineWidth: (isBoss ? 1.8 : 1.3) * s,
      });
    } else if (
      style === 'sunwheel_cast_sigil' ||
      style === 'boss_prism_circle_cast' ||
      style === 'boss_gilded_charge' ||
      style === 'boss_crimson_rune_draw' ||
      style === 'boss_reactor_ignition' ||
      style === 'inverted_hex_sigil'
    ) {
      const r = (style.startsWith('boss_') ? 23 : 14) * s * (0.68 + easeOutCubic(t) * 0.42);
      drawSymmetricalSigilRing(ctx, gp.x, gp.y, r, r * 0.48, {
        count: style === 'inverted_hex_sigil' ? 3 : style === 'sunwheel_cast_sigil' ? 6 : 4,
        arcFill: 0.64,
        rotation: t * 1.25,
        lineWidth: (style.startsWith('boss_') ? 2.0 : 1.4) * s,
        color: pal.primary,
        coreColor: pal.core,
        alpha: env * 0.78,
        tickStyle: style.startsWith('boss_') ? 'compass' : 'radial',
        tickLength: 0.22,
        innerRingRatio: 0.62,
        innerAlpha: 0.55,
      });
    } else if (style === 'slipstream_kick' || style === 'rift_step_streak') {
      // Cavalry hoof-kick / stalker dash ground skid streaks
      const bx = gp.x - ux * 10 * s;
      const by = gp.y - uy * 5 * s;
      drawTaperedNeedle(ctx, bx - ux * 18 * s, by - uy * 9 * s, bx + ux * 6 * s, by + uy * 3 * s, {
        width: 3.0 * s,
        color: pal.primary,
        coreColor: pal.core,
        alpha: env * 0.68,
        peakRatio: 0.76,
      });
    } else if (style === 'kinetic_brace' || style === 'crimson_brace') {
      // Short grounded footing brace arc behind defender
      drawEllipticalHalo(ctx, gp.x - ux * 3 * s, gp.y, (10 + t * 5) * s, (4.8 + t * 2) * s, {
        lineWidth: 1.4 * s,
        color: pal.primary,
        coreColor: pal.core,
        alpha: env * 0.52,
        startAngle: angle - 1.1,
        endAngle: angle + 1.1,
      });
    }
    return;
  }

  // Sky layer: crisp weapon charge / release flash anchored to the redesigned unit emitter
  const emitterCastP = resolveUnitEmitterScreenPoint(
    bf,
    w,
    h,
    sourceUnit,
    fx.x,
    fx.y,
    fx.meta?.sourceFacing || (ux >= 0 ? 1 : -1),
    profile,
    elapsed,
  );
  const mx = emitterCastP ? emitterCastP.x : p.x + ux * 12 * s;
  const my = emitterCastP ? emitterCastP.y : p.y + uy * 7 * s;

  if (style === 'bowstring_rune_flash') {
    drawCrystalCastReleaseMotion(ctx, mx, my, angle, s, t, pal);
  } else if (style === 'railgun_muzzle_prism' || style === 'repeater_muzzle_chevron' || (style === 'hex_projector_flash' && fx.meta?.mode === 'attack')) {
    // Concentrated optical energy release at emitter (clean coherent laser bloom)
    const isPulse = style === 'repeater_muzzle_chevron';
    drawSoftBloom(ctx, mx, my, (isPulse ? 7.2 + t * 5.2 : 9.2 + t * 7.4) * s, '#ffffff', pal.primary, env * 0.86);
    drawStarFlare(ctx, mx, my, (isPulse ? 6.5 + t * 4.8 : 8.2 + t * 6.4) * s, 0.12, pal.secondary, '#ffffff', env * 0.98, angle, 4);
  } else if (style === 'hex_projector_flash' || style === 'void_lattice_flash' || style === 'frost_crystal_bloom') {
    drawGeodesicHexPlate(ctx, mx, my, 13 * s * (0.65 + easeOutCubic(t) * 0.45), 13 * s * (0.65 + easeOutCubic(t) * 0.45), {
      rotation: angle + t * 1.1,
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      fillAlpha: env * 0.24,
      strokeAlpha: env * 0.94,
      lineWidth: 1.9 * s,
    });
    drawMultifacetedCrystal(ctx, mx, my, 12.5 * s, 5.2 * s, angle, {
      primary: pal.primary,
      secondary: pal.secondary,
      core: pal.core,
      alpha: env * 0.9,
      refractionRays: 2,
      phase: t * 4,
      scale: s * 0.75,
    });
  } else if (style === 'mortar_blast_vent') {
    drawArtilleryBlastMotion(ctx, mx, my - 3 * s, s * 0.72, t, fx.seed || 19, pal, {
      isBoss: false,
      reducedMotion: isReducedMotionActive(),
    });
    drawKineticShockCone(ctx, mx, my - 4 * s, angle - 0.52, 14 * s * (0.65 + t * 0.6), {
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: env * 0.92,
      spread: 0.7,
      lineWidth: 2.4 * s,
    });
  } else if (style === 'emerald_blossom_cast' || style === 'amethyst_siphon_cast') {
    drawSoftBloom(ctx, mx, my, 14 * s, pal.core, pal.primary, env * 0.52);
    drawLotusCrest(ctx, mx, my, 13.5 * s * (0.65 + t * 0.52), 13.5 * s * (0.65 + t * 0.52), {
      petals: 6,
      rotation: t * 1.6,
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: env * 0.92,
    });
  } else if (style === 'forge_edge_glint' || style === 'crimson_edge_flare' || style === 'reactor_charge_flare') {
    // Crisp weapon-edge glint sweeping along blade draw line
    drawSoftBloom(ctx, mx, my - 2 * s, 12 * s, pal.core, pal.primary, env * 0.52);
    drawTaperedNeedle(ctx, mx - ux * 12 * s, my - 13 * s, mx + ux * 15 * s, my + 10 * s, {
      width: 4.0 * s,
      color: pal.primary,
      coreColor: pal.core,
      alpha: env * 0.95,
      peakRatio: 0.55,
    });
    drawStarFlare(ctx, mx, my - 3 * s, 13.5 * s * (1 - t * 0.28), 0.15, pal.secondary, pal.core, env * 0.96, angle + 0.4, 4);
  } else if (style === 'war_standard_flourish') {
    drawBeveledBladeArc(ctx, mx, my - 3 * s, 16.5 * s, 13.5 * s, -1.25, 0.85, {
      maxWidth: 4.4 * s,
      color: pal.secondary,
      secondaryColor: pal.primary,
      coreColor: pal.core,
      alpha: env * 0.92,
      rotation: angle,
      steps: 16,
    });
  } else if (style === 'sunwheel_cast_sigil') {
    drawSolarCastReleaseMotion(ctx, mx, my, angle, s, t, pal);
  } else if (style === 'clocktick_rune_pulse' || style === 'boss_astrolabe_gate') {
    drawChronoCastReleaseMotion(ctx, mx, my, angle, s * (style === 'boss_astrolabe_gate' ? 1.28 : 1.0), t, pal);
  } else if (style === 'kinetic_brace') {
    // Living Winged Shield forward kinetic barrier crest
    drawGeodesicHexPlate(ctx, mx, my, 12.5 * s, 15.5 * s, {
      rotation: angle,
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      fillAlpha: env * 0.28,
      strokeAlpha: env * 0.94,
      lineWidth: 2.0 * s,
    });
  } else {
    drawSoftBloom(ctx, mx, my, 13.5 * s, pal.core, pal.primary, env * 0.58);
    drawStarFlare(ctx, mx, my, 12.5 * s * (1 - t * 0.3), 0.16, pal.secondary, pal.core, env * 0.94, angle + t * 0.5, 4);
  }
}

// ----------------------------------------------------------------------------
// 2B. 15 BESPOKE MELEE CHOREOGRAPHIES (ua_melee)
// ONLY 3 seismic/molten heavies draw ground cracks; 12 melee units use zero cracks!
// ----------------------------------------------------------------------------
function _drawMeleeEffect(ctx, bf, w, h, fx, layer, t, profile, pal) {
  const style = fx.style || profile.meleeStyle || 'bulwark_shield_slam';
  const tp = bf.worldToScreen(fx.x, fx.y, w, h, 4.2);
  const tgp = bf.worldToScreen(fx.x, fx.y, w, h, 0);
  const sp =
    fx.x2 !== null && fx.y2 !== null
      ? bf.worldToScreen(fx.x2, fx.y2, w, h, 4.2)
      : { x: tp.x - Math.cos(fx.angle || 0) * 32, y: tp.y - Math.sin(fx.angle || 0) * 18 };

  const sdx = tp.x - sp.x;
  const sdy = tp.y - sp.y;
  const screenAngle = Math.hypot(sdx, sdy) > 1 ? Math.atan2(sdy, sdx) : fx.angle || 0;
  const ux = Math.cos(screenAngle);
  const uy = Math.sin(screenAngle);
  const nx = -uy;
  const ny = ux;

  const s = resolveAttackVfxScale(tp.scale, profile, fx.scale);
  const reducedMotion = isReducedMotionActive();
  const ease = easeOutQuart(t);
  const env = smoothWindow(t, 0.14, 0.34, 1.0);
  if (env <= 0.01) return;

  const midX = sp.x + sdx * 0.72;
  const midY = sp.y + sdy * 0.72;

  // ---------------- GROUND LAYER ----------------
  if (layer === 'ground') {
    // STRICTLY 3 justified seismic/molten heavies use radial ground cracks:
    if (
      style === 'juggernaut_magma_crush' ||
      style === 'elite_colossus_tectonic_crush' ||
      style === 'boss_hyperion_plasma_cataclysm'
    ) {
      const cleaveWorldR = Math.max(6.4, fx.radius || 7.2);
      const rx = cleaveWorldR * (tgp.scaleX ?? tgp.scale * 0.88) * (0.45 + ease * 0.62);
      const ry = cleaveWorldR * (tgp.scaleY ?? tgp.scale * 0.48) * (0.45 + ease * 0.62);
      drawSoftBloom(ctx, tgp.x, tgp.y, rx * 0.95, pal.secondary, pal.primary, env * 0.3, ry / Math.max(1, rx));
      drawRadialGroundCracks(ctx, tgp.x, tgp.y, rx * 1.18, ry * 1.18, {
        count: style === 'boss_hyperion_plasma_cataclysm' ? 8 : 6,
        seed: fx.seed || 7,
        color: pal.primary,
        coreColor: pal.core,
        alpha: env * 0.94,
        lineWidth: (style === 'boss_hyperion_plasma_cataclysm' ? 2.4 : 1.9) * s,
      });
      drawEllipticalHalo(ctx, tgp.x, tgp.y, rx, ry, {
        lineWidth: (style === 'boss_hyperion_plasma_cataclysm' ? 2.6 : 2.0) * s * (1 - t * 0.45),
        color: pal.primary,
        coreColor: pal.core,
        alpha: env * 0.82,
      });
      return;
    }

    // BOSS VEX — Regal 8-fold gilded citadel crest on floor (ZERO ground cracks!)
    if (style === 'boss_vex_citadel_hammer') {
      const cleaveWorldR = Math.max(6.8, fx.radius || 7.6);
      const rx = cleaveWorldR * (tgp.scaleX ?? tgp.scale * 0.88) * (0.48 + ease * 0.58);
      const ry = cleaveWorldR * (tgp.scaleY ?? tgp.scale * 0.48) * (0.48 + ease * 0.58);
      drawSoftBloom(ctx, tgp.x, tgp.y, rx * 0.9, pal.core, pal.primary, env * 0.26, ry / Math.max(1, rx));
      drawSymmetricalSigilRing(ctx, tgp.x, tgp.y, rx, ry, {
        count: 8,
        arcFill: 0.64,
        rotation: t * 0.7,
        lineWidth: 2.2 * s,
        color: pal.primary,
        coreColor: pal.core,
        alpha: env * 0.88,
        tickStyle: 'compass',
        tickLength: 0.22,
        innerRingRatio: 0.62,
        innerAlpha: 0.68,
      });
      return;
    }

    // BOSS MALAKOR — Sovereign crimson-obsidian dimensional rune ring (ZERO ground cracks!)
    if (style === 'boss_malakor_sovereign_cleave') {
      const cleaveWorldR = Math.max(7.2, fx.radius || 8.0);
      const rx = cleaveWorldR * (tgp.scaleX ?? tgp.scale * 0.88) * (0.46 + ease * 0.6);
      const ry = cleaveWorldR * (tgp.scaleY ?? tgp.scale * 0.48) * (0.46 + ease * 0.6);
      drawSoftBloom(ctx, tgp.x, tgp.y, rx * 0.9, pal.primary, pal.glow, env * 0.3, ry / Math.max(1, rx));
      drawSymmetricalSigilRing(ctx, tgp.x, tgp.y, rx, ry, {
        count: 4,
        arcFill: 0.72,
        rotation: screenAngle + t * 0.5,
        lineWidth: 2.2 * s * (1 - t * 0.35),
        color: pal.primary,
        coreColor: pal.core,
        alpha: env * 0.86,
        tickStyle: 'diamond',
      });
      return;
    }

    // ASTRAL AUTOMATON — Precision mechanical gear-ring pulse (ZERO ground cracks!)
    if (style === 'automaton_rail_cleave') {
      const rx = (18 + ease * 14) * s;
      const ry = rx * 0.48;
      drawSymmetricalSigilRing(ctx, tgp.x, tgp.y, rx, ry, {
        count: 6,
        arcFill: 0.56,
        rotation: t * 0.9,
        lineWidth: 1.8 * s,
        color: pal.primary,
        coreColor: pal.secondary,
        alpha: env * 0.82,
        tickStyle: 'radial',
        tickLength: 0.24,
        innerRingRatio: 0.64,
        innerAlpha: 0.55,
      });
      return;
    }

    // SHIELD DEFENDERS — Directional ground slide dust arc (ZERO ground cracks!)
    if (
      style === 'bulwark_shield_slam' ||
      style === 'void_spiked_ram' ||
      style === 'elite_fortified_bulwark_slam'
    ) {
      const r = (12 + ease * 13) * s;
      drawEllipticalHalo(ctx, tgp.x, tgp.y, r, r * 0.46, {
        lineWidth: (style === 'elite_fortified_bulwark_slam' ? 2.2 : 1.55) * s * (1 - t * 0.45),
        color: pal.primary,
        coreColor: pal.secondary,
        alpha: env * 0.68,
        startAngle: screenAngle - 1.25,
        endAngle: screenAngle + 1.25,
      });
      return;
    }

    // CAVALRY & RIFT STALKER — Crisp directional floor slipstream streak
    if (style === 'gale_lance_thrust' || style === 'rift_claw_xrend' || style === 'elite_storm_lightning_lance') {
      const sgp =
        fx.x2 !== null && fx.y2 !== null
          ? bf.worldToScreen(fx.x2, fx.y2, w, h, 0)
          : { x: tgp.x - ux * 28 * s, y: tgp.y - uy * 14 * s };
      drawTaperedNeedle(ctx, sgp.x, sgp.y, tgp.x + ux * 15 * s, tgp.y + uy * 7.5 * s, {
        width: 3.8 * s * (1 - t * 0.4),
        color: pal.primary,
        coreColor: pal.core,
        alpha: env * 0.55,
        peakRatio: 0.72,
      });
      return;
    }

    // HALBERD / RAVAGER / EXECUTIONER — Focused floor slash reflection glow (NO ground cracks)
    drawSoftBloom(ctx, tgp.x, tgp.y, (13 + ease * 8) * s, pal.secondary, pal.primary, env * 0.24, 0.48);
    return;
  }

  // ---------------- SKY LAYER (15 Distinct Melee Choreographies) ----------------
  switch (style) {
    // 1. HEAVY DEFENDER — Cascading Hard-Light Shield Wave + Ballistic Chips
    case 'bulwark_shield_slam': {
      drawShieldWaveMotion(ctx, tp.x, tp.y, screenAngle, s, t, fx.seed || 13, pal, {
        plateCount: 1,
        isBoss: false,
        reducedMotion,
      });
      break;
    }

    // 2. VOID VANGUARD — Unzipping Void-Rift Tear + Serrated Sparks
    case 'void_spiked_ram': {
      drawVoidRiftTearMotion(ctx, tp.x, tp.y, screenAngle, s, t, fx.seed || 17, pal, {
        dualBeat: false,
        reducedMotion,
      });
      break;
    }

    // 3. ELITE IRON BULWARK — 3-Plate Cascading Hard-Light Bastion Wave
    case 'elite_fortified_bulwark_slam': {
      drawShieldWaveMotion(ctx, tp.x, tp.y, screenAngle, s * 1.06, t, fx.seed || 23, pal, {
        plateCount: 3,
        isBoss: false,
        reducedMotion,
      });
      break;
    }

    // 4. SWIFT CAVALRY — Aerodynamic Gale Lance + Shedding Laminar Vortex Eddies
    case 'gale_lance_thrust': {
      drawWindLanceMotion(ctx, sp, tp, screenAngle, s, t, fx.seed || 29, pal, reducedMotion);
      break;
    }

    // 5. ELITE STORM LANCER — Branching Biological Stepped Lightning Lance
    case 'elite_storm_lightning_lance': {
      drawStormLanceMotion(ctx, sp, tp, screenAngle, s, t, fx.seed || 31, pal, reducedMotion);
      break;
    }

    // 6. RIFT STALKER — Twin Whipping Lunar Flow Waves + Unzipping Rift Follow-up
    case 'rift_claw_xrend': {
      drawLunarFlowWaveMotion(ctx, tp.x - ux * (4 - ease * 10) * s, tp.y - uy * (4 - ease * 6) * s, screenAngle - 0.3, s, t, fx.seed || 37, pal, {
        radiusScale: 0.96,
        isBoss: false,
        reducedMotion,
      });
      const b2 = clamp01((t - 0.16) / 0.84);
      if (b2 > 0.01) {
        drawVoidRiftTearMotion(ctx, tp.x + ux * 4 * s, tp.y, screenAngle + 0.56, s * 0.88, b2, (fx.seed || 37) + 11, pal, {
          dualBeat: false,
          reducedMotion,
        });
      }
      break;
    }

    // 7. VANGUARD BREAKER — Vertical Forged Halberd Cleave + Molten Blast & Armor Shards
    case 'halberd_sunder_chop': {
      const arcR = (18 + ease * 7) * s;
      drawBeveledBladeArc(ctx, midX, midY - 5 * s, arcR * 0.92, arcR * 1.2, -1.68, 0.6, {
        maxWidth: 7.4 * s * (1 - t * 0.38),
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.95,
        rotation: screenAngle * 0.28,
        steps: 20,
        detail: 'rune_ticks',
        detailCount: 5,
      });
      drawArtilleryBlastMotion(ctx, tp.x, tp.y + 3 * s, s * 0.72, t, fx.seed || 41, pal, {
        isBoss: false,
        reducedMotion,
      });
      break;
    }

    // 8. ABYSSAL RAVAGER — Dual-Beat Crossed Unzipping Void-Rift Sawfangs
    case 'abyssal_twin_sawfang': {
      drawVoidRiftTearMotion(ctx, tp.x, tp.y, screenAngle, s * 1.06, t, fx.seed || 43, pal, {
        dualBeat: true,
        reducedMotion,
      });
      break;
    }

    // 9. ELITE ABYSSAL EXECUTIONER — Flowing Crimson Crescent + Dual Cross Void-Rift Execution
    case 'elite_executioner_triple_rend': {
      drawLunarFlowWaveMotion(ctx, tp.x, tp.y, screenAngle, s * 1.08, t, fx.seed || 47, pal, {
        radiusScale: 1.05,
        isBoss: false,
        reducedMotion,
      });
      const gT = clamp01((t - 0.14) / 0.86);
      if (gT > 0.01) {
        drawVoidRiftTearMotion(ctx, tp.x, tp.y, screenAngle + Math.PI * 0.5, s * 1.08, gT, (fx.seed || 47) + 19, pal, {
          dualBeat: true,
          reducedMotion,
        });
      }
      break;
    }

    // 10. ASTRAL AUTOMATON — Counter-Precessing 3D Gyro Orbital Rail Cleave
    case 'automaton_rail_cleave': {
      drawGyroOrbitalMotion(ctx, tp.x, tp.y, screenAngle, s * 1.08, t, pal, {
        isSkill: false,
        reducedMotion,
      });
      drawBeveledBladeArc(ctx, midX, midY, (19 + ease * 9) * s, (14 + ease * 6) * s, -1.28, 1.28, {
        maxWidth: 6.4 * s * (1 - t * 0.4),
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.92,
        rotation: screenAngle,
        steps: 20,
        detail: 'circuit',
        detailCount: 6,
      });
      break;
    }

    // 11 & 12. SIEGE JUGGERNAUT & COLOSSUS — Molten Piston Smash + Rising Ash & Ballistic Shrapnel
    case 'juggernaut_magma_crush':
    case 'elite_colossus_tectonic_crush': {
      const isColossus = style === 'elite_colossus_tectonic_crush';
      const smashR = (17 + ease * 8) * s;
      drawBeveledBladeArc(ctx, tp.x - ux * 4 * s, tp.y - 2 * s, smashR * 0.94, smashR * 0.85, -1.68, 0.45, {
        maxWidth: (isColossus ? 8.8 : 7.2) * s * (1 - t * 0.38),
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.94,
        rotation: screenAngle * 0.2,
        steps: 20,
        detail: 'rune_ticks',
        detailCount: isColossus ? 6 : 4,
      });
      drawArtilleryBlastMotion(ctx, tp.x, tp.y + 4 * s, s * (isColossus ? 1.05 : 0.88), t, fx.seed || 59, pal, {
        isBoss: isColossus,
        reducedMotion,
      });
      break;
    }

    // 13. BOSS BASTION WARDEN VEX — 5-Plate Regal Cascading Gilded Bastion Wave
    case 'boss_vex_citadel_hammer': {
      const r = (20 + ease * 9) * s;
      drawBeveledBladeArc(ctx, midX, midY - 2 * s, r * 0.92, r * 0.85, -1.7, 0.52, {
        maxWidth: 8.6 * s * (1 - t * 0.38),
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.94,
        rotation: screenAngle * 0.22,
        steps: 22,
        detail: 'circuit',
        detailCount: 7,
      });
      drawShieldWaveMotion(ctx, tp.x, tp.y, screenAngle, s, t, fx.seed || 67, pal, {
        plateCount: 5,
        isBoss: true,
        reducedMotion,
      });
      break;
    }

    // 14. BOSS OBSIDIAN SOVEREIGN MALAKOR — Flowing Blood-Eclipse Crescent + Dual Void-Rift Tears
    case 'boss_malakor_sovereign_cleave': {
      drawLunarFlowWaveMotion(ctx, midX + ux * ease * 8 * s, midY + uy * ease * 5 * s, screenAngle, s, t, fx.seed || 73, pal, {
        radiusScale: 1.15,
        isBoss: true,
        reducedMotion,
      });
      const slitT = clamp01((t - 0.18) / 0.82);
      if (slitT > 0.01) {
        drawVoidRiftTearMotion(ctx, tp.x, tp.y, screenAngle, s * 1.18, slitT, (fx.seed || 73) + 29, pal, {
          dualBeat: true,
          reducedMotion,
        });
      }
      break;
    }

    // 15. BOSS ASTRAL DREADNOUGHT HYPERION — Plasma Cleave + Boiling Solar Plasma Eruption
    case 'boss_hyperion_plasma_cataclysm': {
      const r = (24 + ease * 11) * s;
      drawBeveledBladeArc(ctx, midX, midY, r, r * 0.72, -1.4, 1.4, {
        maxWidth: 9.8 * s * (1 - t * 0.38),
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.95,
        rotation: screenAngle,
        steps: 22,
        detail: 'circuit',
        detailCount: 7,
      });
      drawSolarImpactMotion(ctx, tp.x, tp.y, s * 1.12, t, fx.seed || 79, pal, {
        isSkill: false,
        layer: 'sky',
        reducedMotion,
      });
      drawArtilleryBlastMotion(ctx, tp.x, tp.y + 4 * s, s * 0.95, t, (fx.seed || 79) + 17, pal, {
        isBoss: true,
        reducedMotion,
      });
      break;
    }

    default: {
      drawBeveledBladeArc(ctx, midX, midY, (15 + ease * 7) * s, (12 + ease * 5) * s, -1.0, 1.0, {
        maxWidth: 6.0 * s * (1 - t * 0.4),
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.9,
        rotation: screenAngle,
      });
      break;
    }
  }
}

// ----------------------------------------------------------------------------
// 2C. BESPOKE RANGED / MAGIC / SUPPORT IMPACT EFFECTS (ua_impact)
// ----------------------------------------------------------------------------
function _drawImpactEffect(ctx, bf, w, h, fx, layer, t, profile, pal, unitByUid = null, elapsed = 0) {
  const style = fx.style || profile.impactStyle || 'sapphire_pierce_star';
  const isLaserImpact =
    style === 'railgun_exit_cone' ||
    style === 'hardlight_hex_shatter' ||
    style === 'kinetic_ricochet_ping';

  const sourceUnit = fx.meta?.sourceUid && unitByUid ? unitByUid.get(fx.meta.sourceUid) : null;
  const targetUnit = fx.meta?.targetUid && unitByUid ? unitByUid.get(fx.meta.targetUid) : null;

  const baseP = bf.worldToScreen(fx.x, fx.y, w, h, 4.0);
  const liveTarget = resolveLiveTargetScreenPoint(bf, w, h, targetUnit, fx.x, fx.y);
  const p = { x: liveTarget.x, y: liveTarget.y, scale: baseP.scale };
  const gp = {
    x: liveTarget.groundX,
    y: liveTarget.groundY,
    scale: baseP.scale,
    scaleX: baseP.scaleX,
    scaleY: baseP.scaleY,
  };

  const s = resolveAttackVfxScale(baseP.scale, profile, fx.scale);
  const ease = easeOutQuart(t);
  const env = smoothWindow(t, 0.14, 0.32, 1.0);
  if (env <= 0.01) return;

  const angle = fx.angle || 0;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const reducedMotion = Boolean(fx.reducedMotion) || isReducedMotionActive();

  let emitterP = null;
  let bAngle = angle;
  let bux = ux;
  let buy = uy;
  if (isLaserImpact) {
    if (typeof fx.meta?.startX === 'number' && typeof fx.meta?.startY === 'number') {
      emitterP = resolveUnitEmitterScreenPoint(
        bf,
        w,
        h,
        sourceUnit,
        fx.meta.startX,
        fx.meta.startY,
        fx.meta.sourceFacing || (ux >= 0 ? 1 : -1),
        profile,
        elapsed,
      );
    } else {
      emitterP = { x: p.x - ux * 74 * s, y: p.y - uy * 74 * s };
    }
    const bdx = p.x - emitterP.x;
    const bdy = p.y - emitterP.y;
    const bDist = Math.max(8, Math.hypot(bdx, bdy));
    bux = bdx / bDist;
    buy = bdy / bDist;
    bAngle = Math.atan2(bdy, bdx);
  }

  // ---------------- GROUND LAYER ----------------
  if (layer === 'ground') {
    if (style === 'solar_corona_eruption') {
      const worldR = Math.max(4.5, fx.radius || 5.8);
      const aoeRx = worldR * (gp.scaleX ?? gp.scale * 0.88);
      const aoeRy = worldR * (gp.scaleY ?? gp.scale * 0.48);
      drawSolarImpactMotion(ctx, gp.x, gp.y, s, t, fx.seed || 43, pal, {
        isSkill: false,
        aoeRx,
        aoeRy,
        layer: 'ground',
        reducedMotion,
      });
      return;
    }

    if (style === 'mortar_shrapnel_crater') {
      // Distinct dark artillery blast crater rim + fiery shockwave ring (NOT generic melee cracks)
      const worldR = Math.max(5.5, fx.radius || 7.2);
      const rx = worldR * (gp.scaleX ?? gp.scale * 0.88) * (0.48 + ease * 0.58);
      const ry = worldR * (gp.scaleY ?? gp.scale * 0.48) * (0.48 + ease * 0.58);
      ctx.save();
      ctx.fillStyle = `rgba(18, 9, 6, ${(env * 0.42).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(gp.x, gp.y, rx * 0.72, ry * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      drawSoftBloom(ctx, gp.x, gp.y, rx * 1.0, pal.secondary, pal.primary, env * 0.34, ry / Math.max(1, rx));
      drawEllipticalHalo(ctx, gp.x, gp.y, rx, ry, {
        lineWidth: 2.6 * s * (1 - t * 0.45),
        color: pal.primary,
        coreColor: pal.core,
        alpha: env * 0.88,
      });
      drawEllipticalHalo(ctx, gp.x, gp.y, rx * 0.64, ry * 0.64, {
        lineWidth: 1.5 * s,
        color: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.7,
      });
      return;
    }

    if (style === 'radiant_cross_seal') {
      const rx = (15 + ease * 10) * s;
      drawCathedralRosette(ctx, gp.x, gp.y, rx, rx * 0.48, {
        rotation: t * 0.8,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.86,
        lineWidth: 1.5 * s,
      });
      return;
    }

    if (style === 'lotus_mend_bloom') {
      const rx = (13 + ease * 14) * s;
      drawLotusCrest(ctx, gp.x, gp.y, rx, rx * 0.48, {
        petals: 6,
        rotation: t * 0.9,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.86,
      });
      return;
    }

    if (style === 'corrupted_mend_ring' || style === 'aegis_dome_lock' || style === 'cryo_barrier_lock') {
      const rx = (12 + ease * 12) * s;
      drawGeodesicHexPlate(ctx, gp.x, gp.y, rx, rx * 0.48, {
        rotation: t * 0.65,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        fillAlpha: env * 0.16,
        strokeAlpha: env * 0.86,
        lineWidth: 1.55 * s,
      });
      return;
    }

    if (style === 'temporal_dial_snare' || style === 'boss_chronometer_collapse') {
      const isBoss = style === 'boss_chronometer_collapse';
      const worldR = isBoss ? Math.max(5.5, fx.radius || 5.5) : 3.2;
      const aoeRx = isBoss ? worldR * (gp.scaleX ?? gp.scale * 0.88) : 16 * s;
      const aoeRy = isBoss ? worldR * (gp.scaleY ?? gp.scale * 0.48) : 8 * s;
      drawChronoImpactMotion(ctx, gp.x, gp.y, s * (isBoss ? 1.2 : 1.0), t, fx.seed || 61, pal, {
        isSkill: isBoss,
        aoeRx,
        aoeRy,
        layer: 'ground',
        reducedMotion,
      });
      return;
    }

    if (style === 'cryo_snowflake_shatter' || style === 'stasis_crystal_cage') {
      const rx = (12 + ease * 10) * s;
      drawGeodesicHexPlate(ctx, gp.x, gp.y, rx, rx * 0.48, {
        rotation: 0.2,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        fillAlpha: env * 0.18,
        strokeAlpha: env * 0.84,
        lineWidth: 1.5 * s,
      });
      return;
    }

    if (style === 'boss_prism_star_nova') {
      const worldR = Math.max(4.5, fx.radius || 4.8);
      const rx = worldR * (gp.scaleX ?? gp.scale * 0.88) * (0.45 + ease * 0.65);
      const ry = worldR * (gp.scaleY ?? gp.scale * 0.48) * (0.45 + ease * 0.65);
      drawSymmetricalSigilRing(ctx, gp.x, gp.y, rx, ry, {
        count: 6,
        arcFill: 0.58,
        rotation: t * 1.3,
        lineWidth: 2.0 * s,
        color: pal.primary,
        coreColor: pal.core,
        alpha: env * 0.88,
        tickStyle: 'diamond',
      });
      return;
    }

    if (style === 'railgun_exit_cone' || style === 'hardlight_hex_shatter' || style === 'kinetic_ricochet_ping') {
      // Surface illumination beneath laser impact
      drawSoftBloom(ctx, gp.x, gp.y, (style === 'kinetic_ricochet_ping' ? 14 + ease * 8 : 18 + ease * 10) * s, pal.secondary, pal.primary, env * 0.38, 0.48);
      return;
    }

    drawSoftBloom(ctx, gp.x, gp.y, 12 * s, pal.primary, pal.glow, env * 0.24, 0.48);
    return;
  }

  // ---------------- SKY LAYER ----------------
  switch (style) {
    case 'sapphire_pierce_star': {
      drawCrystalImpactMotion(ctx, p.x, p.y, angle, s, t, fx.seed || 109, pal, {
        isSkill: false,
        reducedMotion,
      });
      break;
    }

    case 'kinetic_ricochet_ping': {
      // Phase 3b (Full Beam peak hold) -> Phase 4 (Focused cyan-white impact flash + directional sparks) -> Phase 5 (Rapid pinch-fade)
      const beamSpec = profile.beamSpec || { coreWidth: 1.45, sheathWidth: 3.8, haloWidth: 13.0 };
      const holdPeak = t < 0.14;
      const dissipateT = clamp01((t - 0.12) / 0.88);
      const beamAlpha = holdPeak ? 0.97 : Math.max(0, 1 - Math.pow(dissipateT, 1.15));
      const uStart = holdPeak ? 0 : easeOutCubic(dissipateT) * 0.48;
      const wScale = holdPeak ? 1.08 : Math.max(0.08, 1.02 - dissipateT * 0.92);

      if (emitterP && beamAlpha > 0.025 && uStart < 0.96) {
        drawProgressiveLaserBeam(ctx, emitterP, p, {
          uStart,
          uEnd: 1,
          coreWidth: (beamSpec.coreWidth || 1.45) * s * wScale,
          sheathWidth: (beamSpec.sheathWidth || 3.8) * s * wScale,
          haloWidth: (beamSpec.haloWidth || 13.0) * s * Math.max(0.25, wScale),
          color: pal.primary,
          secondaryColor: pal.secondary,
          coreColor: '#ffffff',
          glowColor: pal.glow,
          alpha: beamAlpha,
          flowPhase: elapsed * 6.5 + t * 1.4,
          leadingFlare: holdPeak ? 0.5 : 0,
          muzzleFlare: holdPeak ? 0.4 : 0,
          breakup: dissipateT * 0.85,
          seed: fx.seed || 31,
          scale: s,
          reducedMotion,
        });
      }

      const impactEnv = smoothWindow(t, 0.04, 0.22, 0.85);
      if (impactEnv > 0.02) {
        drawSoftBloom(ctx, p.x, p.y, (11 + (1 - t) * 5) * s, '#ffffff', pal.primary, impactEnv * 0.72);
        const shockR = (3.8 + ease * 12) * s;
        drawEllipticalHalo(ctx, p.x, p.y, shockR, shockR * 0.82, {
          lineWidth: 1.4 * s * (1 - t * 0.6),
          color: pal.secondary,
          coreColor: '#ffffff',
          alpha: impactEnv * 0.72,
          rotation: bAngle,
        });
        const rng = createDetRng((fx.seed || 31) + 7);
        const sparkCount = reducedMotion ? 2 : 5;
        for (let k = 0; k < sparkCount; k += 1) {
          const sa = bAngle + Math.PI + (rng() - 0.5) * 1.6;
          const r0 = (1.5 + ease * 4) * s;
          const len = (7 + ease * 13 + rng() * 5) * s;
          drawTaperedNeedle(
            ctx,
            p.x + Math.cos(sa) * r0,
            p.y + Math.sin(sa) * r0,
            p.x + Math.cos(sa) * (r0 + len),
            p.y + Math.sin(sa) * (r0 + len),
            {
              width: 1.6 * s * (1 - t * 0.5),
              color: pal.primary,
              coreColor: '#ffffff',
              alpha: impactEnv * 0.92,
              peakRatio: 0.22,
            },
          );
        }
        drawStarFlare(ctx, p.x, p.y, (10.5 - t * 3.5) * s, 0.11, pal.secondary, '#ffffff', impactEnv * 0.96, bAngle, 4);
      }
      break;
    }

    case 'railgun_exit_cone': {
      // Phase 3b (Full peak beam) -> Phase 4 (Focused high-intensity impact flash + directional sparks + shock ring) -> Phase 5 (Rapid pinch-fade)
      const beamSpec = profile.beamSpec || { coreWidth: 1.85, sheathWidth: 5.0, haloWidth: 20.0 };
      const holdPeak = t < 0.16;
      const dissipateT = clamp01((t - 0.14) / 0.86);
      const beamAlpha = holdPeak ? 0.98 : Math.max(0, 1 - Math.pow(dissipateT, 1.15));
      const uStart = holdPeak ? 0 : easeOutCubic(dissipateT) * 0.42;
      const wScale = holdPeak ? 1.1 : Math.max(0.08, 1.05 - dissipateT * 0.95);

      if (emitterP && beamAlpha > 0.025 && uStart < 0.96) {
        drawProgressiveLaserBeam(ctx, emitterP, p, {
          uStart,
          uEnd: 1,
          coreWidth: (beamSpec.coreWidth || 1.85) * s * wScale,
          sheathWidth: (beamSpec.sheathWidth || 5.0) * s * wScale,
          haloWidth: (beamSpec.haloWidth || 16.5) * s * Math.max(0.25, wScale),
          color: pal.primary,
          secondaryColor: pal.secondary,
          coreColor: '#ffffff',
          glowColor: pal.glow,
          alpha: beamAlpha,
          flowPhase: elapsed * 5.0 + t * 1.4,
          leadingFlare: holdPeak ? 0.55 : 0,
          muzzleFlare: holdPeak ? 0.45 : 0,
          breakup: dissipateT * 0.9,
          seed: fx.seed || 79,
          scale: s,
          reducedMotion,
        });
      }

      // Focused high-intensity impact flash, tight shock ring, and directional energy sparks at p
      const impactEnv = smoothWindow(t, 0.05, 0.24, 0.88);
      if (impactEnv > 0.02) {
        drawSoftBloom(ctx, p.x, p.y, (14 + (1 - t) * 7) * s, '#ffffff', pal.primary, impactEnv * 0.78);
        // Tight expanding shock ripple centered on target hit
        const shockR = (4.5 + ease * 15.5) * s;
        drawEllipticalHalo(ctx, p.x, p.y, shockR, shockR * 0.82, {
          lineWidth: 1.65 * s * (1 - t * 0.6),
          color: pal.secondary,
          coreColor: '#ffffff',
          alpha: impactEnv * 0.76,
          rotation: bAngle,
        });
        // Crisp directional sparks spraying from impact point
        const rng = createDetRng((fx.seed || 79) + 13);
        const sparkCount = reducedMotion ? 3 : 6;
        for (let k = 0; k < sparkCount; k += 1) {
          const isBackSpray = k < 4;
          const spread = (rng() - 0.5) * 1.45;
          const sa = (isBackSpray ? bAngle + Math.PI : bAngle) + spread;
          const r0 = (2 + ease * 5) * s;
          const len = (8 + ease * 16 + rng() * 6) * s;
          drawTaperedNeedle(
            ctx,
            p.x + Math.cos(sa) * r0,
            p.y + Math.sin(sa) * r0,
            p.x + Math.cos(sa) * (r0 + len),
            p.y + Math.sin(sa) * (r0 + len),
            {
              width: 1.9 * s * (1 - t * 0.5),
              color: pal.primary,
              coreColor: '#ffffff',
              alpha: impactEnv * 0.94,
              peakRatio: 0.22,
            },
          );
        }
        drawStarFlare(ctx, p.x, p.y, (13.5 - t * 4) * s, 0.11, pal.secondary, '#ffffff', impactEnv * 0.98, bAngle, 4);
      }
      break;
    }

    case 'sniper_cross_detonation': {
      // Precision rotating sniper reticle snapping shut + long razor cross detonation!
      const crossR = (16 + ease * 14) * s;
      drawSoftBloom(ctx, p.x, p.y, crossR * 0.9, pal.core, pal.primary, env * 0.56);
      drawPrecisionReticle(ctx, p.x, p.y, (15 - ease * 5) * s, {
        rotation: angle + t * 1.4,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.92,
      });
      for (const a of [0, Math.PI * 0.5]) {
        drawTaperedNeedle(
          ctx,
          p.x - Math.cos(a) * crossR,
          p.y - Math.sin(a) * crossR,
          p.x + Math.cos(a) * crossR,
          p.y + Math.sin(a) * crossR,
          {
            width: 3.6 * s * (1 - t * 0.45),
            color: a === 0 ? pal.primary : pal.secondary,
            coreColor: pal.core,
            alpha: env * 0.96,
            peakRatio: 0.5,
          },
        );
      }
      drawStarFlare(ctx, p.x, p.y, 14 * s * (1 - t * 0.3), 0.15, pal.secondary, pal.core, env * 0.98, 0.78, 4);
      break;
    }

    case 'radiant_cross_seal': {
      // Vertical-horizontal radiant cathedral cross flash + inner sacred ring
      drawSoftBloom(ctx, p.x, p.y, 16 * s, pal.core, pal.secondary, env * 0.54);
      drawTaperedNeedle(ctx, p.x, p.y - (22 + ease * 8) * s, p.x, p.y + (16 + ease * 5) * s, {
        width: 4.2 * s * (1 - t * 0.4),
        color: pal.primary,
        coreColor: pal.core,
        alpha: env * 0.95,
        peakRatio: 0.56,
      });
      drawTaperedNeedle(ctx, p.x - (14 + ease * 6) * s, p.y - 3 * s, p.x + (14 + ease * 6) * s, p.y - 3 * s, {
        width: 3.2 * s * (1 - t * 0.4),
        color: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.92,
        peakRatio: 0.5,
      });
      drawStarFlare(ctx, p.x, p.y - 3 * s, (13 + ease * 4) * s, 0.14, pal.secondary, pal.core, env * 0.96, 0, 4);
      break;
    }

    case 'hex_triangle_brand': {
      // Dual counter-rotating inverted hexagram curse brand
      const r = (11 + ease * 6) * s;
      ctx.save();
      ctx.translate(p.x, p.y);
      for (let tri = 0; tri < 2; tri += 1) {
        ctx.save();
        ctx.rotate(Math.PI * 0.5 + tri * Math.PI + t * (tri === 0 ? 0.5 : -0.5));
        ctx.strokeStyle = withAlpha(tri === 0 ? pal.primary : pal.secondary, env * 0.92);
        ctx.lineWidth = 1.9 * s;
        ctx.beginPath();
        for (let i = 0; i < 3; i += 1) {
          const a = (i * Math.PI * 2) / 3;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.strokeStyle = withAlpha(pal.core, env * 0.8);
        ctx.lineWidth = 0.8 * s;
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
      drawStarFlare(ctx, p.x, p.y, 9.5 * s * (1 - t * 0.35), 0.18, pal.secondary, pal.core, env * 0.9, 0.5, 4);
      break;
    }

    case 'solar_corona_eruption': {
      drawSolarImpactMotion(ctx, p.x, p.y, s, t, fx.seed || 43, pal, {
        isSkill: false,
        layer: 'sky',
        reducedMotion,
      });
      break;
    }

    case 'mortar_shrapnel_crater': {
      // Rising dark-ash puffs under-lit with fire + boiling blast dome + gravity-bouncing shrapnel
      drawArtilleryBlastMotion(ctx, p.x, p.y, s, t, fx.seed || 73, pal, {
        isBoss: false,
        reducedMotion,
      });
      break;
    }

    case 'hardlight_hex_shatter': {
      // Phase 3b (Full peak azure-white laser) -> Phase 4 (Focused sapphire-white impact flash + tight shock + sparks) -> Phase 5 (Pinch-fade)
      const beamSpec = profile.beamSpec || { coreWidth: 2.0, sheathWidth: 5.6, haloWidth: 20.0 };
      const holdPeak = t < 0.18;
      const dissipateT = clamp01((t - 0.16) / 0.84);
      const beamAlpha = holdPeak ? 0.98 : Math.max(0, 1 - Math.pow(dissipateT, 1.15));
      const uStart = holdPeak ? 0 : easeOutCubic(dissipateT) * 0.42;
      const wScale = holdPeak ? 1.12 : Math.max(0.08, 1.06 - dissipateT * 0.96);

      if (emitterP && beamAlpha > 0.025 && uStart < 0.96) {
        drawProgressiveLaserBeam(ctx, emitterP, p, {
          uStart,
          uEnd: 1,
          coreWidth: (beamSpec.coreWidth || 2.0) * s * wScale,
          sheathWidth: (beamSpec.sheathWidth || 5.6) * s * wScale,
          haloWidth: (beamSpec.haloWidth || 20.0) * s * Math.max(0.25, wScale),
          color: pal.primary,
          secondaryColor: pal.secondary,
          coreColor: '#ffffff',
          glowColor: pal.glow,
          alpha: beamAlpha,
          flowPhase: elapsed * 4.4 + t * 1.3,
          leadingFlare: holdPeak ? 0.6 : 0,
          muzzleFlare: holdPeak ? 0.48 : 0,
          breakup: dissipateT * 0.9,
          seed: fx.seed || 51,
          scale: s,
          reducedMotion,
        });
      }

      const impactEnv = smoothWindow(t, 0.05, 0.25, 0.88);
      if (impactEnv > 0.02) {
        drawSoftBloom(ctx, p.x, p.y, (15 + (1 - t) * 7) * s, '#ffffff', pal.primary, impactEnv * 0.78);
        const shockR = (5 + ease * 16) * s;
        drawEllipticalHalo(ctx, p.x, p.y, shockR, shockR * 0.84, {
          lineWidth: 1.75 * s * (1 - t * 0.6),
          color: pal.secondary,
          coreColor: '#ffffff',
          alpha: impactEnv * 0.78,
          rotation: bAngle,
        });
        const rng = createDetRng((fx.seed || 51) + 19);
        const sparkCount = reducedMotion ? 3 : 6;
        for (let k = 0; k < sparkCount; k += 1) {
          const isBackSpray = k < 4;
          const spread = (rng() - 0.5) * 1.5;
          const sa = (isBackSpray ? bAngle + Math.PI : bAngle) + spread;
          const r0 = (2 + ease * 5) * s;
          const len = (8 + ease * 16 + rng() * 6) * s;
          drawTaperedNeedle(
            ctx,
            p.x + Math.cos(sa) * r0,
            p.y + Math.sin(sa) * r0,
            p.x + Math.cos(sa) * (r0 + len),
            p.y + Math.sin(sa) * (r0 + len),
            {
              width: 1.95 * s * (1 - t * 0.5),
              color: pal.primary,
              coreColor: '#ffffff',
              alpha: impactEnv * 0.94,
              peakRatio: 0.22,
            },
          );
        }
        drawStarFlare(ctx, p.x, p.y, (14 - t * 4) * s, 0.11, pal.secondary, '#ffffff', impactEnv * 0.98, bAngle, 4);
      }
      break;
    }

    case 'aegis_dome_lock':
    case 'cryo_barrier_lock': {
      const r = (12.5 + ease * 10) * s;
      drawGeodesicHexPlate(ctx, p.x, p.y, r, r, {
        rotation: t * 0.65,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        fillAlpha: env * 0.22,
        strokeAlpha: env * 0.94,
        lineWidth: 2.0 * s * (1 - t * 0.35),
      });
      drawStarFlare(ctx, p.x, p.y, 10.5 * s * (1 - t * 0.35), 0.18, pal.secondary, pal.core, env * 0.88, 0, 4);
      break;
    }

    case 'temporal_dial_snare':
    case 'boss_chronometer_collapse': {
      const isBoss = style === 'boss_chronometer_collapse';
      drawChronoImpactMotion(ctx, p.x, p.y, s * (isBoss ? 1.25 : 1.0), t, fx.seed || 61, pal, {
        isSkill: isBoss,
        layer: 'sky',
        reducedMotion,
      });
      break;
    }

    case 'stasis_crystal_cage': {
      drawCrystalCageImpactMotion(ctx, p.x, p.y, s, t, fx.seed || 89, pal, {
        shardCount: 6,
        isSkill: false,
        isCage: true,
        reducedMotion,
      });
      break;
    }

    case 'cryo_snowflake_shatter': {
      drawCrystalCageImpactMotion(ctx, p.x, p.y, s, t, fx.seed || 97, pal, {
        shardCount: 6,
        isSkill: false,
        isCage: false,
        reducedMotion,
      });
      break;
    }

    case 'banner_slash_flash': {
      drawLunarFlowWaveMotion(ctx, p.x, p.y, angle, s, t, fx.seed || 101, pal, {
        radiusScale: 1.0,
        isBoss: false,
        reducedMotion,
      });
      break;
    }

    case 'boss_prism_star_nova': {
      drawCrystalCageImpactMotion(ctx, p.x, p.y, s, t, fx.seed || 107, pal, {
        shardCount: 8,
        isSkill: true,
        isCage: false,
        reducedMotion,
      });
      break;
    }

    case 'lotus_mend_bloom':
    case 'corrupted_mend_ring': {
      drawSoftBloom(ctx, p.x, p.y - ease * 8 * s, 12.5 * s, pal.core, pal.primary, env * 0.46);
      drawStarFlare(ctx, p.x, p.y - ease * 10 * s, 9.5 * s * (1 - t * 0.35), 0.2, pal.secondary, pal.core, env * 0.9, t * 0.8, 4);
      break;
    }

    default: {
      drawSoftBloom(ctx, p.x, p.y, 12 * s, pal.core, pal.primary, env * 0.5);
      drawStarFlare(ctx, p.x, p.y, 10 * s * (1 - t * 0.35), 0.18, pal.secondary, pal.core, env * 0.9, angle, 4);
      break;
    }
  }
}

// ----------------------------------------------------------------------------
// 2D. DIRECTIONAL HIT REACTION MICRO-EFFECT (ua_hit)
// ----------------------------------------------------------------------------
function _drawHitEffect(ctx, bf, w, h, fx, layer, t, profile, pal) {
  if (layer !== 'sky') return;
  const p = bf.worldToScreen(fx.x, fx.y, w, h, 3.8);
  const s = resolveAttackVfxScale(p.scale, profile, fx.scale) * 0.86;
  const env = smoothWindow(t, 0.12, 0.28, 1.0);
  if (env <= 0.01) return;

  const angle = fx.angle || 0;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const isCrit = Boolean(fx.isCrit);
  const isShielded = Boolean(fx.meta?.absorbed > 0);

  if (isShielded) {
    drawGeodesicHexPlate(ctx, p.x - ux * 5 * s, p.y - uy * 5 * s, (13 + t * 10) * s, (13 + t * 10) * s, {
      rotation: angle,
      color: '#38bdf8',
      secondaryColor: '#bae6fd',
      coreColor: '#f0f9ff',
      fillAlpha: env * 0.18,
      strokeAlpha: env * 0.94,
      lineWidth: 2.1 * s,
    });
    return;
  }

  if (isCrit) {
    drawSoftBloom(ctx, p.x, p.y, 20 * s, '#fffbeb', '#fbbf24', env * 0.64);
    drawRuneShockwaveRing(ctx, p.x, p.y, (10 + t * 12) * s, (8 + t * 10) * s, {
      primary: '#fbbf24',
      secondary: '#fde68a',
      core: '#ffffff',
      alpha: env * 0.72,
      lineWidth: 1.8 * s,
      notches: 4,
      rotation: angle,
    });
    drawStarFlare(ctx, p.x, p.y, (18 + t * 6.5) * s, 0.15, '#fbbf24', '#ffffff', env * 0.98, angle + 0.3, 4);
  } else {
    drawSoftBloom(ctx, p.x, p.y, 10 * s, pal.core, pal.primary, env * 0.36);
    drawTaperedNeedle(
      ctx,
      p.x - ux * 7 * s,
      p.y - uy * 7 * s,
      p.x + ux * (11.5 + t * 9) * s,
      p.y + uy * (11.5 + t * 9) * s,
      {
        width: 3.1 * s * (1 - t * 0.45),
        color: pal.primary,
        coreColor: pal.core,
        alpha: env * 0.9,
        peakRatio: 0.42,
      },
    );
  }
}

// ----------------------------------------------------------------------------
// 2E. BESPOKE 24-ABILITY SIGNATURE SKILL VFX (ua_ability)
// Every unit, elite, and boss skill has its own visual language matching its
// chibi object identity (miniature suns, layered clock rings, interlocking shields,
// pinwheel cyclones, forge wedges, geodesic honeycombs, buzz-saw shredders, etc.).
// ----------------------------------------------------------------------------
function _drawUnitAbilityEffect(ctx, bf, w, h, fx, layer, t, profile, pal) {
  const gp = bf.worldToScreen(fx.x, fx.y, w, h, 0);
  const sp = bf.worldToScreen(fx.x, fx.y, w, h, 4.2);
  const ease = easeOutQuart(t);
  const env = smoothWindow(t, 0.12, 0.38, 1.0);
  if (env <= 0.01) return;

  const s = resolveSkillVfxScale(gp.scale, profile, fx.scale);
  const worldR = Math.max(8, fx.radius || 14);
  const rx = worldR * (gp.scaleX ?? gp.scale * 0.88) * (0.36 + ease * 0.78);
  const ry = worldR * (gp.scaleY ?? gp.scale * 0.48) * (0.36 + ease * 0.78);
  const kind = fx.meta?.abilityKind || 'aoe_damage';
  const abId = fx.meta?.abilityId || '';
  const pid = profile?.id || fx.profileId || '';
  const abColor = fx.color || pal.primary;

  // ---------------- GROUND LAYER ----------------
  if (layer === 'ground') {
    if (abId === 'unit_solar_flare' || abId === 'boss_orbital_cataclysm') {
      const isBoss = abId === 'boss_orbital_cataclysm';
      const aoeRx = worldR * (gp.scaleX ?? gp.scale * 0.88);
      const aoeRy = worldR * (gp.scaleY ?? gp.scale * 0.48);
      drawSolarImpactMotion(ctx, gp.x, gp.y, s * (isBoss ? 1.15 : 1.0), t, fx.seed || 77, pal, {
        isSkill: true,
        aoeRx,
        aoeRy,
        layer: 'ground',
        reducedMotion: isReducedMotionActive(),
      });
      if (isBoss) {
        drawRadialGroundCracks(ctx, gp.x, gp.y, aoeRx * 0.82, aoeRy * 0.82, {
          count: 7,
          seed: fx.seed || 77,
          color: abColor,
          coreColor: pal.core,
          alpha: env * 0.72,
          lineWidth: 2.0 * s * 0.8,
        });
      }
      return;
    }

    if (abId === 'unit_chrono_snare' || abId === 'boss_temporal_collapse' || abId === 'boss_phase_mend') {
      const aoeRx = worldR * (gp.scaleX ?? gp.scale * 0.88);
      const aoeRy = worldR * (gp.scaleY ?? gp.scale * 0.48);
      drawChronoImpactMotion(ctx, gp.x, gp.y, s, t, fx.seed || 83, pal, {
        isSkill: true,
        aoeRx,
        aoeRy,
        layer: 'ground',
        reducedMotion: isReducedMotionActive(),
      });
      return;
    }

    if (abId === 'enemy_tremor_slam') {
      drawSoftBloom(ctx, gp.x, gp.y, rx * 1.1, pal.secondary, abColor, env * 0.4, ry / Math.max(1, rx));
      drawRadialGroundCracks(ctx, gp.x, gp.y, rx * 1.04, ry * 1.04, {
        count: 7,
        seed: fx.seed || 51,
        color: abColor,
        coreColor: pal.core,
        alpha: env * 0.92,
        lineWidth: 2.5 * s * 0.8,
      });
      drawRuneShockwaveRing(ctx, gp.x, gp.y, rx, ry, {
        primary: abColor,
        secondary: pal.secondary,
        core: pal.core,
        alpha: env * 0.9,
        lineWidth: 2.8 * (1 - t * 0.4),
        notches: 8,
      });
      return;
    }

    if (abId === 'unit_aegis_pulse' || abId === 'boss_aegis_shell' || abId === 'mod_ability_bulwark_aura') {
      drawSoftBloom(ctx, gp.x, gp.y, rx * 1.05, pal.core, abColor, env * 0.3, ry / Math.max(1, rx));
      drawSymmetricalSigilRing(ctx, gp.x, gp.y, rx * 1.05, ry * 1.05, {
        count: 6,
        arcFill: 0.74,
        rotation: t * 0.9,
        lineWidth: 2.6 * (1 - t * 0.35),
        color: abColor,
        coreColor: pal.core,
        alpha: env * 0.94,
        tickStyle: 'diamond',
        innerRingRatio: 0.66,
        innerAlpha: 0.72,
      });
      return;
    }

    if (abId === 'unit_flank_surge' || abId === 'enemy_dread_rally' || abId === 'boss_war_banner' || abId === 'mod_ability_warlord_aura') {
      for (let rIdx = 0; rIdx < 2; rIdx += 1) {
        const rr = rx * (0.62 + rIdx * 0.42);
        const rry = ry * (0.62 + rIdx * 0.42);
        drawRuneShockwaveRing(ctx, gp.x, gp.y, rr, rry, {
          primary: rIdx === 0 ? abColor : pal.secondary,
          secondary: pal.secondary,
          core: pal.core,
          alpha: env * (0.94 - rIdx * 0.2),
          lineWidth: 2.6 - rIdx * 0.7,
          notches: rIdx === 0 ? 6 : 0,
        });
      }
      return;
    }

    // Default structured ground sigil for remaining abilities
    drawSoftBloom(ctx, gp.x, gp.y, rx * 1.05, pal.core, abColor, env * 0.32, ry / Math.max(1, rx));
    drawSymmetricalSigilRing(ctx, gp.x, gp.y, rx * 1.04, ry * 1.04, {
      count: kind === 'ally_barrier' || kind === 'self_defense' ? 6 : 4,
      arcFill: 0.68,
      rotation: t * 1.4,
      lineWidth: 2.6 * (1 - t * 0.38),
      color: abColor,
      coreColor: pal.core,
      alpha: env * 0.92,
      tickStyle: kind === 'aoe_damage' || kind === 'drain_aoe' ? 'compass' : 'diamond',
      innerRingRatio: 0.64,
      innerAlpha: 0.62,
    });
    return;
  }

  // ---------------- SKY LAYER (All 24 Signature Skill VFX) ----------------

  // 1. SOLAR PYROMANCER — Living Boiling Solar Implosion -> Convective Plume Eruption -> Cooling
  if (abId === 'unit_solar_flare') {
    const aoeRx = worldR * (gp.scaleX ?? gp.scale * 0.88);
    const aoeRy = worldR * (gp.scaleY ?? gp.scale * 0.48);
    drawSolarImpactMotion(ctx, sp.x, sp.y - 4 * s, s, t, fx.seed || 77, pal, {
      isSkill: true,
      aoeRx,
      aoeRy,
      layer: 'sky',
      reducedMotion: isReducedMotionActive(),
    });
    return;
  }

  // 2. CHRONO WEAVER & VAEL — Freeze-Snap Ratcheting Calipers & Suspended Hourglass Dust
  if (abId === 'unit_chrono_snare' || abId === 'boss_temporal_collapse') {
    const isBoss = abId === 'boss_temporal_collapse';
    const aoeRx = worldR * (gp.scaleX ?? gp.scale * 0.88);
    const aoeRy = worldR * (gp.scaleY ?? gp.scale * 0.48);
    drawChronoImpactMotion(ctx, sp.x, sp.y - 4 * s, s * (isBoss ? 1.24 : 1.0), t, fx.seed || 83, pal, {
      isSkill: true,
      aoeRx,
      aoeRy,
      layer: 'sky',
      reducedMotion: isReducedMotionActive(),
    });
    return;
  }

  // 3. BOSS CHRONO ARBITER VAEL (boss_phase_mend) — Backwards-ratcheting open emerald-gold calipers + rising rewind sand
  if (abId === 'boss_phase_mend') {
    const rewindPal = { primary: '#34d399', secondary: '#fde047', core: '#ecfdf5', glow: '#059669' };
    const calR = (22 + ease * 6) * s;
    const revTick = -ratchetStepAngle(t, 6, Math.PI * 0.36);
    for (let c = 0; c < 2; c += 1) {
      const a0 = revTick * (c === 0 ? 1 : -0.75) + c * Math.PI;
      drawAnalyticalRibbon(
        ctx,
        (u) => {
          const a = a0 + (u - 0.5) * 1.55;
          return { x: sp.x + Math.cos(a) * calR, y: sp.y - 6 * s + Math.sin(a) * calR * 0.75 };
        },
        {
          steps: 14,
          maxWidth: 4.0 * s * env,
          color: c === 0 ? rewindPal.primary : rewindPal.secondary,
          coreColor: rewindPal.core,
          alpha: env * 0.94,
          taperProfile: 'crescent',
          coreRatio: 0.45,
          glowAlpha: 0.22,
        },
      );
    }
    // Ascending golden rewind hourglass motes drifting up cleanly
    for (let i = 0; i < 8; i += 1) {
      const life = ((t * 1.6 + i / 8) % 1);
      const ox = Math.sin(i * 1.9 + life * 4.5) * 15 * s;
      const oy = gp.y - life * 46 * s;
      ctx.fillStyle = withAlpha(i % 2 === 0 ? rewindPal.secondary : rewindPal.core, Math.sin(life * Math.PI) * env * 0.94);
      ctx.beginPath();
      ctx.arc(sp.x + ox, oy, Math.max(1.2, (2.4 - life * 0.8) * s), 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // 4. HEAVY DEFENDER — Cascading Gilded Hard-Light Bastion Wave around unit
  if (abId === 'unit_bulwark_guard') {
    drawShieldWaveMotion(ctx, sp.x, sp.y - 4 * s, fx.angle || 0, s, t, fx.seed || 33, pal, {
      plateCount: 3,
      isBoss: false,
      reducedMotion: isReducedMotionActive(),
    });
    return;
  }

  // 5. SWIFT CAVALRY / RIFT STALKER — Twin spiraling pinwheel/rift cyclone ribbons
  if (abId === 'unit_flank_surge') {
    for (let hIdx = 0; hIdx < 2; hIdx += 1) {
      drawAnalyticalRibbon(
        ctx,
        (u) => sampleHelixArc(sp.x, gp.y, (38 + ease * 18) * s, (16 - ease * 4) * s, t * 8 + hIdx * Math.PI, 1.8, u),
        {
          steps: 20,
          maxWidth: 4.0 * s * (1 - t * 0.35),
          color: hIdx === 0 ? abColor : pal.secondary,
          coreColor: pal.core,
          alpha: env * 0.92,
          taperProfile: 'taper_out',
          coreRatio: 0.45,
          glowAlpha: 0.2,
        },
      );
    }
    drawPrecisionChevron(ctx, sp.x, sp.y - (8 + ease * 14) * s, -Math.PI * 0.5, {
      halfHeight: 12 * s,
      depth: 8 * s,
      thickness: 2.6 * s,
      color: abColor,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: env * 0.92,
    });
    return;
  }

  // 6. ARMOR SUNDER (Armor Breaker -> molten anvil wedges; Abyssal Ravager/Executioner -> sawblade vortex)
  if (abId === 'unit_armor_sunder') {
    const isSaw = pid === 'enemy_abyssal_ravager' || pid === 'elite_abyssal_executioner';
    if (isSaw) {
      for (let k = 0; k < 3; k += 1) {
        const a = t * 8 + (k * Math.PI * 2) / 3;
        drawBeveledBladeArc(ctx, sp.x, sp.y - 2 * s, (18 + ease * 14) * s, (13 + ease * 9) * s, a, a + 1.5, {
          maxWidth: 6.5 * s * (1 - t * 0.35),
          color: abColor,
          secondaryColor: pal.secondary,
          coreColor: pal.core,
          alpha: env * 0.95,
          steps: 18,
          detail: 'serrated',
          detailCount: 5,
        });
      }
    } else {
      for (let i = 0; i < 6; i += 1) {
        const a = (i * Math.PI) / 3;
        const rOut = (12 + ease * 20) * s;
        drawFacetedCrystal(ctx, sp.x + Math.cos(a) * rOut, sp.y + Math.sin(a) * rOut * 0.6, 5.2 * s, 2.8 * s, a + Math.PI * 0.5, {
          primary: abColor,
          highlight: pal.secondary,
          dark: '#431407',
          outline: '#1c0a04',
          alpha: env * 0.94,
        });
      }
      drawStarFlare(ctx, sp.x, sp.y, 18 * s * (1 - t * 0.3), 0.16, pal.secondary, pal.core, env * 0.96, 0, 4);
    }
    return;
  }

  // 7. AEGIS PULSE (Aegis Sentinel -> cascading hex dome; Cryo Warden/Archwarden -> 3D crystal burst)
  if (abId === 'unit_aegis_pulse' || abId === 'boss_aegis_shell' || abId === 'mod_ability_bulwark_aura') {
    const isCryo = pid === 'enemy_cryo_warden' || pid === 'elite_cryo_archwarden';
    if (isCryo) {
      drawCrystalCageImpactMotion(ctx, sp.x, sp.y - 4 * s, s, t, fx.seed || 41, pal, {
        shardCount: 6,
        isSkill: true,
        isCage: false,
        reducedMotion: isReducedMotionActive(),
      });
    } else {
      drawShieldWaveMotion(ctx, sp.x, sp.y - 4 * s, fx.angle || 0, s, t, fx.seed || 43, pal, {
        plateCount: abId === 'boss_aegis_shell' ? 5 : 3,
        isBoss: abId === 'boss_aegis_shell',
        reducedMotion: isReducedMotionActive(),
      });
    }
    return;
  }

  // 8. ASTRAL AUTOMATON — Counter-Precessing 3D Gyroscope Orbital Rails
  if (abId === 'unit_construct_overdrive') {
    drawGyroOrbitalMotion(ctx, sp.x, sp.y - 4 * s, fx.angle || 0, s, t, pal, {
      isSkill: true,
      reducedMotion: isReducedMotionActive(),
    });
    return;
  }

  // 9. ENEMY VOID BASH & TREMOR SLAM
  if (abId === 'enemy_shield_bash' || abId === 'enemy_tremor_slam') {
    const isTremor = abId === 'enemy_tremor_slam';
    if (isTremor) {
      drawArtilleryBlastMotion(ctx, sp.x, gp.y - 4 * s, s * 1.05, t, fx.seed || 51, pal, {
        isBoss: true,
        reducedMotion: isReducedMotionActive(),
      });
    } else {
      drawShieldWaveMotion(ctx, sp.x, sp.y - 2 * s, fx.angle || 0, s, t, fx.seed || 53, pal, {
        plateCount: 3,
        isBoss: false,
        reducedMotion: isReducedMotionActive(),
      });
    }
    return;
  }

  // 10. ENEMY STASIS FIELD — Locking 3D-Tumbling Crystal Cage -> Shatter
  if (abId === 'enemy_stasis_field') {
    drawCrystalCageImpactMotion(ctx, sp.x, sp.y - 6 * s, s, t, fx.seed || 61, pal, {
      shardCount: 6,
      isSkill: true,
      isCage: true,
      reducedMotion: isReducedMotionActive(),
    });
    return;
  }

  // 11. DREAD BANNER & WARLORD RALLY SURGES
  if (abId === 'enemy_dread_rally' || abId === 'boss_war_banner' || abId === 'mod_ability_warlord_aura') {
    // Rising banner-crest chevrons + harmonic rally waves
    for (let i = 0; i < 3; i += 1) {
      const oy = -10 * s - i * 11 * s - ease * 12 * s;
      drawPrecisionChevron(ctx, sp.x, sp.y + oy, -Math.PI * 0.5, {
        halfHeight: (14 - i * 2) * s,
        depth: 8 * s,
        thickness: 2.5 * s,
        color: i % 2 === 0 ? abColor : pal.secondary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * (0.95 - i * 0.15),
      });
    }
    drawStarFlare(ctx, sp.x, sp.y - 16 * s, 15 * s * (1 - t * 0.3), 0.16, pal.secondary, pal.core, env * 0.92, 0, 4);
    return;
  }

  // 12. BOSS BASTION SHOCKWAVE (Vex -> golden octagonal citadel pillars; Malakor -> eclipsed obsidian spires)
  if (abId === 'boss_shockwave') {
    const count = 6;
    const ringR = (16 + ease * 26) * s;
    for (let i = 0; i < count; i += 1) {
      const a = (i * Math.PI * 2) / count + 0.3;
      const bx = sp.x + Math.cos(a) * ringR;
      const by = gp.y + Math.sin(a) * ringR * 0.48;
      drawTaperedBeamSpire(ctx, bx, by, by - (28 + ease * 18) * s, {
        baseWidth: 9 * s * (1 - t * 0.4),
        topWidth: 2 * s,
        tipHeight: 10 * s,
        color: abColor,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.88,
        mode: 'spire',
      });
    }
    drawStarFlare(ctx, sp.x, sp.y - 6 * s, 22 * s * (1 - t * 0.28), 0.16, pal.secondary, pal.core, env * 0.96, t, 8);
    return;
  }

  // 13. BOSS ARCANE BARRAGE — 3D-Tumbling Royal Prism Crystal Detonation
  if (abId === 'boss_arcane_barrage') {
    drawCrystalCageImpactMotion(ctx, sp.x, sp.y - 6 * s, s, t, fx.seed || 71, pal, {
      shardCount: 8,
      isSkill: true,
      isCage: false,
      reducedMotion: isReducedMotionActive(),
    });
    return;
  }

  // 14. BOSS SUMMON PORTALS (Guard / Stasis / Ravagers)
  if (abId.startsWith('boss_summon_')) {
    drawTaperedBeamSpire(ctx, sp.x, gp.y, gp.y - (64 + ease * 18) * s, {
      baseWidth: 20 * s * (1 - t * 0.45),
      topWidth: 6 * s,
      tipHeight: 14 * s,
      color: abColor,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: env * 0.82,
      mode: 'spire',
    });
    drawGyroOrbitalMotion(ctx, sp.x, gp.y - 16 * s, 0, s * 0.85, t, pal, {
      isSkill: false,
      reducedMotion: isReducedMotionActive(),
    });
    return;
  }

  // 15. BOSS HYPERION — Orbital Cataclysm (Descending Boiling Dyson Star-Core + Solar Eruption!)
  if (abId === 'boss_orbital_cataclysm') {
    const aoeRx = worldR * (gp.scaleX ?? gp.scale * 0.88);
    const aoeRy = worldR * (gp.scaleY ?? gp.scale * 0.48);
    const dropY = gp.y - (1 - easeOutCubic(t)) * 78 * s * 0.85 - 16 * s * 0.85;
    drawBoilingPlasmaBody(ctx, sp.x, dropY, (16 + ease * 8) * s * 0.85 * (1 - t * 0.25), {
      primary: abColor,
      secondary: pal.secondary,
      core: '#ffffff',
      glow: pal.glow,
      alpha: env * 0.96,
      phase: t * 14,
      seed: fx.seed || 77,
      turbulence: 0.36,
      samples: 14,
    });
    drawSolarImpactMotion(ctx, sp.x, sp.y - 4 * s, s * 1.15, t, fx.seed || 77, pal, {
      isSkill: true,
      aoeRx,
      aoeRy,
      layer: 'sky',
      reducedMotion: isReducedMotionActive(),
    });
    return;
  }

  // 16. BOSS HYPERION — Void Siphon (Inward-draining gravity siphon filaments)
  if (abId === 'boss_void_siphon') {
    for (let i = 0; i < 6; i += 1) {
      const a = (i * Math.PI) / 3 + t * 2.2;
      const rOuter = (36 - ease * 26) * s;
      const sx = sp.x + Math.cos(a) * rOuter;
      const sy = sp.y - 6 * s + Math.sin(a) * rOuter * 0.55;
      drawTaperedNeedle(ctx, sx, sy, sp.x, sp.y - 6 * s, {
        width: 3.4 * s,
        color: i % 2 === 0 ? abColor : pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.92,
        peakRatio: 0.78,
      });
    }
    drawStarFlare(ctx, sp.x, sp.y - 6 * s, 18 * s, 0.2, abColor, '#ffffff', env * 0.96, -t * 2, 6);
    return;
  }

  // Fallback for any future/custom ability
  if (kind === 'aoe_damage' || kind === 'drain_aoe') {
    drawTaperedBeamSpire(ctx, sp.x, gp.y, gp.y - (52 + ease * 32), {
      baseWidth: Math.min(26, rx * 0.28) * (1 - t * 0.45),
      topWidth: 4,
      tipHeight: 16,
      color: abColor,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: env * 0.78,
      mode: kind === 'drain_aoe' ? 'spire' : 'lance',
    });
    drawStarFlare(ctx, sp.x, sp.y, 18 * (1 - t * 0.35), 0.18, abColor, pal.core, env * 0.92, t * 1.2, 8);
  } else if (kind === 'ally_barrier' || kind === 'self_defense') {
    drawGeodesicHexPlate(ctx, sp.x, sp.y, 18 + ease * 16, 18 + ease * 16, {
      rotation: t * 0.5,
      color: abColor,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      fillAlpha: env * 0.16,
      strokeAlpha: env * 0.9,
      lineWidth: 2.2 * (1 - t * 0.35),
    });
  } else {
    drawStarFlare(ctx, sp.x, sp.y - ease * 14, 15 * (1 - t * 0.35), 0.2, abColor, pal.core, env * 0.88, t, 4);
  }
}

// ============================================================================
// 3. ELEMENTAL / DIRECTIONAL UNIT HIT REACTION OVERLAY
// ============================================================================

export function drawUnitHitReactionOverlay(ctx, unit, drawX, drawY, spriteSize, scale) {
  if (!unit || unit.hitFlash <= 0) return;
  const ratio = clamp01(unit.hitFlash / 0.16);
  const cx = drawX;
  const cy = drawY + spriteSize * 0.46;

  let rimColor = '#ffffff';
  let coreColor = '#fffdf4';
  const rx = unit.lastHitReaction || '';
  if (rx === 'solar_burn') {
    rimColor = '#f97316';
    coreColor = '#fffbeb';
  } else if (rx === 'cryo_chill') {
    rimColor = '#67e8f9';
    coreColor = '#f0f9ff';
  } else if (rx === 'chrono_slow') {
    rimColor = '#a78bfa';
    coreColor = '#f5f3ff';
  } else if (rx === 'armor_sunder') {
    rimColor = '#fb923c';
    coreColor = '#fff7ed';
  } else if (rx === 'radiant_holy') {
    rimColor = '#f5d37a';
    coreColor = '#fffdf7';
  } else if (rx === 'arcane_pierce') {
    rimColor = '#38bdf8';
    coreColor = '#f0f9ff';
  } else if (rx.startsWith('void_')) {
    rimColor = '#fb7185';
    coreColor = '#fff1f2';
  }

  const sz = Math.max(44, spriteSize || 68 * scale);
  drawSoftBloom(ctx, cx, cy, sz * 0.44, coreColor, rimColor, ratio * 0.62);

  const hitAngle = typeof unit.lastHitAngle === 'number' ? unit.lastHitAngle : 0;
  const slashLen = sz * (0.28 + (1 - ratio) * 0.16);
  drawTaperedNeedle(
    ctx,
    cx - Math.cos(hitAngle) * slashLen * 0.65,
    cy - Math.sin(hitAngle) * slashLen * 0.65,
    cx + Math.cos(hitAngle) * slashLen * 0.95,
    cy + Math.sin(hitAngle) * slashLen * 0.95,
    {
      width: Math.max(2.6, sz * 0.065) * ratio,
      color: rimColor,
      coreColor,
      alpha: ratio * 0.94,
      peakRatio: 0.45,
    },
  );

  drawStarFlare(ctx, cx, cy, sz * 0.24 * ratio, 0.16, rimColor, coreColor, ratio * 0.92, hitAngle, 4);
}
