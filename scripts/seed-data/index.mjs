// Static, FAKE seed data for PINT FC. Nothing here is real: names are invented words,
// emails are @pintfc.test, phones are in the reserved fictional range +1-555-01xx.
//
// Id scheme (deterministic, valid UUID v4 shape):  TTTTTTTT-0000-4000-8000-NNNNNNNNNNNN
//   TTTTTTTT = entity type (player 1, team 2, venue 3, season 4, competition 5, match 6,
//              training 7, snapshot 8), NNNNNNNNNNNN = running number.
// Matches: past 1..12, demo match 100, regular upcoming 101..104.
// Re-running the seed updates these rows, never duplicates them.

const TYPE = { player: 1, team: 2, venue: 3, season: 4, competition: 5, match: 6, training: 7, snapshot: 8 };

export function id(kind, n) {
  const t = TYPE[kind];
  if (!t) throw new Error(`unknown id kind: ${kind}`);
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999_999) throw new RangeError('id number out of range');
  return `${String(t).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export const DEMO_MATCH_ID = id('match', 100);

// ---- the fake-name list (invented words; checked by tests/unit/seed-fake.test.ts) ----
export const FIRST_NAMES = [
  'Brenvik', 'Caldrin', 'Dorrel', 'Eskov', 'Fenrik', 'Garvane', 'Halvik',
  'Ismor', 'Jorvik', 'Kesmar', 'Lorvane', 'Mirrel', 'Norvik', 'Ostrel',
];
export const LAST_NAMES = [
  'Ashgrove', 'Brightmoor', 'Coldwater', 'Dunmere', 'Elmsworth', 'Fairhollow',
  'Greystone', 'Hartwick', 'Ironvale', 'Junipera', 'Kingsfold', 'Longmeadow',
];
const NATIONALITIES = ['USA', 'Canada', 'Mexico', 'Brazil', 'Ghana', 'Portugal', 'Ireland', 'Japan'];

// ---- venues and teams ----
export const VENUES = [
  { id: id('venue', 1), name: 'Fakefield Park', city: 'Newark' },
  { id: id('venue', 2), name: 'Riverside Ground', city: 'Hoboken' },
  { id: id('venue', 3), name: 'Harbor Field', city: 'Paterson' },
];

const CREST = '/img/placeholder-crest.svg';
export const TEAMS = [
  { id: id('team', 1), name: 'PINT FC', short_name: 'PFC', crest_url: CREST, is_us: true },
  { id: id('team', 2), name: 'Riverside Rovers', short_name: 'RIV', crest_url: CREST, is_us: false },
  { id: id('team', 3), name: 'Harbor Town', short_name: 'HAR', crest_url: CREST, is_us: false },
  { id: id('team', 4), name: 'Maple Athletic', short_name: 'MAP', crest_url: CREST, is_us: false },
  { id: id('team', 5), name: 'Cedar Park United', short_name: 'CED', crest_url: CREST, is_us: false },
  { id: id('team', 6), name: 'Lakeside Wanderers', short_name: 'LAK', crest_url: CREST, is_us: false },
  { id: id('team', 7), name: 'Ironbridge City', short_name: 'IRO', crest_url: CREST, is_us: false },
  { id: id('team', 8), name: 'Northfield Albion', short_name: 'NOR', crest_url: CREST, is_us: false },
];

// ---- players: 40 active (GK 4, DEF 14, MID 14, FWD 8) + 1 archived ----
const POSITIONS = [
  ...Array(4).fill('GK'), ...Array(14).fill('DEF'), ...Array(14).fill('MID'), ...Array(8).fill('FWD'),
];
export const MINOR_A_INDEX = 20; // MID: guardian consent and opted in
export const MINOR_B_INDEX = 33; // FWD: no guardian consent, not public
const ADULT_OPT_OUT = new Set([9, 27]); // adults who chose to be hidden
const ARCHIVED_INDEX = 40;

function fullName(i) {
  return `${FIRST_NAMES[i % 14]} ${LAST_NAMES[(i * 7 + Math.floor(i / 14)) % 12]}`;
}

/** `minorADob` / `minorBDob` are ISO dates chosen by the caller (relative to "today"). */
export function buildPlayers({ minorADob, minorBDob }) {
  const players = [];
  for (let i = 0; i <= ARCHIVED_INDEX; i++) {
    const name = fullName(i);
    const [first, last] = name.toLowerCase().split(' ');
    const isArchived = i === ARCHIVED_INDEX;
    const isMinorA = i === MINOR_A_INDEX;
    const isMinorB = i === MINOR_B_INDEX;
    const year = 1988 + ((i * 3) % 16);
    const month = 1 + ((i * 5) % 12);
    const day = 1 + ((i * 11) % 28);
    players.push({
      id: id('player', i + 1),
      full_name: name,
      position: isArchived ? 'MID' : POSITIONS[i],
      shirt_number: isArchived ? 7 : i + 1, // an archived player may reuse a number
      status: isArchived ? 'archived' : 'active',
      email: `${first}.${last}@pintfc.test`,
      phone: i % 5 === 4 ? null : `+1-555-01${String(i).padStart(2, '0')}`,
      date_of_birth: isMinorA ? minorADob : isMinorB ? minorBDob : `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      guardian_consent: isMinorA,
      public_opt_in: isMinorB ? false : !ADULT_OPT_OUT.has(i),
      show_photo: i % 2 === 0,
      show_nationality: i % 3 === 0,
      show_stats: i % 4 !== 1,
      photo_url: i % 6 === 5 ? null : '/img/placeholder-player.svg',
      nationality: i % 7 === 6 ? null : NATIONALITIES[i % 8],
    });
  }
  return players;
}

// ---- results (our goals first) ----
// 10 published league results: 6 wins, 2 draws, 2 losses, 19 goals for, 12 against.
export const LEAGUE_SCORES = [[2, 1], [3, 0], [1, 1], [0, 2], [2, 0], [4, 2], [2, 2], [1, 0], [1, 3], [3, 1]];
export const FRIENDLY_SCORE = [3, 1];
export const UNPUBLISHED_SCORE = [1, 0]; // saved, not published: the latest league match

// ---- the seeded league table snapshot (8 teams, 10 played each) ----
export const STANDINGS = [
  { team: 'Riverside Rovers', won: 7, drawn: 1, lost: 2, goals_for: 22, goals_against: 10 },
  { team: 'PINT FC', won: 6, drawn: 2, lost: 2, goals_for: 19, goals_against: 12 },
  { team: 'Harbor Town', won: 5, drawn: 4, lost: 1, goals_for: 17, goals_against: 11 },
  { team: 'Maple Athletic', won: 5, drawn: 2, lost: 3, goals_for: 16, goals_against: 13 },
  { team: 'Cedar Park United', won: 4, drawn: 3, lost: 3, goals_for: 14, goals_against: 13 },
  { team: 'Lakeside Wanderers', won: 3, drawn: 3, lost: 4, goals_for: 12, goals_against: 15 },
  { team: 'Ironbridge City', won: 2, drawn: 3, lost: 5, goals_for: 10, goals_against: 17 },
  { team: 'Northfield Albion', won: 1, drawn: 2, lost: 7, goals_for: 8, goals_against: 24 },
].map((r, i) => ({
  position: i + 1,
  ...r,
  played: r.won + r.drawn + r.lost,
  points: 3 * r.won + r.drawn,
}));

/** Everything static, for tests (minors get sample birth dates). */
export function staticData() {
  return {
    players: buildPlayers({ minorADob: '2010-07-12', minorBDob: '2011-03-03' }),
    teams: TEAMS,
    venues: VENUES,
    standings: STANDINGS,
    scores: { league: LEAGUE_SCORES, friendly: FRIENDLY_SCORE, unpublished: UNPUBLISHED_SCORE },
  };
}
