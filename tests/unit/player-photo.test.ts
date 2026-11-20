// Session 20e-3 (unit, no browser): the player photo rule (option a: local files in public/img only).
//  PHOTO-1 only a plain local /img/ path is a photo (the same rule as the hero photo)
//  PHOTO-2 the profile page reaches an <img> only through playerPhotoSrc, never with the raw database value
//  PHOTO-3 [guard] public/img holds exactly the two graphics that exist today (the agent adds no photo)
//  PHOTO-4 the avatar draws an <img> for a valid local photo, and the number graphic (no image) otherwise
import fs from 'node:fs';
import path from 'node:path';
import { createElement, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PlayerAvatar from '../../src/components/PlayerAvatar';
import { heroPhotoSrc } from '../../src/lib/hero';
import { playerPhotoSrc } from '../../src/lib/photo';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('PHOTO-1 only a local image path is a player photo', () => {
  const good = ['/img/ali-khan.jpg', '/img/player-7.webp', '/img/a-b-1.png', '/img/x.jpeg'];
  const bad = ['https://example.com/x.jpg', 'http://example.com/x.jpg', '//example.com/x.jpg', 'data:image/png;base64,AAAA', '/img/../secret.jpg', '/img/x.svg', '/img/x.jpg?x=1', 'img/x.jpg', '/other/x.jpg', 'javascript:alert(1)', '', '  '];
  for (const src of good) it(`PHOTO-1 [unit] accepts ${src}`, () => expect(playerPhotoSrc(src)).toBe(src));
  for (const src of bad) it(`PHOTO-1 [unit] rejects ${JSON.stringify(src)}`, () => expect(playerPhotoSrc(src)).toBeNull());
  it('PHOTO-1 [unit] null and undefined give no photo', () => {
    expect(playerPhotoSrc(null)).toBeNull();
    expect(playerPhotoSrc(undefined)).toBeNull();
  });
  it('PHOTO-1 [unit] the rule is the same as the hero photo rule for every sample', () => {
    for (const src of [...good, ...bad]) expect(playerPhotoSrc(src), src).toBe(heroPhotoSrc(src));
  });
});

describe('PHOTO-2 the profile page cannot use the raw photo_url', () => {
  const page = read('src/app/players/[id]/page.tsx').replace(/^\s*\/\/.*$/gm, '');
  it('PHOTO-2 [unit] the page imports playerPhotoSrc and passes its result to the avatar', () => {
    expect(page).toMatch(/import\s*\{\s*playerPhotoSrc\s*\}\s*from\s*'[^']*lib\/photo'/);
    expect(page).toMatch(/photoSrc=\{playerPhotoSrc\(/);
  });
  it('PHOTO-2 [unit] the page has no <img> and no src built from photo_url', () => {
    expect(page).not.toMatch(/<img/);
    expect(page).not.toMatch(/src=\{[^}]*photo_url/);
  });
});

describe('PHOTO-3 no photo file is added', () => {
  it('PHOTO-3 [unit] guard: public/img holds exactly placeholder-crest.svg and placeholder-player.svg', () => {
    expect(fs.readdirSync(path.join(ROOT, 'public', 'img')).sort()).toEqual(['placeholder-crest.svg', 'placeholder-player.svg']);
  });
});

describe('PHOTO-4 the avatar', () => {
  const html = (photoSrc: string | null) =>
    renderToStaticMarkup(createElement(PlayerAvatar as unknown as FunctionComponent<{ name?: string; shirtNumber: number; photoSrc: string | null }>, { name: 'Fake Player', shirtNumber: 7, photoSrc }));
  it('PHOTO-4 [unit] a valid local photo draws one decorative <img> with that path, and the number', () => {
    const out = html('/img/ali-khan.jpg');
    expect(out).toMatch(/<img[^>]*src="\/img\/ali-khan\.jpg"/);
    expect(out).toMatch(/alt=""/);
    expect(out).toContain('data-testid="player-photo"');
    expect(out).toContain('>7<');
  });
  it('PHOTO-4 [unit] no photo: the number graphic, no <img>, no svg (no jersey, no body)', () => {
    const out = html(null);
    expect(out).toContain('data-testid="player-avatar"');
    expect(out).toContain('>7<');
    expect(out).not.toMatch(/<img|<svg/i);
  });
  it('PHOTO-4 [unit] guard: a path from another site is never drawn, the avatar falls back to the number graphic', () => {
    const out = html('https://example.com/x.jpg');
    expect(out).not.toContain('example.com');
    expect(out).not.toMatch(/<img/i);
    expect(out).toContain('data-testid="player-avatar"');
  });
});
