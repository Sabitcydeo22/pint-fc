# session-10 — squad-profiles

## Goal
Squad list and player profile pages, with consent filtering in the database.
(About 30 minutes. Every test must be green at the end.)

## Depends on
session-06, session-04

## Read first
- docs/design/data.md (visibility rule, v_squad, v_player_profile)
- docs/design/screens.md (/squad, /players)
- PROGRESS.md
- Also: CLAUDE.md rules (tests first; ask before installs, Supabase/Vercel changes, commits).

## Checks it owns
AC-4.1.1, AC-4.1.2, AC-4.1.3, AC-4.2.1, AC-4.2.2

## Tests to write first (titles)
- `AC-4.1.1 squad lists active visible players grouped by position` — levels: DB + API + E2E
- `AC-4.1.2 archived player never appears and their profile is 404` — levels: DB + API + E2E
- `AC-4.1.3 minor appears only with guardian consent and opt-in` — levels: DB + API
- `AC-4.2.1 profile shows name, position and number` — levels: API + E2E
- `AC-4.2.2 photo, nationality and stats appear only when consented` — levels: DB + API + E2E
- T-10 [api+e2e] `T-10 hidden and archived players return an identical 404`
Tag convention: `<ID> [level] ...` — the title starts with its ID, the level tag follows (D-31).

## Files it may touch
- supabase/migrations/0007_squad_views.sql
- src/app/squad/**
- src/app/players/**
- src/app/api/squad/route.ts
- src/app/api/players/[id]/route.ts
- src/server/squad.ts
- tests/db/squad.test.ts
- tests/api/squad.test.ts
- tests/e2e/squad.spec.ts
- PROGRESS.md
Anything else needs the owner's OK.

## Steps
1. Write the tests first (both seeded minors, archived player, mixed consents); show them failing.
2. Migration: `core.is_publicly_visible`, `v_squad`, `v_player_profile` (CASE on consent flags) + matrix rows.
3. Routes with uuid validation; hidden = archived = unknown → identical 404.
4. Pages with states; optional fields absent from the DOM unless consented.
5. Run the exit gate.

## Exit gate
Each command runs on its own and must exit 0 (never through a pipe). Show the output.
```powershell
npm run test:db -- tests/db/squad.test.ts
npm run test:api -- tests/api/squad.test.ts
npm run test:e2e -- tests/e2e/squad.spec.ts
npm run gate
```
`npm run gate` runs typecheck, lint, unit, database, API, end-to-end and plan:check in order.

Commit only after the owner says "go", and only after the test command itself exited 0.

## What to write in PROGRESS.md for the next session
Append: **Done** · **Proof** (the exit-gate output summary) · **Decisions** (add to DECISIONS.md too) · **Next session needs to know:** Visibility function name, how tests find the seeded minors, and the profile DTO shape.
