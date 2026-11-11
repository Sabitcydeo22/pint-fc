import { expect, test } from '@playwright/test';

test('GATE-4 home page loads in Chromium at 390 px and 320 px', async ({ page }) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId('page-home')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('PINT FC');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }
});
