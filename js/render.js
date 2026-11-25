// HTML string renderers for the pages: one-bit windows on a dithered desktop. Every
// API-derived string goes through escapeHtml.
import { displayName, shortTag, titleCase } from './stations.js';
import { savedPage, paginate, genresIn, parentPage } from './pages.js';
import { GENRES, SECTIONS, FEATURED, PER_PAGE } from './config.js';
import { mosaicSvg, ANTENNA } from './mosaic.js';
import { clockTime } from './diag.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

const pad2 = (n) => String(n).padStart(2, '0');
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Pixel icons, drawn in the text colour, for the symbols the font lacks (◀ ▶ ■ ♪). */
const pixel = (w, d) => `<svg class="ic" viewBox="0 0 ${w} 7" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><path fill="currentColor" d="${d}"/></svg>`;
const ICON = {
  prev: pixel(4, 'M3 0h1v7H3zM2 1h1v5H2zM1 2h1v3H1zM0 3h1v1H0z'),
  next: pixel(4, 'M0 0h1v7H0zM1 1h1v5H1zM2 2h1v3H2zM3 3h1v1H3z'),
  stop: pixel(7, 'M1 1h5v5H1z'),
  note: pixel(6, 'M3 0h2v1H3zM5 1h1v1H5zM3 1h1v3H3zM1 4h3v1H1zM0 5h4v1H0zM1 6h2v1H1z'),
  moon: pixel(5, 'M2 0h3v1H2zM1 1h3v1H1zM0 2h3v3H0zM1 5h3v1H1zM2 6h3v1H2z'),
  sun: pixel(7, 'M3 0h1v1H3zM1 1h1v1H1zM5 1h1v1H5zM2 2h3v3H2zM0 3h1v1H0zM6 3h1v1H6zM1 5h1v1H1zM5 5h1v1H5zM3 6h1v1H3z'),
};
/** The mast from the icons, in the text colour, beside the name in the top bar. */
const MAST = mosaicSvg(ANTENNA, { R: 'currentColor', C: 'currentColor', W: 'currentColor' });

/** Status line and lamp for each player state. 'playing' shows the song instead. */
const STATES = {
  off: { text: 'Off air — press Play', lamp: 'off' },
  tuning: { text: 'Tuning…', lamp: 'busy' },
  playing: { text: 'On air', lamp: 'live' },
  retrying: { text: 'No signal — retrying', lamp: 'busy' },
  lost: { text: 'No signal — press Play', lamp: 'bad' },
  unavailable: { text: 'Page not available', lamp: 'bad' },
};

const tagLabel = (station) => escapeHtml(shortTag(station, GENRES));

/** A window: a striped title bar over its contents. */
function win(title, body, cls = '') {
  return `<section class="win${cls ? ` ${cls}` : ''}"><h2 class="tbar"><span>${escapeHtml(title)}</span></h2>${body}</section>`;
}

function starButton(station, saved) {
  const name = escapeHtml(displayName(station));
  return `<button class="star${saved ? ' on' : ''}" data-star="${escapeHtml(station.uuid)}" `
    + `aria-pressed="${saved}" aria-label="Save ${name}">${saved ? '★' : '☆'}</button>`;
}

/** An index row: page number, label, right-hand tag. `here` marks the page open beside it. */
function indexRow({ n, label, tag, attrs, cur = false, here = false }) {
  return `<li><button class="row${cur ? ' cur' : ''}${here ? ' here' : ''}" ${attrs}${here ? ' aria-current="page"' : ''}>`
    + `<span class="n">${n}</span><span class="nm">${label}</span><span class="t">${tag}</span></button></li>`;
}

/** The top bar menu, shown on a wide screen: the pages the phone reaches from home. */
const MENU = [[200, 'Genres'], [300, 'Search'], [999, 'Engineering']];

/** The top bar. The page number is a button: it opens the keypad for typing a page number. On a
 *  wide screen a menu follows it, with the part of the radio you're in marked. Last comes the
 *  dark mode key: a moon while light, a sun while dark. */
export function renderHeader(page, now, { padOpen = false, dark = false } = {}) {
  const n = Number(page);
  const area = n >= 200 && n < 300 ? 200 : n;
  const menu = MENU.map(([p, label]) => `<button class="mi${area === p ? ' on' : ''}" data-page="${p}"`
    + `${area === p ? ' aria-current="page"' : ''}>${label}</button>`).join('');
  return `<span class="app">${MAST}<span>Radiotext</span></span>`
    + `<button class="pg${padOpen ? ' on' : ''}" data-pad aria-label="Type a page number" aria-expanded="${padOpen}">`
    + `Page ${escapeHtml(page)}</button><nav class="menu" aria-label="Pages">${menu}</nav><span class="sp"></span>`
    + `<span class="dt">${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}</span>`
    + `<span class="clk">${pad2(now.getHours())}:${pad2(now.getMinutes())}</span>`
    + `<button class="tm" data-theme-toggle aria-label="Dark mode" aria-pressed="${dark}">${dark ? ICON.sun : ICON.moon}</button>`;
}

/**
 * The page-number keypad, in place of the bottom keys while it's open: 0-9 like a Teletext
 * remote, Del and Close, and above them the number so far. `note` says a number had no page.
 */
export function renderPad({ open, digits = '', note = '' }) {
  if (!open) return '<div class="pad" id="pad" hidden></div>';
  const show = note ? `<span class="lamp bad">${escapeHtml(note)}</span>`
    : `<span class="pnum">Page ${escapeHtml(digits.padEnd(3, '_'))}</span>`;
  const digit = (d) => `<button class="btn pk" data-digit="${d}">${d}</button>`;
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit).join('')
    + '<button class="btn pk op" data-padkey="close" aria-label="Close the keypad">Close</button>'
    + digit('0')
    + '<button class="btn pk op" data-padkey="del" aria-label="Delete a digit">Del</button>';
  return `<div class="pad" id="pad" role="group" aria-label="Page number">`
    + `<p class="pad-show" aria-live="polite">${show}</p><div class="pad-keys">${keys}</div></div>`;
}

/**
 * The inside of the Now Playing window (id="onair", so it can be re-rendered on its own). The
 * lamp carries the state: solid for on air or a fault, outlined while off, dashed while tuning or
 * retrying. Its lines keep a fixed height, so nothing below moves while driving.
 */
export function renderOnAir({ station, kind, song, saved }) {
  const state = STATES[kind] ?? STATES.off;
  const lamp = `<p class="lamp ${state.lamp}">${state.text}</p>`;
  if (!station) return `<div class="onair" id="onair">${lamp}</div>`;
  const songLine = kind === 'playing' && song ? `${ICON.note}<span>${escapeHtml(song)}</span>` : '';
  return `<div class="onair" id="onair">${lamp}`
    + `<div class="air-top"><p class="air-name">${escapeHtml(displayName(station))}</p>`
    + `${starButton(station, saved)}</div>`
    + `<p class="air-meta"><span class="tg">${tagLabel(station)}</span> <span class="cc">${escapeHtml(station.country)}</span></p>`
    + `<p class="air-song">${songLine}</p>`
    + '</div>';
}

/**
 * The status line under the title of the other pages (id="status", so it can be patched on its
 * own): the same state text and lamp as Now Playing, then the song while one is playing, else
 * the station. Before any station is tuned the line stays, empty, so the rows below don't move
 * when one is tapped. A wide screen hides it: Now Playing sits beside the page there.
 */
export function renderStatus({ station = null, kind = 'off', song = null } = {}) {
  if (!station) return '<p class="status" id="status"></p>';
  const state = STATES[kind] ?? STATES.off;
  const what = kind === 'playing' && song
    ? `<span class="sg">${ICON.note}<span>${escapeHtml(song)}</span></span>`
    : `<span class="nm">${escapeHtml(displayName(station))}</span>`;
  return `<p class="status" id="status"><span class="lamp ${state.lamp}">${state.text}</span> ${what}</p>`;
}

/** Now Playing and the saved stations: home on a phone, the left column of every page on a
 *  wide screen. */
export function renderRail({ onAir, saved, currentUuid }) {
  const rows = saved.map((s, i) => indexRow({
    n: savedPage(i),
    label: escapeHtml(displayName(s)),
    tag: tagLabel(s),
    attrs: `data-tune="${escapeHtml(s.uuid)}" data-from="saved"`,
    cur: s.uuid === currentUuid,
  })).join('');
  const list = rows ? `<ul class="wbody idx saved" data-scroll="saved">${rows}</ul>`
    : '<p class="msg">Star a station to save it here.</p>';
  return win('Now Playing', renderOnAir(onAir), 'air') + win('Saved Stations', list, 'saved-win');
}

/**
 * The page area: the rail, then on a wide screen the index one level up (when there is one),
 * then the page itself. A phone shows the rail on home only.
 */
export function renderDesk({ rail, index = '', main, home = false }) {
  const cls = ['desk', home && 'home', index && 'has-idx'].filter(Boolean).join(' ');
  return `<div class="${cls}"><div class="rail">${rail}</div>`
    + (index ? `<div class="idxcol">${index}</div>` : '')
    + `<div class="main">${main}</div></div>`;
}

export function renderHome({ onAir, saved, currentUuid }) {
  const links = indexRow({ n: 200, label: 'Browse Genres', tag: '»', attrs: 'data-page="200"' })
    + indexRow({ n: 300, label: 'Search', tag: '»', attrs: 'data-page="300"' })
    + indexRow({ n: 999, label: 'Engineering', tag: '»', attrs: 'data-page="999"' });
  return renderDesk({
    home: true,
    rail: renderRail({ onAir, saved, currentUuid }),
    main: win('Pages', `<ul class="wbody idx links">${links}</ul>`, 'pages')
      + genresWindows({ genres: GENRES, sections: SECTIONS, featured: FEATURED, scroll: 'home', cls: 'wide-only' }),
  });
}

/** Index rows that each open a page: genre pages, or the section index pages. */
function pageRows(items, { here = 0, scroll = '' } = {}) {
  const rows = items.map((p) => indexRow({
    n: p.page, label: escapeHtml(p.label), tag: '»', attrs: `data-page="${p.page}"`, here: p.page === here,
  })).join('');
  return `<ul class="wbody idx genres"${scroll ? ` data-scroll="${scroll}"` : ''}>${rows}</ul>`;
}

function genresWindows({ genres, sections, featured, status = '', here = 0, scroll, cls = '' }) {
  const popular = featured.map((n) => genres.find((g) => g.page === n)).filter(Boolean);
  return win('Popular Genres', status + pageRows(popular, { here, scroll: `${scroll}:pop` }), cls)
    + win('All Genres', pageRows(sections, { here, scroll: `${scroll}:all` }), cls);
}

/** Page 200: the popular genres, then every section's index page. */
export function renderGenres(genres, live, sections = SECTIONS, featured = FEATURED) {
  return genresWindows({ genres, sections, featured, status: renderStatus(live), scroll: 'page:200' });
}

/** Pages 201-207: one section's genres. */
export function renderSection({ section, genres, live }) {
  return win(section.label, renderStatus(live) + pageRows(genresIn(section, genres), { scroll: `page:${section.page}` }));
}

/**
 * The index column beside a page on a wide screen: the index one level up, with this page
 * marked. A genre index gets the list of all of them; home has none.
 */
export function renderIndex(n, { genres = GENRES, sections = SECTIONS } = {}) {
  const up = parentPage(n, { genres, sections });
  if (up === 200) return win('All Genres', pageRows(sections, { here: n, scroll: 'idx:200' }));
  const section = sections.find((s) => s.page === up);
  return section ? win(section.label, pageRows(genresIn(section, genres), { here: n, scroll: `idx:${up}` })) : '';
}

function stationRow(s, { savedUuids, currentUuid, from }) {
  const top = shortTag(s, GENRES);
  const second = s.tags.map(titleCase).find((t) => t.toLowerCase() !== top.toLowerCase());
  const tags = [top, second].filter(Boolean).map(escapeHtml).join(' · ');
  const cur = s.uuid === currentUuid;
  return `<li class="st"><button class="row${cur ? ' cur' : ''}" data-tune="${escapeHtml(s.uuid)}" data-from="${escapeHtml(from)}">`
    + `<span class="nm">${escapeHtml(displayName(s))}</span>`
    + `<span class="meta"><span class="tg">${tags}</span><span class="cc">${escapeHtml(s.country)}</span></span>`
    + `</button>${starButton(s, savedUuids.has(s.uuid))}</li>`;
}

/** The list area shared by genre pages and search results, under the status line. */
function listBody({ stations, subpage, perPage = PER_PAGE, savedUuids, currentUuid, from, status }) {
  if (status === 'loading') return '<p class="msg"><span class="lamp busy">Searching…</span></p>';
  if (status === 'error') return '<p class="msg"><span class="lamp bad">Page not available</span></p>';
  if (!stations.length) return '<p class="msg">No stations found.</p>';
  const p = paginate(stations, perPage, subpage);
  const rows = p.items.map((s) => stationRow(s, { savedUuids, currentUuid, from })).join('');
  const head = '<div class="thead" aria-hidden="true"><span>Station</span><span>Tags</span><span>Country</span></div>';
  const sub = p.subpages > 1
    ? `<div class="sub"><button class="btn subk" data-sub="prev" aria-label="Previous subpage"${p.subpage === 1 ? ' disabled' : ''}>${ICON.prev}<span>Prev page</span></button>`
      + `<span class="subn">${p.subpage} of ${p.subpages}</span>`
      + `<button class="btn subk" data-sub="next" aria-label="Next subpage"${p.subpage === p.subpages ? ' disabled' : ''}><span>Next page</span>${ICON.next}</button></div>`
    : '';
  return `${head}<ul class="wbody stations" data-scroll="page:${escapeHtml(from)}:${p.subpage}">${rows}</ul>${sub}`;
}

export function renderList(args) {
  return win(args.title, renderStatus(args.live) + listBody(args), 'list');
}

export function renderSearch({ query, list, live }) {
  const form = '<form class="find" data-search role="search">'
    + `<input name="q" type="search" value="${escapeHtml(query)}" placeholder="Name or tag" aria-label="Search stations" `
    + 'autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search">'
    + '<button class="btn def" type="submit">Find</button></form>';
  const body = list ? listBody(list) : '<p class="msg hint">Try <b>jazz</b>, <b>salsa</b>, <b>techno</b> or a station name.</p>';
  return win('Search', renderStatus(live) + form + body, 'list');
}

/** Page 999: the engineering log, newest first, with keys to copy it as text or clear it. */
export function renderDiag(entries, live) {
  const rows = entries.slice().reverse().map(([t, e, d]) => `<li><span class="tm">${clockTime(t)}</span> `
    + `<span class="ev">${escapeHtml(e)}</span> ${escapeHtml(d)}</li>`).join('');
  const keys = '<div class="diag-keys"><button class="btn" data-diag="copy">Copy</button><button class="btn" data-diag="clear">Clear</button></div>';
  return win('Engineering', renderStatus(live) + keys
    + (rows ? `<ol class="wbody diag">${rows}</ol>` : '<p class="msg">Nothing logged yet.</p>'));
}

/** The four keys along the bottom. The last is Browse on home (a phone only: a wide screen's home
 *  shows the genres already); elsewhere it goes up to `up`: Index when that's a genre index, Home
 *  when it's home. Then the keyboard shortcuts, which only a wide screen shows. */
export function renderFastext({ page, playing, up = 100 }) {
  const key = (k, label, aria, cls = '') =>
    `<button class="btn fk${cls}" data-key="${k}" aria-label="${aria}">${label}</button>`;
  const home = Number(page) === 100;
  const [label, aria] = home ? ['Browse', 'Browse genres']
    : up === 100 ? ['Home', 'Home'] : ['Index', `Back to page ${up}`];
  return key('prev', `${ICON.prev}<span>Prev</span>`, 'Previous station')
    + key('play', playing ? `${ICON.stop}<span>Stop</span>` : `${ICON.next}<span>Play</span>`, playing ? 'Stop' : 'Play', ' def')
    + key('next', `<span>Next</span>${ICON.next}`, 'Next station')
    + key('browse', `<span>${label}</span>`, aria, home ? ' phone-only' : '')
    + '<p class="hint"><kbd>Left</kbd> <kbd>Right</kbd> <kbd>Space</kbd> or type a page number</p>';
}
