// Session 11 API tests: GET / PUT /api/me/settings. Passwords stay in memory (never logged, never in a message).
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as signIn } from '../../src/app/api/auth/sign-in/route';
import { GET as getSettings, PUT as putSettings } from '../../src/app/api/me/settings/route';
import { GET as getPlayer } from '../../src/app/api/players/[id]/route';
import { GET as getSquad } from '../../src/app/api/squad/route';
import { assertNoPii } from '../../src/lib/privacy';
import { cookieOf, playerId, request, run, setupApi, type ApiEnv, type Login } from './helpers';
// @ts-expect-error TS7016 plain .mjs module, typed locally
import * as seedModule from '../../scripts/seed.mjs';

const { createLogins } = seedModule as unknown as {
  createLogins: (client: pg.Client, opts?: { playerIds?: string[] }) => Promise<Login[]>;
};

let env: ApiEnv;
let minorWith: Login; // player 21: minor, guardian consent, opted in
let minorWithout: Login; // player 34: minor, no guardian consent, hidden

beforeAll(async () => {
  env = await setupApi(); // fresh database + the seed: 41 players
  const client = new pg.Client({ connectionString: env.db.url });
  await client.connect();
  try {
    const created = await createLogins(client, { playerIds: [playerId(21), playerId(34)] });
    const find = (n: number) => {
      const l = created.find((x) => x.player_id === playerId(n));
      if (!l) throw new Error(`no login for player ${n}`);
      return l;
    };
    minorWith = find(21);
    minorWithout = find(34);
  } finally {
    await client.end();
  }
});
afterAll(async () => {
  await env?.close();
});

/** Signs in through the real route and returns the cookie pair. */
async function cookieFor(login: Login): Promise<string> {
  const res = await signIn(request('POST', '/api/auth/sign-in', { body: { email: login.email, password: login.password } }));
  expect(res.status).toBe(200);
  const cookie = cookieOf(res);
  expect(cookie).not.toBeNull();
  return cookie as string;
}

const get = (cookie: string | null) => run(getSettings, request('GET', '/api/me/settings', { cookie }));
const put = (cookie: string | null, body: unknown) => run(putSettings, request('PUT', '/api/me/settings', { cookie, body: body as Record<string, unknown> }));
const squadIds = async () => ((await run(getSquad, request('GET', '/api/squad'))).body as { players: { id: string }[] }).players.map((p) => p.id);
const profile = (id: string) => run((r) => getPlayer(r, { params: Promise.resolve({ id }) }), request('GET', `/api/players/${id}`));
const rowOf = async (id: string) =>
  (await env.db.owner.run('select full_name, status, shirt_number, guardian_consent, public_opt_in, show_photo, show_nationality, show_stats from core.players where id = $1', [id])).rows[0];

const SETTINGS_KEYS = ['email', 'guardian_consent', 'is_minor', 'public_opt_in', 'show_nationality', 'show_photo', 'show_stats'];

describe('GET /api/me/settings', () => {
  it('SETTINGS-GET-1 [api] returns the caller\'s own settings DTO with their own email', async () => {
    const p = env.login('one');
    const res = await get(await cookieFor(p));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const settings = (res.body as { settings: Record<string, unknown> }).settings;
    expect(Object.keys(settings).sort()).toEqual(SETTINGS_KEYS);
    expect(settings.email === p.email, 'it is the caller\'s own email').toBe(true);
    expect(settings).toMatchObject({ is_minor: false, guardian_consent: expect.any(Boolean) });
    for (const k of ['public_opt_in', 'show_photo', 'show_nationality', 'show_stats']) expect(typeof settings[k], k).toBe('boolean');
  });

  it('AC-1.6.3 [api] without a session (or with a bad one) both verbs answer 401 in the standard format', async () => {
    const unauth = { error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } };
    const a = await get(null);
    expect(a.status).toBe(401);
    expect(a.body).toEqual(unauth);
    const b = await put(null, { show_photo: true });
    expect(b.status).toBe(401);
    expect(b.body).toEqual(unauth);
    expect((await get('pf_session=not-a-token')).status).toBe(401);
  });
});

describe('PUT /api/me/settings', () => {
  it('AC-4.3.2 [api] changing a consent is saved and reflected publicly on next request', async () => {
    const p = env.login('two');
    const cookie = await cookieFor(p);
    const id = p.player_id;
    const first = await get(cookie);
    expect(first.status).toBe(200);
    const before = (first.body as { settings: Record<string, boolean> }).settings;

    // 1. a photo/nationality/stats flip shows up in the public profile (no cache between the two requests)
    const want = { show_nationality: !before.show_nationality, show_stats: !before.show_stats };
    const res = await put(cookie, want);
    expect(res.status).toBe(200);
    expect((res.body as { settings: Record<string, unknown> }).settings).toMatchObject(want);
    expect(Object.keys((res.body as { settings: object }).settings).sort()).toEqual(SETTINGS_KEYS);
    expect((await get(cookie)).body).toEqual(res.body);
    const pub = ((await profile(id)).body as { player: Record<string, unknown> }).player;
    expect('stats' in pub, 'stats key follows the flag').toBe(want.show_stats);
    const hasNationality = (await env.db.owner.run('select nationality from core.players where id = $1', [id])).rows[0].nationality !== null;
    expect('nationality' in pub, 'nationality key follows the flag (when there is data)').toBe(want.show_nationality && hasNationality);
    assertNoPii(await profile(id).then((o) => o.body));

    // 2. an adult switching public off disappears from the squad and the profile is a 404; switching on brings them back
    expect(await squadIds()).toContain(id);
    expect((await put(cookie, { public_opt_in: false })).status).toBe(200);
    expect(await squadIds()).not.toContain(id);
    expect((await profile(id)).status).toBe(404);
    expect((await put(cookie, { public_opt_in: true })).status).toBe(200);
    expect(await squadIds()).toContain(id);
    expect((await profile(id)).status).toBe(200);

    // put the two flags back as they were
    expect((await put(cookie, { show_nationality: before.show_nationality, show_stats: before.show_stats })).status).toBe(200);
  });

  it('AC-4.3.3 [api] minor without guardian consent cannot opt in', async () => {
    const cookie = await cookieFor(minorWithout);
    const id = minorWithout.player_id;
    const got = await get(cookie);
    expect(got.status).toBe(200);
    const g = (got.body as { settings: Record<string, unknown> }).settings;
    expect(g).toMatchObject({ is_minor: true, guardian_consent: false, public_opt_in: false });

    const res = await put(cookie, { public_opt_in: true });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: { code: 'MINOR_NEEDS_GUARDIAN', message: 'Guardian consent is needed before this profile can be public.' } });
    expect((await rowOf(id)).public_opt_in).toBe(false);
    expect(await squadIds()).not.toContain(id);
    expect((await profile(id)).status).toBe(404);
    // the whole request is rejected: a flag sent along with the rejected one is not saved
    expect((await put(cookie, { public_opt_in: true, show_photo: true })).status).toBe(422);
    expect((await rowOf(id)).show_photo).toBe(false);
  });

  it('AC-4.3.3 [api] a minor WITH guardian consent can opt out and back in', async () => {
    const cookie = await cookieFor(minorWith);
    const id = minorWith.player_id;
    expect(await squadIds()).toContain(id);
    expect((await put(cookie, { public_opt_in: false })).status).toBe(200);
    expect(await squadIds()).not.toContain(id);
    expect((await put(cookie, { public_opt_in: true })).status).toBe(200);
    expect(await squadIds()).toContain(id);
  });

  it('AC-4.3.4 [api] player cannot change another player\'s settings', async () => {
    const one = env.login('one');
    const other = env.login('other');
    const cookie = await cookieFor(one);
    const otherBefore = await rowOf(other.player_id);

    // an id in the body, in the query string, or in a header is not a way in: the body is strict, the route ignores the rest
    const withId = await put(cookie, { player_id: other.player_id, show_photo: !(otherBefore.show_photo as boolean) });
    expect(withId.status).toBe(400);
    expect((withId.body as { error: { code: string } }).error.code).toBe('VALIDATION');
    const viaQuery = await run(putSettings, request('PUT', `/api/me/settings?player_id=${other.player_id}&id=${other.player_id}`, {
      cookie,
      body: { show_photo: !(otherBefore.show_photo as boolean) },
      headers: { 'x-player-id': other.player_id },
    }));
    expect(viaQuery.status).toBe(200); // it is a valid request about the CALLER
    expect(await rowOf(other.player_id)).toEqual(otherBefore);
    expect((await rowOf(one.player_id)).show_photo).toBe(!(otherBefore.show_photo as boolean));

    // the response and the GET are about the caller, never the other player
    const mine = ((await get(cookie)).body as { settings: Record<string, unknown> }).settings;
    expect(mine.email === one.email).toBe(true);
    expect(mine.email === other.email).toBe(false);

    // nobody can reach the other row via the other route verbs either
    const del = await run(async (r) => {
      const mod = (await import('../../src/app/api/me/settings/route')) as Record<string, unknown>;
      const h = mod.DELETE as ((r: Request) => Promise<Response>) | undefined;
      return h ? h(r) : new Response(null, { status: 405 });
    }, request('DELETE', '/api/me/settings', { cookie }));
    expect(del.status).toBe(405);
  });

  it('T-06 [api] player cannot change status, guardian consent or number', async () => {
    const cookie = await cookieFor(minorWithout);
    const id = minorWithout.player_id;
    const before = await rowOf(id);
    for (const extra of [{ status: 'archived' }, { guardian_consent: true }, { shirt_number: 99 }, { full_name: 'Fake Renamed' }, { email: 'fake.other@pintfc.test' }, { date_of_birth: '1990-01-01' }]) {
      const res = await put(cookie, { show_stats: true, ...extra });
      expect(res.status, JSON.stringify(extra)).toBe(400);
      expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION');
    }
    expect(await rowOf(id)).toEqual(before); // not even the valid flag that travelled with them was saved
    // a guardian_consent sent alone (the exact attack on AC-4.3.3) changes nothing, and the minor stays hidden
    expect((await put(cookie, { guardian_consent: true })).status).toBe(400);
    expect((await put(cookie, { public_opt_in: true })).status).toBe(422);
    expect(await rowOf(id)).toEqual(before);
    // the settings the API sends back never include a shirt number or a status
    const keys = Object.keys(((await get(cookie)).body as { settings: object }).settings);
    for (const k of ['status', 'shirt_number', 'full_name', 'date_of_birth']) expect(keys).not.toContain(k);
  });

  it('SETTINGS-PUT-1 [api] invalid bodies are 400 VALIDATION and change nothing', async () => {
    const cookie = await cookieFor(env.login('one'));
    const before = await rowOf(env.login('one').player_id);
    const bad: unknown[] = [{}, { show_photo: 'yes' }, { show_photo: 1 }, { public_opt_in: null }, [], 'x', null, { show_photo: true, extra: 1 }];
    for (const body of bad) {
      const res = await put(cookie, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION');
    }
    // not JSON, and not declared as JSON
    const notJson = await run(putSettings, request('PUT', '/api/me/settings', { cookie, body: '{oops', contentType: 'application/json' }));
    expect(notJson.status).toBe(400);
    const wrongType = await run(putSettings, request('PUT', '/api/me/settings', { cookie, body: '{"show_photo":true}', contentType: 'text/plain' }));
    expect(wrongType.status).toBe(400);
    // a cross-site request is refused before anything runs
    const cross = await run(putSettings, request('PUT', '/api/me/settings', { cookie, body: { show_photo: true }, origin: 'http://evil.test' }));
    expect(cross.status).toBe(403);
    expect(await rowOf(env.login('one').player_id)).toEqual(before);
  });
});
