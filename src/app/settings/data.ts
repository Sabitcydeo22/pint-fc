// Server-side data for /settings: the signed-in player's own settings, read through the same function as the API.
import { cookies } from 'next/headers';
import { log } from '../../lib/log';
import { SESSION_COOKIE, getAuth } from '../../server/auth';
import { getMySettings, type Settings } from '../../server/settings';

/** The caller's settings, or null (no cookie, revoked or expired session, archived player, or a failure). */
export async function getMySettingsForPage(): Promise<Settings | null> {
  const cookie = (await cookies()).get(SESSION_COOKIE);
  if (!cookie?.value) return null;
  try {
    const request = new Request('http://localhost/', { headers: { cookie: `${SESSION_COOKIE}=${cookie.value}` } });
    const session = await getAuth().getUser(request);
    if (!session) return null;
    return await getMySettings(session);
  } catch (e) {
    log.error('settings_page_failed', { error: e });
    return null;
  }
}
