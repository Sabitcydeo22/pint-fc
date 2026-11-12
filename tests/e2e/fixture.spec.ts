// Session 14 end-to-end tests: the event page /fixtures/[id] (390 px; one test also at 320 px).
// The e2e database is shared by the whole run and never reset, and a saved RSVP cannot be removed (a player can only
// replace an answer). So counts and lists come from page.route mocks (as in session 07), and the ONE test that really
// writes (AC-3.3.1) makes no assumption about the starting state: it asserts what its own clicks produce.
import { expect, test, type Page, type Route } from '@playwright/test';
import { SMALL_PHONE, signInThroughForm, type Who } from './helpers';

const MATCH = '00000006-0000-4000-8000-000000000100'; // the seeded demo match: it exists, and its cutoff is ~90 min after the server starts
const UNKNOWN = '00000006-0000-4000-8000-0000000009ff';
const PLAYER = (n: number) => `00000001-0000-4000-8000-${String(n).padStart(12, '0')}`;

const SERVER_NOW = '2026-11-14T12:00:00.000Z';
const KICKOFF = '2026-11-14T19:00:00.000Z'; // cutoff 17:00Z

interface MockOptions {
  status?: string;
  rsvpOpen?: boolean;
  serverNow?: string;
  kickoff?: string;
  counts?: { going: number; maybe: number; not_going: number; no_answer: number };
  attendees?: unknown[];
  me?: { answer: string | null; reason: string | null };
}

function body(o: MockOptions = {}) {
  const kickoff = o.kickoff ?? KICKOFF;
  return {
    server_now: o.serverNow ?? SERVER_NOW,
    match: {
      id: MATCH,
      opponent: 'Fake Rovers',
      competition: 'Fake League',
      venue: 'Fake Park',
      kickoff_at: kickoff,
      cutoff_at: new Date(Date.parse(kickoff) - 7200_000).toISOString(),
      status: o.status ?? 'scheduled',
      rsvp_open: o.rsvpOpen ?? true,
    },
    counts: o.counts ?? { going: 2, maybe: 1, not_going: 1, no_answer: 36 },
    attendees: o.attendees ?? [
      { player_id: PLAYER(5), name: 'Fake Alpha', answer: 'going' },
      { player_id: PLAYER(6), name: 'Fake Bravo', answer: 'going' },
      { player_id: PLAYER(7), name: 'Fake Charlie', answer: 'maybe' },
      { player_id: PLAYER(8), name: 'Fake Delta', answer: 'not_going' },
    ],
    me: o.me ?? { answer: null, reason: null },
  };
}

const json = (route: Route, status: number, data: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

/** Signs in through the real form, then answers the attendance GET with `respond` (default: the mock above). */
async function openMocked(page: Page, who: Who, o: MockOptions | ((route: Route) => Promise<void> | void) = {}): Promise<void> {
  await signInThroughForm(page, who);
  await page.route('**/api/fixtures/*/attendance', (route) => (typeof o === 'function' ? o(route) : json(route, 200, body(o))));
  await page.goto(`/fixtures/${MATCH}`);
  await expect(page.getByTestId('page-fixture')).toBeVisible();
}

const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

test('AC-3.3.1 [e2e] player saves Going, Maybe or Not going before cutoff', async ({ page }) => {
  // REAL writes against the shared database (no mocks). Nothing here assumes what 'two' answered before.
  await signInThroughForm(page, 'two');
  await page.goto(`/fixtures/${MATCH}`);
  await expect(page.getByTestId('rsvp-going')).toBeVisible();
  await expect(page.getByTestId('rsvp-status')).toHaveText('Open'); // the demo cutoff is ~90 minutes from the server start

  await page.getByTestId('rsvp-maybe').click();
  await expect(page.getByTestId('rsvp-saved')).toBeVisible();
  for (const [id, pressed] of [['rsvp-going', 'false'], ['rsvp-maybe', 'true'], ['rsvp-not-going', 'false']] as const) {
    await expect(page.getByTestId(id)).toHaveAttribute('aria-pressed', pressed);
  }
  await page.getByTestId('rsvp-reason').fill('Fake: might be late');
  await page.getByTestId('rsvp-not-going').click();
  await expect(page.getByTestId('rsvp-not-going')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('rsvp-saved')).toBeVisible();

  // it persisted: a fresh load shows my answer and my own reason, and I am in the list
  await page.reload();
  await expect(page.getByTestId('rsvp-not-going')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('rsvp-reason')).toHaveValue('Fake: might be late');
  const mine = page.getByTestId('attendee-row').filter({ hasText: 'Not going' });
  await expect(mine.first()).toBeVisible();
  await expect(page.getByTestId('attendees-empty')).toHaveCount(0);
  await noOverflow(page);
});

test('AC-3.4.1 [e2e] event page shows counts and attendance list to signed-in players', async ({ page }) => {
  await openMocked(page, 'one');
  await expect(page.getByTestId('count-going')).toContainText('2');
  await expect(page.getByTestId('count-maybe')).toContainText('1');
  await expect(page.getByTestId('count-not-going')).toContainText('1');
  await expect(page.getByTestId('count-no-answer')).toContainText('36');
  const rows = page.getByTestId('attendee-row');
  await expect(rows).toHaveCount(4);
  // name AND answer as text (colour is never the only signal), grouped: going, maybe, not going
  await expect(rows.nth(0)).toContainText('Fake Alpha');
  await expect(rows.nth(0)).toContainText('Going');
  await expect(rows.nth(2)).toContainText('Fake Charlie');
  await expect(rows.nth(2)).toContainText('Maybe');
  await expect(rows.nth(3)).toContainText('Fake Delta');
  await expect(rows.nth(3)).toContainText('Not going');
  await expect(page.getByTestId('rsvp-status')).toHaveText('Open');
  await expect(page.getByTestId('last-updated')).toContainText(/Updated \d+ s ago/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await noOverflow(page);
  await page.setViewportSize(SMALL_PHONE);
  await noOverflow(page);
});

test("AC-3.4.3 [e2e] teammates' answers are visible without reasons", async ({ page }) => {
  // even if a response wrongly carried reasons, the page must not render anyone else's; it shows only my own reason, in my own box
  const leaky = [
    { player_id: PLAYER(5), name: 'Fake Alpha', answer: 'going', reason: 'Fake canary of Alpha ee11' },
    { player_id: PLAYER(7), name: 'Fake Charlie', answer: 'maybe', reason: 'Fake canary of Charlie ee22' },
  ];
  await openMocked(page, 'one', { attendees: leaky, me: { answer: 'going', reason: 'Fake my own reason' } });
  await expect(page.getByTestId('attendee-row')).toHaveCount(2);
  await expect(page.getByTestId('attendee-row').first()).toContainText('Fake Alpha');
  const text = (await page.getByTestId('page-fixture').innerText()) + (await page.content());
  expect(text.includes('ee11'), "Alpha's reason is on the page").toBe(false);
  expect(text.includes('ee22'), "Charlie's reason is on the page").toBe(false);
  await expect(page.getByTestId('rsvp-reason')).toHaveValue('Fake my own reason');
});

test('FIXTURE-1 [e2e] saving sends only the answer and reason; the reason box has a 140-character counter', async ({ page }) => {
  const sent: unknown[] = [];
  await openMocked(page, 'one');
  await page.route('**/api/fixtures/*/rsvp', async (route) => {
    sent.push(route.request().postDataJSON());
    await json(route, 200, { server_now: SERVER_NOW, match: { id: MATCH, cutoff_at: '2026-11-14T17:00:00.000Z', rsvp_open: true }, me: { answer: 'going', reason: 'Fake note' } });
  });
  await expect(page.getByTestId('rsvp-reason')).toHaveAttribute('maxlength', '140');
  await expect(page.getByTestId('rsvp-reason-counter')).toHaveText('0/140');
  await page.getByTestId('rsvp-reason').fill('Fake note');
  await expect(page.getByTestId('rsvp-reason-counter')).toHaveText('9/140');
  await page.getByTestId('rsvp-going').click();
  await expect(page.getByTestId('rsvp-saved')).toBeVisible();
  expect(sent).toEqual([{ answer: 'going', reason: 'Fake note' }]); // no player id, nothing else
});

test('FIXTURE-2 [e2e] a rejected save shows a message and keeps the old answer', async ({ page }) => {
  await openMocked(page, 'one', { me: { answer: 'maybe', reason: null } });
  await page.route('**/api/fixtures/*/rsvp', (route) => json(route, 409, { error: { code: 'RSVP_CLOSED', message: 'RSVP is closed for this match.', request_id: 'x' } }));
  await page.getByTestId('rsvp-going').click();
  await expect(page.getByTestId('rsvp-error')).toBeVisible();
  await expect(page.getByTestId('rsvp-saved')).toHaveCount(0);
  await expect(page.getByTestId('rsvp-maybe')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('rsvp-going')).toHaveAttribute('aria-pressed', 'false');
});

test('FIXTURE-3 [e2e] closed, cancelled and past matches: buttons disabled or absent', async ({ page }) => {
  await openMocked(page, 'one', { rsvpOpen: false, me: { answer: 'going', reason: null } });
  await expect(page.getByTestId('rsvp-status')).toHaveText('RSVP closed');
  await expect(page.getByTestId('rsvp-closed')).toBeVisible();
  for (const id of ['rsvp-going', 'rsvp-maybe', 'rsvp-not-going']) await expect(page.getByTestId(id)).toBeDisabled();
  await expect(page.getByTestId('rsvp-going')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('match-not-open')).toHaveCount(0);

  await page.unroute('**/api/fixtures/*/attendance');
  await page.route('**/api/fixtures/*/attendance', (route) => json(route, 200, body({ status: 'cancelled', rsvpOpen: false })));
  await page.reload();
  await expect(page.getByTestId('match-not-open')).toBeVisible();
  await expect(page.getByTestId('rsvp-going')).toHaveCount(0);

  await page.unroute('**/api/fixtures/*/attendance');
  await page.route('**/api/fixtures/*/attendance', (route) => json(route, 200, body({ status: 'played', rsvpOpen: false })));
  await page.reload();
  await expect(page.getByTestId('match-not-open')).toBeVisible();
  await expect(page.getByTestId('rsvp-maybe')).toHaveCount(0);
});

test('FIXTURE-4 [e2e] empty list, loading, error with retry, and older data kept after a failed refresh', async ({ page }) => {
  // empty list
  await openMocked(page, 'one', { attendees: [], counts: { going: 0, maybe: 0, not_going: 0, no_answer: 40 } });
  await expect(page.getByTestId('attendees-empty')).toHaveText('Nobody has answered yet');
  await expect(page.getByTestId('attendee-row')).toHaveCount(0);

  // first load fails: an error with a retry, never raw error text; then the retry works
  await page.unroute('**/api/fixtures/*/attendance');
  let fail = true;
  await page.route('**/api/fixtures/*/attendance', (route) => (fail ? json(route, 500, { error: { code: 'INTERNAL', message: 'boom secret detail', request_id: 'x' } }) : json(route, 200, body())));
  await page.reload();
  await expect(page.getByTestId('fixture-error')).toBeVisible();
  await expect(page.getByTestId('fixture-error')).toContainText('Something went wrong. Try again.');
  expect(await page.getByTestId('page-fixture').innerText()).not.toContain('boom secret detail');
  fail = false;
  await page.getByTestId('retry-button').click();
  await expect(page.getByTestId('attendee-row')).toHaveCount(4);
  await expect(page.getByTestId('fixture-error')).toHaveCount(0);

  // a later refresh fails: the last good data stays, with a notice
  fail = true;
  await page.route('**/api/fixtures/*/rsvp', (route) => json(route, 200, { server_now: SERVER_NOW, match: { id: MATCH, cutoff_at: '2026-11-14T17:00:00.000Z', rsvp_open: true }, me: { answer: 'going', reason: null } }));
  await page.getByTestId('rsvp-going').click(); // the save works; the refresh after it fails
  await expect(page.getByTestId('fixture-error')).toBeVisible();
  await expect(page.getByTestId('fixture-error')).toContainText('Showing older data');
  await expect(page.getByTestId('attendee-row')).toHaveCount(4);
});

test('FIXTURE-5 [e2e] an unknown match is the not-found page, with a real 404', async ({ page }) => {
  await signInThroughForm(page, 'one');
  const res = await page.goto(`/fixtures/${UNKNOWN}`);
  expect(res?.status()).toBe(404);
  await expect(page.getByTestId('not-found')).toBeVisible();
  await expect(page.getByTestId('page-fixture')).toHaveCount(0);
  const bad = await page.goto('/fixtures/not-a-uuid');
  expect(bad?.status()).toBe(404);
  await expect(page.getByTestId('not-found')).toBeVisible();
});

test('FIXTURE-6 [e2e] RSVP closes at the server-corrected cutoff without a reload', async ({ page }) => {
  // the phone clock is 4 hours wrong on purpose; the server says it is 3 s before the cutoff
  const DEVICE = '2026-11-14T08:00:00.000Z';
  const serverNow = '2026-11-14T16:59:57.000Z';
  await signInThroughForm(page, 'one');
  await page.clock.install({ time: new Date(DEVICE) });
  await page.clock.pauseAt(new Date(Date.parse(DEVICE) + 1000));
  await page.route('**/api/fixtures/*/attendance', (route) => json(route, 200, body({ serverNow })));
  await page.goto(`/fixtures/${MATCH}`);
  await expect(page.getByTestId('rsvp-status')).toHaveText('Open');
  await expect(page.getByTestId('rsvp-going')).toBeEnabled();
  await page.clock.runFor(2000);
  await expect(page.getByTestId('rsvp-status')).toHaveText('Open');
  await page.clock.runFor(1000); // now == cutoff: closed
  await expect(page.getByTestId('rsvp-status')).toHaveText('RSVP closed');
  await expect(page.getByTestId('rsvp-going')).toBeDisabled();
  await expect(page.getByTestId('last-updated')).toContainText('Updated 3 s ago');
});
