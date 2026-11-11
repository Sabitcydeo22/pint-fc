import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { log } from '../../src/lib/log';

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

describe('logger', () => {
  it('RULE-11 the logger writes one JSON line per event and never prints bodies, cookies, tokens, emails or passwords', () => {
    log.info('sign_in_failed', {
      request_id: 'req-7',
      status: 401,
      email: 'someone.fake@pintfc.test',
      password: 'hunter2-super-secret',
      headers: { cookie: 'sb-access-token=abc.def.ghi', authorization: 'Bearer eyJhbGciOi.payload.signature' },
      body: { email: 'someone.fake@pintfc.test', password: 'hunter2-super-secret' },
      note: 'user someone.else@pintfc.test typed it; token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJl',
      phone: '+1-555-0100',
      date_of_birth: '2010-05-01',
    });
    log.error('boom', { code: '42P01', cookie: 'x=y' });

    expect(lines).toHaveLength(2);
    const all = lines.join('\n');
    for (const secret of [
      'someone.fake@pintfc.test',
      'someone.else@pintfc.test',
      'hunter2',
      'sb-access-token',
      'Bearer',
      'eyJhbGciOi',
      '555-0100',
      '2010-05-01',
      'x=y',
    ]) {
      expect(all, `log output must not contain ${secret}`).not.toContain(secret);
    }

    // useful facts survive
    const first = JSON.parse(lines[0]);
    expect(first).toMatchObject({ level: 'info', event: 'sign_in_failed', request_id: 'req-7', status: 401 });
    expect(typeof first.time).toBe('string');
    expect(JSON.parse(lines[1])).toMatchObject({ level: 'error', event: 'boom', code: '42P01' });
  });
});
