// Unit tests for the Supabase auth adapter's sign-in rules. No network, no database, no keys: both the Auth service (global
// fetch) and the database (src/server/db withDb) are mocks. The base URL and the key are obvious placeholders.
//
// Why these exist (session 18 mutation check): the smoke suite cannot sign in an archived player without writing to the real
// project, so two rules survived mutation: "a user the database refuses (PF401) must get null" and "the session that was
// just opened for that user must be ended".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const withDb = vi.fn();
vi.mock('../../src/server/db', () => ({ withDb: (...args: unknown[]) => withDb(...args) }));

import { SupabaseAuth } from '../../src/server/auth/supabase';

const BASE = 'https://project.example.test';
const KEY = 'placeholder-publishable-key';
const USER = '11111111-2222-4333-8444-555555555555';
const SESSION = '66666666-7777-4888-8999-aaaaaaaaaaaa';

// built at run time, so no token-shaped text sits in this file
const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const FAKE_TOKEN = [part({ alg: 'HS256', typ: 'JWT' }), part({ sub: USER, session_id: SESSION, role: 'authenticated' }), 'c2ln'].join('.');

interface Call {
  path: string;
  method: string;
  bearer: string | null;
  apikey: string | null;
}
let calls: Call[];

beforeEach(() => {
  calls = [];
  withDb.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const h = new Headers(init?.headers);
      calls.push({ path: u.pathname + u.search, method: init?.method ?? 'GET', bearer: h.get('authorization'), apikey: h.get('apikey') });
      if (u.pathname === '/auth/v1/token') return new Response(JSON.stringify({ access_token: FAKE_TOKEN, expires_in: 3600 }), { status: 200 });
      if (u.pathname === '/auth/v1/logout') return new Response(null, { status: 204 });
      return new Response('{}', { status: 500 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const logouts = () => calls.filter((c) => c.method === 'POST' && c.path === '/auth/v1/logout?scope=local');

describe('SupabaseAuth.signIn', () => {
  it('SMOKE-5 [unit] a user the database refuses with PF401 gets null', async () => {
    withDb.mockRejectedValue(Object.assign(new Error('UNAUTHENTICATED'), { code: 'PF401' }));
    const result = await new SupabaseAuth(BASE, KEY).signIn('archived@pintfc.test', 'whatever');
    expect(result).toBeNull();
  });

  it('SMOKE-5 [unit] the session opened for a refused user is ended with its own token, exactly once', async () => {
    withDb.mockRejectedValue(Object.assign(new Error('UNAUTHENTICATED'), { code: 'PF401' }));
    await new SupabaseAuth(BASE, KEY).signIn('archived@pintfc.test', 'whatever');
    const ended = logouts();
    expect(ended.length).toBe(1);
    expect(ended[0].bearer === `Bearer ${FAKE_TOKEN}`, 'logout carries the new session token').toBe(true);
    expect(ended[0].apikey === KEY, 'logout carries the publishable key').toBe(true);
    // the password was checked first, the database second, the logout last
    expect(calls[0].path).toBe('/auth/v1/token?grant_type=password');
    expect(calls.indexOf(ended[0])).toBe(calls.length - 1);
  });

  it('SMOKE-5 [unit] the database is asked as the signed-in user (same sub and session id as the token)', async () => {
    withDb.mockRejectedValue(Object.assign(new Error('UNAUTHENTICATED'), { code: 'PF401' }));
    await new SupabaseAuth(BASE, KEY).signIn('archived@pintfc.test', 'whatever');
    expect(withDb).toHaveBeenCalledTimes(1);
    expect(withDb.mock.calls[0][0]).toBe('authenticated');
    expect(withDb.mock.calls[0][1]).toEqual({ sub: USER, session_id: SESSION });
  });

  it('SMOKE-5 [unit] any other database error is thrown (an outage is not a wrong password) and the session is still ended', async () => {
    withDb.mockRejectedValue(Object.assign(new Error('connection lost'), { code: '08006' }));
    await expect(new SupabaseAuth(BASE, KEY).signIn('player@pintfc.test', 'whatever')).rejects.toThrow();
    expect(logouts().length).toBe(1);
  });

  it('SMOKE-5 [unit] an accepted active player gets the ids and an HttpOnly cookie, and is NOT signed out', async () => {
    withDb.mockResolvedValue([{ id: USER }]);
    const result = await new SupabaseAuth(BASE, KEY).signIn('player@pintfc.test', 'whatever');
    expect(result).not.toBeNull();
    expect(result?.userId).toBe(USER);
    expect(result?.sessionId).toBe(SESSION);
    expect(result?.setCookie.length).toBe(1);
    expect(/httponly/i.test(result?.setCookie[0] ?? ''), 'cookie is HttpOnly').toBe(true);
    expect(logouts().length, 'no logout for an accepted player').toBe(0);
  });

  it('SMOKE-5 [unit] a wrong password (Auth answers 400) is null and never reaches the database', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 400 })));
    const result = await new SupabaseAuth(BASE, KEY).signIn('player@pintfc.test', 'wrong');
    expect(result).toBeNull();
    expect(withDb).not.toHaveBeenCalled();
  });
});
