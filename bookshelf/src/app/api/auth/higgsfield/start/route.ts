import { NextRequest, NextResponse } from 'next/server';
import {
  buildAuthorizeUrl,
  encodePkceCookie,
  PKCE_COOKIE,
  PKCE_COOKIE_MAX_AGE,
} from '@/lib/higgsfield/oauth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
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
