/**
 * NonUnitVfxGeometry — Precision deterministic 2D vector geometry toolkit for
 * Star Struck's non-Unit card VFX (Skill, Tactic, Support).
 *
 * Design principles:
 * - Zero random per-frame polyline jitter or mismatched endpoints.
 * - All directional silhouettes (arrows, chevrons, lances, shields, reticles)
 *   are built as exact closed polygons in canonical local space and placed via
 *   rigid transforms (`translate` + `rotate`) so shapes never skew or distort.
 * - All curved ribbons use high-resolution analytical parametric sampling with
 *   exact analytical derivative tangents for perpendicular ribbon thickness,
 *   eliminating polygonal kinks and pinched bends.
 * - All magic-circle / astrolabe sigils use strict N-fold rotational symmetry.
 */

// ============================================================================
// Color & Easing Utilities
// ============================================================================

export function clamp01(v) {
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

export function easeOutCubic(t) {
  const k = 1 - clamp01(t);
  return 1 - k * k * k;
}

export function easeOutQuart(t) {
  const k = 1 - clamp01(t);
  return 1 - k * k * k * k;
}

export function easeInOutQuad(t) {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

export function easeOutBackClamped(t, overshoot = 1.15) {
  const x = clamp01(t);
  const c1 = overshoot;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

export function smoothWindow(t, fadeInEnd = 0.16, fadeOutStart = 0.28, fadeOutEnd = 1) {
  if (t <= 0 || t >= fadeOutEnd) return 0;
  if (t < fadeInEnd) return easeOutCubic(t / Math.max(0.001, fadeInEnd));
  if (t > fadeOutStart) {
    const k = clamp01((t - fadeOutStart) / Math.max(0.001, fadeOutEnd - fadeOutStart));
    return 1 - k * k;
  }
  return 1;
}

export function withAlpha(hex, alpha) {
  const a = clamp01(alpha);
  if (!hex || typeof hex !== 'string') return `rgba(255, 253, 244, ${a.toFixed(3)})`;
  if (hex.startsWith('rgba(') || hex.startsWith('rgb(')) return hex;
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
      : clean;
  if (full.length !== 6) return `rgba(255, 253, 244, ${a.toFixed(3)})`;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

// ============================================================================
// Analytical Parametric Curve Evaluators (Position + Exact Derivative Tangent)
// ============================================================================

export function sampleQuadBezier(p0, p1, p2, u) {
  const t = clamp01(u);
  const inv = 1 - t;
  const x = inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x;
  const y = inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y;
  const tx = 2 * inv * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
  const ty = 2 * inv * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
  return { x, y, tx, ty };
}

export function sampleCubicBezier(p0, p1, p2, p3, u) {
  const t = clamp01(u);
  const inv = 1 - t;
  const inv2 = inv * inv;
  const t2 = t * t;
  const x = inv2 * inv * p0.x + 3 * inv2 * t * p1.x + 3 * inv * t2 * p2.x + t2 * t * p3.x;
  const y = inv2 * inv * p0.y + 3 * inv2 * t * p1.y + 3 * inv * t2 * p2.y + t2 * t * p3.y;
  const tx =
    3 * inv2 * (p1.x - p0.x) +
    6 * inv * t * (p2.x - p1.x) +
    3 * t2 * (p3.x - p2.x);
  const ty =
    3 * inv2 * (p1.y - p0.y) +
    6 * inv * t * (p2.y - p1.y) +
    3 * t2 * (p3.y - p2.y);
  return { x, y, tx, ty };
}

export function sampleLogSpiral(cx, cy, rOuter, rInner, angleStart, angleSpan, ryRatio, u) {
  const t = clamp01(u);
  const ratio = Math.max(0.02, rInner / Math.max(0.001, rOuter));
  const lnRatio = Math.log(ratio);
  const r = rOuter * Math.exp(lnRatio * t);
  const dr = r * lnRatio;
  const a = angleStart + angleSpan * t;
  const da = angleSpan;
  const cosA = Math.cos(a);
  const sinA = Math.sin(a);
  return {
    x: cx + cosA * r,
    y: cy + sinA * r * ryRatio,
    tx: dr * cosA - r * sinA * da,
    ty: (dr * sinA + r * cosA * da) * ryRatio,
  };
}

export function sampleHelixArc(cx, baseY, height, radiusX, phaseStart, turns, u) {
  const t = clamp01(u);
  const freq = turns * Math.PI * 2;
  const phase = phaseStart + freq * t;
  const env = 0.85 + 0.25 * Math.sin(t * Math.PI);
  const dEnv = 0.25 * Math.PI * Math.cos(t * Math.PI);
  const r = radiusX * env;
  const dr = radiusX * dEnv;
  return {
    x: cx + Math.cos(phase) * r,
    y: baseY - height * t,
    tx: dr * Math.cos(phase) - r * Math.sin(phase) * freq,
    ty: -height,
  };
}

/**
 * Evaluates a ribbon half-width taper profile in [0..1] along local parameter s.
 */
function evalTaperWidth(s, profile) {
  if (profile === 'comet') {
    // Graceful tail from 0 -> sharp rounded head near s = 0.94 -> clean tip at 1
    if (s >= 0.92) {
      const k = (1 - s) / 0.08;
      return Math.sqrt(Math.max(0, k));
    }
    return Math.pow(s / 0.92, 1.25);
  }
  if (profile === 'crescent') {
    return Math.sin(s * Math.PI);
  }
  if (profile === 'taper_out') {
    // Fullest near s = 0.14, cleanly tapering to needle point at s = 1
    if (s <= 0.14) return Math.sin((s / 0.14) * Math.PI * 0.5);
    return Math.pow(1 - (s - 0.14) / 0.86, 1.15);
  }
  // 'spindle': smooth symmetrical lens taper
  return Math.pow(Math.sin(s * Math.PI), 0.88);
}

/**
 * Builds closed left/right outline vertices for an analytical parametric ribbon.
 * Exported for both Canvas rendering and geometric smoothness verification.
 */
export function buildAnalyticalRibbonGeometry(sampleFn, {
  uStart = 0,
  uEnd = 1,
  steps = 36,
  maxWidth = 4,
  taperProfile = 'spindle',
} = {}) {
  const count = Math.max(8, Math.round(steps));
  const left = [];
  const right = [];
  const center = [];
  let lastNx = 0;
  let lastNy = -1;

  for (let i = 0; i <= count; i += 1) {
    const s = i / count;
    const u = uStart + (uEnd - uStart) * s;
    const pt = sampleFn(u);
    const len = Math.hypot(pt.tx, pt.ty);
    let nx = lastNx;
    let ny = lastNy;
    if (len > 1e-5) {
      nx = -pt.ty / len;
      ny = pt.tx / len;
      lastNx = nx;
      lastNy = ny;
    }
    const halfW = maxWidth * 0.5 * evalTaperWidth(s, taperProfile);
    center.push({ x: pt.x, y: pt.y, tx: pt.tx, ty: pt.ty });
    left.push({ x: pt.x + nx * halfW, y: pt.y + ny * halfW });
    right.push({ x: pt.x - nx * halfW, y: pt.y - ny * halfW });
  }
  return { center, left, right };
}

/**
 * Draws a silky, kink-free analytical tapered vector ribbon with an outer
 * translucent energy body and crisp inset white-gold core filament.
 */
export function drawAnalyticalRibbon(ctx, sampleFn, {
  uStart = 0,
  uEnd = 1,
  steps = 36,
  maxWidth = 4.5,
  color = '#38bdf8',
  coreColor = '#fffdf4',
  alpha = 0.85,
  taperProfile = 'spindle',
  coreRatio = 0.42,
  glowWidthMultiplier = 1.85,
  glowAlpha = 0.22,
} = {}) {
  if (alpha <= 0.015 || maxWidth <= 0.2 || uEnd <= uStart + 1e-4) return null;
  const geom = buildAnalyticalRibbonGeometry(sampleFn, {
    uStart,
    uEnd,
    steps,
    maxWidth,
    taperProfile,
  });

  const traceClosed = (lPts, rPts) => {
    ctx.beginPath();
    ctx.moveTo(lPts[0].x, lPts[0].y);
    for (let i = 1; i < lPts.length; i += 1) {
      ctx.lineTo(lPts[i].x, lPts[i].y);
    }
    for (let i = rPts.length - 1; i >= 0; i -= 1) {
      ctx.lineTo(rPts[i].x, rPts[i].y);
    }
    ctx.closePath();
  };

  ctx.save();

  // Soft outer rim glow (restrained — supports silhouette without muddying it)
  if (glowAlpha > 0.01 && glowWidthMultiplier > 1.05) {
    const glowGeom = buildAnalyticalRibbonGeometry(sampleFn, {
      uStart,
      uEnd,
      steps: Math.max(16, Math.round(steps * 0.7)),
      maxWidth: maxWidth * glowWidthMultiplier,
      taperProfile,
    });
    traceClosed(glowGeom.left, glowGeom.right);
    ctx.fillStyle = withAlpha(color, alpha * glowAlpha);
    ctx.fill();
  }

  // Primary clean tapered ribbon silhouette
  traceClosed(geom.left, geom.right);
  ctx.fillStyle = withAlpha(color, alpha * 0.78);
  ctx.fill();

  // Crisp luminous core ribbon
  if (coreRatio > 0.05) {
    const coreGeom = buildAnalyticalRibbonGeometry(sampleFn, {
      uStart,
      uEnd,
      steps,
      maxWidth: Math.max(0.8, maxWidth * coreRatio),
      taperProfile,
    });
    traceClosed(coreGeom.left, coreGeom.right);
    ctx.fillStyle = withAlpha(coreColor, alpha * 0.92);
    ctx.fill();
  }

  ctx.restore();
  return geom;
}

// ============================================================================
// Atmospheric Bloom & Symmetrical Anime Sigils
// ============================================================================

export function drawSoftBloom(ctx, x, y, radius, innerColor, outerColor, alpha, yScale = 1) {
  if (alpha <= 0.01 || radius <= 1) return;
  ctx.save();
  ctx.translate(x, y);
  if (yScale !== 1) ctx.scale(1, yScale);
  if (typeof ctx.createRadialGradient === 'function') {
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    grad.addColorStop(0, withAlpha(innerColor, alpha * 0.85));
    grad.addColorStop(0.42, withAlpha(outerColor, alpha * 0.34));
    grad.addColorStop(1, withAlpha(outerColor, 0));
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = withAlpha(outerColor, alpha * 0.28);
  }
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawEllipticalHalo(ctx, cx, cy, rx, ry, {
  lineWidth = 1.6,
  color = '#38bdf8',
  coreColor = '#fffdf4',
  alpha = 0.8,
  startAngle = 0,
  endAngle = Math.PI * 2,
  rotation = 0,
} = {}) {
  if (alpha <= 0.015 || rx <= 1 || ry <= 0.5) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = withAlpha(color, alpha * 0.72);
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, rotation, startAngle, endAngle);
  ctx.stroke();

  if (coreColor && lineWidth >= 1.2) {
    ctx.strokeStyle = withAlpha(coreColor, alpha * 0.82);
    ctx.lineWidth = Math.max(0.75, lineWidth * 0.42);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, rotation, startAngle, endAngle);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draws a strictly N-fold rotationally symmetrical anime magic-circle / astrolabe
 * sigil projected cleanly onto the battlefield ground ellipse.
 * Zero random jitter — every arc, gap, and tick has exact mathematical balance.
 */
export function drawSymmetricalSigilRing(ctx, cx, cy, rx, ry, {
  count = 4,
  arcFill = 0.62,
  rotation = 0,
  lineWidth = 1.8,
  color = '#38bdf8',
  coreColor = '#fffdf4',
  alpha = 0.82,
  tickStyle = 'none',
  tickLength = 0.14,
  innerRingRatio = 0,
  innerAlpha = 0.45,
} = {}) {
  if (alpha <= 0.015 || rx <= 2 || ry <= 1 || count < 1) return;
  const sector = (Math.PI * 2) / count;
  const span = sector * clamp01(arcFill);
  const halfSpan = span * 0.5;

  ctx.save();
  ctx.lineCap = 'round';

  // Optional hairline inner structural circle
  if (innerRingRatio > 0.1 && innerRingRatio < 0.98) {
    ctx.strokeStyle = withAlpha(color, alpha * innerAlpha);
    ctx.lineWidth = Math.max(0.85, lineWidth * 0.55);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * innerRingRatio, ry * innerRingRatio, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Strictly balanced symmetrical arc segments
  for (let i = 0; i < count; i += 1) {
    const mid = rotation + i * sector;
    const a0 = mid - halfSpan;
    const a1 = mid + halfSpan;

    ctx.strokeStyle = withAlpha(color, alpha * 0.82);
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, a0, a1);
    ctx.stroke();

    ctx.strokeStyle = withAlpha(coreColor, alpha * 0.86);
    ctx.lineWidth = Math.max(0.7, lineWidth * 0.4);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, a0 + 0.04, a1 - 0.04);
    ctx.stroke();
  }

  // Optional symmetrical gap markers (radial ticks or diamond nodes)
  if (tickStyle !== 'none') {
    for (let i = 0; i < count; i += 1) {
      const a = rotation + (i + 0.5) * sector;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      if (tickStyle === 'radial' || tickStyle === 'compass') {
        const innerMul = 1 - tickLength;
        const outerMul = 1 + tickLength * (tickStyle === 'compass' && i % 2 === 0 ? 1.5 : 0.85);
        ctx.strokeStyle = withAlpha(coreColor, alpha * 0.85);
        ctx.lineWidth = Math.max(1.0, lineWidth * 0.65);
        ctx.beginPath();
        ctx.moveTo(cx + cosA * rx * innerMul, cy + sinA * ry * innerMul);
        ctx.lineTo(cx + cosA * rx * outerMul, cy + sinA * ry * outerMul);
        ctx.stroke();
      } else if (tickStyle === 'diamond') {
        const dx = cx + cosA * rx;
        const dy = cy + sinA * ry;
        const dr = Math.max(2.2, lineWidth * 1.65);
        ctx.fillStyle = withAlpha(coreColor, alpha * 0.92);
        ctx.beginPath();
        ctx.moveTo(dx, dy - dr * 0.85);
        ctx.lineTo(dx + dr, dy);
        ctx.lineTo(dx, dy + dr * 0.85);
        ctx.lineTo(dx - dr, dy);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  ctx.restore();
}

// ============================================================================
// Unified Closed-Polygon Precision Arrows, Chevrons & Needles
// ============================================================================

/**
 * Generates exact local-space vertices for a unified, mirror-symmetrical
 * precision arrow (tip at `(headLength, 0)`, tail at `(-shaftLength, 0)`).
 * Every upper vertex `(x, -y)` has an exact mirror `(x, +y)` guaranteeing
 * zero crookedness or endpoint mismatch.
 */
export function buildPrecisionArrowPolygon({
  shaftLength = 62,
  shaftHalfWidth = 3.2,
  tailHalfWidth = 1.0,
  headLength = 26,
  headHalfWidth = 16,
  barbBack = 8,
} = {}) {
  const junctionX = -barbBack;
  const shoulderX = 0;
  return [
    { x: headLength, y: 0 }, // Exact front apex
    { x: junctionX, y: -headHalfWidth }, // Top outer barb wing
    { x: shoulderX, y: -shaftHalfWidth }, // Top clean shaft-to-head junction
    { x: -shaftLength, y: -tailHalfWidth }, // Top straight shaft tail
    { x: -shaftLength - shaftHalfWidth * 1.4, y: 0 }, // Tail point
    { x: -shaftLength, y: tailHalfWidth }, // Bottom straight shaft tail
    { x: shoulderX, y: shaftHalfWidth }, // Bottom clean shaft-to-head junction
    { x: junctionX, y: headHalfWidth }, // Bottom outer barb wing
  ];
}

/**
 * Draws a single unified, razor-symmetrical precision spearhead arrow centered
 * at the shaft-head junction `(x, y)` oriented along `angle` (radians).
 */
export function drawPrecisionArrow(ctx, x, y, angle, {
  shaftLength = 62,
  shaftHalfWidth = 3.2,
  tailHalfWidth = 1.0,
  headLength = 26,
  headHalfWidth = 16,
  barbBack = 8,
  color = '#f97316',
  secondaryColor = '#f5d37a',
  coreColor = '#fffdf4',
  alpha = 0.92,
  withShaft = true,
} = {}) {
  if (alpha <= 0.015) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  const tracePoly = (pts) => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
  };

  if (withShaft) {
    const outer = buildPrecisionArrowPolygon({
      shaftLength,
      shaftHalfWidth,
      tailHalfWidth,
      headLength,
      headHalfWidth,
      barbBack,
    });

    // Subtle outer energy halo rim
    tracePoly(outer);
    ctx.strokeStyle = withAlpha(color, alpha * 0.42);
    ctx.lineWidth = Math.max(2.4, shaftHalfWidth * 1.15);
    ctx.lineJoin = 'miter';
    ctx.stroke();

    // Primary crisp filled silhouette with directional linear highlight
    tracePoly(outer);
    if (typeof ctx.createLinearGradient === 'function') {
      const grad = ctx.createLinearGradient(-shaftLength, 0, headLength, 0);
      grad.addColorStop(0, withAlpha(color, alpha * 0.35));
      grad.addColorStop(0.55, withAlpha(color, alpha * 0.88));
      grad.addColorStop(0.85, withAlpha(secondaryColor, alpha * 0.96));
      grad.addColorStop(1, withAlpha(coreColor, alpha));
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = withAlpha(color, alpha * 0.88);
    }
    ctx.fill();

    // Clean bevel rim stroke
    ctx.strokeStyle = withAlpha(coreColor, alpha * 0.65);
    ctx.lineWidth = 0.9;
    ctx.stroke();

    // Exact centered inner white-gold spine & arrowhead facet
    const core = buildPrecisionArrowPolygon({
      shaftLength: shaftLength * 0.86,
      shaftHalfWidth: Math.max(0.8, shaftHalfWidth * 0.42),
      tailHalfWidth: 0.3,
      headLength: headLength * 0.78,
      headHalfWidth: headHalfWidth * 0.42,
      barbBack: barbBack * 0.45,
    });
    tracePoly(core);
    ctx.fillStyle = withAlpha(coreColor, alpha * 0.94);
    ctx.fill();
  } else {
    // Pure symmetrical arrowhead (used at the exact tip of curved Bezier arrow arcs)
    const head = [
      { x: headLength, y: 0 },
      { x: -barbBack, y: -headHalfWidth },
      { x: 0, y: 0 },
      { x: -barbBack, y: headHalfWidth },
    ];
    tracePoly(head);
    ctx.fillStyle = withAlpha(color, alpha * 0.92);
    ctx.fill();
    ctx.strokeStyle = withAlpha(coreColor, alpha * 0.78);
    ctx.lineWidth = 0.85;
    ctx.lineJoin = 'miter';
    ctx.stroke();

    // Inner bright diamond facet
    const innerHead = [
      { x: headLength * 0.82, y: 0 },
      { x: -barbBack * 0.4, y: -headHalfWidth * 0.42 },
      { x: headLength * 0.08, y: 0 },
      { x: -barbBack * 0.4, y: headHalfWidth * 0.42 },
    ];
    tracePoly(innerHead);
    ctx.fillStyle = withAlpha(coreColor, alpha * 0.95);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Generates exact local-space vertices for a closed, mirror-symmetrical
 * beveled chevron pointing along +X (apex at `(depth * 0.5, 0)`).
 */
export function buildPrecisionChevronPolygon({
  halfHeight = 22,
  depth = 16,
  thickness = 5.5,
} = {}) {
  const tipX = depth * 0.5;
  const backX = -depth * 0.5;
  // Exact horizontal inset derived from wing slope so front and back edges stay strictly parallel
  const wingSlope = depth / Math.max(1, halfHeight);
  const innerTipX = tipX - thickness * Math.hypot(1, wingSlope);
  const innerBackX = backX - thickness * Math.hypot(1, wingSlope);
  return [
    { x: tipX, y: 0 },
    { x: backX, y: -halfHeight },
    { x: innerBackX, y: -halfHeight },
    { x: innerTipX, y: 0 },
    { x: innerBackX, y: halfHeight },
    { x: backX, y: halfHeight },
  ];
}

/**
 * Draws a razor-sharp closed-polygon symmetrical beveled chevron with an
 * inset white-gold centerline ridge. Zero uneven double-stroke artifacts.
 */
export function drawPrecisionChevron(ctx, x, y, angle, {
  halfHeight = 22,
  depth = 16,
  thickness = 5.2,
  color = '#f59e0b',
  secondaryColor = '#fcd34d',
  coreColor = '#fffdf4',
  alpha = 0.88,
} = {}) {
  if (alpha <= 0.015) return;
  const outer = buildPrecisionChevronPolygon({ halfHeight, depth, thickness });
  const inner = buildPrecisionChevronPolygon({
    halfHeight: halfHeight * 0.82,
    depth: depth * 0.82,
    thickness: Math.max(1.2, thickness * 0.36),
  });

  const tracePoly = (pts) => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
  };

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Subtle rim aura
  tracePoly(outer);
  ctx.strokeStyle = withAlpha(color, alpha * 0.34);
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'miter';
  ctx.stroke();

  // Primary clean filled chevron silhouette
  tracePoly(outer);
  if (typeof ctx.createLinearGradient === 'function') {
    const grad = ctx.createLinearGradient(-depth, 0, depth * 0.6, 0);
    grad.addColorStop(0, withAlpha(color, alpha * 0.55));
    grad.addColorStop(0.65, withAlpha(secondaryColor, alpha * 0.92));
    grad.addColorStop(1, withAlpha(coreColor, alpha * 0.98));
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = withAlpha(color, alpha * 0.88);
  }
  ctx.fill();

  // Crisp inner highlight chevron
  tracePoly(inner);
  ctx.fillStyle = withAlpha(coreColor, alpha * 0.92);
  ctx.fill();

  ctx.restore();
}

/**
 * Draws a razor-straight faceted needle streak (4 exact straight edges — no
 * wobbly bulging curves) from `(x1, y1)` to `(x2, y2)`.
 */
export function drawTaperedNeedle(ctx, x1, y1, x2, y2, {
  width = 3.2,
  color = '#38bdf8',
  coreColor = '#fffdf4',
  alpha = 0.85,
  peakRatio = 0.58,
} = {}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (alpha <= 0.015 || len < 1.5) return;

  const angle = Math.atan2(dy, dx);
  const peakX = len * clamp01(peakRatio);
  const hw = width * 0.5;

  ctx.save();
  ctx.translate(x1, y1);
  ctx.rotate(angle);

  // Outer straight-faceted diamond needle
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(peakX, -hw);
  ctx.lineTo(len, 0);
  ctx.lineTo(peakX, hw);
  ctx.closePath();
  ctx.fillStyle = withAlpha(color, alpha * 0.78);
  ctx.fill();

  // Inner bright core needle
  const chw = Math.max(0.5, hw * 0.42);
  ctx.beginPath();
  ctx.moveTo(len * 0.08, 0);
  ctx.lineTo(peakX, -chw);
  ctx.lineTo(len * 0.96, 0);
  ctx.lineTo(peakX, chw);
  ctx.closePath();
  ctx.fillStyle = withAlpha(coreColor, alpha * 0.95);
  ctx.fill();

  ctx.restore();
}

// ============================================================================
// Sculpted Tapered Lances, Spires, Shields, Reticles, Prisms, Stars & Lotus
// ============================================================================

/**
 * Replaces raw `fillRect` beams with a sculpted, symmetrical tapered vector
 * lance (sharp diamond spearhead tip at bottom) or sanctuary light spire
 * (gracefully flaring into a feathered elliptical pedestal at bottom).
 */
export function drawTaperedBeamSpire(ctx, x, bottomY, topY, {
  baseWidth = 22,
  topWidth = 6,
  tipHeight = 28,
  color = '#f97316',
  secondaryColor = '#fbbf24',
  coreColor = '#fffdf4',
  alpha = 0.9,
  mode = 'lance',
} = {}) {
  if (alpha <= 0.015 || bottomY <= topY + 4) return;
  const h = bottomY - topY;
  ctx.save();

  if (mode === 'lance') {
    const tipY = bottomY;
    const shoulderY = Math.max(topY + 4, bottomY - Math.min(tipHeight, h * 0.32));
    const hwTop = topWidth * 0.5;
    const hwBase = baseWidth * 0.5;

    // Outer translucent light sheath (clean symmetrical tapered spear)
    ctx.beginPath();
    ctx.moveTo(x - hwTop * 1.7, topY);
    ctx.lineTo(x + hwTop * 1.7, topY);
    ctx.lineTo(x + hwBase * 1.65, shoulderY);
    ctx.lineTo(x, tipY + 4);
    ctx.lineTo(x - hwBase * 1.65, shoulderY);
    ctx.closePath();
    if (typeof ctx.createLinearGradient === 'function') {
      const grad = ctx.createLinearGradient(x, topY, x, tipY);
      grad.addColorStop(0, withAlpha(color, 0));
      grad.addColorStop(0.28, withAlpha(color, alpha * 0.3));
      grad.addColorStop(0.85, withAlpha(secondaryColor, alpha * 0.52));
      grad.addColorStop(1, withAlpha(coreColor, alpha * 0.6));
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = withAlpha(color, alpha * 0.35);
    }
    ctx.fill();

    // Primary sharp lance blade silhouette
    ctx.beginPath();
    ctx.moveTo(x - hwTop, topY);
    ctx.lineTo(x + hwTop, topY);
    ctx.lineTo(x + hwBase, shoulderY);
    ctx.lineTo(x, tipY);
    ctx.lineTo(x - hwBase, shoulderY);
    ctx.closePath();
    if (typeof ctx.createLinearGradient === 'function') {
      const grad = ctx.createLinearGradient(x, topY, x, tipY);
      grad.addColorStop(0, withAlpha(color, alpha * 0.12));
      grad.addColorStop(0.35, withAlpha(color, alpha * 0.78));
      grad.addColorStop(0.82, withAlpha(secondaryColor, alpha * 0.92));
      grad.addColorStop(1, withAlpha(coreColor, alpha));
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = withAlpha(secondaryColor, alpha * 0.85);
    }
    ctx.fill();

    // Razor white-gold center needle filament
    ctx.beginPath();
    ctx.moveTo(x - Math.max(0.8, hwTop * 0.4), topY + h * 0.08);
    ctx.lineTo(x + Math.max(0.8, hwTop * 0.4), topY + h * 0.08);
    ctx.lineTo(x + Math.max(1.5, hwBase * 0.36), shoulderY);
    ctx.lineTo(x, tipY - 1);
    ctx.lineTo(x - Math.max(1.5, hwBase * 0.36), shoulderY);
    ctx.closePath();
    ctx.fillStyle = withAlpha(coreColor, alpha * 0.96);
    ctx.fill();
  } else {
    // 'spire': Cleanse Beacon graceful flared sanctuary spire with seamless feathered fade
    const hwTop = Math.max(2, topWidth * 0.36);
    const hwBase = baseWidth * 0.5;
    const flareY = bottomY - Math.min(54, h * 0.32);

    // Outer translucent veil curving smoothly into the floor ellipse with zero hard bottom seam
    ctx.beginPath();
    ctx.moveTo(x - hwTop * 1.4, topY);
    ctx.lineTo(x + hwTop * 1.4, topY);
    ctx.quadraticCurveTo(x + hwTop * 1.5, flareY, x + hwBase * 1.42, bottomY - 2);
    ctx.ellipse(x, bottomY - 2, hwBase * 1.42, hwBase * 0.38, 0, 0, Math.PI);
    ctx.quadraticCurveTo(x - hwTop * 1.5, flareY, x - hwTop * 1.4, topY);
    ctx.closePath();
    if (typeof ctx.createLinearGradient === 'function') {
      const grad = ctx.createLinearGradient(x, topY, x, bottomY + hwBase * 0.38);
      grad.addColorStop(0, withAlpha(color, 0));
      grad.addColorStop(0.38, withAlpha(color, alpha * 0.22));
      grad.addColorStop(0.8, withAlpha(secondaryColor, alpha * 0.38));
      grad.addColorStop(1, withAlpha(coreColor, 0));
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = withAlpha(color, alpha * 0.26);
    }
    ctx.fill();

    // Crisp inner tapered sanctuary spire
    ctx.beginPath();
    ctx.moveTo(x - hwTop * 0.5, topY + h * 0.08);
    ctx.lineTo(x + hwTop * 0.5, topY + h * 0.08);
    ctx.quadraticCurveTo(x + hwTop * 0.65, flareY, x + hwBase * 0.62, bottomY - 2);
    ctx.ellipse(x, bottomY - 2, hwBase * 0.62, hwBase * 0.18, 0, 0, Math.PI);
    ctx.quadraticCurveTo(x - hwTop * 0.65, flareY, x - hwTop * 0.5, topY + h * 0.08);
    ctx.closePath();
    if (typeof ctx.createLinearGradient === 'function') {
      const grad = ctx.createLinearGradient(x, topY, x, bottomY + hwBase * 0.18);
      grad.addColorStop(0, withAlpha(coreColor, 0));
      grad.addColorStop(0.35, withAlpha(coreColor, alpha * 0.52));
      grad.addColorStop(0.82, withAlpha(coreColor, alpha * 0.84));
      grad.addColorStop(1, withAlpha(coreColor, 0));
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = withAlpha(coreColor, alpha * 0.72);
    }
    ctx.fill();

    // Fine vertical center light filament
    drawTaperedNeedle(ctx, x, topY + h * 0.14, x, bottomY - 2, {
      width: Math.max(2.0, topWidth * 0.28),
      color: secondaryColor,
      coreColor,
      alpha: alpha * 0.9,
      peakRatio: 0.76,
    });
  }

  ctx.restore();
}

/**
 * Draws a layered, symmetrical pointed-crest anime bastion shield using exact
 * mirrored curves, double-bevel rim, vertical keystone rib, and crown diamond.
 */
export function drawBastionShield(ctx, cx, cy, width, height, {
  color = '#38bdf8',
  secondaryColor = '#f2d89b',
  coreColor = '#fffef8',
  alpha = 0.88,
} = {}) {
  if (alpha <= 0.015 || width < 4 || height < 4) return;
  const hw = width * 0.5;
  const hh = height * 0.5;

  const traceShield = (sx, sy) => {
    const w = hw * sx;
    const h = hh * sy;
    ctx.beginPath();
    ctx.moveTo(0, -h); // Top center crown
    ctx.lineTo(w * 0.76, -h * 0.74); // Top right bevel
    ctx.lineTo(w, -h * 0.24); // Right shoulder
    ctx.quadraticCurveTo(w * 0.92, h * 0.52, 0, h); // Right lower curve to pointed apex
    ctx.quadraticCurveTo(-w * 0.92, h * 0.52, -w, -h * 0.24); // Mirror left lower curve
    ctx.lineTo(-w * 0.76, -h * 0.74); // Top left bevel
    ctx.closePath();
  };

  ctx.save();
  ctx.translate(cx, cy);

  // Translucent luminous shield body (top-down specular highlight)
  traceShield(1, 1);
  if (typeof ctx.createLinearGradient === 'function') {
    const grad = ctx.createLinearGradient(0, -hh, 0, hh);
    grad.addColorStop(0, withAlpha(coreColor, alpha * 0.32));
    grad.addColorStop(0.45, withAlpha(color, alpha * 0.24));
    grad.addColorStop(1, withAlpha(color, alpha * 0.08));
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = withAlpha(color, alpha * 0.22);
  }
  ctx.fill();

  // Crisp outer rim
  ctx.strokeStyle = withAlpha(color, alpha * 0.92);
  ctx.lineWidth = 2.0;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Recessed inner bevel contour
  traceShield(0.78, 0.8);
  ctx.strokeStyle = withAlpha(coreColor, alpha * 0.84);
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Vertical central keystone ridge & horizontal crest bar (clean structural cross)
  ctx.strokeStyle = withAlpha(secondaryColor, alpha * 0.78);
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(0, -hh * 0.78);
  ctx.lineTo(0, hh * 0.78);
  ctx.moveTo(-hw * 0.62, -hh * 0.16);
  ctx.lineTo(hw * 0.62, -hh * 0.16);
  ctx.stroke();

  // Crown diamond emblem at top center
  const dr = Math.max(3.2, width * 0.11);
  ctx.fillStyle = withAlpha(coreColor, alpha * 0.96);
  ctx.strokeStyle = withAlpha(secondaryColor, alpha * 0.9);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, -hh - dr * 0.85);
  ctx.lineTo(dr * 0.75, -hh);
  ctx.lineTo(0, -hh + dr * 0.85);
  ctx.lineTo(-dr * 0.75, -hh);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws an exact 4-fold symmetrical anime targeting lock-on reticle:
 * 4 chamfered corner brackets + inner precision circle + centered diamond crosshair.
 */
export function drawPrecisionReticle(ctx, cx, cy, radius, {
  rotation = 0,
  color = '#f87171',
  secondaryColor = '#fbbf24',
  coreColor = '#fff9f5',
  alpha = 0.92,
} = {}) {
  if (alpha <= 0.015 || radius < 4) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  // Subtle hairline inner calibration circle
  ctx.strokeStyle = withAlpha(secondaryColor, alpha * 0.55);
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.56, 0, Math.PI * 2);
  ctx.stroke();

  // 4 exact corner lock-on brackets at 45°, 135°, 225°, 315°
  const arm = radius * 0.34;
  const r = radius;
  for (let i = 0; i < 4; i += 1) {
    ctx.save();
    ctx.rotate(i * Math.PI * 0.5 + Math.PI * 0.25);

    // Outer chamfered bracket chevron
    ctx.strokeStyle = withAlpha(color, alpha * 0.92);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(r - arm * 0.7, -arm);
    ctx.lineTo(r, 0);
    ctx.lineTo(r - arm * 0.7, arm);
    ctx.stroke();

    // Crisp inner highlight along the exact bracket
    ctx.strokeStyle = withAlpha(coreColor, alpha * 0.9);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(r - arm * 0.58, -arm * 0.82);
    ctx.lineTo(r - 1.2, 0);
    ctx.lineTo(r - arm * 0.58, arm * 0.82);
    ctx.stroke();

    // Short inward calibration needle
    ctx.strokeStyle = withAlpha(secondaryColor, alpha * 0.88);
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(r * 0.72, 0);
    ctx.lineTo(r * 0.42, 0);
    ctx.stroke();

    ctx.restore();
  }

  // Exact centered diamond lock core
  const cr = Math.max(3.2, radius * 0.16);
  ctx.fillStyle = withAlpha(coreColor, alpha * 0.96);
  ctx.strokeStyle = withAlpha(color, alpha * 0.9);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(0, -cr);
  ctx.lineTo(cr, 0);
  ctx.lineTo(0, cr);
  ctx.lineTo(-cr, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws an exact 4-facet beveled crystalline diamond prism (used by Stasis Pulse
 * and Aegis keystones) with upper/lower facet contrast and crisp edge bevels.
 */
export function drawDiamondPrism(ctx, cx, cy, rx, ry, angle = 0, {
  color = '#a78bfa',
  secondaryColor = '#e9d5ff',
  coreColor = '#fffdf8',
  alpha = 0.88,
} = {}) {
  if (alpha <= 0.015 || rx < 1.5 || ry < 1.5) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // Upper bright facet (consistent top-left light source)
  ctx.beginPath();
  ctx.moveTo(0, -ry);
  ctx.lineTo(rx, 0);
  ctx.lineTo(0, 0);
  ctx.lineTo(-rx, 0);
  ctx.closePath();
  ctx.fillStyle = withAlpha(secondaryColor, alpha * 0.46);
  ctx.fill();

  // Lower shaded facet
  ctx.beginPath();
  ctx.moveTo(-rx, 0);
  ctx.lineTo(0, 0);
  ctx.lineTo(rx, 0);
  ctx.lineTo(0, ry);
  ctx.closePath();
  ctx.fillStyle = withAlpha(color, alpha * 0.32);
  ctx.fill();

  // Crisp outer diamond rim
  ctx.beginPath();
  ctx.moveTo(0, -ry);
  ctx.lineTo(rx, 0);
  ctx.lineTo(0, ry);
  ctx.lineTo(-rx, 0);
  ctx.closePath();
  ctx.strokeStyle = withAlpha(coreColor, alpha * 0.92);
  ctx.lineWidth = 1.3;
  ctx.lineJoin = 'miter';
  ctx.stroke();

  // Inner facet ridges
  ctx.strokeStyle = withAlpha(coreColor, alpha * 0.6);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, -ry * 0.92);
  ctx.lineTo(0, ry * 0.92);
  ctx.moveTo(-rx * 0.92, 0);
  ctx.lineTo(rx * 0.92, 0);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws an exact symmetrical 4-point or 8-point faceted celestial star flare.
 */
export function drawStarFlare(ctx, x, y, radius, innerRatio = 0.16, color = '#f5d37a', coreColor = '#fffdf4', alpha = 0.92, rotation = 0, points = 4) {
  if (alpha <= 0.015 || radius <= 0.8) return;
  const inner = Math.max(0.7, radius * clamp01(innerRatio));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  const traceStar = (rOut, rIn) => {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i += 1) {
      const a = (i * Math.PI) / points;
      const r = i % 2 === 0 ? rOut : rIn;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };

  // Outer starlight flare
  traceStar(radius, inner);
  ctx.fillStyle = withAlpha(color, alpha * 0.84);
  ctx.fill();

  // Inner sharp white-gold core star
  traceStar(radius * 0.68, inner * 0.58);
  ctx.fillStyle = withAlpha(coreColor, alpha * 0.98);
  ctx.fill();

  ctx.restore();
}

/**
 * Draws an exact N-fold symmetrical pointed-petal lotus crest projected cleanly
 * onto a ground perspective ellipse (Sanctuary Wave & Mending Aura).
 */
export function drawLotusCrest(ctx, cx, cy, rx, ry, {
  petals = 6,
  rotation = 0,
  color = '#34d399',
  secondaryColor = '#f5e6b3',
  coreColor = '#fffef7',
  alpha = 0.84,
} = {}) {
  if (alpha <= 0.015 || rx < 4 || ry < 2) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / Math.max(0.001, rx));
  ctx.rotate(rotation);

  const step = (Math.PI * 2) / petals;
  for (let i = 0; i < petals; i += 1) {
    ctx.save();
    ctx.rotate(i * step);

    // Exact mirrored pointed lotus petal using symmetric quadratic Beziers
    ctx.beginPath();
    ctx.moveTo(rx * 0.16, 0);
    ctx.quadraticCurveTo(rx * 0.56, -rx * 0.24, rx, 0);
    ctx.quadraticCurveTo(rx * 0.56, rx * 0.24, rx * 0.16, 0);
    ctx.closePath();

    ctx.fillStyle = withAlpha(i % 2 === 0 ? color : secondaryColor, alpha * 0.22);
    ctx.fill();
    ctx.strokeStyle = withAlpha(i % 2 === 0 ? color : secondaryColor, alpha * 0.86);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Inner petal vein line
    ctx.strokeStyle = withAlpha(coreColor, alpha * 0.72);
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(rx * 0.24, 0);
    ctx.lineTo(rx * 0.84, 0);
    ctx.stroke();

    ctx.restore();
  }

  // Symmetrical center ring
  ctx.strokeStyle = withAlpha(coreColor, alpha * 0.88);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, rx * 0.18, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws a crisp stylized anime electric arc between `(x1, y1)` and `(x2, y2)`:
 * - Deterministic stepped cadence (changes cleanly only when `stepIndex` increments)
 * - Strictly monotonic along the axis (zero tangled self-intersections)
 * - Smoothly tapered polygon envelope from thick charged source to sharp tip
 */
export function drawSteppedLightningBolt(ctx, x1, y1, x2, y2, {
  segments = 7,
  amplitude = 11,
  width = 3.4,
  color = '#22d3ee',
  secondaryColor = '#67e8f9',
  coreColor = '#ffffff',
  alpha = 0.94,
  seed = 1,
  stepIndex = 0,
} = {}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (alpha <= 0.015 || len < 4) return;

  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  // Deterministic stepped hash
  let s = ((seed * 7919 + stepIndex * 104729) >>> 0) || 13;
  const nextRand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s & 0xfffffff) / 0x10000000;
  };

  // Build dynamic stylized anime lightning spine (asymmetric primary elbow + sharp secondary kinks,
  // avoiding mechanical alternating sawtooth staircases)
  const pts = [{ x: x1, y: y1 }];
  const elbowIdx = Math.max(2, Math.min(segments - 2, Math.round(segments * (0.38 + nextRand() * 0.24))));
  const elbowSign = nextRand() > 0.5 ? 1 : -1;
  for (let i = 1; i < segments; i += 1) {
    const baseU = i / segments;
    const jitterU = (nextRand() - 0.5) * (0.36 / segments);
    const u = Math.max(0.06, Math.min(0.94, baseU + jitterU));
    const env = Math.sin(u * Math.PI);
    let offset;
    if (i === elbowIdx) {
      offset = elbowSign * amplitude * (0.85 + nextRand() * 0.35);
    } else if (Math.abs(i - elbowIdx) === 1) {
      offset = elbowSign * amplitude * (0.2 + nextRand() * 0.25) * env;
    } else {
      const minorSign = nextRand() > 0.42 ? -elbowSign : elbowSign;
      offset = minorSign * amplitude * (0.22 + nextRand() * 0.38) * env;
    }
    pts.push({
      x: x1 + dx * u + nx * offset,
      y: y1 + dy * u + ny * offset,
    });
  }
  pts.push({ x: x2, y: y2 });

  // Render tapered stroke passes with sharp miter joins
  ctx.save();
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 4;
  ctx.lineCap = 'round';

  // Soft outer electric glow stroke
  ctx.strokeStyle = withAlpha(color, alpha * 0.28);
  ctx.lineWidth = width * 2.1;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();

  // Tapered primary & core segments (thicker at origin, sharper at tip)
  for (let i = 0; i < pts.length - 1; i += 1) {
    const uMid = (i + 0.5) / (pts.length - 1);
    const taper = 1.08 - uMid * 0.45;

    ctx.strokeStyle = withAlpha(i % 2 === 0 ? color : secondaryColor, alpha * 0.92);
    ctx.lineWidth = Math.max(1.1, width * taper);
    ctx.beginPath();
    ctx.moveTo(pts[i].x, pts[i].y);
    ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
    ctx.stroke();

    ctx.strokeStyle = withAlpha(coreColor, alpha * 0.98);
    ctx.lineWidth = Math.max(0.65, width * 0.44 * taper);
    ctx.beginPath();
    ctx.moveTo(pts[i].x, pts[i].y);
    ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
    ctx.stroke();
  }

  ctx.restore();
}
