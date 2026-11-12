import { parseOrThrow, uuidSchema } from '../../../../../lib/schemas';
import { json, withApi } from '../../../../../lib/with-api';
import { requirePlayer } from '../../../../../server/auth';
import { getAttendance } from '../../../../../server/attendance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Counts and the attendance list (names and answers, never reasons) for signed-in players only, plus the caller's own
 * answer and reason. Whose `me` is comes from the session cookie alone. 401 without a live player session, 404 for an
 * unknown match, 400 for an id that is not a uuid.
 */
export const GET = withApi(async ({ request }, routeCtx) => {
  const session = await requirePlayer(request);
  const { id } = await (routeCtx as { params: Promise<{ id: string }> }).params;
  const matchId = parseOrThrow(uuidSchema, id);
  return json(await getAttendance(session, matchId));
});
