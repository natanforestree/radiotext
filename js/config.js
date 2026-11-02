// Radiotext configuration: presets, genre pages, sizes and timings.

/**
 * @typedef {{uuid: string, name: string, url: string, codec: string, bitrate: number,
 *   tags: string[], country: string, votes: number, hls: boolean}} Station
 * @typedef {{page: number, label: string, tags: string[], exclude?: string[], broad?: boolean}} Genre
 *   A broad genre (ROCK, POP…) labels a station only when no narrower one matches.
 * @typedef {{page: number, label: string, from: number, to: number}} Section
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
  { page: 229, label: 'GOTH', tags: ['gothic', 'goth', 'gothic rock', 'deathrock', 'death rock'] },

  { page: 230, label: 'ROCK', tags: ['rock'], broad: true },
  { page: 231, label: 'INDIE', tags: ['indie', 'indie rock', 'indie pop'], broad: true },
  { page: 232, label: 'ALTERNATIVE', tags: ['alternative', 'alternative rock', 'alt rock'], broad: true },
  { page: 233, label: 'BRITPOP', tags: ['britpop', 'brit pop'] },
  { page: 234, label: 'GRUNGE', tags: ['grunge'] },
  { page: 235, label: 'POST-ROCK', tags: ['post-rock', 'post rock', 'postrock', 'post-metal'] },
  { page: 236, label: 'PSYCHEDELIC', tags: ['psychedelic', 'psychedelic rock', 'psych', 'neo-psychedelia'] },
  { page: 237, label: 'PROG ROCK', tags: ['progressive rock', 'prog rock', 'prog'] },
  { page: 238, label: 'GARAGE ROCK', tags: ['garage rock', 'garage punk'] },
  { page: 239, label: 'ROCKABILLY & SURF', tags: ['rockabilly', 'psychobilly', 'surf', 'surf rock', 'surf music'] },
  { page: 240, label: 'CLASSIC ROCK', tags: ['classic rock'] },
  { page: 241, label: 'HARD ROCK', tags: ['hard rock'] },
  { page: 242, label: 'METAL', tags: ['metal', 'heavy metal'], broad: true },
  { page: 243, label: 'BLACK METAL', tags: ['black metal'] },
  { page: 244, label: 'DEATH METAL', tags: ['death metal'] },
  { page: 245, label: 'THRASH METAL', tags: ['thrash metal', 'thrash'] },
  { page: 246, label: 'POWER METAL', tags: ['power metal', 'symphonic metal', 'melodic metal'] },
  { page: 247, label: 'METALCORE & NU METAL', tags: ['metalcore', 'deathcore', 'nu metal', 'nu-metal'] },

  { page: 250, label: 'ELECTRONIC', tags: ['electronic', 'electronica'], broad: true },
  { page: 251, label: 'TECHNO', tags: ['techno'] },
  { page: 252, label: 'HOUSE', tags: ['house', 'deep house', 'tech house'] },
  { page: 253, label: 'TRANCE', tags: ['trance', 'psytrance', 'goa trance'] },
  { page: 254, label: 'DRUM & BASS', tags: ['drum and bass', 'drum & bass', 'drum n bass', 'dnb', 'jungle'] },
  { page: 255, label: 'DUBSTEP', tags: ['dubstep'] },
  { page: 256, label: 'AMBIENT', tags: ['ambient', 'dark ambient', 'drone'] },
  { page: 257, label: 'DOWNTEMPO', tags: ['downtempo', 'trip hop', 'trip-hop'] },
  { page: 258, label: 'SYNTHWAVE', tags: ['synthwave', 'retrowave', 'outrun', 'vaporwave'] },
  { page: 259, label: 'IDM', tags: ['idm', 'glitch', 'breakcore'] },

  { page: 260, label: 'JAZZ', tags: ['jazz'], broad: true },
  { page: 261, label: 'FREE JAZZ', tags: ['free jazz', 'avant-garde jazz', 'avant jazz', 'spiritual jazz'] },
  { page: 262, label: 'JAZZ FUSION', tags: ['jazz fusion', 'fusion', 'acid jazz', 'jazz-funk'] },
  { page: 263, label: 'SWING', tags: ['swing', 'big band'] },
  { page: 264, label: 'LOUNGE', tags: ['lounge', 'exotica'] },
  { page: 265, label: 'BLUES', tags: ['blues', 'blues rock'] },
  { page: 266, label: 'SOUL', tags: ['soul', 'northern soul', 'neo soul'] },
  { page: 267, label: 'FUNK', tags: ['funk'] },
  { page: 268, label: 'R&B', tags: ['rnb', 'r&b', 'rhythm and blues'] },
  { page: 269, label: 'HIP HOP', tags: ['hip hop', 'hiphop', 'hip-hop', 'rap'] },

  { page: 270, label: 'REGGAE', tags: ['reggae', 'roots reggae'] },
  { page: 271, label: 'DUB', tags: ['dub'] },
  { page: 272, label: 'SKA', tags: ['ska', 'ska punk'] },
  { page: 273, label: 'LATIN', tags: ['latin', 'latin music'] },
  { page: 274, label: 'TANGO', tags: ['tango'] },
  { page: 275, label: 'BRAZILIAN', tags: ['mpb', 'bossa nova', 'samba'] },
  { page: 276, label: 'AFRICAN', tags: ['african music', 'afrobeat', 'afrobeats', 'highlife', 'afropop'] },
  { page: 277, label: 'BOLLYWOOD', tags: ['bollywood', 'indian', 'hindi'] },
  { page: 278, label: 'WORLD', tags: ['world music', 'world'], exclude: ['news', 'talk', 'information', 'news talk'], broad: true },

  // Bare 'folk' on Radio Browser is mostly Balkan pop-folk, so this page goes by narrower tags.
  { page: 280, label: 'FOLK', tags: ['folk rock', 'indie folk', 'singer-songwriter', 'contemporary folk', 'folk-rock', 'neofolk', 'acoustic'] },
  { page: 281, label: 'CELTIC', tags: ['celtic', 'irish folk', 'irish music'] },
  { page: 282, label: 'COUNTRY', tags: ['country', 'classic country', 'country music'] },
  { page: 283, label: 'AMERICANA', tags: ['americana', 'bluegrass', 'alt-country', 'alt country'] },
  { page: 284, label: 'CLASSICAL', tags: ['classical', 'classical music'] },
  { page: 285, label: 'OPERA', tags: ['opera'] },
  { page: 286, label: 'SOUNDTRACKS', tags: ['soundtrack', 'soundtracks', 'film music', 'movie soundtracks', 'film score'] },
  { page: 287, label: 'VIDEO GAME MUSIC', tags: ['video game music', 'vgm', 'chiptune', 'game music'] },

  { page: 290, label: 'POP', tags: ['pop'], broad: true },
  { page: 291, label: 'SYNTHPOP', tags: ['synthpop', 'synth pop', 'synth-pop', 'electropop'] },
  { page: 292, label: 'NEW WAVE', tags: ['new wave'] },
  { page: 293, label: 'DISCO', tags: ['disco', 'italo disco', 'nu disco', 'italo-disco'] },
  { page: 294, label: 'OLDIES', tags: ['oldies', '50s', '60s', 'doo wop', "rock'n'roll", 'rock n roll', 'rock and roll'] },
  { page: 295, label: '70S', tags: ['70s'] },
  { page: 296, label: '80S', tags: ['80s'] },
  { page: 297, label: '90S', tags: ['90s'] },
  { page: 298, label: 'K-POP', tags: ['k-pop', 'kpop'] },
  { page: 299, label: 'J-POP', tags: ['j-pop', 'jpop', 'anime'] },
];
/**
 * The genre index pages. Page 200 lists the first range itself and links to the others; each
 * of those lists the genre pages numbered from..to.
 * @type {Section[]}
 */
export const SECTIONS = [
  { page: 200, label: 'UNDERGROUND', from: 210, to: 229 },
  { page: 201, label: 'ROCK & METAL', from: 230, to: 249 },
  { page: 202, label: 'ELECTRONIC', from: 250, to: 259 },
  { page: 203, label: 'JAZZ, SOUL & HIP HOP', from: 260, to: 269 },
  { page: 204, label: 'REGGAE & WORLD', from: 270, to: 279 },
  { page: 205, label: 'FOLK, COUNTRY, CLASSICAL', from: 280, to: 289 },
  { page: 206, label: 'POP & OLDIES', from: 290, to: 299 },
];
export const EXCLUDE_TAGS = ['adult', 'erotic', 'explicit', 'sleep', 'relax', 'relaxation', 'asmr', 'meditation', 'white noise', 'pink noise', 'brown noise'];
export const EXCLUDE_NAME = /\b(white|pink|brown|green) noise\b|\bsleep\b|\basmr\b|\bsex\b/i;

export const PER_PAGE = 8;
export const MAX_SAVED = 99;
export const LIST_LIMIT = 300;
export const SEARCH_LIMIT = 100;

export const TUNE_TIMEOUT_MS = 8000;
export const RB_TIMEOUT_MS = 8000;
export const STALL_MS = 10000;
export const GIVE_UP_MS = 120000;
export const STOP_DROP_MS = 30000;
export const OUTSIDE_PAUSE_DROP_MS = 600000; // a phone call or Siri: long enough for most calls (Ruling 12)
export const STATIC_MAX_MS = 1500;
export const POLL_MS = 30000;
export const DEAD_TTL_MS = 30 * 24 * 3600 * 1000;
export const STATIC_ENABLED = true;
