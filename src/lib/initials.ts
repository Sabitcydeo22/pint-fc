// The two letters shown on a player avatar (session 20c). Letters only, in any script, upper case, so a name can never
// put markup, digits or punctuation into the avatar. Two or more words: the first letter of the first and of the last word.
// One word: its first two letters. No letters at all: "?".
export function initials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => Array.from(word).filter((ch) => /[\p{L}\p{M}]/u.test(ch)).join(''))
    .filter((word) => word !== '');
  if (words.length === 0) return '?';
  const first = Array.from(words[0]);
  const picked = words.length === 1 ? first.slice(0, 2) : [first[0], Array.from(words[words.length - 1])[0]];
  return Array.from(picked.join('').toLocaleUpperCase('en-US')).slice(0, 2).join('');
}
