// Saved stations and dead-station marks, over storage that may be blocked.
import { MAX_SAVED, DEAD_TTL_MS } from './config.js';

/**
 * JSON key/value store over a localStorage-like object. Any missing or throwing
 * storage (blocked, quota) falls back to an in-memory Map for that key.
 * @param {{getItem(k: string): string|null, setItem(k: string, v: string): void}|null|undefined} storage
 */
export function safeStorage(storage) {
  /** @type {Map<string, string>} */
  const mem = new Map();
  return {
    /** @returns {any} the parsed value, or null when absent or unreadable */
    get(key) {
      let raw = mem.has(key) ? mem.get(key) : null;
      if (raw === null) {
        try { raw = storage ? storage.getItem(key) : null; } catch { raw = null; }
      }
      if (raw === null || raw === undefined) return null;
      try { return JSON.parse(raw); } catch { return null; }
    },
    /** @returns {boolean} false only if the value cannot be serialised */
    set(key, value) {
      let raw;
      try { raw = JSON.stringify(value); } catch { return false; }
      if (raw === undefined) return false;
      try {
        if (!storage) throw new Error('no storage');
        storage.setItem(key, raw);
        mem.delete(key);
      } catch {
        mem.set(key, raw);
      }
      return true;
    },
  };
}

const SAVED_KEY = 'radiotext-saved';
const DEAD_KEY = 'radiotext-dead';

/**
 * @param {ReturnType<typeof safeStorage>} store
 * @param {import('./config.js').Station[]} defaults seeded only when the key is absent
 */
export function createSaved(store, defaults, max = MAX_SAVED) {
  const read = () => {
    const v = store.get(SAVED_KEY);
    if (Array.isArray(v)) return v;
    const seed = defaults.map((s) => ({ ...s }));
    store.set(SAVED_KEY, seed);
    return seed;
  };
  return {
    list: () => read().map((s) => ({ ...s })),
    has: (uuid) => read().some((s) => s.uuid === uuid),
    add(station) {
      const l = read();
      if (l.length >= max || l.some((s) => s.uuid === station.uuid)) return false;
      l.push({ ...station });
      store.set(SAVED_KEY, l);
      return true;
    },
    remove(uuid) {
      store.set(SAVED_KEY, read().filter((s) => s.uuid !== uuid));
    },
  };
}

/** @param {ReturnType<typeof safeStorage>} store */
export function createDead(store, now = Date.now, ttl = DEAD_TTL_MS) {
  const read = () => {
    const v = store.get(DEAD_KEY);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  };
  return {
    has(uuid) {
      const t = read()[uuid];
      return typeof t === 'number' && now() - t < ttl;
    },
    add(uuid) {
      const t = now();
      const m = {};
      for (const [k, v] of Object.entries(read())) if (typeof v === 'number' && t - v < ttl) m[k] = v;
      m[uuid] = t;
      store.set(DEAD_KEY, m);
    },
  };
}
