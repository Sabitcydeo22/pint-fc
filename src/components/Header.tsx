'use client';

import Link from 'next/link';
import { useId, useState } from 'react';

/** The player shown in the account menu, or null for a visitor. The layout resolves it on the server. */
export interface HeaderPlayer {
  displayName: string;
}

async function post(path: string): Promise<void> {
  try {
    await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' });
  } catch {
    // network trouble: still go home, where the server shows the real state
  }
  // a full page load, so the server draws the header again without the session
  window.location.assign(new URL('/', window.location.origin).href);
}

export default function Header({ player }: { player: HeaderPlayer | null }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const panelId = useId();

  const run = (path: string) => {
    setBusy(true);
    void post(path);
  };

  return (
    <header className="site-header" data-testid="site-header">
      <div className="header-bar">
        <Link href="/" className="brand">
          <span className="crest" aria-hidden="true" />
          <span>PINT FC</span>
        </Link>
        <button
          type="button"
          className="nav-toggle"
          data-testid="nav-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Close menu' : 'Menu'}
        </button>
        <nav id={panelId} className="nav-panel" data-open={open} aria-label="Main">
          <Link href="/" className="nav-link">
            Home
          </Link>
          <Link href="/squad" className="nav-link">
            Squad
          </Link>
          {player ? (
            <div className="account-menu" data-testid="account-menu">
              <span className="account-name">{player.displayName}</span>
              <Link href="/settings" className="nav-link">
                My settings
              </Link>
              <button type="button" className="header-btn" data-testid="sign-out-button" disabled={busy} onClick={() => run('/api/auth/sign-out')}>
                Sign out
              </button>
              <button type="button" className="header-btn" data-testid="sign-out-all-button" disabled={busy} onClick={() => run('/api/auth/sign-out-all')}>
                Sign out of all devices
              </button>
            </div>
          ) : (
            <Link href="/sign-in" className="nav-link" data-testid="sign-in-link">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
