'use client';
// The event page body (docs/design/screens.md, `/fixtures/[id]`): match header, RSVP status, counts, my answer and the
// attendance list. It loads GET /api/fixtures/[id]/attendance once on mount (the 10-second poller attaches in session
// 15: see `refresh`), and again after a save. Time maths use the SERVER-corrected clock (a phone with a wrong clock
// still closes RSVP at the right moment). The list shows names and answers only: the response carries no reasons, and
// this component renders only name and answer anyway.
import { useCallback, useEffect, useState } from 'react';
import { createServerClock, type ServerClock } from '../lib/clock';
import { formatKickoff } from '../lib/time';
import type { Attendance as AttendanceData } from '../server/attendance';
import type { RsvpAnswer } from '../server/rsvp';
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

const CSS = `
.fx-choices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}
.fx-choice{min-height:44px;padding:8px 6px;border:2px solid var(--choice,var(--primary));border-radius:var(--radius,8px);background:#fff;color:var(--ink);font:inherit;font-weight:700;cursor:pointer;overflow-wrap:anywhere}
.fx-choice[aria-pressed="true"]{background:var(--choice,var(--primary));color:#fff}
.fx-choice:disabled{opacity:.6;cursor:not-allowed}
.fx-counts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0}
.fx-count{background:var(--surface);border-radius:var(--radius,8px);padding:8px 12px;min-width:0}
.fx-count strong{display:block;font-size:1.75rem;line-height:1.2}
.fx-list{list-style:none;margin:0 0 12px;padding:0}
.fx-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--surface);min-width:0}
.fx-name{min-width:0;overflow-wrap:anywhere}
.fx-chip{flex:none;padding:2px 10px;border-radius:999px;font-weight:700;color:#fff;white-space:nowrap}
@media (min-width:1200px){.fx-counts{grid-template-columns:repeat(4,minmax(0,1fr))}.fx-count strong{font-size:3.5rem}.fx-row{font-size:1.25rem}}
`;

const GROUPS: { answer: RsvpAnswer; label: string; color: string }[] = [
  { answer: 'going', label: 'Going', color: 'var(--ok)' },
  { answer: 'maybe', label: 'Maybe', color: 'var(--warn)' },
  { answer: 'not_going', label: 'Not going', color: 'var(--bad)' },
];

export default function Attendance({ matchId }: { matchId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false); // the last load failed (with `loaded` set, the data on screen is older)
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(0);

  // One load. The session 15 poller will call this same function every 10 s while the tab is visible.
  const refresh = useCallback(async () => {
    const result = await fetchAttendance(matchId);
    if (result.ok) {
      const clock = createServerClock(result.data.server_now);
      setLoaded({ data: result.data, clock });
      setNowMs(clock.now());
      setFailed(false);
    } else {
      setFailed(true);
    }
    setLoading(false);
  }, [matchId]);

  useEffect(() => {
    let cancelled = false;
    void fetchAttendance(matchId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        const clock = createServerClock(result.data.server_now);
        setLoaded({ data: result.data, clock });
        setNowMs(clock.now());
      } else {
        setFailed(true);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const clock = loaded?.clock;
  useEffect(() => {
    if (!clock) return;
    const timer = setInterval(() => setNowMs(clock.now()), 1000);
    return () => clearInterval(timer);
  }, [clock]);

  const retry = () => {
    setLoading(true);
    void refresh();
  };

  if (!loaded) {
    if (loading) {
      return (
        <section aria-busy="true" data-testid="fixture-loading" className="card">
          <h1>Match</h1>
          <p className="muted">Loading…</p>
        </section>
      );
    }
    return (
      <section data-testid="fixture-error" className="card">
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
  const secondsAgo = Math.max(0, Math.floor((nowMs - Date.parse(data.server_now)) / 1000));

  return (
    <>
      <style>{CSS}</style>
      <h1>
        <span className="muted">vs </span>
        {match.opponent}
      </h1>
      <section aria-label="Match details" className="card">
        <p className="muted" style={{ margin: 0 }}>
          {match.competition} · {match.venue}
        </p>
        <p style={{ margin: '4px 0' }}>
          Kickoff: <time dateTime={match.kickoff_at}>{formatKickoff(match.kickoff_at)}</time>
        </p>
        <p style={{ margin: '4px 0' }}>
          <span
            data-testid="rsvp-status"
            style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontWeight: 700, color: '#ffffff', background: open ? 'var(--ok)' : 'var(--muted)' }}
          >
            {open ? 'Open' : 'RSVP closed'}
          </span>{' '}
          <span className="muted">
            RSVP {open ? 'closes' : 'closed'} {formatKickoff(match.cutoff_at)}
          </span>
        </p>
        {notOpen ? (
          <p role="status" data-testid="match-not-open" style={{ fontWeight: 700, marginBottom: 0 }}>
            {match.status === 'cancelled' ? 'This match was cancelled.' : match.status === 'played' ? 'This match has been played.' : 'This match has kicked off.'}
          </p>
        ) : null}
        {!notOpen && !open ? (
          <p data-testid="rsvp-closed" style={{ fontWeight: 700, marginBottom: 0 }}>
            RSVP is closed. You can still see who is coming.
          </p>
        ) : null}
      </section>

      {failed ? (
        <section data-testid="fixture-error" className="card">
          <p role="alert" style={{ margin: 0 }}>
            Something went wrong. Showing older data.
          </p>
          <button type="button" className="btn" data-testid="retry-button" onClick={retry}>
            Try again
          </button>
        </section>
      ) : null}

      <section aria-labelledby="counts-title">
        <h2 id="counts-title" className="muted" style={{ fontSize: '1rem' }}>
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

      {!notOpen ? <RsvpButtons matchId={match.id} open={open} me={me} onChanged={() => void refresh()} /> : null}

      <section aria-labelledby="list-title" className="card">
        <h2 id="list-title">Attendance</h2>
        {attendees.length === 0 ? (
          <p data-testid="attendees-empty">Nobody has answered yet</p>
        ) : (
          GROUPS.map((g) => {
            const rows = attendees.filter((a) => a.answer === g.answer);
            if (rows.length === 0) return null;
            return (
              <div key={g.answer} role="group" aria-label={g.label}>
                <h3 style={{ margin: '12px 0 4px' }}>
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
        <p className="muted" data-testid="last-updated" style={{ marginBottom: 0 }}>
          Updated {secondsAgo} s ago
        </p>
      </section>
    </>
  );
}
