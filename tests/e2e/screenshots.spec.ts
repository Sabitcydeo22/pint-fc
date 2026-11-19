// Session 17: screenshots for the owner (release requirement #4). Every page x state at 390 px and 320 px, written to
// screenshots/ (gitignored). Files are only ever overwritten by the same name; nothing is deleted.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';
import { signInThroughForm } from './helpers';
// @ts-expect-error TS7016 plain .mjs module, typed locally
import * as seedData from '../../scripts/seed-data/index.mjs';

const { id: seedId } = seedData as unknown as { id: (kind: string, n: number) => string };
const MATCH = '00000006-0000-4000-8000-000000000100';
const UNKNOWN = '99999999-9999-4999-8999-999999999999';
const SERVER_NOW = '2026-11-14T12:00:00.000Z';
const KICKOFF = '2026-11-14T19:00:00.000Z';
const OUT = path.resolve(import.meta.dirname, '..', '..', 'screenshots');

const json = (route: Route, status: number, data: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
const nextMatch = { id: MATCH, opponent: 'Fake Rovers', competition: 'Fake League', venue: 'Fake Park', kickoff_at: KICKOFF, cutoff_at: '2026-11-14T17:00:00.000Z', rsvp_open: true };
const attendance = (o: { status?: string; open?: boolean; attendees?: unknown[] } = {}) => ({
  server_now: SERVER_NOW,
  match: { ...nextMatch, status: o.status ?? 'scheduled', rsvp_open: o.open ?? true },
  counts: { going: 1, maybe: 1, not_going: 1, no_answer: 37 },
  attendees: o.attendees ?? [
    { player_id: seedId('player', 5), name: 'Fake Alpha', answer: 'going' },
    { player_id: seedId('player', 6), name: 'Fake Bravo', answer: 'maybe' },
    { player_id: seedId('player', 7), name: 'Fake Charlie', answer: 'not_going' },
  ],
  me: { answer: 'maybe', reason: 'Fake: late' },
});
async function fixture(page: Page, body: unknown, status = 200) {
  await signInThroughForm(page, 'one');
  await page.route('**/api/fixtures/*/attendance', (r) => json(r, status, body));
  await page.goto(`/fixtures/${MATCH}`);
}

const SHOTS: Array<[string, (page: Page) => Promise<void>, string]> = [
  ['home-loaded', async (p) => { await p.route('**/api/home', (r) => json(r, 200, { server_now: SERVER_NOW, next_match: nextMatch })); await p.goto('/'); }, 'next-match-card'],
  ['home-empty', async (p) => { await p.route('**/api/home', (r) => json(r, 200, { server_now: SERVER_NOW, next_match: null })); await p.goto('/'); }, 'next-match-empty'],
  ['home-error', async (p) => { await p.route('**/api/home', (r) => json(r, 500, { error: { code: 'INTERNAL', message: 'x' } })); await p.goto('/'); }, 'next-match-error'],
  ['home-real-data', async (p) => { await p.goto('/'); }, 'page-home'],
  ['squad', async (p) => { await p.goto('/squad'); }, 'page-squad'],
  ['player', async (p) => { await p.goto(`/players/${seedId('player', 1)}`); }, 'page-player'],
  ['player-not-found', async (p) => { await p.goto(`/players/${UNKNOWN}`); }, 'not-found'],
  ['sign-in-idle', async (p) => { await p.goto('/sign-in'); }, 'page-sign-in'],
  ['sign-in-error', async (p) => {
    await p.goto('/sign-in');
    await p.getByTestId('email-input').fill('nobody.here@pintfc.test');
    await p.getByTestId('password-input').fill('not-the-password');
    await p.getByTestId('sign-in-button').click();
  }, 'sign-in-error'],
  ['settings', async (p) => { await signInThroughForm(p, 'two'); await p.goto('/settings'); }, 'page-settings'],
  ['fixture-open', async (p) => { await fixture(p, attendance()); }, 'rsvp-going'],
  ['fixture-closed', async (p) => { await fixture(p, attendance({ open: false })); }, 'rsvp-closed'],
  ['fixture-cancelled', async (p) => { await fixture(p, attendance({ status: 'cancelled', open: false })); }, 'match-not-open'],
  ['fixture-empty-list', async (p) => { await fixture(p, attendance({ attendees: [] })); }, 'attendees-empty'],
  ['fixture-error', async (p) => { await fixture(p, { error: { code: 'INTERNAL', message: 'x' } }, 500); }, 'fixture-error'],
  ['fixture-not-found', async (p) => { await signInThroughForm(p, 'one'); await p.goto(`/fixtures/${UNKNOWN}`); }, 'not-found'],
  ['404', async (p) => { await p.goto('/no-such-page'); }, 'not-found'],
];

for (const [name, open, proof] of SHOTS) {
  test(`SHOTS [e2e] screenshots at 390 px, 320 px and 1280 px: ${name}`, async ({ browser }) => {
    fs.mkdirSync(OUT, { recursive: true });
    for (const width of [390, 320, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, baseURL: 'http://localhost:3100' });
      try {
        const page = await context.newPage();
        await open(page);
        await expect(page.getByTestId(proof).first()).toBeVisible();
        await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`), fullPage: true });
        expect(fs.statSync(path.join(OUT, `${name}-${width}.png`)).size).toBeGreaterThan(1000);
      } finally {
        await context.close();
      }
    }
  });
}
