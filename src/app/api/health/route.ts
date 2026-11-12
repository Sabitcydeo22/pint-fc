import { json, withApi } from '../../../lib/with-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApi(async () => json({ ok: true }));
