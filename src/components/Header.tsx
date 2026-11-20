'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import Crest from './Crest';

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
  const [accountOpen, setAccountOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const panelId = useId();
  const accountPanelId = useId();
  const accountRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const run = (path: string) => {
    setBusy(true);
    void post(path);
  };

  // a click or tap outside the account menu closes it
  useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [accountOpen]);

  // Escape closes the menu and puts the focus back on the button
  const onAccountKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && accountOpen) {
      setAccountOpen(false);
      triggerRef.current?.focus();
    }
  };
  // tabbing out of the menu closes it
  const onAccountBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) setAccountOpen(false);
  };

  return (
    <header className="site-header" data-testid="site-header">
      <div className="header-bar">
        <Link href="/" className="brand">
          <Crest />
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
            <div className="account-menu" data-testid="account-menu" ref={accountRef} onKeyDown={onAccountKeyDown} onBlur={onAccountBlur}>
              <button
                type="button"
                className="header-btn account-trigger"
                data-testid="account-trigger"
                ref={triggerRef}
                aria-expanded={accountOpen}
                aria-controls={accountPanelId}
                onClick={() => setAccountOpen((v) => !v)}
              >
                <span className="account-name">{player.displayName}</span>
                <span aria-hidden="true"> ▾</span>
              </button>
              {accountOpen ? (
                <div id={accountPanelId} className="account-panel" data-testid="account-panel">
                  <Link href="/settings" className="menu-item" data-testid="settings-link">
                    My settings
                  </Link>
                  <button type="button" className="menu-item" data-testid="sign-out-button" disabled={busy} onClick={() => run('/api/auth/sign-out')}>
                    Sign out
                  </button>
                  <button type="button" className="menu-item" data-testid="sign-out-all-button" disabled={busy} onClick={() => run('/api/auth/sign-out-all')}>
                    Sign out of all devices
                  </button>
                </div>
              ) : null}
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
