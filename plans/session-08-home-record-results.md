# session-08 — home-record-results

## Goal
Season record and latest results on the home page.
(About 30 minutes. Every test must be green at the end.)

## Depends on
session-07

## Read first
- docs/design/data.md (v_season_record, v_latest_results)
- docs/design/screens.md (/)
- PROGRESS.md
- Also: CLAUDE.md rules (tests first; ask before installs, Supabase/Vercel changes, commits).

## Checks it owns
AC-2.2.1, AC-2.2.2, AC-2.2.3, AC-2.2.4, AC-2.3.1, AC-2.3.2

## Tests to write first (titles)
- `AC-2.2.1 season record is computed from published league results` — levels: DB + API
- `AC-2.2.2 unpublished result is excluded from the record` — levels: DB
- `AC-2.2.3 friendly is excluded from the league record` — levels: DB
- `AC-2.2.4 no published results shows the record empty state` — levels: API + E2E
- `AC-2.3.1 latest five published results appear newest first` — levels: DB + API
- `AC-2.3.2 unpublished result never appears in latest results` — levels: DB + API
- T-11 [db] `T-11 unpublished results and cancelled matches never leak`
Tag convention: `<ID> [level] ...` — the title starts with its ID, the level tag follows (D-31).

## Files it may touch
- supabase/migrations/0005_record_results_views.sql
- src/server/home.ts
- src/components/SeasonRecord.tsx
- src/components/LatestResults.tsx
- tests/db/results.test.ts
- tests/api/home.test.ts
- tests/e2e/home-results.spec.ts
- PROGRESS.md
Anything else needs the owner's OK.

## Steps
1. Write the tests first; show them failing.
2. Migration: `v_season_record` (league, published only) and `v_latest_results` (published, newest first) + matrix rows.
3. Extend `/api/home` (limit 5) and the page sections with their empty states.
4. Run the exit gate.

## Exit gate
Each command runs on its own and must exit 0 (never through a pipe). Show the output.
```powershell
npm run test:db -- tests/db/results.test.ts
npm run test:api -- tests/api/home.test.ts
npm run test:e2e -- tests/e2e/home-results.spec.ts
npm run gate
```
`npm run gate` runs typecheck, lint, unit, database, API, end-to-end and plan:check in order.

Commit only after the owner says "go", and only after the test command itself exited 0.

## What to write in PROGRESS.md for the next session
Append: **Done** · **Proof** (the exit-gate output summary) · **Decisions** (add to DECISIONS.md too) · **Next session needs to know:** View names and columns, and how the empty-state tests clear the data.
