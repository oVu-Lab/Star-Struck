/**
 * CardMergeVfxController — Luminous, lightweight dual-plane anime fantasy
 * card-upgrade effect (1100ms Lv.II, 1280ms Lv.III, 320ms reduced motion).
 *
 * Uses pure emitted white, pale champagne gold, and soft translucent light
 * bloom (zero dark brown/metallic contours or solid rings):
 *   Back Plane  (#merge-vfx-canvas, z-index 6): soft luminous halo, flowing
 *     source->target light stream, radiating light rays, broken translucent
 *     expanding arc wisps, and rear halves of curved light trails.
 *   Front Plane (#merge-vfx-fg-canvas, z-index 14): gliding card-edge light
 *     filaments, weightless reveal perimeter glimmer, front halves of thin
 *     luminous arcs, converging/outward glowing particles with fading curved
 *     trails, and sharp multi-point emissive star glints.
 */

const TWO_PI = Math.PI * 2;
const MAX_ACTIVE_EVOLUTIONS = 6;

const RARITY_ACCENTS = Object.freeze({
  r: '#ffe594',
  sr: '#e4c8ff',
  ssr: '#fff0a8',
});

// Exact [p, dy, s, rotDeg] keyframes synced with styles/battle.css (`card-merge-evolve-t2` & `-t3`)
const MOTION_KEYS_T2 = Object.freeze([
  [0.0, 0, 1.0, 0],
  [0.14, -26, 1.1, -3.6],
  [0.4, -18, 1.07, 1.8],
  [0.62, 3, 0.975, -0.6],
  [0.72, 0, 1.0, 0],
  [0.83, -5, 1.045, 0],
  [1.0, 0, 1.0, 0],
]);

const MOTION_KEYS_T3 = Object.freeze([
  [0.0, 0, 1.0, 0],
  [0.14, -32, 1.14, -4.4],
  [0.4, -22, 1.09, 2.4],
  [0.62, 3, 0.975, -0.6],
  [0.72, 0, 1.0, 0],
  [0.83, -7, 1.06, 0],
  [1.0, 0, 1.0, 0],
]);

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOutCubic(t) {
  const inv = 1 - clamp01(t);
  return 1 - inv * inv * inv;
}

function easeOutQuart(t) {
  const inv = 1 - clamp01(t);
  return 1 - inv * inv * inv * inv;
}

function easeOutExpo(t) {
  const x = clamp01(t);
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

function segmentProgress(t, start, end) {
  if (end <= start) return t >= end ? 1 : 0;
  return clamp01((t - start) / (end - start));
}

function createSeededRng(seed) {
  let s = (Math.abs(Math.floor(seed)) || 1) % 2147483647;
  if (s <= 0) s = 1337;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function cardMotionAt(p, isApex) {
  const keys = isApex ? MOTION_KEYS_T3 : MOTION_KEYS_T2;
  const x = clamp01(p);
  if (x <= keys[0][0]) return { dy: keys[0][1], s: keys[0][2], rotDeg: keys[0][3] };
  const last = keys[keys.length - 1];
  if (x >= last[0]) return { dy: last[1], s: last[2], rotDeg: last[3] };

  for (let i = 0; i < keys.length - 1; i += 1) {
    const k0 = keys[i];
    const k1 = keys[i + 1];
    if (x >= k0[0] && x <= k1[0]) {
      const span = k1[0] - k0[0] || 1;
      const segT = easeOutCubic((x - k0[0]) / span);
      return {
        dy: k0[1] + (k1[1] - k0[1]) * segT,
        s: k0[2] + (k1[2] - k0[2]) * segT,
        rotDeg: k0[3] + (k1[3] - k0[3]) * segT,
      };
    }
  }
  return { dy: 0, s: 1, rotDeg: 0 };
}

function traceRoundRect(ctx, cx, cy, hw, hh, r) {
  const rad = Math.max(0, Math.min(r, hw, hh));
  const x = cx - hw;
  const y = cy - hh;
  const w = hw * 2;
  const h = hh * 2;
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function tracePerimeterInterval(ctx, uStart, uSpan, w, h, inset = 0) {
  const perim = 2 * (w + h) || 1;
  const wEff = w + inset * 2;
  const hEff = h + inset * 2;
  const perimEff = 2 * (wEff + hEff) || 1;
  const corners = [
    0,
    w / perim,
    (w + h) / perim,
    (2 * w + h) / perim,
    1,
    1 + w / perim,
    1 + (w + h) / perim,
    1 + (2 * w + h) / perim,
    2,
  ];
  const uEnd = uStart + uSpan;
  const stops = [uStart];
  for (const c of corners) {
    if (c > uStart + 0.0005 && c < uEnd - 0.0005) {
      stops.push(c);
    }
  }
  stops.push(uEnd);

  const sampleInset = (u) => {
    const wrap = ((u % 1) + 1) % 1;
    const d = wrap * perimEff;
    const hwEff = wEff * 0.5;
    if (d < wEff) return { x: -hwEff + d, y: -h - inset };
    if (d < wEff + hEff) return { x: hwEff, y: -h - inset + (d - wEff) };
    if (d < 2 * wEff + hEff) return { x: hwEff - (d - (wEff + hEff)), y: inset };
    return { x: -hwEff, y: inset - (d - (2 * wEff + hEff)) };
  };

  ctx.beginPath();
  for (let i = 0; i < stops.length; i += 1) {
    const pt = sampleInset(stops[i]);
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  return sampleInset(uEnd);
}

function quadBezierPoint(p0, p1, p2, t) {
  const inv = 1 - t;
  return {
    x: inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x,
    y: inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y,
  };
}

/**
 * Emits soft luminous champagne-gold bloom + incandescent white specular spine.
 * Tuned so pure white cores stay legible over both dark arena and pale ivory UI
 * without dark/brown outlines.
 */
function drawLuminousPath(ctx, drawPathFn, coreWidth, alpha, goldTint = '255, 204, 54') {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // Soft translucent golden outer glow
  ctx.strokeStyle = `rgba(${goldTint}, ${alpha * 0.42})`;
  ctx.lineWidth = Math.max(2.6, coreWidth * 4.4);
  drawPathFn();
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 224, 108, ${alpha * 0.68})`;
  ctx.lineWidth = Math.max(1.5, coreWidth * 2.3);
  drawPathFn();
  ctx.stroke();

  // Crisp champagne-white & white-hot core seated inside the golden halo
  ctx.strokeStyle = `rgba(255, 248, 214, ${Math.min(1, alpha * 0.9)})`;
  ctx.lineWidth = Math.max(0.9, coreWidth * 1.15);
  drawPathFn();
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(1, alpha)})`;
  ctx.lineWidth = Math.max(0.65, coreWidth * 0.58);
  drawPathFn();
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws a fluid translucent light trail tapering smoothly from a transparent
 * tail to a luminous white-gold leading head.
 */
function drawFadingLightArc(ctx, points, maxWidth, alpha) {
  if (!points || points.length < 2 || alpha <= 0.01) return;
  const p0 = points[0];
  const pLast = points[points.length - 1];

  const tracePoints = () => {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x, points[i].y);
    }
  };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'source-over';

  // Soft outer golden light aura along curve
  if (typeof ctx.createLinearGradient === 'function') {
    const gOuter = ctx.createLinearGradient(p0.x, p0.y, pLast.x, pLast.y);
    gOuter.addColorStop(0, 'rgba(255, 204, 54, 0)');
    gOuter.addColorStop(0.5, `rgba(255, 208, 66, ${alpha * 0.56})`);
    gOuter.addColorStop(1, `rgba(255, 226, 114, ${alpha * 0.78})`);
    ctx.strokeStyle = gOuter;
  } else {
    ctx.strokeStyle = `rgba(255, 212, 76, ${alpha * 0.6})`;
  }
  ctx.lineWidth = Math.max(2.6, maxWidth * 2.8);
  tracePoints();
  ctx.stroke();

  // Slender white-gold core streak
  if (typeof ctx.createLinearGradient === 'function') {
    const gCore = ctx.createLinearGradient(p0.x, p0.y, pLast.x, pLast.y);
    gCore.addColorStop(0, 'rgba(255, 240, 176, 0)');
    gCore.addColorStop(0.55, `rgba(255, 248, 218, ${alpha * 0.88})`);
    gCore.addColorStop(1, `rgba(255, 255, 255, ${Math.min(1, alpha)})`);
    ctx.strokeStyle = gCore;
  } else {
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
  }
  ctx.lineWidth = Math.max(1.0, maxWidth);
  tracePoints();
  ctx.stroke();

  // Luminous leading tip glow
  if (typeof ctx.createRadialGradient === 'function') {
    const tipR = Math.max(3.5, maxWidth * 2.3);
    const gTip = ctx.createRadialGradient(pLast.x, pLast.y, 0.4, pLast.x, pLast.y, tipR);
    gTip.addColorStop(0, `rgba(255, 255, 255, ${Math.min(1, alpha)})`);
    gTip.addColorStop(0.42, `rgba(255, 222, 102, ${alpha * 0.76})`);
    gTip.addColorStop(1, 'rgba(255, 204, 54, 0)');
    ctx.fillStyle = gTip;
    ctx.beginPath();
    ctx.arc(pLast.x, pLast.y, tipR, 0, TWO_PI);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Pure emissive multi-point anime star flare (warm champagne-gold bloom +
 * razor-sharp white needle flare, zero dark contour).
 */
function drawEmissiveStarGlint(ctx, x, y, rx, ry, rot, isEightPoint, alpha) {
  if (alpha <= 0.01 || rx <= 0.4 || ry <= 0.4) return;
  const maxR = Math.max(rx, ry);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalCompositeOperation = 'source-over';

  // Warm luminous champagne-gold halo so sharp white needles contrast cleanly on ivory & dark navy
  if (typeof ctx.createRadialGradient === 'function') {
    const haloR = maxR * 0.72;
    const gHalo = ctx.createRadialGradient(0, 0, 0.5, 0, 0, haloR);
    gHalo.addColorStop(0, `rgba(255, 248, 214, ${alpha * 0.95})`);
    gHalo.addColorStop(0.45, `rgba(255, 210, 68, ${alpha * 0.68})`);
    gHalo.addColorStop(1, 'rgba(255, 204, 54, 0)');
    ctx.fillStyle = gHalo;
    ctx.beginPath();
    ctx.arc(0, 0, haloR, 0, TWO_PI);
    ctx.fill();
  }

  const traceNeedleStar = (ax, ay, ratio) => {
    const ir = Math.min(ax, ay) * ratio;
    ctx.beginPath();
    ctx.moveTo(ax, 0);
    ctx.lineTo(ir * 0.707, ir * 0.707);
    ctx.lineTo(0, ay);
    ctx.lineTo(-ir * 0.707, ir * 0.707);
    ctx.lineTo(-ax, 0);
    ctx.lineTo(-ir * 0.707, -ir * 0.707);
    ctx.lineTo(0, -ay);
    ctx.lineTo(ir * 0.707, -ir * 0.707);
    ctx.closePath();
  };

  // Secondary rotated needles for 8-point gleam
  if (isEightPoint) {
    ctx.save();
    ctx.rotate(Math.PI / 4);
    const sRx = rx * 0.7;
    const sRy = ry * 0.7;
    traceNeedleStar(sRx, sRy, 0.11);
    if (typeof ctx.createRadialGradient === 'function') {
      const gSec = ctx.createRadialGradient(0, 0, 0.5, 0, 0, Math.max(sRx, sRy));
      gSec.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.95})`);
      gSec.addColorStop(0.55, `rgba(255, 224, 110, ${alpha * 0.72})`);
      gSec.addColorStop(1, 'rgba(255, 204, 54, 0)');
      ctx.fillStyle = gSec;
    } else {
      ctx.fillStyle = `rgba(255, 240, 180, ${alpha * 0.85})`;
    }
    ctx.fill();
    ctx.restore();
  }

  // Primary soft outer gold-white flare sheen + crisp white core
  traceNeedleStar(rx * 1.08, ry * 1.08, 0.14);
  ctx.fillStyle = `rgba(255, 214, 82, ${alpha * 0.58})`;
  ctx.fill();

  traceNeedleStar(rx, ry, 0.1);
  if (typeof ctx.createRadialGradient === 'function') {
    const gMain = ctx.createRadialGradient(0, 0, 0.5, 0, 0, maxR);
    gMain.addColorStop(0, `rgba(255, 255, 255, ${Math.min(1, alpha)})`);
    gMain.addColorStop(0.65, `rgba(255, 246, 204, ${alpha * 0.86})`);
    gMain.addColorStop(1, 'rgba(255, 224, 120, 0)');
    ctx.fillStyle = gMain;
  } else {
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  }
  ctx.fill();

  // Pure white pinpoint center
  ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, alpha)})`;
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1.3, maxR * 0.13), 0, TWO_PI);
  ctx.fill();

  ctx.restore();
}

/**
 * Translucent radiating light ray / anime sunbeam behind the card (zero outline).
 */
function drawLightRay(ctx, cx, cy, angle, rInner, rOuter, baseWidth, alpha) {
  if (alpha <= 0.01) return;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const nx = -sin;
  const ny = cos;

  const x0 = cx + cos * rInner;
  const y0 = cy + sin * rInner;
  const x1 = cx + cos * rOuter;
  const y1 = cy + sin * rOuter;
  const hwIn = baseWidth * 0.35;
  const hwOut = baseWidth * 1.15;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  ctx.moveTo(x0 + nx * hwIn, y0 + ny * hwIn);
  ctx.lineTo(x1 + nx * hwOut, y1 + ny * hwOut);
  ctx.lineTo(x1 - nx * hwOut, y1 - ny * hwOut);
  ctx.lineTo(x0 - nx * hwIn, y0 - ny * hwIn);
  ctx.closePath();

  if (typeof ctx.createLinearGradient === 'function') {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, `rgba(255, 252, 232, ${alpha * 0.9})`);
    g.addColorStop(0.48, `rgba(255, 212, 74, ${alpha * 0.58})`);
    g.addColorStop(1, 'rgba(255, 204, 54, 0)');
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = `rgba(255, 224, 114, ${alpha * 0.6})`;
  }
  ctx.fill();

  // Fine bright white-gold filament along center of ray
  ctx.lineCap = 'round';
  if (typeof ctx.createLinearGradient === 'function') {
    const gCore = ctx.createLinearGradient(x0, y0, x1, y1);
    gCore.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.85})`);
    gCore.addColorStop(0.65, `rgba(255, 244, 196, ${alpha * 0.42})`);
    gCore.addColorStop(1, 'rgba(255, 214, 92, 0)');
    ctx.strokeStyle = gCore;
  } else {
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.7})`;
  }
  ctx.lineWidth = Math.max(0.9, baseWidth * 0.3);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();

  ctx.restore();
}

/**
 * Soft glowing light mote (translucent warm-gold bloom + pure white-gold core).
 */
function drawGlowParticle(ctx, x, y, radius, alpha, isWhite = true) {
  if (alpha <= 0.01 || radius <= 0.2) return;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  if (typeof ctx.createRadialGradient === 'function') {
    const bloomR = radius * 3.1;
    const g = ctx.createRadialGradient(x, y, 0.2, x, y, bloomR);
    g.addColorStop(0, `rgba(255, 248, 220, ${alpha * 0.88})`);
    g.addColorStop(0.45, `rgba(255, 206, 62, ${alpha * 0.64})`);
    g.addColorStop(1, 'rgba(255, 204, 54, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, bloomR, 0, TWO_PI);
    ctx.fill();
  }

  ctx.fillStyle = isWhite
    ? `rgba(255, 255, 255, ${Math.min(1, alpha)})`
    : `rgba(255, 244, 186, ${Math.min(1, alpha * 0.94)})`;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TWO_PI);
  ctx.fill();
  ctx.restore();
}

export class CardMergeVfxController {
  constructor(canvas = null, fgCanvas = null) {
    this._canvas = canvas || null;
    this._fgCanvas = fgCanvas || null;
    const rawCtx = typeof canvas?.getContext === 'function' ? canvas.getContext('2d') : null;
    this._ctx = rawCtx && typeof rawCtx.arc === 'function' ? rawCtx : null;
    const rawFgCtx = typeof fgCanvas?.getContext === 'function' ? fgCanvas.getContext('2d') : null;
    this._fgCtx = rawFgCtx && typeof rawFgCtx.arc === 'function' ? rawFgCtx : null;
    this._evolutions = [];
    this._rafId = null;
    this._logicalW = 920;
    this._logicalH = 260;
    this._dpr = 1;
    this._seq = 0;
  }

  get activeCount() {
    return this._evolutions.length;
  }

  getActiveEvolutions() {
    return this._evolutions.map((ev) => ({
      id: ev.id,
      sourceIndex: ev.sourceIndex,
      targetIndex: ev.targetIndex,
      fromTier: ev.fromTier,
      toTier: ev.toTier,
      rarity: ev.rarity,
      durationMs: ev.durationMs,
    }));
  }

  playMerge({
    sourceIndex = -1,
    targetIndex = -1,
    fromTier = 1,
    toTier = 2,
    rarity = 'r',
    sourceRect = null,
    targetRect = null,
    canvasRect = null,
  } = {}) {
    if (targetIndex < 0) return null;

    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this._syncSize();

    const originX = canvasRect?.left ?? 0;
    const originY = canvasRect?.top ?? 0;
    const hasCoords = Boolean(
      canvasRect &&
        targetRect &&
        targetRect.width > 0 &&
        targetRect.height > 0,
    );

    const tgtBox = hasCoords
      ? {
          x: targetRect.left - originX,
          y: targetRect.top - originY,
          w: targetRect.width,
          h: targetRect.height,
        }
      : {
          x: 200 + targetIndex * 100,
          y: 100,
          w: 102,
          h: 150,
        };

    const srcBox =
      hasCoords && sourceRect && sourceRect.width > 0 && sourceRect.height > 0
        ? {
            x: sourceRect.left - originX,
            y: sourceRect.top - originY,
            w: sourceRect.width,
            h: sourceRect.height,
          }
        : {
            x: 200 + Math.max(0, sourceIndex) * 100,
            y: 100,
            w: tgtBox.w,
            h: tgtBox.h,
          };

    const srcCenter = { x: srcBox.x + srcBox.w * 0.5, y: srcBox.y + srcBox.h * 0.5 };
    const tgtCenter = { x: tgtBox.x + tgtBox.w * 0.5, y: tgtBox.y + tgtBox.h * 0.5 };

    const normalizedToTier = toTier >= 3 ? 3 : 2;
    const normalizedFromTier = Math.max(1, normalizedToTier - 1);
    const isApex = normalizedToTier >= 3;
    const durationMs = reducedMotion ? 320 : isApex ? 1280 : 1100;
    const rarityKey = String(rarity || 'r').toLowerCase();
    const accentColor = RARITY_ACCENTS[rarityKey] || RARITY_ACCENTS.r;

    const seq = ++this._seq;
    const rng = createSeededRng(seq * 149 + sourceIndex * 23 + targetIndex * 41 + normalizedToTier * 19);

    // Layer B3: Radiating golden-white sunbeam rays behind the card (0.02 -> 0.44)
    const rayCount = isApex ? 14 : 8;
    const rays = [];
    for (let i = 0; i < rayCount; i += 1) {
      const a = (i / rayCount) * TWO_PI + (rng() - 0.5) * 0.16;
      const isMajor = i % 2 === 0;
      rays.push({
        angle: a,
        outerFactor: (isMajor ? (isApex ? 1.54 : 1.46) : 1.38) + rng() * 0.08,
        aspectScale: Math.abs(Math.cos(a)) * 0.96 + Math.abs(Math.sin(a)) * 1.15,
        width: isMajor ? (isApex ? 9.5 : 7.5) : 5.2,
        delay: rng() * 0.05,
      });
    }

    // Layer B4: Broken translucent expanding light-trail arc wisps (NO closed metal rings)
    const ripples = [];
    const primaryCount = isApex ? 4 : 3;
    for (let i = 0; i < primaryCount; i += 1) {
      const a0 = (i / primaryCount) * TWO_PI + 0.35 + (rng() - 0.5) * 0.18;
      ripples.push({
        start: 0.04,
        end: isApex ? 0.68 : 0.62,
        baseAngle: a0,
        span: 1.05 + rng() * 0.35,
        spin: (i % 2 === 0 ? 1 : -1) * 0.65,
        startRatio: 0.94,
        endRatio: isApex ? 1.46 : 1.4,
        width: isApex ? 2.8 : 2.3,
      });
    }
    if (isApex) {
      for (let i = 0; i < 4; i += 1) {
        const a0 = (i / 4) * TWO_PI + Math.PI / 4 + (rng() - 0.5) * 0.16;
        ripples.push({
          start: 0.16,
          end: 0.78,
          baseAngle: a0,
          span: 0.95 + rng() * 0.3,
          spin: -0.55,
          startRatio: 1.0,
          endRatio: 1.5,
          width: 2.1,
        });
      }
    }

    // Layer B5/F2: Thin, fluid fading light arcs wrapping smoothly around card (back + front)
    const arcs = isApex
      ? [
          {
            start: 0.05,
            end: 0.74,
            tilt: -0.44,
            rxFactor: 1.38,
            ryFactor: 0.42,
            offsetY: 10,
            startTheta: -Math.PI * 0.65,
            sweep: Math.PI * 1.85,
            arcLen: Math.PI * 0.72,
            width: 3.1,
          },
          {
            start: 0.09,
            end: 0.78,
            tilt: -0.44,
            rxFactor: 1.36,
            ryFactor: 0.4,
            offsetY: -6,
            startTheta: Math.PI * 0.35,
            sweep: Math.PI * 1.85,
            arcLen: Math.PI * 0.66,
            width: 2.8,
          },
          {
            start: 0.18,
            end: 0.86,
            tilt: 0.5,
            rxFactor: 1.44,
            ryFactor: 0.36,
            offsetY: 4,
            startTheta: -Math.PI * 0.22,
            sweep: -Math.PI * 1.72,
            arcLen: Math.PI * 0.62,
            width: 2.5,
          },
          {
            start: 0.22,
            end: 0.88,
            tilt: 0.5,
            rxFactor: 1.42,
            ryFactor: 0.36,
            offsetY: 14,
            startTheta: Math.PI * 0.78,
            sweep: -Math.PI * 1.72,
            arcLen: Math.PI * 0.58,
            width: 2.3,
          },
        ]
      : [
          {
            start: 0.06,
            end: 0.74,
            tilt: -0.46,
            rxFactor: 1.36,
            ryFactor: 0.4,
            offsetY: 10,
            startTheta: -Math.PI * 0.62,
            sweep: Math.PI * 1.75,
            arcLen: Math.PI * 0.68,
            width: 2.8,
          },
          {
            start: 0.12,
            end: 0.8,
            tilt: -0.46,
            rxFactor: 1.34,
            ryFactor: 0.38,
            offsetY: -5,
            startTheta: Math.PI * 0.38,
            sweep: Math.PI * 1.75,
            arcLen: Math.PI * 0.6,
            width: 2.4,
          },
        ];

    // Layer F3a: Fine luminous light wisps curving inward into card edge (0.00 -> 0.22)
    const inwardCount = isApex ? 6 : 4;
    const inwardWisps = [];
    for (let i = 0; i < inwardCount; i += 1) {
      const angle = (i / inwardCount) * TWO_PI + 0.36 + (rng() - 0.5) * 0.26;
      inwardWisps.push({
        angle,
        curveSide: i % 2 === 0 ? 1 : -1,
        startDistRatio: 1.38 + rng() * 0.14,
        radius: 1.5 + rng() * 1.1,
        delay: rng() * 0.05,
        isWhite: i % 2 === 0,
      });
    }

    // Layer F3b: Fine glowing particles + curved luminous streak wisps drifting outward (0.06 -> 0.84)
    const particleCount = isApex ? 28 : 16;
    const particles = [];
    for (let i = 0; i < particleCount; i += 1) {
      const a = (i / particleCount) * TWO_PI + (rng() - 0.5) * 0.32;
      // Keep the upper LEVEL UP pill band (-PI/2 +- 0.38) clear
      const normUp = Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2)));
      const safeAngle = normUp < 0.38 ? a + (a > -Math.PI / 2 ? 0.4 : -0.4) : a;
      particles.push({
        angle: safeAngle,
        curveSwirl: (i % 2 === 0 ? 1 : -1) * (0.28 + rng() * 0.26),
        startRatio: 0.82 + rng() * 0.18,
        endRatio: (isApex ? 1.44 : 1.38) + rng() * 0.18,
        upDrift: 6 + rng() * 12,
        radius: 1.2 + rng() * 2.2,
        hasStreak: i % 2 === 0,
        isWhite: i % 3 === 0 || rng() > 0.5,
        delay: rng() * 0.2,
      });
    }

    // Layer F4: Card-local corner & frame emissive multi-point star glints
    const halfW = tgtBox.w * 0.5;
    const fullH = tgtBox.h;
    const glints = isApex
      ? [
          { lx: -halfW, ly: -fullH, rx: 16, ry: 14, start: 0.1, dur: 0.24, rot: 0, eightPoint: true },
          { lx: halfW, ly: -fullH, rx: 19, ry: 16, start: 0.16, dur: 0.24, rot: 0.18, eightPoint: true },
          { lx: halfW, ly: 0, rx: 14, ry: 12, start: 0.24, dur: 0.24, rot: -0.15, eightPoint: true },
          { lx: -halfW, ly: 0, rx: 15, ry: 13, start: 0.32, dur: 0.24, rot: 0.12, eightPoint: true },
          { lx: halfW, ly: -fullH * 0.48, rx: 12, ry: 10.5, start: 0.38, dur: 0.2, rot: 0, eightPoint: false },
          { lx: -halfW, ly: -fullH * 0.52, rx: 11.5, ry: 10, start: 0.44, dur: 0.2, rot: 0.1, eightPoint: false },
          { lx: 0, ly: 0, rx: 13, ry: 11, start: 0.48, dur: 0.22, rot: -0.08, eightPoint: false },
          { lx: -halfW * 0.55, ly: -fullH, rx: 12.5, ry: 11, start: 0.52, dur: 0.2, rot: 0.08, eightPoint: false },
          { lx: halfW * 0.55, ly: -fullH, rx: 14, ry: 12, start: 0.56, dur: 0.2, rot: -0.12, eightPoint: false },
          // Crown reveal 8-point flash at card top center (below LEVEL UP pill)
          { lx: 0, ly: -fullH, rx: 22, ry: 19, start: 0.72, dur: 0.26, rot: 0.22, eightPoint: true },
        ]
      : [
          { lx: -halfW, ly: -fullH, rx: 13, ry: 11, start: 0.12, dur: 0.22, rot: 0, eightPoint: false },
          { lx: halfW, ly: -fullH, rx: 15, ry: 13, start: 0.2, dur: 0.22, rot: 0.16, eightPoint: false },
          { lx: halfW, ly: 0, rx: 12, ry: 10.5, start: 0.34, dur: 0.22, rot: -0.12, eightPoint: false },
          { lx: -halfW, ly: 0, rx: 13, ry: 11, start: 0.44, dur: 0.22, rot: 0.1, eightPoint: false },
          // Crisp final highlight corner glint
          { lx: halfW, ly: -fullH, rx: 16, ry: 14, start: 0.72, dur: 0.24, rot: 0.2, eightPoint: true },
        ];

    const evolution = {
      id: seq,
      sourceIndex,
      targetIndex,
      fromTier: normalizedFromTier,
      toTier: normalizedToTier,
      rarity: rarityKey,
      accentColor,
      srcBox,
      tgtBox,
      srcCenter,
      tgtCenter,
      rays,
      ripples,
      arcs,
      inwardWisps,
      particles,
      glints,
      reducedMotion,
      startMs: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      durationMs,
    };

    while (this._evolutions.length >= MAX_ACTIVE_EVOLUTIONS) {
      this._evolutions.shift();
    }
    this._evolutions.push(evolution);
    this._ensureRunning();
    return evolution;
  }

  resize() {
    this._syncSize();
    if (this._evolutions.length > 0) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this._drawAll(now);
    }
  }

  clear() {
    if (this._ctx && this._canvas) {
      this._ctx.clearRect(0, 0, this._canvas.width || 0, this._canvas.height || 0);
    }
    if (this._fgCtx && this._fgCanvas) {
      this._fgCtx.clearRect(0, 0, this._fgCanvas.width || 0, this._fgCanvas.height || 0);
    }
  }

  stop() {
    this._evolutions = [];
    if (this._rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._rafId);
    }
    this._rafId = null;
    this.clear();
  }

  _ensureRunning() {
    if (this._rafId !== null) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this._drawAll(now);
    if (typeof requestAnimationFrame !== 'function') return;

    const tick = (ts) => {
      this._rafId = null;
      const alive = this._drawAll(ts);
      if (alive) {
        this._rafId = requestAnimationFrame(tick);
      } else {
        this.clear();
      }
    };
    this._rafId = requestAnimationFrame(tick);
  }

  _syncSize() {
    const measureCanvas = this._canvas || this._fgCanvas;
    if (!measureCanvas) return;
    const rect =
      typeof measureCanvas.getBoundingClientRect === 'function'
        ? measureCanvas.getBoundingClientRect()
        : null;
    const w = Math.max(320, Math.round(rect?.width || measureCanvas.clientWidth || 920));
    const h = Math.max(180, Math.round(rect?.height || measureCanvas.clientHeight || 260));
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);

    if (this._canvas && (this._canvas.width !== targetW || this._canvas.height !== targetH)) {
      this._canvas.width = targetW;
      this._canvas.height = targetH;
    }
    if (this._fgCanvas && (this._fgCanvas.width !== targetW || this._fgCanvas.height !== targetH)) {
      this._fgCanvas.width = targetW;
      this._fgCanvas.height = targetH;
    }
    this._dpr = dpr;
    this._logicalW = w;
    this._logicalH = h;
  }

  _drawAll(nowMs) {
    this._evolutions = this._evolutions.filter(
      (ev) => nowMs - ev.startMs < ev.durationMs,
    );
    if (this._evolutions.length === 0) {
      return false;
    }
    if (!this._ctx && !this._fgCtx) {
      return true;
    }

    const dpr = this._dpr || 1;
    const bgCtx = this._ctx;
    const fgCtx = this._fgCtx || bgCtx;

    if (bgCtx) {
      bgCtx.save();
      bgCtx.setTransform?.(dpr, 0, 0, dpr, 0, 0);
      bgCtx.clearRect(0, 0, this._logicalW, this._logicalH);
    }
    if (fgCtx && fgCtx !== bgCtx) {
      fgCtx.save();
      fgCtx.setTransform?.(dpr, 0, 0, dpr, 0, 0);
      fgCtx.clearRect(0, 0, this._logicalW, this._logicalH);
    }

    for (const ev of this._evolutions) {
      const progress = clamp01((nowMs - ev.startMs) / ev.durationMs);
      if (ev.reducedMotion) {
        if (bgCtx) this._drawReducedMotion(bgCtx, ev, progress);
      } else {
        this._drawComposition(bgCtx, fgCtx, ev, progress);
      }
    }

    if (bgCtx) bgCtx.restore();
    if (fgCtx && fgCtx !== bgCtx) fgCtx.restore();
    return true;
  }

  _drawReducedMotion(ctx, ev, p) {
    const fade = Math.sin(p * Math.PI);
    const { tgtBox, toTier } = ev;
    const isApex = toTier >= 3;
    const hw = tgtBox.w * 0.5;
    const hh = tgtBox.h * 0.5;
    const cx = tgtBox.x + hw;
    const cy = tgtBox.y + hh;
    const r = hw * 1.24;

    ctx.save();
    if (typeof ctx.createRadialGradient === 'function') {
      const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
      grad.addColorStop(0, `rgba(255, 255, 255, ${fade * (isApex ? 0.65 : 0.5)})`);
      grad.addColorStop(0.6, `rgba(255, 230, 142, ${fade * (isApex ? 0.36 : 0.24)})`);
      grad.addColorStop(1, 'rgba(255, 214, 92, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TWO_PI);
      ctx.fill();
    }

    drawLuminousPath(
      ctx,
      () => traceRoundRect(ctx, cx, cy, hw + 2, hh + 2, 5),
      1.1,
      fade * 0.85,
    );
    ctx.restore();
  }

  _drawComposition(bgCtx, fgCtx, ev, p) {
    const { tgtBox, srcCenter, toTier } = ev;
    const isApex = toTier >= 3;
    const w = tgtBox.w;
    const h = tgtBox.h;

    const motion = cardMotionAt(p, isApex);
    const rotRad = (motion.rotDeg * Math.PI) / 180;
    const pivotX = tgtBox.x + w * 0.5;
    const pivotY = tgtBox.y + h + motion.dy;
    const hw = w * motion.s * 0.5;
    const hh = h * motion.s * 0.5;
    const cx = pivotX + Math.sin(rotRad) * hh;
    const cy = pivotY - Math.cos(rotRad) * hh;

    // ------------------------------------------------------------------------
    // BACK PLANE (#merge-vfx-canvas, z-index 6)
    // ------------------------------------------------------------------------
    if (bgCtx) {
      bgCtx.save();

      // B1. Soft Luminous White-Champagne Halo (0.00 -> 0.54 + final pulse 0.70 -> 0.98)
      this._drawLuminousHalo(bgCtx, cx, cy, hw, hh, p, isApex);

      // B2. Flowing Source -> Target Light Stream (0.00 -> 0.18)
      this._drawSourceTransferStream(bgCtx, srcCenter, { x: cx, y: cy }, p, isApex);

      // B3. Brief Radiating Light Rays (0.02 -> 0.44)
      this._drawRadiatingLightRays(bgCtx, ev, cx, cy, hw, p, isApex);

      // B4. Broken Translucent Expanding Light Ripples (0.04 -> 0.64)
      this._drawBrokenLightRipples(bgCtx, ev, cx, cy, hw, hh, p);

      // B5. Rear Halves of Thin Luminous Energy Arcs (0.06 -> 0.76)
      this._drawLuminousArcsPass(bgCtx, ev, cx, cy, hw, hh, p, false);

      bgCtx.restore();
    }

    // ------------------------------------------------------------------------
    // FRONT PLANE (#merge-vfx-fg-canvas, z-index 14)
    // ------------------------------------------------------------------------
    if (fgCtx) {
      fgCtx.save();

      // F1 & F4 (Card-Locked Local Coords): Card-Edge Light Filaments, Reveal Glimmer & Frame Star Glints
      this._drawCardLockedFrontLight(fgCtx, ev, pivotX, pivotY, rotRad, motion.s, w, h, p, isApex);

      // F2. Front Halves of Thin Luminous Energy Arcs (sin(theta) >= 0)
      this._drawLuminousArcsPass(fgCtx, ev, cx, cy, hw, hh, p, true);

      // F3. Converging Inward Wisps (0.00 -> 0.22) + Outward Glowing Particles & Light Streaks (0.06 -> 0.84)
      this._drawParticlesAndStreaks(fgCtx, ev, cx, cy, hw, p, isApex);

      fgCtx.restore();
    }
  }

  _drawLuminousHalo(ctx, cx, cy, hw, hh, p, isApex) {
    const earlyGlow = Math.sin(segmentProgress(p, 0.0, 0.58) * Math.PI);
    const finalPulse = Math.sin(segmentProgress(p, 0.7, 0.98) * Math.PI) * (isApex ? 0.98 : 0.8);
    const alpha = Math.max(earlyGlow * (isApex ? 0.94 : 0.82), finalPulse);
    if (alpha <= 0.01 || typeof ctx.createRadialGradient !== 'function') return;

    const r = Math.max(hw, hh) * (isApex ? 1.42 : 1.32);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
    g.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.98})`);
    g.addColorStop(0.45, `rgba(255, 228, 126, ${alpha * 0.72})`);
    g.addColorStop(0.78, `rgba(255, 206, 56, ${alpha * 0.42})`);
    g.addColorStop(1, 'rgba(255, 204, 54, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  _drawSourceTransferStream(ctx, src, dst, p, isApex) {
    const linkT = segmentProgress(p, 0.0, 0.18);
    const dist = Math.hypot(dst.x - src.x, dst.y - src.y);
    if (linkT <= 0 || linkT >= 1 || dist <= 8) return;

    const ctrl = {
      x: (src.x + dst.x) * 0.5,
      y: Math.min(src.y, dst.y) - Math.min(34, 16 + dist * 0.1),
    };
    const head = easeOutExpo(linkT);
    const tail = easeOutCubic(clamp01((linkT - 0.16) * 1.4));
    const steps = 12;
    const pts = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = tail + (head - tail) * (i / steps);
      pts.push(quadBezierPoint(src, ctrl, dst, t));
    }

    const alpha = Math.sin(linkT * Math.PI) * (isApex ? 0.96 : 0.9);
    drawFadingLightArc(ctx, pts, isApex ? 3.2 : 2.5, alpha);

    const tip = pts[pts.length - 1];
    drawEmissiveStarGlint(ctx, tip.x, tip.y, isApex ? 11 : 9, isApex ? 9 : 7.5, linkT * 1.2, false, alpha);
  }

  _drawRadiatingLightRays(ctx, ev, cx, cy, hw, p, isApex) {
    const rayEnv = segmentProgress(p, 0.02, 0.44);
    if (rayEnv <= 0 || rayEnv >= 1) return;

    for (const ray of ev.rays) {
      const rt = clamp01((rayEnv - ray.delay) / (1 - ray.delay));
      if (rt <= 0 || rt >= 1) continue;

      const alpha = Math.min(1, rt * 4.5) * (1 - easeOutCubic(rt)) * (isApex ? 0.92 : 0.82);
      const reach = easeOutExpo(rt);
      const rInner = hw * 0.72;
      const rOuter = hw * (0.98 + (ray.outerFactor - 0.98) * reach) * ray.aspectScale * 0.95;
      drawLightRay(ctx, cx, cy, ray.angle, rInner, rOuter, ray.width * (1 - rt * 0.25), alpha);
    }
  }

  _drawBrokenLightRipples(ctx, ev, cx, cy, hw, hh, p) {
    for (const rp of ev.ripples) {
      const rt = segmentProgress(p, rp.start, rp.end);
      if (rt <= 0 || rt >= 1) continue;

      const grow = easeOutQuart(rt);
      const rx = hw * (rp.startRatio + (rp.endRatio - rp.startRatio) * grow);
      const ry = hh * (0.9 + (rp.endRatio - rp.startRatio) * 0.48 * grow);
      const alpha = Math.min(1, rt * 5.2) * (1 - easeOutCubic(rt)) * 0.9;
      if (alpha <= 0.01) continue;

      const a0 = rp.baseAngle + rp.spin * rt;
      const a1 = a0 + rp.span * (1 - rt * 0.22);
      const steps = 10;
      const pts = [];
      for (let i = 0; i <= steps; i += 1) {
        const a = a0 + (a1 - a0) * (i / steps);
        pts.push({
          x: cx + Math.cos(a) * rx,
          y: cy + Math.sin(a) * ry,
        });
      }
      drawFadingLightArc(ctx, pts, rp.width * (1 - rt * 0.35), alpha);
    }
  }

  _drawLuminousArcsPass(ctx, ev, cx, cy, hw, hh, p, isFrontPass) {
    for (const arc of ev.arcs) {
      const at = segmentProgress(p, arc.start, arc.end);
      if (at <= 0 || at >= 1) continue;

      const alpha = Math.min(1, at * 5.0) * (1 - easeOutCubic(at)) * 0.94;
      if (alpha <= 0.01) continue;

      const head = arc.startTheta + arc.sweep * easeOutCubic(at);
      const lenScale = Math.sin(at * Math.PI);
      const span = arc.arcLen * (0.45 + 0.55 * lenScale);
      const tail = head - Math.sign(arc.sweep || 1) * span;

      const rx = hw * arc.rxFactor;
      const ry = hh * arc.ryFactor;
      const cosT = Math.cos(arc.tilt);
      const sinT = Math.sin(arc.tilt);
      const sampleSteps = 22;

      let currentRun = [];
      const flushRun = (runPts) => {
        if (runPts.length >= 2) {
          drawFadingLightArc(ctx, runPts, arc.width * (0.75 + 0.25 * lenScale), alpha);
        }
      };

      for (let i = 0; i <= sampleSteps; i += 1) {
        const f = i / sampleSteps;
        const theta = tail + (head - tail) * f;
        const depthFront = Math.sin(theta) >= 0;
        if (depthFront === isFrontPass) {
          const lx = rx * Math.cos(theta);
          const ly = ry * Math.sin(theta);
          currentRun.push({
            x: cx + lx * cosT - ly * sinT,
            y: cy + arc.offsetY + lx * sinT + ly * cosT,
          });
        } else {
          flushRun(currentRun);
          currentRun = [];
        }
      }
      flushRun(currentRun);
    }
  }

  _drawCardLockedFrontLight(ctx, ev, pivotX, pivotY, rotRad, scale, w, h, p, isApex) {
    ctx.save();
    ctx.translate(pivotX, pivotY);
    ctx.rotate(rotRad);
    ctx.scale(scale, scale);

    // F1a. Flowing Card-Edge Light Filaments gliding cleanly along border (0.04 -> 0.76)
    const edgeT = segmentProgress(p, 0.04, 0.76);
    if (edgeT > 0 && edgeT < 1) {
      const edgeAlpha = Math.sin(edgeT * Math.PI) * (isApex ? 0.96 : 0.9);
      const streamCount = isApex ? 3 : 2;
      const streamSpan = isApex ? 0.22 : 0.25;
      const speed = isApex ? 1.5 : 1.3;

      for (let i = 0; i < streamCount; i += 1) {
        const u0 = i / streamCount + edgeT * speed;
        let tip = null;
        drawLuminousPath(
          ctx,
          () => {
            tip = tracePerimeterInterval(ctx, u0, streamSpan, w, h, 0.5);
          },
          isApex ? 1.55 : 1.35,
          edgeAlpha,
        );
        if (tip) {
          drawEmissiveStarGlint(
            ctx,
            tip.x,
            tip.y,
            isApex ? 8.5 : 7,
            isApex ? 7 : 6,
            edgeT * 2.1 + i,
            false,
            edgeAlpha,
          );
        }
      }
    }

    // F1b. Weightless Final Luminous Edge Glimmer (0.72 -> 0.96, zero heavy brackets)
    const shimmerT = segmentProgress(p, 0.72, 0.96);
    if (shimmerT > 0 && shimmerT < 1) {
      const shimmerAlpha = Math.sin(shimmerT * Math.PI) * (isApex ? 0.95 : 0.78);
      drawLuminousPath(
        ctx,
        () => traceRoundRect(ctx, 0, -h * 0.5, w * 0.5 + 1, h * 0.5 + 1, 5),
        isApex ? 1.5 : 1.1,
        shimmerAlpha,
      );
    }

    // F4. Crisp multi-point emissive star glints near card-frame corners & edge accents
    for (const g of ev.glints) {
      const gt = segmentProgress(p, g.start, g.start + g.dur);
      if (gt <= 0 || gt >= 1) continue;
      const scalePulse = Math.sin(gt * Math.PI);
      const alpha = Math.min(1, scalePulse * 1.25);
      drawEmissiveStarGlint(
        ctx,
        g.lx,
        g.ly,
        g.rx * scalePulse,
        g.ry * scalePulse,
        g.rot + gt * 0.55,
        g.eightPoint,
        alpha,
      );
    }

    ctx.restore();
  }

  _drawParticlesAndStreaks(ctx, ev, cx, cy, hw, p, isApex) {
    // F3a. Converging inward luminous wisps curving into card edge (0.00 -> 0.22)
    const inEnv = segmentProgress(p, 0.0, 0.22);
    if (inEnv > 0 && inEnv < 1) {
      for (const wisp of ev.inwardWisps) {
        const wt = clamp01((inEnv - wisp.delay) / (1 - wisp.delay));
        if (wt <= 0 || wt >= 1) continue;

        const prog = easeOutCubic(wt);
        const startR = hw * wisp.startDistRatio;
        const endR = hw * 0.88;
        const p0 = { x: cx + Math.cos(wisp.angle) * startR, y: cy + Math.sin(wisp.angle) * startR * 1.14 };
        const p2 = { x: cx + Math.cos(wisp.angle) * endR, y: cy + Math.sin(wisp.angle) * endR * 1.1 };
        const perp = wisp.angle + (Math.PI / 2) * wisp.curveSide;
        const p1 = {
          x: (p0.x + p2.x) * 0.5 + Math.cos(perp) * 16,
          y: (p0.y + p2.y) * 0.5 + Math.sin(perp) * 16,
        };

        const pts = [];
        const tailStart = Math.max(0, prog - 0.28);
        for (let s = 0; s <= 5; s += 1) {
          pts.push(quadBezierPoint(p0, p1, p2, tailStart + (prog - tailStart) * (s / 5)));
        }
        const alpha = Math.sin(wt * Math.PI) * (isApex ? 0.94 : 0.86);
        drawFadingLightArc(ctx, pts, 1.6, alpha);
        const cur = pts[pts.length - 1];
        drawGlowParticle(ctx, cur.x, cur.y, wisp.radius, alpha, wisp.isWhite);
      }
    }

    // F3b. Fine glowing particles & short curved light-streak wisps drifting cleanly outward (0.06 -> 0.90)
    const outEnv = segmentProgress(p, 0.06, 0.9);
    if (outEnv > 0 && outEnv < 1) {
      for (const pt of ev.particles) {
        const ft = clamp01((outEnv - pt.delay) / (1 - pt.delay));
        if (ft <= 0 || ft >= 1) continue;

        const prog = easeOutCubic(ft);
        const alpha = Math.min(1, ft * 4.8) * (1 - easeOutCubic(ft)) * (isApex ? 0.95 : 0.88);
        if (alpha <= 0.01) continue;

        const rStart = hw * pt.startRatio;
        const rEnd = hw * pt.endRatio;
        const aEnd = pt.angle + pt.curveSwirl;
        const aMid = pt.angle + pt.curveSwirl * 0.45;
        const rMid = (rStart + rEnd) * 0.54;

        const p0 = { x: cx + Math.cos(pt.angle) * rStart, y: cy + Math.sin(pt.angle) * rStart * 1.14 };
        const p1 = { x: cx + Math.cos(aMid) * rMid, y: cy + Math.sin(aMid) * rMid * 1.16 - pt.upDrift * 0.45 };
        const p2 = { x: cx + Math.cos(aEnd) * rEnd, y: cy + Math.sin(aEnd) * rEnd * 1.1 - pt.upDrift };

        const cur = quadBezierPoint(p0, p1, p2, prog);
        if (pt.hasStreak) {
          const tailStart = Math.max(0, prog - 0.24 * (1 - prog * 0.25));
          const streakPts = [];
          for (let s = 0; s <= 5; s += 1) {
            streakPts.push(quadBezierPoint(p0, p1, p2, tailStart + (prog - tailStart) * (s / 5)));
          }
          drawFadingLightArc(ctx, streakPts, Math.max(1.0, pt.radius * 0.65), alpha * 0.86);
        }
        drawGlowParticle(ctx, cur.x, cur.y, pt.radius, alpha, pt.isWhite);
      }
    }
  }
}
