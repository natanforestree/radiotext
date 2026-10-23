// Radio Browser API client. `fetch` is injected so it can be tested.
import { SERVERS_URL, API_FALLBACK, LIST_LIMIT, SEARCH_LIMIT } from './config.js';

const FILTERS = 'hidebroken=true&order=votes&reverse=true';

export function createRadioBrowser({ fetch, random = Math.random }) {
  let basePromise = null;

  async function pickBase() {
    try {
      const res = await fetch(SERVERS_URL);
      if (!res.ok) return API_FALLBACK;
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) return API_FALLBACK;
      const name = rows[Math.floor(random() * rows.length)].name;
      return name ? `https://${name}` : API_FALLBACK;
    } catch {
      return API_FALLBACK;
    }
  }

  const getBase = () => (basePromise ??= pickBase());

  async function get(path) {
    const attempt = async (base) => {
      const res = await fetch(base + path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };
    const base = await getBase();
    try {
      return await attempt(base);
    } catch (err) {
      if (base === API_FALLBACK) throw err;
      return attempt(API_FALLBACK);
    }
  }

  async function merged(paths) {
    const results = await Promise.allSettled(paths.map(get));
    const ok = results.filter((r) => r.status === 'fulfilled');
    if (ok.length === 0) throw results[0]?.reason ?? new Error('no requests');
    const byUuid = new Map();
    for (const { value } of ok) {
      for (const row of Array.isArray(value) ? value : []) {
        if (!byUuid.has(row.stationuuid)) byUuid.set(row.stationuuid, row);
      }
    }
    return [...byUuid.values()].sort((a, b) => (b.votes || 0) - (a.votes || 0));
  }

  return {
    byGenre: (genre) => merged(genre.tags.map((tag) =>
      `/json/stations/search?tag=${encodeURIComponent(tag)}&tagExact=true&${FILTERS}&limit=${LIST_LIMIT}`)),
    search(text) {
      const q = String(text ?? '').trim();
      if (!q) return Promise.resolve([]);
      const e = encodeURIComponent(q);
      return merged([
        `/json/stations/search?name=${e}&${FILTERS}&limit=${SEARCH_LIMIT}`,
        `/json/stations/search?tag=${e}&${FILTERS}&limit=${SEARCH_LIMIT}`,
      ]);
    },
    async countClick(uuid) {
      try { await get(`/json/url/${encodeURIComponent(uuid)}`); } catch { /* ignore */ }
    },
  };
}
