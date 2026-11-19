import { redirect } from 'next/navigation';
import { getCurrentPlayer } from '../sign-in/current-player';
import { getMySettingsForPage } from './data';
import SettingsForm from './SettingsForm';

export const metadata = { title: 'My settings — PINT FC' };
export const dynamic = 'force-dynamic';

// Players only. Whose settings these are comes from the session cookie alone: nothing in the URL is read.
export default async function SettingsPage() {
  const player = await getCurrentPlayer();
  if (!player) redirect('/sign-in');
  const settings = await getMySettingsForPage();
  if (!settings) redirect('/sign-in');
  return (
    <main data-testid="page-settings">
      {/* a form stays a narrow, centred column of at most 420 px on a wide screen (session 20d) */}
      <div className="card-narrow stack">
        <h1>My settings</h1>
        <p>
          Signed in as <strong data-testid="private-name">{player.displayName}</strong>
        </p>
        <p>
          Your email: <span data-testid="my-email">{settings.email}</span>
        </p>
        <SettingsForm initial={settings} />
      </div>
    </main>
  );
}
