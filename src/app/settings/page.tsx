import { redirect } from 'next/navigation';
import { getCurrentPlayer } from '../sign-in/current-player';

export const metadata = { title: 'My settings — PINT FC' };

// STUB (session 06): proves the sign-in redirect and the no-private-data-after-sign-out rules.
// The real privacy toggles arrive in a later session.
export default async function SettingsPage() {
  const player = await getCurrentPlayer();
  if (!player) redirect('/sign-in');
  return (
    <main data-testid="page-settings">
      <h1>My settings</h1>
      <p>
        Signed in as <strong data-testid="private-name">{player.displayName}</strong>
      </p>
    </main>
  );
}
