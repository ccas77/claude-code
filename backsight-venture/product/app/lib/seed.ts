/**
 * Idempotent demo seed for Whitfield Land Surveying, PLS (Fort Collins, CO).
 *
 * Deterministic PRNG (fixed seed) + dates anchored to "now", so:
 *  - `npm run seed` always resets to the same firm history, and
 *  - time-relative demo hooks (overdue jobs, stuck-in-review) always fire.
 *
 * Demo hooks baked in (see MVP_BUILD_SPEC.md):
 *  (a) request-stage job 2026-0142 shares section T7N R69W S14 with 3 historical jobs
 *  (b) two active jobs are overdue
 *  (c) one job has been sitting in `review` for ~15 days
 *  (d) several jobs are `delivered` but not yet `invoiced` (unbilled $)
 */
import type { Database } from "better-sqlite3";
import { sectionCenter } from "./geo";
import { STAGES, type JobType, type Stage } from "./types";

// --- deterministic PRNG ------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20260142);
const rand = (min: number, max: number) => min + rng() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

/** FNV-1a based share token — stable across reseeds for a given job number. */
function shareToken(jobNumber: string): string {
  let h = 0x811c9dc5;
  const s = `backsight:${jobNumber}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `st-${(h >>> 0).toString(16).padStart(8, "0")}${jobNumber.replace("-", "")}`;
}

// --- date helpers -------------------------------------------------------------

const DAY = 86400000;
const now = new Date();
const iso = (d: Date) => d.toISOString();
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);
const daysFromNow = (n: number) => new Date(now.getTime() + n * DAY);

// --- fixture pools -------------------------------------------------------------

const CLIENTS: Array<{
  name: string;
  kind: string;
  contact_email: string;
  phone: string;
}> = [
  { name: "Front Range Title Co.", kind: "title_co", contact_email: "orders@frontrangetitle.example.com", phone: "(970) 555-0110" },
  { name: "Poudre Valley Title & Escrow", kind: "title_co", contact_email: "closings@pvtitle.example.com", phone: "(970) 555-0123" },
  { name: "Cache la Poudre Homes", kind: "builder", contact_email: "projects@clphomes.example.com", phone: "(970) 555-0137" },
  { name: "Horsetooth Builders LLC", kind: "builder", contact_email: "office@horsetoothbuilders.example.com", phone: "(970) 555-0148" },
  { name: "Timberline Construction Group", kind: "builder", contact_email: "pm@timberlinecg.example.com", phone: "(970) 555-0152" },
  { name: "City of Fort Collins — Engineering", kind: "government", contact_email: "engineering@fcgov.example.com", phone: "(970) 555-0160" },
  { name: "Elena Marsh", kind: "homeowner", contact_email: "elena.marsh@example.com", phone: "(970) 555-0171" },
  { name: "Tom & Judy Kowalski", kind: "homeowner", contact_email: "tjkowalski@example.com", phone: "(970) 555-0175" },
  { name: "Priya Raman", kind: "homeowner", contact_email: "priya.raman@example.com", phone: "(970) 555-0179" },
  { name: "Walter Boyd", kind: "homeowner", contact_email: "wboyd@example.com", phone: "(970) 555-0183" },
  { name: "Sofia Gutierrez", kind: "homeowner", contact_email: "sofia.g@example.com", phone: "(970) 555-0187" },
  { name: "Reyes & Stanton LLP", kind: "attorney", contact_email: "paralegal@reyesstanton.example.com", phone: "(970) 555-0191" },
];

const STREETS = [
  "Bingham Hill Rd", "Overlook Ct", "Terry Lake Rd", "N Shields St", "W Vine Dr",
  "S Taft Hill Rd", "County Road 38E", "Rist Canyon Rd", "Owl Canyon Rd",
  "E Harmony Rd", "Ziegler Rd", "S Timberline Rd", "W Mulberry St",
  "W Prospect Rd", "E Drake Rd", "W Horsetooth Rd", "S Lemay Ave",
  "Kechter Rd", "E Trilby Rd", "E Douglas Rd", "Gregory Rd", "W Willox Ln",
  "Laporte Ave", "N County Road 17", "Michaud Ln", "Strauss Cabin Rd",
];

const CITIES = ["Fort Collins", "Fort Collins", "Fort Collins", "Laporte", "Wellington", "Timnath", "Bellvue"];

const TYPES: JobType[] = [
  "boundary", "boundary", "boundary", "alta", "topo",
  "construction_staking", "subdivision_plat", "elevation_cert",
];

const QUOTE_RANGES: Record<JobType, [number, number]> = {
  boundary: [1200, 3600],
  alta: [4500, 9500],
  topo: [2500, 6200],
  construction_staking: [1800, 5200],
  subdivision_plat: [8000, 18500],
  elevation_cert: [450, 850],
};

const ATTACHMENTS_BY_TYPE: Record<JobType, Array<[string, string]>> = {
  boundary: [
    ["boundary_plat_signed.pdf", "Signed & sealed boundary plat"],
    ["linework.dwg", "CAD linework (DWG)"],
    ["field_notes.csv", "Field notes / point export"],
  ],
  alta: [
    ["alta_survey_signed.pdf", "Signed ALTA/NSPS survey"],
    ["table_a_items.pdf", "Table A items summary"],
    ["alta_linework.dwg", "CAD linework (DWG)"],
  ],
  topo: [
    ["topo_map.pdf", "Topographic map (1ft contours)"],
    ["surface_points.csv", "Surface point export"],
  ],
  construction_staking: [
    ["staking_report.pdf", "Staking report"],
    ["cut_sheets.pdf", "Cut sheets"],
  ],
  subdivision_plat: [
    ["final_plat_recorded.pdf", "Recorded final plat"],
    ["closure_report.pdf", "Closure report"],
    ["plat_linework.dwg", "CAD linework (DWG)"],
  ],
  elevation_cert: [["fema_elevation_certificate.pdf", "FEMA Elevation Certificate"]],
};

const CREWS = ["Crew A", "Crew B", "Crew C"];

const NOTE_POOL = [
  "Gate code 4417 — call ahead.",
  "Prior corners reported disturbed by fence contractor.",
  "Client needs closing-week turnaround.",
  "Check county road ROW width before staking.",
  "Irrigation ditch easement along north line.",
  "Rebar & cap found at NE corner on recon.",
  "Neighbor dispute over west fence line — document carefully.",
  "Lender requires Table A items 1-4, 7a, 8, 11.",
  null, null, null,
];

// --- job assembly ---------------------------------------------------------------

interface SeedJob {
  job_number: string;
  client_idx: number; // 0-based into CLIENTS
  type: JobType;
  stage: Stage;
  quote_amount: number | null;
  address: string;
  county: string;
  state: string;
  lat: number;
  lng: number;
  plss_trs: string | null;
  plss_meridian: string | null;
  crew: string | null;
  due_date: string | null;
  created_at: Date;
  delivered_at: Date | null;
  notes: string | null;
  share_token: string;
  events: Array<{ at: Date; actor: string; from: Stage | null; to: Stage; note: string | null }>;
  attachments: Array<[string, string]>;
}

function actorFor(stage: Stage): string {
  return ["fieldwork", "drafting", "review", "delivered"].includes(stage)
    ? "Dana Whitfield, PLS"
    : "Marcus Lee";
}

const STAGE_GAP_DAYS: Record<Stage, [number, number]> = {
  request: [0, 0],
  quoted: [1, 5],
  scheduled: [2, 8],
  fieldwork: [4, 14],
  drafting: [1, 6],
  review: [2, 6],
  delivered: [1, 4],
  invoiced: [4, 18],
};

/** Build the event chain from `request` up to the job's current stage. */
function buildEvents(job: Pick<SeedJob, "stage">, createdAt: Date, opts?: { reviewEnteredDaysAgo?: number }) {
  const targetIdx = STAGES.indexOf(job.stage);
  const events: SeedJob["events"] = [
    { at: createdAt, actor: "Marcus Lee", from: null, to: "request", note: "Request received" },
  ];
  let t = createdAt.getTime();
  for (let i = 1; i <= targetIdx; i++) {
    const stage = STAGES[i];
    const [lo, hi] = STAGE_GAP_DAYS[stage];
    t += randInt(lo, hi) * DAY + randInt(0, 20) * 3600000;
    events.push({ at: new Date(t), actor: actorFor(stage), from: STAGES[i - 1], to: stage, note: null });
  }
  // Demo hook (c): pin the review entry date so "stuck in review" reads true.
  if (opts?.reviewEnteredDaysAgo !== undefined) {
    const reviewEvt = events.find((e) => e.to === "review");
    if (reviewEvt) reviewEvt.at = daysAgo(opts.reviewEnteredDaysAgo);
  }
  return events;
}

function randomAddress(): { address: string; city: string } {
  const city = pick(CITIES);
  return { address: `${randInt(100, 8999)} ${pick(STREETS)}, ${city}, CO`, city };
}

function jitter(center: { lat: number; lng: number }) {
  return {
    lat: center.lat + rand(-0.005, 0.005),
    lng: center.lng + rand(-0.007, 0.007),
  };
}

function makeJob(partial: {
  job_number: string;
  client_idx: number;
  type: JobType;
  stage: Stage;
  created_at: Date;
  address?: string;
  trs?: { t: number; r: number; s: number } | null; // null = force address-only
  due_date?: string | null;
  notes?: string | null;
  crew?: string | null;
  share_token?: string;
  reviewEnteredDaysAgo?: number;
}): SeedJob {
  const usePlss = partial.trs !== null && (partial.trs !== undefined || rng() < 0.7);
  const trs =
    partial.trs ??
    (usePlss
      ? { t: randInt(6, 9), r: randInt(68, 70), s: randInt(1, 36) }
      : undefined);
  const center = trs
    ? sectionCenter(trs.t, trs.r, trs.s)
    : { lat: rand(40.36, 40.74), lng: rand(-105.29, -104.91) };
  const { lat, lng } = jitter(center);
  const [qLo, qHi] = QUOTE_RANGES[partial.type];
  const stageIdx = STAGES.indexOf(partial.stage);
  const quote = stageIdx >= 1 ? Math.round(rand(qLo, qHi) / 25) * 25 : null;
  const events = buildEvents(partial, partial.created_at, {
    reviewEnteredDaysAgo: partial.reviewEnteredDaysAgo,
  });
  const deliveredEvt = events.find((e) => e.to === "delivered");
  const attachments =
    stageIdx >= STAGES.indexOf("delivered")
      ? ATTACHMENTS_BY_TYPE[partial.type].slice(0, randInt(1, ATTACHMENTS_BY_TYPE[partial.type].length))
      : [];

  return {
    job_number: partial.job_number,
    client_idx: partial.client_idx,
    type: partial.type,
    stage: partial.stage,
    quote_amount: quote,
    address: partial.address ?? randomAddress().address,
    county: "Larimer",
    state: "CO",
    lat,
    lng,
    plss_trs: trs ? `T${trs.t}N R${trs.r}W S${trs.s}` : null,
    plss_meridian: trs ? "6th PM" : null,
    crew:
      partial.crew !== undefined
        ? partial.crew
        : stageIdx >= STAGES.indexOf("scheduled")
          ? pick(CREWS)
          : null,
    due_date:
      partial.due_date !== undefined
        ? partial.due_date
        : stageIdx >= 1 && stageIdx < STAGES.indexOf("delivered")
          ? isoDate(daysFromNow(randInt(5, 40)))
          : deliveredEvt
            ? isoDate(new Date(deliveredEvt.at.getTime() + randInt(0, 5) * DAY))
            : null,
    created_at: partial.created_at,
    delivered_at: deliveredEvt ? deliveredEvt.at : null,
    notes: partial.notes !== undefined ? partial.notes : pick(NOTE_POOL),
    share_token: partial.share_token ?? shareToken(partial.job_number),
    events,
    attachments,
  };
}

function buildJobs(): SeedJob[] {
  const jobs: SeedJob[] = [];

  // ---- ~60 historical jobs, 2019–2025, all invoiced -------------------------
  const perYear: Record<number, number> = { 2019: 7, 2020: 8, 2021: 9, 2022: 9, 2023: 10, 2024: 9, 2025: 8 };
  // Demo hook (a): three historical jobs in T7N R69W S14 (same section as 2026-0142).
  const hookSections: Record<string, { t: number; r: number; s: number }> = {
    "2019": { t: 7, r: 69, s: 14 },
    "2021": { t: 7, r: 69, s: 14 },
    "2024": { t: 7, r: 69, s: 14 },
  };
  // Radar "try these" hook: a couple of prior jobs on Terry Lake Rd (T8N R69W S26/27).
  const terryLake: Array<{ year: number; addr: string; trs: { t: number; r: number; s: number } }> = [
    { year: 2020, addr: "4515 Terry Lake Rd, Fort Collins, CO", trs: { t: 8, r: 69, s: 26 } },
    { year: 2023, addr: "4732 Terry Lake Rd, Fort Collins, CO", trs: { t: 8, r: 69, s: 26 } },
  ];

  for (const [yearStr, count] of Object.entries(perYear)) {
    const year = Number(yearStr);
    let seq = randInt(3, 15);
    for (let i = 0; i < count; i++) {
      seq += randInt(2, 9);
      const jobNumber = `${year}-${String(seq).padStart(4, "0")}`;
      const created = new Date(Date.UTC(year, randInt(0, 10), randInt(1, 28), randInt(14, 22)));
      const hookTrs = i === 0 ? hookSections[yearStr] : undefined;
      const tl = terryLake.find((x) => x.year === year && i === 1);
      const hookAddresses: Record<string, string> = {
        "2019": "1823 Bingham Hill Rd, Laporte, CO",
        "2021": "1902 Bingham Hill Rd, Laporte, CO",
        "2024": "1877 Bingham Hill Rd, Laporte, CO",
      };
      jobs.push(
        makeJob({
          job_number: jobNumber,
          client_idx: randInt(0, CLIENTS.length - 1),
          type: hookTrs ? pick(["boundary", "alta", "topo"] as JobType[]) : pick(TYPES),
          stage: "invoiced",
          created_at: created,
          trs: hookTrs ?? tl?.trs,
          address: hookTrs ? hookAddresses[yearStr] : tl?.addr,
        }),
      );
    }
  }

  // ---- 25 active jobs, 2026 --------------------------------------------------
  // Explicitly authored so demo hooks are stable and the board reads well.
  type ActiveDef = {
    n: string; c: number; t: JobType; st: Stage; createdDaysAgo: number;
    addr?: string; trs?: { t: number; r: number; s: number } | null;
    due?: string | null; notes?: string | null; token?: string; reviewDaysAgo?: number;
  };
  const A: ActiveDef[] = [
    // --- request (4) — incl. demo hook (a): 2026-0142 in T7N R69W S14
    { n: "2026-0142", c: 0, t: "boundary", st: "request", createdDaysAgo: 2,
      addr: "1847 Bingham Hill Rd, Laporte, CO", trs: { t: 7, r: 69, s: 14 },
      notes: "Title order #FR-88213 — closing scheduled in 3 weeks. We have surveyed this section three times before.", due: null },
    { n: "2026-0143", c: 8, t: "elevation_cert", st: "request", createdDaysAgo: 1,
      addr: "3318 W Vine Dr, Fort Collins, CO", due: null },
    { n: "2026-0144", c: 11, t: "boundary", st: "request", createdDaysAgo: 1,
      addr: "7205 Owl Canyon Rd, Wellington, CO", trs: { t: 9, r: 68, s: 7 },
      notes: "Easement dispute — attorney needs exhibit for filing.", due: null },
    { n: "2026-0145", c: 4, t: "topo", st: "request", createdDaysAgo: 3,
      addr: "6420 Kechter Rd, Timnath, CO", trs: { t: 6, r: 68, s: 4 }, due: null },
    // --- quoted (4)
    { n: "2026-0138", c: 2, t: "construction_staking", st: "quoted", createdDaysAgo: 9,
      addr: "5580 Ziegler Rd, Fort Collins, CO", trs: { t: 6, r: 68, s: 9 } },
    { n: "2026-0139", c: 7, t: "boundary", st: "quoted", createdDaysAgo: 8,
      addr: "912 E Douglas Rd, Fort Collins, CO", trs: { t: 8, r: 68, s: 30 } },
    { n: "2026-0140", c: 1, t: "alta", st: "quoted", createdDaysAgo: 6,
      addr: "2731 S College Ave, Fort Collins, CO", trs: { t: 7, r: 69, s: 25 } },
    { n: "2026-0141", c: 9, t: "boundary", st: "quoted", createdDaysAgo: 5,
      addr: "4103 N County Road 17, Fort Collins, CO", trs: null },
    // --- scheduled (3)
    { n: "2026-0134", c: 3, t: "construction_staking", st: "scheduled", createdDaysAgo: 14,
      addr: "8815 Strauss Cabin Rd, Fort Collins, CO", trs: { t: 6, r: 68, s: 16 },
      due: isoDate(daysFromNow(9)) },
    { n: "2026-0135", c: 6, t: "boundary", st: "scheduled", createdDaysAgo: 12,
      addr: "2214 Overlook Ct, Fort Collins, CO", trs: { t: 7, r: 69, s: 15 },
      due: isoDate(daysFromNow(12)) },
    { n: "2026-0136", c: 5, t: "topo", st: "scheduled", createdDaysAgo: 13,
      addr: "W Willox Ln & N Shields St, Fort Collins, CO", trs: { t: 8, r: 69, s: 35 },
      due: isoDate(daysFromNow(16)) },
    // --- fieldwork (4) — incl. demo hook (b): 2026-0126 overdue
    { n: "2026-0126", c: 2, t: "subdivision_plat", st: "fieldwork", createdDaysAgo: 41,
      addr: "Poudre Bluffs Filing 2, Laporte, CO", trs: { t: 8, r: 69, s: 33 },
      due: isoDate(daysAgo(6)), notes: "OVERDUE — waiting on ditch company response for easement line." },
    { n: "2026-0129", c: 5, t: "topo", st: "fieldwork", createdDaysAgo: 25,
      addr: "1420 E Trilby Rd, Fort Collins, CO", trs: { t: 6, r: 68, s: 18 },
      due: isoDate(daysFromNow(7)) },
    { n: "2026-0131", c: 10, t: "boundary", st: "fieldwork", createdDaysAgo: 20,
      addr: "3661 Rist Canyon Rd, Bellvue, CO", trs: { t: 8, r: 70, s: 22 },
      due: isoDate(daysFromNow(10)) },
    { n: "2026-0133", c: 0, t: "alta", st: "fieldwork", createdDaysAgo: 16,
      addr: "1112 W Mulberry St, Fort Collins, CO", trs: { t: 7, r: 69, s: 11 },
      due: isoDate(daysFromNow(14)) },
    // --- drafting (4) — incl. demo hook (b): 2026-0122 overdue; demo-status token
    { n: "2026-0122", c: 4, t: "boundary", st: "drafting", createdDaysAgo: 47,
      addr: "7710 E Harmony Rd, Timnath, CO", trs: { t: 6, r: 68, s: 2 },
      due: isoDate(daysAgo(3)), notes: "OVERDUE — client called twice this week." },
    { n: "2026-0127", c: 1, t: "boundary", st: "drafting", createdDaysAgo: 31,
      addr: "819 Laporte Ave, Fort Collins, CO", trs: { t: 7, r: 69, s: 12 },
      due: isoDate(daysFromNow(4)), token: "demo-status",
      notes: "Title order #PV-4471. Title company checks status via share link." },
    { n: "2026-0130", c: 3, t: "construction_staking", st: "drafting", createdDaysAgo: 22,
      addr: "6120 S Timberline Rd, Fort Collins, CO", trs: { t: 6, r: 69, s: 1 },
      due: isoDate(daysFromNow(6)) },
    { n: "2026-0132", c: 8, t: "boundary", st: "drafting", createdDaysAgo: 19,
      addr: "521 Gregory Rd, Fort Collins, CO", trs: null, due: isoDate(daysFromNow(8)) },
    // --- review (2) — incl. demo hook (c): 2026-0118 stuck 15 days
    { n: "2026-0118", c: 5, t: "subdivision_plat", st: "review", createdDaysAgo: 62,
      addr: "Timberline North Filing 1, Fort Collins, CO", trs: { t: 8, r: 68, s: 19 },
      due: isoDate(daysFromNow(3)), reviewDaysAgo: 15,
      notes: "Plat sitting in review — Dana to check closure and sign." },
    { n: "2026-0124", c: 6, t: "boundary", st: "review", createdDaysAgo: 33,
      addr: "300 Michaud Ln, Fort Collins, CO", trs: { t: 8, r: 69, s: 27 },
      due: isoDate(daysFromNow(5)), reviewDaysAgo: 2 },
    // --- delivered, not invoiced (4) — demo hook (d): unbilled
    { n: "2026-0111", c: 0, t: "boundary", st: "delivered", createdDaysAgo: 68,
      addr: "2140 W Prospect Rd, Fort Collins, CO", trs: { t: 7, r: 69, s: 22 } },
    { n: "2026-0114", c: 2, t: "construction_staking", st: "delivered", createdDaysAgo: 55,
      addr: "5901 E Drake Rd, Fort Collins, CO", trs: { t: 7, r: 68, s: 31 } },
    { n: "2026-0116", c: 7, t: "elevation_cert", st: "delivered", createdDaysAgo: 44,
      addr: "1029 W Horsetooth Rd, Fort Collins, CO", trs: null },
    { n: "2026-0120", c: 11, t: "alta", st: "delivered", createdDaysAgo: 39,
      addr: "425 S Lemay Ave, Fort Collins, CO", trs: { t: 7, r: 69, s: 13 } },
  ];

  for (const d of A) {
    jobs.push(
      makeJob({
        job_number: d.n,
        client_idx: d.c,
        type: d.t,
        stage: d.st,
        created_at: daysAgo(d.createdDaysAgo),
        address: d.addr,
        trs: d.trs,
        due_date: d.due,
        notes: d.notes,
        share_token: d.token,
        reviewEnteredDaysAgo: d.reviewDaysAgo,
      }),
    );
  }

  return jobs;
}

// --- main entry ------------------------------------------------------------------

export function seedDatabase(db: Database): {
  clients: number;
  jobs: number;
  events: number;
  attachments: number;
  outbox: number;
} {
  const jobs = buildJobs();

  const insertClient = db.prepare(
    "INSERT INTO clients (name, kind, contact_email, phone) VALUES (?, ?, ?, ?)",
  );
  const insertJob = db.prepare(`
    INSERT INTO jobs (job_number, client_id, type, stage, quote_amount, address, county, state,
      lat, lng, plss_trs, plss_meridian, crew, due_date, created_at, delivered_at, notes, share_token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEvent = db.prepare(
    "INSERT INTO job_events (job_id, at, actor, from_stage, to_stage, note) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertAttachment = db.prepare(
    "INSERT INTO attachments (job_id, filename, label) VALUES (?, ?, ?)",
  );
  const insertOutbox = db.prepare(
    "INSERT INTO outbox (at, to_email, subject, body, job_id) VALUES (?, ?, ?, ?, ?)",
  );

  let eventCount = 0;
  let attachmentCount = 0;
  let outboxCount = 0;

  const run = db.transaction(() => {
    // Idempotent reset: wipe everything, then reinsert.
    db.exec(
      "DELETE FROM outbox; DELETE FROM attachments; DELETE FROM job_events; DELETE FROM jobs; DELETE FROM clients; DELETE FROM sqlite_sequence;",
    );

    const clientIds: number[] = [];
    for (const c of CLIENTS) {
      const res = insertClient.run(c.name, c.kind, c.contact_email, c.phone);
      clientIds.push(Number(res.lastInsertRowid));
    }

    for (const j of jobs) {
      const res = insertJob.run(
        j.job_number, clientIds[j.client_idx], j.type, j.stage, j.quote_amount,
        j.address, j.county, j.state, j.lat, j.lng, j.plss_trs, j.plss_meridian,
        j.crew, j.due_date, iso(j.created_at),
        j.delivered_at ? iso(j.delivered_at) : null, j.notes, j.share_token,
      );
      const jobId = Number(res.lastInsertRowid);

      for (const e of j.events) {
        insertEvent.run(jobId, iso(e.at), e.actor, e.from, e.to, e.note);
        eventCount++;
      }
      for (const [filename, label] of j.attachments) {
        insertAttachment.run(jobId, filename, label);
        attachmentCount++;
      }

      // Seed the outbox with client notifications for recent key transitions,
      // so /app/outbox is populated before the user advances anything.
      const client = CLIENTS[j.client_idx];
      for (const e of j.events) {
        const recent = now.getTime() - e.at.getTime() < 30 * DAY;
        if (!recent) continue;
        if (e.to === "scheduled") {
          insertOutbox.run(
            iso(e.at), client.contact_email,
            `[Whitfield Land Surveying] Job ${j.job_number} — fieldwork scheduled`,
            `Hi ${client.name},\n\nYour survey at ${j.address} has been scheduled. ` +
              `Track progress anytime: /status/${j.share_token}\n\n— Whitfield Land Surveying, PLS`,
            jobId,
          );
          outboxCount++;
        } else if (e.to === "delivered") {
          insertOutbox.run(
            iso(e.at), client.contact_email,
            `[Whitfield Land Surveying] Job ${j.job_number} — deliverables ready`,
            `Hi ${client.name},\n\nDeliverables for ${j.address} are complete and attached to your job record. ` +
              `Track progress anytime: /status/${j.share_token}\n\n— Whitfield Land Surveying, PLS`,
            jobId,
          );
          outboxCount++;
        }
      }
    }
  });
  run();

  return {
    clients: CLIENTS.length,
    jobs: jobs.length,
    events: eventCount,
    attachments: attachmentCount,
    outbox: outboxCount,
  };
}
