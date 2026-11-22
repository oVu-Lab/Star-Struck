/**
 * CardMergeVfxController — Fast, high-impact on-demand 2D Canvas behind-card
 * merge burst, expanding geometric energy rings, radial light streaks, and
 * outward spark particles (520ms Lv.II, 620ms Lv.III).
 *
 * Uses rich burnished-gold outer contrast paired with warm white-gold cores so
 * effects read crisply against both the dark arena and warm-ivory command dock.
 */

const TWO_PI = Math.PI * 2;
const MAX_ACTIVE_EVOLUTIONS = 6;

const RARITY_ACCENTS = Object.freeze({
  r: '#e8b63a',
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
    const durationMs = reducedMotion ? 240 : normalizedToTier >= 3 ? 620 : 520;
    const rarityKey = String(rarity || 'r').toLowerCase();
    const accentColor = RARITY_ACCENTS[rarityKey] || RARITY_ACCENTS.r;

    const seq = ++this._seq;
    const rng = createSeededRng(seq * 97 + sourceIndex * 19 + targetIndex * 31 + normalizedToTier * 13);

    // Tapered radial burst streaks concentrated behind the card
    const streakCount = normalizedToTier >= 3 ? 14 : 8;
    const streaks = [];
    for (let i = 0; i < streakCount; i += 1) {
      const baseAngle = (i / streakCount) * TWO_PI - Math.PI / 2 + (rng() - 0.5) * 0.18;
      streaks.push({
        angle: baseAngle,
        innerR: tgtBox.w * (0.28 + rng() * 0.1),
        outerR: tgtBox.h * ((normalizedToTier >= 3 ? 0.96 : 0.78) + rng() * 0.2),
        width: (normalizedToTier >= 3 ? 3.2 : 2.3) + rng() * 1.4,
        delay: rng() * 0.05,
      });
    }

    // Fast outward spark particles with directional velocity trails
    const sparkCount = normalizedToTier >= 3 ? 32 : 18;
    const sparks = [];
    for (let i = 0; i < sparkCount; i += 1) {
      const baseAngle = (i / sparkCount) * TWO_PI + (rng() - 0.5) * 0.28;
      sparks.push({
        angle: baseAngle,
        startDist: tgtBox.w * (0.22 + rng() * 0.18),
        travel: (normalizedToTier >= 3 ? 68 : 48) + rng() * (normalizedToTier >= 3 ? 52 : 34),
        lift: 10 + rng() * (normalizedToTier >= 3 ? 28 : 18),
        size: 1.8 + rng() * (normalizedToTier >= 3 ? 2.4 : 1.7),
        trailLen: (normalizedToTier >= 3 ? 16 : 11) + rng() * 10,
        delay: rng() * 0.08,
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
    const cy = tgtCenter.y - 10;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    // 1. Snappy energy transfer streak from source -> target (0.00 -> 0.26)
    const linkT = segmentProgress(p, 0.0, 0.26);
    if (linkT > 0 && linkT < 1 && Math.hypot(tgtCenter.x - srcCenter.x, tgtCenter.y - srcCenter.y) > 8) {
      const head = easeOutExpo(linkT);
      const tail = easeOutCubic(clamp01((linkT - 0.16) * 1.35));
      const x1 = srcCenter.x + (tgtCenter.x - srcCenter.x) * tail;
      const y1 = srcCenter.y + (cy - srcCenter.y) * tail;
      const x2 = srcCenter.x + (tgtCenter.x - srcCenter.x) * head;
      const y2 = srcCenter.y + (cy - srcCenter.y) * head;
      const alpha = Math.sin(linkT * Math.PI) * (isApex ? 0.92 : 0.78);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';
      // Gold outer contrast stroke
      ctx.strokeStyle = 'rgba(202, 134, 16, 0.62)';
      ctx.lineWidth = isApex ? 8 : 6;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // White-gold core streak
      const lineGrad = ctx.createLinearGradient(x1, y1, x2, y2);
      lineGrad.addColorStop(0, 'rgba(255, 224, 128, 0.1)');
      lineGrad.addColorStop(0.55, '#ffe078');
      lineGrad.addColorStop(1, '#ffffff');
      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = isApex ? 3.5 : 2.6;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    }

    // 2. Concentrated behind-card radial burst flash (0.00 -> 0.48) + finishing pulse (0.68 -> 0.98)
    const impactBurst = segmentProgress(p, 0.0, 0.48);
    const finishPulse = Math.sin(segmentProgress(p, 0.68, 0.98) * Math.PI) * (isApex ? 0.68 : 0.48);
    const burstCurve = impactBurst > 0 && impactBurst < 1 ? Math.sin(Math.pow(impactBurst, 0.45) * Math.PI) : 0;
    const haloAlpha = Math.max(burstCurve * (isApex ? 0.94 : 0.78), finishPulse);

    if (haloAlpha > 0.01) {
      const haloR = Math.max(tgtBox.w, tgtBox.h) * (isApex ? 0.96 : 0.8);
      const haloGrad = ctx.createRadialGradient(tgtCenter.x, cy, 6, tgtCenter.x, cy, haloR);
      haloGrad.addColorStop(0, `rgba(255, 254, 245, ${haloAlpha * 0.92})`);
      haloGrad.addColorStop(0.36, `rgba(255, 214, 86, ${haloAlpha * 0.68})`);
      haloGrad.addColorStop(0.7, `rgba(216, 152, 24, ${haloAlpha * 0.34})`);
      haloGrad.addColorStop(1, 'rgba(216, 152, 24, 0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(tgtCenter.x, cy, haloR, 0, TWO_PI);
      ctx.fill();
    }

    // 3. Fast radial light streaks behind the target card (0.02 -> 0.46)
    const streakEnv = segmentProgress(p, 0.02, 0.46);
    if (streakEnv > 0 && streakEnv < 1) {
      for (const st of streaks) {
        const stT = clamp01((streakEnv - st.delay) / (1 - st.delay));
        if (stT <= 0 || stT >= 1) continue;
        const fade = (1 - easeOutCubic(stT)) * Math.min(1, stT * 5) * (isApex ? 0.94 : 0.82);
        const reach = easeOutExpo(stT);
        const rStart = st.innerR * (0.85 + 0.18 * reach);
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
        // Warm amber-gold outline for contrast over ivory dock
        ctx.strokeStyle = 'rgba(196, 128, 12, 0.55)';
        ctx.lineWidth = (st.width + 2.2) * (1 - stT * 0.3);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.55, isApex ? '#ffd652' : '#ffe388');
        grad.addColorStop(1, 'rgba(232, 168, 32, 0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = st.width * (1 - stT * 0.35);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 4. Fast expanding thin geometric rings (0.02 -> 0.66)
    const ring1T = segmentProgress(p, 0.02, 0.54);
    if (ring1T > 0 && ring1T < 1) {
      const ease1 = easeOutQuart(ring1T);
      const minR = tgtBox.w * 0.34;
      const maxR = tgtBox.h * (isApex ? 0.95 : 0.8);
      const r1 = minR + (maxR - minR) * ease1;
      const alpha1 = (1 - easeOutCubic(ring1T)) * (isApex ? 0.96 : 0.86);

      ctx.save();
      ctx.globalAlpha = alpha1;
      ctx.strokeStyle = 'rgba(194, 126, 14, 0.58)';
      ctx.lineWidth = (isApex ? 4.4 : 3.4) * (1 - ring1T * 0.4);
      ctx.beginPath();
      ctx.arc(tgtCenter.x, cy, r1, 0, TWO_PI);
      ctx.stroke();

      ctx.strokeStyle = '#fff9df';
      ctx.lineWidth = (isApex ? 2.1 : 1.6) * (1 - ring1T * 0.4);
      ctx.beginPath();
      ctx.arc(tgtCenter.x, cy, r1, 0, TWO_PI);
      ctx.stroke();
      ctx.restore();
    }

    if (isApex) {
      // Layered second geometric octagon ring + delayed outer gold shockwave ring for Lv.III
      const hexT = segmentProgress(p, 0.06, 0.6);
      if (hexT > 0 && hexT < 1) {
        const rHex = tgtBox.w * 0.4 + tgtBox.h * 0.66 * easeOutQuart(hexT);
        ctx.save();
        ctx.globalAlpha = (1 - easeOutCubic(hexT)) * 0.85;
        ctx.strokeStyle = '#ffd354';
        ctx.lineWidth = 1.8 * (1 - hexT * 0.4);
        drawPolygonRing(ctx, tgtCenter.x, cy, rHex, 8, hexT * 0.55);
        ctx.stroke();
        ctx.restore();
      }

      const ring2T = segmentProgress(p, 0.1, 0.66);
      if (ring2T > 0 && ring2T < 1) {
        const ease2 = easeOutCubic(ring2T);
        const r2 = tgtBox.w * 0.44 + tgtBox.h * 0.82 * ease2;
        ctx.save();
        ctx.globalAlpha = (1 - ring2T) * 0.86;
        ctx.strokeStyle = 'rgba(186, 120, 12, 0.55)';
        ctx.lineWidth = 3.2 * (1 - ring2T * 0.45);
        ctx.beginPath();
        ctx.arc(tgtCenter.x, cy, r2, 0, TWO_PI);
        ctx.stroke();

        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1.6 * (1 - ring2T * 0.45);
        ctx.beginPath();
        ctx.arc(tgtCenter.x, cy, r2, 0, TWO_PI);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 5. Crisp shooting spark particles with short directional trails (0.00 -> 0.84)
    const sparkEnv = segmentProgress(p, 0.0, 0.84);
    if (sparkEnv > 0 && sparkEnv < 1) {
      for (const sp of sparks) {
        const st = clamp01((sparkEnv - sp.delay) / (1 - sp.delay));
        if (st <= 0 || st >= 1) continue;
        const eased = easeOutQuart(st);
        const dist = sp.startDist + sp.travel * eased;
        const tailDist = Math.max(sp.startDist, dist - sp.trailLen * (1 - st * 0.65));
        const cos = Math.cos(sp.angle);
        const sin = Math.sin(sp.angle);
        const liftY = sp.lift * st;

        const hx = tgtCenter.x + cos * dist;
        const hy = cy + sin * dist - liftY;
        const tx = tgtCenter.x + cos * tailDist;
        const ty = cy + sin * tailDist - liftY * 0.72;
        const alpha = Math.min(1, st * 6) * (1 - easeOutCubic(st)) * (isApex ? 0.96 : 0.86);
        const coreColor = sp.isWhite ? '#ffffff' : accentColor;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(202, 134, 14, 0.65)';
        ctx.lineWidth = sp.size * 1.45;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        ctx.stroke();

        ctx.strokeStyle = coreColor;
        ctx.lineWidth = sp.size * 0.85;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        ctx.stroke();

        ctx.fillStyle = '#fffef9';
        ctx.beginPath();
        ctx.arc(hx, hy, sp.size * 0.75, 0, TWO_PI);
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.restore();
  }
}
