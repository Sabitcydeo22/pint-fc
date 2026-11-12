// Shared helpers for the API tests. Passwords come from the seed's login creation and live only in
// memory: they are never logged, and assertions on them use booleans so a failure cannot print one.
import crypto from 'node:crypto';
import pg from 'pg';
import { expect } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
// @ts-expect-error TS7016 plain .mjs module, typed locally
import * as seedModule from '../../scripts/seed.mjs';

export const ORIGIN = 'http://localhost';
export const COOKIE_NAME = 'pf_session';

export interface Login {
  player_id: string;
  email: string;
  password: string;
}
interface SeedModule {
  seed: (client: pg.Client, opts?: { now?: Date; demoCutoffInMs?: number }) => Promise<unknown>;
  createLogins: (client: pg.Client, opts?: { playerIds?: string[] }) => Promise<Login[]>;
}
const { seed, createLogins } = seedModule as unknown as SeedModule;

export const playerId = (n: number) => `00000001-0000-4000-8000-${String(n).padStart(12, '0')}`;

export type Who = 'one' | 'two' | 'other' | 'archived';
const WHO: Record<Who, number> = { one: 1, two: 2, other: 3, archived: 41 };

export interface ApiEnv {
  db: TestDb;
  login: (who: Who) => Login;
  displayName: (id: string) => Promise<string>;
  sessionCount: (userId: string) => Promise<number>;
  secret: string;
  close: () => Promise<void>;
}

/** A fresh seeded database, with logins for players 1, 2, 3 and the archived player 41, and the env the server code reads. */
export async function setupApi(): Promise<ApiEnv> {
  const db = await createTestDb();
  const secret = crypto.randomBytes(32).toString('hex');
  process.env.DATABASE_URL = db.url;
  process.env.AUTH_ADAPTER = 'local';
  process.env.LOCAL_AUTH_SECRET = secret;
  delete process.env.VERCEL_ENV;

  const client = new pg.Client({ connectionString: db.url });
  await client.connect();
  let logins: Login[] = [];
  try {
    await seed(client);
    logins = await createLogins(client, { playerIds: Object.values(WHO).map(playerId) });
  } finally {
    await client.end();
  }
  expect(logins.map((l) => l.player_id).sort(), 'logins created for the four test players').toEqual(
    Object.values(WHO).map(playerId).sort(),
  );

  return {
    db,
    secret,
    login: (who) => {
      const l = logins.find((x) => x.player_id === playerId(WHO[who]));
      if (!l) throw new Error(`no login for ${who}`);
      return l;
    },
    displayName: async (id) => String((await db.owner.run('select full_name from core.players where id = $1', [id])).rows[0].full_name),
    sessionCount: async (userId) => Number((await db.owner.run('select count(*)::int as n from auth.sessions where user_id = $1', [userId])).rows[0].n),
    close: async () => {
      const dbModule = await import('../../src/server/db');
      await dbModule.closeDb();
      await db.close();
    },
  };
}

type Body = string | Record<string, unknown> | unknown[] | null;
export interface ReqOptions {
  body?: Body;
  cookie?: string | null;
  origin?: string | null;
  headers?: Record<string, string>;
  /** Default 'application/json' when there is a body. Pass null to send no content-type. */
  contentType?: string | null;
}

export function request(method: string, path: string, o: ReqOptions = {}): Request {
  const headers: Record<string, string> = { ...(o.headers ?? {}) };
  const origin = o.origin === undefined ? ORIGIN : o.origin;
  if (origin) headers.origin = origin;
  if (o.cookie) headers.cookie = o.cookie;
  let body: string | undefined;
  if (o.body !== undefined && o.body !== null) {
    body = typeof o.body === 'string' ? o.body : JSON.stringify(o.body);
    const ct = o.contentType === undefined ? 'application/json' : o.contentType;
    if (ct) headers['content-type'] = ct;
  }
  return new Request(`${ORIGIN}${path}`, { method, headers, body });
}

/** "pf_session=<token>" from a response, or null if the response sets no session cookie. */
export function cookieOf(res: Response): string | null {
  const c = res.headers.getSetCookie().find((h) => h.startsWith(`${COOKIE_NAME}=`));
  return c ? c.split(';')[0] : null;
}

export const tokenOf = (cookie: string) => cookie.slice(COOKIE_NAME.length + 1);

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** A token signed the way LocalAuth signs them (test-only), for crafting expired / forged cases. */
export function signToken(claims: Record<string, unknown>, secret: string, alg = 'HS256'): string {
  const head = b64({ alg, typ: 'JWT' });
  const payload = b64(claims);
  const sig = alg === 'none' ? '' : crypto.createHmac('sha256', secret).update(`${head}.${payload}`).digest('base64url');
  return `${head}.${payload}.${sig}`;
}

export interface Outcome {
  status: number;
  body: unknown;
  setCookie: string[];
  ms: number;
  headers: Headers;
}

/** Calls a route handler and records status, parsed body (request_id removed), cookies and how long it took. */
export async function run(handler: (r: Request) => Promise<Response>, req: Request): Promise<Outcome> {
  const t0 = performance.now();
  const res = await handler(req);
  const ms = performance.now() - t0;
  const text = await res.text();
  let body: unknown = text === '' ? null : text;
  try {
    body = text === '' ? null : JSON.parse(text);
  } catch {
    /* keep raw text */
  }
  if (body && typeof body === 'object' && 'error' in body) {
    const e = { ...(body as { error: Record<string, unknown> }).error };
    expect(typeof e.request_id, 'every error carries a request_id').toBe('string');
    expect(e.request_id).toBe(res.headers.get('x-request-id'));
    delete e.request_id;
    body = { error: e };
  }
  return { status: res.status, body, setCookie: res.headers.getSetCookie(), ms, headers: res.headers };
}
