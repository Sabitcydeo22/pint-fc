// Permissions (docs/design/rules.md §2): a pure function used by route handlers for fast, friendly
// errors. It is a convenience, NOT the lock: the database enforces the same rules with grants,
// core.require_player() and auth.uid().
import { AppError } from './errors';

export type Actor =
  | { kind: 'visitor' }
  | { kind: 'player'; id: string; status: 'active' | 'archived' };
export type Action = 'read_public' | 'read_attendance' | 'rsvp' | 'edit_settings';
export interface Resource {
  /** Whose RSVP or settings this is. Required for `rsvp` and `edit_settings`. */
  playerId?: string;
}

export function can(actor: Actor, action: Action, resource?: Resource): boolean {
  if (actor.kind === 'player' && actor.status !== 'active') return false; // archived: nothing
  switch (action) {
    case 'read_public':
      return true;
    case 'read_attendance':
      return actor.kind === 'player';
    case 'rsvp':
    case 'edit_settings':
      return actor.kind === 'player' && resource?.playerId === actor.id;
  }
}

/** Throws UNAUTHENTICATED (401) for visitors and FORBIDDEN (403) for players who may not. */
export function assertCan(actor: Actor, action: Action, resource?: Resource): void {
  if (can(actor, action, resource)) return;
  throw new AppError(actor.kind === 'visitor' ? 'UNAUTHENTICATED' : 'FORBIDDEN');
}
