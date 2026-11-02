// Page numbers: 100 home, 101-199 saved, 200 genres, 201-206 more genre indexes,
// 210-299 genre pages, 300 search, 999 engineering log.

export const savedPage = (i) => 101 + i;

/**
 * @param {number} n
 * @param {{savedCount: number, genres: import('./config.js').Genre[], sections?: import('./config.js').Section[]}} ctx
 */
export function route(n, { savedCount, genres, sections = [] }) {
  if (n === 100) return { kind: 'home' };
  if (n >= 101 && n <= 199) return n - 101 < savedCount ? { kind: 'saved', index: n - 101 } : null;
  if (n === 200) return { kind: 'genres' };
  if (n === 300) return { kind: 'search' };
  if (n === 999) return { kind: 'diag' };
  const section = sections.find((s) => s.page === n);
  if (section) return { kind: 'section', section };
  const genre = genres.find((g) => g.page === n);
  return genre ? { kind: 'genre', genre } : null;
}

/**
 * One level up, where the cyan key goes away from home: a genre page's index (200 for the
 * underground genres), 200 from the other genre indexes, and home from anything else.
 * @param {number} n
 * @param {{genres: import('./config.js').Genre[], sections: import('./config.js').Section[]}} ctx
 */
export function parentPage(n, { genres, sections }) {
  if (genres.some((g) => g.page === n)) {
    const section = sections.find((s) => n >= s.from && n <= s.to);
    if (section) return section.page;
  }
  if (n !== 200 && sections.some((s) => s.page === n)) return 200;
  return 100;
}

/** The genres a section's index page lists: those numbered from..to, in page order. */
export function genresIn(section, genres) {
  return genres.filter((g) => g.page >= section.from && g.page <= section.to).sort((a, b) => a.page - b.page);
}

/** subpage is 1-based and clamped */
export function paginate(list, perPage, subpage) {
  const subpages = Math.max(1, Math.ceil(list.length / perPage));
  const sp = Math.min(Math.max(Math.trunc(subpage) || 1, 1), subpages);
  return { items: list.slice((sp - 1) * perPage, sp * perPage), subpage: sp, subpages };
}
