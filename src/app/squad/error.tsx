'use client';

// Shown when the squad cannot be loaded: a plain message and a retry button, never the raw error.
export default function SquadError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main data-testid="squad-error">
      <h1>Squad</h1>
      <p role="alert">Something went wrong. Try again.</p>
      <button type="button" className="btn" data-testid="retry-button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
