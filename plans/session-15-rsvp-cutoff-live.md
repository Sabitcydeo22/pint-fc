# session-15 — rsvp-cutoff-live

## Goal
Live behaviour: 10-second polling, "RSVP closed" switching at server cutoff, wrong device clocks.
(About 30 minutes. Every test must be green at the end.)

## Depends on
session-03, session-14

## Read first
- docs/design/rules.md §1, §7, §8
- docs/design/screens.md (/fixtures/[id])
- PROGRESS.md
- Also: CLAUDE.md rules (tests first; ask before installs, Supabase/Vercel changes, commits).

## Checks it owns
AC-3.3.4, AC-3.3.5

## Tests to write first (titles)
- `AC-3.3.4 answers after cutoff are rejected and the UI shows RSVP closed` — levels: DB + API + E2E
- `AC-3.3.5 page switches to RSVP closed at server cutoff without reload` — levels: U + E2E
- LIVE-1 [e2e] `LIVE-1 an answer by player A shows on player B's open event page within 15 seconds`
- T-17 [e2e] `T-17 wrong device clock does not change RSVP open/closed`
Tag convention: `<ID> [level] ...` — the title starts with its ID, the level tag follows (D-31).

## Files it may touch
- src/components/Attendance.tsx
- src/components/LiveClock.tsx
- src/lib/poll.ts (use only)
- tests/e2e/live.spec.ts
- PROGRESS.md
Anything else needs the owner's OK.

## Steps
1. Write the e2e tests first (two browser contexts; controlled clock; skewed device clock); show them failing.
2. Attach the poller (10 s visible, pause hidden, refetch on visible), "Updated n s ago", error keeps old data.
3. Switch to RSVP closed at the server-corrected cutoff without reload; disable buttons; AC-3.3.4 [e2e].
4. Run the exit gate.

## Exit gate
Each command runs on its own and must exit 0 (never through a pipe). Show the output.
```powershell
npm run test:e2e -- tests/e2e/live.spec.ts
npm run gate
```
`npm run gate` runs typecheck, lint, unit, database, API, end-to-end and plan:check in order.

Commit only after the owner says "go", and only after the test command itself exited 0.

## What to write in PROGRESS.md for the next session
Append: **Done** · **Proof** (the exit-gate output summary) · **Decisions** (add to DECISIONS.md too) · **Next session needs to know:** Timing values used in tests, and that the demo match (seed flag) is what the class will watch.
