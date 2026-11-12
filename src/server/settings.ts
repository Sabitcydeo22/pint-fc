// The signed-in player's own settings (routes AND the page call these, so they cannot disagree).
// Read and written ONLY through public.rpc_my_settings / public.rpc_update_my_settings as role `authenticated`.
// Neither function takes a player id: the database decides whose row it is from the session, so there is no
// argument here that could point at somebody else.
import { AppError } from '../lib/errors';
import { withDb } from './db';

export interface Settings {
  public_opt_in: boolean;
  show_photo: boolean;
  show_nationality: boolean;
  show_stats: boolean;
  is_minor: boolean;
  guardian_consent: boolean;
  email: string;
}

/** The four flags a player may change. A missing key is left as it is. */
export interface SettingsChange {
  public_opt_in?: boolean;
  show_photo?: boolean;
  show_nationality?: boolean;
  show_stats?: boolean;
}

export interface Caller {
  userId: string;
  sessionId: string;
}

const claims = (c: Caller) => ({ sub: c.userId, session_id: c.sessionId });

export async function getMySettings(caller: Caller): Promise<Settings> {
  const rows = await withDb('authenticated', claims(caller), async (client) => {
    const res = await client.query<Settings>('select * from public.rpc_my_settings()');
    return res.rows;
  });
  if (rows.length === 0) throw new AppError('UNAUTHENTICATED');
  return rows[0];
}

export async function updateMySettings(caller: Caller, change: SettingsChange): Promise<Settings> {
  const rows = await withDb('authenticated', claims(caller), async (client) => {
    const res = await client.query<Settings>('select * from public.rpc_update_my_settings($1, $2, $3, $4)', [
      change.public_opt_in ?? null,
      change.show_photo ?? null,
      change.show_nationality ?? null,
      change.show_stats ?? null,
    ]);
    return res.rows;
  });
  if (rows.length === 0) throw new AppError('UNAUTHENTICATED');
  return rows[0];
}
