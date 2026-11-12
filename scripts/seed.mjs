// Idempotent FAKE-data seed for PINT FC (session 04). No logins here: session 05 creates them with the same player ids.
//
//   node scripts/seed.mjs [--demo-cutoff-in 90m] [--database-url <url>] [--now <iso>] [--allow-remote]
//
//   --demo-cutoff-in  how long from now the demo match's RSVP cutoff falls (90m, 2h, 45s, 1d). Default 90m.
//                     kickoff = now + that + 2 h, so the cutoff lands exactly that far from now.
//   --database-url    default: the DATABASE_URL environment variable. It is NEVER printed.
//   --allow-remote    required for any database that is not on this computer. Only with the owner's yes.
//   --now             pretend "now" is this ISO instant (testing).
//   --logins          also create a TEST-ONLY LocalAuth login for every player that has none, and append the
//                     passwords to --credentials-file (default credentials.local.csv, gitignored). Passwords are
//                     never printed. Existing logins are left alone. Local databases only.
//
// Re-running updates the same rows (deterministic ids, see seed-data/index.mjs); nothing is duplicated
// and nothing is deleted. Moving the demo match = run it again with a new --demo-cutoff-in.
import { appendFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { ensureLocalAuthSchema, hashPassword, randomPassword } from '../src/server/auth/local-store.mjs';
import {
  DEMO_MATCH_ID,
  FRIENDLY_SCORE,
  LEAGUE_SCORES,
  STANDINGS,
  TEAMS,
  UNPUBLISHED_SCORE,
  VENUES,
  buildPlayers,
  id,
} from './seed-data/index.mjs';
import { statLines } from './seed-data/stat-lines.mjs';

export { DEMO_MATCH_ID };

const CLUB_TZ = 'America/New_York';
const HOUR = 3_600_000;

/** "90m" -> milliseconds. Units: s, m, h, d. Whole positive numbers only. */
export function parseDuration(text) {
  const m = /^(\d+)([smhd])$/.exec(typeof text === 'string' ? text : '');
  const n = m ? Number(m[1]) : 0;
  if (!m || n <= 0) throw new Error(`Invalid duration "${String(text)}": use a whole number and s, m, h or d, for example 90m.`);
  return n * { s: 1000, m: 60_000, h: HOUR, d: 24 * HOUR }[m[2]];
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Refuses a database that is not on this computer unless allowRemote. Never echoes the URL, host or password. */
export function assertSafeTarget(url, { allowRemote = false } = {}) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error('Invalid database URL.');
  }
  if (!LOCAL_HOSTS.has(host) && !allowRemote) {
    throw new Error('Refusing to seed a database that is not on this computer. Pass --allow-remote only after the owner has said yes.');
  }
}

/** Upsert rows (same keys on every row) by primary key. Column names are code constants, values are parameters. */
async function upsert(client, table, columns, keys, rows) {
  if (rows.length === 0) return;
  const params = [];
  const tuples = rows.map((row) => {
    const marks = columns.map((c) => {
      params.push(row[c]);
      return `$${params.length}`;
    });
    return `(${marks.join(', ')})`;
  });
  const updates = columns.filter((c) => !keys.includes(c)).map((c) => `${c} = excluded.${c}`);
  const action = updates.length ? `do update set ${updates.join(', ')}` : 'do nothing';
  await client.query(
    `insert into core.${table} (${columns.join(', ')}) values ${tuples.join(', ')} on conflict (${keys.join(', ')}) ${action}`,
    params,
  );
}

/**
 * Seeds one database. `client` is a connected pg Client (owner role).
 * options.now: the moment treated as "now" (default: the real now). options.demoCutoffInMs: see --demo-cutoff-in.
 * Returns row counts only.
 */
export async function seed(client, { now = new Date(), demoCutoffInMs = 90 * 60_000 } = {}) {
  const nowIso = now.toISOString();
  // calendar facts come from the database so the club time zone (and DST) is handled in one place
  const clubTime = async (dayOffset, hhmm) =>
    (await client.query(
      `select ((((($1::timestamptz at time zone '${CLUB_TZ}')::date) + $2::int) + $3::time) at time zone '${CLUB_TZ}') as ts`,
      [nowIso, dayOffset, hhmm],
    )).rows[0].ts;
  const clubDate = async (dayOffset) =>
    (await client.query(`select ((($1::timestamptz at time zone '${CLUB_TZ}')::date) + $2::int)::text as d`, [nowIso, dayOffset])).rows[0].d;
  const minorDob = async (interval) =>
    (await client.query(`select ((($1::timestamptz at time zone '${CLUB_TZ}')::date) - $2::interval)::date::text as d`, [nowIso, interval])).rows[0].d;

  await client.query('begin');
  try {
    // ---- season, competitions, venues, teams ----
    const startsOn = await clubDate(-120);
    const endsOn = await clubDate(240);
    const startYear = Number(startsOn.slice(0, 4));
    const seasonName = `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
    const seasonId = id('season', 1);
    await upsert(client, 'seasons', ['id', 'name', 'starts_on', 'ends_on', 'is_current'], ['id'],
      [{ id: seasonId, name: seasonName, starts_on: startsOn, ends_on: endsOn, is_current: true }]);
    const leagueId = id('competition', 1);
    const friendlyId = id('competition', 2);
    await upsert(client, 'competitions', ['id', 'season_id', 'name', 'kind'], ['id'], [
      { id: leagueId, season_id: seasonId, name: `League ${seasonName}`, kind: 'league' },
      { id: friendlyId, season_id: seasonId, name: `Friendlies ${seasonName}`, kind: 'friendly' },
    ]);
    await upsert(client, 'venues', ['id', 'name', 'city'], ['id'], VENUES);
    await upsert(client, 'teams', ['id', 'name', 'short_name', 'crest_url', 'is_us'], ['id'], TEAMS);

    // ---- players (adult birth dates are fixed; the two minors are 16 and 15 today) ----
    const players = buildPlayers({
      minorADob: await minorDob('16 years 3 months'),
      minorBDob: await minorDob('15 years 8 months'),
    });
    await upsert(client, 'players',
      ['id', 'full_name', 'position', 'shirt_number', 'status', 'email', 'phone', 'date_of_birth', 'guardian_consent',
        'public_opt_in', 'show_photo', 'show_nationality', 'show_stats', 'photo_url', 'nationality'],
      ['id'], players);

    // ---- matches ----
    const matchRows = [];
    const resultRows = [];
    const statRows = [];
    const opponent = (n) => id('team', 2 + (n % 7));
    // past: match k+1 was played 3 + 7k days ago at 19:00 club time. k=0 is the newest (its result is saved, NOT published);
    // k=5 is the friendly; the other ten are published league results.
    const publishedLeagueKs = [1, 2, 3, 4, 6, 7, 8, 9, 10, 11];
    for (let k = 0; k < 12; k++) {
      const number = k + 1;
      const kickoff = await clubTime(-(3 + 7 * k), '19:00');
      const home = k % 2 === 0;
      const friendly = k === 5;
      matchRows.push({
        id: id('match', number), season_id: seasonId, competition_id: friendly ? friendlyId : leagueId,
        opponent_id: opponent(k), venue_id: id('venue', home ? 1 : 2 + (k % 2)),
        home_away: home ? 'home' : 'away', kickoff_at: kickoff, status: 'played',
      });
      const published = k !== 0;
      const score = k === 0 ? UNPUBLISHED_SCORE : friendly ? FRIENDLY_SCORE : LEAGUE_SCORES[publishedLeagueKs.indexOf(k)];
      resultRows.push({
        match_id: id('match', number), goals_for: score[0], goals_against: score[1], published,
        published_at: published ? new Date(new Date(kickoff).getTime() + 3 * HOUR) : null,
      });
      if (published) statRows.push(...statLines(number, score[0]));
    }
    // upcoming: the demo match first (cutoff = now + demoCutoffInMs), then four weekly matches after it; the first of those is cancelled
    const demoKickoff = new Date(now.getTime() + demoCutoffInMs + 2 * HOUR);
    const upcoming = [{ number: 100, kickoff: demoKickoff, status: 'scheduled', opp: 0 }];
    for (let w = 1; w <= 4; w++) {
      const ts = (await client.query(
        `select (($1::timestamptz at time zone '${CLUB_TZ}') + ($2::int * interval '7 days')) at time zone '${CLUB_TZ}' as ts`,
        [demoKickoff.toISOString(), w],
      )).rows[0].ts;
      upcoming.push({ number: 100 + w, kickoff: ts, status: w === 1 ? 'cancelled' : 'scheduled', opp: w + 1 });
    }
    upcoming.forEach((u, i) => {
      matchRows.push({
        id: id('match', u.number), season_id: seasonId, competition_id: leagueId, opponent_id: opponent(u.opp),
        venue_id: id('venue', i % 2 === 0 ? 1 : 3), home_away: i % 2 === 0 ? 'home' : 'away',
        kickoff_at: u.kickoff, status: u.status,
      });
    });
    await upsert(client, 'matches',
      ['id', 'season_id', 'competition_id', 'opponent_id', 'venue_id', 'home_away', 'kickoff_at', 'status'], ['id'], matchRows);
    await upsert(client, 'results', ['match_id', 'goals_for', 'goals_against', 'published', 'published_at'], ['match_id'], resultRows);
    await upsert(client, 'player_match_stats', ['match_id', 'player_id', 'minutes', 'goals', 'assists'], ['match_id', 'player_id'], statRows);

    // ---- standings snapshot (taken the day after the latest published league match) ----
    const snapshotId = id('snapshot', 1);
    await upsert(client, 'standings_snapshots', ['id', 'season_id', 'taken_on'], ['id'],
      [{ id: snapshotId, season_id: seasonId, taken_on: await clubDate(-9) }]);
    const teamByName = new Map(TEAMS.map((t) => [t.name, t.id]));
    await upsert(client, 'standings_rows',
      ['snapshot_id', 'team_id', 'position', 'played', 'won', 'drawn', 'lost', 'goals_for', 'goals_against', 'points'],
      ['snapshot_id', 'team_id'],
      STANDINGS.map((r) => ({ snapshot_id: snapshotId, team_id: teamByName.get(r.team), ...r })));

    // ---- weekly trainings: 2 weeks back to 5 weeks ahead, 18:30 club time ----
    const trainings = [];
    for (let n = 1; n <= 8; n++) {
      trainings.push({ id: id('training', n), starts_at: await clubTime((n - 3) * 7 + 2, '18:30'), venue_id: id('venue', 1), note: 'Weekly training' });
    }
    await upsert(client, 'trainings', ['id', 'starts_at', 'venue_id', 'note'], ['id'], trainings);

    await client.query('commit');
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    throw e;
  }

  const counts = {};
  for (const t of ['seasons', 'competitions', 'venues', 'teams', 'players', 'matches', 'results', 'player_match_stats',
    'standings_snapshots', 'standings_rows', 'trainings', 'rsvps']) {
    counts[t] = (await client.query(`select count(*)::int as n from core.${t}`)).rows[0].n;
  }
  return counts;
}

// ---------------------------------------------------------------------------------------------
// logins (session 05): one LocalAuth login per player, same id as the player
// ---------------------------------------------------------------------------------------------
/**
 * Creates a LocalAuth login for every seeded player that has none yet (or only for `playerIds`).
 * LocalAuth is the TEST-ONLY stand-in for Supabase Auth (src/server/auth/local.ts), so this is for local databases only.
 * An existing login is never touched, so re-running the seed (to move the demo match) cannot reset anyone's password.
 * Returns [{ player_id, email, password }] for the NEW logins only. The passwords exist nowhere else: the caller
 * decides what to do with them (the command line writes them to a gitignored file, never to the screen).
 */
export async function createLogins(client, { playerIds } = {}) {
  await ensureLocalAuthSchema(client);
  const players = await client.query(
    'select id, email from core.players where ($1::uuid[] is null or id = any($1::uuid[])) order by id',
    [playerIds ?? null],
  );
  const created = [];
  for (const p of players.rows) {
    const exists = await client.query('select 1 from local_auth.users where id = $1', [p.id]);
    if (exists.rowCount > 0) continue;
    const password = randomPassword();
    const passwordHash = await hashPassword(password);
    await client.query('insert into local_auth.users (id, email, password_hash) values ($1, $2, $3) on conflict do nothing', [p.id, p.email, passwordHash]);
    created.push({ player_id: p.id, email: p.email, password });
  }
  return created;
}

/** Appends logins to a CSV (email,password,player_id). Creates it, with a header, if it is not there. Never overwrites. */
export function writeCredentialsFile(path, logins) {
  if (logins.length === 0) return 0;
  const lines = logins.map((l) => {
    for (const v of [l.email, l.password, l.player_id]) if (/[",\r\n]/.test(v)) throw new Error('Unexpected character in a credential value.');
    return `${l.email},${l.password},${l.player_id}`;
  });
  const header = existsSync(path) ? '' : 'email,password,player_id\n';
  appendFileSync(path, `${header}${lines.join('\n')}\n`, { mode: 0o600 });
  return logins.length;
}

// ---------------------------------------------------------------------------------------------
// command line
// ---------------------------------------------------------------------------------------------
function parseArgs(argv) {
  const out = { allowRemote: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--allow-remote') out.allowRemote = true;
    else if (a === '--logins') out.logins = true;
    else if (['--demo-cutoff-in', '--database-url', '--now', '--credentials-file'].includes(a)) {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value.`);
      out[a.slice(2)] = argv[++i];
    } else throw new Error(`Unknown option ${a}.`);
  }
  return out;
}

export async function main(argv) {
  const args = parseArgs(argv);
  const url = args['database-url'] ?? process.env.DATABASE_URL;
  if (!url) throw new Error('No database: pass --database-url or set DATABASE_URL.');
  assertSafeTarget(url, { allowRemote: args.allowRemote });
  if (args.logins && args.allowRemote) {
    throw new Error('--logins creates TEST-ONLY LocalAuth logins and cannot be combined with --allow-remote.');
  }
  const demoCutoffInMs = parseDuration(args['demo-cutoff-in'] ?? '90m');
  const now = args.now ? new Date(args.now) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error('--now must be an ISO date and time.');

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const counts = await seed(client, { now, demoCutoffInMs });
    console.log(`Seeded (demo match cutoff in ${args['demo-cutoff-in'] ?? '90m'}):`, JSON.stringify(counts));
    if (args.logins) {
      const file = args['credentials-file'] ?? 'credentials.local.csv';
      const created = await createLogins(client);
      const written = writeCredentialsFile(file, created);
      // counts and the file name only: passwords are never printed
      console.log(written > 0 ? `Created ${written} logins; passwords appended to ${file}.` : 'No new logins (all players already have one).');
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`seed failed: ${e.message}`);
    process.exit(1);
  });
}
