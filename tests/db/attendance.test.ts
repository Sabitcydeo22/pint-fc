// Session 14 database tests: public.rpc_attendance(match_id) (counts, list WITHOUT reasons, the caller's own reason,
// server_now). Fake data only. Answers are written through the real write path (rpc_rsvp_set) or, for the archived
// player and the canary reasons, straight into core.rsvps as the owner.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';

let db: TestDb;
afterAll(async () => {
  await db?.close();
});

const A = '90000000-0000-4000-8000-000000000001';
const B = '90000000-0000-4000-8000-000000000002';
const C = '90000000-0000-4000-8000-000000000003';
const D = '90000000-0000-4000-8000-000000000004';
const E = '90000000-0000-4000-8000-000000000005'; // archived
const SES_A = '91000000-0000-4000-8000-000000000001';
const SES_B = '91000000-0000-4000-8000-000000000002';
const SEASON = '92000000-0000-4000-8000-000000000001';
const LEAGUE = '92000000-0000-4000-8000-000000000002';
const VENUE = '92000000-0000-4000-8000-000000000003';
const OPP = '92000000-0000-4000-8000-000000000004';
const M_OPEN = '93000000-0000-4000-8000-000000000001';
const M_EMPTY = '93000000-0000-4000-8000-000000000002'; // nobody has answered
const M_CANCELLED = '93000000-0000-4000-8000-000000000003';
const M_PLAYED = '93000000-0000-4000-8000-000000000004';
const M_SOON = '93000000-0000-4000-8000-000000000005'; // inside the cutoff: closed
const UNKNOWN = '93000000-0000-4000-8000-0000000000ff';

const REASON_A = 'Fake canary reason of Alpha zz11';
const REASON_B = 'Fake canary reason of Bravo zz22';
const REASON_D = 'Fake canary reason of Delta zz33';
const REASON_E = 'Fake canary reason of archived zz44';

const sql = async (text: string, params: unknown[] = []) => {
  const res = await db.owner.run(text, params, { commit: true });
  expect(res.error, `setup failed: ${text.slice(0, 50)}`).toBeNull();
};

beforeAll(async () => {
  db = await createTestDb();
  await sql(
    `insert into core.players (id, full_name, position, shirt_number, status, email, phone, date_of_birth, guardian_consent, public_opt_in)
     values ($1, 'Fake Alpha', 'MID', 5, 'active', 'fake.alpha@pintfc.test', '+1-555-0301', '1990-01-01', false, false),
            ($2, 'Fake Bravo', 'DEF', 6, 'active', 'fake.bravo@pintfc.test', '+1-555-0302', '1990-01-01', false, false),
            ($3, 'Fake Charlie', 'GK', 1, 'active', 'fake.charlie@pintfc.test', '+1-555-0303', '1990-01-01', false, false),
            ($4, 'Fake Delta', 'FWD', 9, 'active', 'fake.delta@pintfc.test', '+1-555-0304', '1990-01-01', false, false),
            ($5, 'Fake Echo', 'FWD', 10, 'archived', 'fake.echo@pintfc.test', '+1-555-0305', '1990-01-01', false, false)`,
    [A, B, C, D, E],
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
  await match(M_EMPTY, 96, 'scheduled');
  await match(M_CANCELLED, 72, 'cancelled');
  await match(M_PLAYED, -48, 'played');
  await match(M_SOON, 1, 'scheduled');
  // A going, B maybe, D not_going (each with a reason); C has not answered; the archived E answered going
  await sql(
    `insert into core.rsvps (match_id, player_id, answer, reason)
     values ($1, $2, 'going', $6), ($1, $3, 'maybe', $7), ($1, $4, 'not_going', $8), ($1, $5, 'going', $9)`,
    [M_OPEN, A, B, D, E, REASON_A, REASON_B, REASON_D, REASON_E],
  );
  await sql(`insert into core.rsvps (match_id, player_id, answer, reason) values ($1, $2, 'going', 'Fake cancelled note')`, [M_CANCELLED, A]);
});

const claimsA = { sub: A, session_id: SES_A };
const claimsB = { sub: B, session_id: SES_B };
const attendance = (claims: { sub: string; session_id: string }, match: string) =>
  db.asRole('authenticated', claims).run('select * from public.rpc_attendance($1)', [match]);

interface Attendee {
  player_id: string;
  name: string;
  answer: string;
}
type Row = Record<string, unknown> & { attendees: Attendee[] };
async function ok(claims: { sub: string; session_id: string }, match: string): Promise<Row> {
  const res = await attendance(claims, match);
  expect(res.error, 'rpc_attendance succeeds').toBeNull();
  expect(res.rows, 'exactly one row').toHaveLength(1);
  return res.rows[0] as Row;
}

describe('public.rpc_attendance', () => {
  it('AC-3.3.1 [db] player saves Going, Maybe or Not going before cutoff', async () => {
    // saved through the write path, read back through the attendance function: the player sees their own answer
    for (const [i, answer] of (['going', 'maybe', 'not_going'] as const).entries()) {
      const save = await db
        .asRole('authenticated', claimsA)
        .run('select * from public.rpc_rsvp_set($1, $2, $3)', [M_EMPTY, answer, i === 2 ? 'Fake away' : null], { commit: true });
      expect(save.error, answer).toBeNull();
      const row = await ok(claimsA, M_EMPTY);
      expect(row.my_answer, answer).toBe(answer);
      expect(row.my_reason).toBe(i === 2 ? 'Fake away' : null);
      expect(row.rsvp_open).toBe(true);
      expect(row[answer === 'not_going' ? 'not_going' : answer], `count of ${answer}`).toBe(1);
      expect(row.attendees).toEqual([{ player_id: A, name: 'Fake Alpha', answer }]);
    }
    // the player who has not answered sees no answer of their own
    const other = await ok(claimsB, M_EMPTY);
    expect(other.my_answer).toBeNull();
    expect(other.my_reason).toBeNull();
    // after the cutoff the function still answers, but says the RSVP is closed
    const soon = await ok(claimsA, M_SOON);
    expect(soon.rsvp_open).toBe(false);
  });

  it('AC-3.4.1 [db] event page shows counts and attendance list to signed-in players', async () => {
    const row = await ok(claimsB, M_OPEN);
    expect(Object.keys(row).sort()).toEqual(
      ['attendees', 'competition', 'cutoff_at', 'going', 'kickoff_at', 'match_id', 'maybe', 'my_answer', 'my_reason', 'no_answer', 'not_going', 'opponent', 'rsvp_open', 'server_now', 'status', 'venue'].sort(),
    );
    expect(row).toMatchObject({ match_id: M_OPEN, opponent: 'Fake Rovers', competition: 'Fake League', venue: 'Fake Park', status: 'scheduled', rsvp_open: true });
    // counts are of ACTIVE players only: the archived player's "going" is not counted; C (no answer) is the one no_answer
    expect([row.going, row.maybe, row.not_going, row.no_answer]).toEqual([1, 1, 1, 1]);
    expect(row.attendees.map((a) => [a.name, a.answer])).toEqual([
      ['Fake Alpha', 'going'],
      ['Fake Bravo', 'maybe'],
      ['Fake Delta', 'not_going'],
    ]);
    expect(row.attendees.map((a) => a.player_id)).not.toContain(E);
    // the timestamps are the database's own and the cutoff is the shared rule (kickoff minus 2 hours)
    const kick = (row.kickoff_at as Date).getTime();
    expect((row.cutoff_at as Date).getTime()).toBe(kick - 2 * 3_600_000);
    expect(Math.abs((row.server_now as Date).getTime() - Date.now())).toBeLessThan(60_000);
    // a match nobody answered: everyone active is "no answer", the list is empty
    const played = await ok(claimsA, M_PLAYED);
    expect(played).toMatchObject({ status: 'played', rsvp_open: false, going: 0, maybe: 0, not_going: 0, no_answer: 4 });
    expect(played.attendees).toEqual([]);
    // a cancelled match can still be read, and says so
    const cancelled = await ok(claimsA, M_CANCELLED);
    expect(cancelled).toMatchObject({ status: 'cancelled', rsvp_open: false, going: 1 });
    // unknown match and no session
    expect((await attendance(claimsA, UNKNOWN)).error?.code).toBe('PF404');
    expect((await attendance({ sub: A, session_id: '91000000-0000-4000-8000-0000000000ff' }, M_OPEN)).error?.code).toBe('PF401');
    expect((await db.asRole('authenticated').run('select * from public.rpc_attendance($1)', [M_OPEN])).error?.code).toBe('PF401');
  });

  it("AC-3.4.3 [db] teammates' answers are visible without reasons", async () => {
    const row = await ok(claimsB, M_OPEN);
    // B sees A's and D's answers by name ...
    expect(row.attendees.find((a) => a.player_id === A)).toEqual({ player_id: A, name: 'Fake Alpha', answer: 'going' });
    expect(row.attendees.find((a) => a.player_id === D)).toEqual({ player_id: D, name: 'Fake Delta', answer: 'not_going' });
    // ... and every list entry has exactly these three keys: no reason, no email, no phone, no date of birth
    for (const a of row.attendees) expect(Object.keys(a).sort()).toEqual(['answer', 'name', 'player_id']);
    const text = JSON.stringify(row.attendees);
    for (const secret of ['fake.alpha@pintfc.test', '+1-555-0301', '1990-01-01']) expect(text.includes(secret), 'private value in the list').toBe(false);
  });

  it("T-05 [db] other players' reasons are never returned", async () => {
    const forB = await ok(claimsB, M_OPEN);
    const textB = JSON.stringify(forB);
    // B's own reason is returned to B, nobody else's is anywhere in the row
    expect(forB.my_reason).toBe(REASON_B);
    expect(textB.includes(REASON_B)).toBe(true);
    for (const other of [REASON_A, REASON_D, REASON_E]) expect(textB.includes(other), 'another player\'s reason leaked').toBe(false);
    const forA = await ok(claimsA, M_OPEN);
    expect(forA.my_reason).toBe(REASON_A);
    const textA = JSON.stringify(forA);
    for (const other of [REASON_B, REASON_D, REASON_E]) expect(textA.includes(other), 'another player\'s reason leaked').toBe(false);
    // C has no answer, so sees no reason at all
    const C_SES = '91000000-0000-4000-8000-000000000003';
    await sql(`insert into auth.sessions (id, user_id, not_after) values ($1, $2, now() + interval '1 day')`, [C_SES, C]);
    const forC = await ok({ sub: C, session_id: C_SES }, M_OPEN);
    expect(forC.my_reason).toBeNull();
    for (const reason of [REASON_A, REASON_B, REASON_D, REASON_E]) expect(JSON.stringify(forC).includes(reason), 'a reason reached a player who has none').toBe(false);
  });

  it('ATT-GRANT-1 [db] a visitor gets nothing; the function is locked down', async () => {
    const anon = await db.asRole('anon').run('select * from public.rpc_attendance($1)', [M_OPEN]);
    expect(anon.error?.code).toBe('42501');
    const meta = await db.owner.run(
      `select p.prosecdef, p.proconfig::text as cfg,
              has_function_privilege('public', p.oid, 'execute') as public_exec,
              has_function_privilege('anon', p.oid, 'execute') as anon_exec,
              has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'rpc_attendance'`,
    );
    expect(meta.rows).toHaveLength(1);
    const r = meta.rows[0];
    expect(r.prosecdef, 'security definer').toBe(true);
    expect(String(r.cfg).replace(/\\/g, '')).toContain('search_path=""');
    expect([r.public_exec, r.anon_exec, r.auth_exec]).toEqual([false, false, true]);
  });
});
