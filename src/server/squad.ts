// The data behind the public squad and player profile (routes AND pages call these, so they cannot disagree).
// Read through the public views as role `anon`: who is public is decided in the database
// (core.is_publicly_visible), never here. A hidden player, an archived player and an id that never existed all
// come back the same way: no row, so `null`.
import { uuidSchema } from '../lib/schemas';
import { withDb } from './db';

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface SquadPlayer {
  id: string;
  name: string;
  position: Position;
  shirt_number: number;
}

/** The public profile. The optional keys are ABSENT (never null) unless the player consented and there is data. */
export interface PlayerProfile extends SquadPlayer {
  photo_url?: string;
  nationality?: string;
  stats?: { appearances: number; goals: number; assists: number; minutes: number };
}

/** Visible players, grouped by position (GK, DEF, MID, FWD) then by shirt number: the view's own order. */
export async function getSquad(): Promise<SquadPlayer[]> {
  return withDb('anon', null, async (client) => {
    const res = await client.query<SquadPlayer>('select id, name, position, shirt_number from public.v_squad');
    return res.rows;
  });
}

interface ProfileRow extends SquadPlayer {
  photo_url: string | null;
  nationality: string | null;
  appearances: number | null;
  goals: number | null;
  assists: number | null;
  minutes: number | null;
}

/** The profile of a visible player, or null (hidden, archived, unknown and not-a-uuid are all the same: null). */
export async function getPlayerProfile(id: string): Promise<PlayerProfile | null> {
  if (!uuidSchema.safeParse(id).success) return null;
  return withDb('anon', null, async (client) => {
    const res = await client.query<ProfileRow>(
      `select id, name, position, shirt_number, photo_url, nationality, appearances, goals, assists, minutes
         from public.v_player_profile where id = $1`,
      [id],
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    const profile: PlayerProfile = { id: r.id, name: r.name, position: r.position, shirt_number: r.shirt_number };
    if (r.photo_url !== null) profile.photo_url = r.photo_url;
    if (r.nationality !== null) profile.nationality = r.nationality;
    if (r.appearances !== null) {
      profile.stats = { appearances: r.appearances, goals: r.goals ?? 0, assists: r.assists ?? 0, minutes: r.minutes ?? 0 };
    }
    return profile;
  });
}
