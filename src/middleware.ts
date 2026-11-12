// Runs before every page request (not API routes: withApi already sets its own headers).
//  1. Private pages with no session cookie at all are sent to /sign-in without touching the database (a quick
//     "optimistic" check; the page itself still checks that the session is alive, so a revoked cookie is refused too).
//  2. Every page response is `Cache-Control: no-store`, so Back and reload after sign-out ask the server again
//     instead of showing a saved copy (AC-1.6.4).
// Next 16 calls this file convention "proxy"; the plan names src/middleware.ts, which still works.
import { NextResponse, type NextRequest } from 'next/server';

const PRIVATE = /^\/(settings|fixtures)(\/|$)/;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PRIVATE.test(pathname) && !request.cookies.get('pf_session')?.value) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.search = '';
    const redirect = NextResponse.redirect(url);
    redirect.headers.set('cache-control', 'no-store');
    return redirect;
  }
  const response = NextResponse.next();
  response.headers.set('cache-control', 'no-store');
  return response;
}

export const config = {
  matcher: ['/((?!api/|_next/|favicon.ico).*)'],
};
