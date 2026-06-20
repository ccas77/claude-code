import { NextResponse } from "next/server";
import { higgsfieldStore } from "@/lib/video-module/backends/higgsfield-store";

export const runtime = "nodejs";

export async function GET() {
  const tokens = await higgsfieldStore.getTokens();
  return NextResponse.json({
    connected: Boolean(tokens),
    expiresAt: tokens?.expiresAt ?? null,
  });
}
