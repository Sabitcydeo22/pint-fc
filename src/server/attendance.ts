// What a signed-in player sees on the event page (the route AND the page call this, so they cannot disagree).
// Read ONLY through public.rpc_attendance as role `authenticated`. The function lists names and answers, never any
// reason, and returns the CALLER's own answer and reason in `me` (T-05). Rejections (PF401, PF404) come back as
// database errors; withApi maps them to the standard error format.
import { AppError } from '../lib/errors';
import { withDb } from './db';
import type { Caller } from './settings';
import type { RsvpAnswer } from './rsvp';

export interface Attendee {
  player_id: string;
  name: string;
  answer: RsvpAnswer;
}

/** The attendance DTO (docs/design/api.md). Instants are ISO strings with `Z`. */
export interface Attendance {
  server_now: string;
  match: {
    id: string;
    opponent: string;
    competition: string;
    venue: string;
    kickoff_at: string;
    cutoff_at: string;
    status: 'scheduled' | 'cancelled' | 'played';
    rsvp_open: boolean;
  };
  counts: { going: number; maybe: number; not_going: number; no_answer: number };
  attendees: Attendee[];
  me: { answer: RsvpAnswer | null; reason: string | null };
}

interface Row {
  match_id: string;
  opponent: string;
  competition: string;
  venue: string;
  kickoff_at: Date;
  cutoff_at: Date;
  status: Attendance['match']['status'];
  rsvp_open: boolean;
  server_now: Date;
  going: number;
  maybe: number;
  not_going: number;
  no_answer: number;
  attendees: Attendee[];
  my_answer: RsvpAnswer | null;
  my_reason: string | null;
}

const iso = (d: Date) => new Date(d).toISOString();

export async function getAttendance(caller: Caller, matchId: string): Promise<Attendance> {
  const rows = await withDb('authenticated', { sub: caller.userId, session_id: caller.sessionId }, async (client) => {
    const res = await client.query<Row>('select * from public.rpc_attendance($1)', [matchId]);
    return res.rows;
  });
  if (rows.length === 0) throw new AppError('UNAUTHENTICATED');
  const r = rows[0];
  return {
    server_now: iso(r.server_now),
    match: {
      id: r.match_id,
      opponent: r.opponent,
      competition: r.competition,
      venue: r.venue,
      kickoff_at: iso(r.kickoff_at),
      cutoff_at: iso(r.cutoff_at),
      status: r.status,
      rsvp_open: r.rsvp_open,
    },
    counts: { going: r.going, maybe: r.maybe, not_going: r.not_going, no_answer: r.no_answer },
    // copied key by key: whatever else the database row might carry never reaches the response
    attendees: r.attendees.map((a) => ({ player_id: a.player_id, name: a.name, answer: a.answer })),
    me: { answer: r.my_answer, reason: r.my_reason },
  };
}
