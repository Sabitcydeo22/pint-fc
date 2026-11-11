import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectCoreSchemaReady, type TestDb } from '../helpers/db';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db?.close();
});

/** Runs a statement inside a savepoint; returns the SQLSTATE if it failed, or null if it worked. */
async function failsWith(c: pg.Client, sql: string, params?: unknown[]): Promise<string | null> {
  await c.query('savepoint sp');
  try {
    await c.query(sql, params);
    await c.query('release savepoint sp');
    return null;
  } catch (e) {
    await c.query('rollback to savepoint sp');
    return (e as { code?: string }).code ?? 'UNKNOWN';
  }
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ADULT_DOB = '1995-01-01';
const minorDob = () => new Date(Date.now() - 16 * 365.25 * 86_400_000).toISOString().slice(0, 10);

const insertPlayer = (
  c: pg.Client,
  n: number,
  o: { shirt?: number; status?: string; dob?: string; guardian?: boolean; optIn?: boolean } = {},
) =>
  failsWith(
    c,
    `insert into core.players (id, full_name, position, shirt_number, status, email, date_of_birth, guardian_consent, public_opt_in)
     values ($1, $2, 'MID', $3, $4, $5, $6, $7, $8)`,
    [
      id(n),
      `Fake Player ${n}`,
      o.shirt ?? n,
      o.status ?? 'active',
      `fake.player${n}@pintfc.test`,
      o.dob ?? ADULT_DOB,
      o.guardian ?? false,
      o.optIn ?? true,
    ],
  );

describe('db foundation: constraints', () => {
  it('CON-1 only one season can be current', async () => {
    await expectCoreSchemaReady(db);
    await db.ownerTx(async (c) => {
      const ins = (name: string, cur: boolean) =>
        failsWith(c, "insert into core.seasons (name, starts_on, ends_on, is_current) values ($1, '2026-08-01', '2027-05-31', $2)", [name, cur]);
      expect(await ins('2026-27', true)).toBeNull();
      expect(await ins('2025-26', false)).toBeNull();
      expect(await ins('2027-28', true)).toBe('23505');
    });
  });

  it('CON-2 only one team can be ours', async () => {
    await expectCoreSchemaReady(db);
    await db.ownerTx(async (c) => {
      const ins = (name: string, us: boolean) =>
        failsWith(c, "insert into core.teams (name, short_name, crest_url, is_us) values ($1, $1, 'placeholder', $2)", [name, us]);
      expect(await ins('PINT FC', true)).toBeNull();
      expect(await ins('Rovers', false)).toBeNull();
      expect(await ins('Impostors', true)).toBe('23505');
    });
  });

  it('CON-3 active players have unique shirt numbers; archived players may reuse one', async () => {
    await expectCoreSchemaReady(db);
    await db.ownerTx(async (c) => {
      expect(await insertPlayer(c, 1, { shirt: 9 })).toBeNull();
      expect(await insertPlayer(c, 2, { shirt: 9 })).toBe('23505');
      expect(await insertPlayer(c, 3, { shirt: 9, status: 'archived' })).toBeNull();
      expect(await insertPlayer(c, 4, { shirt: 100 })).toBe('23514');
    });
  });

  it('CON-4 a minor cannot opt in to public visibility without guardian consent', async () => {
    await expectCoreSchemaReady(db);
    await db.ownerTx(async (c) => {
      expect(await insertPlayer(c, 1, { dob: minorDob(), guardian: false, optIn: true })).toBe('PF422');
      expect(await insertPlayer(c, 2, { dob: minorDob(), guardian: true, optIn: true })).toBeNull();
      expect(await insertPlayer(c, 3, { dob: minorDob(), guardian: false, optIn: false })).toBeNull();
      expect(await insertPlayer(c, 4, { dob: ADULT_DOB, guardian: false, optIn: true })).toBeNull();
      // the same rule on UPDATE
      expect(await failsWith(c, 'update core.players set public_opt_in = true where id = $1', [id(3)])).toBe('PF422');
      expect(await failsWith(c, 'update core.players set guardian_consent = false where id = $1', [id(2)])).toBe('PF422');
    });
  });

  it('CON-5 one answer per player per match; reason is at most 140 characters; answer is one of three', async () => {
    await expectCoreSchemaReady(db);
    await db.ownerTx(async (c) => {
      await c.query("insert into core.seasons (id, name, starts_on, ends_on, is_current) values ($1, 's', '2026-08-01', '2027-05-31', true)", [id(900)]);
      await c.query("insert into core.competitions (id, season_id, name, kind) values ($1, $2, 'League', 'league')", [id(901), id(900)]);
      await c.query("insert into core.venues (id, name, city) values ($1, 'Fake Park', 'Newark')", [id(902)]);
      await c.query("insert into core.teams (id, name, short_name, crest_url, is_us) values ($1, 'Rovers', 'ROV', 'placeholder', false)", [id(903)]);
      await c.query(
        "insert into core.matches (id, season_id, competition_id, opponent_id, venue_id, home_away, kickoff_at) values ($1, $2, $3, $4, $5, 'home', now() + interval '3 days')",
        [id(904), id(900), id(901), id(903), id(902)],
      );
      expect(await insertPlayer(c, 1)).toBeNull();

      const rsvp = (answer: string, reason: string | null) =>
        failsWith(c, 'insert into core.rsvps (match_id, player_id, answer, reason) values ($1, $2, $3, $4)', [id(904), id(1), answer, reason]);
      expect(await rsvp('going', 'x'.repeat(141))).toBe('23514');
      expect(await rsvp('going', 'x'.repeat(140))).toBeNull();
      expect(await rsvp('maybe', null)).toBe('23505'); // second row for the same player and match
      expect(await rsvp('coming', null)).toBe('22P02'); // not a valid answer
    });
  });

  it('CON-6 a published result must carry its published_at time', async () => {
    await expectCoreSchemaReady(db);
    await db.ownerTx(async (c) => {
      await c.query("insert into core.seasons (id, name, starts_on, ends_on, is_current) values ($1, 's', '2026-08-01', '2027-05-31', true)", [id(900)]);
      await c.query("insert into core.competitions (id, season_id, name, kind) values ($1, $2, 'League', 'league')", [id(901), id(900)]);
      await c.query("insert into core.venues (id, name, city) values ($1, 'Fake Park', 'Newark')", [id(902)]);
      await c.query("insert into core.teams (id, name, short_name, crest_url, is_us) values ($1, 'Rovers', 'ROV', 'placeholder', false)", [id(903)]);
      await c.query(
        "insert into core.matches (id, season_id, competition_id, opponent_id, venue_id, home_away, kickoff_at, status) values ($1, $2, $3, $4, $5, 'home', now() - interval '3 days', 'played')",
        [id(904), id(900), id(901), id(903), id(902)],
      );
      expect(await failsWith(c, 'insert into core.results (match_id, goals_for, goals_against, published) values ($1, 2, 1, true)', [id(904)])).toBe('23514');
      expect(await failsWith(c, 'insert into core.results (match_id, goals_for, goals_against, published, published_at) values ($1, 2, 1, true, now())', [id(904)])).toBeNull();
    });
  });
});
