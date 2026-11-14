// Session 15 end-to-end tests: live behaviour of the event page /fixtures/[id] (10-second polling, "RSVP closed" at the
// server cutoff, wrong device clocks). Time is controlled with page.clock (install + pauseAt + runFor); the server's
// answers come from page.route mocks, except LIVE-1 which uses two real signed-in browser contexts.
// The e2e database is shared and a saved RSVP cannot be removed, so LIVE-1 asserts only what its own click changes.
import { expect, test, type Page, type Route } from '@playwright/test';
import { signInThroughForm, type Who } from './helpers';

const MATCH = '00000006-0000-4000-8000-000000000100'; // the seeded demo match (open for ~90 minutes after the server starts)
const PLAYER = (n: number) => `00000001-0000-4000-8000-${String(n).padStart(12, '0')}`;

const DEVICE = '2026-11-14T08:00:00.000Z'; // a phone clock that is 8 hours wrong on purpose
const KICKOFF = '2026-11-14T19:00:00.000Z'; // cutoff 17:00Z
const T_MINUS_3 = '2026-11-14T16:59:57.000Z'; // server time: 3 s before the cutoff

interface MockOptions {
  serverNow: string;
  rsvpOpen: boolean;
  attendees?: unknown[];
  counts?: { going: number; maybe: number; not_going: number; no_answer: number };
  me?: { answer: string | null; reason: string | null };
}

function body(o: MockOptions) {
  return {
    server_now: o.serverNow,
    match: {
      id: MATCH,
      opponent: 'Fake Rovers',
      competition: 'Fake League',
      venue: 'Fake Park',
      kickoff_at: KICKOFF,
      cutoff_at: new Date(Date.parse(KICKOFF) - 7200_000).toISOString(),
      status: 'scheduled',
      rsvp_open: o.rsvpOpen,
    },
    counts: o.counts ?? { going: 1, maybe: 0, not_going: 0, no_answer: 39 },
    attendees: o.attendees ?? [{ player_id: PLAYER(5), name: 'Fake Alpha', answer: 'going' }],
    me: o.me ?? { answer: null, reason: null },
  };
}

const json = (route: Route, status: number, data: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

/** Signs in, freezes the device clock (wrong on purpose), answers every attendance GET with `respond(n)` (n = 1, 2, ...). */
async function openLive(page: Page, who: Who, respond: (n: number, route: Route) => Promise<void> | void): Promise<{ calls: () => number }> {
  let n = 0;
  await signInThroughForm(page, who);
  await page.clock.install({ time: new Date(DEVICE) });
  await page.clock.pauseAt(new Date(Date.parse(DEVICE) + 1000));
  await page.route('**/api/fixtures/*/attendance', (route) => {
    n += 1;
    return respond(n, route);
  });
  await page.goto(`/fixtures/${MATCH}`);
  await expect(page.getByTestId('page-fixture')).toBeVisible();
  return { calls: () => n };
}

test('AC-3.3.4 [e2e] answers after cutoff are rejected and the UI shows RSVP closed', async ({ page }) => {
  // The page still thinks RSVP is open (3 s before the cutoff); the server has passed it by the time the player taps.
  const sent: unknown[] = [];
  await openLive(page, 'one', (n, route) =>
    n === 1
      ? json(route, 200, body({ serverNow: T_MINUS_3, rsvpOpen: true, me: { answer: 'maybe', reason: null } }))
      : json(route, 200, body({ serverNow: '2026-11-14T17:00:01.000Z', rsvpOpen: false, me: { answer: 'maybe', reason: null } })),
  );
  await page.route('**/api/fixtures/*/rsvp', async (route) => {
    sent.push(route.request().postDataJSON());
    await json(route, 409, { error: { code: 'RSVP_CLOSED', message: 'RSVP is closed for this match.', request_id: 'x' } });
  });
  await expect(page.getByTestId('rsvp-status')).toHaveText('Open');
  await page.getByTestId('rsvp-going').click();

  expect(sent).toEqual([{ answer: 'going' }]); // the page did try, and the server said no
  await expect(page.getByTestId('rsvp-error')).toContainText('closed');
  await expect(page.getByTestId('rsvp-saved')).toHaveCount(0);
  await expect(page.getByTestId('rsvp-status')).toHaveText('RSVP closed');
  await expect(page.getByTestId('rsvp-closed')).toBeVisible();
  for (const id of ['rsvp-going', 'rsvp-maybe', 'rsvp-not-going']) await expect(page.getByTestId(id)).toBeDisabled();
  await expect(page.getByTestId('rsvp-maybe')).toHaveAttribute('aria-pressed', 'true'); // the existing answer stays
  await expect(page.getByTestId('rsvp-going')).toHaveAttribute('aria-pressed', 'false');
});

test('AC-3.3.5 [e2e] page switches to RSVP closed at server cutoff without reload', async ({ page }) => {
  // Opens 3 s before the server cutoff. The page polls every 10 s: the poll after the cutoff says closed and brings new data.
  const { calls } = await openLive(page, 'one', (n, route) =>
    n === 1
      ? json(route, 200, body({ serverNow: T_MINUS_3, rsvpOpen: true }))
      : json(
          route,
          200,
          body({
            serverNow: '2026-11-14T17:00:08.000Z',
            rsvpOpen: false,
            counts: { going: 2, maybe: 0, not_going: 0, no_answer: 38 },
            attendees: [
              { player_id: PLAYER(5), name: 'Fake Alpha', answer: 'going' },
              { player_id: PLAYER(6), name: 'Fake Bravo', answer: 'going' },
            ],
          }),
        ),
  );
  await expect(page.getByTestId('rsvp-status')).toHaveText('Open');
  await expect(page.getByTestId('rsvp-going')).toBeEnabled();
  expect(calls()).toBe(1);

  await page.clock.runFor(10_000); // one full polling interval (and the cutoff falls inside it)
  await expect.poll(() => calls(), { message: 'the page polled again after 10 s' }).toBe(2);
  await expect(page.getByTestId('attendee-row')).toHaveCount(2); // the polled data is on screen (no reload)
  await expect(page.getByTestId('rsvp-status')).toHaveText('RSVP closed');
  await expect(page.getByTestId('rsvp-closed')).toBeVisible();
  for (const id of ['rsvp-going', 'rsvp-maybe', 'rsvp-not-going']) await expect(page.getByTestId(id)).toBeDisabled();
  await expect(page.getByTestId('last-updated')).toContainText('Updated 0 s ago');
});

test("LIVE-1 [e2e] an answer by player A shows on player B's open event page within 15 seconds", async ({ browser }) => {
  // Real server, real database, two real signed-in browser contexts (no mocks, real time).
  const a = await browser.newContext();
  const b = await browser.newContext();
  try {
    const pageA = await a.newPage();
    const pageB = await b.newPage();
    await signInThroughForm(pageA, 'one');
    await signInThroughForm(pageB, 'two');
    await pageA.goto(`/fixtures/${MATCH}`);
    await pageB.goto(`/fixtures/${MATCH}`);
    await expect(pageA.getByTestId('rsvp-going')).toBeEnabled();
    await expect(pageB.getByTestId('count-going')).toBeVisible();

    // A changes the answer to one A does not have yet, so the change is real whatever earlier runs left behind.
    const wasGoing = (await pageA.getByTestId('rsvp-going').getAttribute('aria-pressed')) === 'true';
    const [next, countId] = wasGoing ? (['rsvp-maybe', 'count-maybe'] as const) : (['rsvp-going', 'count-going'] as const);
    const numberIn = async (id: string) => Number(((await pageB.getByTestId(id).innerText()).match(/\d+/) ?? ['-1'])[0]);
    const before = await numberIn(countId);
    expect(before).toBeGreaterThanOrEqual(0);

    await pageA.getByTestId(next).click();
    await expect(pageA.getByTestId('rsvp-saved')).toBeVisible();

    // B does nothing: no reload, no click. The poll must bring the new count within 15 s.
    await expect.poll(() => numberIn(countId), { timeout: 15_000, message: "B's page shows A's new answer" }).toBe(before + 1);
  } finally {
    await a.close();
    await b.close();
  }
});

test('T-17 [e2e] wrong device clock does not change RSVP open/closed', async ({ page }) => {
  // The device clock (08:00Z) is far BEHIND the server, then the test repeats with a clock far AHEAD (after kickoff).
  // The server says open, the server says closed; the page follows the server, also after a poll.
  const open = body({ serverNow: '2026-11-14T12:00:00.000Z', rsvpOpen: true });
  const closed = body({ serverNow: '2026-11-14T18:00:00.000Z', rsvpOpen: false });
  const { calls } = await openLive(page, 'one', (n, route) => json(route, 200, n === 1 ? open : closed));
  await expect(page.getByTestId('rsvp-status')).toHaveText('Open'); // device says 08:00Z, server says 12:00Z: open
  await expect(page.getByTestId('rsvp-going')).toBeEnabled();
  await page.clock.runFor(10_000);
  await expect.poll(() => calls()).toBe(2);
  await expect(page.getByTestId('rsvp-status')).toHaveText('RSVP closed'); // the server's poll after the cutoff wins
  await expect(page.getByTestId('rsvp-going')).toBeDisabled();

  // Device clock 12 hours AHEAD of the server (after kickoff on the device) while the server says open.
  const ahead = await page.context().newPage();
  await ahead.clock.install({ time: new Date('2026-11-15T07:00:00.000Z') });
  await ahead.clock.pauseAt(new Date('2026-11-15T07:00:01.000Z'));
  let m = 0;
  await ahead.route('**/api/fixtures/*/attendance', (route) => {
    m += 1;
    return json(route, 200, open);
  });
  await ahead.goto(`/fixtures/${MATCH}`);
  await expect(ahead.getByTestId('rsvp-status')).toHaveText('Open'); // not "closed" or "kicked off" because the phone says so
  await expect(ahead.getByTestId('match-not-open')).toHaveCount(0);
  await expect(ahead.getByTestId('rsvp-going')).toBeEnabled();
  await ahead.clock.runFor(10_000);
  await expect.poll(() => m, { message: 'the second page polled too' }).toBe(2);
  await expect(ahead.getByTestId('rsvp-status')).toHaveText('Open');
  await expect(ahead.getByTestId('rsvp-going')).toBeEnabled();
});

test('POLL-1 [e2e] a failed poll keeps the old data and "Updated n s ago" keeps counting', async ({ page }) => {
  const { calls } = await openLive(page, 'one', (n, route) => (n === 1 ? json(route, 200, body({ serverNow: '2026-11-14T12:00:00.000Z', rsvpOpen: true })) : json(route, 500, { error: { code: 'INTERNAL', message: 'boom secret detail', request_id: 'x' } })));
  await expect(page.getByTestId('attendee-row')).toHaveCount(1);
  await page.clock.runFor(10_000);
  await expect.poll(() => calls()).toBe(2);
  await expect(page.getByTestId('fixture-error')).toContainText('Showing older data');
  await expect(page.getByTestId('attendee-row')).toHaveCount(1); // the old list stays
  await expect(page.getByTestId('last-updated')).toContainText('Updated 10 s ago'); // not reset by the failure
  expect(await page.getByTestId('page-fixture').innerText()).not.toContain('boom secret detail');
});

test('POLL-2 [e2e] polling pauses while the page is hidden and refreshes at once when it is visible again', async ({ page }) => {
  const { calls } = await openLive(page, 'one', (_n, route) => json(route, 200, body({ serverNow: '2026-11-14T12:00:00.000Z', rsvpOpen: true })));
  const setVisibility = (state: 'hidden' | 'visible') =>
    page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
  expect(calls()).toBe(1);
  await setVisibility('hidden');
  await page.clock.runFor(35_000); // would be three polls if it did not pause
  expect(calls()).toBe(1);
  await setVisibility('visible');
  await expect.poll(() => calls(), { message: 'refetch at once on visible' }).toBe(2);
  await page.clock.runFor(10_000);
  await expect.poll(() => calls()).toBe(3);
});
