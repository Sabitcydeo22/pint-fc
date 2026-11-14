// The real Auth adapter: Supabase Auth (GoTrue), spoken to with plain fetch (no SDK).
//
// Keys: only the PUBLISHABLE key (NEXT_PUBLIC_SUPABASE_ANON_KEY) is used here, in the `apikey` header; the player's own
// access token is the Bearer. The secret key is never used by the app runtime (scripts and smoke tests only).
//
// Cookie: `pf_session` holds the player's access token, HttpOnly, SameSite=Lax, Secure on Vercel. There is no refresh token:
// when the access token expires the player signs in again. The Auth service checks the session on every request (/auth/v1/user),
// and core.require_player() checks auth.sessions again inside the database (D-13: the lifetime cannot be set to 5 minutes on
// the Free plan, so these two checks are the control that makes sign-out and sign-out-all take effect at once).
//
// Failures that mean "not signed in" (wrong password, unknown email, revoked or expired token, not an active player) are null.
// Failures of the service itself (network, 5xx, 429) throw a generic error: the caller must never mistake an outage for a
// sign-out, and no message here ever contains a key, a token, a password or a URL.
import { withDb } from '../db';
import { SESSION_COOKIE, type AuthPort, type AuthSession, type SignInResult } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_COOKIE_SECONDS = 8 * 60 * 60;
const MAX_REMEMBERED = 500;

interface Claims {
  sub?: unknown;
  session_id?: unknown;
  exp?: unknown;
}

/** Claims of a JWT, NOT verified (the Auth service verifies the token; never trust these alone). */
function claimsOf(token: string): Claims | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Claims;
  } catch {
    return null;
  }
}

function tokenFromCookie(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === SESSION_COOKIE) return part.slice(i + 1).trim() || null;
  }
  return null;
}

const setCookie = (value: string, maxAge: number) =>
  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.VERCEL_ENV ? '; Secure' : ''}`;

export class SupabaseAuth implements AuthPort {
  /**
   * session id -> access token, for sign-out-all: Auth can end every session of a user only with one of that user's own
   * tokens (there is no admin call by user id). The token is filled by sign-in and by getUser on the SAME request that then
   * calls signOutAll. In memory only, bounded, never logged.
   */
  private readonly tokens = new Map<string, string>();

  constructor(
    private readonly baseUrl: string,
    private readonly publishableKey: string,
  ) {}

  private async call(path: string, o: { bearer?: string; method?: string; body?: unknown } = {}): Promise<{ status: number; body: Record<string, unknown> }> {
    const headers: Record<string, string> = { apikey: this.publishableKey };
    if (o.bearer) headers.authorization = `Bearer ${o.bearer}`;
    if (o.body !== undefined) headers['content-type'] = 'application/json';
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/auth/v1${path}`, {
        method: o.method ?? 'GET',
        headers,
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
        cache: 'no-store',
      });
    } catch {
      throw new Error('The auth service could not be reached.');
    }
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = text ? JSON.parse(text) : {};
      if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
    } catch {
      /* an empty or non-JSON body is fine */
    }
    return { status: res.status, body };
  }

  private remember(sessionId: string, token: string): void {
    this.tokens.delete(sessionId);
    this.tokens.set(sessionId, token);
    if (this.tokens.size > MAX_REMEMBERED) {
      const oldest = this.tokens.keys().next().value;
      if (oldest !== undefined) this.tokens.delete(oldest);
    }
  }

  async signIn(email: string, password: string): Promise<SignInResult | null> {
    const res = await this.call('/token?grant_type=password', { method: 'POST', body: { email: email.trim(), password } });
    if (res.status === 400 || res.status === 401 || res.status === 422) return null; // wrong password / unknown email / unconfirmed
    if (res.status !== 200) throw new Error('The auth service refused the request.');

    const token = res.body.access_token;
    const expiresIn = res.body.expires_in;
    if (typeof token !== 'string') throw new Error('The auth service answered in an unexpected way.');
    const claims = claimsOf(token);
    const sub = claims?.sub;
    const sessionId = claims?.session_id;
    if (typeof sub !== 'string' || typeof sessionId !== 'string' || !UUID.test(sub) || !UUID.test(sessionId)) {
      await this.endSession(token, 'local');
      throw new Error('The auth service answered without a session.');
    }

    // Only an ACTIVE player may sign in (an archived player, or any Auth user that is not a player, is the same as a wrong
    // password): ask the database, as the player, through the same function every request uses (PF401 = not allowed).
    try {
      await withDb('authenticated', { sub, session_id: sessionId }, (c) => c.query('select id from public.rpc_me()').then((r) => r.rows));
    } catch (e) {
      await this.endSession(token, 'local');
      if ((e as { code?: unknown }).code === 'PF401') return null;
      throw e;
    }

    this.remember(sessionId, token);
    const maxAge = Math.min(typeof expiresIn === 'number' && expiresIn > 0 ? Math.floor(expiresIn) : MAX_COOKIE_SECONDS, MAX_COOKIE_SECONDS);
    return { userId: sub, sessionId, setCookie: [setCookie(token, maxAge)] };
  }

  async getUser(request: Request): Promise<AuthSession | null> {
    const token = tokenFromCookie(request);
    if (!token) return null;
    const claims = claimsOf(token);
    const sub = claims?.sub;
    const sessionId = claims?.session_id;
    if (typeof sub !== 'string' || typeof sessionId !== 'string' || !UUID.test(sub) || !UUID.test(sessionId)) return null;
    if (typeof claims?.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000)) return null;

    // The Auth service verifies the signature AND that the session still exists (revoked = refused at once).
    const res = await this.call('/user', { bearer: token });
    if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 422) return null;
    if (res.status !== 200) throw new Error('The auth service refused the request.');
    if (res.body.id !== sub) return null;

    this.remember(sessionId, token);
    return { userId: sub, sessionId };
  }

  async signOut(request: Request): Promise<{ setCookie: string[] }> {
    const token = tokenFromCookie(request);
    if (token) {
      const sessionId = claimsOf(token)?.session_id;
      if (typeof sessionId === 'string') this.tokens.delete(sessionId);
      await this.endSession(token, 'local');
    }
    return { setCookie: [setCookie('', 0)] };
  }

  async signOutAll(session: AuthSession): Promise<{ setCookie: string[] }> {
    const token = this.tokens.get(session.sessionId);
    if (!token) throw new Error('Cannot end all sessions: this session is not known to this server.');
    const res = await this.call('/logout?scope=global', { method: 'POST', bearer: token });
    if (res.status !== 204 && res.status !== 200 && res.status !== 401 && res.status !== 403 && res.status !== 404) {
      throw new Error('The auth service refused the request.');
    }
    this.tokens.delete(session.sessionId);
    return { setCookie: [setCookie('', 0)] };
  }

  /** Ends one session (scope local). Never throws: a token that is already dead is already signed out. */
  private async endSession(token: string, scope: 'local' | 'global'): Promise<void> {
    try {
      await this.call(`/logout?scope=${scope}`, { method: 'POST', bearer: token });
    } catch {
      /* nothing more can be done; the session ends by itself when the token expires */
    }
  }
}
