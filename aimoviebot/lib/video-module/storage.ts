import crypto from "node:crypto";
import { put } from "@vercel/blob";
import { Redis } from "@upstash/redis";
import type {
  Artifacts,
  Backend,
  InflightHiggsfieldJob,
  Job,
  JobStatus,
  StageName,
} from "./types";

// Job state lives in Upstash Redis (KV), keyed by jobId. Strongly
// consistent. Replaces the previous "JSON files in Vercel Blob + retry
// hacks on list()" approach which kept failing on Blob's eventual
// consistency. Binary artifacts (PNGs, MP4s) still live in Blob —
// they're large, immutable, and CDN delivery is the right model.
//
// Atomic update pattern (read-modify-write): all updateJob calls go
// through a Redis WATCH+MULTI transaction so two concurrent steps
// can't lose each other's writes. The previous JSON-blob race that
// dropped storyboardUrls is no longer possible.

const redis = Redis.fromEnv();

const jobKey = (jobId: string) => `job:${jobId}`;
const jobsIndexKey = "jobs:index"; // sorted set of jobIds by updatedAt ms

const key = (jobId: string, suffix: string) => `jobs/${jobId}/${suffix}`;

// Slug character names so they're safe as filename segments.
export const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "char";

// Blob key helpers. Unchanged from the pre-KV layout so existing
// artifacts on Blob continue to resolve.
export const keys = {
  upload: (jobId: string, name: string) => key(jobId, `uploads/${name}`),
  characterSheet: (jobId: string, characterName: string) =>
    key(jobId, `stage1-character-${slug(characterName)}.png`),
  locationSheet: (jobId: string) => key(jobId, "stage2-location.png"),
  storyboardChunk: (jobId: string, i: number) =>
    key(jobId, `stage4-storyboard-${i}.png`),
  videoClip: (jobId: string, i: number) =>
    key(jobId, `stage5-clip-${i}.mp4`),
  video: (jobId: string) => key(jobId, "stage6-final.mp4"),
  // Legacy prefixes — kept so the projects-listing API can still discover
  // jobs from before the KV migration and the backfill route can read
  // the historical shot list JSONs.
  jobPrefix: (jobId: string) => `jobs/${jobId}/job-`,
  shotListPrefix: (jobId: string) => `jobs/${jobId}/stage3-shotlist-`,
};

// Insert a 12-char content hash before the file extension so URLs
// change when content changes. e.g.:
//   jobs/abc/stage4-storyboard-2.png
// becomes
//   jobs/abc/stage4-storyboard-2-9f3a1b8c0d2e.png
// Browsers and CDNs cache by URL, so every regen produces a fresh URL
// that bypasses all caches automatically. No ?v= query-string hacks.
// Old versions stay in Blob as history — Blob storage is cheap and
// having the audit trail is useful.
function withContentHash(baseKey: string, bytes: Uint8Array): string {
  const hash = crypto
    .createHash("sha256")
    .update(bytes)
    .digest("hex")
    .slice(0, 12);
  const dot = baseKey.lastIndexOf(".");
  if (dot < 0) return `${baseKey}-${hash}`;
  return `${baseKey.slice(0, dot)}-${hash}${baseKey.slice(dot)}`;
}

// Save an artifact returned by a backend (HTTPS URL or data: URL) to a
// content-addressed Blob key. Used for binary artifacts only.
export async function persistArtifact(
  baseKey: string,
  sourceUrl: string,
  contentType?: string,
): Promise<string> {
  let bytes: Uint8Array;
  let ct: string | undefined;
  if (sourceUrl.startsWith("data:")) {
    const match = sourceUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("Malformed data URL");
    ct = contentType ?? match[1];
    bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
  } else {
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      throw new Error(`Could not fetch artifact ${sourceUrl}: ${res.status}`);
    }
    ct = contentType ?? res.headers.get("content-type") ?? undefined;
    bytes = new Uint8Array(await res.arrayBuffer());
  }
  const key = withContentHash(baseKey, bytes);
  // Blob constructor in this TS lib version doesn't accept Uint8Array
  // directly. Round through a fresh ArrayBuffer to satisfy BlobPart.
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const blob = await put(key, new Blob([ab], { type: ct }), {
    access: "public",
    addRandomSuffix: false,
    ...(ct ? { contentType: ct } : {}),
    allowOverwrite: true,
  });
  return blob.url;
}

// Job state lifecycle ------------------------------------------------------

export async function readJob(jobId: string): Promise<Job | null> {
  const raw = await redis.get<Job>(jobKey(jobId));
  return raw ?? null;
}

export async function writeJob(job: Job): Promise<void> {
  job.updatedAt = new Date().toISOString();
  const ts = Date.now();
  // Single round-trip: set the job blob + update the by-updated-at
  // index entry. Index lets /api/projects do a fast time-sorted list
  // without scanning every key.
  const pipe = redis.pipeline();
  pipe.set(jobKey(job.jobId), job);
  pipe.zadd(jobsIndexKey, { score: ts, member: job.jobId });
  await pipe.exec();
}

// Atomic read-modify-write. Uses Upstash Redis transactions
// (WATCH/MULTI/EXEC) so two concurrent updates can't clobber each
// other. The classic stage5 "two parallel clip steps both write
// inflight, one wins, one entry is lost" race is no longer possible.
export async function updateJob(
  jobId: string,
  patch: (job: Job) => Job,
): Promise<Job> {
  // Optimistic-concurrency loop. Upstash's pipeline doesn't have true
  // WATCH semantics over the REST API, so we use a versioned read-
  // modify-write: bump a per-job version each write, refuse to commit
  // if the version moved underneath us, retry up to 5 times.
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await redis.get<Job>(jobKey(jobId));
    if (!current) throw new Error(`Job ${jobId} not found`);
    const next = patch(current);
    next.updatedAt = new Date().toISOString();
    // Tag in-memory; not stored back as a field, just compared via raw
    // string equality. Cheap optimistic concurrency.
    const writeRes = await redis.eval(
      `local cur = redis.call('GET', KEYS[1])
       if cur == ARGV[1] then
         redis.call('SET', KEYS[1], ARGV[2])
         redis.call('ZADD', KEYS[2], ARGV[3], ARGV[4])
         return 1
       end
       return 0`,
      [jobKey(jobId), jobsIndexKey],
      [
        JSON.stringify(current),
        JSON.stringify(next),
        String(Date.now()),
        jobId,
      ],
    );
    if (writeRes === 1) return next;
    // Lost the race — another step wrote between our read and our
    // commit. Loop and re-read.
  }
  throw new Error(
    `updateJob(${jobId}) lost the optimistic-concurrency race 5 times`,
  );
}

export async function setStatus(jobId: string, status: JobStatus): Promise<void> {
  await updateJob(jobId, (j) => ({ ...j, status }));
}

export async function mergeArtifacts(
  jobId: string,
  patch: Partial<Artifacts>,
): Promise<void> {
  await updateJob(jobId, (j) => ({
    ...j,
    artifacts: { ...j.artifacts, ...patch },
  }));
}

export async function recordBackend(
  jobId: string,
  stage: StageName,
  backend: Backend,
): Promise<void> {
  await updateJob(jobId, (j) => ({
    ...j,
    servedBy: { ...(j.servedBy ?? {}), [stage]: backend },
  }));
}

export async function trackInflightHiggsfieldJob(
  jobId: string,
  entry: InflightHiggsfieldJob,
): Promise<void> {
  await updateJob(jobId, (j) => {
    const existing = j.artifacts.inflightHiggsfieldJobs ?? [];
    const without = existing.filter((e) => e.hfJobId !== entry.hfJobId);
    return {
      ...j,
      artifacts: {
        ...j.artifacts,
        inflightHiggsfieldJobs: [...without, entry],
      },
    };
  });
}

export async function clearInflightHiggsfieldJob(
  jobId: string,
  hfJobId: string,
): Promise<void> {
  await updateJob(jobId, (j) => {
    const existing = j.artifacts.inflightHiggsfieldJobs ?? [];
    return {
      ...j,
      artifacts: {
        ...j.artifacts,
        inflightHiggsfieldJobs: existing.filter((e) => e.hfJobId !== hfJobId),
      },
    };
  });
}

// Shot list is a substantial JSON object; we store it inline on the job
// (artifacts.shotList) so a single readJob has everything. The separate
// stage3-shotlist-*.json blobs are no longer written.
export async function writeShotList(jobId: string, shots: unknown): Promise<void> {
  await mergeArtifacts(jobId, { shotList: shots as Artifacts["shotList"] });
}

// Used by /api/projects to list every job time-sorted, newest first.
// Replaces the previous "list every jobs/*/job-*.json prefix and pick
// the latest" Blob-scanning approach.
// Stable fingerprint of an ordered clip URL list. Used to detect
// when the current clip set differs from what was last stitched into
// the final video (so the UI can show / hide a "Restitch" button).
export function clipUrlsFingerprint(urls: string[] | undefined): string {
  if (!urls || urls.length === 0) return "";
  return crypto
    .createHash("sha256")
    .update(urls.join("|"))
    .digest("hex")
    .slice(0, 16);
}

export async function listAllJobIds(limit = 200): Promise<string[]> {
  // ZRANGE 0..limit-1 REV gives us most-recently-updated first.
  const ids = await redis.zrange<string[]>(jobsIndexKey, 0, limit - 1, {
    rev: true,
  });
  return ids;
}
