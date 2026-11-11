# session-03 — shared-rules

## Goal
Build the shared rules once: time and cutoff (TypeScript and SQL), errors, permissions, privacy scanner, server clock, poller.
(About 25 minutes. Every test must be green at the end.)

## Depends on
session-02

## Read first
- docs/design/rules.md
- docs/REQUIREMENTS.md §4 and §6.1
- PROGRESS.md
- Also: CLAUDE.md rules (tests first; ask before installs, Supabase/Vercel changes, commits).

## Checks it owns
AC-2.1.6

## Tests to write first (titles)
- `AC-2.1.6 kickoff is shown in America/New_York with zone label across DST changes` — levels: U
- RULE-1 [unit+db] `RULE-1 TypeScript and SQL cutoff agree on every case (parity)`
- RULE-2 [unit] `RULE-2 DST: cutoff and display around 14 Mar 2027, 7 Nov 2027 and 1 Nov 2026`
- RULE-3 [unit] `RULE-3 cutoff boundary: closed at exactly kickoff minus 2 h, open 1 ms before`
- RULE-4 [unit] `RULE-4 errors map to the one error format and unknown errors become INTERNAL`
- RULE-5 [unit] `RULE-5 assertNoPii flags emails, phones, birth dates and rsvp keys`
- RULE-6 [unit] `RULE-6 poller runs every 10 s while visible and pauses when hidden`
Tag convention: `<ID> [level] ...` — the title starts with its ID, the level tag follows (D-31).

## Files it may touch
- src/lib/time.ts
- src/lib/errors.ts
- src/lib/permissions.ts
- src/lib/privacy.ts
- src/lib/clock.ts
- src/lib/poll.ts
- src/lib/schemas.ts
- src/lib/log.ts
- supabase/migrations/0002_time_rules.sql
- tests/unit/**
- tests/db/rules.test.ts
- PROGRESS.md
Anything else needs the owner's OK.

## Steps
1. Write RULE tests and AC-2.1.6 first; show them failing.
2. Implement `time.ts` (cutoff, isRsvpOpen, formatKickoff, countdown) with `Intl` and the club zone constant.
3. Migration 0002: `core.rsvp_cutoff`, `core.rsvp_is_open`; parity test runs one shared case table through both.
4. Implement errors, permissions, privacy scanner, clock, poller, schemas, logger (logger never prints bodies/cookies).
5. Run the exit gate.

## Exit gate
Each command runs on its own and must exit 0 (never through a pipe). Show the output.
```powershell
npm run test:db -- tests/db/rules.test.ts
npm run test:unit
npm run gate
```
`npm run gate` runs typecheck, lint, unit, database, API, end-to-end and plan:check in order.

Commit only after the owner says "go", and only after the test command itself exited 0.

## What to write in PROGRESS.md for the next session
Append: **Done** · **Proof** (the exit-gate output summary) · **Decisions** (add to DECISIONS.md too) · **Next session needs to know:** Public function names and signatures of every shared rule; the shared case table file; that routes must use `withApi` from session 05.
