import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// SomaFM's stream servers answer 403 to any Referer they don't know, including the site's own.
// The relay allows a missing Referer.
test('the page sends no Referer, so hotlink-protected streams still play', () => {
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
});
