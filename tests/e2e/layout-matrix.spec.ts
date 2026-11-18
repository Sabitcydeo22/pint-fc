// Session 20b: the layout matrix at 320, 390, 768 and 1280 px.
//  L-1 team names in the league table never break inside a word      (defect 1)
//  L-2 the answer buttons are one line each, 44 px high, stacked below 480 px   (defect 4)
//  L-3 no horizontal scroll on every page
//  L-4 every button, link and checkbox row is at least 44 px
//  L-5 card padding is 12 px below 360 px and 16 px from 360 px; sign-in keeps the narrow card
// Data comes from page.route mocks (as in sessions 07, 14 and 20a); squad, player, sign-in and settings are real.
import { expect, test, type Page, type Route } from '@playwright/test';
import { signInThroughForm } from './helpers';
// @ts-expect-error TS7016 plain .mjs module, typed locally
import * as seedData from '../../scripts/seed-data/index.mjs';

const { id: seedId } = seedData as unknown as { id: (kind: string, n: number) => string };
const MATCH = '00000006-0000-4000-8000-000000000100';
const UNKNOWN = '99999999-9999-4999-8999-999999999999';
const SERVER_NOW = '2026-11-14T12:00:00.000Z';
const KICKOFF = '2026-11-14T19:00:00.000Z';
const WIDTHS = [320, 390, 768, 1280];

const json = (route: Route, status: number, data: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
const nextMatch = { id: MATCH, opponent: 'Fake Rovers', competition: 'Fake League', venue: 'Fake Park', kickoff_at: KICKOFF, cutoff_at: '2026-11-14T17:00:00.000Z', rsvp_open: true };
const TEAMS = ['Riverside Rovers', 'PINT FC', 'Harbor Town', 'Maple Athletic', 'Cedar Park United', 'Lakeside Wanderers', 'Ironbridge City', 'Northfield Albion'];
const home = {
  server_now: SERVER_NOW,
  next_match: nextMatch,
  record: { played: 10, won: 6, drawn: 2, lost: 2, goals_for: 19, goals_against: 12 },
  latest_results: [{ match_id: '00000006-0000-4000-8000-000000000201', opponent: 'Fake Harbor', goals_for: 2, goals_against: 1, played_on: '2026-11-09' }],
  standings: {
    taken_on: '2026-11-05',
    rows: TEAMS.map((team, i) => ({ position: i + 1, team, is_us: team === 'PINT FC', played: 10, goal_difference: 12 - i * 3, points: 22 - i * 2 })),
  },
};
const attendance = {
  server_now: SERVER_NOW,
  match: { ...nextMatch, status: 'scheduled' },
  counts: { going: 1, maybe: 1, not_going: 1, no_answer: 37 },
  attendees: [{ player_id: seedId('player', 5), name: 'Fake Alpha', answer: 'going' }],
  me: { answer: 'maybe', reason: 'Fake: late' },
};

const openHome = async (p: Page) => {
  await p.route('**/api/home', (r) => json(r, 200, home));
  await p.goto('/');
  await expect(p.getByTestId('mini-table')).toBeVisible();
};
const openFixture = async (p: Page) => {
  await signInThroughForm(p, 'one');
  await p.route('**/api/fixtures/*/attendance', (r) => json(r, 200, attendance));
  await p.goto(`/fixtures/${MATCH}`);
  await expect(p.getByTestId('rsvp-going')).toBeVisible();
};

const PAGES: Array<[string, (p: Page) => Promise<void>, string]> = [
  ['home', openHome, 'page-home'],
  ['squad', async (p) => { await p.goto('/squad'); }, 'page-squad'],
  ['player', async (p) => { await p.goto(`/players/${seedId('player', 1)}`); }, 'page-player'],
  ['player not found', async (p) => { await p.goto(`/players/${UNKNOWN}`); }, 'not-found'],
  ['sign-in', async (p) => { await p.goto('/sign-in'); }, 'page-sign-in'],
  ['settings', async (p) => { await signInThroughForm(p, 'two'); await p.goto('/settings'); }, 'page-settings'],
  ['fixture', openFixture, 'page-fixture'],
  ['404', async (p) => { await p.goto('/no-such-page'); }, 'not-found'],
];

for (const width of WIDTHS) {
  test(`L-1 [e2e] league table team names never break inside a word at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openHome(page);
    const broken = await page.evaluate(() => {
      const out: string[] = [];
      for (const cell of Array.from(document.querySelectorAll('[data-testid="mini-table"] tbody td:nth-child(2)'))) {
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          for (const m of (n.textContent ?? '').matchAll(/\S+/g)) {
            const range = document.createRange();
            range.setStart(n, m.index ?? 0);
            range.setEnd(n, (m.index ?? 0) + m[0].length);
            if (range.getClientRects().length > 1) out.push(m[0]); // a word on two lines was broken inside
          }
        }
        if (cell.scrollWidth > cell.clientWidth + 1) out.push(`(overflow) ${cell.textContent}`);
      }
      return out;
    });
    expect(broken, 'words broken across lines').toEqual([]);
  });

  test(`L-2 [e2e] answer buttons are one line, 44 px high, and stacked below 480 px at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openFixture(page);
    const boxes = [];
    for (const id of ['rsvp-going', 'rsvp-maybe', 'rsvp-not-going']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, id).not.toBeNull();
      boxes.push({ id, ...(box as { x: number; y: number; width: number; height: number }) });
    }
    for (const b of boxes) {
      expect(b.height, `${b.id} height`).toBeGreaterThanOrEqual(44);
      expect(b.height, `${b.id} is one line`).toBeLessThanOrEqual(48);
    }
    const tops = new Set(boxes.map((b) => Math.round(b.y)));
    if (width < 480) expect(tops.size, 'stacked: one button per row').toBe(3);
    else expect(tops.size, 'side by side: one row').toBe(1);
    const fits = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.fx-choice')).every((b) => b.scrollWidth <= b.clientWidth));
    expect(fits, 'no label wider than its button').toBe(true);
  });

  for (const [title, open, proof] of PAGES) {
    test(`L-3 [e2e] no horizontal scroll: ${title} at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await open(page);
      await expect(page.getByTestId(proof).first()).toBeVisible();
      expect(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth))).toBe(0);
    });
  }

  for (const [title, open, proof] of PAGES.filter(([t]) => ['home', 'squad', 'sign-in', 'settings', 'fixture'].includes(t))) {
    test(`L-4 [e2e] every button, link and checkbox row is at least 44 px: ${title} at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await open(page);
      await expect(page.getByTestId(proof).first()).toBeVisible();
      const small = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('a[href], button, input:not([type=hidden])'))) {
          // a checkbox is tapped through its row (the label), the box itself only has to be 24 px (WCAG 2.5.8)
          const target = el instanceof HTMLInputElement && el.type === 'checkbox' ? (el.parentElement as HTMLElement) : el;
          const r = target.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue; // hidden (for example the menu on a wide screen)
          if (r.width < 44 || r.height < 44) out.push(`${el.tagName.toLowerCase()}[${el.getAttribute('data-testid') ?? el.textContent?.trim().slice(0, 20)}] ${Math.round(r.width)}x${Math.round(r.height)}`);
          if (el instanceof HTMLInputElement && el.type === 'checkbox' && (el.getBoundingClientRect().width < 24 || el.getBoundingClientRect().height < 24)) out.push(`checkbox ${el.getAttribute('data-testid')} smaller than 24 px`);
        }
        return out;
      });
      expect(small, 'targets smaller than 44 px').toEqual([]);
    });
  }

  test(`L-5 [e2e] card padding is ${width < 360 ? 12 : 16} px at ${width} px, and sign-in keeps the narrow card`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openHome(page);
    const pad = await page.getByTestId('next-match-card').evaluate((el) => getComputedStyle(el).paddingLeft);
    expect(pad).toBe(width < 360 ? '12px' : '16px');
    await page.goto('/sign-in');
    await expect(page.getByTestId('page-sign-in').locator('.card-narrow')).toHaveCount(1);
  });
}
