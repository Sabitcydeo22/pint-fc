// Session 20a: design-token guards (DESIGN-1 .. DESIGN-6). They read the CSS and the 20a component sources as text and
// fail when a rule is broken: a font weight other than 400/700, a spacing value off the 4/8/12/16/24/32/48 scale, a
// hard-coded colour outside the token block, a low-contrast pair, a missing focus token, the accent used outside the
// one primary action. Nothing here starts a browser. The files below are the 20a file list; later sessions extend it.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const CSS_FILE = 'src/app/globals.css';
const TSX_FILES = [
  'src/components/NextMatch.tsx',
  'src/components/SeasonRecord.tsx',
  'src/components/LatestResults.tsx',
  'src/components/MiniTable.tsx',
  'src/components/RsvpButtons.tsx',
  'src/components/Attendance.tsx',
  'src/components/Header.tsx',
  'src/components/Footer.tsx',
  'src/app/page.tsx',
  'src/app/squad/page.tsx',
  'src/app/players/[id]/page.tsx',
  'src/app/fixtures/[id]/page.tsx',
];

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const noBlockComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const noComments = (s: string) => noBlockComments(s).replace(/^\s*\/\/.*$/gm, '').replace(/(^|\s)\/\/ .*$/gm, '$1');

const ROOT_BLOCK = /:root\s*\{([^}]*)\}/;
const css = noBlockComments(read(CSS_FILE));
const rootBody = ROOT_BLOCK.exec(css)?.[1] ?? '';
const cssOutsideRoot = css.replace(ROOT_BLOCK, '');
const tokens: Record<string, string> = {};
for (const m of rootBody.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();

// every file whose declarations are checked: the CSS outside the token block, and the 20a sources
const SCANNED: { file: string; text: string }[] = [
  { file: CSS_FILE, text: cssOutsideRoot },
  ...TSX_FILES.map((file) => ({ file, text: noComments(read(file)) })),
];

/** Every `prop: value` in a text (CSS or a JSX style object / CSS string), with the property in kebab-case. */
function declarations(text: string): { prop: string; value: string }[] {
  const out: { prop: string; value: string }[] = [];
  const re = /(?<![\w-])([a-zA-Z][\w-]*)\s*:\s*('[^']*'|"[^"]*"|`[^`]*`|[^;{},\n]+)/g;
  for (const m of text.matchAll(re)) out.push({ prop: m[1].replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), value: m[2].trim() });
  return out;
}

const SPACING_PROP = /^(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(gap|row-gap|column-gap)$/;

function offences(test: (d: { prop: string; value: string }) => boolean): string[] {
  const bad: string[] = [];
  for (const { file, text } of SCANNED) for (const d of declarations(text)) if (test(d)) bad.push(`${file}: ${d.prop}: ${d.value}`);
  return bad;
}

// ---- colour maths (WCAG 2.x) ----
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const token = (name: string) => tokens[name] ?? '#MISSING';

describe('DESIGN-1 spacing scale', () => {
  it('DESIGN-1 [unit] the spacing tokens are exactly 4, 8, 12, 16, 24, 32, 48 px', () => {
    const space = Object.entries(tokens).filter(([k]) => k.startsWith('space-')).sort(([a], [b]) => a.localeCompare(b));
    expect(space).toEqual([
      ['space-1', '4px'], ['space-2', '8px'], ['space-3', '12px'], ['space-4', '16px'], ['space-5', '24px'], ['space-6', '32px'], ['space-7', '48px'],
    ]);
  });

  it('DESIGN-1 [unit] padding, margin and gap use only var(--space-N), 0 or auto (no one-off values)', () => {
    const bad = offences(({ prop, value }) => {
      if (!SPACING_PROP.test(prop)) return false;
      const rest = value.replace(/var\(--space-[1-7]\)/g, '').replace(/['"`]/g, '');
      if (/var\(/.test(rest)) return true; // a token that is not on the scale (for example --gutter)
      return [...rest.matchAll(/(?<![\w-])-?\d*\.?\d+(px|rem|em|%|vw|vh|ch)?(?![\w-])/g)].some((m) => parseFloat(m[0]) !== 0);
    });
    expect(bad).toEqual([]);
  });
});

describe('DESIGN-2 type scale and weights', () => {
  it('DESIGN-2 [unit] exactly two weights (400, 700) and the type scale 14, 16, 20, 24, 32, 48 px', () => {
    const weights = Object.entries(tokens).filter(([k]) => k.startsWith('weight-'));
    expect(weights.sort(([a], [b]) => a.localeCompare(b))).toEqual([['weight-bold', '700'], ['weight-regular', '400']]);
    const sizes = Object.entries(tokens)
      .filter(([k]) => k.startsWith('text-'))
      .map(([k, v]) => [k, Math.round(parseFloat(v) * (v.endsWith('rem') ? 16 : 1))] as const)
      .sort(([, a], [, b]) => a - b);
    expect(sizes).toEqual([['text-sm', 14], ['text-md', 16], ['text-lg', 20], ['text-xl', 24], ['text-2xl', 32], ['text-3xl', 48]]);
  });

  it('DESIGN-2 [unit] every font-weight is var(--weight-regular) or var(--weight-bold)', () => {
    expect(offences(({ prop, value }) => prop === 'font-weight' && !/^['"]?var\(--weight-(regular|bold)\)['"]?$/.test(value))).toEqual([]);
  });

  it('DESIGN-2 [unit] every font-size is a var(--text-*) token of the scale (the root is 100%, the browser default 16 px)', () => {
    expect(offences(({ prop, value }) => prop === 'font-size' && !/^(['"]?var\(--text-(sm|md|lg|xl|2xl|3xl)\)['"]?|100%)$/.test(value))).toEqual([]);
  });
});

describe('DESIGN-3 colours come from tokens', () => {
  it('DESIGN-3 [unit] no hex, rgb() or named colour outside the :root token block', () => {
    const bad: string[] = [];
    for (const { file, text } of SCANNED) {
      for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklch)\(/g)) bad.push(`${file}: ${m[0]}`);
    }
    for (const d of offences(({ prop, value }) => /color|background|border|outline|fill|stroke/.test(prop) && /\b(white|black|red|blue|green|gray|grey|orange|yellow|navy|purple|pink|teal)\b/i.test(value))) bad.push(d);
    expect(bad).toEqual([]);
  });

  it('DESIGN-3 [unit] every colour token is a 6-digit hex', () => {
    const colourNames = ['ink', 'muted', 'primary', 'accent', 'bg', 'surface', 'ok', 'warn', 'bad', 'on-fill', 'on-dark-muted', 'focus', 'focus-on-dark'];
    expect(colourNames.filter((n) => !/^#[0-9a-f]{6}$/i.test(tokens[n] ?? ''))).toEqual([]);
  });
});

describe('DESIGN-4 contrast of the token pairs (WCAG AA)', () => {
  const TEXT: [string, string, number][] = [
    ['ink', 'bg', 7], ['ink', 'surface', 7],
    ['muted', 'bg', 4.5], ['muted', 'surface', 4.5],
    ['primary', 'bg', 7], ['primary', 'surface', 7],
    ['on-fill', 'primary', 7], ['on-fill', 'accent', 4.5], ['on-fill', 'muted', 4.5],
    ['on-fill', 'ok', 4.5], ['on-fill', 'warn', 4.5], ['on-fill', 'bad', 4.5],
    ['ok', 'bg', 4.5], ['bad', 'bg', 4.5],
    ['on-fill', 'primary', 4.5], ['on-dark-muted', 'primary', 4.5],
  ];
  for (const [fg, bg, min] of TEXT) {
    it(`DESIGN-4 [unit] text ${fg} on ${bg} is at least ${min}:1`, () => {
      expect(ratio(token(fg), token(bg))).toBeGreaterThanOrEqual(min);
    });
  }
  it('DESIGN-4 [unit] the accent fill is at least 3:1 against the page background (non-text contrast)', () => {
    expect(ratio(token('accent'), token('bg'))).toBeGreaterThanOrEqual(3);
  });
});

describe('DESIGN-5 focus', () => {
  it('DESIGN-5 [unit] --focus is at least 3:1 on the page and on cards; --focus-on-dark at least 3:1 on the navy', () => {
    expect(ratio(token('focus'), token('bg'))).toBeGreaterThanOrEqual(3);
    expect(ratio(token('focus'), token('surface'))).toBeGreaterThanOrEqual(3);
    expect(ratio(token('focus-on-dark'), token('primary'))).toBeGreaterThanOrEqual(3);
  });

  it('DESIGN-5 [unit] :focus-visible draws a 3 px outline from the focus tokens (dark header uses its own)', () => {
    const rule = (sel: RegExp) => [...cssOutsideRoot.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => sel.test(m[1].trim()))?.[2] ?? '';
    expect(rule(/^:focus-visible$/)).toMatch(/outline:\s*3px solid var\(--focus\)/);
    expect(rule(/^\.site-header :focus-visible$/)).toMatch(/outline-color:\s*var\(--focus-on-dark\)/);
  });
});

describe('DESIGN-6 one accent', () => {
  it('DESIGN-6 [unit] the accent colour is used by .btn-accent only, and only NextMatch (the home page action) asks for it', () => {
    const users = [...cssOutsideRoot.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /var\(--accent\)/.test(m[2])).map((m) => m[1].trim());
    expect(users.length).toBeGreaterThan(0);
    expect(users.filter((s) => !s.startsWith('.btn-accent'))).toEqual([]);
    expect(TSX_FILES.filter((f) => /var\(--accent\)|btn-accent/.test(noComments(read(f))))).toEqual(['src/components/NextMatch.tsx']);
  });
});
