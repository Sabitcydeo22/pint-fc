// Release check (REL-1). Fails (exit 1) when an acceptance check (AC id) listed in
// docs/REQUIREMENTS.md has no counted test whose title STARTS with that id.
//
// A title "counts" when it is a plain it(...) / test(...) call that is not skipped, todo, fixme,
// fails or commented out. This is a static read of the test sources: that the counted tests also PASS
// is proven by `npm run gate` (every level is run there), not by this script.
// Usage: node scripts/release-check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '..');

const BULLET_ID = /^- \*\*(AC-\d+\.\d+(?:\.\d+)?)\*\*/;
// it('title' / test("title" / test(`title ${x}` ; group 2 = modifiers such as .skip, group 4 = the title
const TEST_CALL = /\b(it|test)((?:\.\w+)*)\(\s*(['"`])((?:\\.|(?!\3)[^\\\n])*)\3/g;
const COUNTING_MODIFIERS = new Set(['only', 'concurrent', 'sequential']);

export function acIdsFromRequirements(text) {
  const ids = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(BULLET_ID);
    if (m) ids.push(m[1]);
  }
  return ids;
}

export function testEntriesFromSource(source) {
  const entries = [];
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    for (const m of line.matchAll(TEST_CALL)) {
      const modifiers = m[2].split('.').filter(Boolean);
      entries.push({ title: m[4], counts: modifiers.every((x) => COUNTING_MODIFIERS.has(x)) });
    }
  }
  return entries;
}

export function listTestFiles(dir) {
  const out = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name !== 'node_modules') out.push(...listTestFiles(full));
    } else if (/\.(test|spec)\.ts$/.test(item.name)) {
      out.push(full);
    }
  }
  return out.sort();
}

// "AC-2.1.1" must not be satisfied by "AC-2.1.10" or "AC-2.1.1.5": what follows the id may not be a digit or ".digit"
function titleStartsWithId(title, id) {
  if (!title.startsWith(id)) return false;
  return !/^(\d|\.\d)/.test(title.slice(id.length));
}

export function findMissing(acIds, entries) {
  const counted = entries.filter((e) => e.counts);
  return acIds.filter((id) => !counted.some((e) => titleStartsWithId(e.title, id)));
}

export function checkRelease(root = defaultRoot) {
  const acIds = acIdsFromRequirements(fs.readFileSync(path.join(root, 'docs', 'REQUIREMENTS.md'), 'utf8'));
  const entries = [];
  for (const file of listTestFiles(path.join(root, 'tests'))) {
    entries.push(...testEntriesFromSource(fs.readFileSync(file, 'utf8')));
  }
  return { acIds, entries, missing: findMissing(acIds, entries) };
}

function main() {
  const { acIds, entries, missing } = checkRelease();
  if (acIds.length === 0) {
    console.error('release-check FAILED: no AC ids found in docs/REQUIREMENTS.md');
    process.exit(1);
  }
  if (missing.length > 0) {
    console.error(`release-check FAILED: ${missing.length} AC id(s) have no counted test title:`);
    for (const id of missing) console.error('  - ' + id);
    process.exit(1);
  }
  console.log(`release-check OK: ${acIds.length} AC ids, each with a counted test title (${entries.length} titles read).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
