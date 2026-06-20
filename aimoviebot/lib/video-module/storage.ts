import { put, head } from "@vercel/blob";
import type { Artifacts, Backend, Job, JobStatus, StageName } from "./types";

// Deterministic Blob keys. One job, one folder; per stage, one artifact.
// Retries overwrite (addRandomSuffix: false).

const key = (jobId: string, suffix: string) => `jobs/${jobId}/${suffix}`;

export const keys = {
  job: (jobId: string) => key(jobId, "job.json"),
  upload: (jobId: string, name: string) => key(jobId, `uploads/${name}`),
  characterSheet: (jobId: string) => key(jobId, "stage1-character.png"),
  locationSheet: (jobId: string) => key(jobId, "stage2-location.png"),
  shotList: (jobId: string) => key(jobId, "stage3-shotlist.json"),
  storyboard: (jobId: string) => key(jobId, "stage4-storyboard.png"),
  video: (jobId: string) => key(jobId, "stage5-video.mp4"),
};

const putBlob = async (k: string, body: Blob | ArrayBuffer | string, contentType?: string) => {
  const blob = await put(k, body, {
    access: "public",
    addRandomSuffix: false,
    ...(contentType ? { contentType } : {}),
    allowOverwrite: true,
  });
  return blob.url;
};

// putJSON / getJSON — used for job state, concept result, shot list, etc.
export async function putJSON(key: string, data: unknown): Promise<string> {
  return putBlob(key, JSON.stringify(data, null, 2), "application/json");
}

export async function getJSON<T>(key: string): Promise<T | null> {
  try {
    const meta = await head(key);
    const res = await fetch(meta.url);
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
    const buf = Buffer.from(match[2], "base64");
    return putBlob(key, buf, ct);
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

