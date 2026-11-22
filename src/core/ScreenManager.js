/**
 * ScreenManager — Controls navigation, smooth directional transitions,
 * sliding nav indicator, and lifecycle mounting across all game screens.
 */

const NAV_ORDER = ['home', 'missions', 'battle', 'heroes', 'formation', 'summon', 'inventory', 'settings'];
const EXIT_TRANSITION_MS = 210;
const SETTLE_TRANSITION_MS = 290;

export class ScreenManager {
  constructor({ viewportEl, navRootEl = null, eventBus = null } = {}) {
    this._viewportEl = viewportEl;
    this._navRootEl = navRootEl;
    this._eventBus = eventBus;
    /** @type {Map<string, object>} */
    this._screens = new Map();
    this._activeId = null;
    this._activeScreen = null;
    this._history = [];

    this._exitLayerEl = null;
    this._exitTimer = null;
    this._settleTimer = null;
    this._navIndicatorEl = null;
    this._boundResize = null;
  }

  register(screenId, screenController) {
    if (!screenId || !screenController || typeof screenController.mount !== 'function') {
      throw new Error(`Invalid screen registration for "${screenId}".`);
    }
    this._screens.set(screenId, screenController);
  }

  has(screenId) {
    return this._screens.has(screenId);
  }

  getActiveScreenId() {
    return this._activeId;
  }

  getHistory() {
    return [...this._history];
  }

  getRegisteredScreens() {
    return Array.from(this._screens.keys());
  }

  navigate(screenId, params = {}) {
    if (!this._screens.has(screenId)) {
      console.warn(`[ScreenManager] Unknown screen "${screenId}".`);
      return false;
    }

    const previousId = this._activeId;
    const isRealDom =
      typeof document !== 'undefined' &&
      this._viewportEl &&
      typeof this._viewportEl.appendChild === 'function' &&
      typeof this._viewportEl.querySelector === 'function';

    // Always cancel any in-flight exit animation so rapid switching never stacks layers
    this._cleanupExitLayer();
    if (this._settleTimer) {
      clearTimeout(this._settleTimer);
      this._settleTimer = null;
    }

    const direction = this._resolveDirection(previousId, screenId);
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let exitLayer = null;
    if (
      isRealDom &&
      !prefersReducedMotion &&
      previousId &&
      previousId !== screenId &&
      previousId !== 'battle' &&
      screenId !== 'battle'
    ) {
      exitLayer = this._captureExitSnapshot(direction);
    }

    if (this._activeScreen && typeof this._activeScreen.unmount === 'function') {
      try {
        this._activeScreen.unmount();
      } catch (error) {
        console.error(`[ScreenManager] Unmount error on "${previousId}":`, error);
      }
    }

    const nextScreen = this._screens.get(screenId);
    this._activeId = screenId;
    this._activeScreen = nextScreen;
    if (previousId && previousId !== screenId) {
      this._history.push(previousId);
      if (this._history.length > 20) this._history.shift();
    }

    if (this._viewportEl) {
      if (this._viewportEl.dataset) {
        this._viewportEl.dataset.navDir = direction;
      }
      this._viewportEl.innerHTML = '';
      this._viewportEl.classList.toggle('is-battle-mode', screenId === 'battle');
    }

    this._syncNavHighlight(screenId);

    try {
      nextScreen.mount(this._viewportEl, params);
    } catch (error) {
      console.error(`[ScreenManager] Mount error on "${screenId}":`, error);
      if (this._viewportEl) {
        this._viewportEl.innerHTML = `<div class="error-banner">Failed to render screen "${screenId}": ${error.message}</div>`;
      }
      return false;
    }

    if (isRealDom) {
      if (exitLayer && this._viewportEl) {
        this._exitLayerEl = exitLayer;
        this._viewportEl.appendChild(exitLayer);
        this._exitTimer = setTimeout(() => {
          this._cleanupExitLayer();
        }, EXIT_TRANSITION_MS);
      }

      const incomingFrame = this._viewportEl.querySelector(':scope > .screen-frame');
      if (incomingFrame) {
        this._settleTimer = setTimeout(() => {
          incomingFrame.classList?.add('is-settled');
          this._settleTimer = null;
        }, SETTLE_TRANSITION_MS);
      }
    }

    this._eventBus?.emit('screen:changed', { from: previousId, to: screenId, params });
    return true;
  }

  back() {
    const previous = this._history.pop();
    if (previous && this._screens.has(previous)) {
      return this.navigate(previous);
    }
    return this.navigate('home');
  }

  refresh(params = {}) {
    if (!this._activeId) return false;
    return this.navigate(this._activeId, params);
  }

  _resolveDirection(fromId, toId) {
    if (!fromId || fromId === toId || fromId === 'battle' || toId === 'battle') {
      return 'fade';
    }
    const fromIdx = NAV_ORDER.indexOf(fromId);
    const toIdx = NAV_ORDER.indexOf(toId);
    if (fromIdx === -1 || toIdx === -1) return 'fade';
    return toIdx > fromIdx ? 'forward' : 'backward';
  }

  _captureExitSnapshot(direction) {
    const currentFrame = this._viewportEl?.querySelector(':scope > .screen-frame');
    if (!currentFrame || typeof currentFrame.cloneNode !== 'function') return null;

    const wrapper = document.createElement('div');
    wrapper.className = `screen-transition-exit screen-transition-exit--${direction}`;
    wrapper.setAttribute('aria-hidden', 'true');

    const clone = currentFrame.cloneNode(true);
    // Strip IDs & interactive focusability so cloned outgoing DOM never collides with active screen
    clone.removeAttribute?.('id');
    clone.classList?.add('is-settled');
    clone.querySelectorAll?.('[id]').forEach((node) => node.removeAttribute('id'));
    clone.querySelectorAll?.('button, input, a, [tabindex]').forEach((node) => {
      node.setAttribute('tabindex', '-1');
    });
    // Blank cloned WebGL canvases do not carry pixels; hide them cleanly during fade-out
    clone.querySelectorAll?.('canvas').forEach((canvas) => {
      canvas.style.opacity = '0';
    });

    wrapper.appendChild(clone);
    return wrapper;
  }

  _cleanupExitLayer() {
    if (this._exitTimer) {
      clearTimeout(this._exitTimer);
      this._exitTimer = null;
    }
    if (this._exitLayerEl) {
      if (this._exitLayerEl.parentNode) {
        this._exitLayerEl.remove();
      }
      this._exitLayerEl = null;
    }
  }

  _syncNavHighlight(activeId) {
    if (!this._navRootEl) return;
    const buttons = this._navRootEl.querySelectorAll('[data-screen]');
    let activeBtn = null;
    for (const btn of buttons) {
      const isMatch = btn.getAttribute('data-screen') === activeId;
      btn.classList.toggle('is-active', isMatch);
      if (isMatch) {
        btn.setAttribute('aria-current', 'page');
        activeBtn = btn;
      } else {
        btn.removeAttribute('aria-current');
      }
    }

    this._positionNavIndicator(activeBtn);
  }

  _positionNavIndicator(activeBtn) {
    if (
      typeof document === 'undefined' ||
      !this._navRootEl ||
      typeof this._navRootEl.appendChild !== 'function'
    ) {
      return;
    }

    let isFirstPlacement = false;
    if (!this._navIndicatorEl) {
      isFirstPlacement = true;
      this._navIndicatorEl = document.createElement('span');
      this._navIndicatorEl.className = 'nav-active-indicator';
      this._navIndicatorEl.setAttribute('aria-hidden', 'true');
      this._navRootEl.appendChild(this._navIndicatorEl);
      this._navRootEl.classList?.add('has-sliding-indicator');

      if (!this._boundResize && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        this._boundResize = () => {
          const current = this._navRootEl?.querySelector('[data-screen].is-active') || null;
          this._positionNavIndicator(current);
        };
        window.addEventListener('resize', this._boundResize, { passive: true });
      }

      if (typeof document !== 'undefined' && document.fonts?.ready?.then) {
        document.fonts.ready.then(() => {
          const current = this._navRootEl?.querySelector('[data-screen].is-active') || null;
          this._positionNavIndicator(current);
        });
      }
    }

    if (!activeBtn) {
      this._navIndicatorEl.classList.remove('is-visible');
      return;
    }

    const inset = 8;
    const left = Math.round((activeBtn.offsetLeft || 0) + inset);
    const width = Math.max(16, Math.round((activeBtn.offsetWidth || 0) - inset * 2));
    if (width <= 16 && (activeBtn.offsetWidth || 0) === 0) {
      return;
    }

    if (isFirstPlacement) {
      this._navIndicatorEl.style.transition = 'none';
      this._navIndicatorEl.style.width = `${width}px`;
      this._navIndicatorEl.style.transform = `translate3d(${left}px, 0, 0)`;
      this._navIndicatorEl.classList.add('is-visible');
      void this._navIndicatorEl.offsetWidth;
      this._navIndicatorEl.style.transition = '';
      return;
    }

    this._navIndicatorEl.style.width = `${width}px`;
    this._navIndicatorEl.style.transform = `translate3d(${left}px, 0, 0)`;
    this._navIndicatorEl.classList.add('is-visible');
  }
}

