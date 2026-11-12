// Session 07 end-to-end tests: the next-match card on the home page (390 px).
// Most tests answer /api/home themselves and freeze the browser clock, so they do not depend on the shared
// e2e database or on how long the run has been going. The first test uses the real seeded demo match.
import { expect, test, type Page } from '@playwright/test';

const DEVICE_TIME = '2026-11-14T08:00:00.000Z'; // the frozen phone clock (4 hours wrong on purpose)
const SERVER_NOW = '2026-11-14T12:00:00.000Z'; // what the server says

const at = (baseIso: string, seconds: number) => new Date(Date.parse(baseIso) + seconds * 1000).toISOString();

function matchAt(kickoffInSeconds: number, extra: Record<string, unknown> = {}) {
  const kickoff = at(SERVER_NOW, kickoffInSeconds);
  return {
    id: '00000006-0000-4000-8000-000000000100',
    opponent: 'Fake Rovers',
    competition: 'Fake League',
    venue: 'Fake Park',
    kickoff_at: kickoff,
    cutoff_at: at(kickoff, -7200),
    rsvp_open: true,
    ...extra,
  };
}

async function frozenHome(page: Page, body: unknown, status = 200): Promise<void> {
  await page.clock.install({ time: new Date(DEVICE_TIME) });
  await page.clock.pauseAt(new Date(Date.parse(DEVICE_TIME) + 1000)); // from here time moves only when the test says so
  await page.route('**/api/home', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
  await page.goto('/');
  await expect(page.getByTestId('page-home')).toBeVisible();
}

const text = async (page: Page, id: string) => ((await page.getByTestId(id).textContent()) ?? '').trim();

test('AC-2.1.1 [e2e] home shows next non-cancelled match with opponent, venue and kickoff', async ({ page }) => {
  await page.goto('/'); // the real API and the real seeded demo match
  const card = page.getByTestId('next-match-card');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('next-match-opponent')).toHaveText(/\S/);
  await expect(page.getByTestId('next-match-venue')).toHaveText(/\S/);
  await expect(page.getByTestId('next-match-kickoff')).toHaveText(/\d{1,2}:\d{2} [AP]M E[SD]T/); // club time with its zone label
  await expect(page.getByTestId('rsvp-status')).toHaveText('Open'); // the demo cutoff is 90 minutes away
  await expect(page.getByTestId('rsvp-cutoff')).toContainText(/RSVP closes .*E[SD]T/);
  const link = page.getByTestId('go-to-event');
  await expect(link).toHaveAttribute('href', /^\/fixtures\/[0-9a-f-]{36}$/);
  await expect(link).toHaveText('Going / Not going');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('AC-2.1.3 [e2e] countdown ticks down every second', async ({ page }) => {
  await frozenHome(page, { server_now: SERVER_NOW, next_match: matchAt(26 * 3600 + 3 * 60 + 4) });
  await expect(page.getByTestId('countdown')).toBeVisible();
  // the device clock is 4 h behind the server: the countdown must follow the server
  expect([await text(page, 'countdown-d'), await text(page, 'countdown-h'), await text(page, 'countdown-m'), await text(page, 'countdown-s')]).toEqual(['1', '02', '03', '04']);
  await page.clock.runFor(1000);
  await expect(page.getByTestId('countdown-s')).toHaveText('03');
  await page.clock.runFor(3000);
  await expect(page.getByTestId('countdown-s')).toHaveText('00');
  await page.clock.runFor(1000);
  await expect(page.getByTestId('countdown-s')).toHaveText('59');
  await expect(page.getByTestId('countdown-m')).toHaveText('02');
});

test('AC-2.1.4 [e2e] countdown at kickoff shows Kicked off and never goes negative', async ({ page }) => {
  await frozenHome(page, { server_now: SERVER_NOW, next_match: matchAt(2) });
  await expect(page.getByTestId('countdown-s')).toHaveText('02');
  await page.clock.runFor(1000);
  await expect(page.getByTestId('countdown-s')).toHaveText('01');
  await page.clock.runFor(1000);
  await expect(page.getByTestId('countdown')).toHaveText('Kicked off');
  await page.clock.runFor(5000);
  await expect(page.getByTestId('countdown')).toHaveText('Kicked off');
  expect((await page.getByTestId('next-match-card').textContent()) ?? '').not.toMatch(/-\d/);
});

test('AC-2.1.5 [e2e] no upcoming matches shows the empty state', async ({ page }) => {
  await frozenHome(page, { server_now: SERVER_NOW, next_match: null });
  await expect(page.getByTestId('next-match-empty')).toHaveText('No upcoming matches');
  await expect(page.getByTestId('next-match-card')).toHaveCount(0);
  await expect(page.getByTestId('countdown')).toHaveCount(0);
});

test('HOME-NEXT-1 [e2e] the RSVP chip flips to RSVP closed at the server cutoff without a reload', async ({ page }) => {
  await frozenHome(page, { server_now: SERVER_NOW, next_match: matchAt(7200 + 2) }); // cutoff in 2 s
  await expect(page.getByTestId('rsvp-status')).toHaveText('Open');
  await page.clock.runFor(1000);
  await expect(page.getByTestId('rsvp-status')).toHaveText('Open');
  await page.clock.runFor(1000); // now == cutoff: closed
  await expect(page.getByTestId('rsvp-status')).toHaveText('RSVP closed');
});

test('HOME-NEXT-2 [e2e] the chip says RSVP closed when the server says closed', async ({ page }) => {
  await frozenHome(page, { server_now: SERVER_NOW, next_match: matchAt(3600, { rsvp_open: false }) });
  await expect(page.getByTestId('rsvp-status')).toHaveText('RSVP closed');
  await expect(page.getByTestId('countdown')).toBeVisible();
});

test('HOME-NEXT-3 [e2e] a failed load shows a retry button and never the raw error', async ({ page }) => {
  await page.clock.install({ time: new Date(DEVICE_TIME) });
  let fail = true;
  await page.route('**/api/home', (route) =>
    fail
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL', message: 'SECRET DETAIL' } }) })
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ server_now: SERVER_NOW, next_match: matchAt(3600) }) }),
  );
  await page.goto('/');
  await expect(page.getByTestId('next-match-error')).toContainText('Something went wrong. Try again.');
  expect((await page.content()).includes('SECRET DETAIL')).toBe(false);
  fail = false;
  await page.getByTestId('retry-button').click();
  await expect(page.getByTestId('next-match-card')).toBeVisible();
  await expect(page.getByTestId('next-match-error')).toHaveCount(0);
});
