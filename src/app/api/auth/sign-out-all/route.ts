import { noContent, withApi } from '../../../../lib/with-api';
import { getAuth, requirePlayer } from '../../../../server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Ends every session of the signed-in player ("sign out of all devices"). */
export const POST = withApi(async ({ request }) => {
  const session = await requirePlayer(request);
  const { setCookie } = await getAuth().signOutAll(session);
  return noContent(setCookie);
});
