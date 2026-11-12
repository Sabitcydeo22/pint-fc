import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { loadProfile } from './data';

// The visibility check lives HERE, not only in the page. A page with a loading.tsx is streamed, and once streaming
// has started the HTTP status is already 200; a layout sits outside that loading boundary, so notFound() here still
// produces a real 404 status for hidden, archived, unknown and not-a-uuid ids alike (threat T-10, AC-4.1.2).
export default async function PlayerLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await loadProfile(id))) notFound();
  return children;
}
