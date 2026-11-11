# session-17 — gates-design

## Goal
Contrast (WCAG AA) and 320 px no-horizontal-scroll gates for every page and state, the security unit tests, and owner screenshots.
(About 30 minutes. Every test must be green at the end.)

## Depends on
session-12, session-15, session-16

## Read first
- docs/design/screens.md
- PROGRESS.md
- Also: CLAUDE.md rules (tests first; ask before installs, Supabase/Vercel changes, commits).

## Checks it owns
AC-5.2, AC-5.4

## Tests to write first (titles)
- `AC-5.2 every page meets WCAG AA contrast` — levels: E2E (axe), one per page × state
- `AC-5.4 no horizontal scroll at 320 px` — levels: E2E, one per page
- T-13 [unit] `T-13 client bundle contains no service key or database URL`
- T-14 [unit] `T-14 secret scanner finds no token patterns in tracked files`
- T-15 [e2e] `T-15 script in a player name or reason is rendered as text`
- T-18 [unit] `T-18 no string-built SQL in src`
Tag convention: `<ID> [level] ...` — the title starts with its ID, the level tag follows (D-31).

## Files it may touch
- tests/e2e/a11y.spec.ts
- tests/e2e/layout.spec.ts
- tests/e2e/screenshots.spec.ts
- tests/unit/security.test.ts
- src/** (CSS/markup fixes only)
- PROGRESS.md
Anything else needs the owner's OK.

## Steps
1. **Ask the owner for "yes" to install** `@axe-core/playwright` before installing it.
2. Write the gates first: axe per page × state; `scrollWidth <= viewport` at 320 px; show them failing if any page fails.
3. Fix the contrast and overflow issues found (CSS/markup only). Capture screenshots of every page × state at 390 px and 320 px into `screenshots/` (gitignored; never delete old ones).
4. Write and pass the security unit tests (T-13, T-14, T-15, T-18); add the Content-Security-Policy header.
5. Run the exit gate. **Show the owner the screenshots** (release requirement #4) before session 18.

## Exit gate
Each command runs on its own and must exit 0 (never through a pipe). Show the output.
```powershell
npm run test:e2e -- tests/e2e/a11y.spec.ts
npm run test:e2e -- tests/e2e/layout.spec.ts
npm run test:e2e -- tests/e2e/screenshots.spec.ts
npm run test:unit -- tests/unit/security.test.ts
npm run gate
```
`npm run gate` runs typecheck, lint, unit, database, API, end-to-end and plan:check in order.

Commit only after the owner says "go", and only after the test command itself exited 0.

## What to write in PROGRESS.md for the next session
Append: **Done** · **Proof** (the exit-gate output summary) · **Decisions** (add to DECISIONS.md too) · **Next session needs to know:** where the screenshots are and anything the owner asked to change.
