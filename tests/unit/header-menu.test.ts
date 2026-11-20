// Session 20e-2 (unit, no browser): POL-U1 the signed-in header is one "name ▾" button (items not drawn while closed),
// POL-U2 the page h1 uses a visually-hidden class that keeps it for screen readers, POL-U3 the nav links have no underline
// rule of their own to undo, POL-8 [guard] the small light text on the hero stays at least 4.5:1 on both navies.
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Header from '../../src/components/Header';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const css = read('src/app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');
const tokens: Record<string, string> = {};
for (const m of (/:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '').matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();
const rest = css.replace(/:root\s*\{[^}]*\}/, '');
const bodyOf = (sel: string) =>
  [...rest.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].split(',').map((s) => s.trim()).includes(sel)).map((m) => m[2]).join('\n');
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('POL-U1 the signed-in header is one account button', () => {
  const html = renderToStaticMarkup(createElement(Header, { player: { displayName: 'Fake Player' } }));
  it('POL-U1 [unit] one button shows the name and a ▾, collapsed, with aria-controls', () => {
    const trigger = /<button[^>]*data-testid="account-trigger"[^>]*>([\s\S]*?)<\/button>/.exec(html);
    expect(trigger, 'a button with data-testid="account-trigger"').not.toBeNull();
    expect(trigger?.[0]).toContain('aria-expanded="false"');
    expect(trigger?.[0]).toContain('aria-controls="');
    expect(trigger?.[1]).toContain('Fake Player');
    expect(trigger?.[1]).toContain('▾');
  });
  it('POL-U1 [unit] while closed, the three items are not in the page', () => {
    expect(html).not.toContain('data-testid="sign-out-button"');
    expect(html).not.toContain('data-testid="sign-out-all-button"');
    expect(html).not.toContain('My settings');
  });
  it('POL-U1 [unit] a visitor still gets "Sign in" and no account button', () => {
    const visitor = renderToStaticMarkup(createElement(Header, { player: null }));
    expect(visitor).toContain('data-testid="sign-in-link"');
    expect(visitor).not.toContain('account-trigger');
  });
});

describe('POL-U2 the page title is kept for screen readers', () => {
  it('POL-U2 [unit] the home h1 has the sr-only class and the class hides it by clipping, not display: none', () => {
    expect(read('src/app/page.tsx')).toMatch(/<h1 className="sr-only">PINT FC<\/h1>/);
    const rule = bodyOf('.sr-only');
    expect(rule).toMatch(/position:\s*absolute/);
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).toMatch(/width:\s*1px/);
    expect(rule).not.toMatch(/display:\s*none|visibility:\s*hidden/);
  });
});

describe('POL-U3 header links', () => {
  it('POL-U3 [unit] nav links, the brand and the account button set text-decoration: none', () => {
    for (const sel of ['.nav-panel a.nav-link', '.brand']) expect(bodyOf(sel), sel).toMatch(/text-decoration:\s*none/);
  });
});

describe('POL-8 contrast of the small text on the hero (guard)', () => {
  it('POL-8 [unit] guard: the light blue-gray text is at least 4.5:1 on both navies and .hero .muted uses it', () => {
    expect(bodyOf('.hero .muted')).toMatch(/color:\s*var\(--on-dark-muted\)/);
    for (const ground of ['primary', 'primary-deep']) expect(ratio(tokens['on-dark-muted'], tokens[ground]), ground).toBeGreaterThanOrEqual(4.5);
  });
});
