import { AppError } from '../../../../lib/errors';
import { parseOrThrow, uuidSchema } from '../../../../lib/schemas';
import { json, withApi } from '../../../../lib/with-api';
import { getPlayerProfile } from '../../../../server/squad';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A public player profile. An id that is not a uuid is a 400. A hidden player, an archived player and an id that
 * never existed are ONE and the same 404 (same status, same body): nothing tells them apart (threat T-10).
 */
export const GET = withApi(async (_ctx, routeCtx) => {
  const { id } = await (routeCtx as { params: Promise<{ id: string }> }).params;
  const valid = parseOrThrow(uuidSchema, id);
  const profile = await getPlayerProfile(valid);
  if (!profile) throw new AppError('NOT_FOUND');
  return json({ player: profile });
});
