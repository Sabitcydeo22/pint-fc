# Test map

Levels: **DB** database (embedded Postgres, roles + claims) · **U** unit (Vitest) · **API** route handlers (LocalAuth + embedded Postgres) · **E2E** Playwright (390 px and 320 px). Every title starts with its ID. Files: `tests/db`, `tests/unit`, `tests/api`, `tests/e2e`.

## The 38 checks

| ID | Level(s) | Test title |
|---|---|---|
| AC-1.1.1 | API + E2E | `AC-1.1.1 valid player signs in and lands on home signed in` |
| AC-1.1.3 | API + E2E | `AC-1.1.3 wrong password gives one generic error and no session` |
| AC-1.1.4 | API | `AC-1.1.4 unknown and archived emails get the same error and timing class as a wrong password` |
| AC-1.6.1 | API + E2E | `AC-1.6.1 sign out clears this session and player endpoints return 401` |
| AC-1.6.2 | API + E2E | `AC-1.6.2 sign out of all devices rejects both sessions` |
| AC-1.6.3 | API + E2E | `AC-1.6.3 player-only endpoints return 401 without a session and pages redirect to sign-in` |
| AC-1.6.4 | E2E | `AC-1.6.4 after sign out, back and reload show no private data` |
| AC-2.1.1 | DB + API + E2E | `AC-2.1.1 home shows next non-cancelled match with opponent, venue and kickoff` |
| AC-2.1.2 | DB | `AC-2.1.2 cancelled earliest match is skipped as next match` |
| AC-2.1.3 | U + E2E | `AC-2.1.3 countdown ticks down every second` |
| AC-2.1.4 | U + E2E | `AC-2.1.4 countdown at kickoff shows Kicked off and never goes negative` |
| AC-2.1.5 | API + E2E | `AC-2.1.5 no upcoming matches shows the empty state` |
| AC-2.1.6 | U | `AC-2.1.6 kickoff is shown in America/New_York with zone label across DST changes` |
| AC-2.2.1 | DB + API | `AC-2.2.1 season record is computed from published league results` |
| AC-2.2.2 | DB | `AC-2.2.2 unpublished result is excluded from the record` |
| AC-2.2.3 | DB | `AC-2.2.3 friendly is excluded from the league record` |
| AC-2.2.4 | API + E2E | `AC-2.2.4 no published results shows the record empty state` |
| AC-2.3.1 | DB + API | `AC-2.3.1 latest five published results appear newest first` |
| AC-2.3.2 | DB + API | `AC-2.3.2 unpublished result never appears in latest results` |
| AC-2.4.1 | DB + E2E | `AC-2.4.1 mini table shows snapshot rows in position order` |
| AC-2.4.2 | E2E | `AC-2.4.2 PINT FC row is highlighted with label and bar, not colour alone` |
| AC-2.4.3 | E2E | `AC-2.4.3 mini table shows the snapshot date` |
| AC-4.1.1 | DB + API + E2E | `AC-4.1.1 squad lists active visible players grouped by position` |
| AC-4.1.2 | DB + API + E2E | `AC-4.1.2 archived player never appears and their profile is 404` |
| AC-4.1.3 | DB + API | `AC-4.1.3 minor appears only with guardian consent and opt-in` |
| AC-4.2.1 | API + E2E | `AC-4.2.1 profile shows name, position and number` |
| AC-4.2.2 | DB + API + E2E | `AC-4.2.2 photo, nationality and stats appear only when consented` |
| AC-4.3.1 | DB + API + E2E | `AC-4.3.1 no public response contains email, phone, date of birth or RSVP` |
| AC-4.3.2 | API + E2E | `AC-4.3.2 changing a consent is saved and reflected publicly on next request` |
| AC-4.3.3 | DB + API | `AC-4.3.3 minor without guardian consent cannot opt in` |
| AC-4.3.4 | DB + API | `AC-4.3.4 player cannot change another player's settings` |
| AC-3.3.1 | DB + API + E2E | `AC-3.3.1 player saves Going, Maybe or Not going before cutoff` |
| AC-3.3.2 | DB + API | `AC-3.3.2 changing an answer before cutoff replaces it` |
| AC-3.3.4 | DB + API + E2E | `AC-3.3.4 answers after cutoff are rejected and the UI shows RSVP closed` |
| AC-3.3.5 | U + E2E | `AC-3.3.5 page switches to RSVP closed at server cutoff without reload` |
| AC-3.3.6 | DB + API | `AC-3.3.6 cancelled or past match and answering for someone else are rejected` |
| AC-3.4.1 | DB + API + E2E | `AC-3.4.1 event page shows counts and attendance list to signed-in players` |
| AC-3.4.3 | DB + API + E2E | `AC-3.4.3 teammates' answers are visible without reasons` |

Counted: 7 + 15 + 9 + 7 = **38**.

## Gates and cross-cutting
| ID | Level | Test title |
|---|---|---|
| AC-5.2 | E2E (axe) | `AC-5.2 every page meets WCAG AA contrast` (one per page × state) |
| AC-5.4 | E2E | `AC-5.4 no horizontal scroll at 320 px` (one per page) |
| LIVE-1 | E2E | `LIVE-1 an answer by player A shows on player B's open event page within 15 seconds` |
| RULE-1 | U + DB | `RULE-1 TypeScript and SQL cutoff agree on every case (parity)` |
| RULE-2 | U | `RULE-2 DST: cutoff and display around 14 Mar 2027, 7 Nov 2027 and 1 Nov 2026` |
| RULE-3 | U | `RULE-3 cutoff boundary: closed at exactly kickoff minus 2 h, open 1 ms before` |
| SEED-1 | DB | `SEED-1 seed yields the specified counts and is idempotent` |
| SEED-2 | DB | `SEED-2 demo match cutoff is relative to now and re-runnable` |
| MATRIX-1 | DB | `MATRIX-1 every role × object × operation in the access matrix behaves as listed` |
| MATRIX-2 | DB | `MATRIX-2 every table, view and function appears in the matrix` |

## Threat tests (title starts with the threat ID)
| Threat | Level | Title |
|---|---|---|
| T-01 | DB (+smoke) | `T-01 anon cannot read any core table` |
| T-02 | DB | `T-02 no view or function exposes email, phone or date of birth to others` |
| T-03 | DB | `T-03 direct rpc_rsvp_set after cutoff is rejected` |
| T-04 | DB + API | `T-04 cannot write an RSVP for another player` |
| T-05 | DB + API | `T-05 other players' reasons are never returned` |
| T-06 | DB + API | `T-06 player cannot change status, guardian consent or number` |
| T-07 | API + smoke | `T-07 revoked session token is rejected by API and database` |
| T-08 | API | `T-08 sign-in errors and timing do not reveal accounts` |
| T-10 | API + E2E | `T-10 hidden and archived players return an identical 404` |
| T-11 | DB | `T-11 unpublished results and cancelled matches never leak` |
| T-12 | API + E2E | `T-12 visitor never receives RSVP data` |
| T-13 | U | `T-13 client bundle contains no service key or database URL` |
| T-14 | U | `T-14 secret scanner finds no token patterns in tracked files` |
| T-15 | E2E | `T-15 script in a player name or reason is rendered as text` |
| T-16 | API | `T-16 state-changing routes reject cross-origin and non-JSON requests` |
| T-17 | E2E | `T-17 wrong device clock does not change RSVP open/closed` |
| T-18 | U | `T-18 no string-built SQL in src` |
| T-19 | E2E | `T-19 sign-in ignores redirect parameters` |
| T-22 | DB | `T-22 rpc_rsvp_set rejects cancelled and past matches` |
| T-23 | API | `T-23 oversized or unknown fields are rejected` |

## Design tests (session 20, not acceptance checks; no owner in the check → session table)
| Group | Level | Title |
|---|---|---|
| DESIGN-1 | U | `DESIGN-1 [unit] the spacing tokens are exactly 4, 8, 12, 16, 24, 32, 48 px` · `DESIGN-1 [unit] padding, margin and gap use only var(--space-N), 0 or auto (no one-off values)` |
| DESIGN-2 | U | `DESIGN-2 [unit] exactly two weights (400, 700) and the type scale …` · every font-weight is a weight token · every font-size is a type token |
| DESIGN-3 | U | `DESIGN-3 [unit] no hex, rgb() or named colour outside the :root token block` · every colour token is a 6-digit hex |
| DESIGN-4 | U | `DESIGN-4 [unit] text <fg> on <bg> is at least <n>:1` (one test per token pair) · the accent fill is at least 3:1 on the page |
| DESIGN-5 | U | `DESIGN-5 [unit] --focus is at least 3:1 …` · `:focus-visible draws a 3 px outline from the focus tokens` |
| DESIGN-6 | U | `DESIGN-6 [unit] the accent colour is used by .btn-accent only, and only NextMatch asks for it` |
| DESIGN-7 | E2E | `DESIGN-7 [e2e] one 16 px gap between the sections of <home\|fixture\|squad\|player> at <320\|390\|768\|1280> px` |
| DESIGN-8 | E2E | `DESIGN-8 [e2e] the accent colour is on exactly one element of the home page: the action` |
| DESIGN-9 | E2E | `DESIGN-9 [e2e] the focus ring is 3 px and comes from the focus tokens` |
| DESIGN-10 | U | `DESIGN-10 [unit] <file> has no inline style attribute` (the six 20b files) · `the settings page does not nest a second .page inside the layout .page` |
| L-1 … L-5 | E2E | `L-1 league table team names never break inside a word at <w> px` · `L-2 answer buttons are one line, 44 px high, and stacked below 480 px` · `L-3 no horizontal scroll: <page> at <w> px` · `L-4 every button, link and checkbox row is at least 44 px: <page> at <w> px` · `L-5 card padding is 12 px below 360 px, 16 px from 360 px; sign-in keeps the narrow card` (`tests/e2e/layout-matrix.spec.ts`, widths 320, 390, 768, 1280) |
| ASSET-1 … 4 | U | `ASSET-1 [unit] <svg file> exists, starts with <svg>, has a viewBox and a <title>` · `ASSET-2 … uses only plain shapes (no bitmap, text, script, handler, style sheet or outside URL)` · `ASSET-3 … every colour is a design token` · `ASSET-4 [unit] public/ and src/ hold no bitmap file` · `public/ holds only .svg files under img/` · `src/ has no <img>, next/image or image URL except the one local profile image` · `the profile page never renders the database photo_url` |
| ASSET-5 … 9 | E2E | `ASSET-5 /img/<file> is served as an SVG … and it is cacheable` · `the favicon is the crest SVG` · `ASSET-6 a consented player shows the local jersey image …` · `a player who did not consent shows the initials avatar …` · `ASSET-7 pages load no image from another site, no image answers an error, and every <img> is a local SVG` · `ASSET-8 the squad badge is a jersey with the shirt number, and the header and footer show the crest SVG` · `ASSET-9 the number and initials on the jersey are readable (≥ 4.5:1)` (`tests/e2e/assets.spec.ts`; it also writes PNG renders to `screenshots/`) |
| INITIALS-1 | U | `INITIALS-1 [unit] <case> gives <initials>` (13 cases, letters only, never markup) |
| CSP-1 / CSP-4 | U | `CSP-1 … img-src is exactly 'self' data:` (session 20c) · `CSP-4 [unit] the middleware matcher skips the image folder and the favicon, but still covers the pages` |
| D-1 | U | `D-1 [unit] the page width token is 1200px` · `.card has no max-width; .card-narrow keeps 420px` · `home and fixture columns exist only from 768px: home two equal columns, event page 3 : 2` · `below 768px the column wrappers add no box (display: contents)` (session 20d) |
| D-2 … D-10 | E2E | `tests/e2e/desktop-layout.spec.ts` (session 20d): `D-2` page up to 1200 px and a card wider than 420 px · `D-3` home two columns from 768 px, one below, DOM order unchanged · `D-4` event page the same · `D-5` squad at least 4 per row at 1280, one at 320 · `D-6` header wider, one row, edges line up with content and footer · `D-7` regression guard: sign-in keeps the narrow card · `D-7b` settings is narrow and centred · `D-8` regression guard: cards at 320/390 are centred and inside the padding · `D-9` 1440 px: page, header and footer 1100–1200 px and centred · `D-10` axe colour contrast at 1280 px. `DESIGN-7` now measures the gap per column (one 16 px gap inside each column and between the h1 and the grid) and checks the number of columns (2 from 768 px on home and fixture, otherwise 0). |
Session 20a's file list for the unit guards is the `TSX_FILES` array in `tests/unit/design-tokens.test.ts`; later design sessions extend it.

## Smoke (needs the real Supabase project; owner's yes first)
`SMOKE-1` real sign-in and sign-out-all · `SMOKE-2` `/rest/v1/` with anon key lists only allowed views and functions · `SMOKE-3` RSVP round trip with a test player · `SMOKE-4` `core` unreachable from REST.
