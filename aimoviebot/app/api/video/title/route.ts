import { NextResponse } from "next/server";
import { z } from "zod";
import { readJob, updateJob } from "@/lib/video-module/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rename a render. Empty / whitespace-only title clears it back to the
// jobId fallback used by the UI.
const bodySchema = z.object({
  jobId: z.string().uuid(),
  title: z.string().max(100),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { jobId } = parsed.data;
  const trimmed = parsed.data.title.trim();

  const job = await readJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  await updateJob(jobId, (j) => ({
    ...j,
    title: trimmed.length > 0 ? trimmed : undefined,
  }));
  return NextResponse.json({ jobId, title: trimmed || null });
}
