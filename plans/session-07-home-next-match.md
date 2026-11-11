# session-07 — home-next-match

## Goal
Home page, next-match card with live countdown, and the `/api/home` route (next-match part).
(About 30 minutes. Every test must be green at the end.)

## Depends on
session-04, session-06

## Read first
- docs/design/screens.md (/)
- docs/design/api.md (GET /api/home)
- docs/design/rules.md §1, §7
- PROGRESS.md
- Also: CLAUDE.md rules (tests first; ask before installs, Supabase/Vercel changes, commits).

## Checks it owns
AC-2.1.1, AC-2.1.2, AC-2.1.3, AC-2.1.4, AC-2.1.5

## Tests to write first (titles)
- `AC-2.1.1 home shows next non-cancelled match with opponent, venue and kickoff` — levels: DB + API + E2E
- `AC-2.1.2 cancelled earliest match is skipped as next match` — levels: DB
- `AC-2.1.3 countdown ticks down every second` — levels: U + E2E
- `AC-2.1.4 countdown at kickoff shows Kicked off and never goes negative` — levels: U + E2E
- `AC-2.1.5 no upcoming matches shows the empty state` — levels: API + E2E
Tag convention: `<ID> [level] ...` — the title starts with its ID, the level tag follows (D-31).

## Files it may touch
- supabase/migrations/0004_v_next_match.sql
- src/app/page.tsx
- src/app/api/home/route.ts
- src/server/home.ts
- src/components/NextMatch.tsx
- tests/db/next-match.test.ts
- tests/api/home.test.ts
- tests/e2e/home-next.spec.ts
- PROGRESS.md
Anything else needs the owner's OK.

## Steps
1. Write DB, API, unit and e2e tests first (frozen browser clock for the countdown); show them failing.
2. Migration: `public.v_next_match` (excludes cancelled, past) granted to anon/authenticated, plus matrix rows.
3. `/api/home` returns `server_now` and `next_match` (other sections are added in sessions 08–09).
4. Next-match card, countdown using the server-corrected clock, "Kicked off", empty state, `rsvp_open` chip, link to the event page.
5. Run the exit gate.

## Exit gate
Each command runs on its own and must exit 0 (never through a pipe). Show the output.
```powershell
npm run test:db -- tests/db/next-match.test.ts
npm run test:api -- tests/api/home.test.ts
npm run test:e2e -- tests/e2e/home-next.spec.ts
npm run gate
```
`npm run gate` runs typecheck, lint, unit, database, API, end-to-end and plan:check in order.

Commit only after the owner says "go", and only after the test command itself exited 0.

## What to write in PROGRESS.md for the next session
Append: **Done** · **Proof** (the exit-gate output summary) · **Decisions** (add to DECISIONS.md too) · **Next session needs to know:** The shape of `/api/home` so far, how e2e freezes time, and that sections 2–4 plug into the same route.
