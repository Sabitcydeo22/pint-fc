import Link from 'next/link';
import { getSquad } from '../../server/squad';
import { POSITION_GROUPS } from './labels';

export const metadata = { title: 'Squad — PINT FC' };

// The public squad: visible players only, grouped by position. Who is visible is decided in the database; this
// page calls the same function as GET /api/squad. Loading and error states live in loading.tsx and error.tsx.
export default async function SquadPage() {
  const players = await getSquad();
  return (
    <main data-testid="page-squad" className="stack">
      <h1>Squad</h1>
      {players.length === 0 ? (
        <p data-testid="squad-empty">No players to show yet.</p>
      ) : (
        POSITION_GROUPS.map(({ code, heading }) => {
          const group = players.filter((p) => p.position === code);
          if (group.length === 0) return null;
          return (
            <section key={code} data-testid={`squad-group-${code}`} aria-labelledby={`squad-heading-${code}`} className="stack-sm">
              <h2 id={`squad-heading-${code}`}>{heading}</h2>
              <ul className="squad-grid">
                {group.map((p) => (
                  <li key={p.id}>
                    <Link href={`/players/${p.id}`} data-testid="squad-player" className="squad-card">
                      <span className="squad-number">{p.shirt_number}</span>
                      <span className="squad-name">{p.name}</span>
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
