import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, RETIRED_PRESETS, GENRES, SECTIONS, FEATURED, RELAY_BASE } from '../js/config.js';

test('the only preset is Fluid Radio; the old ones are retired', () => {
  assert.deepEqual(PRESETS.map((s) => s.uuid), ['014cd228-0e4d-46a9-b5be-08a0f6607f03']);
  assert.deepEqual(RETIRED_PRESETS, ['963b7906-0601-11e8-ae97-52543be04c81', '960de41d-0601-11e8-ae97-52543be04c81', 'ac497573-a6c5-4505-9086-2a905134abb5']);
});
test('the first genre pages keep 210..228, in order', () => {
  assert.deepEqual(GENRES.slice(0, 19).map((g) => g.page), Array.from({ length: 19 }, (_, i) => 210 + i));
  assert.deepEqual(GENRES.slice(0, 3).map((g) => g.label), ['NOISE ROCK', 'NOISE', 'SLUDGE']);
});
test('genre pages are unique, rising, within 210..299, with labels and tags', () => {
  const pages = GENRES.map((g) => g.page);
  assert.deepEqual(pages, [...pages].sort((a, b) => a - b));
  assert.equal(new Set(pages).size, pages.length);
  for (const g of GENRES) {
    assert.ok(g.page >= 210 && g.page <= 299, `${g.label} on ${g.page}`);
    assert.ok(g.label && g.tags.length, g.label);
    assert.ok(g.label.length <= 24, `${g.label} fits an index row beside its page number`);
  }
});
test('page 200 features genre pages from every section but the underground, in page order', () => {
  const pages = FEATURED.map((n) => GENRES.find((g) => g.page === n)?.page);
  assert.deepEqual(pages, [...FEATURED].sort((a, b) => a - b));
  const sections = new Set(FEATURED.map((n) => SECTIONS.find((s) => n >= s.from && n <= s.to).page));
  assert.deepEqual([...sections].sort(), [201, 202, 203, 204, 205, 206]);
});
test('every genre page sits in exactly one section; sections are 201..207', () => {
  assert.deepEqual(SECTIONS.map((s) => s.page), [201, 202, 203, 204, 205, 206, 207]);
  for (const g of GENRES) {
    assert.equal(SECTIONS.filter((s) => g.page >= s.from && g.page <= s.to).length, 1, `${g.label} on ${g.page}`);
  }
  for (const s of SECTIONS) {
    assert.ok(GENRES.some((g) => g.page >= s.from && g.page <= s.to), `${s.label} has genres`);
    assert.ok(s.label.length <= 24, `${s.label} fits an index row beside its page number`);
  }
});
test('relay base points at the deployed relay', () => { assert.equal(RELAY_BASE, 'https://radiotext-relay.nathanforestlee.workers.dev'); });
