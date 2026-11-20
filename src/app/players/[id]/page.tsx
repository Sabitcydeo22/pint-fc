import Link from 'next/link';
import { notFound } from 'next/navigation';
import PlayerAvatar from '../../../components/PlayerAvatar';
import { playerPhotoSrc } from '../../../lib/photo';
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
    <main data-testid="page-player" className="stack">
      <p>
        <Link href="/squad" data-testid="back-to-squad">
          ← Back to squad
        </Link>
      </p>
      <section className="player-panel" data-testid="player-panel" aria-labelledby="player-name">
        <div className="player-panel-text stack-xs">
          <p data-testid="player-position" className="player-position">
            {POSITION_SINGULAR[player.position]}
          </p>
          <h1 id="player-name" data-testid="player-name">
            {player.name}
          </h1>
          <p className="sr-only">Shirt number {player.shirt_number}</p>
          {player.nationality ? <p data-testid="player-nationality">Nationality: {player.nationality}</p> : null}
        </div>
        <PlayerAvatar shirtNumber={player.shirt_number} photoSrc={playerPhotoSrc(player.photo_url)} />
      </section>
      {stats ? (
        <section aria-labelledby="player-stats-title" className="card stack-sm">
          <h2 id="player-stats-title">Season stats</h2>
          <dl data-testid="player-stats" className="stat-grid">
            {(
              [
                ['Appearances', stats.appearances],
                ['Goals', stats.goals],
                ['Assists', stats.assists],
                ['Minutes', stats.minutes],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="stat">
                <dt className="muted t-sm">{label}</dt>
                <dd className="stat-value">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </main>
  );
}
