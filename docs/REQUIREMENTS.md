# PINT FC MVP — Requirements

Source: `docs/requirements/PINTFC-MVP-Requirements.pdf` (3 pages, "docs/MVP.md at commit 47b5ac1").
The longer spec (v0.3) is **not** in `docs/requirements/`. So every check below is **derived**: the ID comes from the PDF, the wording is mine. Inside each area the PDF gives only the ID range, not what each number means, so *which behaviour sits under which number is my assignment*. If the owner gets spec v0.3, the wording must be re-matched (see Q1).

Ignored from the PDF, per the owner: the instructor's Vercel team (`cydeo-learners/pintfc`), Supabase project (`pintfc`) and screens file. We deploy to the owner's accounts (Vercel team `sabit-pintfc`, Supabase org `sabit`) and design our own screens. "The owner" = the product owner.

---

## 1. Users

| User | Can do | Cannot do |
|---|---|---|
| **Visitor** (not signed in) | Home page, squad, player profiles (consented fields only) | See any RSVP, count or attendee; see email, phone, date of birth; RSVP |
| **Player** (fake login, 40 of them) | Sign in/out (incl. all devices); set own privacy settings; RSVP Going / Maybe / Not going for the next match before cutoff; see teammates' answers **without reasons** | Edit another player's data or RSVP; RSVP after cutoff; see another player's reason |
| **Admin** | No screens in the MVP. Season data comes from a seed script (fake data only). | — |

## 2. Scope

**In (38 checks):** sign-in and sessions (7), home page (15), squad and profiles (9), Going / Not going (7). Footer content only (crest, name, location, quick links, social icons — no checks).
**Also in, as gates beyond the 38:** AC-5.2 contrast (WCAG AA) and AC-5.4 no horizontal scroll at 320 px. Single look: "Sport", light. Plus the owner's call: event page `/fixtures/[id]` (attendance list and counts; doubles as the class projector view). Live count: page polls every 10 s while visible.

**Out:** admin console, invites, password reset, admin MFA, Google/Apple sign-in (FR-9.x, 1.2–1.5, 1.8, AC-1.1.2); lockout and rate limits (FR-1.7, accepted risk — fake data only); schedule page, calendar feeds, full event detail, waitlists (FR-3.1, 3.2, 3.5, 3.6); moving a kickoff and admin overrides (AC-3.3.3, 3.4.2); leaderboards, full table page, standings sync and manual standings (FR-5.x; mini table reads a seeded snapshot); MOTM, store, news, notifications, email, reminders; newsletter (AC-10.1.x); deletion requests (AC-4.3.5); featured blocks, Instagram; second theme and toggle (AC-5.1), reduced motion (AC-5.3), PWA.

---

## 3. Acceptance checks (all derived)

Convention: "published result" = a result row with `published = true`. "Active player" = not archived. Match "next" = earliest upcoming match that is not cancelled.

### 3.1 Sign-in and sessions (FR-1.1 players, FR-1.6)

- **AC-1.1.1** *(derived)* **Given** an active player with valid email and password, **when** they submit the sign-in form, **then** they are signed in and land on the home page showing their signed-in state.
- **AC-1.1.3** *(derived)* **Given** a valid email, **when** the password is wrong, **then** no session is created and the form shows one generic error ("Email or password is incorrect").
- **AC-1.1.4** *(derived)* **Given** an unknown email or an archived player's email, **when** they try to sign in, **then** no session is created and the error and response time class are the same as AC-1.1.3 (no account enumeration).
- **AC-1.6.1** *(derived)* **Given** a signed-in player, **when** they sign out, **then** this device's session cookie is cleared and a later request to a player-only endpoint returns 401.
- **AC-1.6.2** *(derived)* **Given** a player signed in on two devices, **when** they choose "sign out of all devices" on one, **then** both sessions are rejected on their next request.
- **AC-1.6.3** *(derived)* **Given** no valid session, **when** any player-only endpoint or page (RSVP, privacy settings, attendance list) is requested, **then** the API returns 401 in the standard error format and the page redirects to sign-in.
- **AC-1.6.4** *(derived)* **Given** a player who signed out, **when** they press Back or reload, **then** no private data (RSVP, attendance list, settings) is shown.

### 3.2 Home page (FR-2.1–2.4)

- **AC-2.1.1** *(derived)* **Given** upcoming matches exist, **when** the home page loads, **then** it shows the next non-cancelled match: opponent, competition, venue, kickoff date and time.
- **AC-2.1.2** *(derived)* **Given** a cancelled match is the earliest upcoming one, **when** the home page loads, **then** it is skipped and the next non-cancelled match is shown.
- **AC-2.1.3** *(derived)* **Given** the next match, **when** the page is open, **then** a countdown (days, hours, minutes, seconds) is shown and decreases every second.
- **AC-2.1.4** *(derived)* **Given** kickoff passes while the page is open, **when** the countdown reaches zero, **then** it shows "Kicked off" (or moves to the next match on reload) and never shows negative values.
- **AC-2.1.5** *(derived)* **Given** no upcoming matches, **when** the home page loads, **then** an empty state ("No upcoming matches") replaces the card; no error.
- **AC-2.1.6** *(derived)* **Given** a viewer in any time zone, **when** the kickoff is shown, **then** it is in the club's time zone (`America/New_York`, answered Q2) with the zone label (EST/EDT), and the countdown is computed from the absolute instant (correct across a daylight-saving change).
- **AC-2.2.1** *(derived)* **Given** published league results, **when** the home page loads, **then** the season record shows played, won, drawn, lost, goals for/against, computed from them.
- **AC-2.2.2** *(derived)* **Given** a saved but unpublished result, **when** the record is computed, **then** that result is excluded.
- **AC-2.2.3** *(derived)* **Given** the friendly, **when** the league record is computed, **then** the friendly is excluded.
- **AC-2.2.4** *(derived)* **Given** a season with no published results, **when** the home page loads, **then** the record shows an empty state, not zeros dressed as a result.
- **AC-2.3.1** *(derived)* **Given** published results, **when** the home page loads, **then** the latest 5 show newest first, each with opponent, score, date.
- **AC-2.3.2** *(derived)* **Given** the unpublished result, **when** latest results are shown, **then** it does not appear (in the page or in the API response).
- **AC-2.4.1** *(derived)* **Given** the seeded standings snapshot, **when** the home page loads, **then** the mini table shows teams ordered by position with played, goal difference, points.
- **AC-2.4.2** *(derived)* **Given** the snapshot, **when** the mini table renders, **then** PINT FC's row is visibly highlighted (not by colour alone).
- **AC-2.4.3** *(derived)* **Given** the snapshot, **when** the mini table renders, **then** it states the snapshot date (it is not live).

### 3.3 Squad and profiles (FR-4.1–4.3)

- **AC-4.1.1** *(derived)* **Given** active players, **when** the squad page loads, **then** it lists them grouped by position (GK, DEF, MID, FWD) with name and shirt number.
- **AC-4.1.2** *(derived)* **Given** the archived player, **when** the squad page, a profile URL or the API is requested, **then** they never appear (profile URL returns 404).
- **AC-4.1.3** *(derived)* **Given** a player under 18, **when** the squad is shown to a visitor, **then** they appear only if they have guardian consent **and** have opted in; the two seeded minors prove both sides.
- **AC-4.2.1** *(derived)* **Given** a visible player, **when** a visitor opens the profile, **then** it shows name, position and shirt number.
- **AC-4.2.2** *(derived)* **Given** per-field consents (photo, nationality, stats), **when** a visitor opens the profile, **then** each of those fields appears only if consented; otherwise it is absent from the page and the response.
- **AC-4.3.1** *(derived)* **Given** any public (no-session) response (all pages and APIs), **when** inspected, **then** it contains no email, phone number, date of birth or RSVP data (invariant 1).
- **AC-4.3.2** *(derived)* **Given** a signed-in player, **when** they change a consent setting, **then** the change is saved and the public profile reflects it on the next request.
- **AC-4.3.3** *(derived)* **Given** a minor without guardian consent, **when** they try to opt in to public visibility, **then** it is rejected with a clear error and stays hidden.
- **AC-4.3.4** *(derived)* **Given** a signed-in player, **when** they try to change another player's settings (UI, API, or direct database API), **then** it is rejected and nothing changes.

### 3.4 Going / Not going (FR-3.3, FR-3.4)

- **AC-3.3.1** *(derived)* **Given** a signed-in player and the next match before cutoff, **when** they choose Going, Maybe or Not going, **then** the answer is saved and shown as their current answer.
- **AC-3.3.2** *(derived)* **Given** an existing answer before cutoff, **when** they change it, **then** the new answer replaces it (one answer per player per match).
- **AC-3.3.4** *(derived)* **Given** the cutoff has passed, **when** a player answers or changes (UI, API, or direct database API), **then** it is rejected; the UI shows "RSVP closed" and disables the buttons; the existing answer stays.
- **AC-3.3.5** *(derived)* **Given** the cutoff falls while the page is open, **when** server time reaches it, **then** the page switches to "RSVP closed" without a reload, using server time, not the device clock.
- **AC-3.3.6** *(derived)* **Given** a cancelled or past match, or a player trying to answer *for someone else*, **when** the RSVP is submitted, **then** it is rejected and nothing is stored.
- **AC-3.4.1** *(derived)* **Given** a signed-in player, **when** they open `/fixtures/[id]`, **then** it shows the counts (Going / Maybe / Not going / no answer) and the attendance list.
- **AC-3.4.3** *(derived)* **Given** teammates' answers, **when** a player views the list (page, API, or direct database API), **then** they see each teammate's answer but never a reason; a player sees only their own reason.
- **Live count (cross-cutting, owned by AC-3.4.1's test file as extra tests):** answer by player A shows on player B's open event page within 15 s.

Total: 7 + 15 + 9 + 7 = **38**. ✔ (matches the PDF)

### 3.5 Gates beyond the 38
- **AC-5.2** *(derived)* Every text/background pair on every MVP page meets WCAG AA (4.5:1 normal text, 3:1 large). Automated (axe) on each page.
- **AC-5.4** *(derived)* No horizontal scroll at a 320 px viewport on every MVP page.

---

## 4. Cross-cutting rules

1. **Privacy (invariant 1).** No public response contains email, phone, date of birth or RSVP. Consented fields only. Enforced **in the database first** (see §6), repeated in the API, never only on screen.
2. **RSVP cutoff.** One rule, one function, used by the API, the database and the UI. Compared on **server time**, in UTC instants. Exactly-at-cutoff counts as closed (`now() >= cutoff` → closed). **Cutoff = kickoff − 2 hours** (answered Q3), as an absolute duration on the UTC instant: a 7:00 PM kickoff closes at 5:00 PM club time. Across a daylight-saving change it is still exactly 2 hours of real time, and the displayed times follow New York clock time.
3. **Live count.** Page polls every 10 s while the tab is visible and also on becoming visible. Worst case ≈ 10 s poll + request time, inside 15 s. Hidden tab does not poll.
4. **Seed data.** One script, idempotent, fake only (`@pintfc.test` addresses, placeholder phones/crests). 1 season (league + friendly), opponents, venues; 40 active players (GK/DEF/MID/FWD) with one login each; 2 minors (one with guardian consent + opt-in, one without); mixed photo/nationality/stats consents; 1 archived player; past published results with stat lines; 1 friendly; 1 saved-but-unpublished result; upcoming matches (1 cancelled) and weekly trainings; 1 standings snapshot; 1 demo match whose cutoff falls in class time. **The demo match is seeded relative to the current time** (e.g. `--demo-in 90m` makes kickoff = now + 90 min + 2 h, so the cutoff lands 90 min from now) so the date can be changed later without editing code; the seed is re-runnable to move it.
5. **One error format** for every API error (defined in Phase 2).
6. **Phone first:** 320 px wide, WCAG AA.

## 5. Dependencies between requirements

| Needs first | Then | Why |
|---|---|---|
| Schema + seed (players, matches, results, standings) | all of home, squad, RSVP | every check reads data |
| Time/cutoff rule | AC-2.1.x, AC-3.3.4, AC-3.3.5 | one shared definition |
| Sign-in + session (AC-1.1.1, 1.6.x) | every player check (4.3.2–4.3.4, 3.3.x, 3.4.x) | they need a user |
| Privacy views/policies | AC-4.1.x, 4.2.x, 4.3.1 (and 3.4.3) | public reads go through them |
| Consent fields on players | AC-4.1.3, 4.2.2, 4.3.2–4.3.3 | |
| RSVP table + write rule | AC-3.3.x → AC-3.4.1/3.4.3 | the list reads the answers |
| Event page | live count, AC-3.4.1 | |
| Demo-match seed (relative to now; no fixed class date needed) | live demo of AC-3.3.5 | Q3 answered |
| All pages exist | AC-5.2, AC-5.4 gates; owner screenshots; deploy | |

## 6. Risks and gaps

1. **Time zones / DST.** Store instants as `timestamptz` (UTC). The club zone (Q2) is only for display. Countdown from the absolute instant. Seed dates built with a zone library, never "+2h" arithmetic. Test around New York DST changeovers using frozen clocks: spring forward Sun 14 Mar 2027 (a 2 h cutoff straddling 2:00 AM), and fall back (Sun 1 Nov 2026 has already passed; test it with a fixed past date, and the next is Sun 7 Nov 2027). A kickoff just after a changeover is the case to prove. A viewer in another zone sees the club zone label, not a silent device-zone conversion.
2. **Where privacy is enforced.** Screen-only is not privacy. Supabase publishes the database as a REST API (PostgREST) with a public "anon" key sitting in the browser. Anyone can call it without our app. So: the database must be the primary control (no table grants to `anon`/`authenticated`; public reads through views exposing only consented columns; RSVP via controlled functions). The API repeats the check; the screen only hides.
3. **A signed-in player calling the database API directly could:** read every player's email, phone, date of birth; read others' RSVP reasons; write an RSVP after cutoff or for another player; flip their own `guardian_consent` or role; read archived players; read unpublished results. Each becomes a **database test** in Phase 2 (access matrix → tests). Also: the service-role key must never reach the browser.
4. **Sign-in cookies on Vercel preview URLs.** Each preview has its own hostname, so cookies are host-scoped and sessions do not carry across previews. Password sign-in needs no redirect, so previews can work, but Supabase's redirect allow-list would need a wildcard if we add redirect flows later. Also, on the Hobby plan Vercel's deployment protection may put a Vercel login in front of previews, so **students/the owner cannot just open them**. Plan: test previews as the owner; students use production only.
5. **Plans.** Vercel team `sabit-pintfc` is **Hobby** (non-commercial; short function time limit; once-a-day cron; protected previews by default). Supabase org `sabit` is **Free** (2 active projects; free projects pause after a week of inactivity — the existing project in the org is already `INACTIVE`; 500 MB; built-in email sender is tightly rate-limited, so no email flows). Fine for 40 users. Risk: a paused project mid-demo. Mitigation: open the app the day before the class.
6. **Read-only Supabase token.** It can list, not create. So the owner must create the Supabase project (or give a write-capable token), and supply the project URL, anon key, service-role key and DB password through `.env.local`. Migrations also need the DB password. The existing project in `sabit` is never touched. Nothing is created in Supabase or Vercel without the owner's yes.
7. **No Docker.** `supabase start` (local Supabase) needs Docker, so it is out. What that changes: no local replica of Supabase for database tests. Options (decide in Phase 2; my recommendation first):
   - **A. (Recommended)** Real PostgreSQL 17 as an npm-installed binary (`embedded-postgres`, no installer, no admin rights) with a small stub of Supabase's `auth` schema (`auth.uid()`, `auth.jwt()`, roles `anon`/`authenticated`) so the same migrations and RLS tests run locally. Plus a final smoke run of the same tests against the real Supabase project.
   - B. PGlite (Postgres in WebAssembly): lighter, but extension and role behaviour differs more.
   - C. Test directly against a dedicated Supabase test project: truest, but needs a second project (Free allows 2 active), network, and cleanup.
   - D. Install PostgreSQL natively on Windows: needs an installer and admin rights; I won't do it without asking.
   Cost of A: auth-schema stub could drift from real Supabase, hence the smoke run.
8. **Live count honesty.** Polling means ≤ ~10 s lag plus load; with 40 students on one Free project, fine. Counts must come from one cheap query, not 40 joins.
9. **Passwords for 40 fake logins.** Seed generates them; they go to a gitignored file, never printed or committed. How students receive theirs is Q5.
10. **Spec gap.** No spec v0.3: my check wording could differ from the instructor's hidden tests/rubric. (Q1.)
11. **`npm audit`** reports 38 findings after installing the Supabase and Vercel CLIs (dev-only tooling, not shipped). Not acting without asking.
12. **Clock skew on devices.** The cutoff UI uses server time offsets (AC-3.3.5), so a wrong phone clock cannot show "open" after close.
13. **Photos.** Photo consent exists but no upload is in scope; photos are placeholders. Assumed.

## 7. Questions only the owner can answer

| # | Question | Proposed default |
|---|---|---|
| Q1 | Do you have spec v0.3 / `docs/MVP.md` with the real AC wording? | No; use my derived wording; swap in later. |
| Q2 | The club's time zone? | `Europe/London`. (Needed for display and DST tests.) |
| Q3 | **Date and time of the class demo match, and how long before kickoff is the cutoff?** | Class on a date you give; cutoff = kickoff − 24 h in general; demo match cutoff set 20 min after class start. |
| Q4 | Does a signed-out visitor see counts? | No. Counts are RSVP data; visitors get a "sign in to see who's coming" prompt (keeps invariant 1 simple). |
| Q5 | How do students get their login? | Seed writes `credentials.local.csv` (gitignored, fake `@pintfc.test` emails, random passwords); you hand them out. |
| Q6 | Does an RSVP have an optional reason? (The PDF says teammates see answers "without their reasons".) | Yes: optional text up to 140 chars, visible only to its author. |
| Q7 | Supabase: you create a **new** project (name `pintfc`, region near you) in org `sabit` and give me keys, or give a write token? Existing project untouched either way. | You create it in the dashboard; I give you the exact steps. |
| Q8 | Is "Maybe" counted as coming? | Shown as its own count; not added to Going. |
| Q9 | Latest results: how many? Squad shows all 40 minus hidden ones? | 5 results; all visible players. |
| Q10 | OK to use Option A for database tests (embedded Postgres + smoke run on real Supabase)? | Yes. |

---

## 8. Owner answers (recorded 2026-11-11)

| # | Answer | Effect |
|---|---|---|
| Q1 | No spec v0.3 | All 38 checks stay "derived" (my wording). |
| Q2 | `America/New_York` (club in New Jersey) | Display zone and DST tests use New York; replaces my `Europe/London` default. |
| Q3 | Cutoff = kickoff − 2 h (e.g. 5 PM for a 7 PM kickoff). Demo match date undecided: seed relative to current time | Replaces my "24 h" default. Seed takes an offset from now; no fixed class date. |
| Q4 | Default: visitors see no counts | Sign-in prompt instead of counts. |
| Q5 | Default: gitignored `credentials.local.csv`, owner hands logins out | |
| Q6 | Default: optional reason, max 140 chars, visible only to its author | |
| Q7 | Owner creates the Supabase project in the dashboard; I give exact steps when we reach that point | Nothing created in Supabase by me. |
| Q8 | Default: Maybe is its own count, not added to Going | |
| Q9 | Default: 5 latest results; all visible players in squad | |
| Q10 | Option A (embedded Postgres + auth stub + smoke run on real Supabase). **Ask before every install.** | `embedded-postgres` and every other package/tool needs the owner's yes before I install it. |

Still open: Q3's actual class date (not needed to build; set at seed time).
