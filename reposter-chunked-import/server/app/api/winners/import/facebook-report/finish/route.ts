import { NextRequest, NextResponse } from "next/server";
import {
  getImportSession,
  receivedChunkCount,
  saveImportSession,
} from "@/lib/import-session";

// ADAPT: export the scoring pass from app/api/winners/recompute/route.ts
// (the pipelined ZRANGE + MGET / SET + ZADD version) as a plain function
// and reuse it here, so finishing an import recomputes exactly once.
import { recomputeScores } from "@/lib/recompute";

export const runtime = "nodejs";

/**
 * POST /api/winners/import/facebook-report/finish
 * Body: { importId: string }
 * Verifies every chunk arrived, then runs the score recompute once.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const importId = String(body?.importId ?? "");
    if (!importId) {
      return NextResponse.json({ error: "importId is required" }, { status: 400 });
    }

    const session = await getImportSession(importId);
    if (!session) {
      return NextResponse.json({ error: "unknown importId" }, { status: 404 });
    }
    if (session.status === "done") {
      return NextResponse.json({ importId, status: "done", importedRows: session.importedRows, skippedRows: session.skippedRows });
    }

    const received = await receivedChunkCount(importId);
    if (received < session.totalChunks) {
      return NextResponse.json(
        {
          error: `only ${received}/${session.totalChunks} chunks received — upload the missing chunks and call finish again`,
          receivedChunks: received,
          totalChunks: session.totalChunks,
        },
        { status: 409 },
      );
    }

    session.status = "recomputing";
    await saveImportSession(session);

    try {
      await recomputeScores();
    } catch (err) {
      session.status = "failed";
      session.error =
        "rows imported but recompute failed — run /api/winners/recompute manually: " +
        (err instanceof Error ? err.message : String(err));
      await saveImportSession(session);
      return NextResponse.json({ error: session.error }, { status: 500 });
    }

    session.status = "done";
    await saveImportSession(session);
    return NextResponse.json({
      importId,
      status: "done",
      importedRows: session.importedRows,
      skippedRows: session.skippedRows,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "finish failed" },
      { status: 500 },
    );
  }
}
