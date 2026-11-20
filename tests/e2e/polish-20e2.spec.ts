// Session 20e-2: squad chip and equal cards, header links and account menu, hero fixes.
//  POL-1  squad number is a rounded chip beside the name; two-digit numbers are not clipped (320, 390)
//  POL-2  squad cards in one row have equal height, also with a long wrapped name (768, 1280)
//  POL-3  header links: no underline, one style, a visible focus cue
//  POL-4  signed in: one "name ▾" button; the three items appear only when it is open; the panel floats
//  POL-5  the menu: aria-expanded, Escape closes and returns focus, an outside click closes, Tab reaches the items
//  POL-6  GUARD: both sign-out items still end on the home page, signed out
//  POL-7  the h1 "PINT FC" is hidden visually but stays in the accessibility tree
//  POL-9  axe: no colour-contrast violation inside the hero; every hero text passes 4.5:1 on the darkest and lightest navy
//  POL-10 "RSVP closes ... EST" never leaves the zone alone on a line (320, 360, 390)
//  POL-11 GUARD: no sideways scroll on home, squad and with the menu open, signed in (320, 390, 1280)
// (POL-8, the contrast of the tokens, is in tests/unit/header-menu.test.ts.)
// Home data comes from page.route mocks (as in sessions 07, 14 and 20e-1); the squad and the header use the real seed.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { openMenuIfCollapsed, signInThroughForm } from './helpers';

const MATCH = '00000006-0000-4000-8000-000000000100';
const SERVER_NOW = '2026-11-14T12:00:00.000Z';
const json = (route: Route, status: number, data: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
const home = (open = true) => ({
  server_now: SERVER_NOW,
  next_match: { id: MATCH, opponent: 'Fake Rovers', competition: 'Fake League', venue: 'Fake Park', kickoff_at: '2026-11-14T19:00:00.000Z', cutoff_at: '2026-11-14T17:00:00.000Z', rsvp_open: open },
  record: { played: 10, won: 6, drawn: 2, lost: 2, goals_for: 19, goals_against: 12 },
  latest_results: [{ match_id: '00000006-0000-4000-8000-000000000201', opponent: 'Fake Harbor', goals_for: 2, goals_against: 1, played_on: '2026-11-09' }],
  standings: { taken_on: '2026-11-05', rows: [{ position: 1, team: 'PINT FC', is_us: true, played: 10, goal_difference: 7, points: 20 }] },
});
async function openHome(page: Page, width: number, open = true) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.route('**/api/home', (r) => json(r, 200, home(open)));
  await page.goto('/');
  await expect(page.getByTestId('next-match-card')).toBeVisible();
}
const overflow = (page: Page) => page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));

// ---------- squad ----------
for (const width of [320, 390]) {
  test(`POL-1 [e2e] the shirt number is beside the name, inside its card, and two digits are not clipped at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/squad');
    await expect(page.getByTestId('squad-player').first()).toBeVisible();
    const r = await page.evaluate(() => {
      const out = { cards: 0, noChip: 0, notBeside: 0, outside: 0, clipped: 0, twoDigit: 0 };
      for (const card of Array.from(document.querySelectorAll<HTMLElement>('[data-testid="squad-player"]'))) {
        out.cards++;
        const chip = card.querySelector<HTMLElement>('.squad-badge');
        const name = card.querySelector<HTMLElement>('.squad-name');
        if (!chip || !name) { out.noChip++; continue; }
        const c = chip.getBoundingClientRect();
        const n = name.getBoundingClientRect();
        const k = card.getBoundingClientRect();
        if (!(c.right <= n.left + 0.5 && Math.abs(c.top + c.height / 2 - (n.top + n.height / 2)) <= c.height)) out.notBeside++;
        if (c.left < k.left - 0.5 || c.right > k.right + 0.5 || c.top < k.top - 0.5 || c.bottom > k.bottom + 0.5) out.outside++;
        if (chip.scrollWidth > chip.clientWidth + 0.5) out.clipped++;
        if ((chip.textContent ?? '').trim().length >= 2) {
          out.twoDigit++;
          const range = document.createRange();
          range.selectNodeContents(chip);
          const t = range.getBoundingClientRect();
          if (t.width > c.width - 0.5 || range.getClientRects().length > 1) out.clipped++;
        }
      }
      return out;
    });
    expect(r.cards, 'cards').toBe(37);
    expect(r.noChip, 'cards without a chip').toBe(0);
    expect(r.notBeside, 'chips not beside the name').toBe(0);
    expect(r.outside, 'chips outside their card').toBe(0);
    expect(r.twoDigit, 'two-digit numbers on the page').toBeGreaterThan(0);
    expect(r.clipped, 'clipped numbers').toBe(0);
  });
}

for (const width of [768, 1280]) {
  test(`POL-2 [e2e] squad cards in one row have equal height, also with a long wrapped name, at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/squad');
    await expect(page.getByTestId('squad-player').first()).toBeVisible();
    await page.evaluate(() => {
      const names = document.querySelectorAll('.squad-name');
      // test data only: the first name of each group becomes a long one, so its card wraps to more lines
      document.querySelectorAll('.squad-grid').forEach((grid) => {
        const n = grid.querySelector('.squad-name');
        if (n) n.textContent = 'Fake Christopher Alexander Montgomery-Wellington III';
      });
      void names;
    });
    const r = await page.evaluate(() => {
      let rows = 0;
      let uneven = 0;
      let tallest = 0;
      for (const grid of Array.from(document.querySelectorAll('.squad-grid'))) {
        const byRow = new Map<number, number[]>();
        for (const li of Array.from(grid.children)) {
          const card = li.querySelector('.squad-card') as HTMLElement;
          const top = Math.round(li.getBoundingClientRect().top);
          byRow.set(top, [...(byRow.get(top) ?? []), card.getBoundingClientRect().height]);
          tallest = Math.max(tallest, card.getBoundingClientRect().height);
        }
        for (const heights of byRow.values()) {
          rows++;
          if (heights.length > 1 && Math.max(...heights) - Math.min(...heights) > 1) uneven++;
        }
      }
      return { rows, uneven, tallest };
    });
    expect(r.tallest, 'the long name really wrapped (a card taller than one line)').toBeGreaterThan(60);
    expect(r.uneven, 'rows whose cards differ in height').toBe(0);
  });
}

// ---------- header ----------
test('POL-3 [e2e] header links have no underline, one style, and a visible focus cue', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const styles = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.site-header a'));
    return els.map((e) => {
      const cs = getComputedStyle(e);
      return { text: (e.textContent ?? '').trim(), line: cs.textDecorationLine, weight: cs.fontWeight, colour: cs.color, size: cs.fontSize };
    });
  });
  expect(styles.length, 'brand, Home, Squad, Sign in').toBeGreaterThanOrEqual(4);
  expect(styles.filter((s) => s.line !== 'none').map((s) => s.text), 'links with a default underline').toEqual([]);
  const nav = styles.slice(1);
  for (const key of ['weight', 'colour', 'size'] as const) expect(new Set(nav.map((s) => s[key])).size, `one ${key} for the nav links`).toBe(1);
  await page.locator('.nav-panel a.nav-link').first().focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  const outline = await page.locator('.nav-panel a.nav-link').first().evaluate((e) => ({ style: getComputedStyle(e).outlineStyle, width: parseFloat(getComputedStyle(e).outlineWidth) }));
  expect(outline.style, 'focus outline').not.toBe('none');
  expect(outline.width, 'focus outline width').toBeGreaterThanOrEqual(2);
});

test('POL-4 [e2e] signed in: one "name ▾" button; the three items show only when it is open and the panel floats (1280 px)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInThroughForm(page, 'one');
  const trigger = page.getByTestId('account-trigger');
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveText(/\S.*▾/);
  await expect(page.locator('.site-header .nav-link:visible')).toHaveCount(2); // Home, Squad
  for (const id of ['sign-out-button', 'sign-out-all-button', 'settings-link']) await expect(page.getByTestId(id)).toBeHidden();
  const barBefore = (await page.locator('.header-bar').boundingBox())?.height ?? 0;
  await trigger.click();
  for (const id of ['settings-link', 'sign-out-button', 'sign-out-all-button']) await expect(page.getByTestId(id)).toBeVisible();
  await expect(page.getByTestId('settings-link')).toHaveText('My settings');
  await expect(page.getByTestId('sign-out-button')).toHaveText('Sign out');
  await expect(page.getByTestId('sign-out-all-button')).toHaveText('Sign out of all devices');
  const barAfter = (await page.locator('.header-bar').boundingBox())?.height ?? 0;
  expect(barAfter, 'the header does not grow: the panel floats over the page').toBe(barBefore);
  const panel = (await page.getByTestId('account-panel').boundingBox()) as { x: number; width: number };
  expect(panel.x + panel.width, 'the panel stays inside the screen').toBeLessThanOrEqual(1280);
});

test('POL-5 [e2e] the account menu: aria-expanded, Escape closes and returns focus, outside click closes, Tab reaches the items', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInThroughForm(page, 'one');
  const trigger = page.getByTestId('account-trigger');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  const controls = await trigger.getAttribute('aria-controls');
  expect(controls, 'aria-controls names the panel').toBeTruthy();
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(await page.getByTestId('account-panel').getAttribute('id'), 'aria-controls points at the panel').toBe(controls);
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('settings-link')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('sign-out-button')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('sign-out-all-button')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('sign-out-button')).toBeHidden();
  await expect(trigger, 'focus returns to the button').toBeFocused();
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.mouse.click(600, 600);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await page.getByTestId('settings-link').click();
  await expect(page.getByTestId('page-settings')).toBeVisible();
});

for (const [testId, label] of [['sign-out-button', 'Sign out'], ['sign-out-all-button', 'Sign out of all devices']] as const) {
  test(`POL-6 [e2e] guard: "${label}" in the menu ends on the home page, signed out`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInThroughForm(page, 'other');
    const trigger = page.getByTestId('account-trigger');
    if ((await trigger.count()) > 0) await trigger.click(); // before 20e-2 the items are always on screen
    await page.getByTestId(testId).click();
    await expect(page.getByTestId('sign-in-link')).toBeVisible();
    await expect(page.getByTestId('account-menu')).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe('/');
    expect((await page.context().cookies()).some((c) => c.name === 'pf_session' && c.value !== ''), 'no session cookie').toBe(false);
  });
}

test('POL-4b [e2e] on a phone the account menu lives inside the Menu drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInThroughForm(page, 'one');
  await page.reload();
  await expect(page.getByTestId('account-trigger')).toBeHidden();
  await openMenuIfCollapsed(page);
  await expect(page.getByTestId('account-trigger')).toBeVisible();
  await expect(page.getByTestId('sign-out-button')).toBeHidden();
  await page.getByTestId('account-trigger').click();
  for (const id of ['settings-link', 'sign-out-button', 'sign-out-all-button']) await expect(page.getByTestId(id)).toBeVisible();
});

// ---------- hero ----------
test('POL-7 [e2e] the h1 "PINT FC" is hidden visually but stays in the accessibility tree', async ({ page }) => {
  await openHome(page, 1280);
  const heading = page.getByRole('heading', { level: 1, name: 'PINT FC' });
  await expect(heading, 'one h1 for screen readers').toHaveCount(1);
  const b = (await heading.boundingBox()) as { width: number; height: number };
  expect(b.width, 'visual width').toBeLessThanOrEqual(1);
  expect(b.height, 'visual height').toBeLessThanOrEqual(1);
  const cs = await heading.evaluate((e) => ({ position: getComputedStyle(e).position, overflow: getComputedStyle(e).overflow, display: getComputedStyle(e).display, visibility: getComputedStyle(e).visibility }));
  expect(cs.position).toBe('absolute');
  expect(cs.overflow).toBe('hidden');
  expect(cs.display, 'not display: none').not.toBe('none');
  expect(cs.visibility, 'not visibility: hidden').toBe('visible');
});

for (const open of [true, false]) {
  test(`POL-9 [e2e] hero text passes AA 4.5:1 on both navies, and axe finds no contrast problem in the hero (RSVP ${open ? 'open' : 'closed'}, 390 px)`, async ({ page }) => {
    await openHome(page, 390, open);
    const axe = await new AxeBuilder({ page }).include('[data-testid="hero"]').withRules(['color-contrast']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 60)).join(' | ')}`), 'axe violations in the hero').toEqual([]);
    const r = await page.evaluate(() => {
      const parse = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const lum = (c: number[]) => { const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = (a: number[], b: number[]) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
      const rootStyle = getComputedStyle(document.documentElement);
      const navy = (name: string) => { const v = rootStyle.getPropertyValue(name).trim(); const n = parseInt(v.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
      const grounds = [navy('--primary'), navy('--primary-deep')];
      const hero = document.querySelector('[data-testid="hero"]') as HTMLElement;
      const worst: { text: string; ratio: number }[] = [];
      for (const e of Array.from(hero.querySelectorAll<HTMLElement>('*'))) {
        if (e.children.length > 0 || (e.textContent ?? '').trim() === '' || e.closest('a, svg')) continue;
        // the first opaque background behind the text: its own (chip, tile) or else both navies
        let bg: number[][] = grounds;
        for (let el: HTMLElement | null = e; el && el !== hero; el = el.parentElement) {
          const c = getComputedStyle(el).backgroundColor;
          if (c !== 'rgba(0, 0, 0, 0)') { bg = [parse(c)]; break; }
        }
        const fg = parse(getComputedStyle(e).color);
        worst.push({ text: (e.textContent ?? '').trim().slice(0, 20), ratio: Math.min(...bg.map((b) => ratio(fg, b))) });
      }
      worst.sort((a, b) => a.ratio - b.ratio);
      return { checked: worst.length, lowest: worst.slice(0, 3) };
    });
    expect(r.checked, 'hero text nodes checked').toBeGreaterThan(6);
    expect(r.lowest[0].ratio, `lowest hero text contrast: ${JSON.stringify(r.lowest)}`).toBeGreaterThanOrEqual(4.5);
  });
}

for (const width of [320, 360, 390]) {
  test(`POL-10 [e2e] "RSVP closes ... EST" never leaves the time zone alone on a line at ${width} px`, async ({ page }) => {
    await openHome(page, width);
    const r = await page.getByTestId('rsvp-cutoff').evaluate((el) => {
      // React splits the text into several text nodes: walk all of them
      const words: { word: string; top: number }[] = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        for (const m of (n.textContent ?? '').matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(n, m.index ?? 0);
          range.setEnd(n, (m.index ?? 0) + m[0].length);
          words.push({ word: m[0], top: Math.round(range.getBoundingClientRect().top) });
        }
      }
      const text = words.map((w) => w.word).join(' ');
      const last = words[words.length - 1];
      const alone = words.filter((w) => w.top === last.top);
      return { text: text.trim(), lines: new Set(words.map((w) => w.top)).size, lastLineWords: alone.map((w) => w.word), zone: last.word };
    });
    expect(r.zone, 'the last word is the time zone').toMatch(/^[A-Z]{2,5}$/);
    expect(r.lastLineWords.length, `the last line is only "${r.lastLineWords.join(' ')}" in: ${r.text}`).toBeGreaterThan(1);
  });
}

// ---------- no sideways scroll ----------
for (const width of [320, 390, 1280]) {
  test(`POL-11 [e2e] guard: no sideways scroll on home, squad and with the account menu open, signed in, at ${width} px`, async ({ page }) => {
    await signInThroughForm(page, 'one');
    await page.setViewportSize({ width, height: 844 });
    await page.route('**/api/home', (r) => json(r, 200, home()));
    for (const path of ['/', '/squad']) {
      await page.goto(path);
      await expect(page.getByTestId(path === '/' ? 'page-home' : 'page-squad')).toBeVisible();
      expect(await overflow(page), `${path} horizontal scroll`).toBe(0);
    }
    await page.goto('/');
    await openMenuIfCollapsed(page);
    if ((await page.getByTestId('account-trigger').count()) > 0) await page.getByTestId('account-trigger').click();
    await expect(page.getByTestId('sign-out-all-button')).toBeVisible();
    expect(await overflow(page), 'horizontal scroll with the menu open').toBe(0);
  });
}

// ---------- renders for the owner to look at (no assertion beyond "the page is there") ----------
test('POL-12 [e2e] renders: squad, home, signed-in header closed and open', async ({ page }) => {
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/squad');
    await expect(page.getByTestId('page-squad')).toBeVisible();
    await page.screenshot({ path: `screenshots/squad-20e2-${width}.png`, fullPage: false });
    await page.route('**/api/home', (r) => json(r, 200, home()));
    await page.goto('/');
    await expect(page.getByTestId('next-match-card')).toBeVisible();
    await page.screenshot({ path: `screenshots/home-20e2-${width}.png`, fullPage: false });
  }
  await signInThroughForm(page, 'one');
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.goto('/');
  await page.screenshot({ path: 'screenshots/header-20e2-signed-in-1280.png', clip: { x: 0, y: 0, width: 1280, height: 120 } });
  await page.getByTestId('account-trigger').click();
  await expect(page.getByTestId('account-panel')).toBeVisible();
  await page.screenshot({ path: 'screenshots/header-20e2-menu-open-1280.png', clip: { x: 0, y: 0, width: 1280, height: 300 } });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await openMenuIfCollapsed(page);
  await page.getByTestId('account-trigger').click();
  await expect(page.getByTestId('account-panel')).toBeVisible();
  await page.screenshot({ path: 'screenshots/header-20e2-menu-open-390.png', clip: { x: 0, y: 0, width: 390, height: 420 } });
});
