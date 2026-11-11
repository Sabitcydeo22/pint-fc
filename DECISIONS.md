# Decisions

One line each: decision — reason. "(proposed)" = owner may veto at approval.

- D-01 Stack: Next.js App Router + TypeScript, Supabase Postgres + Auth, Vitest, Playwright, Vercel — the default stack; no change needed.
- D-02 Club time zone `America/New_York` — owner answer Q2.
- D-03 RSVP cutoff = kickoff − 2 h, closed at exactly the cutoff — owner answer Q3; one function in TS and SQL with a parity test.
- D-04 Instants stored as UTC `timestamptz`, shown in club zone with label — avoids DST bugs.
- D-05 Demo match seeded relative to now (`--demo-cutoff-in`) — class date undecided (Q3).
- D-06 Database tests on embedded Postgres 17 (`embedded-postgres`) + `auth` stub + smoke run on real Supabase — Docker not installed; owner chose Option A (Q10). Every install needs the owner's yes.
- D-07 Base tables in schema `core`, only views/functions in `public` — Supabase exposes `public` over REST; nothing sensitive may be reachable there.
- D-08 The app queries as role `anon`/`authenticated` via `pg` with `SET LOCAL ROLE` + claims, never as service role at runtime — app has no more power than a player; same code path as a direct attacker.
- D-09 RSVP written only by `rpc_rsvp_set` (SECURITY DEFINER, uses `auth.uid()`, checks cutoff with database `now()`) — makes direct-API abuse impossible, not just unlikely.
- D-10 Decisions use server time; browser keeps a server-corrected clock — wrong phone clocks cannot show a false "open".
- D-11 Local/CI auth is a test-only `LocalAuth` adapter; real Supabase Auth only in preview/prod, covered by smoke tests — GoTrue needs Docker; accepted drift risk, mitigated by smoke.
- D-12 (proposed) One Supabase project `pintfc` for preview and production — Free plan allows 2 active projects and one is already paused in the org; risk: previews share production data (threat T-20). Alternative: a second project `pintfc-staging`.
- D-13 (proposed) Auth JWT lifetime set to 5 minutes in the dashboard — limits how long a revoked token could be used directly against the database; `require_player()` also checks `auth.sessions`.
- D-14 Sign-in via our own route (`POST /api/auth/sign-in`) with a fixed minimum duration — generic errors and equal timing (AC-1.1.4).
- D-15 No sign-up, reset or email flows — out of scope; no Supabase email sending needed on the Free plan.
- D-16 Seed creates the 40 users with the admin API and writes passwords only to gitignored `credentials.local.csv` — owner answer Q5; secrets never printed.
- D-17 Adults default to public-visible, minors default hidden; DB constraint blocks minor opt-in without guardian consent — AC-4.1.3/4.3.3; `guardian_consent` is owner-set only (guardians out of scope).
- D-18 RSVP allowed for any scheduled match before its cutoff, not only "the next" one — simpler and a superset; cancelled/past rejected (AC-3.3.6).
- D-19 Optional RSVP reason ≤ 140 chars, visible only to its author — owner answer Q6.
- D-20 Maybe is a separate count; visitors see no counts — owner answers Q8, Q4.
- D-21 Latest results = 5; squad shows all visible players — owner answer Q9.
- D-22 One error format `{error:{code,message,request_id}}`; unknown errors → generic `INTERNAL` — no leaks, easy to test.
- D-23 Hidden and archived players return the same 404 — prevents existence probing.
- D-24 Polling every 10 s while visible (pause when hidden) — the PDF's default; worst case ≈ 10 s + request, inside 15 s.
- D-25 Look "Sport" light with system font and tokens in screens.md — owner pick; no font download keeps phones fast; contrast verified by axe.
- D-26 Lockout/rate limiting not built — accepted risk in the PDF while data is fake.
- D-27 Public GETs are `no-store` — freshness over caching for a small app.
- D-28 Cross-site protection by SameSite=Lax cookies + JSON-only state-changing routes + Origin check — no CSRF tokens needed.
- D-29 AC-5.2 and AC-5.4 plus LIVE-1 are tracked as gates beyond the 38 — the PDF keeps them as gates.
- D-30 All 38 check texts are "derived" wording — no spec v0.3 available (Q1).
- D-12 ACCEPTED by owner (2026-11-11): one Supabase project; previews share production data; fake data only.
- D-13 ACCEPTED by owner (2026-11-11), with a condition: when the project is created, confirm the 5-minute JWT-lifetime setting is available on the Free plan BEFORE relying on it. If it is not, record the fallback here (the `auth.sessions` check in `require_player()` and `getUser()` stay as the controls). Owned by session 18.
- D-31 Plan: 19 sessions, one layer or feature each; a check is "owned" by the session that finishes ALL its tests; earlier sessions may add API-level tests tagged `[api]` for it. Tests are tagged `[db]`, `[api]`, `[unit]`, `[e2e]` after the ID so one ID can have several tests across sessions.
- D-32 Every install (npm package or tool) needs the owner's yes first (owner answer Q10); session 01 lists them in one batch for a single approval.
- D-33 Live-in-class session is 16 (AC-2.4.3, snapshot date on the mini table): tiny, visible, safe to do in front of students.
