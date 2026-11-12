// Session 08 end-to-end tests: the season record and the latest results on the home page (390 px).
// Most tests answer /api/home themselves, so they do not depend on the shared e2e database. The first one uses
// the real seeded data (ten published league results, one friendly, one saved-but-unpublished result).
import { expect, test, type Page } from '@playwright/test';
import { SMALL_PHONE } from './helpers';

const NOW = '2026-11-14T12:00:00.000Z';

const results = [
  { match_id: '00000006-0000-4000-8000-000000000002', opponent: 'Fake Rovers', goals_for: 3, goals_against: 1, played_on: '2026-11-09' },
  { match_id: '00000006-0000-4000-8000-000000000003', opponent: 'Fake Athletic', goals_for: 1, goals_against: 1, played_on: '2026-11-02' },
  { match_id: '00000006-0000-4000-8000-000000000004', opponent: 'Fake United', goals_for: 0, goals_against: 2, played_on: '2026-10-26' },
];

async function mockHome(page: Page, body: Record<string, unknown>, status = 200): Promise<void> {
  await page.route('**/api/home', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ server_now: NOW, next_match: null, ...body }) }),
  );
}

test('HOME-RESULTS-1 [e2e] the real home page shows the season record and the latest five results', async ({ page }) => {
  await page.goto('/');
  const record = page.getByTestId('season-record');
  await expect(record).toBeVisible();
  await expect(page.getByTestId('record-played')).toHaveText('10'); // ten published league results in the seed
  for (const id of ['record-won', 'record-drawn', 'record-lost', 'record-gf', 'record-ga']) {
    await expect(page.getByTestId(id)).toHaveText(/^\d+$/);
  }
  await expect(page.getByTestId('latest-results')).toBeVisible();
  await expect(page.getByTestId('result-row')).toHaveCount(5);
  await expect(page.getByTestId('result-row').first()).toContainText(/\d\s*[–-]\s*\d/); // a score
  await expect(page.getByTestId('season-record-empty')).toHaveCount(0);
  await expect(page.getByTestId('results-empty')).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('AC-2.2.4 [e2e] no published results shows the record empty state', async ({ page }) => {
  await mockHome(page, { record: null, latest_results: [] });
  await page.goto('/');
  await expect(page.getByTestId('season-record-empty')).toHaveText('No results yet');
  await expect(page.getByTestId('results-empty')).toBeVisible();
  await expect(page.getByTestId('season-record')).toHaveCount(0); // no table of zeros dressed as a result
  await expect(page.getByTestId('record-played')).toHaveCount(0);
  await expect(page.getByTestId('result-row')).toHaveCount(0);
});

test('HOME-RESULTS-2 [e2e] rows show opponent, score, date and a text outcome (never colour alone)', async ({ page }) => {
  await mockHome(page, { record: { played: 3, won: 1, drawn: 1, lost: 1, goals_for: 4, goals_against: 4 }, latest_results: results });
  await page.goto('/');
  await expect(page.getByTestId('record-played')).toHaveText('3');
  await expect(page.getByTestId('record-gf')).toHaveText('4');
  await expect(page.getByTestId('record-ga')).toHaveText('4');
  const rows = page.getByTestId('result-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Fake Rovers');
  await expect(rows.nth(0)).toContainText(/3\s*[–-]\s*1/);
  await expect(rows.nth(0)).toContainText('9 Nov'); // the date from played_on, with no time-zone shift
  await expect(rows.nth(0).getByTestId('result-outcome')).toHaveText('W');
  await expect(rows.nth(1).getByTestId('result-outcome')).toHaveText('D');
  await expect(rows.nth(2).getByTestId('result-outcome')).toHaveText('L');
  // newest first, in the order the API sent them
  const text = await page.getByTestId('latest-results').innerText();
  expect(text.indexOf('Fake Rovers')).toBeLessThan(text.indexOf('Fake Athletic'));
  expect(text.indexOf('Fake Athletic')).toBeLessThan(text.indexOf('Fake United'));
});

test('HOME-RESULTS-3 [e2e] at 320 px nothing scrolls sideways, even with a very long opponent name', async ({ page }) => {
  await page.setViewportSize(SMALL_PHONE);
  const long = { ...results[0], opponent: 'Fake Wanderers Of The Extremely Long Named Borough United Reserves' };
  await mockHome(page, { record: { played: 3, won: 1, drawn: 1, lost: 1, goals_for: 4, goals_against: 4 }, latest_results: [long, results[1], results[2]] });
  await page.goto('/');
  await expect(page.getByTestId('result-row')).toHaveCount(3);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('HOME-RESULTS-4 [e2e] a failed load shows a retry button in each section and never the raw error', async ({ page }) => {
  let fail = true;
  await page.route('**/api/home', (route) =>
    fail
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL', message: 'SECRET DETAIL' } }) })
      : route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ server_now: NOW, next_match: null, record: { played: 3, won: 1, drawn: 1, lost: 1, goals_for: 4, goals_against: 4 }, latest_results: results }),
        }),
  );
  await page.goto('/');
  await expect(page.getByTestId('season-record-error')).toContainText('Something went wrong. Try again.');
  await expect(page.getByTestId('results-error')).toContainText('Something went wrong. Try again.');
  expect((await page.content()).includes('SECRET DETAIL')).toBe(false);
  fail = false;
  await page.getByTestId('season-record-retry').click();
  await expect(page.getByTestId('season-record')).toBeVisible();
  await expect(page.getByTestId('results-error')).toBeVisible(); // the other section keeps its own state until its own retry
  await page.getByTestId('results-retry').click();
  await expect(page.getByTestId('latest-results')).toBeVisible();
});
