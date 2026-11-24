/**
 * UnitObjectModelRenderer — Hybrid 2.5D Authored-Sprite + Dynamic Depth Renderer.
 *
 * Renders Star Struck's 33 authored 2.5D WebP object assets with:
 * - Layer 1: Depth-sorted 2.5D rear elements (volumetric coronas, rear-orbiting
 *   gears/crystals/rings where sin(angle) < 0, billowing ribbons, forge plumes).
 * - Layer 2: Authored high-detail painterly 2.5D RGBA WebP object sprite with
 *   per-unit locomotion, selective facing mirror, cast pulse, and death dissolve.
 * - Layer 3: Depth-sorted 2.5D front elements (foreground orbiting gears/shards
 *   where sin(angle) >= 0, specular glints, cast-charge flares, and Lv.II/III pips).
 * - Graceful headless fallback when AssetManager is unavailable (Node unit tests).
 */

import { UNIT_STATES } from '../battle/UnitManager.js';
import { clamp01, withAlpha, drawStarFlare } from './NonUnitVfxGeometry.js';
import { resolveUnitObjectDesign, UNIT_OBJECT_ROSTER_IDS } from './UnitObjectDesignCatalog.js';
import {
  computeUnitObjectAnimation,
  drawUndulatingRibbon,
} from './UnitObjectModelHelpers.js';

function drawTierAccents(ctx, cx, topY, s, tier, elapsed) {
  if (!tier || tier <= 1) return;
  const count = tier >= 3 ? 3 : 2;
  const color = tier >= 3 ? '#fde047' : '#bae6fd';
  for (let i = 0; i < count; i += 1) {
    const ox = (i - (count - 1) * 0.5) * 9.0 * s;
    const oy = topY - 3 * s - Math.sin(elapsed * 4 + i * 1.2) * 1.3 * s;
    drawStarFlare(ctx, cx + ox, oy, 3.6 * s, 0.25, color, '#ffffff', 0.92, elapsed * 0.8 + i, 4);
  }
}

/**
 * Draws a tilted 3D elliptical arc split cleanly into rear (sin < 0) and front (sin >= 0) halves
 * so orbiting rings genuinely wrap behind and in front of the authored 2.5D sprite.
 */
function drawHalfOrbitRing(ctx, rx, ry, tiltAngle, half, { color, width, alpha = 0.8 }) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.rotate(tiltAngle);
  ctx.strokeStyle = withAlpha(color, alpha);
  ctx.lineWidth = width;
  ctx.beginPath();
  if (half === 'back') {
    ctx.ellipse(0, 0, rx, ry, 0, Math.PI, Math.PI * 2);
  } else {
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
  }
  ctx.stroke();
  ctx.restore();
}

function drawBackDepthLayer(ctx, design, s, anim, t, halfSize) {
  const pal = design.palette;
  const style = design.depthStyle || 'orbital_rings';
  const isPure2D = design.renderStyle === '2d';
  const charge = anim.isCasting ? 0.4 + anim.castProgress * 0.6 : anim.attackRatio * 0.5;
  const r = halfSize;

  // Restrained ambient aura (Pure 2D units stay crisp with minimal glow; 2.5D only intensifies on cast)
  const auraAlpha = isPure2D ? 0.05 + charge * 0.16 : 0.11 + charge * 0.24;
  const auraR = r * (isPure2D ? 1.04 + charge * 0.16 : 1.08 + charge * 0.22);
  const aura = ctx.createRadialGradient(0, 0, r * 0.14, 0, 0, Math.max(2, auraR));
  aura.addColorStop(0, withAlpha(pal.core, auraAlpha));
  aura.addColorStop(0.5, withAlpha(pal.glow, auraAlpha * 0.52));
  aura.addColorStop(1, withAlpha(pal.glow, 0));
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(2, auraR), 0, Math.PI * 2);
  ctx.fill();

  if (isPure2D) {
    // Keep Pure 2D illustrations faithful without slapping 3D rings onto them
    if (style === 'gale_ribbons') {
      const dir = anim.facing;
      drawUndulatingRibbon(ctx, -dir * r * 0.3, -r * 0.14, r * 0.72, 2.6 * s, dir > 0 ? Math.PI + 0.16 : -0.16, t * 7, {
        color: withAlpha(pal.secondary, 0.28),
        trimColor: withAlpha(pal.core, 0.36),
        alpha: 0.45,
      });
    }
    return;
  }

  if (style === 'solar_corona') {
    // Soft luminous solar prominence wisps & warm golden corona ring behind sun
    for (let i = 0; i < 6; i += 1) {
      const a = t * (0.7 + charge * 1.6) + (i * Math.PI) / 3;
      const reach = r * (0.98 + charge * 0.28 + 0.05 * Math.sin(t * 4 + i));
      const px = Math.cos(a) * reach * 0.72;
      const py = Math.sin(a) * reach * 0.72;
      const g = ctx.createRadialGradient(px, py, 1, px, py, Math.max(4, r * 0.46));
      g.addColorStop(0, withAlpha(pal.secondary, 0.34 + charge * 0.28));
      g.addColorStop(1, withAlpha(pal.primary, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(4, r * 0.46), 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  if (style === 'chrono_clockwork' || style === 'orbital_rings' || style === 'boss_sovereign') {
    const ringRx = r * (1.14 + charge * 0.1);
    const ringRy = ringRx * 0.36;
    drawHalfOrbitRing(ctx, ringRx, ringRy, -0.32, 'back', {
      color: pal.trim,
      width: (design.rosterGroup === 'boss' ? 2.2 : 1.45) * s,
      alpha: 0.45 + charge * 0.35,
    });
    drawHalfOrbitRing(ctx, ringRx * 0.9, ringRy * 0.9, 0.38, 'back', {
      color: pal.glow,
      width: 1.2 * s,
      alpha: 0.35 + charge * 0.35,
    });
    return;
  }

  if (style === 'gale_ribbons') {
    const dir = anim.facing;
    drawUndulatingRibbon(ctx, -dir * r * 0.3, -r * 0.14, r * 0.85, 3.6 * s, dir > 0 ? Math.PI + 0.16 : -0.16, t * 8, {
      color: withAlpha(pal.secondary, 0.45),
      trimColor: withAlpha(pal.core, 0.55),
      alpha: 0.65,
    });
  }
}

function drawFrontDepthLayer(ctx, design, s, anim, t, halfSize) {
  const pal = design.palette;
  const style = design.depthStyle || 'orbital_rings';
  const charge = anim.isCasting ? 0.4 + anim.castProgress * 0.6 : anim.attackRatio * 0.5;
  const r = halfSize;

  if (design.renderStyle === '2d') {
    if (charge > 0.18) {
      drawStarFlare(ctx, 0, -r * 0.22, (3.2 + charge * 3.0) * s, 0.16, pal.secondary, '#ffffff', charge * 0.6, t, 4);
    }
    return;
  }

  if (style === 'solar_corona') {
    if (charge > 0.08) {
      ctx.save();
      ctx.strokeStyle = withAlpha(pal.secondary, charge * 0.48);
      ctx.lineWidth = 1.35 * s;
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.94 + charge * 0.24), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    const pulse = 0.5 + 0.5 * Math.sin(t * 4.5);
    drawStarFlare(
      ctx,
      r * 0.24,
      -r * 0.22,
      (4.5 + charge * 4.2 + pulse * 1.8) * s,
      0.14,
      pal.secondary,
      '#ffffff',
      0.55 + charge * 0.35,
      t * 0.9,
      4,
    );
    return;
  }

  if (style === 'chrono_clockwork' || style === 'orbital_rings' || style === 'boss_sovereign') {
    const ringRx = r * (1.14 + charge * 0.1);
    const ringRy = ringRx * 0.36;
    drawHalfOrbitRing(ctx, ringRx, ringRy, -0.32, 'front', {
      color: pal.trim,
      width: (design.rosterGroup === 'boss' ? 2.2 : 1.45) * s,
      alpha: 0.55 + charge * 0.32,
    });
    drawHalfOrbitRing(ctx, ringRx * 0.9, ringRy * 0.9, 0.38, 'front', {
      color: pal.glow,
      width: 1.2 * s,
      alpha: 0.45 + charge * 0.35,
    });
    // Tiny luminous orbiting star-nodes on the ring (no flat cartoon gears!)
    for (let i = 0; i < 2; i += 1) {
      const a = t * (1.2 + charge * 2.0) + i * Math.PI;
      if (Math.sin(a) < 0) continue;
      const nx = Math.cos(a) * ringRx;
      const ny = Math.sin(a) * ringRy;
      const rotX = nx * Math.cos(-0.32) - ny * Math.sin(-0.32);
      const rotY = nx * Math.sin(-0.32) + ny * Math.cos(-0.32);
      drawStarFlare(ctx, rotX, rotY, (3.4 + charge * 2.4) * s, 0.18, pal.core, '#ffffff', 0.85, t, 4);
    }
    return;
  }

  if (style === 'crystal_refraction' || style === 'frost_shards') {
    // Delicate prismatic specular star-glints & floating motes (no flat polygons)
    for (let i = 0; i < 3; i += 1) {
      const a = t * 1.1 + (i * Math.PI * 2) / 3;
      const mx = Math.cos(a) * r * 0.72;
      const my = Math.sin(a) * r * 0.52 - r * 0.12;
      const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(t * 2.5 + i * 1.7));
      drawStarFlare(ctx, mx, my, (3.2 + charge * 2.8) * s * twinkle, 0.15, pal.secondary, '#ffffff', (0.55 + charge * 0.35) * twinkle, t * 0.6, 4);
    }
    return;
  }

  if (style === 'forge_embers') {
    for (let i = 0; i < 4; i += 1) {
      const cycle = (t * 0.9 + i * 0.25) % 1;
      const ex = Math.sin(i * 2.4 + t * 3) * r * 0.42;
      const ey = -r * 0.3 - cycle * r * 0.68;
      ctx.fillStyle = withAlpha(pal.secondary, (1 - cycle) * (0.55 + charge * 0.35));
      ctx.beginPath();
      ctx.arc(ex, ey, (1.8 - cycle * 1.0) * s, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  if (charge > 0.15) {
    drawStarFlare(ctx, 0, -r * 0.25, (4.0 + charge * 3.5) * s, 0.15, pal.secondary, '#ffffff', charge * 0.75, t, 4);
  }
}

/**
 * Lightweight fallback used strictly in headless Node tests where image elements are not loaded.
 */
function drawHeadlessFallback(ctx, design, s, anim, t, halfSize) {
  const pal = design.palette;
  drawBackDepthLayer(ctx, design, s, anim, t, halfSize);
  ctx.fillStyle = pal.primary;
  ctx.strokeStyle = pal.trim;
  ctx.lineWidth = 1.8 * s;
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(4, halfSize * 0.65), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  drawFrontDepthLayer(ctx, design, s, anim, t, halfSize);
}

// Keep 1-to-1 roster map exported for audit tests
export const UNIT_OBJECT_RENDERERS = Object.freeze(
  Object.fromEntries(
    UNIT_OBJECT_ROSTER_IDS.map((id) => [
      id,
      (ctx, design, s, anim, t, halfSize, sprite) => {
        if (sprite && sprite.complete && sprite.naturalWidth > 0) {
          ctx.drawImage(sprite, -halfSize, -halfSize, halfSize * 2, halfSize * 2);
        } else {
          drawHeadlessFallback(ctx, design, s, anim, t, halfSize);
        }
      },
    ]),
  ),
);

/**
 * Computes consistent screen-space layout coordinates for BattleRenderer
 * (shared between model drawing, contact shadows, shield domes, status icons, and HP bars).
 */
export function getUnitModelLayout(unit, { x, y, scale = 1, elapsed = 0, deathProgress = 0 }) {
  const design = resolveUnitObjectDesign(unit, unit?.side);
  const anim = computeUnitObjectAnimation(unit, elapsed, design);
  const spriteSize = (design.renderSize || design.baseSize || 68) * scale;
  const facing = unit?.facing || 1;
  const isDead = unit?.state === UNIT_STATES.DEAD;

  const drawX = x + anim.lungeX - (isDead ? deathProgress * 7 * facing : 0);
  const drawY = y - spriteSize * 0.72 - anim.bobY + (isDead ? deathProgress * 10 : 0);
  const centerY = drawY + spriteSize * 0.48;

  return {
    design,
    anim,
    spriteSize,
    drawX,
    drawY,
    centerY,
  };
}

/**
 * Renders any unit on the battlefield using its authored 2.5D object sprite
 * wrapped in back-to-front dimensional depth layers.
 */
export function drawChibiObjectUnit(
  ctx,
  unit,
  { x, y, scale = 1, elapsed = 0, deathProgress = 0, assetManager = null },
) {
  const layout = getUnitModelLayout(unit, { x, y, scale, elapsed, deathProgress });
  const { design, anim, spriteSize, drawX, drawY, centerY } = layout;
  const pal = design.palette;
  const isDead = unit?.state === UNIT_STATES.DEAD;
  const isAlly = unit?.side === 'ally';
  const modelScale = spriteSize / 64;
  const halfSize = spriteSize * 0.5;
  const t = elapsed + (unit?.phase || 0);

  const sprite =
    assetManager?.getImageElement?.(design.modelAssetId) ||
    assetManager?.getImageElement?.(unit?.spriteAssetId) ||
    null;

  ctx.save();
  ctx.translate(drawX, centerY);
  if (isDead) {
    ctx.rotate((isAlly ? -1 : 1) * Math.min(1.15, deathProgress * 1.25));
    const dScale = Math.max(0.1, 1 - deathProgress * 0.18);
    ctx.scale(dScale, dScale);
  } else {
    ctx.rotate(anim.tilt);
    ctx.scale(anim.scaleX, anim.scaleY);
  }

  // Hostile crimson rim glow when a playable ally unit spawns on the enemy side
  if (!isDead && unit?.side === 'enemy' && design.rosterGroup === 'playable') {
    const rim = ctx.createRadialGradient(0, 0, halfSize * 0.45, 0, 0, Math.max(4, halfSize * 1.15));
    rim.addColorStop(0, 'rgba(248, 113, 113, 0)');
    rim.addColorStop(0.75, 'rgba(239, 68, 68, 0.36)');
    rim.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(4, halfSize * 1.15), 0, Math.PI * 2);
    ctx.fill();
  }

  // Layer 1: Rear 2.5D depth elements
  if (!isDead) {
    drawBackDepthLayer(ctx, design, modelScale, anim, t, halfSize);
  }

  // Layer 2: Authored 2.5D painterly WebP sprite (or headless fallback)
  ctx.save();
  if (unit?.facing < 0 && design.mirrorOnLeft) {
    ctx.scale(-1, 1);
  }
  if (sprite && sprite.complete && sprite.naturalWidth > 0) {
    ctx.drawImage(sprite, -halfSize, -halfSize, spriteSize, spriteSize);
  } else {
    drawHeadlessFallback(ctx, design, modelScale, anim, t, halfSize);
  }
  ctx.restore();

  // Layer 3: Foreground 2.5D depth elements + merged ally tier crest
  if (!isDead) {
    drawFrontDepthLayer(ctx, design, modelScale, anim, t, halfSize);
    if (isAlly && (unit?.tier || 1) > 1) {
      drawTierAccents(ctx, 0, -halfSize * 0.92, modelScale, unit.tier, t);
    }
  }

  ctx.restore();
  return layout;
}
