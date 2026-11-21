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

export const TERRAIN_THEMES = Object.freeze({
  orbital_bastion: {
    label: 'Celestial Citadel',
    backdropInner: 'rgba(28, 44, 78, 0.72)',
    backdropMid: 'rgba(11, 20, 40, 0.9)',
    backdropOuter: '#060a14',
    slabFront: '#131d36',
    slabSide: '#0a1021',
    slabRim: 'rgba(226, 183, 91, 0.34)',
    floorStops: ['#162442', '#1c2d50', '#242544'],
    gridColor: 'rgba(226, 198, 134, 0.09)',
    borderColor: 'rgba(226, 183, 91, 0.52)',
    cornerColor: '#f3d284',
    sigilPrimary: 'rgba(226, 183, 91, 0.34)',
    sigilSecondary: 'rgba(125, 211, 252, 0.24)',
    sigilStyle: 'celestial_compass',
    obstacleLeft: '#263455',
    obstacleRight: '#18233d',
    obstacleTop: '#384c76',
    obstacleEdge: 'rgba(226, 183, 91, 0.62)',
    obstacleCrest: 'rgba(243, 210, 132, 0.6)',
    riftGlow: 'rgba(125, 211, 252, 0.28)',
    particles: ['#f3d284', '#f8fafc', '#7dd3fc'],
  },
  azure_relay: {
    label: 'Azure Leyline',
    backdropInner: 'rgba(12, 56, 78, 0.74)',
    backdropMid: 'rgba(7, 24, 38, 0.9)',
    backdropOuter: '#040c14',
    slabFront: '#0a2538',
    slabSide: '#061724',
    slabRim: 'rgba(45, 212, 191, 0.34)',
    floorStops: ['#0d2d45', '#10374f', '#132a47'],
    gridColor: 'rgba(94, 234, 212, 0.095)',
    borderColor: 'rgba(45, 212, 191, 0.52)',
    cornerColor: '#5eead4',
    sigilPrimary: 'rgba(45, 212, 191, 0.34)',
    sigilSecondary: 'rgba(56, 189, 248, 0.28)',
    sigilStyle: 'leyline_lattice',
    obstacleLeft: '#14445c',
    obstacleRight: '#0c2c3d',
    obstacleTop: '#1f617f',
    obstacleEdge: 'rgba(94, 234, 212, 0.65)',
    obstacleCrest: 'rgba(94, 234, 212, 0.65)',
    riftGlow: 'rgba(45, 212, 191, 0.3)',
    particles: ['#5eead4', '#38bdf8', '#e0f2fe'],
  },
  obsidian_spire: {
    label: 'Obsidian Sanctum',
    backdropInner: 'rgba(46, 20, 68, 0.74)',
    backdropMid: 'rgba(17, 10, 29, 0.92)',
    backdropOuter: '#08050f',
    slabFront: '#1b112b',
    slabSide: '#10091c',
    slabRim: 'rgba(192, 132, 252, 0.36)',
    floorStops: ['#1b132c', '#241838', '#2c152d'],
    gridColor: 'rgba(192, 132, 252, 0.09)',
    borderColor: 'rgba(192, 132, 252, 0.5)',
    cornerColor: '#e879f9',
    sigilPrimary: 'rgba(192, 132, 252, 0.36)',
    sigilSecondary: 'rgba(244, 114, 182, 0.24)',
    sigilStyle: 'arcane_hexagram',
    obstacleLeft: '#2a1c42',
    obstacleRight: '#1a102b',
    obstacleTop: '#3d285e',
    obstacleEdge: 'rgba(216, 180, 254, 0.62)',
    obstacleCrest: 'rgba(232, 121, 249, 0.65)',
    riftGlow: 'rgba(192, 132, 252, 0.36)',
    particles: ['#c084fc', '#f472b6', '#e9d5ff'],
  },
  cavalry_plains: {
    label: 'Tempest Steppe',
    backdropInner: 'rgba(20, 58, 52, 0.72)',
    backdropMid: 'rgba(11, 28, 28, 0.9)',
    backdropOuter: '#061010',
    slabFront: '#152e2b',
    slabSide: '#0c1c1a',
    slabRim: 'rgba(110, 231, 183, 0.32)',
    floorStops: ['#163430', '#1d3d35', '#2b3329'],
    gridColor: 'rgba(167, 243, 208, 0.085)',
    borderColor: 'rgba(52, 211, 153, 0.48)',
    cornerColor: '#fcd34d',
    sigilPrimary: 'rgba(252, 211, 77, 0.32)',
    sigilSecondary: 'rgba(52, 211, 153, 0.28)',
    sigilStyle: 'windstep_banners',
    obstacleLeft: '#2d473d',
    obstacleRight: '#1b2e27',
    obstacleTop: '#426152',
    obstacleEdge: 'rgba(252, 211, 77, 0.56)',
    obstacleCrest: 'rgba(110, 231, 183, 0.55)',
    riftGlow: 'rgba(52, 211, 153, 0.28)',
    particles: ['#6ee7b7', '#fde68a', '#ecfdf5'],
  },
  chrono_nexus: {
    label: 'Astral Sundial',
    backdropInner: 'rgba(56, 42, 24, 0.68)',
    backdropMid: 'rgba(17, 18, 34, 0.9)',
    backdropOuter: '#080912',
    slabFront: '#221e2b',
    slabSide: '#14111b',
    slabRim: 'rgba(251, 191, 36, 0.38)',
    floorStops: ['#1c213b', '#27263d', '#312633'],
    gridColor: 'rgba(251, 191, 36, 0.095)',
    borderColor: 'rgba(251, 191, 36, 0.55)',
    cornerColor: '#fde68a',
    sigilPrimary: 'rgba(251, 191, 36, 0.38)',
    sigilSecondary: 'rgba(167, 139, 250, 0.26)',
    sigilStyle: 'chrono_astrolabe',
    obstacleLeft: '#3a3242',
    obstacleRight: '#241f2b',
    obstacleTop: '#544658',
    obstacleEdge: 'rgba(251, 191, 36, 0.66)',
    obstacleCrest: 'rgba(253, 230, 138, 0.68)',
    riftGlow: 'rgba(251, 191, 36, 0.32)',
    particles: ['#fbbf24', '#c4b5fd', '#fef3c7'],
  },
  hyperion_throne: {
    label: 'Ironforge Dreadnought',
    backdropInner: 'rgba(72, 28, 18, 0.72)',
    backdropMid: 'rgba(26, 13, 14, 0.92)',
    backdropOuter: '#0d0607',
    slabFront: '#2a1816',
    slabSide: '#180d0c',
    slabRim: 'rgba(251, 146, 60, 0.38)',
    floorStops: ['#251c22', '#2f1e1f', '#381c1a'],
    gridColor: 'rgba(251, 146, 60, 0.095)',
    borderColor: 'rgba(251, 146, 60, 0.56)',
    cornerColor: '#fdba74',
    sigilPrimary: 'rgba(251, 146, 60, 0.38)',
    sigilSecondary: 'rgba(248, 113, 113, 0.28)',
    sigilStyle: 'ironforge_core',
    obstacleLeft: '#402826',
    obstacleRight: '#291918',
    obstacleTop: '#593732',
    obstacleEdge: 'rgba(251, 146, 60, 0.68)',
    obstacleCrest: 'rgba(251, 146, 60, 0.72)',
    riftGlow: 'rgba(249, 115, 22, 0.34)',
    particles: ['#fb923c', '#fbbf24', '#fca5a5'],
  },
});

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
    this._lastDaisRect = null;
  }

  _getTheme(bf) {
    return TERRAIN_THEMES[bf?.theme] || TERRAIN_THEMES.orbital_bastion;
  }

  setBattlefield(battlefield) {
    this._battlefield = battlefield;
    this._floorCacheKey = '';
    const theme = this._getTheme(battlefield);
    this._particles?.seedAmbient(
      this._width,
      this._height,
      this._state?.settings?.graphicsQuality || 'high',
      theme.particles,
    );
  }

  setDebugMode(enabled) {
    this._debugMode = Boolean(enabled);
  }

  attach(canvas) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._floorCacheKey = '';
    this.resize();
    const theme = this._getTheme(this._battlefield);
    this._particles?.seedAmbient(
      this._width,
      this._height,
      this._state.settings.graphicsQuality,
      theme.particles,
    );
  }

  detach() {
    this._canvas = null;
    this._ctx = null;
    this._floorCache = null;
    this._floorCacheKey = '';
    this._lastDaisRect = null;
  }

  hitTestCommanderDais(screenX, screenY) {
    const r = this._lastDaisRect;
    if (!r) return false;
    return (
      screenX >= r.x &&
      screenX <= r.x + r.width &&
      screenY >= r.y &&
      screenY <= r.y + r.height
    );
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
    const key = `${stageId || 'default'}_${bf.terrainId || 'std'}_${bf.theme || 'orbital_bastion'}_${w}x${h}_${this._dpr}`;
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
    commander = null,
    ultimateEnergy = 0,
    pointerWorld = null,
    hoverDais = false,
    selectedCard = null,
  }) {
    if (!this._ctx || !this._canvas) return;
    const bf = battlefield || this._battlefield;
    if (!bf) return;

    const ctx = this._ctx;
    const w = this._width;
    const h = this._height;
    const shake = this._anim.getShakeOffset();
    const elapsed = this._anim.getElapsed();
    const theme = this._getTheme(bf);

    ctx.save();
    ctx.scale(this._dpr, this._dpr);
    ctx.translate(shake.x, shake.y);

    // 1. Realm-themed atmospheric backdrop + subtle stage art
    const bgImg = stage ? this._assets.getImageElement(stage.backgroundAssetId) : null;
    if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
      ctx.globalAlpha = 0.24;
      ctx.drawImage(bgImg, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    const backdrop = ctx.createRadialGradient(w * 0.5, h * 0.34, 40, w * 0.5, h * 0.52, w * 0.74);
    backdrop.addColorStop(0, theme.backdropInner);
    backdrop.addColorStop(0.55, theme.backdropMid);
    backdrop.addColorStop(1, theme.backdropOuter);
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, w, h);

    // 2. Ambient realm motes behind arena
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
    this._drawDynamicArenaOverlays(ctx, bf, w, h, phase, elapsed, activeTactic, selectedCard);

    // 4. Decorative & Blocked Ground Terrain Features
    this._drawGroundFeatures(ctx, bf, w, h, elapsed);

    // 4b. Off-Field Commander Dais (interactive & distinct presence flanking the Ally Zone)
    if (commander) {
      this._drawCommanderDais(ctx, bf, w, h, commander, ultimateEnergy, elapsed, hoverDais);
    } else {
      this._lastDaisRect = null;
    }

    // 5. Boss/Skill Telegraphs on the ground plane
    this._drawTelegraphs(ctx, bf, w, h, telegraphs);

    // 6. Ground World Effects (rings, heal waves, deploy seals, tactic pulses, boss entrance)
    this._drawWorldEffects(ctx, bf, w, h, 'ground');

    // 6b. Live tactical targeting reticle for Unit deployment, AoE Skills, or Prep positioning
    if (pointerWorld) {
      this._drawTargetingReticle(ctx, bf, w, h, phase, pointerWorld, selectedCard, selectedPrepUnitUid, elapsed);
    }

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
    const theme = this._getTheme(bf);

    const pTL = bf.worldToScreen(0, 0, w, h);
    const pBL = bf.worldToScreen(0, H, w, h);
    const pBR = bf.worldToScreen(W, H, w, h);
    const pTR = bf.worldToScreen(W, 0, w, h);
    const thickness = 14;

    // Platform slab bevels
    ctx.fillStyle = theme.slabFront;
    ctx.beginPath();
    ctx.moveTo(pBL.x, pBL.y);
    ctx.lineTo(pBR.x, pBR.y);
    ctx.lineTo(pBR.x, pBR.y + thickness);
    ctx.lineTo(pBL.x, pBL.y + thickness);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = theme.slabSide;
    ctx.beginPath();
    ctx.moveTo(pBR.x, pBR.y);
    ctx.lineTo(pTR.x, pTR.y);
    ctx.lineTo(pTR.x, pTR.y + thickness);
    ctx.lineTo(pBR.x, pBR.y + thickness);
    ctx.closePath();
    ctx.fill();

    // Rim highlight along lower slab
    ctx.strokeStyle = theme.slabRim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pBL.x, pBL.y + thickness);
    ctx.lineTo(pBR.x, pBR.y + thickness);
    ctx.lineTo(pTR.x, pTR.y + thickness);
    ctx.stroke();

    // Arena main surface
    this._drawPoly(ctx, bf, w, h, [[0, 0], [W, 0], [W, H], [0, H]]);
    const floorGrad = ctx.createLinearGradient(pBL.x, pTR.y, pTR.x, pBL.y);
    floorGrad.addColorStop(0, theme.floorStops[0]);
    floorGrad.addColorStop(0.48, theme.floorStops[1]);
    floorGrad.addColorStop(1, theme.floorStops[2]);
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
    ctx.strokeStyle = theme.gridColor;
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

    // Center meridian + realm-specific centerpiece sigil
    const midTop = bf.worldToScreen(W * 0.5, 4, w, h);
    const midBot = bf.worldToScreen(W * 0.5, H - 4, w, h);
    const midCenter = bf.worldToScreen(W * 0.5, H * 0.5, w, h);
    ctx.save();
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = theme.sigilPrimary;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(midTop.x, midTop.y);
    ctx.lineTo(midBot.x, midBot.y);
    ctx.stroke();
    ctx.setLineDash([]);

    this._drawRealmCenterpiece(ctx, bf, w, h, midCenter, theme);
    ctx.restore();

    // Arena crisp outer border
    this._drawPoly(ctx, bf, w, h, [[0, 0], [W, 0], [W, H], [0, H]]);
    ctx.strokeStyle = theme.borderColor;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Corner vertices
    ctx.fillStyle = theme.cornerColor;
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

  _drawRealmCenterpiece(ctx, bf, w, h, center, theme) {
    ctx.strokeStyle = theme.sigilPrimary;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, 28, 14, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = theme.sigilSecondary;
    ctx.lineWidth = 1;

    if (theme.sigilStyle === 'arcane_hexagram') {
      // Twin opposing ritual triangles for Dark Arcane Sanctum
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        for (let k = 0; k < 3; k += 1) {
          const a = (Math.PI * 2 * k) / 3 + (dir > 0 ? 0 : Math.PI);
          const x = center.x + Math.cos(a) * 24;
          const y = center.y + Math.sin(a) * 12;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
    } else if (theme.sigilStyle === 'chrono_astrolabe') {
      // Concentric sundial rings + 8 clockwork spokes
      ctx.beginPath();
      ctx.ellipse(center.x, center.y, 40, 20, 0, 0, Math.PI * 2);
      ctx.stroke();
      for (let k = 0; k < 8; k += 1) {
        const a = (Math.PI * k) / 4;
        ctx.beginPath();
        ctx.moveTo(center.x + Math.cos(a) * 14, center.y + Math.sin(a) * 7);
        ctx.lineTo(center.x + Math.cos(a) * 38, center.y + Math.sin(a) * 19);
        ctx.stroke();
      }
    } else if (theme.sigilStyle === 'ironforge_core') {
      // Heavy riveted octagonal furnace grate
      ctx.beginPath();
      for (let k = 0; k < 8; k += 1) {
        const a = (Math.PI * k) / 4 + Math.PI / 8;
        const x = center.x + Math.cos(a) * 34;
        const y = center.y + Math.sin(a) * 17;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    } else if (theme.sigilStyle === 'windstep_banners') {
      // Sweeping twin highland wind-lane arcs
      const nArc = bf.worldToScreen(50, 26, w, h);
      const sArc = bf.worldToScreen(50, 74, w, h);
      ctx.beginPath();
      ctx.ellipse(nArc.x, nArc.y, 26, 11, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(sArc.x, sArc.y, 26, 11, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (theme.sigilStyle === 'leyline_lattice') {
      // Diamond crystal conduit lattice
      this._drawPoly(ctx, bf, w, h, [[50, 38], [62, 50], [50, 62], [38, 50]]);
      ctx.stroke();
    } else {
      // Celestial 4-point compass star
      ctx.beginPath();
      ctx.moveTo(center.x - 32, center.y);
      ctx.lineTo(center.x + 32, center.y);
      ctx.moveTo(center.x, center.y - 16);
      ctx.lineTo(center.x, center.y + 16);
      ctx.stroke();
    }
  }

  _drawDynamicArenaOverlays(ctx, bf, w, h, phase, elapsed, activeTactic, selectedCard = null) {
    // Friendly Deployment Region dynamic pulse (highlights during Preparation or when unit card selected)
    const fr = bf.regions.friendly;
    const isUnitCardSelected =
      selectedCard?.category === 'unit' ||
      (!selectedCard && this._state?.battle?.selectedCardSlot !== -1);
    const emphasize = phase === 'preparation' || isUnitCardSelected;
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

  _drawTargetingReticle(ctx, bf, w, h, phase, pointerWorld, selectedCard, selectedPrepUnitUid, elapsed) {
    if (!pointerWorld) return;
    const { x, y } = pointerWorld;
    if (x < 0 || x > bf.worldWidth || y < 0 || y > bf.worldHeight) return;

    // 1. Preparation phase: show destination anchor when moving a selected friendly unit
    if (phase === 'preparation' && selectedPrepUnitUid) {
      const valid = bf.isInsideFriendlyRegion(x, y);
      const p = bf.worldToScreen(x, y, w, h);
      ctx.save();
      ctx.strokeStyle = valid ? '#38bdf8' : '#f87171';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 18, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = valid ? '#bae6fd' : '#fecaca';
      ctx.fillText(valid ? 'PLACE HERE' : 'ALLY ZONE ONLY', p.x, p.y - 14);
      ctx.restore();
      return;
    }

    if (!selectedCard) return;

    // 2. Unit Card deployment targeting reticle
    if (selectedCard.category === 'unit') {
      const valid = bf.isInsideFriendlyRegion(x, y);
      const p = bf.worldToScreen(x, y, w, h);
      const pulse = 1 + Math.sin(elapsed * 6) * 0.08;
      ctx.save();
      ctx.strokeStyle = valid ? '#38bdf8' : '#f87171';
      ctx.fillStyle = valid ? 'rgba(56, 189, 248, 0.16)' : 'rgba(248, 113, 113, 0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 20 * pulse, 10 * pulse, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.font = '700 9.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = valid ? '#e0f2fe' : '#fecaca';
      ctx.fillText(valid ? `DEPLOY ${selectedCard.name.toUpperCase()}` : 'DEPLOY IN ALLY ZONE', p.x, p.y - 15);
      ctx.restore();
      return;
    }

    // 3. AoE Skill Card blast radius reticle
    const eff = selectedCard.effect;
    if (
      selectedCard.category === 'skill' &&
      eff &&
      (eff.kind === 'aoe_damage' || eff.kind === 'crowd_control' || eff.kind === 'aoe_debuff')
    ) {
      const tierKey = String(selectedCard.tier || 1);
      const radius = eff.radiusByTier?.[tierKey] ?? 18;
      const p = bf.worldToScreen(x, y, w, h);
      const rx = radius * p.scale * 0.85;
      const ry = radius * p.scale * 0.46;
      const color = eff.color || '#38bdf8';

      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.globalAlpha = 0.15;
      ctx.fill();

      ctx.globalAlpha = 0.95;
      ctx.font = '700 9.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#070c17';
      ctx.fillText(`CAST · ${selectedCard.name.toUpperCase()}`, p.x + 1, p.y - ry * 0.4 + 1);
      ctx.fillStyle = '#fde68a';
      ctx.fillText(`CAST · ${selectedCard.name.toUpperCase()}`, p.x, p.y - ry * 0.4);
      ctx.restore();
    }
  }

  _drawCommanderDais(ctx, bf, w, h, commander, ultimateEnergy, elapsed, hoverDais = false) {
    // Position Commander on an elevated command dais flanking the Ally Zone
    // so the Commander has unmistakable presence and can be clicked to unleash Ultimates.
    const p = bf.worldToScreen(-13.5, 44, w, h);
    const s = Math.max(0.74, Math.min(1.32, p.scale / 7.2));
    const ultPct = Math.max(0, Math.min(1, (ultimateEnergy || 0) / 100));
    const ultReady = ultPct >= 1;

    const themeColors = {
      astra: { accent: '#e6be64', glow: 'rgba(230, 190, 100, 0.42)', ring: '#f7dc94' },
      kael: { accent: '#38bdf8', glow: 'rgba(56, 189, 248, 0.42)', ring: '#7dd3fc' },
      lyra: { accent: '#34d399', glow: 'rgba(52, 211, 153, 0.42)', ring: '#6ee7b7' },
      seraphina: { accent: '#a78bfa', glow: 'rgba(167, 139, 250, 0.42)', ring: '#c4b5fd' },
      vanguard_zero: { accent: '#fb923c', glow: 'rgba(251, 146, 60, 0.42)', ring: '#fdba74' },
    };
    const palette = themeColors[commander.id] || themeColors.astra;
    const floatY = Math.sin(elapsed * 2.2) * 3.2 * s;

    // Keep dais safely inside canvas margins across all desktop resolutions
    const cardW = 68 * s;
    const cardH = 96 * s;
    const cx = Math.max(cardW * 0.5 + 16, Math.min(w - cardW * 0.5 - 16, p.x));
    const cy = Math.max(cardH + 74, Math.min(h - 170, p.y));

    const frameX = cx - cardW * 0.5;
    const frameY = cy - cardH - 10 * s + floatY;
    const cornerR = 8 * s;

    // Record interactive hit-box covering the Commander portrait + dais platform
    this._lastDaisRect = {
      x: frameX - 8 * s,
      y: frameY - 10 * s,
      width: cardW + 16 * s,
      height: cardH + 34 * s,
      cx,
      cy,
    };

    ctx.save();

    // 1. Subtle energy tether connecting Commander Dais to Ally Zone center
    const allyAnchor = bf.worldToScreen(8, 48, w, h);
    ctx.save();
    ctx.strokeStyle = palette.accent;
    ctx.globalAlpha = ultReady ? 0.34 + Math.sin(elapsed * 5) * 0.14 : 0.16;
    ctx.lineWidth = ultReady ? 2 : 1.2;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.moveTo(cx + 22 * s, cy);
    ctx.lineTo(allyAnchor.x, allyAnchor.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // 2. Ground Command Platform Shadow & Stepped Dais
    ctx.fillStyle = 'rgba(2, 6, 16, 0.65)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 5 * s, 38 * s, 16 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0c1830';
    ctx.strokeStyle = hoverDais ? '#fde68a' : palette.accent;
    ctx.lineWidth = ultReady || hoverDais ? 2.6 : 1.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 34 * s, 14.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Outer rotating rune ring (visibly distinguishes Commander from regular units)
    ctx.save();
    ctx.strokeStyle = palette.ring;
    ctx.globalAlpha = ultReady || hoverDais ? 0.88 : 0.45;
    ctx.lineWidth = ultReady || hoverDais ? 2.2 : 1.4;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, (40 + Math.sin(elapsed * 3) * 2) * s, (17.5 + Math.sin(elapsed * 3) * 0.8) * s, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Ultimate charge arc around the dais rim
    if (ultPct > 0.01) {
      ctx.save();
      ctx.strokeStyle = ultReady ? '#fde68a' : palette.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 36.5 * s, 15.8 * s, 0, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * ultPct);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Elevated Commander Portrait Frame (2.3x larger than ordinary units)
    const aura = ctx.createRadialGradient(cx, frameY + cardH * 0.5, 6 * s, cx, frameY + cardH * 0.5, cardH * (hoverDais ? 0.84 : 0.72));
    aura.addColorStop(0, palette.glow);
    aura.addColorStop(1, 'rgba(6, 11, 22, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(cx, frameY + cardH * 0.5, cardH * (hoverDais ? 0.84 : 0.72), 0, Math.PI * 2);
    ctx.fill();

    // Clipped portrait card body
    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(frameX, frameY, cardW, cardH, cornerR);
    } else {
      ctx.rect(frameX, frameY, cardW, cardH);
    }
    ctx.fillStyle = '#0a1428';
    ctx.fill();
    if (typeof ctx.clip === 'function') {
      ctx.clip();
    }

    const portrait = this._assets.getImageElement(commander.portraitAssetId);
    if (portrait && portrait.complete && portrait.naturalWidth > 0) {
      ctx.drawImage(portrait, frameX, frameY, cardW, cardH);
    } else {
      const grad = ctx.createLinearGradient(frameX, frameY, frameX, frameY + cardH);
      grad.addColorStop(0, '#16294f');
      grad.addColorStop(1, '#091122');
      ctx.fillStyle = grad;
      ctx.fillRect(frameX, frameY, cardW, cardH);
    }

    // Subtle bottom scrim inside portrait frame
    const scrim = ctx.createLinearGradient(frameX, frameY + cardH * 0.58, frameX, frameY + cardH);
    scrim.addColorStop(0, 'rgba(6, 11, 22, 0)');
    scrim.addColorStop(1, 'rgba(6, 11, 22, 0.92)');
    ctx.fillStyle = scrim;
    ctx.fillRect(frameX, frameY + cardH * 0.58, cardW, cardH * 0.42);
    ctx.restore();

    // Crisp luminous outer border around Commander portrait
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(frameX, frameY, cardW, cardH, cornerR);
    } else {
      ctx.rect(frameX, frameY, cardW, cardH);
    }
    ctx.strokeStyle = ultReady || hoverDais ? '#fde68a' : palette.accent;
    ctx.lineWidth = ultReady || hoverDais ? 2.8 : 2;
    ctx.stroke();

    // Top crest diamond
    const crestY = frameY - 2 * s;
    ctx.fillStyle = ultReady ? '#fde68a' : palette.accent;
    ctx.beginPath();
    ctx.moveTo(cx, crestY - 6 * s);
    ctx.lineTo(cx + 6 * s, crestY);
    ctx.lineTo(cx, crestY + 6 * s);
    ctx.lineTo(cx - 6 * s, crestY);
    ctx.closePath();
    ctx.fill();

    // Commander Name & Role Tag
    const labelY = frameY + cardH - 6 * s;
    ctx.font = `700 ${Math.max(8, Math.round(8.5 * s))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = ultReady ? '#fde68a' : palette.ring;
    ctx.fillText(ultReady ? 'ULT READY' : 'COMMANDER', cx, labelY - 10 * s);

    ctx.font = `700 ${Math.max(9, Math.round(10.5 * s))}px Outfit, sans-serif`;
    ctx.fillStyle = '#f8fafc';
    const shortName = (commander.name || 'Commander').split(' ')[0];
    ctx.fillText(shortName, cx, labelY);

    if (hoverDais && ultReady) {
      ctx.font = `700 ${Math.max(8, Math.round(8.5 * s))}px "JetBrains Mono", monospace`;
      ctx.fillStyle = '#fde68a';
      ctx.fillText('CLICK TO CAST', cx, frameY - 12 * s);
    }

    ctx.restore();
  }

  _drawGroundFeatures(ctx, bf, w, h, elapsed) {
    const theme = this._getTheme(bf);
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
        ctx.save();
        ctx.fillStyle = theme.riftGlow;
        ctx.globalAlpha = 0.62 + Math.sin(elapsed * 3) * 0.22;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 13, 6.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (feat.type === 'decorative') {
        const c = bf.worldToScreen(feat.x, feat.y, w, h);
        const rx = (feat.radius || 6) * c.scale * 0.85;
        const ry = (feat.radius || 6) * c.scale * 0.45;
        ctx.save();
        ctx.strokeStyle = theme.sigilPrimary;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = theme.sigilSecondary;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, rx * 0.62, ry * 0.62, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  _drawObstacle(ctx, bf, w, h, feat) {
    const theme = this._getTheme(bf);
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
    ctx.fillStyle = theme.obstacleLeft;
    ctx.beginPath();
    ctx.moveTo(b3.x, b3.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.lineTo(t2.x, t2.y);
    ctx.lineTo(t3.x, t3.y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = theme.obstacleRight;
    ctx.beginPath();
    ctx.moveTo(b2.x, b2.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.lineTo(t1.x, t1.y);
    ctx.lineTo(t2.x, t2.y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = theme.obstacleTop;
    ctx.beginPath();
    ctx.moveTo(t0.x, t0.y);
    ctx.lineTo(t1.x, t1.y);
    ctx.lineTo(t2.x, t2.y);
    ctx.lineTo(t3.x, t3.y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = theme.obstacleEdge;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const tc = bf.worldToScreen((x1 + x2) * 0.5, (y1 + y2) * 0.5, w, h, elev);
    ctx.fillStyle = theme.obstacleCrest;
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
