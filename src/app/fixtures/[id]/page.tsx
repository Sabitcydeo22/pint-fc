import { redirect } from 'next/navigation';
import { getCurrentPlayer } from '../../sign-in/current-player';

export const metadata = { title: 'Match — PINT FC' };

// STUB (session 06): only the signed-out redirect is real. The match header, counts and RSVP buttons arrive later.
export default async function FixturePage() {
  const player = await getCurrentPlayer();
  if (!player) redirect('/sign-in');
  return (
    <main data-testid="page-fixture">
      <h1>Match</h1>
    </main>
  );
}
