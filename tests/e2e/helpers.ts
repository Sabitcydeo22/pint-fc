// Shared helpers for the end-to-end tests. Passwords come from the e2e server's logins file (written by
// tests/helpers/e2e-server.mjs) and stay in memory: never log them, and never put them in an assertion message.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';

export type Who = 'one' | 'two' | 'other' | 'archived';
interface Login {
  player_id: string;
  email: string;
  password: string;
}

export const PHONE = { width: 390, height: 844 };
export const SMALL_PHONE = { width: 320, height: 640 };

export function loginFor(who: Who): Login {
  const file = path.join(os.tmpdir(), 'pintfc-e2e-logins.json');
  const all = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<Who, Login>;
  return all[who];
}

/** Opens the menu on a narrow screen (below 480 px the header links hide behind `nav-toggle`). */
export async function openMenuIfCollapsed(page: Page): Promise<void> {
  const toggle = page.getByTestId('nav-toggle');
  if (await toggle.isVisible()) {
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }
}

/** Signs in through the real form and waits until the home page shows the signed-in header. */
export async function signInThroughForm(page: Page, who: Who): Promise<void> {
  const { email, password } = loginFor(who);
  await page.goto('/sign-in');
  await expect(page.getByTestId('page-sign-in')).toBeVisible();
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('sign-in-button').click();
  await expect(page.getByTestId('page-home')).toBeVisible();
  await openMenuIfCollapsed(page);
  await expect(page.getByTestId('account-menu')).toBeVisible();
}
