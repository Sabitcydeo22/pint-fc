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
