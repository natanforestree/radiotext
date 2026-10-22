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

export function streamCandidates(station, relayBase) {
  const https = httpsVariant(station.url);
  if (!https) return [station.url];
  return relayBase ? [https, `${relayBase}/s/${station.uuid}`] : [https];
}

export function shortTag(station, genres) {
  for (const g of genres) {
    if (g.tags.some((t) => station.tags.includes(t))) return g.label;
  }
  return (station.tags[0] ?? '').toUpperCase();
}

export function prepareList(raws, { canPlay, dead, genre }) {
  const extra = genre?.exclude ?? [];
  const kept = raws.map(toStation)
    .filter((s) => !isExcluded(s, extra))
    .filter((s) => isPlayable(s, canPlay, dead));
  return dedupe(kept).sort((a, b) => b.votes - a.votes);
}
