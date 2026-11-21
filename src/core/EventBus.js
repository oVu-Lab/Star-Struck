/**
 * EventBus — Lightweight publish/subscribe bus decoupling gameplay systems from UI.
 */

export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  on(eventName, handler) {
    if (typeof eventName !== 'string' || typeof handler !== 'function') {
      throw new TypeError('EventBus.on requires an eventName string and handler function.');
    }
    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, new Set());
    }
    this._listeners.get(eventName).add(handler);
    return () => this.off(eventName, handler);
  }

  once(eventName, handler) {
    const wrapper = (payload) => {
      this.off(eventName, wrapper);
      handler(payload);
    };
    return this.on(eventName, wrapper);
  }

  off(eventName, handler) {
    const bucket = this._listeners.get(eventName);
    if (!bucket) return;
    bucket.delete(handler);
    if (bucket.size === 0) {
      this._listeners.delete(eventName);
    }
  }

  emit(eventName, payload) {
    const bucket = this._listeners.get(eventName);
    if (!bucket || bucket.size === 0) return;
    // Snapshot to allow safe unsubscription during dispatch.
    const snapshot = Array.from(bucket);
    for (const handler of snapshot) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[EventBus] Listener error on "${eventName}":`, error);
      }
    }
  }

  listenerCount(eventName) {
    return this._listeners.get(eventName)?.size ?? 0;
  }

  clear(eventName) {
    if (eventName) {
      this._listeners.delete(eventName);
    } else {
      this._listeners.clear();
    }
  }
}
