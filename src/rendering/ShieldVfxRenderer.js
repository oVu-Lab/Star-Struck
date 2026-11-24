/**
 * ShieldVfxRenderer — Layered dimensional Canvas 2D renderer for Star Struck's Shield VFX.
 *
 * Rendering pipeline:
 * 1. drawUnitShieldBack(...)   — Drawn BEHIND the unit: ground reflection caustics, recessed
 *                                far-side translucent shell interior, rear-orbiting particles.
 * 2. drawUnitShieldFront(...)  — Drawn IN FRONT of the unit: formation choreography, sculpted
 *                                Fresnel-clear protective shell with visible rim thickness,
 *                                clipped theme-specific material patterns, specular highlights,
 *                                localized impact compression & surface ripples, proportional
 *                                strength feedback & low-shield cracks, front-orbiting particles.
 * 3. drawShieldTransientEffects(...) — World-space Shield Break shatter (compression -> fracture
 *                                web -> tumbling 2.5D themed fragments) and Shield Expiration
 *                                (calm upward dissolve + rising motes).
 */

import {
  getShieldTheme,
  resolveShieldTheme,
  computeShieldGeometry,
} from './ShieldVfxConfig.js';

const RGBA_CACHE = new Map();

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return { r: 56, g: 189, b: 248 };
  const cached = RGBA_CACHE.get(hex);
  if (cached) return cached;
  let clean = hex.trim();
  if (clean.startsWith('#')) clean = clean.slice(1);
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  }
  const num = parseInt(clean, 16);
  const rgb = Number.isFinite(num)
    ? { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
    : { r: 56, g: 189, b: 248 };
  if (RGBA_CACHE.size < 256) RGBA_CACHE.set(hex, rgb);
  return rgb;
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function easeOutCubic(t) {
  const u = 1 - clamp(t, 0, 1);
  return 1 - u * u * u;
}

function easeOutQuad(t) {
  const u = 1 - clamp(t, 0, 1);
  return 1 - u * u;
}

function easeOutBackSoft(t) {
  const x = clamp(t, 0, 1);
  const c1 = 1.15;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function wrapAngleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function pseudoHash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/**
 * Evaluates a themed shell contour radius multiplier at polar angle `theta`.
 * Creates distinctive silhouettes (faceted crystal, curved kite, geodesic hex,
 * directional phalanx, vaulted cathedral arch, chamfered hull, etc.) while
 * remaining clean and legible at battle distance.
 */
function evaluateShellProfileRadius(shellShape, theta, facing, time, reducedMotion) {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const fCos = cos * facing; // +1 toward battlefront facing side, -1 behind unit
  const wave = reducedMotion ? 0 : Math.sin(theta * 3 + time * 1.8) * 0.011;

  switch (shellShape) {
    case 'faceted_crystal': {
      // Crisp 8-facet elongated crystal silhouette
      const seg = Math.PI / 4;
      const local = ((theta + Math.PI / 8) % seg + seg) % seg - seg * 0.5;
      const poly = 1 / Math.max(0.84, Math.cos(local));
      const tipBoost = Math.pow(Math.abs(sin), 4) * 0.06;
      return poly * 0.94 + tipBoost;
    }
    case 'hex_geodesic': {
      // Softly chamfered 6-sided geodesic dome
      const seg = Math.PI / 3;
      const local = ((theta + Math.PI / 6) % seg + seg) % seg - seg * 0.5;
      const hexR = 0.935 + (1 / Math.max(0.86, Math.cos(local)) - 1) * 0.62;
      return hexR + wave * 0.6;
    }
    case 'curved_kite': {
      // Winged knightly kite-shield silhouette: broad shoulders, gently tapered base
      const shoulder = sin < 0 ? Math.max(0, -sin) * 0.05 : 0;
      const baseTaper = sin > 0.15 ? (sin - 0.15) * 0.11 * Math.abs(cos) : 0;
      const frontProw = fCos > 0 ? fCos * 0.05 : -0.02;
      return 0.98 + shoulder - baseTaper + frontProw + wave * 0.5;
    }
    case 'phalanx_wall': {
      // Assertive curved frontline shield wall on the facing side, sleek stabilizer behind
      const frontBulge = fCos > 0 ? Math.pow(fCos, 1.3) * 0.12 : fCos * 0.09;
      const flatFront = fCos > 0.65 ? -(fCos - 0.65) * 0.12 : 0;
      return 0.97 + frontBulge + flatFront + wave * 0.45;
    }
    case 'chamfered_hull':
    case 'bastion_plates': {
      // Heavy 8-chamfer industrial fortress containment shell
      const seg = Math.PI / 4;
      const local = ((theta + Math.PI / 8) % seg + seg) % seg - seg * 0.5;
      const oct = 0.95 + (1 / Math.max(0.88, Math.cos(local)) - 1) * 0.7;
      return oct + (fCos > 0 ? fCos * 0.035 : 0);
    }
    case 'obsidian_carapace': {
      // Bold armored carapace with subtle angular shoulder ridges
      const ridge = Math.cos(theta * 6) * 0.036;
      const broad = Math.abs(cos) * 0.04;
      return 0.98 + ridge + broad + wave * 0.5;
    }
    case 'chrono_dial': {
      // Precision celestial astrolabe contour with subtle cardinal notches
      const cardinal = Math.pow(Math.cos(theta * 2), 6) * 0.028;
      return 0.99 + cardinal;
    }
    case 'void_membrane': {
      // Gently undulating organic energy membrane
      const ripple = reducedMotion
        ? Math.sin(theta * 5) * 0.02
        : Math.sin(theta * 5 + time * 2.4) * 0.024 + Math.cos(theta * 3 - time * 1.7) * 0.016;
      return 0.98 + ripple;
    }
    case 'cathedral_arch': {
      // Graceful vaulted upper crown tapering gently to the ground
      const crown = sin < -0.25 ? Math.pow(-sin - 0.25, 1.4) * 0.1 : 0;
      const waist = Math.abs(sin) < 0.2 ? -0.02 : 0;
      return 0.98 + crown + waist + wave * 0.6;
    }
    case 'petal_dome':
    case 'sanctity_veil': {
      // Soft organic lotus-petal canopy contour
      const petal = Math.cos(theta * 4 + Math.PI * 0.25) * 0.02;
      return 0.99 + petal + wave * 0.7;
    }
    case 'solar_corona': {
      // Warm solar orb with subtle harmonic corona swells
      const corona = reducedMotion
        ? Math.cos(theta * 6) * 0.018
        : Math.cos(theta * 6 - time * 2.1) * 0.022;
      return 0.99 + corona;
    }
    case 'lunar_celestial':
    default: {
      return 0.995 + wave * 0.65;
    }
  }
}

/**
 * Computes localized surface indentation/rebound at angle `theta` produced by
 * all active hits on the shield.
 */
function computeHitDeformationAtAngle(theta, shieldState, reducedMotion) {
  if (!shieldState || !shieldState.activeHitCount) return 0;
  let totalDeform = 0;
  const hits = shieldState.hitImpulses;
  for (let i = 0; i < hits.length; i += 1) {
    const hit = hits[i];
    if (!hit.active) continue;
    const diff = Math.abs(wrapAngleDiff(theta, hit.surfaceAngle));
    const cone = 0.78;
    if (diff >= cone) continue;
    const spatial = Math.cos((diff / cone) * Math.PI * 0.5);
    const spatialSq = spatial * spatial;
    const t = clamp(hit.age / Math.max(0.05, hit.duration), 0, 1);

    // Phase 1: crisp inward compression (negative); Phase 2: damped elastic rebound
    let impulse;
    if (reducedMotion) {
      impulse = -0.06 * (1 - t);
    } else if (t < 0.24) {
      impulse = -Math.sin((t / 0.24) * Math.PI * 0.5) * 0.16;
    } else {
      const rt = (t - 0.24) / 0.76;
      impulse = Math.sin(rt * Math.PI * 2.2) * Math.exp(-rt * 3.4) * 0.085 - (1 - rt) * 0.025;
    }
    totalDeform += impulse * spatialSq * (0.45 + hit.severity * 0.85);
  }
  return clamp(totalDeform, -0.22, 0.09);
}

/**
 * Samples a closed shield contour into a reusable points array.
 */
const CONTOUR_BUF_OUTER = [];
const CONTOUR_BUF_INNER = [];

function buildShieldContour(
  outBuf,
  geom,
  theme,
  shieldState,
  elapsed,
  {
    scaleMult = 1,
    insetPx = 0,
    reducedMotion = false,
    compressExtra = 0,
    compressAngle = 0,
  } = {},
) {
  const segs = theme.shellShape === 'faceted_crystal' ? 16 : 36;
  outBuf.length = segs;

  const breath = reducedMotion
    ? 1
    : 1 + Math.sin(elapsed * (theme.pulseSpeed || 2.0) + (shieldState?.seed || 0) * 0.01) * 0.015;
  const tensionBreath = shieldState?.proximityTension
    ? 1 + Math.sin(elapsed * 7.5) * 0.008 * shieldState.proximityTension
    : 1;
  const baseRx = Math.max(4, geom.rx * scaleMult * breath * tensionBreath - insetPx);
  const baseRy = Math.max(4, geom.ry * scaleMult * breath * tensionBreath - insetPx);

  for (let i = 0; i < segs; i += 1) {
    const theta = (i / segs) * Math.PI * 2;
    let rMult = evaluateShellProfileRadius(
      theme.shellShape,
      theta,
      geom.facing,
      elapsed,
      reducedMotion,
    );
    rMult += computeHitDeformationAtAngle(theta, shieldState, reducedMotion);

    if (compressExtra > 0) {
      const diff = Math.abs(wrapAngleDiff(theta, compressAngle));
      const localBias = diff < 1.1 ? Math.cos((diff / 1.1) * Math.PI * 0.5) * 0.08 : 0;
      rMult -= compressExtra + localBias * compressExtra * 2.2;
    }

    const x = geom.cx + Math.cos(theta) * baseRx * rMult;
    const y = geom.cy + Math.sin(theta) * baseRy * rMult;
    if (!outBuf[i]) outBuf[i] = { x, y, theta };
    else {
      outBuf[i].x = x;
      outBuf[i].y = y;
      outBuf[i].theta = theta;
    }
  }
  return outBuf;
}

function traceContourPath(ctx, pts, sharpCorners = false) {
  const n = pts.length;
  if (n < 3) return;
  ctx.beginPath();
  if (sharpCorners) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n; i += 1) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    return;
  }
  // Smooth closed quadratic curve for sleek glass/energy curvature
  const firstMidX = (pts[n - 1].x + pts[0].x) * 0.5;
  const firstMidY = (pts[n - 1].y + pts[0].y) * 0.5;
  ctx.moveTo(firstMidX, firstMidY);
  for (let i = 0; i < n; i += 1) {
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const midX = (curr.x + next.x) * 0.5;
    const midY = (curr.y + next.y) * 0.5;
    ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
  }
  ctx.closePath();
}

/**
 * Computes exact screen-space impact point on the shield perimeter at `surfaceAngle`.
 */
function computeSurfacePoint(geom, theme, shieldState, angle, elapsed, scaleMult, reducedMotion) {
  let rMult = evaluateShellProfileRadius(theme.shellShape, angle, geom.facing, elapsed, reducedMotion);
  rMult += computeHitDeformationAtAngle(angle, shieldState, reducedMotion);
  return {
    x: geom.cx + Math.cos(angle) * geom.rx * scaleMult * rMult,
    y: geom.cy + Math.sin(angle) * geom.ry * scaleMult * rMult,
  };
}

/**
 * Helper to draw a themed energy particle / boundary mote.
 */
function drawThemedParticle(ctx, x, y, size, angle, style, primary, secondary, core, alpha) {
  if (alpha <= 0.02 || size <= 0.4) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = clamp(alpha, 0, 1);

  switch (style) {
    case 'frost_diamonds':
    case 'prism_beacons': {
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.moveTo(0, -size * 1.35);
      ctx.lineTo(size * 0.85, 0);
      ctx.lineTo(0, size * 1.35);
      ctx.lineTo(-size * 0.85, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = primary;
      ctx.lineWidth = 0.9;
      ctx.stroke();
      break;
    }
    case 'star_pearls':
    case 'pure_sparks': {
      // Crisp 4-point star pearl
      const inner = size * 0.34;
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.moveTo(0, -size * 1.5);
      ctx.lineTo(inner, -inner);
      ctx.lineTo(size * 1.5, 0);
      ctx.lineTo(inner, inner);
      ctx.lineTo(0, size * 1.5);
      ctx.lineTo(-inner, inner);
      ctx.lineTo(-size * 1.5, 0);
      ctx.lineTo(-inner, -inner);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'chrono_ticks':
    case 'tactical_chevrons': {
      ctx.strokeStyle = secondary;
      ctx.lineWidth = Math.max(1.1, size * 0.48);
      ctx.beginPath();
      ctx.moveTo(-size * 0.9, -size * 0.65);
      ctx.lineTo(size * 0.7, 0);
      ctx.lineTo(-size * 0.9, size * 0.65);
      ctx.stroke();
      break;
    }
    case 'leaf_motes': {
      ctx.fillStyle = secondary;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 1.35, size * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'solar_embers':
    case 'cinder_flecks':
    case 'forge_sparks': {
      ctx.fillStyle = primary;
      ctx.beginPath();
      ctx.arc(0, 0, size * 1.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default: {
      // Kite sparks, flux bolts, void wisps
      ctx.fillStyle = secondary;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 1.5, size * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(size * 0.25, 0, size * 0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

/**
 * Draws a single themed 2.5D energy fragment for Formation assembly and Shield Break shatter.
 */
function drawThemedFragmentShape(ctx, size, aspect, shape, fillColor, rimColor, coreColor) {
  const w = size * (0.9 + aspect * 0.55);
  const h = size * (0.65 + (1 - aspect * 0.35) * 0.45);

  ctx.beginPath();
  switch (shape) {
    case 'hex_tile': {
      for (let k = 0; k < 6; k += 1) {
        const a = (k * Math.PI) / 3;
        const px = Math.cos(a) * w * 0.72;
        const py = Math.sin(a) * h * 0.78;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case 'crystal_shard':
    case 'obsidian_shard': {
      ctx.moveTo(w * 1.15, 0);
      ctx.lineTo(w * 0.1, -h * 0.8);
      ctx.lineTo(-w * 0.95, -h * 0.18);
      ctx.lineTo(-w * 0.25, h * 0.78);
      ctx.closePath();
      break;
    }
    case 'crescent_shard':
    case 'solar_arc':
    case 'gear_arc': {
      ctx.arc(0, 0, w * 0.82, -0.95, 0.95);
      ctx.arc(-w * 0.24, 0, w * 0.62, 0.85, -0.85, true);
      ctx.closePath();
      break;
    }
    case 'petal_shard': {
      ctx.moveTo(w * 1.05, 0);
      ctx.quadraticCurveTo(w * 0.2, -h * 0.95, -w * 0.95, 0);
      ctx.quadraticCurveTo(w * 0.2, h * 0.95, w * 1.05, 0);
      ctx.closePath();
      break;
    }
    case 'kite_plate':
    case 'armor_plate': {
      ctx.moveTo(w * 0.85, -h * 0.52);
      ctx.lineTo(w * 0.95, h * 0.35);
      ctx.lineTo(-w * 0.15, h * 0.82);
      ctx.lineTo(-w * 0.92, h * 0.15);
      ctx.lineTo(-w * 0.68, -h * 0.68);
      ctx.closePath();
      break;
    }
    case 'plasma_splinter':
    default: {
      ctx.moveTo(w * 1.25, 0);
      ctx.lineTo(0, -h * 0.52);
      ctx.lineTo(-w * 1.15, 0);
      ctx.lineTo(0, h * 0.52);
      ctx.closePath();
      break;
    }
  }

  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = 1.0;
  ctx.stroke();

  // Internal specular core glint
  ctx.fillStyle = coreColor;
  ctx.globalAlpha *= 0.65;
  ctx.beginPath();
  ctx.ellipse(w * 0.12, -h * 0.1, w * 0.36, h * 0.16, -0.25, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draws the clipped theme-specific internal surface pattern & multi-speed flowing motion.
 * Carefully keeps the central ~50% clear so the protected unit remains crisp.
 */
function drawThemeInternalPattern(
  ctx,
  geom,
  theme,
  shieldState,
  elapsed,
  strengthAlpha,
  reducedMotion,
) {
  const pal = theme.palette;
  const { cx, cy, rx, ry, facing, scale } = geom;
  const flowT = reducedMotion ? 0 : elapsed * (theme.flowSpeed || 1.0);
  const boost = 1 + (shieldState?.hitGlowBoost || 0) * 0.45 + (shieldState?.reinforcePulse || 0) * 0.5;
  const baseAlpha = clamp(0.42 * strengthAlpha * boost, 0.08, 0.85);

  ctx.save();

  switch (theme.patternStyle) {
    case 'hex_lattice': {
      // Perimeter honeycomb cells hugging the outer shell curvature
      const cellR = Math.max(4.5, 6.4 * scale);
      const rings = 9;
      for (let i = 0; i < rings; i += 1) {
        const a = (i / rings) * Math.PI * 2 + flowT * 0.14;
        const px = cx + Math.cos(a) * rx * 0.78;
        const py = cy + Math.sin(a) * ry * 0.78;
        const wave = 0.5 + 0.5 * Math.sin(a * 2 - flowT * 2.2);
        const cellAlpha = baseAlpha * (0.38 + wave * 0.52);
        ctx.strokeStyle = rgba(wave > 0.65 ? pal.rim : pal.secondary, cellAlpha);
        ctx.fillStyle = rgba(pal.primary, cellAlpha * 0.28);
        ctx.lineWidth = Math.max(0.8, 1.05 * scale);
        ctx.beginPath();
        for (let k = 0; k < 6; k += 1) {
          const ha = (k * Math.PI) / 3 + 0.25;
          const hx = px + Math.cos(ha) * cellR;
          const hy = py + Math.sin(ha) * cellR * 0.92;
          if (k === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      break;
    }

    case 'crystal_facets': {
      // Crisp translucent crystalline facet planes & gliding prismatic sheen
      const facets = [
        [[-0.95, -0.25], [-0.42, -0.88], [-0.24, -0.35]],
        [[0.42, -0.88], [0.95, -0.22], [0.35, -0.32]],
        [[-0.96, 0.24], [-0.44, 0.88], [-0.32, 0.34]],
        [[0.44, 0.88], [0.96, 0.22], [0.32, 0.34]],
      ];
      for (let i = 0; i < facets.length; i += 1) {
        const f = facets[i];
        const shimmer = 0.45 + 0.55 * Math.sin(flowT * 1.6 + i * 1.45);
        ctx.beginPath();
        ctx.moveTo(cx + f[0][0] * rx, cy + f[0][1] * ry);
        ctx.lineTo(cx + f[1][0] * rx, cy + f[1][1] * ry);
        ctx.lineTo(cx + f[2][0] * rx, cy + f[2][1] * ry);
        ctx.closePath();
        ctx.fillStyle = rgba(i % 2 === 0 ? pal.secondary : pal.rim, baseAlpha * 0.32 * shimmer);
        ctx.fill();
        ctx.strokeStyle = rgba(pal.rim, baseAlpha * 0.72 * shimmer);
        ctx.lineWidth = Math.max(0.8, 1.0 * scale);
        ctx.stroke();
      }
      // Subtle diagonal frost refraction glint gliding across edge
      const sweep = ((flowT * 0.35) % 2.2) - 1.1;
      const g = ctx.createLinearGradient(
        cx + (sweep - 0.35) * rx,
        cy - ry,
        cx + (sweep + 0.35) * rx,
        cy + ry,
      );
      g.addColorStop(0, rgba(pal.core, 0));
      g.addColorStop(0.5, rgba(pal.core, baseAlpha * 0.32));
      g.addColorStop(1, rgba(pal.core, 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - rx * 1.1, cy - ry * 1.1, rx * 2.2, ry * 2.2);
      break;
    }

    case 'solar_streams': {
      // Two multi-speed warm radiant solar energy streams hugging opposite limbs
      for (let layer = 0; layer < 2; layer += 1) {
        const speed = layer === 0 ? 1.0 : -0.62;
        const startA = flowT * speed + layer * Math.PI;
        const span = layer === 0 ? 1.55 : 1.15;
        ctx.strokeStyle = rgba(layer === 0 ? pal.secondary : pal.primary, baseAlpha * (layer === 0 ? 0.82 : 0.6));
        ctx.lineWidth = (layer === 0 ? 2.4 : 1.6) * scale;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.ellipse(
          cx,
          cy,
          rx * (0.86 - layer * 0.08),
          ry * (0.86 - layer * 0.08),
          0,
          startA,
          startA + span,
        );
        ctx.stroke();

        // Twin counter-arc
        ctx.beginPath();
        ctx.ellipse(
          cx,
          cy,
          rx * (0.86 - layer * 0.08),
          ry * (0.86 - layer * 0.08),
          0,
          startA + Math.PI,
          startA + Math.PI + span * 0.85,
        );
        ctx.stroke();
      }
      // Warm crown solar highlight
      const crownGrad = ctx.createRadialGradient(cx, cy - ry * 0.78, 1, cx, cy - ry * 0.78, rx * 0.65);
      crownGrad.addColorStop(0, rgba(pal.core, baseAlpha * 0.62));
      crownGrad.addColorStop(0.5, rgba(pal.secondary, baseAlpha * 0.25));
      crownGrad.addColorStop(1, rgba(pal.primary, 0));
      ctx.fillStyle = crownGrad;
      ctx.fillRect(cx - rx, cy - ry * 1.1, rx * 2, ry * 0.9);
      break;
    }

    case 'clockwork_layers': {
      // Precision antique-gold temporal dial ticks around perimeter
      const tickCount = 12;
      const slowRot = flowT * 0.18;
      ctx.strokeStyle = rgba(pal.secondary, baseAlpha * 0.78);
      for (let i = 0; i < tickCount; i += 1) {
        const a = (i / tickCount) * Math.PI * 2 + slowRot;
        const major = i % 3 === 0;
        const rIn = major ? 0.77 : 0.85;
        ctx.lineWidth = (major ? 1.55 : 0.95) * scale;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * rx * rIn, cy + Math.sin(a) * ry * rIn);
        ctx.lineTo(cx + Math.cos(a) * rx * 0.95, cy + Math.sin(a) * ry * 0.95);
        ctx.stroke();
      }
      // Counter-rotating controlled escapement arcs (two subtle speeds)
      ctx.strokeStyle = rgba(pal.primary, baseAlpha * 0.72);
      ctx.lineWidth = 1.6 * scale;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.84, ry * 0.84, 0, -flowT * 0.35, -flowT * 0.35 + 1.1);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.84, ry * 0.84, 0, -flowT * 0.35 + Math.PI, -flowT * 0.35 + Math.PI + 1.1);
      ctx.stroke();

      ctx.strokeStyle = rgba(pal.secondary, baseAlpha * 0.65);
      ctx.lineWidth = 1.15 * scale;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.73, ry * 0.73, 0, flowT * 0.52, flowT * 0.52 + 0.95);
      ctx.stroke();
      break;
    }

    case 'lunar_crescents': {
      // Soft celestial crescent highlight hugging upper-left limb + counter crescent
      const drift = Math.sin(flowT * 0.75) * 0.14;
      ctx.strokeStyle = rgba(pal.secondary, baseAlpha * 0.88);
      ctx.lineWidth = 2.6 * scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.87, ry * 0.87, 0, -Math.PI * 0.86 + drift, -Math.PI * 0.24 + drift);
      ctx.stroke();

      ctx.strokeStyle = rgba(pal.core, baseAlpha * 0.75);
      ctx.lineWidth = 1.2 * scale;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.91, ry * 0.91, 0, -Math.PI * 0.78 + drift, -Math.PI * 0.34 + drift);
      ctx.stroke();

      ctx.strokeStyle = rgba(pal.primary, baseAlpha * 0.55);
      ctx.lineWidth = 1.5 * scale;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.84, ry * 0.84, 0, Math.PI * 0.16 - drift, Math.PI * 0.68 - drift);
      ctx.stroke();

      // Delicate constellation pearls near outer boundary
      for (let i = 0; i < 4; i += 1) {
        const a = i * 1.57 + 0.4 + flowT * 0.15;
        const px = cx + Math.cos(a) * rx * 0.78;
        const py = cy + Math.sin(a) * ry * 0.78;
        ctx.fillStyle = rgba(pal.core, baseAlpha * (0.55 + 0.35 * Math.sin(flowT * 2.2 + i)));
        ctx.beginPath();
        ctx.arc(px, py, 1.45 * scale, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'chevron_plates': {
      // Knightly curved kite-plate bevels + gilded heraldic crest arch
      ctx.strokeStyle = rgba(pal.secondary, baseAlpha * 0.9);
      ctx.lineWidth = 1.9 * scale;
      ctx.lineCap = 'round';
      // Gilded crown arch
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.88, ry * 0.88, 0, -Math.PI * 0.78, -Math.PI * 0.22);
      ctx.stroke();
      // Winged side plate bevels
      ctx.strokeStyle = rgba(pal.rim, baseAlpha * 0.65);
      ctx.lineWidth = 1.25 * scale;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + side * rx * 0.62, cy - ry * 0.62);
        ctx.quadraticCurveTo(cx + side * rx * 0.88, cy, cx + side * rx * 0.48, cy + ry * 0.66);
        ctx.stroke();
      }
      // Rising energy sheen across front plate
      const phase = ((flowT * 0.42) % 1.4) - 0.2;
      const sheenY = cy + ry - phase * ry * 2;
      ctx.strokeStyle = rgba(pal.core, baseAlpha * 0.42 * (1 - Math.abs(phase - 0.5) * 1.4));
      ctx.lineWidth = 1.6 * scale;
      ctx.beginPath();
      ctx.moveTo(cx - rx * 0.75, sheenY);
      ctx.quadraticCurveTo(cx + facing * rx * 0.25, sheenY - 4 * scale, cx + rx * 0.75, sheenY);
      ctx.stroke();
      break;
    }

    case 'tactical_grid': {
      // Reinforced directional frontline barrier wall on the facing side
      const frontCenter = facing > 0 ? 0 : Math.PI;
      ctx.strokeStyle = rgba(pal.core, baseAlpha * 0.92);
      ctx.lineWidth = 2.9 * scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.91, ry * 0.91, 0, frontCenter - 1.02, frontCenter + 1.02);
      ctx.stroke();

      // Secondary tactical sight-line arc & bracket ticks
      ctx.strokeStyle = rgba(pal.secondary, baseAlpha * 0.72);
      ctx.lineWidth = 1.2 * scale;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.8, ry * 0.8, 0, frontCenter - 0.85, frontCenter + 0.85);
      ctx.stroke();

      // Subtle vertical military scan pulse gliding along frontline
      const scanY = cy + Math.sin(flowT * 1.8) * ry * 0.55;
      const scanGrad = ctx.createLinearGradient(cx, scanY - 7 * scale, cx, scanY + 7 * scale);
      scanGrad.addColorStop(0, rgba(pal.secondary, 0));
      scanGrad.addColorStop(0.5, rgba(pal.rim, baseAlpha * 0.34));
      scanGrad.addColorStop(1, rgba(pal.secondary, 0));
      ctx.fillStyle = scanGrad;
      ctx.fillRect(cx + (facing > 0 ? 0 : -rx), scanY - 7 * scale, rx, 14 * scale);
      break;
    }

    case 'armored_ribs': {
      // Chamfered interlocking containment plate ribs & structural edge brackets
      ctx.strokeStyle = rgba(pal.secondary, baseAlpha * 0.76);
      ctx.lineWidth = 1.55 * scale;
      const segs = 4;
      for (let i = 0; i < segs; i += 1) {
        const a = (i / segs) * Math.PI * 2 + Math.PI * 0.25;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx * 0.86, ry * 0.86, 0, a - 0.48, a + 0.48);
        ctx.stroke();

        // Corner structural rib seam
        const seamA = a + Math.PI * 0.25;
        ctx.strokeStyle = rgba(pal.rim, baseAlpha * 0.55);
        ctx.lineWidth = 1.1 * scale;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(seamA) * rx * 0.76, cy + Math.sin(seamA) * ry * 0.76);
        ctx.lineTo(cx + Math.cos(seamA) * rx * 0.96, cy + Math.sin(seamA) * ry * 0.96);
        ctx.stroke();
        ctx.strokeStyle = rgba(pal.secondary, baseAlpha * 0.76);
        ctx.lineWidth = 1.55 * scale;
      }
      break;
    }

    case 'magma_veins': {
      // Dark obsidian rim depth with warm pulsing gilded-crimson carapace seams
      const seamAngles = [-2.35, -0.78, 0.78, 2.35];
      for (let i = 0; i < seamAngles.length; i += 1) {
        const a = seamAngles[i];
        const pulse = 0.55 + 0.45 * Math.sin(flowT * 2.1 + i * 1.4);
        ctx.strokeStyle = rgba(i % 2 === 0 ? pal.secondary : pal.primary, baseAlpha * (0.55 + pulse * 0.4));
        ctx.lineWidth = 1.5 * scale;
        ctx.beginPath();
        const x0 = cx + Math.cos(a) * rx * 0.96;
        const y0 = cy + Math.sin(a) * ry * 0.96;
        const xm = cx + Math.cos(a + 0.14) * rx * 0.8;
        const ym = cy + Math.sin(a + 0.14) * ry * 0.8;
        const x1 = cx + Math.cos(a - 0.08) * rx * 0.68;
        const y1 = cy + Math.sin(a - 0.08) * ry * 0.68;
        ctx.moveTo(x0, y0);
        ctx.lineTo(xm, ym);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      break;
    }

    case 'void_tendrils': {
      // Coiling violet-rose plasma tendrils undulating around outer membrane
      for (let k = 0; k < 3; k += 1) {
        const baseA = (k / 3) * Math.PI * 2 + flowT * 0.55;
        ctx.strokeStyle = rgba(k % 2 === 0 ? pal.primary : pal.secondary, baseAlpha * 0.78);
        ctx.lineWidth = 1.7 * scale;
        ctx.beginPath();
        for (let s = 0; s <= 10; s += 1) {
          const frac = s / 10;
          const a = baseA + frac * 1.25;
          const rad = 0.84 + Math.sin(frac * Math.PI * 2 + flowT * 2.6 + k) * 0.06;
          const px = cx + Math.cos(a) * rx * rad;
          const py = cy + Math.sin(a) * ry * rad;
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      break;
    }

    case 'verdant_caustics':
    case 'ascending_ribbons':
    default: {
      // Gentle upward-drifting luminous caustics & delicate rising energy ribbons
      for (let i = 0; i < 3; i += 1) {
        const xOff = (i - 1) * rx * 0.58;
        const cycle = ((flowT * 0.48 + i * 0.37) % 1);
        const yPos = cy + ry * 0.85 - cycle * ry * 1.7;
        const ribbonAlpha = Math.sin(cycle * Math.PI) * baseAlpha * 0.72;
        if (ribbonAlpha <= 0.02) continue;
        const rg = ctx.createLinearGradient(cx + xOff, yPos - ry * 0.35, cx + xOff, yPos + ry * 0.35);
        rg.addColorStop(0, rgba(pal.core, 0));
        rg.addColorStop(0.5, rgba(i === 1 ? pal.secondary : pal.rim, ribbonAlpha));
        rg.addColorStop(1, rgba(pal.primary, 0));
        ctx.strokeStyle = rg;
        ctx.lineWidth = 1.9 * scale;
        ctx.beginPath();
        ctx.moveTo(cx + xOff - 2 * scale, yPos + ry * 0.32);
        ctx.quadraticCurveTo(cx + xOff + Math.sin(flowT * 2 + i) * 4 * scale, yPos, cx + xOff + 1 * scale, yPos - ry * 0.32);
        ctx.stroke();
      }
      break;
    }
  }

  ctx.restore();
}

/**
 * Draws localized hit flashes, curved expanding surface ripples, and locally
 * illuminated material cells CLIPPED inside the shield shell.
 */
function drawLocalizedHitSurfaceEffects(
  ctx,
  geom,
  theme,
  shieldState,
  elapsed,
  scaleMult,
  reducedMotion,
) {
  if (!shieldState || !shieldState.activeHitCount) return;
  const pal = theme.palette;
  const hits = shieldState.hitImpulses;
  const maxSpan = Math.max(geom.rx, geom.ry) * 1.55;

  ctx.save();
  for (let i = 0; i < hits.length; i += 1) {
    const hit = hits[i];
    if (!hit.active) continue;
    const t = clamp(hit.age / Math.max(0.05, hit.duration), 0, 1);
    const fade = Math.pow(1 - t, 1.35);
    const sev = hit.severity;
    const pt = computeSurfacePoint(geom, theme, shieldState, hit.surfaceAngle, elapsed, scaleMult, reducedMotion);

    // 1. Localized bright impact core bloom at the exact impact coordinate
    const flashFade = Math.max(0, 1 - t / 0.42);
    if (flashFade > 0.01) {
      const flashR = (7 + sev * 13 + (hit.isCrit ? 5 : 0)) * geom.scale * (0.8 + t * 0.5);
      const grad = ctx.createRadialGradient(pt.x, pt.y, 0.5, pt.x, pt.y, flashR);
      grad.addColorStop(0, rgba(pal.core, clamp(flashFade * (0.78 + sev * 0.22), 0, 1)));
      grad.addColorStop(0.35, rgba(hit.isCrit ? pal.secondary : pal.rim, flashFade * 0.72));
      grad.addColorStop(0.7, rgba(pal.primary, flashFade * 0.34));
      grad.addColorStop(1, rgba(pal.primary, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, flashR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Primary spreading surface energy ripple centered at (pt.x, pt.y)
    const r1 = (4 + easeOutCubic(t) * maxSpan * (0.48 + sev * 0.56));
    const rippleAlpha = fade * (0.46 + sev * 0.46);
    ctx.strokeStyle = rgba(pal.core, rippleAlpha);
    ctx.lineWidth = (1.3 + sev * 1.8) * geom.scale * (1 - t * 0.55);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r1, 0, Math.PI * 2);
    ctx.stroke();

    // Soft chromatic outer halo for primary ripple
    ctx.strokeStyle = rgba(pal.primary, rippleAlpha * 0.65);
    ctx.lineWidth = (2.6 + sev * 2.2) * geom.scale * (1 - t * 0.55);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, Math.max(1, r1 - 1.5 * geom.scale), 0, Math.PI * 2);
    ctx.stroke();

    // 3. Secondary trailing ripple on moderate & heavy hits
    if (sev >= 0.45 && t > 0.1) {
      const t2 = clamp((t - 0.1) / 0.9, 0, 1);
      const r2 = 3 + easeOutQuad(t2) * maxSpan * (0.36 + sev * 0.42);
      ctx.strokeStyle = rgba(pal.secondary, (1 - t2) * 0.62 * sev);
      ctx.lineWidth = (1.0 + sev * 1.1) * geom.scale * (1 - t2 * 0.5);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 4. Theme-specific localized cell/facet illumination near impact
    if (theme.hitStyle === 'hex_cascade') {
      const cellR = 5.4 * geom.scale;
      const offsets = [[0, 0], [1.45, 0.85], [-1.45, 0.85], [0, -1.65]];
      const count = sev > 0.6 ? 4 : 2;
      for (let c = 0; c < count; c += 1) {
        const hx = pt.x + offsets[c][0] * cellR - Math.cos(hit.surfaceAngle) * cellR * 0.8;
        const hy = pt.y + offsets[c][1] * cellR - Math.sin(hit.surfaceAngle) * cellR * 0.8;
        ctx.strokeStyle = rgba(pal.core, fade * (c === 0 ? 0.88 : 0.52));
        ctx.fillStyle = rgba(pal.secondary, fade * (c === 0 ? 0.34 : 0.16));
        ctx.lineWidth = 1.05 * geom.scale;
        ctx.beginPath();
        for (let k = 0; k < 6; k += 1) {
          const ha = (k * Math.PI) / 3;
          const vx = hx + Math.cos(ha) * cellR;
          const vy = hy + Math.sin(ha) * cellR;
          if (k === 0) ctx.moveTo(vx, vy);
          else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else if (theme.hitStyle === 'crystal_refract') {
      // Sharp crystalline refraction rays radiating inward across facets
      const rayCount = sev > 0.6 ? 5 : 3;
      const inward = hit.surfaceAngle + Math.PI;
      ctx.strokeStyle = rgba(pal.core, fade * 0.88);
      ctx.lineWidth = 1.15 * geom.scale;
      for (let r = 0; r < rayCount; r += 1) {
        const spread = ((r / Math.max(1, rayCount - 1)) - 0.5) * 1.45;
        const len = (8 + sev * 16) * geom.scale * (0.4 + t * 0.7);
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.x + Math.cos(inward + spread) * len, pt.y + Math.sin(inward + spread) * len);
        ctx.stroke();
      }
    } else if (theme.hitStyle === 'chrono_warp') {
      // Temporal dial arc & clock-tick flash around impact
      const arcR = (8 + easeOutCubic(t) * 18) * geom.scale;
      ctx.strokeStyle = rgba(pal.secondary, fade * 0.9);
      ctx.lineWidth = 1.5 * geom.scale;
      ctx.setLineDash([3 * geom.scale, 3 * geom.scale]);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, arcR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (theme.hitStyle === 'phalanx_deflect' || theme.hitStyle === 'plate_shock') {
      // Directional deflection chevron pushing back along surface normal
      const nx = Math.cos(hit.surfaceAngle);
      const ny = Math.sin(hit.surfaceAngle);
      const tx = -ny;
      const ty = nx;
      const span = (8 + sev * 10) * geom.scale * (0.7 + t * 0.5);
      ctx.strokeStyle = rgba(pal.core, fade * 0.92);
      ctx.lineWidth = (1.6 + sev * 1.0) * geom.scale;
      ctx.beginPath();
      ctx.moveTo(pt.x + tx * span - nx * 4 * geom.scale, pt.y + ty * span - ny * 4 * geom.scale);
      ctx.lineTo(pt.x + nx * 2 * geom.scale, pt.y + ny * 2 * geom.scale);
      ctx.lineTo(pt.x - tx * span - nx * 4 * geom.scale, pt.y - ty * span - ny * 4 * geom.scale);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Draws directional ricochet sparks & glancing fragments OUTSIDE the shell clip at each impact point.
 */
function drawLocalizedHitExternalSparks(
  ctx,
  geom,
  theme,
  shieldState,
  elapsed,
  scaleMult,
  reducedMotion,
) {
  if (!shieldState || !shieldState.activeHitCount) return;
  const pal = theme.palette;
  const hits = shieldState.hitImpulses;

  ctx.save();
  for (let i = 0; i < hits.length; i += 1) {
    const hit = hits[i];
    if (!hit.active) continue;
    const t = clamp(hit.age / Math.max(0.05, hit.duration), 0, 1);
    const fade = Math.pow(1 - t, 1.5);
    if (fade <= 0.03) continue;

    const sev = hit.severity;
    const pt = computeSurfacePoint(geom, theme, shieldState, hit.surfaceAngle, elapsed, scaleMult, reducedMotion);

    // Crisp hot rim spark at exact impact point
    const pointFade = Math.max(0, 1 - t / 0.34);
    if (pointFade > 0.02) {
      const starR = (4.5 + sev * 6.5 + (hit.isCrit ? 3.5 : 0)) * geom.scale * (0.85 + t * 0.4);
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(hit.surfaceAngle);
      ctx.fillStyle = rgba(pal.core, pointFade * 0.96);
      ctx.beginPath();
      ctx.moveTo(starR * 0.85, 0);
      ctx.lineTo(0, -starR * 0.32);
      ctx.lineTo(-starR * 0.55, 0);
      ctx.lineTo(0, starR * 0.32);
      ctx.closePath();
      ctx.fill();
      // Tangential glancing flare
      ctx.strokeStyle = rgba(pal.rim, pointFade * 0.9);
      ctx.lineWidth = (1.3 + sev * 1.1) * geom.scale;
      ctx.beginPath();
      ctx.moveTo(0, -starR * 1.35);
      ctx.lineTo(0, starR * 1.35);
      ctx.stroke();
      ctx.restore();
    }

    // Directional ricochet sparks flying outward from impact normal
    const sparkCount = reducedMotion
      ? 2
      : Math.max(2, Math.min(8, Math.round(2 + sev * 5 + (hit.isCrit ? 2 : 0))));
    for (let s = 0; s < sparkCount; s += 1) {
      const h1 = pseudoHash(hit.seed + s * 17.3);
      const h2 = pseudoHash(hit.seed + s * 31.7 + 9);
      // Fan outward along the normal + grazing tangents
      const spread = (h1 - 0.5) * 2.25;
      const dir = hit.surfaceAngle + spread;
      const dist = (4 + (12 + h2 * 16) * sev * easeOutQuad(t)) * geom.scale;
      const sx = pt.x + Math.cos(dir) * dist;
      const sy = pt.y + Math.sin(dir) * dist;
      const tail = (2.5 + h2 * 4.5 * sev) * geom.scale * (1 - t * 0.55);

      ctx.strokeStyle = rgba(s % 2 === 0 ? pal.core : pal.secondary, fade * 0.92);
      ctx.lineWidth = (1.0 + sev * 0.85) * geom.scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - Math.cos(dir) * tail, sy - Math.sin(dir) * tail);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Draws proportional low-shield stress cracks ONLY when remaining shield strength is low (<38%).
 * Cracks branch inward from actual hit impact angles and never show on healthy shields.
 */
function drawLowShieldCracks(ctx, geom, theme, shieldState, elapsed, scaleMult, reducedMotion) {
  const ratio = shieldState ? shieldState.strengthRatio : 1;
  if (ratio >= 0.38) return;

  const damageSeverity = clamp((0.38 - ratio) / 0.34, 0, 1);
  const pal = theme.palette;
  const crackAlpha = clamp(0.32 + damageSeverity * 0.62, 0, 0.94);

  // Use actual impact anchors if hit, else deterministic anchor facing the battlefront
  const anchors = [];
  if (shieldState && shieldState.crackCount > 0) {
    for (let i = 0; i < shieldState.cracks.length; i += 1) {
      if (shieldState.cracks[i].active) anchors.push(shieldState.cracks[i]);
    }
  }
  if (anchors.length === 0) {
    anchors.push({
      angle: geom.facing >= 0 ? -0.25 : Math.PI + 0.25,
      seed: (shieldState?.seed || 11) + 7,
      intensity: 0.75,
    });
  }

  const maxToShow = ratio < 0.2 ? Math.min(anchors.length, 3) : Math.min(anchors.length, 2);
  ctx.save();
  for (let i = 0; i < maxToShow; i += 1) {
    const anchor = anchors[i];
    const pt = computeSurfacePoint(geom, theme, shieldState, anchor.angle, elapsed, scaleMult, reducedMotion);
    const inward = anchor.angle + Math.PI;
    const branches = ratio < 0.2 ? 3 : 2;
    const reach = (0.28 + damageSeverity * 0.44) * Math.min(geom.rx, geom.ry);

    for (let b = 0; b < branches; b += 1) {
      const h = pseudoHash(anchor.seed + b * 23.1);
      const bAngle = inward + (b - (branches - 1) * 0.5) * 0.72 + (h - 0.5) * 0.24;
      const midLen = reach * (0.48 + h * 0.16);
      const jog = (h > 0.5 ? 1 : -1) * (2.5 + damageSeverity * 3.5) * geom.scale;
      const mx = pt.x + Math.cos(bAngle) * midLen - Math.sin(bAngle) * jog;
      const my = pt.y + Math.sin(bAngle) * midLen + Math.cos(bAngle) * jog;
      const ex = pt.x + Math.cos(bAngle) * reach;
      const ey = pt.y + Math.sin(bAngle) * reach;

      // Subtle glowing crack halo
      ctx.strokeStyle = rgba(pal.primary, crackAlpha * 0.42);
      ctx.lineWidth = (2.1 + damageSeverity * 1.1) * geom.scale;
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(mx, my);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Crisp hairline fracture core
      ctx.strokeStyle = rgba(pal.crack || pal.core, crackAlpha);
      ctx.lineWidth = (0.9 + damageSeverity * 0.65) * geom.scale;
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(mx, my);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }

    // Subtle escaping instability micro-spark near critical depletion (<22%)
    if (ratio < 0.22 && !reducedMotion) {
      const flicker = Math.sin(elapsed * 22 + anchor.seed);
      if (flicker > 0.35) {
        const sx = pt.x + Math.cos(anchor.angle) * (3 + flicker * 4) * geom.scale;
        const sy = pt.y + Math.sin(anchor.angle) * (3 + flicker * 4) * geom.scale;
        ctx.fillStyle = rgba(pal.core, (flicker - 0.35) * 1.3);
        ctx.beginPath();
        ctx.arc(sx, sy, 1.5 * geom.scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/**
 * Draws the formation choreography (Stage 1 gathering wisps + Stage 2 assembling fragments)
 * when a shield is forming (`formProgress < 1`).
 */
function drawFormationAssemblyLayer(ctx, geom, theme, shieldState, elapsed, reducedMotion) {
  if (!shieldState || shieldState.phase !== 'forming') return;
  const p = clamp(shieldState.formProgress, 0, 1);
  if (p >= 0.98) return;

  const pal = theme.palette;
  const { cx, cy, rx, ry, scale } = geom;

  ctx.save();

  // Stage 1 (0..0.44): Inward-gathering energy wisps streaming toward shell perimeter
  if (p < 0.48) {
    const gt = clamp(p / 0.48, 0, 1);
    const wispAlpha = Math.sin(gt * Math.PI) * 0.85;
    const count = reducedMotion ? 5 : 8;
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + (shieldState.seed % 17) * 0.2;
      const rOuter = 1.65 - easeOutCubic(gt) * 0.68;
      const rInner = Math.max(0.85, rOuter - 0.34 * (1 - gt * 0.4));
      ctx.strokeStyle = rgba(i % 2 === 0 ? pal.rim : pal.secondary, wispAlpha);
      ctx.lineWidth = (1.5 + (1 - gt) * 1.1) * scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * rx * rOuter, cy + Math.sin(a) * ry * rOuter);
      ctx.lineTo(cx + Math.cos(a) * rx * rInner, cy + Math.sin(a) * ry * rInner);
      ctx.stroke();
    }
  }

  // Stage 2 (0.12..0.72): Protective theme fragments converging and locking into shell perimeter
  if (p > 0.1 && p < 0.78) {
    const ft = clamp((p - 0.1) / 0.62, 0, 1);
    const ease = easeOutCubic(ft);
    const fragAlpha = ft < 0.75 ? Math.min(1, ft * 2.5) * 0.9 : (1 - (ft - 0.75) / 0.25) * 0.9;
    const fragCount = reducedMotion ? 6 : 8;
    const colors = pal.fragments || [pal.primary, pal.secondary, pal.rim];

    for (let i = 0; i < fragCount; i += 1) {
      const targetA = (i / fragCount) * Math.PI * 2 + (theme.shellShape === 'faceted_crystal' ? Math.PI / 8 : 0);
      const swirl = (1 - ease) * (theme.formationStyle === 'clockwork_wind' ? 0.75 : 0.32);
      const distMult = 1.48 - ease * 0.52;
      const fx = cx + Math.cos(targetA + swirl) * rx * distMult;
      const fy = cy + Math.sin(targetA + swirl) * ry * distMult;
      const fSize = (3.6 + (i % 3) * 0.9) * scale * (0.7 + ease * 0.35);

      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(targetA + Math.PI * 0.5 + swirl * 1.2);
      ctx.globalAlpha = clamp(fragAlpha, 0, 1);
      drawThemedFragmentShape(
        ctx,
        fSize,
        0.65,
        theme.fragmentShape,
        rgba(colors[i % colors.length], 0.55),
        rgba(pal.rim, 0.92),
        pal.core,
      );
      ctx.restore();
    }
  }

  ctx.restore();
}

/**
 * Draws the boundary particles in either the 'back' (behind unit) or 'front' (in front of unit) pass.
 */
function drawBoundaryParticlesPass(
  ctx,
  geom,
  theme,
  shieldState,
  elapsed,
  pass, // 'back' | 'front'
  strengthAlpha,
  scaleMult,
  reducedMotion,
) {
  const count = Math.max(2, Math.round((theme.particleCount || 5) * (0.45 + strengthAlpha * 0.55)));
  const pal = theme.palette;
  const seed = shieldState?.seed || 3;
  const speed = reducedMotion ? 0 : (theme.flowSpeed || 1.0) * 0.85;

  for (let i = 0; i < count; i += 1) {
    const h = pseudoHash(seed + i * 19.7);
    const orbitAngle = (i / count) * Math.PI * 2 + elapsed * speed * (i % 2 === 0 ? 1 : -0.78) + h * 6.28;
    const depthSin = Math.sin(orbitAngle);
    if (pass === 'back' && depthSin >= 0) continue;
    if (pass === 'front' && depthSin < 0) continue;

    // 3D tilted elliptical orbital track wrapping cleanly around the shield boundary
    const trackTilt = (h - 0.5) * 0.85;
    const elev = Math.cos(orbitAngle * 1.5 + i * 2.1) * 0.62;
    const rx = geom.rx * scaleMult * 1.03;
    const ry = geom.ry * scaleMult * 1.01;
    const lx = Math.cos(orbitAngle) * rx;
    const ly = elev * ry + depthSin * ry * 0.22;
    const px = geom.cx + lx * Math.cos(trackTilt) - ly * Math.sin(trackTilt);
    const py = geom.cy + lx * Math.sin(trackTilt) + ly * Math.cos(trackTilt);

    const depthScale = pass === 'front' ? 0.92 + depthSin * 0.28 : 0.72 + (1 + depthSin) * 0.2;
    const pAlpha = (pass === 'front' ? 0.86 : 0.42) * strengthAlpha;
    const pSize = (1.85 + h * 1.35) * geom.scale * depthScale;

    drawThemedParticle(
      ctx,
      px,
      py,
      pSize,
      orbitAngle + trackTilt,
      theme.particleStyle,
      pal.primary,
      pal.secondary,
      pal.core,
      pAlpha,
    );
  }
}

/**
 * Resolves the effective theme & geometry for a shielded unit.
 */
export function resolveUnitShieldContext(unit, layout, scale, shieldState) {
  const theme = shieldState?.themeId
    ? getShieldTheme(shieldState.themeId)
    : resolveShieldTheme({
        themeId: unit?.shieldThemeId,
        targetUnit: unit,
      });
  const geom = computeShieldGeometry(unit, layout, theme, scale);
  return { theme, geom };
}

/**
 * PASS 1 — Drawn BEHIND the protected unit model.
 * Renders the grounded base energy reflection, subtle recessed far-side dome wall,
 * and rear-orbiting boundary particles so the shield truly encloses the unit in 3D.
 */
export function drawUnitShieldBack(
  ctx,
  unit,
  layout,
  scale,
  elapsed,
  shieldState = null,
  reducedMotion = false,
) {
  if (!unit || unit.shield <= 0 || !layout) return;
  const { theme, geom } = resolveUnitShieldContext(unit, layout, scale, shieldState);
  const pal = theme.palette;

  const formP = shieldState ? clamp(shieldState.formProgress, 0, 1) : 1;
  const shellBuild = formP < 0.22 ? 0 : easeOutBackSoft(clamp((formP - 0.22) / 0.62, 0, 1));
  const scaleMult = formP < 1 ? 0.56 + shellBuild * 0.44 : 1.0;

  const ratio = shieldState ? shieldState.strengthRatio : 1;
  const strengthAlpha = 0.46 + ratio * 0.54;
  const formAlpha = formP < 1 ? clamp(formP * 1.5, 0, 1) : 1;
  const hitBoost = 1 + (shieldState?.hitGlowBoost || 0) * 0.35;

  ctx.save();

  // 1. Ground contact energy reflection caustics on arena floor
  const groundRx = geom.rx * scaleMult * 0.96;
  const groundRy = Math.max(4, groundRx * 0.42);
  const floorGrad = ctx.createRadialGradient(
    geom.cx,
    geom.groundY,
    groundRx * 0.2,
    geom.cx,
    geom.groundY,
    groundRx * 1.15,
  );
  floorGrad.addColorStop(0, rgba(pal.primary, 0.04 * strengthAlpha * formAlpha));
  floorGrad.addColorStop(0.68, rgba(pal.primary, 0.20 * strengthAlpha * formAlpha * hitBoost));
  floorGrad.addColorStop(0.88, rgba(pal.secondary, 0.24 * strengthAlpha * formAlpha * hitBoost));
  floorGrad.addColorStop(1, rgba(pal.primary, 0));
  ctx.fillStyle = floorGrad;
  ctx.beginPath();
  ctx.ellipse(geom.cx, geom.groundY, groundRx * 1.15, groundRy * 1.15, 0, 0, Math.PI * 2);
  ctx.fill();

  // Subtle grounded perimeter seam ellipse
  ctx.strokeStyle = rgba(pal.rim, 0.36 * strengthAlpha * formAlpha);
  ctx.lineWidth = Math.max(0.9, 1.15 * geom.scale);
  ctx.beginPath();
  ctx.ellipse(geom.cx, geom.groundY, groundRx * 0.88, groundRy * 0.88, 0, 0, Math.PI * 2);
  ctx.stroke();

  // 2. Recessed far-side interior dome wall (gives genuine 3D wrap-around depth behind character)
  if (shellBuild > 0.08) {
    const outerPts = buildShieldContour(CONTOUR_BUF_OUTER, geom, theme, shieldState, elapsed, {
      scaleMult: scaleMult * 0.985,
      reducedMotion,
    });
    const sharp = theme.shellShape === 'faceted_crystal';
    traceContourPath(ctx, outerPts, sharp);

    const backGrad = ctx.createRadialGradient(
      geom.cx,
      geom.cy - geom.ry * 0.12,
      geom.rx * 0.12,
      geom.cx,
      geom.cy,
      Math.max(geom.rx, geom.ry) * scaleMult,
    );
    backGrad.addColorStop(0, rgba(pal.innerTint, 0.14 * strengthAlpha * formAlpha));
    backGrad.addColorStop(0.68, rgba(pal.innerTint, 0.22 * strengthAlpha * formAlpha));
    backGrad.addColorStop(1, rgba(pal.primary, 0.28 * strengthAlpha * formAlpha));
    ctx.fillStyle = backGrad;
    ctx.fill();
  }

  // 3. Rear-depth boundary particles passing behind the unit
  if (formP > 0.5) {
    drawBoundaryParticlesPass(
      ctx,
      geom,
      theme,
      shieldState,
      elapsed,
      'back',
      strengthAlpha * clamp((formP - 0.5) * 2, 0, 1),
      scaleMult,
      reducedMotion,
    );
  }

  ctx.restore();
}

/**
 * PASS 2 — Drawn IN FRONT OF the protected unit model.
 * Renders formation assembly, layered translucent Fresnel body, inner depth bevel,
 * clipped internal surface structure, specular reflections, localized hit ripples,
 * proportional low-shield cracks, and front-orbiting particles.
 */
export function drawUnitShieldFront(
  ctx,
  unit,
  layout,
  scale,
  elapsed,
  shieldState = null,
  reducedMotion = false,
) {
  if (!unit || unit.shield <= 0 || !layout) return;
  const { theme, geom } = resolveUnitShieldContext(unit, layout, scale, shieldState);
  const pal = theme.palette;

  const formP = shieldState ? clamp(shieldState.formProgress, 0, 1) : 1;
  const reinforce = shieldState ? clamp(shieldState.reinforcePulse, 0, 1) : 0;
  const ratio = shieldState ? shieldState.strengthRatio : 1;
  const hitBoost = shieldState ? shieldState.hitGlowBoost : 0;

  // Low-shield instability flicker (<22% remaining shield)
  let stabilityMult = 1;
  if (ratio < 0.22 && !reducedMotion) {
    const wave = Math.sin(elapsed * 26 + (shieldState?.seed || 1)) * Math.sin(elapsed * 11.3);
    stabilityMult = 0.84 + clamp((wave + 1) * 0.5, 0, 1) * 0.22;
  }

  const strengthAlpha = (0.48 + ratio * 0.52) * stabilityMult;
  const shellBuild = formP < 0.2 ? 0 : easeOutBackSoft(clamp((formP - 0.2) / 0.62, 0, 1));
  const scaleMult = formP < 1 ? 0.54 + shellBuild * 0.46 : 1.0 + reinforce * 0.045;
  const sharpCorners = theme.shellShape === 'faceted_crystal';

  ctx.save();

  // Formation Stage 1 & 2 (gathering wisps + converging protective fragments)
  if (formP < 1) {
    drawFormationAssemblyLayer(ctx, geom, theme, shieldState, elapsed, reducedMotion);
  }

  if (shellBuild > 0.06) {
    const shellAlpha = clamp(shellBuild, 0, 1) * strengthAlpha;
    const outerPts = buildShieldContour(CONTOUR_BUF_OUTER, geom, theme, shieldState, elapsed, {
      scaleMult,
      reducedMotion,
    });
    const innerPts = buildShieldContour(CONTOUR_BUF_INNER, geom, theme, shieldState, elapsed, {
      scaleMult,
      insetPx: geom.thickness * (0.65 + ratio * 0.35),
      reducedMotion,
    });

    // 1. Clipped translucent shell interior: Fresnel gradient + theme material + localized hit ripples + cracks + activation sweep
    ctx.save();
    traceContourPath(ctx, outerPts, sharpCorners);
    ctx.clip();

    // 1A. Fresnel-style translucent body: crystal-clear center so unit art stays sharp,
    // luminous chromatic thickness building smoothly toward the curved edge.
    const maxR = Math.max(geom.rx, geom.ry) * scaleMult * 1.06;
    const fresnel = ctx.createRadialGradient(
      geom.cx - geom.rx * 0.08 * geom.facing,
      geom.cy - geom.ry * 0.14,
      maxR * 0.12,
      geom.cx,
      geom.cy,
      maxR,
    );
    const centerA = (theme.centerAlpha ?? 0.022) * shellAlpha;
    const midA = (0.065 + hitBoost * 0.05) * shellAlpha;
    const rimFillA = (0.28 + hitBoost * 0.14 + reinforce * 0.16) * shellAlpha;
    fresnel.addColorStop(0, rgba(pal.core, centerA));
    fresnel.addColorStop(0.56, rgba(pal.primary, midA));
    fresnel.addColorStop(0.84, rgba(pal.primary, rimFillA * 0.85));
    fresnel.addColorStop(0.95, rgba(pal.secondary, rimFillA));
    fresnel.addColorStop(1, rgba(pal.rim, rimFillA * 1.25));
    ctx.fillStyle = fresnel;
    ctx.fillRect(geom.cx - maxR * 1.3, geom.cy - maxR * 1.3, maxR * 2.6, maxR * 2.6);

    // 1B. Theme-specific internal energy structure & multi-speed flowing motion
    drawThemeInternalPattern(ctx, geom, theme, shieldState, elapsed, shellAlpha, reducedMotion);

    // 1C. Controlled glossy upper-shoulder specular reflection + subtle lower bounce highlight
    const specShift = reducedMotion ? 0 : Math.sin(elapsed * 1.2 + (shieldState?.seed || 0) * 0.05) * 0.12;
    ctx.save();
    ctx.strokeStyle = rgba(pal.core, clamp(0.46 * shellAlpha, 0, 0.72));
    ctx.lineWidth = Math.max(1.4, 2.2 * geom.scale);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(
      geom.cx,
      geom.cy,
      geom.rx * scaleMult * 0.89,
      geom.ry * scaleMult * 0.89,
      0,
      -Math.PI * 0.84 + specShift,
      -Math.PI * 0.44 + specShift,
    );
    ctx.stroke();

    // Soft opposing bounce rim light
    ctx.strokeStyle = rgba(pal.secondary, clamp(0.28 * shellAlpha, 0, 0.5));
    ctx.lineWidth = Math.max(1.0, 1.4 * geom.scale);
    ctx.beginPath();
    ctx.ellipse(
      geom.cx,
      geom.cy,
      geom.rx * scaleMult * 0.88,
      geom.ry * scaleMult * 0.88,
      0,
      Math.PI * 0.18 - specShift,
      Math.PI * 0.48 - specShift,
    );
    ctx.stroke();
    ctx.restore();

    // 1D. Localized shield hit surface reactions (impact bloom, curved ripples, local cells)
    drawLocalizedHitSurfaceEffects(ctx, geom, theme, shieldState, elapsed, scaleMult, reducedMotion);

    // 1E. Low-shield proportional hairline fracture cracks (<38% strength only)
    drawLowShieldCracks(ctx, geom, theme, shieldState, elapsed, scaleMult, reducedMotion);

    // 1F. Formation activation sweep flash (Stage 4: 0.52..1.00) or Reinforcement surge wave
    if (formP > 0.52 && formP < 1) {
      const sw = (formP - 0.52) / 0.48;
      const bandY = geom.cy + geom.ry * 1.2 - sw * geom.ry * 2.4;
      const swAlpha = Math.sin(sw * Math.PI) * 0.75;
      const sg = ctx.createLinearGradient(geom.cx, bandY - 12 * geom.scale, geom.cx, bandY + 12 * geom.scale);
      sg.addColorStop(0, rgba(pal.core, 0));
      sg.addColorStop(0.45, rgba(pal.rim, swAlpha * 0.72));
      sg.addColorStop(0.55, rgba(pal.core, swAlpha));
      sg.addColorStop(1, rgba(pal.primary, 0));
      ctx.fillStyle = sg;
      ctx.fillRect(geom.cx - maxR * 1.2, bandY - 12 * geom.scale, maxR * 2.4, 24 * geom.scale);
    } else if (reinforce > 0.02) {
      const sw = 1 - reinforce;
      const bandY = geom.cy + geom.ry * 1.15 - sw * geom.ry * 2.3;
      const swAlpha = Math.sin(sw * Math.PI) * 0.65;
      const sg = ctx.createLinearGradient(geom.cx, bandY - 10 * geom.scale, geom.cx, bandY + 10 * geom.scale);
      sg.addColorStop(0, rgba(pal.core, 0));
      sg.addColorStop(0.5, rgba(pal.core, swAlpha));
      sg.addColorStop(1, rgba(pal.primary, 0));
      ctx.fillStyle = sg;
      ctx.fillRect(geom.cx - maxR * 1.2, bandY - 10 * geom.scale, maxR * 2.4, 20 * geom.scale);
    }

    ctx.restore(); // end shell clip

    // 2. Visible Shell Wall Thickness — Soft outer atmospheric aura + Inner bevel rim + Crisp outer refractive rim
    // Outer soft edge illumination
    traceContourPath(ctx, outerPts, sharpCorners);
    ctx.strokeStyle = rgba(pal.primary, clamp((0.26 + hitBoost * 0.22 + reinforce * 0.18) * shellAlpha, 0, 0.72));
    ctx.lineWidth = (3.8 + geom.thickness * 0.45) * (0.72 + ratio * 0.28);
    ctx.stroke();

    // Inner depth bevel wall (clearly communicates curved shell thickness)
    traceContourPath(ctx, innerPts, sharpCorners);
    ctx.strokeStyle = rgba(pal.secondary, clamp((0.36 + hitBoost * 0.16) * shellAlpha, 0, 0.76));
    ctx.lineWidth = Math.max(0.85, 1.15 * geom.scale);
    ctx.stroke();

    // Crisp outer specular rim
    traceContourPath(ctx, outerPts, sharpCorners);
    ctx.strokeStyle = rgba(pal.rim, clamp((theme.rimAlpha || 0.9) * shellAlpha * (1 + hitBoost * 0.16), 0, 1));
    ctx.lineWidth = Math.max(1.15, (1.55 + ratio * 0.55 + reinforce * 0.5) * geom.scale);
    ctx.stroke();

    // 3. External directional ricochet sparks & impact glints at each active hit point
    drawLocalizedHitExternalSparks(ctx, geom, theme, shieldState, elapsed, scaleMult, reducedMotion);
  }

  // 4. Front-depth orbiting boundary particles passing in front of the unit
  if (formP > 0.48) {
    drawBoundaryParticlesPass(
      ctx,
      geom,
      theme,
      shieldState,
      elapsed,
      'front',
      strengthAlpha * clamp((formP - 0.48) * 2, 0, 1),
      scaleMult,
      reducedMotion,
    );
  }

  ctx.restore();
}

/**
 * PASS 3 — Renders world-space transient Shield Break (3-phase shatter) and
 * Shield Expiration (calm upward dissolve) effects.
 */
export function drawShieldTransientEffects(
  ctx,
  bf,
  w,
  h,
  effects,
  elapsed,
  reducedMotion = false,
) {
  if (!effects || effects.length === 0) return;

  for (let i = 0; i < effects.length; i += 1) {
    const fx = effects[i];
    const t = clamp(fx.age / Math.max(0.05, fx.duration), 0, 1);
    const p = bf.worldToScreen(fx.x, fx.y, w, h);
    const unitScale =
      typeof p.scaleOverride === 'number'
        ? p.scaleOverride
        : (fx.visualScale || 1) * Math.max(0.76, Math.min(1.26, p.scale / 8.0));
    const spriteSize = 48 * unitScale;
    const pseudoLayout = {
      drawX: p.x,
      drawY: p.y - spriteSize * 0.9,
      y: p.y,
      spriteSize,
    };
    const theme = getShieldTheme(fx.themeId);
    const geom = computeShieldGeometry(fx, pseudoLayout, theme, unitScale);

    if (fx.kind === 'break') {
      _drawShieldBreakEffect(ctx, geom, theme, fx, t, elapsed, reducedMotion);
    } else {
      _drawShieldExpireEffect(ctx, geom, theme, fx, t, elapsed, reducedMotion);
    }
  }
}

/**
 * Shield Break — Satisfying 3-phase shatter:
 * 1. Brief inward compression + bright energy concentration at impact point (0.00..0.18)
 * 2. Rapidly propagating fracture web across shell + crisp compact release ring (0.06..0.38)
 * 3. Shell shatters into 16–22 tumbling 2.5D themed energy fragments dispersing & fading (0.12..1.00)
 */
function _drawShieldBreakEffect(ctx, geom, theme, fx, t, elapsed, reducedMotion) {
  const pal = theme.palette;
  const { cx, cy, rx, ry, scale } = geom;
  const sharpCorners = theme.shellShape === 'faceted_crystal';

  ctx.save();

  // Phase 1 & 2: Compressing & fracturing shell before shatter release (0..0.38)
  if (t < 0.38) {
    const compressT = clamp(t / 0.16, 0, 1);
    const shellFade = t < 0.2 ? 1 : clamp(1 - (t - 0.2) / 0.18, 0, 1);
    const compressAmt = Math.sin(compressT * Math.PI * 0.5) * 0.14;

    const pts = buildShieldContour(CONTOUR_BUF_OUTER, geom, theme, null, elapsed, {
      scaleMult: 1,
      compressExtra: compressAmt,
      compressAngle: fx.impactAngle,
      reducedMotion,
    });

    // Brightened tense shell body (center remains translucent so unit stays clearly visible)
    traceContourPath(ctx, pts, sharpCorners);
    ctx.fillStyle = rgba(pal.primary, 0.2 * shellFade);
    ctx.fill();
    ctx.strokeStyle = rgba(pal.core, 0.96 * shellFade);
    ctx.lineWidth = (2.3 + compressT * 1.5) * scale;
    ctx.stroke();

    // Concentrated hot break flash at impact point
    const impX = cx + Math.cos(fx.impactAngle) * rx * (1 - compressAmt);
    const impY = cy + Math.sin(fx.impactAngle) * ry * (1 - compressAmt);
    const flashR = (12 + compressT * 20) * scale;
    const fg = ctx.createRadialGradient(impX, impY, 1, impX, impY, flashR);
    fg.addColorStop(0, rgba(pal.core, 0.98 * shellFade));
    fg.addColorStop(0.42, rgba(pal.secondary, 0.78 * shellFade));
    fg.addColorStop(1, rgba(pal.primary, 0));
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(impX, impY, flashR, 0, Math.PI * 2);
    ctx.fill();

    // Propagating luminous fracture web across the shell surface (0.05..0.38)
    if (t > 0.04) {
      const crackGrow = easeOutCubic(clamp((t - 0.04) / 0.2, 0, 1));
      ctx.save();
      traceContourPath(ctx, pts, sharpCorners);
      ctx.clip();

      const rayCount = 7;
      const inward = fx.impactAngle + Math.PI;
      for (let r = 0; r < rayCount; r += 1) {
        const h = pseudoHash(fx.seed + r * 13.7);
        const a = inward + ((r / (rayCount - 1)) - 0.5) * 2.45 + (h - 0.5) * 0.24;
        const len = Math.max(rx, ry) * (1.35 + h * 0.55) * crackGrow;
        const mid = len * 0.48;
        const jog = (r % 2 === 0 ? 1 : -1) * (4.5 + h * 5.5) * scale;
        const mx = impX + Math.cos(a) * mid - Math.sin(a) * jog;
        const my = impY + Math.sin(a) * mid + Math.cos(a) * jog;
        const ex = impX + Math.cos(a) * len;
        const ey = impY + Math.sin(a) * len;

        ctx.strokeStyle = rgba(pal.primary, 0.62 * shellFade);
        ctx.lineWidth = 3.5 * scale;
        ctx.beginPath();
        ctx.moveTo(impX, impY);
        ctx.lineTo(mx, my);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        ctx.strokeStyle = rgba(pal.core, 0.98 * shellFade);
        ctx.lineWidth = 1.45 * scale;
        ctx.beginPath();
        ctx.moveTo(impX, impY);
        ctx.lineTo(mx, my);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Compact pressure-release shatter ring + directional fractured arc (0.14..0.52 — crisp, never hides battlefield)
  if (t > 0.14 && t < 0.52) {
    const rt = (t - 0.14) / 0.38;
    const rAlpha = Math.pow(1 - rt, 1.45) * 0.82;
    const grow = 0.96 + easeOutCubic(rt) * 0.48;
    ctx.strokeStyle = rgba(pal.rim, rAlpha);
    ctx.lineWidth = (2.5 * (1 - rt * 0.62)) * scale;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * grow, ry * grow, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Hotter white-core shatter rim opposite/around the break origin
    ctx.strokeStyle = rgba(pal.core, rAlpha * 0.9);
    ctx.lineWidth = (1.5 * (1 - rt * 0.55)) * scale;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * (grow * 0.96), ry * (grow * 0.96), 0, fx.impactAngle - 1.15, fx.impactAngle + 1.15);
    ctx.stroke();
  }

  // Phase 3: Tumbling 2.5D themed energy fragments dispersing naturally (0.10..1.00)
  const colors = pal.fragments || [pal.primary, pal.secondary, pal.rim];
  for (let i = 0; i < fx.fragmentCount; i += 1) {
    const frag = fx.fragments[i];
    const localAge = fx.age - frag.delay;
    if (localAge <= 0) continue;
    const localDur = Math.max(0.18, fx.duration - frag.delay);
    const ft = clamp(localAge / localDur, 0, 1);
    if (ft >= 1) continue;

    // Analytic damped velocity displacement + gentle gravity (deterministic at any scrubbed frame!)
    const drag = frag.drag || 2.1;
    const dispFactor = (1 - Math.exp(-drag * localAge)) / drag;
    const dx = frag.vx * dispFactor * scale * 1.12;
    const dy = (frag.vy * dispFactor * 1.12 + 0.5 * frag.gravity * localAge * localAge) * scale;

    const px = cx + frag.ox * rx + dx;
    const py = cy + frag.oy * ry + dy;
    const rot = reducedMotion ? frag.rot : frag.rot + frag.vrot * dispFactor;
    const tilt = reducedMotion ? 0 : frag.tilt + frag.vtilt * localAge;
    const perspY = Math.max(0.28, Math.abs(Math.cos(tilt)));
    const fade = ft < 0.1 ? ft / 0.1 : Math.pow(1 - (ft - 0.1) / 0.9, 1.25);
    const fSize = frag.size * scale * 1.38 * (1 - ft * 0.28);

    // Subtle fast spark streak behind high-velocity outer shards during early shatter
    if (ft < 0.42 && i % 2 === 0) {
      const speedMag = Math.hypot(frag.vx, frag.vy) || 1;
      const tailLen = (5.5 + (1 - ft / 0.42) * 8.5) * scale;
      ctx.strokeStyle = rgba(pal.core, fade * (1 - ft / 0.42) * 0.72);
      ctx.lineWidth = 1.25 * scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - (frag.vx / speedMag) * tailLen, py - (frag.vy / speedMag) * tailLen);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.scale(1, perspY);
    ctx.globalAlpha = clamp(fade * 0.98, 0, 1);
    drawThemedFragmentShape(
      ctx,
      fSize,
      frag.aspect,
      theme.fragmentShape,
      rgba(colors[frag.colorIdx % colors.length], 0.8),
      rgba(pal.rim, 0.98),
      pal.core,
    );
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Shield Expiration — Calm, non-violent upward dissolution:
 * Shell lifts gently, softens into thinning contour wisps, and releases ascending motes.
 */
function _drawShieldExpireEffect(ctx, geom, theme, fx, t, elapsed, reducedMotion) {
  const pal = theme.palette;
  const { cx, cy, rx, ry, scale } = geom;
  const liftY = -easeOutQuad(t) * 12 * scale;
  const expand = 1 + easeOutQuad(t) * 0.1;
  const shellFade = Math.pow(1 - t, 1.35);

  ctx.save();

  // Soft dissolving Fresnel rim veil lifting gently upward (no violence, no cracks)
  if (shellFade > 0.05) {
    const outerR = Math.max(rx, ry) * expand;
    const veilGrad = ctx.createRadialGradient(cx, cy + liftY, outerR * 0.56, cx, cy + liftY, outerR);
    veilGrad.addColorStop(0, rgba(pal.primary, 0));
    veilGrad.addColorStop(0.75, rgba(pal.primary, shellFade * 0.14));
    veilGrad.addColorStop(1, rgba(pal.rim, shellFade * 0.34));
    ctx.fillStyle = veilGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy + liftY, rx * expand, ry * expand, 0, 0, Math.PI * 2);
    ctx.fill();

    // Gently thinning & rising ribbon arcs from the dissolving shell
    const arcCount = 5;
    for (let a = 0; a < arcCount; a += 1) {
      const startA = (a / arcCount) * Math.PI * 2 + (reducedMotion ? 0 : t * 0.45);
      const span = (Math.PI * 2 / arcCount) * (0.78 - t * 0.44);
      if (span <= 0.05) continue;
      ctx.strokeStyle = rgba(a % 2 === 0 ? pal.rim : pal.secondary, shellFade * 0.82);
      ctx.lineWidth = Math.max(0.95, (2.1 * (1 - t * 0.55)) * scale);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.ellipse(
        cx,
        cy + liftY,
        rx * expand,
        ry * expand,
        0,
        startA,
        startA + span,
      );
      ctx.stroke();
    }
  }

  // Calm rising motes drifting upward as the barrier unravels
  for (let i = 0; i < fx.fragmentCount; i += 1) {
    const m = fx.fragments[i];
    const localAge = fx.age - m.delay;
    if (localAge <= 0) continue;
    const mt = clamp(localAge / Math.max(0.16, fx.duration - m.delay), 0, 1);
    const fade = Math.sin(mt * Math.PI) * 0.94;
    if (fade <= 0.03) continue;

    const px = cx + m.ox * rx + m.vx * localAge * scale;
    const py = cy + m.oy * ry + m.vy * localAge * scale * 1.15;
    drawThemedParticle(
      ctx,
      px,
      py,
      m.size * scale * 1.28 * (1 - mt * 0.32),
      m.rot + localAge * m.vrot,
      theme.particleStyle,
      pal.primary,
      pal.secondary,
      pal.core,
      fade,
    );
  }

  ctx.restore();
}
