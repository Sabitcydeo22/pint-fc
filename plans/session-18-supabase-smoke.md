# session-18 — supabase-smoke

## Goal
Create the real Supabase project (the owner does it in the dashboard), confirm the JWT-lifetime setting on the Free plan, add the real Auth adapter, push migrations, seed, and run the smoke suite.
(About 30 minutes. Every test must be green at the end.)

## Depends on
session-17

## Read first
- docs/design/architecture.md §4–5
- DECISIONS.md (D-12, D-13)
- PROGRESS.md
- Also: CLAUDE.md rules (tests first; ask before installs, Supabase/Vercel changes, commits).

## Checks it owns
none (infrastructure / cross-cutting tests only)

## Tests to write first (titles)
- SMOKE-1 [smoke] `SMOKE-1 real sign-in and sign-out-all`
- SMOKE-2 [smoke] `SMOKE-2 /rest/v1/ with the anon key lists only allowed views and functions`
- SMOKE-3 [smoke] `SMOKE-3 RSVP round trip with a test player`
- SMOKE-4 [smoke] `SMOKE-4 core schema unreachable from REST`
Tag convention: `<ID> [level] ...` — the title starts with its ID, the level tag follows (D-31).

## Files it may touch
- src/server/auth/supabase.ts
- tests/smoke/smoke.test.ts
- package.json (script `test:smoke`)
- DECISIONS.md
- .env.local (the owner pastes values; never printed)
- PROGRESS.md
Anything else needs the owner's OK.

## Steps
1. **I give the owner exact dashboard steps** (project name `pintfc`, a region near them, a database password that only the owner keeps, then copy the project URL, anon key, service-role key and pooler connection string into `.env.local`). I never create the project and never touch the existing project in org `sabit`.
2. Check that the 5-minute JWT lifetime can be set on the Free plan. Write the answer, or the fallback, into DECISIONS.md under D-13 **before** relying on it.
3. **Ask the owner for "yes"** before `npx supabase db push`, before seeding the remote database, and before installing `@supabase/ssr`.
4. Write the smoke tests first; run them; show them failing; add the Supabase Auth adapter; run again.
5. The owner opens a preview-style URL if available and reports whether sign-in cookies work (Hobby protection may block it).
6. Run the exit gate.

## Exit gate
Each command runs on its own and must exit 0 (never through a pipe). Show the output.
```powershell
npm run test:smoke
npm run gate
```
`npm run gate` runs typecheck, lint, unit, database, API, end-to-end and plan:check in order.

Commit only after the owner says "go", and only after the test command itself exited 0.

## What to write in PROGRESS.md for the next session
Append: **Done** · **Proof** (the exit-gate output summary) · **Decisions** (add to DECISIONS.md too) · **Next session needs to know:** the project ref (never the keys), the JWT-setting outcome, and how to re-run the seed with `--demo-cutoff-in`.
