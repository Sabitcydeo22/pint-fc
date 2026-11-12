// Session 12 (API level): invariant 1 across every API route a visitor (no session) can call (AC-4.3.1, T-12).
// Every response body is scanned twice: with `assertNoPii` (keys and email/phone-looking values) and against the seeded
// private VALUES (every email, phone, date of birth and RSVP reason in the database). Messages name the route and the
// player number, never the value. A route inventory fails when a new route appears that this file does not know about.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as getAttendance } from '../../src/app/api/fixtures/[id]/attendance/route';
import { PUT as putRsvp } from '../../src/app/api/fixtures/[id]/rsvp/route';
import { GET as getHealth } from '../../src/app/api/health/route';
import { GET as getHome } from '../../src/app/api/home/route';
import { GET as getMe } from '../../src/app/api/me/route';
import { GET as getMySettings, PUT as putMySettings } from '../../src/app/api/me/settings/route';
import { GET as getPlayer } from '../../src/app/api/players/[id]/route';
import { GET as getSquad } from '../../src/app/api/squad/route';
import { POST as postSignIn } from '../../src/app/api/auth/sign-in/route';
import { POST as postSignOut } from '../../src/app/api/auth/sign-out/route';
import { POST as postSignOutAll } from '../../src/app/api/auth/sign-out-all/route';
import { assertNoPii } from '../../src/lib/privacy';
import { playerId, request, run, setupApi, type ApiEnv } from './helpers';

let env: ApiEnv;
const REASON_CANARY = 'canary reason zx41 night shift';
const UNKNOWN = '99999999-9999-4999-8999-999999999999';
interface Private {
  label: string;
  value: string;
}
const secrets: Private[] = [];
let demoMatchId = '';

beforeAll(async () => {
  env = await setupApi(); // fresh database + seed: 41 players with fake emails, phones and birth dates
  const next = await env.db.owner.run("select id from core.matches where status = 'scheduled' order by kickoff_at limit 1");
  demoMatchId = String(next.rows[0].id);
  // the seed has no RSVPs: add fake ones (going, maybe, not going, some with a reason) so there is RSVP data to leak
  const answers = ['going', 'maybe', 'not_going'];
  for (let n = 1; n <= 12; n++) {
    const answer = answers[n % 3];
    const res = await env.db.owner.run(
      'insert into core.rsvps (match_id, player_id, answer, reason) values ($1, $2, $3, $4)',
      [demoMatchId, playerId(n), answer, answer === 'not_going' ? `${REASON_CANARY} ${n}` : null],
      { commit: true },
    );
    expect(res.error, 'rsvp fixture inserted').toBeNull();
  }
  const players = await env.db.owner.run('select email, phone, date_of_birth::text as dob from core.players order by id');
  players.rows.forEach((p, i) => {
    secrets.push({ label: `player ${i + 1} email`, value: String(p.email) });
    if (p.phone) secrets.push({ label: `player ${i + 1} phone`, value: String(p.phone) });
    secrets.push({ label: `player ${i + 1} date of birth`, value: String(p.dob) });
  });
  secrets.push({ label: 'rsvp reason', value: REASON_CANARY });
  expect(secrets.length, 'private values to look for').toBeGreaterThan(100);
});
afterAll(async () => {
  await env?.close();
});

type Handler = (r: Request) => Promise<Response>;
const withId = (id: string): Handler => (r) => getPlayer(r, { params: Promise.resolve({ id }) });

interface Call {
  name: string;
  handler: Handler;
  method: string;
  path: string;
  body?: Record<string, unknown>;
}

const ids = Array.from({ length: 41 }, (_, i) => playerId(i + 1));
/** Every public route, called as a visitor (no cookie). Profiles: all 41 players (visible, hidden, archived) plus unknown and malformed ids. */
function visitorCalls(): Call[] {
  return [
    { name: 'GET /api/health', handler: getHealth, method: 'GET', path: '/api/health' },
    { name: 'GET /api/home', handler: getHome, method: 'GET', path: '/api/home' },
    { name: 'GET /api/squad', handler: getSquad, method: 'GET', path: '/api/squad' },
    ...[...ids, UNKNOWN, 'not-a-uuid'].map((id, i) => ({
      name: `GET /api/players/[id] (${i < 41 ? `player ${i + 1}` : id === UNKNOWN ? 'unknown id' : 'malformed id'})`,
      handler: withId(id),
      method: 'GET',
      path: `/api/players/${id}`,
    })),
    // routes that need a session answer a visitor with an error: that error must be clean too
    { name: 'GET /api/me (no session)', handler: getMe, method: 'GET', path: '/api/me' },
    { name: 'GET /api/me/settings (no session)', handler: getMySettings, method: 'GET', path: '/api/me/settings' },
    { name: 'PUT /api/me/settings (no session)', handler: putMySettings, method: 'PUT', path: '/api/me/settings', body: { public_opt_in: true } },
    { name: 'GET /api/fixtures/[id]/attendance (no session)', handler: (r) => getAttendance(r, { params: Promise.resolve({ id: demoMatchId }) }), method: 'GET', path: `/api/fixtures/${demoMatchId}/attendance` },
    { name: 'PUT /api/fixtures/[id]/rsvp (no session)', handler: (r) => putRsvp(r, { params: Promise.resolve({ id: demoMatchId }) }), method: 'PUT', path: `/api/fixtures/${demoMatchId}/rsvp`, body: { answer: 'going' } },
    { name: 'POST /api/auth/sign-in (unknown email)', handler: postSignIn, method: 'POST', path: '/api/auth/sign-in', body: { email: 'nobody@pintfc.test', password: 'not-a-real-password' } },
    { name: 'POST /api/auth/sign-out (no session)', handler: postSignOut, method: 'POST', path: '/api/auth/sign-out', body: {} },
    { name: 'POST /api/auth/sign-out-all (no session)', handler: postSignOutAll, method: 'POST', path: '/api/auth/sign-out-all', body: {} },
  ];
}

function findingsFor(name: string, text: string): string[] {
  const out: string[] = [];
  const hit = secrets.filter((s) => text.includes(s.value));
  if (hit.length) out.push(`${name}: contains ${hit.length} private value(s), e.g. ${hit.slice(0, 3).map((s) => s.label).join(', ')}`);
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* plain text is scanned as a string */
  }
  try {
    assertNoPii(parsed);
  } catch (e) {
    out.push(`${name}: ${(e as Error).message.split('\n').slice(1, 4).join(' ').trim()}`);
  }
  return out;
}

describe('invariant 1 at the API', () => {
  it('AC-4.3.1 [api] no public response contains email, phone, date of birth or RSVP', async () => {
    const findings: string[] = [];
    let ok200 = 0;
    for (const c of visitorCalls()) {
      const req = request(c.method, c.path, c.body ? { body: c.body } : {});
      const res = await c.handler(req);
      const text = await res.text();
      if (res.status === 200) ok200++;
      findings.push(...findingsFor(c.name, text));
      // a visitor never receives a session token (sign-out answers may clear the cookie, which carries no value)
      expect(/pf_session=[A-Za-z0-9_.-]{20,}/.test(res.headers.getSetCookie().join('\n')), `${c.name} sets no session token`).toBe(false);
    }
    expect(ok200, 'health, home, squad and the 37 visible profiles answered 200').toBe(1 + 1 + 1 + 37);
    expect(findings, 'private data in public API responses').toEqual([]);
  });

  it('T-12 [api] visitor never receives RSVP data', async () => {
    // there ARE rsvps in the database (12 of them, 4 with a reason): none of it may reach a visitor
    const count = await env.db.owner.run('select count(*)::int as n from core.rsvps');
    expect(count.rows[0].n).toBe(12);

    const home = await run(getHome, request('GET', '/api/home'));
    expect(home.status).toBe(200);
    const nm = (home.body as { next_match: Record<string, unknown> }).next_match;
    expect(Object.keys(nm).sort(), 'the next match carries no RSVP counts or lists').toEqual(
      ['cutoff_at', 'competition', 'id', 'kickoff_at', 'opponent', 'rsvp_open', 'venue'].sort(),
    );

    const everything = [
      JSON.stringify(home.body),
      JSON.stringify((await run(getSquad, request('GET', '/api/squad'))).body),
      ...(await Promise.all(ids.map(async (id) => JSON.stringify((await run(withId(id), request('GET', `/api/players/${id}`))).body)))),
    ].join('\n');
    expect(everything.includes(REASON_CANARY), 'no RSVP reason').toBe(false);
    // a count or flag about RSVPs is RSVP data too (assertNoPii's key list has `going` but not `going_count`)
    const rsvpKey = /rsvp|attend|going|maybe|answer|reason|respon/i;
    const keys: string[] = [];
    const collect = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(collect);
      else if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          keys.push(k);
          collect(x);
        }
      }
    };
    everything.split('\n').forEach((line) => collect(JSON.parse(line)));
    expect(keys.filter((k) => rsvpKey.test(k) && k !== 'rsvp_open'), 'no key that looks like RSVP data').toEqual([]);
    expect(/rsvps?\b|attend|going|maybe|not_going|no_answer|answer/i.test(everything.replace(/rsvp_open/g, '')), 'no RSVP word as a key or value').toBe(false);
  });

  it('API-INVENTORY [api] every route file is known to this sweep (add new routes to the sweep when they are added)', () => {
    const root = path.join(process.cwd(), 'src', 'app', 'api');
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === 'route.ts') found.push(path.relative(root, path.dirname(full)).split(path.sep).join('/'));
      }
    };
    walk(root);
    expect(found.sort()).toEqual(
      ['auth/sign-in', 'auth/sign-out', 'auth/sign-out-all', 'fixtures/[id]/attendance', 'fixtures/[id]/rsvp', 'health', 'home', 'me', 'me/settings', 'players/[id]', 'squad'].sort(),
    );
  });
});
