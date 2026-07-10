import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { seedDatabase } from "./seed";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "backsight.db");

let db: Database.Database | null = null;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('title_co','builder','homeowner','attorney','government')),
  contact_email TEXT NOT NULL,
  phone TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_number TEXT NOT NULL UNIQUE,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  type TEXT NOT NULL CHECK (type IN ('boundary','alta','topo','construction_staking','subdivision_plat','elevation_cert')),
  stage TEXT NOT NULL CHECK (stage IN ('request','quoted','scheduled','fieldwork','drafting','review','delivered','invoiced')),
  quote_amount REAL,
  address TEXT NOT NULL,
  county TEXT NOT NULL,
  state TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  plss_trs TEXT,
  plss_meridian TEXT,
  crew TEXT,
  due_date TEXT,
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  notes TEXT,
  share_token TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  filename TEXT NOT NULL,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  job_id INTEGER REFERENCES jobs(id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_stage ON jobs(stage);
CREATE INDEX IF NOT EXISTS idx_jobs_share_token ON jobs(share_token);
CREATE INDEX IF NOT EXISTS idx_job_events_job ON job_events(job_id);
CREATE INDEX IF NOT EXISTS idx_attachments_job ON attachments(job_id);
`;

/**
 * Open (and lazily create + seed) the SQLite database.
 * On first run — no data/backsight.db, or an empty jobs table — the demo
 * seed is applied automatically so `npm run dev` works out of the box.
 */
export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);

  const row = db
    .prepare("SELECT COUNT(*) AS n FROM jobs")
    .get() as { n: number };
  if (row.n === 0) {
    seedDatabase(db);
  }
  return db;
}
