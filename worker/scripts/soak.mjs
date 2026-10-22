#!/usr/bin/env node
// Soak test for the relay: streams <url> for <seconds> and checks it never stalls.
// Usage: node worker/scripts/soak.mjs <url> <seconds>
// PASS (exit 0) only if: at most 1 reconnect, every reconnect gap < 3000 ms,
// and no gap between chunks > 3000 ms. Otherwise prints FAIL <reason>, exit 1.

const [url, secondsArg] = process.argv.slice(2);
const seconds = Number(secondsArg);
if (!url || !(seconds > 0)) {
  console.error('usage: node soak.mjs <url> <seconds>');
  process.exit(2);
}

const MAX_GAP_MS = 3000;
const MAX_RECONNECTS = 1;
const start = Date.now();
const ac = new AbortController();

let bytes = 0;
let longestGap = 0;       // longest gap between chunks within one connection
let lastChunk = null;     // time of the latest chunk on the current connection
let droppedAt = null;     // time of the last chunk before a drop, while reconnecting
let reconnects = 0;
const reconnectGaps = [];
let finished = false;

const elapsed = () => Math.round((Date.now() - start) / 1000);
const line = () => `t=${elapsed()}s bytes=${bytes} longestGap=${longestGap}`;

function finish(failReason) {
  if (finished) return;
  finished = true;
  clearInterval(ticker);
  clearTimeout(deadline);
  ac.abort();
  console.log(`${line()} reconnects=${reconnects} reconnectGaps=[${reconnectGaps.join(',')}]`);
  if (!failReason && bytes === 0) failReason = 'no bytes received';
  if (!failReason && reconnects > MAX_RECONNECTS) failReason = `${reconnects} reconnects`;
  if (!failReason && reconnectGaps.some((g) => g >= MAX_GAP_MS)) failReason = `reconnect gap ${Math.max(...reconnectGaps)} ms`;
  if (!failReason && longestGap > MAX_GAP_MS) failReason = `gap between chunks ${longestGap} ms`;
  if (failReason) {
    console.log(`FAIL ${failReason}`);
    process.exit(1);
  }
  console.log('PASS');
  process.exit(0);
}

/** The audio has been silent this long (between chunks, or across a reconnect). */
function currentSilence(now) {
  if (droppedAt !== null) return now - droppedAt;
  return lastChunk === null ? 0 : now - lastChunk;
}

const ticker = setInterval(() => {
  console.log(line());
  const silence = currentSilence(Date.now());
  if (silence > MAX_GAP_MS) finish(`no audio for ${silence} ms${droppedAt !== null ? ' while reconnecting' : ''}`);
}, 10000);
const deadline = setTimeout(() => {
  const silence = currentSilence(Date.now());
  if (droppedAt === null) longestGap = Math.max(longestGap, silence);
  else reconnectGaps.push(silence);
  finish();
}, seconds * 1000);

async function streamOnce() {
  const res = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'Radiotext-soak/1.0' } });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) throw new Error('stream ended');
    const now = Date.now();
    if (droppedAt !== null) {
      reconnectGaps.push(now - droppedAt);
      droppedAt = null;
    } else if (lastChunk !== null) {
      longestGap = Math.max(longestGap, now - lastChunk);
    }
    lastChunk = now;
    bytes += value.byteLength;
  }
}

for (;;) {
  try {
    await streamOnce();
  } catch (err) {
    if (finished) break;
    if (lastChunk === null && droppedAt === null) finish(`could not start: ${err.message}`);
    reconnects += 1;
    console.log(`${line()} drop: ${err.message}; reconnect ${reconnects}`);
    if (reconnects > MAX_RECONNECTS) finish(`stream dropped ${reconnects} times (${err.message})`);
    if (droppedAt === null) droppedAt = lastChunk;
    lastChunk = null;
  }
  if (finished) break;
}
