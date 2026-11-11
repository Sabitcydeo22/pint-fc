# session-16 — live-in-class  (LIVE IN CLASS)

## Goal
LIVE IN CLASS: the owner and students add the snapshot date to the mini table, test first, watching the test go red then green.
(About 20 minutes. Every test must be green at the end.)

## Depends on
session-09

## Read first
- docs/design/screens.md (mini table)
- docs/REQUIREMENTS.md AC-2.4.3
- PROGRESS.md
- Also: CLAUDE.md rules (tests first; ask before installs, Supabase/Vercel changes, commits).

## Checks it owns
AC-2.4.3

## Tests to write first (titles)
- `AC-2.4.3 mini table shows the snapshot date` — levels: E2E
Tag convention: `<ID> [level] ...` — the title starts with its ID, the level tag follows (D-31).

## Files it may touch
- src/components/MiniTable.tsx
- src/server/home.ts (read taken_on)
- tests/e2e/home-table.spec.ts
- PROGRESS.md
Anything else needs the owner's OK.

## Steps
1. Students read the check and propose the test; write it; run it; it fails because the date is not shown.
2. Add the date from `v_standings.taken_on`, formatted in the club zone; run the test again; it passes.
3. Show the exit gate output on the projector.

## Exit gate
Each command runs on its own and must exit 0 (never through a pipe). Show the output.
```powershell
npm run test:e2e -- tests/e2e/home-table.spec.ts
npm run gate
```
`npm run gate` runs typecheck, lint, unit, database, API, end-to-end and plan:check in order.

Commit only after the owner says "go", and only after the test command itself exited 0.

## What to write in PROGRESS.md for the next session
Append: **Done** · **Proof** (the exit-gate output summary) · **Decisions** (add to DECISIONS.md too) · **Next session needs to know:** Nothing special: this session is independent and can be run at any time after session 09.
