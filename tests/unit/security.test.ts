// Session 17 security unit tests: T-13, T-14, T-18, and CSP-1 (the Content-Security-Policy header in next.config.mjs).
// Nothing here prints a secret: a finding names the file, the rule and the line number, never the matched text.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { config as middlewareConfig, middleware } from '../../src/middleware';
// @ts-expect-error TS7016 plain .mjs module
import nextConfig from '../../next.config.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const rel = (f: string) => path.relative(root, f).split(path.sep).join('/');

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;

// ---------------------------------------------------------------------------------------------------------------
// T-13: the browser never receives a service key or a database URL
// ---------------------------------------------------------------------------------------------------------------
const CLIENT_LEAKS: Array<[string, RegExp]> = [
  ['database url', /postgres(?:ql)?:\/\//i],
  ['service role', /service[_-]?role/i],
  ['server env name', /SUPABASE_SERVICE_ROLE_KEY|LOCAL_AUTH_SECRET|DATABASE_URL/],
];
const jwtRole = (token: string): string | null => {
  try {
    return (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
};
const JWT = /eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g;

export function clientLeaks(file: string, text: string): string[] {
  const found: string[] = [];
  for (const [name, re] of CLIENT_LEAKS) {
    const m = re.exec(text);
    if (m) found.push(`${file}:${lineOf(text, m.index)} ${name}`);
  }
  for (const m of text.matchAll(JWT)) if (jwtRole(m[0]) === 'service_role') found.push(`${file}:${lineOf(text, m.index ?? 0)} service-role token`);
  return found;
}

describe('T-13 client bundle contains no service key or database URL', () => {
  it('T-13 [unit] the scanner flags each kind of leak (and not harmless text)', () => {
    // sample values are built from two pieces so this file does not contain the patterns T-14 scans every tracked file for
    expect(clientLeaks('a.js', 'const u="postgres' + '://u:p@h/db"')).toHaveLength(1);
    expect(clientLeaks('a.js', 'const k="SUPABASE_SERVICE_ROLE_KEY"').length).toBeGreaterThan(0);
    expect(clientLeaks('a.js', 'const k="LOCAL_AUTH_SECRET"')).toHaveLength(1);
    expect(clientLeaks('a.js', 'role: "service_role"')).toHaveLength(1);
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    expect(clientLeaks('a.js', `x="eyJhbGciOiJIUzI1NiJ9.${payload}.c2lnbmF0dXJlLXNpZw"`).some((f) => f.endsWith('service-role token'))).toBe(true);
    expect(clientLeaks('a.js', 'const a = "hello"; fetch("/api/home")')).toEqual([]);
  });

  it('T-13 [unit] no browser file in the built bundle (.next/static) holds a service key or database URL', () => {
    const dir = path.join(root, '.next', 'static');
    const files = walk(dir).filter((f) => /\.(js|css|json|html|txt|map)$/.test(f));
    // The build is made by `npm run test:e2e` / `npm run build`. A missing build would make this test prove nothing.
    expect(files.length, 'run `npm run build` first: .next/static has no files to scan').toBeGreaterThan(0);
    const found = files.flatMap((f) => clientLeaks(rel(f), fs.readFileSync(f, 'utf8')));
    expect(found).toEqual([]);
  });

  it('T-13 [unit] no file marked "use client" imports server code, the database driver or a server secret', () => {
    const files = walk(path.join(root, 'src')).filter((f) => /\.(ts|tsx)$/.test(f));
    const found: string[] = [];
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      if (!/^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(text)) continue;
      // `import type` is erased by the compiler and puts nothing in the bundle, so it is allowed
      for (const m of text.matchAll(/import\s+(type\s+)?[^;'"]*?from\s+['"]([^'"]+)['"]/g)) {
        if (!m[1] && /(^|\/)server(\/|$)|^pg$|^node:|local-store/.test(m[2])) found.push(`${rel(f)}:${lineOf(text, m.index ?? 0)} imports ${m[2]}`);
      }
      for (const m of text.matchAll(/(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g)) {
        if (/(^|\/)server(\/|$)|^pg$|^node:|local-store/.test(m[1])) found.push(`${rel(f)}:${lineOf(text, m.index ?? 0)} imports ${m[1]}`);
      }
      const env = /process\.env\.(?!NEXT_PUBLIC_)\w+/.exec(text);
      if (env) found.push(`${rel(f)}:${lineOf(text, env.index)} reads a server env var`);
    }
    expect(found).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// T-14: no token pattern in any tracked file
// ---------------------------------------------------------------------------------------------------------------
const SECRET_RULES: Array<[string, RegExp]> = [
  ['jwt', /eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/],
  ['supabase access token', /\bsbp_[a-z0-9]{20,}/],
  ['supabase secret key', /\bsb_secret_[\w-]{10,}/],
  ['github token', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ['aws key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['private key block', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ['database url with password to a remote host', /postgres(?:ql)?:\/\/[^:@/\s'"`]+:(?![${<])[^@\s'"`]+@(?!127\.0\.0\.1|localhost|\$|\{)[\w.-]+/i],
  ['token or password assigned a long literal', /\b(?:token|secret|api[_-]?key|password|passwd)\b['"]?\s*[:=]\s*['"][A-Za-z0-9_\-+/=]{24,}['"]/i],
  ['token variable with a value', /\b(?:VERCEL_TOKEN|SUPABASE_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*[^\s<$"'][^\s]{8,}/],
];

// Deliberately fake values that other tests feed to the log redactor and the error handler (they prove a secret is NOT
// echoed). Each entry is one exact fake string in one file; any other match in those files still fails.
const FAKE_FIXTURES = [
  { file: 'tests/api/with-api.test.ts', text: 'user:s3cret@db' },
  { file: 'tests/unit/errors.test.ts', text: 'user:s3cret@db.example' },
  { file: 'tests/unit/seed-fake.test.ts', text: 'postgres:secretpw123@db.abcdefghij.supabase.co' },
  { file: 'tests/unit/log.test.ts', text: 'eyJhbGciOiJIUzI1NiJ9' + '.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJl' },
];

export function secretFindings(file: string, text: string): string[] {
  const found: string[] = [];
  for (const [name, re] of SECRET_RULES) {
    const g = new RegExp(re.source, re.flags.includes('i') ? 'gi' : 'g');
    for (const m of text.matchAll(g)) {
      if (FAKE_FIXTURES.some((a) => a.file === file && m[0].includes(a.text))) continue;
      found.push(`${file}:${lineOf(text, m.index ?? 0)} ${name}`);
    }
  }
  return found;
}

describe('T-14 secret scanner finds no token patterns in tracked files', () => {
  it('T-14 [unit] the scanner flags each pattern and passes placeholders and local URLs', () => {
    const j = 'eyJ' + 'hbGciOiJIUzI1NiJ9.' + 'eyJyb2xlIjoiYW5vbiJ9.' + 'c2lnbmF0dXJlLXNpZ25hdHVyZQ';
    const bad: Array<[string, string]> = [
      ['jwt', `key=${j}`],
      ['supabase access token', 'sb' + 'p_' + 'a'.repeat(30)],
      ['supabase secret key', 'sb_' + 'secret_' + 'a'.repeat(20)],
      ['github token', 'gh' + 'p_' + 'a'.repeat(36)],
      ['aws key id', 'AK' + 'IA' + 'A'.repeat(16)],
      ['private key block', '-----BEGIN ' + 'RSA PRIVATE KEY-----'],
      ['database url with password to a remote host', 'postgresql' + '://app:hunter2hunter2@db.example.com:5432/x'],
      ['token or password assigned a long literal', 'const password = "' + 'x'.repeat(30) + '"'],
      ['token variable with a value', 'VERCEL_TOKEN=' + 'x'.repeat(20)],
    ];
    for (const [rule, sample] of bad) expect(secretFindings('s.txt', sample).map((f) => f.replace(/^s\.txt:\d+ /, '')), rule).toContain(rule);
    for (const ok of [
      'SUPABASE_SERVICE_ROLE_KEY=<redacted>',
      'VERCEL_TOKEN=$env:VERCEL_TOKEN',
      'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
      'postgresql://postgres:postgres@localhost/postgres',
      'DATABASE_URL=postgresql://user:${password}@host/db',
      'const password = "short"',
    ]) {
      expect(secretFindings('ok.txt', ok), ok).toEqual([]);
    }
  });

  it('T-14 [unit] no tracked file contains a token pattern', () => {
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
    expect(tracked.length).toBeGreaterThan(50);
    const found: string[] = [];
    for (const f of tracked) {
      const p = path.join(root, f);
      if (!fs.existsSync(p) || /\.(png|jpe?g|gif|ico|woff2?|pdf)$/i.test(f)) continue;
      found.push(...secretFindings(f, fs.readFileSync(p, 'utf8')));
    }
    expect(found).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// T-18: no SQL assembled from strings in src (values go in $1, $2 ... parameters)
// ---------------------------------------------------------------------------------------------------------------
const SQL_WORDS = /\b(?:select\s[\s\S]*?\bfrom\b|insert\s+into|delete\s+from|update\s+[\w."]+\s+set|set\s+local\s+role|drop\s+table|alter\s+table|create\s+table)/i;
// The one reviewed exception: withDb() checks `role` against 'anon' | 'authenticated' on the line above, and SET ROLE
// cannot take a parameter. Anything else that builds SQL from a value fails this test.
const ALLOWED = [{ file: 'src/server/db.ts', text: 'set local role ${role}' }];

export function sqlFindings(file: string, text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(/`(?:[^`\\]|\\[\s\S])*`/g)) {
    const t = m[0];
    if (!t.includes('${') || !SQL_WORDS.test(t)) continue;
    if (ALLOWED.some((a) => a.file === file && t.includes(a.text))) continue;
    found.push(`${file}:${lineOf(text, m.index ?? 0)} template literal with a value inside SQL`);
  }
  const concat = /(['"])(?:(?!\1)[^\n\\]|\\.)*\b(?:select|insert|update|delete|where|from|set)\b(?:(?!\1)[^\n\\]|\\.)*\1\s*\+|\+\s*(['"])(?:(?!\2)[^\n\\]|\\.)*\b(?:select|from|where|set|values|and|or|order by)\b(?:(?!\2)[^\n\\]|\\.)*\2/gi;
  for (const m of text.matchAll(concat)) {
    if (SQL_WORDS.test(m[0]) || /\b(select|insert|update|delete)\b[\s\S]*\+|\+[\s\S]*\b(where|from|values)\b/i.test(m[0]))
      found.push(`${file}:${lineOf(text, m.index ?? 0)} string concatenation in SQL`);
  }
  for (const m of text.matchAll(/\b(?:query|ownerQuery)\s*(?:<[^>(]*>)?\(\s*([A-Za-z_$][\w$.]*)\s*[,)]/g)) {
    // a variable passed as the SQL text: only allowed when it is a named constant in UPPER_CASE (a fixed script)
    if (!/^[A-Z][A-Z0-9_]*$/.test(m[1]) && m[1] !== 'sql') found.push(`${file}:${lineOf(text, m.index ?? 0)} SQL text comes from a variable`);
  }
  return found;
}

describe('T-18 no string-built SQL in src', () => {
  it('T-18 [unit] the scanner flags interpolation and concatenation, and passes parameters', () => {
    expect(sqlFindings('x.ts', 'c.query(`select * from t where id = ${id}`)')).toHaveLength(1);
    expect(sqlFindings('x.ts', "c.query('select * from t where id = ' + id)")).toHaveLength(1);
    expect(sqlFindings('x.ts', "c.query('select * from t ' + 'where id = 1')")).toHaveLength(1);
    expect(sqlFindings('x.ts', 'c.query(text)')).toHaveLength(1);
    expect(sqlFindings('x.ts', "c.query('select * from t where id = $1', [id])")).toEqual([]);
    expect(sqlFindings('x.ts', 'c.query(`select a, b\n from t where id = $1`, [id])')).toEqual([]);
    expect(sqlFindings('x.ts', 'const s = `Update ${n} players`')).toEqual([]);
    expect(sqlFindings('src/server/db.ts', 'c.query(`set local role ${role}`)')).toEqual([]);
    expect(sqlFindings('src/other.ts', 'c.query(`set local role ${role}`)')).toHaveLength(1);
  });

  it('T-18 [unit] no file in src builds SQL from strings', () => {
    const files = walk(path.join(root, 'src')).filter((f) => /\.(ts|tsx|mjs|js)$/.test(f));
    expect(files.length).toBeGreaterThan(20);
    const found = files.flatMap((f) => sqlFindings(rel(f), fs.readFileSync(f, 'utf8')));
    expect(found).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// CSP-1: the Content-Security-Policy header (next.config.mjs headers())
// ---------------------------------------------------------------------------------------------------------------
// The script policy is made per request by src/middleware.ts (a fresh nonce each time); next.config.mjs holds the
// directives that are not about scripts. Browsers enforce both headers together (the stricter result wins).
const pageRequest = (p = '/', cookie?: string) => new NextRequest(`http://localhost${p}`, cookie ? { headers: { cookie } } : undefined);
const directiveOf = (policy: string, name: string) => policy.split(';').map((d) => d.trim()).find((d) => d === name || d.startsWith(`${name} `));
const nonceOf = (policy: string) => /'nonce-([^']+)'/.exec(policy)?.[1];

describe('CSP-1 Content-Security-Policy header', () => {
  it('CSP-1 [unit] a page response from the middleware has a nonce-based script policy with no unsafe-inline or unsafe-eval', () => {
    const policy = middleware(pageRequest('/')).headers.get('content-security-policy') ?? '';
    expect(policy, 'the middleware must set Content-Security-Policy on page responses').not.toBe('');
    expect(policy).not.toMatch(/unsafe-eval/);
    expect(directiveOf(policy, 'default-src')).toBe("default-src 'self'");
    const script = directiveOf(policy, 'script-src') ?? '';
    expect(script).toMatch(/^script-src 'self' 'nonce-[A-Za-z0-9+/=_-]{16,}' 'strict-dynamic'$/);
    expect(script).not.toMatch(/unsafe-inline|https?:|\*/);
    expect(directiveOf(policy, 'style-src')).toBe("style-src 'self' 'unsafe-inline'"); // inline style attributes (D-113)
    // session 20c (D-157): images come from this site only (no https: hosts), plus data: URIs
    expect(directiveOf(policy, 'img-src')).toBe("img-src 'self' data:");
  });

  it('CSP-4 [unit] the middleware matcher skips the image folder and the favicon, but still covers the pages', () => {
    const matcher = middlewareConfig.matcher[0];
    const covers = (p: string) => new RegExp(`^${matcher}$`).test(p);
    for (const skipped of ['/img/placeholder-player.svg', '/img/placeholder-crest.svg', '/icon.svg', '/favicon.ico', '/api/health', '/_next/static/x.js']) {
      expect(covers(skipped), `${skipped} must not run the middleware`).toBe(false);
    }
    for (const page of ['/', '/squad', '/players/abc', '/settings', '/fixtures/abc', '/sign-in', '/images-of-us']) {
      expect(covers(page), `${page} must run the middleware`).toBe(true);
    }
  });

  it('CSP-1 [unit] next.config.mjs adds only non-script directives (no default-src or script-src that could undo the nonce)', async () => {
    const cfg = nextConfig as { headers?: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>> };
    expect(typeof cfg.headers, 'next.config.mjs must define headers()').toBe('function');
    const rules = await (cfg.headers as NonNullable<typeof cfg.headers>)();
    const policy = rules.find((r) => r.source === '/:path*')?.headers.find((h) => h.key.toLowerCase() === 'content-security-policy')?.value ?? '';
    expect(policy, 'next.config.mjs must set the non-script directives').not.toBe('');
    expect(policy).not.toMatch(/unsafe-eval|unsafe-inline/);
    for (const forbidden of ['default-src', 'script-src', 'script-src-elem', 'script-src-attr']) expect(directiveOf(policy, forbidden), forbidden).toBeUndefined();
    expect(directiveOf(policy, 'object-src')).toBe("object-src 'none'");
    expect(directiveOf(policy, 'base-uri')).toBe("base-uri 'self'");
    expect(directiveOf(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directiveOf(policy, 'form-action')).toBe("form-action 'self'");
    expect(directiveOf(policy, 'connect-src')).toBe("connect-src 'self'");
  });

  it('CSP-3 [unit] the nonce is different on every request and is the one handed to Next for its own scripts', () => {
    const a = middleware(pageRequest('/'));
    const b = middleware(pageRequest('/'));
    const na = nonceOf(a.headers.get('content-security-policy') ?? '');
    const nb = nonceOf(b.headers.get('content-security-policy') ?? '');
    expect(na, 'nonce on the first response').toBeTruthy();
    expect(nb, 'nonce on the second response').toBeTruthy();
    expect(na).not.toBe(nb);
    // Next reads the nonce from the CSP header of the REQUEST: the middleware forwards the same policy to the page render
    expect(a.headers.get('x-middleware-request-content-security-policy') ?? '').toContain(`'nonce-${na}'`);
    expect(b.headers.get('x-middleware-request-content-security-policy') ?? '').toContain(`'nonce-${nb}'`);
  });

  it('CSP-4 [unit] the redirect and no-store behaviour of the middleware is unchanged', () => {
    const redirect = middleware(pageRequest('/settings'));
    expect(redirect.status).toBe(307);
    expect(new URL(redirect.headers.get('location') ?? '').pathname).toBe('/sign-in');
    expect(redirect.headers.get('cache-control')).toBe('no-store');
    const page = middleware(pageRequest('/settings', 'pf_session=abc'));
    expect(page.status).toBe(200);
    expect(page.headers.get('location')).toBeNull();
    expect(page.headers.get('cache-control')).toBe('no-store');
  });
});
