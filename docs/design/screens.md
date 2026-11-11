# Screens

Look: **"Sport", light, single theme** (owner's pick). Our own design, phone first. Design width 320–430 px; at ≥ 768 px the content centres at max 960 px. Rules for every page:
- **No horizontal scroll at 320 px** (AC-5.4): fluid widths, `min-width: 0` on flex/grid children, long names wrap/truncate with `overflow-wrap:anywhere`, tables become stacked rows or fit 320 px.
- **WCAG AA contrast** (AC-5.2): tokens below are chosen for ≥ 4.5:1 text; axe runs on every page. Never colour alone (highlighted table row also has a "PINT FC" bold label and a left bar).
- Touch targets ≥ 44 px. Visible focus ring (3 px, `#C8410B` on white ≥ 3:1). Semantic landmarks, one `h1` per page, buttons are `<button>`.
- Text is in the club time zone with its label (EST/EDT).

## Tokens (Sport, light)
| Token | Value | Use | Contrast on white |
|---|---|---|---|
| `--ink` | `#0B1B2B` | body text | ~17:1 |
| `--muted` | `#4A5A6B` | secondary text | ~7:1 |
| `--primary` | `#0B3A75` | header, links, buttons (white text) | ~11:1 |
| `--accent` | `#C8410B` | highlights, focus, "closing soon" | ~5:1 |
| `--bg` / `--surface` | `#FFFFFF` / `#F1F5FA` | page / cards | — |
| `--ok` / `--warn` / `--bad` | `#0F6B3A` / `#8A5300` / `#B3261E` | Going / Maybe / Not going (each also has a label and icon) | ≥ 5:1 |
Font: system UI stack (fast, no download). Base 16 px, line height 1.5.

## Shared chrome
- **Header** (`data-testid="site-header"`): crest placeholder, "PINT FC", nav links Home · Squad, and either `sign-in-link` or `account-menu` (name, My settings, `sign-out-button`, `sign-out-all-button`). Collapses to a menu button below 480 px (`nav-toggle`).
- **Footer** (`site-footer`): crest, name, location ("New Jersey, USA"), quick links, social icons (placeholders, link to `#`, labelled).

## Pages and states

Common states: **loading** (skeleton blocks, `aria-busy`), **error** (message "Something went wrong. Try again." + `retry-button`, never raw error text), **empty** (per section).

### `/` Home — `page-home`
Sections (each has loading/empty/error independently):
1. **Next match** `next-match-card`: opponent, competition, venue, kickoff (`next-match-kickoff`), countdown `countdown` (+ `countdown-d/h/m/s`), cutoff line "RSVP closes Sat 5:00 PM EST" `rsvp-cutoff`, status chip `rsvp-status` (Open / RSVP closed). Link `go-to-event` → `/fixtures/[id]` (labelled "Going / Not going"). Empty: `next-match-empty` "No upcoming matches". After kickoff: "Kicked off".
2. **Season record** `season-record`: W D L, GF, GA, played. Empty `season-record-empty` ("No results yet").
3. **Latest results** `latest-results` (rows `result-row`, 5 max, newest first). Empty `results-empty`.
4. **League table (mini)** `mini-table` rows `table-row`, our row `table-row-us` with "PINT FC" bold + bar, caption `table-snapshot-date` ("As of …"). Empty `table-empty`.
Signed out and signed in look the same; signed-in shows a "Going / Not going" shortcut. No counts or names for visitors (Q4).

### `/squad` — `page-squad`
Grouped by position headings (Goalkeepers, Defenders, Midfielders, Forwards): `squad-group-GK` etc.; each player a link card `squad-player` (name, number). Empty: `squad-empty`. Error: retry. Archived/hidden players never present.

### `/players/[id]` — `page-player`
`player-name`, `player-position`, `player-number`; `player-photo` / `player-nationality` / `player-stats` **only when consented** (absent from DOM otherwise). Not found or hidden: `not-found` (same page for both). Back link to squad.

### `/sign-in` — `page-sign-in`
Form: `email-input`, `password-input`, `sign-in-button`. States: idle, submitting (button disabled, `aria-busy`), error `sign-in-error` ("Email or password is incorrect", `role="alert"`), already signed in → redirect `/`. No sign-up, no reset link (out of scope), small note "Players only".

### `/settings` — `page-settings` (players only)
Signed out → redirect `/sign-in`. Toggles with labels: `toggle-public` ("Show me on the public squad"), `toggle-photo`, `toggle-nationality`, `toggle-stats`; `settings-saved` confirmation (`role="status"`); minor without guardian consent: `toggle-public` disabled with explanation `minor-note`; server rejection shows `settings-error`. Shows own email read-only (`my-email`). Buttons `sign-out-button`, `sign-out-all-button` with confirmation text.

### `/fixtures/[id]` — `page-fixture` (also the class projector view)
- Signed out: match header (opponent, kickoff) and `signin-prompt` "Sign in to see who's coming". No counts, no names.
- Signed in: match header; `rsvp-status` (Open / `rsvp-closed`); counts `count-going`, `count-maybe`, `count-not-going`, `count-no-answer`; my answer buttons `rsvp-going`, `rsvp-maybe`, `rsvp-not-going` (`aria-pressed`, disabled when closed), optional `rsvp-reason` (≤140, counter) ; `rsvp-saved` status; attendance list `attendee-row` (name + answer chip with text), grouped by answer; `last-updated` ("Updated 7 s ago").
- States: loading skeleton; error `fixture-error` with retry (keeps last good data visible, shows "Showing older data"); cancelled/past match: `match-not-open` banner, buttons absent; unknown id: `not-found`; empty list `attendees-empty` ("Nobody has answered yet").
- Polls every 10 s while visible. "RSVP closed" appears at server-corrected cutoff without reload.
- Projector mode: layout scales up at ≥ 1200 px (larger counts).

### `/404` — `not-found` (also used for hidden players); `/error` generic `error-page`.

## Screenshots for the owner
Phase gate: Playwright captures every page × state at 390 px and 320 px into `screenshots/` (gitignored, not deleted) for the owner's review before any deploy.
