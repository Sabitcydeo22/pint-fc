import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as home } from '../../src/app/api/home/route';
import { request, run, setupApi, type ApiEnv } from './helpers';

let env: ApiEnv;
beforeAll(async () => {
  env = await setupApi(); // fresh database + the seed: the demo match is the next match, its RSVP cutoff 90 minutes away
});
afterAll(async () => {
  await env?.close();
});

const getHome = (cookie?: string) => run(home, request('GET', '/api/home', { cookie: cookie ?? null }));
type NextMatch = Record<string, unknown> | null;

const NEXT_KEYS = ['competition', 'cutoff_at', 'id', 'kickoff_at', 'opponent', 'rsvp_open', 'venue'];

describe('GET /api/home (next match)', () => {
  it('AC-2.1.1 [api] home shows next non-cancelled match with opponent, venue and kickoff', async () => {
    const demo = await env.db.owner.run(
      `select m.id, t.name as opponent, v.name as venue, c.name as competition, m.kickoff_at
         from core.matches m join core.teams t on t.id = m.opponent_id join core.venues v on v.id = m.venue_id
         join core.competitions c on c.id = m.competition_id
        where m.status = 'scheduled' and m.kickoff_at > now() order by m.kickoff_at limit 1`,
    );
    expect(demo.error).toBeNull();
    const expected = demo.rows[0] as Record<string, unknown>;

    // a visitor (no cookie) may read it: the data is public
    const res = await getHome();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = res.body as { server_now: string; next_match: NextMatch };
    expect(Number.isFinite(Date.parse(body.server_now)), 'server_now is an ISO instant').toBe(true);
    expect(body.server_now).toMatch(/Z$/);
    expect(Math.abs(Date.now() - Date.parse(body.server_now))).toBeLessThan(60_000);

    const next = body.next_match as Record<string, unknown>;
    expect(Object.keys(next).sort()).toEqual(NEXT_KEYS);
    expect(next.id).toBe(expected.id);
    expect(next.opponent).toBe(expected.opponent);
    expect(next.venue).toBe(expected.venue);
    expect(next.competition).toBe(expected.competition);
    expect(next.kickoff_at).toBe(new Date(expected.kickoff_at as string | Date).toISOString());
    expect(Date.parse(next.kickoff_at as string) - Date.parse(next.cutoff_at as string)).toBe(2 * 3_600_000);
    expect(next.rsvp_open).toBe(true);
    // nothing but the public fields: no counts, no names of players, no contact data
    expect(JSON.stringify(body)).not.toMatch(/@|email|phone|date_of_birth|reason/i);
  });

  it('HOME-1 [api] rsvp_open turns false after the cutoff while the match is still the next one', async () => {
    const id = String(((await getHome()).body as { next_match: { id: string } }).next_match.id);
    const original = await env.db.owner.run('select kickoff_at from core.matches where id = $1', [id]);
    await env.db.owner.run("update core.matches set kickoff_at = now() + interval '1 hour' where id = $1", [id], { commit: true });
    try {
      const body = (await getHome()).body as { next_match: { id: string; rsvp_open: boolean } };
      expect(body.next_match.id).toBe(id);
      expect(body.next_match.rsvp_open).toBe(false);
    } finally {
      await env.db.owner.run('update core.matches set kickoff_at = $2 where id = $1', [id, original.rows[0].kickoff_at], { commit: true });
    }
  });

  it('AC-2.1.5 [api] no upcoming matches shows the empty state', async () => {
    const upcoming = await env.db.owner.run("select id from core.matches where status = 'scheduled' and kickoff_at > now()");
    const ids = upcoming.rows.map((r) => String(r.id));
    expect(ids.length).toBeGreaterThan(0);
    await env.db.owner.run("update core.matches set status = 'cancelled' where id = any($1::uuid[])", [ids], { commit: true });
    try {
      const res = await getHome();
      expect(res.status).toBe(200);
      const body = res.body as { server_now: string; next_match: NextMatch };
      expect(body.next_match).toBeNull();
      expect(Number.isFinite(Date.parse(body.server_now))).toBe(true);
    } finally {
      await env.db.owner.run("update core.matches set status = 'scheduled' where id = any($1::uuid[])", [ids], { commit: true });
    }
  });

  it('HOME-2 [api] the route only answers GET (Next refuses every other method itself)', async () => {
    const { POST } = (await import('../../src/app/api/home/route')) as { POST?: unknown };
    expect(POST, 'the route exports GET only').toBeUndefined();
  });
});

type Record6 = { played: number; won: number; drawn: number; lost: number; goals_for: number; goals_against: number };
type ResultRow = { match_id: string; opponent: string; goals_for: number; goals_against: number; played_on: string };
type HomeBody = { server_now: string; next_match: NextMatch; record: Record6 | null; latest_results: ResultRow[] };

describe('GET /api/home (record and latest results)', () => {
  it('AC-2.2.1 [api] season record is computed from published league results', async () => {
    // worked out here from the tables, independently of the view
    const expected = await env.db.owner.run(
      `select count(*)::int as played,
              (count(*) filter (where r.goals_for > r.goals_against))::int as won,
              (count(*) filter (where r.goals_for = r.goals_against))::int as drawn,
              (count(*) filter (where r.goals_for < r.goals_against))::int as lost,
              sum(r.goals_for)::int as goals_for, sum(r.goals_against)::int as goals_against
         from core.results r join core.matches m on m.id = r.match_id
         join core.competitions c on c.id = m.competition_id join core.seasons s on s.id = m.season_id
        where r.published and m.status = 'played' and c.kind = 'league' and s.is_current`,
    );
    expect(expected.error).toBeNull();
    const res = await getHome();
    expect(res.status).toBe(200);
    const body = res.body as HomeBody;
    expect(body.record).toEqual(expected.rows[0]);
    expect(body.record?.played).toBe(10); // the seed: ten published league results
    expect(Object.keys(body.record as Record6).sort()).toEqual(['drawn', 'goals_against', 'goals_for', 'lost', 'played', 'won']);
  });

  it('AC-2.2.4 [api] no published results shows the record empty state', async () => {
    const published = await env.db.owner.run('select match_id from core.results where published');
    const ids = published.rows.map((r) => String(r.match_id));
    expect(ids.length).toBeGreaterThan(0);
    await env.db.owner.run('update core.results set published = false where match_id = any($1::uuid[])', [ids], { commit: true });
    try {
      const res = await getHome();
      expect(res.status).toBe(200);
      const body = res.body as HomeBody;
      expect(body.record).toBeNull(); // null, never an all-zero record
      expect(body.latest_results).toEqual([]);
    } finally {
      await env.db.owner.run('update core.results set published = true where match_id = any($1::uuid[])', [ids], { commit: true });
    }
  });

  it('AC-2.3.1 [api] latest five published results appear newest first', async () => {
    const expected = await env.db.owner.run(
      `select m.id, t.name as opponent, r.goals_for, r.goals_against
         from core.results r join core.matches m on m.id = r.match_id join core.teams t on t.id = m.opponent_id
        where r.published and m.status = 'played' order by m.kickoff_at desc, m.id limit 5`,
    );
    const body = (await getHome()).body as HomeBody;
    expect(body.latest_results).toHaveLength(5);
    expect(body.latest_results.map((r) => r.match_id)).toEqual(expected.rows.map((r) => r.id));
    expect(body.latest_results.map((r) => [r.opponent, r.goals_for, r.goals_against])).toEqual(
      expected.rows.map((r) => [r.opponent, r.goals_for, r.goals_against]),
    );
    for (const row of body.latest_results) {
      expect(Object.keys(row).sort()).toEqual(['goals_against', 'goals_for', 'match_id', 'opponent', 'played_on']);
      expect(row.played_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const dates = body.latest_results.map((r) => r.played_on);
    expect([...dates].sort().reverse(), 'newest first').toEqual(dates);
  });

  it('AC-2.3.2 [api] unpublished result never appears in latest results', async () => {
    const unpublished = await env.db.owner.run('select match_id from core.results where not published');
    expect(unpublished.rows.length).toBeGreaterThan(0); // the seed saves one result without publishing it
    const res = await getHome();
    const body = res.body as HomeBody;
    const text = JSON.stringify(body);
    for (const row of unpublished.rows) expect(text, 'the unpublished match id is nowhere in the response').not.toContain(String(row.match_id));
    expect(body.latest_results.map((r) => r.match_id)).not.toContain(String(unpublished.rows[0].match_id));
    // the unpublished one is the NEWEST match: if it leaked it would be first
    const newest = await env.db.owner.run(`select m.id from core.matches m where m.status = 'played' order by m.kickoff_at desc limit 1`);
    expect(newest.rows[0].id).toBe(unpublished.rows[0].match_id);
    expect(body.latest_results[0].match_id).not.toBe(newest.rows[0].id);
  });
});

type StandingRow = { position: number; team: string; is_us: boolean; played: number; goal_difference: number; points: number };
type Standings = { taken_on: string; rows: StandingRow[] } | null;

describe('GET /api/home (standings)', () => {
  it('AC-2.4.1 [api] standings come back in position order with the snapshot date', async () => {
    const expected = await env.db.owner.run(
      `select r.position, t.name as team, t.is_us, r.played, (r.goals_for - r.goals_against) as goal_difference, r.points
         from core.standings_rows r join core.teams t on t.id = r.team_id
        where r.snapshot_id = (select sn.id from core.standings_snapshots sn join core.seasons s on s.id = sn.season_id
                                where s.is_current order by sn.taken_on desc, sn.id limit 1)
        order by r.position`,
    );
    expect(expected.error).toBeNull();
    expect(expected.rows.length).toBe(8); // the seeded snapshot has 8 teams

    const body = (await getHome()).body as HomeBody & { standings: Standings };
    const standings = body.standings as NonNullable<Standings>;
    expect(standings.taken_on).toMatch(/^\d{4}-\d{2}-\d{2}$/); // in the API (docs/design/api.md); the page does not show it yet
    expect(standings.rows).toEqual(expected.rows);
    expect(standings.rows.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(standings.rows.filter((r) => r.is_us).map((r) => r.team)).toEqual(['PINT FC']);
    for (const row of standings.rows) {
      expect(Object.keys(row).sort()).toEqual(['goal_difference', 'is_us', 'played', 'points', 'position', 'team']);
    }
  });

  it('STANDINGS-API [api] standings is null when there is no snapshot for the current season', async () => {
    const current = await env.db.owner.run('select id from core.seasons where is_current');
    const id = String(current.rows[0].id);
    await env.db.owner.run('update core.seasons set is_current = false where id = $1', [id], { commit: true });
    try {
      const res = await getHome();
      expect(res.status).toBe(200);
      expect((res.body as HomeBody & { standings: Standings }).standings).toBeNull();
    } finally {
      await env.db.owner.run('update core.seasons set is_current = true where id = $1', [id], { commit: true });
    }
  });
});
