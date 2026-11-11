# session-14 — event-page-rsvp-ui

## Goal
The attendance function, the event page with counts and list, and the answer buttons.
(About 30 minutes. Every test must be green at the end.)

## Depends on
session-06, session-13

## Read first
- docs/design/screens.md (/fixtures/[id])
- docs/design/api.md (attendance)
- docs/design/threats.md (T-05)
- PROGRESS.md
- Also: CLAUDE.md rules (tests first; ask before installs, Supabase/Vercel changes, commits).

## Checks it owns
AC-3.3.1, AC-3.4.1, AC-3.4.3

## Tests to write first (titles)
- `AC-3.3.1 player saves Going, Maybe or Not going before cutoff` — levels: DB + API + E2E
- `AC-3.4.1 event page shows counts and attendance list to signed-in players` — levels: DB + API + E2E
- `AC-3.4.3 teammates' answers are visible without reasons` — levels: DB + API + E2E
- T-05 [db+api] `T-05 other players' reasons are never returned`
Tag convention: `<ID> [level] ...` — the title starts with its ID, the level tag follows (D-31).

## Files it may touch
- supabase/migrations/0010_attendance.sql
- src/app/fixtures/[id]/**
- src/app/api/fixtures/[id]/attendance/route.ts
- src/components/Attendance.tsx
- src/components/RsvpButtons.tsx
- tests/db/attendance.test.ts
- tests/api/attendance.test.ts
- tests/e2e/fixture.spec.ts
- PROGRESS.md
Anything else needs the owner's OK.

## Steps
1. Write the tests first; show them failing.
2. Migration: `rpc_attendance` (counts, list without reasons, caller's own reason, `server_now`) + matrix row.
3. Route; page with signed-out prompt, counts, list, buttons, reason box with counter, saved status, all states in screens.md.
4. Run the exit gate.

## Exit gate
Each command runs on its own and must exit 0 (never through a pipe). Show the output.
```powershell
npm run test:db -- tests/db/attendance.test.ts
npm run test:api -- tests/api/attendance.test.ts
npm run test:e2e -- tests/e2e/fixture.spec.ts
npm run gate
```
`npm run gate` runs typecheck, lint, unit, database, API, end-to-end and plan:check in order.

Commit only after the owner says "go", and only after the test command itself exited 0.

## What to write in PROGRESS.md for the next session
Append: **Done** · **Proof** (the exit-gate output summary) · **Decisions** (add to DECISIONS.md too) · **Next session needs to know:** Attendance DTO and where the poller will attach (session 15).
