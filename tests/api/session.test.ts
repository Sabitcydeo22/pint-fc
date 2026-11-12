import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as signIn } from '../../src/app/api/auth/sign-in/route';
import { POST as signOut } from '../../src/app/api/auth/sign-out/route';
import { POST as signOutAll } from '../../src/app/api/auth/sign-out-all/route';
import { GET as me } from '../../src/app/api/me/route';
import { COOKIE_NAME, cookieOf, request, run, setupApi, signToken, tokenOf, type ApiEnv, type Who } from './helpers';

let env: ApiEnv;
beforeAll(async () => {
  env = await setupApi();
});
afterAll(async () => {
  await env?.close();
});

const UNAUTH = { error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } };

/** Signs a seeded player in and returns the cookie pair ("pf_session=..."). One call = one session = one "device". */
async function device(who: Who): Promise<string> {
  const p = env.login(who);
  const res = await signIn(request('POST', '/api/auth/sign-in', { body: { email: p.email, password: p.password } }));
  expect(res.status).toBe(200);
  const cookie = cookieOf(res);
  expect(cookie).not.toBeNull();
  return cookie as string;
}
const whoAmI = (cookie: string | null) => run(me, request('GET', '/api/me', { cookie }));

describe('sessions', () => {
  it('AC-1.6.1 sign out clears this session and player endpoints return 401', async () => {
    const p = env.login('one');
    const cookie = await device('one');
    const before = await env.sessionCount(p.player_id);
    expect((await whoAmI(cookie)).status).toBe(200);

    const out = await run(signOut, request('POST', '/api/auth/sign-out', { cookie }));
    expect(out.status).toBe(204);
    expect(out.body).toBeNull();
    // the cookie is cleared on the browser, and the session row is gone on the server
    const cleared = out.setCookie.find((c) => c.startsWith(`${COOKIE_NAME}=`)) ?? '';
    expect(cleared).toMatch(new RegExp(`^${COOKIE_NAME}=;`));
    expect(cleared).toMatch(/Max-Age=0/i);
    expect(cleared).toMatch(/HttpOnly/i);
    expect(await env.sessionCount(p.player_id)).toBe(before - 1);

    // replaying the OLD cookie (a copy somebody kept) no longer works
    const replay = await whoAmI(cookie);
    expect(replay.status).toBe(401);
    expect(replay.body).toEqual(UNAUTH);

    // idempotent: signing out again, or with no cookie at all, is still 204
    expect((await run(signOut, request('POST', '/api/auth/sign-out', { cookie }))).status).toBe(204);
    expect((await run(signOut, request('POST', '/api/auth/sign-out'))).status).toBe(204);
  });

  it('AC-1.6.2 sign out of all devices rejects both sessions', async () => {
    const phone = await device('two');
    const laptop = await device('two');
    const someoneElse = await device('other');
    expect(phone).not.toBe(laptop);
    expect((await whoAmI(phone)).status).toBe(200);
    expect((await whoAmI(laptop)).status).toBe(200);

    const out = await run(signOutAll, request('POST', '/api/auth/sign-out-all', { cookie: phone }));
    expect(out.status).toBe(204);
    expect(out.setCookie.find((c) => c.startsWith(`${COOKIE_NAME}=`)) ?? '').toMatch(/Max-Age=0/i);

    expect((await whoAmI(phone)).body).toEqual(UNAUTH);
    expect((await whoAmI(laptop)).body).toEqual(UNAUTH);
    expect((await whoAmI(phone)).status).toBe(401);
    expect((await whoAmI(laptop)).status).toBe(401);
    expect(await env.sessionCount(env.login('two').player_id)).toBe(0);
    // another player's session is untouched
    expect((await whoAmI(someoneElse)).status).toBe(200);
  });

  it('AC-1.6.3 player-only endpoints return 401 without a session', async () => {
    const good = await device('one');
    const goodToken = tokenOf(good);
    const p = env.login('one');
    const claims = { sub: p.player_id, role: 'authenticated', session_id: '00000000-0000-4000-8000-0000000000aa' };
    const now = Math.floor(Date.now() / 1000);
    const tampered = `${goodToken.slice(0, -3)}${goodToken.endsWith('abc') ? 'xyz' : 'abc'}`;

    const noSession: [string, string | null][] = [
      ['no cookie', null],
      ['empty cookie', `${COOKIE_NAME}=`],
      ['garbage cookie', `${COOKIE_NAME}=not-a-token`],
      ['tampered signature', `${COOKIE_NAME}=${tampered}`],
      ['unsigned token (alg none)', `${COOKIE_NAME}=${signToken({ ...claims, exp: now + 3600 }, env.secret, 'none')}`],
      ['signed with another secret', `${COOKIE_NAME}=${signToken({ ...claims, exp: now + 3600 }, 'a-different-secret-entirely-1234567890')}`],
      ['expired token', `${COOKIE_NAME}=${signToken({ ...claims, exp: now - 60 }, env.secret)}`],
      ['valid signature, session that does not exist', `${COOKIE_NAME}=${signToken({ ...claims, exp: now + 3600 }, env.secret)}`],
    ];
    const wrong: string[] = [];
    for (const [label, cookie] of noSession) {
      const r = await run(me, request('GET', '/api/me', { cookie }));
      if (r.status !== 401 || JSON.stringify(r.body) !== JSON.stringify(UNAUTH)) wrong.push(`${label}: ${r.status}`);
      if (r.setCookie.length > 0) wrong.push(`${label}: set a cookie`);
    }
    expect(wrong).toEqual([]);

    // sign-out-all needs a session too
    const anon = await run(signOutAll, request('POST', '/api/auth/sign-out-all'));
    expect(anon.status).toBe(401);
    expect(anon.body).toEqual(UNAUTH);
    // and the good session still works (nothing above touched it)
    expect((await whoAmI(good)).status).toBe(200);
  });

  it('T-07 revoked session token is rejected by API and database', async () => {
    // api half: a token with a perfect signature stops working as soon as its session row is revoked in the database
    const p = env.login('other');
    const cookie = await device('other');
    expect((await whoAmI(cookie)).status).toBe(200);
    const revoke = await env.db.owner.run('delete from auth.sessions where user_id = $1', [p.player_id], { commit: true });
    expect(revoke.error).toBeNull();
    const after = await whoAmI(cookie);
    expect(after.status).toBe(401);
    expect(after.body).toEqual(UNAUTH);
    // (the database half, require_player() refusing the same claims, is in tests/db/session.test.ts)
  });
});
