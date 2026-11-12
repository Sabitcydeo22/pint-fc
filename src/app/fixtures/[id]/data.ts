// Server-side check for /fixtures/[id]: does this match exist for the signed-in player? It goes through the same
// function as GET /api/fixtures/[id]/attendance (src/server/attendance.ts), so the page and the API cannot disagree.
// The data itself is fetched by the browser component (so it can refresh); this only decides "page or 404".
import { cookies } from 'next/headers';
import { AppError, mapDbError } from '../../../lib/errors';
import { log } from '../../../lib/log';
import { uuidSchema } from '../../../lib/schemas';
import { SESSION_COOKIE, getAuth } from '../../../server/auth';
import { getAttendance } from '../../../server/attendance';

export type MatchCheck = 'found' | 'not_found' | 'signed_out' | 'failed';

export async function checkMatch(id: string): Promise<MatchCheck> {
  if (!uuidSchema.safeParse(id).success) return 'not_found';
  const cookie = (await cookies()).get(SESSION_COOKIE);
  if (!cookie?.value) return 'signed_out';
  try {
    const request = new Request('http://localhost/', { headers: { cookie: `${SESSION_COOKIE}=${cookie.value}` } });
    const session = await getAuth().getUser(request);
    if (!session) return 'signed_out';
    await getAttendance(session, id);
    return 'found';
  } catch (e) {
    const err = e instanceof AppError ? e : mapDbError(e);
    if (err.code === 'NOT_FOUND') return 'not_found';
    if (err.code === 'UNAUTHENTICATED') return 'signed_out';
    log.error('fixture_page_failed', { error: e });
    return 'failed';
  }
}
