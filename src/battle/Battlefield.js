/**
 * Battlefield — 100x100 world-coordinate tactical arena with wide, front-facing
 * rectangular 2.5D perspective projection, logical deployment regions, and
 * data-driven terrain grid.
 *
 * All simulation calculations (movement, range, pathfinding, collision) use
 * world coordinates (0..100, 0..100). Screen coordinates are strictly for
 * rendering and pointer hit-testing.
 */

import { clamp } from '../utils/MathUtils.js';

// Front-facing rectangular 2.5D perspective projection:
// +X (friendly left -> enemy right) stays purely horizontal (zero diagonal tilt).
// +Y (north flank -> south flank) advances straight toward the camera with a
// subtle horizontal perspective taper so the far edge is ~91.5% as wide as the
// near edge — reading as a spacious, flat rectangular battlefield with subtle depth.
const PERSP_TAPER = 0.085;
const MIN_ROW_SCALE = 0.25;

export class Battlefield {
  constructor({ balance = null, terrainConfig = null } = {}) {
    const bf = balance?.battlefield || {};
    this.worldWidth = terrainConfig?.worldWidth ?? bf.worldWidth ?? 100;
    this.worldHeight = terrainConfig?.worldHeight ?? bf.worldHeight ?? 100;
    this.gridCols = bf.gridCols ?? 25;
    this.gridRows = bf.gridRows ?? 25;
    this.cellWidth = this.worldWidth / this.gridCols;
    this.cellHeight = this.worldHeight / this.gridRows;

    this.regions = {
      friendly: { minX: 4, maxX: 28, minY: 8, maxY: 92, ...(bf.friendlyRegion || {}) },
      combat: { minX: 28, maxX: 72, minY: 6, maxY: 94, ...(bf.combatRegion || {}) },
      enemy: { minX: 72, maxX: 96, minY: 8, maxY: 92, ...(bf.enemyRegion || {}) },
    };

    this.terrainId = 'default';
    this.terrainName = 'Open Arena';
    this.theme = 'orbital_bastion';
    this.features = [];
    this.grid = new Uint8Array(this.gridCols * this.gridRows); // 0 = walkable, 1 = blocked
    this.terrainVersion = 0;

    if (terrainConfig) {
      this.loadTerrain(terrainConfig);
    }
  }

  loadTerrain(terrainConfig) {
    this.terrainVersion += 1;
    this.grid.fill(0);
    this.features = [];

    if (!terrainConfig) {
      this.terrainId = 'default';
      this.terrainName = 'Open Arena';
      this.theme = 'orbital_bastion';
      return;
    }

    this.terrainId = terrainConfig.id || 'default';
    this.terrainName = terrainConfig.name || 'Tactical Arena';
    this.theme = terrainConfig.theme || 'orbital_bastion';
    if (terrainConfig.regions) {
      if (terrainConfig.regions.friendly) {
        this.regions.friendly = { ...this.regions.friendly, ...terrainConfig.regions.friendly };
      }
      if (terrainConfig.regions.combat) {
        this.regions.combat = { ...this.regions.combat, ...terrainConfig.regions.combat };
      }
      if (terrainConfig.regions.enemy) {
        this.regions.enemy = { ...this.regions.enemy, ...terrainConfig.regions.enemy };
      }
    }

    const features = Array.isArray(terrainConfig.features) ? terrainConfig.features : [];
    for (const feat of features) {
      const blocks =
        typeof feat.blocksMovement === 'boolean'
          ? feat.blocksMovement
          : feat.type === 'obstacle' || feat.type === 'blocked';
      const normalized = {
        ...feat,
        blocksMovement: blocks,
      };
      this.features.push(normalized);
      if (blocks) {
        this._rasterizeBlockingFeature(normalized);
      }
    }
  }

  _rasterizeBlockingFeature(feat) {
    for (let row = 0; row < this.gridRows; row += 1) {
      for (let col = 0; col < this.gridCols; col += 1) {
        const cx = (col + 0.5) * this.cellWidth;
        const cy = (row + 0.5) * this.cellHeight;
        if (this._pointInsideFeature(cx, cy, feat, 0.5)) {
          this.grid[row * this.gridCols + col] = 1;
        }
      }
    }
  }

  _pointInsideFeature(x, y, feat, padding = 0) {
    if (feat.shape === 'circle') {
      const r = (feat.radius || 4) + padding;
      const dx = x - feat.x;
      const dy = y - feat.y;
      return dx * dx + dy * dy <= r * r;
    }
    const minX = feat.x - padding;
    const maxX = feat.x + (feat.width || 6) + padding;
    const minY = feat.y - padding;
    const maxY = feat.y + (feat.height || 6) + padding;
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  }

  worldToCell(x, y) {
    const col = clamp(Math.floor(x / this.cellWidth), 0, this.gridCols - 1);
    const row = clamp(Math.floor(y / this.cellHeight), 0, this.gridRows - 1);
    return { col, row };
  }

  cellToWorld(col, row) {
    return {
      x: (col + 0.5) * this.cellWidth,
      y: (row + 0.5) * this.cellHeight,
    };
  }

  isCellWalkable(col, row) {
    if (col < 0 || row < 0 || col >= this.gridCols || row >= this.gridRows) return false;
    return this.grid[row * this.gridCols + col] === 0;
  }

  isWorldWalkable(x, y, radius = 0) {
    if (x < 2 || x > this.worldWidth - 2 || y < 2 || y > this.worldHeight - 2) return false;
    const { col, row } = this.worldToCell(x, y);
    if (!this.isCellWalkable(col, row)) return false;
    if (radius > 0) {
      for (const feat of this.features) {
        if (feat.blocksMovement && this._pointInsideFeature(x, y, feat, radius * 0.6)) {
          return false;
        }
      }
    }
    return true;
  }

  isInsideFriendlyRegion(x, y) {
    const r = this.regions.friendly;
    return x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY;
  }

  isInsideEnemyRegion(x, y) {
    const r = this.regions.enemy;
    return x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY;
  }

  clampToBounds(x, y, margin = 2.5) {
    return {
      x: clamp(x, margin, this.worldWidth - margin),
      y: clamp(y, margin, this.worldHeight - margin),
    };
  }

  clampToRegion(regionName, x, y) {
    const r = this.regions[regionName] || this.regions.friendly;
    return {
      x: clamp(x, r.minX, r.maxX),
      y: clamp(y, r.minY, r.maxY),
    };
  }

  /**
   * Finds the closest walkable world coordinate near (x, y), optionally constrained to a region.
   */
  findNearestWalkable(x, y, regionName = null) {
    let targetX = x;
    let targetY = y;
    if (regionName) {
      const clamped = this.clampToRegion(regionName, targetX, targetY);
      targetX = clamped.x;
      targetY = clamped.y;
    } else {
      const clamped = this.clampToBounds(targetX, targetY);
      targetX = clamped.x;
      targetY = clamped.y;
    }

    if (this.isWorldWalkable(targetX, targetY, 1.2)) {
      return { x: targetX, y: targetY };
    }

    const origin = this.worldToCell(targetX, targetY);
    for (let radius = 1; radius <= 8; radius += 1) {
      for (let dr = -radius; dr <= radius; dr += 1) {
        for (let dc = -radius; dc <= radius; dc += 1) {
          if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue;
          const col = origin.col + dc;
          const row = origin.row + dr;
          if (!this.isCellWalkable(col, row)) continue;
          const pt = this.cellToWorld(col, row);
          if (regionName === 'friendly' && !this.isInsideFriendlyRegion(pt.x, pt.y)) continue;
          if (regionName === 'enemy' && !this.isInsideEnemyRegion(pt.x, pt.y)) continue;
          return pt;
        }
      }
    }

    return { x: targetX, y: targetY };
  }

  /**
   * Resolves continuous overlap between a unit circle and solid obstacles.
   */
  resolveObstacles(x, y, radius = 2.0) {
    let rx = clamp(x, 2 + radius * 0.5, this.worldWidth - 2 - radius * 0.5);
    let ry = clamp(y, 2 + radius * 0.5, this.worldHeight - 2 - radius * 0.5);

    for (const feat of this.features) {
      if (!feat.blocksMovement) continue;
      if (feat.shape === 'circle') {
        const minDist = (feat.radius || 4) + radius;
        const dx = rx - feat.x;
        const dy = ry - feat.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq) || 0.001;
          rx = feat.x + (dx / dist) * minDist;
          ry = feat.y + (dy / dist) * minDist;
        }
      } else {
        const minX = feat.x;
        const maxX = feat.x + (feat.width || 6);
        const minY = feat.y;
        const maxY = feat.y + (feat.height || 6);
        const nearestX = clamp(rx, minX, maxX);
        const nearestY = clamp(ry, minY, maxY);
        const dx = rx - nearestX;
        const dy = ry - nearestY;
        const distSq = dx * dx + dy * dy;

        if (distSq < radius * radius) {
          if (distSq > 0.0001) {
            const dist = Math.sqrt(distSq);
            const push = radius - dist;
            rx += (dx / dist) * push;
            ry += (dy / dist) * push;
          } else {
            // Center is inside rectangle: push out via nearest edge
            const dLeft = Math.abs(rx - minX);
            const dRight = Math.abs(maxX - rx);
            const dTop = Math.abs(ry - minY);
            const dBottom = Math.abs(maxY - ry);
            const m = Math.min(dLeft, dRight, dTop, dBottom);
            if (m === dLeft) rx = minX - radius;
            else if (m === dRight) rx = maxX + radius;
            else if (m === dTop) ry = minY - radius;
            else ry = maxY + radius;
          }
        }
      }
    }

    return {
      x: clamp(rx, 2.2, this.worldWidth - 2.2),
      y: clamp(ry, 2.2, this.worldHeight - 2.2),
    };
  }

  /**
   * Computes camera projection parameters that frame a wide, front-facing
   * rectangular arena occupying the majority of the viewport while keeping
   * the top HUD, left Commander Dais, and bottom portrait card dock clear.
   */
  getProjectionParams(canvasWidth, canvasHeight) {
    const leftPad = Math.max(106, Math.min(152, canvasWidth * 0.088));
    const rightPad = Math.max(36, Math.min(68, canvasWidth * 0.036));
    const topPad = Math.max(66, Math.min(96, canvasHeight * 0.092));
    const bottomPad = Math.max(166, Math.min(216, canvasHeight * 0.218));

    const availW = Math.max(160, canvasWidth - leftPad - rightPad);
    const availH = Math.max(116, canvasHeight - topPad - bottomPad);

    // Maintain a clearly horizontal rectangular battlefield (~2.1:1 to 2.55:1)
    const arenaW = Math.min(availW, availH * 2.55);
    const arenaH = Math.min(availH * 0.92, arenaW / 2.02);

    const centerX = leftPad + availW * 0.5;
    const topY = topPad + (availH - arenaH) * 0.45;
    const scaleXBase = arenaW / this.worldWidth;
    const scaleY = arenaH / this.worldHeight;
    const scale = Math.sqrt(scaleXBase * scaleY);

    return {
      centerX,
      centerY: topY + arenaH * 0.5,
      topY,
      arenaW,
      arenaH,
      scaleXBase,
      scaleY,
      scale,
      leftPad,
      rightPad,
    };
  }

  /**
   * Projects world (wx, wy, wz) to front-facing 2.5D rectangular screen coordinates.
   * Returns { x, y, scale, scaleX, scaleY } so ground ellipses and sprites stay
   * proportion-accurate with world-coordinate distances.
   */
  worldToScreen(wx, wy, canvasWidth, canvasHeight, wz = 0) {
    const params = this.getProjectionParams(canvasWidth, canvasHeight);
    const v = wy / this.worldHeight;
    const u = (wx - this.worldWidth * 0.5) / this.worldWidth;
    const rowScale = Math.max(MIN_ROW_SCALE, 1 - PERSP_TAPER * (1 - v));
    const scaleX = params.scaleXBase * rowScale;
    const scaleY = params.scaleY;
    const scale = Math.sqrt(scaleX * scaleY);

    return {
      x: params.centerX + u * params.arenaW * rowScale,
      y: params.topY + v * params.arenaH - wz * params.scale * rowScale,
      scale,
      scaleX,
      scaleY,
    };
  }

  /**
   * Exact analytical inverse projection: maps screen pointer (sx, sy) back to world (wx, wy).
   */
  screenToWorld(sx, sy, canvasWidth, canvasHeight) {
    const params = this.getProjectionParams(canvasWidth, canvasHeight);
    const v = (sy - params.topY) / Math.max(0.0001, params.arenaH);
    const rowScale = Math.max(MIN_ROW_SCALE, 1 - PERSP_TAPER * (1 - v));
    const u = (sx - params.centerX) / Math.max(0.0001, params.arenaW * rowScale);

    return {
      x: (u + 0.5) * this.worldWidth,
      y: v * this.worldHeight,
    };
  }

  /**
   * Front-facing depth sort key (higher Y = closer to camera = rendered on top).
   */
  getDepth(wx, wy) {
    return wy;
  }

  /**
   * Checks whether straight line between two world points is clear of blocked cells.
   */
  hasLineOfSight(x1, y1, x2, y2) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(2, Math.ceil(dist / (this.cellWidth * 0.5)));
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const sx = x1 + (x2 - x1) * t;
      const sy = y1 + (y2 - y1) * t;
      const { col, row } = this.worldToCell(sx, sy);
      if (!this.isCellWalkable(col, row)) return false;
    }
    return true;
  }
}
