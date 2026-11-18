// Shown while the squad is loading: skeleton blocks, announced as busy.
export default function SquadLoading() {
  return (
    <main aria-busy="true" data-testid="squad-loading" className="stack">
      <h1>Squad</h1>
      <p className="muted">Loading the squad…</p>
      <div className="stack-xs" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton skeleton-row" />
        ))}
      </div>
    </main>
  );
}
