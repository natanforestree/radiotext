import test from 'node:test';
import assert from 'node:assert/strict';
import { stepString } from '../js/visuals.js';

const N = 61;
const run = (seconds, opts, y = new Float32Array(N), v = new Float32Array(N)) => {
  for (let f = 0; f < seconds * 60; f++) stepString(y, v, { dt: 1 / 60, t: f / 60, seed: 1, ...opts, pluck: f === 0 ? opts.pluck : null });
  return { y, v };
};
const most = (y) => Math.max(...Array.from(y, Math.abs));

test('a string with no music stays still, and its ends stay tied', () => {
  const { y } = run(5, { band: 0 });
  assert.equal(most(y), 0);
});
test('music keeps a string moving, more for a louder band, and steady rather than running away', () => {
  const quiet = most(run(8, { band: 0.15 }).y);
  const loud = most(run(8, { band: 0.9 }).y);
  assert.ok(quiet > 0.5, `quiet ${quiet}`);
  assert.ok(loud > quiet, `loud ${loud} quiet ${quiet}`);
  assert.ok(loud < 60, `loud ${loud}`);
});
test('a pluck throws the string up, the wave travels along it, and friction settles it', () => {
  const y = new Float32Array(N);
  const v = new Float32Array(N);
  stepString(y, v, { dt: 1 / 60, t: 0, band: 0, seed: 1, pluck: { at: 30, width: 3, strength: 1 } });
  for (let f = 0; f < 6; f++) stepString(y, v, { dt: 1 / 60, t: 0, band: 0, seed: 1 });
  assert.ok(y[30] < -1, `up at the pluck: ${y[30]}`);
  for (let f = 0; f < 20; f++) stepString(y, v, { dt: 1 / 60, t: 0, band: 0, seed: 1 });
  assert.ok(Math.abs(y[22]) > 0.2, 'the wave has travelled 80px along');
  assert.equal(y[0], 0);
  assert.equal(y[N - 1], 0);
  for (let f = 0; f < 600; f++) stepString(y, v, { dt: 1 / 60, t: 0, band: 0, seed: 1 });
  assert.ok(most(y) < 0.05, `settled: ${most(y)}`);
});
test('a long, slow frame is split into short steps, so it never blows up', () => {
  const { y } = run(4, { band: 0.9, dt: 0.1 });
  assert.ok(most(y) < 80 && Number.isFinite(most(y)));
});

test('a closed string is a loop: no tied ends, and a pluck runs both ways round and meets itself', () => {
  const y = new Float32Array(40);
  const v = new Float32Array(40);
  stepString(y, v, { dt: 1 / 60, t: 0, band: 0, seed: 1, closed: true, pluck: { at: 0, width: 2, strength: -1 } });
  assert.ok(v[0] > 0 && v[39] > 0 && v[1] > 0, 'the pluck reaches across the join');
  for (let f = 0; f < 12; f++) stepString(y, v, { dt: 1 / 60, t: 0, band: 0, seed: 1, closed: true });
  assert.ok(y[0] !== 0, 'nothing ties it down');
  assert.ok(Math.abs(y[8] - y[32]) < 0.01, 'the same each way round');
});
test('a loop driven by music stays smooth across its join', () => {
  const y = new Float32Array(50);
  const v = new Float32Array(50);
  for (let f = 0; f < 300; f++) stepString(y, v, { dt: 1 / 60, t: f / 60, band: 0.8, seed: 2, closed: true });
  const steps = Array.from(y, (a, i) => Math.abs(a - y[(i + 1) % 50]));
  assert.ok(steps[49] <= Math.max(...steps.slice(0, 49)) * 1.5 + 0.01, 'no jump where it joins');
});

test('a loop plucked outward beat after beat comes back to rest rather than growing', () => {
  const y = new Float32Array(60);
  const v = new Float32Array(60);
  for (let f = 0; f < 60 * 20; f++) {
    const pluck = f % 30 === 0 ? { at: (f * 7) % 60, width: 4, strength: -1.4 } : null;
    stepString(y, v, { dt: 1 / 60, t: f / 60, band: 0.8, seed: 3, closed: true, pluck });
  }
  const mean = y.reduce((a, b) => a + b, 0) / y.length;
  assert.ok(Math.abs(mean) < 6, `mean offset ${mean.toFixed(1)}`);
  for (let f = 0; f < 600; f++) stepString(y, v, { dt: 1 / 60, t: 0, band: 0, seed: 3, closed: true });
  assert.ok(Math.max(...Array.from(y, Math.abs)) < 0.5, 'settled');
});
