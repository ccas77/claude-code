"use client";

import { useCallback, useState } from "react";
import { buildChunkPayloads, splitCsvRecords } from "./csv-chunker";

const ROWS_PER_CHUNK = 500;
const MAX_RETRIES = 3;

export interface ImportProgress {
  phase: "idle" | "uploading" | "finishing" | "done" | "failed";
  sentChunks: number;
  totalChunks: number;
  importedRows: number;
  skippedRows: number;
  error: string | null;
}

const idleProgress: ImportProgress = {
  phase: "idle",
  sentChunks: 0,
  totalChunks: 0,
  importedRows: 0,
  skippedRows: 0,
  error: null,
};

async function postJson(url: string, body: unknown): Promise<any> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`non-JSON response (${res.status}): ${text.slice(0, 200)}`);
      }
      if (!res.ok) {
        // 4xx = our bug or bad input; retrying won't help. 5xx/network = retry.
        if (res.status < 500) throw Object.assign(new Error(json.error ?? `HTTP ${res.status}`), { fatal: true });
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      return json;
    } catch (err: any) {
      if (err?.fatal) throw err;
      lastError = err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Drives a chunked Facebook-report import: start → N chunk uploads → finish.
 * Wire into winners-import-form in place of the single-request upload,
 * after the existing column-mapping step has resolved.
 */
export function useChunkedImport() {
  const [progress, setProgress] = useState<ImportProgress>(idleProgress);

  const runImport = useCallback(
    async (csvText: string, destinationId?: string) => {
      const chunks = splitCsvRecords(csvText);
      const payloads = buildChunkPayloads(chunks, ROWS_PER_CHUNK);
      if (payloads.length === 0) {
        setProgress({ ...idleProgress, phase: "failed", error: "no data rows found" });
        return;
      }

      setProgress({
        ...idleProgress,
        phase: "uploading",
        totalChunks: payloads.length,
      });

      try {
        const { importId } = await postJson(
          "/api/winners/import/facebook-report/start",
          {
            totalChunks: payloads.length,
            totalRows: chunks.records.length,
            destinationId,
          },
        );

        for (let i = 0; i < payloads.length; i++) {
          const res = await postJson(
            "/api/winners/import/facebook-report/chunk",
            { importId, chunkIndex: i, csv: payloads[i] },
          );
          setProgress((p) => ({
            ...p,
            sentChunks: i + 1,
            importedRows: res.importedRows,
            skippedRows: res.skippedRows,
          }));
        }

        setProgress((p) => ({ ...p, phase: "finishing" }));
        const done = await postJson(
          "/api/winners/import/facebook-report/finish",
          { importId },
        );
        setProgress((p) => ({
          ...p,
          phase: "done",
          importedRows: done.importedRows,
          skippedRows: done.skippedRows,
        }));
      } catch (err) {
        setProgress((p) => ({
          ...p,
          phase: "failed",
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [],
  );

  return { progress, runImport };
}
