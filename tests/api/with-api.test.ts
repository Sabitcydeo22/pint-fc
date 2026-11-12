import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { POST as signIn } from '../../src/app/api/auth/sign-in/route';
import { POST as signOut } from '../../src/app/api/auth/sign-out/route';
import { POST as signOutAll } from '../../src/app/api/auth/sign-out-all/route';
import { GET as me } from '../../src/app/api/me/route';
import { AppError } from '../../src/lib/errors';
import { json, withApi } from '../../src/lib/with-api';
import { cookieOf, request, run, setupApi, type ApiEnv } from './helpers';

let env: ApiEnv;
beforeAll(async () => {
  env = await setupApi();
});
afterAll(async () => {
  await env?.close();
});

const STATE_CHANGING: [string, (r: Request) => Promise<Response>, string][] = [
  ['sign-in', signIn, '/api/auth/sign-in'],
  ['sign-out', signOut, '/api/auth/sign-out'],
  ['sign-out-all', signOutAll, '/api/auth/sign-out-all'],
];

describe('withApi', () => {
  it('T-16 state-changing routes reject cross-origin and non-JSON requests', async () => {
    const p = env.login('one');
    const creds = { email: p.email, password: p.password };
    const wrong: string[] = [];
    const expectCode = async (label: string, handler: (r: Request) => Promise<Response>, req: Request, status: number, code: string) => {
      const r = await run(handler, req);
      const got = (r.body as { error?: { code?: string } } | null)?.error?.code;
      if (r.status !== status || got !== code) wrong.push(`${label}: ${r.status} ${got}`);
      if (r.setCookie.length > 0) wrong.push(`${label}: set a cookie`);
    };

    for (const [name, handler, path] of STATE_CHANGING) {
      const body = name === 'sign-in' ? creds : undefined;
      // another site: 403 FORBIDDEN, whatever the body
      await expectCode(`${name} from evil origin`, handler, request('POST', path, { body, origin: 'https://evil.example' }), 403, 'FORBIDDEN');
      await expectCode(`${name} from origin "null"`, handler, request('POST', path, { body, origin: 'null' }), 403, 'FORBIDDEN');
      await expectCode(`${name} from a different port`, handler, request('POST', path, { body, origin: 'http://localhost:9999' }), 403, 'FORBIDDEN');
      await expectCode(`${name} marked cross-site by the browser`, handler, request('POST', path, { body, origin: null, headers: { 'sec-fetch-site': 'cross-site' } }), 403, 'FORBIDDEN');
    }
    // a body that is not declared as JSON: 400 VALIDATION (this is what a cross-site HTML form can send)
    for (const ct of ['application/x-www-form-urlencoded', 'text/plain', 'multipart/form-data; boundary=x', null]) {
      await expectCode(`sign-in with content-type ${ct}`, signIn, request('POST', '/api/auth/sign-in', { body: JSON.stringify(creds), contentType: ct }), 400, 'VALIDATION');
    }
    expect(wrong).toEqual([]);

    // a signed-in player cannot be signed out by another site: the session survives the forged requests
    const ok = await signIn(request('POST', '/api/auth/sign-in', { body: creds }));
    expect(ok.status).toBe(200);
    const cookie = cookieOf(ok) as string;
    for (const path of ['/api/auth/sign-out', '/api/auth/sign-out-all']) {
      const handler = path.endsWith('all') ? signOutAll : signOut;
      const forged = await handler(request('POST', path, { cookie, origin: 'https://evil.example' }));
      expect(forged.status).toBe(403);
    }
    expect((await run(me, request('GET', '/api/me', { cookie }))).status).toBe(200);

    // controls: same origin, and a non-browser client with no Origin header at all, both work
    expect((await run(signOut, request('POST', '/api/auth/sign-out', { cookie, origin: 'http://localhost' }))).status).toBe(204);
    expect((await run(signOut, request('POST', '/api/auth/sign-out', { origin: null }))).status).toBe(204);
  });

  it('T-23 oversized or unknown fields are rejected', async () => {
    // a probe route behind withApi: its body limit is 8 KB (8192 bytes), checked before and while reading
    const probe = withApi(async (ctx) => json(await ctx.readJson(z.strictObject({ text: z.string() }))));
    const send = (text: string, headers: Record<string, string> = {}) =>
      probe(new Request('http://localhost/api/probe', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost', ...headers },
        body: JSON.stringify({ text }),
      }));
    const overhead = Buffer.byteLength(JSON.stringify({ text: '' }));
    const exact = await send('a'.repeat(8192 - overhead));
    expect(exact.status).toBe(200); // exactly 8192 bytes is allowed
    const over = await run(probe, new Request('http://localhost/api/probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({ text: 'a'.repeat(8193 - overhead) }),
    }));
    expect(over.status).toBe(400);
    expect((over.body as { error: { code: string } }).error.code).toBe('VALIDATION');
    // a declared length over the limit is refused without reading the body
    const declared = await run(probe, new Request('http://localhost/api/probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', 'content-length': '999999' },
      body: JSON.stringify({ text: 'hi' }),
    }));
    expect(declared.status).toBe(400);
    // unknown fields are refused by the strict schema
    const extra = await probe(new Request('http://localhost/api/probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({ text: 'hi', player_id: 'someone-else' }),
    }));
    expect(extra.status).toBe(400);
  });

  describe('request handling', () => {
    let lines: string[];
    beforeEach(() => {
      lines = [];
      const grab = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
      vi.spyOn(console, 'log').mockImplementation(grab);
      vi.spyOn(console, 'info').mockImplementation(grab);
      vi.spyOn(console, 'warn').mockImplementation(grab);
      vi.spyOn(console, 'error').mockImplementation(grab);
    });
    afterEach(() => vi.restoreAllMocks());

    it('WITHAPI-1 every response has a request id, no-store and the one error format; unknown errors leak nothing', async () => {
      const ok = withApi(async () => json({ hello: 'world' }));
      const notFound = withApi(async () => { throw new AppError('NOT_FOUND'); });
      const dbClosed = withApi(async () => { throw Object.assign(new Error('rsvp closed at 17:00'), { code: 'PF409' }); });
      const boom = withApi(async () => { throw new Error('connection to postgres://user:s3cret@db:5432 refused'); });
      const get = () => new Request('http://localhost/api/probe');

      const a = await ok(get());
      const b = await ok(get());
      expect(a.status).toBe(200);
      expect(a.headers.get('cache-control')).toBe('no-store');
      expect(a.headers.get('content-type')).toContain('application/json');
      expect(a.headers.get('x-request-id')).toBeTruthy();
      expect(a.headers.get('x-request-id')).not.toBe(b.headers.get('x-request-id'));

      const nf = await run(notFound, get());
      expect(nf.status).toBe(404);
      expect(nf.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
      const closed = await run(dbClosed, get());
      expect(closed.status).toBe(409);
      expect(closed.body).toEqual({ error: { code: 'RSVP_CLOSED', message: 'RSVP is closed for this match.' } });
      const internal = await boom(get());
      const text = await internal.text();
      expect(internal.status).toBe(500);
      expect(JSON.parse(text).error.code).toBe('INTERNAL');
      expect(/s3cret|postgres|refused/.test(text)).toBe(false);
      expect(internal.headers.get('x-request-id')).toBe(JSON.parse(text).error.request_id);
    });

    it('WITHAPI-2 logs say what happened but never bodies, cookies or emails', async () => {
      const handler = withApi(async (ctx) => json(await ctx.readJson(z.object({ email: z.string(), password: z.string() }))));
      const res = await handler(new Request('http://localhost/api/probe?token=abc123', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie: 'pf_session=SECRETCOOKIEVALUE' },
        body: JSON.stringify({ email: 'someone.fake@pintfc.test', password: 'hunter2-super-secret' }),
      }));
      expect(res.status).toBe(200);
      expect(lines.length).toBeGreaterThan(0);
      const all = lines.join('\n');
      expect(/"method":"POST"/.test(all) && /"status":200/.test(all) && /"path":"\/api\/probe"/.test(all)).toBe(true);
      for (const secret of ['someone.fake@pintfc.test', 'hunter2', 'SECRETCOOKIEVALUE', 'abc123']) {
        expect(all.includes(secret), `a log line contains a secret value`).toBe(false);
      }
    });
  });
});
