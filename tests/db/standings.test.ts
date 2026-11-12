import { afterAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';

const dbs: TestDb[] = [];
afterAll(async () => {
  for (const d of dbs) await d.close();
});

const SEASON = '50000000-0000-4000-8000-000000000001';
const OLD_SEASON = '50000000-0000-4000-8000-000000000002';
const SNAP_OLD = '50000000-0000-4000-8000-000000000011'; // current season, older date
const SNAP_NEW = '50000000-0000-4000-8000-000000000012'; // current season, latest date
const SNAP_OTHER = '50000000-0000-4000-8000-000000000013'; // another season, a LATER date than the others
const TEAM = (n: number) => `50000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;

interface Row {
  team: number;
  position: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
}

/** Team 1 is "PINT FC" (is_us); teams 2..4 are fake opponents. Rows are inserted in a scrambled order on purpose. */
async function setup(opts: { latest: Row[]; older?: Row[]; otherSeason?: Row[] }): Promise<TestDb> {
  const db = await createTestDb();
  dbs.push(db);
  const sql = async (text: string, params: unknown[] = []) => {
    const res = await db.owner.run(text, params, { commit: true });
    expect(res.error, `setup failed: ${text.slice(0, 40)}`).toBeNull();
  };
  await sql(
    "insert into core.seasons (id, name, starts_on, ends_on, is_current) values ($1, 'Fake Season', '2026-01-01', '2026-12-31', true), ($2, 'Old Fake Season', '2025-01-01', '2025-12-31', false)",
    [SEASON, OLD_SEASON],
  );
  await sql("insert into core.teams (id, name, short_name, crest_url, is_us) values ($1, 'PINT FC', 'PINT', 'x', true)", [TEAM(1)]);
  for (const n of [2, 3, 4]) {
    await sql("insert into core.teams (id, name, short_name, crest_url) values ($1, $2, $3, 'x')", [TEAM(n), `Fake Rovers ${n}`, `FR${n}`]);
  }
  const addSnapshot = async (id: string, season: string, takenOn: string, rows: Row[]) => {
    await sql('insert into core.standings_snapshots (id, season_id, taken_on) values ($1, $2, $3)', [id, season, takenOn]);
    for (const r of rows) {
      await sql(
        `insert into core.standings_rows (snapshot_id, team_id, position, played, won, drawn, lost, goals_for, goals_against, points)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, TEAM(r.team), r.position, r.won + r.drawn + r.lost, r.won, r.drawn, r.lost, r.gf, r.ga, 3 * r.won + r.drawn],
      );
    }
  };
  if (opts.older) await addSnapshot(SNAP_OLD, SEASON, '2026-10-01', opts.older);
  await addSnapshot(SNAP_NEW, SEASON, '2026-11-05', opts.latest);
  if (opts.otherSeason) await addSnapshot(SNAP_OTHER, OLD_SEASON, '2026-12-31', opts.otherSeason);
  return db;
}

const standings = (db: TestDb, role: 'anon' | 'authenticated' = 'anon') => db.asRole(role).run('select * from public.v_standings');

// scrambled on purpose: the view must put them in position order
const LATEST: Row[] = [
  { team: 3, position: 3, won: 4, drawn: 2, lost: 4, gf: 15, ga: 16 },
  { team: 1, position: 2, won: 6, drawn: 2, lost: 2, gf: 19, ga: 12 },
  { team: 4, position: 4, won: 1, drawn: 1, lost: 8, gf: 7, ga: 25 },
  { team: 2, position: 1, won: 7, drawn: 1, lost: 2, gf: 22, ga: 10 },
];
const OLDER: Row[] = [
  { team: 4, position: 1, won: 9, drawn: 0, lost: 0, gf: 30, ga: 1 },
  { team: 1, position: 2, won: 1, drawn: 1, lost: 1, gf: 3, ga: 3 },
];

describe('public.v_standings', () => {
  it('AC-2.4.1 [db] mini table shows snapshot rows in position order', async () => {
    const db = await setup({ latest: LATEST });
    for (const role of ['anon', 'authenticated'] as const) {
      const res = await standings(db, role);
      expect(res.error, `${role} can read the view`).toBeNull();
      expect(res.rows.map((r) => [r.position, r.team])).toEqual([
        [1, 'Fake Rovers 2'],
        [2, 'PINT FC'],
        [3, 'Fake Rovers 3'],
        [4, 'Fake Rovers 4'],
      ]);
      // played, goal difference (goals for - goals against) and points are computed from the stored columns
      expect(res.rows.map((r) => [r.played, r.goal_difference, r.points])).toEqual([
        [10, 12, 22],
        [10, 7, 20],
        [10, -1, 14],
        [10, -18, 4],
      ]);
    }
  });

  it('STANDINGS-1 [db] only the latest snapshot of the current season is shown, with its date; no snapshot means no rows', async () => {
    const db = await setup({
      latest: LATEST,
      older: OLDER, // an older snapshot of the same season: must not show
      otherSeason: [{ team: 4, position: 1, won: 9, drawn: 0, lost: 1, gf: 40, ga: 2 }], // another season, with the newest date of all
    });
    const res = await db.asRole('anon').run('select taken_on::text as taken_on, position, team from public.v_standings');
    expect(res.error).toBeNull();
    expect(res.rows).toHaveLength(4);
    expect([...new Set(res.rows.map((r) => r.taken_on))]).toEqual(['2026-11-05']);
    expect(res.rows.map((r) => r.team)).toEqual(['Fake Rovers 2', 'PINT FC', 'Fake Rovers 3', 'Fake Rovers 4']);

    // a season with no snapshot at all: no rows (the page shows its empty state)
    const empty = await createTestDb();
    dbs.push(empty);
    const ins = await empty.owner.run(
      "insert into core.seasons (id, name, starts_on, ends_on, is_current) values ($1, 'Fake Season', '2026-01-01', '2026-12-31', true)",
      [SEASON],
      { commit: true },
    );
    expect(ins.error).toBeNull();
    const none = await standings(empty);
    expect(none.error).toBeNull();
    expect(none.rows).toEqual([]);
  });

  it('STANDINGS-2 [db] our team, and only our team, is flagged is_us', async () => {
    const db = await setup({ latest: LATEST });
    const res = await standings(db);
    expect(res.error).toBeNull();
    expect(res.rows.filter((r) => r.is_us === true).map((r) => r.team)).toEqual(['PINT FC']);
    expect(res.rows.filter((r) => r.is_us === false)).toHaveLength(3);
  });

  it('STANDINGS-3 [db] the view exposes exactly the public columns and nobody can write through it', async () => {
    const db = await setup({ latest: LATEST });
    const res = await standings(db);
    expect(res.error).toBeNull();
    expect(Object.keys(res.rows[0]).sort()).toEqual(['goal_difference', 'is_us', 'played', 'points', 'position', 'taken_on', 'team']);
    for (const role of ['anon', 'authenticated'] as const) {
      for (const sql of ['update public.v_standings set points = 99', 'delete from public.v_standings']) {
        const w = await db.asRole(role).run(sql);
        // refused either by the privilege check (42501) or because the view cannot be written at all (55000)
        expect(['42501', '55000'], `${role}: ${sql}`).toContain(w.error?.code);
      }
    }
    // the tables underneath stay closed to visitors
    for (const t of ['core.standings_rows', 'core.standings_snapshots']) {
      const direct = await db.asRole('anon').run(`select * from ${t}`);
      expect(direct.error?.code, t).toBe('42501');
    }
  });
});
