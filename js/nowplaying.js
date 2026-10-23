// Current-song lookups for SomaFM and laut.fm. `fetch` is injected.

export function sourceFor(station) {
  let u;
  try { u = new URL(station.url); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const first = u.pathname.split('/').filter(Boolean)[0];
  if (!first) return null;
  if (host === 'somafm.com' || host.endsWith('.somafm.com')) {
    return { kind: 'soma', id: first.split('-')[0] };
  }
  if (host === 'laut.fm' || host.endsWith('.laut.fm')) return { kind: 'laut', id: first };
  return null;
}

export function parseSoma(json, id) {
  const ch = Array.isArray(json?.channels) ? json.channels.find((c) => c.id === id) : null;
  return ch?.lastPlaying || null;
}

export function parseLaut(json) {
  const title = json?.title;
  if (!title) return null;
  const artist = json.artist?.name;
  return artist ? `${artist} — ${title}` : title;
}

export async function fetchSong(source, fetch) {
  try {
    const url = source.kind === 'soma'
      ? 'https://api.somafm.com/channels.json'
      : `https://api.laut.fm/station/${encodeURIComponent(source.id)}/current_song`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    return source.kind === 'soma' ? parseSoma(json, source.id) : parseLaut(json);
  } catch {
    return null;
  }
}
