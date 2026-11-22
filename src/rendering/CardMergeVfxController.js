/**
 * CardMergeVfxController — Balanced multi-stage on-demand 2D Canvas behind-card
 * merge evolution effect (1080ms Lv.II, 1260ms Lv.III).
 *
 * Coordinates three overlapping stages — Impact, Upgrade (rings, light streaks,
 * outward sparks), and Reveal (finishing glow pulse) — using rich burnished-gold
 * contrast strokes paired with warm white-gold cores so every element reads
 * cleanly over both the dark arena and warm-ivory command dock.
 */

const TWO_PI = Math.PI * 2;
const MAX_ACTIVE_EVOLUTIONS = 6;

const RARITY_ACCENTS = Object.freeze({
  r: '#f0bc42',
  sr: '#b882f2',
  ssr: '#ffd14d',
});

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

function drawPolygonRing(ctx, cx, cy, radius, sides, rotation) {
  ctx.beginPath();
  for (let i = 0; i <= sides; i += 1) {
    const a = rotation + (i / sides) * TWO_PI;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawStarGlint(ctx, cx, cy, radius, rotation = 0) {
  const inner = radius * 0.36;
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const r = i % 2 === 0 ? radius : inner;
    const a = rotation + (i * Math.PI) / 4;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export class CardMergeVfxController {
  constructor(canvas = null) {
    this._canvas = canvas || null;
    const rawCtx = typeof canvas?.getContext === 'function' ? canvas.getContext('2d') : null;
    this._ctx = rawCtx && typeof rawCtx.arc === 'function' ? rawCtx : null;
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
          w: 94,
          h: 140,
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
    const tgtCenter = { x: tgtBox.x + tgtBox.w * 0.5, y: tgtBox.y + tgtBox.h * 0.44 };

    const normalizedToTier = toTier >= 3 ? 3 : 2;
    const normalizedFromTier = Math.max(1, normalizedToTier - 1);
    const durationMs = reducedMotion ? 320 : normalizedToTier >= 3 ? 1260 : 1080;
    const rarityKey = String(rarity || 'r').toLowerCase();
    const accentColor = RARITY_ACCENTS[rarityKey] || RARITY_ACCENTS.r;

    const seq = ++this._seq;
    const rng = createSeededRng(seq * 97 + sourceIndex * 19 + targetIndex * 31 + normalizedToTier * 13);

    // Prominent tapered radial light streaks behind and around the target card
    const streakCount = normalizedToTier >= 3 ? 16 : 10;
    const streaks = [];
    for (let i = 0; i < streakCount; i += 1) {
      const baseAngle = (i / streakCount) * TWO_PI - Math.PI / 2 + (rng() - 0.5) * 0.16;
      streaks.push({
        angle: baseAngle,
        innerR: tgtBox.w * (0.3 + rng() * 0.12),
        outerR: tgtBox.h * ((normalizedToTier >= 3 ? 1.1 : 0.95) + rng() * 0.25),
        width: (normalizedToTier >= 3 ? 4.2 : 3.4) + rng() * (normalizedToTier >= 3 ? 1.8 : 1.6),
        delay: rng() * 0.08,
      });
    }

    // Large, clearly visible gold and white particle sparks with directional tails & diamond glint heads
    const sparkCount = normalizedToTier >= 3 ? 40 : 26;
    const sparks = [];
    for (let i = 0; i < sparkCount; i += 1) {
      const baseAngle = (i / sparkCount) * TWO_PI + (rng() - 0.5) * 0.26;
      sparks.push({
        angle: baseAngle,
        startDist: tgtBox.w * (0.28 + rng() * 0.2),
        travel: (normalizedToTier >= 3 ? 82 : 64) + rng() * (normalizedToTier >= 3 ? 66 : 54),
        lift: 14 + rng() * (normalizedToTier >= 3 ? 34 : 24),
        size: (normalizedToTier >= 3 ? 3.4 : 3.0) + rng() * (normalizedToTier >= 3 ? 2.4 : 2.0),
        trailLen: (normalizedToTier >= 3 ? 20 : 16) + rng() * (normalizedToTier >= 3 ? 14 : 10),
        delay: rng() * 0.12,
        isWhite: i % 3 === 0 || rng() > 0.62,
      });
    }

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
      streaks,
      sparks,
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
    if (!this._ctx || !this._canvas) return;
    this._ctx.clearRect(0, 0, this._canvas.width || 0, this._canvas.height || 0);
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
    if (!this._canvas) return;
    const rect =
      typeof this._canvas.getBoundingClientRect === 'function'
        ? this._canvas.getBoundingClientRect()
        : null;
    const w = Math.max(320, Math.round(rect?.width || this._canvas.clientWidth || 920));
    const h = Math.max(180, Math.round(rect?.height || this._canvas.clientHeight || 260));
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);
    if (this._canvas.width !== targetW || this._canvas.height !== targetH) {
      this._canvas.width = targetW;
      this._canvas.height = targetH;
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
    if (!this._ctx || !this._canvas) {
      return true;
    }

    const ctx = this._ctx;
    const dpr = this._dpr || 1;
    ctx.save();
    ctx.setTransform?.(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this._logicalW, this._logicalH);

    for (const ev of this._evolutions) {
      const progress = clamp01((nowMs - ev.startMs) / ev.durationMs);
      if (ev.reducedMotion) {
        this._drawReducedMotion(ctx, ev, progress);
      } else {
        this._drawImpactBurst(ctx, ev, progress);
      }
    }

    ctx.restore();
    return true;
  }

  _drawReducedMotion(ctx, ev, p) {
    const fade = Math.sin(p * Math.PI);
    const { tgtCenter, tgtBox, toTier } = ev;
    const isApex = toTier >= 3;
    const r = Math.max(tgtBox.w, tgtBox.h) * (isApex ? 0.72 : 0.6);

    ctx.save();
    const grad = ctx.createRadialGradient(tgtCenter.x, tgtCenter.y, 4, tgtCenter.x, tgtCenter.y, r);
    grad.addColorStop(0, `rgba(255, 250, 224, ${fade * (isApex ? 0.65 : 0.48)})`);
    grad.addColorStop(0.55, `rgba(218, 158, 30, ${fade * (isApex ? 0.42 : 0.28)})`);
    grad.addColorStop(1, 'rgba(218, 158, 30, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(tgtCenter.x, tgtCenter.y, r, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  _drawImpactBurst(ctx, ev, p) {
    const { tgtBox, tgtCenter, srcCenter, toTier, accentColor, streaks, sparks } = ev;
    const isApex = toTier >= 3;
    const cy = tgtCenter.y - 12;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    // Stage 1 (Impact): Snappy energy transfer streak from source -> target (0.00 -> 0.18)
    const linkT = segmentProgress(p, 0.0, 0.18);
    if (linkT > 0 && linkT < 1 && Math.hypot(tgtCenter.x - srcCenter.x, tgtCenter.y - srcCenter.y) > 8) {
      const head = easeOutExpo(linkT);
      const tail = easeOutCubic(clamp01((linkT - 0.14) * 1.35));
      const x1 = srcCenter.x + (tgtCenter.x - srcCenter.x) * tail;
      const y1 = srcCenter.y + (cy - srcCenter.y) * tail;
      const x2 = srcCenter.x + (tgtCenter.x - srcCenter.x) * head;
      const y2 = srcCenter.y + (cy - srcCenter.y) * head;
      const alpha = Math.sin(linkT * Math.PI) * (isApex ? 0.96 : 0.86);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';
      // Gold outer contrast stroke
      ctx.strokeStyle = 'rgba(202, 134, 16, 0.72)';
      ctx.lineWidth = isApex ? 9 : 7;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // White-gold core streak
      const lineGrad = ctx.createLinearGradient(x1, y1, x2, y2);
      lineGrad.addColorStop(0, 'rgba(255, 224, 128, 0.15)');
      lineGrad.addColorStop(0.55, '#ffe078');
      lineGrad.addColorStop(1, '#ffffff');
      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = isApex ? 4.2 : 3.2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    }

    // Concentrated behind-card radial burst flash (0.00 -> 0.56) + distinct final Reveal glow pulse (0.68 -> 0.98)
    const impactBurst = segmentProgress(p, 0.0, 0.56);
    const finishPulse = Math.sin(segmentProgress(p, 0.68, 0.98) * Math.PI) * (isApex ? 0.84 : 0.64);
    const burstCurve = impactBurst > 0 && impactBurst < 1 ? Math.sin(Math.pow(impactBurst, 0.42) * Math.PI) : 0;
    const haloAlpha = Math.max(burstCurve * (isApex ? 0.98 : 0.88), finishPulse);

    if (haloAlpha > 0.01) {
      const haloR = Math.max(tgtBox.w, tgtBox.h) * (isApex ? 1.18 : 0.98);
      const haloGrad = ctx.createRadialGradient(tgtCenter.x, cy, 8, tgtCenter.x, cy, haloR);
      haloGrad.addColorStop(0, `rgba(255, 254, 245, ${haloAlpha * 0.96})`);
      haloGrad.addColorStop(0.38, `rgba(255, 212, 82, ${haloAlpha * 0.78})`);
      haloGrad.addColorStop(0.72, `rgba(216, 146, 22, ${haloAlpha * 0.42})`);
      haloGrad.addColorStop(1, 'rgba(216, 146, 22, 0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(tgtCenter.x, cy, haloR, 0, TWO_PI);
      ctx.fill();
    }

    // Stage 2 (Upgrade): Bold radial light streaks shooting outward around the target card (0.02 -> 0.62)
    const streakEnv = segmentProgress(p, 0.02, 0.62);
    if (streakEnv > 0 && streakEnv < 1) {
      for (const st of streaks) {
        const stT = clamp01((streakEnv - st.delay) / (1 - st.delay));
        if (stT <= 0 || stT >= 1) continue;
        const fade = (1 - easeOutCubic(stT)) * Math.min(1, stT * 4.5) * (isApex ? 0.98 : 0.9);
        const reach = easeOutExpo(stT);
        const rStart = st.innerR * (0.88 + 0.2 * reach);
        const rEnd = st.innerR + (st.outerR - st.innerR) * reach;
        const cos = Math.cos(st.angle);
        const sin = Math.sin(st.angle);
        const x1 = tgtCenter.x + cos * rStart;
        const y1 = cy + sin * rStart;
        const x2 = tgtCenter.x + cos * rEnd;
        const y2 = cy + sin * rEnd;

        ctx.save();
        ctx.globalAlpha = fade;
        ctx.lineCap = 'round';
        // Warm amber-gold contrast stroke over ivory dock
        ctx.strokeStyle = 'rgba(186, 118, 10, 0.68)';
        ctx.lineWidth = (st.width + 2.8) * (1 - stT * 0.25);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.55, isApex ? '#ffd652' : '#ffe48a');
        grad.addColorStop(1, 'rgba(232, 168, 32, 0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = st.width * (1 - stT * 0.3);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Expanding Geometric Energy Rings: 2 for Lv.I->Lv.II, 3 layered rings + diamond vertices for Lv.II->Lv.III
    const ring1T = segmentProgress(p, 0.03, isApex ? 0.62 : 0.64);
    if (ring1T > 0 && ring1T < 1) {
      const ease1 = easeOutQuart(ring1T);
      const minR = tgtBox.w * 0.42;
      const maxR = tgtBox.h * (isApex ? 1.16 : 1.08);
      const r1 = minR + (maxR - minR) * ease1;
      const alpha1 = (1 - easeOutCubic(ring1T)) * (isApex ? 0.98 : 0.92);

      ctx.save();
      ctx.globalAlpha = alpha1;
      ctx.strokeStyle = 'rgba(194, 122, 12, 0.72)';
      ctx.lineWidth = (isApex ? 6.4 : 5.4) * (1 - ring1T * 0.32);
      ctx.beginPath();
      ctx.arc(tgtCenter.x, cy, r1, 0, TWO_PI);
      ctx.stroke();

      ctx.strokeStyle = isApex ? '#ffffff' : '#fffbe6';
      ctx.lineWidth = (isApex ? 3.2 : 2.6) * (1 - ring1T * 0.32);
      ctx.beginPath();
      ctx.arc(tgtCenter.x, cy, r1, 0, TWO_PI);
      ctx.stroke();
      ctx.restore();
    }

    // Second geometric 8-sided rotating energy ring for both Lv.II and Lv.III
    const octT = segmentProgress(p, isApex ? 0.12 : 0.15, isApex ? 0.82 : 0.82);
    if (octT > 0 && octT < 1) {
      const octMinR = tgtBox.w * (isApex ? 0.38 : 0.36);
      const octMaxR = tgtBox.h * (isApex ? 1.06 : 0.94);
      const rOct = octMinR + (octMaxR - octMinR) * easeOutQuart(octT);
      const octAlpha = (1 - easeOutCubic(octT)) * (isApex ? 0.94 : 0.86);
      const octRot = octT * (isApex ? 0.68 : 0.52);

      ctx.save();
      ctx.globalAlpha = octAlpha;
      ctx.strokeStyle = 'rgba(186, 116, 10, 0.66)';
      ctx.lineWidth = (isApex ? 4.8 : 4.0) * (1 - octT * 0.35);
      drawPolygonRing(ctx, tgtCenter.x, cy, rOct, 8, octRot);
      ctx.stroke();

      ctx.strokeStyle = isApex ? '#ffd652' : '#ffdc6a';
      ctx.lineWidth = (isApex ? 2.4 : 2.0) * (1 - octT * 0.35);
      drawPolygonRing(ctx, tgtCenter.x, cy, rOct, 8, octRot);
      ctx.stroke();

      // Luminous diamond vertices on Lv.III geometric ring
      if (isApex) {
        const vertexR = 3.5 * (1 - octT * 0.35);
        for (let v = 0; v < 8; v += 1) {
          const va = octRot + (v / 8) * TWO_PI;
          const vx = tgtCenter.x + Math.cos(va) * rOct;
          const vy = cy + Math.sin(va) * rOct;
          ctx.fillStyle = 'rgba(202, 130, 12, 0.75)';
          drawStarGlint(ctx, vx, vy, vertexR * 1.4, va);
          ctx.fill();
          ctx.fillStyle = '#fffef6';
          drawStarGlint(ctx, vx, vy, vertexR * 0.95, va);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // Third outer golden shockwave ring for Lv.II -> Lv.III
    if (isApex) {
      const ring3T = segmentProgress(p, 0.2, 0.84);
      if (ring3T > 0 && ring3T < 1) {
        const ease3 = easeOutCubic(ring3T);
        const r3 = tgtBox.w * 0.46 + (tgtBox.h * 1.28 - tgtBox.w * 0.46) * ease3;
        ctx.save();
        ctx.globalAlpha = (1 - ring3T) * 0.9;
        ctx.strokeStyle = 'rgba(184, 114, 10, 0.66)';
        ctx.lineWidth = 5.0 * (1 - ring3T * 0.38);
        ctx.beginPath();
        ctx.arc(tgtCenter.x, cy, r3, 0, TWO_PI);
        ctx.stroke();

        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2.4 * (1 - ring3T * 0.38);
        ctx.beginPath();
        ctx.arc(tgtCenter.x, cy, r3, 0, TWO_PI);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Large, bright gold & white particle sparks with directional velocity trails & 4-point diamond heads (0.02 -> 0.88)
    const sparkEnv = segmentProgress(p, 0.02, 0.88);
    if (sparkEnv > 0 && sparkEnv < 1) {
      for (const sp of sparks) {
        const st = clamp01((sparkEnv - sp.delay) / (1 - sp.delay));
        if (st <= 0 || st >= 1) continue;
        const eased = easeOutQuart(st);
        const dist = sp.startDist + sp.travel * eased;
        const tailDist = Math.max(sp.startDist, dist - sp.trailLen * (1 - st * 0.55));
        const cos = Math.cos(sp.angle);
        const sin = Math.sin(sp.angle);
        const liftY = sp.lift * st;

        const hx = tgtCenter.x + cos * dist;
        const hy = cy + sin * dist - liftY;
        const tx = tgtCenter.x + cos * tailDist;
        const ty = cy + sin * tailDist - liftY * 0.72;
        const alpha = Math.min(1, st * 5.2) * (1 - easeOutCubic(st)) * (isApex ? 0.98 : 0.92);
        const coreColor = sp.isWhite ? '#ffffff' : accentColor;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(196, 126, 12, 0.74)';
        ctx.lineWidth = sp.size * 1.35;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        ctx.stroke();

        ctx.strokeStyle = coreColor;
        ctx.lineWidth = sp.size * 0.75;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        ctx.stroke();

        // Crisp 4-point diamond glint head so every spark reads cleanly at 1280x800
        ctx.fillStyle = 'rgba(210, 138, 16, 0.78)';
        drawStarGlint(ctx, hx, hy, sp.size * 1.45, sp.angle);
        ctx.fill();

        ctx.fillStyle = '#fffef9';
        drawStarGlint(ctx, hx, hy, sp.size * 1.05, sp.angle);
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.restore();
  }
}
