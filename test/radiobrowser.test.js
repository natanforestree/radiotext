import test from 'node:test';
import assert from 'node:assert/strict';
import { createRadioBrowser } from '../js/radiobrowser.js';

const json = (body, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) });
const row = (uuid, votes) => ({ stationuuid: uuid, votes });

test('picks a server from the list and builds exact genre URLs', async () => {
  const calls = [];
  const fetch = (url) => { calls.push(url); return url.endsWith('/servers') ? json([{ name: 'nl1.api.radio-browser.info' }]) : json([row('a', 1)]); };
  await createRadioBrowser({ fetch, random: () => 0 }).byGenre({ page: 212, label: 'SLUDGE', tags: ['sludge'] });
  assert.equal(calls[1], 'https://nl1.api.radio-browser.info/json/stations/search?tag=sludge&tagExact=true&hidebroken=true&order=votes&reverse=true&limit=300');
});
test('falls back to de1 when the server list fails', async () => {
  const calls = [];
  const fetch = (url) => { calls.push(url); return url.endsWith('/servers') ? Promise.reject(new Error('dns')) : json([]); };
  await createRadioBrowser({ fetch }).byGenre({ page: 210, label: 'NOISE ROCK', tags: ['noise rock'] });
  assert.ok(calls[1].startsWith('https://de1.api.radio-browser.info/json/stations/search?tag=noise%20rock&'));
});
test('merges tag variants by uuid, most votes first', async () => {
  const fetch = (url) => url.endsWith('/servers') ? json([]) : url.includes('tag=post-punk') ? json([row('a', 5), row('b', 50)]) : json([row('b', 50), row('c', 9)]);
  const rows = await createRadioBrowser({ fetch }).byGenre({ page: 213, label: 'POST-PUNK', tags: ['post-punk', 'post punk'] });
  assert.deepEqual(rows.map((r) => r.stationuuid), ['b', 'c', 'a']);
});
test('byGenre throws when every request fails', async () => {
  const fetch = (url) => url.endsWith('/servers') ? json([]) : json(null, false);
  await assert.rejects(createRadioBrowser({ fetch }).byGenre({ page: 210, label: 'NOISE ROCK', tags: ['noise rock'] }));
});
test('blank search does not fetch; countClick swallows errors', async () => {
  let n = 0;
  const rb = createRadioBrowser({ fetch: (url) => { n++; return url.endsWith('/servers') ? json([]) : Promise.reject(new Error('x')); } });
  assert.deepEqual(await rb.search('   '), []);
  assert.equal(n, 0);
  await rb.countClick('u1');
});
test('retries once on the fallback when a non-fallback base fails', async () => {
  const calls = [];
  const fetch = (url) => { calls.push(url); return url.endsWith('/servers') ? json([{ name: 'nl1.api.radio-browser.info' }]) : url.startsWith('https://nl1') ? json(null, false) : json([row('z', 1)]); };
  const rows = await createRadioBrowser({ fetch, random: () => 0 }).search('jazz');
  assert.deepEqual(rows.map((r) => r.stationuuid), ['z']);
  assert.ok(calls.some((u) => u.startsWith('https://de1.') && u.includes('name=jazz')));
  assert.ok(calls.some((u) => u.startsWith('https://de1.') && u.includes('tag=jazz') && !u.includes('tagExact')));
});

// A hung server must not hold SEARCHING… for a minute: every request gives up after RB_TIMEOUT_MS.
// `hang` acts like a fetch to a server that never answers: it fails only when its signal aborts.
const hang = (_url, opts) => new Promise((_, reject) => {
  opts.signal.addEventListener('abort', () => reject(opts.signal.reason), { once: true });
});
const NOISE_ROCK = { page: 210, label: 'NOISE ROCK', tags: ['noise rock'] };
test('every request carries a timeout signal', async () => {
  const seen = [];
  const fetch = (url, opts) => { seen.push(opts); return json([]); };
  await createRadioBrowser({ fetch }).search('noise');
  assert.equal(seen.length, 3);
  for (const opts of seen) assert.ok(opts?.signal instanceof AbortSignal && !opts.signal.aborted);
});
test('a hung server times out and falls back to de1; if de1 hangs too, the request fails', async (t) => {
  // Node's AbortSignal.timeout timer doesn't hold the event loop open, so this one does.
  const alive = setInterval(() => {}, 1000);
  t.after(() => clearInterval(alive));
  const fetch = (url, opts) => url.endsWith('/servers') ? json([{ name: 'nl1.api.radio-browser.info' }])
    : url.startsWith('https://nl1') ? hang(url, opts) : json([row('z', 1)]);
  const rows = await createRadioBrowser({ fetch, random: () => 0, timeoutMs: 20 }).search('jazz');
  assert.deepEqual(rows.map((r) => r.stationuuid), ['z']);
  await assert.rejects(createRadioBrowser({ fetch: hang, timeoutMs: 20 }).byGenre(NOISE_ROCK), { name: 'TimeoutError' });
});
test('browsers without AbortSignal.timeout send requests without a signal', async () => {
  const real = AbortSignal.timeout;
  AbortSignal.timeout = undefined;
  try {
    const seen = [];
    await createRadioBrowser({ fetch: (url, opts) => { seen.push(opts); return json([]); } }).byGenre(NOISE_ROCK);
    assert.equal(seen.length, 2);
    for (const opts of seen) assert.equal(opts?.signal, undefined);
  } finally {
    AbortSignal.timeout = real;
  }
});
