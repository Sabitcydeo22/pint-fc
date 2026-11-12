// The data behind GET /api/home. Read through the public views as role `anon`: a visitor sees exactly what
// the database lets a visitor see, whatever this code does. Session 09 adds the standings section here.
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
/** The current season's league record, from published results only. */
export interface SeasonRecordRow {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
}
export interface LatestResultRow {
  match_id: string;
  opponent: string;
  goals_for: number;
  goals_against: number;
  /** Calendar date in the club time zone, "YYYY-MM-DD". */
  played_on: string;
}
export interface HomeData {
  /** The database clock, as an ISO instant. The browser keeps its offset from it (docs/design/rules.md §7). */
  server_now: string;
  next_match: NextMatchRow | null;
  /** null when there is no published league result yet (the page shows an empty state, never zeros). */
  record: SeasonRecordRow | null;
  /** At most 5, newest first. */
  latest_results: LatestResultRow[];
}

const iso = (value: string | Date): string => new Date(value).toISOString();
export const LATEST_RESULTS_LIMIT = 5;

export async function getHome(): Promise<HomeData> {
  return withDb('anon', null, async (client) => {
    const next = await client.query<{
      id: string;
      opponent: string;
      competition: string;
      venue: string;
      kickoff_at: Date;
      cutoff_at: Date;
      rsvp_open: boolean;
      server_now: Date;
    }>('select id, opponent, competition, venue, kickoff_at, cutoff_at, rsvp_open, server_now from public.v_next_match');

    // the database clock: from the view when there is a next match, otherwise asked for directly
    let serverNow: string;
    let next_match: NextMatchRow | null = null;
    if (next.rows.length > 0) {
      const r = next.rows[0];
      serverNow = iso(r.server_now);
      next_match = {
        id: r.id,
        opponent: r.opponent,
        competition: r.competition,
        venue: r.venue,
        kickoff_at: iso(r.kickoff_at),
        cutoff_at: iso(r.cutoff_at),
        rsvp_open: r.rsvp_open,
      };
    } else {
      const clock = await client.query<{ server_now: Date }>('select now() as server_now');
      serverNow = iso(clock.rows[0].server_now);
    }

    const rec = await client.query<SeasonRecordRow>(
      'select played, won, drawn, lost, goals_for, goals_against from public.v_season_record',
    );
    const latest = await client.query<LatestResultRow>(
      `select match_id, opponent, goals_for, goals_against, played_on::text as played_on
         from public.v_latest_results order by played_at desc, match_id limit $1`,
      [LATEST_RESULTS_LIMIT],
    );

    return {
      server_now: serverNow,
      next_match,
      record: rec.rows.length > 0 ? rec.rows[0] : null,
      latest_results: latest.rows,
    };
  });
}
