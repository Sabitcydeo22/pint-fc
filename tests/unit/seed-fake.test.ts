import { describe, expect, it } from 'vitest';
// scripts/*.mjs have no type declarations (allowJs is off); the shapes used here are declared below.
// @ts-expect-error TS7016 plain .mjs module, typed locally
import * as dataModule from '../../scripts/seed-data/index.mjs';
// @ts-expect-error TS7016 plain .mjs module, typed locally
import * as seedModule from '../../scripts/seed.mjs';

interface Player {
  id: string;
  full_name: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  shirt_number: number;
  status: 'active' | 'archived';
  email: string;
  phone: string | null;
  date_of_birth: string;
  guardian_consent: boolean;
  public_opt_in: boolean;
  show_photo: boolean;
  show_nationality: boolean;
  show_stats: boolean;
  photo_url: string | null;
  nationality: string | null;
}
interface DataModule {
  FIRST_NAMES: string[];
  LAST_NAMES: string[];
  id: (kind: string, n: number) => string;
  staticData: () => {
    players: Player[];
    teams: { id: string; name: string; crest_url: string }[];
    venues: { id: string; name: string; city: string }[];
    [key: string]: unknown;
  };
}
interface SeedModule {
  parseDuration: (text: string) => number;
  assertSafeTarget: (url: string, opts?: { allowRemote?: boolean }) => void;
}
const data = dataModule as unknown as DataModule;
const seedApi = seedModule as unknown as SeedModule;

// Names that belong to real people or are very common real names. The seed must contain none.
const REAL_FIRST = ['james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph', 'thomas', 'charles', 'daniel', 'matthew', 'anthony', 'mark', 'paul', 'steven', 'andrew', 'kevin', 'brian', 'george', 'carlos', 'juan', 'luis', 'jose', 'miguel', 'ahmed', 'mohamed', 'ali', 'lionel', 'cristiano', 'neymar', 'kylian', 'erling', 'mary', 'patricia', 'jennifer', 'linda', 'sarah'];
const REAL_LAST = ['smith', 'johnson', 'williams', 'brown', 'jones', 'garcia', 'miller', 'davis', 'rodriguez', 'martinez', 'hernandez', 'lopez', 'wilson', 'anderson', 'thomas', 'taylor', 'moore', 'jackson', 'martin', 'lee', 'messi', 'ronaldo', 'mbappe', 'haaland', 'neymar', 'silva', 'santos', 'kane', 'salah'];

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}

describe('seed data is fake', () => {
  it('SEED-3 seed data contains only fake emails (@pintfc.test), 555 phones and no real-looking names list', () => {
    const d = data.staticData();
    expect(d.players).toHaveLength(41); // guard against a vacuous pass: 40 active + 1 archived

    // emails: every one is firstname.lastname@pintfc.test and unique
    const emails = d.players.map((p) => p.email);
    expect(emails.filter((e) => !/^[a-z]+\.[a-z]+@pintfc\.test$/.test(e))).toEqual([]);
    expect(new Set(emails).size).toBe(41);

    // phones: either empty or +1-555-01xx (the reserved fictional range)
    const phones = d.players.map((p) => p.phone).filter((p): p is string => p !== null);
    expect(phones.length).toBeGreaterThan(20);
    expect(phones.filter((p) => !/^\+1-555-01\d\d$/.test(p))).toEqual([]);

    // anywhere in the seed data: any "@" must be inside a @pintfc.test address, any phone-like text must be 555-01xx
    for (const s of strings(d)) {
      for (const m of s.match(/[^\s@]+@[^\s@]+/g) ?? []) expect(m, `email-like text "${m}"`).toMatch(/@pintfc\.test$/);
      for (const m of s.match(/\+?\d[\d\s().-]{8,}\d/g) ?? []) {
        // ISO dates and ids are digit runs with dashes too: only phone-shaped text starting with + or 555 is checked
        if (/^\+/.test(m) || /555/.test(m)) expect(m, `phone-like text "${m}"`).toMatch(/^\+1-555-01\d\d$/);
      }
    }

    // names: built only from the invented word lists, 41 different full names, none of them real or common
    expect(data.FIRST_NAMES.length).toBeGreaterThanOrEqual(12);
    expect(data.LAST_NAMES.length).toBeGreaterThanOrEqual(10);
    const full = d.players.map((p) => p.full_name);
    expect(new Set(full).size).toBe(41);
    for (const name of full) {
      const [first, last, ...rest] = name.split(' ');
      expect(rest, `"${name}" must be two words`).toEqual([]);
      expect(data.FIRST_NAMES, `first name of "${name}"`).toContain(first);
      expect(data.LAST_NAMES, `last name of "${name}"`).toContain(last);
      expect(REAL_FIRST).not.toContain(first.toLowerCase());
      expect(REAL_LAST).not.toContain(last.toLowerCase());
    }
    for (const w of [...data.FIRST_NAMES, ...data.LAST_NAMES]) {
      expect(REAL_FIRST).not.toContain(w.toLowerCase());
      expect(REAL_LAST).not.toContain(w.toLowerCase());
    }

    // crests and photos are placeholders, not real image hosts
    const urls = [...d.teams.map((t) => t.crest_url), ...d.players.map((p) => p.photo_url).filter((u): u is string => u !== null)];
    expect(urls.length).toBeGreaterThan(8);
    expect(urls.filter((u) => !u.startsWith('/img/placeholder'))).toEqual([]);
  });

  it('SEED-4 the demo flag is parsed strictly and the seed refuses a non-local database without --allow-remote', () => {
    expect(seedApi.parseDuration('90m')).toBe(5_400_000);
    expect(seedApi.parseDuration('2h')).toBe(7_200_000);
    expect(seedApi.parseDuration('45s')).toBe(45_000);
    expect(seedApi.parseDuration('1d')).toBe(86_400_000);
    for (const bad of ['', '90', 'm', '-5m', '1.5h', '10x', '0m', ' 90m', '90 m']) {
      expect(() => seedApi.parseDuration(bad), `"${bad}" must be refused`).toThrow(/duration/i);
    }

    for (const local of [
      'postgresql://postgres:pw@127.0.0.1:5432/postgres',
      'postgresql://postgres:pw@localhost:54322/postgres',
      'postgresql://postgres:pw@[::1]:5432/postgres',
    ]) {
      expect(() => seedApi.assertSafeTarget(local)).not.toThrow();
    }
    const remote = 'postgresql://postgres:secretpw123@db.abcdefghij.supabase.co:5432/postgres';
    let message = '';
    try {
      seedApi.assertSafeTarget(remote);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/--allow-remote/);
    expect(message).not.toContain('secretpw123');
    expect(message).not.toContain('abcdefghij');
    expect(() => seedApi.assertSafeTarget(remote, { allowRemote: true })).not.toThrow();
    expect(() => seedApi.assertSafeTarget('not a url at all')).toThrow(/database url/i);
  });

  it('SEED-5 ids are deterministic, unique and valid UUIDs', () => {
    expect(data.id('player', 1)).toBe('00000001-0000-4000-8000-000000000001');
    expect(data.id('team', 8)).toBe('00000002-0000-4000-8000-000000000008');
    expect(data.id('player', 1)).toBe(data.id('player', 1));
    const d = data.staticData();
    const ids = [...d.players.map((p) => p.id), ...d.teams.map((t) => t.id), ...d.venues.map((v) => v.id)];
    expect(ids).toHaveLength(41 + 8 + 3);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((i) => !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(i))).toEqual([]);
  });
});
