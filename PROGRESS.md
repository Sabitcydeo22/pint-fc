# PROGRESS

## session-01 Ã¢â‚¬â€ workspace-gates (2026-11-11)

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
- Embedded Postgres helper: `tests/helpers/pg.ts` exports `startPg()` Ã¢â€ â€™ `{ port, url, stop }` (user/password `postgres`, random port, about 10 s to start).
- `next build` rewrites `tsconfig.json` (adds `.next/dev/types/**/*.ts`) and creates `next-env.d.ts` and `tsconfig.tsbuildinfo`; these are untracked and not in `.gitignore` yet (`.gitignore` is not in session 01's file list: ask the owner).
- `npm audit` reports vulnerabilities from the CLI and framework dependencies; not acted on.

## session-02 Ã¢â‚¬â€ db-foundation (2026-11-11)

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

## session-03 â€” shared-rules (2026-11-11)

**Done**
- `src/lib/time.ts`, `errors.ts`, `permissions.ts`, `privacy.ts`, `clock.ts`, `poll.ts`, `schemas.ts`, `log.ts` and `supabase/migrations/0002_time_rules.sql` (`core.rsvp_cutoff`, `core.rsvp_is_open`).
- 16 new tests: 15 unit tests in 8 files (`tests/unit/`), the shared case table `tests/unit/cutoff-cases.ts` (36 cases), and the db parity test `tests/db/rules.test.ts`. They are AC-2.1.6 and RULE-1 to RULE-11 (RULE-1 has a unit half and a db half; RULE-6 has four tests).
- Owner-approved edit outside the plan's file list: two rows added to `CORE_FUNCTIONS` in `tests/db/matrix.ts` (MATRIX-2 needs every `core` function listed).

**Proof**
- RED first, with skeleton modules returning empty values and an empty placeholder migration: 15 unit tests failed with AssertionError (for example `expected '' to be 'Sat 14 Nov, 7:00 PM EST'`, `expected "vi.fn()" to be called 1 times, but got 0 times`); the db parity test failed with an AssertionError listing `function core.rsvp_cutoff(timestamp with time zone) does not exist`.
- GREEN: unit 16 passed (15 new + GATE-1); db 15 passed (14 + the new parity test).
- Mutation check: changing "closed at the cutoff" to "open at the cutoff" in both TypeScript and SQL made 3 unit tests and the db parity test (18 mismatches) fail; the mutation was removed afterwards.
- Exit gate output is in the session transcript.

**Decisions** (proposed; `DECISIONS.md` is not on this session's file list, so they are NOT yet in it â€” the owner decides)
- D-39 ISO strings given to the time rules must carry a zone (`Z` or an offset); a bare local time is a RangeError â€” a device-zone reading is the bug this module prevents.
- D-40 The privacy scanner flags KEYS `email, phone, date_of_birth/dob/birthdate, rsvp, rsvps, answer(s), reason, attendees, attendance, going, maybe, not_going, no_answer` at any depth, and email/phone-looking VALUES. `rsvp_open` (a flag about the match) is allowed. Plain dates such as `played_on` are allowed: only birth-date KEYS are flagged, because a date value alone cannot be told from a match date.
- D-41 `can()` gives an archived player no permissions at all, not even `read_public` (rules.md); `assertCan` answers visitors with UNAUTHENTICATED (401) and players with FORBIDDEN (403).
- D-42 The logger replaces sensitive KEYS (body, cookies, tokens, passwords, email, phone, date of birth, reason, authorization, secrets) and masks email/JWT/Bearer text inside any string; Error objects are logged by name only.
- D-43 Poller: a timer chain, not `setInterval`; first run 10 s after start, refetch at once when the tab becomes visible, 20 s after an error, never two runs at once.
- D-44 Countdown uses whole seconds, rounded down; at exactly kickoff (or after) it is `kickedOff`.
- D-45 `uuidSchema` is `z.guid()` (any 8-4-4-4-12 hex), because the seed uses fixed ids that are not RFC version-4 ids.
- D-46 `core.rsvp_cutoff` and `core.rsvp_is_open` are `STABLE`, not `IMMUTABLE`, and live in `core`: only the owner roles can execute them; later views/functions call them.

**Next session needs to know** (public API of the shared rules)
- `time.ts`: `CLUB_TZ`, `RSVP_CUTOFF_MS`, `toMs(instant)`, `rsvpCutoff(kickoff): Date`, `isRsvpOpen({ now, kickoff, status }): boolean`, `formatKickoff(instant): string` ("Sat 14 Nov, 7:00 PM EST"), `countdown(now, kickoff): { kickedOff: true } | { kickedOff: false, days, hours, minutes, seconds }`. `Instant = Date | number | ISO string with zone`.
- `errors.ts`: `ErrorCode`, `HTTP_STATUS`, `AppError(code, message?)`, `toErrorResponse(err, requestId): Response`, `mapDbError(err): AppError` (PF401/404/409/410/422), `newRequestId()`. Unknown errors become INTERNAL with a generic message; only the error name and a 5-character db code reach the log.
- `permissions.ts`: `Actor = { kind: 'visitor' } | { kind: 'player', id, status }`, `Action`, `can(actor, action, { playerId }?)`, `assertCan(...)`.
- `privacy.ts`: `assertNoPii(value)` (call it in every public API test and the page crawl). `clock.ts`: `createServerClock(serverNow, localNow?)` â†’ `{ offsetMs, now(), sync(serverNow) }`. `poll.ts`: `createPoller({ run, visibility?, intervalMs?, errorIntervalMs? })` â†’ `{ start(), stop() }`; `Visibility = { state(), subscribe(cb) }`.
- `schemas.ts`: `signInSchema`, `rsvpSchema`, `settingsSchema`, `uuidSchema`, `parseOrThrow(schema, data)` (throws AppError VALIDATION, message names fields only). `log.ts`: `log.info/warn/error(event, fields)`.
- Shared case table: `tests/unit/cutoff-cases.ts` (`CUTOFF_CASES`). Add new cutoff cases there so TypeScript and SQL stay in parity.
- Routes MUST be wrapped by `withApi` in session 05 (request id, `toErrorResponse`, no-store, Origin and JSON checks); it is not built yet.
- SQL: `core.rsvp_cutoff(timestamptz)`, `core.rsvp_is_open(now, kickoff, core.match_status)`; `public` functions added later can call them (owner-executed). Any new table, view or function still needs matrix rows (`tests/db/matrix.ts`).
