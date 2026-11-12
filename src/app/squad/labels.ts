// Position labels shared by the squad and profile pages. The codes are the database's own (GK, DEF, MID, FWD),
// which is also the order the squad is grouped in.
import type { Position } from '../../server/squad';

export const POSITION_GROUPS: { code: Position; heading: string }[] = [
  { code: 'GK', heading: 'Goalkeepers' },
  { code: 'DEF', heading: 'Defenders' },
  { code: 'MID', heading: 'Midfielders' },
  { code: 'FWD', heading: 'Forwards' },
];

export const POSITION_SINGULAR: Record<Position, string> = {
  GK: 'Goalkeeper',
  DEF: 'Defender',
  MID: 'Midfielder',
  FWD: 'Forward',
};
