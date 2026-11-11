import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, HTTP_STATUS, mapDbError, toErrorResponse, type ErrorCode } from '../../src/lib/errors';

beforeEach(() => {
  // unknown errors are logged on the server; keep the test output clean
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('errors', () => {
  it('RULE-4 errors map to the one error format and unknown errors become INTERNAL', async () => {
    // the closed list of codes and their HTTP status (docs/design/api.md)
    const expected: Record<ErrorCode, number> = {
      VALIDATION: 400,
      INVALID_CREDENTIALS: 401,
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      RSVP_CLOSED: 409,
      MATCH_NOT_OPEN: 409,
      MINOR_NEEDS_GUARDIAN: 422,
      INTERNAL: 500,
    };
    expect(HTTP_STATUS).toEqual(expected);

    // one format: { error: { code, message, request_id } }, id also in a header, never cached
    const res = toErrorResponse(new AppError('RSVP_CLOSED'), 'req-1');
    expect(res.status).toBe(409);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('x-request-id')).toBe('req-1');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      error: { code: 'RSVP_CLOSED', message: 'RSVP is closed for this match.', request_id: 'req-1' },
    });

    // a custom message is kept
    const custom = await toErrorResponse(new AppError('VALIDATION', 'answer must be one of going, maybe, not_going'), 'req-2').json();
    expect(custom.error).toEqual({
      code: 'VALIDATION',
      message: 'answer must be one of going, maybe, not_going',
      request_id: 'req-2',
    });

    // unknown errors never leak details
    for (const thrown of [
      new Error('connection to postgres://user:s3cret@db.example:5432 failed'),
      'plain string with a password=hunter2',
      { code: '42P01', message: 'relation core.players does not exist' },
      undefined,
    ]) {
      const r = toErrorResponse(thrown, 'req-3');
      expect(r.status).toBe(500);
      const text = await r.text();
      expect(JSON.parse(text)).toEqual({
        error: { code: 'INTERNAL', message: 'Something went wrong.', request_id: 'req-3' },
      });
      expect(text).not.toMatch(/s3cret|hunter2|postgres|core\.players/);
    }

    // database SQLSTATEs map to codes; everything else is INTERNAL
    const codeOf = (e: unknown) => mapDbError(e).code;
    expect(codeOf({ code: 'PF401' })).toBe('UNAUTHENTICATED');
    expect(codeOf({ code: 'PF404' })).toBe('NOT_FOUND');
    expect(codeOf({ code: 'PF409' })).toBe('RSVP_CLOSED');
    expect(codeOf({ code: 'PF410' })).toBe('MATCH_NOT_OPEN');
    expect(codeOf({ code: 'PF422' })).toBe('MINOR_NEEDS_GUARDIAN');
    expect(codeOf({ code: '23505' })).toBe('INTERNAL');
    expect(codeOf(new Error('boom'))).toBe('INTERNAL');
    expect(codeOf(null)).toBe('INTERNAL');
    const already = new AppError('NOT_FOUND');
    expect(mapDbError(already)).toBe(already);
    expect(mapDbError({ code: 'PF409' })).toBeInstanceOf(AppError);
    expect(mapDbError({ code: 'PF409' }).status).toBe(409);
  });
});
