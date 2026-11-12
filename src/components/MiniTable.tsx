'use client';
// The "League table" (mini) section of the home page: the latest standings snapshot, teams in position order with
// played, goal difference and points. PINT FC's row is marked with a bold label AND a thick left bar, never by
// colour alone (AC-2.4.2). It loads /api/home itself, so it has its own loading, empty and error states.
//
// The snapshot date (`taken_on`) is in the API response but is deliberately NOT shown here: session 16 adds the
// `table-snapshot-date` element together with the owner (AC-2.4.3).
import { useEffect, useState } from 'react';
import type { HomeData, StandingRow } from '../server/home';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; rows: StandingRow[] | null };

async function fetchTable(): Promise<State> {
  try {
    const res = await fetch('/api/home', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error('bad status');
    const data = (await res.json()) as Partial<HomeData>;
    if (!('standings' in data)) throw new Error('bad shape');
    return { kind: 'ready', rows: data.standings?.rows ?? null };
  } catch {
    return { kind: 'error' }; // never the server's text
  }
}

const gd = (n: number) => (n > 0 ? `+${n}` : String(n));

const cell = { padding: '8px 4px', textAlign: 'right' as const };
const head = { ...cell, fontWeight: 600, fontSize: '0.875rem', borderBottom: '2px solid var(--muted)' };

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
    <section aria-labelledby="mini-table-title" aria-busy={state.kind === 'loading'} className="card" style={{ marginTop: 16 }}>
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
        <table
          data-testid="mini-table"
          aria-labelledby="mini-table-title"
          style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}
        >
          <colgroup>
            <col style={{ width: '2.5rem' }} />
            <col />
            <col style={{ width: '2.5rem' }} />
            <col style={{ width: '3rem' }} />
            <col style={{ width: '3rem' }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" style={head}>
                Pos
              </th>
              <th scope="col" style={{ ...head, textAlign: 'left' }}>
                Team
              </th>
              <th scope="col" style={head}>
                P
              </th>
              <th scope="col" style={head}>
                GD
              </th>
              <th scope="col" style={head}>
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
                style={row.is_us ? { borderLeft: '6px solid var(--accent)', background: 'var(--surface)' } : undefined}
              >
                <td data-testid="table-pos" style={cell}>
                  {row.position}
                </td>
                <td style={{ ...cell, textAlign: 'left', overflowWrap: 'anywhere' }}>
                  {row.is_us ? (
                    <strong data-testid="table-us-label" style={{ fontWeight: 800 }}>
                      {row.team}
                    </strong>
                  ) : (
                    row.team
                  )}
                </td>
                <td data-testid="table-played" style={cell}>
                  {row.played}
                </td>
                <td data-testid="table-gd" style={cell}>
                  {gd(row.goal_difference)}
                </td>
                <td data-testid="table-points" style={{ ...cell, fontWeight: 700 }}>
                  {row.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
