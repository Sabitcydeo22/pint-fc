'use client';
// The ticking server-corrected "now" for the event page (docs/design/rules.md §7). It re-reads the SERVER clock once a
// second, so "RSVP closed" appears at the server's cutoff with no reload, whatever the phone's own clock says.
import { useEffect, useState } from 'react';
import type { ServerClock } from '../lib/clock';

/** Server time in ms, refreshed every second; follows the clock object it is given (a new response gives a new clock). */
export function useServerNow(clock: ServerClock | undefined): number {
  const [tick, setTick] = useState<{ clock: ServerClock; ms: number } | null>(null);
  useEffect(() => {
    if (!clock) return;
    const timer = setInterval(() => setTick({ clock, ms: clock.now() }), 1000);
    return () => clearInterval(timer);
  }, [clock]);
  if (!clock) return 0;
  // a tick of an older clock is not used: a fresh response shows its own server time at once, not one second later
  return tick && tick.clock === clock ? tick.ms : clock.now();
}

/** "Updated n s ago", counted on the server clock from the `server_now` of the data on screen. */
export default function LiveClock({ serverNow, nowMs }: { serverNow: string; nowMs: number }) {
  const secondsAgo = Math.max(0, Math.floor((nowMs - Date.parse(serverNow)) / 1000));
  return (
    <p className="muted" data-testid="last-updated" style={{ marginBottom: 0 }}>
      Updated {secondsAgo} s ago
    </p>
  );
}
