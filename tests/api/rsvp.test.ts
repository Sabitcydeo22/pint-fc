// Session 13 API tests: PUT /api/fixtures/[id]/rsvp. Passwords stay in memory (never logged, never in a message).
// The response is { server_now, match: { id, cutoff_at, rsvp_open }, me: { answer, reason } } and `me` is always the caller.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as signIn } from '../../src/app/api/auth/sign-in/route';
import { PUT as putRsvp } from '../../src/app/api/fixtures/[id]/rsvp/route';
import { cookieOf, request, run, setupApi, type ApiEnv, type Login } from './helpers';

let env: ApiEnv;
const M_OPEN = randomUUID();
const M_SOON = randomUUID(); // kicks off in 1 h: closed
const M_CANCELLED = randomUUID();
const M_PLAYED = randomUUID();
const M_KICKED = randomUUID(); // still 'scheduled' but kicked off an hour ago: past

beforeAll(async () => {
  env = await setupApi(); // fresh database + the seed
  const ref = (await env.db.owner.run('select season_id, competition_id, opponent_id, venue_id from core.matches limit 1')).rows[0];
  const add = async (id: string, hours: number, status: string) => {
    const res = await env.db.owner.run(
      `insert into core.matches (id, season_id, competition_id, opponent_id, venue_id, home_away, kickoff_at, status)
       values ($1, $2, $3, $4, $5, 'home', now() + make_interval(secs => $6::float8 * 3600), $7)`,
      [id, ref.season_id, ref.competition_id, ref.opponent_id, ref.venue_id, hours, status],
      { commit: true },
    );
    expect(res.error, 'match fixture inserted').toBeNull();
  };
  await add(M_OPEN, 96, 'scheduled');
  await add(M_SOON, 1, 'scheduled');
  await add(M_CANCELLED, 96, 'cancelled');
  await add(M_PLAYED, -48, 'played');
  await add(M_KICKED, -1, 'scheduled');
});
afterAll(async () => {
  await env?.close();
});

async function cookieFor(login: Login): Promise<string> {
  const res = await signIn(request('POST', '/api/auth/sign-in', { body: { email: login.email, password: login.password } }));
  expect(res.status).toBe(200);
  const cookie = cookieOf(res);
  expect(cookie).not.toBeNull();
  return cookie as string;
}

const put = (cookie: string | null, matchId: string, body: unknown, extra: Record<string, unknown> = {}) =>
  run((r) => putRsvp(r, { params: Promise.resolve({ id: matchId }) }), request('PUT', `/api/fixtures/${matchId}/rsvp`, { cookie, body: body as Record<string, unknown>, ...extra }));
const rows = async (match: string) =>
  (await env.db.owner.run('select player_id, answer::text as answer, reason from core.rsvps where match_id = $1 order by player_id', [match])).rows;

interface Ok {
  server_now: string;
  match: { id: string; cutoff_at: string; rsvp_open: boolean };
  me: { answer: string | null; reason: string | null };
}

describe('PUT /api/fixtures/[id]/rsvp', () => {
  it('AC-3.3.1 [api] player saves Going, Maybe or Not going before cutoff', async () => {
    const p = env.login('one');
    const cookie = await cookieFor(p);
    for (const [answer, reason] of [['going', undefined], ['maybe', 'Fake: might be late'], ['not_going', 'Fake: away']] as const) {
      const res = await put(cookie, M_OPEN, reason === undefined ? { answer } : { answer, reason });
      expect(res.status, answer).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      const body = res.body as Ok;
      expect(Object.keys(body).sort()).toEqual(['match', 'me', 'server_now']);
      expect(Object.keys(body.match).sort()).toEqual(['cutoff_at', 'id', 'rsvp_open']);
      expect(Object.keys(body.me).sort()).toEqual(['answer', 'reason']);
      expect(body.match).toMatchObject({ id: M_OPEN, rsvp_open: true });
      expect(body.me).toEqual({ answer, reason: reason ?? null });
      expect(Number.isNaN(Date.parse(body.server_now)), 'server_now is a timestamp').toBe(false);
      expect(Date.parse(body.match.cutoff_at)).toBeGreaterThan(Date.parse(body.server_now));
    }
    expect((await rows(M_OPEN)).filter((r) => r.player_id === p.player_id)).toHaveLength(1);
  });

  it('AC-3.3.2 [api] changing an answer before cutoff replaces it', async () => {
    const p = env.login('two');
    const cookie = await cookieFor(p);
    expect((await put(cookie, M_OPEN, { answer: 'going', reason: 'Fake first' })).status).toBe(200);
    const res = await put(cookie, M_OPEN, { answer: 'not_going' });
    expect(res.status).toBe(200);
    expect((res.body as Ok).me).toEqual({ answer: 'not_going', reason: null });
    expect((await rows(M_OPEN)).filter((r) => r.player_id === p.player_id)).toEqual([{ player_id: p.player_id, answer: 'not_going', reason: null }]);
  });

  it('AC-3.3.4 [api] answers after cutoff are rejected', async () => {
    const p = env.login('one');
    const cookie = await cookieFor(p);
    const before = await rows(M_SOON);
    const res = await put(cookie, M_SOON, { answer: 'going' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'RSVP_CLOSED', message: 'RSVP is closed for this match.' } });
    expect(await rows(M_SOON)).toEqual(before);
  });

  it('AC-3.3.6 [api] cancelled or past match and answering for someone else are rejected', async () => {
    const cookie = await cookieFor(env.login('one'));
    for (const id of [M_CANCELLED, M_PLAYED, M_KICKED]) {
      const res = await put(cookie, id, { answer: 'going' });
      expect(res.status, id).toBe(409);
      expect(res.body).toEqual({ error: { code: 'MATCH_NOT_OPEN', message: 'This match is not open for RSVP.' } });
      expect(await rows(id)).toEqual([]);
    }
    const unknown = await put(cookie, randomUUID(), { answer: 'going' });
    expect(unknown.status).toBe(404);
    expect((unknown.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');
    const bad = await put(cookie, 'not-a-uuid', { answer: 'going' });
    expect(bad.status).toBe(400);
    // answering for someone else: see T-04
    const other = env.login('other');
    const withId = await put(cookie, M_OPEN, { answer: 'going', player_id: other.player_id });
    expect(withId.status).toBe(400);
    expect((await rows(M_OPEN)).filter((r) => r.player_id === other.player_id)).toEqual([]);
  });

  it('T-04 [api] cannot write an RSVP for another player', async () => {
    const one = env.login('one');
    const other = env.login('other');
    const cookie = await cookieFor(one);
    const otherBefore = (await rows(M_OPEN)).filter((r) => r.player_id === other.player_id);
    // an id in the body is a 400 (strict body) and changes nothing, not even the valid answer sent with it
    for (const key of ['player_id', 'user_id', 'playerId', 'id']) {
      const res = await put(cookie, M_OPEN, { answer: 'going', [key]: other.player_id });
      expect(res.status, key).toBe(400);
      expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION');
    }
    // an id in the query string or a header is ignored: the request is about the CALLER
    const viaQuery = await run((r) => putRsvp(r, { params: Promise.resolve({ id: M_OPEN }) }), request('PUT', `/api/fixtures/${M_OPEN}/rsvp?player_id=${other.player_id}`, {
      cookie,
      body: { answer: 'maybe', reason: 'Fake only mine' },
      headers: { 'x-player-id': other.player_id },
    }));
    expect(viaQuery.status).toBe(200);
    expect((await rows(M_OPEN)).filter((r) => r.player_id === other.player_id)).toEqual(otherBefore);
    expect((await rows(M_OPEN)).find((r) => r.player_id === one.player_id)).toEqual({ player_id: one.player_id, answer: 'maybe', reason: 'Fake only mine' });
  });

  it('RSVP-PUT-1 [api] the reason is returned only to its author', async () => {
    const one = env.login('one');
    const other = env.login('other');
    const CANARY = 'Fake canary reason qq77';
    expect((await put(await cookieFor(one), M_OPEN, { answer: 'not_going', reason: CANARY })).status).toBe(200);
    const res = await put(await cookieFor(other), M_OPEN, { answer: 'going' });
    expect(res.status).toBe(200);
    expect((res.body as Ok).me).toEqual({ answer: 'going', reason: null });
    expect(JSON.stringify(res.body).includes(CANARY), 'another player\'s reason is not in the response').toBe(false);
    // and it is the author's own when they change it again
    const mine = await put(await cookieFor(one), M_OPEN, { answer: 'not_going', reason: CANARY });
    expect((mine.body as Ok).me.reason).toBe(CANARY);
  });

  it('RSVP-PUT-2 [api] without a session, or with a bad one, the answer is 401 and nothing is written', async () => {
    const before = await rows(M_OPEN);
    const unauth = { error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } };
    const a = await put(null, M_OPEN, { answer: 'going' });
    expect(a.status).toBe(401);
    expect(a.body).toEqual(unauth);
    expect((await put('pf_session=not-a-token', M_OPEN, { answer: 'going' })).status).toBe(401);
    expect(await rows(M_OPEN)).toEqual(before);
  });

  it('RSVP-PUT-3 [api] invalid bodies are 400 VALIDATION and change nothing', async () => {
    const cookie = await cookieFor(env.login('two'));
    const before = await rows(M_OPEN);
    const bad: unknown[] = [{}, { answer: 'yes' }, { answer: 1 }, { answer: null }, { answer: 'going', reason: 5 }, { answer: 'going', reason: 'x'.repeat(141) }, [], 'x', null, { answer: 'going', extra: 1 }];
    for (const body of bad) {
      const res = await put(cookie, M_OPEN, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION');
    }
    expect((await put(cookie, M_OPEN, { answer: 'going', reason: 'x'.repeat(140) })).status, 'exactly 140 is fine').toBe(200);
    const cross = await put(cookie, M_OPEN, { answer: 'going' }, { origin: 'http://evil.test' });
    expect(cross.status).toBe(403);
    const wrongType = await run((r) => putRsvp(r, { params: Promise.resolve({ id: M_OPEN }) }), request('PUT', `/api/fixtures/${M_OPEN}/rsvp`, { cookie, body: '{"answer":"going"}', contentType: 'text/plain' }));
    expect(wrongType.status).toBe(400);
    expect((await rows(M_OPEN)).filter((r) => r.player_id === env.login('two').player_id)[0]).toMatchObject({ answer: 'going', reason: 'x'.repeat(140) });
    void before;
  });
});
