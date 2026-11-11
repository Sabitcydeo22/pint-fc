# session-11 — privacy-settings

## Goal
Players edit their own public-visibility settings.
(About 25 minutes. Every test must be green at the end.)

## Depends on
session-05, session-10

## Read first
- docs/design/api.md (settings)
- docs/design/threats.md (T-06)
- docs/design/screens.md (/settings)
- PROGRESS.md
- Also: CLAUDE.md rules (tests first; ask before installs, Supabase/Vercel changes, commits).

## Checks it owns
AC-4.3.2, AC-4.3.3, AC-4.3.4

## Tests to write first (titles)
- `AC-4.3.2 changing a consent is saved and reflected publicly on next request` — levels: API + E2E
- `AC-4.3.3 minor without guardian consent cannot opt in` — levels: DB + API
- `AC-4.3.4 player cannot change another player's settings` — levels: DB + API
- T-06 [db+api] `T-06 player cannot change status, guardian consent or number`
Tag convention: `<ID> [level] ...` — the title starts with its ID, the level tag follows (D-31).

## Files it may touch
- supabase/migrations/0008_my_settings.sql
- src/app/settings/**
- src/app/api/me/settings/route.ts
- src/server/settings.ts
- tests/db/settings.test.ts
- tests/api/settings.test.ts
- tests/e2e/settings.spec.ts
- PROGRESS.md
Anything else needs the owner's OK.

## Steps
1. Write the tests first, including direct-database attempts on another player's row; show them failing.
2. Migration: `rpc_my_settings`, `rpc_update_my_settings` (4 flags, own row, `PF422` for minors) + matrix rows.
3. Routes and the settings page (disabled public toggle with `minor-note` for the unconsented minor).
4. Run the exit gate.

## Exit gate
Each command runs on its own and must exit 0 (never through a pipe). Show the output.
```powershell
npm run test:db -- tests/db/settings.test.ts
npm run test:api -- tests/api/settings.test.ts
npm run test:e2e -- tests/e2e/settings.spec.ts
npm run gate
```
`npm run gate` runs typecheck, lint, unit, database, API, end-to-end and plan:check in order.

Commit only after the owner says "go", and only after the test command itself exited 0.

## What to write in PROGRESS.md for the next session
Append: **Done** · **Proof** (the exit-gate output summary) · **Decisions** (add to DECISIONS.md too) · **Next session needs to know:** Settings DTO, how tests sign in as the two minors.
