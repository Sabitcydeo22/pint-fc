# session-04 — seed-data

## Goal
The idempotent fake-data seed (no logins yet) and the demo match relative to now.
(About 30 minutes. Every test must be green at the end.)

## Depends on
session-02, session-03

## Read first
- docs/design/data.md (Seed)
- docs/REQUIREMENTS.md §4.4
- PROGRESS.md
- Also: CLAUDE.md rules (tests first; ask before installs, Supabase/Vercel changes, commits).

## Checks it owns
none (infrastructure / cross-cutting tests only)

## Tests to write first (titles)
- SEED-1 [db] `SEED-1 seed yields the specified counts and is idempotent`
- SEED-2 [db] `SEED-2 demo match cutoff is relative to now and re-runnable`
- SEED-3 [unit] `SEED-3 seed data contains only fake emails (@pintfc.test), 555 phones and no real-looking names list`
Tag convention: `<ID> [level] ...` — the title starts with its ID, the level tag follows (D-31).

## Files it may touch
- scripts/seed.mjs
- scripts/seed-data/**
- tests/db/seed.test.ts
- tests/unit/seed-fake.test.ts
- PROGRESS.md
Anything else needs the owner's OK.

## Steps
1. Write the seed tests first (counts: 40 active players by position, 1 archived, 2 minors, mixed consents, 10 published results with stat lines, 1 friendly, 1 unpublished result, 4 upcoming with 1 cancelled, trainings, 1 snapshot, 1 demo match); show them failing.
2. Write `scripts/seed.mjs` taking a connection and `--demo-cutoff-in 90m`; deterministic UUIDs so reruns update, never duplicate.
3. Players get deterministic ids now; logins are created in session 05 using the same ids.
4. Run the exit gate.

## Exit gate
Each command runs on its own and must exit 0 (never through a pipe). Show the output.
```powershell
npm run test:db -- tests/db/seed.test.ts
npm run test:unit -- tests/unit/seed-fake.test.ts
npm run gate
```
`npm run gate` runs typecheck, lint, unit, database, API, end-to-end and plan:check in order.

Commit only after the owner says "go", and only after the test command itself exited 0.

## What to write in PROGRESS.md for the next session
Append: **Done** · **Proof** (the exit-gate output summary) · **Decisions** (add to DECISIONS.md too) · **Next session needs to know:** How to run the seed locally, the deterministic id scheme, the fake-name list location, and the demo-match flag.
