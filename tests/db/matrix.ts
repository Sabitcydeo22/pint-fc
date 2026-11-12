// The access matrix from docs/design/data.md, as data.
// Format: one row per [role, object, operation, expectation].
//   role      anon (visitor) | authenticated (signed-in player) | service_role | postgres (owner)
//   object    'schema.name' (functions carry their argument types: 'core.is_minor(date)')
//   kind      table | view | function | schema
//   op        select | insert | update | delete | execute | usage
//   expect    allow | deny
//
// RULE: every later session that adds a table, view or function MUST add its rows here
// (MATRIX-2 fails otherwise).

export type Role = 'anon' | 'authenticated' | 'service_role' | 'postgres';
export type Kind = 'table' | 'view' | 'function' | 'schema';
export type Op = 'select' | 'insert' | 'update' | 'delete' | 'execute' | 'usage';
export type Expect = 'allow' | 'deny';

export interface MatrixRow {
  role: Role;
  object: string;
  kind: Kind;
  op: Op;
  expect: Expect;
}

export const CORE_TABLES = [
  'competitions',
  'matches',
  'player_match_stats',
  'players',
  'results',
  'rsvps',
  'seasons',
  'standings_rows',
  'standings_snapshots',
  'teams',
  'trainings',
  'venues',
] as const;

export const CORE_FUNCTIONS = [
  'core.is_minor(date)',
  'core.players_guard()',
  'core.rsvp_cutoff(timestamptz)', // session 03
  'core.rsvp_is_open(timestamptz,timestamptz,core.match_status)', // session 03
  'core.require_player()', // session 05
] as const;

/**
 * The ONLY core function that visitors and players may execute (session 10). Postgres checks EXECUTE on a function
 * used inside a view against the CALLER, so the public views cannot call `core.is_publicly_visible` unless the
 * callers hold EXECUTE. It is a SECURITY DEFINER predicate with an empty search_path that reads only its argument
 * and no table (tests/db/squad.test.ts VIS-FN-2 checks all of that). Every other core function stays closed
 * (CORE_FUNCTIONS above, and VIS-FN-3 checks every function in the schema). Keep this list at exactly one name.
 */
export const CORE_FUNCTIONS_OPEN_TO_VIEWS = [
  'core.is_publicly_visible(core.players)', // session 10
] as const;

/** Functions in `public` (the REST surface): who may execute them. Added by session 05 and later. */
export const PUBLIC_FUNCTIONS: { object: string; allow: Role[] }[] = [
  { object: 'public.rpc_me()', allow: ['authenticated', 'service_role', 'postgres'] }, // session 05
  { object: 'public.rpc_my_settings()', allow: ['authenticated', 'service_role', 'postgres'] }, // session 11
  { object: 'public.rpc_update_my_settings(boolean,boolean,boolean,boolean)', allow: ['authenticated', 'service_role', 'postgres'] }, // session 11
  { object: 'public.rpc_rsvp_set(uuid,text,text)', allow: ['authenticated', 'service_role', 'postgres'] }, // session 13
  { object: 'public.rpc_attendance(uuid)', allow: ['authenticated', 'service_role', 'postgres'] }, // session 14
];

/** Views in `public` (the read surface for visitors and players). Added by session 07 and later. */
export const PUBLIC_VIEWS = [
  'public.v_next_match', // session 07
  'public.v_season_record', // session 08
  'public.v_latest_results', // session 08
  'public.v_standings', // session 09
  'public.v_squad', // session 10
  'public.v_player_profile', // session 10
] as const;

const PUBLIC_ROLES: Role[] = ['anon', 'authenticated'];
const OWNER_ROLES: Role[] = ['service_role', 'postgres'];
const TABLE_OPS: Op[] = ['select', 'insert', 'update', 'delete'];

const row = (role: Role, object: string, kind: Kind, op: Op, expect: Expect): MatrixRow => ({
  role,
  object,
  kind,
  op,
  expect,
});

export const MATRIX: MatrixRow[] = [
  // any core.* table: visitors and players are denied everything; owner roles can do everything
  ...CORE_TABLES.flatMap((t) => [
    ...PUBLIC_ROLES.flatMap((r) => TABLE_OPS.map((op) => row(r, `core.${t}`, 'table', op, 'deny'))),
    ...OWNER_ROLES.flatMap((r) => TABLE_OPS.map((op) => row(r, `core.${t}`, 'table', op, 'allow'))),
  ]),
  // schema core usage
  ...PUBLIC_ROLES.map((r) => row(r, 'core', 'schema', 'usage', 'deny')),
  ...OWNER_ROLES.map((r) => row(r, 'core', 'schema', 'usage', 'allow')),
  // helper functions in core: not callable from the outside world
  ...CORE_FUNCTIONS.flatMap((f) => [
    ...PUBLIC_ROLES.map((r) => row(r, f, 'function', 'execute', 'deny')),
    ...OWNER_ROLES.map((r) => row(r, f, 'function', 'execute', 'allow')),
  ]),
  // the single core function the public views call: executable by everyone the views serve
  ...CORE_FUNCTIONS_OPEN_TO_VIEWS.flatMap((f) =>
    (['anon', 'authenticated', 'service_role', 'postgres'] as Role[]).map((r) => row(r, f, 'function', 'execute', 'allow')),
  ),
  // public.rpc_* functions: only the listed roles may execute
  ...PUBLIC_FUNCTIONS.flatMap((f) =>
    (['anon', 'authenticated', 'service_role', 'postgres'] as Role[]).map((r) =>
      row(r, f.object, 'function', 'execute', f.allow.includes(r) ? 'allow' : 'deny'),
    ),
  ),
  // public.v_* views (read-only for everyone who is not the owner): added by sessions 07 and later.
  ...PUBLIC_VIEWS.flatMap((v) =>
    (['anon', 'authenticated', 'service_role', 'postgres'] as Role[]).flatMap((r) => [
      row(r, v, 'view', 'select', 'allow'),
      // the owner role always holds every privilege on its own object; nobody else may write
      ...(['insert', 'update', 'delete'] as Op[]).map((op) => row(r, v, 'view', op, r === 'postgres' ? 'allow' : 'deny')),
    ]),
  ),
];
