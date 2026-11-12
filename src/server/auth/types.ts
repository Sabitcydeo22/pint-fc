// The AuthPort: everything the app needs from "the Auth service". Two adapters exist:
//   LocalAuth     test-only stand-in for local runs and CI (src/server/auth/local.ts)
//   Supabase Auth the real one, arriving in session 18
// Routes only ever talk to this interface.

export const SESSION_COOKIE = 'pf_session';
/** How long a LocalAuth session lives. */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

/** A verified, live session: the token is genuine AND its session still exists on the server. */
export interface AuthSession {
  userId: string;
  sessionId: string;
}

export interface SignInResult extends AuthSession {
  /** `Set-Cookie` header values to send to the browser. */
  setCookie: string[];
}

export interface AuthPort {
  /** Verifies email + password for an ACTIVE player and opens a session. `null` for any failure (never says which). */
  signIn(email: string, password: string): Promise<SignInResult | null>;
  /** Who is this request? Verified against the Auth service every time; `null` when not signed in or revoked. */
  getUser(request: Request): Promise<AuthSession | null>;
  /** Ends THIS session (scope local). Never fails; always returns the cookie-clearing headers. */
  signOut(request: Request): Promise<{ setCookie: string[] }>;
  /** Ends every session of the user (scope global). */
  signOutAll(session: AuthSession): Promise<{ setCookie: string[] }>;
}
