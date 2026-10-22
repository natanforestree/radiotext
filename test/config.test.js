import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, GENRES, RELAY_BASE } from '../js/config.js';

test('presets are 12XU, Metal Detector, RadCap in order', () => {
  assert.deepEqual(PRESETS.map((s) => s.uuid), ['963b7906-0601-11e8-ae97-52543be04c81', '960de41d-0601-11e8-ae97-52543be04c81', 'ac497573-a6c5-4505-9086-2a905134abb5']);
});
test('genre pages run 210..228 with labels and tags', () => {
  assert.deepEqual(GENRES.map((g) => g.page), Array.from({ length: 19 }, (_, i) => 210 + i));
  for (const g of GENRES) { assert.ok(g.label && g.tags.length); }
});
test('relay base points at the deployed relay', () => { assert.equal(RELAY_BASE, 'https://radiotext-relay.nathanforestlee.workers.dev'); });
