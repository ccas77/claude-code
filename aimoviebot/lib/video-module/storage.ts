import { put, head } from "@vercel/blob";
import type {
  Artifacts,
  Backend,
  Job,
  JobStatus,
  StageName,
} from "./types";

// Deterministic Blob keys. One job, one folder; per stage, one artifact.
// Retries overwrite (addRandomSuffix: false).

const key = (jobId: string, suffix: string) => `jobs/${jobId}/${suffix}`;

// Slug character names so they're safe as filename segments.
export const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "char";

export const keys = {
  job: (jobId: string) => key(jobId, "job.json"),
  upload: (jobId: string, name: string) => key(jobId, `uploads/${name}`),
  characterSheet: (jobId: string, characterName: string) =>
    key(jobId, `stage1-character-${slug(characterName)}.png`),
  locationSheet: (jobId: string) => key(jobId, "stage2-location.png"),
  shotList: (jobId: string) => key(jobId, "stage3-shotlist.json"),
  storyboard: (jobId: string) => key(jobId, "stage4-storyboard.png"),
  video: (jobId: string) => key(jobId, "stage5-video.mp4"),
};

const putBlob = async (
  k: string,
  body: Blob | ArrayBuffer | string,
  contentType?: string,
  mutable?: boolean,
) => {
  const blob = await put(k, body, {
    access: "public",
    addRandomSuffix: false,
    ...(contentType ? { contentType } : {}),
    allowOverwrite: true,
    // Mutable keys (job.json, shotList JSON) get cacheControlMaxAge: 0 so the
    // CDN never serves stale content after an overwrite. Without this, a
    // read-modify-write sequence can clobber newer state with older state.
    ...(mutable ? { cacheControlMaxAge: 0 } : {}),
  });
  return blob.url;
};

// putJSON / getJSON — used for job state, concept result, shot list, etc.
// These keys mutate, so they're written with cache-control: max-age=0.
export async function putJSON(key: string, data: unknown): Promise<string> {
  return putBlob(
    key,
    JSON.stringify(data, null, 2),
    "application/json",
    true,
  );
}

export async function getJSON<T>(key: string): Promise<T | null> {
  try {
    const meta = await head(key);
    // Cache-bust on the GET too: belt-and-suspenders since CDN cache headers
    // can be ignored by intermediate caches.
    const url = `${meta.url}${meta.url.includes("?") ? "&" : "?"}_t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Save an artifact returned by a backend (could be an HTTPS URL the backend
// hosts, or a data: URL from a base64 image). Downloads/decodes and stores in
// our Blob so the asset stays available even if the backend GCs its hosting.
export async function persistArtifact(
  key: string,
  sourceUrl: string,
  contentType?: string,
): Promise<string> {
  if (sourceUrl.startsWith("data:")) {
    const match = sourceUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("Malformed data URL");
    const ct = contentType ?? match[1];
    const bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
    return putBlob(key, new Blob([bytes], { type: ct }), ct);
  }
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`Could not fetch artifact ${sourceUrl}: ${res.status}`);
  }
  const ct = contentType ?? res.headers.get("content-type") ?? undefined;
  const buf = await res.arrayBuffer();
  return putBlob(key, buf, ct);
}

// Job state lifecycle ------------------------------------------------------

export async function readJob(jobId: string): Promise<Job | null> {
  return getJSON<Job>(keys.job(jobId));
}

export async function writeJob(job: Job): Promise<void> {
  job.updatedAt = new Date().toISOString();
  await putJSON(keys.job(job.jobId), job);
}

export async function updateJob(
  jobId: string,
  patch: (job: Job) => Job,
): Promise<Job> {
  const current = await readJob(jobId);
  if (!current) throw new Error(`Job ${jobId} not found`);
  const next = patch(current);
  await writeJob(next);
  return next;
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

