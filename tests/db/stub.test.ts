import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db?.close();
});

const SUB = '11111111-1111-4111-8111-111111111111';

describe('db foundation: auth stub', () => {
  it('DB-STUB-1 auth.uid() returns the sub claim set by SET LOCAL request.jwt.claims', async () => {
    const res = await db
      .asRole('authenticated', { sub: SUB })
      .run("select auth.uid() as uid, auth.jwt() ->> 'sub' as jwt_sub");
    expect(res.error).toBeNull();
    expect(res.rows[0].uid).toBe(SUB);
    expect(res.rows[0].jwt_sub).toBe(SUB);

    // nothing leaks to the next request: a visitor has no uid
    const anon = await db.asRole('anon').run('select auth.uid() as uid');
    expect(anon.error).toBeNull();
    expect(anon.rows[0].uid).toBeNull();
  });

  it('DB-STUB-2 roles anon, authenticated and service_role exist; auth.sessions is closed to anon and authenticated', async () => {
    const roles = await db.owner.run(
      "select rolname from pg_roles where rolname in ('anon','authenticated','service_role') order by 1",
    );
    expect(roles.rows.map((r) => r.rolname)).toEqual(['anon', 'authenticated', 'service_role']);

    for (const role of ['anon', 'authenticated'] as const) {
      const res = await db.asRole(role, { sub: SUB }).run('select 1 from auth.sessions limit 1');
      expect(res.error?.code, `${role} must not read auth.sessions`).toBe('42501');
    }
  });
});
