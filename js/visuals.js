// Visuals that move with the music, on a wide screen, drawn each frame from the tap's readings
// while a readable station plays. Nothing you read or press moves: the music shows in the mast,
// in the windows' title bars, whose stripes become strings the music plays (they swing out of the
// bar and past the window's edge, behind the titles, which stay still), in the windows' frames, which
// swell and ripple outward around what they hold, and in a moiré trip behind the station in Now
// Playing. Black and white only, except that trip: the one thing on the page in colour. They come
// to life gradually when a station starts, like a valve set warming up, and when it stops (or a
// layer is switched off) they die away just as gradually, winding down like a record slowing,
// until everything is back exactly as it was.
import { createSignal, BANDS } from './signal.js';

const KEY = 'radiotext-visuals';
/** The layers, in the order page 500 lists them after the main switch. */
export const LAYERS = ['signal', 'bars', 'boxes', 'trip'];

/**
 * The switches, as kept on this device: all on by default, except with reduced motion.
 * @param {ReturnType<import('./saved.js').safeStorage>} store @param {boolean} reduceMotion
 * @returns {{on: boolean, signal: boolean, bars: boolean, boxes: boolean, trip: boolean}}
 */
export function visualSettings(store, reduceMotion = false) {
  const v = store.get(KEY) ?? {};
  const pick = (k, d) => (typeof v[k] === 'boolean' ? v[k] : d);
  return { on: pick('on', !reduceMotion), signal: pick('signal', true), bars: pick('bars', true), boxes: pick('boxes', true), trip: pick('trip', true) };
}

const TAU = 2 * Math.PI;

// The strings. Each is a row of points SPACING apart, pulled toward its neighbours (so waves
// travel along it at SPEED and bounce off its tied ends) and slowed by FRICTION. The music pushes
// every point with a slow wash of sines that drifts along the string (DRIVE at a full band), and
// a beat plucks one spot, upward (PLUCK at full strength). Tuned so quiet music sways a few
// pixels and a loud beat throws the top strings well out of the bar.
const ESCAPE = 56;    // px above the bar a string may swing into (see .tbar canvas.strings)
const SPACING = 10;   // px
const SPEED = 240;    // px/s
const FRICTION = 3;   // per second
const DRIVE = 200;    // px/s²
const PLUCK = 110;    // px/s
const STEP = 0.02;    // s: the longest step that stays steady at this spacing and speed
/** A loop has no tied ends, so this spring (per s²) pulls it back to rest: without it, beats
 *  plucking it outward would add up and it would keep growing. */
const SPRING = 30;
/** The furthest a window's frame swells, px. */
const MAX_SWELL = 36;

/** Seconds to come fully to life once the music is heard, and to die away once it stops. */
const WARM = 2.4;
const COOL = 3.2;
/**
 * A layer's life one frame on: rising toward 1 while `on`, falling toward 0 otherwise. 0 is at
 * rest (exactly as with no visuals), 1 moving fully with the music.
 * @param {number} life @param {boolean} on @param {number} dt
 */
export function stepLife(life, on, dt) {
  return on ? Math.min(1, life + dt / WARM) : Math.max(0, life - dt / COOL);
}
/** How much of the music a life lets through: slow to start, slow to settle. @param {number} l */
export const ease = (l) => l * l * (3 - 2 * l);
/**
 * A reading turned down to `amount` (0 to 1): every level toward silence, and beats only once
 * it's more than half alive.
 * @param {import('./signal.js').Signal} s @param {number} amount
 */
export function faded(s, amount) {
  if (amount >= 1) return s;
  const loud = amount > 0.5;
  return {
    ...s,
    level: s.level * amount,
    bass: s.bass * amount,
    mid: s.mid * amount,
    treble: s.treble * amount,
    bands: Array.from(s.bands, (b) => b * amount),
    beat: s.beat && loud,
    strength: s.strength * amount,
    sinceBeat: loud ? s.sinceBeat : 9,
  };
}
/** An 8×8 ordered dither: each cell's turn (0-63) to show as the trip comes and goes. */
const BAYER8 = Uint8Array.from({ length: 64 }, (_, i) => {
  const [x, y] = [i % 8, i >> 3];
  let v = 0;
  for (let b = 0; b < 3; b++) v = (v << 2) | ((((x >> b) & 1) ^ ((y >> b) & 1)) << 1) | ((y >> b) & 1);
  return v;
});

/**
 * One frame of a string: `y` (offsets from rest, px) and `v` (px/s), moved on by dt seconds.
 * `band` (0 to 1) is how hard the music drives it, `t` the time in seconds, `seed` its own
 * phase, and `pluck`, if given, a beat's {at, width, strength}: a positive strength throws it
 * toward negative y. An open string's ends stay tied; a `closed` one is a loop (a window's
 * frame), its last point joined to its first.
 * @param {Float32Array} y @param {Float32Array} v
 * @param {{dt: number, t: number, band: number, seed: number, spacing?: number, closed?: boolean,
 *   pluck?: {at: number, width: number, strength: number}|null}} f
 */
export function stepString(y, v, { dt, t, band, seed, spacing = SPACING, closed = false, pluck = null }) {
  const n = y.length;
  const first = closed ? 0 : 1;
  const end = closed ? n : n - 1;
  if (pluck) {
    for (let i = first; i < end; i++) {
      const far = closed ? Math.min(Math.abs(i - pluck.at), n - Math.abs(i - pluck.at)) : i - pluck.at;
      v[i] -= PLUCK * pluck.strength * Math.exp(-((far / pluck.width) ** 2));
    }
  }
  // Around a loop each wash must fit a whole number of times, or it would jump at the join.
  const fit = (k) => (closed ? (TAU * Math.max(1, Math.round((n * k) / TAU))) / n : k);
  const [k1, k2, k3] = [fit(0.21), fit(0.53), fit(1.37)];
  const pull = (SPEED * SPEED) / (spacing * spacing);
  const steps = Math.max(1, Math.ceil(dt / STEP));
  const h = dt / steps;
  for (let s = 0; s < steps; s++) {
    const at = t + s * h;
    for (let i = first; i < end; i++) {
      const push = DRIVE * band * (Math.sin(i * k1 + at * 1.7 + seed) + 0.6 * Math.sin(i * k2 - at * 2.9 + seed * 2) + 0.3 * Math.sin(i * k3 + at * 4.1 + seed));
      v[i] += (pull * (y[(i - 1 + n) % n] - 2 * y[i] + y[(i + 1) % n]) - (closed ? SPRING * y[i] : 0) - FRICTION * v[i] + push) * h;
    }
    for (let i = first; i < end; i++) y[i] += v[i] * h;
  }
  if (!closed) {
    y[0] = 0;
    y[n - 1] = 0;
  }
}

/**
 * @param {{store: ReturnType<import('./saved.js').safeStorage>,
 *   tap: ReturnType<import('./listen.js').createTap>, allowed: () => boolean}} deps
 *   allowed: a wide, visible page with a station playing
 */
export function createVisuals({ store, tap, allowed }) {
  const root = document.documentElement;
  const settings = visualSettings(store, matchMedia('(prefers-reduced-motion: reduce)').matches);
  /** @type {ReturnType<typeof createSignal>|null} */
  let read = null;
  let raf = 0;
  let last = 0;
  let resting = true;
  let said = '';

  const say = (text) => {
    const el = document.getElementById('vizstatus');
    if (el && (el.textContent !== text || said !== text)) el.textContent = text;
    said = text;
  };

  // ---- Mast: two pairs of arcs for the level, the light blinking on the beat ----
  const mast = () => document.querySelector('#hdr .mast');
  function drawMast(s, life) {
    const m = mast();
    if (!m) return;
    const lit = 1 - life * (1 - s.level); // at rest every arc shows; the music takes over as it wakes
    const level = lit > 0.8 ? '2' : lit > 0.45 ? '1' : '0';
    if (m.getAttribute('data-level') !== level) m.setAttribute('data-level', level);
    if (s.sinceBeat < 0.09) m.setAttribute('data-beat', '');
    else m.removeAttribute('data-beat');
  }
  const restMast = () => {
    mast()?.removeAttribute('data-level');
    mast()?.removeAttribute('data-beat');
  };

  // ---- Title bars: each stripe a string (bass the bottom one, treble the top), drawn on a canvas
  // that reaches ESCAPE px above the bar, so a big swing leaves the bar and the window. The title
  // stays still on top of them. ----
  /** Each window's strings, kept by its title, so a page drawn again doesn't flatten them.
   *  @type {Map<string, {n: number, ys: Float32Array[], vs: Float32Array[], seeds: number[]}>} */
  const strings = new Map();
  const titleOf = (el) => el.querySelector('.tbar > span')?.textContent ?? '';
  function stringsOf(bar, count, n) {
    const key = titleOf(bar.parentElement);
    let st = strings.get(key);
    if (!st || st.n !== n || st.ys.length !== count) {
      if (strings.size > 40) strings.clear();
      st = {
        n,
        ys: Array.from({ length: count }, () => new Float32Array(n)),
        vs: Array.from({ length: count }, () => new Float32Array(n)),
        seeds: Array.from({ length: count }, () => Math.random() * TAU),
      };
      strings.set(key, st);
    }
    return st;
  }
  function drawBars(s, ink, dt, now, amount) {
    root.classList.add('viz-bars');
    const t = now / 1000;
    for (const bar of document.querySelectorAll('.tbar')) {
      if (!bar.offsetParent) continue;
      const w = bar.clientWidth;
      const h = bar.clientHeight;
      const count = Math.floor((h + 2) / 4); // the bar's stripes: 2px, 4px apart, from the top
      const st = stringsOf(bar, count, Math.max(3, Math.round(w / SPACING) + 1));
      const dx = w / (st.n - 1);
      const g = canvasIn(bar, w, h + ESCAPE);
      g.fillStyle = ink;
      for (let k = 0; k < count; k++) {
        const band = s.bands[Math.round(((count - 1 - k) / Math.max(1, count - 1)) * (BANDS - 1))];
        const pluck = s.beat
          ? { at: 1 + Math.random() * (st.n - 2), width: 2 + Math.random() * 4, strength: (0.4 + 0.6 * s.strength) * (0.5 + band) }
          : null;
        stepString(st.ys[k], st.vs[k], { dt, t, band, seed: st.seeds[k], spacing: dx, pluck });
        const y = st.ys[k];
        const base = ESCAPE + k * 4;
        let prev = null;
        for (let x = 0; x < w; x += 2) {
          const f = x / dx;
          const i = Math.min(st.n - 2, Math.floor(f));
          const py = Math.round(base + (y[i] + (y[i + 1] - y[i]) * (f - i)) * amount);
          const top = prev === null ? py : Math.min(prev, py);
          g.fillRect(x, top, 2, (prev === null ? 0 : Math.abs(prev - py)) + 2);
          prev = py;
        }
      }
    }
  }
  function canvasIn(bar, w, h) {
    let c = bar.querySelector(':scope > canvas.strings');
    if (!c) {
      c = document.createElement('canvas');
      c.className = 'strings';
      c.setAttribute('aria-hidden', 'true');
      bar.prepend(c);
    }
    const dpr = devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    return g;
  }
  const restBars = () => {
    root.classList.remove('viz-bars');
    for (const c of document.querySelectorAll('.tbar canvas.strings')) c.remove();
    strings.clear();
  };

  // ---- Windows: each frame is a loop the music plays (closed strings, BOX_SPACING apart), swelling
  // outward with the bass and plucked outward on a beat; it never dents in, so what's inside sits on
  // clean paper. The frames, their fill and their hard shadows are drawn on a canvas under the
  // windows (whose own border, fill and shadow are hidden meanwhile), over the dotted desktop: a
  // swell that reaches a neighbour slides under it. Crisp: every edge is drawn in whole pixels. ----
  const BOX_SPACING = 12;
  /** @type {Map<string, {n: number, y: Float32Array, v: Float32Array, seed: number}>} */
  const frames = new Map();
  function boxCanvas(screen, page, w, h) {
    let c = screen.querySelector(':scope > canvas.boxes');
    if (!c) {
      c = document.createElement('canvas');
      c.className = 'boxes';
      c.setAttribute('aria-hidden', 'true');
      screen.prepend(c);
    }
    const dpr = devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }
    c.style.top = `${page.offsetTop}px`;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    return g;
  }
  /** A window's shape: its rectangle, and how far out its frame is at each point around it
   *  (`out(p)`, p measured clockwise from the top-left corner). */
  function shapeOf(win, pg, s, dt, t, amount) {
    const r = win.getBoundingClientRect();
    const x0 = Math.round(r.left - pg.left);
    const y0 = Math.round(r.top - pg.top);
    const W = Math.round(r.width);
    const H = Math.round(r.height);
    const P = 2 * (W + H);
    const n = Math.max(8, Math.round(P / BOX_SPACING));
    const key = titleOf(win);
    let f = frames.get(key);
    if (!f || f.n !== n) {
      if (frames.size > 40) frames.clear();
      f = { n, y: new Float32Array(n), v: new Float32Array(n), seed: Math.random() * TAU };
      frames.set(key, f);
    }
    const pluck = s.beat ? { at: Math.random() * n, width: 2 + Math.random() * 5, strength: -(0.5 + 0.9 * s.strength) } : null;
    stepString(f.y, f.v, { dt, t, band: (s.bass + s.mid) / 2, seed: f.seed, spacing: P / n, closed: true, pluck });
    const swell = 1 + 9 * s.bass;
    const out = (p) => {
      const q = ((((p % P) + P) % P) / P) * n;
      const i = Math.floor(q) % n;
      const y = f.y[i] + (f.y[(i + 1) % n] - f.y[i]) * (q - Math.floor(q));
      return Math.max(0, Math.min(MAX_SWELL, Math.round((swell + y) * amount)));
    };
    return { x0, y0, x1: x0 + W, y1: y0 + H, W, H, out };
  }
  /** The shape filled, shifted by `by` px (for the hard shadow). */
  function fillShape(g, { x0, y0, x1, y1, W, H, out }, by) {
    g.fillRect(x0 + by, y0 + by, W, H);
    for (let x = 0; x < W; x += 3) {
      const top = out(x);
      const bottom = out(2 * W + H - x);
      if (top) g.fillRect(x0 + x + by, y0 - top + by, 3, top);
      if (bottom) g.fillRect(x0 + x + by, y1 + by, 3, bottom);
    }
    for (let y = 0; y < H; y += 3) {
      const right = out(W + y);
      const left = out(2 * W + 2 * H - y);
      if (right) g.fillRect(x1 + by, y0 + y + by, right, 3);
      if (left) g.fillRect(x0 - left + by, y0 + y + by, left, 3);
    }
    const [tl, tr, br, bl] = [out(0), out(W), out(W + H), out(2 * W + H)];
    g.fillRect(x0 - tl + by, y0 - tl + by, tl, tl);
    g.fillRect(x1 + by, y0 - tr + by, tr, tr);
    g.fillRect(x1 + by, y1 + by, br, br);
    g.fillRect(x0 - bl + by, y1 + by, bl, bl);
  }
  /** The frame's 2px line, where the shape's edge is now, joined up where it jumps. */
  function outlineShape(g, { x0, y0, x1, y1, W, H, out }) {
    const line = (count, at, horizontal) => {
      let prev = null;
      for (let k = 0; k <= count; k += 2) {
        const [a, b] = at(Math.min(k, count));
        if (horizontal) g.fillRect(a, prev === null ? b : Math.min(prev, b), 2, (prev === null ? 0 : Math.abs(prev - b)) + 2);
        else g.fillRect(prev === null ? a : Math.min(prev, a), b, (prev === null ? 0 : Math.abs(prev - a)) + 2, 2);
        prev = horizontal ? b : a;
      }
    };
    const [tl, tr, br, bl] = [out(0), out(W), out(W + H), out(2 * W + H)];
    line(W + tl + tr - 2, (k) => { const x = k - tl; return [x0 + x, y0 - out(Math.max(0, Math.min(W, x)))]; }, true);
    line(H + tr + br - 2, (k) => { const y = k - tr; return [x1 - 2 + out(W + Math.max(0, Math.min(H, y))), y0 + y]; }, false);
    line(W + br + bl - 2, (k) => { const x = W - k + br - 2; return [x0 + x, y1 - 2 + out(2 * W + H - Math.max(0, Math.min(W, x)))]; }, true);
    line(H + bl + tl - 2, (k) => { const y = H - k + bl - 2; return [x0 - out(2 * W + 2 * H - Math.max(0, Math.min(H, y))), y0 + y]; }, false);
  }
  function drawBoxes(s, ink, paper, dt, now, amount) {
    const screen = document.getElementById('screen');
    const page = document.getElementById('page');
    if (!screen || !page) return;
    root.classList.add('viz-boxes');
    const pg = page.getBoundingClientRect();
    const g = boxCanvas(screen, page, Math.round(pg.width), Math.round(pg.height));
    const shapes = [...page.querySelectorAll('.win')].filter((w) => w.offsetParent).map((w) => shapeOf(w, pg, s, dt, now / 1000, amount));
    g.fillStyle = ink;
    for (const sh of shapes) fillShape(g, sh, 4);
    g.fillStyle = paper;
    for (const sh of shapes) fillShape(g, sh, 0);
    g.fillStyle = ink;
    for (const sh of shapes) outlineShape(g, sh);
    // Every window's inside stays clean paper, whatever swelled under it.
    g.fillStyle = paper;
    for (const sh of shapes) g.fillRect(sh.x0 + 2, sh.y0 + 2, sh.W - 4, sh.H - 4);
  }
  const restBoxes = () => {
    root.classList.remove('viz-boxes');
    document.querySelector('#screen > canvas.boxes')?.remove();
    frames.clear();
  };

  // ---- Now Playing: a moiré trip behind the station, the only colour on the page. Two sets of
  // rings spread from centres that drift and orbit, bent by a slow wave; a pixel is coloured where
  // one set's band and the other's disagree, so together they swirl into moving cells; the gaps are
  // the page's own paper, so they flip with light and dark. Each cell's colour comes from which rings
  // it lies between, so bands of colour run through the swirl, and the whole palette turns: faster
  // when the music is louder, with a jump on each beat. The bass
  // tightens the rings, the level speeds the drift and deepens the bend, the treble ripples it, a
  // beat kicks one set out half a ring and a big one flips the lot for an instant. Drawn in 2px
  // blocks on a canvas laid over the window, above even the light/dark switch (which flips the
  // pixels under it: its colours must not flip with them), with holes where the words are, which
  // sit on paper so they still read (.viz-trip in styles.css). It comes and goes through an
  // ordered dither, a few more blocks at a time, slowing to a stop as it fades. ----
  const TRIP_BLOCK = 2;
  /** The palette, in order round the wheel: marigold, cream, blush, sage and coral. */
  const PALETTE = ['#f6bd60', '#f7ede2', '#f5cac3', '#84a59d', '#f28482'];
  /** The palette blended smoothly from each colour to the next, round to the first again, in 360
   *  steps (RGB triples), so the colours flow into each other as the palette turns. */
  const HUES = (() => {
    const inks = PALETTE.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
    const lut = new Uint8Array(360 * 3);
    for (let h = 0; h < 360; h++) {
      const f = (h / 360) * inks.length;
      const i = Math.floor(f);
      const [from, to] = [inks[i], inks[(i + 1) % inks.length]];
      for (let k = 0; k < 3; k++) lut[h * 3 + k] = Math.round(from[k] + (to[k] - from[k]) * (f - i));
    }
    return lut;
  })();
  let tripTime = 0;
  let kick = 0;
  let turn = 0;
  /** @type {ImageData|null} */
  let tripImg = null;
  function drawTrip(s, dt, amount) {
    const body = document.querySelector('.rail .win.air .onair');
    if (!body?.offsetParent) return;
    root.classList.add('viz-trip');
    const box = body.getBoundingClientRect();
    const cols = Math.ceil(box.width / TRIP_BLOCK);
    const rows = Math.ceil(box.height / TRIP_BLOCK);
    let c = document.querySelector('body > canvas.trip');
    if (!c) {
      c = document.createElement('canvas');
      c.className = 'trip';
      c.setAttribute('aria-hidden', 'true');
      document.body.append(c);
    }
    const g = c.getContext('2d');
    if (c.width !== cols || c.height !== rows || !tripImg) {
      c.width = cols;
      c.height = rows;
      tripImg = g.createImageData(cols, rows);
    }
    c.style.left = `${Math.round(box.left)}px`;
    c.style.top = `${Math.round(box.top)}px`;
    c.style.width = `${cols * TRIP_BLOCK}px`;
    c.style.height = `${rows * TRIP_BLOCK}px`;
    // The words, the lamp and the star, in blocks: left clear, so they show through.
    const holes = [...body.querySelectorAll('.lamp, .air-name, .air-meta, .air-song:not(:empty), .star')].map((el) => {
      const r = el.getBoundingClientRect();
      return [Math.floor((r.left - box.left) / TRIP_BLOCK), Math.floor((r.top - box.top) / TRIP_BLOCK),
        Math.ceil((r.right - box.left) / TRIP_BLOCK), Math.ceil((r.bottom - box.top) / TRIP_BLOCK)];
    });
    tripTime += dt * (0.5 + 2.4 * s.level) * amount;
    turn += dt * (25 + 140 * s.level) * amount;
    if (s.beat) {
      kick = (kick + 0.5) % 1;
      turn += 30 + 90 * s.strength;
    }
    turn %= 360;
    const t = tripTime;
    const flip = s.sinceBeat < 0.07 && s.strength > 0.6 ? 1 : 0;
    const ring = 15 - 6 * s.bass;                    // blocks per band
    const bend = 2 + 7 * s.level;                    // blocks
    const ripple = 1.2 * s.treble;
    const ax = cols * (0.5 + 0.38 * Math.sin(t * 0.71));
    const ay = rows * (0.5 + 0.42 * Math.sin(t * 0.93 + 1));
    const bx = cols * (0.5 + 0.38 * Math.sin(t * 0.53 + 2.2));
    const by = rows * (0.5 + 0.42 * Math.cos(t * 0.61));
    const px = tripImg.data;
    const cut = amount * 64;
    for (let y = 0; y < rows; y++) {
      const wy = Math.sin(y * 0.13 + t * 1.3);
      for (let x = 0; x < cols; x++) {
        const w = bend * (wy + Math.sin(x * 0.07 - t * 0.9)) + ripple * Math.sin(x * 0.9 + y * 0.7 + t * 6);
        const a = Math.floor(Math.hypot(x - ax, y - ay) / ring + w / ring + kick);
        const b = Math.floor((Math.hypot(x - bx, y - by) - w) / ring);
        let on = BAYER8[(y & 7) * 8 + (x & 7)] < cut ? ((a + b) & 1) ^ flip : 0;
        if (on) for (const [x0, y0, x1, y1] of holes) if (x >= x0 && x < x1 && y >= y0 && y < y1) on = 0;
        const o = (y * cols + x) * 4;
        const h = ((((a + 2 * b) * 36 + turn) % 360) + 360) % 360 | 0;
        px[o] = HUES[h * 3];
        px[o + 1] = HUES[h * 3 + 1];
        px[o + 2] = HUES[h * 3 + 2];
        px[o + 3] = on ? 255 : 0;
      }
    }
    g.putImageData(tripImg, 0, 0);
  }
  const restTrip = () => {
    root.classList.remove('viz-trip');
    document.querySelector('body > canvas.trip')?.remove();
    tripImg = null;
  };

  // ---- The lab on page 500: every reading, as black-and-white meters ----
  function drawLab(s, ink) {
    const c = document.querySelector('canvas.lab');
    if (!c) return;
    const g = c.getContext('2d');
    const W = c.width;
    g.clearRect(0, 0, W, c.height);
    g.fillStyle = ink;
    const bw = W / BANDS;
    for (let b = 0; b < BANDS; b++) {
      const bh = Math.round(s.bands[b] * 80);
      g.fillRect(Math.round(b * bw), 80 - bh, Math.round(bw) - 2, bh);
    }
    for (let x = 0; x < W; x++) {
      const v = s.wave[Math.floor((x / W) * s.wave.length)] ?? 128;
      g.fillRect(x, 104 + Math.round(((v - 128) / 128) * 16), 1, 1);
    }
    const rows = [s.level, s.bass, s.mid, s.treble, s.brightness, s.noisiness, s.sinceBeat < 0.12 ? 1 : 0];
    rows.forEach((v, i) => g.fillRect(0, 128 + i * 8, Math.round(v * W), 6));
  }
  const restLab = () => {
    const c = document.querySelector('canvas.lab');
    c?.getContext('2d').clearRect(0, 0, c.width, c.height);
  };

  function rest() {
    if (resting) return;
    restMast();
    restBars();
    restBoxes();
    restTrip();
    restLab();
    resting = true;
  }

  /** How alive each part is (see stepLife): each comes and goes on its own, so switching one
   *  layer off on page 500 fades just that one. */
  const lives = { signal: 0, bars: 0, boxes: 0, trip: 0, lab: 0 };
  const alive = () => Object.values(lives).some((l) => l > 0);
  /** Set by update(): the visuals are on and a station plays on a wide, visible page. */
  let want = false;
  /** The last live reading: what everything fades from once the sound has gone. */
  /** @type {import('./signal.js').Signal|null} */
  let held = null;
  const idle = () => (settings.on ? 'Play a station to see its signal.' : 'Visuals are off.');

  // Runs while there's music to read, and on after it stops until everything has died away.
  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    const data = want ? tap.read() : null;
    let live = false;
    if (data) {
      read ??= createSignal({ binCount: tap.binCount, sampleRate: tap.sampleRate });
      const s = read(data.freq, data.wave, dt);
      if (s.live) {
        held = s;
        live = true;
      }
    }
    if (!live && held && (held.beat || held.sinceBeat < 9)) held = { ...held, beat: false, sinceBeat: 9 };
    say(!want ? idle()
      : !data ? 'This station doesn’t let its sound be read, so the visuals rest. Most stations do.'
        : live ? 'Live: reading the station as it plays.' : 'Waiting for sound…');
    for (const k of Object.keys(lives)) lives[k] = stepLife(lives[k], live && (k === 'lab' || settings[k]), dt);
    if (held && alive()) paint(held, dt, now);
    else rest();
    if (want || alive()) {
      raf = requestAnimationFrame(frame);
    } else {
      last = 0;
      tap.sleep();
    }
  }

  function paint(s, dt, now) {
    resting = false;
    const style = getComputedStyle(root);
    const ink = style.getPropertyValue('--ink').trim() || '#000';
    const paper = style.getPropertyValue('--paper').trim() || '#fff';
    const part = (k) => ease(lives[k]);
    if (lives.signal > 0) drawMast(faded(s, part('signal')), part('signal'));
    else restMast();
    if (lives.boxes > 0) drawBoxes(faded(s, part('boxes')), ink, paper, dt, now, part('boxes'));
    else restBoxes();
    if (lives.bars > 0) drawBars(faded(s, part('bars')), ink, dt, now, part('bars'));
    else restBars();
    if (lives.trip > 0) drawTrip(faded(s, part('trip')), dt, part('trip'));
    else restTrip();
    if (lives.lab > 0) drawLab(faded(s, part('lab')), ink);
    else restLab();
  }

  function update() {
    want = settings.on && tap.supported && allowed();
    if ((want || alive()) && !raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    } else if (!want && !raf) {
      say(idle());
    }
  }

  return {
    settings,
    /** Draws the last frame again straight away, without moving anything on: for the moment the
     *  theme changes, so nothing shows the old colours for a frame. */
    repaint() {
      if (held && alive()) paint({ ...held, beat: false }, 0, performance.now());
    },
    /** @param {'on'|'signal'|'bars'|'boxes'|'trip'} k */
    toggle(k) {
      if (!(k in settings)) return;
      settings[k] = !settings[k];
      store.set(KEY, { ...settings });
      update();
    },
    update,
  };
}
