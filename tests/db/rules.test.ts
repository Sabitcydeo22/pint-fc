import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { isRsvpOpen, rsvpCutoff } from '../../src/lib/time';
import { CUTOFF_CASES } from '../unit/cutoff-cases';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db?.close();
});

const SQL = `select round(extract(epoch from core.rsvp_cutoff($1::timestamptz)) * 1000)::bigint::text as cutoff_ms,
                    core.rsvp_is_open($2::timestamptz, $1::timestamptz, $3::core.match_status) as open`;

describe('db rules', () => {
  it('RULE-1 TypeScript and SQL cutoff agree on every case (parity)', async () => {
    // db half: the SQL functions against the same table, and against the TypeScript rules,
    // under three different session time zones (the answer must not depend on the zone)
    const wrong: string[] = [];
    for (const zone of ['UTC', 'America/New_York', 'Australia/Lord_Howe']) {
      await db.ownerTx(async (c) => {
        await c.query(`set local time zone '${zone}'`);
        for (const k of CUTOFF_CASES) {
          let row: { cutoff_ms: string; open: boolean } | undefined;
          try {
            row = (await c.query(SQL, [k.kickoff, k.now, k.status])).rows[0];
          } catch (e) {
            wrong.push(`[${zone}] ${k.name}: ${(e as Error).message}`);
            await c.query('rollback').catch(() => undefined);
            return;
          }
          const sqlCutoff = new Date(Number(row!.cutoff_ms)).toISOString();
          const tsCutoff = rsvpCutoff(k.kickoff).toISOString();
          const tsOpen = isRsvpOpen({ now: k.now, kickoff: k.kickoff, status: k.status });
          if (sqlCutoff !== k.cutoff) wrong.push(`[${zone}] ${k.name}: SQL cutoff ${sqlCutoff}, expected ${k.cutoff}`);
          if (row!.open !== k.open) wrong.push(`[${zone}] ${k.name}: SQL open ${row!.open}, expected ${k.open}`);
          if (sqlCutoff !== tsCutoff || row!.open !== tsOpen) wrong.push(`[${zone}] ${k.name}: SQL and TypeScript disagree`);
        }
      });
    }
    expect(wrong).toEqual([]);
  });
});
