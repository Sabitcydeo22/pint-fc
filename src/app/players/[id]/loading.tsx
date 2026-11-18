// Shown while a profile is loading: skeleton blocks, announced as busy.
export default function PlayerLoading() {
  return (
    <main aria-busy="true" data-testid="player-loading" className="stack">
      <p className="muted">Loading the profile…</p>
      <div className="stack-xs" aria-hidden="true">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-line" />
      </div>
    </main>
  );
}
