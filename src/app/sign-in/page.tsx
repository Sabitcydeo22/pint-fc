import { redirect } from 'next/navigation';
import SignInForm from './SignInForm';
import { getCurrentPlayer } from './current-player';

export const metadata = { title: 'Sign in — PINT FC' };

// Redirect parameters (?next=, ?redirect=, ...) are deliberately never read: after sign-in the player always
// goes to "/" (threat T-19, no open redirect).
export default async function SignInPage() {
  if (await getCurrentPlayer()) redirect('/');
  return (
    <main data-testid="page-sign-in">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Sign in</h1>
        <SignInForm />
        <p className="muted" style={{ marginBottom: 0 }}>
          Players only.
        </p>
      </div>
    </main>
  );
}
