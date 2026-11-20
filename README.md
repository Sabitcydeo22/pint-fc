# PINT FC

A mobile-first club website and match-day RSVP app, built as a course project in the Cydeo Agentic QA program. It is a fully agentic build: Claude Code wrote all of the code, and I supervised it. I approved or rejected each step, made the product decisions, and verified every result myself with commands (git, the quality gate, secret scans). I worked with a personal AI assistant, configured with my project rules, to plan the steps and check the agent's work.

Live demo: https://pintfc-two.vercel.app (fake data only)

## What it does
- Home page with the next match, a countdown and RSVP status, season record, latest results and a mini league table.
- Public squad and player pages with a visibility rule: minors and players without consent stay hidden.
- Sign-in for players, a Going / Maybe / Not going RSVP that closes 2 hours before kickoff (club time zone), and a live attendance list that refreshes every 10 seconds.
- Account settings (privacy and consent).

## Stack
Next.js, TypeScript, Supabase (Postgres and Auth), Vercel, Vitest, Playwright, axe-core.

## How it was built
- The agent followed a plan of 19 build sessions and then design sessions. My role in each: review the plan, approve or reject file and test changes, decide product questions, run the gate, and approve every commit, push and production deploy.
- Product decisions that were mine include the club time zone, the RSVP cutoff, the colours and the order of work.
- The requirements came from a 3-page course document with 38 acceptance checks (not included here). The agent wrote the wording of each check, so I mark them "derived". Two more checks (contrast and 320 px layout) were added as gates: 40 in total.
- Decisions are logged in `DECISIONS.md` and session notes in `PROGRESS.md`, including mistakes and known gaps.

## Quality gates
`npm run gate` runs 7 checks: typecheck, lint, unit, database (a real embedded Postgres), API, end-to-end (Chromium at 320 and 390 px and wider) and a plan check that every requirement has exactly one owner. At the last design session the full gate passed with 312 end-to-end tests.

After each session, mutation checks were run: break a security rule on purpose, confirm a test fails, then restore the file (verified with a SHA-256 hash). Several rules turned out to have no test until this check found them.

## Security and privacy
- Privacy is enforced in the database (RLS and views), not only on the page.
- No secrets in the repo; the Supabase secret key is never sent to Vercel.
- Strict CSP with nonces; local images only.
- Fake data only: no real names, emails or phone numbers.

## Known limitations
- Production sign-in is only smoke-tested through the API; real logins for the 40 seed players are not created.
- One end-to-end check was flaky once; the cause was found and fixed, but the link to the earlier failures is probable, not proven.
- Player photos are not shown yet.
- This is a learning project, not a club's live system.

## Run locally
Needs Node and a `.env.local` (see `.env.example`). Run `npm install`, then `npm run gate`.

No license has been added yet, so all rights are reserved.
