import { NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { Redis } from "@upstash/redis";
import type { Job } from "@/lib/video-module/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// One-shot migration: every job whose JSON snapshots live in Blob
// (pre-KV) gets its latest snapshot loaded and written to Redis. Safe
// to re-run — idempotent overwrite.
//
// Only meant to be called once after the KV switchover. Not linked
// from any UI; trigger with `vercel curl /api/admin/migrate-jobs-to-kv
// -- --request POST`.
export async function POST() {
  const redis = Redis.fromEnv();
  const all = await list({ prefix: "jobs/", limit: 1000 });

  const latestByJob = new Map<
    string,
    { url: string; uploadedAt: Date }
  >();
  for (const b of all.blobs) {
    const m = b.pathname.match(/^jobs\/([0-9a-f-]+)\/job-\d+-/i);
    if (!m) continue;
    const jobId = m[1];
    const uploadedAt = new Date(b.uploadedAt);
    const existing = latestByJob.get(jobId);
    if (!existing || uploadedAt.getTime() > existing.uploadedAt.getTime()) {
      latestByJob.set(jobId, { url: b.url, uploadedAt });
    }
  }

  let migrated = 0;
  let skipped = 0;
  const errors: { jobId: string; reason: string }[] = [];

  await Promise.all(
    Array.from(latestByJob.entries()).map(async ([jobId, entry]) => {
      try {
        const res = await fetch(entry.url, { cache: "no-store" });
        if (!res.ok) {
          errors.push({ jobId, reason: `fetch ${res.status}` });
          return;
        }
        const job = (await res.json()) as Job;
        const ts = new Date(job.updatedAt ?? entry.uploadedAt.toISOString()).getTime();
        const pipe = redis.pipeline();
        pipe.set(`job:${jobId}`, job);
        pipe.zadd("jobs:index", { score: ts, member: jobId });
        await pipe.exec();
        migrated += 1;
      } catch (e) {
        errors.push({
          jobId,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  return NextResponse.json({ scanned: latestByJob.size, migrated, skipped, errors });
}
