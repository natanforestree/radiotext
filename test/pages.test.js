import test from 'node:test';
import assert from 'node:assert/strict';
import { savedPage, route, paginate } from '../js/pages.js';
import { GENRES } from '../js/config.js';

test('page numbers route to the right place', () => {
  const ctx = { savedCount: 3, genres: GENRES };
  assert.deepEqual(route(100, ctx), { kind: 'home' });
  assert.deepEqual(route(102, ctx), { kind: 'saved', index: 1 });
  assert.equal(route(104, ctx), null);
  assert.deepEqual(route(200, ctx), { kind: 'genres' });
  assert.equal(route(212, ctx).genre.label, 'SLUDGE');
  assert.equal(route(229, ctx), null);
  assert.deepEqual(route(300, ctx), { kind: 'search' });
  assert.deepEqual(route(999, ctx), { kind: 'diag' });
  assert.equal(savedPage(0), 101);
});
test('paginate clamps and counts subpages', () => {
  const list = Array.from({ length: 17 }, (_, i) => i);
  assert.deepEqual(paginate(list, 8, 3), { items: [16], subpage: 3, subpages: 3 });
  assert.deepEqual(paginate(list, 8, 9).subpage, 3);
  assert.deepEqual(paginate([], 8, 1), { items: [], subpage: 1, subpages: 1 });
});
