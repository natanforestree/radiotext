// What the music is doing, frame by frame, worked out from an AnalyserNode's readings (passed in,
// so this is pure and testable): 16 bands from low to high, loudness, bass, mids and treble,
// beats, brightness and noisiness. Everything is levelled against what the station has been
// doing over the last few seconds, so a quiet station moves as much as a loud one, and smoothed
// with a quick rise and a slower fall, so it moves like music rather than jitter.

export const BANDS = 16;
const LOW_HZ = 40;
const HIGH_HZ = 16000;
/** The analyser's dB range, which the 0-255 frequency readings span. */
export const MIN_DB = -90;
export const MAX_DB = -10;

/**
 * Where each band starts, in FFT bins, spaced evenly in pitch from 40 Hz to 16 kHz: BANDS + 1
 * edges, every band at least one bin wide.
 * @param {number} binCount @param {number} sampleRate
 */
export function bandEdges(binCount, sampleRate) {
  const hzPerBin = sampleRate / 2 / binCount;
  const edges = [];
  for (let b = 0; b <= BANDS; b++) {
    const hz = LOW_HZ * (HIGH_HZ / LOW_HZ) ** (b / BANDS);
    edges.push(Math.min(binCount, Math.max(1, Math.round(hz / hzPerBin))));
  }
  for (let b = 1; b <= BANDS; b++) if (edges[b] <= edges[b - 1]) edges[b] = Math.min(binCount, edges[b - 1] + 1);
  return edges;
}

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Moves `cur` toward `target`, quickly when rising (attack) and slowly when falling (release). */
const follow = (cur, target, dt, attack, release) =>
  cur + (target - cur) * (1 - Math.exp(-dt / (target > cur ? attack : release)));

/**
 * @param {{binCount: number, sampleRate: number}} opts
 * @returns {(freq: Uint8Array, wave: Uint8Array, dt: number) => Signal} read one frame;
 *   dt is the time since the last frame, in seconds
 *
 * @typedef {{live: boolean, level: number, bass: number, mid: number, treble: number,
 *   bands: Float32Array, beat: boolean, strength: number, sinceBeat: number,
 *   brightness: number, noisiness: number, wave: Uint8Array}} Signal
 *   All 0 to 1 except sinceBeat (seconds). live is false once the stream has been silent for
 *   1.5 s, which is also what a station that can't be read looks like.
 */
export function createSignal({ binCount, sampleRate }) {
  const edges = bandEdges(binCount, sampleRate);
  const hzPerBin = sampleRate / 2 / binCount;
  const fluxTop = edges[10]; // beats are read from the bands up to about 2.5 kHz
  const raws = new Float32Array(BANDS);
  let bandPeak = 0.2;
  const prev = new Float32Array(binCount);
  /** @type {number[]} */
  const fluxes = [];
  /** @type {Signal} */
  const out = {
    live: false, level: 0, bass: 0, mid: 0, treble: 0, bands: new Float32Array(BANDS),
    beat: false, strength: 0, sinceBeat: 99, brightness: 0, noisiness: 0, wave: new Uint8Array(0),
  };
  let levelPeak = 0.05;
  let silentFor = 99;

  return (freq, wave, dt) => {
    out.wave = wave;
    out.beat = false;
    out.sinceBeat += dt;
    const fade = Math.exp(-dt / 4); // a peak falls away over a few seconds

    // Silence: nothing in the spectrum and a flat waveform.
    let loud = false;
    for (let i = 0; i < freq.length && !loud; i++) loud = freq[i] > 0;
    for (let i = 0; i < wave.length && !loud; i += 8) loud = Math.abs(wave[i] - 128) > 1;
    silentFor = loud ? 0 : silentFor + dt;
    out.live = silentFor < 1.5;

    // Bands, tilted up a little toward the treble (music has less up there) and levelled against
    // the loudest band's recent peak, so the shape of the sound survives; the bottom third of
    // that range reads as 0.
    let top = 0;
    for (let b = 0; b < BANDS; b++) {
      let sum = 0;
      for (let i = edges[b]; i < edges[b + 1]; i++) sum += freq[i];
      raws[b] = (sum / (edges[b + 1] - edges[b]) / 255) * (1 + (0.5 * b) / (BANDS - 1));
      if (raws[b] > top) top = raws[b];
    }
    bandPeak = Math.max(top, bandPeak * fade, 0.12);
    let bass = 0, mid = 0, treble = 0;
    for (let b = 0; b < BANDS; b++) {
      const v = clamp((raws[b] / bandPeak - 0.35) / 0.65);
      out.bands[b] = follow(out.bands[b], v, dt, 0.03, 0.18);
      if (b < 4) bass += out.bands[b] / 4;
      else if (b < 10) mid += out.bands[b] / 6;
      else treble += out.bands[b] / 6;
    }
    out.bass = bass;
    out.mid = mid;
    out.treble = treble;

    // Loudness: RMS of the waveform, levelled the same way.
    let sq = 0;
    for (let i = 0; i < wave.length; i++) {
      const s = (wave[i] - 128) / 128;
      sq += s * s;
    }
    const rms = wave.length ? Math.sqrt(sq / wave.length) : 0;
    levelPeak = Math.max(rms, levelPeak * fade, 0.02);
    out.level = follow(out.level, clamp(rms / levelPeak), dt, 0.02, 0.25);

    // Beats: a jump in the low and middle spectrum (spectral flux) well above its recent run.
    let flux = 0;
    for (let i = 1; i < fluxTop; i++) {
      const d = freq[i] - prev[i];
      if (d > 0) flux += d;
    }
    flux /= fluxTop * 255;
    let mean = 0;
    for (const f of fluxes) mean += f / (fluxes.length || 1);
    let spread = 0;
    for (const f of fluxes) spread += (f - mean) ** 2 / (fluxes.length || 1);
    const limit = mean + 1.6 * Math.sqrt(spread) + 0.004;
    if (out.live && fluxes.length > 20 && flux > limit && out.sinceBeat > 0.16) {
      out.beat = true;
      out.sinceBeat = 0;
      out.strength = clamp((flux - mean) / (4 * Math.sqrt(spread) + 0.01));
    }
    fluxes.push(flux);
    if (fluxes.length > Math.max(30, Math.round(1.2 / Math.max(dt, 1e-3)))) fluxes.shift();
    for (let i = 0; i < binCount; i++) prev[i] = freq[i];

    // Brightness (spectral centroid, by pitch) and noisiness (spectral flatness, 0 tone, 1 noise).
    let weight = 0, total = 0, logSum = 0, linSum = 0, n = 0;
    for (let i = 1; i < binCount * 0.8; i++) {
      const amp = 10 ** ((MIN_DB + (freq[i] / 255) * (MAX_DB - MIN_DB)) / 20);
      weight += i * amp;
      total += amp;
      logSum += Math.log(amp);
      linSum += amp;
      n++;
    }
    const centroidHz = total ? (weight / total) * hzPerBin : LOW_HZ;
    const bright = clamp(Math.log(Math.max(centroidHz, LOW_HZ) / LOW_HZ) / Math.log(HIGH_HZ / LOW_HZ));
    const flat = n && linSum ? Math.exp(logSum / n) / (linSum / n) : 0;
    out.brightness = follow(out.brightness, bright, dt, 0.15, 0.6);
    out.noisiness = follow(out.noisiness, loud ? clamp(flat) : out.noisiness, dt, 0.3, 0.8);
    return out;
  };
}
