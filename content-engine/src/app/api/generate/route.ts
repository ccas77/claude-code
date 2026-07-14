import { NextResponse } from "next/server";
import { z } from "zod";
import { renderAll, renderOne } from "@/modules/catalog";
import type { Book } from "@/modules/types";

// Pure render endpoint: one book in -> all module outputs out. No DB, no auth,
// no external calls — so the studio runs locally with zero setup (DRY_RUN).
export const runtime = "nodejs";

const bookSchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  coverUrl: z.string().optional(),
  blurb: z.string().optional(),
  quotes: z.array(z.string()).default([]),
  tropes: z.array(z.string()).default([]),
  hashtags: z.array(z.string()).default([]),
  audioName: z.string().optional(),
  vibe: z.string().optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = z.object({ book: bookSchema, module: z.string().optional() }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const book = parsed.data.book as Book;
  if (parsed.data.module) {
    const out = renderOne(book, parsed.data.module);
    if (!out) return NextResponse.json({ error: "unknown module" }, { status: 404 });
    return NextResponse.json({ outputs: [out] });
  }
  return NextResponse.json({ outputs: renderAll(book) });
}
