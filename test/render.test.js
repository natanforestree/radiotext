import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, renderHeader, renderOnAir, renderStatus, renderHome, renderRail, renderDesk, renderIndex, renderGenres, renderSection, renderList, renderFastext, renderSearch, renderDiag, renderPad, renderVisuals } from '../js/render.js';
import { GENRES, SECTIONS } from '../js/config.js';

// The stations that used to be the presets, kept as fixtures.
const STATIONS = [
  { uuid: '963b7906-0601-11e8-ae97-52543be04c81', name: '12XU', url: 'https://stream.laut.fm/12xu', codec: 'MP3', bitrate: 128,
    tags: ['garage punk', 'indie rock', 'noise rock', 'post-punk', 'punk'], country: 'DE', votes: 433, hls: false },
  { uuid: '960de41d-0601-11e8-ae97-52543be04c81', name: 'SomaFM Metal Detector', url: 'https://ice5.somafm.com/metal-128-aac', codec: 'AAC', bitrate: 128,
    tags: ['black metal', 'doom metal', 'post-punk', 'progressive rock', 'sludge', 'stoner rock'], country: 'US', votes: 7731, hls: false },
  { uuid: 'ac497573-a6c5-4505-9086-2a905134abb5', name: 'RadCap Noise Rock', url: 'http://79.120.39.202:8000/noiserock', codec: 'AAC+', bitrate: 320,
    tags: ['noise rock', 'rock'], country: 'RU', votes: 19, hls: false },
];

test('escapeHtml escapes markup characters', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});
test('renderList escapes station names and tags', () => {
  const evil = { uuid: 'e', name: '<img src=x onerror=alert(1)>', tags: ['<b>'], country: 'US', votes: 1, bitrate: 128 };
  const html = renderList({ page: 210, title: 'NOISE ROCK', stations: [evil], subpage: 1, savedUuids: new Set(), currentUuid: null, from: 'genre', status: 'ready' });
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});
test('header shows name, page, date and a zero-padded clock', () => {
  const html = renderHeader(100, new Date(2026, 9, 22, 7, 5));
  assert.ok(html.includes('Page 100') && html.includes('Radiotext') && html.includes('Thu 22 Oct') && html.includes('07:05'));
});
test('home lists saved stations as pages 101.. and marks the current one', () => {
  const html = renderHome({ onAir: { station: STATIONS[1], kind: 'playing', song: null, saved: true }, saved: STATIONS, currentUuid: STATIONS[1].uuid });
  assert.match(html, /class="row cur"[^>]*data-tune="960de41d-0601-11e8-ae97-52543be04c81"/);
  for (const n of ['101', '102', '103']) assert.ok(html.includes(n));
  assert.ok(html.includes('data-page="200"') && html.includes('data-page="300"') && html.includes('data-page="999"'));
});
test('the engineering log lists notes newest first, escaped, with copy and clear keys', () => {
  const at = new Date(2026, 9, 23, 7, 5, 9).getTime();
  const html = renderDiag([[at, 'remote', 'pause'], [at + 1000, 'state', 'off <b>X</b>']], {});
  assert.ok(html.indexOf('07:05:10') < html.indexOf('07:05:09'));
  assert.ok(html.includes('off &lt;b&gt;X&lt;/b&gt;') && !html.includes('<b>'));
  assert.ok(html.includes('data-diag="copy"') && html.includes('data-diag="clear"'));
  assert.ok(html.includes('id="status"'));
  assert.ok(renderDiag([], {}).includes('Nothing logged yet'));
});
test('on-air status lines follow the player state', () => {
  assert.ok(renderOnAir({ station: null, kind: 'off', song: null, saved: false }).includes('Off air — press Play'));
  assert.ok(renderOnAir({ station: STATIONS[0], kind: 'retrying', song: null, saved: true }).includes('No signal — retrying'));
  assert.ok(renderOnAir({ station: STATIONS[0], kind: 'lost', song: null, saved: true }).includes('No signal — press Play'));
  assert.ok(renderOnAir({ station: STATIONS[0], kind: 'unavailable', song: null, saved: true }).includes('Page not available'));
  assert.ok(renderOnAir({ station: STATIONS[1], kind: 'playing', song: 'Tulus - 09 Sabbat', saved: true }).includes('Tulus - 09 Sabbat'));
});
test('lists show stars, subpages and states', () => {
  const st = (uuid) => ({ uuid, name: uuid, tags: ['noise'], country: 'DE', votes: 1, bitrate: 128 });
  const stations = Array.from({ length: 9 }, (_, i) => st('s' + i));
  const html = renderList({ page: 211, title: 'NOISE', stations, subpage: 1, savedUuids: new Set(['s0']), currentUuid: null, from: 'genre', status: 'ready' });
  assert.ok(html.includes('1 of 2') && html.includes('data-sub="next"'));
  assert.match(html, /data-star="s0"[^>]*>★/); assert.match(html, /data-star="s1"[^>]*>☆/);
  assert.ok(renderList({ page: 211, title: 'NOISE', stations: [], subpage: 1, savedUuids: new Set(), currentUuid: null, from: 'genre', status: 'loading' }).includes('Searching…'));
  assert.ok(renderList({ page: 211, title: 'NOISE', stations: [], subpage: 1, savedUuids: new Set(), currentUuid: null, from: 'genre', status: 'error' }).includes('Page not available'));
  assert.ok(renderList({ page: 211, title: 'NOISE', stations: [], subpage: 1, savedUuids: new Set(), currentUuid: null, from: 'genre', status: 'ready' }).includes('No stations found'));
});
test('search keeps the escaped query in the box', () => {
  assert.ok(renderSearch({ query: '"><script>', list: null }).includes('value="&quot;&gt;&lt;script&gt;"'));
});
test('fastext labels follow page and play state', () => {
  const home = renderFastext({ page: 100, playing: false });
  for (const l of ['Prev', 'Play', 'Next', 'Browse']) assert.ok(home.includes(`<span>${l}</span>`), l);
  assert.match(home, /class="btn fk phone-only" data-key="browse"/); // a wide screen hides Browse
  assert.ok(!renderFastext({ page: 252, playing: false, up: 202 }).includes('phone-only'));
  const other = renderFastext({ page: 300, playing: true, up: 100 });
  assert.ok(other.includes('<span>Stop</span>') && other.includes('<span>Home</span>'));
  const genre = renderFastext({ page: 252, playing: false, up: 202 });
  assert.ok(genre.includes('<span>Index</span>') && genre.includes('aria-label="Back to page 202"'));
  for (const k of ['prev', 'play', 'next', 'browse']) assert.ok(home.includes(`data-key="${k}"`));
});

// On a phone, genre, genres and search pages have no Now Playing window, so a station that won't start says so here.
test('the status line shows the tuned station with the Now Playing state text and lamp', () => {
  const radcap = STATIONS[2];
  for (const [kind, lamp, text] of [['tuning', 'busy', 'Tuning…'], ['retrying', 'busy', 'No signal — retrying'],
    ['lost', 'bad', 'No signal — press Play'], ['unavailable', 'bad', 'Page not available'], ['off', 'off', 'Off air — press Play']]) {
    const html = renderStatus({ station: radcap, kind, song: 'Old Song' });
    assert.match(html, /^<p class="status" id="status">/, kind);
    assert.ok(html.includes(`<span class="lamp ${lamp}">${text}</span>`), kind);
    assert.ok(html.includes('RadCap Noise Rock') && !html.includes('Old Song'), kind);
  }
  const live = renderStatus({ station: radcap, kind: 'playing', song: 'Tulus - 09 Sabbat' });
  assert.ok(live.includes('<span class="lamp live">On air</span>') && live.includes('Tulus - 09 Sabbat') && !live.includes('RadCap'));
  assert.ok(renderStatus({ station: radcap, kind: 'playing', song: null }).includes('RadCap Noise Rock'));
});
test('before any tune the status line is kept, empty, so the rows never move', () => {
  assert.equal(renderStatus({ station: null, kind: 'off', song: null }), '<p class="status" id="status"></p>');
});
test('the status line escapes station names and songs', () => {
  const evil = { uuid: 'e', name: '<img src=x onerror=alert(1)>', tags: [], country: 'US' };
  const off = renderStatus({ station: evil, kind: 'lost', song: null });
  assert.ok(!off.includes('<img') && off.includes('&lt;img src=x onerror=alert(1)&gt;'));
  const on = renderStatus({ station: evil, kind: 'playing', song: '<script>"x"</script>' });
  assert.ok(!on.includes('<script') && on.includes('&lt;script&gt;&quot;x&quot;&lt;/script&gt;'));
});
test('genre, genres and search pages carry the status line under the title', () => {
  const live = { station: STATIONS[2], kind: 'retrying', song: null };
  const list = { stations: [], subpage: 1, savedUuids: new Set(), currentUuid: null, from: '210', status: 'loading' };
  const pages = [renderList({ page: 210, title: 'NOISE ROCK', ...list, live }), renderGenres(GENRES, live),
    renderSection({ section: SECTIONS[1], genres: GENRES, live }), renderSearch({ query: 'noise', list, live })];
  for (const html of pages) {
    const at = html.indexOf('<p class="status" id="status">');
    assert.ok(at > html.indexOf('class="tbar"') && html.includes('No signal — retrying'));
    assert.ok(at < Math.min(...['<ul', '<form', '<p class="msg'].map((t) => html.indexOf(t)).filter((i) => i >= 0)));
  }
  assert.ok(!renderHome({ onAir: { ...live, saved: true }, saved: STATIONS, currentUuid: null }).includes('id="status"'));
});
test('page 200 lists the popular genres, then links to every genre index', () => {
  const html = renderGenres(GENRES, {}, SECTIONS, [230, 250, 290]);
  const pages = [...html.matchAll(/data-page="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(pages, [230, 250, 290, 201, 202, 203, 204, 205, 206, 207]);
  assert.ok(html.indexOf('<span>Popular Genres</span>') < html.indexOf('data-page="230"'));
  assert.ok(html.indexOf('<span>All Genres</span>') < html.indexOf('data-page="201"'));
  assert.ok(html.includes('Jazz, Soul &amp; Hip Hop') && html.includes('>Underground<'));
});
test('a genre index page lists only its own genres, under its title', () => {
  const html = renderSection({ section: SECTIONS[1], genres: GENRES, live: {} });
  const pages = [...html.matchAll(/data-page="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(pages, Array.from({ length: 12 }, (_, i) => 248 + i));
  assert.ok(html.includes('<h2 class="tbar"><span>Electronic &amp; Dance</span></h2>'));
  assert.ok(renderSection({ section: SECTIONS[2], genres: GENRES, live: {} }).includes('>R&amp;B<'));
  const underground = renderSection({ section: SECTIONS[6], genres: GENRES, live: {} });
  assert.deepEqual([...underground.matchAll(/data-page="(\d+)"/g)].map((m) => Number(m[1])), Array.from({ length: 20 }, (_, i) => 210 + i));
});
test('the header menu marks the part of the radio you are in', () => {
  const on = (html) => [...html.matchAll(/class="mi on" data-page="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(on(renderHeader(212, new Date())), [200]);
  assert.deepEqual(on(renderHeader(300, new Date())), [300]);
  assert.deepEqual(on(renderHeader(100, new Date())), []);
  assert.deepEqual(on(renderHeader('2__', new Date())), []);
  for (const n of [200, 300, 999]) assert.ok(renderHeader(100, new Date()).includes(`data-page="${n}"`));
});
test('the top bar menu has the visuals page', () => {
  assert.match(renderHeader(500, new Date()), /class="mi on" data-page="500" aria-current="page">Visuals</);
});
test('page 500 has a switch per layer, marked on or off, and the signal lab', () => {
  const html = renderVisuals({ settings: { on: true, signal: true, bars: false, boxes: true, trip: true }, supported: true });
  for (const k of ['on', 'signal', 'bars', 'boxes', 'trip']) assert.ok(html.includes(`data-viz="${k}"`), k);
  assert.match(html, /data-viz="bars" aria-pressed="false"><span class="n">Off</);
  assert.match(html, /data-viz="signal" aria-pressed="true"><span class="n">On</);
  assert.ok(html.includes('<canvas class="lab"') && html.includes('id="vizstatus"'));
});
test('page 500 says plainly when this browser can\'t do visuals', () => {
  const html = renderVisuals({ settings: { on: true, signal: true, bars: true }, supported: false });
  assert.ok(html.includes('desktop browser') && !html.includes('data-viz'));
});
test('home on a wide screen also carries the genre lists', () => {
  const html = renderHome({ onAir: { station: null, kind: 'off' }, saved: [], currentUuid: null });
  assert.ok(html.includes('class="win pages"') && html.includes('class="win wide-only"'));
  assert.ok(html.indexOf('<span>Popular Genres</span>') > html.indexOf('<span>Pages</span>'));
});
test('the header page number is a key that opens the keypad', () => {
  const shut = renderHeader(212, new Date(2026, 10, 2, 8, 30));
  assert.match(shut, /<button class="pg" data-pad [^>]*aria-expanded="false">Page 212<\/button>/);
  const open = renderHeader('2__', new Date(2026, 10, 2, 8, 30), { padOpen: true });
  assert.match(open, /<button class="pg on" data-pad [^>]*aria-expanded="true">Page 2__<\/button>/);
});
test('the keypad has 0-9, Del and Close, and shows the number so far or a miss', () => {
  assert.equal(renderPad({ open: false }), '<div class="pad" id="pad" hidden></div>');
  const html = renderPad({ open: true, digits: '25' });
  const digits = [...html.matchAll(/data-digit="(\d)"/g)].map((m) => m[1]);
  assert.deepEqual(digits, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
  assert.ok(html.includes('data-padkey="del"') && html.includes('data-padkey="close"'));
  assert.ok(html.includes('Page 25_') && !html.includes(' hidden'));
  const miss = renderPad({ open: true, digits: '', note: 'No page 248' });
  assert.ok(miss.includes('<span class="lamp bad">No page 248</span>') && !miss.includes('Page ___'));
});

test('a wide screen gets more stations per subpage when asked', () => {
  const st = (uuid) => ({ uuid, name: uuid, tags: ['noise'], country: 'DE', votes: 1, bitrate: 128 });
  const stations = Array.from({ length: 20 }, (_, i) => st('s' + i));
  const args = { page: 211, title: 'Noise', stations, subpage: 1, savedUuids: new Set(), currentUuid: null, from: '211', status: 'ready' };
  assert.equal([...renderList(args).matchAll(/data-tune=/g)].length, 8);
  const wide = renderList({ ...args, perPage: 14 });
  assert.equal([...wide.matchAll(/data-tune=/g)].length, 14);
  assert.ok(wide.includes('1 of 2') && wide.includes('class="thead"'));
});
test('station rows show the genre and one more tag, in title case', () => {
  const html = renderList({ page: 210, title: 'Noise Rock', stations: [STATIONS[2]], subpage: 1, savedUuids: new Set(), currentUuid: null, from: '210', status: 'ready' });
  assert.ok(html.includes('<span class="tg">Noise Rock · Rock</span>'));
});
test('the rail is Now Playing and the saved stations, or a hint when none are saved', () => {
  const onAir = { station: STATIONS[0], kind: 'playing', song: 'Song', saved: true };
  const html = renderRail({ onAir, saved: STATIONS, currentUuid: STATIONS[0].uuid });
  assert.ok(html.indexOf('<span>Now Playing</span>') < html.indexOf('id="onair"'));
  assert.ok(html.indexOf('<span>Saved Stations</span>') < html.indexOf('data-from="saved"'));
  assert.ok(renderRail({ onAir, saved: [], currentUuid: null }).includes('Star a station to save it here.'));
});
test('the desk marks home and an index column', () => {
  assert.equal(renderDesk({ rail: 'R', main: 'M', home: true }), '<div class="desk home"><div class="rail">R</div><div class="main">M</div></div>');
  assert.equal(renderDesk({ rail: 'R', index: 'I', main: 'M' }), '<div class="desk has-idx"><div class="rail">R</div><div class="idxcol">I</div><div class="main">M</div></div>');
  assert.ok(renderHome({ onAir: { station: null, kind: 'off' }, saved: [], currentUuid: null }).startsWith('<div class="desk home">'));
});
test('the index column is the page one level up, with this page marked', () => {
  const genre = renderIndex(212);
  assert.ok(genre.includes('<span>Underground</span>'));
  assert.match(genre, /class="row here" data-page="212" aria-current="page"/);
  assert.equal([...genre.matchAll(/aria-current/g)].length, 1);
  const section = renderIndex(207);
  assert.ok(section.includes('<span>All Genres</span>') && !section.includes('Popular'));
  assert.match(section, /class="row here" data-page="207"/);
  for (const n of [100, 200, 300, 999]) assert.equal(renderIndex(n), '', String(n));
});
