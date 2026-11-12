// Session 12 (end-to-end): the public-page crawl for invariant 1 (AC-4.3.1, T-12). A visitor with no session opens every
// public page: the home page, /squad, /sign-in, all 41 player profile ids (visible, hidden, archived), an unknown id and a
// missing page, plus the two private pages (they must redirect without showing anything). For each page the test scans
//   - the raw HTML the server sent, and the DOM after the browser ran (text and HTML),
//   - every JSON response the page fetched from /api,
// with `assertNoPii` and against the seed's own private values. Failure messages name the page, never the value.
// A page inventory fails when a new page exists that this crawl does not know about.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { assertNoPii } from '../../src/lib/privacy';
// @ts-expect-error TS7016 plain .mjs module, typed locally
import * as seedData from '../../scripts/seed-data/index.mjs';

interface SeedPlayer {
  email: string;
  phone: string | null;
  date_of_birth: string;
}
const { staticData, id: seedId } = seedData as unknown as {
  staticData: () => { players: SeedPlayer[] };
  id: (kind: string, n: number) => string;
};

interface Private {
  label: string;
  value: string;
}
const secrets: Private[] = [];
staticData().players.forEach((p, i) => {
  secrets.push({ label: `player ${i + 1} email`, value: p.email });
  if (p.phone) secrets.push({ label: `player ${i + 1} phone`, value: p.phone });
  secrets.push({ label: `player ${i + 1} date of birth`, value: String(p.date_of_birth).slice(0, 10) });
});

const UNKNOWN_ID = '99999999-9999-4999-8999-999999999999';
const playerPaths = Array.from({ length: 41 }, (_, i) => `/players/${seedId('player', i + 1)}`);
// pages a visitor can open; `redirects` marks the private pages that must send a visitor to /sign-in
const PAGES: { path: string; label: string; redirects?: boolean }[] = [
  { path: '/', label: 'home' },
  { path: '/sign-in', label: 'sign-in' },
  { path: '/squad', label: 'squad' },
  ...playerPaths.map((p, i) => ({ path: p, label: `player ${i + 1} profile` })),
  { path: `/players/${UNKNOWN_ID}`, label: 'unknown profile' },
  { path: '/players/not-a-uuid', label: 'malformed profile' },
  { path: '/settings', label: 'settings (private)', redirects: true },
  { path: `/fixtures/${seedId('match', 100)}`, label: 'fixture (private)', redirects: true },
  { path: '/no-such-page', label: 'missing page' },
];

/** Findings for one text (HTML, DOM text or a JSON body): empty means clean. */
function scan(where: string, text: string): string[] {
  const out: string[] = [];
  const hit = secrets.filter((s) => text.includes(s.value));
  if (hit.length) out.push(`${where}: contains ${hit.length} private value(s), e.g. ${hit.slice(0, 3).map((s) => s.label).join(', ')}`);
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* HTML and plain text are scanned as a string */
  }
  try {
    assertNoPii(parsed);
  } catch (e) {
    out.push(`${where}: ${(e as Error).message.split('\n').slice(1, 4).join(' ').trim()}`);
  }
  return out;
}

interface Visit {
  status: number;
  finalPath: string;
  findings: string[];
  apiCalls: number;
  html: string;
  apiTexts: string[];
}

async function visit(page: Page, p: { path: string; label: string }): Promise<Visit> {
  const apiBodies: { url: string; text: string }[] = [];
  const onResponse = async (res: import('@playwright/test').Response) => {
    const url = new URL(res.url());
    if (url.pathname.startsWith('/api/')) {
      const text = await res.text().catch(() => '');
      apiBodies.push({ url: url.pathname, text });
    }
  };
  page.on('response', onResponse);
  const res = await page.goto(p.path);
  await page.waitForLoadState('networkidle');
  page.off('response', onResponse);

  const raw = res ? await res.text().catch(() => '') : '';
  const dom = await page.content();
  const bodyText = await page.locator('body').innerText();
  const findings = [
    ...scan(`${p.label} [server html]`, raw),
    ...scan(`${p.label} [dom]`, dom),
    ...scan(`${p.label} [text]`, bodyText),
    ...apiBodies.flatMap((b) => scan(`${p.label} [api ${b.url}]`, b.text)),
  ];
  return { status: res?.status() ?? 0, finalPath: new URL(page.url()).pathname, findings, apiCalls: apiBodies.length, html: dom, apiTexts: apiBodies.map((b) => b.text) };
}

test.describe.configure({ timeout: 240_000 });

test('AC-4.3.1 [e2e] no public page or network response contains email, phone, date of birth or RSVP', async ({ page }) => {
  const findings: string[] = [];
  const statuses: Record<string, number> = {};
  let apiCalls = 0;
  for (const p of PAGES) {
    const v = await visit(page, p);
    findings.push(...v.findings);
    statuses[p.label] = v.status;
    apiCalls += v.apiCalls;
    if (p.redirects) expect(v.finalPath, `${p.label} sends a visitor to /sign-in`).toBe('/sign-in');
  }
  // the crawl really looked at things: the home page fetched JSON, the squad and the visible profiles are 200
  expect(apiCalls, 'the home page sections fetched /api/home').toBeGreaterThanOrEqual(4);
  expect(statuses.squad).toBe(200);
  expect(statuses.home).toBe(200);
  expect(statuses['unknown profile']).toBe(404);
  expect(statuses['missing page']).toBe(404);
  const okProfiles = Object.entries(statuses).filter(([k, s]) => /^player \d+ profile$/.test(k) && s === 200).length;
  expect(okProfiles, '37 of the 41 profiles are public').toBe(37);
  expect(findings, 'private data on public pages').toEqual([]);
});

test('AC-4.3.1 [e2e] links found by following the site from the home page lead only to pages this crawl knows', async ({ page }) => {
  const known = new Set(['/', '/sign-in', '/squad', '/settings', ...playerPaths]);
  const seen = new Set<string>();
  const queue = ['/', '/squad'];
  const unknown: string[] = [];
  while (queue.length) {
    const next = queue.shift() as string;
    if (seen.has(next)) continue;
    seen.add(next);
    await page.goto(next);
    await page.waitForLoadState('networkidle');
    const hrefs = await page.locator('a[href]').evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href') ?? ''));
    for (const h of hrefs) {
      if (!h.startsWith('/') || h.startsWith('//') || h.startsWith('/api/')) continue;
      const clean = h.split('#')[0].split('?')[0] || '/';
      if (clean.startsWith('/fixtures/')) continue; // private, covered by the main crawl
      if (!known.has(clean)) unknown.push(`${next} links to ${clean}`);
      if (!seen.has(clean) && known.has(clean)) queue.push(clean);
    }
  }
  expect(unknown, 'pages linked from the site that the crawl does not cover').toEqual([]);
  expect(seen.size, 'the follow-the-links crawl visited the squad and profiles').toBeGreaterThan(30);
});

test('T-12 [e2e] visitor never receives RSVP data', async ({ page }) => {
  const rsvpWords = /attendance|attendees|not_going|no_answer|rsvp_list|going_count|maybe_count/i;
  const problems: string[] = [];
  for (const p of PAGES) {
    const v = await visit(page, p);
    if (rsvpWords.test(v.html)) problems.push(`${p.label}: page carries an attendance word`);
    // the only RSVP thing a visitor may see is the home chip about the MATCH (open or closed), never about a player
    const rsvpIds = (v.html.match(/data-testid="rsvp[^"]*"/g) ?? []).filter((t) => t !== 'data-testid="rsvp-status"' && t !== 'data-testid="rsvp-cutoff"');
    if (rsvpIds.length) problems.push(`${p.label}: unexpected RSVP element ${rsvpIds.join(', ')}`);
    // a count or flag about RSVPs is RSVP data too (assertNoPii's key list has `going` but not `going_count`)
    for (const text of v.apiTexts) {
      const keys = [...text.matchAll(/"([A-Za-z_]+)"\s*:/g)].map((m) => m[1]);
      const bad = keys.filter((k) => /rsvp|attend|going|maybe|answer|reason|respon/i.test(k) && k !== 'rsvp_open');
      if (bad.length) problems.push(`${p.label}: API key that looks like RSVP data: ${[...new Set(bad)].join(', ')}`);
    }
  }
  expect(problems).toEqual([]);

  // the home page's JSON: the next match has no counts or lists
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const home = await page.request.get('/api/home');
  const body = (await home.json()) as { next_match: Record<string, unknown> | null };
  expect(Object.keys(body.next_match ?? {}).sort()).toEqual(['competition', 'cutoff_at', 'id', 'kickoff_at', 'opponent', 'rsvp_open', 'venue']);
});

test('PAGE-INVENTORY [e2e] every page file is known to the crawl (add new pages to the crawl when they are added)', () => {
  const root = path.join(process.cwd(), 'src', 'app');
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'api') walk(full);
      } else if (entry.name === 'page.tsx') {
        found.push('/' + path.relative(root, path.dirname(full)).split(path.sep).join('/'));
      }
    }
  };
  walk(root);
  expect(found.map((f) => (f === '/.' || f === '/' ? '/' : f)).sort()).toEqual(['/', '/fixtures/[id]', '/players/[id]', '/settings', '/sign-in', '/squad'].sort());
});
