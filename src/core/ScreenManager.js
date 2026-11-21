/**
 * ScreenManager — Controls navigation and lifecycle mounting across all game screens.
 */

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

  _syncNavHighlight(activeId) {
    if (!this._navRootEl) return;
    const buttons = this._navRootEl.querySelectorAll('[data-screen]');
    for (const btn of buttons) {
      const isMatch = btn.getAttribute('data-screen') === activeId;
      btn.classList.toggle('is-active', isMatch);
      if (isMatch) {
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('aria-current');
      }
    }
  }
}
