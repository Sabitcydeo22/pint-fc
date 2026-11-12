// Session 12 (database level): invariant 1. No view or function that a visitor (anon) or another player
// (authenticated) can use returns an email, phone, date of birth or RSVP data (AC-4.3.1, T-02, T-12).
//
// How it works: the sweep DISCOVERS every relation and function in schema `public` from the catalog (so a view added
// by a later session is covered without anyone remembering to list it), then
//   1. checks each column NAME with the same scanner the API tests use (`assertNoPii`),
//   2. reads every row as anon and as a signed-in player and looks for the seeded private VALUES (every email, phone,
//      date of birth and RSVP reason in the database) inside the JSON. Messages say WHICH object and WHICH player
//      number, never the value itself.
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertNoPii } from '../../src/lib/privacy';
import { createTestDb, type TestDb } from '../helpers/db';
import { PUBLIC_FUNCTIONS, PUBLIC_VIEWS } from './matrix';
// @ts-expect-error TS7016 plain .mjs module, typed locally
import * as seedModule from '../../scripts/seed.mjs';

const { seed, DEMO_MATCH_ID } = seedModule as unknown as {
  seed: (client: pg.Client, opts?: Record<string, unknown>) => Promise<unknown>;
  DEMO_MATCH_ID: string;
};

const PLAYER_1 = '00000001-0000-4000-8000-000000000001';
const SESSION_1 = '0000000c-0000-4000-8000-000000000001';
// a recognisable fake RSVP reason: if it ever shows up in a public result, the sweep names it
const REASON_CANARY = 'canary reason zx41 night shift';

interface Private {
  label: string; // "player 7 email" - never the value
  value: string;
}

let db: TestDb;
let secrets: Private[] = [];
const dbs: TestDb[] = [];

async function freshSeededDb(): Promise<TestDb> {
  const d = await createTestDb();
  dbs.push(d);
  const client = new pg.Client({ connectionString: d.url });
  await client.connect();
  try {
    await seed(client);
  } finally {
    await client.end();
  }
  return d;
}

/** Fake RSVPs for the demo match (the seed has none): going, maybe and not going, some with a reason. */
async function addRsvps(d: TestDb): Promise<void> {
  const answers = ['going', 'maybe', 'not_going'];
  for (let n = 1; n <= 9; n++) {
    const id = `00000001-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const answer = answers[n % 3];
    const res = await d.owner.run(
      'insert into core.rsvps (match_id, player_id, answer, reason) values ($1, $2, $3, $4)',
      [DEMO_MATCH_ID, id, answer, answer === 'not_going' ? `${REASON_CANARY} ${n}` : null],
      { commit: true },
    );
    expect(res.error, 'rsvp fixture inserted').toBeNull();
  }
  const sess = await d.owner.run(
    `insert into auth.sessions (id, user_id, not_after) values ($1, $2, now() + interval '1 hour')`,
    [SESSION_1, PLAYER_1],
    { commit: true },
  );
  expect(sess.error).toBeNull();
}

async function loadSecrets(d: TestDb): Promise<Private[]> {
  const out: Private[] = [];
  const players = await d.owner.run('select email, phone, date_of_birth::text as dob from core.players order by id');
  expect(players.error).toBeNull();
  players.rows.forEach((p, i) => {
    out.push({ label: `player ${i + 1} email`, value: String(p.email) });
    if (p.phone) out.push({ label: `player ${i + 1} phone`, value: String(p.phone) });
    out.push({ label: `player ${i + 1} date of birth`, value: String(p.dob) });
  });
  const rsvps = await d.owner.run("select player_id, reason from core.rsvps where reason is not null order by player_id");
  rsvps.rows.forEach((r, i) => out.push({ label: `rsvp reason ${i + 1}`, value: String(r.reason) }));
  expect(out.length, 'the seed holds private values to look for').toBeGreaterThan(100);
  return out;
}

function leaks(where: string, json: string, secretsToFind: Private[]): string[] {
  const hit = secretsToFind.filter((s) => json.includes(s.value));
  if (hit.length === 0) return [];
  const shown = hit.slice(0, 3).map((s) => s.label).join(', ');
  return [`${where}: contains ${hit.length} private value(s), e.g. ${shown}`];
}

interface Rel {
  name: string;
  kind: string;
  anon: boolean;
  authenticated: boolean;
  columns: string[];
}

async function listRelations(d: TestDb): Promise<Rel[]> {
  const rels = await d.owner.run(
    `select c.oid::int as oid, c.relname as name, c.relkind as kind,
            has_table_privilege('anon', c.oid, 'select') as anon,
            has_table_privilege('authenticated', c.oid, 'select') as authenticated
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'f', 'p') order by c.relname`,
  );
  expect(rels.error).toBeNull();
  const out: Rel[] = [];
  for (const r of rels.rows) {
    const cols = await d.owner.run(
      'select attname from pg_attribute where attrelid = $1 and attnum > 0 and not attisdropped order by attnum',
      [r.oid],
    );
    out.push({
      name: String(r.name),
      kind: String(r.kind),
      anon: Boolean(r.anon),
      authenticated: Boolean(r.authenticated),
      columns: cols.rows.map((c) => String(c.attname)),
    });
  }
  return out;
}

/** Every finding (empty list = clean) for everything a visitor or a signed-in player can read in `public`. */
async function sweepRelations(d: TestDb, secretsToFind: Private[]): Promise<string[]> {
  const findings: string[] = [];
  for (const rel of await listRelations(d)) {
    if (!rel.anon && !rel.authenticated) continue;
    // 1. column names
    try {
      assertNoPii(Object.fromEntries(rel.columns.map((c) => [c, null])));
    } catch (e) {
      findings.push(`public.${rel.name} (columns): ${(e as Error).message.split('\n').slice(1, 3).join(' ').trim()} ...`);
    }
    // 2. rows, as each role that can read it
    const roles: [string, 'anon' | 'authenticated', Record<string, unknown> | undefined][] = [
      ['anon', 'anon', undefined],
      ['authenticated', 'authenticated', { sub: PLAYER_1 }],
    ];
    for (const [label, role, claims] of roles) {
      if (!(role === 'anon' ? rel.anon : rel.authenticated)) continue;
      const res = await d.asRole(role, claims).run(`select to_jsonb(t) as j from public."${rel.name}" t`);
      if (res.error) {
        findings.push(`public.${rel.name} as ${label}: could not be read (${res.error.code})`);
        continue;
      }
      const json = JSON.stringify(res.rows.map((r) => r.j));
      findings.push(...leaks(`public.${rel.name} as ${label}`, json, secretsToFind));
      try {
        assertNoPii(res.rows.map((r) => r.j));
      } catch (e) {
        findings.push(`public.${rel.name} as ${label}: ${(e as Error).message.split('\n').slice(1, 3).join(' ').trim()} ...`);
      }
    }
  }
  return findings;
}

interface Fn {
  name: string;
  args: string;
  nargs: number;
  anon: boolean;
  authenticated: boolean;
}

async function listFunctions(d: TestDb): Promise<Fn[]> {
  const res = await d.owner.run(
    `select p.proname as name, pg_get_function_identity_arguments(p.oid) as args, p.pronargs::int as nargs,
            has_function_privilege('anon', p.oid, 'execute') as anon,
            has_function_privilege('authenticated', p.oid, 'execute') as authenticated
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' order by 1, 2`,
  );
  expect(res.error).toBeNull();
  return res.rows.map((r) => ({
    name: String(r.name),
    args: String(r.args),
    nargs: Number(r.nargs),
    anon: Boolean(r.anon),
    authenticated: Boolean(r.authenticated),
  }));
}

/** A function result may carry the CALLER's own data, but never another player's private values. */
async function sweepFunctions(d: TestDb, secretsToFind: Private[]): Promise<string[]> {
  const findings: string[] = [];
  const own = (s: Private) => s.label.startsWith('player 1 ');
  for (const fn of await listFunctions(d)) {
    if (fn.anon) {
      // nothing in `public` may be callable by a visitor unless it is read-only and clean: today there is no such function
      findings.push(`public.${fn.name}(${fn.args}): executable by anon (the visitor surface is views only)`);
      const res = await d.asRole('anon').run(`select to_jsonb(t) as j from public."${fn.name}"() t`);
      if (!res.error) findings.push(...leaks(`public.${fn.name} as anon`, JSON.stringify(res.rows), secretsToFind));
    }
    if (fn.authenticated && fn.nargs === 0) {
      const res = await d.asRole('authenticated', { sub: PLAYER_1, session_id: SESSION_1 }).run(`select to_jsonb(t) as j from public."${fn.name}"() t`);
      if (res.error) {
        findings.push(`public.${fn.name}() as player 1: could not be called (${res.error.code})`);
        continue;
      }
      const json = JSON.stringify(res.rows.map((r) => r.j));
      findings.push(...leaks(`public.${fn.name}() as player 1`, json, secretsToFind.filter((s) => !own(s))));
    }
  }
  return findings;
}

beforeAll(async () => {
  db = await freshSeededDb();
  await addRsvps(db);
  secrets = await loadSecrets(db);
});

afterAll(async () => {
  for (const d of dbs) await d.close();
});

describe('invariant 1 at the database', () => {
  it('AC-4.3.1 [db] no public response contains email, phone, date of birth or RSVP', async () => {
    const findings = await sweepRelations(db, secrets);
    expect(findings, 'private data readable through public views').toEqual([]);
  });

  it('T-02 [db] no view or function exposes email, phone or date of birth to others', async () => {
    const viewFindings = await sweepRelations(db, secrets.filter((s) => !s.label.startsWith('rsvp')));
    expect(viewFindings, 'contact data readable through public views').toEqual([]);
    const fnFindings = await sweepFunctions(db, secrets);
    expect(fnFindings, 'other players private data reachable through public functions').toEqual([]);
  });

  it('T-12 [db] a visitor can read no RSVP data: not the table, not a view, not a function', async () => {
    const direct = await db.asRole('anon').run('select * from core.rsvps');
    expect(direct.error?.code, 'anon cannot read the rsvps table').toBe('42501');
    const viaPlayer = await db.asRole('authenticated', { sub: PLAYER_1 }).run('select * from core.rsvps');
    expect(viaPlayer.error?.code, 'a signed-in player cannot read the rsvps table either').toBe('42501');
    const findings = (await sweepRelations(db, secrets)).filter((f) => f.includes('rsvp'));
    expect(findings).toEqual([]);
    // a COUNT or a flag about RSVPs is RSVP data too (a key such as going_count is not caught by assertNoPii's key list)
    const rsvpKey = /rsvp|attend|going|maybe|answer|reason|respon/i;
    const badColumns = (await listRelations(db))
      .filter((r) => r.anon || r.authenticated)
      .flatMap((r) => r.columns.filter((c) => rsvpKey.test(c) && c !== 'rsvp_open').map((c) => `public.${r.name}.${c}`));
    expect(badColumns, 'public columns that look like RSVP data (only the match flag rsvp_open is allowed)').toEqual([]);
    // the sweep really covers the whole public surface the matrix knows about
    const names = (await listRelations(db)).map((r) => r.name);
    for (const v of PUBLIC_VIEWS) expect(names, `${v} is swept`).toContain(v.replace('public.', ''));
    const fns = (await listFunctions(db)).map((f) => `public.${f.name}(${f.args.split(',').map((a) => a.trim().split(' ').pop()).filter(Boolean).join(',')})`);
    for (const f of PUBLIC_FUNCTIONS) expect(fns, `${f.object} is swept`).toContain(f.object);
  });
});
