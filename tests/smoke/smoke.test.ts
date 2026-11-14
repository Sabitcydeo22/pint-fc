// Session 18 smoke suite: the REAL Supabase project (not the embedded Postgres). Run with `npm run test:smoke`.
//
// Rules this file keeps:
//  - Nothing is printed: no key, no password, no connection string, no token. Assertions compare booleans or ids.
//  - Reads (SMOKE-2, SMOKE-4) change nothing. Writes happen ONLY when the owner has said yes and set SMOKE_WRITE=yes
//    for the run: two fake auth users, two fake players (public_opt_in false, so never in the public squad), one fake
//    season / competition / venue / team / match. Everything has a fixed id, so a rerun reuses it and resets the match.
//  - Nothing is deleted. afterAll sets the smoke match to 'cancelled' (never shown as next match or result).
//  - Passwords are random per run and live in memory only; the Auth admin API sets them on every run.
import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { PUT as putRsvp } from '../../src/app/api/fixtures/[id]/rsvp/route';
import { getAuth } from '../../src/server/auth';
import { closeDb } from '../../src/server/db';
import { CORE_TABLES, PUBLIC_FUNCTIONS, PUBLIC_VIEWS } from '../db/matrix';

// ---------------------------------------------------------------------------------------------------------------
// Environment: .env.local only (names are checked, values never shown)
// ---------------------------------------------------------------------------------------------------------------
process.loadEnvFile('.env.local');
process.env.AUTH_ADAPTER = 'supabase'; // the smoke suite always tests the real adapter

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set in .env.local`);
  return v;
}
const URL_BASE = need('NEXT_PUBLIC_SUPABASE_URL').replace(/\/+$/, '');
const PUBLISHABLE = need('NEXT_PUBLIC_SUPABASE_ANON_KEY'); // the new publishable key (sb_publishable_...)
const SECRET = need('SUPABASE_SERVICE_ROLE_KEY'); // the new secret key (sb_secret_...): scripts and tests only
const DATABASE_URL = need('DATABASE_URL');

// Fixed, valid hex uuids with a smoke-only prefix (5a0c0000), so they never clash with the seed (00000001..00000008).
const sid = (n: number) => `5a0c0000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const ID = {
  playerOne: sid(0x01),
  playerTwo: sid(0x02),
  season: sid(0x11),
  competition: sid(0x12),
  venue: sid(0x13),
  team: sid(0x14),
  match: sid(0x15),
};
const EMAIL = { one: 'smoke-one@pintfc.test', two: 'smoke-two@pintfc.test' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ---------------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------------
type Json = Record<string, unknown>;

async function rest(path: string, o: { key?: string; bearer?: string; method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { apikey: o.key ?? PUBLISHABLE, ...(o.headers ?? {}) };
  if (o.bearer) headers.authorization = `Bearer ${o.bearer}`;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${URL_BASE}${path}`, { method: o.method ?? 'GET', headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}

/** Password sign-in straight against Auth (a separate session from the adapter's). Returns the access token and ids. */
async function directLogin(email: string, password: string) {
  const r = await rest('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  const b = (r.body ?? {}) as Json;
  const accessToken = typeof b.access_token === 'string' ? b.access_token : '';
  return { ok: r.ok && accessToken !== '', accessToken };
}

function claimsOf(accessToken: string): Json {
  const part = accessToken.split('.')[1] ?? '';
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Json;
}

function cookieHeader(setCookie: string[]): string {
  return setCookie.map((c) => c.split(';')[0]).join('; ');
}
const req = (method: string, path: string, cookie: string, body?: unknown) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function ownerClient<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Smoke fixtures (writes): only with SMOKE_WRITE=yes, created on first use, so a failing test never writes
// ---------------------------------------------------------------------------------------------------------------
interface Fixtures {
  passwords: { one: string; two: string };
}
let fixtures: Promise<Fixtures> | undefined;
let wroteAnything = false;

function ensureFixtures(): Promise<Fixtures> {
  if (process.env.SMOKE_WRITE !== 'yes') {
    throw new Error('This test writes fake rows to the real Supabase project. Run it only after the owner says yes, with SMOKE_WRITE=yes.');
  }
  fixtures ??= (async () => {
    wroteAnything = true;
    const passwords = { one: randomBytes(18).toString('base64url'), two: randomBytes(18).toString('base64url') };

    await ownerClient(async (c) => {
      await c.query(
        `insert into core.seasons (id, name, starts_on, ends_on, is_current) values ($1, 'Smoke season', '2026-01-01', '2026-12-31', false)
         on conflict (id) do update set name = excluded.name, is_current = false`,
        [ID.season],
      );
      await c.query(
        `insert into core.competitions (id, season_id, name, kind) values ($1, $2, 'Smoke friendly', 'friendly')
         on conflict (id) do update set name = excluded.name`,
        [ID.competition, ID.season],
      );
      await c.query(`insert into core.venues (id, name, city) values ($1, 'Smoke ground', 'Smoketown') on conflict (id) do update set name = excluded.name`, [ID.venue]);
      await c.query(
        `insert into core.teams (id, name, short_name, crest_url, is_us) values ($1, 'Smoke Test FC', 'SMK', 'https://example.test/smoke.png', false)
         on conflict (id) do update set name = excluded.name`,
        [ID.team],
      );
      // Two adult players, ACTIVE (require_player needs that) but NOT public (public_opt_in false): never in the public squad.
      for (const [id, name, shirt, email] of [
        [ID.playerOne, 'Smoke Testone', 98, EMAIL.one],
        [ID.playerTwo, 'Smoke Testtwo', 99, EMAIL.two],
      ] as const) {
        await c.query(
          `insert into core.players (id, full_name, position, shirt_number, status, email, date_of_birth, guardian_consent, public_opt_in)
           values ($1, $2, 'MID', $3, 'active', $4, '1990-01-01', false, false)
           on conflict (id) do update set status = 'active', public_opt_in = false, full_name = excluded.full_name`,
          [id, name, shirt, email],
        );
      }
      // The match is reset on every run: scheduled, 5 days ahead (RSVP open). afterAll cancels it.
      await c.query(
        `insert into core.matches (id, season_id, competition_id, opponent_id, venue_id, home_away, kickoff_at, status)
         values ($1, $2, $3, $4, $5, 'home', now() + interval '5 days', 'scheduled')
         on conflict (id) do update set kickoff_at = now() + interval '5 days', status = 'scheduled'`,
        [ID.match, ID.season, ID.competition, ID.team, ID.venue],
      );
    });

    // The Auth users: same id as the player row. Create if missing; always (re)set the password and confirm the email.
    for (const [id, email, password] of [
      [ID.playerOne, EMAIL.one, passwords.one],
      [ID.playerTwo, EMAIL.two, passwords.two],
    ] as const) {
      const existing = await rest(`/auth/v1/admin/users/${id}`, { key: SECRET });
      const r =
        existing.status === 200
          ? await rest(`/auth/v1/admin/users/${id}`, { key: SECRET, method: 'PUT', body: { password, email_confirm: true, ban_duration: 'none' } })
          : await rest('/auth/v1/admin/users', { key: SECRET, method: 'POST', body: { id, email, password, email_confirm: true } });
      expect(r.ok, `auth user ${email} created or updated`).toBe(true);
    }
    return { passwords };
  })();
  return fixtures;
}

afterAll(async () => {
  try {
    if (wroteAnything) {
      await ownerClient((c) => c.query(`update core.matches set status = 'cancelled' where id = $1`, [ID.match]));
    }
  } finally {
    await closeDb();
  }
});

// What the real REST surface is allowed to show (the access matrix is the single source of truth).
const viewPath = (v: string) => `/${v.replace('public.', '')}`;
const rpcPath = (f: string) => `/rpc/${f.replace('public.', '').replace(/\(.*$/, '')}`;
const ALLOWED_VIEWS = PUBLIC_VIEWS.map(viewPath);
const SERVICE_PATHS = ['/', ...ALLOWED_VIEWS, ...PUBLIC_FUNCTIONS.filter((f) => f.allow.includes('service_role')).map((f) => rpcPath(f.object))].sort();
const ANON_PATHS = ['/', ...ALLOWED_VIEWS, ...PUBLIC_FUNCTIONS.filter((f) => f.allow.includes('anon')).map((f) => rpcPath(f.object))].sort();

describe('smoke: the real Supabase project', () => {
  it('SMOKE-1 real sign-in and sign-out-all', async () => {
    const auth = getAuth(); // the real adapter (AUTH_ADAPTER=supabase), checked before anything is written
    const { passwords } = await ensureFixtures();

    // a wrong password and an unknown email look the same: null
    expect(await auth.signIn(EMAIL.one, `${passwords.one}x`), 'wrong password').toBeNull();
    expect(await auth.signIn('nobody@pintfc.test', passwords.one), 'unknown email').toBeNull();

    // two sessions of the same player: one through the adapter (cookie), one straight against Auth (a bearer token)
    const a = await auth.signIn(EMAIL.one, passwords.one);
    expect(a, 'adapter sign-in').not.toBeNull();
    if (!a) return;
    expect(a.userId).toBe(ID.playerOne);
    expect(UUID_RE.test(a.sessionId), 'session id is a uuid').toBe(true);
    expect(a.setCookie.length, 'a cookie is set').toBeGreaterThan(0);
    expect(a.setCookie.every((c) => /httponly/i.test(c)), 'every cookie is HttpOnly').toBe(true);
    const cookie = cookieHeader(a.setCookie);

    const direct = await directLogin(EMAIL.one, passwords.one);
    expect(direct.ok, 'direct sign-in').toBe(true);
    const claims = claimsOf(direct.accessToken);
    expect(claims.sub, 'token sub is the player').toBe(ID.playerOne);
    expect(typeof claims.session_id === 'string' && UUID_RE.test(claims.session_id), 'token carries a session_id claim').toBe(true);

    // alive: the adapter knows the session, and the database accepts the bearer token (require_player + auth.sessions)
    expect(await auth.getUser(req('GET', '/api/me', cookie))).toEqual({ userId: ID.playerOne, sessionId: a.sessionId });
    const meBefore = await rest('/rest/v1/rpc/rpc_me', { bearer: direct.accessToken, method: 'POST', body: {} });
    expect(meBefore.status, 'rpc_me with a live token').toBe(200);

    // the postgres role can read auth.sessions (core.require_player depends on it)
    const live = await ownerClient((c) => c.query('select count(*)::int as n from auth.sessions where user_id = $1', [ID.playerOne]));
    expect(live.rows[0].n, 'at least the two sessions exist').toBeGreaterThanOrEqual(2);

    // sign out of everything: both sessions end at once (the D-13 fallback: the token is still unexpired, the session is not)
    await auth.signOutAll({ userId: a.userId, sessionId: a.sessionId });
    expect(await auth.getUser(req('GET', '/api/me', cookie)), 'adapter refuses the old cookie').toBeNull();
    const meAfter = await rest('/rest/v1/rpc/rpc_me', { bearer: direct.accessToken, method: 'POST', body: {} });
    expect(meAfter.ok, 'database refuses the old token').toBe(false);
    expect((meAfter.body as Json).code, 'PF401 from core.require_player').toBe('PF401');
    const after = await ownerClient((c) => c.query('select count(*)::int as n from auth.sessions where user_id = $1', [ID.playerOne]));
    expect(after.rows[0].n, 'no session rows left').toBe(0);
  });

  it('SMOKE-2 /rest/v1/ with the anon key lists only allowed views and functions', async () => {
    // every allowed view answers for a visitor
    for (const v of ALLOWED_VIEWS) {
      const r = await rest(`/rest/v1${v}?limit=1`);
      expect(r.status, `anon GET ${v}`).toBe(200);
      expect(Array.isArray(r.body), `${v} answers with a list`).toBe(true);
    }
    // functions the matrix does not give to anon are refused for a visitor (never 200)
    for (const f of PUBLIC_FUNCTIONS.filter((x) => !x.allow.includes('anon'))) {
      const r = await rest(`/rest/v1${rpcPath(f.object)}`, { method: 'POST', body: {} });
      expect(r.ok, `anon POST ${rpcPath(f.object)} is refused`).toBe(false);
    }
    // the machine-readable list of what is exposed. With the secret key it must be exactly the matrix; with the anon
    // key it is either exactly the views (listing allowed) or refused (401/403: listing closed to visitors).
    const owner = await rest('/rest/v1/', { key: SECRET });
    expect(owner.status, 'secret-key listing').toBe(200);
    const ownerPaths = Object.keys((owner.body as { paths?: Json }).paths ?? {}).sort();
    expect(ownerPaths, 'exposed surface is exactly the matrix').toEqual(SERVICE_PATHS);
    const anon = await rest('/rest/v1/');
    if (anon.status === 200) {
      expect(Object.keys((anon.body as { paths?: Json }).paths ?? {}).sort(), 'anon listing').toEqual(ANON_PATHS);
    } else {
      expect([401, 403], 'anon listing closed').toContain(anon.status);
    }
  });

  it('SMOKE-3 RSVP round trip with a test player', async () => {
    const auth = getAuth();
    const { passwords } = await ensureFixtures();
    const a = await auth.signIn(EMAIL.two, passwords.two);
    expect(a, 'adapter sign-in').not.toBeNull();
    if (!a) return;
    const cookie = cookieHeader(a.setCookie);
    const ctx = { params: Promise.resolve({ id: ID.match }) };
    const saved = () =>
      ownerClient((c) => c.query('select answer::text as answer, reason from core.rsvps where match_id = $1 and player_id = $2', [ID.match, ID.playerTwo]));

    try {
      // through the app: the PUT route, the adapter and role `authenticated` (the real session check)
      const going = await putRsvp(req('PUT', `/api/fixtures/${ID.match}/rsvp`, cookie, { answer: 'going' }), ctx);
      expect(going.status, 'PUT going').toBe(200);
      const body = (await going.json()) as { me: { answer: string; reason: string | null }; match: { rsvp_open: boolean } };
      expect(body.me.answer).toBe('going');
      expect(body.match.rsvp_open, 'the smoke match is open').toBe(true);
      expect((await saved()).rows).toEqual([{ answer: 'going', reason: null }]);

      // change it, with a reason
      const notGoing = await putRsvp(req('PUT', `/api/fixtures/${ID.match}/rsvp`, cookie, { answer: 'not_going', reason: 'smoke test' }), ctx);
      expect(notGoing.status, 'PUT not_going').toBe(200);
      expect((await saved()).rows).toEqual([{ answer: 'not_going', reason: 'smoke test' }]);

      // through the real REST API with the player's own bearer token: same function, same rule (the session_id claim works)
      const direct = await directLogin(EMAIL.two, passwords.two);
      expect(direct.ok, 'direct sign-in').toBe(true);
      const viaRest = await rest('/rest/v1/rpc/rpc_rsvp_set', {
        bearer: direct.accessToken,
        method: 'POST',
        body: { p_match_id: ID.match, p_answer: 'maybe', p_reason: null },
      });
      expect(viaRest.status, 'rpc_rsvp_set over REST').toBe(200);
      expect((await saved()).rows).toEqual([{ answer: 'maybe', reason: null }]);

      // a visitor (no cookie) cannot write
      const visitor = await putRsvp(req('PUT', `/api/fixtures/${ID.match}/rsvp`, '', { answer: 'going' }), ctx);
      expect(visitor.status, 'visitor PUT').toBe(401);
      expect((await saved()).rows).toEqual([{ answer: 'maybe', reason: null }]);
    } finally {
      await auth.signOutAll({ userId: a.userId, sessionId: a.sessionId });
    }
  });

  it('SMOKE-4 core schema unreachable from REST', async () => {
    // precondition (so this test cannot pass on an empty project): the migrations ARE applied
    const exists = await ownerClient((c) => c.query(`select to_regclass('core.players') is not null as present`));
    expect(exists.rows[0].present, 'core.players exists (migrations applied)').toBe(true);
    const view = await rest(`/rest/v1${ALLOWED_VIEWS[0]}?limit=1`);
    expect(view.status, 'the public surface works').toBe(200);

    for (const t of CORE_TABLES) {
      // default profile (public): no such thing is exposed
      const plain = await rest(`/rest/v1/${t}?limit=1`);
      expect(plain.ok, `anon GET /${t}`).toBe(false);
      // asking for the core schema by name: refused, for a visitor AND for the all-powerful secret key
      for (const key of [PUBLISHABLE, SECRET]) {
        const r = await rest(`/rest/v1/${t}?limit=1`, { key, headers: { 'accept-profile': 'core' } });
        expect(r.ok, `GET core.${t} with ${key === SECRET ? 'secret' : 'publishable'} key`).toBe(false);
        expect(Array.isArray(r.body) && r.body.length > 0, `no rows of core.${t} came back`).toBe(false);
      }
    }
    // core functions are not callable either
    for (const key of [PUBLISHABLE, SECRET]) {
      const r = await rest('/rest/v1/rpc/require_player', { key, method: 'POST', body: {}, headers: { 'content-profile': 'core' } });
      expect(r.ok, 'core.require_player over REST').toBe(false);
    }
  });
});
