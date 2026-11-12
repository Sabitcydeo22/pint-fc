import { json, withApi } from '../../../../lib/with-api';
import { settingsSchema } from '../../../../lib/schemas';
import { requirePlayer } from '../../../../server/auth';
import { getMySettings, updateMySettings } from '../../../../server/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The caller's own settings. Whose they are comes from the session cookie only; nothing in the URL is read. */
export const GET = withApi(async ({ request }) => {
  const session = await requirePlayer(request);
  return json({ settings: await getMySettings(session) });
});

/** Changes the caller's own flags. The body is strict: only the four flags, at least one (unknown keys are a 400). */
export const PUT = withApi(async ({ request, readJson }) => {
  const session = await requirePlayer(request);
  const change = await readJson(settingsSchema);
  return json({ settings: await updateMySettings(session, change) });
});
