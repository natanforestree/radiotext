// Radiotext: wires the pages, the fastext keys, the keyboard and the lock screen to the player.
// Nothing plays on load: browsers need a tap (PLAY or a station row) before audio can start.
import { RELAY_BASE, PRESETS, GENRES, PER_PAGE, POLL_MS, STATIC_ENABLED } from './config.js';
import { prepareList } from './stations.js';
import { safeStorage, createSaved, createDead } from './saved.js';
import { createFlip } from './fliplist.js';
import { route, paginate } from './pages.js';
import { createRadioBrowser } from './radiobrowser.js';
import { sourceFor, fetchSong } from './nowplaying.js';
import { createPlayer } from './player.js';
import { createStatic } from './static.js';
import { renderHeader, renderOnAir, renderHome, renderGenres, renderList, renderSearch, renderFastext } from './render.js';
import { buildMetadata, playbackStateFor, bindMediaSession } from './mediasession.js';

/** @typedef {import('./config.js').Station} Station */

const hdr = document.getElementById('hdr');
const pageEl = document.getElementById('page');
const keysEl = document.getElementById('fastext');
const audio = /** @type {HTMLAudioElement} */ (document.getElementById('radio'));

// ---- Services ----

// Even reading window.localStorage throws when storage is blocked, so that is wrapped too.
const store = safeStorage((() => { try { return globalThis.localStorage; } catch { return null; } })());
const saved = createSaved(store, PRESETS);
const dead = createDead(store);
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

// ---- Rendering ----

function pageHtml() {
  const list = saved.list();
  const station = shown();
  const currentUuid = station?.uuid ?? null;
  const r = route(app.page, { savedCount: list.length, genres: GENRES });
  if (r?.kind === 'genres') return renderGenres(GENRES);
  if (r?.kind === 'genre' || r?.kind === 'search') {
    const l = app.lists.get(app.page);
    const body = l && {
      stations: l.stations, status: l.status, subpage: app.subpage,
      savedUuids: new Set(list.map((s) => s.uuid)), currentUuid, from: String(app.page),
    };
    if (r.kind === 'search') return renderSearch({ query: app.query, list: body ?? null });
    return renderList({ page: app.page, title: r.genre.label, ...(body ?? { stations: [], status: 'loading',
      subpage: 1, savedUuids: new Set(), currentUuid, from: String(app.page) }) });
  }
  return renderHome({ onAir: onAirArgs(station), saved: list, currentUuid });
}

let onAirHtml = null; // the ON AIR block as last rendered, so an unchanged one isn't replaced

/** Re-renders the whole page. Text typed into the search box survives it. */
function render() {
  const input = pageEl.querySelector('input[name=q]');
  const typed = input && { value: input.value, focused: document.activeElement === input };
  pageEl.innerHTML = pageHtml();
  onAirHtml = pageEl.querySelector('#onair') ? renderOnAir(onAirArgs()) : null;
  const again = typed && pageEl.querySelector('input[name=q]');
  if (again) {
    again.value = typed.value;
    if (typed.focused) again.focus();
  }
  renderTop();
  renderKeys();
  updateSession();
}

/** After a player or song change: the ON AIR block, the current row, the keys, the lock screen. */
function refreshLive() {
  const onair = pageEl.querySelector('#onair');
  if (onair) {
    const html = renderOnAir(onAirArgs());
    if (html !== onAirHtml) onair.outerHTML = html;
    onAirHtml = html;
  }
  const uuid = shown()?.uuid;
  for (const row of pageEl.querySelectorAll('.row[data-tune]')) row.classList.toggle('cur', row.dataset.tune === uuid);
  renderKeys();
  updateSession();
}

// Digits typed so far, shown as P2__ in the header.
let digits = '';
function renderTop() {
  hdr.innerHTML = renderHeader(digits ? digits.padEnd(3, '_') : app.page, new Date());
}

// The keys are patched in place, never replaced: a state change landing mid-press (NEXT, then
// 'playing' arrives) would otherwise swap the button under the finger and lose the tap.
function renderKeys() {
  const t = document.createElement('template');
  t.innerHTML = renderFastext({ page: app.page, playing: isOn() });
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
    try {
      ms.metadata = station ? new MediaMetadata(buildMetadata({ station, song: app.song })) : null;
    } catch { /* no MediaMetadata in this browser */ }
  }
  try { ms.playbackState = playbackStateFor(station ? kind : null); } catch { /* not supported */ }
}

// ---- Playback ----

function onChange({ kind }) {
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
  const sub = Math.floor(i / PER_PAGE) + 1;
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

/** Goes to page n. A saved-station number (101–199) tunes that station and shows home. */
function goTo(n) {
  const r = route(n, { savedCount: saved.list().length, genres: GENRES });
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
  }
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
  app.subpage = paginate(l.stations, PER_PAGE, app.subpage + step).subpage;
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
  else if (key === 'browse') goTo(app.page === 100 ? 200 : 100);
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
}
pageEl.addEventListener('click', onClick);
keysEl.addEventListener('click', onClick);

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
/** A three-digit page number, like a Teletext remote. A number with no page restores the header. */
function typeDigit(d) {
  clearTimeout(digitTimer);
  digits += d;
  if (digits.length < 3) {
    digitTimer = setTimeout(() => { clearDigits(); renderTop(); }, 3000);
    renderTop();
    return;
  }
  const n = Number(digits);
  clearDigits();
  if (!goTo(n)) renderTop();
}

const KEYS = {
  ArrowLeft: () => flipBy(-1),
  ArrowRight: () => flipBy(1),
  ' ': togglePlay,
  Escape: () => { clearDigits(); goTo(100); },
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

bindMediaSession(navigator.mediaSession, {
  play: startPlay,
  stop: () => player.stop(),
  next: () => flipBy(1),
  prev: () => flipBy(-1),
});
render();
setInterval(renderTop, 15000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') renderTop(); // timers are throttled in the background
});
