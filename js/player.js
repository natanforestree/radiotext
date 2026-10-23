// The stream player: one <audio> element driven by a small state machine.
//
//   tune ──► tuning ──playing──► playing ──error/ended/stall──► retrying ──playing──► playing
//              │ error/timeout on the last candidate                 │ backoff gives up
//              ▼                                                     ▼
//          unavailable                                              lost
//   stop() ──► off from any state; resume() re-tunes the current station.
//
// Fast flipping is the hard part, so two guards keep an old station from touching the new one:
// - At most one timer is ever pending (`timer`): every phase change re-arms or clears it, and
//   each callback also checks `gen`, which tune and stop bump.
// - Media events count only while `audio.src` is the URL this player last assigned and the
//   current state expects them.
import { streamCandidates, httpsVariant } from './stations.js';
import { TUNE_TIMEOUT_MS, STALL_MS, STOP_DROP_MS } from './config.js';
import { backoffDelay } from './reconnect.js';

/**
 * @typedef {'off'|'tuning'|'playing'|'retrying'|'lost'|'unavailable'} PlayerKind
 * @typedef {{kind: PlayerKind, station: import('./config.js').Station|null}} PlayerState
 */

/**
 * @param {{audio: HTMLAudioElement, relayBase: string|null, dead: {add(uuid: string): void},
 *   online?: () => boolean, onChange?: (state: PlayerState) => void}} opts
 */
export function createPlayer({ audio, relayBase, dead, online = () => globalThis.navigator?.onLine !== false, onChange = () => {} }) {
  /** @type {PlayerState} */
  let state = Object.freeze({ kind: 'off', station: null });
  let gen = 0;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  let assigned = '';        // audio.src as the element reported it right after we set it
  /** @type {string[]} */
  let candidates = [];
  let index = 0;            // candidate being tried while tuning
  let working = '';         // the candidate that reached 'playing'; retries reconnect to it
  let retryStart = 0;       // Date.now() when this run of retries began
  let attempt = 0;          // retry attempts made in this run
  let inFlight = false;     // a retry attempt is loading (false while waiting out the backoff)

  // Called last in every transition, so a throwing onChange can't leave a timer unarmed.
  const set = (kind, station = state.station) => {
    if (kind === state.kind && station === state.station) return;
    state = Object.freeze({ kind, station });
    onChange(state);
  };

  // setTimeout/clearTimeout/Date are looked up at call time, so test clock mocks apply.
  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const arm = (ms, fn) => {
    clearTimer();
    const g = gen;
    const id = setTimeout(() => {
      if (timer === id) timer = null;
      if (g === gen) fn();
    }, ms);
    timer = id;
  };

  const assign = (url) => {
    audio.src = url;
    assigned = audio.src; // browsers normalise URLs; compare against what the element reports
    // AbortError (src changed) and NotAllowedError are expected; the timeouts cover a play() that never starts.
    const p = audio.play();
    if (p) p.catch(() => {});
  };
  const release = () => {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  };
  // Pause now and keep src for STOP_DROP_MS, so lock-screen and car controls survive a short stop
  // (ledger Ruling 1). pause() also stops a load that times out but connects later from playing.
  const park = () => {
    audio.pause();
    arm(STOP_DROP_MS, release);
  };

  const tryCandidate = () => {
    assign(candidates[index]);
    arm(TUNE_TIMEOUT_MS, candidateFailed);
  };
  const candidateFailed = () => {
    index++;
    if (index < candidates.length) {
      tryCandidate();
      return;
    }
    park();
    const { station } = state;
    if (httpsVariant(station.url) && !relayBase && online()) dead.add(station.uuid);
    set('unavailable');
  };

  const startRetry = () => {
    retryStart = Date.now();
    attempt = 0;
    scheduleAttempt();
    set('retrying');
  };
  const scheduleAttempt = () => {
    inFlight = false;
    const delay = backoffDelay(attempt, Date.now() - retryStart);
    if (delay === null) {
      clearTimer();
      release();
      set('lost');
      return;
    }
    arm(delay, runAttempt);
  };
  const runAttempt = () => {
    inFlight = true;
    assign(working);
    arm(TUNE_TIMEOUT_MS, attemptFailed);
  };
  const attemptFailed = () => {
    attempt++;
    scheduleAttempt();
  };

  // After waiting/stalled, playback must move within every STALL_MS window until 'playing' comes
  // back. A 'stalled' that the buffer rode out (currentTime kept rising) is a false alarm.
  const watchStall = () => {
    const at = audio.currentTime;
    arm(STALL_MS, () => {
      if (!audio.paused && audio.currentTime > at) watchStall();
      else startRetry();
    });
  };

  const onPlaying = () => {
    if (state.kind === 'tuning') {
      working = candidates[index];
    } else if (state.kind === 'retrying') {
      // Also accepted between attempts: a stalled or timed-out load that came back is live audio.
      inFlight = false;
    } else if (state.kind !== 'playing') {
      return;
    }
    clearTimer(); // the tune timeout, the retry wait or attempt, or the stall watchdog
    set('playing');
  };
  const onFailed = () => {
    if (state.kind === 'tuning') candidateFailed();
    else if (state.kind === 'playing') startRetry();
    else if (state.kind === 'retrying' && inFlight) attemptFailed(); // between attempts: one is already scheduled
  };
  const onStall = () => {
    if (state.kind === 'playing' && timer === null) watchStall();
  };
  const listen = (type, fn) => audio.addEventListener(type, () => {
    if (audio.src === assigned) fn();
  });
  listen('playing', onPlaying);
  listen('error', onFailed);
  listen('ended', onFailed);
  listen('waiting', onStall);
  listen('stalled', onStall);

  function tune(station) {
    gen++;
    clearTimer();
    inFlight = false;
    working = '';
    candidates = streamCandidates(station, relayBase);
    index = 0;
    tryCandidate();
    set('tuning', station);
  }

  return {
    tune,
    stop() {
      gen++;
      clearTimer();
      inFlight = false;
      park();
      set('off');
    },
    resume() {
      if (state.station) tune(state.station);
    },
    get state() { return state; },
  };
}
