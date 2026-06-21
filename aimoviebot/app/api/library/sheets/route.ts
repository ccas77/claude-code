import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteCachedSheet,
  listAllCachedSheets,
  readSheetCache,
} from "@/lib/video-module/sheet-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

// GET /api/library/sheets                  -> list every cached sheet
// GET /api/library/sheets?source=<url>     -> cache lookup for one source
// DELETE /api/library/sheets?kind=...&source=<url> -> drop one entry
export async function GET(req: Request) {
  const url = new URL(req.url);
  const source = url.searchParams.get("source");
  const kindParam = url.searchParams.get("kind");

  if (source) {
    if (kindParam !== "character" && kindParam !== "location") {
      return NextResponse.json(
        { error: "kind must be 'character' or 'location' when source is set" },
        { status: 400, headers: noStore },
      );
    }
    const entry = await readSheetCache(kindParam, source);
    return NextResponse.json({ entry }, { headers: noStore });
  }

  const entries = await listAllCachedSheets();
  entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ entries }, { headers: noStore });
}

const deleteSchema = z.object({
  kind: z.enum(["character", "location"]),
  source: z.string().url(),
});

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const parsed = deleteSchema.safeParse({
    kind: url.searchParams.get("kind"),
    source: url.searchParams.get("source"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.message },
      { status: 400, headers: noStore },
    );
  }
  await deleteCachedSheet(parsed.data.kind, parsed.data.source);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
