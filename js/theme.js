// Light or dark: a choice kept on each device, switched with the moon/sun key in the top bar.
// Dark is light with every pixel flipped (the page only ever uses two colours), so the switch is
// drawn by flipping the screen a block at a time: rings spread out from the key like sound waves,
// the screen swinging between light and dark as each passes, wide rings first and then thin ones,
// until it settles on the new theme. Each ring's edge wanders on slow sines of its own, drifting
// as it goes, so no two rings are the same shape. Like sound, the waves push what they pass:
// rows, keys and titles sway out and back in time with the rings that are turning them over.

const KEY = 'radiotext-theme';

/** @param {ReturnType<import('./saved.js').safeStorage>} store */
export const storedTheme = (store) => (store.get(KEY) === 'dark' ? 'dark' : 'light');
/** @param {ReturnType<import('./saved.js').safeStorage>} store @param {'light'|'dark'} theme */
export const saveTheme = (store, theme) => store.set(KEY, theme);

/** How many times a spot swings over to the new theme and back before it settles. */
const RINGS = 4;
/** How much tighter the last rings are than the first. */
const CHIRP = 1.2;
/** The wave train's depth, as a share of the distance to the furthest corner. */
const TRAIN = 0.5;
/** How far the rings' edges wander, as a share of the train. */
const WOBBLE = 0.05;
/** The wander: sines around each ring (wavelength in blocks), each drifting over the switch
 *  (cycles) and shifting from one ring to the next (shift, per block out). */
const WOBBLES = [
  { amp: 0.55, len: 34, cycles: 1.3, shift: 0.11, phase: 1.7 },
  { amp: 0.3, len: 19, cycles: -2.1, shift: 0.07, phase: -0.8 },
  { amp: 0.15, len: 11, cycles: 3.4, shift: -0.05, phase: 2.9 },
];

/**
 * The rings without their wander: 0 (the old theme) or 1 (the new) for a spot the wave train
 * is `u` of the way past. 0 before it and 1 after; in between, bands that start half and half
 * and end as thin lines of the old theme, a little unevenly spaced.
 * @param {number} u
 */
export function bandAt(u) {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return Math.cos(phaseAt(u)) < u ** 1.5 ? 1 : 0;
}

/** Where a spot is in the wave train's swings, a little unevenly spaced and tightening. */
function phaseAt(u) {
  const g = (u * (1 + CHIRP * u)) / (1 + CHIRP) + 0.025 * Math.sin(3 * Math.PI * u);
  return 2 * Math.PI * (RINGS + 0.5) * g;
}

/**
 * How far a sound wave pushes something it passes, from -1 to 1: out as the first ring reaches
 * it, then back and forth in time with the rings, dying away as they thin. 0 before and after.
 * @param {number} u
 */
export function swingAt(u) {
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(phaseAt(u)) * (1 - u) ** 0.8;
}

/**
 * Rings spreading over a cols × rows grid of blocks from block (cx, cy). `frame(p)` is the
 * screen at progress p (0 to 1): nothing flipped at 0, everything at 1. `at(p, x, y)` is how
 * far the wave train is past any point (in blocks), for `bandAt` and `swingAt`. The rings slow
 * as they spread.
 * @param {number} cols @param {number} rows @param {{cx?: number, cy?: number}} [origin]
 */
export function makeRipple(cols, rows, { cx = 0, cy = 0 } = {}) {
  const far = Math.max(Math.hypot(cx, cy), Math.hypot(cols - 1 - cx, cy),
    Math.hypot(cx, rows - 1 - cy), Math.hypot(cols - 1 - cx, rows - 1 - cy)) || 1;
  const train = TRAIN * far;
  const travel = far + train * (1 + 2 * WOBBLE);
  const frontAt = (p) => (1 - (1 - p) ** 1.6) * travel;
  // Distance around a ring. Angles are measured from the direction of the middle of the
  // screen, so the seam where they wrap points off it.
  const toMiddle = Math.atan2((rows - 1) / 2 - cy, (cols - 1) / 2 - cx);
  const aroundAt = (x, y, r) => {
    let a = Math.atan2(y - cy, x - cx) - toMiddle;
    if (a > Math.PI) a -= 2 * Math.PI;
    if (a < -Math.PI) a += 2 * Math.PI;
    return a * r;
  };
  const past = (front, p, r, around) => {
    let w = 0;
    for (const o of WOBBLES) {
      w += o.amp * Math.sin((2 * Math.PI * around) / o.len + 2 * Math.PI * o.cycles * p + o.shift * r + o.phase);
    }
    return (front - r) / train - WOBBLE + WOBBLE * w;
  };
  const r = new Float32Array(cols * rows);
  const around = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      r[i] = Math.hypot(x - cx, y - cy);
      around[i] = aroundAt(x, y, r[i]);
    }
  }
  return {
    frame(p) {
      const front = frontAt(p);
      const out = new Uint8Array(cols * rows);
      for (let i = 0; i < out.length; i++) out[i] = bandAt(past(front, p, r[i], around[i]));
      return out;
    },
    at(p, x, y) {
      const d = Math.hypot(x - cx, y - cy);
      return past(frontAt(p), p, d, aroundAt(x, y, d));
    },
  };
}

const DURATION_MS = 2100;
/** What the waves push as they pass: the things you'd see move, small enough to sway whole. */
const PUSHED = '#hdr > *, .tbar, .row, .star, .fk, .onair > *, .status, .thead, .sub > *, .msg, .find > *, .diag-keys > *, .diag li, .pk, .pad-show';

/**
 * Flips the screen to the other theme a block at a time, rings spreading from `origin` (a point
 * on the screen, in CSS pixels), then calls `apply` (which switches the real theme) in the same
 * frame the overlay goes, so the last frame and the new theme match. With reduced motion, or no
 * canvas, it just calls `apply`.
 * @param {{apply: () => void, origin?: {x: number, y: number}}} opts
 */
export function ditherSwap({ apply, origin = { x: 0, y: 0 } }) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext?.('2d');
  if (!ctx || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply();
    return;
  }
  const block = Math.max(3, Math.round(Math.min(innerWidth, innerHeight) / 110));
  const cols = Math.ceil(innerWidth / block);
  const rows = Math.ceil(innerHeight / block);
  canvas.width = cols;
  canvas.height = rows;
  canvas.className = 'dither-swap';
  canvas.style.width = `${cols * block}px`;
  canvas.style.height = `${rows * block}px`;
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);

  const ripple = makeRipple(cols, rows, { cx: origin.x / block, cy: origin.y / block });
  // Everything the waves push, with its middle (in blocks) and the way out from the key.
  const push = Math.min(6, Math.max(3, innerWidth / 400));
  const movers = [...document.querySelectorAll(PUSHED)].flatMap((el) => {
    const b = el.getBoundingClientRect();
    if (!b.width || b.bottom < 0 || b.top > innerHeight) return [];
    const dx = b.left + b.width / 2 - origin.x;
    const dy = b.top + b.height / 2 - origin.y;
    const len = Math.hypot(dx, dy) || 1;
    return [{ el, x: (origin.x + dx) / block, y: (origin.y + dy) / block, ux: dx / len, uy: dy / len }];
  });
  const img = ctx.createImageData(cols, rows);
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = 255;
  const start = performance.now();
  const frame = (now) => {
    const p = Math.min(1, (now - start) / DURATION_MS);
    // A white block in "difference" mode flips what's under it: paper to ink, ink to paper.
    const on = ripple.frame(p);
    for (let i = 0; i < on.length; i++) px[i * 4 + 3] = on[i] ? 255 : 0;
    ctx.putImageData(img, 0, 0);
    // The push moves in whole pixels, so text stays sharp while it sways.
    for (const m of movers) {
      const s = swingAt(ripple.at(p, m.x, m.y)) * push;
      const x = Math.round(m.ux * s);
      const y = Math.round(m.uy * s);
      m.el.style.translate = x || y ? `${x}px ${y}px` : '';
    }
    if (p < 1) {
      requestAnimationFrame(frame);
    } else {
      for (const m of movers) m.el.style.translate = '';
      apply();
      canvas.remove();
    }
  };
  requestAnimationFrame(frame);
}
