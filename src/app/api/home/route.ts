import { json, withApi } from '../../../lib/with-api';
import { getHome } from '../../../server/home';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApi(async () => json(await getHome()));
