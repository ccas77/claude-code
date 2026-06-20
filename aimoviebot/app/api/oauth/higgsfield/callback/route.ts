import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/video-module/backends/higgsfield-oauth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get("hf_oauth_state")?.value;
  const verifier = req.cookies.get("hf_oauth_verifier")?.value;

  if (!code || !state || !verifier || state !== cookieState) {
    return NextResponse.json(
      { error: "Invalid OAuth callback" },
      { status: 400 },
    );
  }
  try {
    await exchangeCode(code, verifier);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
  return NextResponse.redirect(new URL("/?connected=1", req.url));
}
