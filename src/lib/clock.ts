// Server-corrected clock for the browser (docs/design/rules.md §7). The device clock is never
// trusted for a decision: every API response carries `server_now`, and this keeps the difference.
// (Network delay is not compensated; it is well under a second, far inside the 15 s window.)
import { toMs, type Instant } from './time';

export interface ServerClock {
  /** serverNow - deviceNow at the last sync, in milliseconds. */
  readonly offsetMs: number;
  /** Server time now, as milliseconds since the epoch. */
  now(): number;
  /** Re-sync from a new `server_now`. Throws RangeError (and keeps the old offset) on garbage. */
  sync(serverNow: Instant): void;
}

export function createServerClock(serverNow: Instant, localNow: () => number = () => Date.now()): ServerClock {
  let offsetMs = toMs(serverNow) - localNow();
  return {
    get offsetMs() {
      return offsetMs;
    },
    now: () => localNow() + offsetMs,
    sync(next: Instant) {
      offsetMs = toMs(next) - localNow();
    },
  };
}
