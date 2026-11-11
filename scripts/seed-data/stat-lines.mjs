// Deterministic player stat lines for one match: 14 players (11 starters + 3 substitutes),
// and the goals in the lines add up to our goals in the result.
import { id } from './index.mjs';

/** Players are numbered by position block: GK 0-3, DEF 4-17, MID 18-31, FWD 32-39 (index into the 40 active). */
export function statLines(matchNumber, goalsFor) {
  const m = matchNumber;
  const gk = [m % 4];
  const def = [0, 1, 2, 3].map((j) => 4 + ((m * 3 + j) % 14));
  const mid = [0, 1, 2, 3].map((j) => 18 + ((m * 5 + j) % 14));
  const fwd = [0, 1].map((j) => 32 + ((m * 2 + j) % 8));
  const subs = [4 + ((m * 3 + 4) % 14), 18 + ((m * 5 + 4) % 14), 32 + ((m * 2 + 2) % 8)];

  const lineup = [
    ...gk.map((p) => ({ p, minutes: 90 })),
    ...def.map((p) => ({ p, minutes: 90 })),
    ...mid.map((p, j) => ({ p, minutes: j < 2 ? 90 : 70 })),
    ...fwd.map((p, j) => ({ p, minutes: j === 0 ? 80 : 65 })),
    ...subs.map((p, j) => ({ p, minutes: [20, 25, 10][j] })),
  ];

  const attackers = [...mid, ...fwd, subs[2]];
  const goals = new Map();
  const assists = new Map();
  for (let g = 0; g < goalsFor; g++) {
    const scorer = attackers[(m + g * 2) % attackers.length];
    goals.set(scorer, (goals.get(scorer) ?? 0) + 1);
    if (g % 3 !== 2) {
      const helper = attackers[(m + g * 2 + 1) % attackers.length];
      assists.set(helper, (assists.get(helper) ?? 0) + 1);
    }
  }

  return lineup.map(({ p, minutes }) => ({
    match_id: id('match', m),
    player_id: id('player', p + 1),
    minutes,
    goals: goals.get(p) ?? 0,
    assists: assists.get(p) ?? 0,
  }));
}
