import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuth } from '../../src/server/auth';
import { SupabaseAuth } from '../../src/server/auth/supabase';
// @ts-expect-error TS7016 plain .mjs module, typed locally
import * as seedModule from '../../scripts/seed.mjs';

const { writeCredentialsFile } = seedModule as unknown as {
  writeCredentialsFile: (file: string, logins: { email: string; password: string; player_id: string }[]) => number;
};

const KEYS = ['VERCEL_ENV', 'AUTH_ADAPTER', 'LOCAL_AUTH_SECRET', 'DATABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const;
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('auth adapter selection', () => {
  it('AUTH-LOCAL-1 LocalAuth refuses to load on Vercel, and the real adapter needs its URL and key', () => {
    process.env.AUTH_ADAPTER = 'local';
    process.env.LOCAL_AUTH_SECRET = 'x'.repeat(40);
    process.env.DATABASE_URL = 'postgresql://postgres:pw@127.0.0.1:1/postgres';

    // normal local use: it loads
    delete process.env.VERCEL_ENV;
    expect(typeof getAuth().signIn).toBe('function');

    // any Vercel environment (preview or production): it refuses, even when asked for explicitly
    for (const env of ['preview', 'production', 'development']) {
      process.env.VERCEL_ENV = env;
      expect(() => getAuth(), `VERCEL_ENV=${env}`).toThrow(/LocalAuth/);
    }
    // not choosing an adapter on Vercel must not silently fall back to LocalAuth either
    delete process.env.AUTH_ADAPTER;
    process.env.VERCEL_ENV = 'production';
    expect(() => getAuth()).toThrow(/LocalAuth|adapter/i);

    // the Supabase adapter (session 18): without its URL and key it refuses to start...
    delete process.env.VERCEL_ENV;
    process.env.AUTH_ADAPTER = 'supabase';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(() => getAuth()).toThrow(/must be set/i);
    // ...and with a placeholder URL and key it returns the real adapter without any network call
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.example.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder-publishable-key';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      expect(getAuth()).toBeInstanceOf(SupabaseAuth);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
    process.env.AUTH_ADAPTER = 'whatever';
    expect(() => getAuth()).toThrow(/unknown/i);
  });

  it('AUTH-LOCAL-2 LocalAuth will not start without a long secret', () => {
    process.env.AUTH_ADAPTER = 'local';
    process.env.DATABASE_URL = 'postgresql://postgres:pw@127.0.0.1:1/postgres';
    delete process.env.VERCEL_ENV;
    process.env.LOCAL_AUTH_SECRET = 'short';
    expect(() => getAuth()).toThrow(/secret/i);
  });
});

describe('credentials file', () => {
  it('LOGINS-1 the credentials file gets one header, is only ever appended to, and refuses odd values', () => {
    const file = path.join(os.tmpdir(), `pintfc-creds-test-${process.pid}-${Date.now()}.csv`);
    const a = { email: 'one.fake@pintfc.test', password: 'pw-one-0123456', player_id: '00000001-0000-4000-8000-000000000001' };
    const b = { email: 'two.fake@pintfc.test', password: 'pw-two-0123456', player_id: '00000001-0000-4000-8000-000000000002' };

    expect(fs.existsSync(file)).toBe(false);
    expect(writeCredentialsFile(file, [])).toBe(0);
    expect(fs.existsSync(file), 'nothing to write means no file').toBe(false);

    expect(writeCredentialsFile(file, [a])).toBe(1);
    expect(writeCredentialsFile(file, [b])).toBe(1); // appended, not overwritten, no second header
    const lines = fs.readFileSync(file, 'utf8').trimEnd().split('\n');
    expect(lines).toEqual([
      'email,password,player_id',
      `${a.email},${a.password},${a.player_id}`,
      `${b.email},${b.password},${b.player_id}`,
    ]);

    // a value that would break the CSV is refused, and the file is left as it was
    const before = fs.readFileSync(file, 'utf8');
    expect(() => writeCredentialsFile(file, [{ ...a, password: 'has,comma' }])).toThrow(/character/i);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });
});
