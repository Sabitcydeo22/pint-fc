'use client';
// The "Next match" section of the home page (docs/design/screens.md, `/`): opponent, venue, kickoff in club time,
// a live countdown, the RSVP chip and the link to the match page. It loads /api/home itself, so it has its own
// loading, empty and error states. All time maths use the SERVER-corrected clock (docs/design/rules.md §1, §7):
// a phone with a wrong clock still shows the right countdown and flips to "RSVP closed" at the right moment.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createServerClock } from '../lib/clock';
import { countdown, formatKickoff } from '../lib/time';
import type { HomeData, NextMatchRow } from '../server/home';

export interface CountdownView {
  kickedOff: boolean;
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
  /** "1d 02h 03m 04s", or "Kicked off". */
  text: string;
}

const two = (n: number) => String(n).padStart(2, '0');

/** What the countdown shows at `nowMs` (server-corrected). At or after kickoff: "Kicked off", never a negative number. */
export function countdownView(nowMs: number, kickoffAt: string): CountdownView {
  const c = countdown(nowMs, kickoffAt);
  if (c.kickedOff) return { kickedOff: true, days: '0', hours: '00', minutes: '00', seconds: '00', text: 'Kicked off' };
  const view = { days: String(c.days), hours: two(c.hours), minutes: two(c.minutes), seconds: two(c.seconds) };
  return { kickedOff: false, ...view, text: `${view.days}d ${view.hours}h ${view.minutes}m ${view.seconds}s` };
}

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: HomeData };

async function fetchHome(): Promise<State> {
  try {
    const res = await fetch('/api/home', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error('bad status');
    const data = (await res.json()) as HomeData;
    if (typeof data?.server_now !== 'string' || !('next_match' in data)) throw new Error('bad shape');
    return { kind: 'ready', data };
  } catch {
    return { kind: 'error' }; // never the server's text
  }
}

export default function NextMatch() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void fetchHome().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = () => {
    setState({ kind: 'loading' });
    void fetchHome().then(setState);
  };

  if (state.kind === 'loading') {
    return (
      <section aria-labelledby="next-match-title" aria-busy="true" data-testid="next-match-loading" className="card stack-sm">
        <h2 id="next-match-title">Next match</h2>
        <p className="muted">Loading…</p>
      </section>
    );
  }
  if (state.kind === 'error') {
    return (
      <section aria-labelledby="next-match-title" data-testid="next-match-error" className="card stack-sm">
        <h2 id="next-match-title">Next match</h2>
        <p role="alert">Something went wrong. Try again.</p>
        <button type="button" className="btn" data-testid="retry-button" onClick={load}>
          Try again
        </button>
      </section>
    );
  }
  const { data } = state;
  if (!data.next_match) {
    return (
      <section aria-labelledby="next-match-title" className="card stack-sm">
        <h2 id="next-match-title">Next match</h2>
        <p data-testid="next-match-empty">No upcoming matches</p>
      </section>
    );
  }
  // a new response means a new card (and a new clock offset), so the key is the server time of that response
  return <NextMatchCard key={data.server_now} match={data.next_match} serverNow={data.server_now} />;
}

function NextMatchCard({ match, serverNow }: { match: NextMatchRow; serverNow: string }) {
  // offset = server time - this device's time, taken once when the response arrives
  const [clock] = useState(() => createServerClock(serverNow));
  const [nowMs, setNowMs] = useState(() => clock.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(clock.now()), 1000);
    return () => clearInterval(timer);
  }, [clock]);

  const view = countdownView(nowMs, match.kickoff_at);
  // open only if the server said open AND the server-corrected clock is strictly before the cutoff
  const open = match.rsvp_open && nowMs < Date.parse(match.cutoff_at);

  return (
    <section aria-labelledby="next-match-title" data-testid="next-match-card" className="card stack-sm">
      <h2 id="next-match-title">Next match</h2>
      <div className="stack-xs">
        <p className="t-lg bold">
          <span className="muted">vs </span>
          <span data-testid="next-match-opponent">{match.opponent}</span>
        </p>
        <p className="muted" data-testid="next-match-competition">
          {match.competition}
        </p>
        <p>
          <span className="muted">Venue: </span>
          <span data-testid="next-match-venue">{match.venue}</span>
        </p>
        <p>
          <span className="muted">Kickoff: </span>
          <time dateTime={match.kickoff_at} data-testid="next-match-kickoff">
            {formatKickoff(match.kickoff_at)}
          </time>
        </p>
      </div>

      <div data-testid="countdown" role="timer" aria-live="off" className="t-xl bold">
        {view.kickedOff ? (
          'Kicked off'
        ) : (
          <>
            <span data-testid="countdown-d">{view.days}</span>d <span data-testid="countdown-h">{view.hours}</span>h{' '}
            <span data-testid="countdown-m">{view.minutes}</span>m <span data-testid="countdown-s">{view.seconds}</span>s
          </>
        )}
      </div>

      <p>
        <span data-testid="rsvp-status" className={open ? 'chip chip-ok' : 'chip'}>
          {open ? 'Open' : 'RSVP closed'}
        </span>{' '}
        <span className="muted" data-testid="rsvp-cutoff">
          RSVP {open ? 'closes' : 'closed'} {formatKickoff(match.cutoff_at)}
        </span>
      </p>

      <p>
        <Link href={`/fixtures/${match.id}`} prefetch={false} className="btn btn-accent" data-testid="go-to-event">
          Going / Not going
        </Link>
      </p>
    </section>
  );
}
