// Session 13 database tests: the RSVP write path, public.rpc_rsvp_set(match_id, answer, reason). Fake data only.
// The caller is always the session's player: the function has no player argument (T-04).
// Frozen clock: now() in Postgres is the START of the transaction and does not move inside it. The boundary tests
// therefore create the match INSIDE the transaction that calls the function, with a kickoff given relative to that
// same now(), so "exactly at the cutoff" and "one microsecond before it" are exact and not a race.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';

let db: TestDb;
afterAll(async () => {
  await db?.close();
});

const A = '80000000-0000-4000-8000-000000000001';
const B = '80000000-0000-4000-8000-000000000002';
const SES_A = '81000000-0000-4000-8000-000000000001';
const SES_B = '81000000-0000-4000-8000-000000000002';
const SEASON = '82000000-0000-4000-8000-000000000001';
const LEAGUE = '82000000-0000-4000-8000-000000000002';
const VENUE = '82000000-0000-4000-8000-000000000003';
const OPP = '82000000-0000-4000-8000-000000000004';
const M_OPEN = '83000000-0000-4000-8000-000000000001'; // kicks off in 72 h
const M_SOON = '83000000-0000-4000-8000-000000000002'; // kicks off in 1 h: the cutoff passed an hour ago
const M_CANCELLED = '83000000-0000-4000-8000-000000000003';
const M_PLAYED = '83000000-0000-4000-8000-000000000004';
const M_KICKED = '83000000-0000-4000-8000-000000000005'; // still 'scheduled' but kicked off an hour ago
const UNKNOWN = '83000000-0000-4000-8000-0000000000ff';

const sql = async (text: string, params: unknown[] = []) => {
  const res = await db.owner.run(text, params, { commit: true });
  expect(res.error, `setup failed: ${text.slice(0, 50)}`).toBeNull();
};

beforeAll(async () => {
  db = await createTestDb();
  await sql(
    `insert into core.players (id, full_name, position, shirt_number, status, email, phone, date_of_birth, guardian_consent, public_opt_in)
     values ($1, 'Fake Alpha', 'MID', 5, 'active', 'fake.alpha@pintfc.test', '+1-555-0201', '1990-01-01', false, true),
            ($2, 'Fake Bravo', 'DEF', 6, 'active', 'fake.bravo@pintfc.test', '+1-555-0202', '1990-01-01', false, true)`,
    [A, B],
  );
  await sql(`insert into auth.sessions (id, user_id, not_after) values ($1, $2, now() + interval '1 day'), ($3, $4, now() + interval '1 day')`, [SES_A, A, SES_B, B]);
  await sql("insert into core.seasons (id, name, starts_on, ends_on, is_current) values ($1, 'Fake Season', '2026-01-01', '2026-12-31', true)", [SEASON]);
  await sql("insert into core.competitions (id, season_id, name, kind) values ($1, $2, 'Fake League', 'league')", [LEAGUE, SEASON]);
  await sql("insert into core.venues (id, name, city) values ($1, 'Fake Park', 'Fakeville')", [VENUE]);
  await sql("insert into core.teams (id, name, short_name, crest_url) values ($1, 'Fake Rovers', 'FR', 'x')", [OPP]);
  const match = (id: string, hours: number, status: string) =>
    sql(
      `insert into core.matches (id, season_id, competition_id, opponent_id, venue_id, home_away, kickoff_at, status)
       values ($1, $2, $3, $4, $5, 'home', now() + make_interval(secs => $6::float8 * 3600), $7)`,
      [id, SEASON, LEAGUE, OPP, VENUE, hours, status],
    );
  await match(M_OPEN, 72, 'scheduled');
  await match(M_SOON, 1, 'scheduled');
  await match(M_CANCELLED, 72, 'cancelled');
  await match(M_PLAYED, -48, 'played');
  await match(M_KICKED, -1, 'scheduled');
});

const claimsA = { sub: A, session_id: SES_A };
const claimsB = { sub: B, session_id: SES_B };
const call = (claims: { sub: string; session_id: string }, match: string, answer: string, reason: string | null = null) =>
  db.asRole('authenticated', claims).run('select * from public.rpc_rsvp_set($1, $2, $3)', [match, answer, reason], { commit: true });
const rsvpRows = async (match?: string) =>
  (await db.owner.run('select match_id, player_id, answer::text as answer, reason, created_at, updated_at from core.rsvps' + (match ? ' where match_id = $1' : '') + ' order by player_id', match ? [match] : [])).rows;

/**
 * One transaction with a frozen clock: creates a match whose kickoff is `now() + kickoffIn` (a SQL interval literal),
 * then calls rpc_rsvp_set as player A. Nothing is kept (the transaction is rolled back).
 */
async function frozenCall(kickoffIn: string, status = 'scheduled', answer = 'going') {
  return db.ownerTx(async (c) => {
    const id = randomUUID();
    await c.query(
      `insert into core.matches (id, season_id, competition_id, opponent_id, venue_id, home_away, kickoff_at, status)
       values ($1, $2, $3, $4, $5, 'home', now() + interval '${kickoffIn}', $6)`,
      [id, SEASON, LEAGUE, OPP, VENUE, status],
    );
    await c.query('set local role authenticated');
    await c.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ role: 'authenticated', ...claimsA }), A]);
    const t1 = (await c.query('select now() as n')).rows[0].n as Date;
    await c.query('select pg_sleep(0.05)');
    const t2 = (await c.query('select now() as n')).rows[0].n as Date;
    expect(t2.getTime(), 'the database clock is frozen inside the transaction').toBe(t1.getTime());
    try {
      const res = await c.query('select * from public.rpc_rsvp_set($1, $2, null)', [id, answer]);
      return { error: null as string | null, row: res.rows[0] as Record<string, unknown> | undefined, now: t1 };
    } catch (e) {
      return { error: (e as { code?: string }).code ?? 'UNKNOWN', row: undefined, now: t1 };
    }
  });
}

describe('public.rpc_rsvp_set', () => {
  it('AC-3.3.1 [db] player saves Going, Maybe or Not going before cutoff', async () => {
    for (const [i, answer] of (['going', 'maybe', 'not_going'] as const).entries()) {
      const res = await call(claimsA, M_OPEN, answer, i === 2 ? 'Fake night shift' : null);
      expect(res.error, answer).toBeNull();
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0]).toMatchObject({ match_id: M_OPEN, rsvp_open: true, answer, reason: i === 2 ? 'Fake night shift' : null });
      const mine = (await rsvpRows(M_OPEN)).filter((r) => r.player_id === A);
      expect(mine, 'one row per player and match').toHaveLength(1);
      expect(mine[0]).toMatchObject({ answer });
    }
    // the reason limit is exactly 140 characters
    expect((await call(claimsA, M_OPEN, 'going', 'x'.repeat(140))).error).toBeNull();
    const tooLong = await call(claimsA, M_OPEN, 'going', 'x'.repeat(141));
    expect(tooLong.error?.code).toBe('22023');
    // an answer that is not one of the three is refused before anything is written
    for (const bad of ['yes', '', 'GOING']) expect((await call(claimsA, M_OPEN, bad)).error?.code, bad).toBe('22023');
    expect((await rsvpRows(M_OPEN)).filter((r) => r.player_id === A)[0]).toMatchObject({ answer: 'going', reason: 'x'.repeat(140) });
  });

  it('AC-3.3.2 [db] changing an answer before cutoff replaces it', async () => {
    expect((await call(claimsB, M_OPEN, 'going', 'first reason')).error).toBeNull();
    const first = (await rsvpRows(M_OPEN)).find((r) => r.player_id === B)!;
    const otherBefore = (await rsvpRows(M_OPEN)).find((r) => r.player_id === A)!;
    await new Promise((r) => setTimeout(r, 20)); // the next commit gets a later now()
    const res = await call(claimsB, M_OPEN, 'not_going');
    expect(res.error).toBeNull();
    expect(res.rows[0]).toMatchObject({ answer: 'not_going', reason: null }); // the old reason does not survive the new answer
    const rows = (await rsvpRows(M_OPEN)).filter((r) => r.player_id === B);
    expect(rows, 'still one row, not two').toHaveLength(1);
    expect(rows[0]).toMatchObject({ answer: 'not_going', reason: null });
    expect(new Date(rows[0].created_at as Date).getTime(), 'created_at stays').toBe(new Date(first.created_at as Date).getTime());
    expect(new Date(rows[0].updated_at as Date).getTime(), 'updated_at moves').toBeGreaterThan(new Date(first.updated_at as Date).getTime());
    // and the other player's row did not move
    expect((await rsvpRows(M_OPEN)).find((r) => r.player_id === A)).toEqual(otherBefore);
  });

  it('AC-3.3.4 [db] answers after cutoff are rejected', async () => {
    // an answer saved earlier, then the cutoff passes
    await sql('insert into core.rsvps (match_id, player_id, answer, reason) values ($1, $2, $3, $4)', [M_SOON, A, 'going', 'fake earlier answer']);
    const before = await rsvpRows(M_SOON);
    const res = await call(claimsA, M_SOON, 'not_going', 'too late');
    expect(res.error?.code).toBe('PF409');
    expect(await rsvpRows(M_SOON), 'nothing was changed').toEqual(before);
    // the cutoff to the microsecond, on a frozen clock: exactly at the cutoff is closed, one microsecond earlier is open
    const atCutoff = await frozenCall('2 hours');
    expect(atCutoff.error, 'now == cutoff').toBe('PF409');
    const justBefore = await frozenCall('2 hours 1 microsecond');
    expect(justBefore.error, 'now == cutoff - 1 microsecond').toBeNull();
    expect(justBefore.row).toMatchObject({ rsvp_open: true, answer: 'going' });
    expect((justBefore.row!.cutoff_at as Date).getTime() - (justBefore.now.getTime()), 'the cutoff is a hair after now').toBeGreaterThanOrEqual(0);
    const justAfter = await frozenCall('1 hour 59 minutes 59.999999 seconds');
    expect(justAfter.error, 'now == cutoff + 1 microsecond').toBe('PF409');
    // the cutoff is the shared rule: kickoff minus exactly two hours
    const far = await frozenCall('72 hours');
    expect((far.row!.cutoff_at as Date).getTime()).toBe(far.now.getTime() + 70 * 3_600_000);
  });

  it('T-03 [db] direct rpc_rsvp_set after cutoff is rejected', async () => {
    // "direct" = the database function called the way PostgREST would call it, with no app in between
    const before = await rsvpRows();
    const res = await call(claimsB, M_SOON, 'going');
    expect(res.error?.code).toBe('PF409');
    expect(await rsvpRows(), 'no row written').toEqual(before);
    // and there is no other way in: no table write for a signed-in player
    for (const text of [
      `insert into core.rsvps (match_id, player_id, answer) values ('${M_SOON}', '${B}', 'going')`,
      `update core.rsvps set answer = 'not_going' where match_id = '${M_SOON}'`,
      `delete from core.rsvps where match_id = '${M_SOON}'`,
    ]) {
      const w = await db.asRole('authenticated', claimsB).run(text, [], { commit: true });
      expect(w.error?.code, text).toBe('42501');
    }
    expect(await rsvpRows()).toEqual(before);
  });

  it('T-22 [db] rpc_rsvp_set rejects cancelled and past matches', async () => {
    const before = await rsvpRows();
    expect((await call(claimsA, M_CANCELLED, 'going')).error?.code, 'cancelled').toBe('PF410');
    expect((await call(claimsA, M_PLAYED, 'going')).error?.code, 'played').toBe('PF410');
    expect((await call(claimsA, M_KICKED, 'going')).error?.code, 'kicked off, never marked played').toBe('PF410');
    // between the cutoff and kickoff the match is still coming, only RSVP is closed: PF409, not PF410
    expect((await call(claimsA, M_SOON, 'going')).error?.code, 'cutoff passed, not kicked off').toBe('PF409');
    // the kickoff instant on the frozen clock: kickoff == now is "past" (PF410); one microsecond later is PF409
    expect((await frozenCall('0 seconds')).error, 'now == kickoff').toBe('PF410');
    expect((await frozenCall('1 microsecond')).error, 'now == kickoff - 1 microsecond').toBe('PF409');
    expect((await call(claimsA, UNKNOWN, 'going')).error?.code, 'no such match').toBe('PF404');
    expect(await rsvpRows(), 'nothing written').toEqual(before);
    // same on the frozen clock: a cancelled match is not open even when the time is right
    expect((await frozenCall('72 hours', 'cancelled')).error).toBe('PF410');
    expect((await frozenCall('-1 hour', 'played')).error).toBe('PF410');
  });

  it('AC-3.3.6 [db] cancelled or past match and answering for someone else are rejected', async () => {
    const before = await rsvpRows();
    expect((await call(claimsA, M_CANCELLED, 'going')).error?.code).toBe('PF410');
    expect((await call(claimsA, M_PLAYED, 'going')).error?.code).toBe('PF410');
    // there is no way to name another player
    for (const arg of ['p_player_id', 'p_user_id', 'p_for_player']) {
      const res = await db.asRole('authenticated', claimsA).run(`select * from public.rpc_rsvp_set(p_match_id => $1, p_answer => 'going', ${arg} => $2)`, [M_OPEN, B]);
      expect(res.error?.code, arg).toBe('42883');
    }
    expect(await rsvpRows()).toEqual(before);
  });

  it('T-04 [db] cannot write an RSVP for another player', async () => {
    const bBefore = (await rsvpRows(M_OPEN)).find((r) => r.player_id === B)!;
    // A's answer lands on A's row, never on B's
    expect((await call(claimsA, M_OPEN, 'maybe', 'only mine')).error).toBeNull();
    expect((await rsvpRows(M_OPEN)).find((r) => r.player_id === B)).toEqual(bBefore);
    expect((await rsvpRows(M_OPEN)).find((r) => r.player_id === A)).toMatchObject({ answer: 'maybe', reason: 'only mine' });
    // a token that names B but carries A's session is not a login at all
    const forged = await call({ sub: B, session_id: SES_A }, M_OPEN, 'going', 'forged');
    expect(forged.error?.code).toBe('PF401');
    expect((await rsvpRows(M_OPEN)).find((r) => r.player_id === B)).toEqual(bBefore);
  });

  it('RSVP-GRANT-1 [db] a visitor or a token without a session gets no write; the function is locked down', async () => {
    const anon = await db.asRole('anon').run('select * from public.rpc_rsvp_set($1, $2, null)', [M_OPEN, 'going']);
    expect(anon.error?.code).toBe('42501');
    const noSession = await call({ sub: A, session_id: '81000000-0000-4000-8000-0000000000ff' }, M_OPEN, 'going');
    expect(noSession.error?.code).toBe('PF401');
    const none = await db.asRole('authenticated').run('select * from public.rpc_rsvp_set($1, $2, null)', [M_OPEN, 'going']);
    expect(none.error?.code).toBe('PF401');
    const meta = await db.owner.run(
      `select p.prosecdef, p.proconfig::text as cfg,
              has_function_privilege('public', p.oid, 'execute') as public_exec,
              has_function_privilege('anon', p.oid, 'execute') as anon_exec,
              has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'rpc_rsvp_set'`,
    );
    expect(meta.rows).toHaveLength(1);
    const r = meta.rows[0];
    expect(r.prosecdef, 'security definer').toBe(true);
    expect(String(r.cfg).replace(/\\/g, '')).toContain('search_path=""');
    expect([r.public_exec, r.anon_exec, r.auth_exec]).toEqual([false, false, true]);
  });
});
