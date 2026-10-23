import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceFor, parseSoma, parseLaut, fetchSong } from '../js/nowplaying.js';

test('sourceFor recognises SomaFM and laut.fm streams', () => {
  assert.deepEqual(sourceFor({ url: 'https://ice5.somafm.com/metal-128-aac' }), { kind: 'soma', id: 'metal' });
  assert.deepEqual(sourceFor({ url: 'https://stream.laut.fm/12xu' }), { kind: 'laut', id: '12xu' });
  assert.deepEqual(sourceFor({ url: 'https://12xu.stream.laut.fm/12xu?t302=x' }), { kind: 'laut', id: '12xu' });
  assert.equal(sourceFor({ url: 'http://79.120.39.202:8000/noiserock' }), null);
});
test('parsers pull the current song', () => {
  assert.equal(parseSoma({ channels: [{ id: 'groovesalad', lastPlaying: 'x' }, { id: 'metal', lastPlaying: 'Tulus - 09 Sabbat' }] }, 'metal'), 'Tulus - 09 Sabbat');
  assert.equal(parseSoma({ channels: [] }, 'metal'), null);
  assert.equal(parseLaut({ title: 'Artificial Joy', artist: { name: 'All Hands No Pocket (2019)' } }), 'All Hands No Pocket (2019) — Artificial Joy');
  assert.equal(parseLaut({ title: 'Only Title' }), 'Only Title');
});
test('fetchSong never rejects', async () => {
  assert.equal(await fetchSong({ kind: 'laut', id: '12xu' }, () => Promise.reject(new Error('offline'))), null);
});
test('fetchSong returns the parsed song', async () => {
  const f = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ title: 'T', artist: { name: 'A' } }) });
  assert.equal(await fetchSong({ kind: 'laut', id: 'x' }, f), 'A — T');
});
