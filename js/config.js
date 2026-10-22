// Radiotext configuration: presets, genre pages, sizes and timings.

/**
 * @typedef {{uuid: string, name: string, url: string, codec: string, bitrate: number,
 *   tags: string[], country: string, votes: number, hls: boolean}} Station
 * @typedef {{page: number, label: string, tags: string[], exclude?: string[]}} Genre
 */

/** @type {string|null} Cloudflare Worker relay (worker/) for http-only stations: GET {RELAY_BASE}/s/{uuid}. */
export const RELAY_BASE = 'https://radiotext-relay.nathanforestlee.workers.dev';
export const API_FALLBACK = 'https://de1.api.radio-browser.info';
export const SERVERS_URL = 'https://all.api.radio-browser.info/json/servers';

/** @type {Station[]} */
export const PRESETS = [
  { uuid: '963b7906-0601-11e8-ae97-52543be04c81', name: '12XU', url: 'https://stream.laut.fm/12xu', codec: 'MP3', bitrate: 128,
    tags: ['garage punk', 'indie rock', 'noise rock', 'post-punk', 'punk'], country: 'DE', votes: 433, hls: false },
  { uuid: '960de41d-0601-11e8-ae97-52543be04c81', name: 'SomaFM Metal Detector', url: 'https://ice5.somafm.com/metal-128-aac', codec: 'AAC', bitrate: 128,
    tags: ['black metal', 'doom metal', 'post-punk', 'progressive rock', 'sludge', 'stoner rock'], country: 'US', votes: 7731, hls: false },
  { uuid: 'ac497573-a6c5-4505-9086-2a905134abb5', name: 'RadCap Noise Rock', url: 'http://79.120.39.202:8000/noiserock', codec: 'AAC+', bitrate: 320,
    tags: ['noise rock', 'rock'], country: 'RU', votes: 19, hls: false },
];
/** @type {Station} */
export const FALLBACK_103 = { uuid: '873bc6e5-2632-424c-a044-5b08b9655c19', name: 'Athens Noise Rocks',
  url: 'https://radio.athensnoise.rocks/listen/athensnoise.rocks/radio.mp3', codec: 'MP3', bitrate: 128,
  tags: ['post-hardcore', 'hardcore', 'punk rock', 'crust'], country: 'GR', votes: 128, hls: false };
/** @type {Genre[]} */
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

export const PER_PAGE = 8;
export const MAX_SAVED = 99;
export const LIST_LIMIT = 300;
export const SEARCH_LIMIT = 100;

export const TUNE_TIMEOUT_MS = 8000;
export const STALL_MS = 10000;
export const GIVE_UP_MS = 120000;
export const STOP_DROP_MS = 30000;
export const STATIC_MAX_MS = 1500;
export const POLL_MS = 30000;
export const DEAD_TTL_MS = 30 * 24 * 3600 * 1000;
export const STATIC_ENABLED = true;
