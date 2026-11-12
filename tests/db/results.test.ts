import { afterAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';

const dbs: TestDb[] = [];
afterAll(async () => {
  for (const d of dbs) await d.close();
});

const SEASON = '40000000-0000-4000-8000-000000000001';
const OLD_SEASON = '40000000-0000-4000-8000-000000000002';
const LEAGUE = '40000000-0000-4000-8000-000000000003';
const FRIENDLY = '40000000-0000-4000-8000-000000000004';
const OLD_LEAGUE = '40000000-0000-4000-8000-000000000005';
const VENUE = '40000000-0000-4000-8000-000000000006';
const MATCH = (n: number) => `40000000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`;

type Status = 'scheduled' | 'cancelled' | 'played';
interface Fixture {
  n: number; // 1..40
  /** how many days ago it kicked off (negative = in the future) */
  daysAgo: number;
  status?: Status; // default 'played'
  comp?: 'league' | 'friendly' | 'old';
  /** [goals for, goals against, published]; omit for a match with no result row */
  result?: [number, number, boolean];
}

/** A fresh database with a current season (league + friendly), an old season, and the given matches (fake data only). */
async function setup(fixtures: Fixture[]): Promise<TestDb> {
  const db = await createTestDb();
  dbs.push(db);
  const sql = async (text: string, params: unknown[] = []) => {
    const res = await db.owner.run(text, params, { commit: true });
    expect(res.error, `setup failed: ${text.slice(0, 40)}`).toBeNull();
  };
  await sql("insert into core.seasons (id, name, starts_on, ends_on, is_current) values ($1, 'Fake Season', '2026-01-01', '2026-12-31', true), ($2, 'Old Fake Season', '2025-01-01', '2025-12-31', false)", [SEASON, OLD_SEASON]);
  await sql(
    "insert into core.competitions (id, season_id, name, kind) values ($1, $2, 'Fake League', 'league'), ($3, $2, 'Fake Friendly', 'friendly'), ($4, $5, 'Old Fake League', 'league')",
    [LEAGUE, SEASON, FRIENDLY, OLD_LEAGUE, OLD_SEASON],
  );
  await sql("insert into core.venues (id, name, city) values ($1, 'Fake Park', 'Fakeville')", [VENUE]);
  for (const f of fixtures) {
    const comp = f.comp === 'friendly' ? FRIENDLY : f.comp === 'old' ? OLD_LEAGUE : LEAGUE;
    const season = f.comp === 'old' ? OLD_SEASON : SEASON;
    const teamId = `40000000-0000-4000-8000-0000000001${String(f.n).padStart(2, '0')}`;
    await sql("insert into core.teams (id, name, short_name, crest_url) values ($1, $2, $3, 'x')", [teamId, `Fake Rovers ${f.n}`, `FR${f.n}`]);
    await sql(
      `insert into core.matches (id, season_id, competition_id, opponent_id, venue_id, home_away, kickoff_at, status)
       values ($1, $2, $3, $4, $5, 'home', now() - make_interval(days => $6), $7)`,
      [MATCH(f.n), season, comp, teamId, VENUE, f.daysAgo, f.status ?? 'played'],
    );
    if (f.result) {
      await sql(
        `insert into core.results (match_id, goals_for, goals_against, published, published_at)
         values ($1, $2, $3, $4, case when $4 then now() else null end)`,
        [MATCH(f.n), f.result[0], f.result[1], f.result[2]],
      );
    }
  }
  return db;
}

const record = (db: TestDb, role: 'anon' | 'authenticated' = 'anon') => db.asRole(role).run('select * from public.v_season_record');
const latest = (db: TestDb, role: 'anon' | 'authenticated' = 'anon') =>
  db.asRole(role).run('select * from public.v_latest_results');

/** A published league season: W 2-0, D 1-1, L 0-3, W 3-1. */
const BASE: Fixture[] = [
  { n: 1, daysAgo: 28, result: [2, 0, true] },
  { n: 2, daysAgo: 21, result: [1, 1, true] },
  { n: 3, daysAgo: 14, result: [0, 3, true] },
  { n: 4, daysAgo: 7, result: [3, 1, true] },
];

describe('public.v_season_record', () => {
  it('AC-2.2.1 [db] season record is computed from published league results', async () => {
    const db = await setup(BASE);
    for (const role of ['anon', 'authenticated'] as const) {
      const res = await record(db, role);
      expect(res.error, `${role} can read the view`).toBeNull();
      expect(res.rows).toEqual([{ played: 4, won: 2, drawn: 1, lost: 1, goals_for: 6, goals_against: 5 }]);
    }
  });

  it('AC-2.2.2 [db] unpublished result is excluded from the record', async () => {
    const db = await setup([...BASE, { n: 5, daysAgo: 1, result: [5, 0, false] }]);
    const res = await record(db);
    expect(res.error).toBeNull();
    expect(res.rows).toEqual([{ played: 4, won: 2, drawn: 1, lost: 1, goals_for: 6, goals_against: 5 }]);
  });

  it('AC-2.2.3 [db] friendly is excluded from the league record', async () => {
    const db = await setup([...BASE, { n: 5, daysAgo: 3, comp: 'friendly', result: [9, 0, true] }]);
    const res = await record(db);
    expect(res.error).toBeNull();
    expect(res.rows).toEqual([{ played: 4, won: 2, drawn: 1, lost: 1, goals_for: 6, goals_against: 5 }]);
  });

  it('RECORD-1 [db] nothing to count means no row at all (an empty state, not zeros), and other seasons and non-played matches are ignored', async () => {
    const none = await setup([
      { n: 1, daysAgo: 7, result: [2, 0, false] }, // saved, not published
      { n: 2, daysAgo: 14, comp: 'friendly', result: [1, 0, true] }, // friendly only
      { n: 3, daysAgo: 400, comp: 'old', result: [4, 0, true] }, // another season
      { n: 4, daysAgo: 5, status: 'cancelled', result: [7, 0, true] }, // cancelled match with a published result row
      { n: 5, daysAgo: -5, status: 'scheduled', result: [8, 0, true] }, // a future match with a published result row
    ]);
    const a = await record(none);
    expect(a.error).toBeNull();
    expect(a.rows).toEqual([]);

    // adding one real published league result makes exactly one row, counting only that result
    const one = await setup([
      { n: 1, daysAgo: 7, result: [2, 0, true] },
      { n: 2, daysAgo: 400, comp: 'old', result: [4, 0, true] },
      { n: 3, daysAgo: 5, status: 'cancelled', result: [7, 0, true] },
    ]);
    const b = await record(one);
    expect(b.rows).toEqual([{ played: 1, won: 1, drawn: 0, lost: 0, goals_for: 2, goals_against: 0 }]);
  });
});

describe('public.v_latest_results', () => {
  const MANY: Fixture[] = [
    { n: 1, daysAgo: 70, result: [1, 0, true] },
    { n: 2, daysAgo: 63, result: [2, 2, true] },
    { n: 3, daysAgo: 56, comp: 'friendly', result: [0, 1, true] },
    { n: 4, daysAgo: 49, result: [3, 0, true] },
    { n: 5, daysAgo: 42, result: [1, 2, true] },
    { n: 6, daysAgo: 35, result: [4, 1, true] },
    { n: 7, daysAgo: 28, result: [2, 1, true] },
  ];

  it('AC-2.3.1 [db] latest five published results appear newest first', async () => {
    const db = await setup(MANY);
    for (const role of ['anon', 'authenticated'] as const) {
      const res = await db.asRole(role).run('select * from public.v_latest_results order by played_at desc limit 5');
      expect(res.error, `${role} can read the view`).toBeNull();
      // newest first: matches 7, 6, 5, 4, 3 (the friendly is included)
      expect(res.rows.map((r) => r.match_id)).toEqual([7, 6, 5, 4, 3].map(MATCH));
      expect(res.rows.map((r) => [r.opponent, r.goals_for, r.goals_against])).toEqual([
        ['Fake Rovers 7', 2, 1],
        ['Fake Rovers 6', 4, 1],
        ['Fake Rovers 5', 1, 2],
        ['Fake Rovers 4', 3, 0],
        ['Fake Rovers 3', 0, 1],
      ]);
    }
    // the view itself is already newest first, so a plain select agrees
    const plain = await latest(db);
    expect(plain.rows.map((r) => r.match_id)).toEqual([7, 6, 5, 4, 3, 2, 1].map(MATCH));
    // played_on is the calendar date of the kickoff in the club time zone (the newest match kicked off 28 days ago)
    const dates = await db.asRole('anon').run('select played_on::text as d from public.v_latest_results order by played_at desc limit 1');
    const want = await db.owner.run("select ((now() - interval '28 days') at time zone 'America/New_York')::date::text as d");
    expect(dates.rows[0].d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dates.rows[0].d).toBe(want.rows[0].d);
  });

  it('AC-2.3.2 [db] unpublished result never appears in latest results', async () => {
    const db = await setup([...MANY, { n: 8, daysAgo: 1, result: [6, 0, false] }]); // the newest match, saved but not published
    const res = await latest(db);
    expect(res.error).toBeNull();
    expect(res.rows.map((r) => r.match_id)).not.toContain(MATCH(8));
    expect(res.rows).toHaveLength(7);
    expect(res.rows[0].match_id).toBe(MATCH(7));
  });

  it('LATEST-1 [db] the view exposes exactly the public columns and nobody can write through it', async () => {
    const db = await setup(MANY);
    for (const [view, columns] of [
      ['public.v_latest_results', ['goals_against', 'goals_for', 'match_id', 'opponent', 'played_at', 'played_on']],
      ['public.v_season_record', ['drawn', 'goals_against', 'goals_for', 'lost', 'played', 'won']],
    ] as const) {
      const res = await db.asRole('anon').run(`select * from ${view}`);
      expect(res.error).toBeNull();
      expect(Object.keys(res.rows[0]).sort(), view).toEqual(columns);
      for (const role of ['anon', 'authenticated'] as const) {
        for (const sql of [`update ${view} set goals_for = 99`, `delete from ${view}`]) {
          const w = await db.asRole(role).run(sql);
          // refused either by the privilege check (42501) or because the view cannot be written at all (55000)
          expect(['42501', '55000'], `${role}: ${sql}`).toContain(w.error?.code);
        }
      }
    }
    // the tables underneath stay closed to visitors
    for (const t of ['core.results', 'core.matches']) {
      const direct = await db.asRole('anon').run(`select * from ${t}`);
      expect(direct.error?.code, t).toBe('42501');
    }
  });
});

describe('threat T-11', () => {
  it('T-11 [db] unpublished results and cancelled matches never leak', async () => {
    const db = await setup([
      { n: 1, daysAgo: 30, result: [2, 0, true] }, // the one honest published result
      { n: 2, daysAgo: 20, result: [9, 0, false] }, // unpublished
      { n: 3, daysAgo: 15, status: 'cancelled', result: [8, 0, true] }, // cancelled match that has a published result row
      { n: 4, daysAgo: 10, status: 'cancelled' }, // cancelled, no result
      { n: 5, daysAgo: -3, status: 'scheduled', result: [7, 0, true] }, // not played yet, but a result row exists
      { n: 6, daysAgo: 5 }, // played, no result row at all
    ]);
    for (const role of ['anon', 'authenticated'] as const) {
      const l = await latest(db, role);
      expect(l.error).toBeNull();
      expect(l.rows.map((r) => r.match_id), `${role}: latest results`).toEqual([MATCH(1)]);
      const r = await record(db, role);
      expect(r.rows, `${role}: season record`).toEqual([{ played: 1, won: 1, drawn: 0, lost: 0, goals_for: 2, goals_against: 0 }]);
      // none of the unpublished or cancelled scores shows up anywhere in what a visitor can read
      const text = JSON.stringify([l.rows, r.rows]);
      expect(text).not.toMatch(/Rovers [2-6]\b/);
    }
  });
});
