import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMetadata, playbackStateFor, bindMediaSession } from '../js/mediasession.js';

test('metadata uses the song when known', () => {
  const st = { name: 'SomaFM Metal Detector (128k AAC)' };
  assert.deepEqual(buildMetadata({ station: st, song: null }).title, 'SomaFM Metal Detector');
  const m = buildMetadata({ station: st, song: 'Tulus - 09 Sabbat' });
  assert.equal(m.title, 'Tulus - 09 Sabbat'); assert.equal(m.artist, 'SomaFM Metal Detector'); assert.equal(m.album, 'Radiotext');
});
test('playback state per player kind', () => {
  assert.deepEqual(['tuning', 'playing', 'retrying', 'off', 'lost', 'unavailable', null].map(playbackStateFor),
    ['playing', 'playing', 'playing', 'paused', 'paused', 'paused', 'none']);
});
test('car next/prev map to station flips, seek is cleared, failures are tolerated', () => {
  const h = {};
  const ms = { setActionHandler(name, fn) { if (name === 'seekto') throw new Error('unsupported'); h[name] = fn; } };
  const calls = [];
  bindMediaSession(ms, { play: () => calls.push('play'), stop: () => calls.push('stop'), next: () => calls.push('next'), prev: () => calls.push('prev') });
  h.nexttrack(); h.previoustrack(); h.pause(); h.play();
  assert.deepEqual(calls, ['next', 'prev', 'stop', 'play']);
  assert.equal(h.seekforward, null); assert.equal(h.seekbackward, null);
  bindMediaSession(undefined, {});
});
