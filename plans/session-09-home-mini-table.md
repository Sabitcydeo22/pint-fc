# session-09 — home-mini-table

## Goal
Mini league table from the seeded snapshot, with our row highlighted.
(About 25 minutes. Every test must be green at the end.)

## Depends on
session-08

## Read first
- docs/design/screens.md (mini table)
- PROGRESS.md
- Also: CLAUDE.md rules (tests first; ask before installs, Supabase/Vercel changes, commits).

## Checks it owns
AC-2.4.1, AC-2.4.2

## Tests to write first (titles)
- `AC-2.4.1 mini table shows snapshot rows in position order` — levels: DB + E2E
- `AC-2.4.2 PINT FC row is highlighted with label and bar, not colour alone` — levels: E2E
- AC-2.4.3 [feed] none here: owned by session 16 (live in class); this session must NOT show the snapshot date yet
Tag convention: `<ID> [level] ...` — the title starts with its ID, the level tag follows (D-31).

## Files it may touch
- supabase/migrations/0006_v_standings.sql
- src/server/home.ts
- src/components/MiniTable.tsx
- tests/db/standings.test.ts
- tests/e2e/home-table.spec.ts
- PROGRESS.md
Anything else needs the owner's OK.

## Steps
1. Write the tests first; show them failing.
2. Migration: `v_standings` (latest snapshot) + matrix row.
3. Component with ordered rows, `table-row-us` with bold label and left bar (not colour alone), empty state; the `table-snapshot-date` element is deliberately left out for session 16.
4. Run the exit gate.

## Exit gate
Each command runs on its own and must exit 0 (never through a pipe). Show the output.
```powershell
npm run test:db -- tests/db/standings.test.ts
npm run test:e2e -- tests/e2e/home-table.spec.ts
npm run gate
```
`npm run gate` runs typecheck, lint, unit, database, API, end-to-end and plan:check in order.

Commit only after the owner says "go", and only after the test command itself exited 0.

## What to write in PROGRESS.md for the next session
Append: **Done** · **Proof** (the exit-gate output summary) · **Decisions** (add to DECISIONS.md too) · **Next session needs to know:** Reminder: session 16 adds the snapshot date (`table-snapshot-date`) with the owner and students live.
