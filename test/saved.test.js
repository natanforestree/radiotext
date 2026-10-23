import test from 'node:test';
import assert from 'node:assert/strict';
import { safeStorage, createSaved, createDead } from '../js/saved.js';

class MemStorage { m = new Map(); getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } }
const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
const st = (uuid) => ({ uuid, name: uuid, url: 'https://x/' + uuid, codec: 'MP3', bitrate: 128, tags: [], country: '', votes: 0, hls: false });
const defaults = [st('a'), st('b'), st('c')];

test('first run seeds the presets', () => {
  assert.deepEqual(createSaved(safeStorage(new MemStorage()), defaults).list().map((s) => s.uuid), ['a', 'b', 'c']);
});
test('saves persist and a removed preset stays removed', () => {
  const mem = new MemStorage();
  const one = createSaved(safeStorage(mem), defaults);
  one.remove('b'); assert.equal(one.add(st('d')), true); assert.equal(one.add(st('d')), false);
  assert.deepEqual(createSaved(safeStorage(mem), defaults).list().map((s) => s.uuid), ['a', 'c', 'd']);
});
test('blocked storage still gives the presets and keeps saves in memory', () => {
  const saved = createSaved(safeStorage(blocked), defaults);
  assert.deepEqual(saved.list().map((s) => s.uuid), ['a', 'b', 'c']);
  saved.add(st('d')); assert.equal(saved.has('d'), true);
});
test('missing storage falls back to memory', () => {
  const store = safeStorage(undefined);
  assert.equal(store.set('k', { a: 1 }), true);
  assert.deepEqual(store.get('k'), { a: 1 });
});
test('quota error on setItem falls back to memory', () => {
  const quota = { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } };
  const store = safeStorage(quota);
  store.set('k', [1]);
  assert.deepEqual(store.get('k'), [1]);
});
test('list returns copies', () => {
  const saved = createSaved(safeStorage(new MemStorage()), defaults);
  saved.list()[0].name = 'hacked'; saved.list().pop();
  assert.equal(saved.list().length, 3);
  assert.equal(saved.list()[0].name, 'a');
});
test('no more than 99 saved stations', () => {
  const saved = createSaved(safeStorage(new MemStorage()), [], 99);
  for (let i = 0; i < 99; i++) assert.equal(saved.add(st('s' + i)), true);
  assert.equal(saved.add(st('extra')), false);
});
test('dead marks expire after 30 days', () => {
  let t = 1_000_000;
  const dead = createDead(safeStorage(new MemStorage()), () => t, 30 * 24 * 3600 * 1000);
  dead.add('x'); assert.equal(dead.has('x'), true);
  t += 30 * 24 * 3600 * 1000; assert.equal(dead.has('x'), false);
});
