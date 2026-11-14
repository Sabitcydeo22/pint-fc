// Session 17: AC-5.4 [e2e] no horizontal scroll at 320 px, one test per page (the widest state of each page).
import { expect, test, type Page, type Route } from '@playwright/test';
import { SMALL_PHONE, signInThroughForm } from './helpers';
// @ts-expect-error TS7016 plain .mjs module, typed locally
import * as seedData from '../../scripts/seed-data/index.mjs';

const { id: seedId } = seedData as unknown as { id: (kind: string, n: number) => string };
const MATCH = '00000006-0000-4000-8000-000000000100';
const UNKNOWN = '99999999-9999-4999-8999-999999999999';
const json = (route: Route, status: number, data: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
const LONG = 'Fake-Extraordinarily-Long-Unbroken-Player-Name-That-Must-Wrap-Without-Scrolling';

const overflow = (page: Page) => page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
// the elements that stick out, for a failure message (tag + test id only, no page text)
const wide = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('body *'))
      .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 0.5)
      .slice(0, 5)
      .map((e) => `${e.tagName.toLowerCase()}[${e.getAttribute('data-testid') ?? ''}]`),
  );

const PAGES: Array<[string, (page: Page) => Promise<void>, string]> = [
  ['home', async (p) => {
    await p.route('**/api/home', (r) => json(r, 200, {
      server_now: '2026-11-14T12:00:00.000Z',
      next_match: { id: MATCH, opponent: LONG, competition: LONG, venue: LONG, kickoff_at: '2026-11-14T19:00:00.000Z', cutoff_at: '2026-11-14T17:00:00.000Z', rsvp_open: true },
    }));
    await p.goto('/');
  }, 'next-match-card'],
  ['squad', async (p) => { await p.goto('/squad'); }, 'page-squad'],
  ['player', async (p) => { await p.goto(`/players/${seedId('player', 1)}`); }, 'page-player'],
  ['player not found', async (p) => { await p.goto(`/players/${UNKNOWN}`); }, 'not-found'],
  ['sign-in', async (p) => { await p.goto('/sign-in'); }, 'page-sign-in'],
  ['settings', async (p) => { await signInThroughForm(p, 'two'); await p.goto('/settings'); }, 'page-settings'],
  ['fixture', async (p) => {
    await signInThroughForm(p, 'one');
    await p.route('**/api/fixtures/*/attendance', (r) => json(r, 200, {
      server_now: '2026-11-14T12:00:00.000Z',
      match: { id: MATCH, opponent: LONG, competition: LONG, venue: LONG, kickoff_at: '2026-11-14T19:00:00.000Z', cutoff_at: '2026-11-14T17:00:00.000Z', status: 'scheduled', rsvp_open: true },
      counts: { going: 1, maybe: 0, not_going: 0, no_answer: 39 },
      attendees: [{ player_id: seedId('player', 5), name: LONG, answer: 'going' }],
      me: { answer: 'going', reason: LONG },
    }));
    await p.goto(`/fixtures/${MATCH}`);
  }, 'page-fixture'],
  ['404', async (p) => { await p.goto('/no-such-page'); }, 'not-found'],
];

for (const [title, open, proof] of PAGES) {
  test(`AC-5.4 [e2e] no horizontal scroll at 320 px: ${title}`, async ({ page }) => {
    await page.setViewportSize(SMALL_PHONE);
    await open(page);
    await expect(page.getByTestId(proof).first()).toBeVisible();
    expect({ overflow: await overflow(page), sticking_out: await wide(page) }).toEqual({ overflow: 0, sticking_out: [] });
  });
}
