// Database access for server code (docs/design/architecture.md, D-08).
// The app talks to Postgres ONLY as role `anon` or `authenticated`, inside a transaction that sets
// the same JWT claims PostgREST would set. So the app has no more power than a visitor or a player,
// and a request made directly against the REST API is held to the same rules.
import pg from 'pg';

let pool: pg.Pool | undefined;

function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    pool = new pg.Pool({ connectionString: url, max: 5 });
    pool.on('error', () => undefined); // an idle connection dropping must not crash the server
  }
  return pool;
}

export type DbRole = 'anon' | 'authenticated';
export interface DbClaims {
  sub: string;
  session_id: string;
}

/**
 * Runs `fn` in one transaction as `role`, with `claims` set like PostgREST sets them.
 * Commits if `fn` returns, rolls back if it throws (the error is passed on unchanged).
 */
export async function withDb<T>(role: DbRole, claims: DbClaims | null, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  if (role !== 'anon' && role !== 'authenticated') throw new Error('unknown database role');
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${role}`);
    const json = claims ? JSON.stringify({ role, ...claims }) : '';
    await client.query(
      "select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)",
      [json, claims?.sub ?? ''],
    );
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Runs SQL with the connection's own (owner) rights. ONLY for the LocalAuth stand-in, which plays the part
 * of the separate Auth service (Supabase Auth in production). Never use it for app data.
 */
export async function ownerQuery<R extends pg.QueryResultRow = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<R[]> {
  const res = await getPool().query<R>(sql, params);
  return res.rows;
}

export async function closeDb(): Promise<void> {
  const p = pool;
  pool = undefined;
  await p?.end();
}
