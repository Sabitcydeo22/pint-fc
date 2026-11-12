import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as signIn } from '../../src/app/api/auth/sign-in/route';
import { GET as me } from '../../src/app/api/me/route';
import { COOKIE_NAME, request, run, setupApi, tokenOf, type ApiEnv, type Login, type Who } from './helpers';
// @ts-expect-error TS7016 plain .mjs module, typed locally
import * as seedModule from '../../scripts/seed.mjs';

const { createLogins } = seedModule as unknown as {
  createLogins: (client: pg.Client, opts?: { playerIds?: string[] }) => Promise<Login[]>;
};

let env: ApiEnv;
beforeAll(async () => {
  env = await setupApi();
});
afterAll(async () => {
  await env?.close();
});

const GENERIC = { error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } };
const post = (body: Record<string, unknown>) => request('POST', '/api/auth/sign-in', { body });

describe('sign-in', () => {
  it('AC-1.1.1 valid player signs in and lands on home signed in', async () => {
    const p = env.login('one');
    const before = await env.sessionCount(p.player_id);
    const res = await run(signIn, post({ email: p.email, password: p.password }));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ player: { id: p.player_id, display_name: await env.displayName(p.player_id) } });
    expect(res.headers.get('cache-control')).toBe('no-store');

    // a session cookie is set: HttpOnly, SameSite=Lax, site-wide; the token is never in the body
    const raw = res.setCookie.find((c) => c.startsWith(`${COOKIE_NAME}=`)) ?? '';
    expect(raw).toMatch(/;\s*HttpOnly/i);
    expect(raw).toMatch(/;\s*SameSite=Lax/i);
    expect(raw).toMatch(/;\s*Path=\//i);
    const cookie = raw.split(';')[0];
    expect(cookie.length).toBeGreaterThan(COOKIE_NAME.length + 20);
    expect(JSON.stringify(res.body).includes(tokenOf(cookie))).toBe(false);
    expect(await env.sessionCount(p.player_id)).toBe(before + 1);

    // "lands on home signed in": the cookie identifies the same player
    const who = await run(me, request('GET', '/api/me', { cookie }));
    expect(who.status).toBe(200);
    expect(who.body).toEqual(res.body);

    // email matching ignores case and surrounding spaces in the stored address (one account per address)
    const upper = await run(signIn, post({ email: p.email.toUpperCase(), password: p.password }));
    expect(upper.status).toBe(200);
  });

  it('AC-1.1.3 wrong password gives one generic error and no session', async () => {
    const p = env.login('one');
    const before = await env.sessionCount(p.player_id);
    const res = await run(signIn, post({ email: p.email, password: `${p.password}x` }));
    expect(res.status).toBe(401);
    expect(res.body).toEqual(GENERIC);
    expect(res.setCookie).toEqual([]);
    expect(await env.sessionCount(p.player_id)).toBe(before);
  });

  it('AC-1.1.4 unknown and archived emails get the same error and timing class as a wrong password', async () => {
    const active = env.login('two');
    const archived = env.login('archived'); // correct password, but archived
    const outcomes = {
      'wrong password': () => post({ email: active.email, password: `${active.password}x` }),
      'unknown email': () => post({ email: 'nobody.here@pintfc.test', password: active.password }),
      'archived player (right password)': () => post({ email: archived.email, password: archived.password }),
    };
    const samples: Record<string, { status: number; body: unknown; cookies: number; ms: number }[]> = {};
    for (const [label, make] of Object.entries(outcomes)) {
      samples[label] = [];
      for (let i = 0; i < 2; i++) {
        const r = await run(signIn, make());
        samples[label].push({ status: r.status, body: r.body, cookies: r.setCookie.length, ms: r.ms });
      }
    }
    const all = Object.values(samples).flat();
    // identical answer for all three
    expect(all.map((s) => s.status)).toEqual(all.map(() => 401));
    for (const s of all) expect(s.body).toEqual(GENERIC);
    expect(all.reduce((n, s) => n + s.cookies, 0)).toBe(0);
    // same timing class: every outcome takes at least the fixed minimum and they sit close together
    const times = all.map((s) => s.ms);
    expect(Math.min(...times), 'every sign-in takes at least ~400 ms').toBeGreaterThanOrEqual(380);
    expect(Math.max(...times) - Math.min(...times), 'spread between the fastest and slowest').toBeLessThan(250);
    // the archived player really has no session either
    expect(await env.sessionCount(archived.player_id)).toBe(0);
  });

  it('T-08 sign-in errors and timing do not reveal accounts', async () => {
    const p = env.login('other');
    const attempts = [
      { email: p.email, password: 'wrong-password-1' },
      { email: 'unknown.person@pintfc.test', password: 'wrong-password-1' },
      { email: p.email.toUpperCase(), password: 'wrong-password-2' },
    ];
    for (const a of attempts) {
      const r = await run(signIn, post(a));
      expect(r.status).toBe(401);
      expect(r.body).toEqual(GENERIC);
      // nothing echoes what was typed, and nothing hints at the account
      const raw = JSON.stringify(r.body) + JSON.stringify([...r.headers.entries()]);
      expect(raw.toLowerCase().includes(a.email.toLowerCase())).toBe(false);
      expect(raw.includes(a.password)).toBe(false);
      expect(r.headers.get('set-cookie')).toBeNull();
      expect(r.headers.get('www-authenticate')).toBeNull();
      expect(r.ms).toBeGreaterThanOrEqual(380);
    }
    // even a request that fails validation takes the fixed minimum (every outcome, per api.md)
    const bad = await run(signIn, post({ email: 'not-an-email', password: 'x' }));
    expect(bad.status).toBe(400);
    expect(bad.ms).toBeGreaterThanOrEqual(380);
  });

  it('T-23 oversized or unknown fields are rejected', async () => {
    const p = env.login('one');
    const validation = { error: { code: 'VALIDATION' } };
    const cases: [string, Parameters<typeof request>[2]][] = [
      ['unknown field', { body: { email: p.email, password: p.password, admin: true } }],
      ['unknown field only', { body: { role: 'admin' } }],
      ['missing password', { body: { email: p.email } }],
      ['password over 200 chars', { body: { email: p.email, password: 'x'.repeat(201) } }],
      ['body over 8 KB', { body: JSON.stringify({ email: p.email, password: 'y'.repeat(9000) }) }],
      ['malformed JSON', { body: '{"email": ' }],
      ['JSON array', { body: [p.email, p.password] }],
      ['JSON null', { body: 'null' }],
      ['empty body', { body: '' }],
    ];
    const wrong: string[] = [];
    for (const [label, opts] of cases) {
      const r = await run(signIn, request('POST', '/api/auth/sign-in', opts));
      const code = (r.body as { error?: { code?: string } } | null)?.error?.code;
      if (r.status !== 400 || code !== validation.error.code) wrong.push(`${label}: ${r.status} ${code}`);
      if (r.setCookie.length > 0) wrong.push(`${label}: set a cookie`);
      // the message never repeats the submitted values
      if (JSON.stringify(r.body).includes(p.password)) wrong.push(`${label}: echoed the password`);
    }
    expect(wrong).toEqual([]);
  });
});

describe('logins', () => {
  it('LOGINS-2 re-running the login creation adds only the missing logins and never resets a password', async () => {
    const p = env.login('one');
    const client = new pg.Client({ connectionString: env.db.url });
    await client.connect();
    try {
      // the other 37 players get logins now; the four from setup are not touched
      const created = await createLogins(client);
      expect(created).toHaveLength(37);
      const setup = ['one', 'two', 'other', 'archived'].map((w) => env.login(w as Who).player_id);
      expect(created.filter((c) => setup.includes(c.player_id))).toEqual([]);
      expect(new Set(created.map((c) => c.password)).size, 'every password is different').toBe(37);
      expect(created.every((c) => c.password.length >= 16)).toBe(true);

      // a second run creates nothing at all
      expect(await createLogins(client)).toEqual([]);
    } finally {
      await client.end();
    }
    // the original password still works: nothing was reset
    const res = await run(signIn, post({ email: p.email, password: p.password }));
    expect(res.status).toBe(200);
  });
});
