// Redis-backed state for a chunked Facebook-report import.
//
// ADAPT: change this import to wherever your Upstash client lives
// (the same one used by app/api/winners/import/facebook-report/route.ts).
import { redis } from "@/lib/redis";

export type ImportStatus = "uploading" | "recomputing" | "done" | "failed";

export interface ImportSession {
  id: string;
  destinationId: string | null;
  totalChunks: number;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  status: ImportStatus;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

const SESSION_TTL_SECONDS = 60 * 60 * 24; // sessions are throwaway; expire after a day

const sessionKey = (id: string) => `import:fb-report:${id}`;
const chunksKey = (id: string) => `import:fb-report:${id}:chunks`;

export async function createImportSession(opts: {
  id: string;
  destinationId: string | null;
  totalChunks: number;
  totalRows: number;
  now: number;
}): Promise<ImportSession> {
  const session: ImportSession = {
    id: opts.id,
    destinationId: opts.destinationId,
    totalChunks: opts.totalChunks,
    totalRows: opts.totalRows,
    importedRows: 0,
    skippedRows: 0,
    status: "uploading",
    error: null,
    createdAt: opts.now,
    updatedAt: opts.now,
  };
  await redis.set(sessionKey(opts.id), JSON.stringify(session), {
    ex: SESSION_TTL_SECONDS,
  });
  return session;
}

export async function getImportSession(
  id: string,
): Promise<ImportSession | null> {
  const raw = await redis.get<string | ImportSession>(sessionKey(id));
  if (!raw) return null;
  return typeof raw === "string" ? (JSON.parse(raw) as ImportSession) : raw;
}

export async function saveImportSession(session: ImportSession): Promise<void> {
  session.updatedAt = Date.now();
  await redis.set(sessionKey(session.id), JSON.stringify(session), {
    ex: SESSION_TTL_SECONDS,
  });
}

/**
 * Mark a chunk as received. Returns false if this chunkIndex was already
 * processed (client retried a chunk that actually landed) so the caller
 * can skip the writes instead of double-importing rows.
 */
export async function claimChunk(
  importId: string,
  chunkIndex: number,
): Promise<boolean> {
  const added = await redis.sadd(chunksKey(importId), chunkIndex);
  if (added === 1) {
    await redis.expire(chunksKey(importId), SESSION_TTL_SECONDS);
    return true;
  }
  return false;
}

export async function receivedChunkCount(importId: string): Promise<number> {
  return (await redis.scard(chunksKey(importId))) ?? 0;
}
