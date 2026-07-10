import { NextRequest, NextResponse } from "next/server";
import { getImportSession, receivedChunkCount } from "@/lib/import-session";

export const runtime = "nodejs";

/**
 * GET /api/winners/import/facebook-report/status?importId=...
 * Progress for the import UI (and for resuming an interrupted upload:
 * the client can diff receivedChunks against what it sent).
 */
export async function GET(req: NextRequest) {
  const importId = req.nextUrl.searchParams.get("importId") ?? "";
  if (!importId) {
    return NextResponse.json({ error: "importId is required" }, { status: 400 });
  }
  const session = await getImportSession(importId);
  if (!session) {
    return NextResponse.json({ error: "unknown importId" }, { status: 404 });
  }
  const received = await receivedChunkCount(importId);
  return NextResponse.json({ ...session, receivedChunks: received });
}
