// Session 06 end-to-end tests (all run at 390 px unless a test says otherwise).
// Passwords are read in memory by helpers.ts; no assertion here can print one.
import { expect, test, type Page } from '@playwright/test';
import { loginFor, openMenuIfCollapsed, signInThroughForm, SMALL_PHONE } from './helpers';

const FIXTURE_ID = '00000006-0000-4000-8000-000000000100'; // the seeded demo match

const apiStatus = async (page: Page, path: string, method: 'GET' | 'POST' = 'GET') =>
  (await (method === 'GET' ? page.request.get(path) : page.request.post(path, { data: {} }))).status();

/** Presses a sign-out button and waits for the full page load that follows (the old page's account menu disappears). */
async function pressSignOut(page: Page, testId: 'sign-out-button' | 'sign-out-all-button'): Promise<void> {
  await openMenuIfCollapsed(page);
  await page.getByTestId(testId).click();
  await expect(page.getByTestId('account-menu')).toHaveCount(0);
  await expect(page.getByTestId('page-home')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');
}

async function hasSessionCookie(page: Page): Promise<boolean> {
  return (await page.context().cookies()).some((c) => c.name === 'pf_session' && c.value !== '');
}

test('AC-1.1.1 [e2e] valid player signs in and lands on home signed in', async ({ page }) => {
  await signInThroughForm(page, 'one');
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(page.getByTestId('sign-in-link')).toHaveCount(0);
  await expect(page.getByTestId('account-menu')).toContainText(/\S/); // the player's name
  expect(await apiStatus(page, '/api/me')).toBe(200);
});

test('AC-1.1.3 [e2e] wrong password gives one generic error and no session', async ({ page }) => {
  const { email } = loginFor('one');
  const messages: string[] = [];
  for (const [e, p] of [
    [email, 'definitely-not-the-password'],
    ['nobody.here@pintfc.test', 'definitely-not-the-password'],
  ]) {
    await page.goto('/sign-in');
    await expect(page.getByTestId('page-sign-in')).toBeVisible();
    await page.getByTestId('email-input').fill(e);
    await page.getByTestId('password-input').fill(p);
    await page.getByTestId('sign-in-button').click();
    const error = page.getByTestId('sign-in-error');
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('role', 'alert');
    messages.push((await error.textContent())?.trim() ?? '');
    expect(new URL(page.url()).pathname).toBe('/sign-in');
    expect(await hasSessionCookie(page)).toBe(false);
  }
  expect(messages[0]).toBe('Email or password is incorrect');
  expect(messages[1]).toBe(messages[0]);
  expect(await apiStatus(page, '/api/me')).toBe(401);
});

test('AC-1.6.1 [e2e] sign out clears this session and player endpoints return 401', async ({ page }) => {
  await signInThroughForm(page, 'one');
  expect(await hasSessionCookie(page)).toBe(true);
  await pressSignOut(page, 'sign-out-button');
  await openMenuIfCollapsed(page);
  await expect(page.getByTestId('sign-in-link')).toBeVisible();
  await expect(page.getByTestId('account-menu')).toHaveCount(0);
  expect(await hasSessionCookie(page)).toBe(false);
  expect(await apiStatus(page, '/api/me')).toBe(401);
  expect(await apiStatus(page, '/api/auth/sign-out-all', 'POST')).toBe(401);
});

test('AC-1.6.2 [e2e] sign out of all devices rejects both sessions', async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pageA = await a.newPage();
  const pageB = await b.newPage();
  await signInThroughForm(pageA, 'two');
  await signInThroughForm(pageB, 'two');
  expect(await apiStatus(pageA, '/api/me')).toBe(200);
  expect(await apiStatus(pageB, '/api/me')).toBe(200);

  await pressSignOut(pageA, 'sign-out-all-button');
  expect(await apiStatus(pageA, '/api/me')).toBe(401);
  expect(await apiStatus(pageB, '/api/me')).toBe(401); // device B still holds a cookie, but its session is gone
  await pageB.goto('/settings');
  await expect(pageB).toHaveURL(/\/sign-in$/);
  await a.close();
  await b.close();
});

test('AC-1.6.3 [e2e] player-only endpoints return 401 without a session and pages redirect to sign-in', async ({ page }) => {
  const res = await page.request.get('/api/me');
  expect(res.status()).toBe(401);
  const body = (await res.json()) as { error?: { code?: string } };
  expect(body.error?.code).toBe('UNAUTHENTICATED');
  expect(await apiStatus(page, '/api/auth/sign-out-all', 'POST')).toBe(401);

  for (const path of ['/settings', `/fixtures/${FIXTURE_ID}`]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByTestId('page-sign-in')).toBeVisible();
  }
});

test('AC-1.6.4 [e2e] after sign out, back and reload show no private data', async ({ page }) => {
  await signInThroughForm(page, 'one');
  const me = (await (await page.request.get('/api/me')).json()) as { player: { display_name: string } };
  const name = me.player.display_name;
  await page.goto('/settings');
  await expect(page.getByTestId('page-settings')).toBeVisible();
  await expect(page.getByTestId('private-name')).toHaveText(name);

  await pressSignOut(page, 'sign-out-button');

  await page.goBack(); // back to /settings, which must not come from a cache
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByTestId('page-settings')).toHaveCount(0);
  expect((await page.content()).includes(name)).toBe(false);

  await page.goto('/settings');
  await page.reload();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect((await page.content()).includes(name)).toBe(false);
});

test('T-19 [e2e] sign-in ignores redirect parameters', async ({ page }) => {
  const { email, password } = loginFor('one');
  await page.goto('/sign-in?next=https://evil.example/steal&redirect=/settings&returnTo=//evil.example');
  await expect(page.getByTestId('page-sign-in')).toBeVisible();
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('sign-in-button').click();
  await expect(page.getByTestId('page-home')).toBeVisible();
  const url = new URL(page.url());
  expect(url.origin).toBe('http://localhost:3100');
  expect(url.pathname).toBe('/');
  expect(url.search).toBe('');
});

test('SHELL-1 [e2e] header shows sign-in link when signed out and account menu when signed in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('site-header')).toBeVisible();
  await expect(page.getByTestId('site-footer')).toBeVisible();
  await openMenuIfCollapsed(page);
  await expect(page.getByTestId('sign-in-link')).toBeVisible();
  await expect(page.getByTestId('account-menu')).toHaveCount(0);

  await signInThroughForm(page, 'one');
  await expect(page.getByTestId('account-menu')).toBeVisible();
  await expect(page.getByTestId('sign-in-link')).toHaveCount(0);
  await expect(page.getByTestId('sign-out-button')).toBeVisible();
  await expect(page.getByTestId('sign-out-all-button')).toBeVisible();

  // at 320 px: the menu collapses behind a button and nothing scrolls sideways
  await page.setViewportSize(SMALL_PHONE);
  await page.goto('/');
  await expect(page.getByTestId('nav-toggle')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
