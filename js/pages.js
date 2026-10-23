// Page numbers: 100 home, 101-199 saved, 200 genres, 210-228 genre pages, 300 search,
// 999 engineering log.

export const savedPage = (i) => 101 + i;

/** @param {number} n @param {{savedCount: number, genres: import('./config.js').Genre[]}} ctx */
export function route(n, { savedCount, genres }) {
  if (n === 100) return { kind: 'home' };
  if (n >= 101 && n <= 199) return n - 101 < savedCount ? { kind: 'saved', index: n - 101 } : null;
  if (n === 200) return { kind: 'genres' };
  if (n === 300) return { kind: 'search' };
  if (n === 999) return { kind: 'diag' };
  const genre = genres.find((g) => g.page === n);
  return genre ? { kind: 'genre', genre } : null;
}

/** subpage is 1-based and clamped */
export function paginate(list, perPage, subpage) {
  const subpages = Math.max(1, Math.ceil(list.length / perPage));
  const sp = Math.min(Math.max(Math.trunc(subpage) || 1, 1), subpages);
  return { items: list.slice((sp - 1) * perPage, sp * perPage), subpage: sp, subpages };
}
