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
