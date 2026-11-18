# Data model and access matrix

Two schemas:
- **`core`**: all base tables. `anon` and `authenticated` have **no** `USAGE` on this schema and no table grants. RLS is enabled on every table anyway (second lock; a mistaken grant still shows nothing).
- **`public`**: the only surface the outside world can reach: views (read) and `rpc_*` functions (write and parameterised read). Functions are `SECURITY DEFINER`, `SET search_path = ''`, and start with `core.require_player()` when they need a player.

PostgREST only exposes `public`. Default privileges are revoked (`ALTER DEFAULT PRIVILEGES … REVOKE`), and each grant is explicit.

## Tables (`core`)

| Table | Columns (all `NOT NULL` unless noted) | Notes |
|---|---|---|
| `seasons` | `id` uuid pk, `name`, `starts_on` date, `ends_on` date, `is_current` bool | exactly one current (partial unique index) |
| `competitions` | `id`, `season_id` → seasons, `name`, `kind` enum(`league`,`friendly`) | |
| `venues` | `id`, `name`, `city` | |
| `teams` | `id`, `name`, `short_name`, `crest_url` (placeholder), `is_us` bool | one `is_us` |
| `players` | `id` uuid pk **= auth user id**, `full_name`, `position` enum(GK,DEF,MID,FWD), `shirt_number` int (unique among active), `status` enum(`active`,`archived`), `email`, `phone` null, `date_of_birth`, `guardian_consent` bool default false, `public_opt_in` bool, `show_photo`, `show_nationality`, `show_stats` bool default false, `photo_url` null, `nationality` null | `email`/`phone`/`date_of_birth` never leave `core` except to the owner's own settings call (own email only; phone/dob never) |
| `matches` | `id`, `season_id`, `competition_id`, `opponent_id` → teams, `venue_id`, `home_away` enum, `kickoff_at` timestamptz, `status` enum(`scheduled`,`cancelled`,`played`) | **no stored cutoff**: `core.rsvp_cutoff(kickoff_at)` = `kickoff_at - interval '2 hours'` |
| `results` | `match_id` pk → matches, `goals_for`, `goals_against`, `published` bool, `published_at` null | unpublished rows are invisible outside `core` |
| `player_match_stats` | `match_id`, `player_id`, `minutes`, `goals`, `assists` (pk match+player) | "stat lines"; shown only if `show_stats` |
| `standings_snapshots` | `id`, `season_id`, `taken_on` date | latest by `taken_on` |
| `standings_rows` | `snapshot_id`, `team_id`, `position`, `played`, `won`, `drawn`, `lost`, `goals_for`, `goals_against`, `points` | |
| `trainings` | `id`, `starts_at`, `venue_id`, `note` | seeded only, no screen |
| `rsvps` | `match_id`, `player_id` → players, `answer` enum(`going`,`maybe`,`not_going`), `reason` text null (≤140), `created_at`, `updated_at` — pk(`match_id`,`player_id`) | one answer per player per match |

Relationships: season 1─* competitions 1─* matches; matches *─1 teams (opponent), *─1 venues; matches 1─0..1 results; matches 1─* rsvps *─1 players; snapshots 1─* rows *─1 teams.

**Public-visibility rule** (`core.is_publicly_visible(player)`): `status='active'` AND `public_opt_in` AND (not a minor OR `guardian_consent`). Minor = under 18 at `now()` in `America/New_York` (computed from `date_of_birth`). A DB constraint rejects `public_opt_in = true` for a minor without `guardian_consent` (AC-4.3.3). Adults default `public_opt_in = true`; minors default `false`.

## Public surface (`public`)

| Object | Kind | Returns | Granted to |
|---|---|---|---|
| `v_next_match` | view | next scheduled match: id, opponent, competition, venue, `kickoff_at`, `cutoff_at`, `server_now` | anon, authenticated |
| `v_season_record` | view | played, won, drawn, lost, gf, ga — league + published only | anon, authenticated |
| `v_latest_results` | view | published league+friendly results, newest first (API limits 5), opponent, score, date | anon, authenticated |
| `v_standings` | view | latest snapshot rows + `taken_on` | anon, authenticated |
| `v_squad` | view | visible players: id, display name, position, shirt number | anon, authenticated |
| `v_player_profile` | view | (the page uses `photo_url` only as "consented and has a picture"; it never renders the value, session 20c) visible players; `photo_url`/`nationality`/stats columns are `CASE WHEN show_x THEN … END` | anon, authenticated |
| `rpc_me()` | fn | own id, name, status | authenticated |
| `rpc_my_settings()` | fn | own consent flags + own email | authenticated |
| `rpc_update_my_settings(…)` | fn | updates **own row only**, only the 4 consent flags | authenticated |
| `rpc_rsvp_set(match_id, answer, reason)` | fn | upsert for `auth.uid()`; enforces active, scheduled, `now() < cutoff` | authenticated |
| `rpc_attendance(match_id)` | fn | counts + list (name, answer; **no reason**), plus caller's own reason, `server_now` | authenticated |
| `rpc_sign_out_all()` | none — done through Auth, not the DB | | |

## Access matrix (becomes database tests)

Legend: R read, W write, — denied (error or zero rows), own = only the caller's row. Roles: `anon` = visitor, `auth` = signed-in player, `owner` = migrations/seed (`postgres`, `service_role`).

| Object | anon | auth | owner |
|---|---|---|---|
| any `core.*` table (select/insert/update/delete) | — | — | R/W |
| schema `core` usage | — | — | yes |
| `public.v_next_match`, `v_season_record`, `v_latest_results`, `v_standings`, `v_squad`, `v_player_profile` | R | R | R |
| those views: write | — | — | — |
| `rpc_me`, `rpc_my_settings` | — | own | — |
| `rpc_update_my_settings` | — | own (4 flags only) | — |
| `rpc_rsvp_set` | — | own, before cutoff | — |
| `rpc_attendance` | — | R (no reasons; own reason) | — |

Row/column expectations the tests also assert:
- no view or function result **ever** contains `email`, `phone`, `date_of_birth` (except `rpc_my_settings` returning the caller's own email) or another player's `reason`;
- archived players, unpublished results and cancelled matches (as "next") never appear;
- a signed-in player cannot change `status`, `guardian_consent`, `shirt_number`, `full_name`, or anyone else's row (AC-4.3.4); `guardian_consent` is owner-only (set by seed/admin; guardians are out of MVP);
- calling any `rpc_*` as `anon` fails; calling with a session that no longer exists in `auth.sessions` fails.

## DB test generation
`tests/db/matrix.test.ts` holds this table as data: `[role, object, operation, expectation]`. One loop runs each. New table or function without a matrix row fails a "every object is in the matrix" test (reads `information_schema`/`pg_proc`).

## Seed
`scripts/seed.mjs` — idempotent, fake only. Counts: 40 active players (GK 4, DEF 14, MID 14, FWD 8), 1 archived, 2 minors (A: guardian consent + opt-in; B: neither), mixed consents; ~8 teams (placeholder crests), 3 venues; league + friendly competitions; 10 past league matches published with stat lines, 1 friendly, 1 saved-unpublished result, 4 upcoming (1 cancelled) + weekly trainings; 1 standings snapshot; 1 demo match: `--demo-cutoff-in 90m` (kickoff = now + 90 min + 2 h). Emails `firstname.lastname@pintfc.test`; phones `+1-555-01xx`. Credentials written to `credentials.local.csv` (gitignored), never printed.
