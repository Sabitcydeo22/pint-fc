# session-19 — release-deploy

## Goal
Final full gate, Vercel project setup, preview deploy, owner review, and the production deploy as the very last step.
(About 30 minutes. Every test must be green at the end.)

## Depends on
session-18

## Read first
- docs/requirements/PINTFC-MVP-Requirements.pdf page 3 ("Done means") and docs/REQUIREMENTS.md
- docs/design/architecture.md §6
- PROGRESS.md
- Also: CLAUDE.md rules (tests first; ask before installs, Supabase/Vercel changes, commits).

## Checks it owns
none (infrastructure / cross-cutting tests only)

## Tests to write first (titles)
- REL-1 [unit] `REL-1 every AC id has a passing test whose title starts with it` (compares test results with the AC ids in docs/REQUIREMENTS.md)
Tag convention: `<ID> [level] ...` — the title starts with its ID, the level tag follows (D-31).

## Files it may touch
- vercel.json (only if needed)
- scripts/release-check.mjs
- tests/unit/release.test.ts
- DECISIONS.md
- PROGRESS.md
Anything else needs the owner's OK.

## Steps
1. Write REL-1 first; show it failing if any AC id has no passing test.
2. **Ask the owner before creating the Vercel project** in team `sabit-pintfc` (`npx vercel project add` / `link` with `--token $env:VERCEL_TOKEN`). Set the environment variable names listed in architecture.md §4; the service-role key is NOT set on Vercel.
3. Preview deploy (owner's yes first); run the smoke suite against it. The owner reviews the screenshots and the preview (release requirement #4).
4. Run the full exit gate and show the output.
5. **LAST STEP — production deploy.** It needs the owner's explicit "yes". After it, run read-only smoke checks and hand the owner the demo-match seed command.

## Exit gate
Each command runs on its own and must exit 0 (never through a pipe). Show the output.
```powershell
npm run test:unit -- tests/unit/release.test.ts
npm run test:smoke
npm run gate
```
`npm run gate` runs typecheck, lint, unit, database, API, end-to-end and plan:check in order.

Commit only after the owner says "go", and only after the test command itself exited 0.

## What to write in PROGRESS.md for the next session
Append: **Done** · **Proof** (the exit-gate output summary) · **Decisions** (add to DECISIONS.md too) · **Next session needs to know:** the production URL, how to move the demo match (`seed --demo-cutoff-in`), and the day-before checklist (open the app so Supabase is not paused).
