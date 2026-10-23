// The prev/next list the player flips through; wraps at both ends.

export function createFlip() {
  let items = [];
  let idx = 0;
  let src = null;
  const move = (d) => {
    if (!items.length) return null;
    idx = (idx + d + items.length) % items.length;
    return items[idx];
  };
  return {
    set(list, index, source) {
      items = Array.isArray(list) ? list.slice() : [];
      idx = items.length ? Math.min(Math.max(index | 0, 0), items.length - 1) : 0;
      src = source ?? null;
    },
    current: () => items[idx] ?? null,
    next: () => move(1),
    prev: () => move(-1),
    source: () => src,
    list: () => items.slice(),
  };
}
