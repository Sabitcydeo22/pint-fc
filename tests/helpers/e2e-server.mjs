// Starts everything the end-to-end tests need, then runs the built app (used as Playwright's webServer command):
//   1. a throwaway Postgres 17 with the auth stub and every migration, seeded with the fake data
//   2. logins for a few seeded players; the passwords go ONLY to a JSON file in the OS temp folder (never printed)
//   3. `next build`, then `next start` on the e2e port with LocalAuth (test-only) pointed at that database
// Nothing here is deleted afterwards (project rule): the temp Postgres folder and the logins file are left behind.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { createLogins, seed } from '../../scripts/seed.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const PORT = Number(process.env.E2E_PORT ?? 3100);
export const LOGINS_FILE = path.join(os.tmpdir(), 'pintfc-e2e-logins.json');
const playerId = (n) => `00000001-0000-4000-8000-${String(n).padStart(12, '0')}`;
const LOGIN_PLAYERS = { one: 1, two: 2, other: 3, archived: 41 };

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const dbPort = await freePort();
const embedded = new EmbeddedPostgres({
  databaseDir: path.join(os.tmpdir(), `pintfc-pg-e2e-${process.pid}-${Date.now()}-${dbPort}`),
  user: 'postgres',
  password: 'postgres',
  port: dbPort,
  persistent: true,
  onLog: () => {},
  onError: () => {},
});
await embedded.initialise();
await embedded.start();
const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${dbPort}/postgres`;

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
let logins;
try {
  await client.query(fs.readFileSync(path.join(root, 'tests', 'helpers', 'auth-stub.sql'), 'utf8'));
  const dir = path.join(root, 'supabase', 'migrations');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  await seed(client);
  logins = await createLogins(client, { playerIds: Object.values(LOGIN_PLAYERS).map(playerId) });
} finally {
  await client.end();
}
const byWho = {};
for (const [who, n] of Object.entries(LOGIN_PLAYERS)) byWho[who] = logins.find((l) => l.player_id === playerId(n));
fs.writeFileSync(LOGINS_FILE, JSON.stringify(byWho), { mode: 0o600 });
console.log(`e2e database ready on port ${dbPort}; ${logins.length} logins written (not shown)`);

const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  AUTH_ADAPTER: 'local',
  LOCAL_AUTH_SECRET: crypto.randomBytes(32).toString('hex'),
  SIGN_IN_MIN_MS: '400',
};
delete env.VERCEL_ENV;

const build = spawnSync('npm run build', { cwd: root, env, stdio: 'inherit', shell: true });
if (build.status !== 0) {
  await embedded.stop().catch(() => undefined);
  process.exit(build.status ?? 1);
}
const server = spawn(`npm run start -- -p ${PORT}`, { cwd: root, env, stdio: 'inherit', shell: true });
const stop = async () => {
  server.kill();
  await embedded.stop().catch(() => undefined);
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', stop);
