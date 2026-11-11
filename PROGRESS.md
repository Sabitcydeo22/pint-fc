# PROGRESS

## session-01 â€” workspace-gates (2026-11-11)

**Done**
- Installed the approved packages at exact versions: next 16.4.6, react / react-dom 19.3.1, pg 8.23.1, zod 4.6.7 (runtime); typescript 6.0.3, @types/node 26.6.6, @types/react and @types/react-dom 19.3.0, @types/pg 8.23.1, eslint 10.14.0, eslint-config-next 16.4.6, vitest 5.1.0, @playwright/test 1.65.0, embedded-postgres 17.11.0-beta.19 (plus its Windows binary package). Chromium for Playwright installed with `npx playwright install chromium`.
- Scaffolded Next.js (App Router, strict TypeScript), eslint flat config, three Vitest configs (unit, db, api), Playwright config, `scripts/gate.mjs`, `.env.example` (names only).
- One real passing test per gate: GATE-1 (unit), GATE-2 (db, real Postgres 17), GATE-3 (api), GATE-4 (e2e, 390 px and 320 px, no horizontal overflow).

**Proof**
- Tests first: all four failed before any code existed. Unit/db/api: "Cannot find module" for `src/lib/hello`, `tests/helpers/pg`, `src/app/api/health/route`. E2E: "Couldn't find any `pages` or `app` directory".
- Exit gate output is in the session transcript: typecheck, lint, test:unit, test:db, test:api, test:e2e, plan:check and `npm run gate` all exited 0.

**Decisions**
- TypeScript pinned to 6.0.3, not 7.0.2: typescript-eslint supports TypeScript below 6.1 only (so `lint` needs it).
- embedded-postgres pinned to 17.11.0-beta.19 (Postgres 17, matching Supabase; the package has only beta tags; latest is 18).
- package.json set to `"type": "module"` so the Vitest TypeScript configs load without a warning.
- The embedded-Postgres test helper leaves its temp data directory in the OS temp folder on stop (`persistent: true`), because the project rule forbids deleting files without asking. Those folders are named `pintfc-pg-*` and can be removed by the owner.
- E2E runs `next build` then `next start` on port 3100 (tests the production build).

**Next session needs to know**
- Run one test file: `npm run test:db -- tests/db/<file>.test.ts` (same pattern for `test:unit`, `test:api`; e2e: `npm run test:e2e -- tests/e2e/<file>.spec.ts`).
- `npm run gate` runs typecheck, lint, unit, db, api, e2e and plan:check in order and stops at the first failure.
- Embedded Postgres helper: `tests/helpers/pg.ts` exports `startPg()` â†’ `{ port, url, stop }` (user/password `postgres`, random port, about 10 s to start).
- `next build` rewrites `tsconfig.json` (adds `.next/dev/types/**/*.ts`) and creates `next-env.d.ts` and `tsconfig.tsbuildinfo`; these are untracked and not in `.gitignore` yet (`.gitignore` is not in session 01's file list: ask the owner).
- `npm audit` reports vulnerabilities from the CLI and framework dependencies; not acted on.

## session-02 â€” db-foundation (2026-11-11)

**Done**
- `supabase/migrations/0001_core_schema.sql`: schema `core` (12 tables per docs/design/data.md, 6 enums, `core.is_minor`, trigger `core.players_guard`), constraints (one current season, one `is_us` team, unique active shirt numbers, minor opt-in rule, reason <= 140 chars, published result needs `published_at`), RLS enabled on every table with no policies, schema `core` closed to anon/authenticated, default privileges revoked (tables, sequences, functions, PUBLIC execute).
- `tests/helpers/auth-stub.sql`: test-only roles `anon`, `authenticated`, `service_role`, `auth.uid()`, `auth.jwt()`, `auth.sessions`, and Supabase's default grants on `public`.
- Harness: `tests/helpers/db.ts` (`createTestDb`, `asRole`, `owner`, `ownerTx`, `expectCoreSchemaReady`), `tests/helpers/db-global-setup.ts`, `tests/db/matrix.ts` (matrix as data).
- Tests: 13 new in tests/db (plus the session-01 GATE-2 test = 14 in the db run): T-01, MATRIX-1, MATRIX-2, DB-STUB-1, plus DB-STUB-2, DB-DEFAULTS-1, DB-RLS-1, CON-1..CON-6.

**Proof**
- RED first, with empty placeholder stub and migration: 13 new tests failed with AssertionError (core schema empty where 12 tables expected; role `authenticated` does not exist, code 22023).
- GREEN: `npm run test:db -- tests/db` exited 0 (5 files, 14 tests = 13 new + GATE-2).
- Mutation check: temporarily granting `select` on `core.players` to anon and disabling RLS on `core.rsvps` made MATRIX-1, T-01 and DB-RLS-1 fail; the mutation was removed afterwards.
- Exit gate output is in the session transcript.

**Decisions** (also in DECISIONS.md): D-34 to D-38.

**Next session needs to know**
- `asRole(role, claims).run(sql, params?, { commit? })` runs ONE transaction like PostgREST: `SET LOCAL ROLE <role>` plus `request.jwt.claims` and `request.jwt.claim.sub` from `claims`; it rolls back unless `commit: true`; errors never throw, they come back as `{ rows: [], error: { code, message } }`. `db.owner.run` is the same as postgres. `db.ownerTx(fn)` gives a raw client in a transaction that is always rolled back (use savepoints for expected failures, see tests/db/constraints.test.ts).
- Every test file calls `createTestDb()` in `beforeAll` (a fresh copy of the migrated template, about 0.1 s) and `db.close()` in `afterAll`. The cluster and template come from globalSetup; migrations in `supabase/migrations/*.sql` are applied in file-name order.
- Matrix format: `tests/db/matrix.ts`, rows `{ role, object, kind, op, expect }`. EVERY later table, view or function must add its rows (MATRIX-2 fails otherwise). Public views are `kind: 'view'` (select is executed as the role); functions are written with their argument types, e.g. `public.rpc_me()`.
- Real Supabase differences to keep in mind (smoke suite, session 18): the real project already has the roles, `auth.*` and its own default privileges; `auth-stub.sql` must never be applied there.
- Custom SQLSTATE used so far: `PF422` (minor needs guardian consent).
- Each `npm run test:db` run leaves two temp Postgres folders (`pintfc-pg-*`, ~39 MB each: one for gate.test.ts, one shared); the owner may delete them.
