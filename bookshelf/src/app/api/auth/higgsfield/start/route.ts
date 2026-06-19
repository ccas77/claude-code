import { NextRequest, NextResponse } from 'next/server';
import {
  buildAuthorizeUrl,
  encodePkceCookie,
  PKCE_COOKIE,
  PKCE_COOKIE_MAX_AGE,
} from '@/lib/higgsfield/oauth';
import { isPrimaryOwner } from '@/lib/owner-role';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    if (!(await isPrimaryOwner())) {
      // Higgsfield is single-tenant on the primary owner's token; only she can
      // initiate the OAuth handshake. Send a friend who hits this URL back to
      // the library with no further info.
      return NextResponse.redirect(new URL('/library', req.url));
    }
    const origin = new URL(req.url).origin;
    const redirectUri = `${origin}/api/auth/higgsfield/callback`;
    const { url, state, verifier } = await buildAuthorizeUrl(redirectUri);

    const res = NextResponse.redirect(url);
    res.cookies.set(PKCE_COOKIE, encodePkceCookie(state, verifier), {
      httpOnly: true,
      secure: req.url.startsWith('https'),
      sameSite: 'lax',
      path: '/',
      maxAge: PKCE_COOKIE_MAX_AGE,
    });
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed' },
      { status: 500 },
    );
  }
}
