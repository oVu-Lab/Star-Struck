/**
 * UnitSpriteRigCache — Lazily decomposes authored unit WebP sprites ONCE into
 * cached offscreen canvas sub-layers so independent visual components (wings,
 * crystal shards, hex shield tiles, sawblade rims, spoked wheels, solar rings,
 * pinwheel blades, hanging chains, billowing banner cloth, clockwork dials,
 * boss monoliths/feathers/plates) animate smoothly without distorting artwork
 * or creating seams.
 *
 * Headless-safe: returns null in Node environments where document/canvas is absent.
 */

const _rigCache = new WeakMap();

function canUseOffscreenCanvas() {
  return (
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function'
  );
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Defines per-unit sprite decomposition specs in normalized [0..1] artwork coordinates.
 * Verified directly against each unit's WebP sprite silhouette.
 */
export const UNIT_SPRITE_RIG_SPECS = Object.freeze({
  heavy_shield_guard: {
    type: 'extract_rects',
    parts: {
      leftWing: { x: 0.02, y: 0.22, w: 0.25, h: 0.56, px: 0.24, py: 0.50 },
      rightWing: { x: 0.73, y: 0.22, w: 0.25, h: 0.56, px: 0.76, py: 0.50 },
    },
  },

  wind_cavalry: {
    type: 'pinwheel_hub',
    cx: 0.485,
    cy: 0.50,
    hubRadius: 0.148,
    bladeOuterRadius: 0.43,
    lanceBox: { x: 0.54, y: 0.41, w: 0.45, h: 0.18 },
    ribbonBox: { x: 0.04, y: 0.62, w: 0.48, h: 0.34 },
  },

  arcane_archer: {
    type: 'extract_rects',
    parts: {
      topShard: { x: 0.59, y: 0.20, w: 0.20, h: 0.24, px: 0.69, py: 0.33 },
      bottomShard: { x: 0.59, y: 0.56, w: 0.20, h: 0.24, px: 0.69, py: 0.67 },
    },
  },

  pulse_skirmisher: {
    type: 'extract_rects',
    parts: {
      topBarrel: { x: 0.70, y: 0.35, w: 0.28, h: 0.145, px: 0.72, py: 0.42 },
      bottomBarrel: { x: 0.70, y: 0.505, w: 0.28, h: 0.145, px: 0.72, py: 0.58 },
    },
  },

  solar_pyromancer: {
    type: 'radial_rings',
    cx: 0.525,
    cy: 0.50,
    rings: {
      core: { rMin: 0.0, rMax: 0.195 },
      prominences: { rMin: 0.172, rMax: 0.268 },
      outerRing: { rMin: 0.244, rMax: 0.52 },
    },
  },

  aegis_sentinel: {
    type: 'extract_rects',
    parts: {
      topPyramid: { x: 0.35, y: 0.02, w: 0.30, h: 0.22, px: 0.50, py: 0.14 },
      leftTile: { x: 0.03, y: 0.30, w: 0.26, h: 0.37, px: 0.17, py: 0.48 },
      rightTile: { x: 0.71, y: 0.30, w: 0.26, h: 0.37, px: 0.82, py: 0.47 },
      bottomTile: { x: 0.36, y: 0.72, w: 0.30, h: 0.25, px: 0.52, py: 0.84 },
    },
  },

  chrono_weaver: {
    type: 'clockwork_dial',
    cx: 0.505,
    cy: 0.555,
    gearCutoutR: 0.102,
    dialR: 0.205,
  },

  enemy_void_vanguard: {
    type: 'extract_rects',
    parts: {
      leftChain: { x: 0.01, y: 0.54, w: 0.20, h: 0.40, px: 0.17, py: 0.57 },
      rightChain: { x: 0.79, y: 0.54, w: 0.20, h: 0.40, px: 0.83, py: 0.57 },
    },
  },

  enemy_rift_stalker: {
    type: 'extract_rects',
    parts: {
      topShard: { x: 0.68, y: 0.16, w: 0.24, h: 0.25, px: 0.80, py: 0.29 },
      bottomShard: { x: 0.67, y: 0.58, w: 0.24, h: 0.25, px: 0.79, py: 0.71 },
      orb: { shape: 'circle', cx: 0.54, cy: 0.50, r: 0.135, px: 0.54, py: 0.50 },
    },
  },

  enemy_corrupted_acolyte: {
    type: 'extract_rects',
    parts: {
      leftRibbon: { x: 0.01, y: 0.36, w: 0.25, h: 0.54, px: 0.22, py: 0.45 },
      rightRibbon: { x: 0.73, y: 0.36, w: 0.26, h: 0.54, px: 0.77, py: 0.45 },
      clapper: { x: 0.40, y: 0.735, w: 0.20, h: 0.18, px: 0.50, py: 0.74 },
    },
  },

  enemy_stasis_weaver: {
    type: 'extract_rects',
    parts: {
      leftShard: { x: 0.02, y: 0.18, w: 0.23, h: 0.32, px: 0.13, py: 0.33 },
      rightShard: { x: 0.76, y: 0.21, w: 0.23, h: 0.32, px: 0.88, py: 0.37 },
    },
  },

  enemy_inferno_bombardier: {
    type: 'wheel_extract',
    cx: 0.43,
    cy: 0.768,
    r: 0.104,
  },

  enemy_dread_bannerman: {
    type: 'banner_cloth',
    flameCutY: 0.225,
    clothStartY: 0.385,
    clothEndY: 0.96,
    poleCenterX: 0.50,
    poleHalfWidth: 0.048,
  },

  enemy_cryo_warden: {
    type: 'radial_rings',
    cx: 0.50,
    cy: 0.50,
    rings: {
      core: { rMin: 0.0, rMax: 0.218 },
      outerSpikes: { rMin: 0.195, rMax: 0.52 },
    },
  },

  enemy_abyssal_ravager: {
    type: 'radial_rings',
    cx: 0.50,
    cy: 0.50,
    rings: {
      hub: { rMin: 0.0, rMax: 0.188 },
      sawblade: { rMin: 0.168, rMax: 0.52 },
    },
  },

  elite_siege_colossus: {
    type: 'extract_rects',
    parts: {
      haloRing: { x: 0.18, y: 0.02, w: 0.64, h: 0.205, px: 0.50, py: 0.13 },
    },
  },

  elite_abyssal_executioner: {
    type: 'radial_rings',
    cx: 0.50,
    cy: 0.50,
    rings: {
      rubyCore: { rMin: 0.0, rMax: 0.138 },
      blades: { rMin: 0.118, rMax: 0.52 },
    },
  },

  boss_bastion_warden: {
    type: 'extract_rects',
    parts: {
      leftPlate: { x: 0.02, y: 0.25, w: 0.23, h: 0.52, px: 0.16, py: 0.51 },
      rightPlate: { x: 0.75, y: 0.25, w: 0.23, h: 0.52, px: 0.84, py: 0.51 },
    },
  },

  boss_relay_archon: {
    type: 'extract_rects',
    parts: {
      leftFeathers: { x: 0.01, y: 0.17, w: 0.27, h: 0.68, px: 0.26, py: 0.50 },
      rightFeathers: { x: 0.72, y: 0.17, w: 0.27, h: 0.68, px: 0.74, py: 0.50 },
    },
  },

  boss_obsidian_sovereign: {
    type: 'extract_rects',
    parts: {
      leftMonolith: { x: 0.01, y: 0.19, w: 0.18, h: 0.66, px: 0.11, py: 0.52 },
      rightMonolith: { x: 0.81, y: 0.19, w: 0.18, h: 0.66, px: 0.89, py: 0.52 },
    },
  },

  boss_astral_leviathan: {
    type: 'extract_rects',
    parts: {
      leftAnvil: { x: 0.01, y: 0.33, w: 0.17, h: 0.39, px: 0.11, py: 0.52 },
      rightAnvil: { x: 0.82, y: 0.33, w: 0.17, h: 0.39, px: 0.89, py: 0.52 },
    },
  },
});

function buildExtractRectsRig(sprite, spec) {
  const w = sprite.naturalWidth || sprite.width;
  const h = sprite.naturalHeight || sprite.height;
  const body = makeCanvas(w, h);
  const bctx = body.getContext('2d');
  bctx.drawImage(sprite, 0, 0, w, h);

  const parts = {};
  for (const [name, p] of Object.entries(spec.parts)) {
    const partCanvas = makeCanvas(w, h);
    const pctx = partCanvas.getContext('2d');

    pctx.save();
    pctx.beginPath();
    if (p.shape === 'circle') {
      pctx.arc(p.cx * w, p.cy * h, p.r * w, 0, Math.PI * 2);
    } else {
      pctx.rect(p.x * w, p.y * h, p.w * w, p.h * h);
    }
    pctx.clip();
    pctx.drawImage(sprite, 0, 0, w, h);
    pctx.restore();

    // Clear exact part region from main body canvas
    bctx.save();
    bctx.globalCompositeOperation = 'destination-out';
    bctx.beginPath();
    if (p.shape === 'circle') {
      bctx.arc(p.cx * w, p.cy * h, p.r * w, 0, Math.PI * 2);
    } else {
      bctx.rect(p.x * w, p.y * h, p.w * w, p.h * h);
    }
    bctx.fill();
    bctx.restore();

    parts[name] = {
      canvas: partCanvas,
      px: p.px,
      py: p.py,
    };
  }

  return { type: spec.type, w, h, body, parts };
}

function buildRadialRingsRig(sprite, spec) {
  const w = sprite.naturalWidth || sprite.width;
  const h = sprite.naturalHeight || sprite.height;
  const cx = spec.cx * w;
  const cy = spec.cy * h;
  const rings = {};

  for (const [name, def] of Object.entries(spec.rings)) {
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, def.rMax * w, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(sprite, 0, 0, w, h);
    ctx.restore();

    if (def.rMin > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(cx, cy, def.rMin * w, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    rings[name] = c;
  }

  return { type: spec.type, w, h, cx: spec.cx, cy: spec.cy, rings };
}

function buildWheelExtractRig(sprite, spec) {
  const w = sprite.naturalWidth || sprite.width;
  const h = sprite.naturalHeight || sprite.height;
  const cx = spec.cx * w;
  const cy = spec.cy * h;
  const r = spec.r * w;

  // Main body keeps the full carriage + barrel, with a subtle dark backing inside wheel
  const body = makeCanvas(w, h);
  const bctx = body.getContext('2d');
  bctx.drawImage(sprite, 0, 0, w, h);

  // Extract circular spoked wheel cleanly
  const wheel = makeCanvas(w, h);
  const wctx = wheel.getContext('2d');
  wctx.save();
  wctx.beginPath();
  wctx.arc(cx, cy, r, 0, Math.PI * 2);
  wctx.clip();
  wctx.drawImage(sprite, 0, 0, w, h);
  wctx.restore();

  // Clear only inner spoke hub from body so outer golden rim never shows any seam
  bctx.save();
  bctx.globalCompositeOperation = 'destination-out';
  bctx.beginPath();
  bctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
  bctx.fill();
  bctx.restore();

  return { type: spec.type, w, h, body, wheel, cx: spec.cx, cy: spec.cy, r: spec.r };
}

function buildPinwheelHubRig(sprite, spec) {
  const w = sprite.naturalWidth || sprite.width;
  const h = sprite.naturalHeight || sprite.height;
  const cx = spec.cx * w;
  const cy = spec.cy * h;
  const hubR = spec.hubRadius * w;
  const outerR = spec.bladeOuterRadius * w;

  // Foreground: fixed hub + gilded lance prow
  const hubAndLance = makeCanvas(w, h);
  const hctx = hubAndLance.getContext('2d');
  hctx.save();
  hctx.beginPath();
  hctx.arc(cx, cy, hubR, 0, Math.PI * 2);
  hctx.rect(spec.lanceBox.x * w, spec.lanceBox.y * h, spec.lanceBox.w * w, spec.lanceBox.h * h);
  hctx.clip();
  hctx.drawImage(sprite, 0, 0, w, h);
  hctx.restore();

  // Lower jade streamer ribbon
  const ribbon = makeCanvas(w, h);
  const rctx = ribbon.getContext('2d');
  rctx.save();
  rctx.beginPath();
  rctx.rect(spec.ribbonBox.x * w, spec.ribbonBox.y * h, spec.ribbonBox.w * w, spec.ribbonBox.h * h);
  rctx.clip();
  rctx.drawImage(sprite, 0, 0, w, h);
  rctx.restore();

  // Seamless 4-blade emerald turbine reconstructed from the clean upper-left blade sector
  const sector = makeCanvas(w, h);
  const sctx = sector.getContext('2d');
  sctx.save();
  sctx.beginPath();
  sctx.moveTo(cx, cy);
  sctx.arc(cx, cy, outerR, Math.PI * 0.92, Math.PI * 1.48);
  sctx.closePath();
  sctx.clip();
  sctx.drawImage(sprite, 0, 0, w, h);
  sctx.restore();
  sctx.save();
  sctx.globalCompositeOperation = 'destination-out';
  sctx.beginPath();
  sctx.arc(cx, cy, hubR * 0.82, 0, Math.PI * 2);
  sctx.fill();
  sctx.restore();

  const blades = makeCanvas(w, h);
  const bctx = blades.getContext('2d');
  for (let i = 0; i < 5; i += 1) {
    bctx.save();
    bctx.translate(cx, cy);
    bctx.rotate((i * Math.PI * 2) / 5);
    bctx.translate(-cx, -cy);
    bctx.drawImage(sector, 0, 0);
    bctx.restore();
  }

  return {
    type: spec.type,
    w,
    h,
    cx: spec.cx,
    cy: spec.cy,
    hubAndLance,
    blades,
    ribbon,
  };
}

function buildClockworkDialRig(sprite, spec) {
  const w = sprite.naturalWidth || sprite.width;
  const h = sprite.naturalHeight || sprite.height;
  const cx = spec.cx * w;
  const cy = spec.cy * h;
  const gearR = spec.gearCutoutR * w;

  const body = makeCanvas(w, h);
  const bctx = body.getContext('2d');
  bctx.drawImage(sprite, 0, 0, w, h);

  // Smoothly recess only the inner dark circular gear window so live meshing gears &
  // independently rotating clock hands sit cleanly inside the real brass Roman dial
  bctx.save();
  bctx.beginPath();
  bctx.arc(cx, cy, gearR, 0, Math.PI * 2);
  const wellGrad = bctx.createRadialGradient(cx, cy, gearR * 0.1, cx, cy, gearR);
  wellGrad.addColorStop(0, '#1e1640');
  wellGrad.addColorStop(0.75, '#130e2c');
  wellGrad.addColorStop(1, '#09071a');
  bctx.fillStyle = wellGrad;
  bctx.fill();
  bctx.strokeStyle = 'rgba(226, 183, 91, 0.72)';
  bctx.lineWidth = Math.max(1.2, w * 0.008);
  bctx.stroke();
  bctx.restore();

  return {
    type: spec.type,
    w,
    h,
    body,
    cx: spec.cx,
    cy: spec.cy,
    gearCutoutR: spec.gearCutoutR,
    dialR: spec.dialR,
  };
}

function buildBannerClothRig(sprite, spec) {
  const w = sprite.naturalWidth || sprite.width;
  const h = sprite.naturalHeight || sprite.height;
  const flameY = Math.round(spec.flameCutY * h);
  const clothY = Math.round(spec.clothStartY * h);
  const poleL = Math.round(((spec.poleCenterX || 0.5) - (spec.poleHalfWidth || 0.048)) * w);
  const poleW = Math.round(((spec.poleHalfWidth || 0.048) * 2) * w);

  // Rigid pole + crossbar + vertical spear-shaft & central medallion stay unbent
  const pole = makeCanvas(w, h);
  const pctx = pole.getContext('2d');
  pctx.save();
  pctx.beginPath();
  pctx.rect(0, flameY, w, clothY - flameY + 2);
  pctx.rect(poleL, clothY, poleW, h - clothY);
  pctx.clip();
  pctx.drawImage(sprite, 0, 0, w, h);
  pctx.restore();

  // Lower crimson cloth banner flaps (rendered in undulating horizontal strips behind rigid shaft)
  const cloth = makeCanvas(w, h);
  const cctx = cloth.getContext('2d');
  cctx.save();
  cctx.beginPath();
  cctx.rect(0, clothY, w, h - clothY);
  cctx.clip();
  cctx.drawImage(sprite, 0, 0, w, h);
  cctx.restore();

  return {
    type: spec.type,
    w,
    h,
    pole,
    cloth,
    flameCutY: spec.flameCutY,
    clothStartY: spec.clothStartY,
    clothEndY: spec.clothEndY,
  };
}

/**
 * Returns the lazily built, cached offscreen canvas rig for a unit sprite,
 * or null if the unit does not require canvas decomposition or runs headless.
 */
export function getUnitSpriteRig(unitId, sprite) {
  if (!sprite || !sprite.complete || !(sprite.naturalWidth > 0)) return null;
  if (!canUseOffscreenCanvas()) return null;

  const spec = UNIT_SPRITE_RIG_SPECS[unitId];
  if (!spec) return null;

  let byUnit = _rigCache.get(sprite);
  if (byUnit && byUnit[unitId]) {
    return byUnit[unitId];
  }

  let rig = null;
  if (spec.type === 'extract_rects') {
    rig = buildExtractRectsRig(sprite, spec);
  } else if (spec.type === 'radial_rings') {
    rig = buildRadialRingsRig(sprite, spec);
  } else if (spec.type === 'wheel_extract') {
    rig = buildWheelExtractRig(sprite, spec);
  } else if (spec.type === 'pinwheel_hub') {
    rig = buildPinwheelHubRig(sprite, spec);
  } else if (spec.type === 'clockwork_dial') {
    rig = buildClockworkDialRig(sprite, spec);
  } else if (spec.type === 'banner_cloth') {
    rig = buildBannerClothRig(sprite, spec);
  }

  if (rig) {
    if (!byUnit) {
      byUnit = Object.create(null);
      _rigCache.set(sprite, byUnit);
    }
    byUnit[unitId] = rig;
  }
  return rig;
}
