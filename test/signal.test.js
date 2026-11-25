import test from 'node:test';
import assert from 'node:assert/strict';
import { bandEdges, createSignal, BANDS } from '../js/signal.js';

const BINS = 1024;
const RATE = 48000;
const DT = 1 / 60;
const silentWave = () => new Uint8Array(2048).fill(128);
const sineWave = (amp) => Uint8Array.from({ length: 2048 }, (_, i) => 128 + Math.round(amp * Math.sin(i / 8)));
/** A spectrum with a hump around one frequency, over a quiet floor. */
const spectrum = (hz, height = 220, floor = 40) => {
  const centre = hz / (RATE / 2 / BINS);
  return Uint8Array.from({ length: BINS }, (_, i) => Math.max(floor, Math.round(height - Math.abs(i - centre) * 6)));
};
const run = (read, frames, freq, wave) => { let s; for (let i = 0; i < frames; i++) s = read(freq, wave, DT); return s; };

test('band edges climb by pitch from about 40 Hz to 16 kHz, each band at least one bin', () => {
  const e = bandEdges(BINS, RATE);
  assert.equal(e.length, BANDS + 1);
  for (let b = 1; b < e.length; b++) assert.ok(e[b] > e[b - 1], `band ${b}`);
  assert.ok(e[0] >= 1 && e[BANDS] <= BINS);
});
test('a low hum reads as bass, a high hiss as treble', () => {
  const low = run(createSignal({ binCount: BINS, sampleRate: RATE }), 90, spectrum(80), sineWave(60));
  assert.ok(low.bass > low.treble + 0.3, `bass ${low.bass.toFixed(2)} treble ${low.treble.toFixed(2)}`);
  const high = run(createSignal({ binCount: BINS, sampleRate: RATE }), 90, spectrum(9000), sineWave(60));
  assert.ok(high.treble > high.bass + 0.3, `treble ${high.treble.toFixed(2)} bass ${high.bass.toFixed(2)}`);
  assert.ok(high.brightness > low.brightness);
});
test('silence for a second and a half is not live; sound is', () => {
  const read = createSignal({ binCount: BINS, sampleRate: RATE });
  assert.equal(run(read, 30, spectrum(200), sineWave(50)).live, true);
  assert.equal(run(read, 60, new Uint8Array(BINS), silentWave()).live, true, 'a second of silence is a pause');
  assert.equal(run(read, 40, new Uint8Array(BINS), silentWave()).live, false);
  assert.equal(read(spectrum(200), sineWave(50), DT).live, true);
});
test('a sudden hit after steady sound is a beat, and one hit is one beat', () => {
  const read = createSignal({ binCount: BINS, sampleRate: RATE });
  const steady = spectrum(150, 120);
  const jitter = (k) => steady.map((v, i) => v + ((i + k) % 3));
  for (let k = 0; k < 60; k++) assert.equal(read(jitter(k), sineWave(40), DT).beat, false, `steady frame ${k}`);
  const hit = read(spectrum(100, 250, 120), sineWave(120), DT);
  assert.equal(hit.beat, true);
  assert.ok(hit.strength > 0);
  assert.equal(read(spectrum(100, 255, 125), sineWave(120), DT).beat, false, 'too soon for another');
});
test('a quiet station moves as much as a loud one once it has been heard for a moment', () => {
  const quiet = run(createSignal({ binCount: BINS, sampleRate: RATE }), 120, spectrum(300, 90, 10), sineWave(8));
  const loud = run(createSignal({ binCount: BINS, sampleRate: RATE }), 120, spectrum(300, 240, 30), sineWave(100));
  assert.ok(Math.abs(quiet.level - loud.level) < 0.15, `quiet ${quiet.level.toFixed(2)} loud ${loud.level.toFixed(2)}`);
});
test('noise reads as noisier than a tone', () => {
  const tone = run(createSignal({ binCount: BINS, sampleRate: RATE }), 120, spectrum(1000, 230, 0), sineWave(60));
  const hiss = run(createSignal({ binCount: BINS, sampleRate: RATE }), 120, Uint8Array.from({ length: BINS }, (_, i) => 150 + (i * 7919) % 30), sineWave(60));
  assert.ok(hiss.noisiness > tone.noisiness + 0.2, `hiss ${hiss.noisiness.toFixed(2)} tone ${tone.noisiness.toFixed(2)}`);
});
