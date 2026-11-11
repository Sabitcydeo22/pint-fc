import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { startPg, type TestPg } from './pg';

// One Postgres 17 per `npm run test:db` run (not per test file). It holds a template database
// with the auth stub and every migration applied; each test file copies that template.
let server: TestPg | undefined;

const root = path.resolve(import.meta.dirname, '..', '..');

export async function setup(project: TestProject): Promise<void> {
  server = await startPg();
  const base = `postgresql://postgres:postgres@127.0.0.1:${server.port}`;

  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('create database pintfc_template');
  await admin.end();

  const tpl = new pg.Client({ connectionString: `${base}/pintfc_template` });
  await tpl.connect();
  try {
    const stub = path.join(root, 'tests', 'helpers', 'auth-stub.sql');
    await tpl.query(fs.readFileSync(stub, 'utf8'));

    const dir = path.join(root, 'supabase', 'migrations');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort() : [];
    for (const f of files) {
      try {
        await tpl.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      } catch (e) {
        throw new Error(`migration ${f} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await tpl.end();
  }
  project.provide('pgBaseUrl', base);
}

export async function teardown(): Promise<void> {
  await server?.stop();
}
