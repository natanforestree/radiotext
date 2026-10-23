import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlip } from '../js/fliplist.js';

const L = [{ uuid: 'a' }, { uuid: 'b' }, { uuid: 'c' }];
test('next and prev wrap around', () => {
  const f = createFlip(); f.set(L, 2, 'saved');
  assert.equal(f.next().uuid, 'a'); assert.equal(f.prev().uuid, 'c'); assert.equal(f.prev().uuid, 'b');
  assert.equal(f.source(), 'saved');
});
test('an empty list flips to nothing', () => {
  const f = createFlip(); f.set([], 0, 'genre');
  assert.equal(f.current(), null); assert.equal(f.next(), null); assert.equal(f.prev(), null);
});
