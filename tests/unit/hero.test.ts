// Session 20e-1: the home hero band. HERO-1 only a local /img/ path can ever be a photo, HERO-2 the photo slot stays empty
// until the owner hands over a consented file, HERO-3 the band renders the graphic fallback or the photo with its shade,
// HERO-7 the worst photo (pure white) under the shade still gives white text at least 4.5:1. CARD-2 the card has an accent
// top edge. Nothing here starts a browser.
import fs from 'node:fs';
import path from 'node:path';
import { createElement, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Hero from '../../src/components/Hero';
import { HERO_PHOTO, heroPhotoSrc } from '../../src/lib/hero';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const css = fs.readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rootBody = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
const tokens: Record<string, string> = {};
for (const m of rootBody.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();
const rest = css.replace(/:root\s*\{[^}]*\}/, '');
/** The declarations of every rule (outside @media too) whose selector list contains `sel`. */
const bodyOf = (sel: string) =>
  [...rest.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1].split(',').map((s) => s.trim()).includes(sel))
    .map((m) => m[2])
    .join('\n');

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const mix = (top: string, bottom: string, alpha: number) =>
  '#' + [1, 3, 5].map((i) => Math.round(parseInt(top.slice(i, i + 2), 16) * alpha + parseInt(bottom.slice(i, i + 2), 16) * (1 - alpha)).toString(16).padStart(2, '0')).join('');

describe('HERO-1 only a local image path is accepted as the hero photo', () => {
  const good = ['/img/hero.jpg', '/img/team-photo.webp', '/img/a-b-1.png'];
  const bad = ['https://example.com/x.jpg', 'http://example.com/x.jpg', '//example.com/x.jpg', 'data:image/png;base64,AAAA', '/img/../secret.jpg', '/img/x.svg?x=1', 'img/hero.jpg', '/other/hero.jpg', '/img/x.jpg"onerror="1', '', '  ', 'javascript:alert(1)'];
  for (const src of good) it(`HERO-1 [unit] accepts ${src}`, () => expect(heroPhotoSrc(src)).toBe(src));
  for (const src of bad) it(`HERO-1 [unit] rejects ${JSON.stringify(src)}`, () => expect(heroPhotoSrc(src)).toBeNull());
  it('HERO-1 [unit] null and undefined give no photo', () => {
    expect(heroPhotoSrc(null)).toBeNull();
    expect(heroPhotoSrc(undefined)).toBeNull();
  });
});

describe('HERO-2 the photo slot is empty until the owner provides a consented photo', () => {
  it('HERO-2 [unit] HERO_PHOTO is null (guard: nothing is added by the agent)', () => {
    expect(HERO_PHOTO).toBeNull();
  });
  it('HERO-2 [unit] if it is ever set, it is a valid local path and the file exists in public/img', () => {
    if (HERO_PHOTO === null) return;
    expect(heroPhotoSrc(HERO_PHOTO)).toBe(HERO_PHOTO);
    expect(fs.existsSync(path.join(ROOT, 'public', HERO_PHOTO))).toBe(true);
  });
});

describe('HERO-3 the band renders the graphic fallback or the photo under a shade', () => {
  const html = (photo?: string | null) =>
    renderToStaticMarkup(createElement(Hero as unknown as FunctionComponent<{ photo?: string | null }>, { photo }, createElement('p', { id: 'inside' }, 'inside')));
  it('HERO-3 [unit] without a photo: a band with the graphic fallback, no photo layer, children rendered', () => {
    const out = html(null);
    expect(out).toContain('data-testid="hero"');
    expect(out).toContain('data-testid="hero-art"');
    expect(out).toContain('id="inside"');
    expect(out).not.toContain('hero-photo');
    expect(out).not.toMatch(/<img/i);
  });
  it('HERO-3 [unit] with a local photo: a photo layer and a shade over it, no <img> tag, still the children', () => {
    const out = html('/img/hero.jpg');
    expect(out).toContain('hero-photo');
    expect(out).toContain('hero-shade');
    expect(out).toContain('/img/hero.jpg');
    expect(out).toContain('id="inside"');
    expect(out).not.toMatch(/<img/i);
  });
  it('HERO-3 [unit] a photo from another site is refused: the band falls back to the graphic', () => {
    const out = html('https://example.com/x.jpg');
    expect(out).not.toContain('example.com');
    expect(out).not.toContain('hero-photo');
    expect(out).toContain('data-testid="hero-art"');
  });
});

describe('HERO-7 text stays readable over any photo', () => {
  it('HERO-7 [unit] the shade is an opaque navy layer drawn over the photo (position absolute, primary-deep or primary)', () => {
    const shade = bodyOf('.hero-shade');
    expect(shade).toMatch(/position:\s*absolute/);
    expect(shade).toMatch(/background:\s*var\(--primary(-deep)?\)/);
  });
  it('HERO-7 [unit] even a pure white photo under the shade gives white text at least 4.5:1', () => {
    const alpha = Number(/opacity:\s*([\d.]+)/.exec(bodyOf('.hero-shade'))?.[1]);
    expect(alpha, 'the shade sets an opacity').toBeGreaterThan(0);
    expect(alpha, 'the shade is at most fully opaque').toBeLessThanOrEqual(1);
    const shadeColour = tokens[/background:\s*var\(--([\w-]+)\)/.exec(bodyOf('.hero-shade'))?.[1] ?? ''] ?? '#MISSING';
    const worstBackground = mix(shadeColour, '#ffffff', alpha);
    expect(ratio(tokens['on-fill'], worstBackground), `white text on ${worstBackground}`).toBeGreaterThanOrEqual(4.5);
    expect(ratio(tokens['on-dark-muted'], worstBackground), `muted light text on ${worstBackground}`).toBeGreaterThanOrEqual(4.5);
  });
});

describe('CARD-2 cards are less flat', () => {
  it('CARD-2 [unit] a card has a 4 px accent top edge and a shadow from a token', () => {
    const card = bodyOf('.card');
    expect(card).toMatch(/border-top:\s*var\(--space-1\) solid var\(--accent\)/);
    expect(card).toMatch(/box-shadow:\s*var\(--shadow-card\)/);
    expect(tokens['shadow-card'], 'the --shadow-card token').toBeTruthy();
  });
  it('CARD-2 [unit] the accent top edge is at least 3:1 against the card surface', () => {
    expect(ratio(tokens['accent'], tokens['surface'])).toBeGreaterThanOrEqual(3);
  });
});
