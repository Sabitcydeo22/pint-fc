// Session 10 end-to-end tests: the public squad and player profile pages (390 px, no sign-in: these pages are public).
// They use the real seeded data. Who is visible and who consented to what is read from the seed's own data module,
// so the expectations never copy a name or a flag by hand.
import { expect, test } from '@playwright/test';
import { SMALL_PHONE } from './helpers';
// @ts-expect-error TS7016 plain .mjs module, typed locally
import * as seedData from '../../scripts/seed-data/index.mjs';

interface SeedPlayer {
  id: string;
  full_name: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  shirt_number: number;
  show_photo: boolean;
  show_nationality: boolean;
  show_stats: boolean;
  photo_url: string | null;
  nationality: string | null;
}
const { staticData, id: seedId } = seedData as unknown as {
  staticData: () => { players: SeedPlayer[] };
  id: (kind: string, n: number) => string;
};
const players = staticData().players;
const byNumber = (n: number) => players[n - 1]; // player n of the seed
const idOf = (n: number) => seedId('player', n);

// who is hidden: player 21 is the minor WITH consent (public), 34 the minor without (hidden), 10 and 28 opted out, 41 archived
const HIDDEN = [34, 10, 28, 41];
const UNKNOWN_ID = '99999999-9999-4999-8999-999999999999';
const adults = players.map((p, i) => ({ p, n: i + 1 })).filter(({ n }) => n !== 21 && !HIDDEN.includes(n));
const everything = adults.find(({ p }) => p.show_photo && p.photo_url && p.show_nationality && p.nationality && p.show_stats);
const nothing = adults.find(({ p }) => !p.show_photo && !p.show_nationality && !p.show_stats && p.nationality);

test('AC-4.1.1 [e2e] squad lists active visible players grouped by position', async ({ page }) => {
  const res = await page.goto('/squad');
  expect(res?.status()).toBe(200);
  await expect(page.getByTestId('page-squad')).toBeVisible();
  for (const [pos, heading] of [['GK', 'Goalkeepers'], ['DEF', 'Defenders'], ['MID', 'Midfielders'], ['FWD', 'Forwards']] as const) {
    const group = page.getByTestId(`squad-group-${pos}`);
    await expect(group).toHaveCount(1);
    await expect(group.getByRole('heading', { level: 2 })).toHaveText(heading);
  }
  await expect(page.getByTestId('squad-player')).toHaveCount(37);
  // a known visible player: in the right group, with name and shirt number
  const p = byNumber(1);
  const card = page.getByTestId(`squad-group-${p.position}`).getByTestId('squad-player').filter({ hasText: p.full_name });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText(String(p.shirt_number));
  await expect(card).toHaveAttribute('href', `/players/${idOf(1)}`);
  await expect(page.getByTestId('squad-empty')).toHaveCount(0);
});

test('AC-4.1.2 [e2e] archived player never appears and their profile is 404', async ({ page }) => {
  const archived = byNumber(41);
  await page.goto('/squad');
  await expect(page.getByTestId('page-squad')).toBeVisible();
  expect((await page.content()).includes(archived.full_name)).toBe(false);
  expect((await page.content()).includes(idOf(41))).toBe(false);
  const res = await page.goto(`/players/${idOf(41)}`);
  expect(res?.status()).toBe(404);
  await expect(page.getByTestId('not-found')).toBeVisible();
  expect((await page.content()).includes(archived.full_name)).toBe(false);
});

test('AC-4.2.1 [e2e] profile shows name, position and number', async ({ page }) => {
  const p = byNumber(1);
  await page.goto('/squad');
  await page.getByTestId('squad-player').filter({ hasText: p.full_name }).click();
  await expect(page).toHaveURL(new RegExp(`/players/${idOf(1)}$`));
  await expect(page.getByTestId('page-player')).toBeVisible();
  await expect(page.getByTestId('player-name')).toHaveText(p.full_name);
  await expect(page.getByTestId('player-position')).toHaveText('Goalkeeper');
  await expect(page.getByTestId('player-number')).toContainText(String(p.shirt_number));
  await expect(page.getByTestId('back-to-squad')).toHaveAttribute('href', '/squad');
});

test('AC-4.2.2 [e2e] photo, nationality and stats appear only when consented', async ({ page }) => {
  expect(everything, 'the seed has a player who consented to everything').toBeDefined();
  expect(nothing, 'the seed has a player who consented to nothing').toBeDefined();

  await page.goto(`/players/${idOf((everything as { n: number }).n)}`);
  await expect(page.getByTestId('page-player')).toBeVisible();
  await expect(page.getByTestId('player-photo')).toHaveCount(1);
  await expect(page.getByTestId('player-nationality')).toContainText((everything as { p: SeedPlayer }).p.nationality as string);
  await expect(page.getByTestId('player-stats')).toBeVisible();

  const quiet = nothing as { n: number; p: SeedPlayer };
  await page.goto(`/players/${idOf(quiet.n)}`);
  await expect(page.getByTestId('page-player')).toBeVisible();
  await expect(page.getByTestId('player-name')).toHaveText(quiet.p.full_name);
  // absent from the DOM, not merely hidden
  for (const id of ['player-photo', 'player-nationality', 'player-stats']) await expect(page.getByTestId(id)).toHaveCount(0);
  expect((await page.content()).includes(quiet.p.nationality as string)).toBe(false);
});

test('T-10 [e2e] hidden and archived players return an identical 404', async ({ page }) => {
  const targets: [string, string][] = [
    ['hidden minor', idOf(34)],
    ['opted-out adult', idOf(10)],
    ['archived player', idOf(41)],
    ['unknown id', UNKNOWN_ID],
  ];
  const texts: string[] = [];
  const pages: string[] = [];
  for (const [label, id] of targets) {
    const res = await page.goto(`/players/${id}`);
    expect(res?.status(), label).toBe(404);
    await expect(page.getByTestId('not-found'), label).toBeVisible();
    await expect(page.getByTestId('page-player'), label).toHaveCount(0);
    texts.push(await page.getByTestId('not-found').innerText());
    // what a visitor SEES never repeats the id; the framework keeps the requested URL in its own page payload for every
    // route, so the raw HTML is compared below instead, with the requested id masked
    expect(await page.locator('body').innerText(), `${label}: the id is not shown`).not.toContain(id);
    const html = await page.content();
    for (const n of HIDDEN) expect(html.includes(byNumber(n).full_name), `${label} must not name player ${n}`).toBe(false);
    // Next prefetches /squad (header, footer and back links) and appends that route's chunk as a <script src> to <head>
    // whenever the prefetch finishes, so a capture can land before or after it. Only those tags are removed; every
    // other byte of the document is still compared.
    // The CSP nonce (src/middleware.ts) is different on every request and appears inside the framework's page payload
    // as an escaped JSON property. Only that property's value is masked.
    pages.push(html.replaceAll(id, '<ID>').replace(/<script src="\/_next\/static\/chunks\/[^"]*"><\/script>/g, '').replace(/\\"nonce\\":\\"[A-Za-z0-9+/]{48}\\"/g, '\\"nonce\\":\\"<NONCE>\\"'));
  }
  expect(new Set(texts).size, 'one and the same page for hidden, archived and unknown').toBe(1);
  // and the whole document is the same for a hidden, an archived and a never-existed player
  for (let i = 1; i < pages.length; i++) expect(pages[i] === pages[0], `${targets[i][0]} renders the same page as ${targets[0][0]}`).toBe(true);
  // an id that is not a uuid at all: the same page
  const bad = await page.goto('/players/not-a-uuid');
  expect(bad?.status()).toBe(404);
  expect(await page.getByTestId('not-found').innerText()).toBe(texts[0]);
});

test('SQUAD-E2E-1 [e2e] at 320 px the squad and a profile do not scroll sideways', async ({ page }) => {
  await page.setViewportSize(SMALL_PHONE);
  for (const path of ['/squad', `/players/${idOf((everything as { n: number }).n)}`, `/players/${UNKNOWN_ID}`]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
