/**
 * BattleRenderer — High-performance Isometric 2D Canvas battlefield renderer.
 *
 * P3 Upgrades:
 * - Static arena floor offscreen cache (redraws only on resize/stage change -> stable 60 FPS at 50 units)
 * - Crisp directional unit stride/tilt, attack lunge & melee slash arcs, hit flash, death dissolve
 * - Enhanced projectile trails (physical bolts, arcane orbs, AoE fireballs, heal & shield prisms)
 * - Uncluttered micro status indicators (shield dome, burn embers, stun stars, slow frost, buff chevrons)
 * - Boss entrance shockwaves, telegraph countdown rings with ability names, and 5 distinct Commander Ultimates
 */

import { UNIT_STATES } from '../battle/UnitManager.js';

export class BattleRenderer {
  constructor({ assetManager, animationManager, particleSystem, gameState }) {
    this._assets = assetManager;
    this._anim = animationManager;
    this._particles = particleSystem;
    this._state = gameState;
    this._battlefield = null;
    this._canvas = null;
    this._ctx = null;
    this._width = 1200;
    this._height = 500;
    this._dpr = 1;
    this._debugMode = false;

    // Offscreen static arena cache for 60 FPS stability
    this._floorCache = null;
    this._floorCacheKey = '';
    this._renderables = [];
  }

  setBattlefield(battlefield) {
    this._battlefield = battlefield;
    this._floorCacheKey = '';
  }

  setDebugMode(enabled) {
    this._debugMode = Boolean(enabled);
  }

  attach(canvas) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._floorCacheKey = '';
    this.resize();
    this._particles?.seedAmbient(
      this._width,
      this._height,
      this._state.settings.graphicsQuality,
    );
  }

  detach() {
    this._canvas = null;
    this._ctx = null;
    this._floorCache = null;
    this._floorCacheKey = '';
  }

  resize() {
    if (!this._canvas) return;
    const rect = this._canvas.getBoundingClientRect();
    const quality = this._state.settings.graphicsQuality;
    const maxDpr = quality === 'low' ? 1 : quality === 'medium' ? 1.5 : 2;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this._dpr = Math.min(dpr, maxDpr);
    this._width = Math.max(320, Math.round(rect.width || 960));
    this._height = Math.max(260, Math.round(rect.height || 440));
    this._canvas.width = Math.round(this._width * this._dpr);
    this._canvas.height = Math.round(this._height * this._dpr);
    this._floorCacheKey = '';
  }

  getDimensions() {
    return { width: this._width, height: this._height };
  }

  _ensureFloorCache(bf, w, h, stageId) {
    if (typeof document === 'undefined') return null;
    const key = `${stageId || 'default'}_${bf.terrainId || 'std'}_${w}x${h}_${this._dpr}`;
    if (this._floorCache && this._floorCacheKey === key) {
      return this._floorCache;
    }

    const off = this._floorCache || document.createElement('canvas');
    off.width = Math.round(w * this._dpr);
    off.height = Math.round(h * this._dpr);
    const octx = off.getContext('2d');
    if (!octx) return null;

    octx.save();
    octx.scale(this._dpr, this._dpr);
    this._drawStaticArenaFloor(octx, bf, w, h);
    octx.restore();

    this._floorCache = off;
    this._floorCacheKey = key;
    return off;
  }

  render({
    stage,
    battlefield = null,
    phase = 'active_combat',
    units = [],
    projectiles = [],
    telegraphs = [],
    selectedPrepUnitUid = null,
    activeTactic = null,
  }) {
    if (!this._ctx || !this._canvas) return;
    const bf = battlefield || this._battlefield;
    if (!bf) return;

    const ctx = this._ctx;
    const w = this._width;
    const h = this._height;
    const shake = this._anim.getShakeOffset();
    const elapsed = this._anim.getElapsed();

    ctx.save();
    ctx.scale(this._dpr, this._dpr);
    ctx.translate(shake.x, shake.y);

    // 1. Deep orbital navy backdrop + subtle stage art
    const bgImg = stage ? this._assets.getImageElement(stage.backgroundAssetId) : null;
    if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
      ctx.globalAlpha = 0.28;
      ctx.drawImage(bgImg, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    const backdrop = ctx.createRadialGradient(w * 0.5, h * 0.34, 40, w * 0.5, h * 0.52, w * 0.74);
    backdrop.addColorStop(0, 'rgba(20, 38, 70, 0.72)');
    backdrop.addColorStop(0.55, 'rgba(9, 17, 34, 0.9)');
    backdrop.addColorStop(1, '#050912');
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, w, h);

    // 2. Ambient starlight particles behind arena
    if (this._particles?.renderAmbient) {
      this._particles.renderAmbient(ctx);
    } else {
      this._particles?.render(ctx);
    }

    // 3. Cached static isometric floor + dynamic phase highlight
    const cachedFloor = this._ensureFloorCache(bf, w, h, stage?.id);
    if (cachedFloor) {
      ctx.drawImage(cachedFloor, 0, 0, w, h);
    } else {
      this._drawStaticArenaFloor(ctx, bf, w, h);
    }
    this._drawDynamicArenaOverlays(ctx, bf, w, h, phase, elapsed, activeTactic);

    // 4. Decorative & Blocked Ground Terrain Features
    this._drawGroundFeatures(ctx, bf, w, h, elapsed);

    // 5. Boss/Skill Telegraphs on the ground plane
    this._drawTelegraphs(ctx, bf, w, h, telegraphs);

    // 6. Ground World Effects (rings, heal waves, deploy seals, tactic pulses, boss entrance)
    this._drawWorldEffects(ctx, bf, w, h, 'ground');

    // 7. Depth-sorted Obstacles & Units (reuse array to avoid GC churn)
    const renderables = this._renderables;
    renderables.length = 0;
    for (let i = 0; i < bf.features.length; i += 1) {
      const feat = bf.features[i];
      if (feat.type === 'obstacle') {
        const cx = feat.shape === 'circle' ? feat.x : feat.x + (feat.width || 6) * 0.5;
        const cy = feat.shape === 'circle' ? feat.y : feat.y + (feat.height || 6) * 0.5;
        renderables.push({ kind: 'obstacle', depth: bf.getDepth(cx, cy), feat });
      }
    }
    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i];
      renderables.push({ kind: 'unit', depth: bf.getDepth(unit.x, unit.y), unit });
    }
    renderables.sort((a, b) => a.depth - b.depth);

    const markedUid = activeTactic?.mode === 'focus_fire' ? activeTactic.markedTargetUid : null;
    for (let i = 0; i < renderables.length; i += 1) {
      const item = renderables[i];
      if (item.kind === 'obstacle') {
        this._drawObstacle(ctx, bf, w, h, item.feat);
      } else {
        this._drawUnit(ctx, bf, w, h, item.unit, elapsed, {
          isSelectedPrep: item.unit.uid === selectedPrepUnitUid,
          isFocusMarked: markedUid !== null && markedUid === item.unit.uid,
        });
      }
    }

    // 8. Projectiles in flight (with directional comet trails)
    this._drawProjectiles(ctx, bf, w, h, projectiles);

    // 9. Mid/Sky World Effects (slashes, chain lightning, sky lances, Commander Ultimates)
    this._drawWorldEffects(ctx, bf, w, h, 'sky');

    // 10. Foreground burst/healing particles
    if (this._particles?.renderForeground) {
      this._particles.renderForeground(ctx);
    }

    // 11. Floating Damage / Crit / Heal / Shield Numbers
    this._drawFloatingTexts(ctx, bf, w, h);

    // 12. Subtle screen flash veil (Ultimate / Boss arrival)
    const flash = this._anim.getScreenFlash?.();
    if (flash && flash.alpha > 0.005) {
      ctx.save();
      ctx.globalAlpha = flash.alpha;
      ctx.fillStyle = flash.color;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // 13. Developer Debug Overlay (disabled in normal gameplay)
    if (this._debugMode) {
      this._drawDebugOverlay(ctx, bf, w, h, units);
    }

    // 14. Pause Veil
    if (this._state.battle.status === 'paused') {
      ctx.fillStyle = 'rgba(6, 10, 20, 0.56)';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w * 0.5 - 120, h * 0.48 - 22);
      ctx.lineTo(w * 0.5 + 120, h * 0.48 - 22);
      ctx.moveTo(w * 0.5 - 120, h * 0.48 + 14);
      ctx.lineTo(w * 0.5 + 120, h * 0.48 + 14);
      ctx.stroke();
      ctx.fillStyle = '#edf2fa';
      ctx.font = '700 22px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BATTLE PAUSED', w * 0.5, h * 0.48);
    }

    ctx.restore();
  }

  _drawPoly(ctx, bf, w, h, points) {
    ctx.beginPath();
    for (let i = 0; i < points.length; i += 1) {
      const p = bf.worldToScreen(points[i][0], points[i][1], w, h);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  }

  _drawStaticArenaFloor(ctx, bf, w, h) {
    const W = bf.worldWidth;
    const H = bf.worldHeight;

    const pTL = bf.worldToScreen(0, 0, w, h);
    const pBL = bf.worldToScreen(0, H, w, h);
    const pBR = bf.worldToScreen(W, H, w, h);
    const pTR = bf.worldToScreen(W, 0, w, h);
    const thickness = 14;

    // Platform slab bevels
    ctx.fillStyle = '#091326';
    ctx.beginPath();
    ctx.moveTo(pBL.x, pBL.y);
    ctx.lineTo(pBR.x, pBR.y);
    ctx.lineTo(pBR.x, pBR.y + thickness);
    ctx.lineTo(pBL.x, pBL.y + thickness);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#060c1a';
    ctx.beginPath();
    ctx.moveTo(pBR.x, pBR.y);
    ctx.lineTo(pTR.x, pTR.y);
    ctx.lineTo(pTR.x, pTR.y + thickness);
    ctx.lineTo(pBR.x, pBR.y + thickness);
    ctx.closePath();
    ctx.fill();

    // Subtle rim highlight along lower slab
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pBL.x, pBL.y + thickness);
    ctx.lineTo(pBR.x, pBR.y + thickness);
    ctx.lineTo(pTR.x, pTR.y + thickness);
    ctx.stroke();

    // Arena main surface
    this._drawPoly(ctx, bf, w, h, [[0, 0], [W, 0], [W, H], [0, H]]);
    const floorGrad = ctx.createLinearGradient(pBL.x, pTR.y, pTR.x, pBL.y);
    floorGrad.addColorStop(0, '#0f203d');
    floorGrad.addColorStop(0.48, '#132645');
    floorGrad.addColorStop(1, '#1c1d38');
    ctx.fillStyle = floorGrad;
    ctx.fill();

    // Enemy Deployment Region (RIGHT)
    const er = bf.regions.enemy;
    this._drawPoly(ctx, bf, w, h, [
      [er.minX, er.minY],
      [er.maxX, er.minY],
      [er.maxX, er.maxY],
      [er.minX, er.maxY],
    ]);
    ctx.fillStyle = 'rgba(248, 113, 113, 0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Isometric tactical grid lines (every 10 world units)
    ctx.strokeStyle = 'rgba(148, 179, 214, 0.085)';
    ctx.lineWidth = 1;
    for (let x = 10; x < W; x += 10) {
      const a = bf.worldToScreen(x, 0, w, h);
      const b = bf.worldToScreen(x, H, w, h);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (let y = 10; y < H; y += 10) {
      const a = bf.worldToScreen(0, y, w, h);
      const b = bf.worldToScreen(W, y, w, h);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Center celestial meridian + diamond compass marker
    const midTop = bf.worldToScreen(W * 0.5, 4, w, h);
    const midBot = bf.worldToScreen(W * 0.5, H - 4, w, h);
    const midCenter = bf.worldToScreen(W * 0.5, H * 0.5, w, h);
    ctx.save();
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = 'rgba(226, 183, 91, 0.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(midTop.x, midTop.y);
    ctx.lineTo(midBot.x, midBot.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(226, 183, 91, 0.22)';
    ctx.beginPath();
    ctx.ellipse(midCenter.x, midCenter.y, 24, 12, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Arena crisp outer border + corner ticks
    this._drawPoly(ctx, bf, w, h, [[0, 0], [W, 0], [W, H], [0, H]]);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.48)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Corner starlight vertices
    ctx.fillStyle = 'rgba(226, 183, 91, 0.72)';
    for (const pt of [pTL, pTR, pBR, pBL]) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle zone labels
    const fr = bf.regions.friendly;
    const allyLbl = bf.worldToScreen((fr.minX + fr.maxX) * 0.5, fr.maxY + 4, w, h);
    const enemyLbl = bf.worldToScreen((er.minX + er.maxX) * 0.5, er.maxY + 4, w, h);
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.78)';
    ctx.fillText('ALLY ZONE', allyLbl.x, allyLbl.y);
    ctx.fillStyle = 'rgba(248, 113, 113, 0.78)';
    ctx.fillText('ENEMY ZONE', enemyLbl.x, enemyLbl.y);
  }

  _drawDynamicArenaOverlays(ctx, bf, w, h, phase, elapsed, activeTactic) {
    // Friendly Deployment Region dynamic pulse (highlights during Preparation or when unit card selected)
    const fr = bf.regions.friendly;
    const cardSelected = this._state?.battle?.selectedCardSlot !== -1;
    const emphasize = phase === 'preparation' || cardSelected;
    this._drawPoly(ctx, bf, w, h, [
      [fr.minX, fr.minY],
      [fr.maxX, fr.minY],
      [fr.maxX, fr.maxY],
      [fr.minX, fr.maxY],
    ]);
    const prepPulse = emphasize ? 0.14 + Math.sin(elapsed * 3.2) * 0.05 : 0.075;
    ctx.fillStyle = `rgba(56, 189, 248, ${prepPulse.toFixed(3)})`;
    ctx.fill();
    ctx.strokeStyle = emphasize ? 'rgba(56, 189, 248, 0.78)' : 'rgba(56, 189, 248, 0.26)';
    ctx.lineWidth = emphasize ? 1.8 : 1;
    ctx.stroke();

    // Subtle arena rim glow when a Tactic card is active
    if (activeTactic && activeTactic.remaining > 0) {
      const W = bf.worldWidth;
      const H = bf.worldHeight;
      this._drawPoly(ctx, bf, w, h, [[0, 0], [W, 0], [W, H], [0, H]]);
      ctx.save();
      ctx.strokeStyle = activeTactic.color || '#f59e0b';
      ctx.globalAlpha = 0.25 + Math.sin(elapsed * 5) * 0.12;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawGroundFeatures(ctx, bf, w, h, elapsed) {
    for (let i = 0; i < bf.features.length; i += 1) {
      const feat = bf.features[i];
      if (feat.type === 'blocked') {
        const x1 = feat.x;
        const y1 = feat.y;
        const x2 = feat.x + (feat.width || 8);
        const y2 = feat.y + (feat.height || 8);
        this._drawPoly(ctx, bf, w, h, [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]);
        ctx.fillStyle = '#04070f';
        ctx.fill();
        ctx.strokeStyle = 'rgba(248, 113, 113, 0.58)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const c = bf.worldToScreen((x1 + x2) * 0.5, (y1 + y2) * 0.5, w, h);
        ctx.fillStyle = `rgba(167, 139, 250, ${(0.22 + Math.sin(elapsed * 3) * 0.08).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 13, 6.5, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (feat.type === 'decorative') {
        const c = bf.worldToScreen(feat.x, feat.y, w, h);
        const rx = (feat.radius || 6) * c.scale * 0.85;
        const ry = (feat.radius || 6) * c.scale * 0.45;
        ctx.save();
        ctx.strokeStyle = 'rgba(226, 183, 91, 0.26)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, rx * 0.62, ry * 0.62, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  _drawObstacle(ctx, bf, w, h, feat) {
    const x1 = feat.x;
    const y1 = feat.y;
    const x2 = feat.x + (feat.width || 6);
    const y2 = feat.y + (feat.height || 6);
    const elev = 7.5;

    const b1 = bf.worldToScreen(x2, y1, w, h, 0);
    const b2 = bf.worldToScreen(x2, y2, w, h, 0);
    const b3 = bf.worldToScreen(x1, y2, w, h, 0);

    const t0 = bf.worldToScreen(x1, y1, w, h, elev);
    const t1 = bf.worldToScreen(x2, y1, w, h, elev);
    const t2 = bf.worldToScreen(x2, y2, w, h, elev);
    const t3 = bf.worldToScreen(x1, y2, w, h, elev);

    ctx.save();
    ctx.fillStyle = '#182947';
    ctx.beginPath();
    ctx.moveTo(b3.x, b3.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.lineTo(t2.x, t2.y);
    ctx.lineTo(t3.x, t3.y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#0f1c33';
    ctx.beginPath();
    ctx.moveTo(b2.x, b2.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.lineTo(t1.x, t1.y);
    ctx.lineTo(t2.x, t2.y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#253e66';
    ctx.beginPath();
    ctx.moveTo(t0.x, t0.y);
    ctx.lineTo(t1.x, t1.y);
    ctx.lineTo(t2.x, t2.y);
    ctx.lineTo(t3.x, t3.y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.52)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const tc = bf.worldToScreen((x1 + x2) * 0.5, (y1 + y2) * 0.5, w, h, elev);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.beginPath();
    ctx.ellipse(tc.x, tc.y, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawTelegraphs(ctx, bf, w, h, telegraphs) {
    for (let i = 0; i < telegraphs.length; i += 1) {
      const tg = telegraphs[i];
      const p = bf.worldToScreen(tg.x, tg.y, w, h);
      const progress = Math.min(1, tg.elapsed / Math.max(0.05, tg.duration));
      const rx = tg.radius * p.scale * 0.85;
      const ry = tg.radius * p.scale * 0.46;
      const color = tg.color || '#f87171';

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Inner expanding warning fill
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.14 + progress * 0.18;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx * progress, ry * progress, 0, 0, Math.PI * 2);
      ctx.fill();

      // Inner progress ring edge
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx * progress, ry * progress, 0, 0, Math.PI * 2);
      ctx.stroke();

      if (tg.label) {
        ctx.globalAlpha = 0.95;
        ctx.font = '700 9.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#070c17';
        ctx.fillText(tg.label, p.x + 1, p.y - ry * 0.35 + 1);
        ctx.fillStyle = '#fde68a';
        ctx.fillText(tg.label, p.x, p.y - ry * 0.35);
      }
      ctx.restore();
    }
  }

  _drawUnit(ctx, bf, w, h, unit, elapsed, { isSelectedPrep = false, isFocusMarked = false }) {
    const p = bf.worldToScreen(unit.x, unit.y, w, h);
    const isAlly = unit.side === 'ally';
    const isDead = unit.state === UNIT_STATES.DEAD;
    const isMoving = unit.state === UNIT_STATES.MOVING;
    const isCasting = unit.state === UNIT_STATES.CASTING;
    const scale = (unit.visualScale || 1) * Math.max(0.75, Math.min(1.25, p.scale / 7.2));
    const spriteSize = 42 * scale;

    const phase = unit.phase || 0;
    const walkBob = isMoving
      ? Math.abs(Math.sin(elapsed * 9.5 + phase)) * 4.0
      : Math.sin(elapsed * 3.4 + phase) * 1.1;
    const strideTilt = isMoving
      ? Math.sin(elapsed * 9.5 + phase) * 0.065 * unit.facing
      : 0;

    const lungeRatio = unit.attackAnim > 0 ? Math.sin((unit.attackAnim / 0.24) * Math.PI) : 0;
    const lunge = lungeRatio * 8 * unit.facing;
    const attackTilt = lungeRatio * 0.14 * unit.facing;
    const deathProgress = isDead ? Math.min(1, unit.deathTimer / 0.45) : 0;
    const deathAlpha = isDead ? Math.max(0, 1 - deathProgress) : 1;

    ctx.save();
    ctx.globalAlpha = deathAlpha;

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 2, 13.5 * scale, 6.2 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Team / Role Ground Ring
    const ringColor = unit.isBoss
      ? unit.auraColor || '#e2b75b'
      : unit.isElite
        ? '#c084fc'
        : isAlly
          ? unit.tier >= 3
            ? '#e2b75b'
            : '#38bdf8'
          : unit.tintColor || '#f87171';
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = unit.isBoss ? 2.6 : isSelectedPrep ? 2.4 : unit.tier >= 3 ? 2 : 1.5;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 1, 14.5 * scale, 7.2 * scale, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Boss outer rotating rune aura
    if (unit.isBoss && !isDead) {
      const pulseR = (20 + Math.sin(elapsed * 4) * 2.2) * scale;
      ctx.save();
      ctx.strokeStyle = unit.auraColor || '#e2b75b';
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1, pulseR, pulseR * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Casting channel glow under unit
    if (isCasting && !isDead) {
      const castR = (16 + Math.sin(elapsed * 12) * 2.5) * scale;
      ctx.save();
      ctx.strokeStyle = '#fbbf24';
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1, castR, castR * 0.52, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Selected Preparation highlight ring
    if (isSelectedPrep) {
      ctx.strokeStyle = '#e2b75b';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1, 19.5 * scale, 10 * scale, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Focus Fire target reticle
    if (isFocusMarked && !isDead) {
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 2;
      const r = 18.5 * scale + Math.sin(elapsed * 7) * 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1, r, r * 0.52, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Unit Sprite
    const drawX = p.x + lunge - (isDead ? deathProgress * 7 * unit.facing : 0);
    const drawY = p.y - spriteSize * 0.78 - walkBob + (isDead ? deathProgress * 10 : 0);
    const sprite = this._assets.getImageElement(unit.spriteAssetId);

    ctx.save();
    ctx.translate(drawX, drawY + spriteSize * 0.5);
    if (isDead) {
      ctx.rotate((isAlly ? -1 : 1) * Math.min(1.15, deathProgress * 1.25));
      ctx.scale(1 - deathProgress * 0.18, 1 - deathProgress * 0.18);
    } else {
      ctx.rotate(strideTilt + attackTilt);
    }
    if (unit.facing < 0) ctx.scale(-1, 1);

    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
      ctx.drawImage(sprite, -spriteSize * 0.5, -spriteSize * 0.5, spriteSize, spriteSize);
    } else {
      ctx.fillStyle = isAlly ? '#38bdf8' : unit.tintColor || '#f87171';
      ctx.beginPath();
      ctx.roundRect(-11 * scale, -14 * scale, 22 * scale, 28 * scale, 5);
      ctx.fill();
    }
    ctx.restore();

    // Hit flash overlay
    if (unit.hitFlash > 0 && !isDead) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.58)';
      ctx.beginPath();
      ctx.arc(drawX, drawY + spriteSize * 0.45, 13 * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    // Shield energy dome
    if (unit.shield > 0 && !isDead) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(drawX, drawY + spriteSize * 0.48, 17 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Heal glow pulse
    if (unit.healAnim > 0 && !isDead) {
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.88)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(drawX, drawY + spriteSize * 0.48, 16 * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Clean, compact status effect micro-indicators (keeps 50 units readable)
    if (!isDead && Array.isArray(unit.statusEffects) && unit.statusEffects.length > 0) {
      this._drawUnitStatusBadges(ctx, unit, drawX, drawY, spriteSize, scale, elapsed);
    }

    // Stun callout + orbiting spark
    if (unit.state === UNIT_STATES.STUNNED && !isDead) {
      const orbitX = Math.cos(elapsed * 8) * 10 * scale;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(drawX + orbitX, drawY - 12, 2.6, 0, Math.PI * 2);
      ctx.arc(drawX - orbitX, drawY - 12, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '700 9.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('STUN', drawX, drawY - 17);
    }

    // HP & Shield Bar (for living units)
    if (!isDead) {
      const barW = unit.isBoss ? 62 : unit.isElite ? 46 : 34;
      const barH = unit.isBoss ? 6 : 4.5;
      const barX = drawX - barW * 0.5;
      const barY = drawY - 7;
      const hpPct = Math.max(0, Math.min(1, unit.hp / Math.max(1, unit.maxHp)));

      ctx.fillStyle = 'rgba(5, 9, 18, 0.9)';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

      ctx.fillStyle = unit.isBoss
        ? unit.auraColor || '#e2b75b'
        : isAlly
          ? '#34d399'
          : '#f87171';
      ctx.fillRect(barX, barY, barW * hpPct, barH);

      if (unit.shield > 0) {
        const shdPct = Math.min(1, unit.shield / Math.max(1, unit.maxHp));
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(barX, barY + barH - 1.6, barW * shdPct, 1.6);
      }

      if (unit.isBoss) {
        ctx.fillStyle = unit.auraColor || '#e2b75b';
        ctx.font = '700 10px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`BOSS · ${unit.name}`, drawX, barY - 4);
      } else if (unit.isElite) {
        ctx.fillStyle = '#c084fc';
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        const modTag = unit.modifierNames?.length ? ` · ${unit.modifierNames[0]}` : '';
        ctx.fillText(`ELITE${modTag}`, drawX, barY - 4);
      } else if (unit.tier > 1) {
        ctx.fillStyle = '#e2b75b';
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(unit.tier === 3 ? 'Lv.III' : 'Lv.II', drawX, barY - 4);
      }
    }

    ctx.restore();
  }

  _drawUnitStatusBadges(ctx, unit, drawX, drawY, spriteSize, scale, elapsed) {
    let hasBuff = false;
    let hasBurn = false;
    let hasSlow = false;
    let hasShred = false;

    for (let i = 0; i < unit.statusEffects.length; i += 1) {
      const t = unit.statusEffects[i].type;
      if (t === 'burn') hasBurn = true;
      else if (t === 'debuff_slow') hasSlow = true;
      else if (t === 'debuff_defense' || t === 'debuff_attack') hasShred = true;
      else if (t.startsWith('buff_')) hasBuff = true;
    }

    if (hasSlow) {
      ctx.strokeStyle = 'rgba(129, 140, 248, 0.72)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(drawX, drawY + spriteSize * 0.76, 13 * scale, 5.5 * scale, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (hasBurn) {
      const emberY = drawY + spriteSize * 0.35 - Math.abs(Math.sin(elapsed * 10 + (unit.phase || 0))) * 5;
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(drawX + 9 * scale, emberY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Upward gold chevron for active tactical buff; downward crimson chevron for armor shred
    if (hasBuff) {
      const bx = drawX + 14 * scale;
      const by = drawY + 2;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(bx - 3, by + 2);
      ctx.lineTo(bx, by - 2);
      ctx.lineTo(bx + 3, by + 2);
      ctx.stroke();
    }

    if (hasShred) {
      const dx = drawX - 14 * scale;
      const dy = drawY + 2;
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(dx - 3, dy - 2);
      ctx.lineTo(dx, dy + 2);
      ctx.lineTo(dx + 3, dy - 2);
      ctx.stroke();
    }
  }

  _drawProjectiles(ctx, bf, w, h, projectiles) {
    for (let i = 0; i < projectiles.length; i += 1) {
      const proj = projectiles[i];
      const p = bf.worldToScreen(proj.x, proj.y, w, h, proj.z || 2);
      const radius =
        proj.kind === 'aoe'
          ? 5.6
          : proj.kind === 'healing' || proj.kind === 'shield'
            ? 4.6
            : 3.6;
      const color = proj.color || '#38bdf8';

      // Directional comet tail from start/target trajectory
      const dx = (proj.targetX ?? proj.x) - proj.x;
      const dy = (proj.targetY ?? proj.y) - proj.y;
      const len = Math.hypot(dx, dy) || 1;
      const tailWx = proj.x - (dx / len) * 4.5;
      const tailWy = proj.y - (dy / len) * 4.5;
      const tailP = bf.worldToScreen(tailWx, tailWy, w, h, Math.max(1, (proj.z || 2) - 0.5));

      ctx.save();
      const trailGrad = ctx.createLinearGradient(tailP.x, tailP.y, p.x, p.y);
      trailGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      trailGrad.addColorStop(1, color);
      ctx.strokeStyle = trailGrad;
      ctx.lineWidth = radius * 1.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tailP.x, tailP.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      // Glow halo
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * 2.1, 0, Math.PI * 2);
      ctx.fill();

      // Crisp core
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * 0.65, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawWorldEffects(ctx, bf, w, h, layer) {
    const effects = this._anim.getWorldEffects();
    const skyKinds = new Set(['starfall', 'volley', 'tempest', 'sanctuary', 'bastion', 'slash', 'lightning', 'lance']);

    for (let i = 0; i < effects.length; i += 1) {
      const fx = effects[i];
      const t = Math.min(1, fx.age / Math.max(0.05, fx.duration));
      const alpha = Math.max(0, 1 - t);
      const isSky = skyKinds.has(fx.kind);

      if (layer === 'sky' && !isSky) continue;
      if (layer === 'ground' && isSky) continue;

      if (fx.kind === 'slash') {
        const p = bf.worldToScreen(fx.x, fx.y, w, h, 3.5);
        ctx.save();
        ctx.globalAlpha = alpha * 0.9;
        ctx.translate(p.x, p.y);
        ctx.rotate(fx.angle || 0);
        ctx.strokeStyle = fx.color || '#38bdf8';
        ctx.lineWidth = 3 * (1 - t * 0.5);
        ctx.beginPath();
        ctx.arc(0, 0, (fx.radius || 4.5) * 3.2 + t * 5, -0.95, 0.95);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, (fx.radius || 4.5) * 2.8 + t * 4, -0.75, 0.75);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      if (fx.kind === 'lightning' && fx.x2 !== null && fx.y2 !== null) {
        const p1 = bf.worldToScreen(fx.x, fx.y, w, h, 4);
        const p2 = bf.worldToScreen(fx.x2, fx.y2, w, h, 4);
        const midX = (p1.x + p2.x) * 0.5 + (Math.sin(t * 24) * 10);
        const midY = (p1.y + p2.y) * 0.5 - 12;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = fx.color || '#22d3ee';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(midX, midY);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.restore();
        continue;
      }

      if (fx.kind === 'lance') {
        const p = bf.worldToScreen(fx.x, fx.y, w, h);
        ctx.save();
        ctx.globalAlpha = alpha * 0.92;
        const beamW = 14 * (1 - t * 0.65);
        const grad = ctx.createLinearGradient(p.x, 0, p.x, p.y);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.55, fx.color || '#f97316');
        grad.addColorStop(1, '#ffffff');
        ctx.fillStyle = grad;
        ctx.fillRect(p.x - beamW * 0.5, 0, beamW, p.y);
        ctx.strokeStyle = fx.color || '#f97316';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 12 + t * 28, (12 + t * 28) * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      if (fx.kind === 'starfall' || fx.kind === 'volley') {
        const isVolley = fx.kind === 'volley';
        const beamCoords = isVolley
          ? [[56, 26], [68, 44], [78, 30], [64, 68], [82, 56], [72, 78]]
          : [[32, 30], [55, 45], [74, 34], [62, 70], [82, 60]];
        ctx.save();
        ctx.globalAlpha = alpha * 0.88;
        for (let b = 0; b < beamCoords.length; b += 1) {
          const bp = bf.worldToScreen(beamCoords[b][0], beamCoords[b][1], w, h);
          const tiltX = isVolley ? -42 : 0;
          const grad = ctx.createLinearGradient(bp.x + tiltX, 0, bp.x, bp.y);
          grad.addColorStop(0, 'rgba(226, 183, 91, 0)');
          grad.addColorStop(0.5, fx.color || '#e2b75b');
          grad.addColorStop(1, '#ffffff');
          ctx.strokeStyle = grad;
          ctx.lineWidth = (isVolley ? 11 : 18) * (1 - t * 0.6);
          ctx.beginPath();
          ctx.moveTo(bp.x + tiltX, 0);
          ctx.lineTo(bp.x, bp.y);
          ctx.stroke();

          ctx.strokeStyle = fx.color || '#e2b75b';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(bp.x, bp.y, 14 + t * 32, (14 + t * 32) * 0.5, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }

      if (fx.kind === 'tempest' || fx.kind === 'sanctuary' || fx.kind === 'bastion') {
        const center = bf.worldToScreen(50, 50, w, h);
        const maxR = Math.max(w, h) * 0.58;
        const r = 36 + t * maxR;
        ctx.save();
        ctx.globalAlpha = alpha * 0.82;
        ctx.strokeStyle = fx.color || '#38bdf8';
        ctx.lineWidth = 4 * (1 - t * 0.5);
        ctx.beginPath();
        ctx.ellipse(center.x, center.y, r, r * 0.48, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(center.x, center.y, r * 0.78, r * 0.37, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      // Ground layer effects: ring, heal_wave, deploy, death, boss_entrance, tactic_pulse
      const p = bf.worldToScreen(fx.x, fx.y, w, h);
      const r = fx.radius * p.scale * (0.3 + t * 0.78);
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = fx.color || '#38bdf8';
      ctx.lineWidth = fx.kind === 'boss_entrance' ? 3.5 : fx.kind === 'heal_wave' || fx.kind === 'tactic_pulse' ? 3 : 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r * 0.88, r * 0.48, 0, 0, Math.PI * 2);
      ctx.stroke();

      if (fx.kind === 'boss_entrance' || fx.kind === 'deploy') {
        ctx.strokeStyle = fx.secondaryColor || '#e2b75b';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r * 0.58, r * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = fx.color || '#38bdf8';
      ctx.globalAlpha = alpha * 0.14;
      ctx.fill();
      ctx.restore();
    }
  }

  _drawFloatingTexts(ctx, bf, w, h) {
    const texts = this._anim.getFloatingTexts();
    for (let i = 0; i < texts.length; i += 1) {
      const item = texts[i];
      const p = bf.worldToScreen(item.x, item.y, w, h, item.z);
      const progress = item.age / Math.max(0.1, item.duration);
      const alpha = Math.max(0, 1 - progress * progress);
      const popScale = item.isCrit && progress < 0.2 ? 1 + (0.2 - progress) * 1.4 : 1;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      if (popScale !== 1) ctx.scale(popScale, popScale);
      ctx.font = item.isCrit
        ? '700 14px "JetBrains Mono", monospace'
        : '600 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#050912';
      ctx.fillText(item.text, 1, 1);
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, 0, 0);
      ctx.restore();
    }
  }

  _drawDebugOverlay(ctx, bf, w, h, units) {
    ctx.save();
    const byUid = new Map(units.map((u) => [u.uid, u]));

    for (let i = 0; i < units.length; i += 1) {
      const u = units[i];
      if (u.state === UNIT_STATES.DEAD) continue;
      const p = bf.worldToScreen(u.x, u.y, w, h);

      ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, u.collisionRadius * p.scale * 0.85, u.collisionRadius * p.scale * 0.46, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = u.side === 'ally' ? 'rgba(56, 189, 248, 0.22)' : 'rgba(248, 113, 113, 0.22)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, u.attackRange * p.scale * 0.85, u.attackRange * p.scale * 0.46, 0, 0, Math.PI * 2);
      ctx.stroke();

      if (u.path && u.path.length > 0) {
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.7)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        for (const wp of u.path) {
          const sp = bf.worldToScreen(wp.x, wp.y, w, h);
          ctx.lineTo(sp.x, sp.y);
        }
        ctx.stroke();
      }

      if (u.targetUid && byUid.has(u.targetUid)) {
        const tgt = byUid.get(u.targetUid);
        const tp = bf.worldToScreen(tgt.x, tgt.y, w, h);
        ctx.strokeStyle = u.targetMode === 'heal' ? '#34d399' : '#f472b6';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 12);
        ctx.lineTo(tp.x, tp.y - 12);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.fillStyle = 'rgba(7, 12, 23, 0.82)';
      ctx.fillRect(p.x - 44, p.y + 9, 88, 22);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '500 8.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${u.state} (${u.x.toFixed(0)},${u.y.toFixed(0)})`, p.x, p.y + 18);
      ctx.fillText(`HP ${Math.round(u.hp)}/${u.maxHp}`, p.x, p.y + 28);
    }

    const b = this._state.battle;
    ctx.fillStyle = 'rgba(7, 12, 23, 0.86)';
    ctx.fillRect(10, 10, 210, 52);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, 210, 52);
    ctx.fillStyle = '#fbbf24';
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`DEBUG · Phase: ${b.phase}`, 18, 26);
    ctx.fillStyle = '#edf2fa';
    ctx.fillText(`Wave ${b.waveIndex}/${b.totalWaves} · E:${Math.floor(b.energy)}/${b.maxEnergy} · U:${Math.floor(b.ultimateEnergy)}`, 18, 42);
    ctx.fillText(`Units Ally:${b.friendlyCount}/25 Enemy:${b.enemyCount}/25`, 18, 55);
    ctx.restore();
  }
}
