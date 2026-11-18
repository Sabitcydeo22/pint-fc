'use client';
// The "Season record" section of the home page: the current season's LEAGUE record from published results.
// It loads /api/home itself, so it has its own loading, empty and error states (docs/design/screens.md, `/`).
// No published result yet means `record: null`, and the page says so instead of showing a row of zeros (AC-2.2.4).
import { useEffect, useState } from 'react';
import type { HomeData, SeasonRecordRow } from '../server/home';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; record: SeasonRecordRow | null };

async function fetchRecord(): Promise<State> {
  try {
    const res = await fetch('/api/home', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error('bad status');
    const data = (await res.json()) as Partial<HomeData>;
    if (!('record' in data)) throw new Error('bad shape');
    return { kind: 'ready', record: data.record ?? null };
  } catch {
    return { kind: 'error' }; // never the server's text
  }
}

const STATS: { id: string; label: string; key: keyof SeasonRecordRow }[] = [
  { id: 'record-played', label: 'Played', key: 'played' },
  { id: 'record-won', label: 'Won', key: 'won' },
  { id: 'record-drawn', label: 'Drawn', key: 'drawn' },
  { id: 'record-lost', label: 'Lost', key: 'lost' },
  { id: 'record-gf', label: 'Goals for', key: 'goals_for' },
  { id: 'record-ga', label: 'Goals against', key: 'goals_against' },
];

export default function SeasonRecord() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void fetchRecord().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const retry = () => {
    setState({ kind: 'loading' });
    void fetchRecord().then(setState);
  };

  return (
    <section aria-labelledby="season-record-title" aria-busy={state.kind === 'loading'} className="card stack-sm">
      <h2 id="season-record-title">Season record</h2>
      {state.kind === 'loading' ? (
        <p className="muted" data-testid="season-record-loading">
          Loading…
        </p>
      ) : state.kind === 'error' ? (
        <div data-testid="season-record-error">
          <p role="alert">Something went wrong. Try again.</p>
          <button type="button" className="btn" data-testid="season-record-retry" onClick={retry}>
            Try again
          </button>
        </div>
      ) : state.record === null ? (
        <p data-testid="season-record-empty">No results yet</p>
      ) : (
        <dl data-testid="season-record" className="stat-grid">
          {STATS.map((s) => (
            <div key={s.id} className="stat">
              <dt className="muted t-sm">{s.label}</dt>
              <dd data-testid={s.id} className="stat-value">
                {(state.record as SeasonRecordRow)[s.key]}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
