// Teletext mosaic art: small character grids drawn as crisp SVG rects.
// Each character is one cell; '.' is transparent. One <rect> per horizontal run.

/** Character → Teletext colour (the 8 tokens on :root in styles.css). */
export const MOSAIC_COLORS = {
  K: 'var(--black)', R: 'var(--red)', G: 'var(--green)', Y: 'var(--yellow)',
  B: 'var(--blue)', M: 'var(--magenta)', C: 'var(--cyan)', W: 'var(--white)',
};

/** A tuning-dial scale under the blue title band: ticks on a baseline, with a red needle. */
export const TITLE_STRIPE = [
  '.W.......W.R.....W.......W......',
  '.W...W...W.R.W...W...W...W...W..',
  'CCCCCCCCCCCRCCCCCCCCCCCCCCCCCCCC',
];

/** A lattice radio mast with a warning light and signal arcs either side. */
export const ANTENNA = [
  '.........R.........',
  '..C......W......C..',
  '.C...C...W...C...C.',
  'C...C...WWW...C...C',
  'C...C...W.W...C...C',
  'C...C...WWW...C...C',
  '.C...C..W.W..C...C.',
  '..C....WWWWW....C..',
  '.......W...W.......',
  '......WWWWWWW......',
  '......W.....W......',
  '.....WW.....WW.....',
];

/**
 * @param {string[]} rows equal-length strings, one character per cell
 * @param {Record<string, string>} colors character → fill
 * @returns {string} an inline <svg>
 */
export function mosaicSvg(rows, colors) {
  const w = Math.max(0, ...rows.map((r) => r.length));
  const h = rows.length;
  let rects = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const c = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === c) end++;
      if (c !== '.' && colors[c]) {
        rects += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${colors[c]}"/>`;
      }
      x = end;
    }
  });
  return `<svg viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rects}</svg>`;
}
