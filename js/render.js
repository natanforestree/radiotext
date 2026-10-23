// HTML string renderers for the Teletext pages. Every API-derived string goes through escapeHtml.
import { displayName, shortTag } from './stations.js';
import { savedPage, paginate } from './pages.js';
import { GENRES, PER_PAGE } from './config.js';
import { mosaicSvg, TITLE_STRIPE, ANTENNA, MOSAIC_COLORS } from './mosaic.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

const pad2 = (n) => String(n).padStart(2, '0');

/** Status line and lamp colour for each player state. 'playing' shows the song instead. */
const STATES = {
  off: { text: 'OFF AIR — PRESS PLAY', lamp: 'off' },
  tuning: { text: 'TUNING…', lamp: 'busy' },
  playing: { text: 'ON AIR', lamp: 'live' },
  retrying: { text: 'NO SIGNAL — RETRYING', lamp: 'busy' },
  lost: { text: 'NO SIGNAL — PRESS PLAY', lamp: 'bad' },
  unavailable: { text: 'PAGE NOT AVAILABLE', lamp: 'bad' },
};

const tagLabel = (station) => escapeHtml(shortTag(station, GENRES));

/** The page title band (blue, yellow double-height) and the mosaic stripe under it. */
function masthead(title, { mast = false } = {}) {
  const art = mast ? `<div class="mast">${mosaicSvg(ANTENNA, MOSAIC_COLORS)}</div>` : '';
  return `<div class="band"><h1 class="dh">${escapeHtml(title)}</h1>${art}</div>`
    + `<div class="stripe">${mosaicSvg(TITLE_STRIPE, MOSAIC_COLORS)}</div>`;
}

function starButton(station, saved) {
  const name = escapeHtml(displayName(station));
  return `<button class="star${saved ? ' on' : ''}" data-star="${escapeHtml(station.uuid)}" `
    + `aria-pressed="${saved}" aria-label="Save ${name}">${saved ? '★' : '☆'}</button>`;
}

/** An index row: page number, label, dot leaders, right-hand tag. */
function indexRow({ n, label, tag, attrs, cur = false }) {
  return `<li><button class="row${cur ? ' cur' : ''}" ${attrs}>`
    + `<span class="n">${n}</span><span class="fit"><span class="nm">${label}</span>`
    + `<span class="end"><span class="lead" aria-hidden="true"></span><span class="t">${tag}</span></span></span></button></li>`;
}

export function renderHeader(page, now) {
  return `<span class="pg">P${escapeHtml(page)}</span><span class="nm">RADIOTEXT</span>`
    + `<span class="clk">${pad2(now.getHours())}:${pad2(now.getMinutes())}</span>`;
}

/**
 * The ON AIR block (id="onair", so it can be re-rendered on its own). The lamp carries the state:
 * green ON AIR, yellow for tuning or retrying, red when lost or unavailable, white when off.
 * Its lines keep a fixed height, so the rows below never move while driving.
 */
export function renderOnAir({ station, kind, song, saved }) {
  const state = STATES[kind] ?? STATES.off;
  const lamp = `<p class="lamp ${state.lamp}">${state.text}</p>`;
  if (!station) return `<section class="onair" id="onair" aria-label="On air">${lamp}</section>`;
  const songLine = kind === 'playing' && song ? `<span class="note" aria-hidden="true">♪</span> ${escapeHtml(song)}` : '';
  return `<section class="onair" id="onair" aria-label="On air">${lamp}`
    + `<div class="air-top"><div class="air-name"><span class="dh">${escapeHtml(displayName(station))}</span></div>`
    + `${starButton(station, saved)}</div>`
    + `<p class="air-meta"><span class="tg">${tagLabel(station)}</span> <span class="cc">${escapeHtml(station.country)}</span></p>`
    + `<p class="air-song">${songLine}</p>`
    + '</section>';
}

export function renderHome({ onAir, saved, currentUuid }) {
  const rows = saved.map((s, i) => indexRow({
    n: savedPage(i),
    label: escapeHtml(displayName(s)),
    tag: tagLabel(s),
    attrs: `data-tune="${escapeHtml(s.uuid)}" data-from="saved"`,
    cur: s.uuid === currentUuid,
  })).join('');
  const list = rows ? `<ul class="idx saved">${rows}</ul>` : '<p class="msg">STAR A STATION TO SAVE IT HERE</p>';
  const links = indexRow({ n: 200, label: 'BROWSE GENRES', tag: '»', attrs: 'data-page="200"' })
    + indexRow({ n: 300, label: 'SEARCH', tag: '»', attrs: 'data-page="300"' });
  return masthead('RADIO', { mast: true }) + renderOnAir(onAir) + list + `<ul class="idx links">${links}</ul>`;
}

export function renderGenres(genres) {
  const rows = genres.map((g) => indexRow({
    n: g.page, label: escapeHtml(g.label), tag: '»', attrs: `data-page="${g.page}"`,
  })).join('');
  return masthead('GENRES') + `<ul class="idx genres">${rows}</ul>`;
}

function stationRow(s, { savedUuids, currentUuid, from }) {
  const top = shortTag(s, GENRES);
  const second = s.tags.map((t) => t.toUpperCase()).find((t) => t !== top);
  const tags = [top, second].filter(Boolean).map((t, i) => `<span>${i ? '· ' : ''}${escapeHtml(t)}</span>`).join('');
  const cur = s.uuid === currentUuid;
  return `<li class="st"><button class="row${cur ? ' cur' : ''}" data-tune="${escapeHtml(s.uuid)}" data-from="${escapeHtml(from)}">`
    + `<span class="nm">${escapeHtml(displayName(s))}</span>`
    + `<span class="meta"><span class="tg fit">${tags}</span><span class="cc">${escapeHtml(s.country)}</span></span>`
    + `</button>${starButton(s, savedUuids.has(s.uuid))}</li>`;
}

/** The list area shared by genre pages and search results (no masthead). */
function listBody({ stations, subpage, savedUuids, currentUuid, from, status }) {
  if (status === 'loading') return '<p class="msg"><span class="lamp busy">SEARCHING…</span></p>';
  if (status === 'error') return '<p class="msg"><span class="lamp bad">PAGE NOT AVAILABLE</span></p>';
  if (!stations.length) return '<p class="msg">NO STATIONS FOUND</p>';
  const p = paginate(stations, PER_PAGE, subpage);
  const rows = p.items.map((s) => stationRow(s, { savedUuids, currentUuid, from })).join('');
  const sub = p.subpages > 1
    ? `<div class="sub"><button class="subk" data-sub="prev" aria-label="Previous subpage"${p.subpage === 1 ? ' disabled' : ''}><span class="dh">◀</span></button>`
      + `<span class="subn">${p.subpage}/${p.subpages}</span>`
      + `<button class="subk" data-sub="next" aria-label="Next subpage"${p.subpage === p.subpages ? ' disabled' : ''}><span class="dh">▶</span></button></div>`
    : '';
  return `<ul class="stations">${rows}</ul>${sub}`;
}

export function renderList(args) {
  return masthead(args.title) + listBody(args);
}

export function renderSearch({ query, list }) {
  const form = '<form class="find" data-search role="search">'
    + `<input name="q" type="search" value="${escapeHtml(query)}" placeholder="NAME OR TAG" aria-label="Search stations" `
    + 'autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search">'
    + '<button type="submit">FIND</button></form>';
  const body = list ? listBody(list) : '<p class="msg hint">TRY <span class="tg">SLUDGE</span>, <span class="tg">NOISE</span> OR A STATION NAME</p>';
  return masthead('SEARCH') + form + body;
}

export function renderFastext({ page, playing }) {
  const key = (cls, k, label, aria) =>
    `<button class="fk ${cls}" data-key="${k}" aria-label="${aria}"><span class="dh">${label}</span></button>`;
  const home = Number(page) === 100;
  return key('red', 'prev', '◀ PREV', 'Previous station')
    + key('green', 'play', playing ? '■ STOP' : '▶ PLAY', playing ? 'Stop' : 'Play')
    + key('yellow', 'next', 'NEXT ▶', 'Next station')
    + key('cyan', 'browse', home ? 'BROWSE' : 'HOME', home ? 'Browse genres' : 'Home');
}
