// Retry backoff for a dropped stream: 1, 2, 4, 8 s, then every 15 s, giving up at GIVE_UP_MS.
import { GIVE_UP_MS } from './config.js';

const STEPS = [1000, 2000, 4000, 8000];
const LATER_MS = 15000;

/**
 * @param {number} attempt retries already made in this run (0 for the first)
 * @param {number} elapsedMs time since the run of retries began
 * @returns {number|null} ms to wait before the next attempt, or null to give up
 */
export function backoffDelay(attempt, elapsedMs) {
  if (elapsedMs >= GIVE_UP_MS) return null;
  return STEPS[attempt] ?? LATER_MS;
}
