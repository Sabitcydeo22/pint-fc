import { AppError } from '../../../lib/errors';
import { json, withApi } from '../../../lib/with-api';
import { requirePlayer } from '../../../server/auth';
import { withDb } from '../../../server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Who am I? The player of the session cookie, read through the database's own rule (public.rpc_me). */
export const GET = withApi(async ({ request }) => {
  const session = await requirePlayer(request);
  const rows = await withDb('authenticated', { sub: session.userId, session_id: session.sessionId }, async (c) => {
    const res = await c.query<{ id: string; full_name: string }>('select id, full_name from public.rpc_me()');
    return res.rows;
  });
  if (rows.length === 0) throw new AppError('UNAUTHENTICATED');
  return json({ player: { id: rows[0].id, display_name: rows[0].full_name } });
});
