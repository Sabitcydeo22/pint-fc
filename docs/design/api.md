# API

Base path `/api`. JSON in and out. Every response carries `server_now` (ISO UTC) where time matters. All authenticated responses: `Cache-Control: no-store`. Public GETs: `no-store` as well (data is small; simplicity over caching).

## One error format (every failure, every endpoint)

```json
{ "error": { "code": "RSVP_CLOSED", "message": "RSVP is closed for this match.", "request_id": "a1b2c3" } }
```

| code | HTTP | when |
|---|---|---|
| `VALIDATION` | 400 | bad/unknown field (bodies are strict: extra fields such as `player_id` are rejected) |
| `INVALID_CREDENTIALS` | 401 | wrong password, unknown email, archived player — identical message |
| `UNAUTHENTICATED` | 401 | no or revoked session |
| `FORBIDDEN` | 403 | signed in but not allowed (e.g. archived) |
| `NOT_FOUND` | 404 | unknown id, archived/hidden player (never 403, to avoid leaking existence) |
| `RSVP_CLOSED` | 409 | `now >= cutoff` |
| `MATCH_NOT_OPEN` | 409 | match cancelled, played or past |
| `MINOR_NEEDS_GUARDIAN` | 422 | opt-in without guardian consent |
| `INTERNAL` | 500 | anything else; message is generic, details only in server logs |

`request_id` also goes in the `x-request-id` header. Messages never include SQL, stack, or secrets.

## Auth

| Endpoint | Request | Success | Errors |
|---|---|---|---|
| `POST /api/auth/sign-in` | `{ "email": string, "password": string }` | 200 `{ "player": { "id", "display_name" } }` + session cookies | 400 `VALIDATION`, 401 `INVALID_CREDENTIALS` |
| `POST /api/auth/sign-out` | — | 204, cookies cleared, this session revoked | — (idempotent) |
| `POST /api/auth/sign-out-all` | — | 204, all sessions revoked | 401 `UNAUTHENTICATED` |
| `GET /api/me` | — | 200 `{ "player": { "id", "display_name" } }` | 401 |

Sign-in takes at least ~400 ms for every outcome (equal timing, AC-1.1.4).

## Public data

| Endpoint | Success (200) | Errors |
|---|---|---|
| `GET /api/home` | `{ server_now, next_match: {id, opponent, competition, venue, kickoff_at, cutoff_at, rsvp_open} \| null, record: {played, won, drawn, lost, goals_for, goals_against} \| null, latest_results: [{match_id, opponent, goals_for, goals_against, played_on}] (≤5), standings: { taken_on, rows: [{position, team, is_us, played, goal_difference, points}] } \| null }` | 500 |
| `GET /api/squad` | `{ players: [{ id, name, position, shirt_number }] }` grouped by the client | 500 |
| `GET /api/players/{id}` | `{ player: { id, name, position, shirt_number, photo_url?, nationality?, stats?: {…} } }` — optional keys **absent** unless consented | 404 `NOT_FOUND`, 400 `VALIDATION` (id not a uuid) |

`rsvp_open` on the public next match is a boolean only; no counts, no answers.

## Player-only

| Endpoint | Request | Success | Errors |
|---|---|---|---|
| `GET /api/me/settings` | — | 200 `{ settings: { public_opt_in, show_photo, show_nationality, show_stats, is_minor, guardian_consent, email } }` | 401 |
| `PUT /api/me/settings` | `{ public_opt_in?, show_photo?, show_nationality?, show_stats? }` (booleans, at least one) | 200 `{ settings }` | 400, 401, 422 `MINOR_NEEDS_GUARDIAN` |
| `GET /api/fixtures/{id}/attendance` | — | 200 `{ server_now, match: {id, opponent, competition, venue, kickoff_at, cutoff_at, status, rsvp_open}, counts: {going, maybe, not_going, no_answer}, attendees: [{ player_id, name, answer }], me: { answer \| null, reason \| null } }` | 401, 404, 400 |
| `PUT /api/fixtures/{id}/rsvp` | `{ "answer": "going"\|"maybe"\|"not_going", "reason"?: string ≤140 }` — **no player id: the player is always the session** | 200 same body as attendance | 400, 401, 404, 409 `RSVP_CLOSED`, 409 `MATCH_NOT_OPEN` |

`attendees` never contains `reason`. `no_answer` = active players − answered. Attendees sorted by answer then name.

## Pages vs API
Server pages call the same server functions as the routes, so a page and its endpoint cannot disagree.

## Database mapping (error → code)
Database functions `RAISE` with custom SQLSTATEs: `PF401` → `UNAUTHENTICATED`, `PF404` → `NOT_FOUND`, `PF409` → `RSVP_CLOSED`, `PF410` → `MATCH_NOT_OPEN`, `PF422` → `MINOR_NEEDS_GUARDIAN`. Anything else → `INTERNAL`.
