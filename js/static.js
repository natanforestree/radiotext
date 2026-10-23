// A short, quiet burst of white noise (Web Audio) while a new station tunes in.
import { STATIC_MAX_MS } from './config.js';

/**
 * @param {{AudioContext?: typeof AudioContext, maxMs?: number, gain?: number}} opts
 * @returns {{start(): void, stop(): void}} start() restarts the burst; stop() is always safe
 */
export function createStatic({ AudioContext, maxMs = STATIC_MAX_MS, gain = 0.08 } = {}) {
  /** @type {AudioContext|null} */
  let ctx = null;
  /** @type {AudioBuffer|null} */
  let noise = null;
  /** @type {GainNode|null} */
  let out = null;
  /** @type {AudioBufferSourceNode|null} */
  let source = null;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;

  // Builds everything before keeping any of it, so a failure leaves nothing half set up.
  const setup = () => {
    const c = new AudioContext();
    const buf = c.createBuffer(1, c.sampleRate, c.sampleRate); // 1 s, mono
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const g = c.createGain();
    g.gain.value = gain;
    g.connect(c.destination);
    [ctx, noise, out] = [c, buf, g];
  };

  function stop() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (!source) return;
    try { source.stop(); } catch { /* already stopped */ }
    source.disconnect();
    source = null;
    ctx.suspend().catch(() => {}); // don't hold the audio device open between bursts
  }

  function start() {
    stop();
    if (!AudioContext) return;
    // Static is decoration: if Web Audio is missing or refuses, tuning carries on silently.
    try {
      if (!ctx) setup();
      ctx.resume().catch(() => {});
      source = ctx.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      source.connect(out);
      source.start();
      timer = setTimeout(stop, maxMs);
    } catch {
      source = null;
    }
  }

  return { start, stop };
}
