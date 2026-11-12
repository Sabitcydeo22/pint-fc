import { afterAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';

const dbs: TestDb[] = [];
afterAll(async () => {
  for (const d of dbs) await d.close();
});

const SEASON = '30000000-0000-4000-8000-000000000001';
const LEAGUE = '30000000-0000-4000-8000-000000000002';
const VENUE = '30000000-0000-4000-8000-000000000003';
const US = '30000000-0000-4000-8000-000000000004';
const OPP = (n: number) => `30000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const MATCH = (n: number) => `30000000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`;

type Status = 'scheduled' | 'cancelled' | 'played';
interface Fixture {
  n: number; // 1..9
  /** kickoff, in hours from now (negative = in the past) */
  hours: number;
  status: Status;
}

/** A fresh database with one season/competition/venue/us-team and the given matches (fake data only). */
async function setup(fixtures: Fixture[]): Promise<TestDb> {
  const db = await createTestDb();
  dbs.push(db);
  const sql = async (text: string, params: unknown[] = []) => {
    const res = await db.owner.run(text, params, { commit: true });
    expect(res.error, `setup failed: ${text.slice(0, 40)}`).toBeNull();
  };
  await sql("insert into core.seasons (id, name, starts_on, ends_on, is_current) values ($1, 'Fake Season', '2026-01-01', '2026-12-31', true)", [SEASON]);
  await sql("insert into core.competitions (id, season_id, name, kind) values ($1, $2, 'Fake League', 'league')", [LEAGUE, SEASON]);
  await sql("insert into core.venues (id, name, city) values ($1, 'Fake Park', 'Fakeville')", [VENUE]);
  await sql("insert into core.teams (id, name, short_name, crest_url, is_us) values ($1, 'PINT FC', 'PINT', 'x', true)", [US]);
  for (const f of fixtures) {
    await sql("insert into core.teams (id, name, short_name, crest_url) values ($1, $2, $3, 'x')", [OPP(f.n), `Fake Rovers ${f.n}`, `FR${f.n}`]);
    await sql(
      `insert into core.matches (id, season_id, competition_id, opponent_id, venue_id, home_away, kickoff_at, status)
       values ($1, $2, $3, $4, $5, 'home', now() + make_interval(secs => $6::float8 * 3600), $7)`,
      [MATCH(f.n), SEASON, LEAGUE, OPP(f.n), VENUE, f.hours, f.status],
    );
  }
  return db;
}

const nextAs = (db: TestDb, role: 'anon' | 'authenticated') => db.asRole(role).run('select * from public.v_next_match');

describe('public.v_next_match', () => {
  it('AC-2.1.1 [db] home shows next non-cancelled match with opponent, venue and kickoff', async () => {
    const db = await setup([
      { n: 1, hours: -48, status: 'played' },
      { n: 2, hours: 72, status: 'scheduled' }, // the next one
      { n: 3, hours: 240, status: 'scheduled' },
    ]);
    for (const role of ['anon', 'authenticated'] as const) {
      const res = await nextAs(db, role);
      expect(res.error, `${role} can read the view`).toBeNull();
      expect(res.rows).toHaveLength(1);
      const row = res.rows[0] as Record<string, unknown>;
      expect(row.id).toBe(MATCH(2));
      expect(row.opponent).toBe('Fake Rovers 2');
      expect(row.competition).toBe('Fake League');
      expect(row.venue).toBe('Fake Park');
      const kickoff = new Date(row.kickoff_at as string | Date).getTime();
      const cutoff = new Date(row.cutoff_at as string | Date).getTime();
      expect(kickoff - cutoff, 'cutoff is exactly 2 hours before kickoff').toBe(2 * 3_600_000);
      expect(kickoff - new Date(row.server_now as string | Date).getTime(), 'kickoff is about 72 h away').toBeGreaterThan(71.9 * 3_600_000);
      expect(row.rsvp_open).toBe(true);
    }
  });

  it('AC-2.1.2 [db] cancelled earliest match is skipped as next match', async () => {
    const db = await setup([
      { n: 1, hours: 24, status: 'cancelled' }, // earliest, but cancelled
      { n: 2, hours: 96, status: 'scheduled' },
    ]);
    const res = await nextAs(db, 'anon');
    expect(res.error).toBeNull();
    expect(res.rows.map((r) => r.id)).toEqual([MATCH(2)]);
  });

  it('NEXT-MATCH-1 [db] past matches, played matches and an empty calendar never show up', async () => {
    const past = await setup([
      { n: 1, hours: -1, status: 'scheduled' }, // kicked off an hour ago and never marked played
      { n: 2, hours: 5, status: 'played' },
      { n: 3, hours: 6, status: 'cancelled' },
    ]);
    const a = await nextAs(past, 'anon');
    expect(a.error).toBeNull();
    expect(a.rows).toEqual([]);

    const empty = await setup([]);
    const b = await nextAs(empty, 'authenticated');
    expect(b.error).toBeNull();
    expect(b.rows).toEqual([]);
  });

  it('NEXT-MATCH-2 [db] the match stays "next" after the RSVP cutoff but says RSVP is closed; at kickoff it is gone', async () => {
    const db = await setup([{ n: 1, hours: 1, status: 'scheduled' }]); // cutoff was an hour ago
    const res = await nextAs(db, 'anon');
    expect(res.error).toBeNull();
    expect(res.rows.map((r) => [r.id, r.rsvp_open])).toEqual([[MATCH(1), false]]);
    await db.owner.run("update core.matches set kickoff_at = now() where id = $1", [MATCH(1)], { commit: true });
    expect((await nextAs(db, 'anon')).rows).toEqual([]);
  });

  it('NEXT-MATCH-4 [db] the view agrees with the shared cutoff rules core.rsvp_cutoff and core.rsvp_is_open', async () => {
    // one scenario on each side of the cutoff, and one far away
    for (const hours of [1, 2.5, 72]) {
      const db = await setup([{ n: 1, hours, status: 'scheduled' }]);
      const viewRow = (await nextAs(db, 'anon')).rows[0] as Record<string, unknown>;
      const rule = await db.owner.run(
        `select core.rsvp_cutoff(m.kickoff_at) as cutoff_at,
                core.rsvp_is_open($2::timestamptz, m.kickoff_at, m.status) as rsvp_open
           from core.matches m where m.id = $1`,
        [MATCH(1), viewRow.server_now],
      );
      expect(rule.error).toBeNull();
      expect(new Date(viewRow.cutoff_at as string | Date).getTime(), `cutoff, kickoff in ${hours} h`).toBe(new Date(rule.rows[0].cutoff_at as string | Date).getTime());
      expect(viewRow.rsvp_open, `open, kickoff in ${hours} h`).toBe(rule.rows[0].rsvp_open);
    }
  });

  it('NEXT-MATCH-3 [db] the view exposes exactly the public columns and nobody can write through it', async () => {
    const db = await setup([{ n: 1, hours: 72, status: 'scheduled' }]);
    const res = await nextAs(db, 'anon');
    expect(res.error).toBeNull();
    expect(Object.keys(res.rows[0]).sort()).toEqual(
      ['competition', 'cutoff_at', 'id', 'kickoff_at', 'opponent', 'rsvp_open', 'server_now', 'venue'],
    );
    for (const role of ['anon', 'authenticated'] as const) {
      for (const sql of [
        "update public.v_next_match set opponent = 'Hacked'",
        'delete from public.v_next_match',
        "insert into public.v_next_match (id) values ('30000000-0000-4000-8000-000000000999')",
      ]) {
        const w = await db.asRole(role).run(sql);
        // refused either by the privilege check (42501) or because the view cannot be written at all (55000)
        expect(['42501', '55000'], `${role}: ${sql}`).toContain(w.error?.code);
      }
    }
    // the data underneath stays closed to visitors
    const direct = await db.asRole('anon').run('select * from core.matches');
    expect(direct.error?.code).toBe('42501');
  });
});
