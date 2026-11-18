// Session 20c: INITIALS-1 the two letters shown on a player avatar. Letters only (any script), upper case, never markup.
import { describe, expect, it } from 'vitest';
import { initials } from '../../src/lib/initials';

describe('INITIALS-1 initials of a player name', () => {
  const cases: Array<[string, string, string]> = [
    ['two words', 'Fake Alpha', 'FA'],
    ['three words: first and last', 'Fake Middle Alpha', 'FA'],
    ['one word: its first two letters', 'Fake', 'FA'],
    ['a one-letter word', 'X', 'X'],
    ['hyphen and particles: first and last word', 'Ana-María de la Cruz', 'AC'],
    ['accents are kept and upper-cased', 'élodie zoë', 'ÉZ'],
    ['extra spaces', '   Fake    Alpha  ', 'FA'],
    ['empty', '', '?'],
    ['spaces only', '    ', '?'],
    ['no letters at all', '12 !!', '?'],
    ['an emoji only', '😀', '?'],
    ['markup: letters only, never the tag characters', '<script>window.__xss=1</script>', 'SC'],
    ['markup between two words', 'Fake <b>Alpha</b>', 'FB'],
  ];
  for (const [label, name, expected] of cases) {
    it(`INITIALS-1 [unit] ${label}: "${name.trim()}" gives "${expected}"`, () => {
      expect(initials(name)).toBe(expected);
    });
  }

  it('INITIALS-1 [unit] the result is at most two characters, with no angle bracket, quote or digit', () => {
    for (const name of ['Fake Alpha', '<img src=x onerror=1> <svg/onload=1>', 'O\'Neil "Bob" 3rd', 'A'.repeat(500)]) {
      const r = initials(name);
      expect(Array.from(r).length).toBeLessThanOrEqual(2);
      expect(r).not.toMatch(/[<>"'&\d]/);
    }
  });
});
