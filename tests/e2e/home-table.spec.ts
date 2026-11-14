// Session 09 end-to-end tests: the mini league table on the home page (390 px).
// Most tests answer /api/home themselves; the first uses the real seeded snapshot (8 teams, PINT FC second).
import { expect, test, type Page } from '@playwright/test';
import { SMALL_PHONE } from './helpers';

const NOW = '2026-11-14T12:00:00.000Z';

const rows = [
  { position: 1, team: 'Riverside Rovers', is_us: false, played: 10, goal_difference: 12, points: 22 },
  { position: 2, team: 'PINT FC', is_us: true, played: 10, goal_difference: 7, points: 20 },
  { position: 3, team: 'Harbor Town', is_us: false, played: 10, goal_difference: -1, points: 19 },
  { position: 4, team: 'Maple Athletic', is_us: false, played: 10, goal_difference: 0, points: 17 },
];
const SNAPSHOT_DATE = '2026-11-05';

async function mockHome(page: Page, standings: unknown, status = 200): Promise<void> {
  await page.route('**/api/home', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ server_now: NOW, next_match: null, record: null, latest_results: [], standings }) }),
  );
}

test('AC-2.4.1 [e2e] mini table shows snapshot rows in position order', async ({ page }) => {
  await page.goto('/'); // the real API and the real seeded snapshot
  await expect(page.getByTestId('mini-table')).toBeVisible();
  // every data row: ours has its own test id (table-row-us), the others are table-row
  const trs = page.locator('[data-testid="table-row"], [data-testid="table-row-us"]');
  await expect(trs).toHaveCount(8);
  const firstCells = await trs.evaluateAll((els) => els.map((el) => (el.querySelector('[data-testid="table-pos"]')?.textContent ?? '').trim()));
  expect(firstCells).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  await expect(trs.nth(0)).toContainText('Riverside Rovers');
  await expect(trs.nth(1)).toContainText('PINT FC');
  // played, goal difference and points are on every row
  await expect(trs.nth(1).getByTestId('table-played')).toHaveText('10');
  await expect(trs.nth(1).getByTestId('table-gd')).toHaveText('+7');
  await expect(trs.nth(1).getByTestId('table-points')).toHaveText('20');
  await expect(page.getByTestId('table-empty')).toHaveCount(0);
});

test('AC-2.4.2 [e2e] PINT FC row is highlighted with label and bar, not colour alone', async ({ page }) => {
  await mockHome(page, { taken_on: SNAPSHOT_DATE, rows });
  await page.goto('/');
  const us = page.getByTestId('table-row-us');
  await expect(us).toHaveCount(1);
  await expect(us).toContainText('PINT FC');
  // a bold text label ...
  const label = us.getByTestId('table-us-label');
  await expect(label).toHaveText('PINT FC');
  expect(Number(await label.evaluate((el) => getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(700);
  // ... and a left bar on the row itself (a border, so it survives high-contrast modes that drop background colours)
  const bar = async (testId: string, nth = 0) =>
    Number.parseFloat(await page.getByTestId(testId).nth(nth).evaluate((el) => getComputedStyle(el).borderLeftWidth));
  expect(await bar('table-row-us')).toBeGreaterThanOrEqual(4);
  // the other rows have neither the bar nor the label
  const others = page.getByTestId('table-row');
  await expect(others).toHaveCount(3);
  await expect(page.getByTestId('table-us-label')).toHaveCount(1);
  const otherBars = await others.evaluateAll((els) => els.map((el) => Number.parseFloat(getComputedStyle(el).borderLeftWidth)));
  expect(Math.max(...otherBars)).toBeLessThan(4);
  // the highlight does not depend on colour: it is still there with colours forced off
  await page.emulateMedia({ forcedColors: 'active' });
  expect(await bar('table-row-us')).toBeGreaterThanOrEqual(4);
  await expect(label).toBeVisible();
});

test('AC-2.4.3 [e2e] mini table shows the snapshot date', async ({ page }) => {
  await mockHome(page, { taken_on: SNAPSHOT_DATE, rows }); // taken_on is the calendar date 2026-11-05
  await page.goto('/');
  await expect(page.getByTestId('mini-table')).toBeVisible();
  // it states the date, labelled so it reads as "not live", and the calendar day is not shifted by any time zone
  await expect(page.getByTestId('table-snapshot-date')).toHaveCount(1);
  await expect(page.getByTestId('table-snapshot-date')).toHaveText('As of Nov 5, 2026');
  // the date is in the same section as the table, and the raw ISO string is not shown
  await expect(page.getByRole('region', { name: 'League table' }).getByTestId('table-snapshot-date')).toBeVisible();
  expect(await page.getByTestId('page-home').innerText()).not.toContain('2026-11-05');
});

test('AC-2.4.3 [e2e] the snapshot date is not shown when there is no table', async ({ page }) => {
  await mockHome(page, null);
  await page.goto('/');
  await expect(page.getByTestId('table-empty')).toBeVisible();
  await expect(page.getByTestId('table-snapshot-date')).toHaveCount(0);
});

test('MINI-TABLE-2 [e2e] no snapshot shows the empty state', async ({ page }) => {
  await mockHome(page, null);
  await page.goto('/');
  await expect(page.getByTestId('table-empty')).toHaveText('No table yet');
  await expect(page.getByTestId('mini-table')).toHaveCount(0);
  await expect(page.getByTestId('table-row')).toHaveCount(0);
});

test('MINI-TABLE-3 [e2e] at 320 px nothing scrolls sideways, even with a very long team name', async ({ page }) => {
  await page.setViewportSize(SMALL_PHONE);
  const long = [{ ...rows[0], team: 'Extremely Long Named Borough Wanderers Reserves And Veterans United' }, ...rows.slice(1)];
  await mockHome(page, { taken_on: SNAPSHOT_DATE, rows: long });
  await page.goto('/');
  await expect(page.locator('[data-testid="table-row"], [data-testid="table-row-us"]')).toHaveCount(4);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('MINI-TABLE-4 [e2e] a failed load shows a retry button and never the raw error', async ({ page }) => {
  let fail = true;
  await page.route('**/api/home', (route) =>
    fail
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL', message: 'SECRET DETAIL' } }) })
      : route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ server_now: NOW, next_match: null, record: null, latest_results: [], standings: { taken_on: SNAPSHOT_DATE, rows } }),
        }),
  );
  await page.goto('/');
  await expect(page.getByTestId('table-error')).toContainText('Something went wrong. Try again.');
  expect((await page.content()).includes('SECRET DETAIL')).toBe(false);
  fail = false;
  await page.getByTestId('table-retry').click();
  await expect(page.getByTestId('mini-table')).toBeVisible();
  await expect(page.getByTestId('table-error')).toHaveCount(0);
});
