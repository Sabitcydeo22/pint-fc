// Session 20a: DESIGN-7 [e2e] one gap between the sections of a page (the --space-4 token, 16 px) at 320, 390, 768 and
// 1280 px, DESIGN-8 [e2e] the accent colour is on exactly one element of the home page, DESIGN-9 [e2e] the focus ring
// comes from the focus tokens. Data comes from page.route mocks (as in sessions 07 and 14); squad and player are real.
import { expect, test, type Page, type Route } from '@playwright/test';
import { signInThroughForm } from './helpers';
// @ts-expect-error TS7016 plain .mjs module, typed locally
import * as seedData from '../../scripts/seed-data/index.mjs';

const { id: seedId } = seedData as unknown as { id: (kind: string, n: number) => string };
const MATCH = '00000006-0000-4000-8000-000000000100';
const SERVER_NOW = '2026-11-14T12:00:00.000Z';
const KICKOFF = '2026-11-14T19:00:00.000Z';
const WIDTHS = [320, 390, 768, 1280];

const json = (route: Route, status: number, data: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
const nextMatch = { id: MATCH, opponent: 'Fake Rovers', competition: 'Fake League', venue: 'Fake Park', kickoff_at: KICKOFF, cutoff_at: '2026-11-14T17:00:00.000Z', rsvp_open: true };
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
    rows: [
      { position: 1, team: 'Fake Rovers', is_us: false, played: 10, goal_difference: 12, points: 22 },
      { position: 2, team: 'PINT FC', is_us: true, played: 10, goal_difference: 7, points: 20 },
    ],
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

/**
 * The vertical gaps between the visible sections of the page's <main>, in px, per column (session 20d).
 * Below 768 px the page is one stack: wrappers with `display: contents` (.home-grid, .home-col, .fx-grid, .fx-col) are
 * looked through, so the sections are the same as before 20d. From 768 px the home and event pages put a two-column
 * grid under the h1: the grid is one item of the main stack (the gap h1 to grid), and each column is a stack of its own.
 */
const gaps = (page: Page, mainTestId: string) =>
  page.evaluate((id) => {
    const main = document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
    const top: Element[] = [];
    const groups: Element[][] = [top];
    let wrappers = 0;
    const collect = (parent: Element, group: Element[]) => {
      for (const el of Array.from(parent.children)) {
        if (getComputedStyle(el).display === 'contents') {
          collect(el, group);
        } else if (/(^|\s)(home|fx)-grid(\s|$)/.test(el.className)) {
          wrappers++;
          group.push(el);
          for (const col of Array.from(el.children)) {
            const own: Element[] = [];
            groups.push(own);
            collect(col, own);
          }
        } else {
          group.push(el);
        }
      }
    };
    collect(main, top);
    let count = 0;
    const out: number[] = [];
    for (const group of groups) {
      const rects = group.map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0);
      count += rects.length;
      out.push(...rects.slice(1).map((r, i) => Math.round((r.top - rects[i].bottom) * 100) / 100));
    }
    return { count: count - wrappers, columns: groups.length - 1, gaps: out };
  }, mainTestId);

const PAGES: Array<[string, (page: Page) => Promise<void>, string, number]> = [
  ['home', async (p) => {
    await p.route('**/api/home', (r) => json(r, 200, home));
    await p.goto('/');
    for (const id of ['next-match-card', 'season-record', 'latest-results', 'mini-table']) await expect(p.getByTestId(id)).toBeVisible();
  }, 'page-home', 5],
  ['fixture', async (p) => {
    await signInThroughForm(p, 'one');
    await p.route('**/api/fixtures/*/attendance', (r) => json(r, 200, attendance));
    await p.goto(`/fixtures/${MATCH}`);
    await expect(p.getByTestId('rsvp-going')).toBeVisible();
  }, 'page-fixture', 5],
  ['squad', async (p) => {
    await p.goto('/squad');
    await expect(p.getByTestId('squad-group-GK')).toBeVisible();
  }, 'page-squad', 5],
  ['player', async (p) => {
    await p.goto(`/players/${seedId('player', 1)}`);
    await expect(p.getByTestId('player-name')).toBeVisible();
  }, 'page-player', 2],
];

for (const width of WIDTHS) {
  for (const [title, open, mainId, minChildren] of PAGES) {
    test(`DESIGN-7 [e2e] one 16 px gap between the sections of ${title} at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await open(page);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--space-4').trim())).toBe('16px');
      const { count, columns, gaps: g } = await gaps(page, mainId);
      expect(columns, `columns of ${mainId}`).toBe(width >= 768 && (title === 'home' || title === 'fixture') ? 2 : 0);
      expect(count, `visible children of ${mainId}`).toBeGreaterThanOrEqual(minChildren);
      expect(g, `gaps between the children of ${mainId}`).toEqual(g.map(() => 16));
    });
  }
}

test('DESIGN-8 [e2e] the accent colour is on exactly one element of the home page: the action', async ({ page }) => {
  await page.route('**/api/home', (r) => json(r, 200, home));
  await page.goto('/');
  await expect(page.getByTestId('go-to-event')).toBeVisible();
  const result = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.background = 'var(--accent)';
    document.body.appendChild(probe);
    const accent = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const users = Array.from(document.querySelectorAll('body *')).filter((e) => getComputedStyle(e).backgroundColor === accent);
    return { accent, users: users.map((e) => e.getAttribute('data-testid') ?? e.tagName.toLowerCase()) };
  });
  expect(result.users).toEqual(['go-to-event']);
});

test('DESIGN-9 [e2e] the focus ring is 3 px and comes from the focus tokens (white on the navy header)', async ({ page }) => {
  await page.route('**/api/home', (r) => json(r, 200, home));
  await page.goto('/');
  await expect(page.getByTestId('go-to-event')).toBeVisible();
  const ring = () =>
    page.evaluate(() => {
      const probe = (v: string) => {
        const d = document.createElement('div');
        d.style.color = `var(${v})`;
        document.body.appendChild(d);
        const c = getComputedStyle(d).color;
        d.remove();
        return c;
      };
      const el = document.activeElement as HTMLElement;
      const s = getComputedStyle(el);
      return { id: el.getAttribute('data-testid') ?? el.className, width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor, focus: probe('--focus'), onDark: probe('--focus-on-dark') };
    });
  await page.keyboard.press('Tab'); // the brand link in the navy header
  const header = await ring();
  expect([header.width, header.style, header.color]).toEqual(['3px', 'solid', header.onDark]);
  for (let i = 0; i < 20 && (await ring()).id !== 'go-to-event'; i++) await page.keyboard.press('Tab');
  const action = await ring();
  expect([action.id, action.width, action.style, action.color]).toEqual(['go-to-event', '3px', 'solid', action.focus]);
});
