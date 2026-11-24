/**
 * UnitObjectModelRenderer — Layered Component & Material Animation Renderer
 * for all 33 Star Struck battlefield units.
 *
 * Delegates each unit to its bespoke UnitComponentAnimator backed by lazily
 * cached offscreen sprite sub-layers (UnitSpriteRigCache) and smoothly
 * integrated 3-phase attack / skill animation states (UnitAnimationProfiles).
 */

import { UNIT_STATES } from '../battle/UnitManager.js';
import { drawStarFlare } from './NonUnitVfxGeometry.js';
import { resolveUnitObjectDesign, UNIT_OBJECT_ROSTER_IDS } from './UnitObjectDesignCatalog.js';
import { computeUnitObjectAnimation } from './UnitObjectModelHelpers.js';
import { getUnitSpriteRig } from './UnitSpriteRigCache.js';
import { getUnitComponentAnimator } from './UnitComponentAnimators.js';

function drawTierAccents(ctx, cx, topY, s, tier, elapsed, reducedMotion) {
  if (!tier || tier <= 1) return;
  const count = tier >= 3 ? 3 : 2;
  const color = tier >= 3 ? '#fde047' : '#bae6fd';
  const amp = reducedMotion ? 0.4 : 1.3;
  for (let i = 0; i < count; i += 1) {
    const ox = (i - (count - 1) * 0.5) * 9.0 * s;
    const oy = topY - 3 * s - Math.sin(elapsed * 4 + i * 1.2) * amp * s;
    drawStarFlare(ctx, cx + ox, oy, 3.6 * s, 0.25, color, '#ffffff', 0.92, elapsed * 0.8 + i, 4);
  }
}

function drawDeadSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, s) {
  if (sprite && sprite.complete && sprite.naturalWidth > 0) {
    ctx.drawImage(sprite, -halfSize, -halfSize, spriteSize, spriteSize);
    return;
  }
  const pal = design.palette;
  ctx.fillStyle = pal.primary;
  ctx.strokeStyle = pal.trim;
  ctx.lineWidth = Math.max(1, 1.8 * s);
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(4, halfSize * 0.62), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// Keep 1-to-1 roster map exported for audit tests & programmatic inspection
export const UNIT_OBJECT_RENDERERS = Object.freeze(
  Object.fromEntries(
    UNIT_OBJECT_ROSTER_IDS.map((id) => [
      id,
      (ctx, design, s, anim, t, halfSize, sprite, unit = null) => {
        const animator = getUnitComponentAnimator(id);
        const rig = getUnitSpriteRig(id, sprite);
        animator(ctx, {
          unit,
          design,
          profile: anim?.profile,
          anim,
          rig,
          sprite,
          halfSize,
          spriteSize: halfSize * 2,
          s,
          t,
          reducedMotion: Boolean(anim?.reducedMotion),
        });
      },
    ]),
  ),
);

/**
 * Computes consistent screen-space layout coordinates for BattleRenderer
 * (shared between model drawing, contact shadows, shield domes, status icons, and HP bars).
 */
export function getUnitModelLayout(unit, { x, y, scale = 1, elapsed = 0, deathProgress = 0, reducedMotion = undefined }) {
  const design = resolveUnitObjectDesign(unit, unit?.side);
  const anim = computeUnitObjectAnimation(
    unit,
    elapsed,
    design,
    reducedMotion === undefined ? null : { reducedMotion },
  );
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
 * Renders any unit on the battlefield with its bespoke layered component,
 * material, orbital, 3-phase attack, and skill animations.
 */
export function drawChibiObjectUnit(
  ctx,
  unit,
  { x, y, scale = 1, elapsed = 0, deathProgress = 0, assetManager = null, reducedMotion = undefined },
) {
  const layout = getUnitModelLayout(unit, { x, y, scale, elapsed, deathProgress, reducedMotion });
  const { design, anim, spriteSize, drawX, centerY } = layout;
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

  // Unit local mirrored coordinate space (art & separated components mirror cleanly together)
  ctx.save();
  if (unit?.facing < 0 && design.mirrorOnLeft) {
    ctx.scale(-1, 1);
  }
  if (isDead) {
    drawDeadSpriteOrFallback(ctx, sprite, design, halfSize, spriteSize, modelScale);
  } else {
    const renderer = UNIT_OBJECT_RENDERERS[design.id] || UNIT_OBJECT_RENDERERS.heavy_shield_guard;
    renderer(ctx, design, modelScale, anim, t, halfSize, sprite, unit);
  }
  ctx.restore();

  // Merged ally tier crest (unmirrored above unit)
  if (!isDead && isAlly && (unit?.tier || 1) > 1) {
    drawTierAccents(ctx, 0, -halfSize * 0.92, modelScale, unit.tier, t, anim.reducedMotion);
  }

  ctx.restore();
  return layout;
}

