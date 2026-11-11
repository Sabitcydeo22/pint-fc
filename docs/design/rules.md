# Shared rules (every feature must call these — never re-implement)

Each rule has one TypeScript module and, where the database needs it, one SQL mirror. A **parity test** runs the same table of cases through both and demands identical answers.

## 1. Time and cutoff — `src/lib/time.ts`  ↔  `core.rsvp_cutoff`, `core.rsvp_is_open`
- `CLUB_TZ = 'America/New_York'` (only place this string appears).
- All instants are UTC (`timestamptz` in the database, ISO `Z` strings in JSON).
- `rsvpCutoff(kickoff) = kickoff − 2 h` (exact milliseconds; no calendar arithmetic).
- `isRsvpOpen({ now, kickoff, status }) = status === 'scheduled' && now < cutoff`. At `now == cutoff` → **closed**.
- `now` always comes from the **server** (database `now()` / `server_now`). The browser keeps `offset = server_now − Date.now()` from each response and uses `Date.now() + offset` for the countdown and the "RSVP closed" switch. The browser clock is never trusted for decisions.
- `formatKickoff(instant)` → club-zone text with zone label ("Sat 14 Nov, 7:00 PM EST"), via `Intl.DateTimeFormat` with `timeZone: CLUB_TZ`.
- `countdown(now, kickoff)` → `{days,hours,minutes,seconds}` clamped at 0, or `kickedOff`.
- Tests: fixed clocks around 14 Mar 2027 (spring forward), 7 Nov 2027 (fall back), 1 Nov 2026, boundary ±1 ms at cutoff.

## 2. Permissions — `src/lib/permissions.ts`  ↔  grants + `core.require_player()`
- `can(actor, action, resource)` is a pure function over: `actor = visitor | player(id)`; actions = `read_public`, `read_attendance`, `rsvp`, `edit_settings`.
- Rules: only a player may `read_attendance`, `rsvp` and `edit_settings`; a player may `rsvp`/`edit_settings` only as themselves; archived players may do nothing.
- Used by route handlers before the DB call (fast, friendly error). The database enforces the same rules on its own (grants, `require_player()`, `auth.uid()`), so the API check is a convenience, not the lock.
- `core.require_player()`: session claims present, `sub` is an `active` player, and the claims' `session_id` exists in `auth.sessions`; otherwise raises `PF401`.

## 3. Privacy — `src/lib/privacy.ts` (types) ↔ views
- Public DTO types contain no `email`, `phone`, `date_of_birth`, `reason`, `rsvp`. A test compiles fixtures against them and a runtime scanner (`assertNoPii(json)`) checks every public response body for emails, phone patterns, ISO birth dates and the words `rsvp`/`answer`.
- `assertNoPii` is called in every API test and in the Playwright public-page crawl (AC-4.3.1).

## 4. Errors — `src/lib/errors.ts`
- `class AppError(code, httpStatus, message)` with the closed list in api.md.
- `toErrorResponse(err, requestId)` is the only way a route returns a failure. Unknown errors become `INTERNAL` with a generic message; details go to server logs without secrets.
- `mapDbError(pgError)` maps SQLSTATEs `PF401/404/409/410/422` to codes.
- Routes are wrapped by `withApi(handler)` which does request id, error mapping, `no-store`, JSON content type.

## 5. Validation — `src/lib/schemas.ts`
- One strict zod schema per request (`.strict()`), shared with tests.

## 6. Logging — `src/lib/log.ts`
- Structured, never logs request bodies, cookies, tokens, emails or passwords (a test greps logs from a failed sign-in).

## 7. Server clock offset (client) — `src/lib/clock.ts`
- `createServerClock(server_now)`; `.now()` returns server-corrected time. Used by countdown, RSVP buttons, poller.

## 8. Polling — `src/lib/poll.ts`
- Every 10 s while `document.visibilityState === 'visible'`; refetch on becoming visible; pause when hidden; back off to 20 s after an error (still < 15 s window in normal operation). Interval injected for tests.
