import test from 'node:test';
import assert from 'node:assert/strict';
import { ditherOrder, storedTheme, saveTheme } from '../js/theme.js';
import { safeStorage } from '../js/saved.js';
import { renderHeader } from '../js/render.js';

const row = (t, cols, y) => Array.from(t.slice(y * cols, (y + 1) * cols));

test('every block flips once, between the start and the end', () => {
  for (const from of ['top', 'bottom', 'center']) {
    const t = ditherOrder(40, 25, { from });
    assert.equal(t.length, 40 * 25);
    for (const v of t) assert.ok(v >= 0 && v < 1, `${from}: ${v}`);
  }
});
test('top down: the top row is all flipped before the bottom row starts', () => {
  const t = ditherOrder(40, 25, { from: 'top' });
  assert.ok(Math.max(...row(t, 40, 0)) < Math.min(...row(t, 40, 24)));
});
test('bottom up is the other way round', () => {
  const t = ditherOrder(40, 25, { from: 'bottom' });
  assert.ok(Math.max(...row(t, 40, 24)) < Math.min(...row(t, 40, 0)));
});
test('from the centre: the middle goes before the corners', () => {
  const t = ditherOrder(41, 25, { from: 'center' });
  assert.ok(t[12 * 41 + 20] < Math.min(t[0], t[40], t[24 * 41], t[24 * 41 + 40]));
});
test('the edge of the sweep is an ordered dither: neighbours in a row flip at different times', () => {
  const r = row(ditherOrder(40, 25, { from: 'top' }), 40, 10);
  assert.equal(new Set(r.slice(0, 4)).size, 4);
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
