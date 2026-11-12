// Session 11 end-to-end tests: the /settings page (390 px, signed in through the real form).
// The e2e database is shared by every spec, so each test puts back what it changed.
// Only adult logins exist in the e2e server (players 1, 2, 3, 41); the minor rules are covered at the db and api levels.
import { expect, test, type Page } from '@playwright/test';
import { loginFor, signInThroughForm, SMALL_PHONE } from './helpers';

const idOf = (n: number) => `00000001-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function openSettings(page: Page): Promise<void> {
  await page.goto('/settings');
  await expect(page.getByTestId('page-settings')).toBeVisible();
  await expect(page.getByTestId('toggle-stats')).toBeVisible();
}

test('AC-4.3.2 [e2e] changing a consent is saved and reflected publicly on next request', async ({ page }) => {
  await signInThroughForm(page, 'two');
  await openSettings(page);
  const stats = page.getByTestId('toggle-stats');
  const profileUrl = `/players/${idOf(2)}`;

  // the toggles are labelled, and show the saved state
  await expect(page.getByTestId('toggle-public')).toBeChecked(); // the seeded adult is public
  await expect(page.getByLabel('Show me on the public squad')).toHaveCount(1);
  const start = await stats.isChecked();
  await expect(page.getByTestId('settings-saved')).toHaveCount(0);

  // flip it: a status message confirms the save
  if (start) await stats.uncheck();
  else await stats.check();
  await expect(page.getByTestId('settings-saved')).toBeVisible();
  await expect(page.getByTestId('settings-saved')).toHaveAttribute('role', 'status');
  await expect(page.getByTestId('settings-error')).toHaveCount(0);

  // it is still there after a reload
  await page.reload();
  await expect(page.getByTestId('toggle-stats')).toBeChecked({ checked: !start });

  // and the public profile, opened in a fresh visitor context, already reflects it
  const visitor = await page.context().browser()!.newContext({ viewport: { width: 390, height: 844 }, baseURL: 'http://localhost:3100' });
  try {
    const pub = await visitor.newPage();
    const res = await pub.goto(profileUrl);
    expect(res?.status()).toBe(200);
    await expect(pub.getByTestId('player-stats')).toHaveCount(!start ? 1 : 0);
  } finally {
    await visitor.close();
  }

  // put it back
  if (start) await page.getByTestId('toggle-stats').check();
  else await page.getByTestId('toggle-stats').uncheck();
  await expect(page.getByTestId('settings-saved')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('toggle-stats')).toBeChecked({ checked: start });
});

test('AC-4.3.2 [e2e] switching the public toggle off hides the player from the squad, on brings them back', async ({ page }) => {
  await signInThroughForm(page, 'two');
  await openSettings(page);
  const name = (await page.getByTestId('private-name').textContent()) ?? '';
  expect(name.length).toBeGreaterThan(0);

  await page.getByTestId('toggle-public').uncheck();
  await expect(page.getByTestId('settings-saved')).toBeVisible();
  const hidden = await page.goto('/squad');
  expect(hidden?.status()).toBe(200);
  await expect(page.getByTestId('squad-player')).toHaveCount(36);
  // (the signed-in header shows their own name, so look only at the squad cards)
  await expect(page.getByTestId('squad-player').filter({ hasText: name })).toHaveCount(0);
  expect((await page.goto(`/players/${idOf(2)}`))?.status()).toBe(404);

  await openSettings(page);
  await page.getByTestId('toggle-public').check();
  await expect(page.getByTestId('settings-saved')).toBeVisible();
  await page.goto('/squad');
  await expect(page.getByTestId('squad-player')).toHaveCount(37);
  await expect(page.getByTestId('squad-player').filter({ hasText: name })).toHaveCount(1);
});

test('AC-4.3.4 [e2e] the page shows and edits only the signed-in player\'s own settings', async ({ page }) => {
  const two = loginFor('two');
  const three = loginFor('other');
  await signInThroughForm(page, 'two');
  await openSettings(page);
  await expect(page.getByTestId('my-email')).toHaveText(two.email);
  expect((await page.content()).includes(three.email)).toBe(false);
  // there is no way to say whose settings: no player field, and the id in the URL is ignored
  await expect(page.locator('input[name="player_id"], select[name="player_id"]')).toHaveCount(0);
  await page.goto(`/settings?player_id=${idOf(3)}`);
  await expect(page.getByTestId('my-email')).toHaveText(two.email);

  // and a forged request for another player's id is refused by the server, whatever the browser does
  const res = await page.request.put('/api/me/settings', { data: { player_id: idOf(3), show_photo: true } });
  expect(res.status()).toBe(400);
});

test('SETTINGS-E2E-1 [e2e] a signed-out visitor is sent to sign-in, and the page fits 320 px', async ({ page, browser }) => {
  const visitor = await browser.newContext({ viewport: SMALL_PHONE, baseURL: 'http://localhost:3100' });
  try {
    const p = await visitor.newPage();
    await p.goto('/settings');
    await expect(p).toHaveURL(/\/sign-in/);
    await expect(p.getByTestId('toggle-public')).toHaveCount(0);
  } finally {
    await visitor.close();
  }
  await page.setViewportSize(SMALL_PHONE);
  await signInThroughForm(page, 'two');
  await openSettings(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  for (const id of ['toggle-public', 'toggle-photo', 'toggle-nationality', 'toggle-stats', 'my-email']) {
    await expect(page.getByTestId(id)).toHaveCount(1);
  }
});
