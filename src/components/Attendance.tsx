'use client';
// The event page body (docs/design/screens.md, `/fixtures/[id]`): match header, RSVP status, counts, my answer and the
// attendance list. It loads GET /api/fixtures/[id]/attendance once on mount (the 10-second poller attaches in session
// 15: `createPoller` calls `refresh` every 10 s while visible), and again after a save. Time maths use the SERVER-corrected clock (a phone with a wrong clock
// still closes RSVP at the right moment). The list shows names and answers only: the response carries no reasons, and
// this component renders only name and answer anyway.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createServerClock, type ServerClock } from '../lib/clock';
import { createPoller } from '../lib/poll';
import { formatKickoff } from '../lib/time';
import type { Attendance as AttendanceData } from '../server/attendance';
import type { RsvpAnswer } from '../server/rsvp';
import LiveClock, { useServerNow } from './LiveClock';
import RsvpButtons from './RsvpButtons';

type Fetched = { ok: true; data: AttendanceData } | { ok: false };

async function fetchAttendance(matchId: string): Promise<Fetched> {
  try {
    const res = await fetch(`/api/fixtures/${matchId}/attendance`, { credentials: 'same-origin', cache: 'no-store' });
    if (res.status === 401) {
      window.location.assign(new URL('/sign-in', window.location.origin).href); // a full page load (D-65)
      return { ok: false };
    }
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as AttendanceData;
    if (typeof data?.server_now !== 'string' || !data.match || !data.counts || !Array.isArray(data.attendees) || !data.me) return { ok: false };
    return { ok: true, data };
  } catch {
    return { ok: false }; // never the server's text
  }
}

interface Loaded {
  data: AttendanceData;
  clock: ServerClock;
}

// The styles of this page (.fx-*) live in src/app/globals.css, next to the tokens they use.

const GROUPS: { answer: RsvpAnswer; label: string; color: string }[] = [
  { answer: 'going', label: 'Going', color: 'var(--ok)' },
  { answer: 'maybe', label: 'Maybe', color: 'var(--warn)' },
  { answer: 'not_going', label: 'Not going', color: 'var(--bad)' },
];

export default function Attendance({ matchId }: { matchId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false); // the last load failed (with `loaded` set, the data on screen is older)
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  // One load, used by the first load, the poller (every 10 s while visible), the retry button and after a save.
  // A failure keeps the older data on screen. It throws on failure so the poller waits longer (20 s) before the next try.
  const refresh = useCallback(async () => {
    const result = await fetchAttendance(matchId);
    if (!mounted.current) return;
    if (result.ok) {
      setLoaded({ data: result.data, clock: createServerClock(result.data.server_now) });
      setFailed(false);
    } else {
      setFailed(true);
    }
    setLoading(false);
    if (!result.ok) throw new Error('refresh failed');
  }, [matchId]);

  useEffect(() => {
    mounted.current = true;
    const poller = createPoller({ run: refresh });
    void Promise.resolve().then(refresh).catch(() => undefined); // the first load (the poller waits one interval before its first run)
    poller.start();
    return () => {
      mounted.current = false;
      poller.stop();
    };
  }, [refresh]);

  const nowMs = useServerNow(loaded?.clock);

  const refreshQuietly = () => void refresh().catch(() => undefined); // the failure is already on screen (`failed`)
  const retry = () => {
    setLoading(true);
    refreshQuietly();
  };

  if (!loaded) {
    if (loading) {
      return (
        <section aria-busy="true" data-testid="fixture-loading" className="card stack-sm">
          <h1>Match</h1>
          <p className="muted">Loading…</p>
        </section>
      );
    }
    return (
      <section data-testid="fixture-error" className="card stack-sm">
        <h1>Match</h1>
        <p role="alert">Something went wrong. Try again.</p>
        <button type="button" className="btn" data-testid="retry-button" onClick={retry}>
          Try again
        </button>
      </section>
    );
  }

  const { data } = loaded;
  const { match, counts, attendees, me } = data;
  const kickedOff = nowMs >= Date.parse(match.kickoff_at);
  const notOpen = match.status !== 'scheduled' || kickedOff;
  // open only if the server said open AND the server-corrected clock is strictly before the cutoff
  const open = !notOpen && match.rsvp_open && nowMs < Date.parse(match.cutoff_at);

  return (
    <>
      <h1>
        <span className="muted">vs </span>
        {match.opponent}
      </h1>
      {/* from 768 px: details, counts and answers on the left, the attendance list on the right (.fx-grid in globals.css) */}
      <div className="fx-grid">
      <div className="fx-col">
      <section aria-label="Match details" className="card stack-xs">
        <p className="muted">
          {match.competition} · {match.venue}
        </p>
        <p>
          Kickoff: <time dateTime={match.kickoff_at}>{formatKickoff(match.kickoff_at)}</time>
        </p>
        <p>
          <span data-testid="rsvp-status" className={open ? 'chip chip-ok' : 'chip'}>
            {open ? 'Open' : 'RSVP closed'}
          </span>{' '}
          <span className="muted">
            RSVP {open ? 'closes' : 'closed'} {formatKickoff(match.cutoff_at)}
          </span>
        </p>
        {notOpen ? (
          <p role="status" data-testid="match-not-open" className="bold">
            {match.status === 'cancelled' ? 'This match was cancelled.' : match.status === 'played' ? 'This match has been played.' : 'This match has kicked off.'}
          </p>
        ) : null}
        {!notOpen && !open ? (
          <p data-testid="rsvp-closed" className="bold">
            RSVP is closed. You can still see who is coming.
          </p>
        ) : null}
      </section>

      {failed ? (
        <section data-testid="fixture-error" className="card stack-sm">
          <p role="alert">Something went wrong. Showing older data.</p>
          <button type="button" className="btn" data-testid="retry-button" onClick={retry}>
            Try again
          </button>
        </section>
      ) : null}

      <section aria-labelledby="counts-title" className="stack-sm">
        <h2 id="counts-title" className="muted t-md">
          Who is coming
        </h2>
        <div className="fx-counts">
          <div className="fx-count" data-testid="count-going">
            Going <strong>{counts.going}</strong>
          </div>
          <div className="fx-count" data-testid="count-maybe">
            Maybe <strong>{counts.maybe}</strong>
          </div>
          <div className="fx-count" data-testid="count-not-going">
            Not going <strong>{counts.not_going}</strong>
          </div>
          <div className="fx-count" data-testid="count-no-answer">
            No answer <strong>{counts.no_answer}</strong>
          </div>
        </div>
      </section>

      {!notOpen ? <RsvpButtons matchId={match.id} open={open} me={me} onChanged={refreshQuietly} /> : null}

      </div>
      <div className="fx-col">
      <section aria-labelledby="list-title" className="card stack-sm">
        <h2 id="list-title">Attendance</h2>
        {attendees.length === 0 ? (
          <p data-testid="attendees-empty">Nobody has answered yet</p>
        ) : (
          GROUPS.map((g) => {
            const rows = attendees.filter((a) => a.answer === g.answer);
            if (rows.length === 0) return null;
            return (
              <div key={g.answer} role="group" aria-label={g.label} className="stack-xs">
                <h3>
                  {g.label} ({rows.length})
                </h3>
                <ul className="fx-list">
                  {rows.map((a) => (
                    <li key={a.player_id} className="fx-row" data-testid="attendee-row">
                      <span className="fx-name">{a.name}</span>
                      <span className="fx-chip" style={{ background: g.color }}>
                        {g.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
        <LiveClock serverNow={data.server_now} nowMs={nowMs} />
      </section>
      </div>
      </div>
    </>
  );
}
