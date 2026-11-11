# session-01 â€” workspace-gates

## Goal
Scaffold the app and make every gate runnable with one real passing test each: typecheck, lint, unit, database, API, end-to-end.
(About 30 minutes. Every test must be green at the end.)

## Depends on
none

## Read first
- CLAUDE.md
- DECISIONS.md
- docs/design/architecture.md (Â§5 test levels)
- Also: CLAUDE.md rules (tests first; ask before installs, Supabase/Vercel changes, commits).

## Checks it owns
none (infrastructure / cross-cutting tests only)

## Tests to write first (titles)
- GATE-1 [unit] `GATE-1 vitest runs a real unit test` (imports a real function from src/lib/hello.ts)
- GATE-2 [db] `GATE-2 embedded Postgres starts, answers select 1 and is torn down`
- GATE-3 [api] `GATE-3 GET /api/health returns 200 {ok:true} through the route handler`
- GATE-4 [e2e] `GATE-4 home page loads in Chromium at 390 px and 320 px`
Tag convention: `<ID> [level] ...` â€” the title starts with its ID, the level tag follows (D-31).

## Files it may touch
- package.json
- tsconfig.json
- next.config.*
- eslint config
- vitest.*.config.ts
- playwright.config.ts
- src/app/**
- src/lib/hello.ts
- tests/**
- scripts/gate.mjs
- scripts/plan-check.mjs (already exists; do not change)
- .env.example
- PROGRESS.md
Anything else needs the owner's OK.

## Steps
1. **Ask the owner for a single "yes" to install** (list shown first): next, react, react-dom, typescript, @types/*, eslint + eslint-config-next, vitest, @playwright/test (+ Chromium download), embedded-postgres, pg, zod. Nothing else.
2. Write the four tests above first; run each; show it failing because the code/script does not exist.
3. Scaffold Next.js (App Router, TS strict) by hand; add the scripts: `typecheck`, `lint`, `test:unit`, `test:db`, `test:api`, `test:e2e`, `plan:check`, `gate` (scripts/gate.mjs runs them in order and stops at the first failure).
4. Embedded Postgres helper `tests/helpers/pg.ts`: random port, temp data dir under the OS temp folder, start/stop. Never delete user files; the temp dir is left for the OS (ask the owner before any cleanup).
5. Make the four tests pass; add `.env.example` (names only, no values).
6. Run the exit gate and show the output. Ask the owner for "go" before committing.

## Exit gate
Each command runs on its own and must exit 0 (never through a pipe). Show the output.
```powershell
npm run typecheck
npm run lint
npm run test:unit
npm run test:db
npm run test:api
npm run test:e2e
npm run plan:check
npm run gate
```

`npm run gate` (written in this session) runs typecheck, lint, unit, database, API, end-to-end and plan:check in order.

Commit only after the owner says "go", and only after the test command itself exited 0.

## What to write in PROGRESS.md for the next session
Append: **Done** Â· **Proof** (the exit-gate output summary) Â· **Decisions** (add to DECISIONS.md too) Â· **Next session needs to know:** Exact npm script names, how to run one test file, where the embedded Postgres helper lives, and which packages were approved.
