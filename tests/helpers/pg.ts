import EmbeddedPostgres from 'embedded-postgres';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export interface TestPg {
  port: number;
  url: string;
  stop: () => Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Starts a throwaway PostgreSQL 17 on a random port.
 * The data directory lives under the OS temp folder and is deliberately LEFT BEHIND on stop
 * (project rule: never delete files; ask the owner before any cleanup).
 */
export async function startPg(): Promise<TestPg> {
  const port = await freePort();
  const databaseDir = path.join(
    os.tmpdir(),
    `pintfc-pg-${process.pid}-${Date.now()}-${port}`,
  );
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: true,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  return {
    port,
    url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`,
    stop: () => pg.stop(),
  };
}
