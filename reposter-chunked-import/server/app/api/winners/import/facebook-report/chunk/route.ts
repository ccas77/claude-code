import { NextRequest, NextResponse } from "next/server";
import {
  claimChunk,
  getImportSession,
  receivedChunkCount,
  saveImportSession,
} from "@/lib/import-session";

// ADAPT: these two functions already exist inside your current
// app/api/winners/import/facebook-report/route.ts — export them from a
// shared module instead of keeping them inline there:
//
//   parseFacebookReportCsv(text) — the papaparse wrapper with the
//     tab/semicolon/comma auto-try and the row-level error tolerance.
//     Here it only ever sees ≤ CHUNK_ROWS rows (header re-attached by the
//     client), so it stays fast.
//
//   writeReportRows(rows, destinationId) — the pipelined Upstash writer
//     from the "1 HTTP request per 50 rows" fix (platform_post SET,
//     snapshot, score ZADD, index entries). Must return
//     { imported: number, skipped: number }.
import {
  parseFacebookReportCsv,
  writeReportRows,
} from "@/lib/facebook-report";

export const runtime = "nodejs";

/**
 * POST /api/winners/import/facebook-report/chunk
 * Body: { importId: string, chunkIndex: number, csv: string }
 * `csv` is the original header line plus ≤ CHUNK_ROWS data records,
 * so the server-side parser (delimiter auto-detection, column mapping,
 * aliases) runs unchanged — just on a bounded slice.
 */
export async function POST(req: NextRequest) {
  let importId = "";
  try {
    const body = await req.json();
    importId = String(body?.importId ?? "");
    const chunkIndex = Number(body?.chunkIndex);
    const csv = body?.csv;

    if (!importId || !Number.isInteger(chunkIndex) || typeof csv !== "string") {
      return NextResponse.json(
        { error: "importId, chunkIndex and csv are required" },
        { status: 400 },
      );
    }

    const session = await getImportSession(importId);
    if (!session) {
      return NextResponse.json({ error: "unknown importId" }, { status: 404 });
    }
    if (session.status !== "uploading") {
      return NextResponse.json(
        { error: `import is ${session.status}, not accepting chunks` },
        { status: 409 },
      );
    }
    if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      return NextResponse.json({ error: "chunkIndex out of range" }, { status: 400 });
    }

    // Idempotent: a retried chunk that already landed is acknowledged, not re-imported.
    const fresh = await claimChunk(importId, chunkIndex);
    if (fresh) {
      const rows = parseFacebookReportCsv(csv);
      const { imported, skipped } = await writeReportRows(rows, session.destinationId);
      session.importedRows += imported;
      session.skippedRows += skipped;
      await saveImportSession(session);
    }

    const received = await receivedChunkCount(importId);
    return NextResponse.json({
      importId,
      chunkIndex,
      duplicate: !fresh,
      receivedChunks: received,
      totalChunks: session.totalChunks,
      importedRows: session.importedRows,
      skippedRows: session.skippedRows,
    });
  } catch (err) {
    // Best effort: surface the failure on the session so /status shows it.
    try {
      const session = importId ? await getImportSession(importId) : null;
      if (session) {
        session.status = "failed";
        session.error = err instanceof Error ? err.message : "chunk failed";
        await saveImportSession(session);
      }
    } catch {
      // status write is advisory only
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "chunk failed" },
      { status: 500 },
    );
  }
}
