/**
 * UnitVfxMotionEngine — Motion-First Procedural VFX Animation Library for Star Struck.
 *
 * Built around genuine internal animation, natural easing/inertia/follow-through,
 * procedural fluid/mechanical/3D-ballistic deformation, and strict normal-zoom
 * battlefield readability. Zero moving stickers, zero static geometric templates.
 *
 * Strictly visual — never alters simulation timing, collision, or damage math.
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
  drawTaperedNeedle,
  createDetRng,
} from './NonUnitVfxGeometry.js';

// ============================================================================
// 1. Natural Motion Curves, Mechanical Ratchets & Procedural Deformation
// ============================================================================

export function easeInCubic(t) {
  const x = clamp01(t);
  return x * x * x;
}

export function easeOutExpo(t) {
  const x = clamp01(t);
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

export function easeInOutQuint(t) {
  const x = clamp01(t);
  return x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2;
}

export function easeInOutBack(t, overshoot = 1.45) {
  const x = clamp01(t);
  const c2 = overshoot * 1.525;
  return x < 0.5
    ? (Math.pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2
    : (Math.pow(2 * x - 2, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2;
}

/**
 * Authentic mechanical escapement ratchet angle:
 * crisp stepped impulse -> slight elastic overshoot -> locked detent hold.
 * Accelerates naturally when `accelerate = true`.
 */
export function ratchetStepAngle(t, steps = 4, stepAngle = Math.PI / 6, {
  overshoot = 0.14,
  accelerate = true,
} = {}) {
  const u = clamp01(t);
  const warped = accelerate ? Math.pow(u, 1.42) : u;
  const scaled = warped * steps;
  const idx = Math.floor(scaled);
  const frac = scaled - idx;

  // Crisp 38% mechanical snap, 22% settle recoil, 40% locked detent pause
  let local = 1;
  if (frac < 0.38) {
    const f = frac / 0.38;
    local = easeOutCubic(f) * (1 + overshoot);
  } else if (frac < 0.6) {
    const f = (frac - 0.38) / 0.22;
    local = 1 + overshoot * (1 - easeOutCubic(f));
  }
  return (idx + local) * stepAngle;
}

/**
 * Time-dilated travel curve: brief coiled launch -> hover stretch -> elastic snap strike.
 * Always starts at 0 and lands at exact 1 so simulation arrival timing stays 100% synced.
 */
export function timeDilatedTravelCurve(progress) {
  const p = clamp01(progress);
  if (p < 0.26) {
    return easeOutCubic(p / 0.26) * 0.38;
  }
  if (p < 0.62) {
    const mid = (p - 0.26) / 0.36;
    return 0.38 + mid * 0.18 + Math.sin(mid * Math.PI) * 0.025;
  }
  const snap = (p - 0.62) / 0.38;
  return 0.56 + easeInCubic(snap) * 0.44;
}

/**
 * Three-stage impact lifecycle:
 * 1. Compression / Implosion pinch (`0 .. pinchEnd`)
 * 2. Primary energetic expansion (`pinchEnd .. burstEnd`)
 * 3. Cooling / Settling aftermath (`burstEnd .. 1`)
 */
export function evaluateImpactStages(t, pinchEnd = 0.18, burstEnd = 0.66) {
  const u = clamp01(t);
  const pinchT = clamp01(u / Math.max(0.02, pinchEnd));
  const burstT = clamp01((u - pinchEnd) / Math.max(0.05, burstEnd - pinchEnd));
  const coolT = clamp01((u - burstEnd) / Math.max(0.05, 1 - burstEnd));
  const phase = u < pinchEnd ? 'pinch' : u < burstEnd ? 'burst' : 'aftermath';
  return { u, phase, pinchT, burstT, coolT };
}

/**
 * Smooth incommensurate harmonic wave for organic boiling plasma / flame contours.
 */
export function organicContourFactor(angle, phase, seed = 1, amp = 0.22) {
  const s = seed * 0.37;
  const w1 = Math.sin(angle * 2 + phase * 2.7 + s);
  const w2 = Math.sin(angle * 3 - phase * 4.1 + s * 1.9) * 0.58;
  const w3 = Math.sin(angle * 5 + phase * 6.3 - s * 1.3) * 0.32;
  return 1 + (w1 + w2 + w3) * amp * 0.52;
}

function safePos(v, min = 0.5) {
  return Number.isFinite(v) && v > min ? v : min;
}

/**
 * Traces a smooth closed organic contour from vertex list using quadratic midpoints.
 */
function traceSmoothClosedLoop(ctx, pts) {
  const n = pts.length;
  if (n < 3) return;
  const mid0x = (pts[n - 1].x + pts[0].x) * 0.5;
  const mid0y = (pts[n - 1].y + pts[0].y) * 0.5;
  ctx.beginPath();
  ctx.moveTo(mid0x, mid0y);
  for (let i = 0; i < n; i += 1) {
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const mx = (cur.x + next.x) * 0.5;
    const my = (cur.y + next.y) * 0.5;
    if (typeof ctx.quadraticCurveTo === 'function') {
      ctx.quadraticCurveTo(cur.x, cur.y, mx, my);
    } else {
      ctx.lineTo(cur.x, cur.y);
      ctx.lineTo(mx, my);
    }
  }
  ctx.closePath();
}

/**
 * Draws an organically boiling, velocity-deformable plasma body (NOT a static circle/sun icon).
 * Internal convection cells shift independently of outer plasma silhouette.
 */
export function drawBoilingPlasmaBody(ctx, cx, cy, radius, {
  primary = '#f97316',
  secondary = '#fde047',
  core = '#fffbeb',
  glow = '#c2410c',
  alpha = 0.94,
  phase = 0,
  seed = 11,
  stretchX = 1.0,
  stretchY = 1.0,
  heading = 0,
  turbulence = 0.26,
  samples = 14,
} = {}) {
  const r = safePos(radius, 1.5);
  if (alpha <= 0.015) return;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(heading);

  // Soft radiant heat bloom (scales with boiling energy)
  drawSoftBloom(ctx, 0, 0, r * 2.15 * Math.max(stretchX, stretchY), secondary, glow, alpha * 0.42);

  // Outer undulating corona shell
  const outerPts = [];
  for (let i = 0; i < samples; i += 1) {
    const a = (i / samples) * Math.PI * 2;
    const k = organicContourFactor(a, phase, seed, turbulence * 1.18);
    // Elongate tail slightly backward along -X for natural motion smear
    const tailBias = Math.cos(a) < 0 ? 1 + Math.abs(Math.cos(a)) * (stretchX - 1) * 0.55 : 1;
    outerPts.push({
      x: Math.cos(a) * r * 1.16 * k * stretchX * tailBias,
      y: Math.sin(a) * r * 1.12 * k * stretchY,
    });
  }
  traceSmoothClosedLoop(ctx, outerPts);
  ctx.fillStyle = withAlpha(primary, alpha * 0.62);
  ctx.fill();

  // Mid flowing photosphere lobe (counter-drifting harmonic phase for internal boil)
  const midPts = [];
  for (let i = 0; i < samples; i += 1) {
    const a = (i / samples) * Math.PI * 2;
    const k = organicContourFactor(a, phase * 1.35 + 1.2, seed + 7, turbulence * 0.92);
    midPts.push({
      x: Math.cos(a) * r * 0.86 * k * stretchX,
      y: Math.sin(a) * r * 0.84 * k * stretchY,
    });
  }
  traceSmoothClosedLoop(ctx, midPts);
  if (typeof ctx.createRadialGradient === 'function') {
    const offX = Math.cos(phase * 1.9 + seed) * r * 0.18;
    const offY = Math.sin(phase * 2.3 + seed) * r * 0.14;
    const g = ctx.createRadialGradient(offX, offY, r * 0.08, 0, 0, r * Math.max(stretchX, stretchY));
    g.addColorStop(0, withAlpha(core, alpha));
    g.addColorStop(0.52, withAlpha(secondary, alpha * 0.94));
    g.addColorStop(1, withAlpha(primary, alpha * 0.78));
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = withAlpha(secondary, alpha * 0.92);
  }
  ctx.fill();

  // Shifting white-hot internal convection pocket (internal motion within the effect!)
  const hotX = Math.cos(phase * 2.4 + seed) * r * 0.22 * stretchX;
  const hotY = Math.sin(phase * 3.1 + seed) * r * 0.18 * stretchY;
  const hotR = r * (0.4 + Math.sin(phase * 5.2 + seed) * 0.08);
  ctx.fillStyle = withAlpha(core, alpha * 0.94);
  ctx.beginPath();
  ctx.ellipse(hotX, hotY, safePos(hotR * stretchX, 1), safePos(hotR * 0.82 * stretchY, 1), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draws a real 3D-rotated crystalline shard/bipyramid prism projected onto 2D.
 * Computes per-face normal dot-product against an upper-left key light so individual
 * facets organically catch bright specular flashes and deepen into shadow as they tumble!
 */
export function drawCrystalFacet3D(ctx, cx, cy, length, width, {
  yaw = 0,
  pitch = 0.35,
  roll = 0,
  primary = '#38bdf8',
  secondary = '#bae6fd',
  core = '#ffffff',
  shadow = '#0c4a6e',
  alpha = 0.95,
  lightDir = { x: -0.45, y: -0.7, z: 0.55 },
} = {}) {
  const halfLen = safePos(length * 0.5, 2);
  const halfW = safePos(width * 0.5, 1.2);
  if (alpha <= 0.015) return;

  // 3D vertices of an asymmetric elongated crystal bipyramid:
  // tip (+X), tail (-X), and 4 equatorial ridge vertices around X = +0.16*halfLen
  const eqX = halfLen * 0.16;
  const rawVerts = [
    { x: halfLen, y: 0, z: 0 }, // 0: front tip
    { x: -halfLen * 0.92, y: 0, z: 0 }, // 1: rear tail
    { x: eqX, y: -halfW, z: 0 }, // 2: top ridge
    { x: eqX, y: 0, z: halfW * 0.92 }, // 3: front-z ridge
    { x: eqX, y: halfW, z: 0 }, // 4: bottom ridge
    { x: eqX, y: 0, z: -halfW * 0.92 }, // 5: back-z ridge
  ];

  // Rotate by roll (around local X axis = crystal spine), then pitch (Y), then yaw (screen Z heading)
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cyaw = Math.cos(yaw);
  const syaw = Math.sin(yaw);

  const verts = rawVerts.map((v) => {
    // Roll around X
    const y1 = v.y * cr - v.z * sr;
    const z1 = v.y * sr + v.z * cr;
    // Pitch around Y
    const x2 = v.x * cp + z1 * sp;
    const z2 = -v.x * sp + z1 * cp;
    // Yaw around Z (screen heading)
    const x3 = x2 * cyaw - y1 * syaw;
    const y3 = x2 * syaw + y1 * cyaw;
    return { x: cx + x3, y: cy + y3, z: z2 };
  });

  // 8 triangular crystal facets (4 front + 4 rear)
  const faces = [
    [0, 2, 3],
    [0, 3, 4],
    [0, 4, 5],
    [0, 5, 2],
    [1, 3, 2],
    [1, 4, 3],
    [1, 5, 4],
    [1, 2, 5],
  ];

  // Painter-sort visible/front-facing triangles by average Z
  const drawList = [];
  for (let i = 0; i < faces.length; i += 1) {
    const [ia, ib, ic] = faces[i];
    const a = verts[ia];
    const b = verts[ib];
    const c = verts[ic];
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const vx = c.x - a.x;
    const vy = c.y - a.y;
    const vz = c.z - a.z;
    // Face normal
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const nLen = Math.hypot(nx, ny, nz) || 1;
    const nnx = nx / nLen;
    const nny = ny / nLen;
    const nnz = nz / nLen;
    // Back-face cull in screen space (nz > -0.05 keeps crisp silhouette)
    if (nnz < -0.08) continue;
    const light = clamp01((nnx * lightDir.x + nny * lightDir.y + nnz * lightDir.z + 0.55) / 1.45);
    drawList.push({
      a,
      b,
      c,
      avgZ: (a.z + b.z + c.z) / 3,
      light,
    });
  }

  drawList.sort((f1, f2) => f1.avgZ - f2.avgZ);

  ctx.save();
  for (let i = 0; i < drawList.length; i += 1) {
    const f = drawList[i];
    ctx.beginPath();
    ctx.moveTo(f.a.x, f.a.y);
    ctx.lineTo(f.b.x, f.b.y);
    ctx.lineTo(f.c.x, f.c.y);
    ctx.closePath();

    // Dynamic facet shading from shadow -> primary -> secondary -> specular core glint
    if (f.light > 0.84) {
      ctx.fillStyle = withAlpha(core, alpha * 0.96);
    } else if (f.light > 0.56) {
      ctx.fillStyle = withAlpha(secondary, alpha * 0.9);
    } else if (f.light > 0.28) {
      ctx.fillStyle = withAlpha(primary, alpha * 0.88);
    } else {
      ctx.fillStyle = withAlpha(shadow, alpha * 0.82);
    }
    ctx.fill();

    // Crisp micro facet bevel edge only on lit facets
    if (f.light > 0.52) {
      ctx.strokeStyle = withAlpha(core, alpha * (0.35 + f.light * 0.5));
      ctx.lineWidth = Math.max(0.7, Math.min(1.4, width * 0.14));
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ============================================================================
// 2. SOLAR PYROMANCER — Complete 5-Phase Fluid Plasma Choreography
//    (Formation -> Acceleration/Release -> Flowing Plasma Travel ->
//     Implosion-Eruption Impact -> Thermal Cooling Dissipation)
// ============================================================================

export function drawSolarPrepMotion(ctx, cx, cy, emX, emY, facing, s, intensity, isSkillPrep, elapsed, pal, reducedMotion = false) {
  const ease = easeOutCubic(intensity);
  const scaleMod = isSkillPrep ? 1.32 : 1.0;

  ctx.save();
  // Converging convective plasma filaments drawn from the unit's solar rings into the emitter
  const strandCount = isSkillPrep ? 5 : 3;
  for (let i = 0; i < strandCount; i += 1) {
    const stagger = clamp01((intensity - i * 0.08) / (1 - i * 0.08));
    if (stagger <= 0.02) continue;
    const baseA = (i / strandCount) * Math.PI * 2 + elapsed * 1.4;
    const startDist = (24 - easeOutCubic(stagger) * 14) * s * scaleMod;
    const sx = cx + Math.cos(baseA) * startDist * 0.9;
    const sy = cy + Math.sin(baseA) * startDist * 0.72;
    const ctrl = {
      x: (sx + emX) * 0.5 + Math.cos(baseA + 1.2) * 10 * s,
      y: (sy + emY) * 0.5 + Math.sin(baseA + 1.2) * 10 * s - 4 * s,
    };
    drawAnalyticalRibbon(ctx, (u) => sampleQuadBezier({ x: sx, y: sy }, ctrl, { x: emX, y: emY }, u), {
      uStart: Math.max(0, stagger - 0.58),
      uEnd: Math.min(1, stagger * 1.05),
      steps: 10,
      maxWidth: (isSkillPrep ? 2.8 : 2.0) * s * stagger,
      color: i % 2 === 0 ? pal.primary : pal.secondary,
      coreColor: pal.core,
      alpha: 0.84 * stagger,
      taperProfile: 'comet',
      coreRatio: 0.42,
      glowAlpha: 0.2,
    });
  }

  // Growing boiling plasma kernel emerging from tiny ignition point (NEVER full-size instantly!)
  const kernelR = (1.8 + easeInCubic(intensity) * (isSkillPrep ? 7.8 : 5.2)) * s;
  drawBoilingPlasmaBody(ctx, emX, emY, kernelR, {
    primary: pal.primary,
    secondary: pal.secondary,
    core: pal.core,
    glow: pal.glow,
    alpha: (0.45 + ease * 0.5) * (isSkillPrep ? 0.96 : 0.88),
    phase: elapsed * (reducedMotion ? 1.5 : 5.4),
    seed: 17,
    stretchX: 1.0 + intensity * 0.24,
    stretchY: 1.0 - intensity * 0.08,
    heading: facing > 0 ? 0 : Math.PI,
    turbulence: 0.3,
    samples: 12,
  });

  // Rising tiny buoyant heat sparks peeling upward off the gathering kernel
  if (!reducedMotion && intensity > 0.25) {
    const emberCount = isSkillPrep ? 5 : 3;
    for (let e = 0; e < emberCount; e += 1) {
      const life = ((elapsed * 2.1 + e * 0.31) % 1);
      const ex = emX + Math.sin(life * 5 + e * 2.1) * 5 * s * life;
      const ey = emY - life * (14 + e * 3) * s * scaleMod;
      const er = Math.max(0.8, (2.2 - life * 1.4) * s);
      ctx.fillStyle = withAlpha(life < 0.45 ? pal.core : pal.primary, (1 - life) * ease * 0.88);
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawSolarCastReleaseMotion(ctx, emX, emY, angle, s, t, pal) {
  const ease = easeOutExpo(t);
  const fade = Math.max(0, 1 - easeInCubic(t));
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const nx = -uy;
  const ny = ux;

  ctx.save();
  // Directional plasma whip-release transferring momentum from solar rings into launch vector
  drawSoftBloom(ctx, emX + ux * ease * 6 * s, emY + uy * ease * 6 * s, (12 + ease * 8) * s, pal.core, pal.primary, fade * 0.58);
  for (const side of [-1, 1]) {
    const startP = { x: emX - ux * 3 * s + nx * side * 6 * s, y: emY - uy * 3 * s + ny * side * 6 * s };
    const endP = { x: emX + ux * (10 + ease * 18) * s + nx * side * (2 + ease * 7) * s, y: emY + uy * (10 + ease * 18) * s + ny * side * (2 + ease * 7) * s };
    const ctrl = {
      x: (startP.x + endP.x) * 0.5 + nx * side * 5 * s,
      y: (startP.y + endP.y) * 0.5 + ny * side * 5 * s,
    };
    drawAnalyticalRibbon(ctx, (u) => sampleQuadBezier(startP, ctrl, endP, u), {
      uStart: ease * 0.35,
      uEnd: 1,
      steps: 10,
      maxWidth: 3.4 * s * fade,
      color: side > 0 ? pal.secondary : pal.primary,
      coreColor: pal.core,
      alpha: fade * 0.9,
      taperProfile: 'comet',
      coreRatio: 0.45,
      glowAlpha: 0.22,
    });
  }
  ctx.restore();
}

export function drawSolarTravelMotion(ctx, startP, targetP, targetGroundP, progress, s, elapsed, seed, pal, reducedMotion = false) {
  // Smooth acceleration curve: builds velocity naturally out of solar emitter
  const p = clamp01(progress);
  const curvedU = p < 0.3 ? easeInCubic(p / 0.3) * 0.24 : 0.24 + ((p - 0.3) / 0.7) * 0.76;
  const dist = Math.max(18, Math.hypot(targetP.x - startP.x, targetP.y - startP.y));
  const arcLift = Math.min(28 * s, dist * 0.14);
  const ctrl = {
    x: (startP.x + targetP.x) * 0.5,
    y: Math.min(startP.y, targetP.y) - arcLift,
  };

  const head = sampleQuadBezier(startP, ctrl, targetP, curvedU);
  const prev = sampleQuadBezier(startP, ctrl, targetP, Math.max(0, curvedU - 0.03));
  const heading = Math.atan2(head.y - prev.y, head.x - prev.x);
  const ux = Math.cos(heading);
  const uy = Math.sin(heading);
  const nx = -uy;
  const ny = ux;
  const velocityStretch = 1.15 + smoothWindow(p, 0.15, 0.55, 1.0) * 0.42;

  ctx.save();

  // Subtle thermal anticipation shimmer beneath target only in final 45% of approach
  if (p > 0.5) {
    const heatT = clamp01((p - 0.5) / 0.5);
    drawSoftBloom(ctx, targetGroundP.x, targetGroundP.y, (10 + heatT * 8) * s, pal.secondary, pal.primary, heatT * 0.28, 0.46);
    // 2 delicate rising wavy convection wisps from heated ground
    if (!reducedMotion) {
      for (let i = 0; i < 2; i += 1) {
        const ox = (i === 0 ? -6 : 6) * s;
        const h = (8 + heatT * 10) * s;
        ctx.strokeStyle = withAlpha(pal.secondary, heatT * 0.52);
        ctx.lineWidth = 1.2 * s;
        ctx.beginPath();
        for (let k = 0; k <= 6; k += 1) {
          const v = k / 6;
          const wx = targetGroundP.x + ox + Math.sin(v * Math.PI * 2 + elapsed * 8 + i * 2) * 2.2 * s;
          const wy = targetGroundP.y - v * h;
          if (k === 0) ctx.moveTo(wx, wy);
          else ctx.lineTo(wx, wy);
        }
        ctx.stroke();
      }
    }
  }

  // 3 sinuous velocity-lagging flame convection ribbons (different wave speeds & decay)
  const ribbonCount = reducedMotion ? 1 : 3;
  for (let r = 0; r < ribbonCount; r += 1) {
    const trailSpan = r === 0 ? 0.44 : r === 1 ? 0.34 : 0.28;
    const u0 = Math.max(0, curvedU - trailSpan);
    const amp = (r === 0 ? 1.8 : r === 1 ? 4.2 : 3.6) * s;
    const sideSign = r === 1 ? 1 : r === 2 ? -1 : 0;
    const freq = r === 0 ? 9 : r === 1 ? 12 : 14;
    drawAnalyticalRibbon(
      ctx,
      (u) => {
        const pt = sampleQuadBezier(startP, ctrl, targetP, u);
        const tailFade = clamp01((curvedU - u) / Math.max(0.05, trailSpan));
        const sway = Math.sin(u * freq - elapsed * 13 + r * 2.1 + seed) * amp * tailFade;
        const buoyLift = -tailFade * tailFade * (r === 0 ? 3.5 : 7.5) * s;
        return {
          x: pt.x + nx * (sway + sideSign * tailFade * 2.4 * s),
          y: pt.y + ny * sway + buoyLift,
        };
      },
      {
        uStart: u0,
        uEnd: curvedU,
        steps: 14,
        maxWidth: (r === 0 ? 5.2 : 2.6) * s,
        color: r === 0 ? pal.primary : pal.secondary,
        coreColor: r === 0 ? pal.core : pal.secondary,
        alpha: r === 0 ? 0.9 : 0.68,
        taperProfile: 'comet',
        coreRatio: r === 0 ? 0.45 : 0.32,
        glowWidthMultiplier: 1.7,
        glowAlpha: r === 0 ? 0.26 : 0.14,
      },
    );
  }

  // Boiling, velocity-stretched living plasma core (compact 6.5-8.5px radius at normal zoom!)
  const bodyR = (5.4 + smoothWindow(p, 0.08, 0.4, 1.0) * 2.6) * s;
  drawBoilingPlasmaBody(ctx, head.x, head.y, bodyR, {
    primary: pal.primary,
    secondary: pal.secondary,
    core: pal.core,
    glow: pal.glow,
    alpha: 0.96,
    phase: elapsed * 7.2 + p * 4,
    seed: (seed || 11) % 97,
    stretchX: velocityStretch,
    stretchY: 1 / Math.sqrt(velocityStretch),
    heading,
    turbulence: 0.34,
    samples: 14,
  });

  // Drifting buoyant cooling embers peeling off the wake with upward thermal drift
  if (!reducedMotion) {
    const rng = createDetRng((seed || 17) + 31);
    for (let i = 0; i < 6; i += 1) {
      const lag = 0.06 + (i / 6) * 0.34;
      const eu = curvedU - lag;
      if (eu <= 0.01) continue;
      const basePt = sampleQuadBezier(startP, ctrl, targetP, eu);
      const drift = lag * 2.8;
      const lateral = (rng() - 0.5) * 14 * s * drift;
      const rise = -drift * drift * 12 * s;
      const ex = basePt.x + nx * lateral - ux * lag * 6 * s;
      const ey = basePt.y + ny * lateral + rise;
      const cool = clamp01(lag / 0.38);
      const col = cool < 0.35 ? pal.core : cool < 0.7 ? pal.secondary : pal.primary;
      const er = Math.max(0.8, (2.3 - cool * 1.4) * s);
      ctx.fillStyle = withAlpha(col, (1 - cool) * 0.9);
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawSolarImpactMotion(ctx, px, py, s, t, seed, pal, {
  isSkill = false,
  aoeRx = 0,
  aoeRy = 0,
  layer = 'sky',
  reducedMotion = false,
} = {}) {
  const st = evaluateImpactStages(t, isSkill ? 0.18 : 0.14, isSkill ? 0.68 : 0.62);
  const rng = createDetRng((seed || 43) + 5);

  if (layer === 'ground') {
    const baseRx = isSkill && aoeRx > 4 ? aoeRx : 28 * s;
    const baseRy = isSkill && aoeRy > 2 ? aoeRy : baseRx * 0.48;
    ctx.save();
    if (st.phase === 'pinch') {
      // Inward thermal suction drawing warm floor haze toward ignition center
      const shrink = 1.08 - easeInCubic(st.pinchT) * 0.58;
      drawSoftBloom(ctx, px, py, baseRx * shrink, pal.core, pal.primary, st.pinchT * 0.44, baseRy / Math.max(1, baseRx));
    } else {
      const expand = easeOutExpo(st.burstT);
      const coolFade = 1 - easeInCubic(st.coolT);
      // Warm translucent radiant thermal floor wash (keeps units inside 100% readable)
      drawSoftBloom(
        ctx,
        px,
        py,
        baseRx * (0.58 + expand * 0.5),
        pal.secondary,
        pal.glow,
        (isSkill ? 0.44 : 0.36) * coolFade,
        baseRy / Math.max(1, baseRx),
      );
      // Broken, organically undulating plasma wave arcs sweeping along the AoE perimeter (NEVER a uniform wireframe oval!)
      const waveRx = baseRx * (0.34 + expand * 0.68);
      const waveRy = baseRy * (0.34 + expand * 0.68);
      const arcCount = isSkill ? 5 : 3;
      for (let w = 0; w < arcCount; w += 1) {
        const aBase = (w / arcCount) * Math.PI * 2 + t * (w % 2 === 0 ? 1.2 : -0.9) + (seed || 7) * 0.13;
        const arcLen = Math.PI * (isSkill ? 0.34 : 0.42) * (1 - st.coolT * 0.35);
        drawAnalyticalRibbon(
          ctx,
          (u) => {
            const a = aBase + (u - 0.5) * arcLen;
            const wob = organicContourFactor(a, t * 8.5 + w, (seed || 19) + w * 5, 0.14);
            return {
              x: px + Math.cos(a) * waveRx * wob,
              y: py + Math.sin(a) * waveRy * wob,
            };
          },
          {
            steps: 10,
            maxWidth: (isSkill ? 4.4 : 3.2) * s * (1 - st.coolT * 0.65),
            color: st.burstT < 0.45 ? pal.secondary : pal.primary,
            coreColor: pal.core,
            alpha: (1 - st.burstT * 0.35) * coolFade * 0.86,
            taperProfile: 'spindle',
            coreRatio: 0.4,
            glowWidthMultiplier: 1.85,
            glowAlpha: 0.25,
          },
        );
      }
    }
    ctx.restore();
    return;
  }

  // ---------------- SKY LAYER: Implosion -> Billowing Boiling Plumes -> Cooling Dissipation ----------------
  ctx.save();
  const scaleMul = isSkill ? 1.85 : 1.38;

  if (st.phase === 'pinch') {
    // Stage 1: Sharp compression pinch (inward flame filaments + blinding pinpoint ignition)
    const pinch = easeInCubic(st.pinchT);
    const compR = (15 - pinch * 9.5) * s * scaleMul;
    drawSoftBloom(ctx, px, py, compR * 1.8, pal.core, pal.secondary, 0.45 + pinch * 0.5);
    const drawCount = isSkill ? 7 : 5;
    for (let i = 0; i < drawCount; i += 1) {
      const a = (i / drawCount) * Math.PI * 2 + rng() * 0.45;
      const outer = (24 - pinch * 15) * s * scaleMul;
      const inner = (4 - pinch * 2.8) * s;
      drawTaperedNeedle(
        ctx,
        px + Math.cos(a) * outer,
        py + Math.sin(a) * outer * 0.72,
        px + Math.cos(a) * inner,
        py + Math.sin(a) * inner * 0.72,
        {
          width: (2.6 + pinch * 1.6) * s,
          color: pal.secondary,
          coreColor: pal.core,
          alpha: 0.92 * st.pinchT,
          peakRatio: 0.86,
        },
      );
    }
    drawBoilingPlasmaBody(ctx, px, py, Math.max(3.2, (5.5 - pinch * 1.8) * s * scaleMul), {
      primary: pal.secondary,
      secondary: pal.core,
      core: '#ffffff',
      glow: pal.primary,
      alpha: 0.98,
      phase: t * 22,
      seed,
      turbulence: 0.2,
      samples: 12,
    });
    ctx.restore();
    return;
  }

  // Stage 2 & 3: Boiling erupting plasma lobes + sweeping curved prominence ribbons + rising embers
  const burst = easeOutExpo(st.burstT);
  const cool = easeInCubic(st.coolT);
  const lifeFade = Math.max(0, 1 - cool);

  // Luminous atmospheric flash behind the eruption so the impact pops at normal gameplay zoom
  drawSoftBloom(ctx, px, py - burst * 6 * s * scaleMul, (22 + burst * 18) * s * scaleMul, pal.core, pal.primary, 0.48 * lifeFade * (1 - st.burstT * 0.35));

  // Primary rising boiling solar plasma body that stretches vertically and cools naturally
  if (st.burstT < 0.88) {
    const coreFade = Math.max(0, 1 - st.burstT / 0.88);
    drawBoilingPlasmaBody(ctx, px, py - burst * 10 * s * scaleMul, (8.5 + burst * 7.5) * s * scaleMul * (0.5 + coreFade * 0.5), {
      primary: pal.primary,
      secondary: pal.secondary,
      core: pal.core,
      glow: pal.glow,
      alpha: coreFade * 0.94,
      phase: t * 12,
      seed,
      stretchX: 1.05 - burst * 0.14,
      stretchY: 1.0 + burst * 0.38,
      heading: 0,
      turbulence: 0.4,
      samples: 14,
    });
  }

  // Detached buoyant rolling fire puffs blooming outward and rising with thermal swirl
  const puffCount = isSkill ? 5 : 3;
  for (let pIdx = 0; pIdx < puffCount; pIdx += 1) {
    const pAge = clamp01((t - 0.14 - pIdx * 0.04) / 0.82);
    if (pAge <= 0.02) continue;
    const pEase = easeOutCubic(pAge);
    const pFade = Math.max(0, 1 - easeInCubic(clamp01((pAge - 0.38) / 0.62)));
    if (pFade <= 0.02) continue;
    const ang = -Math.PI * 0.92 + (pIdx / Math.max(1, puffCount - 1)) * Math.PI * 0.84 + (rng() - 0.5) * 0.25;
    const dist = (12 + rng() * 14) * s * scaleMul * pEase;
    const puffX = px + Math.cos(ang) * dist + Math.sin(pAge * 5 + pIdx) * 4 * s;
    const puffY = py + Math.sin(ang) * dist * 0.58 - pAge * pAge * (16 + rng() * 10) * s * scaleMul;
    const puffR = (4.2 + pEase * 4.2) * s * scaleMul * (0.55 + pFade * 0.45);
    drawBoilingPlasmaBody(ctx, puffX, puffY, puffR, {
      primary: pAge < 0.5 ? pal.primary : pal.glow,
      secondary: pAge < 0.45 ? pal.secondary : pal.primary,
      core: pAge < 0.35 ? pal.core : pal.secondary,
      glow: pal.glow,
      alpha: pFade * 0.78,
      phase: t * 10 + pIdx * 1.7,
      seed: (seed || 11) + pIdx * 19,
      stretchX: 0.92,
      stretchY: 1.18,
      turbulence: 0.36,
      samples: 10,
    });
  }

  // Sweeping S-curved solar prominence whips curling organically outward (NEVER straight sticks!)
  const plumeCount = isSkill ? 6 : 4;
  for (let i = 0; i < plumeCount; i += 1) {
    const stagger = clamp01((t - 0.12 - i * 0.03) / 0.74);
    if (stagger <= 0.01) continue;
    const pEase = easeOutCubic(stagger);
    const pFade = Math.max(0, 1 - easeInCubic(clamp01((stagger - 0.4) / 0.6)));
    if (pFade <= 0.02) continue;

    const sideSign = i % 2 === 0 ? 1 : -1;
    const baseAng = -Math.PI * 0.95 + (i / Math.max(1, plumeCount - 1)) * Math.PI * 0.9 + (rng() - 0.5) * 0.2;
    const reach = (18 + rng() * 14) * s * scaleMul * pEase;
    const curlX = sideSign * (12 + rng() * 10) * s * pEase;
    const buoyY = -stagger * stagger * (14 + rng() * 10) * s * scaleMul;

    const p0 = { x: px + Math.cos(baseAng) * 4 * s, y: py + Math.sin(baseAng) * 3 * s };
    const p2 = {
      x: px + Math.cos(baseAng) * reach + curlX,
      y: py + Math.sin(baseAng) * reach * 0.62 + buoyY,
    };
    // Offset control point sideways for unmistakable fluid flame curl
    const p1 = {
      x: (p0.x + p2.x) * 0.5 - sideSign * 11 * s * scaleMul,
      y: (p0.y + p2.y) * 0.5 - 9 * s * scaleMul,
    };

    const plumeCol = stagger < 0.42 ? pal.secondary : pal.primary;
    drawAnalyticalRibbon(ctx, (u) => sampleQuadBezier(p0, p1, p2, u), {
      uStart: clamp01(stagger * 0.52 - 0.08),
      uEnd: Math.min(1, 0.42 + pEase * 0.58),
      steps: 12,
      maxWidth: (isSkill ? 6.2 : 4.8) * s * (1 - stagger * 0.52),
      color: plumeCol,
      coreColor: stagger < 0.48 ? pal.core : pal.secondary,
      alpha: pFade * 0.9,
      taperProfile: 'comet',
      coreRatio: 0.42,
      glowWidthMultiplier: 1.8,
      glowAlpha: 0.24,
    });
  }

  // Ballistic cooling plasma sparks arcing out with drag & upward buoyant curl
  if (!reducedMotion) {
    const sparkCount = isSkill ? 14 : 9;
    for (let k = 0; k < sparkCount; k += 1) {
      const ang = (k / sparkCount) * Math.PI * 2 + (rng() - 0.5) * 0.45;
      const spd = (22 + rng() * 26) * s * scaleMul;
      const age = clamp01((t - 0.14) / 0.86);
      const dragT = easeOutCubic(age);
      const sx = px + Math.cos(ang) * spd * dragT;
      const sy = py + Math.sin(ang) * spd * 0.58 * dragT - age * age * (16 + rng() * 10) * s;
      const coolRatio = clamp01(age * 1.12);
      const col = coolRatio < 0.35 ? '#ffffff' : coolRatio < 0.68 ? pal.secondary : pal.primary;
      const sr = Math.max(1.0, (2.7 - coolRatio * 1.6) * s * (isSkill ? 1.2 : 1));
      ctx.fillStyle = withAlpha(col, (1 - coolRatio) * lifeFade * 0.95);
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ============================================================================
// 3. CHRONO WEAVER — Complete 5-Phase Mechanical Ratchet & Space-Time Echoes
//    (Escapement Ratchet Prep -> Snap Release -> Time-Dilated Needle & Strobe
//     Echo Travel -> Freeze-Snap Impact -> Hourglass Dust Dissipation)
// ============================================================================

/**
 * Draws sleek, open depth-tilted escapement partial arcs + crisp micro-ticks
 * that ratchet mechanically (NEVER a giant opaque static clock-face sticker!).
 */
function drawEscapementArcs(ctx, cx, cy, rx, ry, {
  primary = '#a78bfa',
  secondary = '#f5d37a',
  core = '#faf5ff',
  alpha = 0.9,
  angleA = 0,
  angleB = 0,
  lineWidth = 1.6,
  arcSpan = Math.PI * 0.58,
  tickCount = 5,
} = {}) {
  const sRx = safePos(rx, 3);
  const sRy = safePos(ry, 2);
  if (alpha <= 0.015) return;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, sRy / sRx);

  // Two opposing open mechanical bezel segments (keeps center 100% open and readable!)
  for (let side = 0; side < 2; side += 1) {
    const a0 = angleA + side * Math.PI - arcSpan * 0.5;
    const a1 = a0 + arcSpan;
    ctx.strokeStyle = withAlpha(primary, alpha * 0.84);
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, sRx, a0, a1);
    ctx.stroke();

    // Inner counter-ratcheting gold vernier segment
    const b0 = angleB + side * Math.PI - arcSpan * 0.36;
    const b1 = b0 + arcSpan * 0.72;
    ctx.strokeStyle = withAlpha(secondary, alpha * 0.92);
    ctx.lineWidth = Math.max(0.9, lineWidth * 0.65);
    ctx.beginPath();
    ctx.arc(0, 0, sRx * 0.78, b0, b1);
    ctx.stroke();

    // Fine mechanical escapement notches along the outer arc
    ctx.strokeStyle = withAlpha(core, alpha * 0.88);
    ctx.lineWidth = Math.max(0.8, lineWidth * 0.52);
    for (let k = 0; k < tickCount; k += 1) {
      const ta = a0 + (k / Math.max(1, tickCount - 1)) * arcSpan;
      const isMajor = k === 0 || k === tickCount - 1 || k === Math.floor(tickCount / 2);
      const r0 = sRx * (isMajor ? 0.8 : 0.88);
      ctx.beginPath();
      ctx.moveTo(Math.cos(ta) * r0, Math.sin(ta) * r0);
      ctx.lineTo(Math.cos(ta) * (sRx * 1.06), Math.sin(ta) * (sRx * 1.06));
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Draws a sleek, tapered chronometric needle-lance (moves cleanly with momentum, never a blocky shape).
 */
function drawChronoNeedle(ctx, x, y, angle, len, hw, primary, secondary, core, alpha) {
  if (alpha <= 0.015) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.moveTo(-len * 0.42, 0);
  ctx.lineTo(len * 0.14, -hw);
  ctx.lineTo(len * 0.58, 0);
  ctx.lineTo(len * 0.14, hw);
  ctx.closePath();
  ctx.fillStyle = withAlpha(primary, alpha * 0.85);
  ctx.fill();

  ctx.strokeStyle = withAlpha(secondary, alpha * 0.96);
  ctx.lineWidth = Math.max(0.9, hw * 0.42);
  ctx.stroke();

  // Sharp luminous spine
  ctx.strokeStyle = withAlpha(core, alpha * 0.98);
  ctx.lineWidth = Math.max(0.8, hw * 0.28);
  ctx.beginPath();
  ctx.moveTo(-len * 0.34, 0);
  ctx.lineTo(len * 0.56, 0);
  ctx.stroke();

  // Tiny jeweled balance ring near hilt
  ctx.fillStyle = withAlpha(core, alpha * 0.95);
  ctx.beginPath();
  ctx.arc(-len * 0.14, 0, Math.max(1.3, hw * 0.55), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawChronoPrepMotion(ctx, cx, cy, emX, emY, facing, s, intensity, isSkillPrep, elapsed, pal, reducedMotion = false) {
  const ease = easeOutCubic(intensity);
  const scaleMod = isSkillPrep ? 1.28 : 1.0;

  ctx.save();
  // Ratcheting mechanical escapement arcs snapping faster as cast approaches release!
  const stepA = ratchetStepAngle(intensity, isSkillPrep ? 5 : 3, Math.PI / 5, { overshoot: 0.18, accelerate: true }) * facing;
  const stepB = -ratchetStepAngle(intensity, isSkillPrep ? 6 : 4, Math.PI / 6, { overshoot: 0.15, accelerate: true }) * facing;
  const arcR = (11 + ease * 4.5) * s * scaleMod;

  drawEscapementArcs(ctx, emX, emY, arcR, arcR * 0.72, {
    primary: pal.primary,
    secondary: pal.spark || pal.secondary,
    core: pal.core,
    alpha: (0.35 + ease * 0.6) * (isSkillPrep ? 0.95 : 0.86),
    angleA: stepA + (facing > 0 ? 0 : Math.PI),
    angleB: stepB,
    lineWidth: 1.55 * s,
    arcSpan: Math.PI * (0.42 + ease * 0.2),
    tickCount: isSkillPrep ? 6 : 4,
  });

  // Two tiny mechanical hands converging toward the target firing angle
  const targetA = facing > 0 ? 0 : Math.PI;
  const converge = 1 - easeOutExpo(intensity);
  for (const sgn of [-1, 1]) {
    const ha = targetA + sgn * converge * 1.35 + Math.sin(stepA * 3) * 0.05;
    drawChronoNeedle(
      ctx,
      emX + Math.cos(ha) * 3 * s,
      emY + Math.sin(ha) * 3 * s,
      ha,
      (8 + ease * 5) * s * scaleMod,
      1.6 * s,
      pal.primary,
      pal.spark || pal.secondary,
      pal.core,
      0.86 * ease,
    );
  }

  // Fine hourglass golden sand motes spiraling inward along logarithmic curves
  if (!reducedMotion) {
    const moteCount = isSkillPrep ? 7 : 4;
    for (let i = 0; i < moteCount; i += 1) {
      const mT = ((elapsed * 1.6 + i / moteCount) % 1);
      const r = (22 * (1 - easeInCubic(mT)) + 2) * s * scaleMod;
      const a = mT * 3.8 * facing + (i * Math.PI * 2) / moteCount;
      const mx = emX + Math.cos(a) * r;
      const my = emY + Math.sin(a) * r * 0.68;
      ctx.fillStyle = withAlpha(i % 2 === 0 ? pal.spark || pal.secondary : pal.core, Math.sin(mT * Math.PI) * ease * 0.92);
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(0.9, (1.8 - mT * 0.6) * s), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawChronoCastReleaseMotion(ctx, emX, emY, angle, s, t, pal) {
  const ease = easeOutExpo(t);
  const fade = Math.max(0, 1 - easeInCubic(t));
  ctx.save();
  // Crisp mechanical escapement recoil snap expanding outward briefly
  drawEscapementArcs(ctx, emX, emY, (9 + ease * 11) * s, (7 + ease * 8) * s, {
    primary: pal.primary,
    secondary: pal.spark || pal.secondary,
    core: pal.core,
    alpha: fade * 0.88,
    angleA: angle + ease * 0.55,
    angleB: angle - ease * 0.85,
    lineWidth: 1.5 * s * fade,
    arcSpan: Math.PI * 0.45,
    tickCount: 3,
  });
  drawSoftBloom(ctx, emX, emY, (9 + ease * 6) * s, pal.core, pal.primary, fade * 0.5);
  ctx.restore();
}

export function drawChronoTravelMotion(ctx, startP, targetP, progress, s, elapsed, seed, pal, reducedMotion = false) {
  const p = clamp01(progress);
  const uNow = timeDilatedTravelCurve(p);
  const dist = Math.max(16, Math.hypot(targetP.x - startP.x, targetP.y - startP.y));
  const bend = Math.min(18 * s, dist * 0.09) * ((seed % 2 === 0) ? -1 : 1);
  const ctrl = {
    x: (startP.x + targetP.x) * 0.5,
    y: (startP.y + targetP.y) * 0.5 + bend,
  };

  const head = sampleQuadBezier(startP, ctrl, targetP, uNow);
  const prev = sampleQuadBezier(startP, ctrl, targetP, Math.max(0, uNow - 0.03));
  const heading = Math.atan2(head.y - prev.y, head.x - prev.x);

  ctx.save();

  // Taut, shimmering hairline temporal filament linking astrolabe emitter to needle
  drawAnalyticalRibbon(ctx, (u) => sampleQuadBezier(startP, ctrl, targetP, u), {
    uStart: Math.max(0, uNow - 0.52),
    uEnd: uNow,
    steps: 14,
    maxWidth: 2.2 * s,
    color: pal.primary,
    coreColor: pal.spark || pal.secondary,
    alpha: 0.72,
    taperProfile: 'comet',
    coreRatio: 0.45,
    glowAlpha: 0.16,
  });

  // 2 subtle space-time refraction arcs warping perpendicular to the needle path
  if (!reducedMotion) {
    for (let w = 0; w < 2; w += 1) {
      const wu = uNow - 0.08 - w * 0.16;
      if (wu <= 0.02) continue;
      const wp = sampleQuadBezier(startP, ctrl, targetP, wu);
      const wf = clamp01(1 - (uNow - wu) * 2.4);
      ctx.save();
      ctx.translate(wp.x, wp.y);
      ctx.rotate(heading);
      ctx.strokeStyle = withAlpha(w === 0 ? pal.spark || pal.secondary : pal.primary, wf * 0.65);
      ctx.lineWidth = 1.25 * s;
      ctx.beginPath();
      ctx.arc(0, 0, (7 + w * 4) * s, -0.78, 0.78);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, (7 + w * 4) * s, Math.PI - 0.78, Math.PI + 0.78);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 4 ghosted strobe afterimage echoes trailing along stepped temporal intervals!
  const echoCount = reducedMotion ? 2 : 4;
  for (let e = echoCount; e >= 1; e -= 1) {
    const ep = clamp01(p - e * 0.065);
    if (ep <= 0.01) continue;
    const eu = timeDilatedTravelCurve(ep);
    const ePos = sampleQuadBezier(startP, ctrl, targetP, eu);
    const ePrev = sampleQuadBezier(startP, ctrl, targetP, Math.max(0, eu - 0.03));
    const eAng = Math.atan2(ePos.y - ePrev.y, ePos.x - ePrev.x);
    const eAlpha = (1 - e / (echoCount + 1)) * 0.46;
    drawChronoNeedle(
      ctx,
      ePos.x,
      ePos.y,
      eAng,
      (16 - e * 1.4) * s,
      (2.4 - e * 0.25) * s,
      e % 2 === 0 ? pal.primary : pal.spark || pal.secondary,
      pal.primary,
      pal.core,
      eAlpha,
    );
  }

  // Primary shimmering chronometric pendulum-needle (sleek, compact, sharp!)
  drawSoftBloom(ctx, head.x, head.y, 10 * s, pal.core, pal.primary, 0.42);
  drawChronoNeedle(
    ctx,
    head.x,
    head.y,
    heading,
    18.5 * s * (p > 0.65 ? 1.18 : 1.0),
    2.8 * s,
    pal.primary,
    pal.spark || pal.secondary,
    pal.core,
    0.98,
  );
  ctx.restore();
}

export function drawChronoImpactMotion(ctx, px, py, s, t, seed, pal, {
  isSkill = false,
  aoeRx = 0,
  aoeRy = 0,
  layer = 'sky',
  reducedMotion = false,
} = {}) {
  const st = evaluateImpactStages(t, isSkill ? 0.2 : 0.16, isSkill ? 0.72 : 0.66);
  const rng = createDetRng((seed || 61) + 9);

  if (layer === 'ground') {
    const baseRx = isSkill && aoeRx > 4 ? aoeRx : 24 * s;
    const baseRy = isSkill && aoeRy > 2 ? aoeRy : baseRx * 0.48;
    const coolFade = 1 - easeInCubic(st.coolT);
    ctx.save();

    if (st.phase === 'pinch') {
      // Escapement calipers sliding inward to snap-lock the dilation zone
      const lock = easeOutCubic(st.pinchT);
      drawSoftBloom(ctx, px, py, baseRx * (1.12 - lock * 0.25), pal.core, pal.primary, lock * 0.28, baseRy / Math.max(1, baseRx));
      drawEscapementArcs(ctx, px, py, baseRx * (1.22 - lock * 0.24), baseRy * (1.22 - lock * 0.24), {
        primary: pal.primary,
        secondary: pal.spark || pal.secondary,
        core: pal.core,
        alpha: lock * 0.88,
        angleA: ratchetStepAngle(st.pinchT, 2, Math.PI / 6),
        angleB: -ratchetStepAngle(st.pinchT, 2, Math.PI / 5),
        lineWidth: (isSkill ? 2.2 : 1.75) * s,
        arcSpan: Math.PI * 0.54,
        tickCount: isSkill ? 4 : 3,
      });
    } else {
      // Translucent warped dilation lens (keeps slowed units 100% readable)
      drawSoftBloom(ctx, px, py, baseRx * 0.98, pal.core, pal.primary, (isSkill ? 0.3 : 0.26) * coolFade, baseRy / Math.max(1, baseRx));
      const tickAngle = ratchetStepAngle(st.burstT, isSkill ? 3 : 2, Math.PI / 4, { overshoot: 0.18, accelerate: false });
      const unlockDrift = st.coolT * (isSkill ? 12 : 8) * s;
      // Sleek tapered flowing temporal wave arcs along outer boundary + subtle inner echo
      drawEscapementArcs(ctx, px, py, baseRx + unlockDrift, baseRy + unlockDrift * 0.48, {
        primary: pal.primary,
        secondary: pal.spark || pal.secondary,
        core: pal.core,
        alpha: 0.9 * coolFade,
        angleA: tickAngle,
        angleB: -tickAngle * 0.75,
        lineWidth: (isSkill ? 2.2 : 1.8) * s * (0.4 + coolFade * 0.6),
        arcSpan: Math.PI * (0.58 - st.coolT * 0.26),
        tickCount: isSkill ? 4 : 3,
      });
      if (isSkill && st.burstT < 0.85) {
        // Secondary inward temporal refraction echo wave pulsing inside the lens
        const echoR = baseRx * (0.45 + easeOutCubic(st.burstT) * 0.42);
        const echoRy = baseRy * (0.45 + easeOutCubic(st.burstT) * 0.42);
        drawEscapementArcs(ctx, px, py, echoR, echoRy, {
          primary: pal.spark || pal.secondary,
          secondary: pal.core,
          core: pal.core,
          alpha: (1 - st.burstT / 0.85) * 0.58,
          angleA: -tickAngle * 1.2 + 0.8,
          angleB: tickAngle * 0.9 - 0.5,
          lineWidth: 1.4 * s,
          arcSpan: Math.PI * 0.44,
          tickCount: 2,
        });
      }
    }
    ctx.restore();
    return;
  }

  // ---------------- SKY LAYER: Freeze-Snap Pinch -> 3D Ratcheting Caliper & Strobe -> Hourglass Dust ----------------
  ctx.save();
  const r = (isSkill ? 30 : 21) * s;

  if (st.phase === 'pinch') {
    const p = easeOutCubic(st.pinchT);
    // Opposing chronometric needles snapping inward onto the hit point
    for (const sgn of [-1, 1]) {
      const dist = (24 - p * 19) * s * (isSkill ? 1.25 : 1);
      const a = sgn > 0 ? -0.42 : Math.PI - 0.42;
      drawChronoNeedle(
        ctx,
        px + Math.cos(a) * dist,
        py + Math.sin(a) * dist,
        a + Math.PI,
        (isSkill ? 20 : 16) * s,
        2.4 * s,
        pal.primary,
        pal.spark || pal.secondary,
        pal.core,
        0.95 * st.pinchT,
      );
    }
    drawSoftBloom(ctx, px, py, (9 + p * 12) * s * (isSkill ? 1.25 : 1), pal.core, pal.primary, p * 0.82);
    ctx.restore();
    return;
  }

  const coolFade = 1 - easeInCubic(st.coolT);
  const beatA = ratchetStepAngle(st.burstT, isSkill ? 3 : 2, Math.PI * 0.42, { overshoot: 0.22, accelerate: false });
  const beatB = -ratchetStepAngle(st.burstT, isSkill ? 2 : 1, Math.PI * 0.35, { overshoot: 0.16, accelerate: false });

  // Vivid luminous violet-gold dilation flash at torso height so normal hits read immediately
  drawSoftBloom(ctx, px, py, r * 1.15, pal.core, pal.primary, (isSkill ? 0.48 : 0.42) * coolFade * (1 - st.burstT * 0.32));

  // Elevated 3D-tilted counter-ratcheting temporal caliper arcs framing the struck target
  drawEscapementArcs(ctx, px, py - 2 * s, r * (0.92 + st.coolT * 0.28), r * 0.56 * (0.92 + st.coolT * 0.28), {
    primary: pal.primary,
    secondary: pal.spark || pal.secondary,
    core: pal.core,
    alpha: 0.92 * coolFade,
    angleA: beatA + 0.4,
    angleB: beatB - 0.6,
    lineWidth: (isSkill ? 2.2 : 1.75) * s,
    arcSpan: Math.PI * (0.52 - st.coolT * 0.2),
    tickCount: 3,
  });

  // Offset ghosted freeze-snap strobe echo (gives unmistakable time-dilation parallax!)
  if (st.burstT < 0.78) {
    const echoFade = (1 - st.burstT / 0.78) * 0.55;
    drawEscapementArcs(ctx, px + 5.5 * s, py - 5 * s, r * 0.88, r * 0.52, {
      primary: pal.spark || pal.secondary,
      secondary: pal.core,
      core: pal.core,
      alpha: echoFade,
      angleA: beatA - 0.35,
      angleB: beatB + 0.25,
      lineWidth: 1.35 * s,
      arcSpan: Math.PI * 0.42,
      tickCount: 2,
    });
  }

  // Crisp elevated ratcheting needle-hands ticking cleanly, then unlocking & separating on coolT
  const sep = easeInCubic(st.coolT) * 14 * s;
  drawChronoNeedle(
    ctx,
    px + Math.cos(beatA) * sep,
    py + Math.sin(beatA) * sep * 0.65,
    beatA,
    r * (isSkill ? 1.28 : 1.1),
    (isSkill ? 2.8 : 2.2) * s,
    pal.primary,
    pal.spark || pal.secondary,
    pal.core,
    0.96 * coolFade,
  );
  drawChronoNeedle(
    ctx,
    px + Math.cos(beatB) * sep,
    py + Math.sin(beatB) * sep * 0.65,
    beatB,
    r * (isSkill ? 0.96 : 0.82),
    (isSkill ? 2.3 : 1.8) * s,
    pal.spark || pal.secondary,
    pal.core,
    pal.core,
    0.9 * coolFade,
  );

  // Suspended golden hourglass sand grains filling the vertical cylinder (hover during dilation, fall when time resumes!)
  if (!reducedMotion) {
    const grainCount = isSkill ? 16 : 9;
    for (let g = 0; g < grainCount; g += 1) {
      const ga = (g / grainCount) * Math.PI * 2 + rng() * 0.5;
      const gDist = (0.35 + rng() * (isSkill ? 1.35 : 0.85)) * r;
      const gx = px + Math.cos(ga) * gDist + Math.sin(st.burstT * 3 + g) * 2 * s;
      const elev = (rng() - 0.5) * (isSkill ? 28 : 14) * s;
      const fall = st.burstT * 2.0 * s + st.coolT * st.coolT * (18 + rng() * 10) * s;
      const gy = py + Math.sin(ga) * gDist * 0.45 + elev - 6 * s + fall;
      const gr = Math.max(1.1, (2.2 - st.coolT * 1.0) * s);
      ctx.fillStyle = withAlpha(g % 2 === 0 ? pal.spark || pal.secondary : pal.core, coolFade * 0.94);
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ============================================================================
// 4. ARCANE ARCHER (CRYSTAL) — Complete 5-Phase 3D Assembling & Shattering Crystal
//    (3D Shard Magnetic Assembly -> Elastic Bowstring Snap -> Rotating 3D Lance
//     & Helical Tumbling Micro-Shards -> Ballistic 3D Fragmentation -> Sublimation)
// ============================================================================

export function drawCrystalPrepMotion(ctx, cx, cy, emX, emY, facing, s, intensity, isSkillPrep, elapsed, pal, reducedMotion = false) {
  const ease = easeOutCubic(intensity);
  const scaleMod = isSkillPrep ? 1.25 : 1.0;
  const yawBase = facing > 0 ? 0 : Math.PI;

  ctx.save();
  // 5 individual 3D-tumbling crystal facets magnetically snapping into arrowhead alignment!
  const shardCount = isSkillPrep ? 6 : 5;
  for (let i = 0; i < shardCount; i += 1) {
    const stagger = clamp01((intensity - i * 0.07) / (1 - i * 0.07));
    if (stagger <= 0.01) continue;
    const pull = easeInOutBack(stagger, 1.1);
    const orbitA = (i / shardCount) * Math.PI * 2 + 0.4;
    const startR = (20 * (1 - clamp01(pull)) + 1.5) * s * scaleMod;
    const sx = emX + Math.cos(orbitA) * startR * 0.85 - facing * (1 - clamp01(pull)) * 6 * s;
    const sy = emY + Math.sin(orbitA) * startR * 0.72;
    // Shard tumbles freely while far, then locks into forward firing alignment as it snaps in!
    const shardYaw = yawBase + (1 - clamp01(pull)) * Math.sin(elapsed * 4 + i * 1.9) * 1.4;
    const shardRoll = elapsed * (2.6 + i * 0.5) * (1 - clamp01(pull) * 0.7);

    drawCrystalFacet3D(ctx, sx, sy, (6.5 + clamp01(pull) * 4.5) * s * scaleMod, (2.6 + clamp01(pull) * 1.2) * s * scaleMod, {
      yaw: shardYaw,
      pitch: 0.25 + (1 - clamp01(pull)) * 0.45,
      roll: shardRoll,
      primary: pal.primary,
      secondary: pal.secondary,
      core: pal.core,
      shadow: pal.glow || '#0c4a6e',
      alpha: 0.45 + stagger * 0.52,
    });
  }

  // Tight specular crystallization flash right as shards lock together (> 70% charge)
  if (intensity > 0.68 && !reducedMotion) {
    const lockT = clamp01((intensity - 0.68) / 0.32);
    drawSoftBloom(ctx, emX, emY, (6 + lockT * 7) * s * scaleMod, pal.core, pal.secondary, lockT * 0.65);
  }
  ctx.restore();
}

export function drawCrystalCastReleaseMotion(ctx, emX, emY, angle, s, t, pal) {
  const ease = easeOutExpo(t);
  const fade = Math.max(0, 1 - easeInCubic(t));
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const nx = -uy;
  const ny = ux;

  ctx.save();
  // Elastic bowstring recoil twang (damped sinusoidal chord vibration!)
  const vibrate = Math.sin(t * Math.PI * 4.5) * (1 - t) * 5.5 * s;
  const span = 12 * s;
  ctx.strokeStyle = withAlpha(pal.core, fade * 0.9);
  ctx.lineWidth = 1.4 * s * fade;
  ctx.beginPath();
  ctx.moveTo(emX + nx * span, emY + ny * span);
  if (typeof ctx.quadraticCurveTo === 'function') {
    ctx.quadraticCurveTo(emX + ux * vibrate, emY + uy * vibrate, emX - nx * span, emY - ny * span);
  } else {
    ctx.lineTo(emX + ux * vibrate, emY + uy * vibrate);
    ctx.lineTo(emX - nx * span, emY - ny * span);
  }
  ctx.stroke();

  // Twin kicked-off micro-crystal splinters flying off the nock
  for (const sgn of [-1, 1]) {
    const fx = emX + ux * (4 + ease * 10) * s + nx * sgn * (4 + ease * 9) * s;
    const fy = emY + uy * (4 + ease * 10) * s + ny * sgn * (4 + ease * 9) * s;
    drawCrystalFacet3D(ctx, fx, fy, 6.2 * s * fade, 2.4 * s * fade, {
      yaw: angle + sgn * 0.55,
      pitch: 0.3,
      roll: t * 8 * sgn,
      primary: pal.primary,
      secondary: pal.secondary,
      core: pal.core,
      shadow: pal.glow || '#0c4a6e',
      alpha: fade * 0.9,
    });
  }
  ctx.restore();
}

export function drawCrystalTravelMotion(ctx, pos, heading, progress, s, elapsed, seed, pal, reducedMotion = false) {
  const ux = Math.cos(heading);
  const uy = Math.sin(heading);
  const nx = -uy;
  const ny = ux;

  // Crisp, proportional 3D crystal spearhead (23px length at normal zoom, zero bloated sticker)
  const tailLen = (34 + smoothWindow(progress, 0.1, 0.5, 1.0) * 18) * s;

  ctx.save();

  // Flowing prismatic slipstream wake ribbon + delicate upper/lower refraction filaments
  drawTaperedNeedle(ctx, pos.x - ux * tailLen, pos.y - uy * tailLen, pos.x + ux * 6 * s, pos.y + uy * 6 * s, {
    width: 4.4 * s,
    color: pal.primary,
    coreColor: pal.core,
    alpha: 0.88,
    peakRatio: 0.85,
  });
  if (!reducedMotion) {
    for (const sgn of [-1, 1]) {
      const wave = Math.sin(elapsed * 14 + sgn) * 2.2 * s;
      drawTaperedNeedle(
        ctx,
        pos.x - ux * tailLen * 0.72 + nx * (sgn * 3.4 * s + wave),
        pos.y - uy * tailLen * 0.72 + ny * (sgn * 3.4 * s + wave),
        pos.x - ux * 2 * s + nx * sgn * 1.4 * s,
        pos.y - uy * 2 * s + ny * sgn * 1.4 * s,
        {
          width: 1.6 * s,
          color: pal.secondary,
          coreColor: pal.core,
          alpha: 0.64,
          peakRatio: 0.78,
        },
      );
    }
  }

  // 3 independent 3D-tumbling crystal micro-shards trailing in an unwinding helical wake!
  if (!reducedMotion) {
    for (let i = 0; i < 3; i += 1) {
      const lagDist = (12 + i * 9.5) * s;
      const helixPhase = elapsed * 9.5 + i * 2.1 + (seed || 0) * 0.1;
      const orbitR = (3.0 + i * 1.7) * s;
      const sx = pos.x - ux * lagDist + nx * Math.cos(helixPhase) * orbitR;
      const sy = pos.y - uy * lagDist + ny * Math.cos(helixPhase) * orbitR + Math.sin(helixPhase) * orbitR * 0.45;
      const depthScale = 0.82 + Math.sin(helixPhase) * 0.2;

      drawCrystalFacet3D(ctx, sx, sy, (7.4 - i * 0.9) * s * depthScale, (3.1 - i * 0.3) * s * depthScale, {
        yaw: heading + Math.sin(helixPhase) * 0.25,
        pitch: 0.35,
        roll: elapsed * (5.5 + i * 2.1) * (i % 2 === 0 ? 1 : -1),
        primary: pal.primary,
        secondary: pal.secondary,
        core: pal.core,
        shadow: pal.glow || '#0c4a6e',
        alpha: (0.9 - i * 0.16) * depthScale,
      });
    }
  }

  // Primary 3D-faceted rotating crystalline spearhead (facets dynamically glint as it spins!)
  drawSoftBloom(ctx, pos.x + ux * 4 * s, pos.y + uy * 4 * s, 12.5 * s, pal.core, pal.primary, 0.48);
  drawCrystalFacet3D(ctx, pos.x + ux * 3 * s, pos.y + uy * 3 * s, 23 * s, 7.6 * s, {
    yaw: heading,
    pitch: 0.2,
    roll: elapsed * 6.5 + (seed || 0) * 0.2,
    primary: pal.primary,
    secondary: pal.secondary,
    core: pal.core,
    shadow: pal.glow || '#0c4a6e',
    alpha: 0.99,
  });

  ctx.restore();
}

export function drawCrystalImpactMotion(ctx, px, py, heading, s, t, seed, pal, {
  isSkill = false,
  reducedMotion = false,
} = {}) {
  const ux = Math.cos(heading);
  const uy = Math.sin(heading);
  const rng = createDetRng((seed || 109) + 17);
  const scaleMul = isSkill ? 1.48 : 1.24;

  ctx.save();

  // Stage 1: Crisp directional piercing glint + 3-ray prismatic refraction burst
  if (t < 0.46) {
    const flashFade = Math.max(0, 1 - t / 0.46);
    const pierceEase = easeOutExpo(clamp01(t / 0.36));
    drawSoftBloom(ctx, px, py, (13 + pierceEase * 9) * s * scaleMul, pal.core, pal.primary, flashFade * 0.78);
    for (const dev of [-0.42, 0, 0.42]) {
      const a = heading + dev;
      const len = (dev === 0 ? 22 : 14) * (0.45 + pierceEase * 0.75) * s * scaleMul;
      drawTaperedNeedle(
        ctx,
        px - Math.cos(a) * 5 * s,
        py - Math.sin(a) * 5 * s,
        px + Math.cos(a) * len,
        py + Math.sin(a) * len,
        {
          width: (dev === 0 ? 3.8 : 2.3) * s * flashFade,
          color: dev === 0 ? pal.secondary : pal.primary,
          coreColor: pal.core,
          alpha: flashFade * 0.96,
          peakRatio: 0.38,
        },
      );
    }
  }

  // Stage 2 & 3: Real ballistic 3D crystal fragmentation (gravity + drag + floor bounce + individual spin + sublimation!)
  const fragCount = reducedMotion ? 5 : isSkill ? 14 : 10;
  const age = clamp01((t - 0.04) / 0.96);
  if (age > 0.01) {
    const sublimateFade = Math.max(0, 1 - easeInCubic(clamp01((age - 0.45) / 0.55)));
    for (let i = 0; i < fragCount; i += 1) {
      const spread = (rng() - 0.5) * Math.PI * 1.45;
      const dirA = heading + spread * (i < fragCount * 0.6 ? 0.65 : 1.15);
      const speed = (24 + rng() * 30) * s * scaleMul;
      const vx = Math.cos(dirA) * speed;
      const vy = Math.sin(dirA) * speed * 0.72 - (12 + rng() * 15) * s * scaleMul;

      const dragT = easeOutCubic(age);
      const fx = px + vx * dragT;
      let fy = py + vy * dragT + 0.5 * (46 * s * scaleMul) * age * age;
      const floorY = py + (8 + rng() * 6) * s;
      if (fy > floorY) {
        const over = fy - floorY;
        fy = floorY - Math.min(over * 0.38, 6 * s);
      }

      const spinRate = (rng() > 0.5 ? 1 : -1) * (6 + rng() * 9);
      const fragLen = (8.2 + rng() * 4.8) * s * scaleMul * (0.45 + sublimateFade * 0.55);
      const fragW = (3.2 + rng() * 1.9) * s * scaleMul * (0.45 + sublimateFade * 0.55);

      drawCrystalFacet3D(ctx, fx, fy, fragLen, fragW, {
        yaw: dirA + spinRate * age * 0.4,
        pitch: 0.2 + rng() * 0.7,
        roll: spinRate * age,
        primary: pal.primary,
        secondary: pal.secondary,
        core: pal.core,
        shadow: pal.glow || '#0c4a6e',
        alpha: sublimateFade * 0.96,
      });
    }

    // Crisp rising frost sublimation motes during dissipation
    if (age > 0.34 && !reducedMotion) {
      const mistT = clamp01((age - 0.34) / 0.66);
      const mistFade = Math.sin(mistT * Math.PI);
      for (let m = 0; m < 6; m += 1) {
        const mx = px + (rng() - 0.5) * 32 * s * scaleMul;
        const my = py + (rng() - 0.5) * 12 * s - mistT * 12 * s;
        ctx.fillStyle = withAlpha(pal.secondary, mistFade * 0.65);
        ctx.beginPath();
        ctx.arc(mx, my, (2.0 + mistT * 1.4) * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}
