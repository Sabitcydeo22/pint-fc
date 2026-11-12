import Link from 'next/link';
import { getSquad } from '../../server/squad';
import { POSITION_GROUPS } from './labels';

export const metadata = { title: 'Squad — PINT FC' };

// The public squad: visible players only, grouped by position. Who is visible is decided in the database; this
// page calls the same function as GET /api/squad. Loading and error states live in loading.tsx and error.tsx.
export default async function SquadPage() {
  const players = await getSquad();
  return (
    <main data-testid="page-squad">
      <h1>Squad</h1>
      {players.length === 0 ? (
        <p data-testid="squad-empty">No players to show yet.</p>
      ) : (
        POSITION_GROUPS.map(({ code, heading }) => {
          const group = players.filter((p) => p.position === code);
          if (group.length === 0) return null;
          return (
            <section key={code} data-testid={`squad-group-${code}`} aria-labelledby={`squad-heading-${code}`} style={{ marginTop: 16 }}>
              <h2 id={`squad-heading-${code}`}>{heading}</h2>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 14rem), 1fr))' }}>
                {group.map((p) => (
                  <li key={p.id} style={{ minWidth: 0 }}>
                    <Link
                      href={`/players/${p.id}`}
                      data-testid="squad-player"
                      style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, padding: '8px 12px', borderRadius: 8, background: 'var(--surface)', textDecoration: 'none', color: 'var(--ink)' }}
                    >
                      <span style={{ minWidth: 28, fontWeight: 800, color: 'var(--primary)' }}>{p.shirt_number}</span>
                      <span style={{ minWidth: 0, fontWeight: 600 }}>{p.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </main>
  );
}
