import { NextRequest, NextResponse } from 'next/server';
import {
  decodePkceCookie,
  exchangeCode,
  PKCE_COOKIE,
} from '@/lib/higgsfield/oauth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errParam = url.searchParams.get('error');

  if (errParam) {
    return NextResponse.redirect(
      `${url.origin}/library/automation?higgsfield=error&reason=${encodeURIComponent(errParam)}`,
    );
  }
  if (!code || !state) {
    return NextResponse.json({ error: 'missing code or state' }, { status: 400 });
  }

  const cookie = req.cookies.get(PKCE_COOKIE)?.value;
  const decoded = decodePkceCookie(cookie);
  if (!decoded) {
    return NextResponse.json({ error: 'pkce cookie missing or invalid' }, { status: 400 });
  }
  if (decoded.state !== state) {
    return NextResponse.json({ error: 'state mismatch' }, { status: 400 });
  }

  try {
    await exchangeCode(code, decoded.verifier, `${url.origin}/api/auth/higgsfield/callback`);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'token exchange failed' },
      { status: 500 },
    );
  }

  const res = NextResponse.redirect(`${url.origin}/library/automation?higgsfield=connected`);
  res.cookies.delete(PKCE_COOKIE);
  return res;
}
