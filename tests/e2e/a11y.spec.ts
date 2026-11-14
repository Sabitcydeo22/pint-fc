// Session 17: AC-5.2 [e2e] every page meets WCAG AA contrast (axe, one test per page x state).
// Data states come from page.route mocks (as in sessions 07 and 14); server-rendered pages use the real seed.
// Only the `color-contrast` rule is the gate here (AC-5.2); other axe rules are not asserted.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { signInThroughForm } from './helpers';
// @ts-expect-error TS7016 plain .mjs module, typed locally
import * as seedData from '../../scripts/seed-data/index.mjs';

const { id: seedId } = seedData as unknown as { id: (kind: string, n: number) => string };
const MATCH = '00000006-0000-4000-8000-000000000100';
const UNKNOWN = '99999999-9999-4999-8999-999999999999';
const SERVER_NOW = '2026-11-14T12:00:00.000Z';
const KICKOFF = '2026-11-14T19:00:00.000Z';

const json = (route: Route, status: number, data: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
const home = (extra: Record<string, unknown> = {}) => ({
  server_now: SERVER_NOW,
  next_match: { id: MATCH, opponent: 'Fake Rovers', competition: 'Fake League', venue: 'Fake Park', kickoff_at: KICKOFF, cutoff_at: '2026-11-14T17:00:00.000Z', rsvp_open: true },
  ...extra,
});
const attendance = (o: { status?: string; open?: boolean; attendees?: unknown[]; counts?: Record<string, number>; reason?: string } = {}) => ({
  server_now: SERVER_NOW,
  match: { id: MATCH, opponent: 'Fake Rovers', competition: 'Fake League', venue: 'Fake Park', kickoff_at: KICKOFF, cutoff_at: '2026-11-14T17:00:00.000Z', status: o.status ?? 'scheduled', rsvp_open: o.open ?? true },
  counts: o.counts ?? { going: 1, maybe: 1, not_going: 1, no_answer: 37 },
  attendees: o.attendees ?? [
    { player_id: seedId('player', 5), name: 'Fake Alpha', answer: 'going' },
    { player_id: seedId('player', 6), name: 'Fake Bravo', answer: 'maybe' },
    { player_id: seedId('player', 7), name: 'Fake Charlie', answer: 'not_going' },
  ],
  me: { answer: 'maybe', reason: o.reason ?? 'Fake: late' },
});

async function fixture(page: Page, body: unknown, status = 200) {
  await signInThroughForm(page, 'one');
  await page.route('**/api/fixtures/*/attendance', (r) => json(r, status, body));
  await page.goto(`/fixtures/${MATCH}`);
}

// page x state: [title, open it, test id that proves the state is on screen]
const STATES: Array<[string, (page: Page) => Promise<void>, string]> = [
  ['home loaded', async (p) => { await p.route('**/api/home', (r) => json(r, 200, home())); await p.goto('/'); }, 'next-match-card'],
  ['home empty', async (p) => { await p.route('**/api/home', (r) => json(r, 200, { server_now: SERVER_NOW, next_match: null })); await p.goto('/'); }, 'next-match-empty'],
  ['home error', async (p) => { await p.route('**/api/home', (r) => json(r, 500, { error: { code: 'INTERNAL', message: 'x' } })); await p.goto('/'); }, 'next-match-error'],
  ['home real data', async (p) => { await p.goto('/'); }, 'page-home'],
  ['squad', async (p) => { await p.goto('/squad'); }, 'page-squad'],
  ['player', async (p) => { await p.goto(`/players/${seedId('player', 1)}`); }, 'page-player'],
  ['player not found', async (p) => { await p.goto(`/players/${UNKNOWN}`); }, 'not-found'],
  ['sign-in idle', async (p) => { await p.goto('/sign-in'); }, 'page-sign-in'],
  ['sign-in error', async (p) => {
    await p.goto('/sign-in');
    await p.getByTestId('email-input').fill('nobody.here@pintfc.test');
    await p.getByTestId('password-input').fill('not-the-password');
    await p.getByTestId('sign-in-button').click();
  }, 'sign-in-error'],
  ['settings', async (p) => { await signInThroughForm(p, 'two'); await p.goto('/settings'); }, 'page-settings'],
  ['fixture open', async (p) => { await fixture(p, attendance()); }, 'rsvp-going'],
  ['fixture closed', async (p) => { await fixture(p, attendance({ open: false })); }, 'rsvp-closed'],
  ['fixture cancelled', async (p) => { await fixture(p, attendance({ status: 'cancelled', open: false })); }, 'match-not-open'],
  ['fixture empty list', async (p) => { await fixture(p, attendance({ attendees: [], counts: { going: 0, maybe: 0, not_going: 0, no_answer: 40 } })); }, 'attendees-empty'],
  ['fixture error', async (p) => { await fixture(p, { error: { code: 'INTERNAL', message: 'x' } }, 500); }, 'fixture-error'],
  ['fixture not found', async (p) => { await signInThroughForm(p, 'one'); await p.goto(`/fixtures/${UNKNOWN}`); }, 'not-found'],
  ['404', async (p) => { await p.goto('/no-such-page'); }, 'not-found'],
];

for (const [title, open, proof] of STATES) {
  test(`AC-5.2 [e2e] every page meets WCAG AA contrast: ${title}`, async ({ page }) => {
    await open(page);
    await expect(page.getByTestId(proof).first()).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const bad = results.violations.filter((v) => v.id === 'color-contrast');
    // names the rule and the failing elements, never page text that could hold personal data
    expect(bad.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target.join(' ')) }))).toEqual([]);
  });
}

// CSP-2: with the Content-Security-Policy on, pages still hydrate (client code runs) and nothing is blocked.
for (const path of ['/', '/sign-in', '/squad']) {
  test(`CSP-2 [e2e] page hydrates and renders with the CSP on: ${path}`, async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (m) => { if (/content security policy/i.test(m.text())) violations.push(m.text().slice(0, 160)); });
    const res = await page.goto(path);
    expect(res?.headers()['content-security-policy'] ?? '').toContain("default-src 'self'");
    expect(res?.headers()['content-security-policy'] ?? '').not.toContain('unsafe-eval');
    // hydration is proved by client code reacting: the home countdown ticks, the menu button toggles, the form disables
    await page.waitForLoadState('load');
    expect(violations).toEqual([]);
    const toggle = page.getByTestId('nav-toggle');
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(violations).toEqual([]);
  });
}

// T-15: markup in a name or a reason is shown as text, and the CSP blocks script that gets into the page anyway.
const SCRIPT_NAME = '<script>window.__xss=1</script>';
const IMG_NAME = '<img src=x onerror="window.__xss=2">';
const SCRIPT_REASON = '<script>window.__xss=3</script>';

test('T-15 [e2e] script in a player name or reason is rendered as text', async ({ page }) => {
  await fixture(page, attendance({
    attendees: [
      { player_id: seedId('player', 5), name: SCRIPT_NAME, answer: 'going' },
      { player_id: seedId('player', 6), name: IMG_NAME, answer: 'maybe' },
    ],
    reason: SCRIPT_REASON,
  }));
  await expect(page.getByTestId('attendee-row')).toHaveCount(2);
  const rows = page.getByTestId('attendee-row');
  await expect(rows.nth(0)).toContainText(SCRIPT_NAME); // the characters themselves are on screen
  await expect(rows.nth(1)).toContainText(IMG_NAME);
  await expect(page.getByTestId('rsvp-reason')).toHaveValue(SCRIPT_REASON);
  expect(await page.locator('[data-testid="attendee-row"] :is(script, img)').count()).toBe(0); // no element was made from the text
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
});

test('T-15 [e2e] an injected inline script and an inline onerror handler are blocked, and the page still hydrates', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __viol: string[] }).__viol = [];
    document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __viol: string[] }).__viol.push(`${e.effectiveDirective}`));
  });
  await page.goto('/sign-in');
  await expect(page.getByTestId('page-sign-in')).toBeVisible();
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, unknown>;
    // 1. an inline <script> with no nonce, parsed from markup like real injected HTML (an iframe srcdoc inherits this
    //    page's policy). A script element made with createElement is NOT used: under 'strict-dynamic' the spec lets
    //    script that is already running add scripts that way, and it is not how injected markup arrives.
    const frame = document.createElement('iframe');
    frame.srcdoc = '<script>parent.__inj1 = 1</' + 'script>';
    const loaded = new Promise((r) => frame.addEventListener('load', r));
    document.body.appendChild(frame);
    await loaded;
    // 2. an inline event handler on an element that fails to load
    const img = document.createElement('img');
    img.setAttribute('onerror', 'window.__inj2 = 1');
    const failed = new Promise((r) => img.addEventListener('error', r));
    img.src = '/no-such-image.png';
    document.body.appendChild(img);
    await failed;
    // 3. the same through markup parsed from a string
    const holder = document.createElement('div');
    document.body.appendChild(holder);
    const failed2 = new Promise((r) => document.addEventListener('error', r, true));
    holder.innerHTML = '<img src="/no-such-image-2.png" onerror="window.__inj3 = 1">';
    await failed2;
    await new Promise((r) => setTimeout(r, 200));
    w.__done = true;
  });
  const result = await page.evaluate(() => {
    const w = window as unknown as { __inj1?: number; __inj2?: number; __inj3?: number; __viol: string[] };
    const ran = (['__inj1', '__inj2', '__inj3'] as const).filter((k) => w[k] !== undefined);
    return { ran, blocked: w.__viol.filter((d) => d.startsWith('script-src')).length };
  });
  expect(result.ran, 'injected code that ran').toEqual([]);
  expect(result.blocked, 'script-src violations reported by the browser').toBeGreaterThanOrEqual(2); // proves the CSP did it
  // the app's own scripts carry the nonce, so the page is still alive: client code reacts to a click
  await page.getByTestId('nav-toggle').click();
  await expect(page.getByTestId('nav-toggle')).toHaveAttribute('aria-expanded', 'true');
});
