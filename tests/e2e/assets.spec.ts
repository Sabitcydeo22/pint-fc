// Session 20c: the graphics (no people). ASSET-5 the SVG files are served, ASSET-6 the profile shows a jersey image only for
// a consented player and an initials avatar for everyone else (never a photo, never a broken image), ASSET-7 pages load
// no image from another site and no image answers an error, ASSET-8 the squad badge and the crest, ASSET-9 the text on the
// jersey is readable. It also writes PNG renders of the SVG files and two profiles to screenshots/ for the owner to LOOK
// at (a test cannot tell a shirt from a person). Files are overwritten by name; nothing is deleted.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
// @ts-expect-error TS7016 plain .mjs module, typed locally
import * as seedData from '../../scripts/seed-data/index.mjs';

interface SeedPlayer {
  id: string;
  full_name: string;
  shirt_number: number;
  show_photo: boolean;
  photo_url: string | null;
}
const { staticData, id: seedId } = seedData as unknown as { staticData: () => { players: SeedPlayer[] }; id: (kind: string, n: number) => string };
const players = staticData().players;
const HIDDEN = [34, 10, 28, 41];
const visible = players.map((p, i) => ({ p, n: i + 1 })).filter(({ n }) => !HIDDEN.includes(n));
const consented = visible.find(({ p }) => p.show_photo && p.photo_url) as { p: SeedPlayer; n: number };
const plain = visible.find(({ p }) => !p.show_photo) as { p: SeedPlayer; n: number };
const OUT = path.resolve(import.meta.dirname, '..', '..', 'screenshots');
const initialsOf = (name: string) => {
  const w = name.trim().split(/\s+/);
  return (w[0][0] + w[w.length - 1][0]).toUpperCase();
};

for (const file of ['placeholder-player.svg', 'placeholder-crest.svg']) {
  test(`ASSET-5 [e2e] /img/${file} is served as an SVG that the browser can draw, and it is cacheable`, async ({ page, request }) => {
    const res = await request.get(`/img/${file}`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/^image\/svg\+xml/);
    expect(res.headers()['cache-control'] ?? '', 'static graphics are not no-store').not.toMatch(/no-store/);
    // drawn at 320 x 320 and written for the owner's review
    fs.mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: 320, height: 320 });
    await page.goto(`/img/${file}`);
    await page.screenshot({ path: path.join(OUT, `svg-${file.replace('.svg', '')}-320.png`) });
    expect(fs.statSync(path.join(OUT, `svg-${file.replace('.svg', '')}-320.png`)).size).toBeGreaterThan(500);
  });
}

test('ASSET-5 [e2e] the favicon is the crest SVG from src/app/icon.svg', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="icon"]').first().getAttribute('href');
  expect(href, 'a <link rel="icon">').not.toBeNull();
  expect(href).toMatch(/icon\.svg/);
  const res = await request.get(href as string);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/^image\/svg\+xml/);
  fs.mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 320, height: 320 });
  await page.goto(href as string);
  await page.screenshot({ path: path.join(OUT, 'svg-icon-320.png') });
});

test('ASSET-6 [e2e] a consented player shows the local jersey image (it loads, no photo) with the shirt number', async ({ page }) => {
  await page.goto(`/players/${seedId('player', consented.n)}`);
  const img = page.getByTestId('player-photo');
  await expect(img).toHaveCount(1);
  await expect(img).toHaveAttribute('src', '/img/placeholder-player.svg');
  const loaded = await img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0);
  expect(loaded, 'the image loaded (no broken image)').toBe(true);
  expect(await img.getAttribute('alt'), 'decorative: the name is in the heading').toBe('');
  await expect(page.locator('.avatar .avatar-number')).toHaveText(String(consented.p.shirt_number));
  await expect(page.getByTestId('player-avatar')).toHaveCount(0); // one or the other, never both
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'avatar-consented-390.png'), fullPage: true });
});

test('ASSET-6 [e2e] a player who did not consent shows the initials avatar: initials and shirt number, no image', async ({ page }) => {
  await page.goto(`/players/${seedId('player', plain.n)}`);
  await expect(page.getByTestId('player-photo')).toHaveCount(0);
  const avatar = page.getByTestId('player-avatar');
  await expect(avatar).toHaveCount(1);
  await expect(avatar.locator('.avatar-initials')).toHaveText(initialsOf(plain.p.full_name));
  await expect(avatar.locator('.avatar-number')).toHaveText(String(plain.p.shirt_number));
  expect(await avatar.locator('img').count()).toBe(0);
  await expect(page.getByTestId('player-name')).toHaveText(plain.p.full_name); // the name stays in the heading
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'avatar-initials-390.png'), fullPage: true });
});

test('ASSET-7 [e2e] pages load no image from another site, no image answers an error, and every <img> is a local SVG', async ({ page, baseURL }) => {
  const origin = new URL(baseURL as string).origin;
  const foreign: string[] = [];
  const failed: string[] = [];
  page.on('request', (r) => { if (new URL(r.url()).origin !== origin && !r.url().startsWith('data:')) foreign.push(r.url()); });
  page.on('response', (r) => { if (r.request().resourceType() === 'image' && r.status() >= 400) failed.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  const paths = ['/', '/squad', '/sign-in', '/no-such-page', `/players/${seedId('player', consented.n)}`, `/players/${seedId('player', plain.n)}`];
  for (const p of paths) {
    await page.goto(p);
    await page.waitForLoadState('load');
    const srcs = await page.locator('img').evaluateAll((els) => els.map((e) => e.getAttribute('src') ?? ''));
    expect(srcs.filter((s) => !/^\/img\/[a-z-]+\.svg$/.test(s)), `${p}: <img> sources`).toEqual([]);
  }
  expect(foreign, 'requests to other origins').toEqual([]);
  expect(failed, 'image requests with an error status').toEqual([]);
});

test('ASSET-8 [e2e] the squad badge is a chip with the shirt number (no image), and the header and footer show the crest SVG', async ({ page }) => {
  await page.goto('/squad');
  const cards = page.getByTestId('squad-player');
  await expect(cards).toHaveCount(37);
  const first = cards.first();
  const badge = first.locator('.squad-badge');
  await expect(badge).toHaveCount(1);
  expect(((await badge.textContent()) ?? '').trim()).toMatch(/^\d{1,2}$/);
  expect(await badge.locator('svg, img').count(), 'a plain number chip (20e-2): no jersey shape inside').toBe(0);
  expect(await page.locator('[data-testid="squad-player"] img').count()).toBe(0);
  for (const where of ['site-header', 'site-footer']) {
    const crest = page.getByTestId(where).locator('svg.crest');
    await expect(crest, `${where} crest`).toHaveCount(1);
    await expect(crest).toHaveAttribute('aria-hidden', 'true');
  }
});

test('ASSET-9 [e2e] the number and initials on the jersey are readable (at least 4.5:1 against the jersey colour)', async ({ page }) => {
  await page.goto(`/players/${seedId('player', plain.n)}`);
  const ratio = await page.getByTestId('player-avatar').evaluate((el) => {
    const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const fill = parse(getComputedStyle(el.querySelector('.jersey-fill') as Element).fill);
    const out: number[] = [];
    for (const sel of ['.avatar-initials', '.avatar-number']) {
      const text = parse(getComputedStyle(el.querySelector(sel) as Element).color);
      const [hi, lo] = [lum(fill), lum(text)].sort((a, b) => b - a);
      out.push((hi + 0.05) / (lo + 0.05));
    }
    return Math.min(...out);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});
