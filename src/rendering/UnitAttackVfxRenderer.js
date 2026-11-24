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
 * Computes screen-space weapon/emitter origin matching BattleRenderer._drawUnit
 * so beams visually fire directly out of the attacking unit's weapon/emitter.
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
  const em = profile?.emitter || { screenForwardPx: 12, screenYOffsetPx: -1 };
  if (unit && unit.state !== UNIT_STATES.DEAD) {
    const p0 = bf.worldToScreen(unit.x, unit.y, w, h, 0);
    const uScale = (unit.visualScale || 1) * Math.max(0.76, Math.min(1.26, p0.scale / 8.0));
    const spriteSize = 44 * uScale;
    const phase = unit.phase || 0;
    const isMoving = unit.state === UNIT_STATES.MOVING;
    const walkBob = isMoving
      ? Math.abs(Math.sin(elapsed * 9.5 + phase)) * 4.0
      : Math.sin(elapsed * 3.4 + phase) * 1.1;
    const lungeRatio = unit.attackAnim > 0 ? Math.sin((unit.attackAnim / 0.24) * Math.PI) : 0;
    const facing = unit.facing || facingSign || 1;
    const lunge = lungeRatio * 8 * facing;
    const drawX = p0.x + lunge;
    const drawY = p0.y - spriteSize * 0.78 - walkBob;
    const centerY = drawY + spriteSize * 0.48;
    return {
      x: drawX + facing * (em.screenForwardPx ?? 12) * uScale,
      y: centerY + (em.screenYOffsetPx ?? -1) * uScale,
      scale: uScale,
      facing,
    };
  }
  const p0 = bf.worldToScreen(fallbackX, fallbackY, w, h, 0);
  const uScale = (profile?.scale || 1) * Math.max(0.76, Math.min(1.26, p0.scale / 8.0));
  const spriteSize = 44 * uScale;
  const facing = facingSign || 1;
  return {
    x: p0.x + facing * (em.screenForwardPx ?? 12) * uScale,
    y: p0.y - spriteSize * 0.30 + (em.screenYOffsetPx ?? -1) * uScale,
    scale: uScale,
    facing,
  };
}

/**
 * Resolves live torso-height screen target coordinates for moving targets.
 */
export function resolveLiveTargetScreenPoint(bf, w, h, targetUnit, fallbackX, fallbackY) {
  if (targetUnit && targetUnit.state !== UNIT_STATES.DEAD) {
    const p0 = bf.worldToScreen(targetUnit.x, targetUnit.y, w, h, 0);
    const uScale = (targetUnit.visualScale || 1) * Math.max(0.76, Math.min(1.26, p0.scale / 8.0));
    const spriteSize = 44 * uScale;
    return {
      x: p0.x,
      y: p0.y - spriteSize * 0.30,
      groundX: p0.x,
      groundY: p0.y,
      scale: uScale,
    };
  }
  const p0 = bf.worldToScreen(fallbackX, fallbackY, w, h, 0);
  const uScale = Math.max(0.76, Math.min(1.26, p0.scale / 8.0));
  return {
    x: p0.x,
    y: p0.y - 44 * uScale * 0.30,
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
  const vz = proj.z ?? 2.5;
  const p = bf.worldToScreen(vx, vy, w, h, vz);
  const s = Math.max(0.75, Math.min(1.45, (p.scale / 8.2) * (profile.scale || 1)));

  const sourceUnit = proj.sourceUid && unitByUid ? unitByUid.get(proj.sourceUid) : null;
  const targetUnit = proj.targetUid && unitByUid ? unitByUid.get(proj.targetUid) : null;
  const defaultFacing = (proj.targetX ?? proj.x) >= (proj.startX ?? proj.x) ? 1 : -1;

  const isLaserStyle =
    style === 'obsidian_railgun_beam' ||
    style === 'hardlight_hex_gate' ||
    style === 'triple_pulse_burst';

  const emitterP = isLaserStyle
    ? resolveUnitEmitterScreenPoint(
        bf,
        w,
        h,
        sourceUnit,
        proj.startX ?? vx - 8,
        proj.startY ?? vy,
        defaultFacing,
        profile,
        elapsed,
      )
    : null;
  const liveTargetP = isLaserStyle
    ? resolveLiveTargetScreenPoint(bf, w, h, targetUnit, proj.targetX ?? vx + 10, proj.targetY ?? vy)
    : null;

  const startP = emitterP
    ? emitterP
    : typeof proj.startX === 'number'
      ? bf.worldToScreen(proj.startX, proj.startY, w, h, 3.0)
      : { x: p.x - 42 * s, y: p.y };
  const targetWorldX = proj.targetX ?? vx + 10;
  const targetWorldY = proj.targetY ?? vy;
  const targetP = liveTargetP ? liveTargetP : bf.worldToScreen(targetWorldX, targetWorldY, w, h, 2.8);
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
    // 1. ARCANE ARCHER — Precision Crystalline Longbow Arrow + Shed Wind Rings
    // ------------------------------------------------------------------
    case 'arcane_longbow_arrow': {
      const tailLen = 34 * s;
      // Sleek tapered sapphire flight wake
      drawTaperedNeedle(ctx, p.x - ux * tailLen, p.y - uy * tailLen, p.x - ux * 2 * s, p.y - uy * 2 * s, {
        width: 3.4 * s,
        color: pal.primary,
        coreColor: pal.core,
        alpha: 0.82,
        peakRatio: 0.84,
      });
      // 2 delicate shed slipstream compression rings behind the arrowhead
      for (let r = 1; r <= 2; r += 1) {
        const rx = p.x - ux * (r * 10.5 * s);
        const ry = p.y - uy * (r * 10.5 * s);
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(heading);
        drawEllipticalHalo(ctx, 0, 0, 1.8 * s, (4.2 + r * 1.4) * s, {
          lineWidth: 1.05 * s,
          color: pal.secondary,
          coreColor: pal.core,
          alpha: 0.62 - r * 0.18,
        });
        ctx.restore();
      }
      drawSoftBloom(ctx, p.x + ux * 4 * s, p.y + uy * 4 * s, 9.5 * s, pal.core, pal.primary, 0.44);
      // Detailed crystalline precision arrow polygon
      drawPrecisionArrow(ctx, p.x, p.y, heading, {
        shaftLength: 18 * s,
        shaftHalfWidth: 1.3 * s,
        tailHalfWidth: 0.4 * s,
        headLength: 10.5 * s,
        headHalfWidth: 4.8 * s,
        barbBack: 3.6 * s,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: 0.98,
        withShaft: true,
      });
      // Twin split energy fletching chevrons at tail
      for (let f = 0; f < 2; f += 1) {
        drawPrecisionChevron(ctx, p.x - ux * (15 + f * 3.8) * s, p.y - uy * (15 + f * 3.8) * s, heading, {
          halfHeight: (3.6 - f * 0.6) * s,
          depth: 4.0 * s,
          thickness: 1.05 * s,
          color: pal.secondary,
          secondaryColor: pal.primary,
          coreColor: pal.core,
          alpha: 0.85 - f * 0.18,
        });
      }
      break;
    }

    // ------------------------------------------------------------------
    // 2. FIELD CLERIC (OFFENSE) — Sky-Descended Judgment Pillar + Cathedral Rosette
    // (ZERO flying orb! Inscribes sacred seal on target -> drops heavenly lance!)
    // ------------------------------------------------------------------
    case 'sacred_judgment_pillar': {
      const sealProgress = clamp01(progress / 0.55);
      const dropProgress = clamp01((progress - 0.36) / 0.64);
      const sealRx = (15 + easeOutCubic(sealProgress) * 9) * s;
      const sealRy = sealRx * 0.46;

      // Ground cathedral rosette inscribing directly beneath target
      drawSoftBloom(ctx, targetGroundP.x, targetGroundP.y, sealRx * 1.15, pal.core, pal.primary, 0.34, 0.48);
      drawCathedralRosette(ctx, targetGroundP.x, targetGroundP.y, sealRx, sealRy, {
        rotation: progress * 1.8,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: 0.88,
        lineWidth: 1.45 * s,
      });

      // Slender golden invocation thread linking caster to the overhead sanctuary focal point
      const skyAnchorX = targetP.x;
      const skyAnchorY = targetP.y - 50 * s;
      const invAlpha = (1 - dropProgress * 0.58) * 0.72;
      if (invAlpha > 0.05) {
        const ctrl = {
          x: (startP.x + skyAnchorX) * 0.5,
          y: Math.min(startP.y, skyAnchorY) - 8 * s,
        };
        drawAnalyticalRibbon(ctx, (u) => sampleQuadBezier(startP, ctrl, { x: skyAnchorX, y: skyAnchorY }, u), {
          uStart: 0,
          uEnd: clamp01(progress * 2.2),
          steps: 18,
          maxWidth: 2.2 * s,
          color: pal.secondary,
          coreColor: pal.core,
          alpha: invAlpha,
          taperProfile: 'spindle',
          coreRatio: 0.5,
          glowAlpha: 0.16,
        });
      }

      // Focusing sacred prism ring floating above target
      drawStarFlare(ctx, skyAnchorX, skyAnchorY, (7.5 + sealProgress * 4.5) * s, 0.16, pal.secondary, pal.core, 0.9, progress * 0.9, 4);

      // Descending heavenly judgment lance slicing down onto target!
      if (dropProgress > 0.01) {
        const tipY = skyAnchorY + (targetGroundP.y - skyAnchorY) * easeOutQuart(dropProgress);
        drawTaperedBeamSpire(ctx, targetP.x, tipY, skyAnchorY - 12 * s, {
          baseWidth: (9.5 + dropProgress * 4.5) * s,
          topWidth: 2.2 * s,
          tipHeight: 16 * s,
          color: pal.primary,
          secondaryColor: pal.secondary,
          coreColor: pal.core,
          alpha: 0.92,
          mode: 'lance',
        });
        // Descending golden halo ring tracking the spear tip
        drawEllipticalHalo(ctx, targetP.x, tipY - 8 * s, 9.5 * s, 3.8 * s, {
          lineWidth: 1.4 * s,
          color: pal.secondary,
          coreColor: pal.core,
          alpha: 0.85,
        });
      }
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
    // 5. SOLAR PYROMANCER — Target-Anchored Celestial Sun-Rune Ignition & Eruption
    // (ZERO flying orb! Sun-dial rune charges under target -> helical fire pillar rises!)
    // ------------------------------------------------------------------
    case 'solar_rune_ignition': {
      const chargeT = clamp01(progress / 0.58);
      const eruptT = clamp01((progress - 0.46) / 0.54);
      const runeRx = (18 + easeOutCubic(chargeT) * 12) * s;
      const runeRy = runeRx * 0.48;

      // Localized warm floor glow beneath the target's solar seal
      drawSoftBloom(ctx, targetGroundP.x, targetGroundP.y, runeRx * 1.2, pal.secondary, pal.primary, 0.36, 0.48);

      // Rotating 12-tick celestial sun-dial rune on battlefield ground
      drawSymmetricalSigilRing(ctx, targetGroundP.x, targetGroundP.y, runeRx, runeRy, {
        count: 6,
        arcFill: 0.62,
        rotation: progress * 2.1,
        lineWidth: 1.75 * s,
        color: pal.primary,
        coreColor: pal.core,
        alpha: 0.92,
        tickStyle: 'compass',
        tickLength: 0.28,
        innerRingRatio: 0.6,
        innerAlpha: 0.72,
      });

      // Slender curved golden ignition thread arching from Pyromancer's staff to the rune center
      if (chargeT < 0.98) {
        const sparkCtrl = {
          x: (startP.x + targetGroundP.x) * 0.5,
          y: Math.min(startP.y, targetGroundP.y) - 22 * s,
        };
        drawAnalyticalRibbon(ctx, (u) => sampleQuadBezier(startP, sparkCtrl, targetGroundP, u), {
          uStart: Math.max(0, chargeT - 0.55),
          uEnd: chargeT,
          steps: 18,
          maxWidth: 2.8 * s,
          color: pal.secondary,
          coreColor: pal.core,
          alpha: (1 - eruptT * 0.7) * 0.85,
          taperProfile: 'comet',
          coreRatio: 0.5,
          glowAlpha: 0.22,
        });
      }

      // Rising twin helical solar-prominence ribbons erupting upward from the rune!
      if (eruptT > 0.01) {
        const pillarH = (24 + easeOutQuart(eruptT) * 44) * s;
        for (let hIdx = 0; hIdx < 2; hIdx += 1) {
          drawAnalyticalRibbon(
            ctx,
            (u) =>
              sampleHelixArc(
                targetGroundP.x,
                targetGroundP.y,
                pillarH,
                (11 - eruptT * 2.5) * s,
                progress * 6 + hIdx * Math.PI,
                1.35,
                u,
              ),
            {
              steps: 22,
              maxWidth: 4.2 * s,
              color: hIdx === 0 ? pal.primary : pal.secondary,
              coreColor: pal.core,
              alpha: 0.88,
              taperProfile: 'taper_out',
              coreRatio: 0.45,
              glowAlpha: 0.24,
            },
          );
        }
        drawTaperedBeamSpire(ctx, targetGroundP.x, targetGroundP.y, targetGroundP.y - pillarH * 0.9, {
          baseWidth: 13 * s,
          topWidth: 2.5 * s,
          tipHeight: 14 * s,
          color: pal.primary,
          secondaryColor: pal.secondary,
          coreColor: pal.core,
          alpha: 0.72 * eruptT,
          mode: 'spire',
        });
      }
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
    // 8. CHRONO WEAVER — Target-Anchored Roman Clockface Dial + Time-Echo Slices
    // (ZERO flying orb! Clockface materializes on target with sweeping hands & tether!)
    // ------------------------------------------------------------------
    case 'chrono_dial_tether': {
      const dialR = (16.5 - progress * 3.5) * s;
      // Slender curved violet-gold chronometer tether from weaver to target dial
      const tCtrl = {
        x: (startP.x + targetP.x) * 0.5,
        y: (startP.y + targetP.y) * 0.5 - 12 * s,
      };
      drawAnalyticalRibbon(ctx, (u) => sampleQuadBezier(startP, tCtrl, targetP, u), {
        uStart: 0,
        uEnd: 1,
        steps: 20,
        maxWidth: 2.4 * s,
        color: pal.primary,
        coreColor: pal.spark,
        alpha: 0.72,
        taperProfile: 'spindle',
        coreRatio: 0.42,
        glowAlpha: 0.18,
      });

      // Miniature Roman clockface dial locking directly onto target
      drawSoftBloom(ctx, targetP.x, targetP.y, dialR * 1.15, pal.core, pal.primary, 0.36);
      drawClockfaceDial(ctx, targetP.x, targetP.y, dialR, dialR * 0.88, {
        rotation: -progress * 0.9,
        handAngle1: -Math.PI * 0.5 + progress * Math.PI * 2.2,
        handAngle2: Math.PI * 0.35 - progress * Math.PI * 0.85,
        color: pal.primary,
        secondaryColor: pal.spark,
        coreColor: pal.core,
        alpha: 0.94,
        lineWidth: 1.55 * s,
      });

      // Twin opposing orbital time-echo crescent blades tightening around dial
      for (const sideSign of [-1, 1]) {
        const baseA = progress * 4.2 + (sideSign > 0 ? 0 : Math.PI);
        drawBeveledBladeArc(ctx, targetP.x, targetP.y, dialR * 1.18, dialR * 1.04, baseA - 0.52, baseA + 0.52, {
          maxWidth: 3.2 * s,
          color: sideSign > 0 ? pal.primary : pal.spark,
          secondaryColor: pal.secondary,
          coreColor: pal.core,
          alpha: 0.85,
          steps: 14,
        });
      }
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

    // ------------------------------------------------------------------
    // 10. CORRUPTED ACOLYTE (OFFENSE) — Twin Intertwining Curse Tether + Hex Brand
    // (ZERO flying orb! Sinuous dark-violet tendrils lock onto target hexagram!)
    // ------------------------------------------------------------------
    case 'cursed_hex_tether': {
      const reach = clamp01(progress / 0.48);
      const lockT = clamp01((progress - 0.32) / 0.68);
      const cSign = proj.curveSign || 1;

      // Twin intertwining sinuous cubic-Bezier curse filaments connecting caster -> target
      for (const strand of [-1, 1]) {
        const amp = (13 + Math.sin(spin * 0.6 + strand) * 3.5) * s * strand * cSign;
        const c1 = {
          x: startP.x + adx * 0.32 + anx * amp,
          y: startP.y + ady * 0.32 + any * amp - 4 * s,
        };
        const c2 = {
          x: startP.x + adx * 0.68 - anx * amp * 0.85,
          y: startP.y + ady * 0.68 - any * amp * 0.85 + 3 * s,
        };
        drawAnalyticalRibbon(ctx, (u) => sampleCubicBezier(startP, c1, c2, targetP, u), {
          uStart: 0,
          uEnd: reach,
          steps: 24,
          maxWidth: (strand > 0 ? 3.8 : 2.6) * s,
          color: strand > 0 ? pal.primary : pal.secondary,
          coreColor: pal.core,
          alpha: 0.88,
          taperProfile: 'spindle',
          coreRatio: 0.38,
          glowWidthMultiplier: 1.65,
          glowAlpha: 0.24,
        });
      }

      // Contracting inverted cursed triangle hexagram branding targetP
      const hexR = (14.5 - lockT * 4.5) * s;
      ctx.save();
      ctx.translate(targetP.x, targetP.y);
      for (let tri = 0; tri < 2; tri += 1) {
        ctx.save();
        ctx.rotate(Math.PI * 0.5 + tri * Math.PI + progress * (tri === 0 ? 1.2 : -1.2));
        ctx.strokeStyle = withAlpha(tri === 0 ? pal.primary : pal.secondary, 0.88);
        ctx.lineWidth = 1.65 * s;
        ctx.beginPath();
        for (let i = 0; i < 3; i += 1) {
          const a = (i * Math.PI * 2) / 3;
          const px = Math.cos(a) * hexR;
          const py = Math.sin(a) * hexR;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.strokeStyle = withAlpha(pal.core, 0.72);
        ctx.lineWidth = 0.7 * s;
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
      break;
    }

    // ------------------------------------------------------------------
    // 11. CORRUPTED ACOLYTE (HEAL) — Amethyst Siphon Conduit Ribbon
    // ------------------------------------------------------------------
    case 'corrupted_siphon_ribbon': {
      const wave = Math.sin(spin * 0.65) * 9.5 * s;
      const c1 = { x: startP.x + (p.x - startP.x) * 0.36 + anx * wave, y: startP.y + (p.y - startP.y) * 0.36 + any * wave };
      const c2 = { x: startP.x + (p.x - startP.x) * 0.72 - anx * wave * 0.7, y: startP.y + (p.y - startP.y) * 0.72 - any * wave * 0.7 };
      drawAnalyticalRibbon(ctx, (u) => sampleCubicBezier(startP, c1, c2, p, u), {
        uStart: Math.max(0, 1 - 0.72),
        uEnd: 1,
        steps: 20,
        maxWidth: 4.0 * s,
        color: pal.primary,
        coreColor: pal.core,
        alpha: 0.88,
        taperProfile: 'comet',
        coreRatio: 0.42,
        glowWidthMultiplier: 1.7,
        glowAlpha: 0.24,
      });
      drawSoftBloom(ctx, p.x, p.y, 11 * s, pal.core, pal.primary, 0.48);
      drawDiamondPrism(ctx, p.x, p.y, 7.2 * s, 4.8 * s, spin * 0.45, {
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: 0.94,
      });
      break;
    }

    // ------------------------------------------------------------------
    // 12 & 18. STASIS WEAVER & CHRONO ENFORCER — Flanking Converging Crystal Shards
    // (Multiple floating crystals sweeping wide flanking Bezier paths & locking onto target!)
    // ------------------------------------------------------------------
    case 'stasis_tri_crystal':
    case 'elite_phase_ring_shard': {
      const isElite = style === 'elite_phase_ring_shard';
      const sc = isElite ? s * 1.15 : s;
      const laneOffsets = isElite ? [-22, -8, 8, 22] : [-20, 0, 20];
      const shardPositions = [];

      // Subtle phase launch ring behind caster for Elite Chrono Enforcer
      if (isElite) {
        drawSymmetricalSigilRing(ctx, startP.x + aux * 6 * s, startP.y + auy * 6 * s, 10 * sc, 13 * sc, {
          count: 4,
          arcFill: 0.56,
          rotation: -spin * 0.45,
          lineWidth: 1.35 * sc,
          color: pal.secondary,
          coreColor: pal.core,
          alpha: 0.75 * (1 - progress * 0.4),
        });
      }

      for (let i = 0; i < laneOffsets.length; i += 1) {
        const lat = laneOffsets[i] * sc;
        const stagger = isElite ? i * 0.04 : Math.abs(i - 1) * 0.05;
        const uNow = clamp01((progress - stagger * 0.5) / (1 - stagger * 0.5));
        const c1 = { x: startP.x + adx * 0.28 + anx * lat, y: startP.y + ady * 0.28 + any * lat - 6 * sc };
        const c2 = { x: startP.x + adx * 0.72 + anx * lat * 0.7, y: startP.y + ady * 0.72 + any * lat * 0.7 };
        const sample = (u) => sampleCubicBezier(startP, c1, c2, targetP, u);
        const cur = sample(uNow);
        const localHeading = Math.atan2(cur.ty, cur.tx);
        shardPositions.push(cur);

        // Curved crystal flight ribbon behind each shard
        drawAnalyticalRibbon(ctx, sample, {
          uStart: Math.max(0, uNow - 0.34),
          uEnd: uNow,
          steps: 14,
          maxWidth: 2.3 * sc,
          color: i % 2 === 0 ? pal.primary : pal.secondary,
          coreColor: pal.core,
          alpha: 0.76,
          taperProfile: 'comet',
          coreRatio: 0.45,
          glowAlpha: 0.16,
        });

        drawDiamondPrism(ctx, cur.x, cur.y, 6.2 * sc, 2.5 * sc, localHeading, {
          color: i % 2 === 0 ? pal.primary : pal.secondary,
          secondaryColor: pal.core,
          coreColor: pal.core,
          alpha: 0.96,
        });
      }

      // Geometric stasis lattice web connecting the converging shards!
      if (shardPositions.length >= 3) {
        ctx.save();
        ctx.strokeStyle = withAlpha(pal.secondary, 0.52);
        ctx.lineWidth = 1.0 * sc;
        ctx.beginPath();
        ctx.moveTo(shardPositions[0].x, shardPositions[0].y);
        for (let i = 1; i < shardPositions.length; i += 1) {
          ctx.lineTo(shardPositions[i].x, shardPositions[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
      break;
    }

    // ------------------------------------------------------------------
    // 13 & 19. INFERNO BOMBARDIER & CAPTAIN — Mechanical Finned Mortar + Landing Reticle
    // (The ONLY 2 ballistic parabolic artillery units in the roster!)
    // ------------------------------------------------------------------
    case 'inferno_mortar_shell':
    case 'elite_warlord_barrage_shell': {
      const isElite = style === 'elite_warlord_barrage_shell';
      const sc = isElite ? s * 1.18 : s;

      // Ground artillery target-zone crosshair reticle pulsing at landing point
      const retRx = (13 + Math.sin(progress * Math.PI * 3) * 2.2) * sc;
      const retRy = retRx * 0.48;
      // Faint tactical dotted ballistic arc guide connecting shell to landing reticle
      ctx.save();
      ctx.strokeStyle = withAlpha(pal.secondary, 0.34);
      ctx.lineWidth = 1.15 * sc;
      ctx.setLineDash([4 * sc, 4 * sc]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(
        (p.x + targetGroundP.x) * 0.5 + aux * 6 * sc,
        Math.min(p.y, targetGroundP.y) - 6 * sc,
        targetGroundP.x,
        targetGroundP.y,
      );
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      drawSymmetricalSigilRing(ctx, targetGroundP.x, targetGroundP.y, retRx, retRy, {
        count: 4,
        arcFill: 0.52,
        rotation: progress * 1.1,
        lineWidth: (isElite ? 1.85 : 1.35) * sc,
        color: pal.primary,
        coreColor: pal.secondary,
        alpha: 0.78,
        tickStyle: 'compass',
        tickLength: 0.3,
        innerRingRatio: isElite ? 0.58 : 0,
        innerAlpha: 0.65,
      });

      // Blistering propellant exhaust plume + shed smoke compression rings
      drawTaperedNeedle(ctx, p.x - ux * 34 * sc, p.y - uy * 34 * sc, p.x - ux * 4 * sc, p.y - uy * 4 * sc, {
        width: (isElite ? 7.8 : 6.2) * sc,
        color: pal.primary,
        coreColor: pal.secondary,
        alpha: 0.82,
        peakRatio: 0.78,
      });
      for (let sr = 1; sr <= 2; sr += 1) {
        const rx = p.x - ux * (11 * sr * sc);
        const ry = p.y - uy * (11 * sr * sc);
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(heading);
        drawEllipticalHalo(ctx, 0, 0, 2.2 * sc, (4.8 + sr * 1.8) * sc, {
          lineWidth: 1.3 * sc,
          color: pal.secondary,
          coreColor: pal.core,
          alpha: 0.56 - sr * 0.16,
        });
        ctx.restore();
      }

      if (isElite) {
        // Warlord gilded helical flame ribbon around barrage shell
        const wOff = Math.sin(spin * 0.9) * 7.2 * sc;
        drawAnalyticalRibbon(
          ctx,
          (u) =>
            sampleQuadBezier(
              { x: p.x - ux * 32 * sc, y: p.y - uy * 32 * sc },
              { x: p.x - ux * 14 * sc + nx * wOff, y: p.y - uy * 14 * sc + ny * wOff },
              { x: p.x, y: p.y },
              u,
            ),
          {
            steps: 16,
            maxWidth: 3.4 * sc,
            color: pal.secondary,
            coreColor: pal.core,
            alpha: 0.86,
            taperProfile: 'comet',
            coreRatio: 0.48,
            glowAlpha: 0.2,
          },
        );
      }

      drawSoftBloom(ctx, p.x, p.y, 13 * sc, pal.secondary, pal.primary, 0.48);
      drawMechanicalMortarShell(ctx, p.x, p.y, heading, sc, pal, isElite);
      break;
    }

    // ------------------------------------------------------------------
    // 14. DREAD BANNERMAN — Ground-Skimming Beveled War-Standard Crescent Wave
    // ------------------------------------------------------------------
    case 'dread_banner_crescent': {
      const arcR = (13.5 + progress * 4.5) * s;
      // Ground friction scorch streak skimming along floor beneath blade wave
      const gNow = bf.worldToScreen(vx, vy, w, h, 0);
      drawTaperedNeedle(ctx, gNow.x - ux * 26 * s, gNow.y - uy * 12 * s, gNow.x + ux * 6 * s, gNow.y + uy * 3 * s, {
        width: 3.8 * s,
        color: pal.primary,
        coreColor: pal.secondary,
        alpha: 0.62,
        peakRatio: 0.78,
      });

      // Wide beveled crimson-gold horizontal blade wave with inner rune ticks
      drawBeveledBladeArc(ctx, p.x - ux * 4 * s, p.y - uy * 4 * s, arcR, arcR * 0.85, -1.12, 1.12, {
        maxWidth: 6.4 * s,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: 0.96,
        rotation: heading,
        steps: 20,
        detail: 'rune_ticks',
        detailCount: 5,
      });
      // Trailing war-standard silk ribbons streaming off the upper & lower wingtips
      for (const sideSign of [-1, 1]) {
        const tipX = p.x + nx * sideSign * arcR * 0.74;
        const tipY = p.y + ny * sideSign * arcR * 0.74;
        const flutter = Math.sin(spin * 0.8 + sideSign) * 3.5 * s;
        drawAnalyticalRibbon(
          ctx,
          (u) =>
            sampleQuadBezier(
              { x: tipX - ux * 24 * s + nx * flutter, y: tipY - uy * 24 * s + ny * flutter },
              { x: tipX - ux * 11 * s - nx * flutter * 0.6, y: tipY - uy * 11 * s - ny * flutter * 0.6 },
              { x: tipX, y: tipY },
              u,
            ),
          {
            steps: 14,
            maxWidth: 2.5 * s,
            color: sideSign > 0 ? pal.secondary : pal.primary,
            coreColor: pal.core,
            alpha: 0.76,
            taperProfile: 'comet',
            coreRatio: 0.4,
            glowAlpha: 0.16,
          },
        );
      }
      break;
    }

    // ------------------------------------------------------------------
    // 15 & 20. CRYO WARDEN & ARCHWARDEN — Multi-Plane Sculpted Glacial Ice Spears
    // ------------------------------------------------------------------
    case 'glacial_icicle_spear':
    case 'elite_trishard_glacial_lance': {
      const isTri = style === 'elite_trishard_glacial_lance';
      const drawIceLance = (ox, oy, scaleMul, alphaMul) => {
        drawTaperedNeedle(
          ctx,
          ox - ux * 26 * s * scaleMul,
          oy - uy * 26 * s * scaleMul,
          ox + ux * 3 * s * scaleMul,
          oy + uy * 3 * s * scaleMul,
          {
            width: 3.4 * s * scaleMul,
            color: pal.secondary,
            coreColor: pal.core,
            alpha: 0.74 * alphaMul,
            peakRatio: 0.85,
          },
        );
        drawFacetedIceSpire(ctx, ox, oy, heading, 24 * s * scaleMul, 4.4 * s * scaleMul, {
          color: pal.primary,
          secondaryColor: pal.secondary,
          coreColor: pal.core,
          alpha: 0.98 * alphaMul,
        });
        drawPrecisionChevron(ctx, ox - ux * 9 * s * scaleMul, oy - uy * 9 * s * scaleMul, heading, {
          halfHeight: 5.2 * s * scaleMul,
          depth: 4.6 * s * scaleMul,
          thickness: 1.2 * s * scaleMul,
          color: pal.primary,
          secondaryColor: pal.secondary,
          coreColor: pal.core,
          alpha: 0.84 * alphaMul,
        });
      };

      drawSoftBloom(ctx, p.x, p.y, 13 * s, pal.core, pal.primary, 0.5);
      drawIceLance(p.x, p.y, isTri ? 1.18 : 1.08, 1.0);
      if (isTri) {
        // V-formation wing icicle spears flanked by subtle crystalline frost links
        for (const sideSign of [-1, 1]) {
          const fx = p.x - ux * 8.5 * s + nx * sideSign * 8.5 * s;
          const fy = p.y - uy * 8.5 * s + ny * sideSign * 8.5 * s;
          drawIceLance(fx, fy, 0.74, 0.92);
        }
      }
      break;
    }

    // ------------------------------------------------------------------
    // 17. ELITE ASTRAL SNIPER — Precision Seeker Lance + Flanking Curved Wing Blades
    // ------------------------------------------------------------------
    case 'elite_splitwing_seeker': {
      // Snapping sniper lock reticle directly on targetP
      drawPrecisionReticle(ctx, targetP.x, targetP.y, (13.5 - progress * 5.5) * s, {
        rotation: progress * 1.8,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: 0.84,
      });

      // Central hyper-velocity seeker lance along axis
      drawTaperedNeedle(ctx, p.x - aux * 36 * s, p.y - auy * 36 * s, p.x + aux * 6 * s, p.y + auy * 6 * s, {
        width: 4.5 * s,
        color: pal.primary,
        coreColor: pal.core,
        alpha: 0.92,
        peakRatio: 0.8,
      });
      drawPrecisionArrow(ctx, p.x, p.y, axisAngle, {
        shaftLength: 20 * s,
        shaftHalfWidth: 1.65 * s,
        tailHalfWidth: 0.4 * s,
        headLength: 12 * s,
        headHalfWidth: 5.5 * s,
        barbBack: 4.2 * s,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: 0.98,
        withShaft: true,
      });

      // Twin wide flanking curved seeker wings converging sharply from startP -> targetP!
      for (const sideSign of [-1, 1]) {
        const wingLat = sideSign * 24 * s;
        const c1 = { x: startP.x + adx * 0.35 + anx * wingLat, y: startP.y + ady * 0.35 + any * wingLat };
        const c2 = { x: startP.x + adx * 0.75 + anx * wingLat * 0.45, y: startP.y + ady * 0.75 + any * wingLat * 0.45 };
        const sample = (u) => sampleCubicBezier(startP, c1, c2, targetP, u);
        const wPt = sample(progress);
        const wAngle = Math.atan2(wPt.ty, wPt.tx);
        drawAnalyticalRibbon(ctx, sample, {
          uStart: Math.max(0, progress - 0.4),
          uEnd: progress,
          steps: 16,
          maxWidth: 3.0 * s,
          color: pal.secondary,
          coreColor: pal.core,
          alpha: 0.86,
          taperProfile: 'comet',
          coreRatio: 0.45,
          glowAlpha: 0.2,
        });
        drawDiamondPrism(ctx, wPt.x, wPt.y, 5.8 * s, 2.2 * s, wAngle, {
          color: pal.secondary,
          secondaryColor: pal.primary,
          coreColor: pal.core,
          alpha: 0.96,
        });
      }
      break;
    }

    // ------------------------------------------------------------------
    // 21. BOSS AZURE ARCHON KAELIS — 5-Blade Converging Royal Prism Sword Fan
    // ------------------------------------------------------------------
    case 'boss_kaelis_prism_fan': {
      // 5 royal floating prism blades fanning wide behind Kaelis & slicing into targetP
      const lanes = [-34, -17, 0, 17, 34];
      // Diamond target lock sigil at targetP
      drawSymmetricalSigilRing(ctx, targetP.x, targetP.y, (16 - progress * 5) * s, (16 - progress * 5) * s, {
        count: 4,
        arcFill: 0.56,
        rotation: progress * 2.2,
        lineWidth: 1.7 * s,
        color: pal.primary,
        coreColor: pal.core,
        alpha: 0.86,
        tickStyle: 'diamond',
      });

      for (let i = 0; i < lanes.length; i += 1) {
        const lat = lanes[i] * s;
        const stagger = Math.abs(i - 2) * 0.06;
        const uNow = clamp01((progress - stagger * 0.5) / (1 - stagger * 0.5));
        const origin = {
          x: startP.x - aux * (Math.abs(i - 2) * 5) * s + anx * lat * 0.48,
          y: startP.y - auy * (Math.abs(i - 2) * 5) * s + any * lat * 0.48,
        };
        const c1 = { x: startP.x + adx * 0.3 + anx * lat, y: startP.y + ady * 0.3 + any * lat - 6 * s };
        const c2 = { x: startP.x + adx * 0.72 + anx * lat * 0.55, y: startP.y + ady * 0.72 + any * lat * 0.55 };
        const sample = (u) => sampleCubicBezier(origin, c1, c2, targetP, u);
        const bPt = sample(uNow);
        const bAng = Math.atan2(bPt.ty, bPt.tx);
        const isCenter = i === 2;

        drawAnalyticalRibbon(ctx, sample, {
          uStart: Math.max(0, uNow - 0.44),
          uEnd: uNow,
          steps: 18,
          maxWidth: (isCenter ? 4.4 : 2.9) * s,
          color: i % 2 === 0 ? pal.primary : pal.secondary,
          coreColor: pal.core,
          alpha: 0.9,
          taperProfile: 'comet',
          coreRatio: 0.46,
          glowWidthMultiplier: 1.65,
          glowAlpha: 0.22,
        });

        drawPrecisionArrow(ctx, bPt.x, bPt.y, bAng, {
          shaftLength: (isCenter ? 16 : 11) * s,
          shaftHalfWidth: (isCenter ? 1.6 : 1.1) * s,
          tailHalfWidth: 0.35 * s,
          headLength: (isCenter ? 11 : 8) * s,
          headHalfWidth: (isCenter ? 4.8 : 3.2) * s,
          barbBack: 3.2 * s,
          color: i % 2 === 0 ? pal.primary : pal.secondary,
          secondaryColor: pal.core,
          coreColor: pal.core,
          alpha: 0.98,
          withShaft: true,
        });
      }
      break;
    }

    // ------------------------------------------------------------------
    // 22. BOSS CHRONO ARBITER VAEL — Dual Counter-Rotating Astrolabe Singularity
    // ------------------------------------------------------------------
    case 'boss_vael_astrolabe_singularity': {
      const dialR = (23 - progress * 5) * s;

      // Twin curving astral-gold temporal conduit arcs from Vael to the singularity
      for (const sideSign of [-1, 1]) {
        const c1 = {
          x: startP.x + adx * 0.35 + anx * sideSign * 20 * s,
          y: startP.y + ady * 0.35 + any * sideSign * 20 * s,
        };
        drawAnalyticalRibbon(ctx, (u) => sampleQuadBezier(startP, c1, targetP, u), {
          uStart: 0,
          uEnd: 1,
          steps: 20,
          maxWidth: 2.8 * s,
          color: sideSign > 0 ? pal.primary : pal.secondary,
          coreColor: pal.core,
          alpha: 0.72,
          taperProfile: 'spindle',
          coreRatio: 0.4,
          glowAlpha: 0.18,
        });
      }

      // Grand dual counter-rotating astrolabe + Roman clockface locked on targetP
      drawSoftBloom(ctx, targetP.x, targetP.y, dialR * 1.25, pal.core, pal.primary, 0.48);
      drawSymmetricalSigilRing(ctx, targetP.x, targetP.y, dialR * 1.24, dialR * 1.12, {
        count: 6,
        arcFill: 0.62,
        rotation: progress * 2.4,
        lineWidth: 2.0 * s,
        color: pal.secondary,
        coreColor: pal.core,
        alpha: 0.92,
        tickStyle: 'compass',
        tickLength: 0.25,
      });
      drawClockfaceDial(ctx, targetP.x, targetP.y, dialR * 0.88, dialR * 0.8, {
        rotation: -progress * 1.8,
        handAngle1: -Math.PI * 0.5 + progress * Math.PI * 3.0,
        handAngle2: Math.PI * 0.25 - progress * Math.PI * 1.4,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: 0.96,
        lineWidth: 1.7 * s,
      });

      // 4 tightening orbital time-slice crescent blades
      for (let k = 0; k < 4; k += 1) {
        const a = progress * 4.5 + (k * Math.PI) / 2;
        drawBeveledBladeArc(ctx, targetP.x, targetP.y, dialR * 1.38, dialR * 1.24, a - 0.36, a + 0.36, {
          maxWidth: 3.4 * s,
          color: k % 2 === 0 ? pal.primary : pal.secondary,
          secondaryColor: pal.core,
          coreColor: pal.core,
          alpha: 0.88,
          steps: 12,
        });
      }
      drawStarFlare(ctx, targetP.x, targetP.y, 9.5 * s, 0.2, pal.secondary, pal.core, 0.96, -progress * 2.5, 4);
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
  const p = bf.worldToScreen(fx.x, fx.y, w, h, 3.2);
  const gp = bf.worldToScreen(fx.x, fx.y, w, h, 0);
  const s = Math.max(0.72, Math.min(1.5, (p.scale / 8.0) * (fx.scale || profile.scale || 1)));
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

  // Sky layer: crisp weapon charge / muzzle anticipation
  const isLaserCast =
    style === 'repeater_muzzle_chevron' ||
    style === 'railgun_muzzle_prism' ||
    (style === 'hex_projector_flash' && fx.meta?.mode === 'attack');
  const emitterCastP = isLaserCast
    ? resolveUnitEmitterScreenPoint(
        bf,
        w,
        h,
        sourceUnit,
        fx.x,
        fx.y,
        fx.meta?.sourceFacing || (ux >= 0 ? 1 : -1),
        profile,
        elapsed,
      )
    : null;
  const mx = emitterCastP ? emitterCastP.x : p.x + ux * 12 * s;
  const my = emitterCastP ? emitterCastP.y : p.y + uy * 7 * s;

  if (style === 'bowstring_rune_flash') {
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(angle);
    drawEllipticalHalo(ctx, 0, 0, 3.2 * s * (0.7 + t * 0.7), 10 * s * (0.7 + t * 0.55), {
      lineWidth: 1.55 * s,
      color: pal.primary,
      coreColor: pal.core,
      alpha: env * 0.88,
    });
    ctx.restore();
    drawStarFlare(ctx, mx, my, 8.5 * s * (1 - t * 0.35), 0.16, pal.secondary, pal.core, env * 0.92, angle, 4);
  } else if (style === 'railgun_muzzle_prism' || style === 'repeater_muzzle_chevron' || (style === 'hex_projector_flash' && fx.meta?.mode === 'attack')) {
    // Clean concentrated optical energy buildup at emitter (no rings, chevrons, or inline hex plates)
    const isPulse = style === 'repeater_muzzle_chevron';
    drawSoftBloom(ctx, mx, my, (isPulse ? 5.2 + t * 4.2 : 6.5 + t * 5.8) * s, '#ffffff', pal.primary, env * 0.78);
    drawStarFlare(ctx, mx, my, (isPulse ? 4.4 + t * 3.8 : 5.5 + t * 4.8) * s, 0.11, pal.secondary, '#ffffff', env * 0.96, angle, 4);
  } else if (style === 'hex_projector_flash' || style === 'void_lattice_flash' || style === 'frost_crystal_bloom') {
    drawGeodesicHexPlate(ctx, mx, my, 9 * s * (0.6 + easeOutCubic(t) * 0.45), 9 * s * (0.6 + easeOutCubic(t) * 0.45), {
      rotation: angle + t * 0.9,
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      fillAlpha: env * 0.18,
      strokeAlpha: env * 0.9,
      lineWidth: 1.55 * s,
    });
  } else if (style === 'mortar_blast_vent') {
    drawKineticShockCone(ctx, mx, my - 5 * s, angle - 0.65, 11.5 * s * (0.6 + t * 0.6), {
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: env * 0.88,
      spread: 0.68,
      lineWidth: 2.3 * s,
    });
  } else if (style === 'emerald_blossom_cast' || style === 'amethyst_siphon_cast') {
    drawLotusCrest(ctx, mx, my, 9.5 * s * (0.6 + t * 0.5), 9.5 * s * (0.6 + t * 0.5), {
      petals: 6,
      rotation: t * 1.4,
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: env * 0.86,
    });
  } else if (style === 'forge_edge_glint' || style === 'crimson_edge_flare' || style === 'reactor_charge_flare') {
    // Crisp weapon-edge glint sweeping along blade draw line
    drawTaperedNeedle(ctx, mx - ux * 9 * s, my - 10 * s, mx + ux * 11 * s, my + 8 * s, {
      width: 3.0 * s,
      color: pal.primary,
      coreColor: pal.core,
      alpha: env * 0.92,
      peakRatio: 0.55,
    });
    drawStarFlare(ctx, mx, my - 3 * s, 9.5 * s * (1 - t * 0.3), 0.15, pal.secondary, pal.core, env * 0.92, angle + 0.4, 4);
  } else if (style === 'war_standard_flourish') {
    drawBeveledBladeArc(ctx, p.x, p.y - 4 * s, 12 * s, 10 * s, -1.2, 0.8, {
      maxWidth: 3.2 * s,
      color: pal.secondary,
      secondaryColor: pal.primary,
      coreColor: pal.core,
      alpha: env * 0.85,
      rotation: angle,
      steps: 14,
    });
  } else if (style === 'sunwheel_cast_sigil') {
    // Solar Pyromancer miniature corona & extending solar rays around sun body
    const coronaR = (13 + easeOutCubic(t) * 8) * s;
    drawSoftBloom(ctx, p.x, p.y - 2 * s, coronaR * 1.15, pal.core, pal.primary, env * 0.65);
    drawEllipticalHalo(ctx, p.x, p.y - 2 * s, coronaR, coronaR, {
      lineWidth: 1.8 * s,
      color: pal.secondary,
      coreColor: pal.core,
      alpha: env * 0.9,
    });
    for (let i = 0; i < 8; i += 1) {
      const a = (i * Math.PI) / 4 + t * 2.4;
      const r0 = 9 * s;
      const r1 = (16 + easeOutCubic(t) * 10) * s;
      drawTaperedNeedle(
        ctx,
        p.x + Math.cos(a) * r0,
        p.y - 2 * s + Math.sin(a) * r0,
        p.x + Math.cos(a) * r1,
        p.y - 2 * s + Math.sin(a) * r1,
        {
          width: 2.6 * s,
          color: i % 2 === 0 ? pal.secondary : pal.primary,
          coreColor: pal.core,
          alpha: env * 0.92,
          peakRatio: 0.35,
        },
      );
    }
  } else if (style === 'clocktick_rune_pulse' || style === 'boss_astrolabe_gate') {
    // Chrono Weaver / Vael: orbiting gear alignment & spinning clock-hand flash
    const isBoss = style === 'boss_astrolabe_gate';
    const r = (isBoss ? 19 : 13) * s;
    for (let i = 0; i < 3; i += 1) {
      const ga = (i * Math.PI * 2) / 3 + t * 2.0;
      drawGearWheel(ctx, p.x + Math.cos(ga) * r, p.y + Math.sin(ga) * r * 0.72, (isBoss ? 5.2 : 3.8) * s, 6, t * 4, {
        fill: pal.spark || pal.secondary,
        stroke: '#0c081d',
        holeFill: pal.primary,
        alpha: env * 0.9,
      });
    }
    drawClockfaceDial(ctx, p.x, p.y, r * 0.95, r * 0.95, {
      rotation: -t * 1.8,
      handAngle1: -Math.PI * 0.5 + t * 4.2,
      handAngle2: Math.PI * 0.3 - t * 2.1,
      color: pal.primary,
      secondaryColor: pal.spark || pal.secondary,
      coreColor: pal.core,
      alpha: env * 0.88,
      lineWidth: 1.4 * s,
    });
  } else if (style === 'kinetic_brace') {
    // Living Winged Shield forward kinetic barrier crest
    drawGeodesicHexPlate(ctx, mx, my, 8.5 * s, 11 * s, {
      rotation: angle,
      color: pal.primary,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      fillAlpha: env * 0.22,
      strokeAlpha: env * 0.9,
      lineWidth: 1.6 * s,
    });
  } else {
    drawSoftBloom(ctx, mx, my, 10 * s, pal.core, pal.primary, env * 0.48);
    drawStarFlare(ctx, mx, my, 9 * s * (1 - t * 0.35), 0.16, pal.secondary, pal.core, env * 0.9, angle + t * 0.5, 4);
  }
}

// ----------------------------------------------------------------------------
// 2B. 15 BESPOKE MELEE CHOREOGRAPHIES (ua_melee)
// ONLY 3 seismic/molten heavies draw ground cracks; 12 melee units use zero cracks!
// ----------------------------------------------------------------------------
function _drawMeleeEffect(ctx, bf, w, h, fx, layer, t, profile, pal) {
  const style = fx.style || profile.meleeStyle || 'bulwark_shield_slam';
  const tp = bf.worldToScreen(fx.x, fx.y, w, h, 3.2);
  const tgp = bf.worldToScreen(fx.x, fx.y, w, h, 0);
  const sp =
    fx.x2 !== null && fx.y2 !== null
      ? bf.worldToScreen(fx.x2, fx.y2, w, h, 3.2)
      : { x: tp.x - Math.cos(fx.angle || 0) * 24, y: tp.y - Math.sin(fx.angle || 0) * 14 };

  const sdx = tp.x - sp.x;
  const sdy = tp.y - sp.y;
  const screenAngle = Math.hypot(sdx, sdy) > 1 ? Math.atan2(sdy, sdx) : fx.angle || 0;
  const ux = Math.cos(screenAngle);
  const uy = Math.sin(screenAngle);
  const nx = -uy;
  const ny = ux;

  const s = Math.max(0.75, Math.min(1.65, (tp.scale / 8.0) * (fx.scale || profile.scale || 1)));
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
    // 1. HEAVY DEFENDER — Shield-Wall Pressure Wave + Flying Metallic Impact Chips
    case 'bulwark_shield_slam': {
      const coneR = (14 + ease * 14) * s;
      // Vertical beveled shield-face impact crest surging forward
      drawBeveledBladeArc(ctx, midX + ux * ease * 5 * s, midY + uy * ease * 3 * s, 11 * s, 14 * s, -0.78, 0.78, {
        maxWidth: 5.6 * s * (1 - t * 0.35),
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.92,
        rotation: screenAngle,
        detail: 'rune_ticks',
        detailCount: 3,
      });
      // Dual concentric kinetic pressure arcs
      drawKineticShockCone(ctx, tp.x - ux * 2 * s, tp.y - uy * 2 * s, screenAngle, coneR, {
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.92,
        spread: 0.74,
        lineWidth: 2.5 * s * (1 - t * 0.4),
      });
      // Sharp forward kinetic impact chevron + flying beveled steel impact chips
      drawPrecisionChevron(ctx, tp.x + ux * (3 + ease * 11) * s, tp.y + uy * (3 + ease * 7) * s, screenAngle, {
        halfHeight: 11 * s,
        depth: 7.5 * s,
        thickness: 2.4 * s * (1 - t * 0.38),
        color: pal.secondary,
        secondaryColor: pal.primary,
        coreColor: pal.core,
        alpha: env * 0.92,
      });
      for (const dev of [-0.72, 0.0, 0.72]) {
        const a = screenAngle + dev;
        const dist = (10 + ease * 14) * s;
        drawDiamondPrism(ctx, tp.x + Math.cos(a) * dist, tp.y + Math.sin(a) * dist, 3.6 * s, 1.8 * s, a, {
          color: pal.secondary,
          secondaryColor: pal.primary,
          coreColor: pal.core,
          alpha: env * 0.9,
        });
      }
      drawStarFlare(ctx, tp.x, tp.y, 11.5 * s * (1 - t * 0.3), 0.16, pal.secondary, pal.core, env * 0.95, screenAngle, 4);
      break;
    }

    // 2. VOID VANGUARD — Inward-Clamping Spiked Crimson Mandible Jaws + Ram Wedge
    case 'void_spiked_ram': {
      const clampClose = (1 - easeOutCubic(t)) * 12 * s;
      // Twin opposing spiked serrated jaw arcs clamping violently across target!
      for (const sideSign of [-1, 1]) {
        const jx = tp.x + nx * sideSign * (2.5 * s + clampClose);
        const jy = tp.y + ny * sideSign * (2.5 * s + clampClose);
        drawBeveledBladeArc(
          ctx,
          jx,
          jy,
          15.5 * s,
          12.5 * s,
          sideSign > 0 ? -1.48 : 0.22,
          sideSign > 0 ? -0.22 : 1.48,
          {
            maxWidth: 5.6 * s * (1 - t * 0.34),
            color: pal.primary,
            secondaryColor: pal.secondary,
            coreColor: pal.core,
            alpha: env * 0.96,
            rotation: screenAngle,
            detail: 'serrated',
            detailCount: 4,
          },
        );
      }
      // Central barbed crimson ram chevron + crimson snap flash at closure
      drawPrecisionChevron(ctx, tp.x + ux * ease * 9 * s, tp.y + uy * ease * 5 * s, screenAngle, {
        halfHeight: 14 * s,
        depth: 11 * s,
        thickness: 3.6 * s * (1 - t * 0.4),
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.96,
      });
      drawStarFlare(ctx, tp.x + ux * 4 * s, tp.y, 12.5 * s * (1 - t * 0.32), 0.15, pal.primary, pal.core, env * 0.94, screenAngle + 0.78, 4);
      break;
    }

    // 3. ELITE IRON BULWARK — 3-Plate Geodesic Bastion Surge Fan
    case 'elite_fortified_bulwark_slam': {
      const surge = ease * 12 * s;
      // 3 staggered hexagonal bastion armor plates surging forward in an arc
      for (const offset of [-1, 0, 1]) {
        const px = tp.x + ux * (surge - Math.abs(offset) * 4 * s) + nx * offset * (10 + ease * 5) * s;
        const py = tp.y + uy * (surge - Math.abs(offset) * 4 * s) + ny * offset * (10 + ease * 5) * s;
        drawGeodesicHexPlate(ctx, px, py, (8.2 - Math.abs(offset) * 1.4) * s, (10.2 - Math.abs(offset) * 1.6) * s, {
          rotation: screenAngle + offset * 0.28,
          color: offset === 0 ? pal.secondary : pal.primary,
          secondaryColor: pal.primary,
          coreColor: pal.core,
          fillAlpha: env * 0.24,
          strokeAlpha: env * 0.95,
          lineWidth: 1.9 * s,
        });
      }
      drawKineticShockCone(ctx, tp.x + ux * 2 * s, tp.y + uy * 2 * s, screenAngle, (16 + ease * 15) * s, {
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.9,
        spread: 0.9,
        lineWidth: 3.0 * s * (1 - t * 0.4),
      });
      break;
    }

    // 4. SWIFT CAVALRY — Helical 3-Ring Wind-Vortex Lance Thrust
    case 'gale_lance_thrust': {
      const thrustExtend = (24 + ease * 18) * s;
      const startX = sp.x - ux * 6 * s;
      const startY = sp.y - uy * 6 * s;
      const tipX = tp.x + ux * thrustExtend * 0.65;
      const tipY = tp.y + uy * thrustExtend * 0.65;

      // Razor emerald-cyan piercing lance shaft
      drawTaperedNeedle(ctx, startX, startY, tipX, tipY, {
        width: 5.6 * s * (1 - t * 0.38),
        color: pal.primary,
        coreColor: pal.core,
        alpha: env * 0.96,
        peakRatio: 0.72,
      });

      // 3 expanding wind-vortex compression rings spaced along the spear path!
      for (let r = 0; r < 3; r += 1) {
        const u = 0.28 + r * 0.26;
        const rx = startX + (tipX - startX) * u;
        const ry = startY + (tipY - startY) * u;
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(screenAngle);
        drawEllipticalHalo(ctx, 0, 0, (2.2 + ease * 1.5) * s, (6.5 + r * 2.2 + ease * 4.5) * s, {
          lineWidth: (1.7 - r * 0.25) * s,
          color: r === 1 ? pal.secondary : pal.primary,
          coreColor: pal.core,
          alpha: env * (0.9 - r * 0.14),
        });
        ctx.restore();
      }

      // Twin peeling aerodynamic slipstream ribbons
      for (const sideSign of [-1, 1]) {
        const bow = sideSign * (11 + ease * 7) * s;
        const p0 = { x: startX, y: startY };
        const p1 = { x: tp.x + nx * bow, y: tp.y + ny * bow };
        const p2 = { x: tipX + nx * bow * 0.55, y: tipY + ny * bow * 0.55 };
        drawAnalyticalRibbon(ctx, (u) => sampleQuadBezier(p0, p1, p2, u), {
          steps: 18,
          maxWidth: 2.8 * s * (1 - t * 0.4),
          color: sideSign > 0 ? pal.secondary : pal.primary,
          coreColor: pal.core,
          alpha: env * 0.84,
          taperProfile: 'comet',
          coreRatio: 0.45,
          glowAlpha: 0.18,
        });
      }
      drawStarFlare(ctx, tp.x, tp.y, 11.5 * s * (1 - t * 0.35), 0.14, pal.secondary, pal.core, env * 0.94, screenAngle + Math.PI * 0.25, 4);
      break;
    }

    // 5. ELITE STORM LANCER — Branching Twin-Arc Voltaic Lightning Lance
    case 'elite_storm_lightning_lance': {
      const thrustExtend = (26 + ease * 18) * s;
      const tipX = tp.x + ux * thrustExtend * 0.65;
      const tipY = tp.y + uy * thrustExtend * 0.65;

      drawTaperedNeedle(ctx, sp.x, sp.y, tipX, tipY, {
        width: 7.2 * s * (1 - t * 0.38),
        color: pal.primary,
        coreColor: pal.core,
        alpha: env * 0.96,
        peakRatio: 0.72,
      });

      // Twin opposing branching lightning arcs coiling & snapping along the lance!
      for (const bIdx of [0, 1]) {
        drawSteppedLightningBolt(ctx, sp.x, sp.y, tipX, tipY, {
          segments: 7,
          amplitude: (bIdx === 0 ? 11 : 7) * s,
          width: (bIdx === 0 ? 2.8 : 1.9) * s,
          color: bIdx === 0 ? pal.secondary : pal.primary,
          secondaryColor: pal.primary,
          coreColor: pal.core,
          alpha: env * 0.95,
          seed: (fx.seed || 17) + bIdx * 53,
          stepIndex: Math.floor(t * 5),
        });
      }
      // Crackling discharge branch off target point
      drawSteppedLightningBolt(ctx, tp.x, tp.y, tp.x + nx * 16 * s, tp.y + ny * 16 * s - 8 * s, {
        segments: 4,
        amplitude: 5 * s,
        width: 1.6 * s,
        color: pal.secondary,
        secondaryColor: pal.primary,
        coreColor: pal.core,
        alpha: env * 0.85,
        seed: (fx.seed || 17) + 109,
        stepIndex: Math.floor(t * 5),
      });
      drawStarFlare(ctx, tp.x, tp.y, 14.5 * s * (1 - t * 0.3), 0.14, pal.primary, pal.core, env * 0.96, screenAngle, 4);
      break;
    }

    // 6. RIFT STALKER — 2-Beat Sequential Diagonal X-Claw Laceration + Rift Tear
    case 'rift_claw_xrend': {
      const beat1 = clamp01(t / 0.56);
      const beat2 = clamp01((t - 0.22) / 0.78);
      const len = (20 + ease * 10) * s;

      // Beat 1: Triple-rake diagonal descending slash
      const env1 = smoothWindow(beat1, 0.14, 0.4, 1.0);
      if (env1 > 0.02) {
        const a1 = screenAngle - 0.64;
        const dx1 = Math.cos(a1) * len;
        const dy1 = Math.sin(a1) * len;
        const pnx = -Math.sin(a1);
        const pny = Math.cos(a1);
        for (const rake of [-1, 0, 1]) {
          const off = rake * 4.2 * s;
          drawTaperedNeedle(
            ctx,
            tp.x - dx1 * 0.68 + pnx * off,
            tp.y - dy1 * 0.68 + pny * off,
            tp.x + dx1 * 0.82 + pnx * off,
            tp.y + dy1 * 0.82 + pny * off,
            {
              width: (rake === 0 ? 4.4 : 2.3) * s * (1 - beat1 * 0.35),
              color: rake === 0 ? pal.primary : pal.secondary,
              coreColor: pal.core,
              alpha: env1 * 0.94,
              peakRatio: 0.58,
            },
          );
        }
      }

      // Beat 2: Opposing counter-slash + glowing central rift seam
      if (beat2 > 0.01) {
        const env2 = smoothWindow(beat2, 0.16, 0.38, 1.0);
        const a2 = screenAngle + 0.64;
        const dx2 = Math.cos(a2) * len;
        const dy2 = Math.sin(a2) * len;
        drawTaperedNeedle(ctx, tp.x - dx2 * 0.74, tp.y - dy2 * 0.74, tp.x + dx2 * 0.88, tp.y + dy2 * 0.88, {
          width: 5.0 * s * (1 - beat2 * 0.38),
          color: pal.secondary,
          coreColor: pal.core,
          alpha: env2 * 0.96,
          peakRatio: 0.56,
        });
        drawDiamondPrism(ctx, tp.x, tp.y, 11 * s * env2, 3.2 * s * env2, a2, {
          color: pal.primary,
          secondaryColor: pal.secondary,
          coreColor: pal.core,
          alpha: env2 * 0.92,
        });
      }
      break;
    }

    // 7. VANGUARD BREAKER — Vertical Descending Halberd Chop + Armor-Shatter Shards
    case 'halberd_sunder_chop': {
      const arcR = (19 + ease * 7) * s;
      // Steep vertical descending beveled halberd arc with forged inner notches
      drawBeveledBladeArc(ctx, midX, midY - 5 * s, arcR * 0.94, arcR * 1.24, -1.68, 0.62, {
        maxWidth: 8.2 * s * (1 - t * 0.34),
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.96,
        rotation: screenAngle * 0.28,
        steps: 24,
        detail: 'rune_ticks',
        detailCount: 5,
      });

      // Dramatic horizontal armor-sunder split + flying diamond armor shards at chest height!
      const splitSpan = (12 + ease * 15) * s;
      for (const dir of [-1, 1]) {
        drawPrecisionChevron(ctx, tp.x + dir * splitSpan * 0.52, tp.y, dir > 0 ? 0 : Math.PI, {
          halfHeight: 7.5 * s * (1 - t * 0.3),
          depth: 6.2 * s,
          thickness: 1.9 * s,
          color: pal.secondary,
          secondaryColor: pal.primary,
          coreColor: pal.core,
          alpha: env * 0.9,
        });
        drawDiamondPrism(ctx, tp.x + dir * splitSpan, tp.y - 4 * s + ease * 6 * s, 4.4 * s, 2.2 * s, dir * 0.45, {
          color: pal.primary,
          secondaryColor: pal.secondary,
          coreColor: pal.core,
          alpha: env * 0.9,
        });
      }
      drawStarFlare(ctx, tp.x, tp.y, 13 * s * (1 - t * 0.3), 0.14, pal.secondary, pal.core, env * 0.95, 0, 4);
      break;
    }

    // 8. ABYSSAL RAVAGER — 2-Beat Crossed Diagonal Serrated Saw-Fang Combo
    case 'abyssal_twin_sawfang': {
      for (let k = 0; k < 2; k += 1) {
        const localT = clamp01((t - k * 0.16) / (1 - k * 0.16));
        if (localT <= 0.01) continue;
        const lEnv = smoothWindow(localT, 0.14, 0.34, 1.0);
        const r = (18 + k * 4.5 + easeOutCubic(localT) * 7.5) * s;
        drawBeveledBladeArc(
          ctx,
          tp.x - ux * (k === 0 ? 4 : -2) * s,
          tp.y + (k === 0 ? -5 : 5) * s,
          r,
          r * 0.78,
          k === 0 ? -1.45 : -0.65,
          k === 0 ? 0.65 : 1.45,
          {
            maxWidth: (7.4 - k * 0.7) * s * (1 - localT * 0.34),
            color: k === 0 ? pal.primary : pal.secondary,
            secondaryColor: pal.spark,
            coreColor: pal.core,
            alpha: lEnv * 0.96,
            rotation: screenAngle + (k === 0 ? -0.58 : 0.58),
            steps: 22,
            detail: 'serrated',
            detailCount: 6,
          },
        );
      }
      drawStarFlare(ctx, tp.x, tp.y, 13.5 * s * (1 - t * 0.3), 0.16, pal.secondary, pal.core, env * 0.94, screenAngle + 0.78, 4);
      break;
    }

    // 9. ELITE ABYSSAL EXECUTIONER — 3-Beat Opposing Flank Rends + Vertical Guillotine Execution
    case 'elite_executioner_triple_rend': {
      const beats = [
        { delay: 0.0, rot: -0.72, ox: -5, a0: -1.25, a1: 0.9, col: pal.primary },
        { delay: 0.16, rot: 0.72, ox: 5, a0: -0.9, a1: 1.25, col: pal.secondary },
      ];
      for (let k = 0; k < beats.length; k += 1) {
        const b = beats[k];
        const lt = clamp01((t - b.delay) / (1 - b.delay));
        if (lt <= 0.01) continue;
        const r = (19 + k * 3.5 + easeOutCubic(lt) * 7) * s;
        drawBeveledBladeArc(ctx, tp.x + ux * b.ox * s, tp.y, r, r * 0.76, b.a0, b.a1, {
          maxWidth: 6.8 * s * (1 - lt * 0.36),
          color: b.col,
          secondaryColor: pal.spark,
          coreColor: pal.core,
          alpha: smoothWindow(lt, 0.12, 0.32, 1.0) * 0.94,
          rotation: screenAngle + b.rot,
          steps: 20,
          detail: 'serrated',
          detailCount: 6,
        });
      }
      // Beat 3: Decisive vertical guillotine execution seam + horizontal severing pressure ring!
      const gT = clamp01((t - 0.3) / 0.7);
      if (gT > 0.01) {
        const gEnv = smoothWindow(gT, 0.14, 0.38, 1.0);
        drawTaperedNeedle(ctx, tp.x, tp.y - (30 + easeOutCubic(gT) * 8) * s, tp.x, tp.y + (22 + easeOutCubic(gT) * 6) * s, {
          width: 7.5 * s * (1 - gT * 0.38),
          color: pal.primary,
          coreColor: pal.core,
          alpha: gEnv * 0.98,
          peakRatio: 0.52,
        });
        drawEllipticalHalo(ctx, tp.x, tp.y, (14 + easeOutCubic(gT) * 14) * s, (4.5 + easeOutCubic(gT) * 4) * s, {
          lineWidth: 2.0 * s * (1 - gT * 0.4),
          color: pal.secondary,
          coreColor: pal.core,
          alpha: gEnv * 0.9,
        });
        drawStarFlare(ctx, tp.x, tp.y, 17 * s * gEnv, 0.12, pal.secondary, pal.core, gEnv * 0.98, 0, 4);
      }
      break;
    }

    // 10. ASTRAL AUTOMATON — Precision 155° Mechanical Twin-Rail Cleave (ZERO ground cracks!)
    case 'automaton_rail_cleave': {
      const cleaveR = (22 + ease * 11) * s;
      // Wide gilded mechanical rail blade with precision circuit ticks & node dots
      drawBeveledBladeArc(ctx, midX, midY, cleaveR, cleaveR * 0.72, -1.38, 1.38, {
        maxWidth: 8.8 * s * (1 - t * 0.35),
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.96,
        rotation: screenAngle,
        steps: 26,
        detail: 'circuit',
        detailCount: 7,
      });
      // Counter-sweeping electric-blue inner plasma rail arc
      drawBeveledBladeArc(ctx, midX, midY, cleaveR * 0.72, cleaveR * 0.52, -1.12, 1.12, {
        maxWidth: 3.8 * s * (1 - t * 0.4),
        color: pal.secondary,
        secondaryColor: pal.core,
        coreColor: pal.core,
        alpha: env * 0.88,
        rotation: screenAngle,
        steps: 20,
      });
      drawSoftBloom(ctx, tp.x, tp.y, 18 * s, pal.core, pal.primary, env * 0.48);
      drawStarFlare(ctx, tp.x, tp.y, 14 * s * (1 - t * 0.35), 0.16, pal.secondary, pal.core, env * 0.94, 0, 4);
      break;
    }

    // 11 & 12. SIEGE JUGGERNAUT & COLOSSUS — Molten Overhead Piston / Tectonic Hammer Crush
    case 'juggernaut_magma_crush':
    case 'elite_colossus_tectonic_crush': {
      const isColossus = style === 'elite_colossus_tectonic_crush';
      const smashR = (18 + ease * 8.5) * s;
      drawBeveledBladeArc(ctx, tp.x - ux * 5 * s, tp.y - 2 * s, smashR * 0.96, smashR * 0.88, -1.74, 0.44, {
        maxWidth: (isColossus ? 10 : 8.2) * s * (1 - t * 0.34),
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.96,
        rotation: screenAngle * 0.2,
        steps: 24,
        detail: 'rune_ticks',
        detailCount: isColossus ? 6 : 4,
      });
      drawKineticShockCone(ctx, tp.x, tp.y + 2 * s, screenAngle, (16 + ease * 11) * s, {
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.88,
        spread: 0.86,
        lineWidth: (isColossus ? 3.2 : 2.5) * s * (1 - t * 0.4),
      });
      // Rising molten lava vent spire
      drawTaperedBeamSpire(ctx, tp.x, tp.y + 8 * s, tp.y - (20 + ease * 11) * s, {
        baseWidth: (isColossus ? 15 : 11) * s * (1 - t * 0.42),
        topWidth: 2.2 * s,
        tipHeight: 10 * s,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.78,
        mode: 'lance',
      });
      drawSoftBloom(ctx, tp.x, tp.y, 19 * s, pal.core, pal.primary, env * 0.56);
      break;
    }

    // 13. BOSS BASTION WARDEN VEX — Regal Gilded Citadel Hammer + 4 Orbiting Hex Plates
    case 'boss_vex_citadel_hammer': {
      const r = (21 + ease * 10) * s;
      drawBeveledBladeArc(ctx, midX, midY - 2 * s, r * 0.96, r * 0.88, -1.75, 0.54, {
        maxWidth: 10.2 * s * (1 - t * 0.34),
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.96,
        rotation: screenAngle * 0.22,
        steps: 26,
        detail: 'circuit',
        detailCount: 7,
      });
      // 4 royal gilded geodesic citadel barrier plates flaring outward around impact
      const plateOrbit = (12 + ease * 15) * s;
      for (let i = 0; i < 4; i += 1) {
        const a = screenAngle + (i * Math.PI) / 2 + Math.PI / 4;
        const px = tp.x + Math.cos(a) * plateOrbit;
        const py = tp.y + Math.sin(a) * plateOrbit * 0.72;
        drawGeodesicHexPlate(ctx, px, py, 7.2 * s, 7.2 * s, {
          rotation: a + t * 0.8,
          color: pal.primary,
          secondaryColor: pal.secondary,
          coreColor: pal.core,
          fillAlpha: env * 0.22,
          strokeAlpha: env * 0.94,
          lineWidth: 1.75 * s,
        });
      }
      drawStarFlare(ctx, tp.x, tp.y, 18 * s * (1 - t * 0.28), 0.15, pal.primary, pal.core, env * 0.96, 0, 8);
      break;
    }

    // 14. BOSS OBSIDIAN SOVEREIGN MALAKOR — Rune Greatsword Wave + Delayed Dimensional Cross-Slit
    case 'boss_malakor_sovereign_cleave': {
      const r = (26 + ease * 12) * s;
      // Beat 1: Immense obsidian-crimson rune-inscribed greatsword sweep
      drawBeveledBladeArc(ctx, midX, midY, r, r * 0.72, -1.44, 1.44, {
        maxWidth: 11.2 * s * (1 - t * 0.34),
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.96,
        rotation: screenAngle,
        steps: 28,
        detail: 'rune_ticks',
        detailCount: 8,
      });
      drawBeveledBladeArc(ctx, midX, midY, r * 0.7, r * 0.5, -1.2, 1.2, {
        maxWidth: 4.8 * s * (1 - t * 0.4),
        color: pal.glow,
        secondaryColor: pal.primary,
        coreColor: pal.core,
        alpha: env * 0.86,
        rotation: screenAngle,
        steps: 20,
      });

      // Beat 2: Delayed dimensional crimson-white cross-slit tearing open on target!
      const slitT = clamp01((t - 0.26) / 0.74);
      if (slitT > 0.01) {
        const slitEnv = smoothWindow(slitT, 0.16, 0.36, 1.0);
        const slen = (24 + easeOutCubic(slitT) * 14) * s;
        for (const ang of [screenAngle - 0.42, screenAngle + 0.95]) {
          drawTaperedNeedle(
            ctx,
            tp.x - Math.cos(ang) * slen * 0.8,
            tp.y - Math.sin(ang) * slen * 0.8,
            tp.x + Math.cos(ang) * slen * 0.8,
            tp.y + Math.sin(ang) * slen * 0.8,
            {
              width: 5.5 * s * (1 - slitT * 0.4),
              color: pal.primary,
              coreColor: pal.core,
              alpha: slitEnv * 0.98,
              peakRatio: 0.5,
            },
          );
        }
        drawStarFlare(ctx, tp.x, tp.y, 17 * s * slitEnv, 0.14, pal.secondary, pal.core, slitEnv * 0.96, screenAngle, 4);
      }
      break;
    }

    // 15. BOSS ASTRAL DREADNOUGHT HYPERION — Plasma Cleave + Helical Reactor Pillar
    case 'boss_hyperion_plasma_cataclysm': {
      const r = (25 + ease * 12) * s;
      drawBeveledBladeArc(ctx, midX, midY, r, r * 0.68, -1.42, 1.42, {
        maxWidth: 11.2 * s * (1 - t * 0.34),
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.96,
        rotation: screenAngle,
        steps: 26,
        detail: 'circuit',
        detailCount: 7,
      });
      // Helical plasma reactor ribbons spiraling up around thermal spire
      const spireH = (32 + ease * 16) * s;
      drawTaperedBeamSpire(ctx, tp.x, tp.y + 8 * s, tp.y - spireH, {
        baseWidth: 18 * s * (1 - t * 0.42),
        topWidth: 3.5 * s,
        tipHeight: 13 * s,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.84,
        mode: 'lance',
      });
      drawAnalyticalRibbon(
        ctx,
        (u) => sampleHelixArc(tp.x, tp.y + 8 * s, spireH * 1.05, 12 * s, t * 5.2, 1.4, u),
        {
          steps: 20,
          maxWidth: 3.8 * s * (1 - t * 0.35),
          color: pal.secondary,
          coreColor: pal.core,
          alpha: env * 0.88,
          taperProfile: 'taper_out',
          coreRatio: 0.45,
          glowAlpha: 0.22,
        },
      );
      drawSoftBloom(ctx, tp.x, tp.y, 24 * s, pal.core, pal.primary, env * 0.58);
      drawStarFlare(ctx, tp.x, tp.y, 19 * s * (1 - t * 0.3), 0.16, pal.secondary, pal.core, env * 0.96, t * 0.8, 8);
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

  const baseP = bf.worldToScreen(fx.x, fx.y, w, h, 3.0);
  const liveTarget = isLaserImpact
    ? resolveLiveTargetScreenPoint(bf, w, h, targetUnit, fx.x, fx.y)
    : null;
  const p = liveTarget ? { x: liveTarget.x, y: liveTarget.y, scale: baseP.scale } : baseP;
  const gp = liveTarget
    ? { x: liveTarget.groundX, y: liveTarget.groundY, scale: baseP.scale, scaleX: baseP.scaleX, scaleY: baseP.scaleY }
    : bf.worldToScreen(fx.x, fx.y, w, h, 0);

  const s = Math.max(0.74, Math.min(1.55, (baseP.scale / 8.0) * (fx.scale || profile.scale || 1)));
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
      const worldR = Math.max(5.5, fx.radius || 7.2);
      const rx = worldR * (gp.scaleX ?? gp.scale * 0.88) * (0.5 + ease * 0.56);
      const ry = worldR * (gp.scaleY ?? gp.scale * 0.48) * (0.5 + ease * 0.56);
      drawSoftBloom(ctx, gp.x, gp.y, rx * 1.1, pal.secondary, pal.glow, env * 0.34, ry / Math.max(1, rx));
      drawSymmetricalSigilRing(ctx, gp.x, gp.y, rx, ry, {
        count: 6,
        arcFill: 0.64,
        rotation: t * 1.3,
        lineWidth: 2.1 * s * (1 - t * 0.4),
        color: pal.primary,
        coreColor: pal.core,
        alpha: env * 0.88,
        tickStyle: 'compass',
        tickLength: 0.24,
        innerRingRatio: 0.58,
        innerAlpha: 0.6,
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
      const baseRx = isBoss ? worldR * (gp.scaleX ?? gp.scale * 0.88) : 17 * s;
      const baseRy = isBoss ? worldR * (gp.scaleY ?? gp.scale * 0.48) : 8.5 * s;
      const snap = t < 0.35 ? 1.24 - (t / 0.35) * 0.3 : 0.94 + ((t - 0.35) / 0.65) * 0.16;
      drawClockfaceDial(ctx, gp.x, gp.y, baseRx * snap, baseRy * snap, {
        rotation: -t * 1.5,
        handAngle1: -Math.PI * 0.5 + t * 2.2,
        handAngle2: Math.PI * 0.25 - t * 3.2,
        color: pal.primary,
        secondaryColor: pal.spark || pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.9,
        lineWidth: (isBoss ? 2.1 : 1.5) * s,
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
      drawSoftBloom(ctx, p.x, p.y, 12.5 * s, pal.core, pal.primary, env * 0.5);
      // Focused pass-through crystalline piercing line + crisp diamond ring
      drawTaperedNeedle(
        ctx,
        p.x - ux * 7 * s,
        p.y - uy * 7 * s,
        p.x + ux * (15 + ease * 13) * s,
        p.y + uy * (15 + ease * 13) * s,
        {
          width: 3.2 * s * (1 - t * 0.45),
          color: pal.primary,
          coreColor: pal.core,
          alpha: env * 0.94,
          peakRatio: 0.45,
        },
      );
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      drawEllipticalHalo(ctx, 0, 0, 2.5 * s, (7 + ease * 8) * s, {
        lineWidth: 1.4 * s * (1 - t * 0.4),
        color: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.84,
      });
      ctx.restore();
      drawStarFlare(ctx, p.x, p.y, (11.5 + (1 - t) * 4) * s, 0.15, pal.secondary, pal.core, env * 0.96, angle, 4);
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
      const r = (16 + ease * 18) * s;
      const hPillar = (30 + ease * 18) * s;
      drawSoftBloom(ctx, p.x, p.y, r * 1.15, pal.core, pal.primary, env * 0.56);
      drawEllipticalHalo(ctx, p.x, p.y + 4 * s, r * 1.15, r * 0.56, {
        lineWidth: 2.0 * s * (1 - t * 0.45),
        color: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.85,
      });
      drawTaperedBeamSpire(ctx, p.x, p.y + 8 * s, p.y - hPillar, {
        baseWidth: 16 * s * (1 - t * 0.45),
        topWidth: 2.5 * s,
        tipHeight: 11 * s,
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.78,
        mode: 'lance',
      });
      drawAnalyticalRibbon(ctx, (u) => sampleHelixArc(p.x, p.y + 6 * s, hPillar * 0.95, 10 * s, t * 5.0, 1.3, u), {
        steps: 18,
        maxWidth: 3.4 * s * (1 - t * 0.4),
        color: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.88,
        taperProfile: 'taper_out',
        coreRatio: 0.45,
        glowAlpha: 0.2,
      });
      drawStarFlare(ctx, p.x, p.y, (15.5 + ease * 6) * s, 0.18, pal.secondary, pal.core, env * 0.95, t * 0.8, 8);
      break;
    }

    case 'mortar_shrapnel_crater': {
      // Fierce directional artillery shrapnel fan + overhead blast ring
      drawSoftBloom(ctx, p.x, p.y, (18 + ease * 16) * s, pal.core, pal.primary, env * 0.58);
      const spikes = 7;
      const rng = createDetRng(fx.seed || 73);
      for (let i = 0; i < spikes; i += 1) {
        const a = -Math.PI * 0.92 + (i / (spikes - 1)) * Math.PI * 0.84 + (rng() - 0.5) * 0.14;
        const len = (15 + ease * 19 + rng() * 6) * s;
        drawTaperedNeedle(ctx, p.x, p.y + 4 * s, p.x + Math.cos(a) * len, p.y + 4 * s + Math.sin(a) * len, {
          width: 3.8 * s * (1 - t * 0.45),
          color: i % 2 === 0 ? pal.primary : pal.secondary,
          coreColor: pal.core,
          alpha: env * 0.92,
          peakRatio: 0.36,
        });
      }
      drawKineticShockCone(ctx, p.x, p.y + 2 * s, -Math.PI * 0.5, (14 + ease * 15) * s, {
        color: pal.primary,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.82,
        spread: 1.05,
        lineWidth: 2.2 * s,
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
      const r = (isBoss ? 23 : 14) * s;
      drawSoftBloom(ctx, p.x, p.y, r * 1.1, pal.core, pal.primary, env * 0.48);
      drawClockfaceDial(ctx, p.x, p.y, r * (1.1 - ease * 0.15), r * (1.1 - ease * 0.15), {
        rotation: -t * 1.4,
        handAngle1: -Math.PI * 0.5 + t * 2.5,
        handAngle2: Math.PI * 0.2 - t * 3.8,
        color: pal.primary,
        secondaryColor: pal.spark || pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.94,
        lineWidth: (isBoss ? 2.1 : 1.55) * s,
      });
      drawStarFlare(ctx, p.x, p.y, (isBoss ? 15 : 9) * s * (1 - t * 0.3), 0.18, pal.secondary, pal.core, env * 0.92, -t, 4);
      break;
    }

    case 'stasis_crystal_cage': {
      const r = (15 - ease * 4.5) * s;
      const pts = [];
      for (let i = 0; i < 4; i += 1) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        const cx = p.x + Math.cos(a) * r;
        const cy = p.y + Math.sin(a) * r;
        pts.push({ x: cx, y: cy });
        drawDiamondPrism(ctx, cx, cy, 5.8 * s, 2.6 * s, a, {
          color: pal.primary,
          secondaryColor: pal.secondary,
          coreColor: pal.core,
          alpha: env * 0.94,
        });
      }
      // Connecting crystalline cage wireframe
      ctx.save();
      ctx.strokeStyle = withAlpha(pal.secondary, env * 0.72);
      ctx.lineWidth = 1.1 * s;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < 4; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      drawStarFlare(ctx, p.x, p.y, 10 * s * (1 - t * 0.3), 0.2, pal.secondary, pal.core, env * 0.9, 0, 4);
      break;
    }

    case 'cryo_snowflake_shatter': {
      drawSoftBloom(ctx, p.x, p.y, 14.5 * s, pal.core, pal.primary, env * 0.5);
      for (let i = 0; i < 6; i += 1) {
        const a = (i * Math.PI) / 3 + 0.25;
        const inner = (3.5 + ease * 4) * s;
        const outer = (11 + ease * 11.5) * s;
        drawFacetedIceSpire(
          ctx,
          p.x + Math.cos(a) * ((inner + outer) * 0.5),
          p.y + Math.sin(a) * ((inner + outer) * 0.5),
          a,
          (outer - inner) * 1.05,
          2.2 * s * (1 - t * 0.35),
          {
            color: pal.primary,
            secondaryColor: pal.secondary,
            coreColor: pal.core,
            alpha: env * 0.94,
          },
        );
      }
      drawStarFlare(ctx, p.x, p.y, 10.5 * s * (1 - t * 0.35), 0.16, pal.primary, pal.core, env * 0.96, 0.25, 6);
      break;
    }

    case 'banner_slash_flash': {
      const len = (22 + ease * 12) * s;
      drawSoftBloom(ctx, p.x, p.y, 14 * s, pal.core, pal.secondary, env * 0.48);
      drawBeveledBladeArc(ctx, p.x - ux * 3 * s, p.y - uy * 3 * s, (13.5 + ease * 7) * s, (10.5 + ease * 5) * s, -0.95, 0.95, {
        maxWidth: 5.4 * s * (1 - t * 0.4),
        color: pal.secondary,
        secondaryColor: pal.primary,
        coreColor: pal.core,
        alpha: env * 0.94,
        rotation: angle,
        steps: 18,
        detail: 'rune_ticks',
        detailCount: 4,
      });
      drawTaperedNeedle(ctx, p.x - ux * len * 0.55, p.y - uy * len * 0.28, p.x + ux * len * 0.9, p.y + uy * len * 0.28, {
        width: 5.2 * s * (1 - t * 0.4),
        color: pal.primary,
        coreColor: pal.core,
        alpha: env * 0.95,
        peakRatio: 0.52,
      });
      drawStarFlare(ctx, p.x, p.y, 13 * s * (1 - t * 0.35), 0.16, pal.secondary, pal.core, env * 0.94, angle, 4);
      break;
    }

    case 'boss_prism_star_nova': {
      const r = (18 + ease * 16) * s;
      drawSoftBloom(ctx, p.x, p.y, r * 1.15, pal.core, pal.primary, env * 0.58);
      drawStarFlare(ctx, p.x, p.y, r * 0.95, 0.16, pal.primary, pal.core, env * 0.96, t * 0.9, 8);
      for (let i = 0; i < 5; i += 1) {
        const a = (i * Math.PI * 2) / 5 + t * 1.4;
        drawDiamondPrism(ctx, p.x + Math.cos(a) * r * 0.72, p.y + Math.sin(a) * r * 0.58, 6.4 * s, 2.8 * s, a, {
          color: i % 2 === 0 ? pal.secondary : pal.primary,
          secondaryColor: pal.core,
          coreColor: pal.core,
          alpha: env * 0.92,
        });
      }
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
  const p = bf.worldToScreen(fx.x, fx.y, w, h, 3.4);
  const s = Math.max(0.75, Math.min(1.4, p.scale / 8.0));
  const env = smoothWindow(t, 0.12, 0.25, 1.0);
  if (env <= 0.01) return;

  const angle = fx.angle || 0;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const isCrit = Boolean(fx.isCrit);
  const isShielded = Boolean(fx.meta?.absorbed > 0);

  if (isShielded) {
    drawGeodesicHexPlate(ctx, p.x - ux * 4 * s, p.y - uy * 4 * s, (10 + t * 8) * s, (10 + t * 8) * s, {
      rotation: angle,
      color: '#38bdf8',
      secondaryColor: '#bae6fd',
      coreColor: '#f0f9ff',
      fillAlpha: env * 0.14,
      strokeAlpha: env * 0.92,
      lineWidth: 1.8 * s,
    });
    return;
  }

  if (isCrit) {
    drawSoftBloom(ctx, p.x, p.y, 15.5 * s, '#fffbeb', '#fbbf24', env * 0.54);
    drawStarFlare(ctx, p.x, p.y, (14.5 + t * 5) * s, 0.14, '#fbbf24', '#ffffff', env * 0.98, angle + 0.3, 4);
  } else {
    drawTaperedNeedle(
      ctx,
      p.x - ux * 5 * s,
      p.y - uy * 5 * s,
      p.x + ux * (8.5 + t * 7) * s,
      p.y + uy * (8.5 + t * 7) * s,
      {
        width: 2.3 * s * (1 - t * 0.5),
        color: pal.primary,
        coreColor: pal.core,
        alpha: env * 0.84,
        peakRatio: 0.4,
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
  const sp = bf.worldToScreen(fx.x, fx.y, w, h, 3.2);
  const ease = easeOutQuart(t);
  const env = smoothWindow(t, 0.12, 0.38, 1.0);
  if (env <= 0.01) return;

  const s = Math.max(0.75, Math.min(1.65, (gp.scale / 8.0) * (fx.scale || profile.scale || 1)));
  const worldR = Math.max(7, fx.radius || 14);
  const rx = worldR * (gp.scaleX ?? gp.scale * 0.88) * (0.32 + ease * 0.75);
  const ry = worldR * (gp.scaleY ?? gp.scale * 0.48) * (0.32 + ease * 0.75);
  const kind = fx.meta?.abilityKind || 'aoe_damage';
  const abId = fx.meta?.abilityId || '';
  const pid = profile?.id || fx.profileId || '';
  const abColor = fx.color || pal.primary;

  // ---------------- GROUND LAYER ----------------
  if (layer === 'ground') {
    if (abId === 'unit_solar_flare' || abId === 'boss_orbital_cataclysm') {
      const isBoss = abId === 'boss_orbital_cataclysm';
      // 3 expanding concentric radiant sunlight waves
      for (let wIdx = 0; wIdx < 3; wIdx += 1) {
        const wt = clamp01((t - wIdx * 0.12) / (1 - wIdx * 0.12));
        if (wt <= 0.01) continue;
        const wr = (0.28 + easeOutCubic(wt) * 0.78) * (isBoss ? rx * 1.15 : rx);
        const wy = wr * (ry / Math.max(1, rx));
        drawEllipticalHalo(ctx, gp.x, gp.y, wr, wy, {
          lineWidth: (isBoss ? 2.8 : 2.1) * s * (1 - wt * 0.5),
          color: wIdx === 1 ? pal.secondary : abColor,
          coreColor: pal.core,
          alpha: (1 - wt) * 0.9,
        });
      }
      drawSymmetricalSigilRing(ctx, gp.x, gp.y, rx * 0.88, ry * 0.88, {
        count: 8,
        arcFill: 0.58,
        rotation: t * 1.8,
        lineWidth: 2.0 * s,
        color: abColor,
        coreColor: pal.core,
        alpha: env * 0.85,
        tickStyle: 'compass',
      });
      if (isBoss) {
        drawRadialGroundCracks(ctx, gp.x, gp.y, rx * 0.92, ry * 0.92, {
          count: 8,
          seed: fx.seed || 77,
          color: abColor,
          coreColor: pal.core,
          alpha: env * 0.82,
          lineWidth: 2.0 * s,
        });
      }
      return;
    }

    if (abId === 'unit_chrono_snare' || abId === 'boss_temporal_collapse' || abId === 'boss_phase_mend') {
      const isBoss = abId === 'boss_temporal_collapse';
      const isMend = abId === 'boss_phase_mend';
      const spinDir = isMend ? -1 : 1;
      // Layered counter-rotating Roman clockface ground dials
      drawSoftBloom(ctx, gp.x, gp.y, rx * 0.95, pal.core, abColor, env * 0.28, ry / Math.max(1, rx));
      drawClockfaceDial(ctx, gp.x, gp.y, rx, ry, {
        rotation: t * 1.4 * spinDir,
        handAngle1: -Math.PI * 0.5 + t * 4.5 * spinDir,
        handAngle2: Math.PI * 0.2 - t * 2.2 * spinDir,
        color: abColor,
        secondaryColor: pal.spark || pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.92,
        lineWidth: (isBoss ? 2.4 : 1.8) * s,
      });
      drawClockfaceDial(ctx, gp.x, gp.y, rx * 0.62, ry * 0.62, {
        rotation: -t * 2.2 * spinDir,
        handAngle1: t * 3.0 * spinDir,
        handAngle2: -t * 5.0 * spinDir,
        color: pal.secondary,
        secondaryColor: pal.core,
        coreColor: pal.core,
        alpha: env * 0.85,
        lineWidth: 1.4 * s,
      });
      return;
    }

    if (abId === 'enemy_tremor_slam') {
      drawSoftBloom(ctx, gp.x, gp.y, rx, pal.secondary, abColor, env * 0.34, ry / Math.max(1, rx));
      drawRadialGroundCracks(ctx, gp.x, gp.y, rx * 0.95, ry * 0.95, {
        count: 7,
        seed: fx.seed || 51,
        color: abColor,
        coreColor: pal.core,
        alpha: env * 0.88,
        lineWidth: 2.1 * s,
      });
      drawEllipticalHalo(ctx, gp.x, gp.y, rx, ry, {
        lineWidth: 2.5 * s * (1 - t * 0.4),
        color: abColor,
        coreColor: pal.core,
        alpha: env * 0.85,
      });
      return;
    }

    if (abId === 'unit_aegis_pulse' || abId === 'boss_aegis_shell' || abId === 'mod_ability_bulwark_aura') {
      drawSoftBloom(ctx, gp.x, gp.y, rx * 0.9, pal.core, abColor, env * 0.22, ry / Math.max(1, rx));
      drawSymmetricalSigilRing(ctx, gp.x, gp.y, rx, ry, {
        count: 6,
        arcFill: 0.72,
        rotation: t * 0.9,
        lineWidth: 2.2 * s * (1 - t * 0.35),
        color: abColor,
        coreColor: pal.core,
        alpha: env * 0.9,
        tickStyle: 'diamond',
        innerRingRatio: 0.66,
        innerAlpha: 0.65,
      });
      return;
    }

    if (abId === 'unit_flank_surge' || abId === 'enemy_dread_rally' || abId === 'boss_war_banner' || abId === 'mod_ability_warlord_aura') {
      for (let rIdx = 0; rIdx < 2; rIdx += 1) {
        const rr = rx * (0.55 + rIdx * 0.38);
        const rry = ry * (0.55 + rIdx * 0.38);
        drawEllipticalHalo(ctx, gp.x, gp.y, rr, rry, {
          lineWidth: (2.2 - rIdx * 0.6) * s,
          color: rIdx === 0 ? abColor : pal.secondary,
          coreColor: pal.core,
          alpha: env * (0.9 - rIdx * 0.2),
        });
      }
      return;
    }

    // Default structured ground sigil for remaining abilities
    drawSoftBloom(ctx, gp.x, gp.y, rx * 0.95, pal.core, abColor, env * 0.25, ry / Math.max(1, rx));
    drawSymmetricalSigilRing(ctx, gp.x, gp.y, rx, ry, {
      count: kind === 'ally_barrier' || kind === 'self_defense' ? 6 : 4,
      arcFill: 0.66,
      rotation: t * 1.4,
      lineWidth: 2.3 * (1 - t * 0.4),
      color: abColor,
      coreColor: pal.core,
      alpha: env * 0.88,
      tickStyle: kind === 'aoe_damage' || kind === 'drain_aoe' ? 'compass' : 'diamond',
      innerRingRatio: 0.64,
      innerAlpha: 0.55,
    });
    return;
  }

  // ---------------- SKY LAYER (All 24 Signature Skill VFX) ----------------

  // 1. SOLAR PYROMANCER — Volumetric Miniature Sun + Curved Prominence Loops + Expanding Corona
  if (abId === 'unit_solar_flare') {
    const sunY = sp.y - (20 + Math.sin(t * Math.PI) * 14) * s;
    const sunR = (13 + ease * 8) * (1 - Math.max(0, t - 0.72) * 2.5) * s;
    drawSoftBloom(ctx, sp.x, sunY, Math.max(4, sunR * 2.6), pal.core, abColor, env * 0.8);

    // Curved magnetic solar prominence arcs swirling around miniature sun
    for (let i = 0; i < 6; i += 1) {
      const a = (i * Math.PI) / 3 + t * 2.6;
      const loopR = Math.max(5, sunR * (1.35 + 0.35 * ease));
      ctx.save();
      ctx.translate(sp.x, sunY);
      ctx.rotate(a);
      ctx.strokeStyle = withAlpha(i % 2 === 0 ? pal.secondary : abColor, env * 0.9);
      ctx.lineWidth = (3.2 - t * 1.4) * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sunR * 0.45, -sunR * 0.28);
      quadTo(ctx, loopR * 1.3, 0, sunR * 0.45, sunR * 0.28);
      ctx.stroke();
      ctx.restore();
    }

    // Incandescent granulated solar core sphere + bronze astrolabe arc
    if (sunR > 3) {
      const coreG = ctx.createRadialGradient(sp.x - sunR * 0.2, sunY - sunR * 0.2, sunR * 0.1, sp.x, sunY, sunR);
      coreG.addColorStop(0, '#ffffff');
      coreG.addColorStop(0.5, pal.secondary);
      coreG.addColorStop(1, abColor);
      ctx.fillStyle = coreG;
      ctx.beginPath();
      ctx.arc(sp.x, sunY, sunR * 0.78, 0, Math.PI * 2);
      ctx.fill();
    }

    // Concentric volumetric solar flare wave + connecting prominence beam
    drawTaperedBeamSpire(ctx, sp.x, gp.y, sunY, {
      baseWidth: 18 * s * (1 - t * 0.35),
      topWidth: 6 * s,
      tipHeight: 12 * s,
      color: abColor,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: env * 0.84,
      mode: 'lance',
    });
    drawStarFlare(ctx, sp.x, sunY, Math.max(4, sunR * 1.55), 0.16, pal.secondary, '#ffffff', env * 0.98, t * 2, 8);
    return;
  }

  // 2. CHRONO WEAVER & VAEL — Dimensional Astrolabe Rings, Aligned Gears & Time Fractures
  if (abId === 'unit_chrono_snare' || abId === 'boss_temporal_collapse') {
    const isBoss = abId === 'boss_temporal_collapse';
    const dialR = (isBoss ? 36 : 24) * s * (0.7 + ease * 0.35);
    const cy = sp.y - 7 * s;

    // Angled 2.5D tilted temporal astrolabe rings
    for (const tilt of [-0.42, 0.42]) {
      ctx.save();
      ctx.translate(sp.x, cy);
      ctx.rotate(tilt + t * (tilt > 0 ? 1.4 : -1.4));
      drawEllipticalHalo(ctx, 0, 0, dialR * 1.15, dialR * 0.44, {
        lineWidth: (isBoss ? 2.6 : 1.9) * s,
        color: tilt > 0 ? '#e2b75b' : abColor,
        coreColor: pal.core,
        alpha: env * 0.88,
      });
      ctx.restore();
    }

    // 4 luminous brass-cyan astrolabe nodes moving into perimeter alignment
    for (let i = 0; i < 4; i += 1) {
      const a = (i * Math.PI) / 2 + t * (isBoss ? 1.8 : 1.2);
      const gx = sp.x + Math.cos(a) * dialR * 0.95;
      const gy = cy + Math.sin(a) * dialR * 0.65;
      const nodeR = (isBoss ? 5.2 : 3.8) * s;
      drawSoftBloom(ctx, gx, gy, nodeR * 1.9, '#ffffff', abColor, env * 0.45);
      drawStarFlare(ctx, gx, gy, nodeR * 1.35, 0.24, '#e2b75b', '#ffffff', env * 0.95, t * 2.5 + i, 4);
    }

    // Sweeping Roman clockface dial + radial time-fracture shards
    drawClockfaceDial(ctx, sp.x, cy, dialR, dialR * 0.8, {
      rotation: t * 1.6,
      handAngle1: -Math.PI * 0.5 + t * 5.2,
      handAngle2: Math.PI * 0.25 - t * 3.1,
      color: abColor,
      secondaryColor: '#e2b75b',
      coreColor: pal.core,
      alpha: env * 0.96,
      lineWidth: (isBoss ? 2.5 : 1.9) * s,
    });
    for (let k = 0; k < 6; k += 1) {
      const a = (k * Math.PI) / 3 + Math.PI / 6;
      const rIn = dialR * 0.35;
      const rOut = dialR * (0.85 + ease * 0.35);
      drawTaperedNeedle(
        ctx,
        sp.x + Math.cos(a) * rIn,
        cy + Math.sin(a) * rIn * 0.72,
        sp.x + Math.cos(a) * rOut,
        cy + Math.sin(a) * rOut * 0.72,
        {
          width: 2.6 * s * (1 - t * 0.4),
          color: pal.secondary,
          coreColor: '#ffffff',
          alpha: env * 0.92,
          peakRatio: 0.45,
        },
      );
    }
    return;
  }

  // 3. BOSS CHRONO ARBITER VAEL (boss_phase_mend) — Backwards-spinning emerald-gold rewind dial
  if (abId === 'boss_phase_mend') {
    const dialR = 26 * s;
    drawClockfaceDial(ctx, sp.x, sp.y - 8 * s, dialR, dialR * 0.85, {
      rotation: -t * 3.0,
      handAngle1: -t * 7.5,
      handAngle2: -t * 3.8,
      color: '#34d399',
      secondaryColor: '#fde047',
      coreColor: '#ecfdf5',
      alpha: env * 0.95,
      lineWidth: 2.2 * s,
    });
    // Ascending golden rewind hourglass sand particles
    for (let i = 0; i < 6; i += 1) {
      const ox = Math.sin(i * 1.9 + t * 4) * 14 * s;
      const oy = gp.y - ((t * 48 + i * 9) % 42) * s;
      drawDiamondPrism(ctx, sp.x + ox, oy, 3.2 * s, 2.0 * s, 0, {
        color: '#34d399',
        secondaryColor: '#fde047',
        coreColor: '#ffffff',
        alpha: env * 0.9,
      });
    }
    return;
  }

  // 4. HEAVY DEFENDER — 4 interlocking gilded kite-shield battlements around unit
  if (abId === 'unit_bulwark_guard') {
    for (let i = 0; i < 4; i += 1) {
      const a = (i * Math.PI) / 2 + t * 1.1;
      const ox = Math.cos(a) * (17 + ease * 6) * s;
      const oy = Math.sin(a) * (10 + ease * 3) * s;
      drawHexShieldTile(ctx, sp.x + ox, sp.y - 4 * s + oy, 7.5 * s, a, {
        fill: abColor,
        core: pal.core,
        stroke: '#e2b75b',
        alpha: env * 0.92,
      });
    }
    drawStarFlare(ctx, sp.x, sp.y - 4 * s, 14 * s * (1 - t * 0.3), 0.16, '#e2b75b', '#ffffff', env * 0.9, 0, 4);
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

  // 7. AEGIS PULSE (Aegis Sentinel -> geodesic honeycomb barrier; Cryo Warden/Archwarden -> 6-point snowflake crystal burst)
  if (abId === 'unit_aegis_pulse' || abId === 'boss_aegis_shell' || abId === 'mod_ability_bulwark_aura') {
    const isCryo = pid === 'enemy_cryo_warden' || pid === 'elite_cryo_archwarden';
    if (isCryo) {
      for (let i = 0; i < 6; i += 1) {
        const a = (i * Math.PI) / 3 + t * 0.8;
        const d = (12 + ease * 18) * s;
        drawFacetedIceSpire(ctx, sp.x + Math.cos(a) * d, sp.y - 4 * s + Math.sin(a) * d * 0.65, a, 12 * s, 3.0 * s, {
          color: abColor,
          secondaryColor: pal.secondary,
          coreColor: pal.core,
          alpha: env * 0.94,
        });
      }
      drawStarFlare(ctx, sp.x, sp.y - 4 * s, 16 * s * (1 - t * 0.3), 0.16, pal.secondary, '#ffffff', env * 0.95, t, 6);
    } else {
      const plates = abId === 'boss_aegis_shell' ? 6 : 3;
      for (let i = 0; i < plates; i += 1) {
        const a = (i * Math.PI * 2) / plates + t * 0.9;
        const dist = (14 + ease * 16) * s;
        drawGeodesicHexPlate(ctx, sp.x + Math.cos(a) * dist, sp.y - 4 * s + Math.sin(a) * dist * 0.6, 10 * s, 10 * s, {
          rotation: a,
          color: abColor,
          secondaryColor: pal.secondary,
          coreColor: pal.core,
          fillAlpha: env * 0.2,
          strokeAlpha: env * 0.94,
          lineWidth: 1.8 * s,
        });
      }
    }
    return;
  }

  // 8. ASTRAL AUTOMATON — Twin tilted golden gyroscope astrolabe rings
  if (abId === 'unit_construct_overdrive') {
    for (const tiltSign of [-1, 1]) {
      ctx.save();
      ctx.translate(sp.x, sp.y - 4 * s);
      ctx.rotate(tiltSign * 0.52 + t * 2.2 * tiltSign);
      drawEllipticalHalo(ctx, 0, 0, (20 + ease * 12) * s, (8 + ease * 5) * s, {
        lineWidth: 2.2 * s,
        color: tiltSign > 0 ? '#e2b75b' : '#38bdf8',
        coreColor: '#fffbeb',
        alpha: env * 0.94,
      });
      ctx.restore();
    }
    drawStarFlare(ctx, sp.x, sp.y - 4 * s, 16 * s * (1 - t * 0.3), 0.16, '#e2b75b', '#ffffff', env * 0.94, 0, 4);
    return;
  }

  // 9. ENEMY VOID BASH & TREMOR SLAM
  if (abId === 'enemy_shield_bash' || abId === 'enemy_tremor_slam') {
    const isTremor = abId === 'enemy_tremor_slam';
    drawTaperedBeamSpire(ctx, sp.x, gp.y, gp.y - (isTremor ? 56 : 36) * s * ease, {
      baseWidth: (isTremor ? 22 : 15) * s * (1 - t * 0.4),
      topWidth: 4 * s,
      tipHeight: 14 * s,
      color: abColor,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: env * 0.85,
      mode: 'lance',
    });
    for (let i = 0; i < 6; i += 1) {
      const a = (i * Math.PI) / 3 + 0.2;
      const d = (10 + ease * 18) * s;
      drawDiamondPrism(ctx, sp.x + Math.cos(a) * d, gp.y - 8 * s + Math.sin(a) * d * 0.45, 5.2 * s, 2.4 * s, a, {
        color: abColor,
        secondaryColor: pal.secondary,
        coreColor: pal.core,
        alpha: env * 0.92,
      });
    }
    return;
  }

  // 10. ENEMY STASIS FIELD — Refracted Crystal Beams + Multi-Shard Faceted Crystal Prison
  if (abId === 'enemy_stasis_field') {
    const cageR = (23 - ease * 4) * s;
    const cy = sp.y - 8 * s;
    // Refracted prismatic beams connecting perimeter shards to central crystal core
    for (let i = 0; i < 6; i += 1) {
      const a = (i * Math.PI) / 3 + t * 0.7;
      const sx = sp.x + Math.cos(a) * cageR * 1.25;
      const sy = cy + Math.sin(a) * cageR * 0.72;
      drawTaperedNeedle(ctx, sx, sy, sp.x, cy, {
        width: 2.4 * s,
        color: i % 2 === 0 ? abColor : pal.secondary,
        coreColor: '#ffffff',
        alpha: env * 0.85,
        peakRatio: 0.5,
      });
      drawFacetedCrystal(ctx, sx, sy, 4.2 * s, 7.2 * s, a + Math.PI * 0.5, {
        primary: abColor,
        highlight: pal.secondary,
        dark: '#17193b',
        outline: pal.core,
        alpha: env * 0.94,
      });
    }
    drawFacetedCrystal(ctx, sp.x, cy, cageR * 0.75, cageR * 1.1, 0, {
      primary: withAlpha(abColor, 0.35),
      highlight: withAlpha(pal.secondary, 0.58),
      dark: withAlpha(pal.glow, 0.42),
      outline: pal.core,
      alpha: env * 0.92,
    });
    drawStarFlare(ctx, sp.x, cy, 15 * s * (1 - t * 0.3), 0.16, pal.secondary, pal.core, env * 0.96, t, 4);
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

  // 13. BOSS ARCANE BARRAGE (Kaelis prism mandala / Astral Sextant grid / Inferno Organ salvo)
  if (abId === 'boss_arcane_barrage') {
    for (let i = 0; i < 5; i += 1) {
      const a = (i * Math.PI * 2) / 5 + t * 1.8;
      const dist = (10 + ease * 24) * s;
      drawFacetedCrystal(ctx, sp.x + Math.cos(a) * dist, sp.y - 8 * s + Math.sin(a) * dist * 0.65, 4.5 * s, 9.0 * s, a + Math.PI * 0.5, {
        primary: abColor,
        highlight: pal.secondary,
        dark: pal.glow,
        outline: pal.core,
        alpha: env * 0.94,
      });
    }
    drawStarFlare(ctx, sp.x, sp.y - 8 * s, 20 * s * (1 - t * 0.3), 0.16, pal.secondary, '#ffffff', env * 0.96, t * 1.5, 8);
    return;
  }

  // 14. BOSS SUMMON PORTALS (Guard / Stasis / Ravagers)
  if (abId.startsWith('boss_summon_')) {
    drawTaperedBeamSpire(ctx, sp.x, gp.y, gp.y - (68 + ease * 20) * s, {
      baseWidth: 24 * s * (1 - t * 0.45),
      topWidth: 8 * s,
      tipHeight: 16 * s,
      color: abColor,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      alpha: env * 0.8,
      mode: 'spire',
    });
    drawGeodesicHexPlate(ctx, sp.x, gp.y - 18 * s, (16 + ease * 10) * s, (9 + ease * 5) * s, {
      rotation: t * 1.5,
      color: abColor,
      secondaryColor: pal.secondary,
      coreColor: pal.core,
      fillAlpha: env * 0.2,
      strokeAlpha: env * 0.92,
      lineWidth: 2.0 * s,
    });
    return;
  }

  // 15. BOSS HYPERION — Orbital Cataclysm (Descending blazing orbital star-core!)
  if (abId === 'boss_orbital_cataclysm') {
    const dropY = gp.y - (1 - easeOutCubic(t)) * 85 * s - 14 * s;
    drawSoftBloom(ctx, sp.x, dropY, 28 * s, '#ffffff', abColor, env * 0.82);
    drawTaperedBeamSpire(ctx, sp.x, gp.y, dropY - 40 * s, {
      baseWidth: 28 * s * (1 - t * 0.4),
      topWidth: 10 * s,
      tipHeight: 18 * s,
      color: abColor,
      secondaryColor: pal.secondary,
      coreColor: '#ffffff',
      alpha: env * 0.88,
      mode: 'lance',
    });
    drawStarFlare(ctx, sp.x, dropY, 24 * s * (1 - t * 0.25), 0.2, pal.secondary, '#ffffff', env * 0.98, t * 2.5, 8);
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

  drawSoftBloom(ctx, cx, cy, 14 * scale, coreColor, rimColor, ratio * 0.55);

  const hitAngle = typeof unit.lastHitAngle === 'number' ? unit.lastHitAngle : 0;
  const slashLen = (11 + (1 - ratio) * 7) * scale;
  drawTaperedNeedle(
    ctx,
    cx - Math.cos(hitAngle) * slashLen * 0.6,
    cy - Math.sin(hitAngle) * slashLen * 0.6,
    cx + Math.cos(hitAngle) * slashLen * 0.9,
    cy + Math.sin(hitAngle) * slashLen * 0.9,
    {
      width: 2.6 * scale * ratio,
      color: rimColor,
      coreColor,
      alpha: ratio * 0.9,
      peakRatio: 0.45,
    },
  );

  drawStarFlare(ctx, cx, cy, 8.5 * scale * ratio, 0.18, rimColor, coreColor, ratio * 0.85, hitAngle, 4);
}
