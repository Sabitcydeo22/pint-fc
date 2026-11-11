# session-12 — privacy-sweep

## Goal
Prove invariant 1: no public response contains email, phone, date of birth or RSVP, across every public API and page.
(About 25 minutes. Every test must be green at the end.)

## Depends on
session-09, session-10, session-11

## Read first
- docs/design/rules.md §3
- docs/design/threats.md (T-02, T-12)
- PROGRESS.md
- Also: CLAUDE.md rules (tests first; ask before installs, Supabase/Vercel changes, commits).

## Checks it owns
AC-4.3.1

## Tests to write first (titles)
- `AC-4.3.1 no public response contains email, phone, date of birth or RSVP` — levels: DB + API + E2E
- T-02 [db] `T-02 no view or function exposes email, phone or date of birth to others`
- T-12 [api+e2e] `T-12 visitor never receives RSVP data`
Tag convention: `<ID> [level] ...` — the title starts with its ID, the level tag follows (D-31).

## Files it may touch
- tests/db/pii.test.ts
- tests/api/public-pii.test.ts
- tests/e2e/public-crawl.spec.ts
- src/** (fixes only, if a leak is found)
- PROGRESS.md
Anything else needs the owner's OK.

## Steps
1. Write the sweep first: every anon-granted view/function column scanned; every public API route; Playwright crawls all public pages and scans HTML and network JSON with `assertNoPii`.
2. Seed contains deliberate PII values (fake) so the scanner has something to find; show the tests catch a deliberately leaky test view, then remove it from the test.
3. Fix any real leak found, with a new test.
4. Run the exit gate.

## Exit gate
Each command runs on its own and must exit 0 (never through a pipe). Show the output.
```powershell
npm run test:db -- tests/db/pii.test.ts
npm run test:api -- tests/api/public-pii.test.ts
npm run test:e2e -- tests/e2e/public-crawl.spec.ts
npm run gate
```
`npm run gate` runs typecheck, lint, unit, database, API, end-to-end and plan:check in order.

Commit only after the owner says "go", and only after the test command itself exited 0.

## What to write in PROGRESS.md for the next session
Append: **Done** · **Proof** (the exit-gate output summary) · **Decisions** (add to DECISIONS.md too) · **Next session needs to know:** List of all public endpoints/pages covered; add new ones to the sweep when added.
