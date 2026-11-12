'use client';
// The "Latest results" section of the home page: up to 5 published results, newest first, each with opponent,
// score and date. It loads /api/home itself, so it has its own loading, empty and error states.
// Each row also says Win / Draw / Loss in text, so the outcome never depends on colour alone.
import { useEffect, useState } from 'react';
import type { HomeData, LatestResultRow } from '../server/home';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; rows: LatestResultRow[] };

async function fetchResults(): Promise<State> {
  try {
    const res = await fetch('/api/home', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error('bad status');
    const data = (await res.json()) as Partial<HomeData>;
    if (!Array.isArray(data.latest_results)) throw new Error('bad shape');
    return { kind: 'ready', rows: data.latest_results };
  } catch {
    return { kind: 'error' }; // never the server's text
  }
}

const dateFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', day: 'numeric', month: 'short' });

/** "9 Nov" from "2026-11-09". The value is already a club-zone calendar date, so it is read as a plain date (UTC) with no shift. */
function shortDate(playedOn: string): string {
  const parts: Record<string, string> = {};
  for (const p of dateFormat.formatToParts(new Date(`${playedOn}T00:00:00Z`))) parts[p.type] = p.value;
  return `${parts.day} ${parts.month}`;
}

function outcome(row: LatestResultRow): { letter: 'W' | 'D' | 'L'; word: 'Win' | 'Draw' | 'Loss'; color: string } {
  if (row.goals_for > row.goals_against) return { letter: 'W', word: 'Win', color: 'var(--ok)' };
  if (row.goals_for === row.goals_against) return { letter: 'D', word: 'Draw', color: 'var(--warn)' };
  return { letter: 'L', word: 'Loss', color: 'var(--bad)' };
}

export default function LatestResults() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void fetchResults().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const retry = () => {
    setState({ kind: 'loading' });
    void fetchResults().then(setState);
  };

  return (
    <section aria-labelledby="latest-results-title" aria-busy={state.kind === 'loading'} className="card" style={{ marginTop: 16 }}>
      <h2 id="latest-results-title">Latest results</h2>
      {state.kind === 'loading' ? (
        <p className="muted" data-testid="results-loading">
          Loading…
        </p>
      ) : state.kind === 'error' ? (
        <div data-testid="results-error">
          <p role="alert">Something went wrong. Try again.</p>
          <button type="button" className="btn" data-testid="results-retry" onClick={retry}>
            Try again
          </button>
        </div>
      ) : state.rows.length === 0 ? (
        <p data-testid="results-empty">No results yet</p>
      ) : (
        <ol data-testid="latest-results" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {state.rows.map((row) => {
            const o = outcome(row);
            return (
              <li
                key={row.match_id}
                data-testid="result-row"
                style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', minWidth: 0 }}
              >
                <span
                  data-testid="result-outcome"
                  aria-label={o.word}
                  style={{ display: 'inline-block', minWidth: 28, padding: '2px 8px', borderRadius: 6, background: o.color, color: '#ffffff', fontWeight: 800, textAlign: 'center' }}
                >
                  {o.letter}
                </span>
                <span style={{ flex: '1 1 8rem', minWidth: 0, fontWeight: 600 }}>{row.opponent}</span>
                <span style={{ fontWeight: 800 }}>
                  {row.goals_for}–{row.goals_against}
                </span>
                <time className="muted" dateTime={row.played_on}>
                  {shortDate(row.played_on)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
