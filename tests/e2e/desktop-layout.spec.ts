// Session 20d: desktop layout up to 1200 px (one step at 768 px, plus the 1200 px projector rule of the event page).
//  D-2 the page is up to 1200 px wide and a card is no longer capped at 420 px
//  D-3 home: two columns from 768 px (next match + record left, results + table right), one column below; DOM order unchanged
//  D-4 fixture: two columns from 768 px (details, counts, answers left; attendance right), one column below
//  D-5 squad: at least 4 cards per row at 1280 px, one per row at 320 px
//  D-6 header: wider and on one row at 1280 px; header and footer edges line up with the page content
//  D-7 [regression guard] sign-in keeps the narrow card; D-7b settings is narrow and centred (it was 912 px wide before 20d)
//  D-8 [regression guard] at 320 and 390 px a card fills the page width minus the page padding
//  D-9 nothing is wider than 1200 px at 1440 px, and everything stays centred
//  D-10 axe colour contrast at 1280 px (home, fixture, squad)
// Data comes from page.route mocks (as in sessions 07, 14, 20a and 20b); squad, sign-in and settings are real.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { signInThroughForm } from './helpers';
// @ts-expect-error TS7016 plain .mjs module, typed locally
import * as seedData from '../../scripts/seed-data/index.mjs';

const { id: seedId } = seedData as unknown as { id: (kind: string, n: number) => string };
const MATCH = '00000006-0000-4000-8000-000000000100';
const SERVER_NOW = '2026-11-14T12:00:00.000Z';
const KICKOFF = '2026-11-14T19:00:00.000Z';

const json = (route: Route, status: number, data: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
const nextMatch = { id: MATCH, opponent: 'Fake Rovers', competition: 'Fake League', venue: 'Fake Park', kickoff_at: KICKOFF, cutoff_at: '2026-11-14T17:00:00.000Z', rsvp_open: true };
const TEAMS = ['Riverside Rovers', 'PINT FC', 'Harbor Town', 'Maple Athletic', 'Cedar Park United', 'Lakeside Wanderers', 'Ironbridge City', 'Northfield Albion'];
const home = {
  server_now: SERVER_NOW,
  next_match: nextMatch,
  record: { played: 10, won: 6, drawn: 2, lost: 2, goals_for: 19, goals_against: 12 },
  latest_results: [
    { match_id: '00000006-0000-4000-8000-000000000201', opponent: 'Fake Harbor', goals_for: 2, goals_against: 1, played_on: '2026-11-09' },
    { match_id: '00000006-0000-4000-8000-000000000202', opponent: 'Fake Maple', goals_for: 1, goals_against: 1, played_on: '2026-11-02' },
  ],
  standings: {
    taken_on: '2026-11-05',
    rows: TEAMS.map((team, i) => ({ position: i + 1, team, is_us: team === 'PINT FC', played: 10, goal_difference: 12 - i * 3, points: 22 - i * 2 })),
  },
};
const attendance = {
  server_now: SERVER_NOW,
  match: { ...nextMatch, status: 'scheduled' },
  counts: { going: 1, maybe: 1, not_going: 1, no_answer: 37 },
  attendees: [
    { player_id: seedId('player', 5), name: 'Fake Alpha', answer: 'going' },
    { player_id: seedId('player', 6), name: 'Fake Bravo', answer: 'maybe' },
    { player_id: seedId('player', 7), name: 'Fake Charlie', answer: 'not_going' },
  ],
  me: { answer: 'maybe', reason: 'Fake: late' },
};

const openHome = async (p: Page) => {
  await p.route('**/api/home', (r) => json(r, 200, home));
  await p.goto('/');
  for (const id of ['next-match-card', 'season-record', 'latest-results', 'mini-table']) await expect(p.getByTestId(id)).toBeVisible();
};
const openFixture = async (p: Page) => {
  await signInThroughForm(p, 'one');
  await p.route('**/api/fixtures/*/attendance', (r) => json(r, 200, attendance));
  await p.goto(`/fixtures/${MATCH}`);
  await expect(p.getByTestId('rsvp-going')).toBeVisible();
};

interface Box { x: number; y: number; width: number; height: number; right: number; bottom: number }
const box = async (p: Page, selector: string): Promise<Box> => {
  const b = await p.locator(selector).first().boundingBox();
  expect(b, selector).not.toBeNull();
  const r = b as { x: number; y: number; width: number; height: number };
  return { ...r, right: r.x + r.width, bottom: r.y + r.height };
};

const HOME = {
  next: 'section[aria-labelledby="next-match-title"]',
  record: 'section[aria-labelledby="season-record-title"]',
  results: 'section[aria-labelledby="latest-results-title"]',
  table: 'section[aria-labelledby="mini-table-title"]',
};

for (const width of [320, 390, 768, 1280]) {
  test(`D-3 [e2e] home layout at ${width} px: ${width >= 768 ? 'two columns' : 'one column'}, DOM order unchanged`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openHome(page);
    const [next, record, results, table] = [await box(page, HOME.next), await box(page, HOME.record), await box(page, HOME.results), await box(page, HOME.table)];
    // the DOM order is next match, record, results, table (keyboard and screen reader order)
    const order = await page.evaluate((sels) => {
      const els = sels.map((s) => document.querySelector(s) as Element);
      return els.slice(1).map((e, i) => Boolean(els[i].compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING));
    }, [HOME.next, HOME.record, HOME.results, HOME.table]);
    expect(order, 'DOM order').toEqual([true, true, true]);
    if (width >= 768) {
      expect(record.x, 'record is under the next match').toBeCloseTo(next.x, 0);
      expect(record.y, 'record is below the next match').toBeGreaterThanOrEqual(next.bottom);
      expect(table.x, 'table is under the results').toBeCloseTo(results.x, 0);
      expect(table.y, 'table is below the results').toBeGreaterThanOrEqual(results.bottom);
      expect(results.x, 'results are in the right column').toBeGreaterThanOrEqual(next.right);
      expect(Math.round(results.y), 'both columns start on the same line').toBe(Math.round(next.y));
    } else {
      // below 768 px the cards are as they were before 20d: stacked, each one centred (they are content-sized, see D-8)
      for (const [a, b] of [[next, record], [record, results], [results, table]] as const) {
        expect(b.y, 'one column: below the previous card').toBeGreaterThanOrEqual(a.bottom);
      }
      for (const b of [next, record, results, table]) expect(Math.abs(b.x + b.width / 2 - width / 2), 'centred').toBeLessThanOrEqual(1);
    }
  });

  test(`D-4 [e2e] fixture layout at ${width} px: ${width >= 768 ? 'two columns' : 'one column'}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openFixture(page);
    const details = await box(page, 'section[aria-label="Match details"]');
    const answers = await box(page, '[data-testid="my-answer"]');
    const list = await box(page, 'section[aria-labelledby="list-title"]');
    if (width >= 768) {
      expect(answers.x, 'answers under the details').toBeCloseTo(details.x, 0);
      expect(list.x, 'attendance in the right column').toBeGreaterThanOrEqual(details.right);
      expect(Math.round(list.y), 'both columns start on the same line').toBe(Math.round(details.y));
    } else {
      expect(list.y, 'one column: attendance below the answers').toBeGreaterThanOrEqual(answers.bottom);
      expect(answers.y, 'one column: answers below the details').toBeGreaterThanOrEqual(details.bottom);
      for (const b of [details, answers, list]) expect(Math.abs(b.x + b.width / 2 - width / 2), 'centred').toBeLessThanOrEqual(1);
    }
  });
}

test('D-2 [e2e] at 1280 px the page is up to 1200 px wide and a card is wider than 420 px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openHome(page);
  const pg = await box(page, 'div.page');
  expect(pg.width, 'page width').toBeGreaterThan(1100);
  expect(pg.width, 'page width').toBeLessThanOrEqual(1200);
  expect((await box(page, HOME.next)).width, 'card width').toBeGreaterThan(420);
});

for (const width of [320, 1280]) {
  test(`D-5 [e2e] squad cards per row at ${width} px: ${width >= 1200 ? 'at least 4' : 'one'}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/squad');
    await expect(page.getByTestId('page-squad')).toBeVisible();
    const perRow = await page.evaluate(() => {
      let most = 0;
      for (const group of Array.from(document.querySelectorAll('[data-testid^="squad-group-"]'))) {
        const rows = new Map<number, number>();
        for (const c of Array.from(group.querySelectorAll('[data-testid="squad-player"]'))) {
          const top = Math.round(c.getBoundingClientRect().top);
          rows.set(top, (rows.get(top) ?? 0) + 1);
        }
        most = Math.max(most, ...rows.values());
      }
      return most;
    });
    if (width >= 1200) expect(perRow, 'most cards on one row').toBeGreaterThanOrEqual(4);
    else expect(perRow, 'most cards on one row').toBe(1);
  });
}

test('D-6 [e2e] header at 1280 px is as wide as the page, on one row, and lines up with the content and the footer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInThroughForm(page, 'one');
  await openHome(page);
  const bar = await box(page, '.header-bar');
  expect(bar.width, 'header bar width').toBeGreaterThan(1100);
  expect(bar.width, 'header bar width').toBeLessThanOrEqual(1200);
  await expect(page.getByTestId('nav-toggle')).toBeHidden();
  const centres = [];
  for (const sel of ['.brand', '.nav-panel a.nav-link', '[data-testid="sign-out-button"]', '[data-testid="sign-out-all-button"]']) {
    const b = await box(page, sel);
    centres.push(Math.round(b.y + b.height / 2));
  }
  expect(Math.max(...centres) - Math.min(...centres), 'brand, links and buttons share one row').toBeLessThanOrEqual(2);
  const h1 = await box(page, 'h1');
  expect((await box(page, '.brand')).x, 'brand left edge = content left edge').toBeCloseTo(h1.x, 0);
  expect((await box(page, '.footer-inner .footer-brand')).x, 'footer left edge = content left edge').toBeCloseTo(h1.x, 0);
});

test('D-7 [e2e] regression guard: sign-in keeps the narrow card, centred, at 1280 px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/sign-in');
  const card = await box(page, '[data-testid="page-sign-in"] .card-narrow');
  expect(card.width).toBeLessThanOrEqual(420);
  expect(Math.abs(card.x + card.width / 2 - 640), 'centred').toBeLessThanOrEqual(1);
});

test('D-7b [e2e] settings is narrow (at most 420 px) and centred at 1280 px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInThroughForm(page, 'two');
  await page.goto('/settings');
  await expect(page.getByTestId('page-settings')).toBeVisible();
  await expect(page.locator('[data-testid="page-settings"] .card-narrow')).toHaveCount(1);
  const col = await box(page, '[data-testid="page-settings"] .card-narrow');
  expect(col.width).toBeLessThanOrEqual(420);
  expect(Math.abs(col.x + col.width / 2 - 640), 'centred').toBeLessThanOrEqual(1);
  const toggle = await box(page, '[data-testid="toggle-public"]');
  expect(toggle.right, 'the form is inside the narrow column').toBeLessThanOrEqual(col.right);
});

for (const width of [320, 390]) {
  test(`D-8 [e2e] regression guard: at ${width} px a card is centred and inside the 16 px page padding (as before 20d)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openHome(page);
    for (const sel of Object.values(HOME)) {
      const b = await box(page, sel);
      expect(b.x, `${sel} left`).toBeGreaterThanOrEqual(16 - 0.5);
      expect(b.right, `${sel} right`).toBeLessThanOrEqual(width - 16 + 0.5);
      expect(Math.abs(b.x + b.width / 2 - width / 2), `${sel} centred`).toBeLessThanOrEqual(1);
    }
  });
}

test('D-9 [e2e] at 1440 px page, header and footer are between 1100 and 1200 px wide and centred', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  for (const sel of ['div.page', '.header-bar', '.footer-inner']) {
    const b = await box(page, sel);
    expect(b.width, `${sel} width`).toBeGreaterThan(1100);
    expect(b.width, `${sel} width`).toBeLessThanOrEqual(1200);
    expect(Math.abs(b.x - (1440 - b.right)), `${sel} centred`).toBeLessThanOrEqual(1);
  }
  expect(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth))).toBe(0);
});

for (const [name, open] of [['home', openHome], ['fixture', openFixture], ['squad', async (p: Page) => { await p.goto('/squad'); }]] as const) {
  test(`D-10 [e2e] no colour-contrast violation at 1280 px: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    const result = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}
