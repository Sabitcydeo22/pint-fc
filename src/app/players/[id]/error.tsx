'use client';

// Shown when a profile cannot be loaded: a plain message and a retry button, never the raw error.
export default function PlayerError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main data-testid="player-error">
      <p role="alert">Something went wrong. Try again.</p>
      <button type="button" className="btn" data-testid="retry-button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
