// The audio tap for the visuals, and the check of which stations allow it.
//
// The tap reads a copy of what the <audio> element plays (captureStream) through an AnalyserNode
// that outputs nothing. The element still plays to the speakers exactly as before, so a station
// that can't be read, or a tap that breaks, never touches what you hear. Browsers only let a
// page read a stream loaded in CORS mode (crossOrigin="anonymous"), and only from a server that
// allows it. The relay always does; a station's own server is asked once, quietly, and the
// answer kept for two weeks. Safari, and every iPhone browser, has no captureStream, so there
// the tap is simply unsupported.

const KEY = 'radiotext-readable';
const KEEP_MS = 14 * 24 * 3600 * 1000;
const KEEP_NO_MS = 3 * 24 * 3600 * 1000; // a refusal may be a passing network error
const CHECK_TIMEOUT_MS = 6000;
const MAX_KNOWN = 400;
const AT_ONCE = 3;

/**
 * Whether stream URLs allow their sound to be read. `ok(url)` is true, false or undefined (not
 * checked yet); `check(urls)` asks, a few at a time, about those not known, by opening each in
 * CORS mode and hanging up as soon as the headers arrive. A timeout leaves a URL unknown.
 * `onAnswer(url, ok)` hears each answer as it comes.
 * @param {{store: ReturnType<import('./saved.js').safeStorage>, fetch: typeof fetch, now?: () => number,
 *   onAnswer?: (url: string, ok: boolean) => void, setTimeout?: typeof setTimeout, clearTimeout?: typeof clearTimeout}} deps
 */
export function createReadable({ store, fetch, now = Date.now, onAnswer = () => {}, setTimeout = globalThis.setTimeout, clearTimeout = globalThis.clearTimeout }) {
  /** @type {Record<string, [0|1, number]>} url → [allowed, when checked] */
  const known = { ...(store.get(KEY) ?? {}) };
  const asking = new Set();
  /** @type {string[]} */
  const queue = [];

  const fresh = (url) => {
    const e = known[url];
    return Array.isArray(e) && now() - e[1] < (e[0] ? KEEP_MS : KEEP_NO_MS);
  };
  const save = () => {
    const urls = Object.keys(known);
    if (urls.length > MAX_KNOWN) {
      urls.sort((a, b) => known[a][1] - known[b][1]).slice(0, urls.length - MAX_KNOWN).forEach((u) => delete known[u]);
    }
    store.set(KEY, known);
  };

  async function ask(url) {
    const stop = new AbortController();
    let late = false;
    const timer = setTimeout(() => { late = true; stop.abort(); }, CHECK_TIMEOUT_MS);
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: stop.signal });
      known[url] = [res.ok ? 1 : 0, now()];
    } catch {
      if (!late) known[url] = [0, now()];
    } finally {
      clearTimeout(timer);
      stop.abort(); // a stream never ends: hang up once the headers have answered
      asking.delete(url);
      save();
      next();
    }
    if (!late && url in known) onAnswer(url, known[url][0] === 1);
  }
  function next() {
    while (asking.size < AT_ONCE && queue.length) {
      const url = queue.shift();
      if (fresh(url) || asking.has(url)) continue;
      asking.add(url);
      ask(url);
    }
  }

  return {
    /** @param {string} url @returns {boolean|undefined} */
    ok(url) {
      return fresh(url) ? known[url][0] === 1 : undefined;
    },
    /** @param {string[]} urls */
    check(urls) {
      for (const u of urls) if (!fresh(u) && !asking.has(u) && !queue.includes(u)) queue.push(u);
      next();
    },
  };
}

/**
 * The tap. `read()` gives this frame's readings, or null while nothing readable is playing.
 * `sleep()` lets the audio device go while the visuals are idle; `read()` wakes it.
 * @param {{audio: HTMLAudioElement, AudioContext?: typeof AudioContext}} deps
 */
export function createTap({ audio, AudioContext }) {
  const supported = typeof audio.captureStream === 'function' && Boolean(AudioContext);
  /** @type {AudioContext|null} */
  let ctx = null;
  /** @type {AnalyserNode|null} */
  let analyser = null;
  /** @type {MediaStreamAudioSourceNode|null} */
  let source = null;
  /** @type {MediaStream|null} */
  let stream = null;
  let freq = new Uint8Array(0);
  let wave = new Uint8Array(0);

  const drop = () => {
    source?.disconnect();
    source = null;
    stream?.getTracks().forEach((t) => t.stop()); // ends the copy only, never the element
    stream = null;
  };
  const build = () => {
    ctx = new AudioContext();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.5;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;
    // Into a silent gain to the speakers, so the browser keeps pulling audio through it.
    const hush = ctx.createGain();
    hush.gain.value = 0;
    analyser.connect(hush);
    hush.connect(ctx.destination);
    freq = new Uint8Array(analyser.frequencyBinCount);
    wave = new Uint8Array(analyser.fftSize);
  };
  // Each new stream (a station, or a reconnect) gets a fresh copy. Only a CORS-mode load can be
  // copied: Chrome refuses one with cross-origin sound.
  const connect = () => {
    drop();
    if (!supported || audio.crossOrigin !== 'anonymous') return;
    try {
      if (!ctx) build();
      const s = audio.captureStream();
      const attach = () => {
        if (stream !== s || source || !s.getAudioTracks().length) return;
        source = ctx.createMediaStreamSource(s);
        source.connect(analyser);
      };
      stream = s;
      attach();
      s.addEventListener('addtrack', attach);
      ctx.resume().catch(() => {});
    } catch {
      drop();
    }
  };
  audio.addEventListener('playing', connect);
  audio.addEventListener('emptied', drop);

  return {
    supported,
    get binCount() { return freq.length || 1024; },
    get sampleRate() { return ctx?.sampleRate ?? 48000; },
    /** Whether what's playing now is being read. */
    get reading() { return Boolean(source); },
    read() {
      if (!source || !analyser) return null;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      analyser.getByteFrequencyData(freq);
      analyser.getByteTimeDomainData(wave);
      return { freq, wave };
    },
    sleep() {
      if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    },
  };
}
