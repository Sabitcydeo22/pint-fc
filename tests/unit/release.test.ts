import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// scripts/*.mjs have no type declarations (allowJs is off); the shapes used here are declared below (D-53).
// @ts-expect-error TS7016 plain .mjs module, typed locally
import * as releaseModule from '../../scripts/release-check.mjs';

type Entry = { title: string; counts: boolean };
type Api = {
  acIdsFromRequirements(text: string): string[];
  testEntriesFromSource(source: string): Entry[];
  findMissing(acIds: string[], entries: Entry[]): string[];
  checkRelease(root: string): { acIds: string[]; entries: Entry[]; missing: string[] };
};
const rc = releaseModule as unknown as Api;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('REL-1 release check', () => {
  it('REL-1 [unit] every AC id has a passing test whose title starts with it', () => {
    const result = rc.checkRelease(root);
    // the list must really have been read from docs/REQUIREMENTS.md and the tests from tests/**
    expect(result.acIds.length).toBeGreaterThan(30);
    expect(result.acIds).toContain('AC-2.1.6');
    expect(result.acIds).toContain('AC-5.4');
    expect(result.entries.length).toBeGreaterThan(100);
    // the gate itself: no AC id without a counted test title
    expect(result.missing).toEqual([]);
  });

  it('REL-1 [unit] ids are read only from the bullet lines of the requirements', () => {
    const text = [
      '- **AC-1.1.1** *(derived)* Given ...',
      'A sentence that mentions AC-9.9.9 in passing.',
      '| AC-8.8.8 | a table row |',
      '- **AC-5.2** *(derived)* Every text ...',
    ].join('\n');
    expect(rc.acIdsFromRequirements(text)).toEqual(['AC-1.1.1', 'AC-5.2']);
  });

  it('REL-1 [unit] an id with no test title is reported missing', () => {
    const entries = rc.testEntriesFromSource("it('AC-1.1.1 [api] signs in', () => {});");
    expect(rc.findMissing(['AC-1.1.1', 'AC-1.1.3'], entries)).toEqual(['AC-1.1.3']);
  });

  it('REL-1 [unit] a title must START with the id: a longer id or a mention in the middle does not count', () => {
    const source = [
      "it('AC-2.1.10 [api] a longer id', () => {});",
      "it('AC-2.1.1.5 [api] a deeper id', () => {});",
      "it('covers AC-2.1.1 [api] only in the middle', () => {});",
    ].join('\n');
    const entries = rc.testEntriesFromSource(source);
    expect(rc.findMissing(['AC-2.1.1'], entries)).toEqual(['AC-2.1.1']);
    const ok = rc.testEntriesFromSource("it('AC-2.1.1 [api] exact', () => {});");
    expect(rc.findMissing(['AC-2.1.1'], ok)).toEqual([]);
  });

  it('REL-1 [unit] skipped, todo, fixme, commented-out and describe-only titles do not count', () => {
    const source = [
      "it.skip('AC-1.1.1 [api] skipped', () => {});",
      "it.todo('AC-1.1.3 [api] todo');",
      "test.fixme('AC-1.1.4 [e2e] fixme', async () => {});",
      "// it('AC-1.6.1 [api] commented out', () => {});",
      "describe('AC-1.6.2 [api] a group, not a test', () => {});",
      "test.describe('AC-1.6.3 [e2e] a group, not a test', () => {});",
    ].join('\n');
    const entries = rc.testEntriesFromSource(source);
    const ids = ['AC-1.1.1', 'AC-1.1.3', 'AC-1.1.4', 'AC-1.6.1', 'AC-1.6.2', 'AC-1.6.3'];
    expect(rc.findMissing(ids, entries)).toEqual(ids);
  });

  it('REL-1 [unit] single quotes, double quotes and template literals are all read', () => {
    const source = [
      "  it('AC-1.1.1 [api] single', () => {});",
      '  it("AC-1.1.3 [api] double", () => {});',
      '  test(`AC-5.4 [e2e] template: ${title}`, async () => {});',
      "  test.only('AC-5.2 [e2e] only', async () => {});",
    ].join('\n');
    const entries = rc.testEntriesFromSource(source);
    expect(entries.map((e) => e.title.split(' ')[0])).toEqual(['AC-1.1.1', 'AC-1.1.3', 'AC-5.4', 'AC-5.2']);
    expect(entries.every((e) => e.counts)).toBe(true);
    expect(rc.findMissing(['AC-1.1.1', 'AC-1.1.3', 'AC-5.4', 'AC-5.2'], entries)).toEqual([]);
  });
});
