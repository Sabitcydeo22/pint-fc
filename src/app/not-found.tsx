import Link from 'next/link';

// The site-wide 404 (screens.md: `/404` is `not-found`). It never repeats the address that was asked for.
export default function NotFound() {
  return (
    <main data-testid="not-found">
      <h1>Page not found</h1>
      <p>We could not find that page.</p>
      <p>
        <Link href="/" data-testid="back-home">
          ← Back to home
        </Link>
      </p>
    </main>
  );
}
