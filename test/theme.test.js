import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRipple, bandAt, swingAt, storedTheme, saveTheme } from '../js/theme.js';
import { safeStorage } from '../js/saved.js';
import { renderHeader } from '../js/render.js';

const count = (a) => a.reduce((n, v) => n + v, 0);
const at = (f, cols, x, y) => f[y * cols + x];

test('the rings start with nothing flipped and end with everything flipped', () => {
  for (const origin of [{ cx: 59, cy: 0 }, { cx: 0, cy: 0 }, { cx: 30, cy: 15 }]) {
    const ripple = makeRipple(60, 30, origin);
    assert.equal(count(ripple.frame(0)), 0, JSON.stringify(origin));
    assert.equal(count(ripple.frame(1)), 60 * 30, JSON.stringify(origin));
  }
});
test('they spread out from where they start', () => {
  const ripple = makeRipple(60, 30, { cx: 59, cy: 0 });
  assert.equal(at(ripple.frame(0.2), 60, 0, 29), 0, 'the far corner is untouched early on');
  assert.equal(at(ripple.frame(0.6), 60, 59, 0), 1, 'where they start has settled');
});
test('they are layered: out along a line from the start, the screen changes over and back several times', () => {
  const f = makeRipple(120, 60, { cx: 119, cy: 0 }).frame(0.35);
  const line = Array.from({ length: 119 }, (_, i) => at(f, 120, 119 - i, Math.round(i / 2)));
  let changes = 0;
  for (let i = 1; i < line.length; i++) if (line[i] !== line[i - 1]) changes++;
  assert.ok(changes >= 4, `${changes} changes`);
});
test('they are not perfect circles: the edges wander, so one distance out is not all one state', () => {
  const f = makeRipple(121, 121, { cx: 60, cy: 60 }).frame(0.3);
  const ring = Array.from({ length: 72 }, (_, k) => {
    const a = (k / 72) * 2 * Math.PI;
    return at(f, 121, Math.round(60 + 30 * Math.cos(a)), Math.round(60 + 30 * Math.sin(a)));
  });
  assert.ok(ring.includes(0) && ring.includes(1));
});
test('the bands start wide and end as thin lines of the old theme, then settle on the new', () => {
  assert.equal(bandAt(0), 0);
  assert.equal(bandAt(1), 1);
  const bands = Array.from({ length: 2000 }, (_, i) => bandAt(i / 2000));
  const runs = [];
  for (const b of bands) if (runs.length && runs.at(-1).b === b) runs.at(-1).n++; else runs.push({ b, n: 1 });
  const old = runs.slice(1).filter((x) => x.b === 0).map((x) => x.n);
  assert.ok(old.length >= 3, `${old.length} old-theme bands after the first ring`);
  assert.ok(old[0] > old.at(-1) * 1.5, `old-theme bands narrow: ${old.join(', ')}`);
});
test('what the waves push moves out first, sways with the rings, dies away, and ends still', () => {
  assert.equal(swingAt(0), 0);
  assert.equal(swingAt(1), 0);
  assert.equal(swingAt(-0.2), 0);
  assert.ok(swingAt(0.03) > 0, 'out first');
  const s = Array.from({ length: 999 }, (_, i) => swingAt((i + 1) / 1000));
  let turns = 0;
  for (let i = 1; i < s.length; i++) if (Math.sign(s[i]) !== Math.sign(s[i - 1])) turns++;
  assert.ok(turns >= 4, `${turns} turns`);
  const early = Math.max(...s.slice(0, 300).map(Math.abs));
  const late = Math.max(...s.slice(800).map(Math.abs));
  assert.ok(late < early / 2, `dies away: ${early.toFixed(2)} then ${late.toFixed(2)}`);
});
test('a pushed thing and the pixels under it go by the same wave', () => {
  const ripple = makeRipple(80, 50, { cx: 79, cy: 0 });
  for (const p of [0.2, 0.4, 0.6]) {
    const f = ripple.frame(p);
    for (const [x, y] of [[10, 10], [40, 25], [70, 45], [5, 49]]) assert.equal(bandAt(ripple.at(p, x, y)), f[y * 80 + x], `p=${p} at ${x},${y}`);
  }
});
test('the theme is light until dark is chosen, and the choice is kept', () => {
  const mem = new Map();
  const store = safeStorage({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) });
  assert.equal(storedTheme(store), 'light');
  saveTheme(store, 'dark');
  assert.equal(storedTheme(store), 'dark');
  assert.equal(JSON.parse(mem.get('radiotext-theme')), 'dark'); // what index.html reads before the first paint
  saveTheme(store, 'light');
  assert.equal(storedTheme(store), 'light');
});
test('the top bar ends with the dark mode key: a moon while light, a sun while dark', () => {
  const light = renderHeader(100, new Date(), { dark: false });
  const dark = renderHeader(100, new Date(), { dark: true });
  assert.match(light, /<button class="tm" data-theme-toggle aria-label="Dark mode" aria-pressed="false"><svg[^]*<\/svg><\/button>$/);
  assert.ok(dark.includes('aria-pressed="true"'));
  assert.notEqual(light.slice(light.indexOf('data-theme-toggle')), dark.slice(dark.indexOf('data-theme-toggle')));
});
