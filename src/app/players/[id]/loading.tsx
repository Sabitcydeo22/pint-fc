// Shown while a profile is loading: skeleton blocks, announced as busy.
export default function PlayerLoading() {
  return (
    <main aria-busy="true" data-testid="player-loading">
      <p className="muted">Loading the profile…</p>
      <div style={{ display: 'grid', gap: 8 }} aria-hidden="true">
        <div style={{ height: 32, width: '60%', borderRadius: 8, background: 'var(--surface)' }} />
        <div style={{ height: 20, width: '40%', borderRadius: 8, background: 'var(--surface)' }} />
      </div>
    </main>
  );
}
