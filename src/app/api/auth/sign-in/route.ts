import { AppError } from '../../../../lib/errors';
import { signInSchema } from '../../../../lib/schemas';
import { json, withApi } from '../../../../lib/with-api';
import { getAuth, padTo } from '../../../../server/auth';
import { withDb } from '../../../../server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Every outcome takes at least this long, so timing reveals nothing about which accounts exist (AC-1.1.4, T-08). */
const MIN_MS = Number(process.env.SIGN_IN_MIN_MS ?? 400);

export const POST = withApi(async ({ readJson }) => {
  const started = performance.now();
  try {
    const { email, password } = await readJson(signInSchema);
    const result = await getAuth().signIn(email, password);
    if (!result) throw new AppError('INVALID_CREDENTIALS'); // wrong password, unknown email and archived player look identical

    const rows = await withDb('authenticated', { sub: result.userId, session_id: result.sessionId }, async (c) => {
      const res = await c.query<{ id: string; full_name: string }>('select id, full_name from public.rpc_me()');
      return res.rows;
    });
    const response = json({ player: { id: rows[0].id, display_name: rows[0].full_name } });
    for (const cookie of result.setCookie) response.headers.append('set-cookie', cookie);
    return response;
  } finally {
    await padTo(started, MIN_MS);
  }
});
