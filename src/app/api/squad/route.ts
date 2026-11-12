import { json, withApi } from '../../../lib/with-api';
import { getSquad } from '../../../server/squad';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApi(async () => json({ players: await getSquad() }));
