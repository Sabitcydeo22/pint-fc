import Link from 'next/link';

// One page for every player that is not shown: hidden, archived, unknown or not a valid id. It says nothing about
// which of those it is, and never repeats the id or a name (threat T-10). Next sends it with a real 404 status.
export default function PlayerNotFound() {
  return (
    <main data-testid="not-found">
      <h1>Player not found</h1>
      <p>We could not find that player.</p>
      <p>
        <Link href="/squad" data-testid="back-to-squad">
          ← Back to squad
        </Link>
      </p>
    </main>
  );
}
