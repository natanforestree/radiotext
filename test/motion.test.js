import test from 'node:test';
import assert from 'node:assert/strict';
import { staggered, typingTime, between } from '../js/motion.js';
import { stepLife, ease, faded } from '../js/visuals.js';

test('rows come in top to bottom, a short list a row at a time and a long one squeezed into the same time', () => {
  assert.deepEqual(staggered(4), [0, 16, 32, 48]);
  const long = staggered(60);
  assert.equal(long[0], 0);
  assert.ok(long.at(-1) <= 260, `last at ${long.at(-1)}`);
  assert.ok(long.every((d, i) => i === 0 || d >= long[i - 1]));
  assert.deepEqual(staggered(1), [0]);
});
test('typing is quick whatever the length', () => {
  assert.equal(typingTime(1), 180);
  assert.equal(typingTime(200), 620);
  assert.ok(typingTime(12) > 180 && typingTime(12) < 620);
});
test('the zoom goes from one rectangle to the other', () => {
  const a = { left: 0, top: 0, width: 10, height: 10 };
  const b = { left: 100, top: 50, width: 300, height: 200 };
  assert.deepEqual(between(a, b, 0), a);
  assert.deepEqual(between(a, b, 1), b);
  assert.deepEqual(between(a, b, 0.5), { left: 50, top: 25, width: 155, height: 105 });
});

test('the visuals warm up over a couple of seconds and die away a little slower', () => {
  let life = 0;
  let warm = 0;
  while (life < 1) { life = stepLife(life, true, 1 / 60); warm++; }
  let cool = 0;
  while (life > 0) { life = stepLife(life, false, 1 / 60); cool++; }
  assert.ok(warm / 60 > 1.5 && warm / 60 < 3.5, `warm ${warm / 60}s`);
  assert.ok(cool > warm, `cool ${cool / 60}s`);
  assert.equal(stepLife(1, true, 1), 1);
  assert.equal(stepLife(0, false, 1), 0);
});
test('life eases in and out, from exactly nothing to exactly everything', () => {
  assert.equal(ease(0), 0);
  assert.equal(ease(1), 1);
  assert.ok(ease(0.1) < 0.1 && ease(0.9) > 0.9);
});
test('a faded reading turns every level down, and keeps its beats only once it is mostly alive', () => {
  const s = { live: true, level: 0.8, bass: 0.6, mid: 0.4, treble: 0.2, bands: new Float32Array([1, 0.5]), beat: true, strength: 1, sinceBeat: 0, brightness: 0.5, noisiness: 0.2, wave: new Uint8Array(4) };
  assert.equal(faded(s, 1), s);
  const half = faded(s, 0.25);
  assert.equal(half.level, 0.2);
  assert.deepEqual(Array.from(half.bands), [0.25, 0.125]);
  assert.equal(half.beat, false);
  assert.ok(half.sinceBeat > 1);
  const most = faded(s, 0.75);
  assert.equal(most.beat, true);
  assert.equal(faded(s, 0).bass, 0);
  assert.equal(s.level, 0.8, 'the reading itself is untouched');
});
