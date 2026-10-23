// Lock screen and car controls (Media Session API). Pure helpers; main.js applies them.
import { displayName } from './stations.js';

const ARTWORK = [
  { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
];

/** Init for `new MediaMetadata()`: the song as the title when known, else the station. */
export function buildMetadata({ station, song }) {
  const name = displayName(station);
  return { title: song || name, artist: name, album: 'Radiotext', artwork: ARTWORK.map((a) => ({ ...a })) };
}

const ON = new Set(['tuning', 'playing', 'retrying']);

/** @param {import('./player.js').PlayerKind|null} kind null when no station has been tuned */
export function playbackStateFor(kind) {
  if (kind == null) return 'none';
  return ON.has(kind) ? 'playing' : 'paused';
}

/**
 * Binds the lock-screen and car buttons. pause and stop both stop the stream; nexttrack and
 * previoustrack flip stations. The seek actions are cleared so the phone shows next/prev, not ±10 s.
 * Browsers throw for actions they don't know, so each binding stands alone.
 * @param {MediaSession|undefined} ms
 * @param {{play: () => void, stop: () => void, next: () => void, prev: () => void}} actions
 */
export function bindMediaSession(ms, { play, stop, next, prev }) {
  if (!ms) return;
  const bind = (action, fn) => {
    try { ms.setActionHandler(action, fn ? () => fn() : null); } catch { /* action not supported here */ }
  };
  bind('play', play);
  bind('pause', stop);
  bind('stop', stop);
  bind('nexttrack', next);
  bind('previoustrack', prev);
  bind('seekbackward', null);
  bind('seekforward', null);
  bind('seekto', null);
}
