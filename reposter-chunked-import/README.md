# Chunked Facebook-report import for the reposter app

Fixes the `Vercel Runtime Timeout Error: Task timed out after 300 seconds`
failures on `/api/winners/import/facebook-report` (7 occurrences, 2026-07-05
to 2026-07-06) by splitting a Meta CSV import into many small requests, each
of which does a bounded amount of work. No single request can hit the 300s
platform limit again, regardless of export size.

> Written without direct access to the reposter repo (the session's
> `add_repo` approval flow was broken), against what the deployment history
> documents: Next.js App Router on Node, Upstash Redis over HTTP, papaparse
> with tab/semicolon/comma auto-detection, pipelined writes (~50 rows per
> Upstash HTTP request), and a separate `/api/winners/recompute` scoring
> pass. The two `// ADAPT` markers are the only places that need wiring to
> existing code.

## How it works

```
client (winners-import-form)                    server
──────────────────────────────                  ──────────────────────────────
split CSV into quote-aware records
POST start {totalChunks,totalRows}  ──────────▶ create import session (Redis)
for each 500-record slice:
  POST chunk {importId,i,csv}       ──────────▶ parse slice + pipelined writes
                                                (idempotent per chunkIndex)
POST finish {importId}              ──────────▶ verify all chunks, recompute once
GET  status?importId=...            ──────────▶ progress / resume info
```

- The client never parses fields. `csv-chunker.ts` only finds record
  boundaries (quote-aware, so post messages with embedded newlines survive)
  and re-attaches the header line to every slice. The server's existing
  parser — delimiter auto-detection, semantic column mapping, aliases,
  row-level error tolerance — runs unchanged on each slice.
- Each chunk is ~500 rows ≈ 10 pipelined Upstash requests ≈ a few seconds.
- Chunk uploads are idempotent (`SADD` on the chunk index), so client
  retries after a network blip can't double-import rows.
- Recompute runs exactly once, at `finish`, instead of inline per upload.

## Files

| File | Drops into |
|---|---|
| `server/lib/import-session.ts` | `lib/import-session.ts` |
| `server/app/api/winners/import/facebook-report/start/route.ts` | same path under `app/` |
| `server/app/api/winners/import/facebook-report/chunk/route.ts` | same path under `app/` |
| `server/app/api/winners/import/facebook-report/finish/route.ts` | same path under `app/` |
| `server/app/api/winners/import/facebook-report/status/route.ts` | same path under `app/` |
| `client/csv-chunker.ts` | wherever winners-import-form lives |
| `client/use-chunked-import.ts` | wherever winners-import-form lives |

## Integration steps

1. **Export two existing functions** from the current single-shot import
   route into shared modules (marked `// ADAPT` in `chunk/route.ts`):
   - `parseFacebookReportCsv(text)` — the papaparse wrapper with delimiter
     auto-try and row-level error tolerance.
   - `writeReportRows(rows, destinationId)` — the pipelined Upstash writer
     from the "1 HTTP request per 50 rows" fix. Have it return
     `{ imported, skipped }`.
2. **Export the recompute pass** from `app/api/winners/recompute/route.ts`
   as `recomputeScores()` and reuse it in `finish/route.ts` (marked
   `// ADAPT`).
3. **Fix the `redis` import** in `import-session.ts` to your client module.
4. **Swap winners-import-form** to `useChunkedImport()`: after the existing
   column-mapping step resolves, call `runImport(csvText, destinationId)`
   and render `progress` (a `sentChunks/totalChunks` bar replaces the
   spinner that used to die at 5 minutes).
5. **Keep or retire the old route.** Leaving the original
   `facebook-report/route.ts` in place is harmless during rollout; remove it
   once the chunked path is verified.
6. If the column-mapping flow (`needsMapping`) sends the mapping back with
   the upload, add that field to the `start` body and store it on the
   session — `chunk` can then pass it to the parser.

## Why not a queue/background job?

A queue (QStash, cron pump, etc.) also solves the timeout but adds a new
moving part and still needs progress plumbing. Client-driven chunking keeps
everything inside the Next.js app, works on the current Vercel plan, and
gives the UI real progress for free. If imports ever need to survive the
browser tab closing mid-upload, `status` already exposes `receivedChunks`,
so a resume feature can diff and re-send only the missing chunks.
