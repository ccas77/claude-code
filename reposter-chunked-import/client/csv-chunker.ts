/**
 * Splits raw CSV text into complete records without parsing fields, so the
 * server's existing parser (delimiter auto-detection, mapping, aliases)
 * keeps doing the real work — just on bounded slices.
 *
 * Quote-aware: Meta exports routinely contain post messages with embedded
 * newlines inside quoted fields, so a naive split("\n") would corrupt rows.
 */

export interface CsvChunks {
  header: string;
  /** Data records, quotes respected, no trailing newline. */
  records: string[];
}

export function splitCsvRecords(text: string): CsvChunks {
  // Strip UTF-8 BOM that Meta exports often carry.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records: string[] = [];
  let start = 0;
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i++; // escaped quote inside a quoted field
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (i > start) records.push(text.slice(start, i));
      if (ch === "\r" && text[i + 1] === "\n") i++;
      start = i + 1;
    }
  }
  if (start < text.length) records.push(text.slice(start));

  const [header = "", ...rest] = records;
  return { header, records: rest };
}

/**
 * Groups records into chunk payloads, each prefixed with the header line so
 * every chunk is a self-contained CSV the server can parse independently.
 */
export function buildChunkPayloads(
  chunks: CsvChunks,
  rowsPerChunk: number,
): string[] {
  const payloads: string[] = [];
  for (let i = 0; i < chunks.records.length; i += rowsPerChunk) {
    payloads.push(
      chunks.header + "\n" + chunks.records.slice(i, i + rowsPerChunk).join("\n"),
    );
  }
  return payloads;
}
