# session-06 — app-shell-sign-in

## Goal
Page chrome (header, footer, tokens), the sign-in page, the sign-out controls, and the session-expiry behaviour in the browser.
(About 30 minutes. Every test must be green at the end.)

## Depends on
session-05

## Read first
- docs/design/screens.md (tokens, chrome, /sign-in)
- docs/design/api.md (Auth)
- PROGRESS.md
- Also: CLAUDE.md rules (tests first; ask before installs, Supabase/Vercel changes, commits).

## Checks it owns
AC-1.1.1, AC-1.1.3, AC-1.6.1, AC-1.6.2, AC-1.6.3, AC-1.6.4

## Tests to write first (titles)
- `AC-1.1.1 valid player signs in and lands on home signed in` — levels: API + E2E
- `AC-1.1.3 wrong password gives one generic error and no session` — levels: API + E2E
- `AC-1.6.1 sign out clears this session and player endpoints return 401` — levels: API + E2E
- `AC-1.6.2 sign out of all devices rejects both sessions` — levels: API + E2E
- `AC-1.6.3 player-only endpoints return 401 without a session and pages redirect to sign-in` — levels: API + E2E
- `AC-1.6.4 after sign out, back and reload show no private data` — levels: E2E
- T-19 [e2e] `T-19 sign-in ignores redirect parameters`
- SHELL-1 [e2e] `SHELL-1 header shows sign-in link when signed out and account menu when signed in`
Tag convention: `<ID> [level] ...` — the title starts with its ID, the level tag follows (D-31).

## Files it may touch
- src/app/layout.tsx
- src/app/globals.css
- src/components/Header.tsx
- src/components/Footer.tsx
- src/app/sign-in/**
- src/middleware.ts
- tests/e2e/auth.spec.ts
- PROGRESS.md
Anything else needs the owner's OK.

## Steps
1. Write the e2e tests first (each owned ID with the [e2e] tag, run at 390 px); show them failing.
2. Tokens, header (with 320 px menu), footer content, `/sign-in` form with its states and test ids.
3. Sign-out and sign-out-all buttons in the account menu; `/settings` and `/fixtures/*` redirect when signed out (page stubs allowed).
4. Back/reload after sign-out shows no private data (`Cache-Control: no-store` on private pages).
5. Run the exit gate.

## Exit gate
Each command runs on its own and must exit 0 (never through a pipe). Show the output.
```powershell
npm run test:e2e -- tests/e2e/auth.spec.ts
npm run gate
```
`npm run gate` runs typecheck, lint, unit, database, API, end-to-end and plan:check in order.

Commit only after the owner says "go", and only after the test command itself exited 0.

## What to write in PROGRESS.md for the next session
Append: **Done** · **Proof** (the exit-gate output summary) · **Decisions** (add to DECISIONS.md too) · **Next session needs to know:** Component names, token variable names, how e2e tests sign in (helper), and which pages are stubs.
