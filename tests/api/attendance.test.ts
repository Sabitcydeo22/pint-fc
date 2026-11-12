// Session 14 API tests: GET /api/fixtures/[id]/attendance. Passwords stay in memory (never logged, never in a message).
// Body: { server_now, match, counts, attendees: [{ player_id, name, answer }], me: { answer, reason } }.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as signIn } from '../../src/app/api/auth/sign-in/route';
import { GET as getAttendance } from '../../src/app/api/fixtures/[id]/attendance/route';
import { PUT as putRsvp } from '../../src/app/api/fixtures/[id]/rsvp/route';
import { cookieOf, request, run, setupApi, type ApiEnv, type Login } from './helpers';

let env: ApiEnv;
const M_OPEN = randomUUID();
const M_SOON = randomUUID(); // kicks off in 1 h: closed
const M_CANCELLED = randomUUID();

beforeAll(async () => {
  env = await setupApi(); // fresh database + the seed (40 active players, no RSVPs)
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

const get = (cookie: string | null, matchId: string) =>
  run((r) => getAttendance(r, { params: Promise.resolve({ id: matchId }) }), request('GET', `/api/fixtures/${matchId}/attendance`, { cookie }));
const put = (cookie: string, matchId: string, body: Record<string, unknown>) =>
  run((r) => putRsvp(r, { params: Promise.resolve({ id: matchId }) }), request('PUT', `/api/fixtures/${matchId}/rsvp`, { cookie, body }));

interface Body {
  server_now: string;
  match: { id: string; opponent: string; competition: string; venue: string; kickoff_at: string; cutoff_at: string; status: string; rsvp_open: boolean };
  counts: { going: number; maybe: number; not_going: number; no_answer: number };
  attendees: { player_id: string; name: string; answer: string }[];
  me: { answer: string | null; reason: string | null };
}

describe('GET /api/fixtures/[id]/attendance', () => {
  it('AC-3.3.1 [api] player saves Going, Maybe or Not going before cutoff', async () => {
    const p = env.login('one');
    const cookie = await cookieFor(p);
    for (const [answer, reason] of [['going', null], ['maybe', 'Fake: might be late'], ['not_going', 'Fake: away']] as const) {
      const saved = await put(cookie, M_OPEN, reason === null ? { answer } : { answer, reason });
      expect(saved.status, answer).toBe(200);
      const res = await get(cookie, M_OPEN);
      expect(res.status, answer).toBe(200);
      expect((res.body as Body).me, 'the saved answer comes back to its author').toEqual({ answer, reason });
      expect((res.body as Body).counts[answer]).toBeGreaterThanOrEqual(1);
    }
  });

  it('AC-3.4.1 [api] event page shows counts and attendance list to signed-in players', async () => {
    const one = env.login('one');
    const two = env.login('two');
    const other = env.login('other');
    const cOne = await cookieFor(one);
    const cTwo = await cookieFor(two);
    const cOther = await cookieFor(other);
    expect((await put(cOne, M_OPEN, { answer: 'going' })).status).toBe(200);
    expect((await put(cTwo, M_OPEN, { answer: 'maybe' })).status).toBe(200);
    expect((await put(cOther, M_OPEN, { answer: 'not_going' })).status).toBe(200);

    const res = await get(cTwo, M_OPEN);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = res.body as Body;
    expect(Object.keys(body).sort()).toEqual(['attendees', 'counts', 'match', 'me', 'server_now']);
    expect(Object.keys(body.match).sort()).toEqual(['competition', 'cutoff_at', 'id', 'kickoff_at', 'opponent', 'rsvp_open', 'status', 'venue']);
    expect(Object.keys(body.counts).sort()).toEqual(['going', 'maybe', 'no_answer', 'not_going']);
    expect(body.match).toMatchObject({ id: M_OPEN, status: 'scheduled', rsvp_open: true });
    expect(body.match.opponent).toMatch(/\S/);
    expect(Number.isNaN(Date.parse(body.server_now)), 'server_now is a timestamp').toBe(false);
    expect(Date.parse(body.match.cutoff_at)).toBe(Date.parse(body.match.kickoff_at) - 2 * 3_600_000);
    // the seed has 40 active players; three answered, so 37 have not
    expect(body.counts).toEqual({ going: 1, maybe: 1, not_going: 1, no_answer: 37 });
    expect(body.attendees).toEqual([
      { player_id: one.player_id, name: await env.displayName(one.player_id), answer: 'going' },
      { player_id: two.player_id, name: await env.displayName(two.player_id), answer: 'maybe' },
      { player_id: other.player_id, name: await env.displayName(other.player_id), answer: 'not_going' },
    ]);
    expect(body.me).toEqual({ answer: 'maybe', reason: null });

    // closed and cancelled matches can be read; they say they are not open
    const soon = await get(cTwo, M_SOON);
    expect(soon.status).toBe(200);
    expect((soon.body as Body).match).toMatchObject({ status: 'scheduled', rsvp_open: false });
    const cancelled = await get(cTwo, M_CANCELLED);
    expect((cancelled.body as Body).match).toMatchObject({ status: 'cancelled', rsvp_open: false });
  });

  it("AC-3.4.3 [api] teammates' answers are visible without reasons", async () => {
    const one = env.login('one');
    const other = env.login('other');
    expect((await put(await cookieFor(other), M_OPEN, { answer: 'not_going', reason: 'Fake visible-to-nobody reason' })).status).toBe(200);
    const res = await get(await cookieFor(one), M_OPEN);
    expect(res.status).toBe(200);
    const body = res.body as Body;
    expect(body.attendees.find((a) => a.player_id === other.player_id)).toEqual({ player_id: other.player_id, name: await env.displayName(other.player_id), answer: 'not_going' });
    for (const a of body.attendees) expect(Object.keys(a).sort()).toEqual(['answer', 'name', 'player_id']);
  });

  it("T-05 [api] other players' reasons are never returned", async () => {
    const one = env.login('one');
    const two = env.login('two');
    const CANARY_ONE = 'Fake canary reason one qq81';
    const CANARY_TWO = 'Fake canary reason two qq82';
    expect((await put(await cookieFor(one), M_OPEN, { answer: 'maybe', reason: CANARY_ONE })).status).toBe(200);
    expect((await put(await cookieFor(two), M_OPEN, { answer: 'going', reason: CANARY_TWO })).status).toBe(200);
    const forOne = await get(await cookieFor(one), M_OPEN);
    expect(forOne.status).toBe(200);
    expect((forOne.body as Body).me.reason).toBe(CANARY_ONE);
    expect(JSON.stringify(forOne.body).includes(CANARY_TWO), "another player's reason is in the body").toBe(false);
    const forTwo = await get(await cookieFor(two), M_OPEN);
    expect(forTwo.status).toBe(200);
    expect((forTwo.body as Body).me.reason).toBe(CANARY_TWO);
    expect(JSON.stringify(forTwo.body).includes(CANARY_ONE), "another player's reason is in the body").toBe(false);
  });

  it('ATT-API-1 [api] a visitor, a bad session, an unknown or malformed match', async () => {
    const unauth = { error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } };
    const visitor = await get(null, M_OPEN);
    expect(visitor.status).toBe(401);
    expect(visitor.body).toEqual(unauth);
    expect((await get('pf_session=not-a-token', M_OPEN)).status).toBe(401);
    const cookie = await cookieFor(env.login('one'));
    const unknown = await get(cookie, randomUUID());
    expect(unknown.status).toBe(404);
    expect((unknown.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');
    expect((await get(cookie, 'not-a-uuid')).status).toBe(400);
    // an archived player is not a player any more
    const archived = env.login('archived');
    const res = await signIn(request('POST', '/api/auth/sign-in', { body: { email: archived.email, password: archived.password } }));
    expect(res.status, 'an archived player cannot sign in, so cannot read attendance').not.toBe(200);
  });
});
