import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
  // two players (one active, one archived) and a third active player, committed so every run sees them
  const ins = await db.owner.run(
    `insert into core.players (id, full_name, position, shirt_number, status, email, date_of_birth) values
       ($1, 'Fake Active', 'MID', 5, 'active', 'fake.active@pintfc.test', '1995-01-01'),
       ($2, 'Fake Archived', 'MID', 6, 'archived', 'fake.archived@pintfc.test', '1995-01-01'),
       ($3, 'Fake Other', 'DEF', 7, 'active', 'fake.other@pintfc.test', '1995-01-01')`,
    [ACTIVE, ARCHIVED, OTHER],
    { commit: true },
  );
  expect(ins.error).toBeNull();
});
afterAll(async () => {
  await db?.close();
});

const ACTIVE = '10000000-0000-4000-8000-000000000001';
const ARCHIVED = '10000000-0000-4000-8000-000000000002';
const OTHER = '10000000-0000-4000-8000-000000000003';
const SESSION = '20000000-0000-4000-8000-000000000001';

async function makeSession(user: string, id: string, notAfter = "now() + interval '1 hour'"): Promise<void> {
  const res = await db.owner.run(
    `insert into auth.sessions (id, user_id, not_after) values ($1, $2, ${notAfter})`,
    [id, user],
    { commit: true },
  );
  expect(res.error).toBeNull();
}

const me = (claims?: Record<string, unknown>) => db.asRole('authenticated', claims).run('select * from public.rpc_me()');

describe('require_player and rpc_me', () => {
  it('SESSION-1 require_player accepts only an active player with a live session of their own', async () => {
    await makeSession(ACTIVE, SESSION);

    // the one good case
    const ok = await me({ sub: ACTIVE, session_id: SESSION });
    expect(ok.error).toBeNull();
    expect(ok.rows).toEqual([{ id: ACTIVE, full_name: 'Fake Active', status: 'active' }]);

    // everything else is PF401 (UNAUTHENTICATED), never another error
    const expired = '20000000-0000-4000-8000-000000000002';
    await makeSession(ACTIVE, expired, "now() - interval '1 minute'");
    const archivedSession = '20000000-0000-4000-8000-000000000003';
    await makeSession(ARCHIVED, archivedSession);
    const bad: [string, Record<string, unknown> | undefined][] = [
      ['no claims at all', undefined],
      ['sub but no session_id', { sub: ACTIVE }],
      ['session_id but no sub', { session_id: SESSION }],
      ['session id that does not exist', { sub: ACTIVE, session_id: '20000000-0000-4000-8000-0000000000ff' }],
      ['session id that is not a uuid', { sub: ACTIVE, session_id: 'not-a-uuid' }],
      ['empty session id', { sub: ACTIVE, session_id: '' }],
      ["somebody else's session", { sub: OTHER, session_id: SESSION }],
      ['expired session', { sub: ACTIVE, session_id: expired }],
      ['archived player with a live session', { sub: ARCHIVED, session_id: archivedSession }],
      ['sub that is no player', { sub: '10000000-0000-4000-8000-0000000000ee', session_id: SESSION }],
    ];
    const wrong: string[] = [];
    for (const [label, claims] of bad) {
      const res = await me(claims);
      if (res.error?.code !== 'PF401') wrong.push(`${label}: ${res.error ? res.error.code : 'ALLOWED'}`);
    }
    expect(wrong).toEqual([]);
  });

  it('T-07 revoked session token is rejected by API and database', async () => {
    // db half: the same claims work, then stop working the moment the session row is revoked
    const s = '20000000-0000-4000-8000-0000000000a1';
    await makeSession(OTHER, s);
    const claims = { sub: OTHER, session_id: s };
    expect((await me(claims)).error).toBeNull();

    const revoke = await db.owner.run('delete from auth.sessions where id = $1', [s], { commit: true });
    expect(revoke.error).toBeNull();
    const after = await me(claims);
    expect(after.error?.code).toBe('PF401');
    expect(after.rows).toEqual([]);

    // revoking ALL sessions of a player ("sign out of all devices") stops every token at once
    const a = '20000000-0000-4000-8000-0000000000b1';
    const b = '20000000-0000-4000-8000-0000000000b2';
    await makeSession(OTHER, a);
    await makeSession(OTHER, b);
    expect((await me({ sub: OTHER, session_id: a })).error).toBeNull();
    expect((await me({ sub: OTHER, session_id: b })).error).toBeNull();
    await db.owner.run('delete from auth.sessions where user_id = $1', [OTHER], { commit: true });
    expect((await me({ sub: OTHER, session_id: a })).error?.code).toBe('PF401');
    expect((await me({ sub: OTHER, session_id: b })).error?.code).toBe('PF401');
  });

  it('SESSION-2 rpc_me and require_player are closed to visitors and to direct calls', async () => {
    await makeSession(ACTIVE, '20000000-0000-4000-8000-0000000000c1');
    const claims = { sub: ACTIVE, session_id: '20000000-0000-4000-8000-0000000000c1' };

    // a visitor cannot even execute the public function
    const anon = await db.asRole('anon', claims).run('select * from public.rpc_me()');
    expect(anon.error?.code).toBe('42501');

    // a signed-in player cannot call the core helper directly (schema core is closed)
    const direct = await db.asRole('authenticated', claims).run('select core.require_player()');
    expect(direct.error?.code).toBe('42501');
  });
});
