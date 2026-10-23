// radiotext-relay: streams an http-only Radio Browser station over https.
// GET /s/{stationuuid} only. It never takes a URL from the client: the stream
// address always comes from Radio Browser's record for that uuid, and only a
// station that passed Radio Browser's last check is relayed.

import { connect } from 'cloudflare:sockets';
import { isUuid, relayTarget, buildRequest, findHeadEnd, parseHead, resolveLocation, safeAudioType } from './http1.js';

const API = 'https://de1.api.radio-browser.info';
const UA = 'Radiotext-relay/1.0';
const SITE_ORIGIN = 'https://natanforestree.github.io';
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const LOOKUP_TTL_S = 86400;
const MAX_REDIRECTS = 3;
const MAX_HEAD_BYTES = 16 * 1024;
const HEAD_TIMEOUT_MS = 10000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

class UpstreamError extends Error {}

function plain(status, text) {
  return new Response(text + '\n', {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...CORS },
  });
}

/**
 * A missing Referer is allowed; otherwise only the site and localhost may embed the relay.
 * The site itself sends no Referer at all (index.html has <meta name="referrer"
 * content="no-referrer">, because SomaFM refuses foreign Referers), so requiring one would
 * break the site.
 */
function refererAllowed(referer) {
  if (!referer) return true;
  let origin;
  try { origin = new URL(referer).origin; } catch { return false; }
  return origin === SITE_ORIGIN || LOCAL_ORIGIN.test(origin);
}

/** Radio Browser's record for this uuid (or null), cached for a day. */
async function lookupStation(uuid, ctx) {
  const apiUrl = `${API}/json/stations/byuuid/${uuid}`;
  const key = new Request(apiUrl);
  let res = await caches.default.match(key);
  if (!res) {
    const up = await fetch(apiUrl, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!up.ok) throw new UpstreamError(`lookup HTTP ${up.status}`);
    res = new Response(await up.text(), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${LOOKUP_TTL_S}` },
    });
    ctx.waitUntil(caches.default.put(key, res.clone()));
  }
  const list = await res.json();
  return Array.isArray(list) && list.length ? list[0] : null;
}

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** Reads until the response head ends; gives up past 16 KB or 10 s. */
async function readHead(socket) {
  const reader = socket.readable.getReader();
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new UpstreamError('head timeout')), HEAD_TIMEOUT_MS);
  });
  try {
    let buf = new Uint8Array(0);
    let found;
    while (!(found = findHeadEnd(buf))) {
      if (buf.length > MAX_HEAD_BYTES) throw new UpstreamError('head too large');
      const { value, done } = await Promise.race([reader.read(), expired]);
      if (done) throw new UpstreamError('closed before head');
      buf = concat(buf, value);
    }
    return { reader, buf, found };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Opens the stream at `href`, following up to 3 redirects. Resolves to {body, contentType};
 * contentType is upstream's raw value, so the caller must pass it through safeAudioType.
 */
async function openStream(href, hops = 0) {
  const url = new URL(href);
  if (url.protocol === 'https:') {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok || !res.body) throw new UpstreamError(`https upstream HTTP ${res.status}`);
    return { body: res.body, contentType: res.headers.get('content-type') };
  }
  if (url.protocol !== 'http:') throw new UpstreamError(`unsupported protocol ${url.protocol}`);

  const socket = connect({ hostname: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port) || 80 });
  let head, reader, buf, found;
  try {
    const writer = socket.writable.getWriter();
    await writer.write(new TextEncoder().encode(buildRequest(url)));
    writer.releaseLock();
    ({ reader, buf, found } = await readHead(socket));
    head = parseHead(new TextDecoder().decode(buf.subarray(0, found.headEnd)));
  } catch (err) {
    socket.close().catch(() => {});
    throw err instanceof UpstreamError ? err : new UpstreamError(`connect: ${err && err.message}`);
  }

  if (head.status >= 300 && head.status < 400 && head.headers.location) {
    reader.releaseLock();
    socket.close().catch(() => {});
    if (hops >= MAX_REDIRECTS) throw new UpstreamError('too many redirects');
    return openStream(resolveLocation(url.href, head.headers.location), hops + 1);
  }
  if (head.status !== 200) {
    reader.releaseLock();
    socket.close().catch(() => {});
    throw new UpstreamError(`upstream status ${head.status}`);
  }

  // From here on, bytes go socket -> response without JS touching each chunk.
  const { readable, writable } = new IdentityTransformStream();
  const leftover = buf.subarray(found.bodyStart);
  reader.releaseLock();
  (async () => {
    const w = writable.getWriter();
    if (leftover.length) await w.write(leftover); // resolves once the listener reads it
    w.releaseLock();
    await socket.readable.pipeTo(writable);
  })().catch(() => socket.close().catch(() => {})); // the listener left, or upstream broke
  return { body: readable, contentType: head.headers['content-type'] };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'GET') return plain(405, 'method not allowed');
    if (!refererAllowed(request.headers.get('Referer'))) return plain(403, 'forbidden');

    const m = /^\/s\/([^/]+)$/.exec(new URL(request.url).pathname);
    if (!m || !isUuid(m[1])) return plain(404, 'not found');

    try {
      const target = relayTarget(await lookupStation(m[1], ctx));
      if (!('url' in target)) return plain(target.status, target.error);

      const { body, contentType } = await openStream(target.url);
      // Whatever upstream (or a redirect it chose) claims, only audio is served.
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': safeAudioType(contentType),
          'Content-Security-Policy': "sandbox; default-src 'none'",
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          ...CORS,
        },
      });
    } catch (err) {
      console.log(`relay ${m[1]}: ${err && err.message}`);
      return plain(502, 'upstream failed');
    }
  },
};
