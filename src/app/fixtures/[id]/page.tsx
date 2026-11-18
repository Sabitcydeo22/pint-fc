import { notFound, redirect } from 'next/navigation';
import Attendance from '../../../components/Attendance';
import { getCurrentPlayer } from '../../sign-in/current-player';
import { checkMatch } from './data';

export const metadata = { title: 'Match — PINT FC' };
export const dynamic = 'force-dynamic';

// Players only (a visitor never gets here: the middleware and this page both send them to /sign-in, as session 06's
// AC-1.6.3 and session 12's crawl require). An unknown or malformed match id is the not-found page with a real 404.
// The match data is fetched by the browser component, so it can refresh; this page decides "page or 404".
export default async function FixturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = await getCurrentPlayer();
  if (!player) redirect('/sign-in');
  const check = await checkMatch(id);
  if (check === 'not_found') notFound();
  if (check === 'signed_out') redirect('/sign-in');
  return (
    <main data-testid="page-fixture" className="stack">
      <Attendance matchId={id} />
    </main>
  );
}
