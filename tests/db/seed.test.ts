import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
// @ts-expect-error TS7016 plain .mjs module, typed locally
import * as seedModule from '../../scripts/seed.mjs';

interface SeedModule {
  seed: (client: pg.Client, opts?: { now?: Date; demoCutoffInMs?: number }) => Promise<unknown>;
  DEMO_MATCH_ID: string;
}
const { seed, DEMO_MATCH_ID } = seedModule as unknown as SeedModule;

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db?.close();
});

async function runSeed(opts: { now: Date; demoCutoffInMs: number }): Promise<void> {
  const client = new pg.Client({ connectionString: db.url });
  await client.connect();
  try {
    await seed(client, opts);
  } finally {
    await client.end();
  }
}

/** One number from one query, as the owner. */
async function num(sql: string, params: unknown[] = []): Promise<number> {
  const res = await db.owner.run(sql, params);
  expect(res.error, `query failed: ${sql}`).toBeNull();
  return Number(res.rows[0].n);
}

/** Row count and a content fingerprint for every core table (ids included), to prove reruns change nothing. */
async function fingerprint(): Promise<Record<string, string>> {
  const tables = [
    'seasons', 'competitions', 'venues', 'teams', 'players', 'matches', 'results',
    'player_match_stats', 'standings_snapshots', 'standings_rows', 'trainings', 'rsvps',
  ];
  const out: Record<string, string> = {};
  for (const t of tables) {
    const res = await db.owner.run(
      `select count(*)::int as n, coalesce(md5(string_agg(x::text, '|' order by x::text)), '') as h from core.${t} x`,
    );
    expect(res.error).toBeNull();
    out[t] = `${res.rows[0].n}:${res.rows[0].h}`;
  }
  return out;
}

const MIN = 60_000;

describe('seed', () => {
  it('SEED-1 seed yields the specified counts and is idempotent', async () => {
    const now = new Date();
    await runSeed({ now, demoCutoffInMs: 90 * MIN });
    const first = await fingerprint();

    // season, competitions, venues, teams
    expect(await num('select count(*) as n from core.seasons')).toBe(1);
    expect(await num('select count(*) as n from core.seasons where is_current')).toBe(1);
    expect(await num("select count(*) as n from core.competitions where kind = 'league'")).toBe(1);
    expect(await num("select count(*) as n from core.competitions where kind = 'friendly'")).toBe(1);
    expect(await num('select count(*) as n from core.venues')).toBe(3);
    expect(await num('select count(*) as n from core.teams')).toBe(8);
    expect(await num('select count(*) as n from core.teams where is_us')).toBe(1);

    // 40 active players by position, 1 archived
    expect(await num('select count(*) as n from core.players')).toBe(41);
    expect(await num("select count(*) as n from core.players where status = 'active'")).toBe(40);
    expect(await num("select count(*) as n from core.players where status = 'archived'")).toBe(1);
    for (const [pos, count] of [['GK', 4], ['DEF', 14], ['MID', 14], ['FWD', 8]] as const) {
      expect(await num("select count(*) as n from core.players where status = 'active' and position = $1", [pos]), pos).toBe(count);
    }

    // two minors: A with guardian consent and opt-in, B with neither
    expect(await num("select count(*) as n from core.players where status = 'active' and core.is_minor(date_of_birth)")).toBe(2);
    expect(await num("select count(*) as n from core.players where status = 'active' and core.is_minor(date_of_birth) and guardian_consent and public_opt_in")).toBe(1);
    expect(await num("select count(*) as n from core.players where status = 'active' and core.is_minor(date_of_birth) and not guardian_consent and not public_opt_in")).toBe(1);
    // the archived player is an adult who would otherwise be visible
    expect(await num("select count(*) as n from core.players where status = 'archived' and public_opt_in and not core.is_minor(date_of_birth)")).toBe(1);
    // mixed consents: some adults opt out; photo, nationality and stats each have yes and no
    expect(await num("select count(*) as n from core.players where status = 'active' and not public_opt_in and not core.is_minor(date_of_birth)")).toBe(2);
    for (const col of ['show_photo', 'show_nationality', 'show_stats']) {
      expect(await num(`select count(*) as n from core.players where status = 'active' and ${col}`), `${col} yes`).toBeGreaterThanOrEqual(5);
      expect(await num(`select count(*) as n from core.players where status = 'active' and not ${col}`), `${col} no`).toBeGreaterThanOrEqual(5);
    }
    // visible to the public (active, opted in, adult or guardian-consented): 40 - 2 adult opt-outs - 1 unconsented minor
    expect(await num("select count(*) as n from core.players where status = 'active' and public_opt_in and (not core.is_minor(date_of_birth) or guardian_consent)")).toBe(37);

    // matches: 12 played in the past (11 league + 1 friendly), 5 upcoming (demo + 4, one cancelled)
    expect(await num('select count(*) as n from core.matches')).toBe(17);
    expect(await num("select count(*) as n from core.matches m join core.competitions c on c.id = m.competition_id where m.kickoff_at < $1 and m.status = 'played' and c.kind = 'league'", [now])).toBe(11);
    expect(await num("select count(*) as n from core.matches m join core.competitions c on c.id = m.competition_id where m.kickoff_at < $1 and m.status = 'played' and c.kind = 'friendly'", [now])).toBe(1);
    expect(await num("select count(*) as n from core.matches where kickoff_at > $1 and status = 'scheduled'", [now])).toBe(4);
    expect(await num("select count(*) as n from core.matches where kickoff_at > $1 and status = 'cancelled'", [now])).toBe(1);
    expect(await num('select count(*) as n from core.matches where kickoff_at < $1', [now])).toBe(12);

    // results: 10 published league + 1 published friendly + 1 saved but unpublished
    expect(await num('select count(*) as n from core.results')).toBe(12);
    expect(await num('select count(*) as n from core.results where published and published_at is not null')).toBe(11);
    expect(await num("select count(*) as n from core.results r join core.matches m on m.id = r.match_id join core.competitions c on c.id = m.competition_id where r.published and c.kind = 'league'")).toBe(10);
    expect(await num("select count(*) as n from core.results r join core.matches m on m.id = r.match_id join core.competitions c on c.id = m.competition_id where not r.published and c.kind = 'league'")).toBe(1);
    expect(await num("select count(*) as n from core.results r join core.matches m on m.id = r.match_id where m.status <> 'played'")).toBe(0);

    // stat lines for every published result: at least 11 players, goals add up to our goals, nobody plays 0 minutes
    const lines = await db.owner.run(`
      select r.match_id, r.goals_for, count(s.player_id)::int as players, coalesce(sum(s.goals), 0)::int as goals,
             coalesce(min(s.minutes), 0)::int as min_minutes
        from core.results r left join core.player_match_stats s on s.match_id = r.match_id
       where r.published group by r.match_id, r.goals_for`);
    expect(lines.error).toBeNull();
    expect(lines.rows).toHaveLength(11);
    for (const row of lines.rows) {
      expect(Number(row.players), 'players with a stat line').toBeGreaterThanOrEqual(11);
      expect(Number(row.goals), 'goals in stat lines = goals for').toBe(Number(row.goals_for));
      expect(Number(row.min_minutes)).toBeGreaterThan(0);
    }
    expect(await num('select count(*) as n from core.player_match_stats s join core.results r on r.match_id = s.match_id where not r.published')).toBe(0);

    // trainings, one standings snapshot with 8 consistent rows, and no RSVPs yet
    expect(await num('select count(*) as n from core.trainings')).toBe(8);
    expect(await num('select count(*) as n from core.standings_snapshots')).toBe(1);
    expect(await num('select count(*) as n from core.standings_rows')).toBe(8);
    expect(await num('select count(distinct position) as n from core.standings_rows where position between 1 and 8')).toBe(8);
    expect(await num('select count(*) as n from core.standings_rows where played <> won + drawn + lost or points <> 3 * won + drawn')).toBe(0);
    expect(await num('select count(*) as n from core.standings_rows r join core.teams t on t.id = r.team_id where t.is_us')).toBe(1);
    expect(await num('select count(*) as n from core.rsvps')).toBe(0);

    // idempotent: the same seed again changes nothing (same rows, same content, same ids)
    await runSeed({ now, demoCutoffInMs: 90 * MIN });
    expect(await fingerprint()).toEqual(first);
  });

  it('SEED-2 demo match cutoff is relative to now and re-runnable', async () => {
    const now = new Date();
    await runSeed({ now, demoCutoffInMs: 90 * MIN });

    const demo = async () => {
      const res = await db.owner.run(
        `select m.status::text as status,
                round(extract(epoch from m.kickoff_at) * 1000)::bigint::text as kickoff_ms,
                round(extract(epoch from core.rsvp_cutoff(m.kickoff_at)) * 1000)::bigint::text as cutoff_ms
           from core.matches m where m.id = $1`,
        [DEMO_MATCH_ID],
      );
      expect(res.error).toBeNull();
      expect(res.rows, 'demo match exists').toHaveLength(1);
      return { status: String(res.rows[0].status), kickoff: Number(res.rows[0].kickoff_ms), cutoff: Number(res.rows[0].cutoff_ms) };
    };

    // kickoff = now + 90 min + 2 h, so the cutoff falls 90 minutes from now
    let d = await demo();
    expect(d.status).toBe('scheduled');
    expect(d.cutoff).toBe(now.getTime() + 90 * MIN);
    expect(d.kickoff).toBe(now.getTime() + 90 * MIN + 2 * 60 * MIN);
    // open now, closed from the cutoff on (the shared SQL rule)
    const open = (at: number) =>
      db.owner.run('select core.rsvp_is_open($1::timestamptz, $2::timestamptz, $3::core.match_status) as o', [
        new Date(at),
        new Date(d.kickoff),
        d.status,
      ]);
    expect((await open(now.getTime())).rows[0].o).toBe(true);
    expect((await open(d.cutoff - 1)).rows[0].o).toBe(true);
    expect((await open(d.cutoff)).rows[0].o).toBe(false);

    // it is "the next match": the earliest scheduled match after now
    const next = await db.owner.run("select id from core.matches where status = 'scheduled' and kickoff_at > $1 order by kickoff_at limit 1", [now]);
    expect(next.rows[0]?.id).toBe(DEMO_MATCH_ID);
    // the cancelled match and the three other scheduled ones come after it
    expect(await num("select count(*) as n from core.matches where kickoff_at > $1 and id <> $2 and kickoff_at < (select kickoff_at from core.matches where id = $2)", [now, DEMO_MATCH_ID])).toBe(0);

    // re-run later with a different flag: the SAME match moves, nothing is duplicated
    const before = await num('select count(*) as n from core.matches');
    const ids = (await db.owner.run('select id from core.matches order by id')).rows.map((r) => r.id);
    const later = new Date(now.getTime() + 3 * 24 * 60 * MIN);
    await runSeed({ now: later, demoCutoffInMs: 30 * MIN });
    d = await demo();
    expect(d.cutoff).toBe(later.getTime() + 30 * MIN);
    expect(d.kickoff).toBe(later.getTime() + 30 * MIN + 2 * 60 * MIN);
    expect(await num('select count(*) as n from core.matches')).toBe(before);
    expect((await db.owner.run('select id from core.matches order by id')).rows.map((r) => r.id)).toEqual(ids);
    const next2 = await db.owner.run("select id from core.matches where status = 'scheduled' and kickoff_at > $1 order by kickoff_at limit 1", [later]);
    expect(next2.rows[0]?.id).toBe(DEMO_MATCH_ID);
    // still the demo plus 3 regular scheduled matches (+ 1 cancelled), none duplicated
    expect(await num("select count(*) as n from core.matches where kickoff_at > $1 and status = 'scheduled'", [later])).toBe(4);
    expect(await num("select count(*) as n from core.matches where kickoff_at > $1 and status = 'cancelled'", [later])).toBe(1);
  });
});
