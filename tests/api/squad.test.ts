import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as getPlayer } from '../../src/app/api/players/[id]/route';
import { GET as getSquad } from '../../src/app/api/squad/route';
import { assertNoPii } from '../../src/lib/privacy';
import { playerId, request, run, setupApi, type ApiEnv, type Outcome } from './helpers';

let env: ApiEnv;
beforeAll(async () => {
  env = await setupApi(); // fresh database + the seed: 41 players, 37 of them public
});
afterAll(async () => {
  await env?.close();
});

const MINOR_WITH_CONSENT = playerId(21); // minor A: guardian consent and opted in -> public
const MINOR_WITHOUT = playerId(34); // minor B: no consent, not public -> hidden
const OPTED_OUT = [playerId(10), playerId(28)]; // adults who chose to be hidden
const ARCHIVED = playerId(41);
const UNKNOWN = '99999999-9999-4999-8999-999999999999';

type SquadPlayer = { id: string; name: string; position: string; shirt_number: number };
const squad = () => run(getSquad, request('GET', '/api/squad'));
const profile = (id: string) => run((r) => getPlayer(r, { params: Promise.resolve({ id }) }), request('GET', `/api/players/${id}`));

describe('GET /api/squad', () => {
  it('AC-4.1.1 [api] squad lists active visible players grouped by position', async () => {
    const res = await squad();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    assertNoPii(res.body); // invariant 1: no email, phone, date of birth or RSVP data in a public response
    const players = (res.body as { players: SquadPlayer[] }).players;
    expect(players).toHaveLength(37); // 41 seeded - 1 archived - 2 opted-out adults - 1 hidden minor
    for (const p of players) expect(Object.keys(p).sort()).toEqual(['id', 'name', 'position', 'shirt_number']);

    // grouped by position (GK, DEF, MID, FWD), then by shirt number
    const order = ['GK', 'DEF', 'MID', 'FWD'];
    const ranks = players.map((p) => order.indexOf(p.position));
    expect(ranks.every((r) => r >= 0)).toBe(true);
    expect([...ranks].sort((a, b) => a - b), 'positions come in GK, DEF, MID, FWD order').toEqual(ranks);
    for (const pos of order) {
      const numbers = players.filter((p) => p.position === pos).map((p) => p.shirt_number);
      expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
    }
  });

  it('AC-4.1.2 [api] archived player never appears and their profile is 404', async () => {
    const res = await squad();
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(ARCHIVED);
    const archivedName = await env.displayName(ARCHIVED);
    expect(text).not.toContain(archivedName);
    expect((await profile(ARCHIVED)).status).toBe(404);
  });

  it('AC-4.1.3 [api] minor appears only with guardian consent and opt-in', async () => {
    const ids = ((await squad()).body as { players: SquadPlayer[] }).players.map((p) => p.id);
    expect(ids, 'minor with consent and opt-in').toContain(MINOR_WITH_CONSENT);
    expect(ids, 'minor without consent').not.toContain(MINOR_WITHOUT);
    for (const id of OPTED_OUT) expect(ids, 'adult who opted out').not.toContain(id);
    expect((await profile(MINOR_WITH_CONSENT)).status).toBe(200);
    expect((await profile(MINOR_WITHOUT)).status).toBe(404);
  });
});

describe('GET /api/players/[id]', () => {
  it('AC-4.2.1 [api] profile shows name, position and number', async () => {
    const pick = ((await squad()).body as { players: SquadPlayer[] }).players[0];
    const res = await profile(pick.id);
    expect(res.status).toBe(200);
    assertNoPii(res.body);
    const player = (res.body as { player: Record<string, unknown> }).player;
    expect(player).toMatchObject({ id: pick.id, name: pick.name, position: pick.position, shirt_number: pick.shirt_number });
  });

  it('AC-4.2.2 [api] photo, nationality and stats appear only when consented', async () => {
    const rows = await env.db.owner.run(
      `select p.id, p.full_name, p.show_photo, p.show_nationality, p.show_stats, p.photo_url, p.nationality
         from core.players p
        where p.status = 'active' and p.public_opt_in and (p.guardian_consent or not core.is_minor(p.date_of_birth))`,
    );
    expect(rows.error).toBeNull();
    expect(rows.rows).toHaveLength(37);
    const seen = { photo: 0, nationality: 0, stats: 0, none: 0 };
    for (const r of rows.rows as { id: string; show_photo: boolean; show_nationality: boolean; show_stats: boolean; photo_url: string | null; nationality: string | null }[]) {
      const res = await profile(r.id);
      expect(res.status).toBe(200);
      assertNoPii(res.body);
      const player = (res.body as { player: Record<string, unknown> }).player;
      // an optional key exists ONLY if the player consented (and has the data); otherwise it is absent, not null
      const expected = ['id', 'name', 'position', 'shirt_number'];
      if (r.show_photo && r.photo_url) expected.push('photo_url');
      if (r.show_nationality && r.nationality) expected.push('nationality');
      if (r.show_stats) expected.push('stats');
      expect(Object.keys(player).sort()).toEqual(expected.sort());
      // the unconsented values are nowhere in the response text
      const text = JSON.stringify(res.body);
      if (!r.show_photo && r.photo_url) expect(text).not.toContain(r.photo_url);
      if (!r.show_nationality && r.nationality) expect(text).not.toContain(r.nationality);
      if (r.show_stats) expect(Object.keys(player.stats as object).sort()).toEqual(['appearances', 'assists', 'goals', 'minutes']);
      if (r.show_photo && r.photo_url) seen.photo++;
      if (r.show_nationality && r.nationality) seen.nationality++;
      if (r.show_stats) seen.stats++;
      if (!r.show_photo && !r.show_nationality && !r.show_stats) seen.none++;
    }
    // the seed mixes consents, so the check above really covered both sides of every flag
    expect(seen.photo).toBeGreaterThan(0);
    expect(seen.nationality).toBeGreaterThan(0);
    expect(seen.stats).toBeGreaterThan(0);
    expect(seen.none).toBeGreaterThan(0);
  });

  it('T-10 [api] hidden and archived players return an identical 404', async () => {
    const cases: [string, string][] = [
      ['hidden minor', MINOR_WITHOUT],
      ['opted-out adult', OPTED_OUT[0]],
      ['archived player', ARCHIVED],
      ['unknown id', UNKNOWN],
    ];
    const outcomes: [string, Outcome][] = [];
    for (const [label, id] of cases) outcomes.push([label, await profile(id)]);
    const reference = outcomes[3][1]; // an id that never existed
    expect(reference.status).toBe(404);
    expect(reference.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
    for (const [label, o] of outcomes) {
      expect(o.status, label).toBe(reference.status);
      expect(o.body, label).toEqual(reference.body); // the same body: nothing tells hidden from missing
      expect(o.headers.get('content-type'), label).toBe(reference.headers.get('content-type'));
      expect(o.headers.get('cache-control'), label).toBe(reference.headers.get('cache-control'));
      expect(o.setCookie, label).toEqual([]);
    }
    // the answer never echoes the id or the name
    const hiddenName = await env.displayName(MINOR_WITHOUT);
    for (const [label, o] of outcomes) {
      const text = JSON.stringify(o.body);
      expect(text, label).not.toContain(hiddenName);
      for (const [, id] of cases) expect(text, label).not.toContain(id);
    }
  });

  it('PROFILE-1 [api] an id that is not a uuid is a 400 VALIDATION error in the standard format', async () => {
    for (const bad of ['not-a-uuid', '123', "1'; drop table core.players; --"]) {
      const res = await profile(bad);
      expect(res.status, bad).toBe(400);
      expect((res.body as { error: { code: string } }).error.code, bad).toBe('VALIDATION');
    }
  });
});
