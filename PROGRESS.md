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

## session-04 — seed-data (2026-11-12)

**Done**
- `scripts/seed.mjs` (the seed and its command line), `scripts/seed-data/index.mjs` (ids, invented names, teams, venues, players, scores, standings) and `scripts/seed-data/stat-lines.mjs`.
- 5 new tests: SEED-1 and SEED-2 in `tests/db/seed.test.ts`; SEED-3, SEED-4 and SEED-5 in `tests/unit/seed-fake.test.ts`.
- No installs, no new files outside the plan's list, no change to any existing file other than `PROGRESS.md`.

**What the seed creates** (all fake): 1 current season, 2 competitions (league, friendly), 3 venues, 8 teams (1 ours), 41 players (40 active: GK 4, DEF 14, MID 14, FWD 8; plus 1 archived), 17 matches (12 played in the past: 11 league + 1 friendly; 5 upcoming: the demo match, 3 more scheduled, 1 cancelled), 12 results (10 published league + 1 published friendly + 1 saved but unpublished), stat lines for the 11 published results (14 players each, goals add up), 1 standings snapshot with 8 rows, 8 weekly trainings, 0 RSVPs. Visible to the public: 37 of the 40 active players (2 adults opted out, 1 minor without guardian consent); minor A has guardian consent and is opted in.

**Proof**
- RED first, with skeleton modules returning empty values: 5 tests failed with AssertionError (for example `expected [] to have a length of 41 but got +0`, `expected +0 to be 5400000`, `expected +0 to be 1`).
- GREEN: `tests/db/seed.test.ts` 2 passed; `tests/unit/seed-fake.test.ts` 3 passed.
- Mutation check: moving the demo kickoff 1 hour earlier, and making training ids change on every run (duplicates on rerun), made SEED-2 fail (off by exactly 3,600,000 ms) and SEED-1 fail on the idempotency comparison; both mutations were removed.
- Command line: unknown flag, a remote URL without `--allow-remote`, a bad duration and a missing database all refuse with exit 1 and never print the URL or password.
- Exit gate output is in the session transcript.

**Decisions** (proposed; `DECISIONS.md` is not on this session's file list, so they are NOT yet in it — the owner decides)
- D-47 The seed refuses any database that is not on this computer unless `--allow-remote` is passed, and never prints the connection string — an accidental run against the real project must be impossible by default.
- D-48 The demo match is the NEXT match: kickoff = now + the flag + 2 h, so its cutoff lands exactly the flag from now; the four regular upcoming matches come after it, one week apart at the same local time, the first of them cancelled.
- D-49 Dates are relative to "now": past matches are 3 + 7k days back at 19:00 club time, the season spans 120 days back to 240 days ahead, minors are 16 y 3 m and 15 y 8 m old today. The seed is valid whenever it is run, but past dates shift each run (same ids, updated rows).
- D-50 The seed only inserts or updates; it never deletes. Moving the demo match is a rerun with a new `--demo-cutoff-in`.
- D-51 Names are invented words (14 first names x 12 surnames, 41 distinct full names), checked against a deny-list of common real names; emails are `first.last@pintfc.test`, phones `+1-555-01xx` (about one in five has none).
- D-52 Id scheme: `TTTTTTTT-0000-4000-8000-NNNNNNNNNNNN`; type 1 player, 2 team, 3 venue, 4 season, 5 competition, 6 match, 7 training, 8 snapshot; matches 1..12 are past, 100 is the demo match, 101..104 are the regular upcoming ones.
- D-53 The seed's `.mjs` files have no type declarations; tests import them with a typed `import * as` and a `@ts-expect-error TS7016` comment, so no `.d.ts` file (outside this session's list) was needed.

**Next session needs to know**
- Run locally: `node scripts/seed.mjs --database-url <local url> [--demo-cutoff-in 90m]` (or set `DATABASE_URL`). In code: `import { seed, DEMO_MATCH_ID } from '../../scripts/seed.mjs'` then `await seed(connectedPgClient, { now?, demoCutoffInMs? })` (owner role); it returns row counts. `parseDuration` and `assertSafeTarget` are exported too. Session 05 can call `seed()` from its tests (the db tests use `createTestDb()`, then a `pg.Client` on `db.url`).
- Ids: `id(kind, n)` from `scripts/seed-data/index.mjs` (see D-52). Player n is `id('player', n)`; players are numbered 1..41 (41 is the archived one). Minor A is player 21 (guardian consent, opted in), minor B is player 34 (neither); adults who opted out are players 10 and 28. These are the ids session 05 must use when it creates the logins (players.id = auth user id).
- The fake-name lists are `FIRST_NAMES` and `LAST_NAMES` in `scripts/seed-data/index.mjs`. Player emails are `first.last@pintfc.test`. No passwords exist yet: session 05 generates them and writes `credentials.local.csv` (gitignored), never printed.
- The demo-match flag is `--demo-cutoff-in` (`90m`, `2h`, `45s`, `1d`); `--now <iso>` pretends it is another moment; `--allow-remote` is only for a non-local database and needs the owner's yes.
- Counts and shape: see "What the seed creates". Public views in later sessions can rely on 37 visible players, 11 published results, 1 unpublished result, and the demo match being the next match.
- Each `npm run test:db` run still leaves two temp Postgres folders (`pintfc-pg-*`); the owner may delete them.

## session-05 — auth-api (2026-11-12)

**Done**
- `supabase/migrations/0003_require_player.sql`: `core.require_player()` (security definer; raises `PF401` unless the token's `sub` and `session_id` are uuids, the session exists in `auth.sessions` for that user and has not expired, and the user is an ACTIVE player) and `public.rpc_me()` (executable by `authenticated` only).
- `src/server/auth/`: `types.ts` (the `AuthPort` interface), `local.ts` (LocalAuth, test-only), `index.ts` (`getAuth()`, `requirePlayer()`, `padTo()`), `local-store.mjs` + `local-store.d.mts` (scrypt password hashing and the `local_auth` schema, shared with the seed script).
- `src/server/db.ts` (`withDb(role, claims, fn)`, `ownerQuery`, `closeDb`), `src/lib/with-api.ts` (`withApi`, `json`, `noContent`).
- Routes: `POST /api/auth/sign-in`, `POST /api/auth/sign-out`, `POST /api/auth/sign-out-all`, `GET /api/me`; `GET /api/health` now goes through `withApi`.
- `scripts/seed.mjs`: `createLogins(client, { playerIds? })`, `writeCredentialsFile(path, logins)`, and the CLI flags `--logins` and `--credentials-file`.
- 20 new tests: db `SESSION-1`, `T-07` (db half), `SESSION-2` (`tests/db/session.test.ts`); API `AC-1.1.1`, `AC-1.1.3`, `AC-1.1.4`, `T-08`, `T-23`, `LOGINS-2` (`sign-in.test.ts`), `AC-1.6.1`, `AC-1.6.2`, `AC-1.6.3`, `T-07` (api half) (`session.test.ts`), `T-16`, `T-23`, `WITHAPI-1`, `WITHAPI-2` (`with-api.test.ts`), `AUTH-LOCAL-1`, `AUTH-LOCAL-2`, `LOGINS-1` (`local-auth.test.ts`). The `GATE-3` test now calls the health route with a `Request` (it is wrapped by `withApi`); its assertions are unchanged.
- Owner-approved edits outside the plan's file list: `tests/db/matrix.ts` (rows for `core.require_player()` and `public.rpc_me()`, plus a `PUBLIC_FUNCTIONS` table for later `rpc_*` functions), `vitest.api.config.ts` (one line: the shared-Postgres `globalSetup`), `.gitignore` (`credentials.local.csv`).

**Proof**
- RED first, with skeleton modules (routes answering 501, a do-nothing `withApi`, an empty `getAuth`, a `createLogins` that created nothing) and an empty placeholder migration: 15 API tests failed with AssertionError (`expected 501 to be 200`, `expected 501 to be 401`, `expected [Function] to throw an error`); the db tests failed with `expected { code: '42883' ... } to be null` (function does not exist) and the matrix reported the two new functions missing from the database.
- GREEN: db 7 passed, API 16 passed on the first full run; the two LOGINS tests were added afterwards and shown failing against a broken `createLogins`/`writeCredentialsFile` (41 logins created instead of 37; a repeated header line) before the real code was restored.
- Mutation check: removing the session-exists check from `require_player()`, the archived check at sign-in, the cross-origin check in `withApi`, and the live-session check in `getUser()` made 2 db tests and 6 API tests fail; all four mutations were removed afterwards.
- CLI refusals (no connection is opened): `--logins` with `--allow-remote`, and `--credentials-file` without a value, both exit 1.
- Exit gate output is in the session transcript.

**Decisions** (proposed; `DECISIONS.md` is not on this session's file list, so they are NOT yet in it — the owner decides)
- D-54 Auth sits behind an `AuthPort` interface (`signIn`, `getUser`, `signOut`, `signOutAll`); LocalAuth is a test-only adapter, and `getAuth()` refuses it whenever `VERCEL_ENV` is set (even with no `AUTH_ADAPTER`), checked on every call — a stand-in must never be able to reach production.
- D-55 LocalAuth keeps users and scrypt hashes in schema `local_auth` (created on first use, outside `core` and `public`) and sessions in `auth.sessions` — the same table the real Supabase project has, so `core.require_player()` is exercised identically.
- D-56 The session cookie is `pf_session`: one HS256 token (8 hours), `HttpOnly; SameSite=Lax; Path=/`, not `Secure` (LocalAuth runs on plain http); it is verified against the live session row on every request, so sign-out and revocation work at once.
- D-57 Every sign-in outcome, including a validation error, takes at least 400 ms (`SIGN_IN_MIN_MS`), and an unknown email still pays for a password hash — equal answer and equal timing for wrong password, unknown email and archived player.
- D-58 `withApi` for POST/PUT/PATCH/DELETE: a request whose `Origin` differs from the site's own, or is marked cross-site by `Sec-Fetch-Site`, is FORBIDDEN (403); a body or content-type that is not `application/json` is VALIDATION (400); a request with no `Origin` at all (a non-browser client) is allowed, because CSRF needs a browser. Bodies are limited to 8192 bytes, refused as VALIDATION since 413 is not in the closed code list.
- D-59 `core.require_player()` raises the one SQLSTATE `PF401` for every failure, including a `sub` or `session_id` that is not a uuid, so the API never has to guess between error kinds.
- D-60 Seed logins are opt-in (`--logins`), create only the missing ones, append passwords to `credentials.local.csv` (gitignored, never printed, never overwritten) and refuse `--allow-remote`: re-running the seed to move the demo match must never reset a student's password, and LocalAuth tables must never reach the real project.
- D-61 Password hashing and the `local_auth` schema live in one plain-JS module, `src/server/auth/local-store.mjs`, used by both LocalAuth and the seed script, so the two can never disagree on the hash format.

**Next session needs to know**
- AuthPort (`src/server/auth/types.ts`): `signIn(email, password) -> { userId, sessionId, setCookie[] } | null` (null for wrong password, unknown email and archived alike), `getUser(request) -> { userId, sessionId } | null`, `signOut(request) -> { setCookie[] }` (never fails), `signOutAll(session) -> { setCookie[] }`. Routes use `getAuth()` and `requirePlayer(request)` (throws UNAUTHENTICATED) from `src/server/auth`, never an adapter directly. The cookie name is `SESSION_COOKIE = 'pf_session'`.
- `withApi` pattern: `export const POST = withApi(async ({ request, readJson }) => { const session = await requirePlayer(request); const input = await readJson(mySchema); const rows = await withDb('authenticated', { sub: session.userId, session_id: session.sessionId }, (client) => client.query('select ... from public.rpc_xyz($1)', [...]).then((r) => r.rows)); return json({ ... }); })`. Throw `AppError`; database errors with SQLSTATE `PF401/404/409/410/422` are mapped automatically. Return `json(data)` or `noContent(setCookies)`. Route files in this repo import with relative paths (there is no `@/` alias).
- How API tests sign in as a seeded player: `const env = await setupApi()` in `beforeAll` (`tests/api/helpers.ts`: fresh database, seed, logins for players 1, 2, 3 and the archived player 41, and the env vars `DATABASE_URL`, `AUTH_ADAPTER=local`, `LOCAL_AUTH_SECRET`); `env.login('one')` gives `{ player_id, email, password }`; call the sign-in route handler with `request('POST', '/api/auth/sign-in', { body: { email, password } })` and use `cookieOf(res)` as the `cookie` option of later requests. Call `env.close()` in `afterAll`. Passwords live only in memory: never log them, and assert with booleans so a failure cannot print one.
- Credentials file: `node scripts/seed.mjs --database-url <local url> --logins [--credentials-file <path>]` appends `email,password,player_id` rows to `credentials.local.csv` in the current folder (gitignored) for players that have no login yet; passwords are never printed.
- Every new `public` function needs: `revoke all ... from public, anon; grant execute ... to authenticated;`, a start with `core.require_player()`, and rows in `tests/db/matrix.ts` (`PUBLIC_FUNCTIONS`). Views go in the matrix as `kind: 'view'`.
- Session 18 must check on the real Supabase project: that the `postgres` role can read `auth.sessions` (needed by the security-definer `core.require_player()`), that access tokens carry the `session_id` claim, and that the Supabase adapter replaces LocalAuth (`AUTH_ADAPTER=supabase`).
- Each `npm run test:db` and `npm run test:api` run leaves one shared temp Postgres folder (`pintfc-pg-*`, ~39 MB), plus one for the GATE-2 test; the owner may delete them.

## session-06 — app-shell-sign-in (2026-11-12)

**Done**
- `src/app/globals.css` (tokens, header, footer, form styles), `src/app/layout.tsx` (header + page + footer, drawn per request), `src/components/Header.tsx` (client; menu button below 480 px, account menu with sign-out and sign-out-all), `src/components/Footer.tsx`.
- `src/app/sign-in/`: `page.tsx`, `SignInForm.tsx`, `current-player.ts` (`getCurrentPlayer()`, the server-side "who is signed in", same AuthPort and `public.rpc_me()` as `GET /api/me`).
- `src/middleware.ts`: private pages (`/settings`, `/fixtures/*`) with no cookie redirect to `/sign-in`; every page response is `Cache-Control: no-store`.
- STUB pages: `src/app/settings/page.tsx` and `src/app/fixtures/[id]/page.tsx` (real redirect when signed out; almost no content). `/squad` does not exist yet (the header link leads to a 404 until a later session).
- 8 e2e tests in `tests/e2e/auth.spec.ts`: AC-1.1.1, AC-1.1.3, AC-1.6.1, AC-1.6.2, AC-1.6.3, AC-1.6.4, T-19, SHELL-1.
- Owner-approved edits outside the plan's file list: `playwright.config.ts` (web server = `node tests/helpers/e2e-server.mjs`, 390 px viewport, one worker), `tests/helpers/e2e-server.mjs` (new), `tests/e2e/helpers.ts` (new), the two stub pages.

**Proof**
- RED first (no UI existed): 8 of 8 failed with assertion errors (`expect(locator).toBeVisible() failed ... element(s) not found` for `page-sign-in` / `site-header`; `toHaveURL` received `/settings`).
- First GREEN attempt: 5 passed, 3 failed. Cause 1 (test flaw): the tests looked at `page-home` before the sign-out page load finished; fixed with a `pressSignOut` helper. Cause 2 (real bug): sign-out answered 400 because an empty POST had no JSON content type; the client now sends `{}` as JSON.
- Final: `npm run test:e2e -- tests/e2e/auth.spec.ts` 8 passed; `npm run gate` ALL 7 GATES PASSED (unit 19, db 20, api 18, e2e 9, plan:check OK). Exit codes 0.
- Mutation check (each run on its own, then restored byte for byte; SHA-256 and `fc /b` against copies taken before mutating, no `MUTATION` marker left):
  - Mutation 2, sign-out call sent to a wrong URL: CAUGHT. AC-1.6.1, AC-1.6.2 and AC-1.6.4 failed (`expect(getByTestId('account-menu')).toHaveCount(0)`, expected 0, received 1); the other 5 passed.
  - Mutation 1, the middleware redirect for private pages disabled (`if (false && ...)`): SURVIVED, all 8 tests passed.
- **Known gap:** the middleware's "no cookie, go to /sign-in" redirect is not covered by any test. The `/settings` and `/fixtures/[id]` pages also check the session and redirect on their own, so AC-1.6.3 stays green without the middleware layer. The page-level check is the real protection; the middleware one is only a shortcut. A later session could add a test that requests a private page with redirects off and checks that the middleware answered.

**Decisions** (proposed; `DECISIONS.md` is not on this session's file list, so they are NOT yet in it — the owner decides)
- D-62 The e2e server (`tests/helpers/e2e-server.mjs`) starts its own throwaway Postgres, applies the migrations, seeds, creates logins for players 1, 2, 3 and 41 and runs LocalAuth; passwords go only to `%TEMP%\pintfc-e2e-logins.json` (never printed) and the temp folders are left behind.
- D-63 The layout reads the session on the server for every page (`force-dynamic`), so the header never flickers and never trusts the browser; every page is `no-store`.
- D-64 `src/middleware.ts` only does the cheap cookie-present check; the page itself checks that the session is alive (so a revoked cookie is refused too). Next 16 calls this file "proxy" and warns that `middleware` is deprecated; the plan names `middleware.ts`, so it was kept. Renaming later is a one-line change.
- D-65 Sign-in and sign-out finish with a full page load to `/` (never a client-side navigation), and sign-in never reads `next=`/`redirect=` (T-19).
- D-66 The sign-in form shows one message, "Email or password is incorrect", for every 4xx; 5xx and network failure show "Something went wrong. Try again."
- D-67 The settings stub shows the player's display name (`private-name`) instead of the email, because `public.rpc_me()` does not return the email.

**Next session needs to know**
- Components: `Header` (props `player: { displayName } | null`), `Footer`. Test ids: `site-header`, `nav-toggle`, `sign-in-link`, `account-menu`, `sign-out-button`, `sign-out-all-button`, `site-footer`, `page-sign-in`, `email-input`, `password-input`, `sign-in-button`, `sign-in-error`.
- CSS variables (globals.css `:root`): `--ink --muted --primary --accent --bg --surface --ok --warn --bad --radius --gutter --max-width`. Classes: `.page`, `.btn`, `.btn-secondary`, `.card`, `.field`, `.form-error`, `.muted`.
- Server pages: `import { getCurrentPlayer } from '../sign-in/current-player'` (returns `{ id, displayName }` or null); private page pattern: `if (!player) redirect('/sign-in')`. The layout already wraps pages in `<div className="page">`, so a page returns just `<main data-testid="page-...">`.
- e2e sign-in: `import { signInThroughForm, loginFor, openMenuIfCollapsed, PHONE, SMALL_PHONE } from './helpers'`; `await signInThroughForm(page, 'one' | 'two' | 'other' | 'archived')`. The e2e database is shared by the whole run and never reset: tests that change data (RSVPs, settings) must undo it or use different players. At 390 px the header links are behind `nav-toggle`; call `openMenuIfCollapsed(page)` before clicking them.
- Stubs: `/settings` and `/fixtures/[id]` (both only prove the redirect). Missing: `/squad`.
- Each e2e run leaves one more `pintfc-pg-e2e-*` folder in the temp folder; the owner may delete them.

## session-07 — home-next-match (2026-11-12)

**Done**
- `supabase/migrations/0004_v_next_match.sql`: `public.v_next_match` (columns `id, opponent, competition, venue, kickoff_at, cutoff_at, rsvp_open, server_now`; only `scheduled` matches that have not kicked off, earliest first, one row). `select` for anon, authenticated and service_role; no write privilege for anyone but the owner.
- `src/server/home.ts` (`getHome()`, reads the view as role `anon`), `src/app/api/home/route.ts` (`GET /api/home`, through `withApi`), `src/components/NextMatch.tsx` (client; loading, error with retry, empty, card, live countdown, RSVP chip, link), `src/app/page.tsx` (h1 "PINT FC" kept, plus the section).
- Tests: `tests/db/next-match.test.ts` (6: AC-2.1.1, AC-2.1.2, NEXT-MATCH-1..4), `tests/api/home.test.ts` (4: AC-2.1.1, AC-2.1.5, HOME-1, HOME-2), `tests/unit/countdown.test.ts` (2: AC-2.1.3, AC-2.1.4), `tests/e2e/home-next.spec.ts` (7: AC-2.1.1, 2.1.3, 2.1.4, 2.1.5, HOME-NEXT-1..3).
- Owner-approved edits outside the plan's file list: `tests/db/matrix.ts` (new `PUBLIC_VIEWS` list and view rows) and `tests/unit/countdown.test.ts` (new).

**Proof**
- RED first, with skeleton modules (an empty placeholder migration, a `getHome()` returning `server_now: ''` and no match, a `countdownView` returning empty strings, a component rendering nothing): unit 2 of 2 failed (`expected { kickedOff: false, days: '', ... } to match object { ... days: '1' ...}`); db 5 of 5 failed (`relation "public.v_next_match" does not exist`, as an assertion `expected { code: '42P01' ... } to be null`); API 3 of 4 failed (`server_now is an ISO instant: expected false to be true`, `Cannot read properties of null`); e2e 7 of 7 failed (`element(s) not found` for `next-match-card`, `countdown`, `rsvp-status`, `next-match-empty`, `next-match-error`).
- First GREEN attempts hit two real problems: (1) the view could not call `core.rsvp_cutoff` (`permission denied for function rsvp_cutoff`: Postgres checks EXECUTE on functions used inside a view against the CALLER), so the cutoff is written inline and a parity test (NEXT-MATCH-4) compares it with the core functions; (2) an update through the view answers 55000 (not updatable) rather than 42501, so the test accepts either and the access matrix is what proves the grants. Two test slips were also fixed (fractional hours in a fixture, an unneeded half-second assertion).
- Exit gate, each command on its own, exit 0: `npm run test:db -- tests/db/next-match.test.ts` 6 passed; `npm run test:api -- tests/api/home.test.ts` 4 passed (shown once through a filter for log noise, and again unfiltered inside the full gate); `npm run test:e2e -- tests/e2e/home-next.spec.ts` 7 passed; `npm run gate` ALL 7 GATES PASSED (unit 21, db 26, api 22, e2e 16, plan:check OK).
- Security mutation check (each on its own, restored byte for byte; SHA-256 and `fc /b` equal to the snapshots, no `MUTATION` marker left):
  - M1 view also allows cancelled and played matches: CAUGHT (AC-2.1.2, NEXT-MATCH-1).
  - M2 view also allows matches that already kicked off: CAUGHT (NEXT-MATCH-1, NEXT-MATCH-2).
  - M3 `grant insert, update, delete` on the view to `anon`: CAUGHT only by the access matrix (MATRIX-1: `anon insert/update/delete public.v_next_match: expected deny, got allow`); NEXT-MATCH-3 alone does NOT catch it, because the view is not updatable anyway.
  - M4 an extra internal column (`season_id`) leaks through the view: CAUGHT (NEXT-MATCH-3, exact column list).
  - M5 the RSVP chip trusts the phone clock instead of the server-corrected clock: CAUGHT (HOME-NEXT-1).
- Not covered by this session's mutation check: the API route has no security logic of its own (it reads as `anon`); that `anon` cannot read `core.*` directly is asserted in NEXT-MATCH-3 and the matrix but was not mutated.

**Decisions** (proposed; `DECISIONS.md` is not on this session's file list, so they are NOT yet in it — the owner decides)
- D-68 `public.v_next_match` computes the cutoff and `rsvp_open` inline (kickoff minus 2 h; scheduled and now before the cutoff) instead of calling `core.rsvp_cutoff` / `core.rsvp_is_open`: Postgres checks EXECUTE on functions inside a view against the caller, and `core.*` is closed to visitors on purpose. The parity test NEXT-MATCH-4 keeps the view and the core functions identical.
- D-69 The view carries `rsvp_open` and `server_now` (the database clock) so the API never computes either; the match stays "next" after the cutoff (chip says "RSVP closed") until kickoff, then it is no longer returned.
- D-70 The home next-match card is a client component that fetches `/api/home` on mount, so it has its own loading, error (retry, never raw text) and empty states; the page stays a server page with the h1.
- D-71 The countdown and the RSVP chip use `createServerClock(server_now)`, taken once per response; a new response (retry) makes a new card with a new offset. The chip is open only if the server said open AND the corrected clock is strictly before the cutoff (at the cutoff: closed).
- D-72 e2e tests freeze time with `page.clock.install` + `pauseAt` (device clock deliberately 4 h wrong) and answer `/api/home` with `page.route`, so they never depend on the shared e2e database or on how long the run has been going; only AC-2.1.1 uses the real seeded demo match.

**Next session needs to know**
- `GET /api/home` returns `{ server_now, next_match }` so far (`next_match` is `null` or `{ id, opponent, competition, venue, kickoff_at, cutoff_at, rsvp_open }`, all instants ISO `Z`). Sessions 08-09 add `record`, `latest_results`, `standings` to the SAME route and to `getHome()` in `src/server/home.ts` (one more view read each); the client type is `HomeData` from that file.
- The home page is `src/app/page.tsx`: h1 "PINT FC" then `<NextMatch />`; later sections go below it as their own components, each with its own loading/empty/error state (each may fetch `/api/home` itself or share a loader).
- New views: add the name to `PUBLIC_VIEWS` in `tests/db/matrix.ts` (matrix rows are generated), `revoke all ... from public, anon, authenticated, service_role; grant select ... to anon, authenticated, service_role;`, and remember a view cannot call `core.*` functions as a visitor (D-68).
- e2e freezing time: copy `frozenHome()` from `tests/e2e/home-next.spec.ts` (`clock.install`, `clock.pauseAt` before `goto`, then `clock.runFor(ms)` to tick); answer `/api/home` with `page.route('**/api/home', ...)`.
- Test ids on the card: `next-match-card`, `next-match-opponent`, `next-match-competition`, `next-match-venue`, `next-match-kickoff`, `countdown`, `countdown-d/h/m/s`, `rsvp-status`, `rsvp-cutoff`, `go-to-event`, `next-match-empty`, `next-match-loading`, `next-match-error`, `retry-button`.
- `/fixtures/[id]` is still a stub (session 06); `go-to-event` already links to it.

## session-08 — home-record-results (2026-11-12)

**Done**
- `supabase/migrations/0005_record_results_views.sql`: `public.v_season_record` (columns `played, won, drawn, lost, goals_for, goals_against`; current season, league only, published results on `played` matches; NO row when there is nothing to count) and `public.v_latest_results` (columns `match_id, opponent, goals_for, goals_against, played_on, played_at`; every published league or friendly result on a `played` match, newest first). Both read-only; `select` for anon, authenticated and service_role.
- `src/server/home.ts`: `getHome()` now also returns `record` (or `null`) and `latest_results` (first 5, `played_on` as text "YYYY-MM-DD"). New exported types `SeasonRecordRow`, `LatestResultRow`, constant `LATEST_RESULTS_LIMIT`.
- `src/components/SeasonRecord.tsx`, `src/components/LatestResults.tsx` (client; each fetches `/api/home` itself, with its own loading, empty and error states); `src/app/page.tsx` mounts them under the next-match card.
- Tests: `tests/db/results.test.ts` (8: AC-2.2.1, 2.2.2, 2.2.3, RECORD-1, AC-2.3.1, 2.3.2, LATEST-1, T-11), `tests/api/home.test.ts` (4 more, 8 in all: AC-2.2.1, 2.2.4, 2.3.1, 2.3.2), `tests/e2e/home-results.spec.ts` (5: AC-2.2.4, HOME-RESULTS-1..4).
- Owner-approved edits outside the plan's file list: `tests/db/matrix.ts` (two names added to `PUBLIC_VIEWS`) and `src/app/page.tsx`.

**Proof**
- RED first (an empty placeholder migration, `getHome()` without the new keys, components rendering nothing): db 8 of 8 failed (`expected { code: '42P01' ... } to be null`, view does not exist); API 4 of 8 failed (`expected undefined to deeply equal { played: 10, ... }`, `expected undefined to be null`, `Target cannot be null or undefined`; AC-2.3.2 failed with a TypeError on the missing array, the other three on assertions); e2e 5 of 5 failed (`element(s) not found` for `season-record`, `season-record-empty`, `record-played`, `season-record-error`; `result-row` count 0, expected 3).
- First GREEN: db 7 of 8 passed. The one failure was a test slip: the `pg` driver turns a `date` into a JS `Date`, so the date check now compares `played_on::text` with a value computed in SQL.
- Exit gate, each command on its own, exit 0: `npm run test:db -- tests/db/results.test.ts` 8 passed; `npm run test:api -- tests/api/home.test.ts` 8 passed; `npm run test:e2e -- tests/e2e/home-results.spec.ts` 5 passed; `npm run gate` ALL 7 GATES PASSED (unit 21, db 34, api 26, e2e 21, plan:check OK).
- Security mutation check (each on its own, restored byte for byte; SHA-256 and `fc /b` equal to the snapshots, no `MUTATION` marker left in any of the four files):
  - M1 record counts unpublished results: CAUGHT (AC-2.2.2, RECORD-1, T-11).
  - M2 record counts friendlies: CAUGHT (AC-2.2.3, RECORD-1).
  - M3 latest results show unpublished results: CAUGHT (AC-2.3.2, T-11).
  - M4 latest results drop the `played` filter (cancelled and unplayed matches with a published result row show): CAUGHT BY T-11 ONLY (one test).
  - M5 `grant insert, update, delete` on `v_latest_results` to `anon`: CAUGHT ONLY BY THE ACCESS MATRIX (MATRIX-1); LATEST-1 does not catch it because the view is not updatable anyway.
  - M6 an extra internal column (`venue_id`) leaks through `v_latest_results`: CAUGHT (LATEST-1, exact column list).
  - M7 the record returns a row of zeros instead of no row: CAUGHT (RECORD-1, db level only; the API and e2e AC-2.2.4 tests were not run against this mutation).
  - M8 the API drops the limit of 5: CAUGHT (AC-2.3.1 [api]).
- Known gaps: M4 is caught by one test only; the `m.status = 'played'` rule in `v_season_record` has no mutation of its own (RECORD-1 and T-11 cover it by their fixtures but it was not mutated); no mutation was run on the two components.

**Decisions** (proposed; `DECISIONS.md` is not on this session's file list, so they are NOT yet in it — the owner decides)
- D-73 `v_season_record` covers the current season only (`seasons.is_current`), league competitions only, published results on `played` matches only; with nothing to count it returns NO row, so the API sends `record: null` and the page says "No results yet" (never a row of zeros).
- D-74 `v_latest_results` has no limit and no season filter; it is ordered newest match first and carries `played_at` (kickoff instant) for ordering and `played_on` (calendar date in the club zone) for display. The API orders explicitly (`played_at desc, match_id`) and takes 5 (`LATEST_RESULTS_LIMIT`), so the page never relies on the view's own ordering.
- D-75 A result row counts only when its match is `played`, even if `published` is true: a cancelled or not-yet-played match with a result row must never leak (T-11).
- D-76 `played_on` goes through the API as text ("YYYY-MM-DD", `played_on::text`) and the page formats it as a plain date (UTC, no shift), so a viewer's time zone can never move the day.
- D-77 `SeasonRecord` and `LatestResults` each fetch `/api/home` themselves (3 requests per page load together with `NextMatch`) so each section has independent loading, empty and error states; their retry buttons have their own test ids (`season-record-retry`, `results-retry`) so they never clash with the next-match `retry-button`. A shared loader would remove the extra requests but needs a new file; left for a later session.
- D-78 The new sections use inline styles only: `src/app/globals.css` was not on this session's file list.

**Next session needs to know**
- `GET /api/home` now returns `{ server_now, next_match, record, latest_results }`: `record` is `null` or `{ played, won, drawn, lost, goals_for, goals_against }` (integers); `latest_results` is an array of at most 5 `{ match_id, opponent, goals_for, goals_against, played_on }` with `played_on` "YYYY-MM-DD". Session 09 adds `standings` to the same route: one more view read in `getHome()` and one more field on `HomeData`.
- Views: `public.v_season_record` and `public.v_latest_results` (columns above); both are in `PUBLIC_VIEWS` in `tests/db/matrix.ts`. As in session 07, a view cannot call `core.*` functions as a visitor (D-68).
- Empty-state tests: DB tests build their own fixtures in a fresh database (`setup([...])` in `tests/db/results.test.ts`); API tests set `core.results.published = false` for the published rows and restore it in a `finally`; e2e tests answer `/api/home` with `page.route` (`mockHome()` in `tests/e2e/home-results.spec.ts`) and never touch the shared e2e database.
- Test ids: `season-record`, `record-played`, `record-won`, `record-drawn`, `record-lost`, `record-gf`, `record-ga`, `season-record-empty` ("No results yet"), `season-record-loading`, `season-record-error`, `season-record-retry`, `latest-results`, `result-row`, `result-outcome` (W/D/L), `results-empty`, `results-loading`, `results-error`, `results-retry`. The mini league table (session 09) should follow the same pattern.
- The seed gives: 10 published league results (record 10 played, 6 won, 2 drawn, 2 lost, 19-12), 1 published friendly, 1 saved-but-unpublished result on the NEWEST played match (so a leak would show first).

## session-09 — home-mini-table (2026-11-12)

**Done**
- `supabase/migrations/0006_v_standings.sql`: `public.v_standings` (columns `taken_on, position, team, is_us, played, goal_difference, points`; the latest snapshot of the CURRENT season, one row per team, in position order; no snapshot means no rows). Read-only; `select` for anon, authenticated and service_role.
- `src/server/home.ts`: `getHome()` now also returns `standings` (`{ taken_on, rows }` or `null`); new exported types `StandingRow`, `Standings`.
- `src/components/MiniTable.tsx` (client; fetches `/api/home` itself; loading, empty "No table yet", error with `table-retry`; a real `<table>`); `src/app/page.tsx` mounts it below the latest results.
- Tests: `tests/db/standings.test.ts` (4: AC-2.4.1, STANDINGS-1..3), `tests/api/home.test.ts` (2 more, 10 in all: AC-2.4.1, STANDINGS-API), `tests/e2e/home-table.spec.ts` (6: AC-2.4.1, AC-2.4.2, MINI-TABLE-1..4).
- Owner-approved edits outside the plan's file list: `tests/db/matrix.ts` (`public.v_standings` added to `PUBLIC_VIEWS`), `src/app/page.tsx`, `tests/api/home.test.ts`.
- AC-2.4.3 is NOT done here by design: `taken_on` is in the API response, but the page does not show it and there is no `table-snapshot-date` element; MINI-TABLE-1 [e2e] guards that.

**Proof**
- RED first (an empty placeholder migration, `getHome()` without `standings`, a component rendering nothing): db 4 of 4 failed (`expected { code: '42P01' ... } to be null`, the view does not exist); API 2 of 10 failed (`TypeError: Cannot read properties of undefined (reading 'taken_on')` and `expected undefined to be null`; the first is a TypeError, not an assertion); e2e 6 of 6 failed (`element(s) not found` for `mini-table`, `table-empty`, `table-error`; `table-row-us` count 0, expected 1).
- One test-design correction before GREEN: our row carries `table-row-us` INSTEAD of `table-row` (one element, one test id), so the e2e tests count rows with `[data-testid="table-row"], [data-testid="table-row-us"]`.
- Exit gate, each command on its own, exit 0: `npm run test:db -- tests/db/standings.test.ts` 4 passed; `npm run test:e2e -- tests/e2e/home-table.spec.ts` 6 passed; `npm run gate` ALL 7 GATES PASSED (unit 21, db 38, api 28, e2e 27, plan:check OK). The API tests ran unpiped inside the full gate.
- Security mutation check (each on its own, restored byte for byte; SHA-256 and `fc /b` equal to the snapshots, no `MUTATION` marker left in any of the three files):
  - M1 the view shows the OLDEST snapshot of the season: CAUGHT by STANDINGS-1 only.
  - M2 the view may pick a snapshot of any season: CAUGHT by STANDINGS-1 only.
  - M3 an extra internal column (`team_id`) leaks: CAUGHT (STANDINGS-3, exact column list).
  - M4 `grant insert, update, delete` on the view to `anon`: CAUGHT ONLY BY THE ACCESS MATRIX (MATRIX-1); STANDINGS-3 does not catch it because the view is not updatable anyway.
  - M5 `is_us` flags the wrong teams: CAUGHT (STANDINGS-2, db level; the API and e2e tests were not run against it).
  - M6 the API reorders the rows (`order by position desc`): CAUGHT (AC-2.4.1 [api]).
  - M7 the e2e page drops the left bar of our row: CAUGHT (AC-2.4.2: border-left 0, expected >= 4).
  - M8 the page drops the bold label of our row: CAUGHT (AC-2.4.2).
  - M9 the page shows the snapshot date (`table-snapshot-date`): CAUGHT (MINI-TABLE-1).
- Known gaps: M1 and M2 each rest on a single test (STANDINGS-1); M5 was only run at the db level; no mutation was run on the empty or error states of `MiniTable`.

**Decisions** (proposed; `DECISIONS.md` is not on this session's file list, so they are NOT yet in it — the owner decides)
- D-79 `v_standings` is the latest snapshot (newest `taken_on`, then `id`) of the CURRENT season; a snapshot of another season never shows even if its date is newer; no snapshot for the current season means no rows, so the API sends `standings: null` and the page says "No table yet".
- D-80 `goal_difference` is computed in the view (`goals_for - goals_against`), not stored; `won/drawn/lost`, `goals_for/goals_against` are not exposed (the mini table does not need them).
- D-81 `standings.taken_on` is in the `/api/home` response ("YYYY-MM-DD" text, as in `docs/design/api.md`) but the home page does not show it: session 16 adds `table-snapshot-date` with the owner (AC-2.4.3).
- D-82 Our row's test id is `table-row-us` and the other rows' is `table-row` (never both on one element). The highlight is a bold `table-us-label` AND a 6 px left border on the row (a border survives high-contrast / forced-colors modes), plus a light background; the other rows have no border.
- D-83 `MiniTable` is a real `<table>` (`table-layout: fixed`, columns Pos, Team, P, GD, Pts) with long team names wrapping, so it fits 320 px with no sideways scroll; it fetches `/api/home` itself (now 4 requests per page load with the other sections; a shared loader remains a later cleanup) and its retry button is `table-retry`.

**Next session needs to know**
- `GET /api/home` returns `{ server_now, next_match, record, latest_results, standings }`; `standings` is `null` or `{ taken_on: "YYYY-MM-DD", rows: [{ position, team, is_us, played, goal_difference, points }] }` in position order. All five home sections are now done.
- Session 16 (live in class) adds the snapshot date: render `standings.taken_on` as "As of ..." with test id `table-snapshot-date` inside `MiniTable`, and replace the guard test MINI-TABLE-1 in `tests/e2e/home-table.spec.ts` (it currently asserts the date is NOT shown); add AC-2.4.3.
- Test ids: `mini-table`, `table-row` (other teams), `table-row-us` (PINT FC), `table-us-label`, `table-pos`, `table-played`, `table-gd` ("+7", "-1", "0"), `table-points`, `table-empty` ("No table yet"), `table-loading`, `table-error`, `table-retry`.
- The seed gives 8 teams, 10 played each, PINT FC second (GD +7, 20 points), snapshot taken 9 days before the seed run. A mocked `/api/home` in e2e tests must now include all five keys or a section shows its error state (the older mocks of sessions 07 and 08 omit some keys, which only makes the other sections show errors, never failing their own checks).
- Each section still fetches `/api/home` on its own (4 requests per page load).

## session-10 — squad-profiles (2026-11-12)

**Done**
- `supabase/migrations/0007_squad_views.sql`: `core.is_publicly_visible(p core.players)` (THE visibility rule: active AND opted in AND (adult OR guardian consent); SECURITY DEFINER, `search_path = ''`, reads only its argument, calls only the pure helper `core.is_minor`; EXECUTE granted to anon and authenticated, the ONLY core function open to them), `public.v_squad` (`id, name, position, shirt_number`; GK, DEF, MID, FWD then shirt number) and `public.v_player_profile` (those plus `photo_url, nationality, appearances, goals, assists, minutes`, each NULL unless that player consented; stats count published results of played matches only). Views read-only; `select` for anon, authenticated, service_role.
- `src/server/squad.ts` (`getSquad()`, `getPlayerProfile(id)`; `null` for hidden, archived, unknown and not-a-uuid alike), `GET /api/squad`, `GET /api/players/[id]` (400 for a bad uuid; one identical 404 for hidden, archived and unknown).
- Pages: `/squad` (`page.tsx`, `loading.tsx`, `error.tsx`, `labels.ts`), `/players/[id]` (`page.tsx`, `layout.tsx`, `data.ts`, `not-found.tsx`, `loading.tsx`, `error.tsx`) and `src/app/players/not-found.tsx` (re-exports the `[id]` one). Both pages are server components that call the same functions as the routes.
- Tests: `tests/db/squad.test.ts` (8: AC-4.1.1, 4.1.2, 4.1.3, 4.2.2, SQUAD-VIEWS-1, VIS-FN-1..3), `tests/api/squad.test.ts` (7: AC-4.1.1, 4.1.2, 4.1.3, 4.2.1, 4.2.2, T-10, PROFILE-1), `tests/e2e/squad.spec.ts` (6: AC-4.1.1, 4.1.2, 4.2.1, 4.2.2, T-10, SQUAD-E2E-1).
- Owner-approved edit outside the plan's file list: `tests/db/matrix.ts` (`PUBLIC_VIEWS` gains the two views; new `CORE_FUNCTIONS_OPEN_TO_VIEWS` holding exactly one name, with allow rows).

**Proof**
- RED first (an empty placeholder migration, an empty `getSquad()`, a route that always answers 404, no pages): db 8 of 8 failed (`expected { code: '42P01' ... } to be null` view missing, `42883` function missing, `expected 10 to be greater than 10`); API 5 of 7 failed (`expected [] to have a length of 37 but got +0`, `expected 404 to be 200`, `expected 404 to be 400`; AC-4.2.1 failed with a TypeError on the empty list); the other two (AC-4.1.2, T-10) PASSED VACUOUSLY on the all-404 skeleton, so the mutation check below is what proves they bite; e2e 5 of 6 failed (`element(s) not found` for `page-squad`, `Expected: 200 Received: 404`; AC-4.2.1 failed by an action timeout on a click, not an assertion).
- Two real problems found on the way: (1) the profile page answered 200, not 404, for hidden ids: a `loading.tsx` makes Next stream the page, so the status is sent before `notFound()` runs. Fixed with `players/[id]/layout.tsx` (a layout sits outside the loading boundary) plus `data.ts` (`cache()` so the lookup runs once) and `players/not-found.tsx`. (2) My first T-10 e2e assertion ("the HTML never contains the id") was wrong: Next keeps the requested URL in its own payload for every route. It is now "the id is not shown" plus "the whole document is byte-identical for hidden, archived and unknown ids once the requested id is masked".
- Exit gate, each command on its own, exit 0: `npm run test:db -- tests/db/squad.test.ts` 8 passed; `npm run test:api -- tests/api/squad.test.ts` 7 passed; `npm run test:e2e -- tests/e2e/squad.spec.ts` 6 passed; `npm run gate` ALL 7 GATES PASSED (unit 21, db 46, api 35, e2e 33, plan:check OK).
- Security mutation check (each on its own; every file restored byte for byte; SHA-256 equal to the snapshot taken before the first mutation; no `MUTATION` marker left in any of the five files):
  - M1 archived players visible (`status` clause removed): CAUGHT (AC-4.1.2, AC-4.1.3, VIS-FN-1).
  - M2 minors need no guardian consent (clause made always true): FIRST RUN CAUGHT ONLY BY VIS-FN-2 (the source-shape check), NOT by any behavioural test. The cause: the `players_guard` trigger makes "minor, opted in, no consent" impossible, so no fixture ever exercised the clause. Fixed by a fixture inserted with the trigger switched off (`unguarded: true`, `Fake MinorOptInNoConsent`), added to the visibility cases. Re-run: CAUGHT by AC-4.1.3 and VIS-FN-1.
  - M3 opt-out ignored: CAUGHT (AC-4.1.3, VIS-FN-1).
  - M4 photo consent ignored in the profile view: CAUGHT (AC-4.2.2).
  - M5 stats consent ignored (goals column): CAUGHT (AC-4.2.2).
  - M6 `email` leaks through `v_squad`: CAUGHT (SQUAD-VIEWS-1, exact column list).
  - M7 stats count unpublished results: CAUGHT (AC-4.2.2).
  - M8 `grant insert, update, delete` on `v_squad` to anon: CAUGHT by the access matrix (MATRIX-1) AND by SQUAD-VIEWS-1 (unlike the earlier views, `v_squad` is a plain single-table view, so Postgres treats it as auto-updatable and the write really would go through to `core.players`).
  - M9 a SECOND core function opened (`grant execute on core.is_minor(date) to anon`): CAUGHT (VIS-FN-3 and the matrix).
  - M10 `is_publicly_visible` granted to PUBLIC: CAUGHT by VIS-FN-2 ONLY (the matrix does not model PUBLIC).
  - M11 the function reads a table (`select count(*) from core.players`): CAUGHT by VIS-FN-2 ONLY (the source check).
  - M12 the fixed empty `search_path` removed: CAUGHT by VIS-FN-2 (its message is ugly, "invalid combination of arguments (null and string)", because `proconfig` is null; it still fails).
  - M13 SECURITY DEFINER removed: CAUGHT (six tests: AC-4.1.1, 4.1.2, 4.1.3, 4.2.2, SQUAD-VIEWS-1, VIS-FN-2).
  - M14 the API's 404 for an unknown or hidden id echoes the id: CAUGHT (T-10 [api]).
  - M15 the layout's `notFound()` removed (hidden profile answers 200): CAUGHT (AC-4.1.2 [e2e] and T-10 [e2e]).
- Known gaps: the `/squad` empty state (`squad-empty`), `loading.tsx`, and the two `error.tsx` pages have no test (the pages are server-rendered, so e2e cannot make them fail or be empty on the shared database); M10, M11 and M12 each rest on a single test; the whole-document identity in T-10 [e2e] could in principle break on a per-request value Next adds to the HTML (it has not so far); the seed's `photo_url` is `/img/placeholder-player.svg` and there is NO `public/img` folder, so the `player-photo` `<img>` is a broken image in the browser until a later session adds the file (tests only check that the element is present or absent).

**Decisions** (proposed; `DECISIONS.md` is not on this session's file list, so they are NOT yet in it — the owner decides)
- D-84 `core.is_publicly_visible(core.players)` is the single copy of the visibility rule. Because Postgres checks EXECUTE on functions used inside a view against the CALLER, it is granted to anon and authenticated, and it is the ONLY core function that is. Safe because it is SECURITY DEFINER with a fixed empty `search_path`, reads only its argument and no table (it calls only the pure date helper `core.is_minor`), `core` is not exposed through the REST API, and a caller can only pass a row it could already read (none). Guarded by VIS-FN-2 (shape and grants), VIS-FN-3 (no other core function open, checked over every function in the schema) and `CORE_FUNCTIONS_OPEN_TO_VIEWS` in the matrix (exactly one name).
- D-85 The rule does not rely on the `players_guard` trigger: a minor who is opted in without guardian consent (impossible while the trigger is on) is still hidden, and a test builds that state with the trigger disabled.
- D-86 `v_squad` and `v_player_profile` expose only name, position, shirt number and the three consent-gated optional parts; never email, phone, date of birth or any consent flag. Each optional column is NULL unless its flag is on; the API omits null keys, so the key is ABSENT from the response and the DOM, not null.
- D-87 Stats (`appearances, goals, assists, minutes`) count only published results of played matches (same rule as the home page, T-11); a player who consented to stats but has played nothing shows zeros.
- D-88 Hidden, archived, unknown and not-a-uuid ids are one outcome: `getPlayerProfile` returns `null`, the API answers one 404 body (`NOT_FOUND`, "Not found.") for all, and the page answers one 404 page; only the API distinguishes a malformed id (400 `VALIDATION`), because a malformed id reveals nothing about any player.
- D-89 The profile's 404 status is decided in `players/[id]/layout.tsx`, not only in the page: a page with `loading.tsx` is streamed and its status is already 200 by the time `notFound()` runs; a layout sits outside the loading boundary. `data.ts` wraps the lookup in React `cache()` so layout and page share one query; `players/not-found.tsx` re-exports `[id]/not-found.tsx` because a `notFound()` from a layout is caught one level up.
- D-90 The squad and profile pages are server components calling the same functions as the routes ("pages vs API", docs/design/api.md), with `loading.tsx` and `error.tsx` (retry button) per route instead of client-side fetching.

**Next session needs to know**
- Visibility function: `core.is_publicly_visible(p core.players) returns boolean` (SECURITY DEFINER, empty search_path). A new public view or function that needs "is this player public?" calls it; do NOT copy the rule and do NOT open any other core function (VIS-FN-3 will fail).
- How tests find the seeded minors: `playerId(21)` is minor A (guardian consent, opted in: public), `playerId(34)` is minor B (neither: hidden); adults who opted out are `playerId(10)` and `playerId(28)`; the archived player is `playerId(41)`; 37 of the 41 players are public. In e2e, `staticData()` and `id()` from `scripts/seed-data/index.mjs` give the names and flags (imported with a `@ts-expect-error TS7016`, see `tests/e2e/squad.spec.ts`).
- Profile DTO (`GET /api/players/[id]` returns `{ player }`): `{ id, name, position: 'GK'|'DEF'|'MID'|'FWD', shirt_number, photo_url?, nationality?, stats?: { appearances, goals, assists, minutes } }`; optional keys ABSENT unless consented (and, for photo and nationality, unless there is data). `GET /api/squad` returns `{ players: [{ id, name, position, shirt_number }] }`, already grouped by position and ordered by shirt number.
- Test ids: `page-squad`, `squad-group-GK|DEF|MID|FWD`, `squad-player`, `squad-empty`, `squad-loading`, `squad-error`; `page-player`, `player-name`, `player-position` (full word, e.g. "Goalkeeper"), `player-number`, `player-photo`, `player-nationality`, `player-stats`, `back-to-squad`, `not-found`, `player-loading`, `player-error`, `retry-button` (in the two error pages).
- A new page with `loading.tsx` that must send a real 404 needs the check in a LAYOUT, as `players/[id]/layout.tsx` does (D-89).
- `v_squad` is auto-updatable (plain single-table view): never grant it anything but `select`. The matrix and SQUAD-VIEWS-1 both guard that.
- Missing `public/img/placeholder-player.svg`: a broken image for consented photos until a later session adds the file. (Fixed in session 20c: the file exists and the profile shows the local jersey.)

## session-11 — privacy-settings (2026-11-12)

**Done**
- `supabase/migrations/0008_my_settings.sql`: `public.rpc_my_settings()` (own four flags, `is_minor`, `guardian_consent`, own email) and `public.rpc_update_my_settings(p_public_opt_in, p_show_photo, p_show_nationality, p_show_stats)`. Both SECURITY DEFINER, empty `search_path`, start with `core.require_player()`, EXECUTE only for `authenticated` (not anon, not PUBLIC). Neither takes a player id; the update has parameters for the four flags only. An omitted flag (NULL) is left alone; no flag at all is `22023`; a minor without guardian consent asking for `public_opt_in = true` is `PF422` before any write (the whole call is refused).
- `src/server/settings.ts` (`getMySettings`, `updateMySettings`), `GET` and `PUT /api/me/settings` (`PUT` uses the existing strict `settingsSchema`: unknown keys such as `player_id`, `status`, `guardian_consent` are a 400).
- `/settings` page: `page.tsx` (server, redirects to `/sign-in` without a session), `data.ts`, `SettingsForm.tsx` (client; each toggle saves on change, flips at once and is put back if the server refuses; `settings-saved` `role="status"`, `settings-error`, `minor-note` and a disabled `toggle-public` for a minor without consent; 44 px rows).
- Tests: `tests/db/settings.test.ts` (10), `tests/api/settings.test.ts` (8), `tests/e2e/settings.spec.ts` (4). Owner-approved edit outside the plan's file list: `tests/db/matrix.ts` (two `PUBLIC_FUNCTIONS` rows).

**Proof**
- RED first (placeholder migration `select 1;`, a route answering 404, no toggles on the page): db 9 of 9 failed (`expected { code: '42883' … } to be null`, `function public.rpc_my_settings() does not exist`); api 8 of 8 failed (`expected 404 to be 200/401/400`); e2e 4 of 4 failed (`element(s) not found` for `toggle-stats`). One API test first failed with a TypeError on the empty body; I added a status assertion before the read so it fails on an assertion.
- Mistakes of mine found while going green: a joined view refuses a write with `55000`, not `42501` (the db test accepts either and re-reads the row); `proconfig` text is backslash-escaped; Playwright's `check()` needs the box to flip at once, so the toggle became optimistic; a whole-page text check cannot prove a player is absent from the squad when the signed-in header shows their own name (now checks the squad cards only).
- Exit gate, each on its own, exit 0: `test:db -- tests/db/settings.test.ts` 9 passed; `test:api -- tests/api/settings.test.ts` 8 passed; `test:e2e -- tests/e2e/settings.spec.ts` 4 passed; `npm run gate` ALL 7 GATES PASSED (typecheck, lint with no warnings, unit 21, db 56, api 43, e2e 37, plan:check OK). Gate was re-run after the last edit (db count is 56 and `test:db -- tests/db/settings.test.ts` is 10 passed since the M2 test was added).
- Security mutation check (each on its own, files restored; SHA-256 of the three mutated files equal to the snapshot after the run):
  - M1 update without "where own row" (every player updated): CAUGHT (4 db tests, incl. AC-4.3.4).
  - M2 the function's own minor check removed: FIRST RUN SURVIVED (9 of 9 pass), because the `players_guard` trigger (0001) raises the same `PF422` for the same state. Fixed after the owner's OK with a tenth db test, `AC-4.3.3 [db] the function refuses a minor without consent even with the players_guard trigger switched off` (it switches the trigger off, proves it is off by creating the forbidden state as owner and undoing it, calls the function, expects `PF422` and no write, and always switches the trigger back on in `finally`). Re-run with M2 applied: CAUGHT (db 1 failed | 9 passed, `expected undefined to be 'PF422'`). `0008_my_settings.sql` restored through the Edit tool; SHA-256 equal to the value taken before the mutation (`E411D6CE…81048`), no `MUTATION` marker left.
  - M3 anon may execute the update function: CAUGHT (SETTINGS-READ-2, SETTINGS-GRANT-1; the matrix would too).
  - M4 `rpc_my_settings` uses `auth.uid()` instead of `core.require_player()`: CAUGHT (SETTINGS-READ-2).
  - M5 `is_minor` always false in the DTO: CAUGHT (SETTINGS-READ-1).
  - M6 `show_stats` never written: CAUGHT (AC-4.3.2 [db]).
  - M7 PUT body not strict (unknown keys ignored): CAUGHT (AC-4.3.4, T-06, SETTINGS-PUT-1 [api]).
  - M8 API swaps `show_photo` and `show_nationality`: CAUGHT (AC-4.3.2, AC-4.3.4 [api]).
- Known gaps: (1) NOTHING tests the page's minor behaviour (`minor-note`, disabled `toggle-public`): the e2e server only creates logins for players 1, 2, 3 and 41, all adults. The owner decided NOT to touch `tests/helpers/e2e-server.mjs` or `tests/e2e/helpers.ts`, so this stays a known gap (a later session may add logins for players 21 and 34 and a minor e2e test). (2) ~~M2~~ closed: see M2 above. (3) `PUT` validation of `public_opt_in: null` etc. is covered, but the 8 KB limit is not re-tested here (covered by `with-api.test.ts`). (4) The settings page does not yet show the sign-out buttons the screen design lists (`sign-out-button`, `sign-out-all-button`); the header already has them.

**Decisions** (proposed; `DECISIONS.md` is not on this session's file list, so they are NOT yet in it: the owner decides)
- D-91 The settings functions take no player id and the update function has parameters for the four flags only: there is nothing to point at another player, and status, guardian consent, shirt number, name, email and date of birth cannot even be named (T-06, AC-4.3.4). Enforced by the database; the API's strict body is a convenience.
- D-92 NULL means "leave this flag"; a call with no flag is `22023` (the API turns that into a 400 before it gets there). A rejected call (PF422) changes nothing, including flags sent with it.
- D-93 `PUT /api/me/settings` returns the same `{ settings }` DTO as `GET`, so the page and the tests read the saved state from the response.
- D-94 The page saves each toggle on change (no Save button), shows the change at once and puts it back on failure.
- D-95 (owner-accepted) `/settings` does NOT show `sign-out-button` / `sign-out-all-button` although `docs/design/screens.md` lists them: the header's account menu already has both, and a second copy would need its own tests. The screen design is not updated here.
- D-96 (owner-accepted) The function's own minor check is kept alongside the `players_guard` trigger (defence in depth) and is tested on its own with the trigger switched off.

**Next session needs to know**
- Settings DTO (`GET`/`PUT /api/me/settings` return `{ settings }`): `{ public_opt_in, show_photo, show_nationality, show_stats, is_minor, guardian_consent, email }`, all booleans except `email`. `PUT` body: any of the first four (booleans, at least one, nothing else). Errors: 401 `UNAUTHENTICATED`, 400 `VALIDATION`, 422 `MINOR_NEEDS_GUARDIAN`.
- Signing in as the two minors: the API tests call `createLogins(client, { playerIds: [playerId(21), playerId(34)] })` from `scripts/seed.mjs` in `beforeAll` and then sign in through the real sign-in route (`tests/api/settings.test.ts`); passwords stay in memory. Player 21 is minor A (consent, opted in), 34 is minor B (no consent, hidden). The e2e server only has logins for 1, 2, 3, 41; to e2e-test a minor, add 21 and 34 to `LOGIN_PLAYERS` in `tests/helpers/e2e-server.mjs` and to `Who` in `tests/e2e/helpers.ts` (not done: off this plan's list).
- The e2e database is shared and not reset between specs: a test that changes a player's settings must change them back (the settings specs do).
- A new public function must be added to `PUBLIC_FUNCTIONS` in `tests/db/matrix.ts` with its full argument list (`public.rpc_update_my_settings(boolean,boolean,boolean,boolean)`).
- Process note: I edited one test file with a one-off `node -e` string replace (tests/api/settings.test.ts, removing a leftover test) instead of the Edit tool; the mutation script was written with the Write tool to the scratchpad, not the repo.

## session-12 — privacy-sweep (2026-11-12)

**Done**
- `tests/db/pii.test.ts` (3: AC-4.3.1, T-02, T-12), `tests/api/public-pii.test.ts` (3: AC-4.3.1, T-12, API-INVENTORY), `tests/e2e/public-crawl.spec.ts` (4: AC-4.3.1 crawl, AC-4.3.1 follow-the-links, T-12, PAGE-INVENTORY). Only these three files were created; NO source, migration, seed or config file changed, and nothing was installed.
- DB sweep: DISCOVERS every table, view and function in schema `public` from the catalog (no list to forget), checks every column name with `assertNoPii`, reads every view as anon and as a signed-in player, and looks for the seed's private VALUES (all 41 emails, phones and dates of birth, plus fake RSVP reasons) inside the JSON. Functions: nothing in `public` may be executable by anon; every zero-argument function the player can call is checked for OTHER players' private values (their own email in `rpc_my_settings` is allowed). Also checks that no public column name looks like RSVP data (only `rsvp_open` is allowed).
- API sweep: every route as a visitor: health, home, squad, all 41 `/api/players/[id]` ids (visible, hidden, archived) plus an unknown and a malformed id, and the session routes' error answers. 12 fake RSVPs (4 with a reason) are inserted first so there is RSVP data to leak. Messages name the route and the player number, never the value.
- E2E crawl (390 px, no session): home, sign-in, squad, all 41 profile ids, unknown and malformed ids, the two private pages (must redirect to `/sign-in`), a missing page; for each: raw server HTML, DOM, visible text and every `/api` JSON the page fetched. A second test follows the links from `/` and `/squad` and fails on any link to a page the crawl does not know.

**Proof**
- RED: the invariant already holds, so a sweep against the real code cannot start red. Per plan step 2, the first DB run had a deliberately leaky test view (`public.v_leaky_test`: name, email, phone, date of birth, RSVP answer and reason, granted to anon and authenticated): 3 of 3 failed with AssertionError (`private data readable through public views: expected [ …(239) ] to deeply equal []`, naming the view, the forbidden keys and the player numbers). The view was then removed from the test (it existed only in the test's own database copy) and the 3 tests passed. The API and E2E sweeps passed on their first run (no real leak exists); their RED is the mutation run below.
- Exit gate, each command on its own, exit 0: `test:db -- tests/db/pii.test.ts` 3 passed; `test:api -- tests/api/public-pii.test.ts` 3 passed; `test:e2e -- tests/e2e/public-crawl.spec.ts` 4 passed; `npm run gate` ALL 7 GATES PASSED (typecheck, lint, unit 21, db 59, api 46, e2e 41, plan:check OK). The first gate run stopped at lint on two slips in my own new API test (`prefer-const`, an expression statement); fixed, gate re-run in full.
- Mutation check (each on its own; `src/server/squad.ts` and `src/server/home.ts` restored with the Edit tool; SHA-256 and `fc /b` equal to the snapshots taken before the first mutation; no `MUTATION` marker left):
  - M1 `getSquad` returns each player's email: CAUGHT by AC-4.3.1 [api] ("GET /api/squad: contains 41 private value(s)", plus the forbidden key `email`).
  - M2 `getPlayerProfile` adds the date of birth under the key `born`: CAUGHT by AC-4.3.1 [api] (37 profiles named). The T-12 [api] test hung 60 s in that run (41 parallel profile calls each holding a pool connection while the mutated code asks for a second one): a mutation artifact, not a flaw in the unmutated code.
  - M3 the next match carries `going_count`: CAUGHT by T-12 [api] (exact key list) but NOT by AC-4.3.1 [api]: see the gap below.
  - M4 `/api/home` carries a player's email under the key `organiser`: CAUGHT by both e2e crawl tests (AC-4.3.1 and T-12), via the network JSON scan.
  - DB mutations (applied to the test's own database copy through a temporary block in `pii.test.ts`, since the migrations are off this plan's list; block removed afterwards): V1 `v_squad` gains an `email` column: CAUGHT (AC-4.3.1 and T-02). R1 anon given schema usage, select and an RLS policy on `core.rsvps`: CAUGHT by T-12 [db]. F1 `rpc_my_settings` granted to anon: CAUGHT by T-02. D1 `v_next_match` gains `going_count`: FIRST RUN SURVIVED (all 3 passed); fixed by the RSVP-looking-column-name check in T-12 [db], re-run CAUGHT. The same check was added to T-12 [api] and [e2e].
  - R1 without the schema grant (select on `core.rsvps` alone) is neutralised by the closed `core` schema (still 42501): defence in depth working, not a test gap.
- Known gaps: (1) `assertNoPii` (src/lib/privacy.ts, D-40) matches the key `going` but not `going_count` or similar, so a count named that way is caught only by the T-12 key checks added in this session, not by `assertNoPii` itself; The owner decided NOT to widen the scanner (D-40 stays as written); this stays a KNOWN GAP, recorded here and in the commit message. (2) The seed has no RSVPs, and the e2e database cannot be written to from a spec, so the E2E crawl proves "no RSVP data" by element, key and word checks only; the DB and API tests use real RSVP rows. (3) Date of birth is checked by value only for the seeded dates (the e2e scan uses the seed's own static data, so the two minors' relative dates are not covered there; the DB and API sweeps read the real values from the database). (4) The sweep covers public pages and API routes as a VISITOR only; signed-in responses are tested by the session 05 to 11 tests.

**Decisions** (D-97 to D-99 were accepted by the owner and copied into `DECISIONS.md`, unchanged apart from that)
- D-97 The privacy sweep discovers public objects from the catalog (`pg_class`, `pg_proc`) instead of a hand-kept list, and inventory tests (`API-INVENTORY`, `PAGE-INVENTORY`) fail when a route or page file exists that the sweep does not know about, so a new public surface cannot slip in unscanned.
- D-98 A public response is clean only if BOTH checks pass: `assertNoPii` (keys, email/phone-looking values) and "none of the seeded private values appears". The second check does not depend on the scanner's patterns, so a renamed key (`organiser`, `born`) cannot hide a leak.
- D-99 Any public key or column whose name looks like RSVP data (`rsvp|attend|going|maybe|answer|reason|respon`) fails T-12, except `rsvp_open` (a flag about the match).

**Next session needs to know**
- Public API routes covered (all in `tests/api/public-pii.test.ts`): `GET /api/health`, `GET /api/home`, `GET /api/squad`, `GET /api/players/[id]`; session routes called as a visitor (error answers scanned): `GET /api/me`, `GET`/`PUT /api/me/settings`, `POST /api/auth/sign-in`, `sign-out`, `sign-out-all`. Public pages covered (`tests/e2e/public-crawl.spec.ts`): `/`, `/sign-in`, `/squad`, `/players/[id]` (all 41 ids), 404 pages; private pages that must redirect a visitor: `/settings`, `/fixtures/[id]`.
- When you add a route or page: add it to `visitorCalls()` and the `API-INVENTORY` list (API test) or to `PAGES` and the `PAGE-INVENTORY` list (e2e spec); the inventory tests fail until you do. New `public` views and functions are covered automatically by the DB sweep. New RSVP-related views or functions for signed-in players (`rpc_attendance`, session 13 and later) must be executable by `authenticated` only: the DB sweep fails if anon can execute any `public` function.
- Fake RSVP rows for a test: `insert into core.rsvps (match_id, player_id, answer, reason)` as owner, see `addRsvps` in `tests/db/pii.test.ts`.
- The mutation snapshots are in `%TEMP%\pintfc-s12-snap` (copies of squad.ts, home.ts, privacy.ts, pii.test.ts); the owner may delete that folder. The e2e and db runs again left their usual `pintfc-pg-*` temp folders.

## session-13 — rsvp-db-api (2026-11-12)

**Done**
- `supabase/migrations/0009_rsvp.sql`: `public.rpc_rsvp_set(p_match_id uuid, p_answer text, p_reason text default null)`.
- `src/server/rsvp.ts` (`setMyRsvp`), `src/app/api/fixtures/[id]/rsvp/route.ts` (`PUT`, strict body via the existing `rsvpSchema`, no player id anywhere).
- `tests/db/rsvp.test.ts` (8) and `tests/api/rsvp.test.ts` (8). Two lines of other files, with the owner's OK: one `PUBLIC_FUNCTIONS` row in `tests/db/matrix.ts`; the new route in `visitorCalls()` and the inventory list of `tests/api/public-pii.test.ts`. Nothing installed. `DECISIONS.md` NOT touched (not on the list).

**Proof**
- RED first (placeholder migration `select 1;`, a route answering 404): db 8 of 8 failed (`expected '42883' to be 'PF410'`, `function public.rpc_rsvp_set(unknown, unknown, unknown) does not exist` as an assertion on `error` being null); api 8 of 8 failed (`expected 404 to be 401/400/200`). No missing-module errors.
- Exit gate, each on its own, exit 0: `test:db -- tests/db/rsvp.test.ts` 8 passed; `test:api -- tests/api/rsvp.test.ts` 8 passed; `npm run gate` ALL 7 GATES PASSED (typecheck, lint, unit 21, db 67, api 54, e2e 41, plan:check OK).
- Security mutation check (each on its own; files restored with the Edit tool; SHA-256 of `0009_rsvp.sql`, `rsvp.ts`, `route.ts` equal to the snapshots taken before; no `MUTATION` marker left):
  - **Run on the FINAL `0009_rsvp.sql`** (SHA-256 `7B2267D7…576107`; each applied alone, restored with the Edit tool, hash equal after each, 0 `MUTATION` markers left): M1, M2, M3, M8.
  - M1 [FINAL] cutoff check `now() > cutoff` (the exact cutoff instant is accepted): CAUGHT, 1 failed | 7 passed (AC-3.3.4 [db]: `now == cutoff: expected null to be 'PF409'`).
  - M2 [FINAL] status check removed (cancelled/played fall through to PF409): CAUGHT, 2 failed | 6 passed (T-22, AC-3.3.6: `expected 'PF409' to be 'PF410'`).
  - M3 [FINAL] cutoff check removed: CAUGHT, 3 failed | 5 passed (AC-3.3.4, T-03, T-22: `expected undefined to be 'PF409'`).
  - **Run on the migration BEFORE the kickoff check was added (M4 to M7; the lines they mutate are unchanged in the final file, but they were NOT re-run on it):**
  - M4 player taken from `auth.uid()` instead of `core.require_player()`: CAUGHT (T-04, RSVP-GRANT-1).
  - M5 `on conflict do nothing` (a changed answer is lost): CAUGHT (AC-3.3.1, AC-3.3.2, T-04).
  - M6 old reason survives a new answer: CAUGHT (AC-3.3.2 [db]).
  - M7 anon granted execute: CAUGHT (RSVP-GRANT-1).
  - A1 route body not strict (`rsvpSchema.loose()`): CAUGHT (AC-3.3.6, T-04, RSVP-PUT-3 [api]).
  - A2 response `me.reason` falls back to another player's reason: CAUGHT (AC-3.3.1, AC-3.3.2, RSVP-PUT-1 [api]).
  - M8 [FINAL] the kickoff check `kickoff_at <= now()` removed: CAUGHT at both levels, db 1 failed | 7 passed (T-22), api 1 failed | 7 passed (AC-3.3.6).
  - A1 and A2 changed `route.ts` / `rsvp.ts`, which have not changed since (their SHA-256 matched the snapshots), so they ran on the final versions of those files; the API tests only gained the `M_KICKED` match afterwards.
  - Summary: on the final migration M1, M2, M3, M8 ran; M4, M5, M6, M7 ran on the earlier migration (not re-run); A1, A2 ran on the final route and server file.
- Known gaps: (1) **The PUT response is NOT the full attendance body.** `docs/design/api.md` says it returns "the same body as attendance"; `GET /api/fixtures/{id}/attendance` does not exist yet, so the PUT returns the smaller `{ server_now, match: {id, cutoff_at, rsvp_open}, me: {answer, reason} }` (owner-approved). The full body (counts, attendees) arrives with the attendance endpoint; until then `api.md` and the code differ on purpose. (2) UNTESTED: the exact-cutoff and exact-kickoff boundaries are proved at db level only (frozen-clock tests); the API tests do not freeze the clock and use matches 96 h away, 1 h away, 1 h past, cancelled and played. (3) UNTESTED: a cancel racing a save. The function takes `for share` on the match row, which should make a concurrent cancel wait, but no test runs the two at once. (4) `rpc_rsvp_set` does not itself reject an archived player; `core.require_player()` does (PF401), and no test here covers an archived login (player 41 is covered by session 05 tests).

**Decisions** (proposed; `DECISIONS.md` is not on this session's file list, so they are NOT yet in it: the owner decides)
- D-100 `rpc_rsvp_set(p_match_id uuid, p_answer text, p_reason text default null)` takes no player id; the player is `core.require_player()` (T-04). Returns one row: `match_id, cutoff_at, rsvp_open, server_now, answer, reason`; `answer`/`reason` are the caller's own, never anyone else's (T-05).
- D-101 Rejection order and codes: not signed in `PF401`; bad answer or reason over 140 characters `22023` (the API turns these into 400 before it gets there); unknown match `PF404`; match not `scheduled` (cancelled or played) or already kicked off (`kickoff_at <= now()`) `PF410` MATCH_NOT_OPEN; between the cutoff and kickoff (`now >= cutoff`) `PF409` RSVP_CLOSED. Follows `docs/design/api.md` line 19 ("match cancelled, played or past"); "past" was ambiguous and the owner chose this reading. (First version of this session had kicked-off matches as `PF409`; changed after the owner's decision. RED for the change: T-22 failed with `expected 'PF409' to be 'PF410'`, then passed.)
- D-102 Saving again replaces the answer AND the reason (an omitted or empty reason clears the old one); `created_at` stays, `updated_at` moves. An empty reason is stored as none.
- D-103 (owner-approved) `PUT /api/fixtures/{id}/rsvp` returns `{ server_now, match: {id, cutoff_at, rsvp_open}, me: {answer, reason} }` until the attendance endpoint exists; the reason is only ever returned to its own author. Timestamps are ISO strings.
- D-104 Tests freeze the database clock by creating the match inside the same transaction that calls the function, with `kickoff_at = now() + interval '...'` (Postgres `now()` does not move inside a transaction), and asserting two `now()` reads 50 ms apart are equal.

**Next session needs to know**
- Function: `public.rpc_rsvp_set(uuid, text, text)`, SECURITY DEFINER, `search_path=''`, executable by `authenticated` only. Matrix row key: `public.rpc_rsvp_set(uuid,text,text)`.
- SQLSTATE mapping: `PF401` UNAUTHENTICATED (401), `PF404` NOT_FOUND (404), `PF409` RSVP_CLOSED (409: between cutoff and kickoff), `PF410` MATCH_NOT_OPEN (409: cancelled, played, or kickoff passed), `22023` bad input (the API validates first, so a 400 VALIDATION). Error mapping and `rsvpSchema` were already in `src/lib/errors.ts` / `src/lib/schemas.ts`.
- Freezing time: see `frozenCall` in `tests/db/rsvp.test.ts` (own transaction via `db.ownerTx`, match inserted with `now() + interval`, then `set local role authenticated` and the claims). For API tests, insert matches with owner SQL relative to `now()` (see `tests/api/rsvp.test.ts`).
- Fake RSVPs from a test: sign in through the real sign-in route and `PUT`, or insert into `core.rsvps` as owner.
- Session 14 (UI): the PUT response has no counts or attendees yet; the page must call the attendance endpoint (or session 14 must add it) for those. The e2e database is shared: an e2e test that saves an RSVP must undo it, and the seed's matches decide whether the demo match is open.
- New routes under `/api` must be added to the `API-INVENTORY` list in `tests/api/public-pii.test.ts` (done here for `fixtures/[id]/rsvp`).
- Process note: all files were created and edited with Write/Edit; the mutation snapshots were SHA-256 hashes printed in the terminal (no copies on disk). The `npm run test:*` runs in the mutation loop were piped to `Select-String` only to shorten the output (not exit-gate runs).

## session-14 — event-page-rsvp-ui (2026-11-12)

**Done**
- `supabase/migrations/0010_attendance.sql`: `public.rpc_attendance(p_match_id uuid)`, one row: `match_id, opponent, competition, venue, kickoff_at, cutoff_at, status, rsvp_open, server_now, going, maybe, not_going, no_answer, attendees (jsonb [{player_id, name, answer}]), my_answer, my_reason`. SECURITY DEFINER, empty search_path, executable by `authenticated` only, starts with `core.require_player()`.
- `src/server/attendance.ts` (`getAttendance`, the `Attendance` DTO), `src/app/api/fixtures/[id]/attendance/route.ts` (`GET`), `src/app/fixtures/[id]/page.tsx` (real page), `data.ts` (`checkMatch`: page or 404), `not-found.tsx`, `src/components/Attendance.tsx`, `src/components/RsvpButtons.tsx`.
- Tests: `tests/db/attendance.test.ts` (5: AC-3.3.1, AC-3.4.1, AC-3.4.3, T-05, ATT-GRANT-1), `tests/api/attendance.test.ts` (5: AC-3.3.1, AC-3.4.1, AC-3.4.3, T-05, ATT-API-1), `tests/e2e/fixture.spec.ts` (9: AC-3.3.1, AC-3.4.1, AC-3.4.3, FIXTURE-1..6).
- Owner-approved edits outside the plan's file list, exactly as approved: one `PUBLIC_FUNCTIONS` row in `tests/db/matrix.ts`; in `tests/api/public-pii.test.ts` the new route in `visitorCalls()` and the inventory list (plus the one import line that `visitorCalls()` needs); `src/server/attendance.ts`. Nothing installed. `DECISIONS.md` NOT touched. The PUT route was not changed.

**Proof**
- RED first (placeholder migration `select 1;`, a route skeleton answering 404, the stub page): db 5 of 5 failed (`function public.rpc_attendance(unknown) does not exist` as an assertion on `error` being null; `expected '42883' to be '42501'`); api 5 of 5 failed (`expected 404 to be 200`, `expected 404 to be 401`; a first run had two TypeErrors on a null body, fixed by asserting the status first, then re-run: 5 of 5 assertion failures); e2e 9 of 9 failed (`element(s) not found` for the new test ids, `Expected: 404 Received: 200`, click timeouts on buttons that did not exist yet). No missing-module errors.
- GREEN: db 5 passed, api 5 passed, e2e 9 passed on the first run of the real code (after a skeleton signature fix for typecheck, and two lint fixes: `location.assign` with an absolute URL, as in `Header.tsx`).
- Exit gate, each command on its own, exit 0 (output shown in the session): `test:db -- tests/db/attendance.test.ts` 5 passed; `test:api -- tests/api/attendance.test.ts` 5 passed; `test:e2e -- tests/e2e/fixture.spec.ts` 9 passed; `npm run gate` ALL 7 GATES PASSED (typecheck, lint, unit 21, db 72, api 59, e2e 50, plan:check OK).
- Security mutation check (each on its own, restored with the Edit tool; no `MUTATION` marker left; SHA-256 of `0010_attendance.sql`, `attendance.ts`, `Attendance.tsx` equal to the snapshots; `route.ts` had NO snapshot (a wildcard slip with `[id]` in the path), it was restored by editing the one changed line back):
  - M1 reason added to every attendee in the list: CAUGHT, 3 failed (AC-3.3.1, AC-3.4.3, T-05 [db]).
  - M2 `my_reason` not filtered to the caller (any player's reason): CAUGHT, 2 failed (AC-3.3.1, T-05 [db]).
  - M3 `execute` also granted to anon: CAUGHT by 3 tests (ATT-GRANT-1, MATRIX-1, T-02 [pii]).
  - M4 list and counts also include archived players: CAUGHT, 1 failed (AC-3.4.1 [db]).
  - M5 `core.require_player()` replaced by a fixed player id (no session check): CAUGHT, 3 failed (AC-3.3.1, AC-3.4.1, T-05 [db]).
  - A1 the route ignores the session: CAUGHT, 5 of 5 failed [api] (a blunt mutation: it fails everything, not only the 401 test).
  - U1 the page renders a teammate's reason if the response carried one: CAUGHT by exactly one test (AC-3.4.3 [e2e]).
- **Known gaps (owner-accepted):** (1) `signin-prompt` from screens.md is missing: a visitor is redirected to `/sign-in` instead (D-108, owner decided to keep the redirect). (2) The real-write e2e test (AC-3.3.1 [e2e]) needs the seeded demo match to still be open: the e2e server seeds its cutoff 90 minutes ahead, so a run longer than 90 minutes fails it (D-112, owner accepted the limit and the mocked e2e approach). (3) `route.ts` of the attendance route was restored by hand after mutation A1 with no SHA-256 snapshot; the final file was printed and reviewed by the owner. (4) D-105 to D-113 are now in `DECISIONS.md` (copied at staging).
- **Known gap (T-10 fix, owner-approved edit of a session 10 privacy test):** after session 14's work, the full gate failed twice on `tests/e2e/squad.spec.ts` T-10 ("unknown id renders the same page as hidden minor", whole-document comparison), while T-10 alone and fixture+squad together passed. Diagnosis (read-only, scratchpad spec): the pages differ by exactly one tag, `<script src="/_next/static/chunks/40aei9yrbnrjb.js"></script>` in `<head>` (the squad route's error-boundary chunk, 61 characters), which Next appends when it prefetches `/squad` (the header, footer and back-to-squad links are on every player page); a capture lands before or after it. A scratch loop of 40 rounds (120 comparisons) mismatched 40 times with immediate capture and 0 times after `networkidle`. **The failing run itself was NOT reproduced** (its `error-context.md` was overwritten by a later passing run; the full suite passed 50/50 and the real T-10 passed 25/25 under CPU load), so the link to the owner's two failures is likely, not proven. Session 14 touched none of the files involved, but may have shifted timing. The fix (D-114) edits a session 10 privacy test, so it is recorded here. Proof of the fix: T-10 passed 5/5; mutation M1 (extra text on the unknown-id page) and M2 (an extra `<script src>` outside `/_next/static/chunks/`) both made T-10 fail with the same message; the file was restored with Edit, SHA-256 equal to the post-edit snapshot (`D86CF679…2A9E64`), 0 `MUTATION` markers.
- Not mutated: the answer-group ordering, the `no_answer` count, the `rsvp_open` rule inside `rpc_attendance` (covered by tests, no mutation of its own), and `src/server/attendance.ts` key-by-key copying (no test can see a difference unless the database leaks, which M1 already proves is caught).

**Decisions** (proposed; `DECISIONS.md` is not on this session's file list, so they are NOT yet in it: the owner decides at staging)
- D-105 `rpc_attendance` lists only ACTIVE players who answered; the counts cover active players only; `no_answer` is the number of active players with no answer. An archived player's old answer is neither counted nor listed. Names are shown to every signed-in player, whatever the player's public-squad setting (the list is a team list, not the public squad).
- D-106 The list is ordered going, maybe, not_going, then name, then id; the API keeps that order and the page groups by answer.
- D-107 The match can always be read (scheduled, cancelled, played, closed): the function returns `status` and `rsvp_open` (the shared rule `core.rsvp_is_open` on the database clock); an unknown match is `PF404` (404), a malformed id is a 400. The page shows `match-not-open` (and no buttons) when the status is not `scheduled` or the server-corrected clock is at or past kickoff, and disables the buttons with `rsvp-closed` between the cutoff and kickoff.
- D-108 **Deviation from screens.md, kept on purpose:** a visitor on `/fixtures/[id]` is redirected to `/sign-in` (middleware and page), not shown the match header with `signin-prompt`. The redirect is what session 06 (AC-1.6.3) and session 12 (public crawl, PAGE-INVENTORY) already assert; a header for visitors would also need a public view of a match by id (new public surface). So `signin-prompt` does not exist. The owner decides whether to change it later (it would touch `src/middleware.ts`, `auth.spec.ts` and `public-crawl.spec.ts`).
- D-109 The page checks "page or 404" on the server (`checkMatch`, through the same `getAttendance`), and the data is fetched by the browser component, so it can refresh and so e2e tests can mock the API. An unknown or malformed id is a real 404 with the not-found page; the page never repeats the id.
- D-110 Tapping an answer saves it at once with the current reason box text (omitted when empty; an empty box clears an old reason, D-102). The reason box is only sent with a tap on an answer; the page says so. The response of the PUT sets my answer; the page then reloads attendance once.
- D-111 The page uses the server-corrected clock (`createServerClock(server_now)`, one per response): `rsvp-status` flips to "RSVP closed" at the cutoff without a reload, and `last-updated` counts seconds since `server_now`.
- D-112 e2e: counts, lists and every state come from `page.route` mocks (as in session 07). One test (AC-3.3.1 [e2e]) really writes, as player `two` on the seeded demo match, and asserts only what its own clicks produce. A saved RSVP CANNOT be restored to "no answer" (a player can only replace an answer; the e2e database is not reachable from a spec), so nothing relies on restoring it. That test needs the demo match to be open: the e2e server seeds it with its cutoff 90 minutes after the server starts, so a run longer than that would fail it.
- D-113 Styles are an inline `<style>` in `Attendance.tsx` (classes `fx-*`) and inline styles, because `globals.css` and any new CSS file are off this session's list (as D-78). Projector mode: at 1200 px and wider the four counts are in one row and larger.
- D-114 (owner-approved) The T-10 whole-document comparison in `tests/e2e/squad.spec.ts` removes only `<script src="/_next/static/chunks/...">` tags before comparing (the framework appends a prefetched route's chunk to `<head>` at an unpredictable moment, so a capture may or may not contain it). Every other byte of the document is still compared; mutations with extra text, and with an extra script tag outside `/_next/static/chunks/`, still fail T-10. It changes a session 10 privacy test (see the known gap above).

**Next session needs to know:** Attendance DTO and where the poller will attach (session 15)
- `GET /api/fixtures/{id}/attendance` returns `{ server_now, match: { id, opponent, competition, venue, kickoff_at, cutoff_at, status, rsvp_open }, counts: { going, maybe, not_going, no_answer }, attendees: [{ player_id, name, answer }], me: { answer, reason } }` (all instants ISO `Z`; `status` is `scheduled | cancelled | played`). Type `Attendance` in `src/server/attendance.ts`; `getAttendance(caller, matchId)` is shared by the route and the page. 401 without a player session, 404 unknown match, 400 malformed id.
- The poller attaches in `src/components/Attendance.tsx`, to the function `refresh` (a `useCallback`): it fetches, builds a new server clock from the new `server_now`, replaces the data, and on failure only sets `failed` (the older data stays on screen with "Showing older data", `fixture-error` plus `retry-button`). Session 15 should call `refresh` from `createPoller` (`src/lib/poll.ts`, D-43) on mount and stop it on unmount. NOTE: `refresh` is also called after every save (`onChanged` of `RsvpButtons`), and the mount effect currently repeats the fetch code instead of calling `refresh` (a small duplication to remove when the poller is added). `RsvpButtons` keeps its own answer and reason in state (initialised once from `me`), so a poll does not overwrite what a player is typing.
- Test ids: `page-fixture`, `rsvp-status`, `rsvp-closed`, `match-not-open`, `count-going`, `count-maybe`, `count-not-going`, `count-no-answer`, `my-answer`, `rsvp-going`, `rsvp-maybe`, `rsvp-not-going`, `rsvp-reason`, `rsvp-reason-counter`, `rsvp-saved`, `rsvp-error`, `attendee-row`, `attendees-empty`, `last-updated`, `fixture-loading`, `fixture-error`, `retry-button`, `not-found`, `back-home`.
- Any e2e test of this page: sign in with `signInThroughForm`, mock `**/api/fixtures/*/attendance` (see `openMocked` in `tests/e2e/fixture.spec.ts`) and use the seeded demo match id `00000006-0000-4000-8000-000000000100` in the URL (the page checks the match exists in the database). Freeze time with `page.clock.install` + `pauseAt` (FIXTURE-6).
- `signin-prompt` from screens.md does not exist (D-108). The PUT response is still the small body of session 13 (D-103); the page reloads attendance after a save instead.
- Each `npm run test:*` run leaves its usual `pintfc-pg-*` temp folders; the owner may delete them.

## session-15 — rsvp-cutoff-live (2026-11-14)

**Done**
- `src/components/Attendance.tsx`: `createPoller` (src/lib/poll.ts, used unchanged) now calls `refresh` every 10 s while visible, pauses while hidden, refetches at once when visible again, waits 20 s after an error. `refresh` throws on failure so the poller backs off; the page keeps the older data and shows "Showing older data" + retry. The duplicated mount fetch was removed (first load goes through `refresh`). A `mounted` ref stops state updates after unmount.
- `src/components/LiveClock.tsx` (new): `useServerNow(clock)` (server-corrected time, ticks every second, follows a new clock at once) and the `LiveClock` component ("Updated n s ago", test id `last-updated`).
- `tests/e2e/live.spec.ts` (6 tests): AC-3.3.4, AC-3.3.5, LIVE-1 (two real browser contexts, real server), T-17 (device clock behind, then 12 h ahead), POLL-1 (failed poll keeps data), POLL-2 (hidden pause, refetch on visible).
- Nothing installed. No file outside the plan's list touched. `poll.ts` not edited. `DECISIONS.md` NOT touched.

**Proof**
- RED first (no poller yet): 5 of 6 failed on assertions (`Expected: 2 Received: 1` on the request counter; LIVE-1 `Expected: 1 Received: 0` on B's count after 15 s). No missing-module errors. **AC-3.3.4 [e2e] was already GREEN before any code**: session 14's refresh after a rejected save already shows "RSVP closed" and keeps the answer. Its DB and API levels are session 13's tests (T-22 etc.); it was not re-proved by a RED here.
- GREEN: `npm run test:e2e -- tests/e2e/live.spec.ts` 6 passed (exit 0). `npm run gate` ALL 7 GATES PASSED, exit 0 (typecheck, lint, unit 21, db 72, api 59, e2e 56, plan:check OK).
- Mutation check (each alone, restored with Edit; SHA-256 of Attendance.tsx, LiveClock.tsx, live.spec.ts equal to the snapshots; 0 `MUTATION` markers):
  - M1 decisions use the device clock (`Date.now()`): CAUGHT by T-17 and POLL-1. **AC-3.3.5 did NOT catch it** (its poll carries `rsvp_open:false`); the server-clock path is proved by T-17 and session 14's FIXTURE-6.
  - M2 `open` ignores `rsvp_open` and the cutoff: CAUGHT, 3 failed (AC-3.3.4, AC-3.3.5, T-17).
  - M3 a failed poll wipes the data: CAUGHT by POLL-1.
  - M4 poller ignores hidden state: CAUGHT by POLL-2.
  - Not mutated: disabling the buttons lives in `RsvpButtons.tsx` (off this session's list).
- Process note: files were created and edited with Write/Edit only. The mutation runs were piped to `Select-String` only to shorten output (not exit-gate runs). The gate itself ran as `npm run gate` with no pipe; it exceeded the 10-minute foreground limit, ran in the background and exited 0.

**Decisions** (proposed; `DECISIONS.md` is not on this session's file list, so they are NOT yet in it: the owner decides)
- D-115 `refresh` throws on a failed load, so the poller waits 20 s; callers that are not the poller (retry button, after a save) catch it (`refreshQuietly`).
- D-116 LIVE-1 really writes as player `one` on the seeded demo match and changes to an answer `one` does not have, so it works whatever earlier runs left. B (`two`) is watched through its count of that answer: it must rise by 1 within 15 s. It needs the demo match to be open (same 90-minute limit as D-112).
- D-117 AC-3.3.5 has no separate unit test in this session (the plan lists "U + E2E"; `tests/unit` files are off the file list). The clock maths are covered by session 03's unit tests and FIXTURE-6.

**Next session needs to know**
- Timing values in tests: poll 10 s (error 20 s); device clock frozen at `2026-11-14T08:00:00Z` with `page.clock.install` + `pauseAt(+1 s)` then `runFor(10_000)`; cutoff `17:00:00Z` (kickoff 19:00Z); "3 s before cutoff" is server_now `16:59:57Z`. LIVE-1 uses real time, 15 s window.
- The demo match (seed flag, id `00000006-0000-4000-8000-000000000100`, cutoff ~90 min after the e2e server starts) is what the class will watch. LIVE-1 and AC-3.3.1 [e2e] need it open.
- Mocked e2e tests count attendance GETs with a counter in the `page.route` handler (`openLive` in live.spec.ts returns `calls()`).

## session-16 — live-in-class (2026-11-14)

**Done**
- `src/components/MiniTable.tsx`: shows the snapshot date from `standings.taken_on` as "As of Nov 5, 2026" (test id `table-snapshot-date`, above the table). `taken_on` is a calendar date already in the club zone, so it is read as UTC midnight and formatted in UTC: the day never shifts. No date when there is no table (empty state).
- `src/server/home.ts`: comment only (the date is now shown). No logic change.
- `tests/e2e/home-table.spec.ts`: the placeholder `MINI-TABLE-1` (asserted the date was NOT shown) replaced by `AC-2.4.3 [e2e] mini table shows the snapshot date`, plus `AC-2.4.3 [e2e] the snapshot date is not shown when there is no table`.
- Nothing installed. No file outside the plan's list touched. Not committed.

**Proof**
- RED first: AC-2.4.3 failed on an assertion (`getByTestId('table-snapshot-date')` Expected: 1, Received: 0); the other 6 passed.
- GREEN: `npm run test:e2e -- tests/e2e/home-table.spec.ts` 7 passed, exit 0. `npm run gate` ALL 7 GATES PASSED, exit 0 (typecheck, lint, unit 21, db 72, api 59, e2e 57, plan:check OK).
- Mutation check (this session has no security rule of its own; mutated the date logic): (A) format in `America/New_York` instead of UTC -> failed `Expected "As of Nov 5, 2026" Received "As of Nov 4, 2026"`; (B) render the raw `taken_on` -> failed `Received "As of 2026-11-05"`. Both reverted with Edit; the e2e file then passed 7/7.

**Decisions**
- Format "As of Mon D, YYYY" (en-US), in UTC because the value is a date, not an instant. `DECISIONS.md` NOT touched (the plan says to add decisions there too: owner to say if wanted).
- The old `MINI-TABLE-1` test was replaced because it contradicts AC-2.4.3.

**Next session needs to know:** Nothing special: this session is independent and can be run at any time after session 09.

## session-17 — gates-design (2026-11-14)

**Done**
- `tests/e2e/a11y.spec.ts` (22 tests): AC-5.2 axe `color-contrast` on 17 page x state cases (home loaded / empty / error / real data, squad, player, player not found, sign-in idle / error, settings, fixture open / closed / cancelled / empty list / error / not found, 404); CSP-2 (home, sign-in and squad hydrate with the CSP on, no CSP console errors); T-15 (name / reason text is shown as text; an injected inline script and inline `onerror` handlers are blocked).
- `tests/e2e/layout.spec.ts` (8 tests): AC-5.4 no horizontal scroll at 320 px, one per page, with long unbroken names; also lists the elements that stick out.
- `tests/e2e/screenshots.spec.ts` (17 tests): every state at 390 px and 320 px into `screenshots/` (34 files, named `<state>-<390|320>.png`, gitignored by the owner-approved `.gitignore` line, nothing deleted).
- `tests/unit/security.test.ts` (11 tests): T-13, T-14, T-18, CSP-1 (middleware response and next.config.mjs), CSP-3 (nonce differs per request and is forwarded to Next), CSP-4 (redirect and no-store unchanged).
- `src/middleware.ts`: per-request nonce and the Content-Security-Policy header added; the redirect and cookie logic is untouched. `next.config.mjs`: `headers()` only. `src/app/not-found.tsx` (new, markup): the site-wide 404 with `data-testid="not-found"`. `.gitignore`: one line, `screenshots/`. `tests/e2e/squad.spec.ts`: one line plus a comment (D-129).
- Installed (owner "yes"): `@axe-core/playwright@4.14.0`, exact, dev dependency (pulls in `axe-core@~4.14.0`). `package.json` and `package-lock.json` changed. `DECISIONS.md` NOT touched yet (owner will give the staging prompt).
- Contrast and 320 px: no existing page failed either gate. The only real defect was the missing global 404 page, now added.

**Proof**
- RED first, all on assertions, none on missing modules: a11y 404 and layout 404 failed `getByTestId('not-found')` not found (the page did not exist); CSP-1 `the middleware must set Content-Security-Policy on page responses: expected '' not to be ''`; CSP-1 config `default-src: expected "default-src 'self'" to be undefined`; CSP-3 `nonce on the first response: expected undefined to be truthy`. First security.test.ts run also showed my own scanner mistakes (fixed, not code defects). With a strict policy and no nonce, CSP-2 failed: inline scripts and styles blocked, the menu button never toggled (no hydration). The screenshots spec has no separate RED (its only failure cause, the missing 404 page, was fixed before it was written); it asserts each file exists and is over 1 KB.
- Exit gate, each alone, no pipe: `a11y.spec.ts` 22 passed, exit 0; `layout.spec.ts` 8 passed, exit 0; `screenshots.spec.ts` 17 passed, exit 0; `security.test.ts` 11 passed, exit 0; `npm run gate` ALL 7 GATES PASSED, exit 0 (typecheck, lint, unit 12 files / 32 tests, db 72, api 59, e2e 104, plan:check OK). `tests/e2e/auth.spec.ts` passed unchanged.
- An earlier `npm run gate` failed at e2e on T-10 only (nonce differs per request); fixed by D-129, then green.
- A second miss, found by the owner in a gate log after the files were staged: T-14 failed on `tests/unit/security.test.ts` itself (three lines: two sample database URLs with a password and the allowlisted fake JWT text). `git ls-files` lists staged files, and every earlier run (including the "ALL 7 GATES PASSED" above) happened while that file was still untracked, so the scanner never read it. Fixed by writing those literals as two pieces joined with `+`; no allowlist entry was added and the file still scans itself. After the fix, with the file staged: `test:unit -- tests/unit/security.test.ts` 11 passed, and `npm run gate` unpiped exit 0, ALL 7 GATES PASSED (unit 12 files / 32 tests, db 72, api 59, e2e 104, plan:check OK). M5 was then re-run against this staged state: a token-variable line with a 20-character fake value added to the tracked `PROGRESS.md` made only T-14 fail (10 of 11 passed), with exactly one finding, `PROGRESS.md:605 token variable with a value` (security.test.ts did not trip on itself); restored with Edit, SHA-256 equal to the snapshot, 0 markers left. The gate was not re-run after these last `PROGRESS.md` edits; only `security.test.ts` was (below).
- Mutation checks (each alone, restored with Edit; SHA-256 or git object id equal to the snapshot; 0 `MUTATION` markers left):
  - M1 `script-src 'self' 'unsafe-inline'`: CAUGHT by CSP-1, CSP-3 and the T-15 injection test.
  - M2 nonce dropped: CAUGHT by CSP-1, CSP-3 and 5 e2e tests (CSP-2 x3, both T-15 tests).
  - M3 string-built SQL in `src/server/squad.ts`: CAUGHT by T-18 (file and line named). M4 a client component imports server code: CAUGHT by T-13. M5 a token-shaped value in a tracked file: CAUGHT by T-14.
  - M6 weaker `--muted` colour: AC-5.2 failed on all 17 states with `color-contrast`. M7 `.page { min-width: 500px }`: AC-5.4 failed on all 8 pages (overflow 180 px). My first M7 had no effect (a later `min-width: 0` in the same rule overrode it), so it was redone on that line.
  - T-10 after D-129, on a counter-based variant of the shared player 404 page: (1) extra visible text: CAUGHT; (2) extra inline script tag without a nonce: CAUGHT; (3) a `nonce` prop with a 48-character value (the masked form) added to the back link of every second render: CAUGHT by the whole-document comparison; (4) a `nonce` prop with a changing non-48-character value ("short-N") on the same link: CAUGHT by the whole-document comparison. In (3) and (4) the prop shows up both as a DOM attribute and in the framework payload; which of the two made T-10 fail was NOT isolated, so a nonce property added and a differing nonce attribute are not separately proven. All four ran against the real T-10 in `squad.spec.ts`, using a temporary per-render counter in `src/app/players/[id]/not-found.tsx` (the shared player 404 component) so every second render differs; the mask regex itself was not mutated.
- Process: files were created and edited with Write and Edit. Two slips: one shell heredoc appended the CSP-2 block to `a11y.spec.ts` (before the owner's "Write/Edit only" was repeated), and one `rm -f` on a scratchpad path that did not exist (nothing was deleted). The gate ran as `npm run gate` with output redirected to a file, not a pipe; it exceeded the foreground limit, ran in the background and exited 0.

**Decisions** (D-120 to D-129; NOT yet in `DECISIONS.md`, the owner will say when)
- D-120 (owner-approved) `src/app/not-found.tsx` counts as on the plan's file list (`src/**` markup). The site-wide 404 had no `not-found` test id, which screens.md requires.
- D-121 The Content-Security-Policy is set in `src/middleware.ts` with a fresh nonce per request: `default-src 'self'; script-src 'self' 'nonce-<n>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:`. No `unsafe-eval`, and no `unsafe-inline` for scripts. Styles keep `unsafe-inline` because the pages use inline style attributes and a `<style>` tag (D-113). The middleware forwards the same policy on the request so Next puts the nonce on its own scripts.
- D-122 `next.config.mjs` `headers()` holds only the non-script directives (`font-src`, `connect-src`, `object-src 'none'`, `base-uri`, `form-action`, `frame-ancestors 'none'`). It must never contain `default-src` or `script-src`: browsers enforce both headers together, so that would block the nonce'd scripts (CSP-1 checks this).
- D-123 `'strict-dynamic'` lets a script that is already running add scripts through the DOM API; that is not how injected markup arrives. T-15 therefore injects through an iframe `srcdoc` (parser-inserted inline script) and inline `onerror` handlers, which stay blocked.
- D-124 T-14 allows four exact fake strings in four test files (`tests/api/with-api.test.ts`, `tests/unit/errors.test.ts`, `tests/unit/seed-fake.test.ts`, `tests/unit/log.test.ts`): fake values those tests feed to the log redactor and error handler. Any other match in those files still fails.
- D-125 T-18 allows exactly one string-built statement: `set local role ${role}` in `src/server/db.ts` (the role is checked against `'anon' | 'authenticated'` on the line above; SET ROLE cannot take a parameter). Anywhere else it fails.
- D-126 T-13 scans the built bundle (`.next/static`) and fails if it is missing. The e2e server builds it, so a fresh checkout must run `npm run build` (or the e2e step) before `npm run test:unit`, or the first `npm run gate` fails at unit.
- D-127 T-15 [e2e] and CSP-2 live in `tests/e2e/a11y.spec.ts`: the plan lists no e2e file for security tests, and the file list is closed.
- D-128 The axe gate asserts only the `color-contrast` rule (AC-5.2); other axe rules are not asserted.
- D-129 (owner-approved) `tests/e2e/squad.spec.ts` T-10 also masks the 48-character value of the escaped JSON property `\"nonce\":\"...\"` before comparing the 404 documents (the nonce is different on every request). Only that value is masked; every other byte is still compared. It changes a session 10 privacy test.

**Known gaps**
- T-13 needs `.next/static` to exist (D-126).
- T-14 and T-18 have the exceptions in D-124 and D-125.
- `style-src 'unsafe-inline'` stays: injected CSS can restyle or cover the page. `img-src` allows `https:` (player photos), so an image request can still carry data out. (The `img-src` half is closed in session 20c: `'self' data:` only, D-166.) Removing both needs the inline styles moved into CSS files.
- Contrast, 320 px and screenshots cover states reachable without breaking the server: loading skeletons and the server-rendered squad error / empty states are not captured (no mock point for server-rendered pages).
- T-15 saves nothing: names and the reason come from a mocked attendance response (React escaping is what is under test); no real RSVP write with markup is made.
- T-10 does not check that the nonce values inside one page agree with each other (CSP-3 covers the nonce per request).
- The screenshots were produced but not looked at by the assistant; the owner reviews them (release requirement #4) before session 18.
- `npm install` printed existing peer-dependency warnings (eslint 10 vs plugins) and `npm audit` reports 46 vulnerabilities; not investigated.
- Lesson (the T-14 miss above): a test that scans tracked files must be run after the files are staged. Run on an untracked working tree it skips the new files and can pass while the committed state fails. Any new test file that holds token-shaped sample strings must build them from pieces.

**Next session needs to know**
- Screenshots: `screenshots/` in the repo root, 34 files, `<state>-390.png` and `<state>-320.png` (for example `fixture-open-320.png`, `home-error-390.png`). Gitignored, never deleted; the gate re-writes them. The owner reviews them before session 18; any change the owner asks for is not recorded yet.
- A new inline `<script>` added by app code will be blocked unless it carries the nonce; Next's own scripts get it automatically. The middleware does not run for `/api/*`, `/_next/*` or `favicon.ico`, so those carry only the `next.config.mjs` directives.
- The new e2e tests use the same seeded ids and fake data as earlier sessions; none of them writes to the shared database. AC-3.3.1 and LIVE-1 still need the demo match to be open (90-minute limit, D-112 and D-116).
- `DECISIONS.md` still needs D-120 to D-129 copied from this section (owner's staging prompt).

## session-18 — supabase-smoke (2026-11-14)

**Done**
- Real Supabase project `pintfc` created by the owner (project ref `adtxoxwpuejmqgkhzpja`, region eu-north-1); sign-ups disabled in the dashboard; the existing paused project was not touched. Keys and the pooler connection string are in `.env.local` only (names checked, values never shown).
- JWT lifetime: the 5-minute setting is NOT available on the Free plan (Authentication > Sessions is Pro-only; the owner found no 300-second setting). The default lifetime is NOT stated because it was not verified. Fallback recorded under D-13 in `DECISIONS.md`: `core.require_player()` (checks `auth.sessions` on every database call) plus `getUser()` (asks Auth on every request).
- `npx supabase db push --db-url` (dry run first, then real, owner "yes" each time): migrations 0001 to 0010 applied to the real project; `auth-stub.sql` never applied.
- `src/server/auth/supabase.ts` (new, plain fetch, no install) and `src/server/auth/index.ts` (owner-approved edit: `AUTH_ADAPTER=supabase` returns it; needs the project URL and the publishable key).
- `tests/smoke/smoke.test.ts` (4 tests) and the `test:smoke` script in `package.json`. SMOKE-1 real sign-in and sign-out-all; SMOKE-2 REST lists only allowed views and functions (secret-key listing equals the access matrix exactly; anon listing equals the views or is closed); SMOKE-3 RSVP round trip through the PUT route and through REST `rpc_rsvp_set`; SMOKE-4 `core` unreachable from REST, with a precondition that the migrations are applied.
- Test players per the owner's Option B (inside the test, no seed change). The remote full seed was NOT run.
- `tests/unit/supabase-auth.test.ts` (new, owner-approved file outside the plan's list; 6 tests tagged `SMOKE-5 [unit]`): the Auth service (`fetch`) and the database (`withDb`) are both mocked, no keys, no network, no writes. They cover the two rules the smoke suite could not reach without a third fake player on the real project: a user the database refuses with `PF401` gets `null`, and the session just opened for that user is ended with its own token exactly once (also when the database error is not `PF401`, which is thrown); plus the accepted-player path (ids, HttpOnly cookie, no logout) and a wrong password (never reaches the database). The unit file runs in `npm run test:unit`, so it is in the gate.

**Proof**
- RED first, no writes: 4 of 4 failed. SMOKE-1 and SMOKE-3 `The Supabase auth adapter is not available yet (session 18).`; SMOKE-2 `anon GET /v_next_match: expected 404 to be 200` (migrations not pushed); SMOKE-4 `core.players exists (migrations applied): expected false to be true`.
- After the push, SMOKE-2 and SMOKE-4 alone (no `SMOKE_WRITE`): 2 passed, exit 0. After the adapter, the first full run with `SMOKE_WRITE=yes` (set for that one command only): 4 passed, exit 0. Typecheck 0, lint 0, `test:unit` 12 files / 32 tests passed before the smoke run.
- Mutation check on `supabase.ts`, each alone against `npm run test:smoke` with `SMOKE_WRITE=yes`, restored with Edit; SHA-256 `4EC6FDD8...A310A5D4` equal to the snapshot, `fc /b` "no differences", 0 `MUTATION` markers in src after each:
  - M1 an archived or non-player user is allowed to sign in (the `PF401` refusal is ignored): SURVIVED the four smoke tests (4 passed). Then CAUGHT by the new unit tests (below): `SMOKE-5 [unit] a user the database refuses with PF401 gets null` failed (`expected { …(3) } to be null`), 1 failed | 5 passed.
  - M2 a failed `rpc_me` check does not end the new session: SURVIVED the four smoke tests (4 passed). Then CAUGHT by the new unit tests: `the session opened for a refused user is ended with its own token, exactly once` and `any other database error is thrown ... and the session is still ended` both failed (`expected +0 to be 1`), 2 failed | 4 passed.
  - M1 and M2 were re-run against `npm run test:unit -- tests/unit/supabase-auth.test.ts` only (no real project contact). After each, `supabase.ts` was restored with Edit; SHA-256 `4EC6FDD8...A310A5D4` equal to the snapshot, `fc /b` "no differences", and a case-sensitive search for the `MUTATION` marker in src and tests found none (`git grep` outside PROGRESS.md: no match).
  - M3 `getUser` trusts the token without asking Auth: CAUGHT by SMOKE-1 (`adapter refuses the old cookie: expected { ... } to be null`).
  - M4 `signOutAll` does not call Auth: CAUGHT by SMOKE-1 (same assertion).
- Slip, caught by the owner's gate: after editing `src/server/auth/index.ts` I did NOT run `npm run test:api`, so `tests/api/local-auth.test.ts` AUTH-LOCAL-1 still asserted the old "supabase adapter is not available yet" error and the gate caught it. Owner-approved fix (D-140): only that assertion in AUTH-LOCAL-1 was replaced (missing URL and key throws "must be set"; with a placeholder URL and key `getAuth()` returns a `SupabaseAuth` and `fetch` is never called; the LocalAuth-refuses-on-Vercel assertions are unchanged; `process.env` restored). `npm run test:api -- tests/api/local-auth.test.ts` alone: 3 passed, exit 0. Lesson: after changing any file under `src/server/auth`, run `test:api` (and `test:unit`) before staging, not only the smoke and the new unit tests.
- With the new unit file and the files staged: `npm run test:unit` 13 files / 38 tests passed, exit 0 (includes the T-14 scanner reading the staged files); typecheck 0, lint 0. The exit gate was not run by the assistant.
- A final green run after the restores: 4 passed, exit 0. It also ended the live sessions the M4 run left behind; a read-only check showed 0 smoke sessions and the smoke match `cancelled`.
- The exit gate (`npm run gate`) was NOT run by the assistant: the owner runs it after staging.

**Decisions** (D-130 to D-138, also in `DECISIONS.md`)
- No SDK; publishable key only at runtime. Cookie is the access token, no refresh. `getUser` asks Auth on every request. Sign-in checks `rpc_me` and ends the session on `PF401`. Sign-out-all uses the player's own token with `scope=global`, remembered in memory. Smoke fixtures live in the test, written only with `SMOKE_WRITE=yes`, never deleted, match cancelled afterwards. `test:smoke` is outside the gate. Push by `--db-url` read from `.env.local`. No remote full seed.

**Known gaps**
- Two security rules in the adapter (an archived or non-player user cannot sign in; a refused sign-in ends its session) survived the four smoke tests, because proving them on the real project needs a third Auth user with no active player row. They are now covered by mocked unit tests (D-139). What is still NOT proven end to end on the real Auth service: that a real archived player is refused (the database rule itself is proven by the db tests; the adapter's reaction to it by the unit tests).
- Step 5 (open a preview-style URL and see whether sign-in cookies work) was NOT done: no Vercel project or preview exists yet. Open for session 19.
- Token lifetime unverified (no 5-minute setting on Free); there is no refresh token, so players sign in again when the token expires.
- Sign-out-all works only when the session's token is known to the server instance (it is, in the normal route flow); otherwise it throws. Not tested across two server instances.
- SMOKE-2 accepts either an exact anon listing or a 401/403 for it; the run did not record which branch was taken.
- The smoke rows stay on the real project: 2 auth users, 2 players, 1 non-current season, 1 competition, 1 venue, 1 team ("Smoke Test FC"), 1 cancelled match, 1 RSVP row. None is public.
- `--db-url` is deprecated in the Supabase CLI (v4 removes it).
- `npm run test:smoke` is outside `npm run gate` on purpose; a future CI step would need the real keys.

**Next session needs to know**
- Project ref `adtxoxwpuejmqgkhzpja` (region eu-north-1). Never put keys in a file other than `.env.local`. For Vercel: `AUTH_ADAPTER=supabase`, `DATABASE_URL` (pooler), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the publishable key); the secret key must NOT be set on Vercel.
- Re-run the smoke suite: in PowerShell, `$env:SMOKE_WRITE='yes'; npm run test:smoke; Remove-Item Env:SMOKE_WRITE` (only with the owner's yes; it writes the smoke rows and cancels the match at the end).
- The real project has the schema and no seed. To seed it later: `node scripts/seed.mjs --database-url <url> --allow-remote --demo-cutoff-in 90m` (owner "yes" first; the URL is never printed). The seed's `--logins` refuses remote (D-60), so the 40 real logins (players.id = Auth user id) need a separate, owner-approved script. Moving the demo match is a rerun with a new `--demo-cutoff-in`.
- Smoke ids start with `5a0c0000`, shirts 98 and 99, emails `smoke-one@pintfc.test` and `smoke-two@pintfc.test`; a full seed will not clash with them.
- A test that scans tracked files (T-14) must be run after staging (session 17 lesson): `tests/smoke/smoke.test.ts` is new and holds no token-shaped values.

## session-19 — release-deploy (2026-11-15)

**STATUS: DONE (closed 18 Nov 2026).** Exit gate run by the owner and passed, commit `ce08158` pushed, production deployed on 15 Nov 22:31 and checked by the owner. Known gaps remain below (Node version, 40 real logins, design defect list A).

**Done**
- Step 1: `REL-1` (`tests/unit/release.test.ts`) and `scripts/release-check.mjs`. The owner reported step 1 done and verified (REL-1 passes 6/6). Both files were committed in `ce08158`.
- Step 2: Vercel project `pintfc`, folder linked (D-143), `vercel.json` (D-144), `.vercelignore` (D-145), environment variables for Production and Preview (D-146).
- The first deployment was forced to production and failed (D-144). A preview deploy succeeded (D-147): `https://pintfc-msw3osu3p-sabit-pintfc.vercel.app`.
- The real Supabase project was seeded with the fake demo data, without logins (D-141).
- Preview checks with `vercel curl` and a cookie test with the smoke user (D-148, D-149).
- Exit gate on the 6 staged files, run by the owner: see "Closing proof" below.
- Commit `ce08158`, pushed `8b9ec12..ce08158`.
- Production deploy on 15 Nov 22:31 after the owner wrote "po" (agent-run: `npx vercel deploy --prod --scope sabit-pintfc --logs`): `dpl_3nM93uAjQyFHA676pUA9TdXEoSbP`, alias `https://pintfc-two.vercel.app`, READY, target production.
- Owner checked production in an Incognito window: `/api/health` returned `{"ok":true}`, the home page shows real data, the Console is empty.
- Production cookie test (agent-run, `vercel curl`): 15 PASS, API level only, smoke-one only.
- Cleanup by the owner: the Protection Bypass secret deleted in the Vercel dashboard (the owner's word, no screenshot); token `pintfc-s19` (already expired 16 Nov) deleted; token `pintfc-cli` deleted on 18 Nov.

**Closing proof** (run by the owner himself, Sabit)
- Unit `release.test.ts`: 6 passed.
- Smoke with `SMOKE_WRITE=yes`: 4 passed, exit 0.
- `npm run gate`: ALL 7 GATES PASSED, exit 0; e2e 104 passed.
- plan-check: OK, 19 sessions, 40 checks.

**Proof before the exit gate** (agent-run, shown as printed; none of it is the exit gate)
- Project: `pintfc`, id `prj_QadtIIpRosfMqOBhQPz5oJrVpROy`, team `sabit-pintfc` (the CLI shows plan `hobby`). `vercel link` wrote `.vercel/`; `git check-ignore -v` shows `.vercel/project.json` ignored by `.gitignore:5` and `.env.local` by `.gitignore:3`; after the owner's instruction, `git diff .gitignore` printed no difference.
- First deploy: header "Production", `https://pintfc-jr0l91v04-sabit-pintfc.vercel.app`, inspect id `BaZnGpmomiF4gDJtAX3iNrzxu5Vi`, error `[STATIC_BUILD_NO_OUT_DIR] No Output Directory named "public" found after the Build completed`. The dry run before it printed `"framework": {"name": "Other", "slug": null}`; after `vercel.json` it printed `Next.js` / `nextjs`. A no-cookie HEAD request to that URL returned `302` with a `Location` on `vercel.com/sso-api`.
- `.vercelignore` lines: `.env`, `.env.*`, `!.env.example`, `credentials.local.csv`, `screenshots/`, `test-results/`, `playwright-report/`, `supabase/.temp/`. Dry run before the preview: 196 files to upload (195 before `vercel.json`), 43 ignored, `.env.local` among the ignored. Vercel docs pages used: "Build Features" (ignored files and folders), ".vercelignore" and "vercel deploy".
- Env vars: `vercel env ls` shows 8 rows (`DATABASE_URL` Secret; `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `AUTH_ADAPTER` Config; each for Preview and Production). Pull of production: the `AUTH_ADAPTER` line is `41 55 54 48 5f 41 44 41 50 54 45 52 3d 22 73 75 70 61 62 61 73 65 22 0a` (value `supabase`, 8 bytes, no `0d`/`0a` inside). `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`: pulled length 40 and 46, equal to `.env.local`, byte-identical, last 2 bytes `636f` and `4e49` (neither `0d` nor `0a`).
- Preview deploy: Next.js 16.4.6 (Turbopack), "Compiled successfully in 7.1s", 18 routes (all dynamic) plus the proxy/middleware, "Build Completed in /vercel/output [35s]". `dpl_Bdc6VWDqTn2JqdmWdkPQquhU72ev`, `readyState: READY`, `deploymentProtection: ["vercel_authentication"]`; `npx vercel inspect` printed `target preview` and `status ● Ready`.
- Seed (exit 0): `Seeded (demo match cutoff in 2d): {"seasons":2,"competitions":3,"venues":4,"teams":9,"players":43,"matches":18,"results":12,"player_match_stats":154,"standings_snapshots":1,"standings_rows":8,"trainings":8,"rsvps":1}`. The ref check printed only `true`. Demo match from `/api/home`: kickoff 2026-11-17T21:50:11Z, cutoff 2026-11-17T19:50:11Z.
- `vercel curl` on the preview, no cookie: `/api/health` 200 `{"ok":true}`; `/api/me` 401 `{"error":{"code":"UNAUTHENTICATED","message":"Sign in to continue.","request_id":"<uuid>"}}`; `/api/home` 200 before the seed with `next_match` null, `record` null, `latest_results` `[]`, `standings` null, and after the seed with `next_match` filled (`rsvp_open` true), `record` 10 played / 6 won / 2 drawn / 2 lost / 19 for / 12 against, 5 `latest_results`, 8 `standings.rows`. The real rows show `DATABASE_URL` on Vercel reaches the real Supabase project.
- Preview cookie test (agent-run, verbatim stdout), run once with `PREVIEW_COOKIE_WRITE=yes`, exit 0, API level only, not a real browser:
    (node:20252) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities, as the arguments are not escaped, only concatenated.
    (Use `node --trace-deprecation ...` to show where the warning was created)
    PASS  0 vercel curl GET /api/health is 200 with {"ok":true}  (status 200)
    PASS  1 smoke-one exists in Supabase Auth  (status 200)
    PASS  2 random password set (value never printed)  (status 200)
    PASS  3 sign-in answered 200 with the smoke player id  (status 200)
    PASS  4a cookie pf_session is set
    PASS  4b HttpOnly
    PASS  4c Secure
    PASS  4d SameSite=Lax  (SameSite=Lax)
    PASS  4e Path=/
    PASS  4f Max-Age is 1..28800  (Max-Age=3600)
    PASS  4g value is a 3-part JWT with sub = smoke-one  (length 800)
          other cookies set (names only): none
    PASS  5 GET /api/me with the cookie is 200  (status 200, keys: player)
    PASS  6 sign-out is 204 and clears pf_session (empty value, Max-Age=0)  (status 204)
    PASS  7 GET /api/me with the old cookie is 401 UNAUTHENTICATED  (status 401)
    8b smoke-one password re-randomized and discarded (status 200)
    RESULT: all checks passed
  The first version of the script stopped at step 0 with exit 2 before any write (`-K` is not supported by `vercel curl`); the changes are in `preview-cookie-check.diff.txt` in the scratchpad.
- Superseded: the exit gate, `npm run test:smoke`, the unit test and the production deploy were all run later; see "Closing proof" above.

**Decisions** (D-141 to D-156, also in `DECISIONS.md`)
- The remote seed ran without logins (supersedes D-138); the 40 real logins are a known gap (D-142). The first Vercel deployment of a project is always production and it failed on the framework preset; `vercel.json` sets Next.js (D-144). `.vercelignore` because `.gitignore` patterns are not applied on upload (D-145). Env vars through Git Bash `printf`, `--type config` for the readable ones (D-146). Preview with `--environment=preview` (D-147). `vercel curl` created a bypass secret (D-148). Cookie test with the smoke user only (D-149). The smoke suite cannot target a deployment URL (D-150).

**Known gaps**
- No real logins for the 40 players (D-142). The conflict between D-16 / `architecture.md:37` and `seed.mjs` is a HYPOTHESIS until the owner verifies it.
- HYPOTHESIS: 41 of the 43 players come from the seed (41 + the 2 smoke players); not checked with a query. The seed totals also include the session 18 smoke rows (2 seasons, 1 RSVP, 18 matches).
- HYPOTHESIS: `DATABASE_URL` on Vercel has no trailing newline (a Secret cannot be read back; `/api/home` returning real rows shows the URL works).
- HYPOTHESIS: the 46-character `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the new publishable key format (`tests/smoke/smoke.test.ts:30` calls it "the new publishable key (sb_publishable_...)"); the value was not printed or inspected.
- Superseded: production now exists, alias `https://pintfc-two.vercel.app` (deploy `dpl_3nM93uAjQyFHA676pUA9TdXEoSbP`).
- HYPOTHESIS: smoke-one has no other open session (the script ends its own; not counted with a query this time).
- The cookie test is API level only (D-149): not a real browser, reached through the protection bypass, one smoke user, no sign-out-all, no token expiry.
- The demo match RSVP cutoff is 2026-11-17T19:50:11Z; after that the page shows RSVP closed until the seed is re-run with a new `--demo-cutoff-in`.
- `vercel.json`, `.vercelignore`, `scripts/release-check.mjs` and `tests/unit/release.test.ts` are committed in `ce08158` (no longer untracked).
- Preview build log warnings, left as they are: the `middleware` file convention is deprecated for `proxy`; npm ERESOLVE peer-dependency notes for `eslint-config-next` with eslint 10.14.0; two packages with install scripts not covered by `allowScripts`.
- KNOWN GAP: on 18 Nov the owner saw Node.js Version 26.x in the Vercel project settings; local Node is 24.16. Not changed; no redeploy without a new "po" (D-155).
- Production cookie test is API level only, smoke-one only, not a real browser.
- Design defect list A (7 points) is for the design session after session 19.

**Open items** (owner actions, or owner-approved)
1. DONE: the "Protection Bypass for Automation" secret was deleted by the owner in the Vercel dashboard (the owner's word, no screenshot).
2. DONE: token `pintfc-s19` had already expired (16 Nov) and was deleted by the owner; `pintfc-cli` deleted on 18 Nov.
3. Remove the failed deployment record by hand (the agent may not delete): `pintfc-jr0l91v04-sabit-pintfc.vercel.app`, inspect id `BaZnGpmomiF4gDJtAX3iNrzxu5Vi`.
4. OPEN, known gap: the project setting shows Node 26.x, local is 24.16; not changed (D-155).
5. Files the agent left outside the repo, which it cannot delete: in the scratchpad `prod-check.env`, `prod-check2.env`, `prod-check3.env`, `prev-check2.env` (output of `vercel env pull`; secrets appear only as the placeholder `[SENSITIVE]`; HYPOTHESIS: they may contain a Vercel-issued token, not inspected), the dry-run and deploy output files and `preview-cookie-check*.mjs`; in the Git Bash `/tmp` the files `o.txt` and `b.out` (CLI status text, no values).
6. HYPOTHESIS: the scratchpad stderr captures `t0a.err`, `t0b.err`, `t1.err`, `t2.err` (and any other stderr capture, such as the `.err` files of the `vercel curl` and deploy runs) may contain the Protection Bypass secret printed by `vercel curl`; none was inspected for it. Revoking the secret (item 1) makes any copy useless. The agent cannot delete these files; the owner may remove them by hand.

**Next session needs to know**
- Preview URL `https://pintfc-msw3osu3p-sabit-pintfc.vercel.app` (Deployment Protection on); project `pintfc` in team `sabit-pintfc`, id `prj_QadtIIpRosfMqOBhQPz5oJrVpROy`. Production is live: `https://pintfc-two.vercel.app`, `dpl_3nM93uAjQyFHA676pUA9TdXEoSbP`.
- Never run `npx vercel deploy` without checking the target: use `--environment=preview` and read the CLI header ("Preview" or "Production").
- To check the preview without a browser: `npx vercel curl <full url>/api/health --scope sabit-pintfc -- -s -i`. `-K` is rejected; keep secrets out of argv with `-H @-` or `--data-binary @-` (one stdin use per command).
- To move the demo match: `node scripts/seed.mjs --allow-remote --demo-cutoff-in <n>` with `DATABASE_URL` from `.env.local` in a shell variable, never on the command line, owner "yes" first; never with `--logins` (D-60).
- The smoke user `smoke-one@pintfc.test` has no known password (random, discarded); `npm run test:smoke` with `SMOKE_WRITE=yes` sets a new one.
- Session 19 is closed. Next: the design session (defect list A, 7 points). Open: Node 26.x vs 24.16 (a redeploy needs a new "po"), the 40 real logins (D-142), and the Vercel 2FA prompt (the owner chose to be reminded later).

## session-20a — design: tokens and spacing foundation (2026-11-18)

**STATUS: DONE, committed as `8da16f4` (not pushed).** Session 20 is the design session (not in the plan files; see PLAN.md "Design sessions" and D-157 to D-161). 20a changes no behaviour, API, database or test id. No install, nothing deleted, no image added; the commit was made after the owner's "go" and never pushed by the agent.

**Done**
- `src/app/globals.css` rewritten around tokens: colours (navy `--primary`, one bright-blue `--accent`, `--focus` and `--focus-on-dark`), spacing `--space-1..7` (4/8/12/16/24/32/48), type `--text-sm..3xl` (14/16/20/24/32/48), weights 400 and 700 only. New `.stack` / `.stack-sm` / `.stack-xs` (one gap between sections: 16 / 12 / 8 px), `.btn-accent`, `.chip`, and classes for stats, results, mini table, squad and the event page. The `<style>` string of `Attendance.tsx` moved into this file.
- Inline styles and raw values removed from `NextMatch`, `SeasonRecord`, `LatestResults`, `MiniTable`, `RsvpButtons`, `Attendance`, `Footer`, `app/page.tsx`, `squad/page.tsx`, `players/[id]/page.tsx`; `fixtures/[id]/page.tsx` and the home page got `className="stack"`. `go-to-event` is the one accent element. Defect 3 (the cramped "My answer" and "Attendance" cards) is fixed by the stack gap.
- Docs: `docs/design/screens.md` (look, tokens with computed contrast, people rule), `docs/design/test-map.md` (DESIGN group), `PLAN.md`, `DECISIONS.md` (D-157 to D-161).

**Proof**
- RED first (unit): `tests/unit/design-tokens.test.ts` against the old code: 18 failed, 9 passed, all assertion failures (for example "expected [ …(59) ] to deeply equal []" for spacing, `:focus-visible` using `var(--accent)`). It then passed 27/27 after the code.
- e2e `tests/e2e/spacing.spec.ts` (18 tests: 16 gap tests = 4 pages × 4 widths, DESIGN-8 one accent, DESIGN-9 focus ring) was written after the CSS (D-161); alone it passed 18/18.
- Exit gate `npm run gate`, exit 0: typecheck and lint exit 0; unit 15 files / 71 tests; db 16 / 72; api 11 / 59; e2e 122 passed (104 before + 18); `plan-check OK: 19 sessions, 40 checks`; `ALL 7 GATES PASSED`.
- Mutation check on the new tests (each break restored; SHA-256 and `fc /b` identical to the backup after every restore): `.btn` weight 600 → DESIGN-2 weights; `.stack-sm` gap 14px → DESIGN-1 spacing; `color: #fff` in `.chip` → DESIGN-3; `--muted` lightened → three DESIGN-4 pairs; `--focus` removed → DESIGN-3 tokens + DESIGN-5; the header focus rule removed → DESIGN-5; `page.tsx` with `marginTop: 10`, weight 800 and `#123456` → DESIGN-1, 2 and 3 together; `.stack` gap 0 → all 16 DESIGN-7 tests; `.chip-ok` in the accent → DESIGN-6 (unit) and DESIGN-8 (e2e); header focus colour = accent → DESIGN-5 (unit) and DESIGN-9 (e2e). Gap-0 and the other two e2e mutations were run together in one e2e run: 18 failed, each group for its own mutation.

**Decisions** (D-157 to D-161, also in `DECISIONS.md`)
- Owner's answers recorded; palette and scales (D-157, D-158); small visible changes from the scales (D-159); guard scope is the 20a file list and five files outside it still have inline styles (D-160); e2e written after the CSS, plan-check unaffected (D-161).

**Known gaps and UNKNOWN**
- (Fixed in session 20d: `.card` is no longer capped and the page is 1200 px.) `.card` was still `max-width: 420px` and the page 960 px: session 20d (desktop). Defects 1 and 4 (table at 320 px, "Not going" wrapping) were fixed in 20b (`b0a080a`) and defect 2 (missing placeholder SVG) in 20c.
- The two mutation backups (`globals.css.orig`, `page.tsx.orig`) are in the scratchpad; the agent may not delete them.
- RESOLVED in 20b: `squad/loading.tsx`, `players/[id]/loading.tsx`, `SettingsForm.tsx`, `sign-in/page.tsx` and `LiveClock.tsx` joined the guard (D-160, D-162). UNKNOWN: how the new colours look to the eye (no screenshots reviewed in 20a; the screenshot spec still writes 390 and 320 px files only).
- The smoke players question stays UNKNOWN (production untouched).

**Next session needs to know**
- DONE in 20b (`b0a080a`): fix the league table at 320 px (`MiniTable.tsx` `.mt` / `.mt-team`: no mid-word breaks, narrower number columns) and the "Not going" wrap (`.fx-choices` / `.fx-choice` in `globals.css`: stack below 480 px, `white-space: nowrap`), and add `tests/e2e/layout-matrix.spec.ts` for 320/390/768/1280. Tests first.
- Spacing and type values must come from tokens; extend `TSX_FILES` in `tests/unit/design-tokens.test.ts` when a session touches a new file.
- `.stack > *` resets only `margin-block`, so a card keeps `margin-inline: auto`. Utilities sit AFTER `.field` in `globals.css` on purpose (so the stack beats `.field`'s margin).
- DONE in 20c: `public/img/` (the folder did not exist), `middleware.ts` matcher and CSP `img-src 'self' data:` (outside the 20a list; they were approved in the plan, D-157).

## session-20b — design: small phones, answers, tokens in the last files (2026-11-18)

**STATUS: DONE, committed on the owner's "go" (not pushed).** First gate attempt was cut short by low memory (e2e `4 failed, 175 passed (7.8h)`; tests that ran for hours, a worker "exited unexpectedly (code=3221225794)": environmental). On the owner's "go" the gate was re-run unchanged: `npm run gate`, exit 0, typecheck and lint exit 0, unit 15 files / 78 tests, db 16 / 72, api 11 / 59, e2e 186 passed (6.2m), `plan-check OK: 19 sessions, 40 checks`, `ALL 7 GATES PASSED`. Committed after the owner's "go"; never pushed by the agent.

**Done** (owner's answers D-162)
- Defect 1: league table columns 40/32/40/40 px, team cell `overflow-wrap: break-word`, card padding 12 px below 360 px (`globals.css`, `MiniTable.tsx`). Defect 4: the three answers are full-width rows below 480 px, `white-space: nowrap` (`globals.css`). `.card-narrow` added (sign-in), `.card` still capped (20d).
- The five files moved to tokens, plus `settings/page.tsx` (nested `.page` removed): `squad/loading.tsx`, `players/[id]/loading.tsx`, `SettingsForm.tsx`, `sign-in/page.tsx`, `LiveClock.tsx`. They joined `TSX_FILES`; DESIGN-10 forbids any `style=` in them.
- New: `tests/e2e/layout-matrix.spec.ts` (L-1 to L-5, 4 widths, 64 tests). Docs: DECISIONS D-162 to D-165, test-map, screens.

**Proof so far**
- RED first: unit 7 failed (assertion failures, e.g. `expected [ 'style={{ marginTop: 0 }}', …(1) ] to deeply equal []`); e2e matrix 7 failed: L-1 at 320 px (broken words "Wanderers", "Ironbridge", "Northfield"), L-2 at 320 and 390 px (height 68, expected at most 48), L-5 (padding 16 vs 12 at 320, `.card-narrow` missing at four widths). L-3 and L-4 passed on the old code (regression guards, D-164).
- After the code: unit guard 34/34; matrix 64 passed; typecheck and lint exit 0.
- Mutation check (all four files restored, SHA-256 match and `fc /b` no differences): inline `style` in `LiveClock` → DESIGN-1 and DESIGN-10; `className="page"` in settings → DESIGN-10; squeezed table column → L-1 (320 px, re-run alone because a wide table masked it); answers in 3 columns → L-2 (320, 390); card padding 16 → L-5 (320); checkbox row 24 px → L-4 settings (4 widths); `card-narrow` removed → L-5 (4 widths); table 500 px wide → L-3 home (320, 390).

**Next session needs to know**
- The 20b gate passed and 20b is committed (see `git log`); nothing is left to re-run or approve for it. Next: 20c (no-people assets: `public/img/*.svg`, crest, jersey, initials avatar, CSP `img-src 'self' data:`), planned first and started only on the owner's approval. If the machine is low on memory, e2e can hang for hours: free memory before running the gate.
- Backups of the mutated files are in the scratchpad (`globals.b.orig`, `signin-page.tsx.orig`, `settings-page.tsx.orig`, `liveclock.tsx.orig`); the agent may not delete them.

## session-20c — design: no-people graphics (2026-11-18)

**STATUS: DONE and committed as `e2964c4`.** Owner's answers: D-166. Decisions D-166 to D-168. No install, nothing deleted, nothing pushed, no deploy, production untouched, no image downloaded (every graphic is hand-written SVG).

**Done**
- `public/img/placeholder-player.svg` (flat shirt, no body) and `public/img/placeholder-crest.svg` (shield, three bars, chevron), `src/app/icon.svg` (favicon, same shield). `Crest`, `Jersey`, `PlayerAvatar` components and `src/lib/initials.ts`. Header and footer use `Crest`; squad cards show a small jersey with the number only; the profile shows `player-photo` (the local jersey file, only for a consented player) or `player-avatar` (initials and number). The database `photo_url` is never rendered. Defect 2 (broken photo) is fixed.
- `src/middleware.ts`: CSP `img-src 'self' data:` (no `https:`) and the matcher skips `img/` and `icon.svg`. `globals.css`: crest, jersey, avatar and badge rules. The stale 20a and 20b lines in this file were fixed.
- Docs: DECISIONS D-166 to D-168, screens, test-map, data, PLAN.

**Proof**
- RED first: unit 27 failed (assertions: files missing, `expected 'img-src \'self\' data: https:' to be 'img-src \'self\' data:'`, `expected '' to be 'ÉZ'` against the initials stub, `public/ exists and is not empty: expected 0 to be greater than 0`); e2e 8 failed (404 for both SVGs, `loaded: false` for the consented image, no avatar, image requests with an error status; the favicon and contrast tests failed by timeout because `link[rel=icon]` and the avatar did not exist).
- After the code: unit 106 passed (17 files), e2e assets 8/8.
- Exit gate `npm run gate`, exit 0: typecheck and lint exit 0 (no warnings); unit 17 files / 106 tests; db 16 / 72; api 11 / 59; e2e 194 passed (186 before + 8); `plan-check OK: 19 sessions, 40 checks`; `ALL 7 GATES PASSED`.
- Mutation check (only existing files edited; SHA-256 and `fc /b` identical after every restore): `https:` back in the CSP → CSP-1; `img/` out of the matcher → CSP-4 (unit) and ASSET-5 (e2e: static files `no-store`); a `<text>` and a non-token colour in the SVG → ASSET-2 and ASSET-3; initials return one letter → 8 INITIALS-1 cases; an external image URL in the avatar → ASSET-4, ASSET-6, ASSET-7; the page rendering `photo_url` → ASSET-4 (two checks); `player-avatar` test id removed → ASSET-6 and ASSET-9; squad badge class renamed → ASSET-8; footer crest removed → ASSET-8; navy initials on the navy shirt → ASSET-9 alone (ratio 1, expected at least 4.5).
- Renders for the owner to LOOK at (a test cannot tell a shirt from a person), in `screenshots/`: `svg-placeholder-player-320.png`, `svg-placeholder-crest-320.png`, `svg-icon-320.png`, `avatar-consented-390.png`, `avatar-initials-390.png`. I looked at them: a plain shirt, a shield, no body or head.

**Known gaps and UNKNOWN**
- The production database already holds `/img/placeholder-player.svg`, so a later deploy fixes the live site with no data change; no deploy was made (needs the owner's "po").
- UNKNOWN: whether axe would flag the white text over the SVG shirt (ASSET-9 and the token pair unit tests cover the contrast instead; the existing a11y spec passed). UNKNOWN: how Next names the favicon in production (the test follows the `<link rel="icon">` href).
- Cuffs and the collar trim are white, so on the white page they are hardly visible; the shirt still reads as a shirt. The design can change in 20e.
- (Fixed in session 20d: `.card` is no longer capped.) `.card` was still capped at 420 px. The mutation backups (`c-*.orig`) are in the scratchpad; the agent may not delete them.

**Next session needs to know**
- 20d (desktop layout up to 1200 px, grid) is next; plan first. Any new file with styles joins `TSX_FILES` in `tests/unit/design-tokens.test.ts`. New graphics must stay plain shapes with token colours (ASSET-1 to ASSET-4); the only `<img>` allowed is the local jersey in `PlayerAvatar.tsx`.

## session-20d — design: desktop layout up to 1200 px (2026-11-19)

**STATUS: DONE, not committed (waiting for the owner's "go").** Owner's answers to the plan and D-169 to D-172. No install, nothing deleted, nothing pushed, no deploy, production untouched, no image used.

**Done**
- `globals.css`: `--max-width: 1200px`; `.card` has no cap; `.card-narrow` (420 px, centred, `width: 100%`) is used by sign-in and by a new wrapper in the settings page; one desktop step at 768 px (header and footer padding 24 px to line up with the page; home grid 2 equal columns; event grid 3 : 2). Column wrappers `.home-grid`, `.home-col`, `.fx-grid`, `.fx-col` are `display: contents` below 768 px. `page.tsx` (home) and `Attendance.tsx` wrap the sections without changing the DOM order. The squad grid needed no change (5 per row at 1280 px).
- Tests: `D-1` unit in `design-tokens.test.ts`; new `tests/e2e/desktop-layout.spec.ts` (D-2 to D-10); the `DESIGN-7` `gaps` helper in `spacing.spec.ts` measures per column and checks the number of columns (owner approved that helper only; the 16 px assertion and the child counts are unchanged); `screenshots.spec.ts` adds 1280 px renders. Docs: DECISIONS D-169 to D-172, screens, test-map, PLAN, and the stale lines of 20a to 20c in this file.

**Proof**
- RED first, on the old code: unit 4 D-1 tests failed on assertions (`expected '960px' to be '1200px'`, and so on); e2e 15 failed on assertions (page width `Expected > 1100, Received 960`; squad `Expected >= 4, Received 3`; home and fixture columns). D-7 (sign-in) and D-8 (320/390 px) passed on the old code: regression guards. D-7b (settings) was RED. D-7b first failed by timeout, so it was changed to a count assertion before the code (D-172).
- Mutation checks (only existing files edited; SHA-256 and `fc /b` identical after every restore): `.card` cap back → D-1 and D-2 (D-3 does not see it); media query at 1 px → D-1, D-3, D-8, DESIGN-7 (320, 390); settings without `card-narrow` → D-7b; `--max-width: 1400px` → D-1, D-2, D-6, D-9; menu button shown on desktop → D-6; squad column 20rem → D-5; raw `gap: 20px` → DESIGN-1 token scan; 20 px gap in one desktop column → DESIGN-7 home at 768 and 1280 only.
- The first full gate failed once: 20b `L-2` at 768 px ("no label wider than its button"): the event page's left column was about 352 px. Narrower padding did not fix it; the grid became 3 : 2 (D-170) and L-2 passed unchanged. The D-1 unit test was updated for 3 : 2.
- Exit gate `npm run gate`, exit 0: typecheck and lint exit 0; unit 17 files / 110 tests; db 16 / 72; api 11 / 59; e2e 214 passed; `plan-check OK: 19 sessions, 40 checks`; `ALL 7 GATES PASSED`.
- Renders for the owner to LOOK at, in `screenshots/` (`*-1280.png`, 17 pages). I looked at `home-real-data-1280.png` and `fixture-open-1280.png`: two columns, nothing overlaps, the three answers are on one line, the four counts fit.

**Known gaps and UNKNOWN**
- For 20e: below 768 px a `.card` in the page stack is content-sized and centred, not full width (`margin: 0 auto` on a grid item; the season record starts at x = 68 at 320 px). It was like this before 20d and was left unchanged; D-3, D-4 and D-8 describe it. The player page was not given a layout: its stats card just gets wider.
- UNKNOWN: the other 1280 px renders (squad, player, settings, sign-in, 404) were not looked at one by one; the D-tests and axe at 1280 px (home, event page, squad) pass. UNKNOWN: widths between 768 and 1200 px other than 768, 1280 and 1440 were not tested.
- The mutation backups (`g20d.css.orig`, `settings20d.tsx.orig`) and the gate logs are in the scratchpad; the agent may not delete them.

**Next session needs to know**
- 20e (club polish: hero, next-match card, results rows, footer, full-width phone cards, player page layout) is next; plan first. A new file with styles joins `TSX_FILES` in `tests/unit/design-tokens.test.ts`. New desktop rules go in the `@media (min-width: 768px)` block of `globals.css`; the layout tests D-1 to D-10 and DESIGN-7 (per column) guard it. If the machine is low on memory, e2e can hang: free memory first.

## session-20e-1 — design: home hero band, record row, balanced grid, full-width cards (2026-11-19)

**STATUS: DONE, not committed (waiting for the owner's "go").** Decisions D-173 to D-177. No install, nothing deleted, nothing pushed, no deploy, production untouched, no photo added (`HERO_PHOTO = null`).

**Done**
- New `src/components/Hero.tsx` and `src/lib/hero.ts` (photo slot, graphic fallback, only local `/img/` paths). `NextMatch.tsx` is the hero content (kicker, big opponent, four countdown tiles, button inside). `page.tsx`: hero, full-width `SeasonRecord` (`stat-grid-record`, six in a row from 768 px), results and table as two equal-height columns (`card-fill`). `globals.css`: tokens `--primary-deep`, `--shadow-card`; `.card` full width with accent top edge and shadow.
- Tests: new `hero.test.ts` (unit), `hero.spec.ts`, `mid-widths.spec.ts`; changed `desktop-layout.spec.ts` (D-3, old D-8 became CARD-1), `design-tokens.test.ts` (DESIGN-6 relaxed to a named list, additions only otherwise). Details in D-177.

**Proof**
- RED first (stubs for `hero.ts` and `Hero.tsx`): unit 21 failed on assertions (for example `expected 'https://example.com/x.jpg' to be null`, `expected [ 'primary-deep' ] to deeply equal []`); e2e hero 20+ failed (`Expected: 1 Received: 0`, REC-1 `Expected: 1 Received: 2`, COL-1 `Expected: >= 780 Received: 148`), CARD-1 `Expected: >= 287 Received: 182`, MID-1 7 of 7. Guards (passed on old code): CARD-1b, MID-1 header/overflow/44 px parts, DESIGN-6 and the card-contrast check.
- Mutations, each restored (SHA-256 and `fc /b` identical): validator accepts anything (HERO-1, HERO-3); shade opacity 0.2 (HERO-7); raw `rgba` in `.card` (CARD-2, DESIGN-3); accent on header links (DESIGN-6 x2); `HERO_PHOTO` set (HERO-2 x2); art hidden (HERO-5); next match outside the hero (HERO-4); button edge back to accent (HERO-8, 2.7:1); countdown 48 px at all widths (HERO-6 at 320 and 390 only after the test was strengthened: the first version passed because the body breaks words anywhere); record grid `auto-fit 150px` (REC-1 and MID-1 at 768 to 1024, not 1100 and up); results card not stretched (COL-1); card `width: auto` (CARD-1).
- Exit gate `npm run gate`, exit 0: typecheck and lint 0; unit 18 files / 139; db 16 / 72; api 11 / 59; e2e 246 passed; `plan-check OK: 19 sessions, 40 checks`; `ALL 7 GATES PASSED`.

**Known gaps and UNKNOWN**
- Not done on purpose: items 5, 7, 8, 9, 10, 11, 12 of the plan (20e-2, 20e-3); no 768 px screenshots yet. Photo path (question 11) undecided.
- UNKNOWN: how the band looks with a real photo (none exists); the thin diagonal stripe passes behind some text from 768 px (decoration, axe passes). With few results the results rows grow tall to fill the card (looks airy).
- Existing tests L-5 and AC-5.4 were not edited: the hero's side padding sits on its content section and the pitch SVG uses `meet` so they pass unchanged.

**Next session needs to know**
- 20e-2: squad badge and equal cards, header links and account menu (`.nav-link[aria-current…]` is already allowed by DESIGN-6). New styled files join `TSX_FILES`. `auth.spec.ts` and D-6 touch the header controls.
