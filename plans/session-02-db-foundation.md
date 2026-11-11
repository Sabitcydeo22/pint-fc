# session-02 — db-foundation

## Goal
First migration: schemas `core` and `public`, roles, the `auth` stub, all tables, locked-down grants, and the access-matrix test harness.
(About 30 minutes. Every test must be green at the end.)

## Depends on
session-01

## Read first
- docs/design/data.md
- docs/design/threats.md (T-01, T-02)
- PROGRESS.md
- Also: CLAUDE.md rules (tests first; ask before installs, Supabase/Vercel changes, commits).

## Checks it owns
none (infrastructure / cross-cutting tests only)

## Tests to write first (titles)
- T-01 [db] `T-01 anon cannot read any core table`
- MATRIX-1 [db] `MATRIX-1 every role × object × operation in the access matrix behaves as listed` (matrix as data: tests/db/matrix.ts)
- MATRIX-2 [db] `MATRIX-2 every table, view and function appears in the matrix`
- DB-STUB-1 [db] `DB-STUB-1 auth.uid() returns the sub claim set by SET LOCAL request.jwt.claims`
Tag convention: `<ID> [level] ...` — the title starts with its ID, the level tag follows (D-31).

## Files it may touch
- supabase/migrations/0001_core_schema.sql
- tests/db/**
- tests/helpers/db.ts
- tests/helpers/auth-stub.sql
- PROGRESS.md
Anything else needs the owner's OK.

## Steps
1. Write the matrix data and tests first; show them failing (no schema).
2. Write `tests/helpers/auth-stub.sql`: roles anon/authenticated/service_role, `auth.uid()`, `auth.jwt()`, `auth.sessions` table. It is test-only; the real Supabase already has these.
3. Write migration 0001: `core` tables per data.md, enums, constraints (one current season, unique active shirt numbers, minor opt-in constraint), RLS enabled, REVOKE everything from anon/authenticated, revoke default privileges.
4. Helper `asRole(role, claims)` that opens a transaction with `SET LOCAL ROLE` and claims, like PostgREST.
5. Make tests pass; run the exit gate.

## Exit gate
Each command runs on its own and must exit 0 (never through a pipe). Show the output.
```powershell
npm run test:db -- tests/db
npm run gate
```
`npm run gate` runs typecheck, lint, unit, database, API, end-to-end and plan:check in order.

Commit only after the owner says "go", and only after the test command itself exited 0.

## What to write in PROGRESS.md for the next session
Append: **Done** · **Proof** (the exit-gate output summary) · **Decisions** (add to DECISIONS.md too) · **Next session needs to know:** How `asRole` works, the matrix file format, and that views/functions are added by later sessions (each must add its matrix rows).
