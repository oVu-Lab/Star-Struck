/**
 * Pathfinder — Grid-based 8-directional A* pathfinding with corner-cutting
 * prevention, path caching, reachability checks, and waypoint smoothing.
 */

const DIRS = [
  { dc: 1, dr: 0, cost: 1 },
  { dc: -1, dr: 0, cost: 1 },
  { dc: 0, dr: 1, cost: 1 },
  { dc: 0, dr: -1, cost: 1 },
  { dc: 1, dr: 1, cost: 1.4142 },
  { dc: -1, dr: 1, cost: 1.4142 },
  { dc: 1, dr: -1, cost: 1.4142 },
  { dc: -1, dr: -1, cost: 1.4142 },
];

export class Pathfinder {
  constructor(battlefield, { maxCacheEntries = 256 } = {}) {
    this._bf = battlefield;
    this._maxCacheEntries = maxCacheEntries;
    this._cache = new Map();
    this._cachedTerrainVersion = -1;
  }

  setBattlefield(battlefield) {
    this._bf = battlefield;
    this.clearCache();
  }

  clearCache() {
    this._cache.clear();
    this._cachedTerrainVersion = this._bf?.terrainVersion ?? -1;
  }

  _syncTerrainVersion() {
    if (!this._bf) return;
    if (this._cachedTerrainVersion !== this._bf.terrainVersion) {
      this._cache.clear();
      this._cachedTerrainVersion = this._bf.terrainVersion;
    }
  }

  /**
   * Computes a world-coordinate path from (startX, startY) to (goalX, goalY).
   * Returns { reachable: boolean, waypoints: Array<{x, y}> }.
   */
  findPath(startX, startY, goalX, goalY) {
    if (!this._bf) {
      return { reachable: true, waypoints: [{ x: goalX, y: goalY }] };
    }
    this._syncTerrainVersion();

    // Fast path: direct line-of-sight with walkable destination
    if (
      this._bf.isWorldWalkable(goalX, goalY, 0.8) &&
      this._bf.hasLineOfSight(startX, startY, goalX, goalY)
    ) {
      return { reachable: true, waypoints: [{ x: goalX, y: goalY }] };
    }

    const startCell = this._nearestWalkableCell(this._bf.worldToCell(startX, startY));
    const goalCell = this._nearestWalkableCell(this._bf.worldToCell(goalX, goalY));
    if (!startCell || !goalCell) {
      return { reachable: false, waypoints: [] };
    }

    if (startCell.col === goalCell.col && startCell.row === goalCell.row) {
      return { reachable: true, waypoints: [{ x: goalX, y: goalY }] };
    }

    const cacheKey = `${startCell.col},${startCell.row}->${goalCell.col},${goalCell.row}`;
    const cached = this._cache.get(cacheKey);
    if (cached) {
      return {
        reachable: cached.reachable,
        waypoints: cached.waypoints.map((pt) => ({ x: pt.x, y: pt.y })),
      };
    }

    const result = this._runAStar(startCell, goalCell);
    if (result.reachable && result.waypoints.length > 0 && this._bf.isWorldWalkable(goalX, goalY, 0.6)) {
      result.waypoints[result.waypoints.length - 1] = { x: goalX, y: goalY };
    }

    if (this._cache.size >= this._maxCacheEntries) {
      const oldestKey = this._cache.keys().next().value;
      if (oldestKey !== undefined) this._cache.delete(oldestKey);
    }
    this._cache.set(cacheKey, {
      reachable: result.reachable,
      waypoints: result.waypoints.map((pt) => ({ x: pt.x, y: pt.y })),
    });

    return result;
  }

  isReachable(startX, startY, goalX, goalY) {
    return this.findPath(startX, startY, goalX, goalY).reachable;
  }

  _nearestWalkableCell(cell) {
    if (this._bf.isCellWalkable(cell.col, cell.row)) return cell;
    for (let r = 1; r <= 4; r += 1) {
      for (let dr = -r; dr <= r; dr += 1) {
        for (let dc = -r; dc <= r; dc += 1) {
          if (Math.abs(dr) !== r && Math.abs(dc) !== r) continue;
          const nc = cell.col + dc;
          const nr = cell.row + dr;
          if (this._bf.isCellWalkable(nc, nr)) {
            return { col: nc, row: nr };
          }
        }
      }
    }
    return null;
  }

  _runAStar(start, goal) {
    const cols = this._bf.gridCols;
    const rows = this._bf.gridRows;
    const total = cols * rows;

    const gScore = new Float32Array(total);
    gScore.fill(Infinity);
    const fScore = new Float32Array(total);
    fScore.fill(Infinity);
    const cameFrom = new Int32Array(total);
    cameFrom.fill(-1);
    const closed = new Uint8Array(total);
    const inOpen = new Uint8Array(total);

    const startIdx = start.row * cols + start.col;
    const goalIdx = goal.row * cols + goal.col;

    const heuristic = (c, r) => {
      const dx = Math.abs(c - goal.col);
      const dy = Math.abs(r - goal.row);
      return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy);
    };

    gScore[startIdx] = 0;
    fScore[startIdx] = heuristic(start.col, start.row);

    // Binary min-heap for fast open-set extraction
    const heap = [startIdx];
    inOpen[startIdx] = 1;

    const heapPop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length > 0) {
        heap[0] = last;
        let idx = 0;
        const len = heap.length;
        while (true) {
          const left = idx * 2 + 1;
          const right = idx * 2 + 2;
          let smallest = idx;
          if (left < len && fScore[heap[left]] < fScore[heap[smallest]]) smallest = left;
          if (right < len && fScore[heap[right]] < fScore[heap[smallest]]) smallest = right;
          if (smallest === idx) break;
          const tmp = heap[idx];
          heap[idx] = heap[smallest];
          heap[smallest] = tmp;
          idx = smallest;
        }
      }
      return top;
    };

    const heapPush = (node) => {
      heap.push(node);
      let idx = heap.length - 1;
      while (idx > 0) {
        const parent = (idx - 1) >> 1;
        if (fScore[heap[idx]] >= fScore[heap[parent]]) break;
        const tmp = heap[idx];
        heap[idx] = heap[parent];
        heap[parent] = tmp;
        idx = parent;
      }
    };

    while (heap.length > 0) {
      const current = heapPop();
      if (current === goalIdx) {
        return {
          reachable: true,
          waypoints: this._reconstructAndSmooth(cameFrom, current, cols),
        };
      }

      if (closed[current]) continue;
      closed[current] = 1;

      const curCol = current % cols;
      const curRow = (current - curCol) / cols;

      for (const dir of DIRS) {
        const nc = curCol + dir.dc;
        const nr = curRow + dir.dr;
        if (!this._bf.isCellWalkable(nc, nr)) continue;

        // Prevent diagonal corner cutting across solid obstacle edges
        if (dir.dc !== 0 && dir.dr !== 0) {
          if (
            !this._bf.isCellWalkable(curCol + dir.dc, curRow) ||
            !this._bf.isCellWalkable(curCol, curRow + dir.dr)
          ) {
            continue;
          }
        }

        const nIdx = nr * cols + nc;
        if (closed[nIdx]) continue;

        const tentativeG = gScore[current] + dir.cost;
        if (tentativeG < gScore[nIdx]) {
          cameFrom[nIdx] = current;
          gScore[nIdx] = tentativeG;
          fScore[nIdx] = tentativeG + heuristic(nc, nr);
          if (!inOpen[nIdx]) {
            inOpen[nIdx] = 1;
            heapPush(nIdx);
          } else {
            heapPush(nIdx);
          }
        }
      }
    }

    return { reachable: false, waypoints: [] };
  }

  _reconstructAndSmooth(cameFrom, goalIdx, cols) {
    const raw = [];
    let cur = goalIdx;
    while (cur !== -1) {
      const col = cur % cols;
      const row = (cur - col) / cols;
      raw.push(this._bf.cellToWorld(col, row));
      cur = cameFrom[cur];
    }
    raw.reverse();

    if (raw.length <= 2) {
      return raw.slice(1);
    }

    // String-pulling smooth pass so units move naturally instead of zigzagging
    const smoothed = [];
    let anchorIdx = 0;
    while (anchorIdx < raw.length - 1) {
      let furthest = anchorIdx + 1;
      for (let probe = raw.length - 1; probe > anchorIdx + 1; probe -= 1) {
        if (this._bf.hasLineOfSight(raw[anchorIdx].x, raw[anchorIdx].y, raw[probe].x, raw[probe].y)) {
          furthest = probe;
          break;
        }
      }
      smoothed.push(raw[furthest]);
      anchorIdx = furthest;
    }

    return smoothed;
  }
}
