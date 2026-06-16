import { NextResponse } from 'next/server';
import { auth } from './auth';

/**
 * Gate every page and most API routes behind sign-in. Carve-outs:
 *   - /api/auth/*        - the auth handlers themselves
 *   - /signin            - the sign-in page
 *   - /api/cron/*        - Vercel cron uses CRON_SECRET, not a session
 *   - /api/admin/migrate - runs on deploy via cron-style auth
 *   - /api/health        - public health check
 *   - static assets      - covered by the matcher below
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/signin') ||
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/admin/migrate') ||
    pathname.startsWith('/api/health')
  ) {
    return NextResponse.next();
  }

  if (!req.auth) {
    const url = req.nextUrl.clone();
    url.pathname = '/signin';
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next|favicon.ico|.*\\..*).*)'],
};
