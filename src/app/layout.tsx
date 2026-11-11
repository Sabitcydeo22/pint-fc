import type { ReactNode } from 'react';

export const metadata = { title: 'PINT FC' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', color: '#0B1B2B' }}>
        {children}
      </body>
    </html>
  );
}
