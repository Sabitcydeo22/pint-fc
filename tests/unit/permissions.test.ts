import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/lib/errors';
import { assertCan, can, type Action, type Actor } from '../../src/lib/permissions';

const visitor: Actor = { kind: 'visitor' };
const player: Actor = { kind: 'player', id: 'p1', status: 'active' };
const archived: Actor = { kind: 'player', id: 'p2', status: 'archived' };
const ACTIONS: Action[] = ['read_public', 'read_attendance', 'rsvp', 'edit_settings'];

const codeOf = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : `other:${String(e)}`;
  }
  return 'none';
};

describe('permissions', () => {
  it('RULE-9 only players may read attendance, RSVP and edit settings, and only as themselves', () => {
    // visitors: public reading only
    expect(can(visitor, 'read_public')).toBe(true);
    expect(can(visitor, 'read_attendance')).toBe(false);
    expect(can(visitor, 'rsvp', { playerId: 'p1' })).toBe(false);
    expect(can(visitor, 'edit_settings', { playerId: 'p1' })).toBe(false);

    // an active player
    expect(can(player, 'read_public')).toBe(true);
    expect(can(player, 'read_attendance')).toBe(true);
    expect(can(player, 'rsvp', { playerId: 'p1' })).toBe(true);
    expect(can(player, 'edit_settings', { playerId: 'p1' })).toBe(true);
    // ...never for someone else, and never without saying whose
    expect(can(player, 'rsvp', { playerId: 'p9' })).toBe(false);
    expect(can(player, 'edit_settings', { playerId: 'p9' })).toBe(false);
    expect(can(player, 'rsvp')).toBe(false);
    expect(can(player, 'edit_settings')).toBe(false);

    // archived players may do nothing
    for (const a of ACTIONS) expect(can(archived, a, { playerId: 'p2' }), `archived ${a}`).toBe(false);

    // assertCan: visitors get 401, wrong-player or archived get 403, allowed does nothing
    expect(codeOf(() => assertCan(visitor, 'read_attendance'))).toBe('UNAUTHENTICATED');
    expect(codeOf(() => assertCan(visitor, 'rsvp', { playerId: 'p1' }))).toBe('UNAUTHENTICATED');
    expect(codeOf(() => assertCan(player, 'rsvp', { playerId: 'p9' }))).toBe('FORBIDDEN');
    expect(codeOf(() => assertCan(archived, 'read_attendance'))).toBe('FORBIDDEN');
    expect(codeOf(() => assertCan(visitor, 'read_public'))).toBe('none');
    expect(codeOf(() => assertCan(player, 'rsvp', { playerId: 'p1' }))).toBe('none');
  });
});
