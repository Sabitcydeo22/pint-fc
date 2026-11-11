# session-05 — auth-api

## Goal
The API skeleton (`withApi`), the AuthPort with the test-only LocalAuth adapter, sign-in/out routes, `require_player()` and the logins in the seed.
(About 30 minutes. Every test must be green at the end.)

## Depends on
session-02, session-03, session-04

## Read first
- docs/design/api.md (Auth)
- docs/design/architecture.md §3
- docs/design/threats.md (T-07, T-08, T-16, T-23)
- PROGRESS.md
- Also: CLAUDE.md rules (tests first; ask before installs, Supabase/Vercel changes, commits).

## Checks it owns
AC-1.1.4

## Tests to write first (titles)
- `AC-1.1.4 unknown and archived emails get the same error and timing class as a wrong password` — levels: API
- AC-1.1.1 [api] `AC-1.1.1 valid player signs in and lands on home signed in` (API half; session 06 adds [e2e])
- AC-1.1.3 [api] `AC-1.1.3 wrong password gives one generic error and no session` (API half)
- AC-1.6.1 [api] `AC-1.6.1 sign out clears this session and player endpoints return 401` (API half)
- AC-1.6.2 [api] `AC-1.6.2 sign out of all devices rejects both sessions` (API half)
- AC-1.6.3 [api] `AC-1.6.3 player-only endpoints return 401 without a session` (API half)
- T-07 [api+db] `T-07 revoked session token is rejected by API and database`
- T-08 [api] `T-08 sign-in errors and timing do not reveal accounts`
- T-16 [api] `T-16 state-changing routes reject cross-origin and non-JSON requests`
- T-23 [api] `T-23 oversized or unknown fields are rejected`
Tag convention: `<ID> [level] ...` — the title starts with its ID, the level tag follows (D-31).

## Files it may touch
- src/server/auth/**
- src/server/db.ts
- src/lib/with-api.ts
- src/app/api/auth/**
- src/app/api/me/route.ts
- src/app/api/health/route.ts
- supabase/migrations/0003_require_player.sql
- scripts/seed.mjs (add logins)
- tests/api/**
- tests/db/session.test.ts
- PROGRESS.md
Anything else needs the owner's OK.

## Steps
1. Write the tests first; show them failing (routes missing).
2. Migration 0003: `core.require_player()` (claims, active player, session in `auth.sessions`) and `public.rpc_me()` with matrix rows.
3. AuthPort interface + LocalAuth (password hashes in a test table, signed HttpOnly cookie; **refuses to load when VERCEL_ENV is set**).
4. `withApi` wrapper (request id, error mapping, no-store, Origin and JSON checks, 8 KB body limit).
5. Sign-in with fixed minimum duration; sign-out, sign-out-all, `GET /api/me`. Seed adds logins via AuthPort and writes `credentials.local.csv` (gitignored, never printed).
6. Run the exit gate.

## Exit gate
Each command runs on its own and must exit 0 (never through a pipe). Show the output.
```powershell
npm run test:db -- tests/db/session.test.ts
npm run gate
```
`npm run gate` runs typecheck, lint, unit, database, API, end-to-end and plan:check in order.

Commit only after the owner says "go", and only after the test command itself exited 0.

## What to write in PROGRESS.md for the next session
Append: **Done** · **Proof** (the exit-gate output summary) · **Decisions** (add to DECISIONS.md too) · **Next session needs to know:** AuthPort methods, how API tests sign in as a seeded player, where credentials.local.csv is written, and the `withApi` usage pattern.
