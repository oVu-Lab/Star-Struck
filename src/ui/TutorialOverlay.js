/**
 * TutorialOverlay — Lightweight, compact spotlight overlay with 4-pane backdrop,
 * animated directional pointer, minimal single-action instruction card, and skip modal.
 */

export class TutorialOverlay {
  constructor({
    rootEl,
    containerEl = null,
    battleManager = null,
    onContinue = null,
    onRequestSkip = null,
    onCancelSkip = null,
    onConfirmSkip = null,
  }) {
    this._root = rootEl;
    this._container = containerEl;
    this._battleManager = battleManager;
    this._onContinue = onContinue;
    this._onRequestSkip = onRequestSkip;
    this._onCancelSkip = onCancelSkip;
    this._onConfirmSkip = onConfirmSkip;

    this._lastModel = null;
    this._resizeHandler = null;
    this._rafReposition = null;
    this._settleTimer = null;
  }

  mount() {
    if (!this._root) return;
    this._root.hidden = false;
    this._root.innerHTML = `
      <div class="tutorial-backdrop" aria-hidden="true">
        <div class="tutorial-backdrop-pane tutorial-backdrop-pane--top"></div>
        <div class="tutorial-backdrop-pane tutorial-backdrop-pane--left"></div>
        <div class="tutorial-backdrop-pane tutorial-backdrop-pane--right"></div>
        <div class="tutorial-backdrop-pane tutorial-backdrop-pane--bottom"></div>
      </div>

      <div id="tutorial-spotlight" class="tutorial-spotlight" hidden aria-hidden="true">
        <div class="tutorial-spotlight__ring"></div>
      </div>

      <div id="tutorial-pointer" class="tutorial-pointer" hidden aria-hidden="true">
        <span class="tutorial-pointer__arrow"></span>
      </div>

      <aside
        id="tutorial-panel"
        class="tutorial-panel"
        role="dialog"
        aria-live="polite"
        aria-labelledby="tutorial-stage-title"
      >
        <div class="tutorial-panel__head">
          <span id="tutorial-step-counter" class="tutorial-step-counter tabular-nums">Step 1 of 7</span>
          <button type="button" id="btn-tutorial-skip" class="btn btn-ghost btn-xs tutorial-skip-btn">
            Skip
          </button>
        </div>

        <h2 id="tutorial-stage-title" class="tutorial-panel__title"></h2>
        <p id="tutorial-stage-body" class="tutorial-panel__body"></p>

        <div id="tutorial-panel-actions" class="tutorial-panel__actions" hidden>
          <button type="button" id="btn-tutorial-continue" class="btn btn-gold btn-sm">
            Continue
          </button>
        </div>
      </aside>

      <div id="tutorial-skip-modal" class="tutorial-skip-modal" hidden role="alertdialog" aria-modal="true" aria-labelledby="tutorial-skip-title">
        <div class="tutorial-skip-modal__card">
          <h3 id="tutorial-skip-title" class="tutorial-skip-modal__title">Skip Tutorial?</h3>
          <p class="tutorial-skip-modal__desc">
            Enter a normal battle now. Replay anytime from Settings or the Guide.
          </p>
          <div class="btn-row tutorial-skip-modal__actions">
            <button type="button" id="btn-tutorial-skip-cancel" class="btn btn-secondary btn-sm">
              Resume
            </button>
            <button type="button" id="btn-tutorial-skip-confirm" class="btn btn-danger btn-sm">
              Skip
            </button>
          </div>
        </div>
      </div>
    `;

    this._bindDomEvents();
    this._container?.querySelector?.('.battle-theater')?.classList?.add('is-tutorial-active');

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this._resizeHandler = () => {
        if (this._lastModel) {
          this._positionElements(this._lastModel);
        }
      };
      window.addEventListener('resize', this._resizeHandler);
    }
  }

  unmount() {
    if (this._rafReposition && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._rafReposition);
      this._rafReposition = null;
    }
    if (this._settleTimer) {
      clearTimeout(this._settleTimer);
      this._settleTimer = null;
    }
    if (this._resizeHandler && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    this._container?.querySelector?.('.battle-theater')?.classList?.remove('is-tutorial-active');
    if (this._root) {
      this._root.hidden = true;
      this._root.innerHTML = '';
    }
    this._lastModel = null;
  }

  _bindDomEvents() {
    if (!this._root) return;

    this._root.querySelector('#btn-tutorial-continue')?.addEventListener('click', () => {
      this._onContinue?.();
    });
    this._root.querySelector('#btn-tutorial-skip')?.addEventListener('click', () => {
      this._onRequestSkip?.();
    });
    this._root.querySelector('#btn-tutorial-skip-cancel')?.addEventListener('click', () => {
      this._onCancelSkip?.();
    });
    this._root.querySelector('#btn-tutorial-skip-confirm')?.addEventListener('click', () => {
      this._onConfirmSkip?.();
    });

    // Wrong-area clicks on the backdrop intentionally do nothing and keep the current instruction visible.
    for (const pane of this._root.querySelectorAll('.tutorial-backdrop-pane')) {
      pane.addEventListener('click', (ev) => {
        ev.stopPropagation();
      });
    }
  }

  render(model) {
    if (!this._root || !model) return;
    this._lastModel = model;

    const theaterEl = this._container?.querySelector?.('.battle-theater');
    if (theaterEl) {
      theaterEl.classList.toggle('is-tutorial-active', Boolean(model.active));
      theaterEl.classList.toggle('is-tutorial-banner-mode', model.mode === 'banner');
    }

    this._root.hidden = !model.active;
    this._root.classList.toggle('is-banner-mode', model.mode === 'banner');

    const counterEl = this._root.querySelector('#tutorial-step-counter');
    const titleEl = this._root.querySelector('#tutorial-stage-title');
    const bodyEl = this._root.querySelector('#tutorial-stage-body');
    const actionsEl = this._root.querySelector('#tutorial-panel-actions');
    const continueBtn = this._root.querySelector('#btn-tutorial-continue');
    const skipModal = this._root.querySelector('#tutorial-skip-modal');

    if (counterEl) counterEl.textContent = model.stepLabel;
    if (titleEl) titleEl.textContent = model.title;
    if (bodyEl) bodyEl.textContent = model.body;

    if (actionsEl && continueBtn) {
      actionsEl.hidden = !model.showContinue;
      continueBtn.disabled = Boolean(model.continueDisabled);
      continueBtn.textContent = model.continueLabel || 'Continue';
    }

    if (skipModal) {
      skipModal.hidden = !model.skipConfirmOpen;
    }

    this._positionElements(model);
    if (typeof requestAnimationFrame === 'function') {
      if (this._rafReposition) cancelAnimationFrame(this._rafReposition);
      this._rafReposition = requestAnimationFrame(() => {
        this._rafReposition = null;
        if (this._lastModel) this._positionElements(this._lastModel);
      });
    }
    if (this._settleTimer) {
      clearTimeout(this._settleTimer);
      this._settleTimer = null;
    }
    if (typeof setTimeout === 'function' && model.mode !== 'banner') {
      this._settleTimer = setTimeout(() => {
        this._settleTimer = null;
        if (this._lastModel) this._positionElements(this._lastModel);
      }, 210);
      this._settleTimer?.unref?.();
    }
  }

  _positionElements(model) {
    if (!this._root) return;
    const viewport = this._getViewportRect();
    const spotlightEl = this._root.querySelector('#tutorial-spotlight');
    const pointerEl = this._root.querySelector('#tutorial-pointer');
    const panelEl = this._root.querySelector('#tutorial-panel');

    if (model.mode === 'banner') {
      this._setBackdropRect(null, viewport);
      if (spotlightEl) spotlightEl.hidden = true;
      if (pointerEl) pointerEl.hidden = true;
      if (panelEl) {
        panelEl.className = 'tutorial-panel tutorial-panel--banner';
        panelEl.style.left = '';
        panelEl.style.top = '';
        panelEl.style.right = '';
        panelEl.style.bottom = '';
        panelEl.style.transform = '';
      }
      return;
    }

    const targetRect = this._resolveTargetRect(model, viewport);
    this._setBackdropRect(targetRect, viewport);

    if (spotlightEl) {
      if (targetRect && targetRect.width > 0 && targetRect.height > 0) {
        spotlightEl.hidden = false;
        spotlightEl.style.left = `${Math.round(targetRect.x)}px`;
        spotlightEl.style.top = `${Math.round(targetRect.y)}px`;
        spotlightEl.style.width = `${Math.round(targetRect.width)}px`;
        spotlightEl.style.height = `${Math.round(targetRect.height)}px`;
      } else {
        spotlightEl.hidden = true;
      }
    }

    this._positionPointer(pointerEl, targetRect, model.pointerDirection, viewport);
    this._placePanelSafely(panelEl, targetRect, viewport);
  }

  _getViewportRect() {
    if (this._root && typeof this._root.getBoundingClientRect === 'function') {
      const r = this._root.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) {
        return { width: r.width, height: r.height };
      }
    }
    if (typeof window !== 'undefined' && window.innerWidth && window.innerHeight) {
      return { width: window.innerWidth, height: window.innerHeight };
    }
    return { width: 1280, height: 720 };
  }

  _resolveTargetRect(model, viewport) {
    const pad = 5;
    const rootRect =
      this._root && typeof this._root.getBoundingClientRect === 'function'
        ? this._root.getBoundingClientRect()
        : null;
    const offsetX = rootRect?.left || 0;
    const offsetY = rootRect?.top || 0;

    if (model.targetKind === 'selector' && model.targetSelector && this._container) {
      const els = this._container.querySelectorAll(model.targetSelector);
      const boxes = [];
      for (const el of els) {
        if (el && typeof el.getBoundingClientRect === 'function') {
          const r = el.getBoundingClientRect();
          if (r && r.width > 0 && r.height > 0) {
            boxes.push(r);
          }
        }
      }
      if (boxes.length > 0) {
        const minX = Math.min(...boxes.map((b) => b.left)) - offsetX;
        const minY = Math.min(...boxes.map((b) => b.top)) - offsetY;
        const maxX = Math.max(...boxes.map((b) => b.right)) - offsetX;
        const maxY = Math.max(...boxes.map((b) => b.bottom)) - offsetY;
        return this._clampRect(
          {
            x: minX - pad,
            y: minY - pad,
            width: maxX - minX + pad * 2,
            height: maxY - minY + pad * 2,
          },
          viewport,
        );
      }
    }

    if (
      model.targetKind === 'friendly_zone' ||
      model.targetKind === 'combat_zone' ||
      model.targetKind === 'enemy_cluster'
    ) {
      const rect = this._resolveBattlefieldRegionRect(model.targetKind, viewport);
      if (rect) return this._clampRect(rect, viewport);
    }

    return null;
  }

  _resolveBattlefieldRegionRect(kind, viewport) {
    const bf = this._battleManager?.battlefield;
    const canvasEl = this._container?.querySelector?.('#battle-canvas');
    const cRect =
      canvasEl && typeof canvasEl.getBoundingClientRect === 'function'
        ? canvasEl.getBoundingClientRect()
        : { left: 0, top: 0, width: viewport.width, height: viewport.height };
    const w = cRect.width || viewport.width;
    const h = cRect.height || viewport.height;

    if (!bf || typeof bf.worldToScreen !== 'function') {
      return { x: w * 0.14, y: h * 0.18, width: w * 0.24, height: h * 0.5 };
    }

    let bounds = { minX: 4, maxX: 28, minY: 8, maxY: 92 };
    if (kind === 'friendly_zone') {
      bounds = bf.regions?.friendly || bounds;
    } else if (kind === 'combat_zone') {
      bounds = { minX: 22, maxX: 78, minY: 10, maxY: 90 };
    } else if (kind === 'enemy_cluster') {
      const enemies = this._battleManager?._units?.getBySide?.('enemy') || [];
      if (enemies.length > 0) {
        const xs = enemies.map((e) => e.x);
        const ys = enemies.map((e) => e.y);
        bounds = {
          minX: Math.max(4, Math.min(...xs) - 10),
          maxX: Math.min(96, Math.max(...xs) + 10),
          minY: Math.max(6, Math.min(...ys) - 16),
          maxY: Math.min(94, Math.max(...ys) + 16),
        };
      } else {
        bounds = bf.regions?.enemy || { minX: 70, maxX: 96, minY: 12, maxY: 88 };
      }
    }

    const tl = bf.worldToScreen(bounds.minX, bounds.minY, w, h);
    const tr = bf.worldToScreen(bounds.maxX, bounds.minY, w, h);
    const bl = bf.worldToScreen(bounds.minX, bounds.maxY, w, h);
    const br = bf.worldToScreen(bounds.maxX, bounds.maxY, w, h);

    const rootRect =
      this._root && typeof this._root.getBoundingClientRect === 'function'
        ? this._root.getBoundingClientRect()
        : null;
    const offsetX = rootRect?.left || 0;
    const offsetY = rootRect?.top || 0;

    const minX = Math.min(tl.x, bl.x) + (cRect.left || 0) - offsetX - 8;
    const maxX = Math.max(tr.x, br.x) + (cRect.left || 0) - offsetX + 8;
    const minY = Math.min(tl.y, tr.y) + (cRect.top || 0) - offsetY - 18;
    const maxY = Math.max(bl.y, br.y) + (cRect.top || 0) - offsetY + 12;

    return {
      x: minX,
      y: minY,
      width: Math.max(96, maxX - minX),
      height: Math.max(96, maxY - minY),
    };
  }

  _clampRect(rect, viewport) {
    const x = Math.max(0, Math.min(viewport.width - 24, rect.x));
    const y = Math.max(0, Math.min(viewport.height - 24, rect.y));
    const right = Math.min(viewport.width, rect.x + rect.width);
    const bottom = Math.min(viewport.height, rect.y + rect.height);
    return {
      x,
      y,
      width: Math.max(24, right - x),
      height: Math.max(24, bottom - y),
    };
  }

  _setBackdropRect(rect, viewport) {
    const topEl = this._root.querySelector('.tutorial-backdrop-pane--top');
    const leftEl = this._root.querySelector('.tutorial-backdrop-pane--left');
    const rightEl = this._root.querySelector('.tutorial-backdrop-pane--right');
    const bottomEl = this._root.querySelector('.tutorial-backdrop-pane--bottom');
    if (!topEl || !leftEl || !rightEl || !bottomEl) return;

    if (!rect) {
      for (const el of [topEl, leftEl, rightEl, bottomEl]) {
        el.style.display = 'none';
      }
      return;
    }

    for (const el of [topEl, leftEl, rightEl, bottomEl]) {
      el.style.display = 'block';
    }

    if (rect.width <= 0 || rect.height <= 0) {
      topEl.style.cssText = 'left:0;top:0;width:100%;height:100%;';
      leftEl.style.cssText = 'display:none;';
      rightEl.style.cssText = 'display:none;';
      bottomEl.style.cssText = 'display:none;';
      return;
    }

    const rLeft = Math.max(0, rect.x);
    const rTop = Math.max(0, rect.y);
    const rRight = Math.min(viewport.width, rect.x + rect.width);
    const rBottom = Math.min(viewport.height, rect.y + rect.height);
    const rHeight = Math.max(0, rBottom - rTop);

    topEl.style.cssText = `left:0;top:0;width:100%;height:${rTop}px;`;
    bottomEl.style.cssText = `left:0;top:${rBottom}px;width:100%;height:${Math.max(0, viewport.height - rBottom)}px;`;
    leftEl.style.cssText = `left:0;top:${rTop}px;width:${rLeft}px;height:${rHeight}px;`;
    rightEl.style.cssText = `left:${rRight}px;top:${rTop}px;width:${Math.max(0, viewport.width - rRight)}px;height:${rHeight}px;`;
  }

  _positionPointer(pointerEl, targetRect, direction, viewport) {
    if (!pointerEl) return;
    if (!targetRect || !direction || direction === 'none') {
      pointerEl.hidden = true;
      return;
    }

    pointerEl.hidden = false;
    pointerEl.className = `tutorial-pointer tutorial-pointer--${direction}`;

    let px = targetRect.x + targetRect.width * 0.5;
    let py = targetRect.y - 26;

    if (direction === 'down') {
      px = targetRect.x + targetRect.width * 0.5;
      py = Math.max(18, targetRect.y - 28);
    } else if (direction === 'up') {
      px = targetRect.x + targetRect.width * 0.5;
      py = Math.min(viewport.height - 28, targetRect.y + targetRect.height + 24);
    } else if (direction === 'left') {
      px = Math.min(viewport.width - 28, targetRect.x + targetRect.width + 26);
      py = targetRect.y + targetRect.height * 0.5;
    } else if (direction === 'right') {
      px = Math.max(24, targetRect.x - 28);
      py = targetRect.y + targetRect.height * 0.5;
    }

    pointerEl.style.left = `${Math.round(px)}px`;
    pointerEl.style.top = `${Math.round(py)}px`;
  }

  _placePanelSafely(panelEl, targetRect, viewport) {
    if (!panelEl) return;
    panelEl.className = 'tutorial-panel';
    panelEl.style.right = '';
    panelEl.style.bottom = '';
    panelEl.style.transform = '';

    const panelW = Math.min(296, Math.max(240, viewport.width - 32));
    const panelH = panelEl.offsetHeight > 40 ? panelEl.offsetHeight : 140;
    const margin = 20;

    if (!targetRect) {
      panelEl.style.left = `${Math.round((viewport.width - panelW) * 0.5)}px`;
      panelEl.style.top = '66px';
      return;
    }

    const candidates = [
      // Above target
      {
        left: targetRect.x + targetRect.width * 0.5 - panelW * 0.5,
        top: targetRect.y - panelH - 36,
      },
      // Right of target
      {
        left: targetRect.x + targetRect.width + 32,
        top: targetRect.y + targetRect.height * 0.5 - panelH * 0.5,
      },
      // Left of target
      {
        left: targetRect.x - panelW - 32,
        top: targetRect.y + targetRect.height * 0.5 - panelH * 0.5,
      },
      // Below target
      {
        left: targetRect.x + targetRect.width * 0.5 - panelW * 0.5,
        top: targetRect.y + targetRect.height + 36,
      },
      // Top-center fallback clear of bottom dock
      {
        left: (viewport.width - panelW) * 0.5,
        top: 66,
      },
    ];

    const intersects = (a, b) =>
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y;

    let chosen = null;
    for (const cand of candidates) {
      const clampedX = Math.max(margin, Math.min(viewport.width - panelW - margin, cand.left));
      const clampedY = Math.max(60, Math.min(viewport.height - panelH - margin, cand.top));
      const box = { x: clampedX, y: clampedY, width: panelW, height: panelH };
      if (!intersects(box, targetRect)) {
        chosen = box;
        break;
      }
    }

    if (!chosen) {
      chosen = {
        x: Math.round((viewport.width - panelW) * 0.5),
        y: 66,
      };
    }

    panelEl.style.left = `${Math.round(chosen.x)}px`;
    panelEl.style.top = `${Math.round(chosen.y)}px`;
  }
}
