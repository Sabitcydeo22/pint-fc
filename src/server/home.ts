// The data behind GET /api/home. Read through the public views as role `anon`: a visitor sees exactly what
// the database lets a visitor see, whatever this code does. Sessions 08-09 add the other sections here.
import { withDb } from './db';

export interface NextMatchRow {
  id: string;
  opponent: string;
  competition: string;
  venue: string;
  kickoff_at: string;
  cutoff_at: string;
  rsvp_open: boolean;
}
export interface HomeData {
  /** The database clock, as an ISO instant. The browser keeps its offset from it (docs/design/rules.md §7). */
  server_now: string;
  next_match: NextMatchRow | null;
}

const iso = (value: string | Date): string => new Date(value).toISOString();

export async function getHome(): Promise<HomeData> {
  return withDb('anon', null, async (client) => {
    const res = await client.query<{
      id: string;
      opponent: string;
      competition: string;
      venue: string;
      kickoff_at: Date;
      cutoff_at: Date;
      rsvp_open: boolean;
      server_now: Date;
    }>('select id, opponent, competition, venue, kickoff_at, cutoff_at, rsvp_open, server_now from public.v_next_match');
    if (res.rows.length > 0) {
      const r = res.rows[0];
      return {
        server_now: iso(r.server_now),
        next_match: {
          id: r.id,
          opponent: r.opponent,
          competition: r.competition,
          venue: r.venue,
          kickoff_at: iso(r.kickoff_at),
          cutoff_at: iso(r.cutoff_at),
          rsvp_open: r.rsvp_open,
        },
      };
    }
    // no row: still ask the database for its clock, so the response always carries server_now
    const clock = await client.query<{ server_now: Date }>('select now() as server_now');
    return { server_now: iso(clock.rows[0].server_now), next_match: null };
  });
}
