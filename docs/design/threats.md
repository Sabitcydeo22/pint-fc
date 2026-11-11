# Threats and controls

Attacker types: **V** visitor, **P** signed-in player acting maliciously, **X** anyone with the public anon key and curl. Each threat has a control and the test that proves it (IDs `T-nn` start the test titles; see test-map.md).

| ID | Threat | Control | Test level |
|---|---|---|---|
| T-01 | X calls the Supabase REST API with the anon key and reads `players` (email, phone, date of birth) | Tables live in `core`; `anon`/`authenticated` have no schema usage and no grants; RLS on with no policies; only `public` views/functions are granted | database (+ smoke: `/rest/v1/players` → 404/401) |
| T-02 | P reads other players' contact data through any view or function | No public view/function selects those columns; matrix test scans every result column name and value | database |
| T-03 | P writes an RSVP after the cutoff by calling `rpc_rsvp_set` directly | Cutoff checked **inside** the function using database `now()`; no other write path (no table grant) | database |
| T-04 | P writes or edits an RSVP for another player | Function takes no player argument, uses `auth.uid()`; API body is strict (extra `player_id` → 400) | database, API |
| T-05 | P reads other players' RSVP reasons | `rpc_attendance` never selects `reason` except for the caller's own row | database, API |
| T-06 | P sets own `guardian_consent`, `status`, shirt number, or edits someone else's settings | `rpc_update_my_settings` touches only 4 flags on `auth.uid()`'s row; no table update grant | database, API |
| T-07 | A stolen or old access token still works after "sign out of all devices" | Server uses `getUser()` (checks with Auth); `require_player()` checks `auth.sessions`; short JWT lifetime (5 min proposed, D-13) | API, e2e, smoke |
| T-08 | Account enumeration via sign-in error text or timing | One error code/message; fixed minimum response time; archived players same path | API |
| T-09 | Brute-force password guessing | **Accepted risk (out of scope, FR-1.7)**: fake data only. Supabase's built-in Auth rate limits still apply in production | — (documented) |
| T-10 | Archived player or hidden minor leaks through squad, profile, search engine or URL guess | Views filter by `is_publicly_visible`; unknown/hidden id → 404 (same body) | database, API, e2e |
| T-11 | Unpublished result or cancelled match leaks | Views read only `published = true`; next-match view excludes cancelled | database, API |
| T-12 | Visitor sees RSVP data or counts | Counts/attendance only via `rpc_attendance` (authenticated only); public DTOs scanned by `assertNoPii` | database, API, e2e |
| T-13 | Service-role key or DB URL shipped to the browser | Service key never set on Vercel; only `NEXT_PUBLIC_*` reach the client; a build test greps the client bundle and `.next/static` for key patterns | unit/build |
| T-14 | Secrets committed to git or printed in logs | `.gitignore`; pre-commit style check script scans staged files for key patterns; logger never logs bodies/cookies | unit |
| T-15 | XSS via player-controlled text (name, reason) | React escaping; no `dangerouslySetInnerHTML`; reasons ≤140 chars, rendered only to author; CSP header `default-src 'self'` | e2e, unit |
| T-16 | CSRF on state-changing routes | Cookies `SameSite=Lax`; state-changing routes are POST/PUT only with JSON content type (cross-site forms can't send it) and an `Origin` check against the site's own origin | API |
| T-17 | Wrong device clock shows RSVP "open" after close or hides it early | Decisions use server time; client uses a server-corrected clock; the server rejects anyway | e2e, database |
| T-18 | SQL injection | Parameterised queries only (`pg` placeholders); no string-built SQL; functions use typed args | unit (lint rule), API |
| T-19 | Open redirect after sign-in | No `next=` redirect parameter in MVP; always go to `/` | e2e |
| T-20 | Preview deployments writing into production data | One database means previews share it (D-12). Control: preview env uses the same DB, so previews are owner-only (Hobby protection) and the seed/migrations run only from my scripts with the owner's yes | process |
| T-21 | Paused Supabase project during the demo | Owner opens the app the day before; smoke run is part of the release checklist | process |
| T-22 | Direct DB call as a player for a match that is cancelled/past | `rpc_rsvp_set` checks `status='scheduled'` and `now() < cutoff` | database |
| T-23 | Oversized or malformed input | zod strict schemas, `reason ≤ 140`, JSON body limit 8 KB | API |
