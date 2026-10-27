import test from 'node:test';
import assert from 'node:assert/strict';
import { mosaicSvg, ANTENNA, MOSAIC_COLORS } from '../js/mosaic.js';

test('one rect per run, transparent dots, exact viewBox', () => {
  const svg = mosaicSvg(['RR.', '.BB'], { R: 'var(--red)', B: 'var(--blue)' });
  assert.ok(svg.includes('viewBox="0 0 3 2"') && svg.includes('shape-rendering="crispEdges"'));
  assert.equal((svg.match(/<rect/g) || []).length, 2);
  assert.ok(svg.includes('x="0" y="0" width="2" height="1" fill="var(--red)"'));
  assert.ok(svg.includes('x="1" y="1" width="2" height="1" fill="var(--blue)"'));
});
test('shipped art fits 32x12, has even rows and only Teletext colours', () => {
  for (const art of [ANTENNA]) {
    assert.ok(art.length >= 1 && art.length <= 12);
    for (const row of art) {
      assert.equal(row.length, art[0].length);
      assert.ok(row.length <= 32);
      for (const c of row) assert.ok(c === '.' || c in MOSAIC_COLORS, `unmapped ${c}`);
    }
  }
  for (const v of Object.values(MOSAIC_COLORS)) assert.match(v, /^var\(--(black|red|green|yellow|blue|magenta|cyan|white)\)$/);
});
