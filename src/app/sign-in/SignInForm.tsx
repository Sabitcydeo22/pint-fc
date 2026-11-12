'use client';

import { useState, type FormEvent } from 'react';

const GENERIC_ERROR = 'Email or password is incorrect';

export default function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/sign-in', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        // always "/": no redirect parameter is honoured (T-19). A full load draws the signed-in header.
        window.location.assign(new URL('/', window.location.origin).href);
        return;
      }
      // one message for a wrong password, an unknown email and a bad request alike; never the server's text
      setError(res.status >= 500 ? 'Something went wrong. Try again.' : GENERIC_ERROR);
    } catch {
      setError('Something went wrong. Try again.');
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={submitting}>
      {error ? (
        <p className="form-error" role="alert" data-testid="sign-in-error">
          {error}
        </p>
      ) : null}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="email-input"
        />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={200}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="password-input"
        />
      </div>
      <button type="submit" className="btn" disabled={submitting} data-testid="sign-in-button">
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
