'use client';
// The "League table" (mini) section of the home page: the latest standings snapshot, teams in position order with
// played, goal difference and points. PINT FC's row is marked with a bold label AND a thick left bar, never by
// colour alone (AC-2.4.2). It loads /api/home itself, so it has its own loading, empty and error states.
//
// The snapshot date (`taken_on`, a calendar date in the club zone) is shown as "As of Nov 5, 2026" so it is clear the
// table is not live (AC-2.4.3). It is a date, not an instant, so it is formatted without any time-zone shift.
import { useEffect, useState } from 'react';
import type { HomeData, StandingRow } from '../server/home';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; rows: StandingRow[] | null; takenOn: string | null };

// "YYYY-MM-DD" is already the club-zone calendar day; read it as UTC midnight and format in UTC so the day never moves.
const dateFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
function formatTakenOn(takenOn: string): string {
  const d = new Date(`${takenOn}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? takenOn : dateFormat.format(d);
}

async function fetchTable(): Promise<State> {
  try {
    const res = await fetch('/api/home', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error('bad status');
    const data = (await res.json()) as Partial<HomeData>;
    if (!('standings' in data)) throw new Error('bad shape');
    return { kind: 'ready', rows: data.standings?.rows ?? null, takenOn: data.standings?.taken_on ?? null };
  } catch {
    return { kind: 'error' }; // never the server's text
  }
}

const gd = (n: number) => (n > 0 ? `+${n}` : String(n));

export default function MiniTable() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void fetchTable().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const retry = () => {
    setState({ kind: 'loading' });
    void fetchTable().then(setState);
  };

  return (
    <section aria-labelledby="mini-table-title" aria-busy={state.kind === 'loading'} className="card stack-sm">
      <h2 id="mini-table-title">League table</h2>
      {state.kind === 'loading' ? (
        <p className="muted" data-testid="table-loading">
          Loading…
        </p>
      ) : state.kind === 'error' ? (
        <div data-testid="table-error">
          <p role="alert">Something went wrong. Try again.</p>
          <button type="button" className="btn" data-testid="table-retry" onClick={retry}>
            Try again
          </button>
        </div>
      ) : state.rows === null || state.rows.length === 0 ? (
        <p data-testid="table-empty">No table yet</p>
      ) : (
        <>
        {state.takenOn ? (
          <p className="muted" data-testid="table-snapshot-date">
            {`As of ${formatTakenOn(state.takenOn)}`}
          </p>
        ) : null}
        <table data-testid="mini-table" aria-labelledby="mini-table-title" className="mt">
          <colgroup>
            <col className="mt-col-pos" />
            <col />
            <col className="mt-col-p" />
            <col className="mt-col-gd" />
            <col className="mt-col-pts" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="mt-cell mt-head">
                Pos
              </th>
              <th scope="col" className="mt-cell mt-head mt-team">
                Team
              </th>
              <th scope="col" className="mt-cell mt-head">
                P
              </th>
              <th scope="col" className="mt-cell mt-head">
                GD
              </th>
              <th scope="col" className="mt-cell mt-head">
                Pts
              </th>
            </tr>
          </thead>
          <tbody>
            {state.rows.map((row) => (
              <tr
                key={row.position}
                // our row: its own test id, a thick left bar (a border, so it survives high-contrast modes) and a bold label
                data-testid={row.is_us ? 'table-row-us' : 'table-row'}
                className={row.is_us ? 'mt-us' : undefined}
              >
                <td data-testid="table-pos" className="mt-cell">
                  {row.position}
                </td>
                <td className="mt-cell mt-team">
                  {row.is_us ? (
                    <strong data-testid="table-us-label" className="bold">
                      {row.team}
                    </strong>
                  ) : (
                    row.team
                  )}
                </td>
                <td data-testid="table-played" className="mt-cell">
                  {row.played}
                </td>
                <td data-testid="table-gd" className="mt-cell">
                  {gd(row.goal_difference)}
                </td>
                <td data-testid="table-points" className="mt-cell bold">
                  {row.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </>
      )}
    </section>
  );
}
