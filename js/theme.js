// Light or dark: a choice kept on each device, switched with the moon/sun key in the top bar.
// Dark is light with every pixel flipped (the page only ever uses two colours), so the switch is
// drawn by flipping the screen a block at a time, in an ordered dither that sweeps across it.

const KEY = 'radiotext-theme';

/** @param {ReturnType<import('./saved.js').safeStorage>} store */
export const storedTheme = (store) => (store.get(KEY) === 'dark' ? 'dark' : 'light');
/** @param {ReturnType<import('./saved.js').safeStorage>} store @param {'light'|'dark'} theme */
export const saveTheme = (store, theme) => store.set(KEY, theme);

/** 4×4 Bayer matrix: the order a 1-bit screen fills in a dither from 0 to 16 sixteenths. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * When each block flips, from 0 (first) to just under 1 (last). `from` is where the sweep
 * starts; `spread` is how much of the screen the dithered edge covers at once.
 * @param {number} cols @param {number} rows
 * @param {{from?: 'top'|'bottom'|'center', spread?: number}} [opts]
 * @returns {Float32Array} one threshold per block, row by row
 */
export function ditherOrder(cols, rows, { from = 'top', spread = 0.3 } = {}) {
  const t = new Float32Array(cols * rows);
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const far = Math.hypot(cx, cy) || 1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const down = rows > 1 ? y / (rows - 1) : 0;
      const along = from === 'center' ? Math.hypot(x - cx, y - cy) / far : from === 'bottom' ? 1 - down : down;
      t[y * cols + x] = along * (1 - spread) + (BAYER[(y % 4) * 4 + (x % 4)] / 16) * spread;
    }
  }
  return t;
}

const DURATION_MS = 700;

/**
 * Flips the screen to the other theme a block at a time, then calls `apply` (which switches the
 * real theme) in the same frame the overlay goes, so the last frame and the new theme match.
 * With reduced motion, or no canvas, it just calls `apply`.
 * @param {{apply: () => void, from?: 'top'|'bottom'|'center'}} opts
 */
export function ditherSwap({ apply, from = 'top' }) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext?.('2d');
  if (!ctx || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply();
    return;
  }
  const block = Math.max(4, Math.round(Math.min(innerWidth, innerHeight) / 64));
  const cols = Math.ceil(innerWidth / block);
  const rows = Math.ceil(innerHeight / block);
  canvas.width = cols;
  canvas.height = rows;
  canvas.className = 'dither-swap';
  canvas.style.width = `${cols * block}px`;
  canvas.style.height = `${rows * block}px`;
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);

  const order = ditherOrder(cols, rows, { from });
  const img = ctx.createImageData(cols, rows);
  const px = img.data;
  const start = performance.now();
  const frame = (now) => {
    const p = Math.min(1, (now - start) / DURATION_MS);
    // A white block in "difference" mode flips what's under it: paper to ink, ink to paper.
    for (let i = 0; i < order.length; i++) {
      const on = order[i] < p ? 255 : 0;
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = 255;
      px[i * 4 + 3] = on;
    }
    ctx.putImageData(img, 0, 0);
    if (p < 1) {
      requestAnimationFrame(frame);
    } else {
      apply();
      canvas.remove();
    }
  };
  requestAnimationFrame(frame);
}
