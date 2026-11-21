/**
 * StorageUtils — Safe localStorage abstraction with injectable storage backend
 * for deterministic testing and graceful failure in restricted browser modes.
 */

export function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

export function resolveStorage(customStorage) {
  if (customStorage) return customStorage;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const probeKey = '__astral_probe__';
      window.localStorage.setItem(probeKey, '1');
      window.localStorage.removeItem(probeKey);
      return window.localStorage;
    }
  } catch {
    // Fall back to in-memory storage if browser storage is blocked.
  }
  return createMemoryStorage();
}

export function safeJsonParse(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, data: null, error: 'Empty payload' };
  }
  try {
    return { ok: true, data: JSON.parse(raw), error: null };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}
