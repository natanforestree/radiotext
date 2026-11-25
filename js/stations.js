// Pure station logic: normalising, filtering, deduping and stream URLs.
import { EXCLUDE_TAGS, EXCLUDE_NAME } from './config.js';

const HLS_MIME = 'application/vnd.apple.mpegurl';
const SUFFIX = /\s*\(\s*(?:(?:\d+k(?:bps)?|\d+|aac\+?|mp3|ogg|opus|flac|hq|lq)(?![\w+])\s*)+\)\s*$/i;

export function toStation(raw) {
  return {
    uuid: raw.stationuuid,
    name: String(raw.name ?? '').trim(),
    url: raw.url_resolved || raw.url || '',
    codec: raw.codec ?? '',
    bitrate: raw.bitrate ?? 0,
    tags: String(raw.tags ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
    country: raw.countrycode ?? '',
    votes: raw.votes ?? 0,
    hls: Boolean(raw.hls),
  };
}

export function displayName(station) {
  return station.name.replace(SUFFIX, '').trim();
}

export function baseName(station) {
  return displayName(station).replace(/\s+/g, ' ').toLowerCase();
}

const MIMES = {
  MP3: 'audio/mpeg', AAC: 'audio/aac', 'AAC+': 'audio/aac', OGG: 'audio/ogg',
  OPUS: 'audio/ogg; codecs=opus', FLAC: 'audio/flac',
};

export function codecMime(codec) {
  return MIMES[String(codec ?? '').toUpperCase()] ?? null;
}

export function isPlayable(station, canPlay, dead) {
  if (dead.has(station.uuid)) return false;
  if (station.hls) return canPlay(HLS_MIME);
  const mime = codecMime(station.codec);
  return mime !== null && canPlay(mime);
}

export function isExcluded(station, extraTags = []) {
  const banned = new Set([...EXCLUDE_TAGS, ...extraTags]);
  return station.tags.some((t) => banned.has(t)) || EXCLUDE_NAME.test(station.name);
}

export function dedupe(stations) {
  const groups = new Map();
  for (const s of stations) {
    const key = baseName(s);
    const best = groups.get(key);
    if (!best) { groups.set(key, s); continue; }
    const d = Math.abs(s.bitrate - 128) - Math.abs(best.bitrate - 128);
    if (d < 0 || (d === 0 && s.votes > best.votes)) groups.set(key, s);
  }
  return [...groups.values()];
}

export function httpsVariant(url) {
  return url.startsWith('http://') ? `https://${url.slice(7)}` : null;
}

// An IPv4 or bracketed IPv6 literal, as URL.hostname reports it.
const IP_HOST = /^(?:\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:.]+\])$/i;

function onBareIp(url) {
  try { return IP_HOST.test(new URL(url).hostname); } catch { return false; }
}

/** URLs to try in order. https on a bare IP never has a valid certificate (and tends to hang
 *  until the tune timeout), so such a station goes straight to the relay, or has none. */
export function streamCandidates(station, relayBase) {
  const https = httpsVariant(station.url);
  if (!https) return [station.url];
  const relay = relayBase ? [`${relayBase}/s/${station.uuid}`] : [];
  return onBareIp(station.url) ? relay : [https, ...relay];
}

/** A tag as a label: "post-hardcore" → "Post-Hardcore", "r&b" → "R&B". */
export function titleCase(s) {
  return String(s).replace(/(^|[\s\-/&(])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

/** The first genre that matches, skipping broad ones (Rock, Pop…) while a narrower one does. */
export function shortTag(station, genres) {
  const fits = (g) => g.tags.some((t) => station.tags.includes(t));
  const g = genres.find((x) => !x.broad && fits(x)) ?? genres.find((x) => x.broad && fits(x));
  return g ? g.label : titleCase(station.tags[0] ?? '');
}

export function prepareList(raws, { canPlay, dead, genre }) {
  const extra = genre?.exclude ?? [];
  const kept = raws.map(toStation)
    .filter((s) => !isExcluded(s, extra))
    .filter((s) => isPlayable(s, canPlay, dead));
  return dedupe(kept).sort((a, b) => b.votes - a.votes);
}
