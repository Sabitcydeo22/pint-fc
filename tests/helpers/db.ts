import pg from 'pg';
import { expect, inject } from 'vitest';
import { CORE_TABLES, type Role } from '../db/matrix';

declare module 'vitest' {
  export interface ProvidedContext {
    pgBaseUrl: string;
  }
}

export interface Claims {
  sub?: string;
  session_id?: string;
  [key: string]: unknown;
}

export interface RunResult {
  rows: Record<string, unknown>[];
  error: { code: string; message: string } | null;
}

export interface RunOptions {
  /** Commit instead of rolling back (default: roll back, so tests stay independent). */
  commit?: boolean;
}

export interface TestDb {
  name: string;
  url: string;
  /** Run SQL as the owner (postgres). */
  owner: { run: (sql: string, params?: unknown[], opts?: RunOptions) => Promise<RunResult> };
  /**
   * Run SQL the way PostgREST does: one transaction, SET LOCAL ROLE <role>,
   * request.jwt.claims (and request.jwt.claim.sub) set from `claims`.
   * Errors do not throw; they come back as { error: { code, message } }.
   */
  asRole: (
    role: Role,
    claims?: Claims,
  ) => { run: (sql: string, params?: unknown[], opts?: RunOptions) => Promise<RunResult> };
  /** Owner transaction for multi-step tests (always rolled back at the end). */
  ownerTx: <T>(fn: (client: pg.Client) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
}

const ROLES: readonly Role[] = ['anon', 'authenticated', 'service_role', 'postgres'];
let counter = 0;

async function runAs(
  url: string,
  role: Role,
  claims: Claims | undefined,
  sql: string,
  params: unknown[] | undefined,
  opts: RunOptions | undefined,
): Promise<RunResult> {
  if (!ROLES.includes(role)) throw new Error(`unknown role ${role}`);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  let committed = false;
  try {
    await client.query('begin');
    if (role !== 'postgres') await client.query(`set local role ${role}`);
    const json = claims ? JSON.stringify({ role, ...claims }) : '';
    await client.query(
      "select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)",
      [json, claims?.sub ?? ''],
    );
    const res = await client.query(sql, params);
    if (opts?.commit) {
      await client.query('commit');
      committed = true;
    }
    return { rows: res.rows as Record<string, unknown>[], error: null };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { rows: [], error: { code: err.code ?? 'UNKNOWN', message: err.message ?? String(e) } };
  } finally {
    if (!committed) await client.query('rollback').catch(() => undefined);
    await client.end();
  }
}

/** A fresh database for one test file: a copy of the migrated template (see db-global-setup.ts). */
export async function createTestDb(): Promise<TestDb> {
  const base = inject('pgBaseUrl');
  const name = `t_${process.pid}_${++counter}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query(`create database ${name} template pintfc_template`);
  await admin.end();
  const url = `${base}/${name}`;

  return {
    name,
    url,
    owner: { run: (sql, params, opts) => runAs(url, 'postgres', undefined, sql, params, opts) },
    asRole: (role, claims) => ({
      run: (sql, params, opts) => runAs(url, role, claims, sql, params, opts),
    }),
    ownerTx: async (fn) => {
      const client = new pg.Client({ connectionString: url });
      await client.connect();
      try {
        await client.query('begin');
        return await fn(client);
      } finally {
        await client.query('rollback').catch(() => undefined);
        await client.end();
      }
    },
    close: async () => {
      const a = new pg.Client({ connectionString: `${base}/postgres` });
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}

/** Assertion used at the top of schema-dependent tests, so a missing schema fails loudly and clearly. */
export async function expectCoreSchemaReady(db: TestDb): Promise<void> {
  const res = await db.owner.run(
    "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'core' and c.relkind = 'r' order by 1",
  );
  expect(res.error).toBeNull();
  expect(res.rows.map((r) => r.relname)).toEqual([...CORE_TABLES]);
}
