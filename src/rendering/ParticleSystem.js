/**
 * ParticleSystem — Object-pooled Canvas 2D particle engine for ambient starlight
 * motes, combat impact sparks, healing wisps, and death dissolves.
 *
 * Uses strict fixed-capacity object pooling and quality scaling so 50-unit
 * battles stay visually crisp at 60 FPS with zero GC pressure.
 */

export class ParticleSystem {
  constructor({ maxParticles = 120 } = {}) {
    this._maxParticles = maxParticles;
    this._quality = 'high';
    this._ambient = [];
    this._active = [];
    this._pool = [];
  }

  _acquire() {
    return this._pool.length > 0 ? this._pool.pop() : {};
  }

  _release(p) {
    if (this._pool.length < this._maxParticles * 2) {
      this._pool.push(p);
    }
  }

  _getQualityScale() {
    if (this._quality === 'low') return 0.45;
    if (this._quality === 'medium') return 0.72;
    return 1.0;
  }

  seedAmbient(width, height, quality = 'high', palette = null) {
    this._quality = quality || 'high';
    const colors = Array.isArray(palette) && palette.length > 0
      ? palette
      : ['#e2b75b', '#f8fafc', '#38bdf8'];
    const target = quality === 'low' ? 14 : quality === 'medium' ? 24 : 36;
    this._ambient = [];
    for (let i = 0; i < target; i += 1) {
      this._ambient.push({
        x: Math.random() * width,
        y: Math.random() * (height * 0.75),
        vx: -7 - Math.random() * 14,
        vy: (Math.random() - 0.5) * 4,
        size: 1 + Math.random() * 1.8,
        alpha: 0.16 + Math.random() * 0.32,
        phase: Math.random() * Math.PI * 2,
        color: colors[i % colors.length],
      });
    }
  }

  spawnBurst(x, y, color = '#38bdf8', count = 8, { speedScale = 1, gravity = 65, shape = 'dot' } = {}) {
    const scaledCount = Math.max(2, Math.round(count * this._getQualityScale()));
    const budget = Math.round(this._maxParticles * this._getQualityScale());

    for (let i = 0; i < scaledCount; i += 1) {
      if (this._active.length >= budget) {
        const oldest = this._active.shift();
        if (oldest) this._release(oldest);
      }
      const angle = (Math.PI * 2 * i) / scaledCount + (Math.random() - 0.5) * 0.45;
      const speed = (36 + Math.random() * 72) * speedScale;
      const p = this._acquire();
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed * 0.7 - 16 * speedScale;
      p.gravity = gravity;
      p.size = 1.6 + Math.random() * 2.0;
      p.alpha = 0.92;
      p.color = color;
      p.coreColor = '#fffdf4';
      p.shape = shape;
      p.rotation = Math.random() * Math.PI * 2;
      p.life = 0.32 + Math.random() * 0.24;
      p.maxLife = p.life;
      this._active.push(p);
    }
  }

  spawnRising(x, y, color = '#34d399', count = 5) {
    const scaledCount = Math.max(2, Math.round(count * this._getQualityScale()));
    const budget = Math.round(this._maxParticles * this._getQualityScale());

    for (let i = 0; i < scaledCount; i += 1) {
      if (this._active.length >= budget) {
        const oldest = this._active.shift();
        if (oldest) this._release(oldest);
      }
      const p = this._acquire();
      p.x = x + (Math.random() - 0.5) * 18;
      p.y = y + (Math.random() - 0.5) * 8;
      p.vx = (Math.random() - 0.5) * 14;
      p.vy = -26 - Math.random() * 28;
      p.gravity = -8;
      p.size = 1.8 + Math.random() * 1.6;
      p.alpha = 0.88;
      p.color = color;
      p.coreColor = '#fffdf4';
      p.shape = 'diamond';
      p.rotation = 0;
      p.life = 0.45 + Math.random() * 0.25;
      p.maxLife = p.life;
      this._active.push(p);
    }
  }

  spawnThemed(
    x,
    y,
    {
      color = '#38bdf8',
      secondaryColor = '#f5d37a',
      coreColor = '#fffdf4',
      count = 14,
      mode = 'burst',
      shape = 'spark',
      secondaryShape = 'star',
      speedScale = 1,
      spreadX = 24,
      spreadY = 12,
    } = {},
  ) {
    const scaledCount = Math.max(3, Math.round(count * this._getQualityScale()));
    const budget = Math.round(this._maxParticles * this._getQualityScale());

    for (let i = 0; i < scaledCount; i += 1) {
      if (this._active.length >= budget) {
        const oldest = this._active.shift();
        if (oldest) this._release(oldest);
      }
      const p = this._acquire();
      const useSecondary = i % 3 === 0;
      p.color = useSecondary ? secondaryColor : color;
      p.coreColor = coreColor;
      p.shape = useSecondary ? secondaryShape : shape;
      p.rotation = Math.random() * Math.PI * 2;

      if (mode === 'rising') {
        p.x = x + (Math.random() - 0.5) * spreadX * 2;
        p.y = y + (Math.random() - 0.5) * spreadY * 2;
        p.vx = (Math.random() - 0.5) * 22 * speedScale;
        p.vy = (-32 - Math.random() * 44) * speedScale;
        p.gravity = -10;
        p.size = 2.0 + Math.random() * 2.2;
        p.life = 0.52 + Math.random() * 0.34;
      } else if (mode === 'inward') {
        const ang = (Math.PI * 2 * i) / scaledCount + (Math.random() - 0.5) * 0.35;
        const dist = (28 + Math.random() * 46) * speedScale;
        p.x = x + Math.cos(ang) * dist;
        p.y = y + Math.sin(ang) * dist * 0.55;
        p.vx = -Math.cos(ang) * dist * 1.45;
        p.vy = -Math.sin(ang) * dist * 0.85;
        p.gravity = 0;
        p.size = 1.8 + Math.random() * 2.0;
        p.life = 0.48 + Math.random() * 0.24;
      } else if (mode === 'surge') {
        p.x = x + (Math.random() - 0.5) * spreadX * 1.6;
        p.y = y + (Math.random() - 0.5) * spreadY * 2.4;
        p.vx = (70 + Math.random() * 95) * speedScale;
        p.vy = (-14 + (Math.random() - 0.5) * 28) * speedScale;
        p.gravity = 6;
        p.size = 2.0 + Math.random() * 2.2;
        p.life = 0.42 + Math.random() * 0.26;
      } else {
        const angle = (Math.PI * 2 * i) / scaledCount + (Math.random() - 0.5) * 0.45;
        const speed = (44 + Math.random() * 92) * speedScale;
        p.x = x + (Math.random() - 0.5) * spreadX * 0.5;
        p.y = y + (Math.random() - 0.5) * spreadY * 0.5;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed * 0.65 - 24 * speedScale;
        p.gravity = 52;
        p.size = 1.8 + Math.random() * 2.4;
        p.life = 0.42 + Math.random() * 0.3;
      }

      p.alpha = 0.94;
      p.maxLife = p.life;
      this._active.push(p);
    }
  }

  spawnDirectional(
    x,
    y,
    angle = 0,
    {
      color = '#38bdf8',
      secondaryColor = '#f5d37a',
      coreColor = '#fffdf4',
      count = 6,
      shape = 'streak',
      secondaryShape = 'spark',
      mode = 'cone', // 'cone' | 'forward_jet' | 'eruption' | 'radial' | 'inward' | 'rising'
      speedScale = 1,
    } = {},
  ) {
    const scaledCount = Math.max(2, Math.round(count * this._getQualityScale()));
    const budget = Math.round(this._maxParticles * this._getQualityScale());

    for (let i = 0; i < scaledCount; i += 1) {
      if (this._active.length >= budget) {
        const oldest = this._active.shift();
        if (oldest) this._release(oldest);
      }
      const p = this._acquire();
      const useSecondary = i % 3 === 1;
      p.color = useSecondary ? secondaryColor : color;
      p.coreColor = coreColor;
      p.shape = useSecondary ? secondaryShape : shape;
      p.rotation = Math.random() * Math.PI * 2;

      if (mode === 'rising') {
        p.x = x + (Math.random() - 0.5) * 18;
        p.y = y + (Math.random() - 0.5) * 8;
        p.vx = (Math.random() - 0.5) * 18 * speedScale;
        p.vy = (-30 - Math.random() * 34) * speedScale;
        p.gravity = -8;
        p.size = 1.6 + Math.random() * 1.5;
        p.life = 0.42 + Math.random() * 0.24;
      } else if (mode === 'inward') {
        const ang = (Math.PI * 2 * i) / scaledCount + (Math.random() - 0.5) * 0.3;
        const dist = (18 + Math.random() * 24) * speedScale;
        p.x = x + Math.cos(ang) * dist;
        p.y = y + Math.sin(ang) * dist * 0.58;
        p.vx = -Math.cos(ang) * dist * 2.1;
        p.vy = -Math.sin(ang) * dist * 1.25;
        p.gravity = 0;
        p.size = 1.5 + Math.random() * 1.4;
        p.life = 0.34 + Math.random() * 0.16;
      } else if (mode === 'eruption') {
        const spread = (Math.random() - 0.5) * 1.35;
        const speed = (52 + Math.random() * 78) * speedScale;
        p.x = x + (Math.random() - 0.5) * 14;
        p.y = y + (Math.random() - 0.5) * 6;
        p.vx = Math.sin(spread) * speed * 0.72;
        p.vy = (-Math.abs(Math.cos(spread)) * speed * 0.92) - 18 * speedScale;
        p.gravity = 115;
        p.size = 1.7 + Math.random() * 1.8;
        p.life = 0.36 + Math.random() * 0.24;
      } else if (mode === 'forward_jet') {
        const spread = (Math.random() - 0.5) * 0.44;
        const a = angle + spread;
        const speed = (68 + Math.random() * 88) * speedScale;
        p.x = x + (Math.random() - 0.5) * 5;
        p.y = y + (Math.random() - 0.5) * 4;
        p.vx = Math.cos(a) * speed;
        p.vy = Math.sin(a) * speed * 0.75 - 6 * speedScale;
        p.gravity = 24;
        p.size = 1.5 + Math.random() * 1.5;
        p.life = 0.26 + Math.random() * 0.18;
      } else if (mode === 'radial') {
        const a = (Math.PI * 2 * i) / scaledCount + (Math.random() - 0.5) * 0.38;
        const speed = (42 + Math.random() * 74) * speedScale;
        p.x = x + (Math.random() - 0.5) * 6;
        p.y = y + (Math.random() - 0.5) * 4;
        p.vx = Math.cos(a) * speed;
        p.vy = Math.sin(a) * speed * 0.65 - 14 * speedScale;
        p.gravity = 58;
        p.size = 1.6 + Math.random() * 1.7;
        p.life = 0.32 + Math.random() * 0.22;
      } else if (mode === 'scatter_debris') {
        // Angular fragments / metallic chips bouncing & scattering off heavy impact
        const spread = (Math.random() - 0.5) * 1.65;
        const a = angle + spread;
        const speed = (58 + Math.random() * 86) * speedScale;
        p.x = x + (Math.random() - 0.5) * 8;
        p.y = y + (Math.random() - 0.5) * 5;
        p.vx = Math.cos(a) * speed;
        p.vy = Math.sin(a) * speed * 0.55 - (24 + Math.random() * 32) * speedScale;
        p.gravity = 165;
        p.size = 1.7 + Math.random() * 1.9;
        p.life = 0.34 + Math.random() * 0.24;
      } else if (mode === 'orbit_ember') {
        // Fine lingering embers / arcane motes drifting slowly upward after impact
        const ang = (Math.PI * 2 * i) / scaledCount + (Math.random() - 0.5) * 0.5;
        const r = (6 + Math.random() * 16) * speedScale;
        p.x = x + Math.cos(ang) * r;
        p.y = y + Math.sin(ang) * r * 0.5;
        p.vx = Math.cos(ang) * 16 * speedScale;
        p.vy = (-18 - Math.random() * 24) * speedScale;
        p.gravity = -6;
        p.size = 1.4 + Math.random() * 1.4;
        p.life = 0.55 + Math.random() * 0.32;
      } else if (mode === 'slash_spray') {
        // Tight tangent spray peeling along a blade sweep direction
        const tangent = angle + (i % 2 === 0 ? 0.52 : -0.52) + (Math.random() - 0.5) * 0.35;
        const speed = (64 + Math.random() * 82) * speedScale;
        p.x = x + (Math.random() - 0.5) * 8;
        p.y = y + (Math.random() - 0.5) * 6;
        p.vx = Math.cos(tangent) * speed;
        p.vy = Math.sin(tangent) * speed * 0.68 - 10 * speedScale;
        p.gravity = 42;
        p.size = 1.5 + Math.random() * 1.5;
        p.life = 0.24 + Math.random() * 0.16;
      } else {
        // Default directional 'cone' aligned to impact/strike vector
        const spread = (Math.random() - 0.5) * 0.95;
        const a = angle + spread;
        const speed = (48 + Math.random() * 78) * speedScale;
        p.x = x + (Math.random() - 0.5) * 6;
        p.y = y + (Math.random() - 0.5) * 4;
        p.vx = Math.cos(a) * speed;
        p.vy = Math.sin(a) * speed * 0.72 - 14 * speedScale;
        p.gravity = 64;
        p.size = 1.5 + Math.random() * 1.6;
        p.life = 0.28 + Math.random() * 0.2;
      }

      p.alpha = 0.94;
      p.maxLife = p.life;
      this._active.push(p);
    }
  }

  getActiveCount() {
    return this._active.length + this._ambient.length;
  }

  update(dt, width, height) {
    for (let i = 0; i < this._ambient.length; i += 1) {
      const a = this._ambient[i];
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.phase += dt * 2.2;
      if (a.x < -8) a.x = width + 8;
      if (a.y < 0) a.y = height * 0.72;
      if (a.y > height * 0.76) a.y = 4;
    }

    for (let i = this._active.length - 1; i >= 0; i -= 1) {
      const p = this._active[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.life -= dt;
      p.alpha = Math.max(0, p.life / Math.max(0.01, p.maxLife));
      if (p.life <= 0) {
        this._active.splice(i, 1);
        this._release(p);
      }
    }
  }

  renderAmbient(ctx) {
    ctx.save();
    for (let i = 0; i < this._ambient.length; i += 1) {
      const a = this._ambient[i];
      ctx.globalAlpha = a.alpha * (0.72 + Math.sin(a.phase) * 0.28);
      ctx.fillStyle = a.color;
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  renderForeground(ctx) {
    if (this._active.length === 0) return;
    ctx.save();
    for (let i = 0; i < this._active.length; i += 1) {
      const p = this._active[i];
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      if (p.shape === 'diamond') {
        const s = p.size * 1.25;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - s);
        ctx.lineTo(p.x + s * 0.75, p.y);
        ctx.lineTo(p.x, p.y + s);
        ctx.lineTo(p.x - s * 0.75, p.y);
        ctx.closePath();
        ctx.fill();
      } else if (p.shape === 'star') {
        const outer = p.size * 2.1;
        const inner = p.size * 0.46;
        ctx.beginPath();
        for (let k = 0; k < 8; k += 1) {
          const r = k % 2 === 0 ? outer : inner;
          const a = (Math.PI * k) / 4 + (p.rotation || 0);
          const px = p.x + Math.cos(a) * r;
          const py = p.y + Math.sin(a) * r;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = p.coreColor || '#fffdf4';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.8, p.size * 0.48), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'streak') {
        const spd = Math.hypot(p.vx, p.vy) || 1;
        const nx = p.vx / spd;
        const ny = p.vy / spd;
        const len = Math.max(6, p.size * 3.8);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1.2, p.size * 0.72);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x - nx * len, p.y - ny * len);
        ctx.lineTo(p.x + nx * len * 0.3, p.y + ny * len * 0.3);
        ctx.stroke();
        ctx.strokeStyle = p.coreColor || '#fffdf4';
        ctx.lineWidth = Math.max(0.65, p.size * 0.3);
        ctx.stroke();
      } else if (p.shape === 'petal') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation || 0) + (1 - p.alpha) * 2.2);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * 1.45, p.size * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.coreColor || '#fffdf4';
        ctx.globalAlpha = p.alpha * 0.65;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * 0.72, p.size * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (p.shape === 'shard') {
        // Angular beveled fragment (metal chip, ice crystal, or armor splinter)
        const rot = Math.atan2(p.vy, p.vx);
        const len = p.size * 2.4;
        const hw = p.size * 0.78;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.moveTo(len * 0.65, 0);
        ctx.lineTo(-len * 0.15, -hw);
        ctx.lineTo(-len * 0.65, -hw * 0.25);
        ctx.lineTo(-len * 0.35, hw * 0.85);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = p.coreColor || '#fffdf4';
        ctx.globalAlpha = p.alpha * 0.7;
        ctx.beginPath();
        ctx.moveTo(len * 0.52, 0);
        ctx.lineTo(-len * 0.08, -hw * 0.42);
        ctx.lineTo(-len * 0.28, hw * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.shape === 'ring') {
        const rad = p.size * (1.2 + (1 - p.alpha) * 1.8);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.9, p.size * 0.45 * p.alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.shape === 'spark') {
        ctx.globalAlpha = p.alpha * 0.45;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 1.65, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.coreColor || '#fffdf4';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.65, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  render(ctx) {
    this.renderAmbient(ctx);
    this.renderForeground(ctx);
  }

  clear() {
    this._ambient = [];
    while (this._active.length > 0) {
      this._release(this._active.pop());
    }
  }
}
