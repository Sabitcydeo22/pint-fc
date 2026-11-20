// Session 20e-1: MID-1, the home page at the widths between 768 and 1200 px (and the two sides of the 1200 px rule), not
// only at 768 and 1280. One test per width. Parts that already worked are regression guards (marked); the hero and the
// one-row record are new. Data comes from page.route mocks.
import { expect, test, type Page, type Route } from '@playwright/test';

const MATCH = '00000006-0000-4000-8000-000000000100';
const SERVER_NOW = '2026-11-14T12:00:00.000Z';
const WIDTHS = [768, 800, 900, 1024, 1100, 1199, 1200];

const json = (route: Route, status: number, data: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
const TEAMS = ['Riverside Rovers', 'PINT FC', 'Harbor Town', 'Maple Athletic', 'Cedar Park United', 'Lakeside Wanderers', 'Ironbridge City', 'Northfield Albion'];
const home = {
  server_now: SERVER_NOW,
  next_match: { id: MATCH, opponent: 'Lakeside Wanderers Reserves', competition: 'Fake League', venue: 'Fake Park', kickoff_at: new Date(Date.parse(SERVER_NOW) + (100 * 24 + 1) * 3600 * 1000).toISOString(), cutoff_at: '2026-11-14T17:00:00.000Z', rsvp_open: true },
  record: { played: 10, won: 6, drawn: 2, lost: 2, goals_for: 19, goals_against: 12 },
  latest_results: ['Harbor', 'Maple', 'Cedar', 'Lake', 'Iron'].map((n, i) => ({ match_id: `00000006-0000-4000-8000-00000000020${i + 1}`, opponent: `Fake ${n}`, goals_for: 2, goals_against: i % 3, played_on: `2026-11-0${9 - i}` })),
  standings: { taken_on: '2026-11-05', rows: TEAMS.map((team, i) => ({ position: i + 1, team, is_us: team === 'PINT FC', played: 10, goal_difference: 12 - i * 3, points: 22 - i * 2 })) },
};

async function openHome(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/api/home', (r) => json(r, 200, home));
  await page.goto('/');
  for (const id of ['next-match-card', 'season-record', 'latest-results', 'mini-table']) await expect(page.getByTestId(id)).toBeVisible();
}

for (const width of WIDTHS) {
  test(`MID-1 [e2e] home at ${width} px: hero, one-row record, side-by-side cards, nothing overflows`, async ({ page }) => {
    await openHome(page, width);
    const m = await page.evaluate(() => {
      const rect = (s: string) => { const r = (document.querySelector(s) as HTMLElement).getBoundingClientRect(); return { x: r.x, right: r.right, top: r.top, bottom: r.bottom }; };
      const tiles = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="countdown-tile"]'));
      const wrap = document.querySelector('[data-testid="countdown"]') as HTMLElement;
      const hero = document.querySelector('[data-testid="hero"]') as HTMLElement | null;
      const opponent = document.querySelector('[data-testid="next-match-opponent"]') as HTMLElement;
      const words = (opponent.textContent ?? '').split(/\s+/);
      const broken: string[] = [];
      const node = opponent.firstChild as Text;
      let at = 0;
      for (const w of words) {
        const i = (node.textContent ?? '').indexOf(w, at);
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + w.length);
        if (range.getClientRects().length > 1) broken.push(w);
        at = i + w.length;
      }
      return {
        heroFound: hero !== null,
        heroOverflow: hero ? hero.scrollWidth - hero.clientWidth : -1,
        pageOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        tileTops: tiles.map((t) => Math.round(t.getBoundingClientRect().top)),
        tilesOutside: tiles.filter((t) => t.getBoundingClientRect().right > wrap.getBoundingClientRect().right + 0.5).length,
        statTops: Array.from(document.querySelectorAll('[data-testid="season-record"] .stat')).map((e) => Math.round(e.getBoundingClientRect().top)),
        results: rect('section[aria-labelledby="latest-results-title"]'),
        table: rect('section[aria-labelledby="mini-table-title"]'),
        headerHeight: (document.querySelector('[data-testid="site-header"]') as HTMLElement).getBoundingClientRect().height,
        brokenOpponentWords: broken,
        buttonHeight: (document.querySelector('[data-testid="go-to-event"]') as HTMLElement).getBoundingClientRect().height,
      };
    });
    // guards: these were already true before 20e-1
    expect(m.pageOverflow, 'guard: no horizontal scroll').toBe(0);
    expect(m.headerHeight, 'guard: the header is at most two lines').toBeLessThanOrEqual(112);
    expect(m.buttonHeight, 'guard: the action is a 44 px target').toBeGreaterThanOrEqual(44);
    // new in 20e-1
    expect(m.heroFound, 'the hero band exists').toBe(true);
    expect(m.heroOverflow, 'nothing sticks out of the hero').toBeLessThanOrEqual(0);
    expect(new Set(m.tileTops).size, 'countdown tiles on one row').toBe(1);
    expect(m.tilesOutside, 'countdown tiles outside their box').toBe(0);
    expect(m.brokenOpponentWords, 'opponent words broken inside a word').toEqual([]);
    expect(m.statTops.length, 'six stats').toBe(6);
    expect(new Set(m.statTops).size, 'six stats in one row').toBe(1);
    expect(m.results.right, 'results left of the table').toBeLessThanOrEqual(m.table.x);
    expect(Math.abs(m.results.top - m.table.top), 'results and table start on one line').toBeLessThanOrEqual(1);
    expect(Math.abs(m.results.bottom - m.table.bottom), 'results and table end on one line').toBeLessThanOrEqual(24);
  });
}
