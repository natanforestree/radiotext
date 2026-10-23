import test from 'node:test';
import assert from 'node:assert/strict';
import { backoffDelay } from '../js/reconnect.js';

test('backoff is 1, 2, 4, 8 s then 15 s, and stops at 2 minutes', () => {
  assert.deepEqual([backoffDelay(0, 0), backoffDelay(1, 1000), backoffDelay(2, 3000), backoffDelay(3, 7000), backoffDelay(4, 15000), backoffDelay(9, 119999)],
    [1000, 2000, 4000, 8000, 15000, 15000]);
  assert.equal(backoffDelay(10, 120000), null);
});
