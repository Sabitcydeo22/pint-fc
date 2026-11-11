import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { startPg } from '../helpers/pg';

describe('gate: database', () => {
  it('GATE-2 embedded Postgres starts, answers select 1 and is torn down', async () => {
    const db = await startPg();
    let stopped = false;
    try {
      const client = new pg.Client({ connectionString: db.url });
      await client.connect();
      const res = await client.query('select 1 as one');
      expect(res.rows[0].one).toBe(1);
      await client.end();
      await db.stop();
      stopped = true;

      // torn down: nothing listens on the port any more
      const again = new pg.Client({ connectionString: db.url, connectionTimeoutMillis: 2000 });
      await expect(again.connect()).rejects.toThrow();
    } finally {
      if (!stopped) await db.stop();
    }
  });
});
