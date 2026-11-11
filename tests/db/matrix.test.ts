import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectCoreSchemaReady, type TestDb } from '../helpers/db';
import { CORE_TABLES, MATRIX, type MatrixRow } from './matrix';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db?.close();
});

async function outcome(r: MatrixRow): Promise<string> {
  let res;
  if (r.op === 'select' && (r.kind === 'table' || r.kind === 'view')) {
    const sql = `select * from ${r.object} limit 1`;
    res = r.role === 'postgres' ? await db.owner.run(sql) : await db.asRole(r.role).run(sql);
    if (res.error === null) return 'allow';
    return res.error.code === '42501' ? 'deny' : `error ${res.error.code}`;
  }
  if (r.kind === 'schema') {
    res = await db.owner.run('select has_schema_privilege($1, $2, $3) as ok', [r.role, r.object, 'USAGE']);
  } else if (r.kind === 'function') {
    res = await db.owner.run('select has_function_privilege($1, $2, $3) as ok', [r.role, r.object, 'EXECUTE']);
  } else {
    res = await db.owner.run('select has_table_privilege($1, $2, $3) as ok', [
      r.role,
      r.object,
      r.op.toUpperCase(),
    ]);
  }
  if (res.error) return `error ${res.error.code}`;
  return res.rows[0].ok === true ? 'allow' : 'deny';
}

describe('db foundation: access matrix', () => {
  it('MATRIX-1 every role × object × operation in the access matrix behaves as listed', async () => {
    await expectCoreSchemaReady(db);
    const wrong: string[] = [];
    for (const r of MATRIX) {
      const got = await outcome(r);
      if (got !== r.expect) wrong.push(`${r.role} ${r.op} ${r.object}: expected ${r.expect}, got ${got}`);
    }
    expect(wrong).toEqual([]);
  });

  it('MATRIX-2 every table, view and function appears in the matrix', async () => {
    const res = await db.owner.run(`
      select n.nspname || '.' || c.relname as obj
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname in ('core', 'public') and c.relkind in ('r', 'v', 'm', 'p', 'f')
      union
      select n.nspname || '.' || p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('core', 'public')
         and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       order by 1`);
    expect(res.error).toBeNull();
    const inDb = res.rows.map((r) => String(r.obj));
    const inMatrix = [
      ...new Set(
        MATRIX.filter((r) => r.kind !== 'schema').map((r) => r.object.replace(/\(.*\)$/, '')),
      ),
    ].sort();
    expect(inDb.filter((o) => !inMatrix.includes(o)), 'in the database but not in the matrix').toEqual([]);
    expect(inMatrix.filter((o) => !inDb.includes(o)), 'in the matrix but not in the database').toEqual([]);
    expect(inDb.length).toBeGreaterThanOrEqual(CORE_TABLES.length);
  });

  it('DB-DEFAULTS-1 new tables and functions get no grants for anon, authenticated or PUBLIC', async () => {
    await expectCoreSchemaReady(db);
    await db.ownerTx(async (c) => {
      await c.query('create table public.zz_probe (id int)');
      await c.query('create table core.zz_probe (id int)');
      await c.query('create function public.zz_fn() returns int language sql as $$ select 1 $$');
      await c.query('create function core.zz_fn() returns int language sql as $$ select 1 $$');

      const tbl = await c.query(`
        select r.rolname, t.obj, has_table_privilege(r.rolname, t.obj, 'SELECT')
                                 or has_table_privilege(r.rolname, t.obj, 'INSERT') as any_priv
          from (values ('anon'), ('authenticated')) r(rolname),
               (values ('public.zz_probe'), ('core.zz_probe')) t(obj)`);
      expect(tbl.rows.filter((r) => r.any_priv)).toEqual([]);

      const fn = await c.query(`
        select p.oid::regprocedure::text as fn, a.grantee
          from pg_proc p,
               aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
         where p.proname = 'zz_fn' and a.privilege_type = 'EXECUTE'
           and (a.grantee = 0
                or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))`);
      expect(fn.rows).toEqual([]);
    });
  });

  it('DB-RLS-1 row level security is on for every core table and hides rows even after a mistaken grant', async () => {
    await expectCoreSchemaReady(db);
    const flags = await db.owner.run(
      "select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'core' and c.relkind = 'r' and not c.relrowsecurity",
    );
    expect(flags.rows, 'tables without RLS').toEqual([]);

    await db.ownerTx(async (c) => {
      await c.query(
        `insert into core.players (id, full_name, position, shirt_number, email, date_of_birth)
         values ('22222222-2222-4222-8222-222222222222', 'Test Player', 'MID', 7, 'test.player@pintfc.test', '1995-01-01')`,
      );
      // simulate a mistaken grant: the second lock (RLS, no policies) must still hide the row
      await c.query('grant usage on schema core to anon');
      await c.query('grant select on core.players to anon');
      await c.query('set local role anon');
      const seen = await c.query('select count(*)::int as n from core.players');
      await c.query('reset role');
      const real = await c.query('select count(*)::int as n from core.players');
      expect(real.rows[0].n).toBe(1);
      expect(seen.rows[0].n).toBe(0);
    });
  });
});
