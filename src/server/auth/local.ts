// LocalAuth: a TEST-ONLY stand-in for Supabase Auth, so local runs and CI need no Docker and no network.
// It must never run on Vercel (getAuth() in ./index.ts refuses). Users and password hashes live in
// schema local_auth (created on first use); sessions live in auth.sessions, the same table the real
// Supabase project has, so core.require_player() works identically in both worlds.
//
// Differences from the real thing (covered by the smoke tests in session 18): the cookie holds one HS256
// token valid for 8 hours (Supabase uses a short token plus a refresh token), and the cookie is not `Secure`
// (local runs are plain http).
import crypto from 'node:crypto';
import { ownerQuery } from '../db';
import { dummyHash, ensureLocalAuthSchema, verifyPassword } from './local-store.mjs';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, type AuthPort, type AuthSession, type SignInResult } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

function signToken(claims: Record<string, unknown>, secret: string): string {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64(claims);
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${payload}`).digest('base64url');
  return `${head}.${payload}.${sig}`;
}

interface Claims {
  sub?: unknown;
  session_id?: unknown;
  exp?: unknown;
}

/** Claims of a token with a valid HS256 signature (expiry NOT checked here), or null. */
function verifySignature(token: string, secret: string): Claims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, payload, sig] = parts;
  try {
    const header = JSON.parse(Buffer.from(head, 'base64url').toString('utf8')) as { alg?: unknown };
    if (header.alg !== 'HS256') return null; // never accept "none" or anything else
    const expected = crypto.createHmac('sha256', secret).update(`${head}.${payload}`).digest();
    const actual = Buffer.from(sig, 'base64url');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Claims;
  } catch {
    return null;
  }
}

function cookieValue(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === SESSION_COOKIE) return part.slice(i + 1).trim() || null;
  }
  return null;
}

const setCookie = (value: string, maxAge: number) =>
  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;

export class LocalAuth implements AuthPort {
  private ready: Promise<void> | undefined;

  constructor(private readonly secret: string) {
    if (secret.length < 32) throw new Error('LOCAL_AUTH_SECRET must be at least 32 characters');
  }

  async signIn(email: string, password: string): Promise<SignInResult | null> {
    await this.initSchema();
    const rows = await ownerQuery<{ id: string; password_hash: string; status: string | null }>(
      `select u.id, u.password_hash, p.status::text as status
         from local_auth.users u left join core.players p on p.id = u.id
        where lower(u.email) = lower($1)`,
      [email.trim()],
    );
    const row = rows[0];
    // the same amount of hashing work happens whether or not the account exists
    const ok = await verifyPassword(password, row?.password_hash ?? (await dummyHash()));
    if (!row || !ok || row.status !== 'active') return null;

    const created = await ownerQuery<{ id: string }>(
      "insert into auth.sessions (user_id, not_after) values ($1, now() + make_interval(secs => $2)) returning id",
      [row.id, SESSION_TTL_SECONDS],
    );
    const sessionId = created[0].id;
    const now = Math.floor(Date.now() / 1000);
    const token = signToken(
      { sub: row.id, role: 'authenticated', session_id: sessionId, iat: now, exp: now + SESSION_TTL_SECONDS },
      this.secret,
    );
    return { userId: row.id, sessionId, setCookie: [setCookie(token, SESSION_TTL_SECONDS)] };
  }

  async getUser(request: Request): Promise<AuthSession | null> {
    const token = cookieValue(request);
    if (!token) return null;
    const claims = verifySignature(token, this.secret);
    if (!claims) return null;
    const { sub, session_id: sessionId, exp } = claims;
    if (typeof sub !== 'string' || typeof sessionId !== 'string' || !UUID.test(sub) || !UUID.test(sessionId)) return null;
    if (typeof exp !== 'number' || exp <= Math.floor(Date.now() / 1000)) return null;
    // asks the "Auth service" whether this session is still alive (so a revoked token stops working at once)
    const live = await ownerQuery(
      `select 1 from auth.sessions s join core.players p on p.id = s.user_id
        where s.id = $1 and s.user_id = $2 and (s.not_after is null or s.not_after > now()) and p.status = 'active'`,
      [sessionId, sub],
    );
    return live.length > 0 ? { userId: sub, sessionId } : null;
  }

  async signOut(request: Request): Promise<{ setCookie: string[] }> {
    const token = cookieValue(request);
    const claims = token ? verifySignature(token, this.secret) : null;
    const sub = claims?.sub;
    const sessionId = claims?.session_id;
    if (typeof sub === 'string' && typeof sessionId === 'string' && UUID.test(sub) && UUID.test(sessionId)) {
      await ownerQuery('delete from auth.sessions where id = $1 and user_id = $2', [sessionId, sub]);
    }
    return { setCookie: [setCookie('', 0)] };
  }

  async signOutAll(session: AuthSession): Promise<{ setCookie: string[] }> {
    await ownerQuery('delete from auth.sessions where user_id = $1', [session.userId]);
    return { setCookie: [setCookie('', 0)] };
  }

  private async initSchema(): Promise<void> {
    this.ready ??= ensureLocalAuthSchema({
      query: async (sql: string) => {
        await ownerQuery(sql);
      },
    });
    return this.ready;
  }
}
