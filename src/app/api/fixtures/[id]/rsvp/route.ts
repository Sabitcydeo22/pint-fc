import { parseOrThrow, rsvpSchema, uuidSchema } from '../../../../../lib/schemas';
import { json, withApi } from '../../../../../lib/with-api';
import { requirePlayer } from '../../../../../server/auth';
import { setMyRsvp } from '../../../../../server/rsvp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Saves or changes the CALLER's RSVP for a match. Whose it is comes from the session cookie only: the body is strict
 * (`answer`, optional `reason` up to 140 characters; a player id or any other key is a 400) and nothing in the URL
 * except the match id is read. The database decides open or closed: 409 RSVP_CLOSED, 409 MATCH_NOT_OPEN, 404.
 */
export const PUT = withApi(async ({ request, readJson }, routeCtx) => {
  const session = await requirePlayer(request);
  const { id } = await (routeCtx as { params: Promise<{ id: string }> }).params;
  const matchId = parseOrThrow(uuidSchema, id);
  const change = await readJson(rsvpSchema);
  return json(await setMyRsvp(session, matchId, change));
});
