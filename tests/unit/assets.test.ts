// Session 20c: ASSET-1 .. ASSET-4, the "no people" content rule made checkable (owner, not negotiable: no photos,
// illustrations, icons or stock images of people; graphics only). A test cannot tell a drawing of a person from a drawing
// of a shirt, so this guards what CAN be checked: only SVG files, only plain geometric elements, no embedded bitmap, no
// text, no script, no outside URL, only the colours of the design tokens, and no <img> in src except the one allowed.
// The owner looks at the rendered PNGs (tests/e2e/assets.spec.ts writes them to screenshots/) for the rest.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SVG_FILES = ['public/img/placeholder-player.svg', 'public/img/placeholder-crest.svg', 'src/app/icon.svg'];
const RASTER = /\.(png|jpe?g|gif|webp|avif|bmp|ico|tiff?|heic)$/i;
const ALLOWED_ELEMENTS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'polygon', 'title', 'defs']);

const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join('/');

const css = fs.readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');
const rootBody = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
const tokenColours = new Set([...rootBody.matchAll(/--[\w-]+\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => m[1].toLowerCase()));

describe('ASSET-1 the graphics exist and are plain SVG', () => {
  for (const file of SVG_FILES) {
    it(`ASSET-1 [unit] ${file} exists, starts with <svg>, has a viewBox and a <title>`, () => {
      expect(exists(file), `${file} must exist`).toBe(true);
      const text = exists(file) ? read(file) : '';
      expect(text.trimStart().startsWith('<svg')).toBe(true);
      expect(text).toMatch(/viewBox="[\d. -]+"/);
      expect(text).toMatch(/<title>[^<]+<\/title>/);
    });

    it(`ASSET-2 [unit] ${file} uses only plain shapes: no bitmap, text, script, handler, style sheet or outside URL`, () => {
      const text = exists(file) ? read(file) : '<image/>';
      const elements = [...text.matchAll(/<\s*([a-zA-Z][\w:-]*)/g)].map((m) => m[1].toLowerCase());
      expect(elements.length, 'the file has elements').toBeGreaterThan(2);
      expect(elements.filter((e) => !ALLOWED_ELEMENTS.has(e))).toEqual([]);
      expect(text).not.toMatch(/\son[a-z]+\s*=/i); // event handlers
      expect(text).not.toMatch(/data:|base64|xlink:href|\shref\s*=|url\(\s*['"]?https?:/i);
      expect(text.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, '')).not.toMatch(/https?:\/\//i);
    });

    it(`ASSET-3 [unit] every colour in ${file} is a design token`, () => {
      const text = exists(file) ? read(file) : '';
      const hexes = [...text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase());
      expect(hexes.length, 'the file sets its colours').toBeGreaterThan(0);
      expect(hexes.filter((h) => !tokenColours.has(h))).toEqual([]);
    });
  }
});

describe('ASSET-4 no picture of anything but plain SVG graphics', () => {
  it('ASSET-4 [unit] public/ and src/ hold no bitmap file (jpg, png, gif, webp, avif, ico ...)', () => {
    const bitmaps = [...walk(path.join(ROOT, 'public')), ...walk(path.join(ROOT, 'src'))].map(rel).filter((f) => RASTER.test(f));
    expect(bitmaps).toEqual([]);
  });

  it('ASSET-4 [unit] public/ holds only .svg files under img/', () => {
    const files = walk(path.join(ROOT, 'public')).map(rel);
    expect(files.length, 'public/ exists and is not empty').toBeGreaterThan(0);
    expect(files.filter((f) => !/^public\/img\/[a-z0-9-]+\.svg$/.test(f))).toEqual([]);
  });

  it('ASSET-4 [unit] src/ has no <img>, next/image or image URL except the one local profile image', () => {
    const bad: string[] = [];
    for (const file of walk(path.join(ROOT, 'src')).map(rel).filter((f) => /\.(tsx?|css)$/.test(f))) {
      const text = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/next\/image/.test(text)) bad.push(`${file}: next/image`);
      if (/url\(\s*['"]?(https?:|data:image)/i.test(text)) bad.push(`${file}: css image url`);
      for (const m of text.matchAll(/<img\b[^>]*>/g)) {
        const ok = file === 'src/components/PlayerAvatar.tsx' && /src="\/img\/placeholder-player\.svg"/.test(m[0]);
        if (!ok) bad.push(`${file}: <img>`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('ASSET-4 [unit] the profile page never renders the database photo_url (only the local jersey file)', () => {
    const page = read('src/app/players/[id]/page.tsx').replace(/^\s*\/\/.*$/gm, '');
    expect(page).not.toMatch(/src=\{[^}]*photo_url/);
    expect(page).not.toMatch(/<img/);
  });
});
