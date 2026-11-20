// Session 20e-3: player page identity panel, sporty squad cards, mid-width checks for every page, renders.
//  PLAYER-1 a dark navy panel holds the name, a big number (48 px or more) and the position; its text passes 4.5:1
//  PLAYER-2 no valid photo: no image at all (no body, no jersey); the number is the graphic
//  PLAYER-3 [guard] stats sit below the name; with no consent there are no stats, nationality or image in the DOM
//  PLAYER-4 panel and stats block have one width and no big gap between them (768, 1280)
//  SQUAD-1  taller card, a big number, a position label, a left accent bar
//  SQUAD-2  [guard] equal card height in a row and a name of at most two lines, with a very long name
//  MID-2    [guard] 390, 768, 1024, 1280: no sideways scroll, nothing wider than the screen, no clipped text, on every page
//  PROF-12  renders for the owner to look at
// The squad and profiles use the real seed; who consented to what is read from the seed module (as in squad.spec.ts).
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { signInThroughForm } from './helpers';
// @ts-expect-error TS7016 plain .mjs module, typed locally
import * as seedData from '../../scripts/seed-data/index.mjs';

interface SeedPlayer {
  full_name: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  shirt_number: number;
  show_photo: boolean;
  show_nationality: boolean;
  show_stats: boolean;
  photo_url: string | null;
  nationality: string | null;
}
const { staticData, id: seedId } = seedData as unknown as { staticData: () => { players: SeedPlayer[] }; id: (kind: string, n: number) => string };
const players = staticData().players;
const HIDDEN = [34, 10, 28, 41];
const adults = players.map((p, i) => ({ p, n: i + 1 })).filter(({ n }) => n !== 21 && !HIDDEN.includes(n));
const everything = adults.find(({ p }) => p.show_photo && p.photo_url && p.show_nationality && p.nationality && p.show_stats) as { p: SeedPlayer; n: number };
const nothing = adults.find(({ p }) => !p.show_photo && !p.show_nationality && !p.show_stats && p.nationality) as { p: SeedPlayer; n: number };
const MATCH = '00000006-0000-4000-8000-000000000100';
const OUT = path.resolve(import.meta.dirname, '..', '..', 'screenshots');
const LABEL = { GK: 'Goalkeeper', DEF: 'Defender', MID: 'Midfielder', FWD: 'Forward' } as const;

const profile = (n: number) => `/players/${seedId('player', n)}`;
interface Box { x: number; y: number; width: number; height: number; right: number; bottom: number }
async function box(page: Page, selector: string): Promise<Box> {
  const b = await page.locator(selector).first().boundingBox();
  expect(b, selector).not.toBeNull();
  const r = b as { x: number; y: number; width: number; height: number };
  return { ...r, right: r.x + r.width, bottom: r.y + r.height };
}

// ---------- player page ----------
for (const width of [390, 768, 1280]) {
  test(`PLAYER-1 [e2e] a dark navy panel holds the name, a big number and the position, and its text is readable at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(profile(everything.n));
    await expect(page.getByTestId('page-player')).toBeVisible();
    expect(await page.locator('.player-panel').count(), 'one identity panel').toBe(1);
    const panel = page.locator('.player-panel');
    await expect(panel.getByTestId('player-name')).toHaveText(everything.p.full_name);
    await expect(panel.getByTestId('player-position')).toHaveText(LABEL[everything.p.position]);
    await expect(panel.getByTestId('player-number')).toHaveText(String(everything.p.shirt_number));
    const r = await panel.evaluate((el) => {
      const parse = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const lum = (c: number[]) => { const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = (a: number[], b: number[]) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
      const root = getComputedStyle(document.documentElement);
      const navy = (n: string) => { const v = parseInt(root.getPropertyValue(n).trim().slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
      const grounds = [navy('--primary'), navy('--primary-deep')];
      const number = el.querySelector('[data-testid="player-number"]') as HTMLElement;
      const texts = Array.from(el.querySelectorAll<HTMLElement>('*')).filter((e) => e.children.length === 0 && (e.textContent ?? '').trim() !== '');
      return {
        background: lum(parse(getComputedStyle(el).backgroundColor)),
        numberSize: parseFloat(getComputedStyle(number).fontSize),
        worst: Math.min(...texts.map((e) => Math.min(...grounds.map((g) => ratio(parse(getComputedStyle(e).color), g))))),
        texts: texts.length,
      };
    });
    expect(r.background, 'the panel is dark (luminance)').toBeLessThan(0.05);
    expect(r.numberSize, 'big number, px').toBeGreaterThanOrEqual(48);
    expect(r.texts, 'texts in the panel').toBeGreaterThanOrEqual(3);
    expect(r.worst, 'worst text contrast in the panel').toBeGreaterThanOrEqual(4.5);
  });
}

for (const [who, subject] of [['consented', everything], ['not consented', nothing]] as const) {
  test(`PLAYER-2 [e2e] with no valid photo (${who}) there is no image at all: the number is the graphic`, async ({ page }) => {
    await page.goto(profile(subject.n));
    await expect(page.getByTestId('page-player')).toBeVisible();
    expect(await page.locator('.player-panel').count(), 'the identity panel exists').toBe(1);
    expect(await page.locator('[data-testid="page-player"] img').count(), '<img> on the page').toBe(0);
    await expect(page.getByTestId('player-photo')).toHaveCount(0);
    const avatar = page.getByTestId('player-avatar');
    await expect(avatar).toHaveCount(1);
    await expect(avatar).toHaveText(String(subject.p.shirt_number));
    expect(await avatar.locator('svg, img').count(), 'no jersey and no body inside the avatar').toBe(0);
    await expect(avatar).toHaveAttribute('aria-hidden', 'true');
  });
}

test('PLAYER-3 [e2e] guard: stats sit below the name; without consent there are no stats, nationality or image in the DOM', async ({ page }) => {
  await page.goto(profile(everything.n));
  const name = await box(page, '[data-testid="player-name"]');
  const stats = await box(page, '[data-testid="player-stats"]');
  expect(stats.y, 'the stats block is below the name').toBeGreaterThanOrEqual(name.bottom);
  await expect(page.getByTestId('player-nationality')).toContainText(everything.p.nationality as string);
  await page.goto(profile(nothing.n));
  await expect(page.getByTestId('page-player')).toBeVisible();
  for (const id of ['player-stats', 'player-nationality', 'player-photo']) await expect(page.getByTestId(id)).toHaveCount(0);
  expect((await page.content()).includes(nothing.p.nationality as string)).toBe(false);
});

for (const width of [768, 1280]) {
  test(`PLAYER-4 [e2e] the panel and the stats block have one width and a small gap between them at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(profile(everything.n));
    expect(await page.locator('.player-panel').count(), 'the identity panel exists').toBe(1);
    const panel = await box(page, '.player-panel');
    const stats = await box(page, '[data-testid="player-stats"]');
    const card = await box(page, 'section[aria-labelledby="player-stats-title"]');
    expect(Math.abs(panel.width - card.width), 'panel and stats card have one width').toBeLessThanOrEqual(1);
    expect(card.y - panel.bottom, 'gap between panel and stats').toBeLessThanOrEqual(24);
    expect(card.y - panel.bottom, 'the stats come after the panel').toBeGreaterThanOrEqual(0);
    expect(stats.right, 'stats inside the card').toBeLessThanOrEqual(card.right);
  });
}

// ---------- squad ----------
for (const width of [390, 768, 1280]) {
  test(`SQUAD-1 [e2e] a taller card with a big number, a position label and a left accent bar at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/squad');
    await expect(page.getByTestId('squad-player').first()).toBeVisible();
    const r = await page.evaluate(() => {
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      const n = parseInt(accent.slice(1), 16);
      const accentRgb = `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
      const out = { cards: 0, short: 0, smallNumber: 0, noLabel: 0, wrongLabel: 0, noBar: 0 };
      const want: Record<string, string> = { GK: 'Goalkeeper', DEF: 'Defender', MID: 'Midfielder', FWD: 'Forward' };
      for (const card of Array.from(document.querySelectorAll<HTMLElement>('[data-testid="squad-player"]'))) {
        out.cards++;
        const cs = getComputedStyle(card);
        if (card.getBoundingClientRect().height < 72) out.short++;
        const num = card.querySelector<HTMLElement>('.squad-badge');
        if (!num || parseFloat(getComputedStyle(num).fontSize) < 24) out.smallNumber++;
        const label = card.querySelector<HTMLElement>('.squad-position');
        if (!label || label.getBoundingClientRect().height === 0) out.noLabel++;
        else {
          const code = (card.closest('[data-testid^="squad-group-"]') as HTMLElement).dataset.testid?.replace('squad-group-', '') ?? '';
          if ((label.textContent ?? '').trim() !== want[code]) out.wrongLabel++;
        }
        if (!(parseFloat(cs.borderLeftWidth) >= 4 && cs.borderLeftStyle === 'solid' && cs.borderLeftColor === accentRgb)) out.noBar++;
      }
      return out;
    });
    expect(r.cards, 'cards').toBe(37);
    expect(r.short, 'cards under 72 px').toBe(0);
    expect(r.smallNumber, 'numbers under 24 px').toBe(0);
    expect(r.noLabel, 'cards with no position label').toBe(0);
    expect(r.wrongLabel, 'cards with the wrong position label').toBe(0);
    expect(r.noBar, 'cards without a 4 px accent bar on the left').toBe(0);
  });
}

for (const width of [768, 1280]) {
  test(`SQUAD-2 [e2e] guard: equal card height in a row and a name of at most two lines, with a very long name, at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/squad');
    await expect(page.getByTestId('squad-player').first()).toBeVisible();
    await page.evaluate(() => {
      document.querySelectorAll('.squad-grid').forEach((grid) => {
        const n = grid.querySelector('.squad-name');
        if (n) n.textContent = 'Fake Christopher Alexander Montgomery-Wellington III of Northern Fakeshire and Southern Testland';
      });
    });
    const r = await page.evaluate(() => {
      let uneven = 0;
      let overTwoLines = 0;
      let tallest = 0;
      for (const grid of Array.from(document.querySelectorAll('.squad-grid'))) {
        const byRow = new Map<number, number[]>();
        for (const li of Array.from(grid.children)) {
          const card = li.querySelector('.squad-card') as HTMLElement;
          const top = Math.round(li.getBoundingClientRect().top);
          byRow.set(top, [...(byRow.get(top) ?? []), card.getBoundingClientRect().height]);
          tallest = Math.max(tallest, card.getBoundingClientRect().height);
        }
        for (const heights of byRow.values()) if (heights.length > 1 && Math.max(...heights) - Math.min(...heights) > 1) uneven++;
      }
      for (const name of Array.from(document.querySelectorAll<HTMLElement>('.squad-name'))) {
        const line = parseFloat(getComputedStyle(name).lineHeight) || parseFloat(getComputedStyle(name).fontSize) * 1.5;
        if (name.getBoundingClientRect().height > line * 2 + 1) overTwoLines++;
      }
      return { uneven, overTwoLines, tallest };
    });
    expect(r.tallest, 'a long name wrapped (a card taller than 60 px)').toBeGreaterThan(60);
    expect(r.uneven, 'rows whose cards differ in height').toBe(0);
    expect(r.overTwoLines, 'names taller than two lines').toBe(0);
  });
}

// ---------- every page, four widths ----------
const PAGES: Array<[string, (page: Page) => Promise<void>, string]> = [
  ['home', async (p) => { await p.goto('/'); }, 'page-home'],
  ['squad', async (p) => { await p.goto('/squad'); }, 'page-squad'],
  ['player (everything)', async (p) => { await p.goto(profile(everything.n)); }, 'page-player'],
  ['player (nothing)', async (p) => { await p.goto(profile(nothing.n)); }, 'page-player'],
  ['sign-in', async (p) => { await p.goto('/sign-in'); }, 'page-sign-in'],
  ['404', async (p) => { await p.goto('/players/99999999-9999-4999-8999-999999999999'); }, 'not-found'],
  ['event', async (p) => { await signInThroughForm(p, 'one'); await p.goto(`/fixtures/${MATCH}`); }, 'page-fixture'],
  ['settings', async (p) => { await signInThroughForm(p, 'two'); await p.goto('/settings'); }, 'page-settings'],
];
for (const width of [390, 768, 1024, 1280]) {
  for (const [title, open, testId] of PAGES) {
    test(`MID-2 [e2e] guard: ${title} at ${width} px has no sideways scroll, nothing wider than the screen and no clipped text`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      await expect(page.getByTestId(testId)).toBeVisible();
      await page.waitForLoadState('load');
      const r = await page.evaluate(() => {
        const w = window.innerWidth;
        const wide: string[] = [];
        const clipped: string[] = [];
        for (const e of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
          if (e.closest('.sr-only, .live-region, svg')) continue;
          const r = e.getBoundingClientRect();
          if (r.width > 0 && (r.right > w + 1 || r.left < -1)) wide.push(`${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)}`);
          const cs = getComputedStyle(e);
          if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && cs.textOverflow !== 'ellipsis' && e.scrollWidth > e.clientWidth + 1 && (e.textContent ?? '').trim() !== '') {
            clipped.push(`${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)}`);
          }
        }
        return { scroll: Math.max(0, document.documentElement.scrollWidth - w), wide: wide.slice(0, 5), clipped: clipped.slice(0, 5) };
      });
      expect(r.scroll, 'horizontal scroll').toBe(0);
      expect(r.wide, 'elements wider than the screen').toEqual([]);
      expect(r.clipped, 'elements that clip their text').toEqual([]);
    });
  }
}

// ---------- renders for the owner to look at ----------
test('PROF-12 [e2e] renders: player page, squad, signed-in header and event page', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(profile(everything.n));
    await expect(page.getByTestId('page-player')).toBeVisible();
    await page.screenshot({ path: path.join(OUT, `player-consented-20e3-${width}.png`), fullPage: true });
    await page.goto(profile(nothing.n));
    await expect(page.getByTestId('page-player')).toBeVisible();
    await page.screenshot({ path: path.join(OUT, `player-plain-20e3-${width}.png`), fullPage: true });
    await page.goto('/squad');
    await expect(page.getByTestId('page-squad')).toBeVisible();
    await page.screenshot({ path: path.join(OUT, `squad-20e3-${width}.png`), fullPage: false });
  }
  await signInThroughForm(page, 'one');
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('/');
  await page.screenshot({ path: path.join(OUT, 'header-20e3-768.png'), clip: { x: 0, y: 0, width: 768, height: 140 } });
  await page.getByTestId('account-trigger').click();
  await expect(page.getByTestId('account-panel')).toBeVisible();
  await page.screenshot({ path: path.join(OUT, 'header-20e3-menu-768.png'), clip: { x: 0, y: 0, width: 768, height: 300 } });
  await page.goto(`/fixtures/${MATCH}`);
  await expect(page.getByTestId('page-fixture')).toBeVisible();
  await page.screenshot({ path: path.join(OUT, 'event-20e3-768.png'), fullPage: true });
});
