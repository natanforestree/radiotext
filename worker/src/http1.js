// Tiny HTTP/1.0 helpers for the relay: build the request, find and parse the
// response head (HTTP or ICY status lines), resolve redirects. Pure functions.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STATUS = /^(?:HTTP\/\d(?:\.\d)?|ICY)\s+(\d{3})(?:\s|$)/;

/** @param {unknown} s @returns {boolean} true for a lower-case Radio Browser station uuid. */
export function isUuid(s) {
  return typeof s === 'string' && UUID.test(s);
}

/** @param {URL} url @returns {string} a plain HTTP/1.0 GET for that URL. */
export function buildRequest(url) {
  const target = (url.pathname || '/') + url.search;
  return `GET ${target} HTTP/1.0\r\n` +
    `Host: ${url.host}\r\n` +
    'User-Agent: Radiotext-relay/1.0\r\n' +
    'Accept: */*\r\n' +
    'Icy-MetaData: 0\r\n' +
    'Connection: close\r\n' +
    '\r\n';
}

/**
 * Finds the blank line that ends the response head (CRLF or bare LF).
 * @param {Uint8Array} bytes
 * @returns {{headEnd: number, bodyStart: number}|null} headEnd is where the
 *   last header line's terminator starts; bodyStart is the first body byte.
 */
export function findHeadEnd(bytes) {
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 10) continue;
    let bodyStart = -1;
    if (bytes[i + 1] === 10) bodyStart = i + 2;
    else if (bytes[i + 1] === 13 && bytes[i + 2] === 10) bodyStart = i + 3;
    if (bodyStart < 0) continue;
    return { headEnd: i > 0 && bytes[i - 1] === 13 ? i - 1 : i, bodyStart };
  }
  return null;
}

/**
 * @param {string} text the head, without its final blank line
 * @returns {{status: number, headers: Record<string, string>}} status 0 when the
 *   status line isn't understood; header names are lower-cased.
 */
export function parseHead(text) {
  const [first = '', ...lines] = text.split(/\r?\n/);
  const m = STATUS.exec(first.trim());
  /** @type {Record<string, string>} */
  const headers = {};
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  return { status: m ? Number(m[1]) : 0, headers };
}

/** @param {string} base @param {string} location @returns {string} the absolute redirect target. */
export function resolveLocation(base, location) {
  return new URL(location, base).href;
}
