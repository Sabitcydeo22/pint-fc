# Screens

Look: **"Sport", light page with a dark navy header and hero** (owner's pick, session 20: white / pale blue-gray page, navy text, ONE bright-blue accent for the single most important action on a page, bold and sporty, no gradients). Our own design, phone first. Design width 320–430 px. Content width: up to 1200 px (session 20d; it was 960 px before) with a grid inside it (owner's answer, session 20). One desktop step at 768 px: home has two columns (next match + record left, results + table right), the event page has two columns, 3 : 2 (details, counts, answers left; attendance right), the squad grid fills the width, the header is wider on one row. Below 768 px nothing changes. Sign-in and settings stay a narrow centred column (`.card-narrow`, 420 px). The DOM order is the reading order on every width. Rules for every page:
- **No horizontal scroll at 320 px** (AC-5.4): fluid widths, `min-width: 0` on flex/grid children, long names wrap/truncate with `overflow-wrap:anywhere`, tables become stacked rows or fit 320 px.
- **WCAG AA contrast** (AC-5.2): tokens below are chosen for ≥ 4.5:1 text; axe runs on every page. Never colour alone (highlighted table row also has a "PINT FC" bold label and a left bar).
- Touch targets ≥ 44 px. Visible focus ring (3 px, `--focus` ≥ 3:1 on the page and on cards; `--focus-on-dark` white on the navy header). Semantic landmarks, one `h1` per page, buttons are `<button>`.
- **People content rule (owner, not negotiable):** no photos, illustrations, icons or stock images of people anywhere. Graphics only: crest, flat jersey shapes, pitch lines, geometric patterns, large type. Player avatars are initials plus shirt number (session 20c).
- **Graphics (session 20c):** the crest is a shield with three bars and a chevron (`components/Crest.tsx`, in the header and footer; the favicon is the same shield, `src/app/icon.svg`). A player is shown by a flat shirt shape with NO body (`components/Jersey.tsx`): the profile avatar has initials and shirt number (`player-avatar`); a player who consented to a photo gets the local file `public/img/placeholder-player.svg` with the number (`player-photo`); the database `photo_url` is never rendered. Squad cards show a small jersey with the number only. CSP `img-src 'self' data:` (no remote images).
- **Small phones (session 20b):** card padding is 12 px below 360 px. In the league table a word of a team name never breaks in the middle (the team column keeps about 110 px at 320 px). The three RSVP answers are full-width rows below 480 px and sit side by side from 480 px, each one line and at least 44 px high.
- **One scale** (session 20a, enforced by `tests/unit/design-tokens.test.ts`): spacing only from the tokens below, type sizes only from the type tokens, two weights, colours only from tokens, the accent only on `.btn-accent`.
- Text is in the club time zone with its label (EST/EDT).

## Tokens (Sport, light page, navy header, session 20a)
Own palette, not taken from any club or brand. Ratios are computed by `tests/unit/design-tokens.test.ts` (WCAG relative luminance).
| Token | Value | Use | Contrast |
|---|---|---|---|
| `--ink` | `#0B1F3A` | body text (navy) | 16.5:1 on white, 14.8:1 on `--surface` |
| `--muted` | `#44546A` | secondary text, "RSVP closed" chip | 7.7:1 on white, 6.9:1 on `--surface` |
| `--primary` | `#0B2A52` | header and footer bar, links, buttons (white text) | 14.3:1 on white; white on it 14.3:1 |
| `--accent` | `#0A5CFF` | the ONE most important action per page (`.btn-accent`; home: "Going / Not going"), white text | 5.3:1 against white and white text on it 5.3:1 |
| `--bg` / `--surface` | `#FFFFFF` / `#EEF3F9` | page / cards | — |
| `--ok` / `--warn` / `--bad` | `#0F6B3A` / `#8A5300` / `#B3261E` | Going / Maybe / Not going and Win / Draw / Loss (always with a text label; status colours, not accent) | ≥ 6.3:1 with white text |
| `--on-fill` | `#FFFFFF` | text on any filled colour | — |
| `--on-dark-muted` | `#C9D6EA` | secondary text on the navy | 9.7:1 on `--primary` |
| `--focus` / `--focus-on-dark` | `#0848C4` / `#FFFFFF` | focus ring on page and cards / on the navy header | 7.7:1 on white, 6.9:1 on `--surface` / 14.3:1 on `--primary` |

Spacing scale (the only values for padding, margin and gap): `--space-1..7` = 4, 8, 12, 16, 24, 32, 48 px. Sections of a page sit in a `.stack` (gap 16); the inside of a card is `.stack-sm` (12) or `.stack-xs` (8).
Type scale: `--text-sm..3xl` = 14, 16, 20, 24, 32, 48 px (`h1` 32, `h2` 24, `h3` 20). Two weights: 400 and 700 (`--weight-regular`, `--weight-bold`).
Font: system UI stack (fast, no download). Base 100% (16 px by default), line height 1.5.

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
