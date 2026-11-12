import type { ReactNode } from 'react';
import Footer from '../components/Footer';
import Header from '../components/Header';
import './globals.css';
import { getCurrentPlayer } from './sign-in/current-player';

export const metadata = { title: 'PINT FC' };
// The header depends on the session cookie, so every page is drawn per request.
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const player = await getCurrentPlayer();
  return (
    <html lang="en">
      <body>
        <Header player={player ? { displayName: player.displayName } : null} />
        <div className="page">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
