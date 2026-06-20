import { put, head, list } from "@vercel/blob";
import type {
  Artifacts,
  Backend,
  InflightHiggsfieldJob,
  Job,
  JobStatus,
  StageName,
} from "./types";

// Deterministic Blob keys for immutable artifacts. Mutable JSON (job state,
// shot list) uses a per-write unique URL pattern (see below).

const key = (jobId: string, suffix: string) => `jobs/${jobId}/${suffix}`;

// Slug character names so they're safe as filename segments.
export const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "char";

export const keys = {
  jobPrefix: (jobId: string) => `jobs/${jobId}/job-`,
  shotListPrefix: (jobId: string) => `jobs/${jobId}/stage3-shotlist-`,
  upload: (jobId: string, name: string) => key(jobId, `uploads/${name}`),
  characterSheet: (jobId: string, characterName: string) =>
    key(jobId, `stage1-character-${slug(characterName)}.png`),
  locationSheet: (jobId: string) => key(jobId, "stage2-location.png"),
  storyboard: (jobId: string) => key(jobId, "stage4-storyboard.png"),
  video: (jobId: string) => key(jobId, "stage5-video.mp4"),
};

// Put for IMMUTABLE artifacts (character sheets, location, storyboard, video).
// Same key + allowOverwrite handles re-renders; these are read from in-process
// after upload via the returned URL, not via a future read-after-write, so the
// 60s CDN cache is never observed as a problem here.
const putImmutable = async (
  k: string,
  body: Blob | ArrayBuffer | string,
  contentType?: string,
) => {
  const blob = await put(k, body, {
    access: "public",
    addRandomSuffix: false,
    ...(contentType ? { contentType } : {}),
    allowOverwrite: true,
  });
  return blob.url;
};

// Put for MUTABLE JSON state. Each write creates a NEW unique URL via the
// random suffix. Reads find the latest via list() + uploadedAt sort, which
// goes through the metadata API (not the body CDN) and is therefore fresh.
// This bypasses Vercel Blob's 60s minimum CDN cache on body fetches.
const putMutable = async (prefix: string, data: unknown) => {
  const blob = await put(`${prefix}${Date.now()}.json`, JSON.stringify(data, null, 2), {
    access: "public",
    addRandomSuffix: true,
    contentType: "application/json",
  });
  return blob.url;
};

async function readLatestJSON<T>(prefix: string): Promise<T | null> {
  try {
    const result = await list({ prefix });
    if (result.blobs.length === 0) return null;
    result.blobs.sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
    );
    const latest = result.blobs[0];
    const res = await fetch(latest.url, { cache: "no-store" });
    if (!res.ok) {
      console.log(`[readLatestJSON ${prefix}] fetch !ok ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.log(
      `[readLatestJSON ${prefix}] threw: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

// Save an artifact returned by a backend (HTTPS URL or data: URL) to a
// deterministic Blob key. Used for binary artifacts only.
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
    return putImmutable(key, new Blob([bytes], { type: ct }), ct);
  }
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`Could not fetch artifact ${sourceUrl}: ${res.status}`);
  }
  const ct = contentType ?? res.headers.get("content-type") ?? undefined;
  const buf = await res.arrayBuffer();
  return putImmutable(key, buf, ct);
}

// Job state lifecycle ------------------------------------------------------

export async function readJob(jobId: string): Promise<Job | null> {
  return readLatestJSON<Job>(keys.jobPrefix(jobId));
}

export async function writeJob(job: Job): Promise<void> {
  job.updatedAt = new Date().toISOString();
  await putMutable(keys.jobPrefix(job.jobId), job);
}

export async function writeShotList(jobId: string, shots: unknown): Promise<void> {
  await putMutable(keys.shotListPrefix(jobId), shots);
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

// Compat alias for older call sites in stages.ts that used putJSON for the
// shot list. Routes through writeShotList so the unique-URL pattern applies.
export async function putJSON(_key: string, _data: unknown): Promise<string> {
  throw new Error(
    "putJSON is deprecated. Use writeShotList(jobId, shots) for mutable JSON, or putImmutable via persistArtifact for binary artifacts.",
  );
}
