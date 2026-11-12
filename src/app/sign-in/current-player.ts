// Server-side "who is signed in?" for pages and the layout. It goes through the same AuthPort and the same
// database function (public.rpc_me) as GET /api/me, so a page and the API cannot disagree.
import { cookies } from 'next/headers';
import { log } from '../../lib/log';
import { SESSION_COOKIE, getAuth } from '../../server/auth';
import { withDb } from '../../server/db';

export interface CurrentPlayer {
  id: string;
  displayName: string;
}

/** The signed-in player, or null (no cookie, revoked or expired session, archived player, or a failure). */
export async function getCurrentPlayer(): Promise<CurrentPlayer | null> {
  const cookie = (await cookies()).get(SESSION_COOKIE);
  if (!cookie?.value) return null;
  try {
    const request = new Request('http://localhost/', { headers: { cookie: `${SESSION_COOKIE}=${cookie.value}` } });
    const session = await getAuth().getUser(request);
    if (!session) return null;
    const rows = await withDb('authenticated', { sub: session.userId, session_id: session.sessionId }, async (c) => {
      const res = await c.query<{ id: string; full_name: string }>('select id, full_name from public.rpc_me()');
      return res.rows;
    });
    return rows.length > 0 ? { id: rows[0].id, displayName: rows[0].full_name } : null;
  } catch (e) {
    log.error('current_player_failed', { error: e });
    return null;
  }
}
