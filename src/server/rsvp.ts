// The signed-in player's RSVP write (the route calls this). Written ONLY through public.rpc_rsvp_set as role
// `authenticated`. The function takes no player id: the database decides whose row it is from the session, so there is
// no argument here that could point at somebody else. Rejections (PF401, PF404, PF409, PF410, 22023) come back as
// database errors; withApi maps the PF codes to the standard error format.
import { AppError } from '../lib/errors';
import { withDb } from './db';
import type { Caller } from './settings';

export type RsvpAnswer = 'going' | 'maybe' | 'not_going';

export interface RsvpChange {
  answer: RsvpAnswer;
  reason?: string;
}

/** What the PUT answers. `me` is always the caller's own answer and reason; nobody else's is ever in it. */
export interface RsvpResult {
  server_now: string;
  match: { id: string; cutoff_at: string; rsvp_open: boolean };
  me: { answer: RsvpAnswer | null; reason: string | null };
}

interface Row {
  match_id: string;
  cutoff_at: Date;
  rsvp_open: boolean;
  server_now: Date;
  answer: RsvpAnswer;
  reason: string | null;
}

export async function setMyRsvp(caller: Caller, matchId: string, change: RsvpChange): Promise<RsvpResult> {
  const rows = await withDb('authenticated', { sub: caller.userId, session_id: caller.sessionId }, async (client) => {
    const res = await client.query<Row>('select * from public.rpc_rsvp_set($1, $2, $3)', [matchId, change.answer, change.reason ?? null]);
    return res.rows;
  });
  if (rows.length === 0) throw new AppError('UNAUTHENTICATED');
  const r = rows[0];
  return {
    server_now: new Date(r.server_now).toISOString(),
    match: { id: r.match_id, cutoff_at: new Date(r.cutoff_at).toISOString(), rsvp_open: r.rsvp_open },
    me: { answer: r.answer, reason: r.reason },
  };
}
