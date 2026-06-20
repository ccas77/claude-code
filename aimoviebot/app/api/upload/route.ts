import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

export const runtime = "nodejs";

// Server-side passthrough upload. Client posts multipart with one File under
// "file" plus a "kind" of "character" | "location" | "any" so we key it.
// For a minimum viable v1 this keeps the upload path simple. If file sizes
// or counts grow, swap to handleUpload (client direct-to-Blob) later.
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const kind = (form.get("kind") as string) || "upload";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file'" }, { status: 400 });
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `uploads/${kind}/${Date.now()}-${safeName}`;
  const blob = await put(key, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type || undefined,
  });
  return NextResponse.json({ url: blob.url, pathname: blob.pathname });
}
