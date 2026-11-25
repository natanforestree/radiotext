// Radiotext: wires the pages, the fastext keys, the keyboard and the lock screen to the player.
// Nothing plays on load: browsers need a tap (PLAY or a station row) before audio can start.
import { RELAY_BASE, PRESETS, RETIRED_PRESETS, GENRES, SECTIONS, PER_PAGE, PER_PAGE_WIDE, POLL_MS, STATIC_ENABLED } from './config.js';
import { prepareList, displayName } from './stations.js';
import { safeStorage, createSaved, createDead, dropRetired } from './saved.js';
import { createFlip } from './fliplist.js';
import { route, paginate, parentPage } from './pages.js';
import { createRadioBrowser } from './radiobrowser.js';
import { sourceFor, fetchSong } from './nowplaying.js';
import { createPlayer } from './player.js';
import { createStatic } from './static.js';
import { renderHeader, renderOnAir, renderStatus, renderHome, renderRail, renderDesk, renderIndex, renderGenres, renderSection, renderList, renderSearch, renderFastext, renderDiag, renderPad } from './render.js';
import { buildMetadata, playbackStateFor, bindMediaSession, loggedSession } from './mediasession.js';
import { createDiag, diagText } from './diag.js';

/** @typedef {import('./config.js').Station} Station */

const hdr = document.getElementById('hdr');
const pageEl = document.getElementById('page');
const keysEl = document.getElementById('fastext');
const padEl = document.getElementById('pad');
const audio = /** @type {HTMLAudioElement} */ (document.getElementById('radio'));

// ---- Services ----

// Even reading window.localStorage throws when storage is blocked, so that is wrapped too.
const store = safeStorage((() => { try { return globalThis.localStorage; } catch { return null; } })());
dropRetired(store, RETIRED_PRESETS);
const saved = createSaved(store, PRESETS);
const dead = createDead(store);
const diag = createDiag(store);
const canPlay = (mime) => audio.canPlayType(mime) !== '';
// window.fetch throws "Illegal invocation" when called as a method of another object.
const fetchFn = (...args) => globalThis.fetch(...args);
const rb = createRadioBrowser({ fetch: fetchFn });
const noise = createStatic({ AudioContext: globalThis.AudioContext ?? globalThis.webkitAudioContext });
const flip = createFlip();
flip.set(saved.list(), 0, 'saved');
const player = createPlayer({ audio, relayBase: RELAY_BASE, dead, onChange });

// ---- App state ----

const app = {
  page: 100,
  subpage: 1,
  query: '',
  /** Genre pages and the search results (300), cached for the session.
   *  @type {Map<number, {status: 'loading'|'ready'|'error', stations: Station[]}>} */
  lists: new Map(),
  /** @type {string|null} the tuned station's current song, when it shares one */
  song: null,
};

const ON = new Set(['tuning', 'playing', 'retrying']);
const isOn = () => ON.has(player.state.kind);
/** The station the ON AIR block shows: the tuned one, or before any tune, the one PLAY starts. */
const shown = () => player.state.station ?? flip.current();
const onAirArgs = (station = shown()) =>
  ({ station, kind: player.state.kind, song: app.song, saved: Boolean(station) && saved.has(station.uuid) });
/** The status line on the other pages: the tuned station only, so it stays empty until a tune. */
const liveArgs = () => ({ station: player.state.station, kind: player.state.kind, song: app.song });

// ---- Rendering ----

// A wide screen (the same test as in styles.css) puts the saved stations beside the page, and
// gets more stations per subpage. A short one (a phone on its side) keeps the phone layout.
const wide = matchMedia('(min-width: 760px) and (min-height: 500px)');
const perPage = () => (wide.matches ? PER_PAGE_WIDE : PER_PAGE);

/** The page itself: the right-hand window(s) on a wide screen, the whole page on a phone. */
function mainHtml(r, list, currentUuid) {
  const live = liveArgs();
  if (r.kind === 'genres') return renderGenres(GENRES, live);
  if (r.kind === 'section') return renderSection({ section: r.section, genres: GENRES, live });
  if (r.kind === 'diag') return renderDiag(diag.list(), live);
  const l = app.lists.get(app.page);
  const body = l && {
    stations: l.stations, status: l.status, subpage: app.subpage, perPage: perPage(),
    savedUuids: new Set(list.map((s) => s.uuid)), currentUuid, from: String(app.page),
  };
  if (r.kind === 'search') return renderSearch({ query: app.query, list: body ?? null, live });
  return renderList({ page: app.page, title: r.genre.label, live, ...(body ?? { stations: [], status: 'loading',
    subpage: 1, savedUuids: new Set(), currentUuid, from: String(app.page) }) });
}

function pageHtml() {
  const list = saved.list();
  const station = shown();
  const currentUuid = station?.uuid ?? null;
  const onAir = onAirArgs(station);
  const r = route(app.page, { savedCount: list.length, genres: GENRES, sections: SECTIONS });
  if (!r || r.kind === 'home' || r.kind === 'saved') return renderHome({ onAir, saved: list, currentUuid });
  return renderDesk({
    rail: renderRail({ onAir, saved: list, currentUuid }),
    index: renderIndex(app.page),
    main: mainHtml(r, list, currentUuid),
  });
}

/**
 * Re-renders the whole page. Text typed into the search box survives it, and so does where each
 * list was scrolled to (on a wide screen the lists scroll inside their windows), as long as the
 * same list comes back. An index list seen for the first time is scrolled to the open page.
 */
function render() {
  const input = pageEl.querySelector('input[name=q]');
  const typed = input && { value: input.value, focused: document.activeElement === input };
  const scrolled = new Map([...pageEl.querySelectorAll('[data-scroll]')].map((el) => [el.dataset.scroll, el.scrollTop]));
  pageEl.innerHTML = pageHtml();
  for (const el of pageEl.querySelectorAll('[data-scroll]')) {
    const top = scrolled.get(el.dataset.scroll);
    if (top) el.scrollTop = top;
    else if (top === undefined) el.querySelector('.here')?.scrollIntoView({ block: 'nearest' });
  }
  const again = typed && pageEl.querySelector('input[name=q]');
  if (again) {
    again.value = typed.value;
    if (typed.focused) again.focus();
  }
  renderTop();
  renderKeys();
  updateSession();
}

/** After a player or song change: the ON AIR block or status line, the current row, the keys,
 *  the lock screen. */
function refreshLive() {
  const onair = pageEl.querySelector('#onair');
  if (onair) patchHtml(onair, renderOnAir(onAirArgs()));
  const status = pageEl.querySelector('#status');
  if (status) patchHtml(status, renderStatus(liveArgs()));
  const uuid = shown()?.uuid;
  for (const row of pageEl.querySelectorAll('.row[data-tune]')) row.classList.toggle('cur', row.dataset.tune === uuid);
  renderKeys();
  updateSession();
}

// The ON AIR block and status line are patched in place like the keys below: only text,
// attributes and children that changed are touched, and an element is replaced only where the
// structure changed. Swapping the whole block would replace the star under a finger mid-press.
function patchHtml(el, html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  patchNode(el, t.content.firstElementChild);
}
function patchNode(o, n) {
  if (o.isEqualNode(n)) return;
  if (o.nodeType === Node.TEXT_NODE && n.nodeType === Node.TEXT_NODE) {
    o.data = n.data;
    return;
  }
  if (o.nodeType !== Node.ELEMENT_NODE || o.nodeName !== n.nodeName) {
    o.replaceWith(n);
    return;
  }
  for (const { name } of [...o.attributes]) if (!n.hasAttribute(name)) o.removeAttribute(name);
  for (const { name, value } of n.attributes) if (o.getAttribute(name) !== value) o.setAttribute(name, value);
  const oldKids = [...o.childNodes];
  const newKids = [...n.childNodes];
  if (oldKids.length !== newKids.length) o.replaceChildren(...newKids);
  else oldKids.forEach((c, i) => patchNode(c, newKids[i]));
}

// Digits typed so far, shown as P2__ in the header (and on the keypad while it's open).
let digits = '';
let padOpen = false;
/** Set when a number typed on the keypad had no page, until the next key. */
let padNote = '';
// Patched like the ON AIR block: the page number is a button, and the clock ticks beside it.
function renderTop() {
  const t = document.createElement('template');
  t.innerHTML = renderHeader(digits ? digits.padEnd(3, '_') : app.page, new Date(), { padOpen });
  const fresh = [...t.content.childNodes];
  const old = [...hdr.childNodes];
  if (old.length !== fresh.length) hdr.replaceChildren(...fresh);
  else old.forEach((c, i) => patchNode(c, fresh[i]));
}

/** The keypad stands in for the fastext keys while it's open. */
function renderPadNow() {
  patchHtml(padEl, renderPad({ open: padOpen, digits, note: padNote }));
  keysEl.hidden = padOpen;
}

/** The cyan key's page away from home: one level up. */
const upFrom = (n) => parentPage(n, { genres: GENRES, sections: SECTIONS });

// The keys are patched in place, never replaced: a state change landing mid-press (NEXT, then
// 'playing' arrives) would otherwise swap the button under the finger and lose the tap.
function renderKeys() {
  const t = document.createElement('template');
  t.innerHTML = renderFastext({ page: app.page, playing: isOn(), up: upFrom(app.page) });
  const fresh = [...t.content.children];
  const old = [...keysEl.children];
  if (old.length !== fresh.length) {
    keysEl.replaceChildren(...fresh);
    return;
  }
  fresh.forEach((el, i) => {
    const o = old[i];
    if (o.isEqualNode(el)) return;
    for (const { name } of [...o.attributes]) if (!el.hasAttribute(name)) o.removeAttribute(name);
    for (const { name, value } of el.attributes) o.setAttribute(name, value);
    o.innerHTML = el.innerHTML;
  });
}

let sessionKey = '';
function updateSession() {
  const ms = navigator.mediaSession;
  if (!ms) return;
  const { station, kind } = player.state;
  const key = station ? `${station.uuid}\n${app.song ?? ''}` : '';
  if (key !== sessionKey) {
    sessionKey = key;
    diag.note('lockscreen', station ? app.song ?? displayName(station) : 'cleared');
    try {
      ms.metadata = station ? new MediaMetadata(buildMetadata({ station, song: app.song })) : null;
    } catch { /* no MediaMetadata in this browser */ }
  }
  try { ms.playbackState = playbackStateFor(station ? kind : null); } catch { /* not supported */ }
}

// ---- Playback ----

function onChange({ kind, station }) {
  diag.note('state', `${kind} ${station ? displayName(station) : ''}`);
  if (kind === 'playing' || kind === 'unavailable' || kind === 'off' || kind === 'lost') noise.stop();
  refreshLive();
}

// Every tune counts a click on Radio Browser and restarts the song lookups.
function tuned(station) {
  rb.countClick(station.uuid);
  pollSong();
  refreshLive(); // re-tuning the station that's already tuning sends no onChange
}

function tuneTo(station) {
  app.song = null;
  player.tune(station);
  tuned(station);
}

/** PREV/NEXT, the arrow keys and the car's buttons. Static is started here, not from onChange,
 *  because re-tuning the same station sends no onChange. */
function flipBy(step) {
  const station = step > 0 ? flip.next() : flip.prev();
  if (!station) return;
  if (STATIC_ENABLED && document.visibilityState === 'visible') noise.start();
  tuneTo(station);
  followFlip(station);
}

// Walking a genre or search list: turn to the subpage with the playing row, so it stays in view.
function followFlip(station) {
  if (flip.source() !== String(app.page)) return;
  const i = app.lists.get(app.page)?.stations.findIndex((s) => s.uuid === station.uuid) ?? -1;
  const sub = Math.floor(i / perPage()) + 1;
  if (i < 0 || sub === app.subpage) return;
  app.subpage = sub;
  render();
}

/** PLAY, from the key or the lock screen: reconnect the tuned station, or start the flip list's
 *  current one. It never stops anything, and leaves a station that's playing or tuning alone. */
function startPlay() {
  const { kind, station } = player.state;
  if (kind === 'playing' || kind === 'tuning') return;
  if (!station) {
    const first = flip.current();
    if (first) tuneTo(first);
    return;
  }
  app.song = null;
  player.resume();
  tuned(station);
}

function togglePlay() {
  if (isOn()) player.stop();
  else startPlay();
}

// ---- Now playing ----

let pollTimer = null;
let pollGen = 0;
/** Looks the song up now, then every POLL_MS while playing, for the station just tuned. */
function pollSong() {
  clearTimeout(pollTimer);
  pollTimer = null;
  const g = ++pollGen;
  const { station } = player.state;
  const source = station && sourceFor(station);
  if (!source) return;
  const lookup = async () => {
    const song = await fetchSong(source, fetchFn);
    if (g !== pollGen || !song || song === app.song) return; // tuned elsewhere, or nothing new
    app.song = song;
    refreshLive();
  };
  const loop = () => {
    pollTimer = setTimeout(() => {
      if (g !== pollGen) return;
      if (player.state.kind === 'playing') lookup();
      loop();
    }, POLL_MS);
  };
  lookup();
  loop();
}

// ---- Pages and lists ----

/**
 * Goes to page n. A saved-station number (101–199) tunes that station and shows home. A new
 * page goes into the browser's history, so back (a swipe on iPhone) returns to the last one;
 * `push: false` when back or forward brought us here.
 */
function goTo(n, { push = true } = {}) {
  const r = route(n, { savedCount: saved.list().length, genres: GENRES, sections: SECTIONS });
  if (!r) return false;
  let page = n;
  if (r.kind === 'saved') {
    const list = saved.list();
    flip.set(list, r.index, 'saved');
    tuneTo(list[r.index]);
    page = 100;
  }
  if (page !== app.page) {
    app.page = page;
    app.subpage = 1;
    if (push) {
      try { history.pushState({ page }, ''); } catch { /* no history here */ }
    }
  }
  if (padOpen) setPad(false);
  if (r.kind === 'genre') loadGenre(r.genre);
  render();
  window.scrollTo(0, 0);
  return true;
}

function loadGenre(genre) {
  const cached = app.lists.get(genre.page);
  if (cached && cached.status !== 'error') return; // a failed load is tried again on the next visit
  app.lists.set(genre.page, { status: 'loading', stations: [] });
  rb.byGenre(genre)
    .then((raws) => ({ status: 'ready', stations: prepareList(raws, { canPlay, dead, genre }) }))
    .catch(() => ({ status: 'error', stations: [] }))
    .then((list) => {
      app.lists.set(genre.page, list);
      if (app.page === genre.page) render();
    });
}

let searchGen = 0;
function runSearch(q) {
  const g = ++searchGen;
  app.query = q;
  app.subpage = 1;
  if (!q) {
    app.lists.delete(300);
    render();
    return;
  }
  app.lists.set(300, { status: 'loading', stations: [] });
  render();
  rb.search(q)
    .then((raws) => ({ status: 'ready', stations: prepareList(raws, { canPlay, dead, genre: null }) }))
    .catch(() => ({ status: 'error', stations: [] }))
    .then((list) => {
      if (g !== searchGen) return; // a newer search replaced this one
      app.lists.set(300, list);
      if (app.page === 300) render();
    });
}

function changeSub(step) {
  const l = app.lists.get(app.page);
  if (!l) return;
  app.subpage = paginate(l.stations, perPage(), app.subpage + step).subpage;
  render();
  window.scrollTo(0, 0);
}

// ---- Saving ----

function findStation(uuid) {
  const pools = [[player.state.station, flip.current()], saved.list(), app.lists.get(app.page)?.stations ?? []];
  for (const pool of pools) {
    const s = pool.find((x) => x?.uuid === uuid);
    if (s) return s;
  }
  return null;
}

function toggleStar(uuid) {
  if (saved.has(uuid)) {
    saved.remove(uuid);
  } else {
    const station = findStation(uuid);
    if (!station) return;
    saved.add(station);
  }
  if (flip.source() === 'saved') rebuildSavedFlip();
  render();
}

// Keeps the current station's place. If it was the one unsaved, sit on the station before it,
// so NEXT still plays the one that came after it.
function rebuildSavedFlip() {
  const cur = flip.current();
  const list = saved.list();
  let i = cur ? list.findIndex((s) => s.uuid === cur.uuid) : 0;
  if (i < 0) {
    const was = flip.list().findIndex((s) => s.uuid === cur.uuid);
    i = list.length ? (was - 1 + list.length) % list.length : 0;
  }
  flip.set(list, i, 'saved');
}

// ---- Engineering log ----

/** COPY puts the log on the clipboard as text, to paste into a message. CLEAR empties it. */
function diagKey(action, button) {
  if (action === 'clear') {
    diag.clear();
    render();
    return;
  }
  const copy = navigator.clipboard?.writeText(diagText(diag.list())) ?? Promise.reject(new Error('no clipboard'));
  copy.then(() => { button.textContent = 'Copied'; }, () => { button.textContent = 'Copy failed'; });
}

// What the <audio> element reports, with the flags that tell an outside pause from an error or
// the stream ending, and the host it plays from (the relay or the station).
for (const type of ['playing', 'pause', 'waiting', 'stalled', 'error', 'ended', 'emptied']) {
  audio.addEventListener(type, () => {
    let host = '';
    try { host = audio.src ? new URL(audio.src).host : ''; } catch { /* no src */ }
    const flags = [audio.ended && 'ended', audio.error && `error ${audio.error.code}`].filter(Boolean);
    diag.note('audio', [type, ...flags, type === 'playing' || type === 'error' ? host : ''].join(' '));
  });
}
addEventListener('pagehide', (e) => diag.note('page', e.persisted ? 'hide, kept' : 'hide'));
addEventListener('pageshow', (e) => diag.note('page', e.persisted ? 'show, restored' : 'show'));
addEventListener('online', () => diag.note('net', 'online'));
addEventListener('offline', () => diag.note('net', 'offline'));

// A phone freezes pages it has sent to the background. A heartbeat that comes back late shows
// how long the page was frozen. Background timers may be held to once a minute, so only gaps
// longer than that count.
let beat = Date.now();
setInterval(() => {
  const now = Date.now();
  if (now - beat > 70000) diag.note('frozen', `${Math.round((now - beat) / 1000)} s`);
  beat = now;
}, 5000);

// ---- Input ----

function tapStation(uuid, from) {
  const list = from === 'saved' ? saved.list() : app.lists.get(Number(from))?.stations ?? [];
  const i = list.findIndex((s) => s.uuid === uuid);
  if (i < 0) return;
  flip.set(list, i, from);
  const { kind, station } = player.state;
  // Tapping the station that's already on only switches the flip list; re-tuning would cut it off.
  if (station?.uuid === uuid && (kind === 'playing' || kind === 'tuning')) return;
  tuneTo(list[i]);
}

function pressKey(key) {
  if (key === 'prev') flipBy(-1);
  else if (key === 'next') flipBy(1);
  else if (key === 'play') togglePlay();
  else if (key === 'browse') goTo(app.page === 100 ? 200 : upFrom(app.page));
}

function onClick(e) {
  const el = e.target instanceof Element ? e.target.closest('button') : null;
  if (!el) return;
  const d = el.dataset;
  if (d.tune) tapStation(d.tune, d.from);
  else if (d.star) toggleStar(d.star);
  else if (d.page) goTo(Number(d.page));
  else if (d.sub) changeSub(d.sub === 'next' ? 1 : -1);
  else if (d.key) pressKey(d.key);
  else if (d.diag) diagKey(d.diag, el);
}
pageEl.addEventListener('click', onClick);
keysEl.addEventListener('click', onClick);
hdr.addEventListener('click', (e) => {
  const el = e.target instanceof Element ? e.target.closest('button') : null;
  if (!el) return;
  if (el.hasAttribute('data-pad')) setPad(!padOpen);
  else if (el.dataset.page) goTo(Number(el.dataset.page)); // the wide-screen menu
});
padEl.addEventListener('click', (e) => {
  const el = e.target instanceof Element ? e.target.closest('button') : null;
  if (!el) return;
  if (el.dataset.digit) typeDigit(el.dataset.digit);
  else if (el.dataset.padkey === 'del') deleteDigit();
  else if (el.dataset.padkey === 'close') setPad(false);
});

pageEl.addEventListener('submit', (e) => {
  const form = e.target instanceof Element ? e.target.closest('form[data-search]') : null;
  if (!form) return;
  e.preventDefault();
  const input = form.querySelector('input[name=q]');
  input.blur(); // drops the phone keyboard and gives the arrow keys back
  runSearch(input.value.trim());
});

let digitTimer = null;
function clearDigits() {
  clearTimeout(digitTimer);
  digits = '';
}
/**
 * A three-digit page number, like a Teletext remote. A number with no page restores the header;
 * on the keypad it also says so. Keys typed on a keyboard give up after 3 s; the keypad waits.
 */
function typeDigit(d) {
  clearTimeout(digitTimer);
  padNote = '';
  digits += d;
  if (digits.length < 3) {
    if (!padOpen) digitTimer = setTimeout(() => { clearDigits(); renderTop(); }, 3000);
    renderTop();
    renderPadNow();
    return;
  }
  const n = Number(digits);
  clearDigits();
  if (goTo(n)) return; // goTo closes the keypad
  if (padOpen) padNote = `No page ${n}`;
  renderTop();
  renderPadNow();
}

function deleteDigit() {
  digits = digits.slice(0, -1);
  padNote = '';
  renderTop();
  renderPadNow();
}

/** Opens or closes the keypad, starting from an empty number either way. */
function setPad(open) {
  padOpen = open;
  padNote = '';
  clearDigits();
  renderTop();
  renderPadNow();
}

const KEYS = {
  ArrowLeft: () => flipBy(-1),
  ArrowRight: () => flipBy(1),
  ' ': togglePlay,
  Escape: () => { if (padOpen) setPad(false); else { clearDigits(); goTo(100); } },
};
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target instanceof Element && e.target.closest('input, textarea, select')) return;
  const action = Object.hasOwn(KEYS, e.key) ? KEYS[e.key] : /^[0-9]$/.test(e.key) ? () => typeDigit(e.key) : null;
  if (!action) return;
  e.preventDefault(); // no page scroll, and Space doesn't also click a focused button
  if (!e.repeat) action();
});

// ---- Start ----

diag.note('open', matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  ? 'home-screen app' : 'browser tab');
bindMediaSession(loggedSession(navigator.mediaSession, (action) => diag.note('remote', action)), {
  play: startPlay,
  stop: () => player.stop(),
  next: () => flipBy(1),
  prev: () => flipBy(-1),
});
// The app opens on home whatever the history says; back and forward then walk the pages seen.
try {
  history.scrollRestoration = 'manual'; // goTo puts each page at its top
  history.replaceState({ page: app.page }, '');
} catch { /* no history here */ }
addEventListener('popstate', (e) => {
  const n = Number(e.state?.page);
  if (n) goTo(n, { push: false });
});
render();
// Crossing the wide-screen width changes the stations per subpage; the subpage is clamped to fit.
try { wide.addEventListener('change', render); } catch { /* an older browser keeps its first layout */ }
setInterval(renderTop, 15000);
document.addEventListener('visibilitychange', () => {
  diag.note('page', document.visibilityState);
  if (document.visibilityState === 'visible') renderTop(); // timers are throttled in the background
});
