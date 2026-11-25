import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadable, createTap } from '../js/listen.js';
import { safeStorage } from '../js/saved.js';

const memStore = () => { const m = new Map(); return safeStorage({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }); };
const tick = () => new Promise((r) => setImmediate(r));

/** A fetch whose answers the test hands out, recording what was asked and how. */
const fakeFetch = () => {
  const calls = [];
  const fn = (url, opts) => new Promise((resolve, reject) => calls.push({ url, opts, resolve, reject }));
  return { fn, calls };
};

test('a station whose server allows reading is remembered as readable, and asked only once', async () => {
  const f = fakeFetch();
  const r = createReadable({ store: memStore(), fetch: f.fn });
  assert.equal(r.ok('https://a/x'), undefined);
  r.check(['https://a/x']);
  r.check(['https://a/x']);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].opts.mode, 'cors');
  assert.equal(f.calls[0].opts.credentials, 'omit');
  f.calls[0].resolve({ ok: true });
  await tick();
  assert.equal(r.ok('https://a/x'), true);
  assert.ok(f.calls[0].opts.signal.aborted, 'it hangs up once the headers are in');
  r.check(['https://a/x']);
  assert.equal(f.calls.length, 1);
});
test('a refusal is remembered as not readable; a timeout stays unknown', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fakeFetch();
  const r = createReadable({ store: memStore(), fetch: f.fn, setTimeout, clearTimeout });
  r.check(['https://no/x', 'https://slow/x']);
  f.calls[0].reject(new TypeError('Failed to fetch'));
  await tick();
  assert.equal(r.ok('https://no/x'), false);
  t.mock.timers.tick(6000);
  f.calls[1].reject(new DOMException('aborted', 'AbortError'));
  await tick();
  assert.equal(r.ok('https://slow/x'), undefined);
});
test('answers are kept between visits, and expire', async () => {
  const store = memStore();
  let clock = 1000;
  const f = fakeFetch();
  const r = createReadable({ store, fetch: f.fn, now: () => clock });
  r.check(['https://a/x']);
  f.calls[0].resolve({ ok: true });
  await tick();
  const again = createReadable({ store, fetch: fakeFetch().fn, now: () => clock });
  assert.equal(again.ok('https://a/x'), true);
  clock += 15 * 24 * 3600 * 1000;
  assert.equal(again.ok('https://a/x'), undefined);
});
test('only a few stations are asked at once', async () => {
  const f = fakeFetch();
  const r = createReadable({ store: memStore(), fetch: f.fn });
  r.check(['https://1/', 'https://2/', 'https://3/', 'https://4/', 'https://5/']);
  assert.equal(f.calls.length, 3);
  f.calls[0].resolve({ ok: true });
  await tick();
  assert.equal(f.calls.length, 4);
});
test('without captureStream (Safari, any iPhone browser) the tap is unsupported and reads nothing', () => {
  const audio = new EventTarget();
  const tap = createTap({ audio, AudioContext: class {} });
  assert.equal(tap.supported, false);
  assert.equal(tap.read(), null);
});
