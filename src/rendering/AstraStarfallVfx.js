/**
 * AstraStarfallVfx — Multi-phase celestial bombardment renderer for Astra Valen's
 * ultimate ability ("Starfall Judgment").
 *
 * Architecture:
 * - Zero per-frame heap allocations in the 60 FPS render loop: the full choreography
 *   (zenith constellation canopy, Astra dais summoning ribbons, 4-wave falling stars
 *   across 3 depth tiers, 5 distinct impact styles, and the Grand Finale Celestial Nova)
 *   is deterministically pre-computed once on activation via `createStarfallPlan`.
 * - Reuses geometry, easing, and color utilities from `NonUnitVfxGeometry.js`.
 * - Coordinates seamlessly across both `'ground'` and `'sky'` layers in BattleRenderer
 *   so units, health bars, and battlefield readability remain crystal clear.
 */

import {
  clamp01,
  easeOutCubic,
  easeOutQuart,
  smoothWindow,
  withAlpha,
  sampleQuadBezier,
  drawAnalyticalRibbon,
  drawSoftBloom,
  drawEllipticalHalo,
  drawSymmetricalSigilRing,
  drawDiamondPrism,
  drawStarFlare,
  drawTaperedNeedle,
  drawAmbientGroundLight,
  drawShockwaveRipple,
  createDetRng,
} from './NonUnitVfxGeometry.js';

export const STARFALL_DURATION_SEC = 5.65;
export const STARFALL_REDUCED_DURATION_SEC = 3.2;

export const STARFALL_DAMAGE_STAGE_DEFS = Object.freeze([
  { index: 1, id: 'shower_1', name: 'Meteor Shower', phase: 'shower', impactTimeSec: 0.58, weight: 0.10 },
  { index: 2, id: 'shower_2', name: 'Meteor Shower', phase: 'shower', impactTimeSec: 1.00, weight: 0.10 },
  { index: 3, id: 'shower_3', name: 'Meteor Shower', phase: 'shower', impactTimeSec: 1.42, weight: 0.10 },
  { index: 4, id: 'shower_4', name: 'Meteor Shower', phase: 'shower', impactTimeSec: 1.84, weight: 0.10 },
  { index: 5, id: 'shower_5', name: 'Meteor Shower', phase: 'shower', impactTimeSec: 2.26, weight: 0.10 },
  { index: 6, id: 'shower_6', name: 'Meteor Shower', phase: 'shower', impactTimeSec: 2.68, weight: 0.10 },
  { index: 7, id: 'colossal_impact', name: 'Colossal Meteor Impact', phase: 'colossal', impactTimeSec: 4.35, weight: 0.40 },
]);

/**
 * Splits Astra's total raw ultimate damage across the 4 authoritative Starfall
 * impact stages while guaranteeing exact integer conservation.
 */
export function buildStarfallDamageStages({
  totalRawDamage = 0,
  duration = STARFALL_DURATION_SEC,
} = {}) {
  const total = Math.max(0, Math.round(Number(totalRawDamage) || 0));
  const timeScale = Math.max(0.2, (Number(duration) || STARFALL_DURATION_SEC) / STARFALL_DURATION_SEC);
  let allocated = 0;
  return STARFALL_DAMAGE_STAGE_DEFS.map((def, idx) => {
    const isLast = idx === STARFALL_DAMAGE_STAGE_DEFS.length - 1;
    const rawDamage = isLast ? Math.max(0, total - allocated) : Math.round(total * def.weight);
    allocated += rawDamage;
    return {
      index: def.index,
      id: def.id,
      name: def.name,
      triggerTime: Number((def.impactTimeSec * timeScale).toFixed(4)),
      weight: def.weight,
      rawDamage,
      resolved: false,
    };
  });
}

export const STARFALL_PALETTE = Object.freeze({
  core: '#ffffff',
  warmWhite: '#fff9ea',
  champagne: '#f6e2b3',
  gold: '#e2b75b',
  deepGold: '#c68f2c',
  paleBlue: '#cfe7ff',
  softLavender: '#d6ccff',
});

export const STAR_ARCHETYPES = Object.freeze([
  'fragment',
  'brilliant',
  'celestial',
  'colossal',
]);

export const IMPACT_STYLES = Object.freeze([
  'starburst',
  'cross_flare',
  'crystal_shatter',
  'constellation_seal',
  'nova_wave',
]);

const MAX_TRAIL_SAMPLES = 18;
const TRAIL_PTS = Array.from({ length: MAX_TRAIL_SAMPLES }, () => ({ x: 0, y: 0 }));
const TRAIL_LEFT = Array.from({ length: MAX_TRAIL_SAMPLES }, () => ({ x: 0, y: 0 }));
const TRAIL_RIGHT = Array.from({ length: MAX_TRAIL_SAMPLES }, () => ({ x: 0, y: 0 }));
const SCRATCH_NODES = Array.from({ length: 6 }, () => ({ x: 0, y: 0 }));

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function getArchetypeStats(archetype) {
  switch (archetype) {
    case 'colossal':
      return {
        sizeMul: 3.3,
        fallDurationMin: 0.8,
        fallDurationMax: 0.8,
        impactDuration: 1.3,
        trailSpan: 0.92,
        trailWidth: 28,
        shardCount: 16,
        orbiterCount: 4,
        hasGroundMark: true,
        groundMarkRadius: 15,
      };
    case 'celestial':
      return {
        sizeMul: 1.24,
        fallDurationMin: 0.52,
        fallDurationMax: 0.64,
        impactDuration: 0.82,
        trailSpan: 0.58,
        trailWidth: 7.6,
        shardCount: 8,
        orbiterCount: 2,
        hasGroundMark: true,
        groundMarkRadius: 6.2,
      };
    case 'brilliant':
      return {
        sizeMul: 0.96,
        fallDurationMin: 0.44,
        fallDurationMax: 0.58,
        impactDuration: 0.64,
        trailSpan: 0.48,
        trailWidth: 4.8,
        shardCount: 6,
        orbiterCount: 0,
        hasGroundMark: true,
        groundMarkRadius: 4.1,
      };
    case 'fragment':
    default:
      return {
        sizeMul: 0.66,
        fallDurationMin: 0.32,
        fallDurationMax: 0.45,
        impactDuration: 0.44,
        trailSpan: 0.42,
        trailWidth: 2.8,
        shardCount: 4,
        orbiterCount: 0,
        hasGroundMark: false,
        groundMarkRadius: 0,
      };
  }
}

function getDepthMultiplier(depthTier) {
  if (depthTier === 'far') return 0.52;
  if (depthTier === 'near') return 1.42;
  return 1.0;
}

function computeEpicenter(enemies) {
  if (!Array.isArray(enemies) || enemies.length === 0) {
    return { x: 62, y: 50 };
  }
  let sumX = 0;
  let sumY = 0;
  let weightTotal = 0;
  for (let i = 0; i < enemies.length; i += 1) {
    const e = enemies[i];
    if (!Number.isFinite(e?.x) || !Number.isFinite(e?.y)) continue;
    const w = e.isBoss ? 3.5 : e.isElite ? 1.8 : 1.0;
    sumX += e.x * w;
    sumY += e.y * w;
    weightTotal += w;
  }
  if (weightTotal <= 0) return { x: 62, y: 50 };
  return {
    x: Math.max(44, Math.min(76, sumX / weightTotal)),
    y: Math.max(32, Math.min(68, sumY / weightTotal)),
  };
}

function spaceOutPoint(desiredX, desiredY, placedPts, minSep = 8.5, minX = 22, maxX = 95, minY = 10, maxY = 90) {
  let cx = Math.max(minX, Math.min(maxX, desiredX));
  let cy = Math.max(minY, Math.min(maxY, desiredY));
  for (let attempt = 0; attempt < 10; attempt += 1) {
    let collides = false;
    for (let i = 0; i < placedPts.length; i += 1) {
      const p = placedPts[i];
      if (Math.hypot(p.x - cx, p.y - cy) < minSep) {
        collides = true;
        break;
      }
    }
    if (!collides) break;
    const angle = attempt * 1.15;
    const step = minSep * (0.65 + attempt * 0.22);
    cx = Math.max(minX, Math.min(maxX, desiredX + Math.cos(angle) * step));
    cy = Math.max(minY, Math.min(maxY, desiredY + Math.sin(angle) * step * 0.85));
  }
  const pt = { x: cx, y: cy };
  placedPts.push(pt);
  return pt;
}

function buildStarEntry({
  rng,
  streamPhase = 'shower',
  archetype,
  depthTier,
  impactTimeSec,
  targetX,
  targetY,
  slantX,
  depthPull,
  gentleDrift = 0,
  impactStyle,
  timeScale,
  forcedFallDur = null,
  forcedBaseZ = null,
  forcedSpeedExp = null,
}) {
  const stats = getArchetypeStats(archetype);
  const depthScale = getDepthMultiplier(depthTier);
  const rawFall = forcedFallDur ?? lerp(stats.fallDurationMin, stats.fallDurationMax, rng());
  const fallDuration = rawFall * timeScale;
  const impactTime = impactTimeSec * timeScale;
  const startTime = Math.max(0.05 * timeScale, impactTime - fallDuration);
  const impactDuration = stats.impactDuration * timeScale;

  // Smooth coordinated starting coordinates derived directly from stream slant
  const baseZ = forcedBaseZ ?? (34 + clamp01(targetY / 100) * 32 + rng() * 10);
  const startX = targetX + slantX;
  const startY = targetY - depthPull;

  // Restrained celestial highlights: white & warm gold dominant; faint cool tints only on select stars
  let chromaticTint = null;
  if (depthTier === 'far') {
    chromaticTint = rng() > 0.45 ? 'blue' : 'lavender';
  } else if (archetype === 'celestial' || archetype === 'colossal') {
    chromaticTint = rng() > 0.5 ? 'blue' : 'lavender';
  }

  const orbiters = [];
  for (let o = 0; o < stats.orbiterCount; o += 1) {
    orbiters.push({
      radiusMul: 1.55 + o * 0.48 + rng() * 0.22,
      tilt: 0.36 + rng() * 0.28,
      inclination: (rng() - 0.5) * 0.65,
      speed: (4.2 + rng() * 3.0) * (o % 2 === 0 ? 1 : -1),
      phase: rng() * Math.PI * 2,
      sizeMul: 0.24 + rng() * 0.1,
    });
  }

  const shardSeeds = [];
  for (let s = 0; s < stats.shardCount; s += 1) {
    const baseAngle = (Math.PI * 2 * s) / stats.shardCount + (rng() - 0.5) * 0.42;
    shardSeeds.push({
      angle: baseAngle,
      distMul: 0.72 + rng() * 0.65,
      sizeMul: 0.65 + rng() * 0.7,
      liftMul: 0.3 + rng() * 0.85,
      isCrystal: s % 2 === 0,
      isGlint: s % 3 === 0,
      spin: (rng() - 0.5) * 4.0,
    });
  }

  const constellationNodes = [];
  if (stats.hasGroundMark) {
    const nodeCount = archetype === 'colossal' ? 6 : 5;
    const baseRot = rng() * Math.PI * 2;
    for (let n = 0; n < nodeCount; n += 1) {
      const a = baseRot + (Math.PI * 2 * n) / nodeCount + (rng() - 0.5) * 0.24;
      const r = stats.groundMarkRadius * (0.5 + rng() * 0.48);
      constellationNodes.push({
        dx: Math.cos(a) * r,
        dy: Math.sin(a) * r,
      });
    }
  }

  return {
    streamPhase,
    archetype,
    depthTier,
    depthOrder: depthTier === 'far' ? 0 : depthTier === 'mid' ? 1 : archetype === 'colossal' ? 3 : 2,
    startTime,
    fallDuration,
    impactTime,
    impactDuration,
    startX,
    startY,
    targetX,
    targetY,
    slantX,
    startZ: baseZ,
    gentleDrift: Math.max(-1.25, Math.min(1.25, gentleDrift)),
    speedExp: forcedSpeedExp ?? (1.56 + rng() * 0.14),
    size: stats.sizeMul * depthScale * (archetype === 'colossal' ? 1 : 0.9 + rng() * 0.2),
    brightness: (depthTier === 'far' ? 0.62 : depthTier === 'near' ? 1.0 : 0.92) * (archetype === 'colossal' ? 1 : 0.9 + rng() * 0.1),
    rotSpeed: (rng() - 0.5) * (archetype === 'fragment' ? 0.45 : 2.2),
    rotPhase: rng() * Math.PI * 2,
    trailSpan: stats.trailSpan,
    trailWidth: stats.trailWidth * depthScale,
    chromaticTint,
    orbiters,
    impactStyle,
    shardSeeds,
    constellationNodes,
    groundMarkRadius: stats.groundMarkRadius * depthScale,
    seed: Math.floor(rng() * 100000),
  };
}

/**
 * Deterministically creates the full Starfall Judgment visual plan once when
 * Astra's ultimate is triggered.
 */
export function createStarfallPlan({
  enemies = [],
  allies = [],
  seed = 777,
  quality = 'high',
  reducedMotion = false,
} = {}) {
  const rng = createDetRng(seed || 777);
  const qualityScale = quality === 'low' ? 0.5 : quality === 'medium' ? 0.74 : 1.0;
  const motionScale = reducedMotion ? 0.45 : 1.0;
  const scaleFactor = qualityScale * motionScale;

  const duration = reducedMotion ? STARFALL_REDUCED_DURATION_SEC : STARFALL_DURATION_SEC;
  const timeScale = duration / STARFALL_DURATION_SEC;

  const enemyPts = Array.isArray(enemies)
    ? enemies.filter((e) => Number.isFinite(e?.x) && Number.isFinite(e?.y))
    : [];
  const allyPts = Array.isArray(allies)
    ? allies.filter((a) => Number.isFinite(a?.x) && Number.isFinite(a?.y))
    : [];

  const epicenter = computeEpicenter(enemyPts);

  // 1. Zenith Constellation Canopy (opened sky across upper viewport)
  const canopyCount = Math.max(24, Math.round(76 * scaleFactor));
  const canopyStars = [];
  for (let i = 0; i < canopyCount; i += 1) {
    const tierRoll = rng();
    const isCoolDistant = tierRoll < 0.24;
    canopyStars.push({
      nx: 0.03 + rng() * 0.94,
      ny: 0.02 + Math.pow(rng(), 0.85) * 0.34,
      size: 0.9 + rng() * 2.1,
      brightness: 0.4 + rng() * 0.6,
      twinkleSpeed: 3.5 + rng() * 6.5,
      twinklePhase: rng() * Math.PI * 2,
      isFourPoint: i % 4 === 0,
      color: isCoolDistant
        ? rng() > 0.5
          ? STARFALL_PALETTE.paleBlue
          : STARFALL_PALETTE.softLavender
        : i % 3 === 0
          ? STARFALL_PALETTE.champagne
          : STARFALL_PALETTE.warmWhite,
    });
  }

  const canopyEdges = [];
  const maxEdges = Math.max(8, Math.round(24 * scaleFactor));
  for (let i = 0; i < canopyStars.length && canopyEdges.length < maxEdges; i += 1) {
    const a = canopyStars[i];
    let bestIdx = -1;
    let bestDist = 0.16;
    for (let j = i + 1; j < canopyStars.length; j += 1) {
      const b = canopyStars[j];
      const d = Math.hypot(a.nx - b.nx, (a.ny - b.ny) * 1.4);
      if (d > 0.035 && d < bestDist) {
        bestDist = d;
        bestIdx = j;
      }
    }
    if (bestIdx !== -1) {
      canopyEdges.push({ a: i, b: bestIdx });
    }
  }

  // 2. Ally Healing & Dais Summoning Motes
  const healMotes = [];
  const healCount = Math.max(5, Math.round(12 * scaleFactor));
  for (let i = 0; i < healCount; i += 1) {
    const anchor = allyPts.length > 0 ? allyPts[i % allyPts.length] : null;
    healMotes.push({
      wx: anchor ? anchor.x + (rng() - 0.5) * 6 : 10 + rng() * 22,
      wy: anchor ? anchor.y + (rng() - 0.5) * 8 : 18 + rng() * 64,
      startTime: (0.14 + rng() * 0.45) * timeScale,
      duration: (0.72 + rng() * 0.35) * timeScale,
      size: 2.2 + rng() * 1.8,
      swayPhase: rng() * Math.PI * 2,
    });
  }

  // 3. Continuous Overlapping Meteor Shower (0.45s - 3.05s) + Subsidence + ONE Colossal Final Meteor (3.55s - 4.35s)
  const stars = [];
  let impactCursor = 0;
  const nextImpactStyle = (preferred = null) => {
    if (preferred) return preferred;
    const style = IMPACT_STYLES[impactCursor % IMPACT_STYLES.length];
    impactCursor += 1;
    return style;
  };

  const biasTowardEnemy = (baseX, baseY, maxSnapDist = 15) => {
    if (enemyPts.length === 0) return { x: baseX, y: baseY };
    let best = null;
    let bestD = maxSnapDist;
    for (let i = 0; i < enemyPts.length; i += 1) {
      const e = enemyPts[i];
      const d = Math.hypot(e.x - baseX, e.y - baseY);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best) return { x: baseX, y: baseY };
    return {
      x: lerp(baseX, Math.max(24, Math.min(94, best.x)), 0.56),
      y: lerp(baseY, Math.max(12, Math.min(88, best.y)), 0.56),
    };
  };

  const showerCount = Math.max(24, Math.round(66 * scaleFactor));
  const recentMidPlacements = [];

  for (let i = 0; i < showerCount; i += 1) {
    const uStream = i / Math.max(1, showerCount - 1);
    // Steady overlapping flow through 2.68s, then gradual subsidence out to 3.04s
    const impactTimeSec =
      uStream < 0.88
        ? lerp(0.45, 2.68, uStream / 0.88) + (rng() - 0.5) * 0.055
        : lerp(2.71, 3.04, Math.pow((uStream - 0.88) / 0.12, 1.35));

    const depthRoll = rng();
    const depthTier = depthRoll < 0.18 ? 'far' : depthRoll > 0.86 ? 'near' : 'mid';

    let archetype;
    if (depthTier === 'far') {
      archetype = 'fragment';
    } else if (depthTier === 'near') {
      archetype = rng() < 0.55 ? 'fragment' : 'brilliant';
    } else {
      const archRoll = rng();
      if (uStream > 0.14 && uStream < 0.86 && archRoll > 0.82) {
        archetype = 'celestial';
      } else if (archRoll > 0.42) {
        archetype = 'brilliant';
      } else {
        archetype = 'fragment';
      }
    }

    let tgt;
    if (depthTier === 'far') {
      tgt = {
        x: 18 + rng() * 76,
        y: -8 + rng() * 13,
      };
    } else if (depthTier === 'near') {
      tgt = {
        x: 26 + rng() * 64,
        y: 86 + rng() * 14,
      };
    } else {
      // Sweep cleanly across battlefield lanes while biasing toward living enemy anchors
      const laneX = 28 + ((i * 29) % 64) + (rng() - 0.5) * 12;
      const laneY = 14 + ((i * 23) % 72) + (rng() - 0.5) * 10;
      const snapped = biasTowardEnemy(laneX, laneY, 16);
      // Enforce spacing only against recent impacts (within 0.42s) so streams stay clean & active
      const activeWindowPts = [];
      for (let r = recentMidPlacements.length - 1; r >= 0; r -= 1) {
        if (impactTimeSec - recentMidPlacements[r].t > 0.42) break;
        activeWindowPts.push(recentMidPlacements[r]);
      }
      tgt = spaceOutPoint(snapped.x, snapped.y, activeWindowPts, 8.5);
      recentMidPlacements.push({ x: tgt.x, y: tgt.y, t: impactTimeSec });
    }

    const slantX = -17.5 + uStream * 2.2 + (rng() - 0.5) * 2.2;
    stars.push(
      buildStarEntry({
        rng,
        streamPhase: 'shower',
        archetype,
        depthTier,
        impactTimeSec,
        targetX: tgt.x,
        targetY: tgt.y,
        slantX,
        depthPull: 5.5,
        gentleDrift: (rng() - 0.5) * 1.4,
        impactStyle: nextImpactStyle(),
        timeScale,
      }),
    );
  }

  // --- Brief Anticipation Beat (3.05s - 3.55s) -> ONE Final Colossal Meteor (3.55s - 4.35s) ---
  const anticipationStart = 3.05 * timeScale;
  const colossalStartSec = 3.55;
  const colossalImpactSec = STARFALL_DAMAGE_STAGE_DEFS[STARFALL_DAMAGE_STAGE_DEFS.length - 1].impactTimeSec;
  const colossalFallDur = colossalImpactSec - colossalStartSec;
  const colossalMeteor = buildStarEntry({
    rng,
    streamPhase: 'colossal',
    archetype: 'colossal',
    depthTier: 'mid',
    impactTimeSec: colossalImpactSec,
    targetX: epicenter.x,
    targetY: epicenter.y,
    slantX: -22,
    depthPull: 8,
    gentleDrift: 0,
    impactStyle: 'starburst',
    timeScale,
    forcedFallDur: colossalFallDur,
    forcedBaseZ: 38 + clamp01(epicenter.y / 100) * 14,
    forcedSpeedExp: 1.32,
  });
  stars.push(colossalMeteor);

  const novaTime = colossalImpactSec * timeScale;

  // Sort back-to-front by depthTier (far -> mid -> near -> colossal)
  stars.sort((a, b) => a.depthOrder - b.depthOrder || a.startTime - b.startTime);

  // 4. Colossal Meteor Impact Precomputed Rays, Shards & Lingering Motes
  const novaRays = [];
  const rayCount = reducedMotion ? 14 : 24;
  for (let r = 0; r < rayCount; r += 1) {
    const isMajor = r % 2 === 0;
    novaRays.push({
      angle: (Math.PI * 2 * r) / rayCount + (rng() - 0.5) * 0.05,
      lengthMul: (isMajor ? 0.96 : 0.58) + rng() * 0.24,
      width: (isMajor ? 5.8 : 2.8) + rng() * 1.4,
      isCool: !isMajor && r % 4 === 1,
    });
  }

  const novaShards = [];
  const novaShardCount = Math.max(16, Math.round(36 * scaleFactor));
  for (let s = 0; s < novaShardCount; s += 1) {
    novaShards.push({
      angle: (Math.PI * 2 * s) / novaShardCount + (rng() - 0.5) * 0.22,
      distMul: 0.45 + rng() * 0.84,
      size: 2.8 + rng() * 4.2,
      isGlint: s % 3 === 0,
      isCool: s % 5 === 2,
      spin: (rng() - 0.5) * 4.5,
    });
  }

  const lingeringMotes = [];
  const moteCount = Math.max(20, Math.round(52 * scaleFactor));
  for (let m = 0; m < moteCount; m += 1) {
    lingeringMotes.push({
      nx: 0.08 + rng() * 0.84,
      ny: 0.14 + rng() * 0.7,
      vx: (rng() - 0.5) * 14,
      vy: -14 - rng() * 22,
      size: 1.4 + rng() * 2.8,
      phase: rng() * Math.PI * 2,
      twinkleFreq: 4 + rng() * 6,
      isFourPoint: m % 4 === 0,
      color:
        m % 7 === 0
          ? STARFALL_PALETTE.paleBlue
          : m % 3 === 0
            ? STARFALL_PALETTE.champagne
            : STARFALL_PALETTE.warmWhite,
    });
  }

  return {
    seed,
    duration,
    timeScale,
    reducedMotion: Boolean(reducedMotion),
    epicenter,
    anticipationStart,
    colossalStart: colossalStartSec * timeScale,
    colossalImpact: novaTime,
    colossalMeteor,
    novaTime,
    novaDuration: Math.max(0.85, duration - novaTime),
    damageStages: STARFALL_DAMAGE_STAGE_DEFS.map((d) => ({
      index: d.index,
      id: d.id,
      name: d.name,
      phase: d.phase,
      impactTime: Number((d.impactTimeSec * timeScale).toFixed(4)),
    })),
    canopyStars,
    canopyEdges,
    healMotes,
    stars,
    novaRays,
    novaShards,
    lingeringMotes,
  };
}

/**
 * Returns synchronized camera impulses and screen flashes aligned to the
 * authoritative continuous shower and colossal impact timeline.
 */
export function getStarfallCameraSchedule({ reducedMotion = false } = {}) {
  const timeScale =
    (reducedMotion ? STARFALL_REDUCED_DURATION_SEC : STARFALL_DURATION_SEC) /
    STARFALL_DURATION_SEC;
  const showerMidA = Number((1.42 * timeScale).toFixed(4));
  const showerMidB = Number((2.26 * timeScale).toFixed(4));
  const colossalTime = Number((4.35 * timeScale).toFixed(4));

  if (reducedMotion) {
    return {
      impulses: [],
      flashes: [
        { delaySec: 0, color: '#fff6dc', durationSec: 0.28, maxAlpha: 0.14 },
        { delaySec: colossalTime, color: '#fff8e2', durationSec: 0.44, maxAlpha: 0.18 },
      ],
    };
  }
  return {
    impulses: [
      { delaySec: showerMidA, intensity: 2.2, durationSec: 0.18, dirX: 0.12, dirY: 1 },
      { delaySec: showerMidB, intensity: 2.8, durationSec: 0.20, dirX: -0.1, dirY: 1 },
      { delaySec: colossalTime, intensity: 8.2, durationSec: 0.42, dirX: 0, dirY: 1 },
    ],
    flashes: [
      { delaySec: 0, color: '#fff6dc', durationSec: 0.34, maxAlpha: 0.18 },
      { delaySec: colossalTime, color: '#fff8e2', durationSec: 0.56, maxAlpha: 0.34 },
    ],
  };
}

// ============================================================================
// Trajectory & Geometry Evaluators
// ============================================================================

function evalStarWorldPoint(star, u, out) {
  const c = clamp01(u);
  const p = Math.pow(c, star.speedExp);
  out.wx = lerp(star.startX, star.targetX, p) + Math.sin(c * Math.PI) * star.gentleDrift;
  out.wy = lerp(star.startY, star.targetY, p);
  out.wz = star.startZ * (1 - p);
}

const _tmpWorldPt = { wx: 0, wy: 0, wz: 0 };

function drawBeveledStarShape(ctx, x, y, outerR, innerR, points, rotation, primaryCol, highlightCol, alpha) {
  if (alpha <= 0.015 || outerR <= 0.6) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  const step = Math.PI / points;
  // Draw alternating bright/shaded triangular facets for genuine sculpted crystal depth
  for (let i = 0; i < points * 2; i += 1) {
    const a0 = i * step;
    const a1 = (i + 1) * step;
    const isOutToIn = i % 2 === 0;
    const r0 = isOutToIn ? outerR : innerR;
    const r1 = isOutToIn ? innerR : outerR;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
    ctx.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
    ctx.closePath();
    ctx.fillStyle = withAlpha(isOutToIn ? highlightCol : primaryCol, alpha * (isOutToIn ? 0.96 : 0.72));
    ctx.fill();
  }

  // Crisp luminous outer edge outline
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const a = i * step;
    const r = i % 2 === 0 ? outerR : innerR;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.strokeStyle = withAlpha('#ffffff', alpha * 0.85);
  ctx.lineWidth = Math.max(0.65, outerR * 0.06);
  ctx.stroke();

  ctx.restore();
}

function drawCurvedStarTrail(ctx, bf, w, h, star, uHead, vs, alpha) {
  const uTail = Math.max(0, uHead - star.trailSpan);
  const span = uHead - uTail;
  if (span <= 0.015 || alpha <= 0.02) return;

  const count = MAX_TRAIL_SAMPLES;
  for (let i = 0; i < count; i += 1) {
    const s = i / (count - 1);
    const u = lerp(uTail, uHead, s);
    evalStarWorldPoint(star, u, _tmpWorldPt);
    const sp = bf.worldToScreen(_tmpWorldPt.wx, _tmpWorldPt.wy, w, h, _tmpWorldPt.wz);
    TRAIL_PTS[i].x = sp.x;
    TRAIL_PTS[i].y = sp.y;
  }

  const headPt = TRAIL_PTS[count - 1];
  const prevPt = TRAIL_PTS[count - 2];
  const headAngle = Math.atan2(headPt.y - prevPt.y, headPt.x - prevPt.x);

  const buildRibbonBounds = (maxW) => {
    let lastNx = 0;
    let lastNy = -1;
    for (let i = 0; i < count; i += 1) {
      const s = i / (count - 1);
      const pA = TRAIL_PTS[Math.max(0, i - 1)];
      const pB = TRAIL_PTS[Math.min(count - 1, i + 1)];
      const dx = pB.x - pA.x;
      const dy = pB.y - pA.y;
      const len = Math.hypot(dx, dy);
      let nx = lastNx;
      let ny = lastNy;
      if (len > 1e-4) {
        nx = -dy / len;
        ny = dx / len;
        lastNx = nx;
        lastNy = ny;
      }
      // Smooth comet profile: razor tip at tail (s=0), swells cleanly behind head, rounds at head (s=1)
      const taper = s >= 0.9 ? Math.sqrt(Math.max(0, (1 - s) / 0.1)) : Math.pow(s / 0.9, 1.35);
      const hw = maxW * 0.5 * taper;
      TRAIL_LEFT[i].x = TRAIL_PTS[i].x + nx * hw;
      TRAIL_LEFT[i].y = TRAIL_PTS[i].y + ny * hw;
      TRAIL_RIGHT[i].x = TRAIL_PTS[i].x - nx * hw;
      TRAIL_RIGHT[i].y = TRAIL_PTS[i].y - ny * hw;
    }
  };

  const traceRibbon = () => {
    ctx.beginPath();
    ctx.moveTo(TRAIL_LEFT[0].x, TRAIL_LEFT[0].y);
    for (let i = 1; i < count; i += 1) ctx.lineTo(TRAIL_LEFT[i].x, TRAIL_LEFT[i].y);
    for (let i = count - 1; i >= 0; i -= 1) ctx.lineTo(TRAIL_RIGHT[i].x, TRAIL_RIGHT[i].y);
    ctx.closePath();
  };

  const baseWidth = star.trailWidth * vs;
  const edgeCol =
    star.chromaticTint === 'blue'
      ? STARFALL_PALETTE.paleBlue
      : star.chromaticTint === 'lavender'
        ? STARFALL_PALETTE.softLavender
        : STARFALL_PALETTE.gold;

  // 1. Wide translucent outer wake
  buildRibbonBounds(baseWidth * 2.15);
  traceRibbon();
  ctx.fillStyle = withAlpha(edgeCol, alpha * 0.2);
  ctx.fill();

  // 2. Warm celestial gold inner trail
  buildRibbonBounds(baseWidth);
  traceRibbon();
  ctx.fillStyle = withAlpha(STARFALL_PALETTE.gold, alpha * 0.58);
  ctx.fill();

  // 3. Incandescent champagne-white core spine
  buildRibbonBounds(Math.max(1.1, baseWidth * 0.42));
  traceRibbon();
  ctx.fillStyle = withAlpha(STARFALL_PALETTE.warmWhite, alpha * 0.92);
  ctx.fill();

  // 4. Clean directional stardust sparks along trail wake (no wavy worm ribbons)
  if (star.archetype === 'celestial' || star.archetype === 'sovereign') {
    const stepStride = star.archetype === 'sovereign' ? 2 : 3;
    for (let k = 2; k < count - 2; k += stepStride) {
      const s = k / (count - 1);
      const pt = TRAIL_PTS[k];
      const scatter = ((k % 2 === 0 ? 1 : -1) * baseWidth * 0.55) * (1 - s * 0.45);
      const sx = pt.x + Math.cos(headAngle + Math.PI * 0.5) * scatter;
      const sy = pt.y + Math.sin(headAngle + Math.PI * 0.5) * scatter;
      drawStarFlare(
        ctx,
        sx,
        sy,
        (2.2 + s * 2.1) * vs,
        0.18,
        STARFALL_PALETTE.champagne,
        STARFALL_PALETTE.core,
        alpha * s * 0.72,
        headAngle,
        4,
      );
    }
  }

  return headAngle;
}

function drawColossalMeteor(ctx, bf, w, h, star, age, vs, reduced) {
  const u = clamp01((age - star.startTime) / Math.max(0.05, star.fallDuration));
  if (u <= 0 || u >= 1) return;

  const entryFade = clamp01(u / 0.12);
  const alpha = entryFade * star.brightness;

  // Multi-layered colossal comet tail (outer atmospheric wake, gold plasma sheath, white core, cascading sparks)
  const uTail = Math.max(0, u - star.trailSpan);
  const count = MAX_TRAIL_SAMPLES;
  for (let i = 0; i < count; i += 1) {
    const s = i / (count - 1);
    const tu = lerp(uTail, u, s);
    evalStarWorldPoint(star, tu, _tmpWorldPt);
    const sp = bf.worldToScreen(_tmpWorldPt.wx, _tmpWorldPt.wy, w, h, _tmpWorldPt.wz);
    TRAIL_PTS[i].x = sp.x;
    TRAIL_PTS[i].y = sp.y;
  }

  const head = TRAIL_PTS[count - 1];
  const prev = TRAIL_PTS[count - 2];
  const headAngle = Math.atan2(head.y - prev.y, head.x - prev.x);

  const buildColossalRibbon = (maxW) => {
    let lastNx = 0;
    let lastNy = -1;
    for (let i = 0; i < count; i += 1) {
      const s = i / (count - 1);
      const pA = TRAIL_PTS[Math.max(0, i - 1)];
      const pB = TRAIL_PTS[Math.min(count - 1, i + 1)];
      const dx = pB.x - pA.x;
      const dy = pB.y - pA.y;
      const len = Math.hypot(dx, dy);
      let nx = lastNx;
      let ny = lastNy;
      if (len > 1e-4) {
        nx = -dy / len;
        ny = dx / len;
        lastNx = nx;
        lastNy = ny;
      }
      const taper = s >= 0.88 ? Math.sqrt(Math.max(0, (1 - s) / 0.12)) : Math.pow(s / 0.88, 1.25);
      const hw = maxW * 0.5 * taper;
      TRAIL_LEFT[i].x = TRAIL_PTS[i].x + nx * hw;
      TRAIL_LEFT[i].y = TRAIL_PTS[i].y + ny * hw;
      TRAIL_RIGHT[i].x = TRAIL_PTS[i].x - nx * hw;
      TRAIL_RIGHT[i].y = TRAIL_PTS[i].y - ny * hw;
    }
  };

  const traceColossalRibbon = () => {
    ctx.beginPath();
    ctx.moveTo(TRAIL_LEFT[0].x, TRAIL_LEFT[0].y);
    for (let i = 1; i < count; i += 1) ctx.lineTo(TRAIL_LEFT[i].x, TRAIL_LEFT[i].y);
    for (let i = count - 1; i >= 0; i -= 1) ctx.lineTo(TRAIL_RIGHT[i].x, TRAIL_RIGHT[i].y);
    ctx.closePath();
  };

  const baseWidth = star.trailWidth * vs;
  // Layer 1: Wide luminous pale-blue/champagne atmospheric wake
  buildColossalRibbon(baseWidth * 2.45);
  traceColossalRibbon();
  ctx.fillStyle = withAlpha(STARFALL_PALETTE.paleBlue, alpha * 0.22);
  ctx.fill();

  // Layer 2: Rich golden celestial plasma sheath
  buildColossalRibbon(baseWidth * 1.25);
  traceColossalRibbon();
  ctx.fillStyle = withAlpha(STARFALL_PALETTE.gold, alpha * 0.62);
  ctx.fill();

  // Layer 3: Intense champagne inner stream
  buildColossalRibbon(baseWidth * 0.62);
  traceColossalRibbon();
  ctx.fillStyle = withAlpha(STARFALL_PALETTE.champagne, alpha * 0.84);
  ctx.fill();

  // Layer 4: Incandescent white spine
  buildColossalRibbon(Math.max(2.2, baseWidth * 0.28));
  traceColossalRibbon();
  ctx.fillStyle = withAlpha(STARFALL_PALETTE.core, alpha * 0.96);
  ctx.fill();

  // Layer 5: Cascading diamond shards & 4-point sparks peeling along the colossal wake
  for (let k = 2; k < count - 1; k += 2) {
    const s = k / (count - 1);
    const pt = TRAIL_PTS[k];
    const side = k % 4 === 0 ? 1 : -1;
    const off = side * baseWidth * (0.45 + (1 - s) * 0.55);
    const sx = pt.x + Math.cos(headAngle + Math.PI * 0.5) * off;
    const sy = pt.y + Math.sin(headAngle + Math.PI * 0.5) * off;
    if (k % 4 === 0) {
      drawDiamondPrism(ctx, sx, sy, 2.2 * vs, 4.8 * vs, headAngle + side * 0.35, {
        color: STARFALL_PALETTE.gold,
        secondaryColor: STARFALL_PALETTE.champagne,
        coreColor: STARFALL_PALETTE.core,
        alpha: alpha * s * 0.86,
      });
    } else {
      drawStarFlare(
        ctx,
        sx,
        sy,
        (3.6 + s * 3.4) * vs,
        0.16,
        STARFALL_PALETTE.champagne,
        STARFALL_PALETTE.core,
        alpha * s * 0.88,
        headAngle,
        4,
      );
    }
  }

  // Monumental Colossal Head Silhouette
  const baseR = 11.2 * star.size * vs; // ~37px base radius on 1280x720
  const spin = reduced ? star.rotPhase : star.rotPhase + age * 1.45;

  drawSoftBloom(ctx, head.x, head.y, baseR * 2.9, STARFALL_PALETTE.warmWhite, STARFALL_PALETTE.gold, alpha * 0.52);
  drawSoftBloom(ctx, head.x, head.y, baseR * 1.55, STARFALL_PALETTE.core, STARFALL_PALETTE.champagne, alpha * 0.78);

  // Sleek aerodynamic bow-shock crescent ahead of the colossal nose
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(headAngle);
  ctx.strokeStyle = withAlpha(STARFALL_PALETTE.core, alpha * 0.9);
  ctx.lineWidth = 2.8 * vs;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, baseR * 1.28, -0.78, 0.78);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(STARFALL_PALETTE.paleBlue, alpha * 0.52);
  ctx.lineWidth = 5.4 * vs;
  ctx.beginPath();
  ctx.arc(0, 0, baseR * 1.38, -0.68, 0.68);
  ctx.stroke();
  ctx.restore();

  // Multi-tiered 8-point sculpted crystalline core
  drawBeveledStarShape(
    ctx,
    head.x,
    head.y,
    baseR * 1.34,
    baseR * 0.34,
    4,
    spin + Math.PI * 0.25,
    STARFALL_PALETTE.paleBlue,
    STARFALL_PALETTE.champagne,
    alpha * 0.9,
  );
  drawBeveledStarShape(
    ctx,
    head.x,
    head.y,
    baseR * 1.62,
    baseR * 0.4,
    4,
    spin,
    STARFALL_PALETTE.gold,
    STARFALL_PALETTE.core,
    alpha * 0.98,
  );

  // Commanding diffraction cross flares
  drawStarFlare(
    ctx,
    head.x,
    head.y,
    baseR * 2.55,
    0.075,
    STARFALL_PALETTE.champagne,
    STARFALL_PALETTE.core,
    alpha * 0.96,
    0,
    4,
  );

  // Orbiting crystalline companion shards
  for (let o = 0; o < star.orbiters.length; o += 1) {
    const orb = star.orbiters[o];
    const theta = orb.phase + (reduced ? 0 : age * orb.speed);
    const orbitR = baseR * orb.radiusMul;
    const lx = Math.cos(theta) * orbitR;
    const ly = Math.sin(theta) * orbitR * orb.tilt;
    const cosI = Math.cos(orb.inclination);
    const sinI = Math.sin(orb.inclination);
    const ox = head.x + lx * cosI - ly * sinI;
    const oy = head.y + lx * sinI + ly * cosI;
    drawStarFlare(
      ctx,
      ox,
      oy,
      baseR * orb.sizeMul * 1.35,
      0.18,
      o % 2 === 0 ? STARFALL_PALETTE.champagne : STARFALL_PALETTE.paleBlue,
      STARFALL_PALETTE.core,
      alpha * 0.94,
      theta * 0.5,
      4,
    );
  }
}

function drawFallingStarProjectile(ctx, bf, w, h, star, age, vs, reduced) {
  if (star.archetype === 'colossal') {
    drawColossalMeteor(ctx, bf, w, h, star, age, vs, reduced);
    return;
  }

  const u = clamp01((age - star.startTime) / Math.max(0.05, star.fallDuration));
  if (u <= 0 || u >= 1) return;

  const entryFade = clamp01(u / 0.14);
  const alpha = entryFade * star.brightness;

  const headAngle = drawCurvedStarTrail(ctx, bf, w, h, star, u, vs, alpha) || Math.PI * 0.5;
  evalStarWorldPoint(star, u, _tmpWorldPt);
  const head = bf.worldToScreen(_tmpWorldPt.wx, _tmpWorldPt.wy, w, h, _tmpWorldPt.wz);
  const baseR = 9.5 * star.size * vs;
  const spin = reduced ? star.rotPhase : star.rotPhase + age * star.rotSpeed;

  const bloomColor =
    star.chromaticTint === 'blue'
      ? STARFALL_PALETTE.paleBlue
      : star.chromaticTint === 'lavender'
        ? STARFALL_PALETTE.softLavender
        : STARFALL_PALETTE.gold;

  if (star.archetype === 'fragment') {
    drawSoftBloom(ctx, head.x, head.y, baseR * 1.4, STARFALL_PALETTE.champagne, bloomColor, alpha * 0.36);
    drawDiamondPrism(ctx, head.x, head.y, baseR * 0.42, baseR * 1.45, headAngle - Math.PI * 0.5, {
      color: STARFALL_PALETTE.gold,
      secondaryColor: STARFALL_PALETTE.champagne,
      coreColor: STARFALL_PALETTE.core,
      alpha: alpha * 0.96,
    });
    drawStarFlare(ctx, head.x, head.y, baseR * 0.85, 0.14, STARFALL_PALETTE.champagne, STARFALL_PALETTE.core, alpha * 0.9, headAngle, 4);
    return;
  }

  if (star.archetype === 'brilliant') {
    drawSoftBloom(ctx, head.x, head.y, baseR * 1.65, STARFALL_PALETTE.warmWhite, STARFALL_PALETTE.gold, alpha * 0.44);
    drawBeveledStarShape(
      ctx,
      head.x,
      head.y,
      baseR * 1.25,
      baseR * 0.32,
      4,
      spin,
      STARFALL_PALETTE.gold,
      STARFALL_PALETTE.warmWhite,
      alpha * 0.96,
    );
    drawStarFlare(
      ctx,
      head.x,
      head.y,
      baseR * 1.45,
      0.11,
      STARFALL_PALETTE.champagne,
      STARFALL_PALETTE.core,
      alpha * 0.94,
      headAngle * 0.25,
      4,
    );
    return;
  }

  // Archetype 3 ('celestial'): Multi-layered 8-point crystalline star + orbiters
  drawSoftBloom(
    ctx,
    head.x,
    head.y,
    baseR * 2.0,
    STARFALL_PALETTE.warmWhite,
    bloomColor,
    alpha * 0.46,
  );

  drawBeveledStarShape(
    ctx,
    head.x,
    head.y,
    baseR * 1.12,
    baseR * 0.34,
    4,
    spin + Math.PI * 0.25,
    bloomColor,
    STARFALL_PALETTE.champagne,
    alpha * 0.88,
  );

  drawBeveledStarShape(
    ctx,
    head.x,
    head.y,
    baseR * 1.32,
    baseR * 0.38,
    4,
    spin,
    STARFALL_PALETTE.gold,
    STARFALL_PALETTE.core,
    alpha * 0.98,
  );

  drawStarFlare(
    ctx,
    head.x,
    head.y,
    baseR * 1.65,
    0.09,
    STARFALL_PALETTE.champagne,
    STARFALL_PALETTE.core,
    alpha * 0.96,
    0,
    4,
  );

  for (let o = 0; o < star.orbiters.length; o += 1) {
    const orb = star.orbiters[o];
    const theta = orb.phase + (reduced ? 0 : age * orb.speed);
    const orbitR = baseR * orb.radiusMul;
    const lx = Math.cos(theta) * orbitR;
    const ly = Math.sin(theta) * orbitR * orb.tilt;
    const cosI = Math.cos(orb.inclination);
    const sinI = Math.sin(orb.inclination);
    const ox = head.x + lx * cosI - ly * sinI;
    const oy = head.y + lx * sinI + ly * cosI;

    drawStarFlare(
      ctx,
      ox,
      oy,
      baseR * orb.sizeMul * 1.4,
      0.2,
      o % 2 === 0 ? STARFALL_PALETTE.champagne : STARFALL_PALETTE.paleBlue,
      STARFALL_PALETTE.core,
      alpha * 0.92,
      theta * 0.5,
      4,
    );
  }
}

// ============================================================================
// Ground & Sky Impact Sequences (5 Varied Styles)
// ============================================================================

function drawStarGroundImpact(ctx, bf, w, h, star, age, vs) {
  const dt = age - star.impactTime;
  if (dt < 0 || dt > star.impactDuration) return;
  const p = clamp01(dt / star.impactDuration);
  const fade = Math.pow(1 - p, 1.35);
  const center = bf.worldToScreen(star.targetX, star.targetY, w, h);
  const scaleX = center.scaleX || center.scale * 0.88;
  const scaleY = center.scaleY || center.scale * 0.46;

  // Residual battlefield light pool at impact point
  const baseWorldR = (star.archetype === 'colossal' ? 14 : star.archetype === 'celestial' ? 8.5 : 5.5) * getDepthMultiplier(star.depthTier);
  drawAmbientGroundLight(
    ctx,
    center.x,
    center.y,
    baseWorldR * scaleX * (0.7 + easeOutCubic(p) * 0.75),
    baseWorldR * scaleY * (0.7 + easeOutCubic(p) * 0.75),
    {
      color: STARFALL_PALETTE.gold,
      secondaryColor: STARFALL_PALETTE.champagne,
      coreColor: STARFALL_PALETTE.warmWhite,
      alpha: fade * 0.42 * star.brightness,
    },
  );

  // Ground-level celestial mark & constellation pattern (brilliant, celestial, sovereign)
  if (star.constellationNodes.length >= 3) {
    const markAlpha = smoothWindow(p, 0.08, 0.45, 0.98) * star.brightness;
    if (markAlpha > 0.02) {
      const grow = 0.68 + easeOutCubic(Math.min(1, p * 2.2)) * 0.34;
      const nCount = star.constellationNodes.length;
      for (let i = 0; i < nCount; i += 1) {
        const node = star.constellationNodes[i];
        const sp = bf.worldToScreen(
          star.targetX + node.dx * grow,
          star.targetY + node.dy * grow,
          w,
          h,
        );
        SCRATCH_NODES[i].x = sp.x;
        SCRATCH_NODES[i].y = sp.y;
      }

      // Fine constellation lines linking ground nodes
      ctx.strokeStyle = withAlpha(STARFALL_PALETTE.champagne, markAlpha * 0.56);
      ctx.lineWidth = Math.max(0.8, 1.15 * vs);
      ctx.beginPath();
      for (let i = 0; i < nCount; i += 1) {
        const cur = SCRATCH_NODES[i];
        const next = SCRATCH_NODES[(i + 1) % nCount];
        ctx.moveTo(cur.x, cur.y);
        ctx.lineTo(next.x, next.y);
        if (i % 2 === 0 && nCount >= 4) {
          const cross = SCRATCH_NODES[(i + 2) % nCount];
          ctx.moveTo(cur.x, cur.y);
          ctx.lineTo(cross.x, cross.y);
        }
      }
      ctx.stroke();

      // Ground star pinpoints at constellation vertices
      for (let i = 0; i < nCount; i += 1) {
        drawStarFlare(
          ctx,
          SCRATCH_NODES[i].x,
          SCRATCH_NODES[i].y,
          (star.archetype === 'colossal' ? 5.4 : 3.4) * vs,
          0.22,
          STARFALL_PALETTE.gold,
          STARFALL_PALETTE.core,
          markAlpha * 0.85,
          0,
          4,
        );
      }

      if (star.archetype === 'colossal' || star.archetype === 'celestial') {
        const sealRx = star.groundMarkRadius * scaleX * grow;
        const sealRy = star.groundMarkRadius * scaleY * grow;
        drawSymmetricalSigilRing(ctx, center.x, center.y, sealRx, sealRy, {
          count: star.archetype === 'colossal' ? 8 : 4,
          arcFill: 0.56,
          rotation: star.rotPhase + p * 0.35,
          lineWidth: (star.archetype === 'colossal' ? 1.9 : 1.2) * vs,
          color: STARFALL_PALETTE.gold,
          coreColor: STARFALL_PALETTE.warmWhite,
          alpha: markAlpha * 0.62,
          tickStyle: 'compass',
        });
      }
    }
  }

  // Expanding perspective shockwaves
  const waveEase = easeOutQuart(p);
  const waveRx = baseWorldR * scaleX * (0.28 + waveEase * 1.42);
  const waveRy = baseWorldR * scaleY * (0.28 + waveEase * 1.42);
  drawShockwaveRipple(ctx, center.x, center.y, waveRx, waveRy, {
    width: (star.archetype === 'colossal' ? 4.6 : star.archetype === 'celestial' ? 3.2 : 2.1) * (1 - p * 0.5) * vs,
    color: star.chromaticTint === 'blue' ? STARFALL_PALETTE.paleBlue : STARFALL_PALETTE.gold,
    secondaryColor: STARFALL_PALETTE.champagne,
    coreColor: STARFALL_PALETTE.core,
    alpha: fade * 0.78 * star.brightness,
  });

  if (star.archetype === 'colossal' || star.archetype === 'celestial') {
    const p2 = clamp01((p - 0.12) / 0.88);
    if (p2 > 0 && p2 < 1) {
      const r2 = easeOutCubic(p2);
      drawShockwaveRipple(
        ctx,
        center.x,
        center.y,
        baseWorldR * scaleX * (0.18 + r2 * 1.15),
        baseWorldR * scaleY * (0.18 + r2 * 1.15),
        {
          width: 2.2 * (1 - p2 * 0.6) * vs,
          color: STARFALL_PALETTE.champagne,
          secondaryColor: STARFALL_PALETTE.softLavender,
          coreColor: STARFALL_PALETTE.core,
          alpha: Math.pow(1 - p2, 1.4) * 0.62 * star.brightness,
        },
      );
    }
  }
}

function drawStarSkyImpact(ctx, bf, w, h, star, age, vs, reduced) {
  const dt = age - star.impactTime;
  if (dt < 0 || dt > star.impactDuration) return;
  const p = clamp01(dt / star.impactDuration);
  const center = bf.worldToScreen(star.targetX, star.targetY, w, h, 2.2);
  const baseSize = 18 * star.size * vs;
  const alpha = star.brightness;

  // 1. Instantaneous Contact Flash (0 .. 0.16 of impact)
  if (p < 0.22) {
    const flashEnv = Math.pow(1 - p / 0.22, 1.5);
    drawSoftBloom(ctx, center.x, center.y, baseSize * (1.2 + p * 2.2), STARFALL_PALETTE.core, STARFALL_PALETTE.champagne, flashEnv * 0.92 * alpha);
    drawStarFlare(ctx, center.x, center.y, baseSize * (1.65 + p * 1.8), 0.1, STARFALL_PALETTE.warmWhite, STARFALL_PALETTE.core, flashEnv * 0.98 * alpha, star.rotPhase, 4);
  }

  // 2. Varied Primary Burst Signature
  const burstEnv = smoothWindow(p, 0.05, 0.28, 0.85) * alpha;
  if (burstEnv > 0.02) {
    const expand = easeOutQuart(Math.min(1, p * 1.6));
    if (star.impactStyle === 'starburst') {
      // Delicate layered 8-point celestial diffraction flare (razor-thin rays + warm gold bloom)
      drawSoftBloom(
        ctx,
        center.x,
        center.y,
        baseSize * (0.9 + expand * 0.9),
        STARFALL_PALETTE.warmWhite,
        STARFALL_PALETTE.gold,
        burstEnv * 0.52,
      );
      drawStarFlare(
        ctx,
        center.x,
        center.y,
        baseSize * (1.2 + expand * 1.45),
        0.065,
        STARFALL_PALETTE.gold,
        STARFALL_PALETTE.core,
        burstEnv * 0.94,
        star.rotPhase * 0.2,
        4,
      );
      drawStarFlare(
        ctx,
        center.x,
        center.y,
        baseSize * (0.82 + expand * 0.98),
        0.085,
        STARFALL_PALETTE.champagne,
        STARFALL_PALETTE.warmWhite,
        burstEnv * 0.82,
        star.rotPhase * 0.2 + Math.PI * 0.25,
        4,
      );
    } else if (star.impactStyle === 'cross_flare') {
      // Wide dramatic 4-point cross flare with subtle cool refraction halo
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.scale(1.65, 0.85);
      drawStarFlare(ctx, 0, 0, baseSize * (1.1 + expand * 1.4), 0.075, STARFALL_PALETTE.paleBlue, STARFALL_PALETTE.core, burstEnv * 0.72, 0, 4);
      ctx.restore();
      drawStarFlare(ctx, center.x, center.y, baseSize * (0.85 + expand * 1.3), 0.12, STARFALL_PALETTE.gold, STARFALL_PALETTE.core, burstEnv * 0.92, Math.PI * 0.25, 4);
    } else if (star.impactStyle === 'crystal_shatter') {
      // Radial faceted diamond crystals exploding outward
      const crystalCount = star.archetype === 'colossal' ? 8 : 5;
      for (let c = 0; c < crystalCount; c += 1) {
        const ang = star.rotPhase + (Math.PI * 2 * c) / crystalCount;
        const dist = baseSize * (0.28 + expand * 1.35);
        const cx = center.x + Math.cos(ang) * dist;
        const cy = center.y + Math.sin(ang) * dist * 0.62 - expand * baseSize * 0.38;
        drawDiamondPrism(ctx, cx, cy, baseSize * 0.24, baseSize * 0.56, ang + Math.PI * 0.5, {
          color: c % 2 === 0 ? STARFALL_PALETTE.gold : STARFALL_PALETTE.paleBlue,
          secondaryColor: STARFALL_PALETTE.champagne,
          coreColor: STARFALL_PALETTE.core,
          alpha: burstEnv * 0.9,
        });
      }
    } else if (star.impactStyle === 'constellation_seal') {
      // Piercing ascending luminous light spire + cross glint
      const spireH = baseSize * (1.8 + expand * 2.1);
      drawTaperedNeedle(ctx, center.x, center.y + baseSize * 0.2, center.x, center.y - spireH, {
        width: baseSize * 0.36 * (1 - p * 0.55),
        color: STARFALL_PALETTE.gold,
        coreColor: STARFALL_PALETTE.core,
        alpha: burstEnv * 0.92,
      });
      drawStarFlare(ctx, center.x, center.y, baseSize * 1.1, 0.14, STARFALL_PALETTE.champagne, STARFALL_PALETTE.core, burstEnv * 0.9, 0, 4);
    } else {
      // 'nova_wave': radial light streaks + crisp core glint
      const rayNum = star.archetype === 'colossal' ? 12 : 8;
      for (let r = 0; r < rayNum; r += 1) {
        const ang = star.rotPhase + (Math.PI * 2 * r) / rayNum;
        const rIn = baseSize * (0.2 + expand * 0.45);
        const rOut = baseSize * (0.75 + expand * (r % 2 === 0 ? 1.55 : 1.05));
        drawTaperedNeedle(
          ctx,
          center.x + Math.cos(ang) * rIn,
          center.y + Math.sin(ang) * rIn * 0.65,
          center.x + Math.cos(ang) * rOut,
          center.y + Math.sin(ang) * rOut * 0.65,
          {
            width: Math.max(1.2, baseSize * 0.12),
            color: r % 2 === 0 ? STARFALL_PALETTE.champagne : STARFALL_PALETTE.gold,
            coreColor: STARFALL_PALETTE.core,
            alpha: burstEnv * 0.88,
          },
        );
      }
    }
  }

  // 3. Directional Energy Shards & Scattering Luminous Particles
  const scatterEnv = smoothWindow(p, 0.04, 0.35, 1.0) * alpha;
  if (scatterEnv > 0.02) {
    const travel = easeOutCubic(p);
    for (let s = 0; s < star.shardSeeds.length; s += 1) {
      const sh = star.shardSeeds[s];
      const dist = baseSize * (0.32 + travel * 1.95 * sh.distMul);
      const sx = center.x + Math.cos(sh.angle) * dist;
      const sy = center.y + Math.sin(sh.angle) * dist * 0.56 - travel * baseSize * 0.65 * sh.liftMul + travel * travel * baseSize * 0.35;

      if (sh.isGlint) {
        drawStarFlare(
          ctx,
          sx,
          sy,
          2.6 * sh.sizeMul * vs,
          0.2,
          STARFALL_PALETTE.champagne,
          STARFALL_PALETTE.core,
          scatterEnv * 0.9,
          sh.spin * p,
          4,
        );
      } else if (sh.isCrystal) {
        drawDiamondPrism(ctx, sx, sy, 1.6 * sh.sizeMul * vs, 3.4 * sh.sizeMul * vs, sh.angle + sh.spin * p, {
          color: STARFALL_PALETTE.gold,
          secondaryColor: STARFALL_PALETTE.champagne,
          coreColor: STARFALL_PALETTE.core,
          alpha: scatterEnv * 0.82,
        });
      } else {
        ctx.fillStyle = withAlpha(STARFALL_PALETTE.warmWhite, scatterEnv * 0.88);
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(0.8, 1.45 * sh.sizeMul * vs), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// ============================================================================
// Zenith Constellation Canopy, Astra Dais Connection & Grand Finale Nova
// ============================================================================

function drawSkyConstellationCanopy(ctx, w, h, plan, age, vs, reduced) {
  const canopyEnv = smoothWindow(age / plan.duration, 0.04, 0.66, 0.95);
  if (canopyEnv <= 0.015) return;

  // Subtle upper-sky celestial twilight veil + radiant zenith opening glow (keeps arena crisp)
  if (typeof ctx.createLinearGradient === 'function') {
    const skyVeil = ctx.createLinearGradient(0, 0, 0, h * 0.48);
    skyVeil.addColorStop(0, withAlpha('#090e26', canopyEnv * 0.48));
    skyVeil.addColorStop(0.5, withAlpha('#131b3d', canopyEnv * 0.2));
    skyVeil.addColorStop(1, 'rgba(13, 18, 42, 0)');
    ctx.fillStyle = skyVeil;
    ctx.fillRect(0, 0, w, h * 0.48);
  }
  drawSoftBloom(ctx, w * 0.5, h * 0.06, w * 0.36, STARFALL_PALETTE.champagne, STARFALL_PALETTE.paleBlue, canopyEnv * 0.16, 0.28);

  // Subtle celestial astrolabe arc in the high zenith sky
  drawEllipticalHalo(ctx, w * 0.5, h * 0.04, w * 0.28, h * 0.11, {
    lineWidth: 1.15 * vs,
    color: STARFALL_PALETTE.champagne,
    coreColor: STARFALL_PALETTE.warmWhite,
    alpha: canopyEnv * 0.24,
    startAngle: 0.12,
    endAngle: Math.PI - 0.12,
  });

  // Constellation fine lines
  const stars = plan.canopyStars;
  ctx.strokeStyle = withAlpha(STARFALL_PALETTE.champagne, canopyEnv * 0.34);
  ctx.lineWidth = Math.max(0.75, 0.95 * vs);
  ctx.beginPath();
  for (let i = 0; i < plan.canopyEdges.length; i += 1) {
    const e = plan.canopyEdges[i];
    const a = stars[e.a];
    const b = stars[e.b];
    if (!a || !b) continue;
    ctx.moveTo(a.nx * w, a.ny * h);
    ctx.lineTo(b.nx * w, b.ny * h);
  }
  ctx.stroke();

  // Twinkling canopy stars & occasional 4-point glints
  for (let i = 0; i < stars.length; i += 1) {
    const s = stars[i];
    const twinkle = reduced ? 0.85 : 0.62 + 0.38 * Math.sin(age * s.twinkleSpeed + s.twinklePhase);
    const a = canopyEnv * s.brightness * twinkle;
    if (a <= 0.03) continue;
    const sx = s.nx * w;
    const sy = s.ny * h;
    if (s.isFourPoint) {
      drawStarFlare(ctx, sx, sy, s.size * 2.4 * vs, 0.16, s.color, STARFALL_PALETTE.core, a, 0, 4);
    } else {
      ctx.fillStyle = withAlpha(s.color, a * 0.42);
      ctx.beginPath();
      ctx.arc(sx, sy, s.size * 1.65 * vs, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = withAlpha(STARFALL_PALETTE.core, a * 0.92);
      ctx.beginPath();
      ctx.arc(sx, sy, s.size * 0.68 * vs, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawAstraDaisSummoning(ctx, bf, w, h, plan, age, daisRect, vs) {
  const summonWindow = smoothWindow(age, 0.02, 0.55, 1.35);
  if (summonWindow <= 0.015) return;

  const daisAnchor = daisRect
    ? { x: daisRect.cx, y: daisRect.y + 18 * vs }
    : bf.worldToScreen(0, 52, w, h, 8);
  const skyTargetX = w * 0.44;
  const skyTargetY = h * 0.12;

  // Radiant golden-white summoning crest above Astra's Dais
  drawSoftBloom(ctx, daisAnchor.x, daisAnchor.y, 44 * vs, STARFALL_PALETTE.warmWhite, STARFALL_PALETTE.gold, summonWindow * 0.52);
  drawStarFlare(ctx, daisAnchor.x, daisAnchor.y, 18 * vs, 0.14, STARFALL_PALETTE.champagne, STARFALL_PALETTE.core, summonWindow * 0.9, age * 0.6, 4);

  // Ascending tapered celestial ribbons linking Astra Dais -> zenith canopy
  const uProg = clamp01(age / 0.95);
  const uStart = Math.max(0, uProg - 0.58);
  const uEnd = Math.min(1, uProg * 1.15);
  if (uEnd > uStart + 0.03) {
    for (let i = 0; i < 3; i += 1) {
      const p0 = { x: daisAnchor.x + (i - 1) * 8 * vs, y: daisAnchor.y };
      const p1 = { x: lerp(daisAnchor.x, skyTargetX, 0.42) + (i - 1) * 32 * vs, y: daisAnchor.y * 0.42 - i * 16 * vs };
      const p2 = { x: skyTargetX + (i - 1) * 84 * vs, y: skyTargetY + i * 12 * vs };
      drawAnalyticalRibbon(ctx, (u) => sampleQuadBezier(p0, p1, p2, u), {
        uStart,
        uEnd,
        steps: 24,
        maxWidth: (i === 1 ? 4.4 : 2.6) * vs,
        color: i === 2 ? STARFALL_PALETTE.paleBlue : STARFALL_PALETTE.gold,
        coreColor: STARFALL_PALETTE.core,
        alpha: summonWindow * 0.78,
        taperProfile: 'comet',
      });
    }
  }

  // Gentle restorative warm-gold rising motes over allied units
  for (let i = 0; i < plan.healMotes.length; i += 1) {
    const m = plan.healMotes[i];
    const localT = (age - m.startTime) / Math.max(0.1, m.duration);
    if (localT <= 0 || localT >= 1) continue;
    const sp = bf.worldToScreen(m.wx, m.wy, w, h, 2 + localT * 14);
    const sway = Math.sin(localT * 6 + m.swayPhase) * 6 * vs;
    const a = smoothWindow(localT, 0.15, 0.45, 1) * 0.85;
    drawStarFlare(ctx, sp.x + sway, sp.y, m.size * 1.8 * vs, 0.2, STARFALL_PALETTE.champagne, STARFALL_PALETTE.core, a, localT, 4);
  }
}

function drawColossalAnticipation(ctx, bf, w, h, plan, age, vs, layer) {
  const antStart = plan.anticipationStart ?? 3.05 * plan.timeScale;
  const colStart = plan.colossalStart ?? 3.55 * plan.timeScale;
  const colImpact = plan.colossalImpact ?? plan.novaTime;
  if (age < antStart || age > colImpact) return;

  const antSpan = Math.max(0.15, colStart - antStart);
  const antRatio = clamp01((age - antStart) / antSpan);
  const flightRatio = clamp01((age - colStart) / Math.max(0.1, colImpact - colStart));

  if (layer === 'ground') {
    const center = bf.worldToScreen(plan.epicenter.x, plan.epicenter.y, w, h);
    const scaleX = center.scaleX || center.scale * 0.88;
    const scaleY = center.scaleY || center.scale * 0.46;
    const gatherAlpha = clamp01(antRatio * 1.4) * (0.45 + 0.55 * flightRatio);

    // Growing convergence ground illumination beneath colossal descent
    drawAmbientGroundLight(ctx, center.x, center.y, 26 * scaleX, 26 * scaleY, {
      color: STARFALL_PALETTE.gold,
      secondaryColor: STARFALL_PALETTE.champagne,
      coreColor: STARFALL_PALETTE.warmWhite,
      alpha: gatherAlpha * 0.48,
    });

    // Contracting celestial focus ring signaling the imminent colossal impact
    const shrink = 1.35 - antRatio * 0.35 - flightRatio * 0.32;
    drawSymmetricalSigilRing(ctx, center.x, center.y, 16 * scaleX * shrink, 16 * scaleY * shrink, {
      count: 4,
      arcFill: 0.58,
      rotation: plan.reducedMotion ? 0 : age * 0.85,
      lineWidth: 1.6 * vs,
      color: STARFALL_PALETTE.champagne,
      coreColor: STARFALL_PALETTE.core,
      alpha: gatherAlpha * 0.72,
      tickStyle: 'compass',
    });
    return;
  }

  // Sky layer: luminous sky rift opens at upper colossal trajectory entry point
  const riftEnd = colStart + 0.3 * plan.timeScale;
  if (age > riftEnd || !plan.colossalMeteor) return;
  const riftEnv = smoothWindow((age - antStart) / Math.max(0.15, riftEnd - antStart), 0.25, 0.65, 1.0);
  if (riftEnv <= 0.02) return;

  evalStarWorldPoint(plan.colossalMeteor, 0.25, _tmpWorldPt);
  const sp = bf.worldToScreen(_tmpWorldPt.wx, _tmpWorldPt.wy, w, h, _tmpWorldPt.wz);
  const rx = sp.x;
  const ry = Math.max(28, Math.min(h * 0.22, sp.y));

  drawSoftBloom(ctx, rx, ry, 58 * vs, STARFALL_PALETTE.core, STARFALL_PALETTE.paleBlue, riftEnv * 0.55);
  drawSoftBloom(ctx, rx, ry, 34 * vs, STARFALL_PALETTE.core, STARFALL_PALETTE.gold, riftEnv * 0.82);

  // Converging light filaments drawing into the sky portal before colossal release
  const rayCount = 6;
  const reach = (52 - antRatio * 24) * vs;
  for (let i = 0; i < rayCount; i += 1) {
    const a = (Math.PI * 2 * i) / rayCount + (plan.reducedMotion ? 0 : age * 0.6);
    drawTaperedNeedle(
      ctx,
      rx + Math.cos(a) * reach,
      ry + Math.sin(a) * reach * 0.55,
      rx + Math.cos(a) * (4 * vs),
      ry + Math.sin(a) * (2.5 * vs),
      {
        width: 2.2 * vs,
        color: i % 2 === 0 ? STARFALL_PALETTE.champagne : STARFALL_PALETTE.paleBlue,
        coreColor: STARFALL_PALETTE.core,
        alpha: riftEnv * 0.78,
      },
    );
  }
  drawStarFlare(ctx, rx, ry, (18 + antRatio * 14) * vs, 0.1, STARFALL_PALETTE.champagne, STARFALL_PALETTE.core, riftEnv * 0.96, 0, 4);
}

function drawGrandFinaleGround(ctx, bf, w, h, plan, age, vs) {
  const dt = age - plan.novaTime;
  const buildup = clamp01((age - (plan.novaTime - 0.55)) / 0.55);
  const center = bf.worldToScreen(plan.epicenter.x, plan.epicenter.y, w, h);
  const scaleX = center.scaleX || center.scale * 0.88;
  const scaleY = center.scaleY || center.scale * 0.46;

  // 1. Pre-Nova resonance build-up & battlefield-wide illumination
  if (buildup > 0 && dt < plan.novaDuration) {
    const postFade = dt > 0 ? Math.pow(1 - clamp01(dt / plan.novaDuration), 1.35) : 1;
    const lightAlpha = (dt > 0 ? 0.86 * postFade : 0.34 * buildup);
    drawAmbientGroundLight(
      ctx,
      center.x,
      center.y,
      Math.max(w * 0.46, 48 * scaleX),
      Math.max(h * 0.34, 48 * scaleY),
      {
        color: STARFALL_PALETTE.gold,
        secondaryColor: STARFALL_PALETTE.champagne,
        coreColor: STARFALL_PALETTE.warmWhite,
        alpha: lightAlpha * 0.72,
      },
    );
  }

  if (dt < 0 || dt > plan.novaDuration) return;
  const p = clamp01(dt / plan.novaDuration);
  const alpha = Math.pow(1 - p, 1.3);

  // 2. Grand Inscribed Celestial Astrolabe Seal across the battlefield floor
  const sealScale = 0.32 + easeOutQuart(Math.min(1, p * 1.35)) * 0.92;
  const sealRx = 34 * scaleX * sealScale;
  const sealRy = 34 * scaleY * sealScale;
  drawSymmetricalSigilRing(ctx, center.x, center.y, sealRx, sealRy, {
    count: 8,
    arcFill: 0.64,
    rotation: plan.reducedMotion ? 0 : p * 0.45,
    lineWidth: 2.2 * vs,
    color: STARFALL_PALETTE.gold,
    coreColor: STARFALL_PALETTE.core,
    alpha: alpha * 0.86,
    tickStyle: 'compass',
    innerRingRatio: 0.64,
    innerAlpha: 0.5,
  });

  // 3. Triple Staggered Battlefield-Wide Expanding Shockwaves
  const waveOffsets = [0, 0.08, 0.17];
  for (let i = 0; i < waveOffsets.length; i += 1) {
    const wp = clamp01((p - waveOffsets[i]) / Math.max(0.2, 1 - waveOffsets[i]));
    if (wp <= 0 || wp >= 1) continue;
    const grow = 0.22 + easeOutQuart(wp) * (1.5 + i * 0.25);
    const rx = 42 * scaleX * grow;
    const ry = 42 * scaleY * grow;
    drawShockwaveRipple(ctx, center.x, center.y, rx, ry, {
      width: (5.8 - i * 1.2 - wp * 2.8) * vs,
      color: i === 1 ? STARFALL_PALETTE.champagne : i === 2 ? STARFALL_PALETTE.paleBlue : STARFALL_PALETTE.gold,
      secondaryColor: STARFALL_PALETTE.warmWhite,
      coreColor: STARFALL_PALETTE.core,
      alpha: Math.pow(1 - wp, 1.35) * (0.9 - i * 0.14),
    });
  }
}

function drawGrandFinaleSky(ctx, bf, w, h, plan, age, vs) {
  const dt = age - plan.novaTime;
  if (dt < -0.15 || dt > plan.novaDuration) return;

  const center = bf.worldToScreen(plan.epicenter.x, plan.epicenter.y, w, h, 3.5);
  const p = clamp01(Math.max(0, dt) / plan.novaDuration);

  // Brief convergence prelude right before simultaneous strike
  if (dt < 0) {
    const pre = clamp01((dt + 0.15) / 0.15);
    drawSoftBloom(ctx, center.x, center.y, 48 * pre * vs, STARFALL_PALETTE.core, STARFALL_PALETTE.champagne, pre * 0.55);
    return;
  }

  const prevComposite = ctx.globalCompositeOperation;
  try {
    ctx.globalCompositeOperation = 'lighter';

    // 1. Controlled Battlefield-Wide Celestial Illumination Wash (never opaque)
    if (p < 0.42) {
      const illum = Math.pow(1 - p / 0.42, 1.65) * 0.28;
      if (typeof ctx.createRadialGradient === 'function') {
        const g = ctx.createRadialGradient(center.x, center.y, 12, center.x, center.y, Math.max(w, h) * 0.78);
        g.addColorStop(0, withAlpha(STARFALL_PALETTE.core, illum * 1.1));
        g.addColorStop(0.32, withAlpha(STARFALL_PALETTE.champagne, illum * 0.72));
        g.addColorStop(0.7, withAlpha(STARFALL_PALETTE.gold, illum * 0.28));
        g.addColorStop(1, 'rgba(226, 183, 91, 0)');
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = withAlpha(STARFALL_PALETTE.champagne, illum * 0.45);
      }
      ctx.fillRect(0, 0, w, h);
    }

    // 2. Radiant Golden-White Colossal Impact Burst (gradient-tapered rays + translucent layered starburst)
    const burstAlpha = smoothWindow(p, 0.03, 0.24, 0.82);
    if (burstAlpha > 0.015) {
      const rayReach = Math.max(w, h) * (0.16 + easeOutQuart(Math.min(1, p * 1.45)) * 0.3);
      for (let i = 0; i < plan.novaRays.length; i += 1) {
        const ray = plan.novaRays[i];
        const rIn = rayReach * 0.05;
        const rOut = rayReach * ray.lengthMul;
        const x1 = center.x + Math.cos(ray.angle) * rIn;
        const y1 = center.y + Math.sin(ray.angle) * rIn * 0.68;
        const x2 = center.x + Math.cos(ray.angle) * rOut;
        const y2 = center.y + Math.sin(ray.angle) * rOut * 0.68;
        const rayCol = ray.isCool ? STARFALL_PALETTE.paleBlue : STARFALL_PALETTE.gold;

        if (typeof ctx.createLinearGradient === 'function') {
          const rayGrad = ctx.createLinearGradient(x1, y1, x2, y2);
          rayGrad.addColorStop(0, withAlpha(STARFALL_PALETTE.core, burstAlpha * 0.82));
          rayGrad.addColorStop(0.32, withAlpha(STARFALL_PALETTE.champagne, burstAlpha * 0.56));
          rayGrad.addColorStop(0.72, withAlpha(rayCol, burstAlpha * 0.24));
          rayGrad.addColorStop(1, withAlpha(rayCol, 0));
          ctx.strokeStyle = rayGrad;
        } else {
          ctx.strokeStyle = withAlpha(rayCol, burstAlpha * 0.45);
        }
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1.1, ray.width * (1 - p * 0.48) * 0.78 * vs);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Layered translucent golden-white bloom + delicate prismatic sky crown (keeps center units legible)
      const coreR = (58 + easeOutCubic(Math.min(1, p * 2.1)) * 96) * vs;
      drawSoftBloom(ctx, center.x, center.y, coreR * 1.5, STARFALL_PALETTE.core, STARFALL_PALETTE.champagne, burstAlpha * 0.6);
      drawSoftBloom(ctx, center.x, center.y, coreR * 0.9, STARFALL_PALETTE.core, STARFALL_PALETTE.gold, burstAlpha * 0.76);

      // Subtle pale-blue & champagne sky refraction halo
      drawEllipticalHalo(ctx, center.x, center.y, coreR * 0.72, coreR * 0.42, {
        lineWidth: 1.8 * vs,
        color: STARFALL_PALETTE.paleBlue,
        coreColor: STARFALL_PALETTE.core,
        alpha: burstAlpha * 0.54,
      });

      // Razor-sharp 4-point primary & diagonal celestial diffraction flares (never opaque blobs)
      drawStarFlare(
        ctx,
        center.x,
        center.y,
        coreR * 1.18,
        0.055,
        STARFALL_PALETTE.gold,
        STARFALL_PALETTE.core,
        burstAlpha * 0.9,
        plan.reducedMotion ? 0 : p * 0.12,
        4,
      );
      drawStarFlare(
        ctx,
        center.x,
        center.y,
        coreR * 0.74,
        0.075,
        STARFALL_PALETTE.paleBlue,
        STARFALL_PALETTE.warmWhite,
        burstAlpha * 0.72,
        Math.PI * 0.25 + (plan.reducedMotion ? 0 : p * 0.18),
        4,
      );
    }
  } finally {
    ctx.globalCompositeOperation = prevComposite || 'source-over';
  }

  // 3. Expanding Crystalline Shards from Nova Epicenter
  const shardAlpha = smoothWindow(p, 0.03, 0.36, 0.88);
  if (shardAlpha > 0.02) {
    const spread = easeOutCubic(p) * Math.max(w * 0.36, 220 * vs);
    for (let i = 0; i < plan.novaShards.length; i += 1) {
      const sh = plan.novaShards[i];
      const dist = spread * sh.distMul;
      const sx = center.x + Math.cos(sh.angle) * dist;
      const sy = center.y + Math.sin(sh.angle) * dist * 0.58 - easeOutQuadOffset(p) * 28 * vs;
      const col = sh.isCool ? STARFALL_PALETTE.paleBlue : STARFALL_PALETTE.gold;
      if (sh.isGlint) {
        drawStarFlare(ctx, sx, sy, sh.size * 2.2 * vs, 0.16, col, STARFALL_PALETTE.core, shardAlpha * 0.92, sh.spin * p, 4);
      } else {
        drawDiamondPrism(ctx, sx, sy, sh.size * 0.55 * vs, sh.size * 1.35 * vs, sh.angle + sh.spin * p, {
          color: col,
          secondaryColor: STARFALL_PALETTE.champagne,
          coreColor: STARFALL_PALETTE.core,
          alpha: shardAlpha * 0.85,
        });
      }
    }
  }

  // 4. Lingering Celestial Motes & Twinkling Glints (Dissipation Phase)
  const lingerEnv = smoothWindow(p, 0.18, 0.58, 1.0);
  if (lingerEnv > 0.015) {
    const driftT = Math.max(0, dt - 0.18 * plan.novaDuration);
    for (let i = 0; i < plan.lingeringMotes.length; i += 1) {
      const m = plan.lingeringMotes[i];
      const mx = m.nx * w + m.vx * driftT;
      const my = m.ny * h + m.vy * driftT;
      const twinkle = plan.reducedMotion ? 0.85 : 0.5 + 0.5 * Math.sin(age * m.twinkleFreq + m.phase);
      const a = lingerEnv * twinkle * 0.88;
      if (a <= 0.02) continue;
      if (m.isFourPoint) {
        drawStarFlare(ctx, mx, my, m.size * 2.2 * vs, 0.18, m.color, STARFALL_PALETTE.core, a, m.phase, 4);
      } else {
        ctx.fillStyle = withAlpha(m.color, a * 0.42);
        ctx.beginPath();
        ctx.arc(mx, my, m.size * 1.8 * vs, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = withAlpha(STARFALL_PALETTE.core, a * 0.95);
        ctx.beginPath();
        ctx.arc(mx, my, m.size * 0.72 * vs, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function easeOutQuadOffset(p) {
  return 1 - (1 - p) * (1 - p);
}

// ============================================================================
// Public Render Entry Point
// ============================================================================

export function drawAstraStarfallWorldEffect(
  ctx,
  bf,
  w,
  h,
  fx,
  layer,
  _unitByUid = null,
  daisRect = null,
) {
  if (!ctx || !bf || !fx) return;
  if (fx.meta?.awaitingAwakening) return;

  if (!fx.meta?.starfallPlan) {
    const fallbackPlan = createStarfallPlan({
      seed: fx.seed || 777,
      reducedMotion: Boolean(fx.reducedMotion),
    });
    fx.meta = { ...(fx.meta || {}), starfallPlan: fallbackPlan };
  }

  const plan = fx.meta.starfallPlan;
  const age = Math.max(0, fx.age || 0);
  const t = clamp01(age / Math.max(0.05, fx.duration || plan.duration));
  if (t >= 1) return;

  const refPt = bf.worldToScreen(50, 50, w, h);
  const vs = Math.max(0.72, Math.min(1.26, (refPt.scale || 7.2) / 7.4));
  const stars = plan.stars;

  ctx.save();
  try {
    if (layer === 'ground') {
      // Soft progressive celestial floor illumination during active bombardment
      const ambientEnv = smoothWindow(t, 0.08, 0.62, 0.96);
      if (ambientEnv > 0.015) {
        const mid = bf.worldToScreen(56, 50, w, h);
        const rx = 44 * (mid.scaleX || mid.scale * 0.88);
        const ry = 44 * (mid.scaleY || mid.scale * 0.46);
        drawAmbientGroundLight(ctx, mid.x, mid.y, rx, ry, {
          color: STARFALL_PALETTE.gold,
          secondaryColor: STARFALL_PALETTE.champagne,
          coreColor: STARFALL_PALETTE.warmWhite,
          alpha: ambientEnv * 0.24,
        });
      }

      for (let i = 0; i < stars.length; i += 1) {
        const star = stars[i];
        if (age >= star.impactTime && age <= star.impactTime + star.impactDuration) {
          drawStarGroundImpact(ctx, bf, w, h, star, age, vs);
        }
      }

      drawColossalAnticipation(ctx, bf, w, h, plan, age, vs, 'ground');
      drawGrandFinaleGround(ctx, bf, w, h, plan, age, vs);
      return;
    }

    if (layer === 'sky') {
      // 1. Opened Celestial Star Canopy & Constellations
      drawSkyConstellationCanopy(ctx, w, h, plan, age, vs, plan.reducedMotion);

      // 2. Astra Commander Dais Summoning Ribbons & Ally Healing Motes
      drawAstraDaisSummoning(ctx, bf, w, h, plan, age, daisRect, vs);

      // 3. Anticipation Sky Portal before Colossal Meteor
      drawColossalAnticipation(ctx, bf, w, h, plan, age, vs, 'sky');

      // 4. Sky Emergence Rifts + Falling Star Projectiles (depth-sorted far -> mid -> near -> colossal)
      for (let i = 0; i < stars.length; i += 1) {
        const star = stars[i];
        const riftDt = age - (star.startTime - 0.16 * plan.timeScale);
        if (star.archetype !== 'colossal' && riftDt > 0 && riftDt < 0.42 * plan.timeScale) {
          const rp = clamp01(riftDt / (0.42 * plan.timeScale));
          const riftEnv = Math.sin(rp * Math.PI);
          evalStarWorldPoint(star, 0, _tmpWorldPt);
          const sp = bf.worldToScreen(_tmpWorldPt.wx, _tmpWorldPt.wy, w, h, _tmpWorldPt.wz);
          if (sp.y >= -20 && sp.y <= h * 0.65) {
            drawStarFlare(
              ctx,
              sp.x,
              sp.y,
              (5.5 + star.size * 4.5) * vs,
              0.14,
              STARFALL_PALETTE.champagne,
              STARFALL_PALETTE.core,
              riftEnv * 0.78 * star.brightness,
              0,
              4,
            );
          }
        }

        if (age >= star.startTime && age <= star.impactTime) {
          drawFallingStarProjectile(ctx, bf, w, h, star, age, vs, plan.reducedMotion);
        }
      }

      // 5. Multi-Layered Star Impacts
      for (let i = 0; i < stars.length; i += 1) {
        const star = stars[i];
        if (age >= star.impactTime && age <= star.impactTime + star.impactDuration) {
          drawStarSkyImpact(ctx, bf, w, h, star, age, vs, plan.reducedMotion);
        }
      }

      // 6. Colossal Meteor Massive Final Impact & Lingering Celestial Aftermath
      drawGrandFinaleSky(ctx, bf, w, h, plan, age, vs);
    }
  } finally {
    ctx.restore();
  }
}
