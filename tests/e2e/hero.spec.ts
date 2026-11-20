// Session 20e-1: the home hero band and the home layout under it.
//  HERO-4 the next match, the countdown and the Going / Not going button are inside one big band at the top (320, 390, 768, 1280)
//  HERO-5 with no photo the band shows the graphic fallback and asks for no image
//  HERO-6 the countdown is four tiles in one row that never overflow, even for 100 days
//  HERO-8 the button keeps a 3:1 edge against the dark band, a 44 px target, and the band's text passes 4.5:1
//  REC-1  the season record: six stats in one row from 768 px, three and three below
//  COL-1  results and table share a row from 768 px with no big empty gap under either
// Data comes from page.route mocks (as in sessions 07, 14 and 20a to 20d).
import { expect, test, type Page, type Route } from '@playwright/test';

const MATCH = '00000006-0000-4000-8000-000000000100';
const SERVER_NOW = '2026-11-14T12:00:00.000Z';
const KICKOFF = '2026-11-14T19:00:00.000Z';
const WIDTHS = [320, 390, 768, 900, 1024, 1280];
const WIDE = WIDTHS.filter((w) => w >= 768);

const json = (route: Route, status: number, data: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
const nextMatch = (kickoff = KICKOFF) => ({ id: MATCH, opponent: 'Fake Rovers', competition: 'Fake League', venue: 'Fake Park', kickoff_at: kickoff, cutoff_at: '2026-11-14T17:00:00.000Z', rsvp_open: true });
const TEAMS = ['Riverside Rovers', 'PINT FC', 'Harbor Town', 'Maple Athletic', 'Cedar Park United', 'Lakeside Wanderers', 'Ironbridge City', 'Northfield Albion'];
const home = (kickoff = KICKOFF) => ({
  server_now: SERVER_NOW,
  next_match: nextMatch(kickoff),
  record: { played: 10, won: 6, drawn: 2, lost: 2, goals_for: 19, goals_against: 12 },
  latest_results: ['Harbor', 'Maple', 'Cedar', 'Lake', 'Iron'].map((n, i) => ({
    match_id: `00000006-0000-4000-8000-00000000020${i + 1}`,
    opponent: `Fake ${n}`,
    goals_for: 2 - (i % 2),
    goals_against: i % 3,
    played_on: `2026-11-0${9 - i}`,
  })),
  standings: {
    taken_on: '2026-11-05',
    rows: TEAMS.map((team, i) => ({ position: i + 1, team, is_us: team === 'PINT FC', played: 10, goal_difference: 12 - i * 3, points: 22 - i * 2 })),
  },
});

async function openHome(page: Page, width: number, height = 900, kickoff = KICKOFF) {
  await page.setViewportSize({ width, height });
  await page.route('**/api/home', (r) => json(r, 200, home(kickoff)));
  await page.goto('/');
  for (const id of ['next-match-card', 'season-record', 'latest-results', 'mini-table']) await expect(page.getByTestId(id)).toBeVisible();
}

interface Box { x: number; y: number; width: number; height: number; right: number; bottom: number }
const box = async (p: Page, selector: string): Promise<Box> => {
  const b = await p.locator(selector).first().boundingBox();
  expect(b, selector).not.toBeNull();
  const r = b as { x: number; y: number; width: number; height: number };
  return { ...r, right: r.x + r.width, bottom: r.y + r.height };
};
const HERO = '[data-testid="hero"]';
const SECTION = {
  record: 'section[aria-labelledby="season-record-title"]',
  results: 'section[aria-labelledby="latest-results-title"]',
  table: 'section[aria-labelledby="mini-table-title"]',
};

for (const width of [320, 390, 768, 1280]) {
  test(`HERO-4 [e2e] the next match, countdown and button are inside one big band at ${width} px`, async ({ page }) => {
    await openHome(page, width, width < 768 ? 844 : 900);
    expect(await page.locator(HERO).count(), 'one hero band').toBe(1);
    for (const id of ['next-match-card', 'countdown', 'go-to-event', 'next-match-opponent', 'rsvp-status']) {
      expect(await page.locator(HERO).locator(`[data-testid="${id}"]`).count(), `${id} is inside the band`).toBe(1);
    }
    const hero = await box(page, HERO);
    const record = await box(page, SECTION.record);
    const h1 = await box(page, 'h1');
    expect(hero.y, 'the band comes right after the page title').toBeGreaterThanOrEqual(h1.bottom);
    expect(record.y, 'the record is below the band').toBeGreaterThanOrEqual(hero.bottom);
    expect(hero.height, 'a large band').toBeGreaterThanOrEqual(240);
    const content = await page.evaluate(() => {
      const el = document.querySelector('div.page') as HTMLElement;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { x: r.x + parseFloat(cs.paddingLeft), width: r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) };
    });
    expect(hero.width, 'the band fills the page column').toBeGreaterThanOrEqual(content.width - 1);
    expect(hero.x, 'the band starts at the left edge of the column').toBeCloseTo(content.x, 0);
    // the star of the page: the button is in the first screen
    const button = await box(page, '[data-testid="go-to-event"]');
    expect(button.bottom, 'the button is above the fold').toBeLessThanOrEqual(width === 390 || width === 320 ? 844 : 900);
    expect(button.x, 'the button is inside the band (left)').toBeGreaterThanOrEqual(hero.x);
    expect(button.right, 'the button is inside the band (right)').toBeLessThanOrEqual(hero.right);
  });
}

test('HERO-5 [e2e] with no photo the band shows the graphic fallback and asks for no image', async ({ page }) => {
  const imageRequests: string[] = [];
  page.on('request', (r) => { if (r.resourceType() === 'image' || /\/img\/hero/.test(r.url())) imageRequests.push(new URL(r.url()).pathname); });
  await openHome(page, 1280);
  await page.waitForLoadState('load');
  expect(await page.locator(HERO).count(), 'one hero band').toBe(1);
  expect(await page.locator(`${HERO} [data-testid="hero-art"]`).count(), 'graphic fallback').toBe(1);
  const art = await box(page, `${HERO} [data-testid="hero-art"]`);
  expect(art.width, 'fallback has a size').toBeGreaterThan(100);
  expect(art.height, 'fallback has a size').toBeGreaterThan(100);
  expect(await page.locator(`${HERO} img`).count(), 'no <img> in the band').toBe(0);
  expect(await page.locator(`${HERO} .hero-photo`).count(), 'no photo layer').toBe(0);
  expect(imageRequests.filter((p) => /hero/.test(p)), 'no request for a hero photo').toEqual([]);
  const bg = await page.locator(HERO).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg, 'the band has a dark solid background').not.toBe('rgba(0, 0, 0, 0)');
});

for (const width of WIDTHS) {
  test(`HERO-6 [e2e] the countdown is four tiles in one row that fit, also for 100 days, at ${width} px`, async ({ page }) => {
    await openHome(page, width, 900, new Date(Date.parse(SERVER_NOW) + (100 * 24 + 1) * 3600 * 1000).toISOString());
    const tiles = page.locator('[data-testid="countdown"] [data-testid="countdown-tile"]');
    expect(await tiles.count(), 'four tiles').toBe(4);
    await expect(page.getByTestId('countdown-d')).toHaveText(/^100$/);
    const result = await page.evaluate(() => {
      const wrap = document.querySelector('[data-testid="countdown"]') as HTMLElement;
      const w = wrap.getBoundingClientRect();
      const t = Array.from(wrap.querySelectorAll<HTMLElement>('[data-testid="countdown-tile"]'));
      return {
        tops: t.map((e) => Math.round(e.getBoundingClientRect().top)),
        outside: t.filter((e) => { const r = e.getBoundingClientRect(); return r.left < w.left - 0.5 || r.right > w.right + 0.5; }).length,
        clipped: t.filter((e) => e.scrollWidth > e.clientWidth + 1).length,
        numbersClipped: Array.from(wrap.querySelectorAll<HTMLElement>('[data-testid^="countdown-"]:not([data-testid="countdown-tile"])')).filter((e) => e.scrollWidth > e.clientWidth + 1).length,
        // the body allows a break anywhere (overflow-wrap: anywhere), so a too-big number would not overflow: it would split in two lines
        numbersBroken: Array.from(wrap.querySelectorAll<HTMLElement>('.cd-num')).filter((e) => {
          const range = document.createRange();
          range.selectNodeContents(e);
          return range.getClientRects().length > 1;
        }).length,
        pageOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      };
    });
    expect(result.numbersBroken, 'numbers split over two lines').toBe(0);
    expect(new Set(result.tops).size, 'one row').toBe(1);
    expect(result.outside, 'tiles outside the countdown box').toBe(0);
    expect(result.clipped, 'clipped tiles').toBe(0);
    expect(result.numbersClipped, 'clipped numbers').toBe(0);
    expect(result.pageOverflow, 'horizontal scroll').toBe(0);
  });
}

test('HERO-8 [e2e] the button has a 3:1 edge on the band and a 44 px target, and the band text passes 4.5:1', async ({ page }) => {
  await openHome(page, 1280);
  expect(await page.locator(HERO).count(), 'one hero band').toBe(1);
  const r = await page.evaluate(() => {
    const parse = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: number[], b: number[]) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    const hero = document.querySelector('[data-testid="hero"]') as HTMLElement;
    const btn = document.querySelector('[data-testid="go-to-event"]') as HTMLElement;
    const bs = getComputedStyle(btn);
    const heroBg = parse(getComputedStyle(hero).backgroundColor);
    const texts = Array.from(hero.querySelectorAll<HTMLElement>('h2, p, time, span, dt, dd')).filter((e) => e.children.length === 0 && (e.textContent ?? '').trim() !== '' && !e.closest('a, button, [data-testid="rsvp-status"]'));
    return {
      edge: ratio(parse(bs.borderTopColor), heroBg),
      width: btn.getBoundingClientRect().width,
      height: btn.getBoundingClientRect().height,
      textCount: texts.length,
      worstText: Math.min(...texts.map((e) => ratio(parse(getComputedStyle(e).color), heroBg))),
    };
  });
  expect(r.edge, 'button edge against the band').toBeGreaterThanOrEqual(3);
  expect(r.height, 'button height').toBeGreaterThanOrEqual(44);
  expect(r.width, 'button width').toBeGreaterThanOrEqual(44);
  expect(r.textCount, 'text nodes checked').toBeGreaterThan(4);
  expect(r.worstText, 'worst text contrast on the band').toBeGreaterThanOrEqual(4.5);
});

for (const width of WIDTHS) {
  test(`REC-1 [e2e] season record: ${width >= 768 ? 'six stats in one row' : 'three and three'} at ${width} px, no label broken inside a word`, async ({ page }) => {
    await openHome(page, width);
    const stats = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('[data-testid="season-record"] .stat'));
      const broken: string[] = [];
      for (const dt of Array.from(document.querySelectorAll('[data-testid="season-record"] dt'))) {
        const node = dt.firstChild as Text;
        for (const m of (node.textContent ?? '').matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, m.index ?? 0);
          range.setEnd(node, (m.index ?? 0) + m[0].length);
          if (range.getClientRects().length > 1) broken.push(m[0]);
        }
      }
      return { tops: items.map((e) => Math.round(e.getBoundingClientRect().top)), broken, count: items.length };
    });
    expect(stats.count, 'six stats').toBe(6);
    if (width >= 768) expect(new Set(stats.tops).size, 'one row').toBe(1);
    else {
      expect(new Set(stats.tops).size, 'two rows').toBe(2);
      expect(stats.tops.slice(0, 3).every((t) => t === stats.tops[0]) && stats.tops.slice(3).every((t) => t === stats.tops[3]), 'three and three').toBe(true);
    }
    expect(stats.broken, 'words broken across lines').toEqual([]);
  });
}

for (const width of WIDE) {
  test(`COL-1 [e2e] results and table share a row with no big empty gap under either at ${width} px`, async ({ page }) => {
    await openHome(page, width);
    const results = await box(page, SECTION.results);
    const table = await box(page, SECTION.table);
    const record = await box(page, SECTION.record);
    expect(results.y, 'results are below the record').toBeGreaterThanOrEqual(record.bottom);
    expect(results.right, 'results are left of the table').toBeLessThanOrEqual(table.x);
    expect(Math.abs(results.y - table.y), 'both cards start on one line').toBeLessThanOrEqual(1);
    expect(Math.abs(results.bottom - table.bottom), 'both cards end on one line').toBeLessThanOrEqual(24);
    const blank = await page.evaluate((sels) => sels.map((s) => {
      const card = document.querySelector(s) as HTMLElement;
      const last = Array.from(card.children).filter((c) => (c as HTMLElement).getBoundingClientRect().height > 0).pop() as HTMLElement;
      const pad = parseFloat(getComputedStyle(card).paddingBottom);
      return Math.round(card.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom - pad);
    }), [SECTION.results, SECTION.table]);
    for (const b of blank) expect(b, 'empty space inside a card below its content').toBeLessThanOrEqual(24);
  });
}
