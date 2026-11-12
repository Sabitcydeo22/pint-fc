import { afterAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { CORE_FUNCTIONS_OPEN_TO_VIEWS } from './matrix';

const dbs: TestDb[] = [];
afterAll(async () => {
  for (const d of dbs) await d.close();
});

const PID = (n: number) => `60000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const MID = (n: number) => `60000000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`;
const SEASON = '60000000-0000-4000-8000-000000000001';
const LEAGUE = '60000000-0000-4000-8000-000000000002';
const VENUE = '60000000-0000-4000-8000-000000000003';
const OPP = '60000000-0000-4000-8000-000000000004';

type Pos = 'GK' | 'DEF' | 'MID' | 'FWD';
interface P {
  n: number;
  name: string;
  pos: Pos;
  shirt: number;
  status?: 'active' | 'archived';
  /** birth date as an SQL expression */
  dob?: string;
  optIn?: boolean;
  consent?: boolean;
  photo?: boolean;
  nationality?: boolean;
  stats?: boolean;
  /**
   * Insert with the players_guard trigger switched off, to build a state the trigger normally makes impossible
   * (a minor who is opted in WITHOUT guardian consent). The visibility rule must hide them anyway: it may not rely
   * on the trigger (defence in depth).
   */
  unguarded?: boolean;
}

// "today" in the club zone minus N years (the rule counts age by the club-zone calendar)
const yearsAgo = (years: number, plusDays = 0) =>
  `((now() at time zone 'America/New_York')::date - interval '${years} years' + interval '${plusDays} days')::date`;

/** Fake players only. Defaults: active, adult (30), opted in, no extra consents. */
async function setup(players: P[], withStats = false): Promise<TestDb> {
  const db = await createTestDb();
  dbs.push(db);
  const sql = async (text: string, params: unknown[] = []) => {
    const res = await db.owner.run(text, params, { commit: true });
    expect(res.error, `setup failed: ${text.slice(0, 50)}`).toBeNull();
  };
  for (const p of players) {
    if (p.unguarded) await sql('alter table core.players disable trigger players_guard');
    await sql(
      `insert into core.players (id, full_name, position, shirt_number, status, email, phone, date_of_birth,
                                 guardian_consent, public_opt_in, show_photo, show_nationality, show_stats, photo_url, nationality)
       values ($1, $2, $3, $4, $5, $6, '+1-555-0100', ${p.dob ?? yearsAgo(30)}, $7, $8, $9, $10, $11, '/img/fake.svg', 'Fakeland')`,
      [PID(p.n), p.name, p.pos, p.shirt, p.status ?? 'active', `fake${p.n}@pintfc.test`, p.consent ?? false, p.optIn ?? true, p.photo ?? false, p.nationality ?? false, p.stats ?? false],
    );
    if (p.unguarded) await sql('alter table core.players enable trigger players_guard');
  }
  if (withStats) {
    await sql("insert into core.seasons (id, name, starts_on, ends_on, is_current) values ($1, 'Fake Season', '2026-01-01', '2026-12-31', true)", [SEASON]);
    await sql("insert into core.competitions (id, season_id, name, kind) values ($1, $2, 'Fake League', 'league')", [LEAGUE, SEASON]);
    await sql("insert into core.venues (id, name, city) values ($1, 'Fake Park', 'Fakeville')", [VENUE]);
    await sql("insert into core.teams (id, name, short_name, crest_url) values ($1, 'Fake Rovers', 'FR', 'x')", [OPP]);
    // 1,2: played + published (count); 3: played but result NOT published; 4: cancelled with a published result row
    const matches: [number, string, boolean][] = [[1, 'played', true], [2, 'played', true], [3, 'played', false], [4, 'cancelled', true]];
    for (const [n, status, published] of matches) {
      await sql(
        `insert into core.matches (id, season_id, competition_id, opponent_id, venue_id, home_away, kickoff_at, status)
         values ($1, $2, $3, $4, $5, 'home', now() - make_interval(days => $6), $7)`,
        [MID(n), SEASON, LEAGUE, OPP, VENUE, 10 * n, status],
      );
      await sql(
        `insert into core.results (match_id, goals_for, goals_against, published, published_at)
         values ($1, 1, 0, $2, case when $2 then now() else null end)`,
        [MID(n), published],
      );
    }
  }
  return db;
}

async function addStats(db: TestDb, playerN: number, lines: [number, number, number, number][]): Promise<void> {
  for (const [match, minutes, goals, assists] of lines) {
    const res = await db.owner.run(
      'insert into core.player_match_stats (match_id, player_id, minutes, goals, assists) values ($1, $2, $3, $4, $5)',
      [MID(match), PID(playerN), minutes, goals, assists],
      { commit: true },
    );
    expect(res.error).toBeNull();
  }
}

const squad = (db: TestDb, role: 'anon' | 'authenticated' = 'anon') => db.asRole(role).run('select * from public.v_squad');
const profile = (db: TestDb, role: 'anon' | 'authenticated' = 'anon') => db.asRole(role).run('select * from public.v_player_profile');

// the visibility cases: who is public and who is not
const CASES: P[] = [
  { n: 1, name: 'Fake Goalie', pos: 'GK', shirt: 1 }, // adult, active, opted in: visible
  { n: 2, name: 'Fake Optout', pos: 'DEF', shirt: 2, optIn: false }, // adult who chose to hide: hidden
  { n: 3, name: 'Fake Archived', pos: 'DEF', shirt: 3, status: 'archived' }, // archived: hidden
  { n: 4, name: 'Fake MinorYes', pos: 'MID', shirt: 4, dob: yearsAgo(16), consent: true, optIn: true }, // minor with consent and opt-in: visible
  { n: 5, name: 'Fake MinorNoConsent', pos: 'MID', shirt: 5, dob: yearsAgo(16), consent: false, optIn: false }, // minor without consent: hidden
  { n: 6, name: 'Fake MinorOptout', pos: 'FWD', shirt: 6, dob: yearsAgo(16), consent: true, optIn: false }, // minor with consent but opted out: hidden
  { n: 7, name: 'Fake AdultConsent', pos: 'FWD', shirt: 7, consent: true }, // adult with consent set: visible (consent is irrelevant to adults)
  // a minor who is opted in WITHOUT guardian consent: the trigger makes this impossible, the view must hide it anyway
  { n: 11, name: 'Fake MinorOptInNoConsent', pos: 'DEF', shirt: 11, dob: yearsAgo(16), consent: false, optIn: true, unguarded: true },
];
const VISIBLE = ['Fake Goalie', 'Fake MinorYes', 'Fake AdultConsent'];

describe('squad views', () => {
  it('AC-4.1.1 [db] squad lists active visible players grouped by position', async () => {
    const db = await setup([
      { n: 1, name: 'Fake Striker', pos: 'FWD', shirt: 9 },
      { n: 2, name: 'Fake Mid Two', pos: 'MID', shirt: 8 },
      { n: 3, name: 'Fake Keeper', pos: 'GK', shirt: 1 },
      { n: 4, name: 'Fake Back', pos: 'DEF', shirt: 4 },
      { n: 5, name: 'Fake Mid One', pos: 'MID', shirt: 6 },
    ]);
    for (const role of ['anon', 'authenticated'] as const) {
      const res = await squad(db, role);
      expect(res.error, `${role} can read the view`).toBeNull();
      // grouped by position (GK, DEF, MID, FWD), then by shirt number
      expect(res.rows.map((r) => [r.position, r.shirt_number, r.name])).toEqual([
        ['GK', 1, 'Fake Keeper'],
        ['DEF', 4, 'Fake Back'],
        ['MID', 6, 'Fake Mid One'],
        ['MID', 8, 'Fake Mid Two'],
        ['FWD', 9, 'Fake Striker'],
      ]);
      expect(res.rows[0].id).toBe(PID(3));
    }
  });

  it('AC-4.1.2 [db] archived player never appears and their profile is 404', async () => {
    const db = await setup(CASES);
    const s = await squad(db);
    expect(s.error).toBeNull();
    expect(s.rows.map((r) => r.id)).not.toContain(PID(3));
    const p = await profile(db);
    expect(p.error).toBeNull();
    expect(p.rows.map((r) => r.id)).not.toContain(PID(3)); // no row means the API answers 404
    // asking for the archived player by id returns nothing, exactly like an id that never existed
    const one = await db.asRole('anon').run('select * from public.v_player_profile where id = $1', [PID(3)]);
    const none = await db.asRole('anon').run('select * from public.v_player_profile where id = $1', [PID(99)]);
    expect(one.error).toBeNull();
    expect(one.rows).toEqual([]);
    expect(none.rows).toEqual([]);
  });

  it('AC-4.1.3 [db] minor appears only with guardian consent and opt-in', async () => {
    const db = await setup(CASES);
    for (const role of ['anon', 'authenticated'] as const) {
      const s = await squad(db, role);
      expect(s.rows.map((r) => r.name).sort(), role).toEqual([...VISIBLE].sort());
      const p = await profile(db, role);
      expect(p.rows.map((r) => r.name).sort(), role).toEqual([...VISIBLE].sort());
    }
  });

  it('AC-4.2.2 [db] photo, nationality and stats appear only when consented', async () => {
    const db = await setup(
      [
        { n: 1, name: 'Fake All', pos: 'MID', shirt: 1, photo: true, nationality: true, stats: true },
        { n: 2, name: 'Fake None', pos: 'MID', shirt: 2 },
        { n: 3, name: 'Fake PhotoOnly', pos: 'MID', shirt: 3, photo: true },
        { n: 4, name: 'Fake NatOnly', pos: 'MID', shirt: 4, nationality: true },
        { n: 5, name: 'Fake StatsOnly', pos: 'MID', shirt: 5, stats: true },
      ],
      true,
    );
    // player 1 and 5: stats lines on matches 1 and 2 (published, played), 3 (result unpublished), 4 (cancelled)
    await addStats(db, 1, [[1, 90, 2, 0], [2, 45, 1, 1], [3, 90, 5, 5], [4, 90, 7, 7]]);
    await addStats(db, 5, [[1, 30, 0, 0]]);
    await addStats(db, 2, [[1, 90, 9, 9]]); // not consented: must never show
    const res = await profile(db);
    expect(res.error).toBeNull();
    const by = (name: string) => res.rows.find((r) => r.name === name) as Record<string, unknown>;

    // consented to everything: all three present; stats count ONLY published results on played matches
    expect(by('Fake All')).toMatchObject({ photo_url: '/img/fake.svg', nationality: 'Fakeland', appearances: 2, goals: 3, assists: 1, minutes: 135 });
    // consented to nothing: all NULL (no zeros, nothing to infer from)
    expect(by('Fake None')).toMatchObject({ photo_url: null, nationality: null, appearances: null, goals: null, assists: null, minutes: null });
    // one flag at a time
    expect(by('Fake PhotoOnly')).toMatchObject({ photo_url: '/img/fake.svg', nationality: null, appearances: null });
    expect(by('Fake NatOnly')).toMatchObject({ photo_url: null, nationality: 'Fakeland', appearances: null });
    expect(by('Fake StatsOnly')).toMatchObject({ photo_url: null, nationality: null, appearances: 1, goals: 0, assists: 0, minutes: 30 });
    // consented to stats but nothing played yet: zeros, present
    const empty = await setup([{ n: 1, name: 'Fake Rookie', pos: 'GK', shirt: 1, stats: true }]);
    const e = await profile(empty);
    expect(e.rows[0]).toMatchObject({ appearances: 0, goals: 0, assists: 0, minutes: 0 });
  });

  it('SQUAD-VIEWS-1 [db] the views expose exactly the public columns and nobody can write through them', async () => {
    const db = await setup(CASES);
    const cols = {
      'public.v_squad': ['id', 'name', 'position', 'shirt_number'],
      'public.v_player_profile': ['appearances', 'assists', 'goals', 'id', 'minutes', 'name', 'nationality', 'photo_url', 'position', 'shirt_number'],
    } as const;
    for (const [view, columns] of Object.entries(cols)) {
      const res = await db.asRole('anon').run(`select * from ${view}`);
      expect(res.error).toBeNull();
      const keys = Object.keys(res.rows[0]).sort();
      expect(keys, view).toEqual([...columns].sort());
      // never a contact detail or a birth date
      expect(keys.join(' '), view).not.toMatch(/email|phone|birth|dob|guardian|opt_in|consent|status/i);
      for (const role of ['anon', 'authenticated'] as const) {
        for (const sql of [`update ${view} set name = 'Hacked'`, `delete from ${view}`]) {
          const w = await db.asRole(role).run(sql);
          // refused either by the privilege check (42501) or because the view cannot be written at all (55000)
          expect(['42501', '55000'], `${role}: ${sql}`).toContain(w.error?.code);
        }
      }
    }
    // the table underneath stays closed to visitors
    const direct = await db.asRole('anon').run('select * from core.players');
    expect(direct.error?.code).toBe('42501');
  });
});

describe('core.is_publicly_visible', () => {
  const FN = 'core.is_publicly_visible(core.players)';

  it('VIS-FN-1 [db] the rule: active, opted in, and (an adult or with guardian consent); age counts in club time', async () => {
    const db = await setup([
      ...CASES,
      { n: 8, name: 'Fake Just18', pos: 'GK', shirt: 8, dob: yearsAgo(18), consent: false }, // turned 18 today: adult, visible without consent
      { n: 9, name: 'Fake Almost18', pos: 'GK', shirt: 9, dob: yearsAgo(18, 1), consent: false, optIn: false }, // 18 tomorrow: still a minor
      { n: 10, name: 'Fake Almost18Yes', pos: 'GK', shirt: 10, dob: yearsAgo(18, 1), consent: true, optIn: true },
    ]);
    const res = await db.owner.run(`select full_name, core.is_publicly_visible(p) as visible from core.players p order by shirt_number`);
    expect(res.error).toBeNull();
    expect(res.rows.map((r) => [r.full_name, r.visible])).toEqual([
      ['Fake Goalie', true],
      ['Fake Optout', false],
      ['Fake Archived', false],
      ['Fake MinorYes', true],
      ['Fake MinorNoConsent', false],
      ['Fake MinorOptout', false],
      ['Fake AdultConsent', true],
      ['Fake Just18', true],
      ['Fake Almost18', false],
      ['Fake Almost18Yes', true],
      ['Fake MinorOptInNoConsent', false], // the guardian-consent clause, with the trigger out of the way
    ]);
  });

  it('VIS-FN-2 [db] the function is SECURITY DEFINER with an empty search_path, reads only its argument and no tables, and is granted to exactly the roles listed', async () => {
    const db = await setup([]);
    const meta = await db.owner.run(
      `select p.prosecdef, p.provolatile, p.proconfig, p.prosrc, p.pronargs, p.prorettype::regtype::text as ret
         from pg_proc p where p.oid = $1::regprocedure`,
      [FN],
    );
    expect(meta.error).toBeNull();
    const m = meta.rows[0] as { prosecdef: boolean; provolatile: string; proconfig: string[] | null; prosrc: string; pronargs: number; ret: string };
    expect(m.prosecdef, 'SECURITY DEFINER').toBe(true);
    expect(m.provolatile, 'STABLE').toBe('s');
    expect(m.proconfig, 'fixed empty search_path').toContain('search_path=""');
    expect(m.pronargs).toBe(1);
    expect(m.ret).toBe('boolean');
    // reads only its argument: no table access of any kind in the body ...
    expect(m.prosrc, 'no table access').not.toMatch(/\b(from|join|into|update|insert|delete|exists|with)\b/i);
    // ... and the only other thing it calls is the pure date helper core.is_minor
    const calls = [...m.prosrc.matchAll(/\b([a-z_]+\.[a-z_]+)\s*\(/gi)].map((c) => c[1]);
    expect(calls).toEqual(['core.is_minor']);

    // who may execute it: exactly these roles, and never PUBLIC
    const acl = await db.owner.run(
      `select coalesce(r.rolname, 'PUBLIC') as grantee
         from pg_proc p
         cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
         left join pg_roles r on r.oid = a.grantee
        where p.oid = $1::regprocedure and a.privilege_type = 'EXECUTE'
        order by 1`,
      [FN],
    );
    expect(acl.rows.map((r) => r.grantee)).toEqual(['anon', 'authenticated', 'postgres', 'service_role']);
  });

  it('VIS-FN-3 [db] anon and authenticated cannot execute ANY other core function, and the exception list holds exactly this one', async () => {
    const db = await setup([]);
    expect([...CORE_FUNCTIONS_OPEN_TO_VIEWS]).toEqual([FN]);
    const res = await db.owner.run(
      `select p.oid::regprocedure::text as fn, r.rolname,
              has_function_privilege(r.rolname, p.oid, 'EXECUTE') as can
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         cross join (values ('anon'), ('authenticated')) r(rolname)
        where n.nspname = 'core'
          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
        order by 1, 2`,
    );
    expect(res.error).toBeNull();
    expect(res.rows.length).toBeGreaterThan(10); // the helper functions of sessions 01-05 are all checked
    const open = res.rows.filter((r) => r.can).map((r) => `${r.rolname} ${r.fn}`);
    expect(open, 'core functions a visitor or player can execute').toEqual([`anon ${FN}`, `authenticated ${FN}`]);
  });
});
