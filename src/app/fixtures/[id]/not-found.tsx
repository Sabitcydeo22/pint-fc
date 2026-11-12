import Link from 'next/link';

// One page for every match that does not exist, or whose id is not valid. Next sends it with a real 404 status.
// It never repeats the id.
export default function FixtureNotFound() {
  return (
    <main data-testid="not-found">
      <h1>Match not found</h1>
      <p>We could not find that match.</p>
      <p>
        <Link href="/" data-testid="back-home">
          ← Back to home
        </Link>
      </p>
    </main>
  );
}
