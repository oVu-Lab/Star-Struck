/**
 * AstraGlitterEffects — Shared 2D holographic foil, moving glitter particle,
 * specular highlight, and 4-point star flare renderer matching AstraCard's
 * WebGL shader/particle visual treatment for Battle HUD & Dais elements.
 */

const TWO_PI = Math.PI * 2;
const IRIDESCENT_PALETTE = ['#a8f0ff', '#bdd8ff', '#d8c4ff', '#ffc6e4', '#ffe8b6'];

function wrap01(v) {
  return ((v % 1) + 1) % 1;
}

function classifyType(ratio) {
  if (ratio < 0.6) return 'iridescent';
  if (ratio < 0.85) return 'dust';
  if (ratio < 0.95) return 'star';
  return 'glint';
}

function createSeededList(count, salt = 1) {
  const list = [];
  let s = (1337 * salt) % 2147483647;
  const nextRand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let i = 0; i < count; i += 1) {
    const rx = nextRand();
    const ry = nextRand();
    const z = nextRand();
    const w = nextRand();
    const hueRoll = nextRand();
    const freqRoll = nextRand();
    const phaseRoll = nextRand();
    const rotRoll = nextRand();
    const ratio = ((i * 7 + salt) % count + 0.5) / count;
    list.push({
      x: wrap01((i + 0.5) * 0.7548776662 + (rx - 0.5) * 0.14),
      y: wrap01((i + 0.5) * 0.5698402910 + (ry - 0.5) * 0.14),
      z,
      w,
      type: classifyType(ratio),
      hueIndex: Math.floor(hueRoll * IRIDESCENT_PALETTE.length),
      twinkleFreq: 1 + Math.floor(freqRoll * 3),
      phase: phaseRoll * TWO_PI,
      rot: rotRoll * TWO_PI,
      glow: w > 0.45,
    });
  }
  return list;
}

function drawDiamondSpeck(ctx, x, y, rx, ry, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.moveTo(0, -ry);
  ctx.lineTo(rx, 0);
  ctx.lineTo(0, ry);
  ctx.lineTo(-rx, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFourPointSparkle(ctx, x, y, radius, rotation = 0, innerRatio = 0.15) {
  const inner = radius * innerRatio;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.lineTo(inner, -inner);
  ctx.lineTo(radius * 1.1, 0);
  ctx.lineTo(inner, inner);
  ctx.lineTo(0, radius);
  ctx.lineTo(-inner, inner);
  ctx.lineTo(-radius * 1.1, 0);
  ctx.lineTo(-inner, -inner);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Moderated glitter density (24 rising + 18 micro-glitter, down from 52 + 36) to prevent clustering
const RISING_PARTICLES = createSeededList(24, 7);
const MICRO_GLITTER = createSeededList(18, 23);
const FLARE_ANCHORS = [
  [0.14, 0.14, 1.05],
  [0.86, 0.15, 0.95],
  [0.2, 0.42, 0.85],
  [0.82, 0.48, 0.9],
  [0.5, 0.1, 1.15],
  [0.16, 0.72, 0.78],
  [0.84, 0.7, 0.8],
];

/**
 * Draws a crisp 4-point cross star flare echoing AstraCard's `cr(d)` shader flare.
 */
export function drawCrossStarFlare(ctx, x, y, radius, alpha, color = '#ffe89c', rotation = 0) {
  if (!ctx || alpha <= 0.02 || radius <= 0.5) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

  if (typeof ctx.createRadialGradient === 'function') {
    const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.95);
    bloom.addColorStop(0, '#ffffff');
    bloom.addColorStop(0.32, color);
    bloom.addColorStop(1, 'rgba(255, 236, 170, 0)');
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.95, 0, TWO_PI);
    ctx.fill();
  }

  // Long horizontal & vertical needle spikes + compact diamond core
  const inner = radius * 0.14;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.lineTo(inner, -inner);
  ctx.lineTo(radius * 1.15, 0);
  ctx.lineTo(inner, inner);
  ctx.lineTo(0, radius);
  ctx.lineTo(-inner, inner);
  ctx.lineTo(-radius * 1.15, 0);
  ctx.lineTo(-inner, -inner);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Renders AstraCard-inspired holographic foil sweeps, moving glitter particles,
 * twinkling micro-sparkles, specular rim highlights, and 4-point star flares
 * into a bounded 2D canvas context.
 */
export function renderHolographicCardEffects(
  ctx,
  {
    x = 0,
    y = 0,
    width = 126,
    height = 196,
    elapsed = 0,
    isAstra = true,
    accentColor = '#ffe594',
    ringColor = '#cfe8ff',
    includeFlares = true,
    includeBorderSpecular = true,
  } = {},
) {
  if (!ctx || width <= 0 || height <= 0) return;

  const scale = Math.max(0.55, Math.min(1.6, width / 126));
  const phase = (elapsed * TWO_PI) / 4.2;
  const ph = (phase / TWO_PI) % 1;
  const sweepPos = -0.35 + 1.7 * ph;

  ctx.save();
  ctx.translate(x, y);
  const prevComposite = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';

  // 1. Flowing holographic stardust & iridescent foil reflection waves
  if (typeof ctx.createLinearGradient === 'function') {
    const waveOffset = Math.sin(phase) * width * 0.18;
    const irGrad = ctx.createLinearGradient(
      waveOffset,
      0,
      width - waveOffset,
      height,
    );
    if (isAstra) {
      irGrad.addColorStop(0, 'rgba(255, 224, 130, 0.08)');
      irGrad.addColorStop(0.28, 'rgba(130, 206, 255, 0.16)');
      irGrad.addColorStop(0.55, 'rgba(255, 238, 172, 0.2)');
      irGrad.addColorStop(0.8, 'rgba(182, 166, 255, 0.14)');
      irGrad.addColorStop(1, 'rgba(255, 224, 130, 0.06)');
    } else {
      irGrad.addColorStop(0, 'rgba(255, 232, 166, 0.06)');
      irGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
      irGrad.addColorStop(1, 'rgba(255, 232, 166, 0.06)');
    }
    ctx.fillStyle = irGrad;
    ctx.fillRect(0, 0, width, height);

    // Primary diagonal glass & prismatic foil sweep
    const sweepStart = -width * 0.85 + sweepPos * (width * 1.9);
    const foilGrad = ctx.createLinearGradient(
      sweepStart,
      0,
      sweepStart + width * 0.72,
      height * 0.78,
    );
    foilGrad.addColorStop(0, 'rgba(255, 240, 184, 0)');
    foilGrad.addColorStop(0.32, isAstra ? 'rgba(255, 226, 132, 0.34)' : 'rgba(255, 240, 186, 0.24)');
    foilGrad.addColorStop(0.49, 'rgba(255, 255, 255, 0.72)');
    foilGrad.addColorStop(0.62, isAstra ? 'rgba(134, 214, 255, 0.44)' : 'rgba(255, 226, 152, 0.28)');
    foilGrad.addColorStop(1, 'rgba(255, 240, 184, 0)');
    ctx.fillStyle = foilGrad;
    ctx.fillRect(0, 0, width, height);

    // Secondary opposing holographic flash beam
    const ph2 = ((elapsed * 0.38) + 0.5) % 1;
    const sweep2 = width * 1.3 - ph2 * (width * 2.2);
    const flashGrad = ctx.createLinearGradient(
      sweep2,
      height,
      sweep2 + width * 0.48,
      height * 0.22,
    );
    flashGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    flashGrad.addColorStop(0.5, isAstra ? 'rgba(255, 238, 178, 0.38)' : 'rgba(255, 244, 210, 0.26)');
    flashGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = flashGrad;
    ctx.fillRect(0, 0, width, height);
  }

  // 2. Moving rising & swaying celestial particles (mirroring AstraCard PVS/PFS particle layers)
  for (let i = 0; i < RISING_PARTICLES.length; i += 1) {
    const s = RISING_PARTICLES[i];
    const isForeground = i >= 10;
    const speedK = s.type === 'dust'
      ? 1 + Math.floor(s.z * 1.3)
      : 1 + Math.floor(s.z * 3);
    const travel = ((s.y - ph * speedK) % 1 + 1) % 1;
    const driftX = (
      Math.sin(phase * speedK + s.z * 30) * (isForeground ? 6.5 : 3.5)
      + Math.cos(phase + s.phase) * (isForeground ? 3.0 : 1.8)
    ) * scale;
    const driftY = Math.sin(phase * 2 + s.phase) * 2.5 * scale;
    const px = s.x * width + driftX;
    const py = travel * height + driftY;

    const edgeFade = Math.sin(travel * Math.PI);
    const tw1 = 0.5 + 0.5 * Math.sin(phase * s.twinkleFreq + s.phase);
    const tw2 = 0.5 + 0.5 * Math.sin(phase * (s.twinkleFreq + 1) + s.x * 44);
    let twinkle;
    let flash = 0;
    if (s.type === 'dust') {
      twinkle = 0.24 + 0.36 * tw1;
    } else if (s.type === 'star') {
      twinkle = 0.28 + 0.72 * Math.pow(tw1, 2.2);
    } else if (s.type === 'glint') {
      flash = Math.pow(tw1 * 0.5 + tw2 * 0.5, 6);
      twinkle = 0.3 + 0.95 * flash;
    } else {
      twinkle = 0.28 + 0.72 * (tw1 * 0.65 + tw2 * 0.35);
    }

    const layerAlpha = isForeground ? (isAstra ? 0.92 : 0.75) : (isAstra ? 0.6 : 0.45);
    const alpha = Math.min(1, edgeFade * twinkle * layerAlpha);
    if (alpha <= 0.04) continue;

    const baseR = (isForeground ? 1.55 + s.z * 1.85 : 0.95 + s.z * 1.05) * scale;
    const pColor = isAstra
      ? IRIDESCENT_PALETTE[(s.hueIndex + (tw1 > 0.7 ? 1 : 0)) % IRIDESCENT_PALETTE.length]
      : (i % 3 === 0 ? accentColor : i % 3 === 1 ? ringColor : '#fff0c8');

    if (s.type === 'dust') {
      const dustR = baseR * 1.35;
      if (typeof ctx.createRadialGradient === 'function') {
        const mist = ctx.createRadialGradient(px, py, 0, px, py, dustR * 1.5);
        mist.addColorStop(0, pColor);
        mist.addColorStop(1, 'rgba(200, 224, 255, 0)');
        ctx.fillStyle = mist;
      } else {
        ctx.fillStyle = pColor;
      }
      ctx.globalAlpha = alpha * 0.65;
      ctx.beginPath();
      ctx.arc(px, py, dustR * 1.5, 0, TWO_PI);
      ctx.fill();
      continue;
    }

    if (typeof ctx.createRadialGradient === 'function' && (isForeground || s.glow || s.type !== 'iridescent')) {
      const haloR = baseR * (s.type === 'glint' ? 2.6 : s.type === 'star' ? 2.2 : 1.9);
      const orb = ctx.createRadialGradient(px, py, 0, px, py, haloR);
      orb.addColorStop(0, s.type === 'glint' ? '#ffffff' : pColor);
      orb.addColorStop(0.4, pColor);
      orb.addColorStop(1, 'rgba(255, 232, 200, 0)');
      ctx.fillStyle = orb;
      ctx.globalAlpha = alpha * (s.type === 'iridescent' ? 0.42 : 0.55);
      ctx.beginPath();
      ctx.arc(px, py, haloR, 0, TWO_PI);
      ctx.fill();
    } else {
      ctx.fillStyle = pColor;
      ctx.globalAlpha = alpha * 0.35;
      ctx.beginPath();
      ctx.arc(px, py, baseR * 0.85, 0, TWO_PI);
      ctx.fill();
    }

    ctx.globalAlpha = alpha;
    if (s.type === 'iridescent') {
      ctx.fillStyle = pColor;
      drawDiamondSpeck(ctx, px, py, baseR * 0.72, baseR * (1.05 + 0.35 * s.w), s.rot);
      if (isForeground && tw1 > 0.65) {
        ctx.globalAlpha = alpha * 0.65;
        ctx.fillStyle = '#ffffff';
        drawDiamondSpeck(ctx, px, py, baseR * 0.32, baseR * 0.52, s.rot);
      }
    } else if (s.type === 'star') {
      const tilt = (s.z - 0.5) * 0.5;
      ctx.fillStyle = pColor;
      drawFourPointSparkle(ctx, px, py, baseR * 2.1, tilt, 0.16);
      ctx.fillStyle = '#ffffff';
      drawFourPointSparkle(ctx, px, py, baseR * 1.1, tilt, 0.2);
    } else {
      const tilt = (s.z - 0.5) * 0.4;
      const glintR = baseR * (2.2 + 0.9 * flash);
      ctx.fillStyle = pColor;
      drawFourPointSparkle(ctx, px, py, glintR * 0.78, tilt + Math.PI / 4, 0.14);
      ctx.fillStyle = '#ffffff';
      drawFourPointSparkle(ctx, px, py, glintR, tilt, 0.15);
    }
  }

  // 3. Sweep-reactive micro-glitter & delicate specular sparkles across frame & portrait
  for (let i = 0; i < MICRO_GLITTER.length; i += 1) {
    const g = MICRO_GLITTER[i];
    const gx = g.x * width;
    const gy = g.y * height;
    const twinkle = Math.pow(Math.max(0, Math.sin(phase * (1.5 + g.twinkleFreq * 0.7) + g.phase)), 4);
    const diagCoord = (g.x * 0.8 + g.y * 0.6) / 1.4;
    const sweepBoost = Math.exp(-Math.pow((diagCoord - sweepPos * 0.85) * 6.5, 2));
    const intensity = Math.min(1, twinkle * 0.7 + sweepBoost * 0.9);
    if (intensity <= 0.14) continue;

    const pColor = isAstra
      ? IRIDESCENT_PALETTE[g.hueIndex % IRIDESCENT_PALETTE.length]
      : (i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? accentColor : ringColor);
    const r = (0.85 + intensity * 1.25) * scale;
    ctx.globalAlpha = intensity * (isAstra ? 0.88 : 0.68);

    if (g.type === 'dust') {
      ctx.globalAlpha *= 0.55;
      ctx.fillStyle = pColor;
      ctx.beginPath();
      ctx.arc(gx, gy, r * 1.15, 0, TWO_PI);
      ctx.fill();
    } else if (g.type === 'star' || g.type === 'glint' || intensity > 0.62) {
      const sp = r * (g.type === 'glint' ? 2.5 : 2.1);
      ctx.fillStyle = pColor;
      drawFourPointSparkle(ctx, gx, gy, sp, (g.z - 0.5) * 0.5, 0.15);
      ctx.fillStyle = '#ffffff';
      drawFourPointSparkle(ctx, gx, gy, sp * 0.55, (g.z - 0.5) * 0.5, 0.22);
    } else {
      ctx.fillStyle = pColor;
      drawDiamondSpeck(ctx, gx, gy, r * 0.7, r * (1.05 + 0.3 * g.w), g.rot);
    }
  }

  // 4. Specular metallic frame highlight
  if (includeBorderSpecular && typeof ctx.strokeRect === 'function') {
    const rimAlpha = 0.45 + 0.35 * Math.sin(phase * 2);
    ctx.globalAlpha = rimAlpha;
    ctx.strokeStyle = isAstra ? '#fff2c2' : accentColor;
    ctx.lineWidth = Math.max(1.5, 2 * scale);
    ctx.strokeRect(1, 1, width - 2, height - 2);
  }

  // 5. Anchored 4-point celestial cross star flares peaking with the holographic sweep
  if (includeFlares) {
    for (let i = 0; i < FLARE_ANCHORS.length; i += 1) {
      const [ax, ay, sizeMult] = FLARE_ANCHORS[i];
      const diagCoord = (ax * 0.8 + ay * 0.6) / 1.4;
      const pk = Math.exp(-Math.pow((diagCoord - sweepPos * 0.85) * 6, 2));
      const basePulse = 0.28 + 0.32 * Math.sin(phase * 2 + i * 1.3);
      const flareAlpha = Math.min(1, basePulse + pk * 0.9);
      const flareRadius = (8 + pk * 9) * sizeMult * scale;
      const flareCol = i % 2 === 0 ? (isAstra ? '#ffe699' : accentColor) : ringColor;
      drawCrossStarFlare(
        ctx,
        ax * width,
        ay * height,
        flareRadius,
        flareAlpha,
        flareCol,
        elapsed * (i % 2 === 0 ? 0.35 : -0.3),
      );
    }
  }

  ctx.globalCompositeOperation = prevComposite;
  ctx.restore();
}

/**
 * Lightweight animation controller binding `renderHolographicCardEffects`
 * to a DOM `<canvas>` inside BattleScreen's Commander Ultimate button.
 */
export class CardUltimateFxController {
  constructor(canvas, { isAstra = true, accentColor = '#ffe594', ringColor = '#cfe8ff' } = {}) {
    this._canvas = canvas || null;
    this._ctx = typeof canvas?.getContext === 'function' ? canvas.getContext('2d') : null;
    this._isAstra = Boolean(isAstra);
    this._accentColor = accentColor;
    this._ringColor = ringColor;
    this._active = false;
    this._rafId = null;
    this._startMs = 0;
    this._elapsed = 0;
  }

  get active() {
    return this._active;
  }

  setTheme({ isAstra = true, accentColor = '#ffe594', ringColor = '#cfe8ff' } = {}) {
    this._isAstra = Boolean(isAstra);
    this._accentColor = accentColor;
    this._ringColor = ringColor;
  }

  start() {
    if (this._active) return;
    this._active = true;
    this._startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this._elapsed = 0;
    this._syncSize();
    this._drawFrame(0);
    if (typeof requestAnimationFrame === 'function') {
      const tick = (now) => {
        if (!this._active) return;
        this._rafId = requestAnimationFrame(tick);
        const dtSec = Math.max(0, (now - this._startMs) / 1000);
        this._elapsed = dtSec;
        this._syncSize();
        this._drawFrame(dtSec);
      };
      this._rafId = requestAnimationFrame(tick);
    }
  }

  stop() {
    this._active = false;
    if (this._rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._rafId);
    }
    this._rafId = null;
    this.clear();
  }

  clear() {
    if (!this._ctx || !this._canvas) return;
    this._ctx.clearRect(0, 0, this._canvas.width || 0, this._canvas.height || 0);
  }

  _syncSize() {
    if (!this._canvas) return;
    const rect = typeof this._canvas.getBoundingClientRect === 'function'
      ? this._canvas.getBoundingClientRect()
      : null;
    const w = Math.max(112, Math.round(rect?.width || this._canvas.clientWidth || 126));
    const h = Math.max(158, Math.round(rect?.height || this._canvas.clientHeight || 196));
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

  _drawFrame(elapsed) {
    if (!this._ctx || !this._canvas) return;
    const w = this._logicalW || 126;
    const h = this._logicalH || 196;
    const dpr = this._dpr || 1;
    this._ctx.save();
    this._ctx.setTransform?.(dpr, 0, 0, dpr, 0, 0);
    this._ctx.clearRect(0, 0, w, h);
    renderHolographicCardEffects(this._ctx, {
      width: w,
      height: h,
      elapsed,
      isAstra: this._isAstra,
      accentColor: this._accentColor,
      ringColor: this._ringColor,
      includeFlares: true,
      includeBorderSpecular: true,
    });
    this._ctx.restore();
  }
}
