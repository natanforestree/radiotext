import test from 'node:test';
import assert from 'node:assert/strict';
import { safeStorage } from '../js/saved.js';
import { createDiag, diagText } from '../js/diag.js';

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

test('notes are kept in order with their time, and survive a reload', () => {
  const storage = memStorage();
  let t = 1000;
  const diag = createDiag(safeStorage(storage), { now: () => t });
  diag.note('state', 'playing 12XU');
  t = 2000;
  diag.note('remote', 'pause');
  assert.deepEqual(diag.list(), [[1000, 'state', 'playing 12XU'], [2000, 'remote', 'pause']]);
  assert.deepEqual(createDiag(safeStorage(storage)).list(), diag.list());
});

test('only the newest notes are kept, details are cut short, and clear empties it', () => {
  const diag = createDiag(safeStorage(memStorage()), { now: () => 0, max: 3 });
  for (const n of [1, 2, 3, 4]) diag.note('n', String(n));
  assert.deepEqual(diag.list().map((e) => e[2]), ['2', '3', '4']);
  diag.note('long', 'x'.repeat(500));
  assert.equal(diag.list().at(-1)[2].length, 80);
  diag.clear();
  assert.deepEqual(diag.list(), []);
});

test('a broken stored value reads as an empty log', () => {
  const storage = memStorage();
  storage.setItem('radiotext-diag', '{"not":"a list"}');
  assert.deepEqual(createDiag(safeStorage(storage)).list(), []);
});

test('the copied text has one line per note, oldest first, with a local clock', () => {
  const at = new Date(2026, 9, 23, 7, 5, 9).getTime();
  assert.equal(diagText([[at, 'remote', 'pause'], [at + 1000, 'state', 'off 12XU']]),
    '07:05:09 remote pause\n07:05:10 state off 12XU');
});
