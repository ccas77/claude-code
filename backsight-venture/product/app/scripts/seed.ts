/**
 * `npm run seed` — reset data/backsight.db to the canonical demo dataset.
 * Idempotent: wipes all rows and reinserts the deterministic fixture set,
 * so running it twice yields identical row counts.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA } from "../lib/db";
import { seedDatabase } from "../lib/seed";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "backsight.db");

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(SCHEMA);

const counts = seedDatabase(db);
db.close();

console.log(`Seeded ${DB_PATH}`);
console.log(
  `  clients: ${counts.clients}\n  jobs: ${counts.jobs}\n  job_events: ${counts.events}\n  attachments: ${counts.attachments}\n  outbox: ${counts.outbox}`,
);
console.log("Demo hooks in place:");
console.log("  (a) request 2026-0142 shares T7N R69W S14 with 3 historical jobs");
console.log("  (b) 2026-0126 and 2026-0122 are overdue");
console.log("  (c) 2026-0118 has been in review ~15 days");
console.log("  (d) 4 jobs delivered but not invoiced (unbilled)");
