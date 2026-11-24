/**
 * UnitObjectModelHelpers — Shared Canvas 2D chibi object rendering primitives,
 * material shaders, expressive integrated facial features, and per-unit
 * locomotion/cast/attack animation evaluators.
 *
 * Mock-Canvas Safe: Uses only universal Canvas 2D path calls (no bezierCurveTo/clip).
 */

import { evaluateUnitAnimationState } from './UnitAnimationProfiles.js';
import { withAlpha } from './NonUnitVfxGeometry.js';

export function quadTo(ctx, cpx, cpy, x, y) {
  if (typeof ctx.quadraticCurveTo === 'function') {
    ctx.quadraticCurveTo(cpx, cpy, x, y);
  } else {
    ctx.lineTo(cpx, cpy);
    ctx.lineTo(x, y);
  }
}

export function computeUnitObjectAnimation(unit, elapsed, design, options = null) {
  return evaluateUnitAnimationState(unit, elapsed, design, options);
}

/**
 * Draws expressive chibi eyes & cheeks integrated directly onto an object body.
 */
export function drawChibiFace(
  ctx,
  cx,
  cy,
  s,
  {
    eyeColor = '#7dd3fc',
    pupilColor = '#090d18',
    cheekColor = '#fb7185',
    mood = 'normal',
    blink = false,
    style = 'bright', // 'bright' | 'determined' | 'fierce' | 'serene' | 'mischievous' | 'optic' | 'starry'
    eyeSpread = 6.2,
    eyeRadius = 2.6,
    showCheeks = true,
    browColor = null,
    mouth = 'none', // 'none' | 'smile' | 'smirk' | 'fang' | 'grate'
  } = {},
) {
  const spread = eyeSpread * s;
  const r = Math.max(1.0, eyeRadius * s);
  const ly = cy;

  ctx.save();

  // Soft rosy/energy cheeks
  if (showCheeks && mood !== 'hurt') {
    ctx.fillStyle = withAlpha(cheekColor, mood === 'happy' ? 0.55 : 0.34);
    ctx.beginPath();
    ctx.ellipse(cx - spread - r * 0.55, ly + r * 0.95, r * 0.95, r * 0.52, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + spread + r * 0.55, ly + r * 0.95, r * 0.95, r * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const side of [-1, 1]) {
    const ex = cx + side * spread;

    if (mood === 'hurt') {
      // Wincing > < eyes
      ctx.strokeStyle = eyeColor;
      ctx.lineWidth = Math.max(1.1, 1.55 * s);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - side * r * 0.85, ly - r * 0.65);
      ctx.lineTo(ex + side * r * 0.65, ly);
      ctx.lineTo(ex - side * r * 0.85, ly + r * 0.65);
      ctx.stroke();
      continue;
    }

    if (blink || (mood === 'happy' && style !== 'optic')) {
      // Gentle ^ ^ arc eyes
      ctx.strokeStyle = eyeColor;
      ctx.lineWidth = Math.max(1.1, 1.6 * s);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(ex, ly + r * 0.3, r * 0.88, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      continue;
    }

    if (style === 'optic') {
      // Glowing slit/lens eye
      ctx.fillStyle = pupilColor;
      ctx.beginPath();
      ctx.ellipse(ex, ly, r * 1.1, r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.ellipse(ex, ly, r * 0.85, mood === 'focused' ? r * 0.5 : r * 0.68, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - r * 0.25, ly - r * 0.22, Math.max(0.6, r * 0.32), 0, Math.PI * 2);
      ctx.fill();
    } else if (style === 'fierce' || style === 'mischievous') {
      // Angled almond/cat-slit glowing chibi eyes
      ctx.save();
      ctx.translate(ex, ly);
      ctx.rotate(side * (style === 'fierce' ? -0.22 : -0.16));
      ctx.fillStyle = pupilColor;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.12, r * 0.92, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.88, mood === 'focused' ? r * 0.66 : r * 0.76, 0, 0, Math.PI * 2);
      ctx.fill();
      // Specular sparkle dot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-r * 0.28, -r * 0.26, Math.max(0.65, r * 0.34), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      // Classic lustrous chibi eyes (dark socket + luminous iris + twin highlights)
      ctx.fillStyle = pupilColor;
      ctx.beginPath();
      ctx.ellipse(ex, ly, r * 1.04, r * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.ellipse(ex, ly + r * 0.08, r * 0.78, r * 0.88, 0, 0, Math.PI * 2);
      ctx.fill();

      // Primary upper-left glossy catchlight
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - r * 0.26, ly - r * 0.32, Math.max(0.7, r * 0.38), 0, Math.PI * 2);
      ctx.fill();

      // Tiny lower-right secondary glint (starry sparkle)
      if (style === 'starry' || style === 'bright') {
        ctx.fillStyle = withAlpha('#ffffff', 0.85);
        ctx.beginPath();
        ctx.arc(ex + r * 0.26, ly + r * 0.3, Math.max(0.45, r * 0.2), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Expressive brows for determined/fierce/focused moods
    if (browColor || style === 'determined' || style === 'fierce' || mood === 'focused') {
      ctx.strokeStyle = browColor || pupilColor;
      ctx.lineWidth = Math.max(0.9, 1.35 * s);
      ctx.lineCap = 'round';
      const slant = style === 'fierce' || mood === 'focused' ? 0.45 : 0.22;
      ctx.beginPath();
      ctx.moveTo(ex - side * r * 0.9, ly - r * (1.15 + slant * 0.3));
      ctx.lineTo(ex + side * r * 0.85, ly - r * (1.15 - slant * 0.65));
      ctx.stroke();
    }
  }

  // Optional tiny integrated mouth detail
  if (mouth === 'smile') {
    ctx.strokeStyle = pupilColor;
    ctx.lineWidth = Math.max(0.9, 1.2 * s);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, ly + r * 1.15, r * 0.65, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else if (mouth === 'smirk') {
    ctx.strokeStyle = eyeColor;
    ctx.lineWidth = Math.max(0.9, 1.15 * s);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx + r * 0.25, ly + r * 1.1, r * 0.6, 0.2, Math.PI * 0.85);
    ctx.stroke();
  } else if (mouth === 'fang') {
    ctx.strokeStyle = pupilColor;
    ctx.lineWidth = Math.max(0.9, 1.15 * s);
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.8, ly + r * 1.15);
    quadTo(ctx, cx, ly + r * 1.6, cx + r * 0.8, ly + r * 1.15);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.22, ly + r * 1.28);
    ctx.lineTo(cx + r * 0.48, ly + r * 1.24);
    ctx.lineTo(cx + r * 0.36, ly + r * 1.72);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draws a precision toothed clockwork gear.
 */
export function drawGearWheel(
  ctx,
  cx,
  cy,
  radius,
  teeth,
  rotation,
  { fill = '#e2b75b', stroke = '#0d090c', holeFill = '#1b143b', alpha = 1 } = {},
) {
  const r = Math.max(2, radius);
  const innerR = r * 0.76;
  const count = Math.max(5, teeth);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.globalAlpha *= alpha;

  ctx.beginPath();
  for (let i = 0; i < count; i += 1) {
    const a0 = (i / count) * Math.PI * 2;
    const a1 = ((i + 0.24) / count) * Math.PI * 2;
    const a2 = ((i + 0.52) / count) * Math.PI * 2;
    const a3 = ((i + 0.76) / count) * Math.PI * 2;
    const pts = [
      [Math.cos(a0) * innerR, Math.sin(a0) * innerR],
      [Math.cos(a1) * r, Math.sin(a1) * r],
      [Math.cos(a2) * r, Math.sin(a2) * r],
      [Math.cos(a3) * innerR, Math.sin(a3) * innerR],
    ];
    for (let k = 0; k < pts.length; k += 1) {
      if (i === 0 && k === 0) ctx.moveTo(pts[k][0], pts[k][1]);
      else ctx.lineTo(pts[k][0], pts[k][1]);
    }
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(0.8, r * 0.14);
  ctx.stroke();

  ctx.fillStyle = holeFill;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draws an undulating silk ribbon / banner streamer.
 */
export function drawUndulatingRibbon(
  ctx,
  x0,
  y0,
  length,
  width,
  angle,
  wavePhase,
  { color = '#34d399', trimColor = '#e2b75b', alpha = 0.9 } = {},
) {
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(angle);
  ctx.globalAlpha *= alpha;

  const w1 = Math.sin(wavePhase) * width * 0.9;
  const w2 = Math.cos(wavePhase + 1.4) * width * 1.1;

  ctx.beginPath();
  ctx.moveTo(0, -width * 0.5);
  quadTo(ctx, length * 0.48, -width * 0.5 + w1, length, w2);
  quadTo(ctx, length * 0.5, width * 0.5 + w1, 0, width * 0.5);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = trimColor;
  ctx.lineWidth = Math.max(0.7, width * 0.22);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws a faceted crystal diamond / shard with bright upper facet and dark shadow facet.
 */
export function drawFacetedCrystal(
  ctx,
  cx,
  cy,
  rx,
  ry,
  angle,
  { primary = '#38bdf8', highlight = '#bae6fd', dark = '#0f2847', outline = '#081221', alpha = 1 } = {},
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.globalAlpha *= alpha;

  // Left/upper sunlit facet
  ctx.beginPath();
  ctx.moveTo(0, -ry);
  ctx.lineTo(rx, 0);
  ctx.lineTo(0, 0);
  ctx.lineTo(-rx, 0);
  ctx.closePath();
  ctx.fillStyle = highlight;
  ctx.fill();

  // Lower right shaded facet
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(rx, 0);
  ctx.lineTo(0, ry);
  ctx.closePath();
  ctx.fillStyle = dark;
  ctx.fill();

  // Lower left medium facet
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, ry);
  ctx.lineTo(-rx, 0);
  ctx.closePath();
  ctx.fillStyle = primary;
  ctx.fill();

  // Crisp outline
  ctx.beginPath();
  ctx.moveTo(0, -ry);
  ctx.lineTo(rx, 0);
  ctx.lineTo(0, ry);
  ctx.lineTo(-rx, 0);
  ctx.closePath();
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(0.85, Math.min(rx, ry) * 0.16);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws a glossy circular/elliptical metallic bevel gradient fill.
 */
export function makeMetallicGrad(ctx, cx, cy, r, lightColor, midColor, darkColor) {
  const safeR = Math.max(1, r);
  const g = ctx.createRadialGradient(
    cx - safeR * 0.3,
    cy - safeR * 0.35,
    safeR * 0.08,
    cx,
    cy,
    safeR,
  );
  g.addColorStop(0, lightColor);
  g.addColorStop(0.55, midColor);
  g.addColorStop(1, darkColor);
  return g;
}

/**
 * Draws an angled hexagonal plate (used for orbiting shields/facets).
 */
export function drawHexShieldTile(
  ctx,
  cx,
  cy,
  r,
  rotation,
  { fill = '#38bdf8', core = '#f0f9ff', stroke = '#071124', alpha = 0.9 } = {},
) {
  const safeR = Math.max(1.5, r);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = (i * Math.PI) / 3;
    const px = Math.cos(a) * safeR;
    const py = Math.sin(a) * safeR;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(0.8, safeR * 0.18);
  ctx.stroke();

  ctx.strokeStyle = core;
  ctx.lineWidth = Math.max(0.55, safeR * 0.1);
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = (i * Math.PI) / 3;
    const px = Math.cos(a) * safeR * 0.62;
    const py = Math.sin(a) * safeR * 0.62;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}
