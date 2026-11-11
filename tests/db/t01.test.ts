import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectCoreSchemaReady, type TestDb } from '../helpers/db';
import { CORE_TABLES } from './matrix';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db?.close();
});

describe('threat T-01', () => {
  it('T-01 anon cannot read any core table', async () => {
    // guard against a vacuous pass: the 12 core tables must really exist
    await expectCoreSchemaReady(db);

    const denied: string[] = [];
    for (const t of CORE_TABLES) {
      const res = await db.asRole('anon').run(`select * from core.${t} limit 1`);
      if (res.error?.code !== '42501') denied.push(`${t}: ${res.error ? res.error.code : 'READ ALLOWED'}`);
    }
    expect(denied, 'every core table must answer "permission denied" (42501) to anon').toEqual([]);

    // anon cannot even see that the schema's tables exist
    const seen = await db
      .asRole('anon')
      .run("select table_name from information_schema.tables where table_schema = 'core'");
    expect(seen.error).toBeNull();
    expect(seen.rows).toEqual([]);
  });
});
