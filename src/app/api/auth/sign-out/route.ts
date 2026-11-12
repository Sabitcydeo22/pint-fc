import { noContent, withApi } from '../../../../lib/with-api';
import { getAuth } from '../../../../server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Ends this session. Idempotent: signing out twice, or without a session, is still 204. */
export const POST = withApi(async ({ request }) => {
  const { setCookie } = await getAuth().signOut(request);
  return noContent(setCookie);
});
