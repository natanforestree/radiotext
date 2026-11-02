import test from 'node:test';
import assert from 'node:assert/strict';
import { savedPage, route, paginate, genresIn, parentPage } from '../js/pages.js';
import { GENRES, SECTIONS } from '../js/config.js';

test('page numbers route to the right place', () => {
  const ctx = { savedCount: 3, genres: GENRES, sections: SECTIONS };
  assert.deepEqual(route(100, ctx), { kind: 'home' });
  assert.deepEqual(route(102, ctx), { kind: 'saved', index: 1 });
  assert.equal(route(104, ctx), null);
  assert.deepEqual(route(200, ctx), { kind: 'genres' });
  assert.equal(route(201, ctx).kind, 'section');
  assert.equal(route(201, ctx).section.label, 'ROCK & METAL');
  assert.equal(route(207, ctx), null);
  assert.equal(route(212, ctx).genre.label, 'SLUDGE');
  assert.equal(route(229, ctx).genre.label, 'GOTH');
  assert.equal(route(251, ctx).genre.label, 'TECHNO');
  assert.equal(route(248, ctx), null);
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
test('genresIn picks the pages in a section, in page order', () => {
  const genres = [{ page: 231, label: 'B' }, { page: 229, label: 'X' }, { page: 230, label: 'A' }, { page: 250, label: 'Y' }];
  assert.deepEqual(genresIn({ from: 230, to: 249 }, genres).map((g) => g.label), ['A', 'B']);
});
test('parentPage goes up one level: genre to its index, index to 200, the rest home', () => {
  const ctx = { genres: GENRES, sections: SECTIONS };
  assert.equal(parentPage(252, ctx), 202);
  assert.equal(parentPage(299, ctx), 206);
  assert.equal(parentPage(212, ctx), 200);
  assert.equal(parentPage(229, ctx), 200);
  assert.equal(parentPage(201, ctx), 200);
  assert.equal(parentPage(206, ctx), 200);
  for (const n of [200, 300, 999, 248]) assert.equal(parentPage(n, ctx), 100, String(n));
});
