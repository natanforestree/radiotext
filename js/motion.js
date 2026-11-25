// Motion: small movements that make the radio feel alive, in the one-bit look's own terms. Nothing
// you read or press shakes or slides. Things arrive the way a Teletext page comes in, a row at a
// time from the top; a new station's name types itself in; a window opens out of what you tapped,
// in dotted outlines like an old desktop's; lamps fill and empty through dither. Each is short,
// stepped rather than smooth, and skipped entirely with reduced motion.

const calm = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;

/**
 * When each of n rows appears, top to bottom: `step` ms apart, squeezed so the last one starts
 * by `most` ms, so a long list arrives as fast as a short one.
 * @param {number} n @param {number} [step] @param {number} [most]
 */
export function staggered(n, step = 16, most = 260) {
  const gap = n > 1 ? Math.min(step, most / (n - 1)) : 0;
  return Array.from({ length: n }, (_, i) => Math.round(i * gap));
}

/** How long text of n characters takes to type itself in, ms: quick, whatever its length. */
export const typingTime = (n) => Math.max(180, Math.min(620, n * 26));

/**
 * A rectangle part of the way (p, 0 to 1) from one to another.
 * @param {{left: number, top: number, width: number, height: number}} a @param {typeof a} b
 * @param {number} p
 */
export function between(a, b, p) {
  const at = (k) => a[k] + (b[k] - a[k]) * p;
  return { left: at('left'), top: at('top'), width: at('width'), height: at('height') };
}

/**
 * Rows coming in like a Teletext page: each appears whole, at once, the screen filling from the
 * top down (rows side by side, in windows next to each other, come in together). `byOrder` takes
 * them in the order given instead (the keypad's keys).
 * @param {Iterable<Element>} els @param {{byOrder?: boolean}} [opts]
 */
export function scanIn(els, { byOrder = false } = {}) {
  if (calm()) return;
  const rows = [...els].filter((el) => el instanceof HTMLElement && el.animate).map((el) => ({ el, box: el.getBoundingClientRect() }))
    .filter(({ box }) => box.height && box.bottom > 0 && box.top < innerHeight);
  if (!rows.length) return;
  let delays;
  if (byOrder) {
    delays = staggered(rows.length, 22, 200);
  } else {
    const top = Math.min(...rows.map((r) => r.box.top));
    const span = Math.max(1, Math.max(...rows.map((r) => r.box.top)) - top);
    const most = Math.min(300, 14 * rows.length);
    delays = rows.map((r) => Math.round(((r.box.top - top) / span) * most));
  }
  rows.forEach(({ el }, i) => {
    if (!delays[i]) return;
    el.animate([{ visibility: 'hidden' }, { visibility: 'visible' }], { duration: 1, delay: delays[i], fill: 'backwards' });
  });
}

/**
 * Text typing itself in, left to right a character at a time, behind a moving edge. The text is
 * all there from the start (only its picture is clipped), so nothing reads it out twice.
 * @param {Element|null|undefined} el
 */
export function typeIn(el) {
  if (calm() || !(el instanceof HTMLElement) || !el.animate) return;
  const n = Math.min(48, el.textContent.trim().length);
  const box = el.getBoundingClientRect();
  if (!n || !box.width) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  const text = range.getBoundingClientRect();
  const from = Math.max(box.left, text.left);
  const to = Math.min(box.right, text.right);
  if (to <= from) return;
  const edge = (x) => `inset(-4px ${Math.max(0, box.right - x)}px -4px -4px)`;
  el.animate([{ clipPath: edge(from) }, { clipPath: edge(to) }], { duration: typingTime(n), easing: `steps(${n}, end)` });
}

/** A class on for a moment (`ms`), for an animation in styles.css. @param {Element|null|undefined} el */
export function flash(el, cls, ms) {
  if (calm() || !el) return;
  el.classList.remove(cls);
  void (/** @type {HTMLElement} */ (el)).offsetWidth; // so the animation starts again
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

const ZOOM_MS = 260;
/**
 * A window opening out of what was tapped: dotted outlines spreading from one rectangle to the
 * other, the trailing ones a beat behind, over a quarter of a second. Drawn so it flips whatever
 * it crosses (like the light/dark switch), so it shows in both themes and over the colour.
 * @param {{left: number, top: number, width: number, height: number}|null} from
 * @param {{left: number, top: number, width: number, height: number}|null} to
 */
export function zoom(from, to) {
  if (calm() || !from || !to || !to.width) return;
  const c = document.createElement('canvas');
  const g = c.getContext?.('2d');
  if (!g) return;
  c.className = 'zoom';
  c.width = innerWidth;
  c.height = innerHeight;
  c.setAttribute('aria-hidden', 'true');
  document.body.append(c);
  g.fillStyle = '#fff';
  const dotted = ({ left, top, width, height }) => {
    const [x0, y0, x1, y1] = [Math.round(left), Math.round(top), Math.round(left + width) - 2, Math.round(top + height) - 2];
    for (let x = x0; x <= x1; x += 4) {
      g.fillRect(x, y0, 2, 2);
      g.fillRect(x, y1, 2, 2);
    }
    for (let y = y0 + 4; y < y1; y += 4) {
      g.fillRect(x0, y, 2, 2);
      g.fillRect(x1, y, 2, 2);
    }
  };
  const start = performance.now();
  const frame = (now) => {
    const p = Math.min(1, (now - start) / ZOOM_MS);
    g.clearRect(0, 0, c.width, c.height);
    for (let k = 0; k < 4; k++) {
      const q = p * 1.45 - k * 0.15;
      if (q > 0 && q < 1) dotted(between(from, to, 1 - (1 - q) ** 2));
    }
    if (p < 1) requestAnimationFrame(frame);
    else c.remove();
  };
  requestAnimationFrame(frame);
}
