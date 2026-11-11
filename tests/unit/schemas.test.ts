import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/lib/errors';
import { parseOrThrow, rsvpSchema, settingsSchema, signInSchema, uuidSchema } from '../../src/lib/schemas';

const failsWith = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? `${e.code}/${e.status}` : `other:${String(e)}`;
  }
  return 'accepted';
};

describe('request schemas', () => {
  it('RULE-10 every request schema is strict: unknown, missing or oversized fields are VALIDATION errors', () => {
    // sign-in
    expect(parseOrThrow(signInSchema, { email: 'a.fake@pintfc.test', password: 'pw' })).toEqual({
      email: 'a.fake@pintfc.test',
      password: 'pw',
    });
    expect(failsWith(() => parseOrThrow(signInSchema, { email: 'a.fake@pintfc.test', password: 'pw', admin: true }))).toBe('VALIDATION/400');
    expect(failsWith(() => parseOrThrow(signInSchema, { email: 'not-an-email', password: 'pw' }))).toBe('VALIDATION/400');
    expect(failsWith(() => parseOrThrow(signInSchema, { email: 'a.fake@pintfc.test' }))).toBe('VALIDATION/400');
    expect(failsWith(() => parseOrThrow(signInSchema, { email: 'a.fake@pintfc.test', password: 'x'.repeat(201) }))).toBe('VALIDATION/400');

    // RSVP: the player is always the session, so a player id is refused
    expect(parseOrThrow(rsvpSchema, { answer: 'going' })).toEqual({ answer: 'going' });
    expect(parseOrThrow(rsvpSchema, { answer: 'not_going', reason: 'x'.repeat(140) }).reason).toHaveLength(140);
    expect(failsWith(() => parseOrThrow(rsvpSchema, { answer: 'going', player_id: 'p2' }))).toBe('VALIDATION/400');
    expect(failsWith(() => parseOrThrow(rsvpSchema, { answer: 'coming' }))).toBe('VALIDATION/400');
    expect(failsWith(() => parseOrThrow(rsvpSchema, { answer: 'going', reason: 'x'.repeat(141) }))).toBe('VALIDATION/400');
    expect(failsWith(() => parseOrThrow(rsvpSchema, {}))).toBe('VALIDATION/400');

    // settings: booleans only, at least one
    expect(parseOrThrow(settingsSchema, { show_photo: true })).toEqual({ show_photo: true });
    expect(failsWith(() => parseOrThrow(settingsSchema, {}))).toBe('VALIDATION/400');
    expect(failsWith(() => parseOrThrow(settingsSchema, { show_photo: 'yes' }))).toBe('VALIDATION/400');
    expect(failsWith(() => parseOrThrow(settingsSchema, { guardian_consent: true }))).toBe('VALIDATION/400');
    expect(failsWith(() => parseOrThrow(settingsSchema, { status: 'archived', show_stats: true }))).toBe('VALIDATION/400');

    // ids in URLs
    expect(parseOrThrow(uuidSchema, '00000000-0000-4000-8000-000000000001')).toBe('00000000-0000-4000-8000-000000000001');
    expect(failsWith(() => parseOrThrow(uuidSchema, '1; drop table core.players'))).toBe('VALIDATION/400');

    // the error message never echoes the submitted value
    try {
      parseOrThrow(signInSchema, { email: 'a.fake@pintfc.test', password: 'hunter2-super-secret', extra: 1 });
    } catch (e) {
      expect((e as Error).message).not.toContain('hunter2');
    }
  });
});
