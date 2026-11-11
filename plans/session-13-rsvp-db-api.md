# session-13 — rsvp-db-api

## Goal
The RSVP write path in the database and the API (no UI).
(About 30 minutes. Every test must be green at the end.)

## Depends on
session-02, session-03, session-05

## Read first
- docs/design/data.md (rpc_rsvp_set)
- docs/design/api.md (PUT rsvp)
- docs/design/threats.md (T-03, T-04, T-05, T-22)
- PROGRESS.md
- Also: CLAUDE.md rules (tests first; ask before installs, Supabase/Vercel changes, commits).

## Checks it owns
AC-3.3.2, AC-3.3.6

## Tests to write first (titles)
- `AC-3.3.2 changing an answer before cutoff replaces it` — levels: DB + API
- `AC-3.3.6 cancelled or past match and answering for someone else are rejected` — levels: DB + API
- AC-3.3.1 [db+api] `AC-3.3.1 player saves Going, Maybe or Not going before cutoff` (session 14 adds [e2e])
- AC-3.3.4 [db+api] `AC-3.3.4 answers after cutoff are rejected` (session 15 adds [e2e])
- T-03 [db] `T-03 direct rpc_rsvp_set after cutoff is rejected`
- T-04 [db+api] `T-04 cannot write an RSVP for another player`
- T-22 [db] `T-22 rpc_rsvp_set rejects cancelled and past matches`
Tag convention: `<ID> [level] ...` — the title starts with its ID, the level tag follows (D-31).

## Files it may touch
- supabase/migrations/0009_rsvp.sql
- src/app/api/fixtures/[id]/rsvp/route.ts
- src/server/rsvp.ts
- tests/db/rsvp.test.ts
- tests/api/rsvp.test.ts
- PROGRESS.md
Anything else needs the owner's OK.

## Steps
1. Write the tests first, including the exact-cutoff boundary on a frozen database clock; show them failing.
2. Migration: `rpc_rsvp_set` (SECURITY DEFINER, `search_path=''`, `require_player()`, active, scheduled, `now() < cutoff`, one row per player+match, reason ≤140) + matrix rows.
3. Route with strict schema (no player id), error mapping (`PF409` RSVP_CLOSED, `PF410` MATCH_NOT_OPEN).
4. Run the exit gate.

## Exit gate
Each command runs on its own and must exit 0 (never through a pipe). Show the output.
```powershell
npm run test:db -- tests/db/rsvp.test.ts
npm run test:api -- tests/api/rsvp.test.ts
npm run gate
```
`npm run gate` runs typecheck, lint, unit, database, API, end-to-end and plan:check in order.

Commit only after the owner says "go", and only after the test command itself exited 0.

## What to write in PROGRESS.md for the next session
Append: **Done** · **Proof** (the exit-gate output summary) · **Decisions** (add to DECISIONS.md too) · **Next session needs to know:** Function signature, SQLSTATE mapping, how tests freeze database time.
