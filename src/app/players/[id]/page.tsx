import Link from 'next/link';
import { notFound } from 'next/navigation';
import { POSITION_SINGULAR } from '../../squad/labels';
import { loadProfile } from './data';

export const metadata = { title: 'Player — PINT FC' };

// A public player profile. Hidden, archived, unknown and not-a-uuid ids all end in notFound(): one and the same 404
// page with a real 404 status (T-10). Photo, nationality and stats are rendered ONLY when the profile carries them,
// so an unconsented field is absent from the page, not just hidden.
export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = await loadProfile(id);
  if (!player) notFound(); // the layout has already answered 404 for this; kept so the page is safe on its own

  const stats = player.stats;
  return (
    <main data-testid="page-player">
      <p>
        <Link href="/squad" data-testid="back-to-squad">
          ← Back to squad
        </Link>
      </p>
      {player.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a small avatar from a data field, not an optimised asset
        <img data-testid="player-photo" src={player.photo_url} alt={`Photo of ${player.name}`} width={120} height={120} style={{ maxWidth: '100%', height: 'auto', borderRadius: 8, background: 'var(--surface)' }} />
      ) : null}
      <h1 data-testid="player-name">{player.name}</h1>
      <p data-testid="player-position" style={{ margin: '4px 0' }}>
        {POSITION_SINGULAR[player.position]}
      </p>
      <p data-testid="player-number" style={{ margin: '4px 0' }}>
        Shirt number <strong>{player.shirt_number}</strong>
      </p>
      {player.nationality ? (
        <p data-testid="player-nationality" style={{ margin: '4px 0' }}>
          Nationality: {player.nationality}
        </p>
      ) : null}
      {stats ? (
        <section aria-labelledby="player-stats-title" className="card" style={{ marginTop: 16, marginLeft: 0 }}>
          <h2 id="player-stats-title">Season stats</h2>
          <dl data-testid="player-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 12, margin: 0 }}>
            {(
              [
                ['Appearances', stats.appearances],
                ['Goals', stats.goals],
                ['Assists', stats.assists],
                ['Minutes', stats.minutes],
              ] as const
            ).map(([label, value]) => (
              <div key={label} style={{ minWidth: 0 }}>
                <dt className="muted" style={{ fontSize: '0.875rem' }}>
                  {label}
                </dt>
                <dd style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </main>
  );
}
