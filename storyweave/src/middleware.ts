import { NextResponse } from 'next/server';
import { auth } from './auth';

/**
 * Gate every page and most API routes behind sign-in. Carve-outs:
 *   - /api/auth/*   - the auth handlers themselves
 *   - /signin       - the sign-in page
 *   - /api/cron/*   - Vercel cron uses CRON_SECRET, not a session
 *   - /api/health   - public health check
 *   - /_blob/*      - local-dev blob serving (dev fallback only)
 *
 * DEV_FAKE_OWNER_EMAIL (non-production) bypasses the gate entirely so local
 * verification can drive the API without OAuth.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (process.env.NODE_ENV !== 'production' && process.env.DEV_FAKE_OWNER_EMAIL) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/signin') ||
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/_blob')
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
