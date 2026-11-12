// Session 11 database tests: a player edits their own public-visibility settings, and nothing else.
// Fake players only. The functions under test are public.rpc_my_settings() and public.rpc_update_my_settings(...).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';

let db: TestDb;
afterAll(async () => {
  await db?.close();
});

const ADULT = '70000000-0000-4000-8000-000000000001';
const OTHER = '70000000-0000-4000-8000-000000000002';
const MINOR_NO = '70000000-0000-4000-8000-000000000003'; // minor without guardian consent
const MINOR_YES = '70000000-0000-4000-8000-000000000004'; // minor with guardian consent
const S = (n: number) => `71000000-0000-4000-8000-00000000000${n}`;

const yearsAgo = (years: number) => `((now() at time zone 'America/New_York')::date - interval '${years} years')::date`;

beforeAll(async () => {
  db = await createTestDb();
  const ins = await db.owner.run(
    `insert into core.players (id, full_name, position, shirt_number, status, email, phone, date_of_birth,
                               guardian_consent, public_opt_in, show_photo, show_nationality, show_stats)
     values
       ($1, 'Fake Adult',    'MID', 5, 'active', 'fake.adult@pintfc.test',   '+1-555-0101', ${yearsAgo(30)}, false, true,  false, false, false),
       ($2, 'Fake Other',    'DEF', 6, 'active', 'fake.other@pintfc.test',   '+1-555-0102', ${yearsAgo(30)}, false, true,  true,  true,  true),
       ($3, 'Fake MinorNo',  'FWD', 7, 'active', 'fake.minorno@pintfc.test', '+1-555-0103', ${yearsAgo(16)}, false, false, false, false, false),
       ($4, 'Fake MinorYes', 'FWD', 8, 'active', 'fake.minoryes@pintfc.test','+1-555-0104', ${yearsAgo(16)}, true,  false, false, false, false)`,
    [ADULT, OTHER, MINOR_NO, MINOR_YES],
    { commit: true },
  );
  expect(ins.error).toBeNull();
  for (const [i, user] of [ADULT, OTHER, MINOR_NO, MINOR_YES].entries()) {
    const res = await db.owner.run(
      `insert into auth.sessions (id, user_id, not_after) values ($1, $2, now() + interval '1 hour')`,
      [S(i + 1), user],
      { commit: true },
    );
    expect(res.error).toBeNull();
  }
});

const claimsOf = (user: string) => ({ sub: user, session_id: S([ADULT, OTHER, MINOR_NO, MINOR_YES].indexOf(user) + 1) });
const as = (user: string) => db.asRole('authenticated', claimsOf(user));
const mine = (user: string) => as(user).run('select * from public.rpc_my_settings()');
const update = (user: string, args: string, params: unknown[] = []) =>
  as(user).run(`select * from public.rpc_update_my_settings(${args})`, params, { commit: true });
const rowOf = async (id: string) =>
  (await db.owner.run('select full_name, status, shirt_number, guardian_consent, public_opt_in, show_photo, show_nationality, show_stats, email, date_of_birth::text as dob from core.players where id = $1', [id])).rows[0];

describe('rpc_my_settings and rpc_update_my_settings', () => {
  it('SETTINGS-READ-1 [db] rpc_my_settings returns the caller\'s own flags and email, and nothing else', async () => {
    const res = await mine(ADULT);
    expect(res.error).toBeNull();
    expect(res.rows).toEqual([
      {
        public_opt_in: true,
        show_photo: false,
        show_nationality: false,
        show_stats: false,
        is_minor: false,
        guardian_consent: false,
        email: 'fake.adult@pintfc.test',
      },
    ]);
    const minor = await mine(MINOR_NO);
    expect(minor.rows).toMatchObject([{ is_minor: true, guardian_consent: false, public_opt_in: false }]);
  });

  it('SETTINGS-READ-2 [db] a visitor, or a token without a live session, gets PF401', async () => {
    const anon = await db.asRole('anon').run('select * from public.rpc_my_settings()');
    expect(anon.error?.code).toBe('42501'); // anon holds no EXECUTE at all
    const noSession = await db.asRole('authenticated', { sub: ADULT, session_id: '20000000-0000-4000-8000-0000000000ff' }).run('select * from public.rpc_my_settings()');
    expect(noSession.error?.code).toBe('PF401');
    const noUpdate = await db.asRole('anon').run('select * from public.rpc_update_my_settings(p_show_photo => true)');
    expect(noUpdate.error?.code).toBe('42501');
  });

  it('AC-4.3.2 [db] changing a consent is saved and an omitted flag is left alone', async () => {
    const before = await rowOf(ADULT);
    const res = await update(ADULT, 'p_show_photo => true, p_show_stats => true');
    expect(res.error).toBeNull();
    expect(res.rows).toMatchObject([{ public_opt_in: true, show_photo: true, show_nationality: false, show_stats: true }]);
    const after = await rowOf(ADULT);
    expect(after).toMatchObject({ public_opt_in: true, show_photo: true, show_nationality: false, show_stats: true });
    // nothing but the consents moved
    expect({ ...after, show_photo: 0, show_stats: 0 }).toEqual({ ...before, show_photo: 0, show_stats: 0 });
    // and the public view now reflects it, on the next read
    const profile = await db.asRole('anon').run('select photo_url, appearances from public.v_player_profile where id = $1', [ADULT]);
    expect(profile.error).toBeNull();
    expect(profile.rows).toHaveLength(1);
    // an adult can switch themselves off, and then they are hidden
    expect((await update(ADULT, 'p_public_opt_in => false')).error).toBeNull();
    const hidden = await db.asRole('anon').run('select id from public.v_squad where id = $1', [ADULT]);
    expect(hidden.rows).toHaveLength(0);
    expect((await update(ADULT, 'p_public_opt_in => true')).error).toBeNull();
  });

  it('AC-4.3.2 [db] an update with no flag at all is rejected', async () => {
    const res = await update(ADULT, '');
    expect(res.error?.code).toBe('22023'); // invalid_parameter_value
  });

  it('AC-4.3.3 [db] minor without guardian consent cannot opt in', async () => {
    const res = await update(MINOR_NO, 'p_public_opt_in => true');
    expect(res.error?.code).toBe('PF422');
    expect((await rowOf(MINOR_NO)).public_opt_in).toBe(false);
    // the whole call is rejected, so a photo flag sent with it is not saved either
    const both = await update(MINOR_NO, 'p_public_opt_in => true, p_show_photo => true');
    expect(both.error?.code).toBe('PF422');
    expect((await rowOf(MINOR_NO)).show_photo).toBe(false);
    const hidden = await db.asRole('anon').run('select id from public.v_squad where id = $1', [MINOR_NO]);
    expect(hidden.rows).toHaveLength(0);
    // the other three flags are fine for that minor, and saying "not public" is fine
    const ok = await update(MINOR_NO, 'p_public_opt_in => false, p_show_photo => true');
    expect(ok.error).toBeNull();
    expect((await rowOf(MINOR_NO)).show_photo).toBe(true);
  });

  it('AC-4.3.3 [db] the function refuses a minor without consent even with the players_guard trigger switched off', async () => {
    // The trigger raises the same PF422, so with it on nothing proves the function's OWN check. Switch it off here
    // (and always back on) so the function is the only guard left.
    const MINOR_TRG = '70000000-0000-4000-8000-000000000005';
    const SESSION_TRG = S(5);
    const sql = async (text: string, params: unknown[] = []) => {
      const res = await db.owner.run(text, params, { commit: true });
      expect(res.error, `setup failed: ${text.slice(0, 40)}`).toBeNull();
    };
    await sql(
      `insert into core.players (id, full_name, position, shirt_number, status, email, phone, date_of_birth,
                                 guardian_consent, public_opt_in, show_photo, show_nationality, show_stats)
       values ($1, 'Fake MinorTrigger', 'GK', 9, 'active', 'fake.minortrg@pintfc.test', '+1-555-0105', ${yearsAgo(16)}, false, false, false, false, false)`,
      [MINOR_TRG],
    );
    await sql(`insert into auth.sessions (id, user_id, not_after) values ($1, $2, now() + interval '1 hour')`, [SESSION_TRG, MINOR_TRG]);
    await sql('alter table core.players disable trigger players_guard');
    try {
      // proof the trigger really is off: the owner can now create the state the trigger forbids, and we undo it
      await sql('update core.players set public_opt_in = true where id = $1', [MINOR_TRG]);
      await sql('update core.players set public_opt_in = false where id = $1', [MINOR_TRG]);

      const res = await db
        .asRole('authenticated', { sub: MINOR_TRG, session_id: SESSION_TRG })
        .run('select * from public.rpc_update_my_settings(p_public_opt_in => true, p_show_photo => true)', [], { commit: true });
      expect(res.error?.code).toBe('PF422');
      const row = (await db.owner.run('select public_opt_in, show_photo from core.players where id = $1', [MINOR_TRG])).rows[0];
      expect(row).toEqual({ public_opt_in: false, show_photo: false }); // nothing was written
    } finally {
      await sql('alter table core.players enable trigger players_guard');
    }
  });

  it('AC-4.3.3 [db] a minor WITH guardian consent can opt in', async () => {
    const res = await update(MINOR_YES, 'p_public_opt_in => true');
    expect(res.error).toBeNull();
    expect((await rowOf(MINOR_YES)).public_opt_in).toBe(true);
  });

  it('AC-4.3.4 [db] player cannot change another player\'s settings', async () => {
    const otherBefore = await rowOf(OTHER);
    const adultBefore = await rowOf(ADULT);

    // 1. the function has no player argument: the caller's own row is the only one it can touch
    const withId = await as(ADULT).run('select * from public.rpc_update_my_settings(p_player_id => $1, p_show_photo => false)', [OTHER]);
    expect(withId.error?.code).toBe('42883'); // no such function signature

    // 2. calling it as ADULT changes ADULT only
    expect((await update(ADULT, 'p_show_nationality => true, p_show_photo => false')).error).toBeNull();
    expect(await rowOf(OTHER)).toEqual(otherBefore);
    expect(await rowOf(ADULT)).toMatchObject({ show_nationality: true, show_photo: false });

    // 3. direct table access, as a signed-in player: denied, and nothing changes
    for (const sql of [
      `update core.players set show_photo = false where id = '${OTHER}'`,
      `update core.players set public_opt_in = false`,
      `delete from core.players where id = '${OTHER}'`,
      `select * from core.players`,
    ]) {
      const res = await as(ADULT).run(sql, [], { commit: true });
      expect(res.error?.code, sql).toBe('42501');
    }
    // 4. the public views accept no write either (v_squad is auto-updatable, so only the missing grant stops it)
    for (const sql of [
      `update public.v_squad set name = 'Fake Hacked' where id = '${OTHER}'`,
      `update public.v_player_profile set name = 'Fake Hacked'`,
    ]) {
      const res = await as(ADULT).run(sql, [], { commit: true });
      // v_squad: no grant (42501). v_player_profile joins tables, so Postgres refuses the write outright (55000).
      expect(['42501', '55000'], sql).toContain(res.error?.code);
    }
    expect(await rowOf(OTHER)).toEqual(otherBefore);
    expect((await db.asRole('anon').run('select name from public.v_squad where id = $1', [OTHER])).rows).toEqual([{ name: 'Fake Other' }]);
    void adultBefore;
  });

  it('T-06 [db] player cannot change status, guardian consent or number', async () => {
    const before = await rowOf(MINOR_NO);
    // the function has no argument for any of them
    for (const arg of ['p_status', 'p_guardian_consent', 'p_shirt_number', 'p_full_name', 'p_email', 'p_date_of_birth']) {
      const value = arg === 'p_status' ? "'archived'" : arg === 'p_guardian_consent' ? 'true' : arg === 'p_shirt_number' ? '99' : arg === 'p_date_of_birth' ? "'1990-01-01'" : "'x'";
      const res = await as(MINOR_NO).run(`select * from public.rpc_update_my_settings(${arg} => ${value})`, [], { commit: true });
      expect(res.error?.code, arg).toBe('42883');
    }
    // and no table grant either
    for (const sql of [
      `update core.players set guardian_consent = true where id = '${MINOR_NO}'`,
      `update core.players set status = 'archived' where id = '${MINOR_NO}'`,
      `update core.players set shirt_number = 99 where id = '${MINOR_NO}'`,
    ]) {
      const res = await as(MINOR_NO).run(sql, [], { commit: true });
      expect(res.error?.code, sql).toBe('42501');
    }
    // a full update of all four flags leaves every other column as it was
    expect((await update(MINOR_NO, 'p_public_opt_in => false, p_show_photo => false, p_show_nationality => false, p_show_stats => false')).error).toBeNull();
    const after = await rowOf(MINOR_NO);
    expect({ ...after, show_photo: 0, show_nationality: 0, show_stats: 0 }).toEqual({ ...before, show_photo: 0, show_nationality: 0, show_stats: 0 });
    expect(after).toMatchObject({ status: 'active', guardian_consent: false, shirt_number: 7, full_name: 'Fake MinorNo' });
  });

  it('SETTINGS-GRANT-1 [db] both functions are SECURITY DEFINER with an empty search_path and no PUBLIC execute', async () => {
    const res = await db.owner.run(
      `select p.proname, p.prosecdef, p.proconfig::text as cfg,
              has_function_privilege('public', p.oid, 'execute') as public_exec,
              has_function_privilege('anon', p.oid, 'execute') as anon_exec,
              has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('rpc_my_settings', 'rpc_update_my_settings') order by 1`,
    );
    expect(res.rows).toHaveLength(2);
    for (const r of res.rows) {
      expect(r.prosecdef, `${r.proname} security definer`).toBe(true);
      expect(String(r.cfg).replace(/\\/g, ''), `${r.proname} search_path`).toContain('search_path=""');
      expect(r.public_exec, `${r.proname} public`).toBe(false);
      expect(r.anon_exec, `${r.proname} anon`).toBe(false);
      expect(r.auth_exec, `${r.proname} authenticated`).toBe(true);
    }
  });
});
