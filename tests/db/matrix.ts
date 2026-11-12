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

/** Functions in `public` (the REST surface): who may execute them. Added by session 05 and later. */
export const PUBLIC_FUNCTIONS: { object: string; allow: Role[] }[] = [
  { object: 'public.rpc_me()', allow: ['authenticated', 'service_role', 'postgres'] }, // session 05
];

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
  // public.rpc_* functions: only the listed roles may execute
  ...PUBLIC_FUNCTIONS.flatMap((f) =>
    (['anon', 'authenticated', 'service_role', 'postgres'] as Role[]).map((r) =>
      row(r, f.object, 'function', 'execute', f.allow.includes(r) ? 'allow' : 'deny'),
    ),
  ),
  // public.v_* views: added by sessions 07 and later.
];
