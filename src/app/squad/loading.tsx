// Shown while the squad is loading: skeleton blocks, announced as busy.
export default function SquadLoading() {
  return (
    <main aria-busy="true" data-testid="squad-loading">
      <h1>Squad</h1>
      <p className="muted">Loading the squad…</p>
      <div style={{ display: 'grid', gap: 8 }} aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ height: 44, borderRadius: 8, background: 'var(--surface)' }} />
        ))}
      </div>
    </main>
  );
}
