// The engineering log (page 999): a short record, kept across reloads, of what the player, the
// <audio> element, the lock screen and the page went through. It traces stops that only happen
// away from a desk, such as in the car over Bluetooth.

const KEY = 'radiotext-diag';
const DETAIL_MAX = 80;

const pad2 = (n) => String(n).padStart(2, '0');

/** HH:MM:SS in local time. */
export function clockTime(t) {
  const d = new Date(t);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/**
 * @param {ReturnType<import('./saved.js').safeStorage>} store
 * @param {{now?: () => number, max?: number}} [opts]
 */
export function createDiag(store, { now = Date.now, max = 200 } = {}) {
  /** @returns {[number, string, string][]} */
  const read = () => {
    const v = store.get(KEY);
    return Array.isArray(v) ? v : [];
  };
  return {
    note(event, detail = '') {
      const l = read();
      l.push([now(), String(event), String(detail).slice(0, DETAIL_MAX)]);
      store.set(KEY, l.slice(-max));
    },
    list: read,
    clear() {
      store.set(KEY, []);
    },
  };
}

/** The log as plain text, oldest first, for pasting into a message. */
export function diagText(entries) {
  return entries.map(([t, e, d]) => `${clockTime(t)} ${e} ${d}`.trimEnd()).join('\n');
}
