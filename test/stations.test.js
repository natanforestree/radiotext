import test from 'node:test';
import assert from 'node:assert/strict';
import { toStation, displayName, baseName, codecMime, isPlayable, isExcluded, dedupe, httpsVariant, streamCandidates, shortTag, prepareList } from '../js/stations.js';
import { GENRES } from '../js/config.js';

const raw = (o) => ({ stationuuid: 'u1', name: 'X', url_resolved: 'https://a/x', codec: 'MP3', bitrate: 128, tags: 'noise rock', countrycode: 'DE', votes: 5, hls: 0, homepage: '', ...o });
const none = { has: () => false };

test('toStation normalises a Radio Browser row', () => {
  assert.deepEqual(toStation(raw({ name: '  12XU ', tags: 'garage punk, Noise Rock,,post-punk', hls: 1 })), {
    uuid: 'u1', name: '12XU', url: 'https://a/x', codec: 'MP3', bitrate: 128,
    tags: ['garage punk', 'noise rock', 'post-punk'], country: 'DE', votes: 5, hls: true,
  });
});
test('displayName drops bitrate and format suffixes only', () => {
  assert.equal(displayName({ name: 'SomaFM Metal Detector (128k AAC)' }), 'SomaFM Metal Detector');
  assert.equal(displayName({ name: 'RadCap - Sludge Metal (48)' }), 'RadCap - Sludge Metal');
  assert.equal(displayName({ name: "Friends of 'CSB (Tuner feed of 89.3 FM)" }), "Friends of 'CSB (Tuner feed of 89.3 FM)");
  assert.equal(baseName({ name: 'SomaFM  Metal Detector (32k AAC)' }), 'somafm metal detector');
});
test('codecMime maps Radio Browser codecs', () => {
  assert.equal(codecMime('MP3'), 'audio/mpeg');
  assert.equal(codecMime('AAC'), 'audio/aac');
  assert.equal(codecMime('AAC+'), 'audio/aac');
  assert.equal(codecMime('OGG'), 'audio/ogg');
  assert.equal(codecMime('OPUS'), 'audio/ogg; codecs=opus');
  assert.equal(codecMime('FLAC'), 'audio/flac');
  assert.equal(codecMime('UNKNOWN'), null);
  assert.equal(codecMime(''), null);
});
test('isPlayable checks codec, HLS support and dead marks', () => {
  const mp3 = (m) => m === 'audio/mpeg';
  const dead = { has: (u) => u === 'dead' };
  assert.equal(isPlayable({ uuid: 'a', codec: 'MP3', hls: false }, mp3, dead), true);
  assert.equal(isPlayable({ uuid: 'a', codec: 'AAC', hls: false }, mp3, dead), false);
  assert.equal(isPlayable({ uuid: 'dead', codec: 'MP3', hls: false }, mp3, dead), false);
  assert.equal(isPlayable({ uuid: 'a', codec: 'MP3', hls: true }, mp3, dead), false);
  assert.equal(isPlayable({ uuid: 'a', codec: 'MP3', hls: true }, (m) => m === 'application/vnd.apple.mpegurl', dead), true);
});
test('isExcluded drops sleep, noise-colour and adult stations', () => {
  assert.equal(isExcluded({ name: 'Pink Noise Radio', tags: ['ambient', 'chillout', 'noise'] }), true);
  assert.equal(isExcluded({ name: 'Sex Sound Radio', tags: ['adult', 'noise'] }), true);
  assert.equal(isExcluded({ name: 'Brown Noise', tags: ['ambient', 'noise', 'relax', 'sleep'] }), true);
  assert.equal(isExcluded({ name: 'NOISEBOX RADIO', tags: ['noise'] }), false);
  assert.equal(isExcluded({ name: 'Technolovers HARDCORE', tags: ['hardcore', 'techno'] }, ['techno']), true);
});
test('dedupe keeps one copy per station, closest to 128k, then most votes', () => {
  const s = (uuid, name, bitrate, votes) => ({ uuid, name, bitrate, votes });
  assert.deepEqual(dedupe([s('a', 'SomaFM Metal Detector (128k AAC)', 128, 7731), s('b', '12XU', 128, 433), s('c', 'SomaFM Metal Detector (32k AAC)', 32, 432),
    s('d', 'SomaFM Metal Detector (128k MP3)', 128, 177), s('e', 'RadCap - Noise Rock', 320, 19)]).map((x) => x.uuid), ['a', 'b', 'e']);
  assert.deepEqual(dedupe([s('x', 'Foo (320k)', 320, 50), s('y', 'Foo (64k)', 64, 10)]).map((x) => x.uuid), ['y']);
});
test('httpsVariant swaps the scheme and keeps the port', () => {
  assert.equal(httpsVariant('http://stream.laut.fm/12xu'), 'https://stream.laut.fm/12xu');
  assert.equal(httpsVariant('http://79.120.39.202:8000/noiserock'), 'https://79.120.39.202:8000/noiserock');
  assert.equal(httpsVariant('https://x/y'), null);
});
test('streamCandidates tries https first, then the relay', () => {
  const st = { uuid: '12xu', url: 'http://stream.laut.fm/12xu' };
  assert.deepEqual(streamCandidates(st, 'https://relay.example'), ['https://stream.laut.fm/12xu', 'https://relay.example/s/12xu']);
  assert.deepEqual(streamCandidates(st, null), ['https://stream.laut.fm/12xu']);
  assert.deepEqual(streamCandidates({ uuid: 'z', url: 'https://ice5.somafm.com/metal-128-aac' }, 'https://relay.example'), ['https://ice5.somafm.com/metal-128-aac']);
  // A hostname that only starts like an address is still a hostname.
  assert.deepEqual(streamCandidates({ uuid: 'n', url: 'http://1.2.3.4.example.net/x' }, null), ['https://1.2.3.4.example.net/x']);
});
test('streamCandidates skips https on a bare IP address, which never has a valid certificate', () => {
  const ip4 = { uuid: 'ac49', url: 'http://79.120.39.202:8000/noiserock' };
  assert.deepEqual(streamCandidates(ip4, 'https://relay.example'), ['https://relay.example/s/ac49']);
  assert.deepEqual(streamCandidates(ip4, null), []);
  const ip6 = { uuid: 'v6', url: 'http://[2001:db8::1]:8000/x' };
  assert.deepEqual(streamCandidates(ip6, 'https://relay.example'), ['https://relay.example/s/v6']);
  assert.deepEqual(streamCandidates(ip6, null), []);
});
test('shortTag prefers the first matching genre label', () => {
  assert.equal(shortTag({ tags: ['garage punk', 'indie rock', 'noise rock', 'post-punk', 'punk'] }, GENRES), 'NOISE ROCK');
  assert.equal(shortTag({ tags: ['black metal', 'doom metal', 'post-punk', 'progressive rock', 'sludge'] }, GENRES), 'SLUDGE');
  assert.equal(shortTag({ tags: ['jazz'] }, GENRES), 'JAZZ');
  assert.equal(shortTag({ tags: [] }, GENRES), '');
});
test('prepareList filters, dedupes and sorts by votes', () => {
  const noise = GENRES.find((g) => g.page === 211);
  const mp3 = (m) => m === 'audio/mpeg';
  const raws = [raw({ stationuuid: '1', name: 'Pink Noise Radio', tags: 'noise,ambient', votes: 300 }),
    raw({ stationuuid: '2', name: 'NOISEBOX RADIO', tags: 'noise', votes: 18 }),
    raw({ stationuuid: '3', name: 'Culture Failure', tags: 'ambient,noise', votes: 391, codec: 'AAC' }),
    raw({ stationuuid: '4', name: 'CIA Radio', tags: 'noise,industrial', votes: 122 })];
  assert.deepEqual(prepareList(raws, { canPlay: mp3, dead: none, genre: noise }).map((s) => s.uuid), ['4', '2']);
});
