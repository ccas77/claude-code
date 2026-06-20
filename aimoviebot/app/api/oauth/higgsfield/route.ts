import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { buildAuthorizeUrl, makePkce } from "@/lib/video-module/backends/higgsfield-oauth";

export const runtime = "nodejs";

// Kicks off Connect-Higgsfield: generates PKCE, stores verifier + state in
// httpOnly cookies, redirects to Higgsfield's authorize endpoint.
export async function GET() {
  const { verifier, challenge } = makePkce();
  const state = crypto.randomBytes(16).toString("hex");
  const url = await buildAuthorizeUrl(state, challenge);

  const res = NextResponse.redirect(url);
  const opts = {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    maxAge: 600,
    path: "/",
  };
  res.cookies.set("hf_oauth_verifier", verifier, opts);
  res.cookies.set("hf_oauth_state", state, opts);
  return res;
}
