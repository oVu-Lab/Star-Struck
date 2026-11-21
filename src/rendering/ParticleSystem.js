/**
 * ParticleSystem — Object-pooled Canvas 2D particle engine for ambient starlight
 * motes, combat impact sparks, healing wisps, and death dissolves.
 *
 * Uses strict fixed-capacity object pooling and quality scaling so 50-unit
 * battles stay visually crisp at 60 FPS with zero GC pressure.
 */

export class ParticleSystem {
  constructor({ maxParticles = 96 } = {}) {
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
      p.shape = shape;
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
      p.shape = 'diamond';
      p.life = 0.45 + Math.random() * 0.25;
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
