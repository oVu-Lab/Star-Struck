/**
 * UnitComponentAnimators — Bespoke per-unit layered animation routines for all 33
 * Star Struck battlefield units.
 *
 * Each unit animates its own physical components (separated sprite sub-layers,
 * internal clockwork, solar convection, crystal facet caustics, living flames,
 * cloth wave strips, rolling wheels, spinning sawblades, pendulum censer/bells,
 * blinking furnace eyes, lightning coils, and synchronized skill formations).
 *
 * Mock-Canvas Safe: finite math, non-negative radii, quadTo (no bezierCurveTo),
 * and feature-checked ctx.clip().
 */

import { clamp01, withAlpha, drawStarFlare } from './NonUnitVfxGeometry.js';
import {
  quadTo,
  drawGearWheel,
  drawUndulatingRibbon,
} from './UnitObjectModelHelpers.js';

function safeClip(ctx) {
  if (typeof ctx.clip === 'function') {
    ctx.clip();
    return true;
  }
  return false;
}

/**
 * Draws an extracted sprite sub-part around its normalized pivot (px, py)
 * with optional translation, rotation, and scale.
 */
function drawRigPart(ctx, part, spriteSize, halfSize, { dx = 0, dy = 0, rot = 0, sx = 1, sy = 1, alpha = 1 } = {}) {
  if (!part || !part.canvas) return;
  const px = (part.px - 0.5) * spriteSize;
  const py = (part.py - 0.5) * spriteSize;
  ctx.save();
  if (alpha < 0.999) ctx.globalAlpha *= Math.max(0, alpha);
  ctx.translate(px + dx, py + dy);
  if (rot) ctx.rotate(rot);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.translate(-px, -py);
  ctx.drawImage(part.canvas, -halfSize, -halfSize, spriteSize, spriteSize);
  ctx.restore();
}

/**
 * Draws a radially decomposed sprite ring around normalized center (cx, cy).
 */
function drawRadialRingCanvas(ctx, canvas, cxNorm, cyNorm, spriteSize, halfSize, { rot = 0, sx = 1, sy = 1, alpha = 1 } = {}) {
  if (!canvas) return;
  const cx = (cxNorm - 0.5) * spriteSize;
  const cy = (cyNorm - 0.5) * spriteSize;
  ctx.save();
  if (alpha < 0.999) ctx.globalAlpha *= Math.max(0, alpha);
  ctx.translate(cx, cy);
  if (rot) ctx.rotate(rot);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.translate(-cx, -cy);
  ctx.drawImage(canvas, -halfSize, -halfSize, spriteSize, spriteSize);
  ctx.restore();
}

function drawHalfOrbitRing(ctx, cx, cy, rx, ry, tiltAngle, half, { color, width, alpha = 0.78, dash = null } = {}) {
  if (alpha <= 0.01) return;
  const srx = Math.max(2, rx);
  const sry = Math.max(1, ry);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tiltAngle);
  ctx.strokeStyle = withAlpha(color, alpha);
  ctx.lineWidth = Math.max(0.6, width);
  if (dash && typeof ctx.setLineDash === 'function') ctx.setLineDash(dash);
  ctx.beginPath();
  if (half === 'back') {
    ctx.ellipse(0, 0, srx, sry, 0, Math.PI, Math.PI * 2);
  } else {
    ctx.ellipse(0, 0, srx, sry, 0, 0, Math.PI);
  }
  ctx.stroke();
  if (dash && typeof ctx.setLineDash === 'function') ctx.setLineDash([]);
  ctx.restore();
}

function drawAmbientAura(ctx, cx, cy, r, pal, intensity) {
  if (intensity <= 0.01) return;
  const safeR = Math.max(4, r);
  const g = ctx.createRadialGradient(cx, cy, safeR * 0.12, cx, cy, safeR);
  g.addColorStop(0, withAlpha(pal.core, intensity));
  g.addColorStop(0.55, withAlpha(pal.glow, intensity * 0.5));
  g.addColorStop(1, withAlpha(pal.glow, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, safeR, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draws a crisp diagonal prismatic refraction / metallic sheen sweeping across a surface.
 */
function drawFacetLightSweep(ctx, cx, cy, radius, angle, phase, color, alpha, widthRatio = 0.22) {
  if (alpha <= 0.01) return;
  const r = Math.max(3, radius);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  safeClip(ctx);
  ctx.rotate(angle);
  const sweepPos = ((phase % 1) * 2.6 - 1.3) * r;
  const bandW = Math.max(2, r * widthRatio);
  const grad = ctx.createLinearGradient(sweepPos - bandW, 0, sweepPos + bandW, 0);
  grad.addColorStop(0, withAlpha(color, 0));
  grad.addColorStop(0.5, withAlpha(color, alpha));
  grad.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(-r * 1.4, -r * 1.4, r * 2.8, r * 2.8);
  ctx.restore();
}

/**
 * Draws an organic, continuously morphing multi-tongue living flame with rising embers.
 */
function drawLivingFlame(ctx, cx, cy, width, height, t, s, {
  outerColor = '#ea580c',
  midColor = '#fb923c',
  coreColor = '#fef08a',
  intensity = 1,
  emberCount = 4,
  reducedMotion = false,
} = {}) {
  const m = reducedMotion ? 0.35 : 1;
  const w = Math.max(2, width);
  const h = Math.max(3, height * (0.9 + 0.16 * Math.sin(t * 9.5) * m) * intensity);

  ctx.save();
  ctx.translate(cx, cy);

  // Outer warm glow
  const glowR = Math.max(4, Math.max(w, h) * 1.15);
  const glow = ctx.createRadialGradient(0, -h * 0.35, glowR * 0.1, 0, -h * 0.35, glowR);
  glow.addColorStop(0, withAlpha(midColor, 0.45 * intensity));
  glow.addColorStop(1, withAlpha(outerColor, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, -h * 0.35, glowR, 0, Math.PI * 2);
  ctx.fill();

  // 3 morphing flame tongues (outer, left/right dance, inner bright core)
  const sway1 = Math.sin(t * 7.8) * w * 0.28 * m;
  const sway2 = Math.cos(t * 10.6 + 1.1) * w * 0.22 * m;

  // Outer crimson-orange tongue
  ctx.fillStyle = withAlpha(outerColor, 0.92);
  ctx.beginPath();
  ctx.moveTo(-w * 0.52, 0);
  quadTo(ctx, -w * 0.65 + sway1 * 0.4, -h * 0.48, sway1, -h * 1.05);
  quadTo(ctx, w * 0.65 + sway1 * 0.4, -h * 0.48, w * 0.52, 0);
  ctx.closePath();
  ctx.fill();

  // Side licking flame tips
  for (const side of [-1, 1]) {
    const lh = h * (0.62 + 0.16 * Math.sin(t * 11.4 + side * 2.1) * m);
    const lsway = Math.sin(t * 9.2 + side * 1.5) * w * 0.22 * m;
    ctx.fillStyle = withAlpha(midColor, 0.88);
    ctx.beginPath();
    ctx.moveTo(side * w * 0.1, -h * 0.08);
    quadTo(ctx, side * w * 0.58 + lsway, -lh * 0.55, side * w * 0.32 + lsway, -lh);
    quadTo(ctx, side * w * 0.05, -lh * 0.5, 0, -h * 0.08);
    ctx.closePath();
    ctx.fill();
  }

  // Bright inner core tongue moving upward
  const coreH = h * (0.58 + 0.12 * Math.cos(t * 13.0) * m);
  ctx.fillStyle = withAlpha(coreColor, 0.95);
  ctx.beginPath();
  ctx.moveTo(-w * 0.26, -h * 0.04);
  quadTo(ctx, -w * 0.28 + sway2 * 0.5, -coreH * 0.55, sway2, -coreH);
  quadTo(ctx, w * 0.28 + sway2 * 0.5, -coreH * 0.55, w * 0.26, -h * 0.04);
  ctx.closePath();
  ctx.fill();

  // Naturally rising glowing embers
  for (let i = 0; i < emberCount; i += 1) {
    const cycle = (t * (0.85 + (i % 2) * 0.32) * (reducedMotion ? 0.4 : 1) + i * 0.27) % 1;
    const ex = Math.sin(t * 4.5 + i * 2.3) * w * (0.45 + cycle * 0.55);
    const ey = -h * 0.4 - cycle * h * 1.15;
    const er = Math.max(0.6, (1.55 - cycle * 1.0) * s);
    ctx.fillStyle = withAlpha(i % 2 === 0 ? coreColor : midColor, (1 - cycle) * 0.85);
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draws pulsing/blinking/squinting living eyes integrated directly over artwork sockets.
 */
function drawLivingEyeGlow(ctx, x1, y1, x2, y2, radius, color, anim, t) {
  const r = Math.max(0.9, radius);
  const pulse = 0.72 + 0.28 * Math.sin(t * 5.2);
  const blinkScaleY = anim.blink ? 0.14 : (anim.mood === 'focused' ? 0.62 : 1.0);
  const glowAlpha = anim.blink ? 0.18 : (0.55 + anim.attackPrep * 0.3 + anim.attackRelease * 0.35 + anim.castProgress * 0.35);

  ctx.save();
  for (const [ex, ey, side] of [[x1, y1, -1], [x2, y2, 1]]) {
    ctx.save();
    ctx.translate(ex, ey);
    if (anim.mood === 'focused') ctx.rotate(side * -0.18);
    // Soft luminous eye bloom
    const g = ctx.createRadialGradient(0, 0, 0.2, 0, 0, Math.max(1.5, r * 2.1));
    g.addColorStop(0, withAlpha(color, glowAlpha * pulse));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(1.5, r * 2.1), 0, Math.PI * 2);
    ctx.fill();

    // Blink lid or fierce core glint
    if (anim.blink) {
      ctx.fillStyle = 'rgba(10, 8, 16, 0.78)';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.15, r * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = withAlpha('#ffffff', 0.65 * pulse);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.55, Math.max(0.5, r * 0.45 * blinkScaleY), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Draws crackling electric arcs between two points.
 */
function drawLightningArc(ctx, x1, y1, x2, y2, seed, color, width, alpha) {
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.strokeStyle = withAlpha(color, alpha);
  ctx.lineWidth = Math.max(0.7, width);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  const steps = 4;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 1; i < steps; i += 1) {
    const f = i / steps;
    const jitter = Math.sin(seed * 13.7 + i * 5.3) * len * 0.18;
    ctx.lineTo(x1 + dx * f + nx * jitter, y1 + dy * f + ny * jitter);
  }
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws subtle rising embers/particles around an origin.
 */
function drawDriftingParticles(ctx, cx, cy, spreadX, travelY, count, t, s, color, alpha, reducedMotion) {
  if (alpha <= 0.02) return;
  const speed = reducedMotion ? 0.35 : 0.9;
  for (let i = 0; i < count; i += 1) {
    const cycle = (t * speed + i / count) % 1;
    const px = cx + Math.sin(t * 2.8 + i * 2.1) * spreadX * (0.6 + cycle * 0.5);
    const py = cy - cycle * travelY;
    const pr = Math.max(0.6, (1.6 - cycle * 0.9) * s);
    ctx.fillStyle = withAlpha(color, (1 - cycle) * alpha);
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draws expanding skill release ring/mandala shockwaves synchronized with skill execution.
 */
function drawSkillShockwave(ctx, cx, cy, baseR, progress, color, coreColor, s) {
  if (progress <= 0.01) return;
  const expand = 1 - progress;
  const r = Math.max(3, baseR * (0.75 + expand * 0.95));
  ctx.save();
  ctx.strokeStyle = withAlpha(color, progress * 0.85);
  ctx.lineWidth = Math.max(1.0, (2.8 * progress + 0.8) * s);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(coreColor, progress * 0.65);
  ctx.lineWidth = Math.max(0.7, 1.3 * s);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws full sprite or headless placeholder fallback.
 */
function drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s) {
  if (sprite && sprite.complete && sprite.naturalWidth > 0) {
    ctx.drawImage(sprite, -halfSize, -halfSize, spriteSize, spriteSize);
    return true;
  }
  const pal = design.palette;
  ctx.fillStyle = pal.primary;
  ctx.strokeStyle = pal.trim;
  ctx.lineWidth = Math.max(1, 1.8 * s);
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(4, halfSize * 0.62), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  return false;
}

/**
 * Draws a live internal clockwork dial with meshing gears, rotating hands, and traveling Roman light.
 */
function drawLiveClockworkMechanism(ctx, cx, cy, dialR, gearR, anim, t, s, pal, reducedMotion) {
  const gearA = anim.gearAngle;
  // 3 interlocking brass gears inside the recessed dial window
  drawGearWheel(ctx, cx - gearR * 0.34, cy - gearR * 0.24, Math.max(2.2, gearR * 0.56), 9, gearA, {
    fill: '#e2b75b',
    stroke: '#432c0d',
    holeFill: '#1a1338',
    alpha: 0.95,
  });
  drawGearWheel(ctx, cx + gearR * 0.34, cy + gearR * 0.26, Math.max(2.0, gearR * 0.44), 7, -gearA * (9 / 7) + 0.35, {
    fill: '#f5d37a',
    stroke: '#432c0d',
    holeFill: '#1a1338',
    alpha: 0.94,
  });
  drawGearWheel(ctx, cx + gearR * 0.30, cy - gearR * 0.34, Math.max(1.6, gearR * 0.32), 6, -gearA * 1.5, {
    fill: '#c4b5fd',
    stroke: '#2e1065',
    holeFill: '#1a1338',
    alpha: 0.92,
  });

  // Subtle traveling luminous light sweeping along clock Roman markings
  const markAngle = anim.spinAngle * 1.1;
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2 - Math.PI * 0.5;
    const dist = Math.abs(Math.atan2(Math.sin(a - markAngle), Math.cos(a - markAngle)));
    const glow = Math.max(0, 1 - dist / 0.85);
    if (glow > 0.08) {
      const mx = cx + Math.cos(a) * dialR * 0.80;
      const my = cy + Math.sin(a) * dialR * 0.80;
      ctx.fillStyle = withAlpha(pal.secondary, glow * (0.55 + anim.attackPrep * 0.35 + anim.castProgress * 0.4));
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(0.8, (1.4 + glow * 1.2) * s), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Independently rotating clock hands around center jewel
  const hourAngle = anim.gearAngle * 0.18 - Math.PI * 0.65;
  const minuteAngle = anim.gearAngle * 1.05 - Math.PI * 0.2;
  const chronoAngle = anim.gearAngle * (reducedMotion ? 1.4 : 2.8);

  ctx.save();
  ctx.translate(cx, cy);

  // Hour hand (ornate antique brass)
  ctx.save();
  ctx.rotate(hourAngle);
  ctx.strokeStyle = '#fde68a';
  ctx.lineWidth = Math.max(1.2, 2.0 * s);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-dialR * 0.14, 0);
  ctx.lineTo(dialR * 0.56, 0);
  ctx.stroke();
  ctx.restore();

  // Minute hand (slender burnished gold)
  ctx.save();
  ctx.rotate(minuteAngle);
  ctx.strokeStyle = '#fef9c3';
  ctx.lineWidth = Math.max(0.9, 1.35 * s);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-dialR * 0.18, 0);
  ctx.lineTo(dialR * 0.84, 0);
  ctx.stroke();
  ctx.restore();

  // Fast temporal second hand (luminous arcane violet)
  ctx.save();
  ctx.rotate(chronoAngle);
  ctx.strokeStyle = withAlpha(pal.glow, 0.92);
  ctx.lineWidth = Math.max(0.7, 0.95 * s);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-dialR * 0.24, 0);
  ctx.lineTo(dialR * 0.92, 0);
  ctx.stroke();
  ctx.restore();

  // Central ruby-gold jewel pin
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1.2, 1.9 * s), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a855f7';
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(0.7, 1.0 * s), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ============================================================================
// BESPOKE PER-UNIT ANIMATORS (ALL 33 UNITS)
// ============================================================================

export const UNIT_COMPONENT_ANIMATORS = Object.freeze({
  // --------------------------------------------------------------------------
  // 1. heavy_shield_guard — Winged Heraldic Kite-Shield Relic
  // --------------------------------------------------------------------------
  heavy_shield_guard(ctx, st) {
    const { design, anim, rig, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const charge = anim.castProgress + anim.skillRelease * 0.8 + anim.attackPrep * 0.6;

    drawAmbientAura(ctx, 0, 0, halfSize * (1.06 + charge * 0.22), pal, 0.12 + charge * 0.22);

    // Skill / attack rear wing energy chevron
    if (charge > 0.08 || anim.attackRelease > 0.05) {
      const flare = Math.max(charge, anim.attackRelease);
      ctx.save();
      ctx.strokeStyle = withAlpha(pal.trim, flare * 0.72);
      ctx.lineWidth = Math.max(1, 2.0 * s);
      ctx.beginPath();
      ctx.arc(0, 0, halfSize * (0.88 + flare * 0.24), Math.PI * 0.68, Math.PI * 2.32);
      ctx.stroke();
      ctx.restore();
    }

    if (rig && rig.parts) {
      const wingHoverY = Math.sin(t * 2.6) * 2.6 * s * m;
      const moveSweep = anim.isMoving ? Math.sin(t * 7.4) * 2.8 * s * m : 0;
      const prepIn = anim.attackPrep * -4.2 * s * m;
      const releaseOut = (anim.attackRelease * 6.0 + anim.castProgress * 5.2 + anim.skillRelease * 7.2) * s * m;
      const wingRot = (anim.attackRelease * 0.22 + anim.castProgress * 0.18 - anim.attackPrep * 0.14) * m;

      drawRigPart(ctx, rig.parts.leftWing, spriteSize, halfSize, {
        dx: -releaseOut - prepIn - moveSweep * 0.35,
        dy: wingHoverY,
        rot: -wingRot - Math.sin(t * 2.6) * 0.07 * m,
      });
      drawRigPart(ctx, rig.parts.rightWing, spriteSize, halfSize, {
        dx: releaseOut + prepIn + moveSweep * 0.35,
        dy: -wingHoverY * 0.85,
        rot: wingRot + Math.sin(t * 2.6) * 0.07 * m,
      });
      ctx.drawImage(rig.body, -halfSize, -halfSize, spriteSize, spriteSize);
    } else {
      drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    }

    // Metallic bevel sheen sweeping across central sapphire diamond boss
    drawFacetLightSweep(ctx, 0, 0, halfSize * 0.48, -0.55, t * (reducedMotion ? 0.2 : 0.45), '#bae6fd', 0.36 + charge * 0.28, 0.26);

    // Front shield impact arc on ram release / skill flare
    if (anim.attackRelease > 0.05 || anim.skillRelease > 0.05) {
      const p = Math.max(anim.attackRelease, anim.skillRelease);
      ctx.save();
      ctx.strokeStyle = withAlpha(pal.core, p * 0.85);
      ctx.lineWidth = Math.max(1.2, 2.6 * s);
      ctx.beginPath();
      ctx.arc(halfSize * 0.14, 0, halfSize * (0.72 + p * 0.22), -0.95, 0.95);
      ctx.stroke();
      ctx.restore();
    }
    drawSkillShockwave(ctx, 0, 0, halfSize * 0.85, anim.skillRelease, pal.trim, pal.core, s);
  },

  // --------------------------------------------------------------------------
  // 2. wind_cavalry — Gale Pinwheel-Lance & Jade Pennant
  // --------------------------------------------------------------------------
  wind_cavalry(ctx, st) {
    const { design, anim, rig, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const charge = anim.castProgress + anim.attackPrep * 0.5 + anim.skillRelease * 0.8;

    // Flowing silk slipstream ribbons behind turbine
    const windSpeed = t * (anim.isMoving ? 11.5 : 6.8) * (reducedMotion ? 0.35 : 1);
    drawUndulatingRibbon(ctx, -halfSize * 0.16, halfSize * 0.14, halfSize * (0.82 + (anim.isMoving ? 0.22 : 0)), 3.2 * s, Math.PI + 0.18, windSpeed, {
      color: withAlpha(pal.primary, 0.42),
      trimColor: withAlpha(pal.trim, 0.62),
      alpha: 0.72,
    });
    if (anim.isMoving || anim.attackRelease > 0.1) {
      // Crisp jade slipstream wind streaks while gliding
      ctx.save();
      ctx.strokeStyle = withAlpha(pal.secondary, anim.isMoving ? 0.52 : anim.attackRelease * 0.75);
      ctx.lineWidth = Math.max(0.8, 1.4 * s);
      for (let i = 0; i < 3; i += 1) {
        const yOff = (i - 1) * halfSize * 0.34;
        const drift = ((t * 3.5 + i * 0.37) % 1) * halfSize * 0.5;
        ctx.beginPath();
        ctx.moveTo(-halfSize * 0.45 - drift, yOff);
        ctx.lineTo(-halfSize * 0.95 - drift, yOff + (i - 1) * 2 * s);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (rig && rig.blades && rig.hubAndLance) {
      // Gently waving jade streamer under hub
      ctx.save();
      const ribSway = Math.sin(t * (anim.isMoving ? 10 : 5.2)) * 0.09 * m;
      ctx.translate(-halfSize * 0.05, halfSize * 0.18);
      ctx.rotate(ribSway);
      ctx.translate(halfSize * 0.05, -halfSize * 0.18);
      ctx.drawImage(rig.ribbon, -halfSize, -halfSize, spriteSize, spriteSize);
      ctx.restore();

      // Continuously rotating 4-blade emerald turbine behind the gilded lance hub
      drawRadialRingCanvas(ctx, rig.blades, rig.cx, rig.cy, spriteSize, halfSize, {
        rot: anim.spinAngle,
      });

      // Fixed hub + forward lance prow (darts forward slightly during thrust)
      const lanceThrust = (anim.attackRelease * 4.5 - anim.attackPrep * 2.2) * s * m;
      ctx.save();
      ctx.translate(lanceThrust, 0);
      ctx.drawImage(rig.hubAndLance, -halfSize, -halfSize, spriteSize, spriteSize);
      ctx.restore();
    } else {
      drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    }

    // Wind spiral glint at lance tip during prep/thrust/skill
    if (charge > 0.12 || anim.attackRelease > 0.08) {
      const tipX = halfSize * 0.88;
      drawStarFlare(ctx, tipX, 0, (4.2 + (charge + anim.attackRelease) * 4.2) * s, 0.18, pal.secondary, '#ffffff', 0.85, anim.spinAngle, 4);
    }
    drawSkillShockwave(ctx, 0, 0, halfSize * 0.82, anim.skillRelease, pal.secondary, pal.core, s);
  },

  // --------------------------------------------------------------------------
  // 3. arcane_archer — Recurve Starlight Crystal-Bow
  // --------------------------------------------------------------------------
  arcane_archer(ctx, st) {
    const { design, anim, rig, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const drawTension = clamp01(anim.attackPrep * 1.1 + anim.castProgress * 0.95);

    drawAmbientAura(ctx, 0, 0, halfSize * (0.98 + drawTension * 0.22), pal, 0.09 + drawTension * 0.24);

    if (rig && rig.parts) {
      // Main recurve bow subtly compresses vertically as bowstring draws back
      ctx.save();
      const flexY = 1 - drawTension * 0.055 * m;
      const flexX = 1 + drawTension * 0.04 * m;
      ctx.scale(flexX, flexY);
      ctx.drawImage(rig.body, -halfSize, -halfSize, spriteSize, spriteSize);
      ctx.restore();

      // 2 alpha-isolated purple diamond shards orbit gently and draw inward on tension
      const shardBob = Math.sin(t * 3.4) * 2.8 * s * m;
      const shardDrawX = -drawTension * 5.2 * s * m + anim.attackRelease * 3.4 * s * m;
      const shardPullY = -drawTension * 3.2 * s * m;
      drawRigPart(ctx, rig.parts.topShard, spriteSize, halfSize, {
        dx: shardDrawX + Math.cos(t * 2.2) * 1.6 * s * m,
        dy: shardBob - shardPullY,
        rot: Math.sin(t * 2.8) * 0.16 * m - drawTension * 0.22,
      });
      drawRigPart(ctx, rig.parts.bottomShard, spriteSize, halfSize, {
        dx: shardDrawX - Math.cos(t * 2.2) * 1.6 * s * m,
        dy: -shardBob + shardPullY,
        rot: -Math.sin(t * 2.8) * 0.16 * m + drawTension * 0.22,
      });
    } else {
      drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    }

    // Live flexing luminous bowstring & charging starlight arrow energy
    const stringTopX = -halfSize * 0.44;
    const stringTopY = -halfSize * 0.62;
    const stringBotY = halfSize * 0.62;
    const stringPullX = stringTopX - drawTension * halfSize * 0.26 * m + anim.attackRelease * Math.sin(t * 48) * 2.4 * s * m;

    if (drawTension > 0.04 || anim.attackRelease > 0.04) {
      ctx.save();
      ctx.strokeStyle = withAlpha(pal.secondary, 0.65 + drawTension * 0.35);
      ctx.lineWidth = Math.max(1.0, (1.3 + drawTension * 1.2) * s);
      ctx.beginPath();
      ctx.moveTo(stringTopX, stringTopY);
      ctx.lineTo(stringPullX, 0);
      ctx.lineTo(stringTopX, stringBotY);
      ctx.stroke();

      // Glowing starlight arrowhead charge at riser
      drawStarFlare(
        ctx,
        halfSize * 0.44 + anim.attackRelease * 4 * s,
        0,
        (3.8 + drawTension * 5.2 + anim.attackRelease * 4.0) * s,
        0.16,
        pal.secondary,
        '#ffffff',
        0.7 + drawTension * 0.3,
        t * (reducedMotion ? 0.6 : 2.2),
        4,
      );
      ctx.restore();
    }

    // Prismatic facet shimmer along bow limbs
    drawFacetLightSweep(ctx, 0, 0, halfSize * 0.56, 0.4, t * (reducedMotion ? 0.18 : 0.42), '#e0f2fe', 0.28 + drawTension * 0.25);
    drawSkillShockwave(ctx, halfSize * 0.15, 0, halfSize * 0.82, anim.skillRelease, pal.secondary, pal.core, s);
  },

  // --------------------------------------------------------------------------
  // 4. field_cleric — Sacred Cathedral Glass Censer-Lantern
  // --------------------------------------------------------------------------
  field_cleric(ctx, st) {
    const { design, anim, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const healCharge = anim.castProgress + anim.attackPrep * 0.7 + anim.attackRelease * 0.9 + anim.skillRelease;

    // Warm emerald-gold sanctuary aura
    drawAmbientAura(ctx, 0, halfSize * 0.06, halfSize * (1.08 + healCharge * 0.24), pal, 0.14 + healCharge * 0.26);

    // Top-pivoted pendulum suspension sway (pivots cleanly from halo ring at y=0.14)
    const pivotY = -halfSize * 0.72;
    const pendulumAngle = Math.sin(t * (anim.isMoving ? 5.2 : 2.5)) * (anim.isMoving ? 0.09 : 0.055) * m
      + (anim.attackRelease * 0.16 - anim.attackPrep * 0.12) * m;

    ctx.save();
    ctx.translate(0, pivotY);
    ctx.rotate(pendulumAngle);
    ctx.translate(0, -pivotY);

    drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);

    // Internal flickering emerald-gold flame light pulsing through stained-glass panes
    const flamePulse = 0.65 + 0.35 * Math.sin(t * (reducedMotion ? 2.2 : 6.4));
    const coreR = halfSize * (0.28 + flamePulse * 0.06 + healCharge * 0.12);
    const paneGlow = ctx.createRadialGradient(0, halfSize * 0.12, 1, 0, halfSize * 0.12, Math.max(3, coreR));
    paneGlow.addColorStop(0, withAlpha('#fef08a', 0.48 * flamePulse + healCharge * 0.3));
    paneGlow.addColorStop(0.55, withAlpha(pal.secondary, 0.28 * flamePulse + healCharge * 0.2));
    paneGlow.addColorStop(1, withAlpha(pal.primary, 0));
    ctx.fillStyle = paneGlow;
    ctx.beginPath();
    ctx.arc(0, halfSize * 0.12, Math.max(3, coreR), 0, Math.PI * 2);
    ctx.fill();

    // Shimmering crown halo glint
    const haloGlintX = Math.cos(t * 2.2) * halfSize * 0.24;
    drawStarFlare(ctx, haloGlintX, -halfSize * 0.72, (2.6 + healCharge * 3.0) * s, 0.2, pal.trim, '#ffffff', 0.72, t * 0.8, 4);
    ctx.restore();

    // Rising sacred blessing motes
    drawDriftingParticles(ctx, 0, halfSize * 0.15, halfSize * 0.45, halfSize * 0.95, 4, t, s, '#a7f3d0', 0.65 + healCharge * 0.3, reducedMotion);

    // Expanding sanctum blessing ring on heal/cast
    if (anim.attackRelease > 0.08 || anim.castProgress > 0.15) {
      const p = Math.max(anim.attackRelease, anim.castProgress * 0.7);
      ctx.save();
      ctx.strokeStyle = withAlpha('#6ee7b7', p * 0.75);
      ctx.lineWidth = Math.max(1, 1.8 * s);
      ctx.beginPath();
      ctx.ellipse(0, halfSize * 0.18, halfSize * (0.65 + p * 0.35), halfSize * (0.28 + p * 0.14), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    drawSkillShockwave(ctx, 0, 0, halfSize * 0.88, anim.skillRelease, '#6ee7b7', '#fef08a', s);
  },

  // --------------------------------------------------------------------------
  // 5. vanguard_breaker — Living Molten Forge-Anvil War-Maul
  // --------------------------------------------------------------------------
  vanguard_breaker(ctx, st) {
    const { design, anim, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const heat = anim.attackPrep * 0.9 + anim.attackRelease * 1.1 + anim.castProgress + anim.skillRelease;

    drawAmbientAura(ctx, halfSize * 0.05, -halfSize * 0.05, halfSize * (1.02 + heat * 0.22), pal, 0.12 + heat * 0.26);

    // Pivot weighty overhead cleave around the handle pommel at (0.44, 0.82)
    const pomX = (0.44 - 0.5) * spriteSize;
    const pomY = (0.82 - 0.5) * spriteSize;
    const swingRot = (-anim.attackPrep * 0.32 + anim.attackRelease * 0.38 - anim.attackRecovery * 0.08) * m;

    ctx.save();
    ctx.translate(pomX, pomY);
    ctx.rotate(swingRot);
    ctx.translate(-pomX, -pomY);

    drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);

    // Breathing molten furnace belly glow inside grate (0.44, 0.42)
    const bellyX = (0.44 - 0.5) * spriteSize;
    const bellyY = (0.42 - 0.5) * spriteSize;
    const breath = 0.65 + 0.35 * Math.sin(t * 4.4);
    const bGrad = ctx.createRadialGradient(bellyX, bellyY, 1, bellyX, bellyY, Math.max(3, halfSize * (0.28 + heat * 0.14)));
    bGrad.addColorStop(0, withAlpha('#fde047', (0.36 + heat * 0.34) * breath));
    bGrad.addColorStop(0.6, withAlpha('#f97316', (0.22 + heat * 0.24) * breath));
    bGrad.addColorStop(1, withAlpha('#ea580c', 0));
    ctx.fillStyle = bGrad;
    ctx.beginPath();
    ctx.arc(bellyX, bellyY, Math.max(3, halfSize * (0.28 + heat * 0.14)), 0, Math.PI * 2);
    ctx.fill();

    // Blinking / fierce squinting spirit eyes inside anvil grate (0.405, 0.40) & (0.485, 0.40)
    drawLivingEyeGlow(
      ctx,
      (0.405 - 0.5) * spriteSize,
      (0.40 - 0.5) * spriteSize,
      (0.485 - 0.5) * spriteSize,
      (0.40 - 0.5) * spriteSize,
      2.2 * s,
      '#fde047',
      anim,
      t,
    );

    // Superheated incandescent horn flare on the right anvil wedge
    if (heat > 0.12) {
      const hornX = (0.76 - 0.5) * spriteSize;
      const hornY = (0.36 - 0.5) * spriteSize;
      drawStarFlare(ctx, hornX, hornY, (4.0 + heat * 4.5) * s, 0.22, '#fb923c', '#fffbeb', Math.min(1, heat * 0.9), t * 1.4, 4);
    }

    // Twin brass chimneys puffing embers & warm forge steam at (0.36, 0.14) and (0.50, 0.14)
    for (let c = 0; c < 2; c += 1) {
      const cx = ((c === 0 ? 0.36 : 0.50) - 0.5) * spriteSize;
      const cy = (0.14 - 0.5) * spriteSize;
      const cycle = (t * (reducedMotion ? 0.45 : 1.15) + c * 0.5) % 1;
      const puffY = cy - cycle * halfSize * 0.42;
      const puffX = cx + Math.sin(t * 3 + c * 2) * 2.5 * s;
      const puffR = Math.max(1.2, (2.2 + cycle * 4.2) * s);
      ctx.fillStyle = withAlpha(cycle < 0.35 ? '#fb923c' : '#94a3b8', (1 - cycle) * (0.45 + heat * 0.25));
      ctx.beginPath();
      ctx.arc(puffX, puffY, puffR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    drawDriftingParticles(ctx, 0, -halfSize * 0.45, halfSize * 0.38, halfSize * 0.65, 4, t, s, '#fbbf24', 0.65 + heat * 0.3, reducedMotion);
    drawSkillShockwave(ctx, halfSize * 0.2, 0, halfSize * 0.88, anim.skillRelease, '#f97316', '#fde047', s);
  },

  // --------------------------------------------------------------------------
  // 6. pulse_skirmisher — Twin-Coil Arcane Volt-Turbine Pod
  // --------------------------------------------------------------------------
  pulse_skirmisher(ctx, st) {
    const { design, anim, rig, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const volt = anim.attackPrep * 0.8 + anim.attackRelease + anim.castProgress + anim.skillRelease;

    // Ion tailfin thruster exhaust on the left
    const thrustLen = halfSize * (anim.isMoving ? 0.58 : 0.26) * (0.85 + 0.25 * Math.sin(t * 22) * m);
    const tailX = -halfSize * 0.66;
    const tGrad = ctx.createLinearGradient(tailX, 0, tailX - thrustLen, 0);
    tGrad.addColorStop(0, withAlpha('#67e8f9', anim.isMoving ? 0.85 : 0.48));
    tGrad.addColorStop(1, withAlpha('#06b6d4', 0));
    ctx.fillStyle = tGrad;
    ctx.beginPath();
    ctx.moveTo(tailX, -3.5 * s);
    ctx.lineTo(tailX - thrustLen, 0);
    ctx.lineTo(tailX, 3.5 * s);
    ctx.closePath();
    ctx.fill();

    if (rig && rig.parts) {
      ctx.drawImage(rig.body, -halfSize, -halfSize, spriteSize, spriteSize);

      // Alternating rapid-fire kickback on top vs bottom gold emitter barrels
      const activeTop = (anim.attackIndex % 2) === 0;
      const topKick = activeTop ? -anim.attackRelease * 6.5 * s * m : -anim.attackPrep * 1.4 * s * m;
      const botKick = !activeTop ? -anim.attackRelease * 6.5 * s * m : -anim.attackPrep * 1.4 * s * m;
      const hum = Math.sin(t * 26) * 0.55 * s * m * (0.4 + volt);

      drawRigPart(ctx, rig.parts.topBarrel, spriteSize, halfSize, { dx: topKick, dy: hum });
      drawRigPart(ctx, rig.parts.bottomBarrel, spriteSize, halfSize, { dx: botKick, dy: -hum });
    } else {
      drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    }

    // Crackling volt arcs jumping across top & bottom copper coils (0.47, 0.27) & (0.47, 0.73)
    const coilX = (0.47 - 0.5) * spriteSize;
    const topCoilY = (0.27 - 0.5) * spriteSize;
    const botCoilY = (0.73 - 0.5) * spriteSize;
    const arcAlpha = reducedMotion ? 0.28 : (0.35 + 0.3 * Math.sin(t * 15) + volt * 0.45);
    drawLightningArc(ctx, coilX - 5 * s, topCoilY, coilX + 7 * s, topCoilY + 2 * s, t * 3.1, '#67e8f9', 1.1 * s, arcAlpha);
    drawLightningArc(ctx, coilX - 5 * s, botCoilY, coilX + 7 * s, botCoilY - 2 * s, t * 3.1 + 4.2, '#67e8f9', 1.1 * s, arcAlpha);

    // Scanning lens glint at (0.61, 0.50)
    const lensX = (0.61 - 0.5) * spriteSize;
    drawStarFlare(ctx, lensX + Math.sin(t * 4) * 1.5 * s, 0, (2.5 + volt * 2.5) * s, 0.2, '#a5f3fc', '#ffffff', 0.65, t * 1.1, 4);

    // Muzzle flash on active barrel
    if (anim.attackRelease > 0.12) {
      const mY = ((anim.attackIndex % 2) === 0 ? 0.42 : 0.58) - 0.5;
      drawStarFlare(ctx, halfSize * 0.88, mY * spriteSize, (5.5 + anim.attackRelease * 5.0) * s, 0.16, '#22d3ee', '#ffffff', anim.attackRelease * 0.95, t * 4, 4);
    }
    drawSkillShockwave(ctx, 0, 0, halfSize * 0.85, anim.skillRelease, '#22d3ee', '#ecfeff', s);
  },

  // --------------------------------------------------------------------------
  // 7. solar_pyromancer — Miniature Celestial Sun & Corona Rings (FLAGSHIP)
  // --------------------------------------------------------------------------
  solar_pyromancer(ctx, st) {
    const { design, anim, rig, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const cx = (0.525 - 0.5) * spriteSize;
    const cy = 0;

    // Attack: corona contracts briefly during prep, then erupts outward on release
    const contract = 1 - anim.attackPrep * 0.16 * m + anim.attackRelease * 0.22 * m + anim.castProgress * 0.16 * m + anim.skillRelease * 0.28 * m;
    const brightness = 0.5 + 0.16 * Math.sin(t * 3.8) * m + anim.attackPrep * 0.35 + anim.attackRelease * 0.55 + anim.castProgress * 0.5 + anim.skillRelease * 0.65;

    // Warm expanding/contracting solar corona aura
    drawAmbientAura(ctx, cx, cy, halfSize * (1.18 * contract), pal, Math.min(0.75, 0.22 + brightness * 0.32));

    // Solar particle trail when gliding across battlefield
    if (anim.isMoving) {
      for (let i = 0; i < 4; i += 1) {
        const cycle = (t * (reducedMotion ? 0.5 : 1.4) + i * 0.25) % 1;
        const tx = -halfSize * (0.45 + cycle * 0.85);
        const ty = Math.sin(t * 6 + i * 2.1) * halfSize * 0.28;
        ctx.fillStyle = withAlpha(i % 2 === 0 ? '#fde047' : '#f97316', (1 - cycle) * 0.72);
        ctx.beginPath();
        ctx.arc(tx, ty, Math.max(0.8, (2.6 - cycle * 1.7) * s), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Back half of outer tilted golden solar corona ring
    drawHalfOrbitRing(ctx, cx, cy, halfSize * 1.14 * contract, halfSize * 0.40 * contract, -0.34 + Math.sin(t * 0.9) * 0.08 * m, 'back', {
      color: '#fde047',
      width: (1.8 + anim.castProgress * 1.2) * s,
      alpha: 0.58 + anim.castProgress * 0.3,
    });

    // Fluctuating procedural solar prominence loops radiating behind the sun
    const promCount = 6;
    for (let i = 0; i < promCount; i += 1) {
      const a = anim.secondaryAngle * 0.55 + (i * Math.PI * 2) / promCount;
      const wave = 0.88 + 0.18 * Math.sin(t * 4.6 + i * 1.9) * m;
      const reach = halfSize * (0.78 * contract * wave);
      const px = cx + Math.cos(a) * reach * 0.68;
      const py = cy + Math.sin(a) * reach * 0.68;
      const pr = Math.max(3, halfSize * (0.28 + brightness * 0.12));
      const g = ctx.createRadialGradient(px, py, 1, px, py, pr);
      g.addColorStop(0, withAlpha('#fde047', 0.36 + brightness * 0.22));
      g.addColorStop(0.6, withAlpha('#f97316', 0.2));
      g.addColorStop(1, withAlpha('#ea580c', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3-layer radial sprite decomposition: outer bronze compass ring, middle prominences, breathing sun core
    if (rig && rig.rings) {
      drawRadialRingCanvas(ctx, rig.rings.outerRing, rig.cx, rig.cy, spriteSize, halfSize, {
        rot: anim.spinAngle * 0.45,
        sx: contract,
        sy: contract,
      });
      const promScale = contract * (1 + Math.sin(t * 4.2) * 0.045 * m);
      drawRadialRingCanvas(ctx, rig.rings.prominences, rig.cx, rig.cy, spriteSize, halfSize, {
        rot: anim.secondaryAngle * 0.72,
        sx: promScale,
        sy: promScale,
      });
      const coreScale = 1 + Math.sin(t * 3.1) * 0.045 * m - anim.attackPrep * 0.06 * m + anim.attackRelease * 0.09 * m;
      drawRadialRingCanvas(ctx, rig.rings.core, rig.cx, rig.cy, spriteSize, halfSize, {
        rot: anim.spinAngle * 0.12,
        sx: coreScale,
        sy: coreScale,
      });
    } else {
      drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    }

    // Internal flowing solar plasma convection bands clipped cleanly to the sun sphere
    const sunR = halfSize * 0.36;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(3, sunR), 0, Math.PI * 2);
    safeClip(ctx);
    for (let i = 0; i < 3; i += 1) {
      const a = anim.spinAngle * 0.8 + i * 2.1;
      const fx = Math.cos(a) * sunR * 0.38;
      const fy = Math.sin(a * 1.2) * sunR * 0.38;
      const fg = ctx.createRadialGradient(fx, fy, 0.5, fx, fy, Math.max(2, sunR * 0.65));
      fg.addColorStop(0, withAlpha('#fffdf4', 0.32 + brightness * 0.24));
      fg.addColorStop(0.6, withAlpha('#fde047', 0.16));
      fg.addColorStop(1, withAlpha('#f97316', 0));
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(fx, fy, Math.max(2, sunR * 0.65), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Front half of outer golden corona ring
    drawHalfOrbitRing(ctx, cx, cy, halfSize * 1.14 * contract, halfSize * 0.40 * contract, -0.34 + Math.sin(t * 0.9) * 0.08 * m, 'front', {
      color: '#fef08a',
      width: (1.8 + anim.castProgress * 1.2) * s,
      alpha: 0.68 + anim.castProgress * 0.28,
    });

    // Small drifting solar embers orbiting the corona
    for (let i = 0; i < 5; i += 1) {
      const a = anim.spinAngle * (0.7 + (i % 2) * 0.35) + (i * Math.PI * 2) / 5;
      const orbitR = halfSize * (0.86 + (i % 3) * 0.1) * contract;
      const px = cx + Math.cos(a) * orbitR;
      const py = cy + Math.sin(a) * orbitR * 0.62;
      ctx.fillStyle = withAlpha(i % 2 === 0 ? '#fffbeb' : '#fb923c', 0.72);
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.8, (1.5 + (i % 2) * 0.6) * s), 0, Math.PI * 2);
      ctx.fill();
    }

    // Attack release: directional solar flare expanding toward target
    if (anim.attackRelease > 0.06) {
      const p = anim.attackRelease;
      ctx.save();
      ctx.strokeStyle = withAlpha('#fde047', p * 0.92);
      ctx.lineWidth = Math.max(1.2, 2.8 * s);
      ctx.beginPath();
      ctx.arc(cx + halfSize * 0.18, cy, halfSize * (0.65 + (1 - p) * 0.45), -0.95, 0.95);
      ctx.stroke();
      drawStarFlare(ctx, cx + halfSize * 0.56, cy, (6.0 + p * 6.5) * s, 0.18, '#fb923c', '#fffdf4', p * 0.95, anim.spinAngle, 6);
      ctx.restore();
    }

    // Skill choreography: expanding double corona ring & solar eruption
    if (anim.castProgress > 0.05 || anim.skillRelease > 0.05) {
      const sp = Math.max(anim.castProgress, anim.skillRelease);
      ctx.save();
      ctx.strokeStyle = withAlpha('#fb923c', sp * 0.78);
      ctx.lineWidth = Math.max(1.2, 2.4 * s);
      ctx.beginPath();
      ctx.arc(cx, cy, halfSize * (0.92 + sp * 0.38), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    drawSkillShockwave(ctx, cx, cy, halfSize * 0.95, anim.skillRelease, '#fb923c', '#fffdf4', s);
  },

  // --------------------------------------------------------------------------
  // 8. aegis_sentinel — Geodesic Sapphire Prism-Beacon
  // --------------------------------------------------------------------------
  aegis_sentinel(ctx, st) {
    const { design, anim, rig, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const charge = anim.castProgress + anim.attackPrep * 0.6 + anim.attackRelease * 0.8 + anim.skillRelease;

    drawAmbientAura(ctx, 0, 0, halfSize * (1.06 + charge * 0.26), pal, 0.14 + charge * 0.24);

    // 3D depth-sorted orbital positions for the 3 extracted hardlight hex tiles
    const orbitAngle = anim.spinAngle;
    const tileSpecs = [
      { key: 'leftTile', baseA: Math.PI, yBias: 0 },
      { key: 'rightTile', baseA: 0, yBias: 0 },
      { key: 'bottomTile', baseA: Math.PI * 0.5, yBias: halfSize * 0.12 },
    ];
    const gather = 1 - anim.attackPrep * 0.25 * m + anim.attackRelease * 0.18 * m + anim.castProgress * 0.24 * m;
    const tileStates = tileSpecs.map((ts, idx) => {
      const a = orbitAngle + ts.baseA;
      const depth = Math.sin(a); // <0 behind body, >=0 in front
      const ox = Math.cos(a) * halfSize * 0.18 * gather * m;
      const oy = Math.sin(a * 1.5 + idx) * halfSize * 0.08 * m + ts.yBias * (anim.castProgress * 0.2);
      return { ...ts, depth, ox, oy, scale: 0.94 + depth * 0.08 * m };
    });

    if (rig && rig.parts) {
      // Rear tiles (depth < 0)
      for (const ts of tileStates) {
        if (ts.depth < 0) {
          drawRigPart(ctx, rig.parts[ts.key], spriteSize, halfSize, {
            dx: ts.ox,
            dy: ts.oy,
            sx: ts.scale,
            sy: ts.scale,
          });
        }
      }

      // Main sapphire prism cylinder
      ctx.drawImage(rig.body, -halfSize, -halfSize, spriteSize, spriteSize);

      // Levitating top gold pyramid finial
      const pyrLift = (-2.2 + Math.sin(t * 3.4) * 2.4 - charge * 3.2) * s * m;
      drawRigPart(ctx, rig.parts.topPyramid, spriteSize, halfSize, {
        dy: pyrLift,
        rot: Math.sin(t * 2.1) * 0.05 * m,
      });

      // Foreground tiles (depth >= 0)
      for (const ts of tileStates) {
        if (ts.depth >= 0) {
          drawRigPart(ctx, rig.parts[ts.key], spriteSize, halfSize, {
            dx: ts.ox,
            dy: ts.oy,
            sx: ts.scale,
            sy: ts.scale,
          });
        }
      }
    } else {
      drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    }

    // Diagonal crystal refraction sweep across prism body
    drawFacetLightSweep(ctx, 0, 0, halfSize * 0.46, -0.5, t * (reducedMotion ? 0.18 : 0.45), '#e0f2fe', 0.36 + charge * 0.3);

    // Skill / attack hardlight hex barrier matrix overlay
    if (charge > 0.12) {
      ctx.save();
      ctx.strokeStyle = withAlpha('#7dd3fc', Math.min(0.9, charge * 0.75));
      ctx.lineWidth = Math.max(1.0, 1.8 * s);
      ctx.beginPath();
      const hexR = halfSize * (0.78 + charge * 0.24);
      for (let i = 0; i < 6; i += 1) {
        const a = anim.spinAngle * 0.5 + (i * Math.PI) / 3;
        const hx = Math.cos(a) * hexR;
        const hy = Math.sin(a) * hexR;
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
    drawSkillShockwave(ctx, 0, 0, halfSize * 0.9, anim.skillRelease, '#38bdf8', '#f0f9ff', s);
  },

  // --------------------------------------------------------------------------
  // 9. chrono_weaver — Antique-Brass Chronometer & Astrolabe (FLAGSHIP)
  // --------------------------------------------------------------------------
  chrono_weaver(ctx, st) {
    const { design, anim, rig, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const dialCx = (0.505 - 0.5) * spriteSize;
    const dialCy = (0.555 - 0.5) * spriteSize;
    const dialR = 0.205 * spriteSize;
    const gearR = 0.098 * spriteSize;
    const temporalCharge = anim.attackPrep * 0.8 + anim.attackRelease * 0.9 + anim.castProgress + anim.skillRelease;

    // Rings align closer to horizontal during attack prep / cast
    const alignFactor = 1 - Math.min(0.75, anim.attackPrep * 0.6 + anim.castProgress * 0.7);
    const ringTiltA = (-0.38 + Math.sin(t * 0.9) * 0.08 * m) * alignFactor;
    const ringTiltB = (0.44 + Math.cos(t * 1.1) * 0.08 * m) * alignFactor;
    const ringRx = halfSize * (1.16 + temporalCharge * 0.12);
    const ringRy = ringRx * 0.36;

    drawAmbientAura(ctx, dialCx, dialCy, halfSize * (1.12 + temporalCharge * 0.24), pal, 0.14 + temporalCharge * 0.26);

    // Skill choreography: layered rear spectral clockwork wheels during cast / release
    if (anim.castProgress > 0.05 || anim.skillRelease > 0.05) {
      const sp = Math.max(anim.castProgress, anim.skillRelease);
      drawGearWheel(ctx, dialCx - halfSize * 0.52, dialCy - halfSize * 0.34, halfSize * 0.42 * (0.7 + sp * 0.4), 12, anim.gearAngle * 0.85, {
        fill: 'rgba(139, 92, 246, 0.22)',
        stroke: withAlpha('#e2b75b', sp * 0.8),
        holeFill: 'rgba(12, 8, 29, 0.3)',
        alpha: sp * 0.85,
      });
      drawGearWheel(ctx, dialCx + halfSize * 0.54, dialCy + halfSize * 0.30, halfSize * 0.36 * (0.7 + sp * 0.4), 10, -anim.gearAngle * 1.05, {
        fill: 'rgba(167, 139, 250, 0.2)',
        stroke: withAlpha('#c4b5fd', sp * 0.82),
        holeFill: 'rgba(12, 8, 29, 0.3)',
        alpha: sp * 0.85,
      });
    }

    // Back halves of 2 independently rotating temporal rings
    drawHalfOrbitRing(ctx, dialCx, dialCy, ringRx, ringRy, ringTiltA, 'back', {
      color: '#e2b75b',
      width: 1.6 * s,
      alpha: 0.58 + temporalCharge * 0.3,
    });
    drawHalfOrbitRing(ctx, dialCx, dialCy, ringRx * 0.88, ringRy * 0.88, ringTiltB, 'back', {
      color: '#a78bfa',
      width: 1.3 * s,
      alpha: 0.48 + temporalCharge * 0.32,
      dash: [3 * s, 3 * s],
    });

    // Recessed watch sprite body (static center gears masked cleanly out)
    if (rig && rig.body) {
      ctx.drawImage(rig.body, -halfSize, -halfSize, spriteSize, spriteSize);
    } else {
      drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    }

    // Live interlocking brass gears + dual-speed hands + traveling Roman light!
    drawLiveClockworkMechanism(ctx, dialCx, dialCy, dialR, gearR, anim, t, s, pal, reducedMotion);

    // Front halves of the 2 independently rotating temporal rings + orbiting star-ticks
    drawHalfOrbitRing(ctx, dialCx, dialCy, ringRx, ringRy, ringTiltA, 'front', {
      color: '#f5d37a',
      width: 1.6 * s,
      alpha: 0.72 + temporalCharge * 0.25,
    });
    drawHalfOrbitRing(ctx, dialCx, dialCy, ringRx * 0.88, ringRy * 0.88, ringTiltB, 'front', {
      color: '#c4b5fd',
      width: 1.3 * s,
      alpha: 0.62 + temporalCharge * 0.3,
      dash: [3 * s, 3 * s],
    });

    // Orbiting temporal nodes at 2 different angular speeds on the 2 rings
    for (let i = 0; i < 2; i += 1) {
      const a = (i === 0 ? anim.spinAngle * 1.25 : anim.secondaryAngle * 1.65) + i * Math.PI;
      const tilt = i === 0 ? ringTiltA : ringTiltB;
      const rx = i === 0 ? ringRx : ringRx * 0.88;
      const ry = i === 0 ? ringRy : ringRy * 0.88;
      const nx = Math.cos(a) * rx;
      const ny = Math.sin(a) * ry;
      const px = dialCx + nx * Math.cos(tilt) - ny * Math.sin(tilt);
      const py = dialCy + nx * Math.sin(tilt) + ny * Math.cos(tilt);
      drawStarFlare(ctx, px, py, (3.2 + temporalCharge * 2.2) * s, 0.18, i === 0 ? '#fde047' : '#c4b5fd', '#ffffff', 0.88, anim.gearAngle, 4);
    }

    // Attack release: radial clock-hand temporal pulse wave
    if (anim.attackRelease > 0.06) {
      const p = anim.attackRelease;
      ctx.save();
      ctx.strokeStyle = withAlpha('#c4b5fd', p * 0.9);
      ctx.lineWidth = Math.max(1.0, 2.2 * s);
      ctx.beginPath();
      ctx.arc(dialCx, dialCy, halfSize * (0.55 + (1 - p) * 0.55), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    drawSkillShockwave(ctx, dialCx, dialCy, halfSize * 0.96, anim.skillRelease, '#a78bfa', '#fef08a', s);
  },

  // --------------------------------------------------------------------------
  // 10. astral_construct — Monumental Celestial Orrery Monolith-Cube
  // --------------------------------------------------------------------------
  astral_construct(ctx, st) {
    const { design, anim, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const charge = anim.castProgress + anim.attackPrep * 0.6 + anim.attackRelease * 0.8 + anim.skillRelease;
    const tilt1 = -0.42 + Math.sin(anim.spinAngle * 0.5) * 0.14 * m;
    const tilt2 = 0.48 + Math.cos(anim.secondaryAngle * 0.55) * 0.14 * m;
    const rx = halfSize * (1.14 + charge * 0.14);
    const ry = rx * 0.36;

    drawAmbientAura(ctx, 0, 0, halfSize * (1.15 + charge * 0.25), pal, 0.15 + charge * 0.26);

    // Back halves of nested brass gimbal rings
    drawHalfOrbitRing(ctx, 0, 0, rx, ry, tilt1, 'back', { color: '#e2b75b', width: 2.0 * s, alpha: 0.65 + charge * 0.25 });
    drawHalfOrbitRing(ctx, 0, 0, rx * 0.86, ry * 0.86, tilt2, 'back', { color: '#38bdf8', width: 1.4 * s, alpha: 0.5 + charge * 0.3 });

    drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);

    // Boiling cyan star-furnace core pulsing inside cube chamber (0.51, 0.50)
    const corePulse = 0.72 + 0.28 * Math.sin(t * (reducedMotion ? 2.0 : 5.2));
    const coreR = halfSize * (0.24 + charge * 0.12) * corePulse;
    const cGrad = ctx.createRadialGradient(0, 0, 0.5, 0, 0, Math.max(3, coreR));
    cGrad.addColorStop(0, withAlpha('#ffffff', 0.65 * corePulse));
    cGrad.addColorStop(0.5, withAlpha('#38bdf8', 0.45 + charge * 0.3));
    cGrad.addColorStop(1, withAlpha('#0284c7', 0));
    ctx.fillStyle = cGrad;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(3, coreR), 0, Math.PI * 2);
    ctx.fill();

    // Front halves of brass gimbal rings + orbiting golden counterweight spheres
    drawHalfOrbitRing(ctx, 0, 0, rx, ry, tilt1, 'front', { color: '#f5d37a', width: 2.0 * s, alpha: 0.78 + charge * 0.2 });
    drawHalfOrbitRing(ctx, 0, 0, rx * 0.86, ry * 0.86, tilt2, 'front', { color: '#7dd3fc', width: 1.4 * s, alpha: 0.65 + charge * 0.3 });

    for (let i = 0; i < 2; i += 1) {
      const a = i === 0 ? anim.spinAngle : anim.secondaryAngle;
      const tilt = i === 0 ? tilt1 : tilt2;
      const rX = i === 0 ? rx : rx * 0.86;
      const rY = i === 0 ? ry : ry * 0.86;
      const nx = Math.cos(a) * rX;
      const ny = Math.sin(a) * rY;
      const px = nx * Math.cos(tilt) - ny * Math.sin(tilt);
      const py = nx * Math.sin(tilt) + ny * Math.cos(tilt);
      ctx.fillStyle = i === 0 ? '#f5d37a' : '#7dd3fc';
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1.5, (2.6 + charge * 1.0) * s), 0, Math.PI * 2);
      ctx.fill();
    }
    drawSkillShockwave(ctx, 0, 0, halfSize * 0.98, anim.skillRelease, '#38bdf8', '#f5d37a', s);
  },

  // --------------------------------------------------------------------------
  // 11. enemy_void_vanguard — Living Spiked Iron Portcullis-Buckler
  // --------------------------------------------------------------------------
  enemy_void_vanguard(ctx, st) {
    const { design, anim, rig, sprite, halfSize, spriteSize, s, t } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const aggro = anim.attackPrep * 0.8 + anim.attackRelease + anim.castProgress;

    drawAmbientAura(ctx, 0, 0, halfSize * (0.98 + aggro * 0.2), pal, 0.08 + aggro * 0.24);

    if (rig && rig.parts) {
      const chainFreq = anim.isMoving ? 8.2 : 3.2;
      const chainAmp = (anim.isMoving ? 0.28 : 0.13) * m + anim.attackRelease * 0.26 * m;
      const leftRot = Math.sin(t * chainFreq) * chainAmp;
      const rightRot = Math.sin(t * chainFreq + 1.45) * chainAmp;

      drawRigPart(ctx, rig.parts.leftChain, spriteSize, halfSize, { rot: leftRot });
      drawRigPart(ctx, rig.parts.rightChain, spriteSize, halfSize, { rot: rightRot });
      ctx.drawImage(rig.body, -halfSize, -halfSize, spriteSize, spriteSize);
    } else {
      drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    }

    // Blinking / glaring crimson portcullis grate eyes
    drawLivingEyeGlow(
      ctx,
      (0.415 - 0.5) * spriteSize,
      (0.455 - 0.5) * spriteSize,
      (0.585 - 0.5) * spriteSize,
      (0.455 - 0.5) * spriteSize,
      2.4 * s,
      '#ff3b5c',
      anim,
      t,
    );

    if (anim.attackRelease > 0.08) {
      ctx.save();
      ctx.strokeStyle = withAlpha('#f87171', anim.attackRelease * 0.85);
      ctx.lineWidth = Math.max(1.2, 2.4 * s);
      ctx.beginPath();
      ctx.arc(halfSize * 0.12, 0, halfSize * (0.76 + anim.attackRelease * 0.2), -0.85, 0.85);
      ctx.stroke();
      ctx.restore();
    }
    drawSkillShockwave(ctx, 0, 0, halfSize * 0.85, anim.skillRelease, '#ef4444', '#fca5a5', s);
  },

  // --------------------------------------------------------------------------
  // 12. enemy_rift_stalker — Lunar Crescent Void-Moon Blade (LUNAR FLAGSHIP)
  // --------------------------------------------------------------------------
  enemy_rift_stalker(ctx, st) {
    const { design, anim, rig, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const moonPulse = 0.74 + 0.26 * Math.sin(t * (reducedMotion ? 1.8 : 3.4));
    const charge = anim.attackPrep * 0.8 + anim.attackRelease + anim.castProgress + anim.skillRelease;

    // Soft pulsing moonlight aura
    drawAmbientAura(ctx, 0, 0, halfSize * (1.08 + charge * 0.22), pal, (0.12 + charge * 0.24) * moonPulse);

    // Back half of rotating lunar celestial ring
    const ringRx = halfSize * (1.08 + charge * 0.12);
    const ringRy = ringRx * 0.38;
    const ringTilt = -0.36 + Math.sin(anim.spinAngle * 0.35) * 0.12 * m;
    drawHalfOrbitRing(ctx, 0, 0, ringRx, ringRy, ringTilt, 'back', {
      color: '#e879f9',
      width: 1.3 * s,
      alpha: 0.45 * moonPulse + charge * 0.3,
    });

    if (rig && rig.parts) {
      // Sculpted crescent moon body with predatory banking slash angle
      ctx.save();
      const slashRot = (-anim.attackPrep * 0.24 + anim.attackRelease * 0.36) * m;
      ctx.rotate(slashRot);
      ctx.drawImage(rig.body, -halfSize, -halfSize, spriteSize, spriteSize);
      ctx.restore();

      // Pulsing central void-moon orb
      const orbScale = 0.95 + moonPulse * 0.10 + charge * 0.14;
      drawRigPart(ctx, rig.parts.orb, spriteSize, halfSize, {
        dx: Math.cos(t * 2.5) * 1.4 * s * m,
        dy: Math.sin(t * 2.5) * 1.8 * s * m,
        sx: orbScale,
        sy: orbScale,
      });

      // 2 extracted rift crystal shards orbiting cleanly around the crescent moon
      const pull = 1 - anim.attackPrep * 0.32 * m + anim.attackRelease * 0.22 * m;
      const a1 = anim.spinAngle * 0.9;
      const a2 = anim.spinAngle * 0.9 + Math.PI;
      drawRigPart(ctx, rig.parts.topShard, spriteSize, halfSize, {
        dx: Math.cos(a1) * 4.6 * s * pull * m - anim.attackPrep * 4.0 * s * m,
        dy: Math.sin(a1) * 5.2 * s * pull * m,
        rot: Math.sin(t * 3.1) * 0.2 * m,
      });
      drawRigPart(ctx, rig.parts.bottomShard, spriteSize, halfSize, {
        dx: Math.cos(a2) * 4.6 * s * pull * m - anim.attackPrep * 4.0 * s * m,
        dy: Math.sin(a2) * 5.2 * s * pull * m,
        rot: -Math.sin(t * 3.1) * 0.2 * m,
      });
    } else {
      drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    }

    // Front half of lunar celestial ring
    drawHalfOrbitRing(ctx, 0, 0, ringRx, ringRy, ringTilt, 'front', {
      color: '#f5d0fe',
      width: 1.3 * s,
      alpha: 0.58 * moonPulse + charge * 0.32,
    });

    // Small stars & stardust particles drifting along orbital paths around crescent moon
    for (let i = 0; i < 4; i += 1) {
      const a = anim.spinAngle * (1.1 + (i % 2) * 0.35) + (i * Math.PI) / 2;
      const ox = Math.cos(a) * ringRx * (0.85 + (i % 2) * 0.14);
      const oy = Math.sin(a) * ringRy * (0.85 + (i % 2) * 0.14);
      const px = ox * Math.cos(ringTilt) - oy * Math.sin(ringTilt);
      const py = ox * Math.sin(ringTilt) + oy * Math.cos(ringTilt);
      if (i % 2 === 0) {
        drawStarFlare(ctx, px, py, (2.6 + charge * 1.8) * s, 0.18, '#fda4af', '#ffffff', 0.85 * moonPulse, t + i, 4);
      } else {
        ctx.fillStyle = withAlpha('#f5d0fe', 0.72 * moonPulse);
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.7, 1.3 * s), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Crescent moonlight slash arc on attack release
    if (anim.attackRelease > 0.06) {
      const p = anim.attackRelease;
      ctx.save();
      ctx.strokeStyle = withAlpha('#fda4af', p * 0.92);
      ctx.lineWidth = Math.max(1.4, 3.0 * s);
      ctx.beginPath();
      ctx.arc(halfSize * 0.08, 0, halfSize * (0.78 + (1 - p) * 0.25), -1.15, 1.15);
      ctx.stroke();
      ctx.restore();
    }
    drawSkillShockwave(ctx, 0, 0, halfSize * 0.88, anim.skillRelease, '#e879f9', '#fff1f2', s);
  },

  // --------------------------------------------------------------------------
  // 13. enemy_obsidian_marksman — Floating Obsidian Twin-Rail Sniper Prism
  // --------------------------------------------------------------------------
  enemy_obsidian_marksman(ctx, st) {
    const { design, anim, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const lock = anim.attackPrep + anim.castProgress;

    drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);

    // Levitating crimson ruby core glow vibrating between twin rails at (0.48, 0.50)
    const prismX = (0.48 - 0.5) * spriteSize + Math.sin(t * (reducedMotion ? 4 : 18)) * (0.8 + lock * 1.4) * s * m;
    const prismR = halfSize * (0.18 + lock * 0.12);
    const g = ctx.createRadialGradient(prismX, 0, 0.5, prismX, 0, Math.max(2, prismR));
    g.addColorStop(0, withAlpha('#ffffff', 0.65 + lock * 0.3));
    g.addColorStop(0.5, withAlpha('#ff2442', 0.45 + lock * 0.35));
    g.addColorStop(1, withAlpha('#ff2442', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(prismX, 0, Math.max(2, prismR), 0, Math.PI * 2);
    ctx.fill();

    // Sequential magnetic accelerator pulses traveling breech -> muzzle
    const pulseCount = 2;
    for (let i = 0; i < pulseCount; i += 1) {
      const cycle = (t * (reducedMotion ? 0.55 : 1.5 + lock * 2.2) + i * 0.5) % 1;
      const rx = -halfSize * 0.25 + cycle * halfSize * 1.05;
      ctx.save();
      ctx.strokeStyle = withAlpha('#ff4d6d', (1 - Math.abs(cycle - 0.5) * 1.8) * (0.55 + lock * 0.4));
      ctx.lineWidth = Math.max(0.8, (1.2 + lock * 0.8) * s);
      ctx.beginPath();
      ctx.ellipse(rx, 0, 2.2 * s, halfSize * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Crisp laser sight lock-on line during attack prep / skill cast
    if (lock > 0.12) {
      ctx.save();
      ctx.strokeStyle = withAlpha('#ff2442', Math.min(0.85, lock * 0.8));
      ctx.lineWidth = Math.max(0.8, 1.3 * s);
      ctx.beginPath();
      ctx.moveTo(halfSize * 0.2, 0);
      ctx.lineTo(halfSize * (0.95 + lock * 0.45), 0);
      ctx.stroke();
      ctx.restore();
    }

    // Muzzle rail flash on discharge
    if (anim.attackRelease > 0.1) {
      drawStarFlare(ctx, halfSize * 0.92, 0, (5.5 + anim.attackRelease * 6.0) * s, 0.14, '#ff2442', '#ffffff', anim.attackRelease, t * 3, 4);
    }
    drawSkillShockwave(ctx, halfSize * 0.3, 0, halfSize * 0.85, anim.skillRelease, '#ff2442', '#ffffff', s);
  },

  // --------------------------------------------------------------------------
  // 14. enemy_corrupted_acolyte — Cracked Amethyst Ritual Hex-Bell
  // --------------------------------------------------------------------------
  enemy_corrupted_acolyte(ctx, st) {
    const { design, anim, rig, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const tollCharge = anim.attackPrep + anim.attackRelease + anim.castProgress + anim.skillRelease;

    drawAmbientAura(ctx, 0, 0, halfSize * (1.02 + tollCharge * 0.24), pal, 0.11 + tollCharge * 0.24);

    // Bell pivots from top suspension ring at (0.50, 0.22)
    const pivotY = (0.22 - 0.5) * spriteSize;
    const bellSwing = Math.sin(t * (anim.isMoving ? 5.4 : 2.8)) * (anim.isMoving ? 0.11 : 0.065) * m
      + (-anim.attackPrep * 0.16 + anim.attackRelease * 0.24) * m;

    if (rig && rig.parts) {
      // 2 floating purple talisman ribbons undulating independently on left/right
      const ribWave = Math.sin(t * (reducedMotion ? 1.8 : 4.2)) * 3.2 * s * m;
      const whirl = anim.castProgress * 5.0 * s * m;
      drawRigPart(ctx, rig.parts.leftRibbon, spriteSize, halfSize, {
        dx: -whirl * 0.4,
        dy: ribWave,
        rot: Math.sin(t * 3.8) * 0.16 * m - anim.attackRelease * 0.22 * m,
      });
      drawRigPart(ctx, rig.parts.rightRibbon, spriteSize, halfSize, {
        dx: whirl * 0.4,
        dy: -ribWave,
        rot: Math.sin(t * 3.8 + 1.3) * 0.16 * m + anim.attackRelease * 0.22 * m,
      });

      ctx.save();
      ctx.translate(0, pivotY);
      ctx.rotate(bellSwing);
      ctx.translate(0, -pivotY);

      // Counter-phase clapper swinging inside bell mouth
      drawRigPart(ctx, rig.parts.clapper, spriteSize, halfSize, {
        rot: -bellSwing * 1.75 + Math.sin(t * 5.6 + 0.8) * 0.12 * m,
      });
      ctx.drawImage(rig.body, -halfSize, -halfSize, spriteSize, spriteSize);

      // Glowing amethyst crack pulse down center of bell
      const crackPulse = 0.55 + 0.45 * Math.sin(t * 4.5) + tollCharge * 0.45;
      const cg = ctx.createRadialGradient(0, halfSize * 0.08, 1, 0, halfSize * 0.08, Math.max(3, halfSize * 0.28));
      cg.addColorStop(0, withAlpha('#f0abfc', Math.min(0.85, 0.35 * crackPulse)));
      cg.addColorStop(1, withAlpha('#c026d3', 0));
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, halfSize * 0.08, Math.max(3, halfSize * 0.28), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    }

    // Concentric toll soundwave rings radiating on bell strike / cast
    if (anim.attackRelease > 0.08 || anim.castProgress > 0.15) {
      const p = Math.max(anim.attackRelease, anim.castProgress * 0.7);
      ctx.save();
      ctx.strokeStyle = withAlpha('#e879f9', p * 0.75);
      ctx.lineWidth = Math.max(1, 1.8 * s);
      ctx.beginPath();
      ctx.ellipse(0, halfSize * 0.42, halfSize * (0.55 + (1 - p) * 0.4), halfSize * (0.2 + (1 - p) * 0.16), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    drawSkillShockwave(ctx, 0, 0, halfSize * 0.88, anim.skillRelease, '#d946ef', '#fdf4ff', s);
  },

  // --------------------------------------------------------------------------
  // 15. enemy_siege_juggernaut — Cast-Iron Volcanic Magma-Cauldron Brazier
  // --------------------------------------------------------------------------
  enemy_siege_juggernaut(ctx, st) {
    const { design, anim, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const boil = anim.attackPrep + anim.attackRelease + anim.castProgress + anim.skillRelease;

    drawAmbientAura(ctx, 0, -halfSize * 0.16, halfSize * (1.08 + boil * 0.24), pal, 0.16 + boil * 0.28);

    // Subtle pressurized cauldron swell on prep / cast
    ctx.save();
    const swell = 1 + (anim.attackPrep * 0.06 + anim.castProgress * 0.08) * m;
    ctx.scale(swell, 1 / Math.sqrt(swell));
    drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    ctx.restore();

    // Bubbling & popping volcanic magma domes across the open top rim (y ≈ 0.22)
    const rimY = (0.22 - 0.5) * spriteSize;
    for (let i = 0; i < 4; i += 1) {
      const cycle = (t * (reducedMotion ? 0.5 : 1.35 + boil * 0.8) + i * 0.26) % 1;
      const bx = (i - 1.5) * halfSize * 0.22 + Math.sin(t * 2.2 + i) * 1.5 * s;
      const br = Math.max(0.8, Math.sin(cycle * Math.PI) * (3.2 + boil * 1.8) * s);
      if (br > 0.9) {
        ctx.fillStyle = withAlpha(cycle > 0.72 ? '#fef08a' : '#fb923c', 0.85);
        ctx.beginPath();
        ctx.arc(bx, rimY - cycle * 3.5 * s, br, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Rising volcanic embers & magma boil-over spray
    drawDriftingParticles(ctx, 0, rimY, halfSize * 0.44, halfSize * (0.72 + boil * 0.32), 5, t, s, '#fb923c', 0.75 + boil * 0.25, reducedMotion);

    if (anim.attackRelease > 0.08 || anim.skillRelease > 0.08) {
      const p = Math.max(anim.attackRelease, anim.skillRelease);
      ctx.save();
      ctx.strokeStyle = withAlpha('#f97316', p * 0.85);
      ctx.lineWidth = Math.max(1.4, 2.8 * s);
      ctx.beginPath();
      ctx.ellipse(0, halfSize * 0.65, halfSize * (0.72 + (1 - p) * 0.55), halfSize * (0.22 + (1 - p) * 0.18), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    drawSkillShockwave(ctx, 0, halfSize * 0.1, halfSize * 0.95, anim.skillRelease, '#f97316', '#fef08a', s);
  },

  // --------------------------------------------------------------------------
  // 16. enemy_stasis_weaver — Multifaceted Indigo Crystal (CRYSTAL FLAGSHIP)
  // --------------------------------------------------------------------------
  enemy_stasis_weaver(ctx, st) {
    const { design, anim, rig, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const charge = anim.attackPrep * 0.9 + anim.attackRelease + anim.castProgress + anim.skillRelease;

    drawAmbientAura(ctx, 0, 0, halfSize * (1.08 + charge * 0.26), pal, 0.14 + charge * 0.28);

    // 3D depth-sorted orbital motion for the 2 extracted crystal fragments
    const fragA1 = anim.spinAngle * 0.85;
    const fragA2 = anim.secondaryAngle * 0.95 + Math.PI * 0.85;
    // Fragments gather inward on attack prep / skill charge, then expand on release
    const gather = 1 - anim.attackPrep * 0.42 * m - anim.castProgress * 0.22 * m + anim.attackRelease * 0.34 * m;
    const leftDepth = Math.sin(fragA1);
    const rightDepth = Math.sin(fragA2);

    const drawLeftShard = () => {
      if (!rig?.parts?.leftShard) return;
      drawRigPart(ctx, rig.parts.leftShard, spriteSize, halfSize, {
        dx: (Math.cos(fragA1) * 6.8 * gather + (1 - gather) * 11.0) * s * m,
        dy: Math.sin(fragA1 * 1.35) * 7.2 * s * m,
        rot: Math.sin(t * 2.4) * 0.22 * m + anim.attackPrep * 0.28,
        sx: 0.90 + leftDepth * 0.14 * m,
        sy: 0.90 + leftDepth * 0.14 * m,
      });
    };
    const drawRightShard = () => {
      if (!rig?.parts?.rightShard) return;
      drawRigPart(ctx, rig.parts.rightShard, spriteSize, halfSize, {
        dx: (Math.cos(fragA2) * 6.8 * gather - (1 - gather) * 11.0) * s * m,
        dy: Math.sin(fragA2 * 1.25 + 1.2) * 7.2 * s * m,
        rot: -Math.sin(t * 2.4 + 0.7) * 0.22 * m - anim.attackPrep * 0.28,
        sx: 0.90 + rightDepth * 0.14 * m,
        sy: 0.90 + rightDepth * 0.14 * m,
      });
    };

    // Rear-depth fragments
    if (leftDepth < 0) drawLeftShard();
    if (rightDepth < 0) drawRightShard();

    // Skill formation: rotating interlocking hexagonal crystal lattice behind crystal
    if (anim.castProgress > 0.05 || anim.skillRelease > 0.05) {
      const sp = Math.max(anim.castProgress, anim.skillRelease);
      ctx.save();
      ctx.rotate(anim.spinAngle * 0.5);
      ctx.strokeStyle = withAlpha('#a5b4fc', sp * 0.85);
      ctx.lineWidth = Math.max(1.0, 1.8 * s);
      for (let ring = 0; ring < 2; ring += 1) {
        const rr = halfSize * (0.72 + ring * 0.26) * (0.8 + sp * 0.3);
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const a = (i * Math.PI) / 3 + ring * (Math.PI / 6);
          const hx = Math.cos(a) * rr;
          const hy = Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Main crystal gently shifts orientation (subtle perspective scaleX + tilt)
    ctx.save();
    const orientShift = Math.sin(t * (reducedMotion ? 0.8 : 1.9)) * 0.055 * m;
    ctx.rotate(orientShift);
    ctx.scale(1 - Math.abs(orientShift) * 0.45, 1 + Math.abs(orientShift) * 0.18);
    if (rig && rig.body) {
      ctx.drawImage(rig.body, -halfSize, -halfSize, spriteSize, spriteSize);
    } else {
      drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    }

    // Traveling internal light & refraction sweeps across crystal facets
    drawFacetLightSweep(ctx, 0, -halfSize * 0.05, halfSize * 0.52, -0.45 + orientShift * 2, t * (reducedMotion ? 0.16 : 0.42), '#e0e7ff', 0.38 + charge * 0.35, 0.24);
    drawFacetLightSweep(ctx, 0, halfSize * 0.06, halfSize * 0.46, 0.55 - orientShift * 2, t * (reducedMotion ? 0.12 : 0.31) + 0.5, '#818cf8', 0.30 + charge * 0.3, 0.20);

    // Sequential facet flashes on attack preparation / release
    if (anim.attackPrep > 0.08 || anim.attackRelease > 0.08) {
      const facetPts = [
        [0, -halfSize * 0.44],
        [-halfSize * 0.22, -halfSize * 0.06],
        [halfSize * 0.22, 0.04 * halfSize],
        [0, halfSize * 0.32],
      ];
      const seq = (t * 8) % facetPts.length;
      for (let i = 0; i < facetPts.length; i += 1) {
        const dist = Math.abs(((seq - i + facetPts.length) % facetPts.length));
        const flash = Math.max(0, 1 - dist * 0.75) * Math.max(anim.attackPrep, anim.attackRelease);
        if (flash > 0.08) {
          drawStarFlare(ctx, facetPts[i][0], facetPts[i][1], (3.4 + flash * 4.0) * s, 0.15, '#c7d2fe', '#ffffff', flash * 0.92, t, 4);
        }
      }
    }
    ctx.restore();

    // Front-depth fragments
    if (leftDepth >= 0) drawLeftShard();
    if (rightDepth >= 0) drawRightShard();

    // Delicate prismatic refraction motes orbiting at different depths
    for (let i = 0; i < 3; i += 1) {
      const a = anim.spinAngle * 1.15 + (i * Math.PI * 2) / 3;
      const mx = Math.cos(a) * halfSize * 0.78 * gather;
      const my = Math.sin(a) * halfSize * 0.44 - halfSize * 0.08;
      const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(t * 2.8 + i * 1.7));
      drawStarFlare(ctx, mx, my, (2.6 + charge * 2.4) * s * twinkle, 0.15, '#a5b4fc', '#ffffff', (0.62 + charge * 0.3) * twinkle, t * 0.5, 4);
    }

    drawSkillShockwave(ctx, 0, 0, halfSize * 0.92, anim.skillRelease, '#818cf8', '#eef2ff', s);
  },

  // --------------------------------------------------------------------------
  // 17. enemy_inferno_bombardier — Living Brass-Bound Siege Bombard Mortar
  // --------------------------------------------------------------------------
  enemy_inferno_bombardier(ctx, st) {
    const { design, anim, rig, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const charge = anim.attackPrep + anim.castProgress;

    // Diagonal recoil along the ~40-degree mortar barrel axis on attack release
    const recoilMag = anim.attackRelease * 6.5 * s * m;
    const recoilDx = recoilMag * 0.76;
    const recoilDy = recoilMag * 0.64;

    ctx.save();
    // Subtle belly puff swell during charge, then sharp diagonal barrel kickback
    const puff = 1 + charge * 0.065 * m;
    ctx.translate(recoilDx, recoilDy);
    ctx.scale(puff, puff);

    if (rig && rig.body && rig.wheel) {
      ctx.drawImage(rig.body, -halfSize, -halfSize, spriteSize, spriteSize);
      // True rotating spoked golden wheel (rolls forward cleanly when moving!)
      drawRadialRingCanvas(ctx, rig.wheel, rig.cx, rig.cy, spriteSize, halfSize, {
        rot: anim.wheelAngle,
      });
    } else {
      drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    }

    // Warm pressurized ember-breech shimmer when preparing to fire
    if (charge > 0.08) {
      const bx = (0.64 - 0.5) * spriteSize;
      const by = (0.56 - 0.5) * spriteSize;
      const bg = ctx.createRadialGradient(bx, by, 1, bx, by, Math.max(3, halfSize * 0.24));
      bg.addColorStop(0, withAlpha('#fde047', charge * 0.55));
      bg.addColorStop(1, withAlpha('#ea580c', 0));
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(bx, by, Math.max(3, halfSize * 0.24), 0, Math.PI * 2);
      ctx.fill();
    }

    // Sputtering rope fuse spark at breech (0.77, 0.57)
    const fuseX = (0.77 - 0.5) * spriteSize;
    const fuseY = (0.57 - 0.5) * spriteSize;
    const sparkJitter = Math.sin(t * (reducedMotion ? 4 : 24)) * 1.2 * s;
    drawStarFlare(ctx, fuseX + sparkJitter, fuseY - Math.abs(sparkJitter) * 0.5, (3.2 + charge * 3.6) * s, 0.22, '#fb923c', '#fffbeb', 0.88, t * 5, 4);

    // Curling barrel muzzle smoke & blast flash at (0.35, 0.21)
    const muzX = (0.35 - 0.5) * spriteSize;
    const muzY = (0.21 - 0.5) * spriteSize;
    for (let i = 0; i < 2; i += 1) {
      const cyc = (t * (reducedMotion ? 0.45 : 1.05) + i * 0.5) % 1;
      const sx = muzX - cyc * 9 * s;
      const sy = muzY - cyc * 14 * s;
      ctx.fillStyle = withAlpha('#cbd5e1', (1 - cyc) * (0.32 + anim.attackRelease * 0.45));
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(1.2, (2.2 + cyc * 4.5) * s), 0, Math.PI * 2);
      ctx.fill();
    }
    if (anim.attackRelease > 0.1) {
      drawStarFlare(ctx, muzX - 2 * s, muzY - 2 * s, (6.5 + anim.attackRelease * 6.5) * s, 0.22, '#f97316', '#fffbeb', anim.attackRelease * 0.95, t * 3, 6);
    }
    ctx.restore();
    drawSkillShockwave(ctx, 0, -halfSize * 0.15, halfSize * 0.9, anim.skillRelease, '#f97316', '#fde047', s);
  },

  // --------------------------------------------------------------------------
  // 18. enemy_dread_bannerman — War-Standard Relic (FLAME + CLOTH FLAGSHIP)
  // --------------------------------------------------------------------------
  enemy_dread_bannerman(ctx, st) {
    const { design, anim, rig, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const blaze = 1.0 + anim.attackPrep * 0.35 + anim.attackRelease * 0.6 + anim.castProgress * 0.75 + anim.skillRelease * 0.9;

    drawAmbientAura(ctx, 0, -halfSize * 0.45, halfSize * (0.95 + (blaze - 1) * 0.32), pal, 0.14 + (blaze - 1) * 0.22);

    if (rig && rig.pole && rig.cloth) {
      // Draw crimson war-silk banner in 10 overlapping horizontal strips with traveling wind wave
      const strips = 10;
      const srcStartY = Math.floor(rig.clothStartY * rig.h);
      const srcTotalH = rig.h - srcStartY;
      const dstStartY = -halfSize + rig.clothStartY * spriteSize;
      const dstTotalH = spriteSize * (1 - rig.clothStartY);
      const waveFreq = (anim.isMoving ? 9.5 : 5.4) * (reducedMotion ? 0.35 : 1);
      const waveAmp = (anim.isMoving ? 5.2 : 2.8) * s * m * (1 + anim.attackRelease * 0.65 + anim.castProgress * 0.5);

      for (let i = 0; i < strips; i += 1) {
        const u0 = i / strips;
        const u1 = (i + 1) / strips;
        const sy = srcStartY + u0 * srcTotalH;
        const sh = Math.max(1, (u1 - u0) * srcTotalH + 1.2);
        const dy = dstStartY + u0 * dstTotalH;
        const dh = (u1 - u0) * dstTotalH + 0.8;
        // Amplitude increases smoothly from 0 at crossbar to full billow at tattered tail
        const bend = u0 * u0 * Math.sin(t * waveFreq - u0 * 4.2) * waveAmp;
        const windDrag = anim.isMoving ? -u0 * 3.8 * s * m : 0;
        ctx.drawImage(rig.cloth, 0, sy, rig.w, sh, -halfSize + bend + windDrag, dy, spriteSize, dh);
      }

      // Rigid golden horned crossbar & medallion on top
      ctx.drawImage(rig.pole, -halfSize, -halfSize, spriteSize, spriteSize);
    } else {
      drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    }

    // Living continuously morphing multi-tongue flame & rising embers seated cleanly atop the brazier
    const brazierY = (0.245 - 0.5) * spriteSize;
    drawLivingFlame(ctx, 0, brazierY, 12.0 * s, 17.5 * s, t, s, {
      outerColor: '#dc2626',
      midColor: '#f97316',
      coreColor: '#fef08a',
      intensity: blaze,
      emberCount: 5,
      reducedMotion,
    });

    // Rally war-beacon pillar flare during cast / skill
    if (anim.castProgress > 0.08 || anim.skillRelease > 0.08) {
      const sp = Math.max(anim.castProgress, anim.skillRelease);
      ctx.save();
      const beamG = ctx.createLinearGradient(0, brazierY, 0, -halfSize * 1.55);
      beamG.addColorStop(0, withAlpha('#fde047', sp * 0.65));
      beamG.addColorStop(1, withAlpha('#dc2626', 0));
      ctx.fillStyle = beamG;
      ctx.fillRect(-halfSize * 0.26, -halfSize * 1.55, halfSize * 0.52, halfSize * 1.1);
      ctx.restore();
    }
    drawSkillShockwave(ctx, 0, -halfSize * 0.35, halfSize * 0.9, anim.skillRelease, '#f59e0b', '#fef08a', s);
  },

  // --------------------------------------------------------------------------
  // 19. enemy_cryo_warden — Sculpted Glacial Snowflake-Lantern
  // --------------------------------------------------------------------------
  enemy_cryo_warden(ctx, st) {
    const { design, anim, rig, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const frost = anim.attackPrep * 0.8 + anim.attackRelease + anim.castProgress + anim.skillRelease;

    drawAmbientAura(ctx, 0, 0, halfSize * (1.06 + frost * 0.24), pal, 0.12 + frost * 0.24);

    if (rig && rig.rings) {
      // Outer 6-fold sculpted glacial snowflake spires rotate smoothly
      const spikeScale = 1 - anim.attackPrep * 0.06 * m + anim.attackRelease * 0.1 * m + anim.castProgress * 0.08 * m;
      drawRadialRingCanvas(ctx, rig.rings.outerSpikes, rig.cx, rig.cy, spriteSize, halfSize, {
        rot: anim.spinAngle * 0.55,
        sx: spikeScale,
        sy: spikeScale,
      });
      // Poised inner hexagonal housing & diamond frost crystal core
      drawRadialRingCanvas(ctx, rig.rings.core, rig.cx, rig.cy, spriteSize, halfSize, {
        rot: Math.sin(t * 2.2) * 0.04 * m,
      });
    } else {
      drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    }

    // Shifting icy refraction across central diamond crystal
    drawFacetLightSweep(ctx, 0, 0, halfSize * 0.36, -0.5, t * (reducedMotion ? 0.18 : 0.48), '#ffffff', 0.42 + frost * 0.3);

    // Drifting frost crystals falling gently around lantern
    for (let i = 0; i < 4; i += 1) {
      const cyc = (t * (reducedMotion ? 0.3 : 0.72) + i * 0.25) % 1;
      const fx = Math.sin(t * 2.4 + i * 2.0) * halfSize * 0.72;
      const fy = -halfSize * 0.65 + cyc * halfSize * 1.35;
      drawStarFlare(ctx, fx, fy, (2.2 + frost * 1.4) * s, 0.2, '#a5f3fc', '#ffffff', Math.sin(cyc * Math.PI) * 0.78, t + i, 6);
    }

    // Skill: 6-fold frost mandala ring
    if (anim.castProgress > 0.08 || anim.skillRelease > 0.08) {
      const sp = Math.max(anim.castProgress, anim.skillRelease);
      ctx.save();
      ctx.rotate(-anim.spinAngle * 0.7);
      ctx.strokeStyle = withAlpha('#67e8f9', sp * 0.82);
      ctx.lineWidth = Math.max(1.0, 1.8 * s);
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i * Math.PI) / 3;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * halfSize * (0.9 + sp * 0.28), Math.sin(a) * halfSize * (0.9 + sp * 0.28));
      }
      ctx.stroke();
      ctx.restore();
    }
    drawSkillShockwave(ctx, 0, 0, halfSize * 0.9, anim.skillRelease, '#38bdf8', '#f0f9ff', s);
  },

  // --------------------------------------------------------------------------
  // 20. enemy_abyssal_ravager — Living Toothed Abyssal Forge-Sawblade
  // --------------------------------------------------------------------------
  enemy_abyssal_ravager(ctx, st) {
    const { design, anim, rig, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const rev = (anim.isMoving ? 0.6 : 0.2) + anim.attackPrep * 0.8 + anim.attackRelease * 1.2 + anim.castProgress + anim.skillRelease;

    drawAmbientAura(ctx, 0, 0, halfSize * (1.02 + rev * 0.18), pal, 0.10 + rev * 0.20);

    if (rig && rig.rings) {
      // Outer toothed crimson sawblade continuously spins (blistering speed on move/attack!)
      drawRadialRingCanvas(ctx, rig.rings.sawblade, rig.cx, rig.cy, spriteSize, halfSize, {
        rot: anim.spinAngle,
      });
      // Central axle hub stays level with subtle vibration
      const vib = reducedMotion ? 0 : Math.sin(t * 28) * 0.6 * s * Math.min(1, rev);
      ctx.save();
      ctx.translate(vib, -vib * 0.5);
      drawRadialRingCanvas(ctx, rig.rings.hub, rig.cx, rig.cy, spriteSize, halfSize, { rot: 0 });
      ctx.restore();
    } else {
      drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    }

    // Wild molten furnace optics on central axle hub
    drawLivingEyeGlow(
      ctx,
      (0.45 - 0.5) * spriteSize,
      (0.49 - 0.5) * spriteSize,
      (0.55 - 0.5) * spriteSize,
      (0.49 - 0.5) * spriteSize,
      2.1 * s,
      '#ff4d6d',
      anim,
      t,
    );

    // Tangential grinding sparks thrown off spinning saw-teeth
    const sparkCount = anim.attackRelease > 0.1 || anim.isMoving ? 5 : 2;
    for (let i = 0; i < sparkCount; i += 1) {
      const cyc = (t * (reducedMotion ? 0.6 : 2.4 + rev * 1.5) + i / sparkCount) % 1;
      const baseA = anim.spinAngle * 0.35 + i * 1.65;
      const r0 = halfSize * 0.82;
      const sx = Math.cos(baseA) * r0 - Math.sin(baseA) * cyc * 10 * s * m;
      const sy = Math.sin(baseA) * r0 + Math.cos(baseA) * cyc * 10 * s * m;
      ctx.fillStyle = withAlpha(i % 2 === 0 ? '#fde047' : '#fb7185', (1 - cyc) * 0.88);
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.7, (1.6 - cyc * 0.9) * s), 0, Math.PI * 2);
      ctx.fill();
    }
    drawSkillShockwave(ctx, 0, 0, halfSize * 0.92, anim.skillRelease, '#e11d48', '#fde047', s);
  },

  // --------------------------------------------------------------------------
  // 21. elite_iron_bulwark — Floating Crowned Bastion Castle-Gate
  // --------------------------------------------------------------------------
  elite_iron_bulwark(ctx, st) {
    const { design, anim, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const charge = anim.attackPrep * 0.7 + anim.attackRelease + anim.castProgress + anim.skillRelease;

    drawAmbientAura(ctx, 0, 0, halfSize * (1.06 + charge * 0.24), pal, 0.14 + charge * 0.24);
    drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);

    // Shimmering sapphire energy field behind arched portcullis (0.50, 0.64)
    const gateY = (0.64 - 0.5) * spriteSize;
    const shimmer = 0.6 + 0.4 * Math.sin(t * (reducedMotion ? 2 : 5.2));
    const gg = ctx.createRadialGradient(0, gateY, 1, 0, gateY, Math.max(4, halfSize * (0.28 + charge * 0.14)));
    gg.addColorStop(0, withAlpha('#bae6fd', (0.42 + charge * 0.35) * shimmer));
    gg.addColorStop(1, withAlpha('#3b82f6', 0));
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(0, gateY, Math.max(4, halfSize * (0.28 + charge * 0.14)), 0, Math.PI * 2);
    ctx.fill();

    // Twin turret cap beacon glints at (0.25, 0.21) & (0.75, 0.21)
    const lx = (0.25 - 0.5) * spriteSize;
    const rx = (0.75 - 0.5) * spriteSize;
    const ty = (0.21 - 0.5) * spriteSize;
    const beaconR = (2.6 + charge * 3.4) * s;
    drawStarFlare(ctx, lx, ty, beaconR, 0.2, '#fbbf24', '#ffffff', 0.75 + charge * 0.2, t, 4);
    drawStarFlare(ctx, rx, ty, beaconR, 0.2, '#fbbf24', '#ffffff', 0.75 + charge * 0.2, -t, 4);

    // Skill: linked golden turret energy arch on boss_aegis_shell
    if (anim.castProgress > 0.08 || anim.skillRelease > 0.08) {
      const sp = Math.max(anim.castProgress, anim.skillRelease);
      ctx.save();
      ctx.strokeStyle = withAlpha('#fbbf24', sp * 0.88);
      ctx.lineWidth = Math.max(1.2, 2.4 * s);
      ctx.beginPath();
      ctx.moveTo(lx, ty);
      quadTo(ctx, 0, ty - halfSize * (0.42 + sp * 0.18), rx, ty);
      ctx.stroke();
      ctx.restore();
    }
    drawSkillShockwave(ctx, 0, 0, halfSize * 0.94, anim.skillRelease, '#60a5fa', '#fbbf24', s);
  },

  // --------------------------------------------------------------------------
  // 22. elite_storm_lancer — Storm-Lightning Spear & Thundercloud Coil
  // --------------------------------------------------------------------------
  elite_storm_lancer(ctx, st) {
    const { design, anim, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const storm = anim.attackPrep + anim.attackRelease + anim.castProgress + anim.skillRelease;

    drawAmbientAura(ctx, 0, 0, halfSize * (1.08 + storm * 0.24), pal, 0.14 + storm * 0.26);

    // Back half of crackling golden thunder ring
    const ringRx = halfSize * (1.04 + storm * 0.14);
    const ringRy = ringRx * 0.34;
    const ringTilt = -0.3 + Math.sin(anim.spinAngle * 0.6) * 0.1 * m;
    drawHalfOrbitRing(ctx, 0, 0, ringRx, ringRy, ringTilt, 'back', { color: '#fbbf24', width: 1.5 * s, alpha: 0.55 + storm * 0.35 });

    // High-voltage micro-hum on spear sprite
    ctx.save();
    const humY = reducedMotion ? 0 : Math.sin(t * 24) * 0.8 * s * (0.5 + storm);
    ctx.translate(0, humY);
    drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    ctx.restore();

    drawHalfOrbitRing(ctx, 0, 0, ringRx, ringRy, ringTilt, 'front', { color: '#fde047', width: 1.5 * s, alpha: 0.68 + storm * 0.3 });

    // Live branching lightning arcs snapping between halo ring and spear tips
    const arcAlpha = reducedMotion ? 0.3 : (0.52 + 0.35 * Math.sin(t * 16) + storm * 0.4);
    drawLightningArc(ctx, -halfSize * 0.52, -halfSize * 0.18, halfSize * 0.42, -halfSize * 0.34, t * 4.1, '#fde047', (1.2 + storm * 0.8) * s, arcAlpha);
    drawLightningArc(ctx, -halfSize * 0.36, halfSize * 0.32, halfSize * 0.58, halfSize * 0.08, t * 4.1 + 3.1, '#c084fc', (1.1 + storm * 0.7) * s, arcAlpha * 0.9);
    if (storm > 0.18) {
      drawLightningArc(ctx, -halfSize * 0.68, 0, halfSize * 0.86, 0, t * 6.3 + 1.5, '#ffffff', 1.8 * s, Math.min(1, storm * 0.9));
    }
    drawSkillShockwave(ctx, 0, 0, halfSize * 0.95, anim.skillRelease, '#fbbf24', '#c084fc', s);
  },

  // --------------------------------------------------------------------------
  // 23. elite_astral_sniper — Celestial Brass Sextant & Sighting Prism
  // --------------------------------------------------------------------------
  elite_astral_sniper(ctx, st) {
    const { design, anim, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const lock = anim.attackPrep + anim.castProgress;

    drawAmbientAura(ctx, 0, 0, halfSize * (1.02 + lock * 0.22), pal, 0.10 + lock * 0.24);

    // Deliberate sighting elevation sweep during idle; snaps to lock angle on prep
    const sweepAngle = Math.sin(t * 1.6) * 0.075 * m * (1 - lock * 0.85);
    ctx.save();
    ctx.rotate(sweepAngle);
    drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);

    // Traveling luminous tick glint along lower curved brass degree arc
    const arcA = 0.45 + (0.5 + 0.5 * Math.sin(t * (reducedMotion ? 0.9 : 2.6))) * 1.4;
    const gx = Math.cos(arcA) * halfSize * 0.62;
    const gy = Math.sin(arcA) * halfSize * 0.62;
    drawStarFlare(ctx, gx, gy, (2.8 + lock * 2.2) * s, 0.18, '#f59e0b', '#ffffff', 0.8, t, 4);

    // Refracting purple top prism (0.39, 0.29) & magenta sighting lens (0.86, 0.35)
    const lensX = (0.86 - 0.5) * spriteSize;
    const lensY = (0.35 - 0.5) * spriteSize;
    drawStarFlare(ctx, (0.39 - 0.5) * spriteSize, (0.29 - 0.5) * spriteSize, (3.2 + lock * 3.0) * s, 0.18, '#f472b6', '#ffffff', 0.78, t * 0.9, 4);
    drawStarFlare(ctx, lensX, lensY, (3.6 + (lock + anim.attackRelease) * 4.5) * s, 0.16, '#ec4899', '#ffffff', 0.85, -t * 1.2, 4);

    // Laser sighting beam during prep / holographic calibration arc on skill
    if (lock > 0.1) {
      ctx.strokeStyle = withAlpha('#f472b6', Math.min(0.9, lock * 0.85));
      ctx.lineWidth = Math.max(0.9, 1.4 * s);
      ctx.beginPath();
      ctx.moveTo(lensX, lensY);
      ctx.lineTo(lensX + halfSize * (0.65 + lock * 0.5), lensY - halfSize * 0.14);
      ctx.stroke();
    }
    if (anim.castProgress > 0.08 || anim.skillRelease > 0.08) {
      const sp = Math.max(anim.castProgress, anim.skillRelease);
      ctx.strokeStyle = withAlpha('#f59e0b', sp * 0.8);
      ctx.lineWidth = Math.max(1.0, 1.6 * s);
      ctx.beginPath();
      ctx.arc(0, 0, halfSize * (0.84 + sp * 0.24), -0.9, 0.6);
      ctx.stroke();
    }
    ctx.restore();
    drawSkillShockwave(ctx, 0, 0, halfSize * 0.92, anim.skillRelease, '#ec4899', '#fde68a', s);
  },

  // --------------------------------------------------------------------------
  // 24. elite_siege_colossus — Volcanic Bronze Siege-Ram Bell & Molten Halo
  // --------------------------------------------------------------------------
  elite_siege_colossus(ctx, st) {
    const { design, anim, rig, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const magma = anim.attackPrep + anim.attackRelease + anim.castProgress + anim.skillRelease;

    drawAmbientAura(ctx, 0, 0, halfSize * (1.1 + magma * 0.25), pal, 0.16 + magma * 0.26);

    if (rig && rig.parts) {
      ctx.drawImage(rig.body, -halfSize, -halfSize, spriteSize, spriteSize);

      // Levitating molten gold crown halo with inertial vertical lag & high lift on slam/skill
      const haloLift = (Math.sin(t * 2.5 - 0.6) * 3.4 - anim.attackPrep * 7.0 - anim.castProgress * 8.5 + anim.attackRelease * 4.5) * s * m;
      const haloTilt = Math.sin(t * 2.1) * 0.08 * m;
      drawRigPart(ctx, rig.parts.haloRing, spriteSize, halfSize, {
        dy: haloLift,
        rot: haloTilt,
        sx: 1 + (anim.castProgress * 0.12 + anim.attackRelease * 0.08) * m,
      });
    } else {
      drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    }

    // Pulsing magma fissures across fluted ram-bell
    const fPulse = 0.55 + 0.45 * Math.sin(t * (reducedMotion ? 2 : 4.8)) + magma * 0.45;
    const fg = ctx.createRadialGradient(0, halfSize * 0.12, 1, 0, halfSize * 0.12, Math.max(4, halfSize * 0.45));
    fg.addColorStop(0, withAlpha('#facc15', Math.min(0.75, 0.32 * fPulse)));
    fg.addColorStop(0.6, withAlpha('#ea580c', Math.min(0.55, 0.24 * fPulse)));
    fg.addColorStop(1, withAlpha('#ea580c', 0));
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(0, halfSize * 0.12, Math.max(4, halfSize * 0.45), 0, Math.PI * 2);
    ctx.fill();

    drawDriftingParticles(ctx, 0, -halfSize * 0.2, halfSize * 0.5, halfSize * 0.78, 5, t, s, '#fbbf24', 0.72, reducedMotion);
    drawSkillShockwave(ctx, 0, halfSize * 0.15, halfSize * 0.98, anim.skillRelease, '#ea580c', '#facc15', s);
  },

  // --------------------------------------------------------------------------
  // 25. elite_chrono_enforcer — Twin-Bulb Stasis Glass Hourglass & Gimbal
  // --------------------------------------------------------------------------
  elite_chrono_enforcer(ctx, st) {
    const { design, anim, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const stasis = anim.attackPrep + anim.attackRelease + anim.castProgress + anim.skillRelease;
    const waistX = (0.49 - 0.5) * spriteSize;
    const waistY = (0.52 - 0.5) * spriteSize;

    drawAmbientAura(ctx, waistX, waistY, halfSize * (1.12 + stasis * 0.25), pal, 0.14 + stasis * 0.26);

    // Outer meridian gimbal ring (back)
    const rx = halfSize * (1.10 + stasis * 0.12);
    const ry = rx * 0.36;
    const rTilt = 0.35 + Math.sin(anim.spinAngle * 0.4) * 0.12 * m;
    drawHalfOrbitRing(ctx, waistX, waistY, rx, ry, rTilt, 'back', { color: '#e2b75b', width: 1.7 * s, alpha: 0.62 + stasis * 0.28 });

    drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);

    // Live streaming luminous cyan-violet chrono-sand flowing through the hourglass waist!
    // During attackPrep, sand briefly halts/reverses for dramatic temporal stasis feel.
    const flowDir = anim.attackPrep > 0.35 ? -0.45 : 1.0;
    const flowSpeed = (reducedMotion ? 0.5 : 1.7) * flowDir;
    for (let i = 0; i < 6; i += 1) {
      const raw = (t * flowSpeed + i / 6);
      const cyc = ((raw % 1) + 1) % 1;
      const sy = waistY - halfSize * 0.14 + cyc * halfSize * 0.46;
      const sx = waistX + Math.sin(i * 2.3 + t * 5) * (0.8 + cyc * 1.4) * s;
      ctx.fillStyle = withAlpha(i % 2 === 0 ? '#38bdf8' : '#c4b5fd', Math.sin(cyc * Math.PI) * 0.92);
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.8, 1.45 * s), 0, Math.PI * 2);
      ctx.fill();
    }

    // Luminous waist pinch flare
    drawStarFlare(ctx, waistX, waistY, (3.0 + stasis * 3.8) * s, 0.16, '#38bdf8', '#ffffff', 0.72 + stasis * 0.25, anim.spinAngle, 4);

    // Outer meridian gimbal ring (front)
    drawHalfOrbitRing(ctx, waistX, waistY, rx, ry, rTilt, 'front', { color: '#f5d37a', width: 1.7 * s, alpha: 0.75 + stasis * 0.25 });
    drawSkillShockwave(ctx, waistX, waistY, halfSize * 0.96, anim.skillRelease, '#8b5cf6', '#38bdf8', s);
  },

  // --------------------------------------------------------------------------
  // 26. elite_inferno_captain — Living Triple-Barrel Brass Flame-Organ Battery
  // --------------------------------------------------------------------------
  elite_inferno_captain(ctx, st) {
    const { design, anim, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const salvo = anim.attackPrep + anim.attackRelease + anim.castProgress + anim.skillRelease;

    // Pressurized boiler breathing swell
    const breath = 1 + Math.sin(t * 4.2) * 0.025 * m + anim.attackPrep * 0.055 * m;
    ctx.save();
    ctx.scale(breath, 1 / Math.sqrt(breath));
    drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);

    // Boisterous blinking / glaring furnace eyes seated in boiler grate sockets
    drawLivingEyeGlow(
      ctx,
      (0.445 - 0.5) * spriteSize,
      (0.61 - 0.5) * spriteSize,
      (0.555 - 0.5) * spriteSize,
      (0.61 - 0.5) * spriteSize,
      2.0 * s,
      '#fde047',
      anim,
      t,
    );
    ctx.restore();

    // 3 stepped vertical mortar pipes with staggered 1-2-3 rhythmic living fire plumes
    const pipes = [
      { x: (0.35 - 0.5) * spriteSize, y: (0.20 - 0.5) * spriteSize, phase: 0.0 },
      { x: (0.50 - 0.5) * spriteSize, y: (0.10 - 0.5) * spriteSize, phase: 2.1 },
      { x: (0.65 - 0.5) * spriteSize, y: (0.20 - 0.5) * spriteSize, phase: 4.2 },
    ];
    for (let i = 0; i < pipes.length; i += 1) {
      const p = pipes[i];
      const beat = 0.65 + 0.55 * Math.max(0, Math.sin(t * (reducedMotion ? 1.8 : 4.6) + p.phase));
      const pipeIntensity = beat + anim.attackRelease * 0.75 + anim.castProgress * 0.85 + anim.skillRelease * 0.95;
      drawLivingFlame(ctx, p.x, p.y, 7.5 * s, (9.5 + (i === 1 ? 3.5 : 0)) * s, t + i * 0.8, s, {
        outerColor: '#ea580c',
        midColor: '#fb923c',
        coreColor: '#fef08a',
        intensity: pipeIntensity,
        emberCount: 2,
        reducedMotion,
      });
    }

    drawSkillShockwave(ctx, 0, -halfSize * 0.2, halfSize * 0.96, anim.skillRelease, '#ea580c', '#fde047', s);
  },

  // --------------------------------------------------------------------------
  // 27. elite_abyssal_executioner — Blood-Forged Double-Crescent Guillotine Ring
  // --------------------------------------------------------------------------
  elite_abyssal_executioner(ctx, st) {
    const { design, anim, rig, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const cleave = anim.attackPrep + anim.attackRelease + anim.castProgress + anim.skillRelease;

    drawAmbientAura(ctx, 0, 0, halfSize * (1.06 + cleave * 0.22), pal, 0.12 + cleave * 0.25);

    if (rig && rig.rings) {
      // Outer opposing double-crescent guillotine blades:
      // idle menacing oscillation; continuous revolve on move; full 360-deg slicing cleave on attack/skill!
      const idleOsc = Math.sin(t * 2.8) * 0.34 * m;
      const moveSpin = anim.isMoving ? anim.spinAngle * 0.95 : 0;
      const attackSpin = (anim.attackRelease * Math.PI * 2.0 + anim.castProgress * Math.PI * 1.4 - anim.attackPrep * 0.45) * m;
      drawRadialRingCanvas(ctx, rig.rings.blades, rig.cx, rig.cy, spriteSize, halfSize, {
        rot: idleOsc + moveSpin + attackSpin,
      });

      // Upright floating central blood-ruby crystal pulsing calmly inside the axle
      const rubyPulse = 1 + Math.sin(t * 3.8) * 0.06 * m + cleave * 0.1;
      drawRadialRingCanvas(ctx, rig.rings.rubyCore, rig.cx, rig.cy, spriteSize, halfSize, {
        rot: 0,
        sx: rubyPulse,
        sy: rubyPulse,
      });
    } else {
      drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    }

    drawFacetLightSweep(ctx, 0, 0, halfSize * 0.26, -0.5, t * (reducedMotion ? 0.2 : 0.55), '#fff1f2', 0.55 + cleave * 0.3);

    // Slicing crimson arc trail on attack/skill whirl
    if (anim.attackRelease > 0.08 || anim.castProgress > 0.15) {
      const p = Math.max(anim.attackRelease, anim.castProgress * 0.8);
      ctx.save();
      ctx.strokeStyle = withAlpha('#fb7185', p * 0.9);
      ctx.lineWidth = Math.max(1.4, 2.8 * s);
      ctx.beginPath();
      ctx.arc(0, 0, halfSize * 0.88, anim.spinAngle, anim.spinAngle + Math.PI * 1.35);
      ctx.stroke();
      ctx.restore();
    }
    drawSkillShockwave(ctx, 0, 0, halfSize * 0.96, anim.skillRelease, '#e11d48', '#fbbf24', s);
  },

  // --------------------------------------------------------------------------
  // 28. elite_cryo_archwarden — Glacial Cathedral Crystal Chandelier
  // --------------------------------------------------------------------------
  elite_cryo_archwarden(ctx, st) {
    const { design, anim, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const aurora = anim.attackPrep + anim.attackRelease + anim.castProgress + anim.skillRelease;

    drawAmbientAura(ctx, 0, 0, halfSize * (1.1 + aurora * 0.26), pal, 0.14 + aurora * 0.26);

    // Back half of polar frost ring (amplifies on cast/skill)
    const rx = halfSize * (1.06 + aurora * 0.16);
    const ry = rx * 0.32;
    drawHalfOrbitRing(ctx, 0, -halfSize * 0.06, rx, ry, -0.22, 'back', { color: '#67e8f9', width: 1.5 * s, alpha: 0.42 + aurora * 0.4 });

    // Regal top-pivoted chandelier sway
    const pivotY = -halfSize * 0.82;
    ctx.save();
    ctx.translate(0, pivotY);
    ctx.rotate(Math.sin(t * 2.0) * 0.05 * m);
    ctx.translate(0, -pivotY);
    drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);

    // Traveling cascading aurora shimmer rippling left-to-right across all 5 hanging icicles
    const icicleXs = [-0.42, -0.21, 0, 0.21, 0.42];
    const wavePos = ((t * (reducedMotion ? 0.55 : 1.45)) % 1) * 6 - 0.5;
    for (let i = 0; i < icicleXs.length; i += 1) {
      const dist = Math.abs(wavePos - i);
      const shine = Math.max(0, 1 - dist * 0.85);
      if (shine > 0.06 || aurora > 0.15) {
        const ix = icicleXs[i] * halfSize;
        const iy = halfSize * (0.44 + (i === 2 ? 0.14 : (i === 1 || i === 3 ? 0.06 : 0)));
        drawStarFlare(ctx, ix, iy, (2.6 + (shine + aurora * 0.7) * 3.0) * s, 0.16, '#67e8f9', '#ffffff', Math.min(0.95, shine * 0.85 + aurora * 0.45), t * 0.8 + i, 4);
      }
    }
    ctx.restore();

    drawHalfOrbitRing(ctx, 0, -halfSize * 0.06, rx, ry, -0.22, 'front', { color: '#bae6fd', width: 1.5 * s, alpha: 0.52 + aurora * 0.4 });
    drawSkillShockwave(ctx, 0, 0, halfSize * 0.96, anim.skillRelease, '#38bdf8', '#f0f9ff', s);
  },

  // --------------------------------------------------------------------------
  // 29. boss_bastion_warden — Floating Imperial Citadel Crown-Bastion (BOSS)
  // --------------------------------------------------------------------------
  boss_bastion_warden(ctx, st) {
    const { design, anim, rig, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const charge = anim.attackPrep + anim.attackRelease + anim.castProgress + anim.skillRelease;

    drawAmbientAura(ctx, 0, 0, halfSize * (1.16 + charge * 0.26), pal, 0.18 + charge * 0.28);

    const rx = halfSize * (1.18 + charge * 0.14);
    const ry = rx * 0.34;
    drawHalfOrbitRing(ctx, 0, halfSize * 0.04, rx, ry, -0.2, 'back', { color: '#e2b75b', width: 2.2 * s, alpha: 0.58 + charge * 0.32 });

    if (rig && rig.parts) {
      // Flanking golden bastion shield-plates patrol independently in depth & elevation
      const patrolL = Math.sin(t * 2.0);
      const patrolR = Math.sin(t * 2.0 + Math.PI * 0.85);
      const spread = (-anim.attackPrep * 5.5 + anim.attackRelease * 7.5 + anim.castProgress * 8.0 + anim.skillRelease * 9.5) * s * m;

      ctx.drawImage(rig.body, -halfSize, -halfSize, spriteSize, spriteSize);

      drawRigPart(ctx, rig.parts.leftPlate, spriteSize, halfSize, {
        dx: -spread,
        dy: patrolL * 4.8 * s * m,
        rot: -anim.attackRelease * 0.18 * m,
        sx: 0.95 + patrolL * 0.06 * m,
      });
      drawRigPart(ctx, rig.parts.rightPlate, spriteSize, halfSize, {
        dx: spread,
        dy: patrolR * 4.8 * s * m,
        rot: anim.attackRelease * 0.18 * m,
        sx: 0.95 + patrolR * 0.06 * m,
      });
    } else {
      drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    }

    // Radiant amber sun-dome heartbeat glow
    const domePulse = 0.65 + 0.35 * Math.sin(t * (reducedMotion ? 1.8 : 3.6));
    const dg = ctx.createRadialGradient(0, -halfSize * 0.06, 1, 0, -halfSize * 0.06, Math.max(4, halfSize * 0.34));
    dg.addColorStop(0, withAlpha('#fffdf4', 0.45 * domePulse + charge * 0.3));
    dg.addColorStop(0.6, withAlpha('#fde047', 0.25 * domePulse + charge * 0.25));
    dg.addColorStop(1, withAlpha('#d97706', 0));
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.arc(0, -halfSize * 0.06, Math.max(4, halfSize * 0.34), 0, Math.PI * 2);
    ctx.fill();

    drawHalfOrbitRing(ctx, 0, halfSize * 0.04, rx, ry, -0.2, 'front', { color: '#fde047', width: 2.2 * s, alpha: 0.72 + charge * 0.24 });

    // Boss skill: imperial golden crown wall array
    if (anim.castProgress > 0.08 || anim.skillRelease > 0.08) {
      const sp = Math.max(anim.castProgress, anim.skillRelease);
      for (let i = 0; i < 6; i += 1) {
        const a = anim.spinAngle * 0.8 + (i * Math.PI) / 3;
        const px = Math.cos(a) * rx * 0.92;
        const py = Math.sin(a) * ry * 0.92;
        drawStarFlare(ctx, px, py, (4.2 + sp * 3.8) * s, 0.2, '#fde047', '#ffffff', sp * 0.9, t, 4);
      }
    }
    drawSkillShockwave(ctx, 0, 0, halfSize * 1.05, anim.skillRelease, '#fbbf24', '#fffdf4', s);
  },

  // --------------------------------------------------------------------------
  // 30. boss_relay_archon — Celestial Filigree Harp-Mirror & Prism Feathers (BOSS)
  // --------------------------------------------------------------------------
  boss_relay_archon(ctx, st) {
    const { design, anim, rig, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const harmony = anim.attackPrep + anim.attackRelease + anim.castProgress + anim.skillRelease;

    drawAmbientAura(ctx, 0, 0, halfSize * (1.16 + harmony * 0.28), pal, 0.16 + harmony * 0.28);

    if (rig && rig.parts) {
      // Flanking prism feather pairs gracefully fan outward like crystal wings
      const fanAngle = (Math.sin(t * 2.2) * 0.11 - anim.attackPrep * 0.14 + anim.attackRelease * 0.24 + anim.castProgress * 0.28 + anim.skillRelease * 0.34) * m;
      const fanDx = (anim.castProgress * 4.5 + anim.attackRelease * 3.5) * s * m;
      drawRigPart(ctx, rig.parts.leftFeathers, spriteSize, halfSize, { dx: -fanDx, rot: -fanAngle });
      drawRigPart(ctx, rig.parts.rightFeathers, spriteSize, halfSize, { dx: fanDx, rot: fanAngle });
      ctx.drawImage(rig.body, -halfSize, -halfSize, spriteSize, spriteSize);
    } else {
      drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    }

    // 5 vertical silver harp strings plucked with traveling harmonic resonance glow
    const stringXs = [-0.13, -0.065, 0, 0.065, 0.13];
    const pluckIndex = ((t * (reducedMotion ? 1.2 : 3.6)) % 5);
    ctx.save();
    for (let i = 0; i < stringXs.length; i += 1) {
      const sx = stringXs[i] * spriteSize;
      const dist = Math.abs(pluckIndex - i);
      const vib = Math.max(0, 1 - dist) * (0.45 + harmony * 0.8);
      if (vib > 0.08) {
        const bow = Math.sin(t * 36 + i * 2) * (1.8 * vib) * s * m;
        ctx.strokeStyle = withAlpha(i % 2 === 0 ? '#7dd3fc' : '#f5d0fe', Math.min(0.95, 0.4 + vib * 0.6));
        ctx.lineWidth = Math.max(0.9, (1.1 + vib * 1.1) * s);
        ctx.beginPath();
        ctx.moveTo(sx, -halfSize * 0.34);
        quadTo(ctx, sx + bow, 0, sx, halfSize * 0.34);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Iridescent nebula refraction sweep inside oval mirror
    drawFacetLightSweep(ctx, 0, 0, halfSize * 0.42, -0.35, t * (reducedMotion ? 0.16 : 0.4), '#f5d0fe', 0.36 + harmony * 0.3);

    // Boss skill: radiant prism mandala feather bloom
    if (anim.castProgress > 0.08 || anim.skillRelease > 0.08) {
      const sp = Math.max(anim.castProgress, anim.skillRelease);
      ctx.save();
      ctx.strokeStyle = withAlpha('#e879f9', sp * 0.85);
      ctx.lineWidth = Math.max(1.2, 2.0 * s);
      ctx.beginPath();
      ctx.arc(0, 0, halfSize * (0.9 + sp * 0.32), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    drawSkillShockwave(ctx, 0, 0, halfSize * 1.06, anim.skillRelease, '#e879f9', '#7dd3fc', s);
  },

  // --------------------------------------------------------------------------
  // 31. boss_obsidian_sovereign — Eclipsed Obsidian Sovereign Crown (BOSS)
  // --------------------------------------------------------------------------
  boss_obsidian_sovereign(ctx, st) {
    const { design, anim, rig, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const eclipse = anim.attackPrep + anim.attackRelease + anim.castProgress + anim.skillRelease;

    // Undulating blood-crimson eclipse corona plasma flares behind the black moon orb
    drawAmbientAura(ctx, 0, 0, halfSize * (1.22 + eclipse * 0.28), pal, 0.20 + eclipse * 0.32);
    for (let i = 0; i < 6; i += 1) {
      const a = anim.spinAngle * 0.5 + (i * Math.PI) / 3;
      const flareR = halfSize * (0.68 + 0.08 * Math.sin(t * 3.8 + i * 1.5) * m + eclipse * 0.16);
      const px = Math.cos(a) * flareR * 0.72;
      const py = Math.sin(a) * flareR * 0.72;
      const g = ctx.createRadialGradient(px, py, 1, px, py, Math.max(4, halfSize * 0.34));
      g.addColorStop(0, withAlpha('#ef4444', 0.38 + eclipse * 0.25));
      g.addColorStop(1, withAlpha('#991b1b', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(4, halfSize * 0.34), 0, Math.PI * 2);
      ctx.fill();
    }

    if (rig && rig.parts) {
      // Flanking rune-carved obsidian monoliths hover and ascend dramatically on skill cast
      const ascend = (-anim.castProgress * 12.0 - anim.skillRelease * 14.0 - anim.attackPrep * 4.0) * s * m;
      const spread = (anim.castProgress * 5.0 + anim.attackRelease * 6.5) * s * m;
      const floatL = Math.sin(t * 2.1) * 5.0 * s * m;
      const floatR = Math.sin(t * 2.1 + 1.8) * 5.0 * s * m;

      drawRigPart(ctx, rig.parts.leftMonolith, spriteSize, halfSize, { dx: -spread, dy: floatL + ascend });
      drawRigPart(ctx, rig.parts.rightMonolith, spriteSize, halfSize, { dx: spread, dy: floatR + ascend });
      ctx.drawImage(rig.body, -halfSize, -halfSize, spriteSize, spriteSize);
    } else {
      drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    }

    // Piercing glaring / narrowing crimson eclipse visor eyes
    drawLivingEyeGlow(
      ctx,
      (0.42 - 0.5) * spriteSize,
      (0.515 - 0.5) * spriteSize,
      (0.58 - 0.5) * spriteSize,
      (0.515 - 0.5) * spriteSize,
      3.0 * s,
      '#ff2e4c',
      anim,
      t,
    );

    // Total eclipse halo ring during cast / skill
    if (anim.castProgress > 0.08 || anim.skillRelease > 0.08) {
      const sp = Math.max(anim.castProgress, anim.skillRelease);
      ctx.save();
      ctx.strokeStyle = withAlpha('#ff2e4c', sp * 0.9);
      ctx.lineWidth = Math.max(1.5, 2.8 * s);
      ctx.beginPath();
      ctx.arc(0, 0, halfSize * (0.85 + sp * 0.32), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    drawSkillShockwave(ctx, 0, 0, halfSize * 1.1, anim.skillRelease, '#ef4444', '#fda4af', s);
  },

  // --------------------------------------------------------------------------
  // 32. boss_chrono_arbiter — Grand Triple-Ring Celestial Armillary Sphere (BOSS)
  // --------------------------------------------------------------------------
  boss_chrono_arbiter(ctx, st) {
    const { design, anim, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const dialCx = (0.51 - 0.5) * spriteSize;
    const dialCy = 0;
    const charge = anim.attackPrep + anim.attackRelease + anim.castProgress + anim.skillRelease;

    drawAmbientAura(ctx, dialCx, dialCy, halfSize * (1.2 + charge * 0.28), pal, 0.16 + charge * 0.28);

    // Grand counter-rotating 3D armillary rings (back halves)
    const rx1 = halfSize * (1.22 + charge * 0.12);
    const ry1 = rx1 * 0.35;
    const tilt1 = -0.35 + Math.sin(anim.spinAngle * 0.4) * 0.12 * m;
    const tilt2 = 0.42 + Math.cos(anim.secondaryAngle * 0.45) * 0.12 * m;
    drawHalfOrbitRing(ctx, dialCx, dialCy, rx1, ry1, tilt1, 'back', { color: '#e2b75b', width: 2.3 * s, alpha: 0.65 + charge * 0.28 });
    drawHalfOrbitRing(ctx, dialCx, dialCy, rx1 * 0.88, ry1 * 0.88, tilt2, 'back', { color: '#818cf8', width: 1.6 * s, alpha: 0.55 + charge * 0.32, dash: [4 * s, 3 * s] });

    // Boss skill: grand layered spectral clockwork wheels behind armillary sphere
    if (anim.castProgress > 0.06 || anim.skillRelease > 0.06) {
      const sp = Math.max(anim.castProgress, anim.skillRelease);
      drawGearWheel(ctx, dialCx, dialCy, halfSize * (0.95 + sp * 0.22), 16, anim.gearAngle * 0.55, {
        fill: 'rgba(99, 102, 241, 0.16)',
        stroke: withAlpha('#e2b75b', sp * 0.82),
        holeFill: 'rgba(12, 10, 32, 0.25)',
        alpha: sp * 0.85,
      });
    }

    drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);

    // Live rotating ornate golden clock hands + traveling Roman light on central dial (r=0.125)
    const dialR = 0.128 * spriteSize;
    drawLiveClockworkMechanism(ctx, dialCx, dialCy, dialR, dialR * 0.48, anim, t, s * 0.85, pal, reducedMotion);

    // Front halves of armillary rings + orbiting golden planetary spheres
    drawHalfOrbitRing(ctx, dialCx, dialCy, rx1, ry1, tilt1, 'front', { color: '#fde68a', width: 2.3 * s, alpha: 0.78 + charge * 0.2 });
    drawHalfOrbitRing(ctx, dialCx, dialCy, rx1 * 0.88, ry1 * 0.88, tilt2, 'front', { color: '#c4b5fd', width: 1.6 * s, alpha: 0.68 + charge * 0.28, dash: [4 * s, 3 * s] });

    for (let i = 0; i < 3; i += 1) {
      const a = (i % 2 === 0 ? anim.spinAngle : anim.secondaryAngle) + (i * Math.PI * 2) / 3;
      const tilt = i % 2 === 0 ? tilt1 : tilt2;
      const rX = i % 2 === 0 ? rx1 : rx1 * 0.88;
      const rY = i % 2 === 0 ? ry1 : ry1 * 0.88;
      const nx = Math.cos(a) * rX;
      const ny = Math.sin(a) * rY;
      const px = dialCx + nx * Math.cos(tilt) - ny * Math.sin(tilt);
      const py = dialCy + nx * Math.sin(tilt) + ny * Math.cos(tilt);
      ctx.fillStyle = i === 0 ? '#fde047' : '#c4b5fd';
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1.6, (2.6 + charge * 1.0) * s), 0, Math.PI * 2);
      ctx.fill();
    }
    drawSkillShockwave(ctx, dialCx, dialCy, halfSize * 1.12, anim.skillRelease, '#818cf8', '#fde047', s);
  },

  // --------------------------------------------------------------------------
  // 33. boss_astral_leviathan — Orbital Dyson Star-Forge Crucible (BOSS)
  // --------------------------------------------------------------------------
  boss_astral_leviathan(ctx, st) {
    const { design, anim, rig, sprite, halfSize, spriteSize, s, t, reducedMotion } = st;
    const pal = design.palette;
    const m = anim.motionScale;
    const starCx = (0.47 - 0.5) * spriteSize;
    const starCy = (0.45 - 0.5) * spriteSize;
    const cataclysm = anim.attackPrep + anim.attackRelease + anim.castProgress + anim.skillRelease;

    // Massive golden-orange star-forge corona aura
    drawAmbientAura(ctx, starCx, starCy, halfSize * (1.24 + cataclysm * 0.30), pal, 0.22 + cataclysm * 0.34);

    // Counter-rotating Dyson containment rings (back)
    const rx = halfSize * (1.22 + cataclysm * 0.16);
    const ry = rx * 0.36;
    const tilt1 = -0.3 + Math.sin(anim.spinAngle * 0.45) * 0.1 * m;
    const tilt2 = 0.36 + Math.cos(anim.secondaryAngle * 0.45) * 0.1 * m;
    drawHalfOrbitRing(ctx, starCx, starCy, rx, ry, tilt1, 'back', { color: '#fbbf24', width: 2.4 * s, alpha: 0.65 + cataclysm * 0.3 });
    drawHalfOrbitRing(ctx, starCx, starCy, rx * 0.9, ry * 0.9, tilt2, 'back', { color: '#f97316', width: 1.8 * s, alpha: 0.55 + cataclysm * 0.35 });

    if (rig && rig.parts) {
      // Flanking anvil-shield plates breathe outward/inward with star core pressure & flare wide on skill!
      const plateBreathe = Math.sin(t * 2.0) * 3.8 * s * m;
      const plateFlare = (-anim.attackPrep * 4.5 + anim.attackRelease * 8.5 + anim.castProgress * 10.5 + anim.skillRelease * 12.0) * s * m;
      ctx.drawImage(rig.body, -halfSize, -halfSize, spriteSize, spriteSize);

      drawRigPart(ctx, rig.parts.leftAnvil, spriteSize, halfSize, {
        dx: -plateBreathe - plateFlare,
        dy: Math.sin(t * 2.4) * 3.2 * s * m,
        rot: -(anim.castProgress * 0.16 + anim.attackRelease * 0.14) * m,
      });
      drawRigPart(ctx, rig.parts.rightAnvil, spriteSize, halfSize, {
        dx: plateBreathe + plateFlare,
        dy: -Math.sin(t * 2.4) * 3.2 * s * m,
        rot: (anim.castProgress * 0.16 + anim.attackRelease * 0.14) * m,
      });
    } else {
      drawBaseSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s);
    }

    // Flowing star-forge plasma convection & pulsing brilliance inside Dyson core
    const starR = halfSize * (0.34 + cataclysm * 0.1);
    ctx.save();
    ctx.translate(starCx, starCy);
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(4, starR), 0, Math.PI * 2);
    safeClip(ctx);
    for (let i = 0; i < 3; i += 1) {
      const a = anim.spinAngle * 0.9 + i * 2.1;
      const px = Math.cos(a) * starR * 0.36;
      const py = Math.sin(a * 1.15) * starR * 0.36;
      const g = ctx.createRadialGradient(px, py, 1, px, py, Math.max(3, starR * 0.72));
      g.addColorStop(0, withAlpha('#fffdf4', 0.42 + cataclysm * 0.3));
      g.addColorStop(0.6, withAlpha('#fde047', 0.2));
      g.addColorStop(1, withAlpha('#f97316', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(3, starR * 0.72), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Front halves of Dyson containment rings + orbiting solar flare sparks
    drawHalfOrbitRing(ctx, starCx, starCy, rx, ry, tilt1, 'front', { color: '#fef08a', width: 2.4 * s, alpha: 0.78 + cataclysm * 0.22 });
    drawHalfOrbitRing(ctx, starCx, starCy, rx * 0.9, ry * 0.9, tilt2, 'front', { color: '#fb923c', width: 1.8 * s, alpha: 0.68 + cataclysm * 0.3 });

    drawDriftingParticles(ctx, starCx, starCy, halfSize * 0.65, halfSize * 0.95, 5, t, s, '#fde047', 0.72 + cataclysm * 0.25, reducedMotion);
    drawSkillShockwave(ctx, starCx, starCy, halfSize * 1.15, anim.skillRelease, '#f97316', '#fffdf4', s);
  },
});

export function getUnitComponentAnimator(unitId) {
  return UNIT_COMPONENT_ANIMATORS[unitId] || UNIT_COMPONENT_ANIMATORS.heavy_shield_guard;
}
