# Radiotext Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Teletext-style internet radio website for obscure music, built for flipping stations on a phone while driving, published on GitHub Pages with a free Cloudflare Worker relay for http-only streams.

**Architecture:**
- **Site:** a static, no-build site of vanilla ES modules.
  - Pure logic modules (stations, saved, flip list, pages, Radio Browser client, now-playing, player state machine, renderers) are unit-tested with `node --test`.
  - A thin `main.js` wires them to the DOM, the `<audio>` element and the Media Session API.
- **Relay:** a separate Cloudflare Worker (`worker/`) streams http-only stations over https, using TCP sockets. It's proven early (Task 2); if it fails, the site is built without it.

**Tech Stack:** HTML/CSS/JS (ES modules, no dependencies), Node 22 `node:test`, Cloudflare Workers (`cloudflare:sockets`, wrangler 4.147), Bedstead font (CC0), Python 3 + Pillow 12 (icons only), GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-22-radiotext-design.md` (mockups: `docs/superpowers/specs/2026-10-22-radiotext-mockups.html`, option B)

## Global Constraints

- **Free tiers only.** Nathan: "i do not want to pay money." Use GitHub Pages and Cloudflare Workers Free. Never a paid plan; if Free can't do it, take the no-relay fallback.
- **The site:**
  - No build step and no runtime dependencies.
  - Every URL is relative, because the site lives at `https://natanforestree.github.io/radiotext/`.
  - `.nojekyll` sits at the repo root.
- **Colours:** only the 8 Teletext colours, as CSS custom properties on `:root`:
  - `--black #000000`, `--red #ff0000`, `--green #00ff00`, `--yellow #ffff00`
  - `--blue #0000ff`, `--magenta #ff00ff`, `--cyan #00ffff`, `--white #ffffff`
  - Flat fills only: no gradients, shadows or rounded corners.
- **Effects:** no fake-CRT anything: no scanlines, curvature, glitch or bloom. The only motion allowed is an optional ON AIR flash, which is off under `prefers-reduced-motion`.
- **Font:** Bedstead (CC0), self-hosted as `fonts/bedstead.otf` from `https://bjh21.me.uk/bedstead/bedstead.otf`, with `monospace` as the fallback.
- **Layout:**
  - The fastext bar is 2×2, always visible and pinned to the bottom, with every key at least 64 px tall.
  - Tappable rows are at least 44 px tall.
  - No horizontal scroll at 320 px width.
  - The screen is at most 480 px wide, centred on black.
- **Exact copy:**
  - Header name: `RADIOTEXT`
  - States: `OFF AIR — PRESS PLAY`, `TUNING…`, `NO SIGNAL — RETRYING`, `NO SIGNAL — PRESS PLAY`, `PAGE NOT AVAILABLE`
  - List states: `SEARCHING…`, `NO STATIONS FOUND`
  - Fastext labels: `◀ PREV`, `▶ PLAY` / `■ STOP`, `NEXT ▶`, `BROWSE` / `HOME`
- **Page numbers:** 100 is home, 101–199 are saved stations (99 max), 200 is genres, 210–228 are the genre pages, and 300 is search.
- **The relay never accepts a URL from the client.** It only relays a Radio Browser station by uuid, and only if that station's `url_resolved` starts with `http://`.
- **Storage:** every `localStorage` access is wrapped so blocked storage never breaks the page.
- **Commits:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Station text from the API is untrusted.** A name like `<img src=x onerror=alert(1)>` must render as text. → Task 6, `renderList escapes station names and tags`.
2. **Flipping fast in the car**, like next-next-next. A timer or event left over from the station you flipped away from must never move or stop the station you're on now. → Task 5, `a stale tune timeout never touches the next station`.
3. **A tunnel or dead zone mid-drive.** The stream should retry at 1, 2, 4 and 8 s, then every 15 s, give up at 2 minutes with `NO SIGNAL — PRESS PLAY`, and start again when PLAY is pressed. → Task 5, `a dropped stream retries…` and `play after giving up reconnects`.
4. **Tuning to an http station while offline** must not mark it unplayable forever. Only mark it when the device is online and there's no relay, and let the mark expire after 30 days. → Task 5, `does not mark a station dead while offline`, and Task 3, `dead marks expire after 30 days`.
5. **Private browsing or blocked storage** (`localStorage` throws). The three presets must still show and play, and saves work for the session. → Task 3, `blocked storage still gives the presets and keeps saves in memory`.

## File map

```
index.html              page shell: header, #page, fastext nav, <audio id="radio">
styles.css              Teletext tokens + layout
fonts/bedstead.otf      self-hosted font (CC0)
manifest.webmanifest    home-screen app
icons/                  icon-192.png, icon-512.png, apple-touch-icon.png (made by tools/make_icons.py)
js/config.js            constants: presets, genres, timings, relay base
js/stations.js          pure station logic (normalise, filter, dedupe, stream candidates, labels)
js/saved.js             safe storage, saved stations, dead-station marks
js/fliplist.js          the prev/next list
js/pages.js             page routing + subpages
js/radiobrowser.js      Radio Browser API client (injected fetch)
js/nowplaying.js        SomaFM + laut.fm current song
js/reconnect.js         backoff schedule
js/player.js            audio state machine (tune, candidates, retry, stop)
js/static.js            white-noise burst (Web Audio)
js/mediasession.js      lock screen / car controls
js/mosaic.js            mosaic art → SVG
js/render.js            HTML string renderers (escaped)
js/main.js              wiring (DOM, events, polling, clock)
test/*.test.js          node --test for every pure module; test/fake-audio.js helper
worker/                 radiotext-relay Cloudflare Worker (src/index.js, src/http1.js, test/, scripts/)
tools/make_icons.py     draws the PNG icons
package.json            {"type":"module"} + test script
```

---

### Task 1: Skeleton, config and station logic

**Files:**
- Create: `package.json`, `.nojekyll`, `js/config.js`, `js/stations.js`
- Test: `test/stations.test.js`, `test/config.test.js`

**Interfaces:**
- **Produces, `js/config.js`:**
  - `RELAY_BASE: string|null` (null for now; Task 2 sets it)
  - `API_FALLBACK = 'https://de1.api.radio-browser.info'`
  - `SERVERS_URL = 'https://all.api.radio-browser.info/json/servers'`
  - `PRESETS: Station[3]`, `FALLBACK_103: Station`, `GENRES: Genre[]`
  - `EXCLUDE_TAGS: string[]`, `EXCLUDE_NAME: RegExp`
  - Sizes: `PER_PAGE = 8`, `MAX_SAVED = 99`, `LIST_LIMIT = 300`, `SEARCH_LIMIT = 100`
  - Timings: `TUNE_TIMEOUT_MS = 8000`, `STALL_MS = 10000`, `GIVE_UP_MS = 120000`, `STOP_DROP_MS = 30000`, `STATIC_MAX_MS = 1500`, `POLL_MS = 30000`, `DEAD_TTL_MS = 30 * 24 * 3600 * 1000`
  - `STATIC_ENABLED = true`
- **Produces, types (JSDoc in config.js):**
  - `Station = {uuid, name, url, codec, bitrate, tags: string[], country, votes, hls: boolean}`
  - `Genre = {page, label, tags: string[], exclude?: string[]}`
- **Produces, `js/stations.js`:**
  - `toStation(raw) → Station`
  - `displayName(station) → string`
  - `baseName(station) → string`
  - `codecMime(codec) → string|null`
  - `isPlayable(station, canPlay: (mime)=>boolean, dead: {has(uuid)}) → boolean`
  - `isExcluded(station, extraTags = []) → boolean`
  - `dedupe(stations) → Station[]`
  - `httpsVariant(url) → string|null`
  - `streamCandidates(station, relayBase) → string[]`
  - `shortTag(station, genres) → string`
  - `prepareList(raws, {canPlay, dead, genre}) → Station[]`

Config values to copy exactly:

```js
export const PRESETS = [
  { uuid: '963b7906-0601-11e8-ae97-52543be04c81', name: '12XU', url: 'https://stream.laut.fm/12xu', codec: 'MP3', bitrate: 128,
    tags: ['garage punk', 'indie rock', 'noise rock', 'post-punk', 'punk'], country: 'DE', votes: 433, hls: false },
  { uuid: '960de41d-0601-11e8-ae97-52543be04c81', name: 'SomaFM Metal Detector', url: 'https://ice5.somafm.com/metal-128-aac', codec: 'AAC', bitrate: 128,
    tags: ['black metal', 'doom metal', 'post-punk', 'progressive rock', 'sludge', 'stoner rock'], country: 'US', votes: 7731, hls: false },
  { uuid: 'ac497573-a6c5-4505-9086-2a905134abb5', name: 'RadCap Noise Rock', url: 'http://79.120.39.202:8000/noiserock', codec: 'AAC+', bitrate: 320,
    tags: ['noise rock', 'rock'], country: 'RU', votes: 19, hls: false },
];
export const FALLBACK_103 = { uuid: '873bc6e5-2632-424c-a044-5b08b9655c19', name: 'Athens Noise Rocks',
  url: 'https://radio.athensnoise.rocks/listen/athensnoise.rocks/radio.mp3', codec: 'MP3', bitrate: 128,
  tags: ['post-hardcore', 'hardcore', 'punk rock', 'crust'], country: 'GR', votes: 128, hls: false };
export const GENRES = [
  { page: 210, label: 'NOISE ROCK', tags: ['noise rock'] },
  { page: 211, label: 'NOISE', tags: ['noise', 'japanoise', 'noise music'] },
  { page: 212, label: 'SLUDGE', tags: ['sludge', 'sludge metal'] },
  { page: 213, label: 'POST-PUNK', tags: ['post-punk', 'post punk'] },
  { page: 214, label: 'POST-HARDCORE', tags: ['post-hardcore'] },
  { page: 215, label: 'PUNK', tags: ['punk', 'punk rock'] },
  { page: 216, label: 'HARDCORE', tags: ['hardcore'], exclude: ['techno', 'hardstyle', 'gabber', 'happy hardcore', 'uptempo hardcore', 'breakbeat hardcore', 'hardcore techno', 'edm', 'dance'] },
  { page: 217, label: 'MATH ROCK', tags: ['math rock', 'mathcore'] },
  { page: 218, label: 'DOOM METAL', tags: ['doom metal', 'doom'] },
  { page: 219, label: 'STONER ROCK', tags: ['stoner rock', 'stoner'] },
  { page: 220, label: 'SHOEGAZE', tags: ['shoegaze'] },
  { page: 221, label: 'INDUSTRIAL', tags: ['industrial'] },
  { page: 222, label: 'DARKWAVE', tags: ['darkwave', 'dark wave'] },
  { page: 223, label: 'KRAUTROCK', tags: ['krautrock'] },
  { page: 224, label: 'EXPERIMENTAL', tags: ['experimental'] },
  { page: 225, label: 'AVANT-GARDE', tags: ['avant-garde', 'avant garde', 'avantgarde'] },
  { page: 226, label: 'FREEFORM', tags: ['freeform'] },
  { page: 227, label: 'COLLEGE RADIO', tags: ['college radio', 'college'] },
  { page: 228, label: 'COMMUNITY RADIO', tags: ['community radio'] },
];
export const EXCLUDE_TAGS = ['adult', 'erotic', 'explicit', 'sleep', 'relax', 'relaxation', 'asmr', 'meditation', 'white noise', 'pink noise', 'brown noise'];
export const EXCLUDE_NAME = /\b(white|pink|brown|green) noise\b|\bsleep\b|\basmr\b|\bsex\b/i;
```

("no wave" from the spec's list is dropped: Radio Browser has 0 stations with that tag.)

- [ ] **Step 1: Write `package.json`**

```json
{ "name": "radiotext", "private": true, "type": "module", "scripts": { "test": "node --test test/*.test.js" } }
```

Also create an empty `.nojekyll`.

- [ ] **Step 2: Write the failing tests**

`test/config.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, GENRES, RELAY_BASE } from '../js/config.js';

test('presets are 12XU, Metal Detector, RadCap in order', () => {
  assert.deepEqual(PRESETS.map((s) => s.uuid), ['963b7906-0601-11e8-ae97-52543be04c81', '960de41d-0601-11e8-ae97-52543be04c81', 'ac497573-a6c5-4505-9086-2a905134abb5']);
});
test('genre pages run 210..228 with labels and tags', () => {
  assert.deepEqual(GENRES.map((g) => g.page), Array.from({ length: 19 }, (_, i) => 210 + i));
  for (const g of GENRES) { assert.ok(g.label && g.tags.length); }
});
test('relay base is null until Task 2', () => { assert.equal(RELAY_BASE, null); });
```

`test/stations.test.js`:

```js
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
  const st = { uuid: 'ac49', url: 'http://79.120.39.202:8000/noiserock' };
  assert.deepEqual(streamCandidates(st, 'https://relay.example'), ['https://79.120.39.202:8000/noiserock', 'https://relay.example/s/ac49']);
  assert.deepEqual(streamCandidates(st, null), ['https://79.120.39.202:8000/noiserock']);
  assert.deepEqual(streamCandidates({ uuid: 'z', url: 'https://ice5.somafm.com/metal-128-aac' }, 'https://relay.example'), ['https://ice5.somafm.com/metal-128-aac']);
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
```

- [ ] **Step 3: Run the tests to make sure they fail**

Run: `npm test`
Expected: FAIL, with `Cannot find module '../js/config.js'` / `'../js/stations.js'`.

- [ ] **Step 4: Implement `js/config.js` and `js/stations.js`**

- **`config.js`:** the values above, plus the timing constants from Interfaces, with JSDoc typedefs for `Station` and `Genre`.
- **`displayName`:** strip one trailing parenthetical made only of bitrate/format tokens: `\d+k`, `\d+kbps`, bare numbers, `aac`, `aac+`, `mp3`, `ogg`, `opus`, `flac`, `hq`, `lq`, case-insensitive.
- **`dedupe`:** groups by `baseName`, and each group sits at its first member's position. The winner is the member with the smallest `|bitrate - 128|`, with ties going to more votes.
- **`isExcluded`:** true if any tag is in `EXCLUDE_TAGS` or `extraTags`, or the name matches `EXCLUDE_NAME`.
- **`prepareList`:** `toStation` → drop `isExcluded(s, genre?.exclude ?? [])` → keep `isPlayable` → `dedupe` → stable sort by votes, descending.

- [ ] **Step 5: Run the tests to make sure they pass**

Run: `npm test`
Expected: PASS (13 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json .nojekyll js/config.js js/stations.js test/config.test.js test/stations.test.js
git commit -m "Station logic, presets and genres"
```

---

### Task 2: Relay Worker (prove it, then wire it in or drop it)

**Files:**
- Create: `worker/package.json`, `worker/wrangler.toml`, `worker/src/http1.js`, `worker/src/index.js`, `worker/scripts/soak.mjs`, `worker/scripts/listen.html`
- Test: `worker/test/http1.test.js`
- Modify: `js/config.js` (`RELAY_BASE`, or `PRESETS[2]` in the fallback), `test/config.test.js`

**Interfaces:**
- **Produces, `worker/src/http1.js`:**
  - `isUuid(s) → boolean`
  - `buildRequest(url: URL) → string`
  - `findHeadEnd(bytes: Uint8Array) → {headEnd, bodyStart}|null`
  - `parseHead(text) → {status: number, headers: Record<string,string>}` (header names lower-cased; status 0 when the line isn't understood)
  - `resolveLocation(base: string, location: string) → string`
- **Produces, the Worker:**
  - `GET /s/{uuid}` → the station's audio, with `Content-Type` from upstream (default `audio/mpeg`), `Cache-Control: no-store`, `Access-Control-Allow-Origin: *`, `X-Content-Type-Options: nosniff`.
  - Bad uuid or unknown station → 404. A station that isn't `http://` → 400. Upstream failure → 502.
  - A `Referer` from any origin other than `https://natanforestree.github.io` or `http://localhost:*`/`http://127.0.0.1:*` → 403. A missing `Referer` is allowed.
  - `OPTIONS` → 204 with CORS headers.
- **Produces, for the site:** `RELAY_BASE = 'https://radiotext-relay.nathanforestlee.workers.dev'` on success, or stays `null` with `PRESETS[2] = FALLBACK_103` on failure.

- [ ] **Step 1: Write the failing tests** (`worker/test/http1.test.js`)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isUuid, buildRequest, findHeadEnd, parseHead, resolveLocation } from '../src/http1.js';

const enc = (s) => new TextEncoder().encode(s);

test('isUuid accepts only Radio Browser uuids', () => {
  assert.equal(isUuid('ac497573-a6c5-4505-9086-2a905134abb5'), true);
  assert.equal(isUuid('ac497573'), false);
  assert.equal(isUuid('../etc/passwd'), false);
});
test('buildRequest writes a plain HTTP/1.0 GET', () => {
  assert.equal(buildRequest(new URL('http://79.120.39.202:8000/noiserock')),
    'GET /noiserock HTTP/1.0\r\nHost: 79.120.39.202:8000\r\nUser-Agent: Radiotext-relay/1.0\r\nAccept: */*\r\nIcy-MetaData: 0\r\nConnection: close\r\n\r\n');
  assert.match(buildRequest(new URL('http://culturefailure.com:8000/;')), /^GET \/; HTTP\/1\.0\r\nHost: culturefailure\.com:8000\r\n/);
  assert.match(buildRequest(new URL('http://a.example/x?y=1')), /^GET \/x\?y=1 HTTP\/1\.0\r\nHost: a\.example\r\n/);
});
test('findHeadEnd finds CRLF and bare-LF blank lines', () => {
  assert.deepEqual(findHeadEnd(enc('HTTP/1.0 200 OK\r\nA: b\r\n\r\nBODY')), { headEnd: 21, bodyStart: 25 });
  assert.deepEqual(findHeadEnd(enc('ICY 200 OK\nx: y\n\nZ')), { headEnd: 15, bodyStart: 17 });
  assert.equal(findHeadEnd(enc('HTTP/1.0 200 OK\r\nA: b\r\n')), null);
});
test('parseHead reads HTTP and ICY status lines', () => {
  assert.deepEqual(parseHead('HTTP/1.1 200 OK\r\nContent-Type: audio/aacp\r\nicy-br:320'), { status: 200, headers: { 'content-type': 'audio/aacp', 'icy-br': '320' } });
  assert.equal(parseHead('ICY 200 OK\r\ncontent-type: audio/mpeg').status, 200);
  assert.equal(parseHead('HTTP/1.0 302 Found\r\nLocation: http://b/x').headers.location, 'http://b/x');
  assert.equal(parseHead('garbage').status, 0);
});
test('resolveLocation handles relative and absolute redirects', () => {
  assert.equal(resolveLocation('http://a:8000/x', '/y'), 'http://a:8000/y');
  assert.equal(resolveLocation('http://a/x', 'https://b/z'), 'https://b/z');
});
```

`worker/package.json`:

```json
{ "name": "radiotext-relay", "private": true, "type": "module",
  "scripts": { "test": "node --test test/*.test.js", "dev": "wrangler dev", "deploy": "wrangler deploy" },
  "devDependencies": { "wrangler": "^4.147.0" } }
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `cd worker && npm install && npm test`
Expected: FAIL, `Cannot find module '../src/http1.js'`

- [ ] **Step 3: Implement `worker/src/http1.js`**

`buildRequest` uses `url.pathname + url.search` (or `/`) and `url.host`. `parseHead` splits lines on `\r?\n`.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `cd worker && npm test`
Expected: PASS (5 tests)

- [ ] **Step 5: Implement `worker/src/index.js` and `worker/wrangler.toml`**

`wrangler.toml`:

```toml
name = "radiotext-relay"
main = "src/index.js"
compatibility_date = "2026-10-01"
workers_dev = true
```

`index.js`:

- **Station lookup:** `GET https://de1.api.radio-browser.info/json/stations/byuuid/{uuid}` with `User-Agent: Radiotext-relay/1.0`, cached in `caches.default` for 86400 s.
- **Relaying a URL (up to 3 redirects):**
  1. `connect({hostname, port: port || 80})` from `cloudflare:sockets`.
  2. Write `buildRequest`.
  3. Read until `findHeadEnd` succeeds, giving up past 16 KB or 10 s.
  4. A 3xx with a location: close the socket. If the location is https, return `fetch(location)`'s body. Otherwise relay the location.
  5. A 200: create an `IdentityTransformStream`, write the leftover body bytes, release the reader and writer locks, then `socket.readable.pipeTo(writable)` without awaiting it in the handler. Catch the pipe's rejection and `socket.close()`.
- **Keep CPU near zero:** never touch individual chunks in JS after the head.

- [ ] **Step 6: Check it locally**

Run: `cd worker && npx wrangler dev --port 8790` (in the background), then:

```bash
curl -s -m 6 http://localhost:8790/s/ac497573-a6c5-4505-9086-2a905134abb5 | wc -c        # expect > 100000 (RadCap is 320k)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8790/s/not-a-uuid               # 404
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8790/s/960de41d-0601-11e8-ae97-52543be04c81   # 400 (https station)
curl -s -o /dev/null -w "%{http_code}\n" -H "Referer: https://evil.example/" http://localhost:8790/s/ac497573-a6c5-4505-9086-2a905134abb5  # 403
```

- [ ] **Step 7: Deploy**

Run: `cd worker && npx wrangler deploy`
Expected: it prints `https://radiotext-relay.nathanforestlee.workers.dev`.

- [ ] **Step 8: Soak test, 10 minutes, on the edge**

Write `worker/scripts/soak.mjs <url> <seconds>`. It does the following:
- Streams the URL with `fetch`.
- Prints `t=<s>s bytes=<n> longestGap=<ms>` every 10 s.
- Reconnects once if the stream ends or errors.
- Exits 0 printing `PASS` only if: there was ≤1 reconnect, every reconnect gap was <3000 ms, and no gap between chunks was >3000 ms. Otherwise it prints `FAIL <reason>` and exits 1.

Run: `node worker/scripts/soak.mjs https://radiotext-relay.nathanforestlee.workers.dev/s/ac497573-a6c5-4505-9086-2a905134abb5 600`
Expected: `PASS`

- [ ] **Step 9: Chrome listening check, 10 minutes**

Write `worker/scripts/listen.html`. It has an `<audio>` whose src comes from `?src=`, plus a Play button.
1. Serve the repo with `python3 -m http.server 8791`.
2. Open `http://localhost:8791/worker/scripts/listen.html?src=<relay url above>` in **Google Chrome** via the Playwright MCP. Bundled Chromium has no AAC.
3. Click Play and wait 600 s.
4. Evaluate `[audio.paused, audio.currentTime]`.

Expected: `[false, ≥ 590]`.

- [ ] **Step 10: Wire it in, or drop it**

- **If Steps 6–9 all passed:**
  1. Set `RELAY_BASE = 'https://radiotext-relay.nathanforestlee.workers.dev'`.
  2. Change the config test to `assert.equal(RELAY_BASE, 'https://radiotext-relay.nathanforestlee.workers.dev')` (renamed `relay base points at the deployed relay`).
- **If any of them failed:** a `connect()` error to the raw IP, a Free-plan limit killing the stream, or the soak failing.
  1. Run `npx wrangler delete` in `worker/` and `git rm -r worker`.
  2. Leave `RELAY_BASE = null` and set `PRESETS[2]` to `FALLBACK_103`'s value.
  3. Change the preset test's third uuid to `'873bc6e5-2632-424c-a044-5b08b9655c19'`.
  4. **Don't try a paid plan.**
  5. Report which branch was taken and why, with the failing output.

Run: `npm test`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add -A worker js/config.js test/config.test.js
git commit -m "Relay Worker for http-only stations"      # or: "Drop relay; preset 103 is Athens Noise Rocks"
```

---

### Task 3: Saved stations, dead marks, flip list, pages

**Files:**
- Create: `js/saved.js`, `js/fliplist.js`, `js/pages.js`
- Test: `test/saved.test.js`, `test/fliplist.test.js`, `test/pages.test.js`

**Interfaces:**
- **Consumes:** `MAX_SAVED`, `DEAD_TTL_MS`, `PER_PAGE` from config, and the `Station` shape.
- **Produces, `js/saved.js`:**
  - `safeStorage(storage) → {get(key), set(key, value) → boolean}`. Values are JSON. If `storage` is missing or throws, it falls back to an in-memory Map.
  - `createSaved(store, defaults, max = MAX_SAVED) → {list() → Station[], has(uuid), add(station) → boolean, remove(uuid)}`. Key `radiotext-saved`. Seeds `defaults` only when the key is absent.
  - `createDead(store, now = Date.now, ttl = DEAD_TTL_MS) → {has(uuid), add(uuid)}`. Key `radiotext-dead`, a map of `{uuid: markedAtMs}`.
- **Produces, `js/fliplist.js`:**
  - `createFlip() → {set(list, index, source), current() → Station|null, next() → Station|null, prev() → Station|null, source() → 'saved'|'genre'|'search'|null, list() → Station[]}`. Wraps at both ends.
- **Produces, `js/pages.js`:**
  - `savedPage(i) → number` (101 + i)
  - `route(n, {savedCount, genres})` → `{kind:'home'}`, `{kind:'saved', index}`, `{kind:'genres'}`, `{kind:'genre', genre}`, `{kind:'search'}`, or `null`
  - `paginate(list, perPage, subpage) → {items, subpage, subpages}`. `subpage` is 1-based and clamped; `subpages ≥ 1`.

- [ ] **Step 1: Write the failing tests**

`test/saved.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { safeStorage, createSaved, createDead } from '../js/saved.js';

class MemStorage { m = new Map(); getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } }
const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
const st = (uuid) => ({ uuid, name: uuid, url: 'https://x/' + uuid, codec: 'MP3', bitrate: 128, tags: [], country: '', votes: 0, hls: false });
const defaults = [st('a'), st('b'), st('c')];

test('first run seeds the presets', () => {
  assert.deepEqual(createSaved(safeStorage(new MemStorage()), defaults).list().map((s) => s.uuid), ['a', 'b', 'c']);
});
test('saves persist and a removed preset stays removed', () => {
  const mem = new MemStorage();
  const one = createSaved(safeStorage(mem), defaults);
  one.remove('b'); assert.equal(one.add(st('d')), true); assert.equal(one.add(st('d')), false);
  assert.deepEqual(createSaved(safeStorage(mem), defaults).list().map((s) => s.uuid), ['a', 'c', 'd']);
});
test('blocked storage still gives the presets and keeps saves in memory', () => {
  const saved = createSaved(safeStorage(blocked), defaults);
  assert.deepEqual(saved.list().map((s) => s.uuid), ['a', 'b', 'c']);
  saved.add(st('d')); assert.equal(saved.has('d'), true);
});
test('no more than 99 saved stations', () => {
  const saved = createSaved(safeStorage(new MemStorage()), [], 99);
  for (let i = 0; i < 99; i++) assert.equal(saved.add(st('s' + i)), true);
  assert.equal(saved.add(st('extra')), false);
});
test('dead marks expire after 30 days', () => {
  let t = 1_000_000;
  const dead = createDead(safeStorage(new MemStorage()), () => t, 30 * 24 * 3600 * 1000);
  dead.add('x'); assert.equal(dead.has('x'), true);
  t += 30 * 24 * 3600 * 1000; assert.equal(dead.has('x'), false);
});
```

`test/fliplist.test.js`:

```js
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
```

`test/pages.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { savedPage, route, paginate } from '../js/pages.js';
import { GENRES } from '../js/config.js';

test('page numbers route to the right place', () => {
  const ctx = { savedCount: 3, genres: GENRES };
  assert.deepEqual(route(100, ctx), { kind: 'home' });
  assert.deepEqual(route(102, ctx), { kind: 'saved', index: 1 });
  assert.equal(route(104, ctx), null);
  assert.deepEqual(route(200, ctx), { kind: 'genres' });
  assert.equal(route(212, ctx).genre.label, 'SLUDGE');
  assert.equal(route(229, ctx), null);
  assert.deepEqual(route(300, ctx), { kind: 'search' });
  assert.equal(savedPage(0), 101);
});
test('paginate clamps and counts subpages', () => {
  const list = Array.from({ length: 17 }, (_, i) => i);
  assert.deepEqual(paginate(list, 8, 3), { items: [16], subpage: 3, subpages: 3 });
  assert.deepEqual(paginate(list, 8, 9).subpage, 3);
  assert.deepEqual(paginate([], 8, 1), { items: [], subpage: 1, subpages: 1 });
});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `npm test`
Expected: FAIL, with missing modules `saved.js`, `fliplist.js`, `pages.js`.

- [ ] **Step 3: Implement `js/saved.js`, `js/fliplist.js`, `js/pages.js`** to the interfaces above.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/saved.js js/fliplist.js js/pages.js test/saved.test.js test/fliplist.test.js test/pages.test.js
git commit -m "Saved stations, dead marks, flip list and page routing"
```

---

### Task 4: Radio Browser and now-playing clients

**Files:**
- Create: `js/radiobrowser.js`, `js/nowplaying.js`
- Test: `test/radiobrowser.test.js`, `test/nowplaying.test.js`

**Interfaces:**
- **Consumes:** `SERVERS_URL`, `API_FALLBACK`, `LIST_LIMIT`, `SEARCH_LIMIT`, and the `Genre` shape.
- **Produces, `js/radiobrowser.js`:**
  - `createRadioBrowser({fetch, random = Math.random}) → {byGenre(genre) → Promise<raw[]>, search(text) → Promise<raw[]>, countClick(uuid) → Promise<void>}`. Returns raw API rows; the caller runs `prepareList`.
- **Produces, `js/nowplaying.js`:**
  - `sourceFor(station) → {kind:'soma'|'laut', id}|null`
  - `parseSoma(json, id) → string|null`
  - `parseLaut(json) → string|null`
  - `fetchSong(source, fetch) → Promise<string|null>`. Never rejects; returns null on any failure.

How the client works:
- **Server choice:** the base is chosen once, lazily. Fetch `SERVERS_URL`, pick `rows[Math.floor(random() * rows.length)].name`, and use `https://<name>`. On any error or an empty list, use `API_FALLBACK`.
- **Retry:** a failed request on a non-fallback base is retried once on `API_FALLBACK`.
- **`byGenre`:** requests each of `genre.tags`, then merges unique rows by `stationuuid`, sorted by votes descending. It throws if every request failed.
- **`search(text)`:** for blank text, returns `[]` without fetching. Otherwise it makes a `name=` request and a `tag=` request (no `tagExact`), each with `limit=SEARCH_LIMIT`, and merges them the same way.
- **`countClick`:** `GET <base>/json/url/<uuid>`. Errors are swallowed.

- [ ] **Step 1: Write the failing tests**

`test/radiobrowser.test.js`:

```js
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
```

`test/nowplaying.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `npm test`
Expected: FAIL, with missing modules.

- [ ] **Step 3: Implement both modules**

The now-playing URLs are `https://api.somafm.com/channels.json` and `https://api.laut.fm/station/<id>/current_song`.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/radiobrowser.js js/nowplaying.js test/radiobrowser.test.js test/nowplaying.test.js
git commit -m "Radio Browser and now-playing clients"
```

---

### Task 5: Player (tuning, retries, stop) and static

**Files:**
- Create: `js/reconnect.js`, `js/player.js`, `js/static.js`, `test/fake-audio.js`
- Test: `test/reconnect.test.js`, `test/player.test.js`

**Interfaces:**
- **Consumes:** `streamCandidates`, `httpsVariant` (stations.js); `createDead().has/add` (saved.js); `TUNE_TIMEOUT_MS`, `STALL_MS`, `GIVE_UP_MS`, `STOP_DROP_MS`, `STATIC_MAX_MS`.
- **Produces, `js/reconnect.js`:**
  - `backoffDelay(attempt, elapsedMs) → number|null`: 1000, 2000, 4000, 8000 for attempts 0–3, then 15000. Returns null once `elapsedMs ≥ GIVE_UP_MS`.
- **Produces, `js/player.js`:**
  - `createPlayer({audio, relayBase, dead, online = () => navigator.onLine, onChange = () => {}}) → {tune(station), stop(), resume(), get state()}`
  - `state = {kind, station}`, where `kind` is one of `'off'|'tuning'|'playing'|'retrying'|'lost'|'unavailable'`. `onChange(state)` is called on every change.
- **Produces, `js/static.js`:**
  - `createStatic({AudioContext, maxMs = STATIC_MAX_MS, gain = 0.08}) → {start(), stop()}`
  - `start()` resumes the context, then loops a 1 s white-noise buffer through a gain node. It stops itself after `maxMs`.

How the player behaves (the tests below pin it):
- **Tuning:**
  1. `tune(station)` cancels all timers and any retry, then walks `streamCandidates(station, relayBase)`.
  2. For each candidate it sets `audio.src`, calls `audio.play()` (catching the rejection), and arms `TUNE_TIMEOUT_MS`.
  3. On `playing` it records that candidate as the working URL and goes to `playing`.
  4. On `error` or timeout it moves to the next candidate.
- **All candidates fail:** the state becomes `unavailable`. If the station's url is `http:`, `relayBase` is null and `online()` is true, call `dead.add(uuid)`.
- **While playing:**
  - `error` or `ended` starts a retry.
  - `waiting` or `stalled` arms `STALL_MS`. A `playing` event clears it; if it expires, a retry starts.
- **Retry:**
  - The first retry notes its start time. Each attempt waits `backoffDelay(attempt, now - start)`, then re-sets `audio.src` to the working URL and plays.
  - `playing` goes back to `playing` and resets the retry clock.
  - `error`, or no `playing` within `TUNE_TIMEOUT_MS`, schedules the next attempt.
  - When `backoffDelay` returns null, the state becomes `lost`, the src is removed, and `load()` is called.
- **Stop:** `stop()` pauses, sets the state to `off`, and keeps `src` (so lock-screen controls stay). After `STOP_DROP_MS` it removes `src` and calls `load()`.
- **Resume:** `resume()` calls `tune(state.station)` when there is one.
- **Stale events:** event handlers ignore events unless `audio.src` equals the URL this player most recently assigned and the player is in a state expecting them. Every timer callback checks a generation counter bumped by `tune`, `stop` and `resume`.

- [ ] **Step 1: Write the failing tests**

`test/fake-audio.js`:

```js
export class FakeAudio extends EventTarget {
  src = ''; paused = true; plays = 0; loads = 0;
  play() { this.paused = false; this.plays++; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() { this.loads++; }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  fire(type) { this.dispatchEvent(new Event(type)); }
}
```

`test/reconnect.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { backoffDelay } from '../js/reconnect.js';

test('backoff is 1, 2, 4, 8 s then 15 s, and stops at 2 minutes', () => {
  assert.deepEqual([backoffDelay(0, 0), backoffDelay(1, 1000), backoffDelay(2, 3000), backoffDelay(3, 7000), backoffDelay(4, 15000), backoffDelay(9, 119999)],
    [1000, 2000, 4000, 8000, 15000, 15000]);
  assert.equal(backoffDelay(10, 120000), null);
});
```

`test/player.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer } from '../js/player.js';
import { FakeAudio } from './fake-audio.js';

const HTTPS = { uuid: 'soma', url: 'https://ice5.somafm.com/metal-128-aac' };
const HTTP = { uuid: 'radcap', url: 'http://79.120.39.202:8000/noiserock' };
const RELAY = 'https://relay.example';
const deadSpy = () => { const added = []; return { added, has: (u) => added.includes(u), add: (u) => added.push(u) }; };
const setup = (t, opts = {}) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const audio = new FakeAudio(); const dead = deadSpy(); const kinds = [];
  const p = createPlayer({ audio, relayBase: RELAY, dead, online: () => true, onChange: (s) => kinds.push(s.kind), ...opts });
  return { audio, dead, kinds, p };
};

test('an https station plays directly', (t) => {
  const { audio, kinds, p } = setup(t);
  p.tune(HTTPS); assert.equal(audio.src, HTTPS.url);
  audio.fire('playing'); assert.deepEqual(kinds, ['tuning', 'playing']);
});
test('an http station tries https first, then the relay', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTP); assert.equal(audio.src, 'https://79.120.39.202:8000/noiserock');
  audio.fire('error'); assert.equal(audio.src, RELAY + '/s/radcap');
  audio.fire('playing'); assert.equal(p.state.kind, 'playing');
});
test('a candidate that never starts times out after 8 s', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTP); t.mock.timers.tick(7999); assert.equal(audio.src, 'https://79.120.39.202:8000/noiserock');
  t.mock.timers.tick(1); assert.equal(audio.src, RELAY + '/s/radcap');
});
test('a stale tune timeout never touches the next station', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTP); t.mock.timers.tick(5000);
  p.tune(HTTPS); t.mock.timers.tick(3000);
  assert.equal(audio.src, HTTPS.url); assert.equal(p.state.kind, 'tuning'); assert.equal(p.state.station.uuid, 'soma');
});
test('marks an http station dead only with no relay and while online', (t) => {
  const a = setup(t, { relayBase: null });
  a.p.tune(HTTP); a.audio.fire('error');
  assert.equal(a.p.state.kind, 'unavailable'); assert.deepEqual(a.dead.added, ['radcap']);
});
test('does not mark a station dead while offline', (t) => {
  const { audio, dead, p } = setup(t, { relayBase: null, online: () => false });
  p.tune(HTTP); audio.fire('error');
  assert.equal(p.state.kind, 'unavailable'); assert.deepEqual(dead.added, []);
});
test('never marks dead when a relay exists or the station is https', (t) => {
  const { audio, dead, p } = setup(t);
  p.tune(HTTP); audio.fire('error'); audio.fire('error');
  p.tune(HTTPS); audio.fire('error');
  assert.equal(p.state.kind, 'unavailable'); assert.deepEqual(dead.added, []);
});
test('a dropped stream retries at 1, 2, 4, 8 then every 15 s and gives up at 2 minutes', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing');
  audio.fire('error'); assert.equal(p.state.kind, 'retrying');
  const n = audio.plays;
  t.mock.timers.tick(999); assert.equal(audio.plays, n);
  t.mock.timers.tick(1); assert.equal(audio.plays, n + 1); assert.equal(audio.src, HTTPS.url);
  audio.fire('error'); t.mock.timers.tick(2000); assert.equal(audio.plays, n + 2);
  for (let i = 0; i < 20 && p.state.kind === 'retrying'; i++) { audio.fire('error'); t.mock.timers.tick(15000); }
  assert.equal(p.state.kind, 'lost'); assert.equal(audio.src, '');
});
test('a successful retry resets the backoff', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing');
  audio.fire('error'); t.mock.timers.tick(1000); audio.fire('playing');
  assert.equal(p.state.kind, 'playing');
  const n = audio.plays; audio.fire('error'); t.mock.timers.tick(1000); assert.equal(audio.plays, n + 1);
});
test('play after giving up reconnects', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing');
  for (let i = 0; i < 20 && p.state.kind !== 'lost'; i++) { audio.fire('error'); t.mock.timers.tick(15000); }
  p.resume(); assert.equal(audio.src, HTTPS.url); assert.equal(p.state.kind, 'tuning');
});
test('a stall of 10 s starts a retry; playing again cancels it', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing');
  audio.fire('waiting'); t.mock.timers.tick(5000); audio.fire('playing'); t.mock.timers.tick(10000);
  assert.equal(p.state.kind, 'playing');
  audio.fire('waiting'); t.mock.timers.tick(9999); assert.equal(p.state.kind, 'playing');
  t.mock.timers.tick(1); assert.equal(p.state.kind, 'retrying');
});
test('stop pauses now and drops the connection after 30 s; resume goes live', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing'); p.stop();
  assert.equal(audio.paused, true); assert.equal(audio.src, HTTPS.url); assert.equal(p.state.kind, 'off');
  audio.fire('error'); assert.equal(p.state.kind, 'off');
  t.mock.timers.tick(30000); assert.equal(audio.src, '');
  p.resume(); assert.equal(audio.src, HTTPS.url); assert.equal(p.state.kind, 'tuning');
});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `npm test`
Expected: FAIL, with missing modules `reconnect.js`, `player.js`.

- [ ] **Step 3: Implement `js/reconnect.js`, `js/player.js`, `js/static.js`**

`static.js` touches only Web Audio; it isn't unit tested and is checked by ear in Task 7.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/reconnect.js js/player.js js/static.js test/fake-audio.js test/reconnect.test.js test/player.test.js
git commit -m "Player: https-first tuning, relay fallback, retries, stop; static burst"
```

---

### Task 6: The Teletext look, with renderers and mosaic art

**Files:**
- Create: `index.html`, `styles.css`, `fonts/bedstead.otf`, `js/render.js`, `js/mosaic.js`
- Test: `test/render.test.js`, `test/mosaic.test.js`

**Interfaces:**
- **Consumes:** `displayName`, `shortTag` (stations.js); `savedPage`, `paginate` (pages.js); `GENRES`, `PER_PAGE`.
- **Produces, `js/render.js`** (all return HTML strings; every API-derived string goes through `escapeHtml`):
  - `escapeHtml(s) → string`
  - `renderHeader(page: number|string, now: Date) → string`. Three spans: `.pg` `P<page>`, `.nm` `RADIOTEXT`, `.clk` `HH:MM` (24-hour, zero-padded).
  - `renderOnAir({station, kind, song, saved}) → string`. Shows the big double-height name, the short tag and country, a status/song line, and a `data-star` toggle when there's a station.
  - `renderHome({onAir, saved: Station[], currentUuid}) → string`
  - `renderGenres(genres) → string`
  - `renderList({page, title, stations, subpage, savedUuids: Set, currentUuid, from: 'genre'|'search', status: 'loading'|'ready'|'error'}) → string`
  - `renderSearch({query, list}) → string`, where `list` is a `renderList` argument or null
  - `renderFastext({page, playing: boolean}) → string`
- **Action attributes `main.js` relies on:**
  - `data-tune="<uuid>" data-from="saved|genre|search"`
  - `data-star="<uuid>"`
  - `data-page="<n>"`
  - `data-sub="prev|next"`
  - `data-key="prev|play|next|browse"`
  - the search form: `<form data-search><input name="q" …></form>`
  - the current row gets class `cur`
- **Produces, `js/mosaic.js`:**
  - `mosaicSvg(rows: string[], colors: Record<string,string>) → string`. An `<svg viewBox="0 0 W H" shape-rendering="crispEdges">` with one `<rect>` per horizontal run of the same non-`.` character.
  - `TITLE_STRIPE` and `ANTENNA` (row arrays) plus `MOSAIC_COLORS` (character → Teletext colour variable), drawn by the implementer: a mosaic band under the title, and a small radio mast with signal arcs, each at most 32×12 cells.

Status line by `kind`:
- `off`: `OFF AIR — PRESS PLAY`
- `tuning`: `TUNING…`
- `playing`: the song if known, otherwise the short tag and country
- `retrying`: `NO SIGNAL — RETRYING`
- `lost`: `NO SIGNAL — PRESS PLAY`
- `unavailable`: `PAGE NOT AVAILABLE`

List status:
- `loading`: `SEARCHING…`
- `error`: `PAGE NOT AVAILABLE`
- ready but empty: `NO STATIONS FOUND`

- [ ] **Step 1: Write the failing tests**

`test/render.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, renderHeader, renderOnAir, renderHome, renderList, renderFastext, renderSearch } from '../js/render.js';
import { PRESETS } from '../js/config.js';

test('escapeHtml escapes markup characters', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});
test('renderList escapes station names and tags', () => {
  const evil = { uuid: 'e', name: '<img src=x onerror=alert(1)>', tags: ['<b>'], country: 'US', votes: 1, bitrate: 128 };
  const html = renderList({ page: 210, title: 'NOISE ROCK', stations: [evil], subpage: 1, savedUuids: new Set(), currentUuid: null, from: 'genre', status: 'ready' });
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});
test('header shows page, name and a zero-padded clock', () => {
  const html = renderHeader(100, new Date(2026, 9, 22, 7, 5));
  assert.ok(html.includes('P100') && html.includes('RADIOTEXT') && html.includes('07:05'));
});
test('home lists saved stations as pages 101.. and marks the current one', () => {
  const html = renderHome({ onAir: { station: PRESETS[1], kind: 'playing', song: null, saved: true }, saved: PRESETS, currentUuid: PRESETS[1].uuid });
  assert.match(html, /class="row cur"[^>]*data-tune="960de41d-0601-11e8-ae97-52543be04c81"/);
  for (const n of ['101', '102', '103']) assert.ok(html.includes(n));
  assert.ok(html.includes('data-page="200"') && html.includes('data-page="300"'));
});
test('on-air status lines follow the player state', () => {
  assert.ok(renderOnAir({ station: null, kind: 'off', song: null, saved: false }).includes('OFF AIR — PRESS PLAY'));
  assert.ok(renderOnAir({ station: PRESETS[0], kind: 'retrying', song: null, saved: true }).includes('NO SIGNAL — RETRYING'));
  assert.ok(renderOnAir({ station: PRESETS[0], kind: 'lost', song: null, saved: true }).includes('NO SIGNAL — PRESS PLAY'));
  assert.ok(renderOnAir({ station: PRESETS[0], kind: 'unavailable', song: null, saved: true }).includes('PAGE NOT AVAILABLE'));
  assert.ok(renderOnAir({ station: PRESETS[1], kind: 'playing', song: 'Tulus - 09 Sabbat', saved: true }).includes('Tulus - 09 Sabbat'));
});
test('lists show stars, subpages and states', () => {
  const st = (uuid) => ({ uuid, name: uuid, tags: ['noise'], country: 'DE', votes: 1, bitrate: 128 });
  const stations = Array.from({ length: 9 }, (_, i) => st('s' + i));
  const html = renderList({ page: 211, title: 'NOISE', stations, subpage: 1, savedUuids: new Set(['s0']), currentUuid: null, from: 'genre', status: 'ready' });
  assert.ok(html.includes('1/2') && html.includes('data-sub="next"'));
  assert.match(html, /data-star="s0"[^>]*>★/); assert.match(html, /data-star="s1"[^>]*>☆/);
  assert.ok(renderList({ page: 211, title: 'NOISE', stations: [], subpage: 1, savedUuids: new Set(), currentUuid: null, from: 'genre', status: 'loading' }).includes('SEARCHING…'));
  assert.ok(renderList({ page: 211, title: 'NOISE', stations: [], subpage: 1, savedUuids: new Set(), currentUuid: null, from: 'genre', status: 'error' }).includes('PAGE NOT AVAILABLE'));
  assert.ok(renderList({ page: 211, title: 'NOISE', stations: [], subpage: 1, savedUuids: new Set(), currentUuid: null, from: 'genre', status: 'ready' }).includes('NO STATIONS FOUND'));
});
test('search keeps the escaped query in the box', () => {
  assert.ok(renderSearch({ query: '"><script>', list: null }).includes('value="&quot;&gt;&lt;script&gt;"'));
});
test('fastext labels follow page and play state', () => {
  const home = renderFastext({ page: 100, playing: false });
  for (const l of ['◀ PREV', '▶ PLAY', 'NEXT ▶', 'BROWSE']) assert.ok(home.includes(l));
  const other = renderFastext({ page: 212, playing: true });
  assert.ok(other.includes('■ STOP') && other.includes('HOME'));
  for (const k of ['prev', 'play', 'next', 'browse']) assert.ok(home.includes(`data-key="${k}"`));
});
```

`test/mosaic.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mosaicSvg } from '../js/mosaic.js';

test('one rect per run, transparent dots, exact viewBox', () => {
  const svg = mosaicSvg(['RR.', '.BB'], { R: 'var(--red)', B: 'var(--blue)' });
  assert.ok(svg.includes('viewBox="0 0 3 2"') && svg.includes('shape-rendering="crispEdges"'));
  assert.equal((svg.match(/<rect/g) || []).length, 2);
  assert.ok(svg.includes('x="0" y="0" width="2" height="1" fill="var(--red)"'));
  assert.ok(svg.includes('x="1" y="1" width="2" height="1" fill="var(--blue)"'));
});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `npm test`
Expected: FAIL, with missing modules `render.js`, `mosaic.js`.

- [ ] **Step 3: Implement `js/render.js` and `js/mosaic.js`**

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Add the font, page shell and styles**

- **Font:** `curl -sL -o fonts/bedstead.otf https://bjh21.me.uk/bedstead/bedstead.otf` (about 218 KB).
- **`index.html` contains:**
  - `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
  - `<meta name="theme-color" content="#000000">`
  - `<title>Radiotext</title>`
  - `<link rel="stylesheet" href="styles.css">`
  - `<div id="screen"><header id="hdr"></header><main id="page"></main><nav id="fastext"></nav></div>`
  - `<audio id="radio" preload="none"></audio>`
  - `<script type="module" src="js/main.js"></script>`
- **`styles.css`:**
  - `@font-face` Bedstead, plus the 8 colour tokens from Global Constraints.
  - `html, body` have a `var(--black)` background; `#screen` has max-width 480 px, is centred, and is a full-height flex column.
  - `#fastext` is a sticky-bottom 2×2 grid with keys at least 64 px tall, using `env(safe-area-inset-bottom)` padding. Keys are red, green, yellow and cyan with black text.
  - Rows are at least 44 px; `.cur` is inverse video (white background, black text).
  - `.dh` is double height: `display: inline-block; transform: scaleY(2); transform-origin: top`, with room reserved below.
  - The title band is a blue background with yellow text.
  - No horizontal overflow at 320 px.
- **Mockup:** match option B in `docs/superpowers/specs/2026-10-22-radiotext-mockups.html`.

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css fonts/bedstead.otf js/render.js js/mosaic.js test/render.test.js test/mosaic.test.js
git commit -m "Teletext look: renderers, mosaic art, Bedstead, page shell"
```

---

### Task 7: Wiring, Media Session, and the Chrome check

**Files:**
- Create: `js/mediasession.js`, `js/main.js`
- Test: `test/mediasession.test.js`

**Interfaces:**
- **Consumes:** everything above.
- **Produces, `js/mediasession.js`:**
  - `buildMetadata({station, song}) → {title, artist, album, artwork}`
  - `playbackStateFor(kind) → 'playing'|'paused'|'none'`
  - `bindMediaSession(ms, {play, stop, next, prev}) → void`

Details:
- **`buildMetadata`:** `title` is the song, or `displayName(station)`. `artist` is `displayName(station)`. `album` is `'Radiotext'`. `artwork` is `[{src:'icons/icon-192.png', sizes:'192x192', type:'image/png'}, {src:'icons/icon-512.png', sizes:'512x512', type:'image/png'}]`.
- **`playbackStateFor`:** `tuning`, `playing` and `retrying` → `'playing'`; `off`, `lost` and `unavailable` → `'paused'`; no station → `'none'` (pass `kind = null`).
- **`bindMediaSession`:** sets the handlers `play`, `pause`→stop, `stop`, `nexttrack`→next and `previoustrack`→prev. It sets `seekbackward`, `seekforward` and `seekto` to `null`. Each `setActionHandler` call is in its own try/catch, and a missing `ms` is a no-op.

- [ ] **Step 1: Write the failing test** (`test/mediasession.test.js`)

```js
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
```

- [ ] **Step 2: Run the test to make sure it fails, then implement `js/mediasession.js`, then run it to make sure it passes**

Run: `npm test`
Expected: first FAIL (missing module), then PASS.

- [ ] **Step 3: Implement `js/main.js`**

App state is `{page, subpage, query, lists: Map<page, {status, stations}>, song}`. On load:
- **Storage:** `store = safeStorage(globalThis.localStorage)`, `saved = createSaved(store, PRESETS)`, `dead = createDead(store)`, `canPlay = (m) => audio.canPlayType(m) !== ''`.
- **Player:** `player = createPlayer({audio, relayBase: RELAY_BASE, dead, onChange})`. `onChange` re-renders the on-air area and fastext, and updates Media Session metadata and `playbackState`. On `playing`, `unavailable` or `off` it calls `static.stop()`.
- **Flip list:** `flip.set(saved.list(), 0, 'saved')`. Nothing plays until the user presses PLAY or a row (browsers need a gesture).
- **Clicks** are delegated on `#page` and `#fastext`:
  - `data-tune`: set the flip list from the source list (the saved list, or the full prepared genre/search list, not just the visible subpage) at that index, then tune.
  - `data-star`: toggle saved (`add`/`remove`). If the flip source is `'saved'`, rebuild it, keeping the current station's index where it's still present. Re-render.
  - `data-page`: navigate.
  - `data-sub`: change the subpage.
  - `data-key`:
    - `prev`/`next`: flip and tune, starting static first when `STATIC_ENABLED` and `document.visibilityState === 'visible'`.
    - `play`: `stop()` when the state is playing, tuning or retrying; otherwise `resume()`, or tune `flip.current()`.
    - `browse`: page 200 from 100, otherwise page 100.
- **Tuning:** every tune also calls `rb.countClick(uuid)` and restarts now-playing polling.
- **Now playing:** `fetchSong(sourceFor(station), fetch)` immediately, then every `POLL_MS` while the state is `playing`. A song updates the on-air area and the metadata.
- **Navigating to a genre:** if the page isn't cached, render `loading`, then `rb.byGenre(genre)` → `prepareList(raws, {canPlay, dead, genre})` → `ready`. A rejection gives `error`. Lists are cached for the session.
- **Search:** submitting the form sets `query` and runs `rb.search(q)` → `prepareList(raws, {canPlay, dead, genre: null})`.
- **Keyboard** (ignored while the search input has focus):
  - ArrowLeft/ArrowRight: prev/next. Space: play/stop. Escape: page 100.
  - Digits fill a 3-digit page number shown in the header's `.pg` slot (as `P2__`). On the third digit, `route()` it: `saved` tunes that preset; `null` restores the previous page number. The buffer clears after 3 s idle.
- **Clock:** `renderHeader` every 15 s.
- **Media Session:** `bindMediaSession(navigator.mediaSession, {...})` once at startup.

- [ ] **Step 4: Run all unit tests**

Run: `npm test`
Expected: PASS (all files)

- [ ] **Step 5: Chrome check**

Serve with `python3 -m http.server 8792` from the repo root (a fresh port avoids stale caches) and open `http://localhost:8792/` in **Google Chrome** via the Playwright MCP. Bundled Chromium has no AAC. Check each item, using `browser_evaluate` for audio state (`!audio.paused && audio.currentTime` rising over 5 s counts as playing):

1. **Home:** page 100 shows 12XU, Metal Detector and RadCap as 101–103 (or Athens Noise Rocks if Task 2 fell back). There's no horizontal scroll at 320 px or 390 px width.
2. **Presets:** PLAY tunes 101 and audio plays. NEXT → 102 plays. NEXT → 103 plays (through the relay, if one exists). NEXT wraps to 101. PREV goes back.
3. **Static:** a short static burst is audible or measurable on each flip. Check with an AnalyserNode tap if needed: `AudioContext` state is `running` right after the flip.
4. **Browse:** BROWSE → 200 lists 19 genres. 210 NOISE ROCK lists stations with stars. Tapping one plays it, and NEXT walks that genre's list.
5. **Save and unsave:** star a station on 210 → HOME shows it as 104. Unstar it → it's gone. Reload → saves persist.
6. **Search:** 300 → search "metal" lists results. Tapping one plays it.
7. **Reconnect:** while playing, DevTools offline (`browser_evaluate` can't do this; use the MCP's network emulation if it has it, or Chrome DevTools Protocol `Network.emulateNetworkConditions`) → the on-air area shows `NO SIGNAL — RETRYING` → back online → it plays again.
8. **Stop:** STOP shows `▶ PLAY`, and `audio.paused` is true. After 30 s, `audio.src === ''`. PLAY reconnects.
9. **Media Session:** `navigator.mediaSession.metadata.title` is the station or song, and `playbackState` follows play and stop.
10. **Keyboard:** typing `2`, `1`, `2` opens SLUDGE.
11. **Console:** no errors.

- [ ] **Step 6: Commit**

```bash
git add js/main.js js/mediasession.js test/mediasession.test.js
git commit -m "Wire the radio: pages, flipping, saving, search, lock-screen controls"
```

---

### Task 8: Home screen, README, publish

**Files:**
- Create: `manifest.webmanifest`, `tools/make_icons.py`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/apple-touch-icon.png`, `README.md`
- Modify: `index.html` (manifest, icons, `apple-mobile-web-app-*` metas)

**Interfaces:**
- **Consumes:** the mosaic idea from Task 6.
- **Produces:** the live site at `https://natanforestree.github.io/radiotext/`.

- [ ] **Step 1: Icons**

`tools/make_icons.py` uses Pillow to draw a Teletext tile: a black background, a small mosaic mast with signal arcs in yellow/cyan on a blue band. It's drawn on a small grid and scaled with `Image.NEAREST` to 512, 192 and 180 (apple-touch-icon).

Run: `python3 tools/make_icons.py && python3 -c "from PIL import Image; print([Image.open(f'icons/{n}').size for n in ('icon-512.png','icon-192.png','apple-touch-icon.png')])"`
Expected: `[(512, 512), (192, 192), (180, 180)]`

- [ ] **Step 2: Manifest and metas**

`manifest.webmanifest`:

```json
{ "name": "Radiotext", "short_name": "Radiotext", "start_url": "./", "scope": "./", "display": "standalone",
  "background_color": "#000000", "theme_color": "#000000",
  "icons": [ { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
             { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" } ] }
```

`index.html` gets:
- `<link rel="manifest" href="manifest.webmanifest">`
- `<link rel="icon" href="icons/icon-192.png">`
- `<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">`
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="black">`
- `<meta name="apple-mobile-web-app-title" content="Radiotext">`

- [ ] **Step 3: README**

Cover:
- what it is
- how to use it: pages, the fastext keys, car next/prev, adding to the home screen
- that saved stations live on the device (and that iPhone home-screen and Safari storage are separate)
- the relay: what it is, its free plan, and that it only relays Radio Browser stations by uuid (or that it was dropped, and why)
- **the phone check:** if audio stops when the phone locks in the home-screen app, use it in a Safari tab, and turn off `STATIC_ENABLED` if static seems to cause it
- development: `npm test`, `python3 -m http.server`, `cd worker && npm test && npx wrangler deploy`

- [ ] **Step 4: Run all tests and commit**

Run: `npm test` (and `cd worker && npm test` if the relay exists)
Expected: PASS

```bash
git add manifest.webmanifest tools/make_icons.py icons README.md index.html
git commit -m "Home-screen app, icons and README"
```

- [ ] **Step 5: Publish**

```bash
gh repo create natanforestree/radiotext --public --source . --push
gh api -X POST repos/natanforestree/radiotext/pages -f 'source[branch]=main' -f 'source[path]=/'
```

Poll `gh api repos/natanforestree/radiotext/pages/builds/latest --jq .status` until it says `built`.

- [ ] **Step 6: Live check**

Repeat Task 7 Step 5 items 1, 2, 4 and 11 on `https://natanforestree.github.io/radiotext/` in Google Chrome, and confirm `manifest.webmanifest` and the icons load (200).

---

## Self-review notes

- **Spec coverage:**
  - §2 goals: Tasks 1–8.
  - §5 pages: Tasks 3, 6, 7.
  - §6 fastext and keyboard: Tasks 6, 7.
  - §7 car playback: Task 5 (state machine), Task 7 (Media Session, polling, static).
  - §8 data and https-first: Tasks 1, 4, 5.
  - §9 relay and fallback: Task 2.
  - §10 storage: Task 3.
  - §11 look: Task 6.
  - §12 hosting and checks: Tasks 7, 8.
  - §13 calls: all honoured; RadCap is the 320k entry.
- **Decided here (spec left it to the builder):**
  - "no wave" dropped (0 stations).
  - Tag variants and the hardcore `exclude` list.
  - Global exclusions for sleep, noise-colour and adult stations.
  - 8 rows per subpage.
  - Search results become the flip list when tapped.
  - The relay checks `Referer` (missing is allowed).
  - Stop keeps `src` for 30 s so lock-screen controls survive a short pause.
  - The fallback preset is Athens Noise Rocks.
  - All 19 genres are always listed on page 200, and an empty one says `NO STATIONS FOUND`. The spec says empty genres are hidden, but that would mean fetching all 19 lists on every visit. The one empty genre, "no wave", was dropped instead.
- **Can't be automated:** Nathan's phone check (lock screen, car next/prev, background play in the home-screen app vs a Safari tab). The controller sends him the relay link after Task 2 and the live link after Task 8.
