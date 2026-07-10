import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createImportSession } from "@/lib/import-session";

export const runtime = "nodejs";

const MAX_CHUNKS = 5000;

/**
 * POST /api/winners/import/facebook-report/start
 * Body: { totalChunks: number, totalRows: number, destinationId?: string }
 * Opens an import session and returns { importId }.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const totalChunks = Number(body?.totalChunks);
    const totalRows = Number(body?.totalRows);
    if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > MAX_CHUNKS) {
      return NextResponse.json(
        { error: `totalChunks must be an integer between 1 and ${MAX_CHUNKS}` },
        { status: 400 },
      );
    }
    if (!Number.isInteger(totalRows) || totalRows < 1) {
      return NextResponse.json(
        { error: "totalRows must be a positive integer" },
        { status: 400 },
      );
    }

    const session = await createImportSession({
      id: randomUUID(),
      destinationId: typeof body?.destinationId === "string" ? body.destinationId : null,
      totalChunks,
      totalRows,
      now: Date.now(),
    });

    return NextResponse.json({ importId: session.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "start failed" },
      { status: 500 },
    );
  }
}
