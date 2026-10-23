// The stream player: one <audio> element driven by a small state machine.
//
//   tune ──► tuning ──playing──► playing ──error/ended/stall──► retrying ──playing──► playing
//    │         │ error/timeout on the last candidate                 │ backoff gives up
//    │         ▼                                                     ▼
//    └────► unavailable (at once when there is nothing to try)      lost
//   stop() ──► off from any state, and so do an outside pause while playing (phone call, Siri)
//   and a play() blocked by autoplay rules. resume() re-tunes the current station.
//   Off keeps src for 30 s after STOP, and for 10 minutes after an outside pause.
// Candidates are tried in order, except that the one that last worked for a station this
// session goes first (an https attempt that hangs costs the whole 8 s tune timeout).
//
// Fast flipping is the hard part, so two guards keep an old station from touching the new one:
// - At most one timer is ever pending (`timer`): every phase change re-arms or clears it, and
//   each callback also checks `gen`, which tune and stop bump.
// - Media events count only while `audio.src` is the URL this player last assigned and the
//   current state expects them.
import { streamCandidates, httpsVariant } from './stations.js';
import { TUNE_TIMEOUT_MS, STALL_MS, STOP_DROP_MS, OUTSIDE_PAUSE_DROP_MS } from './config.js';
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
  let playId = 0;           // bumped by every assign, so a late play() rejection can tell it's stale
  let pausedOutside = false; // 'off' came from an outside pause, which the phone may undo itself
  /** @type {Map<string, string>} station uuid → the candidate URL that last reached 'playing' */
  const lastWorked = new Map();

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
    const g = gen;
    const id = ++playId;
    const p = audio.play();
    // AbortError (the src changed again) is expected, and the timeouts cover a play() that never
    // starts. NotAllowedError means autoplay is blocked and only a tap can start audio, so go off
    // now rather than show TUNING… for 8 s. A rejection from an older assign is ignored.
    if (p) p.catch((e) => {
      if (e?.name === 'NotAllowedError' && g === gen && id === playId) stop();
    });
  };
  const release = () => {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  };
  // Pause now and keep src for `ms` (STOP_DROP_MS by default), so lock-screen and car controls
  // survive a short stop (ledger Ruling 1). pause() also stops a load that times out but
  // connects later from playing.
  const park = (ms = STOP_DROP_MS) => {
    audio.pause();
    arm(ms, release);
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
    unavailable(state.station);
  };
  // Nothing left to try. park() also silences the previous station when there was nothing to try.
  const unavailable = (station) => {
    park();
    if (httpsVariant(station.url) && !relayBase && online()) dead.add(station.uuid);
    set('unavailable', station);
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

  // Stall watchdog, armed only while playing. 'waiting' means playback has stopped for lack of
  // data, so it always restarts the STALL_MS window from now. 'stalled' means data stopped
  // arriving while the buffer may play on, so it starts a window only if none is running.
  // When a window ends, retry only if the element is unpaused and playback hasn't moved since
  // it was armed. Otherwise the watch just ends: a pause is not a stall, and a stall the buffer
  // rode out is over (a later 'waiting' starts a new watch).
  const watchStall = () => {
    const at = audio.currentTime;
    arm(STALL_MS, () => {
      const moved = audio.currentTime > at;
      if (!audio.paused && !moved) startRetry();
    });
  };

  const onPlaying = () => {
    if (state.kind === 'tuning') {
      working = candidates[index];
      lastWorked.set(state.station.uuid, working);
    } else if (state.kind === 'retrying') {
      // Also accepted between attempts: a stalled or timed-out load that came back is live audio.
      inFlight = false;
    } else if (state.kind === 'off') {
      // iOS and Android resume audio they paused once a call ends. The src is still ours
      // (the 10-minute drop hasn't run), so the radio is simply back on.
      if (!pausedOutside || audio.paused) return;
      pausedOutside = false;
    } else if (state.kind !== 'playing') {
      return;
    }
    clearTimer(); // the tune timeout, the retry wait or attempt, the stall watchdog, or the drop
    set('playing');
  };
  const onFailed = () => {
    if (state.kind === 'tuning') candidateFailed();
    else if (state.kind === 'playing') startRetry();
    else if (state.kind === 'retrying' && inFlight) attemptFailed(); // between attempts: one is already scheduled
  };
  const onWaiting = () => {
    if (state.kind === 'playing') watchStall();
  };
  const onStalled = () => {
    if (state.kind === 'playing' && timer === null) watchStall();
  };
  // An outside pause (phone call, Siri, headphones out) turns the radio off like STOP, so PLAY and
  // the lock screen show the truth. The player's own pauses don't count. stop(), unavailable
  // and lost leave 'playing' before they pause. A src change happens while tuning or retrying and
  // is followed by play(), so any pause event it queues finds the element unpaused. A stream
  // that ends pauses with `ended` set, and the 'ended' event then retries it.
  const onPause = () => {
    if (state.kind === 'playing' && audio.paused && !audio.ended && !audio.error) halt(true);
  };
  const listen = (type, fn) => audio.addEventListener(type, () => {
    if (audio.src === assigned) fn();
  });
  listen('playing', onPlaying);
  listen('error', onFailed);
  listen('ended', onFailed);
  listen('waiting', onWaiting);
  listen('stalled', onStalled);
  listen('pause', onPause);

  function tune(station) {
    gen++;
    clearTimer();
    inFlight = false;
    pausedOutside = false;
    working = '';
    const all = streamCandidates(station, relayBase);
    const known = lastWorked.get(station.uuid);
    candidates = all.includes(known) ? [known, ...all.filter((u) => u !== known)] : all;
    index = 0;
    if (!candidates.length) {
      unavailable(station);
      return;
    }
    tryCandidate();
    set('tuning', station);
  }

  // Off, keeping src for STOP_DROP_MS. `outside` marks a pause the player didn't make: a phone
  // call often runs past 30 s, so that keeps src for OUTSIDE_PAUSE_DROP_MS (ledger Ruling 12).
  function halt(outside) {
    gen++;
    clearTimer();
    inFlight = false;
    pausedOutside = outside;
    park(outside ? OUTSIDE_PAUSE_DROP_MS : STOP_DROP_MS);
    set('off');
  }
  function stop() {
    halt(false);
  }

  return {
    tune,
    stop,
    resume() {
      if (state.station) tune(state.station);
    },
    get state() { return state; },
  };
}
