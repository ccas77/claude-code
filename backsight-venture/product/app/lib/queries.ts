/** Read-side data access. All functions are synchronous (better-sqlite3). */
import { getDb } from "./db";
import { distanceKm, sectionCenter } from "./geo";
import { formatPLSS, parsePLSS, type PLSSRef } from "./plss";
import {
  STAGES,
  type AttachmentRow,
  type ClientRow,
  type JobEventRow,
  type JobWithClient,
  type OutboxRow,
  type Stage,
} from "./types";

const JOB_SELECT = `
  SELECT j.*, c.name AS client_name, c.kind AS client_kind, c.contact_email AS client_email
  FROM jobs j JOIN clients c ON c.id = j.client_id
`;

export function getJobs(): JobWithClient[] {
  return getDb().prepare(`${JOB_SELECT} ORDER BY j.created_at DESC`).all() as JobWithClient[];
}

export function getJob(id: number): JobWithClient | null {
  return (getDb()
    .prepare(`${JOB_SELECT} WHERE j.id = ?`)
    .get(id) ?? null) as JobWithClient | null;
}

export function getJobByToken(token: string): JobWithClient | null {
  return (getDb()
    .prepare(`${JOB_SELECT} WHERE j.share_token = ?`)
    .get(token) ?? null) as JobWithClient | null;
}

export function getJobEvents(jobId: number): JobEventRow[] {
  return getDb()
    .prepare("SELECT * FROM job_events WHERE job_id = ? ORDER BY at ASC, id ASC")
    .all(jobId) as JobEventRow[];
}

export function getAttachments(jobId: number): AttachmentRow[] {
  return getDb()
    .prepare("SELECT * FROM attachments WHERE job_id = ? ORDER BY id ASC")
    .all(jobId) as AttachmentRow[];
}

export function getClients(): ClientRow[] {
  return getDb().prepare("SELECT * FROM clients ORDER BY name").all() as ClientRow[];
}

export function getOutbox(): Array<OutboxRow & { job_number: string | null }> {
  return getDb()
    .prepare(
      `SELECT o.*, j.job_number FROM outbox o LEFT JOIN jobs j ON j.id = o.job_id
       ORDER BY o.at DESC, o.id DESC`,
    )
    .all() as Array<OutboxRow & { job_number: string | null }>;
}

// --- time helpers -------------------------------------------------------------

const DAY = 86400000;

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isOverdue(job: { due_date: string | null; stage: Stage }): boolean {
  return (
    job.due_date !== null &&
    job.due_date < todayISO() &&
    job.stage !== "delivered" &&
    job.stage !== "invoiced"
  );
}

export function daysInCurrentStage(jobId: number): number {
  const last = getDb()
    .prepare("SELECT at FROM job_events WHERE job_id = ? ORDER BY at DESC, id DESC LIMIT 1")
    .get(jobId) as { at: string } | undefined;
  if (!last) return 0;
  return Math.floor((Date.now() - new Date(last.at).getTime()) / DAY);
}

// --- dashboard ------------------------------------------------------------------

export interface DashboardData {
  activeCount: number;
  overdueCount: number;
  avgDaysInStage: number;
  unbilledTotal: number;
  pipelineCounts: Array<{ stage: Stage; count: number }>;
  needsAttention: Array<{
    job: JobWithClient;
    reason: "overdue" | "stuck_review";
    detail: string;
  }>;
  activity: Array<JobEventRow & { job_number: string; job_id: number }>;
}

export function getDashboardData(): DashboardData {
  const db = getDb();
  const jobs = getJobs();
  const active = jobs.filter((j) => j.stage !== "invoiced");
  const overdue = active.filter(isOverdue);

  // Average days each active (pre-delivery) job has sat in its current stage.
  const inFlight = active.filter((j) => j.stage !== "delivered");
  const stageDays = inFlight.map((j) => daysInCurrentStage(j.id));
  const avgDaysInStage =
    stageDays.length > 0
      ? Math.round((stageDays.reduce((a, b) => a + b, 0) / stageDays.length) * 10) / 10
      : 0;

  const unbilledTotal = jobs
    .filter((j) => j.stage === "delivered")
    .reduce((sum, j) => sum + (j.quote_amount ?? 0), 0);

  const pipelineCounts = STAGES.map((stage) => ({
    stage,
    count: active.filter((j) => j.stage === stage).length,
  }));

  const needsAttention: DashboardData["needsAttention"] = [];
  for (const j of overdue) {
    const days = Math.ceil((Date.now() - new Date(`${j.due_date}T00:00:00Z`).getTime()) / DAY);
    needsAttention.push({
      job: j,
      reason: "overdue",
      detail: `Due ${j.due_date} — ${days} day${days === 1 ? "" : "s"} past due`,
    });
  }
  for (const j of active.filter((x) => x.stage === "review")) {
    const days = daysInCurrentStage(j.id);
    if (days > 10) {
      needsAttention.push({
        job: j,
        reason: "stuck_review",
        detail: `In review for ${days} days — needs the PLS's signature`,
      });
    }
  }

  const activity = db
    .prepare(
      `SELECT e.*, j.job_number FROM job_events e JOIN jobs j ON j.id = e.job_id
       ORDER BY e.at DESC, e.id DESC LIMIT 15`,
    )
    .all() as DashboardData["activity"];

  return {
    activeCount: active.length,
    overdueCount: overdue.length,
    avgDaysInStage,
    unbilledTotal,
    pipelineCounts,
    needsAttention,
    activity,
  };
}

// --- prior work ------------------------------------------------------------------

export interface PriorWorkHit {
  job: JobWithClient;
  sameSection: boolean;
  distanceKm: number | null;
  deliverables: string[];
}

const HISTORY_STAGES: Stage[] = ["delivered", "invoiced"];

function deliverablesFor(jobId: number): string[] {
  return getAttachments(jobId).map((a) => a.label);
}

/**
 * Prior work relative to a point and optional PLSS section:
 * completed jobs in the same section first, then anything within `radiusKm`,
 * ordered by distance. `excludeJobId` drops the job being viewed.
 */
export function findPriorWork(opts: {
  lat?: number | null;
  lng?: number | null;
  plss?: PLSSRef | null;
  excludeJobId?: number;
  radiusKm?: number;
}): PriorWorkHit[] {
  const radius = opts.radiusKm ?? 2;
  const wantSection = opts.plss ? formatPLSS(opts.plss) : null;

  // If we only have a section (no point), anchor distance at its center.
  let lat = opts.lat ?? null;
  let lng = opts.lng ?? null;
  if ((lat === null || lng === null) && opts.plss) {
    const c = sectionCenter(opts.plss.township, opts.plss.range, opts.plss.section);
    lat = c.lat;
    lng = c.lng;
  }

  const hits: PriorWorkHit[] = [];
  for (const j of getJobs()) {
    if (opts.excludeJobId !== undefined && j.id === opts.excludeJobId) continue;
    if (!HISTORY_STAGES.includes(j.stage)) continue;

    const jobRef = j.plss_trs ? parsePLSS(j.plss_trs, j.state) : null;
    const sameSection =
      wantSection !== null && jobRef !== null && formatPLSS(jobRef) === wantSection;
    const dist =
      lat !== null && lng !== null ? distanceKm(lat, lng, j.lat, j.lng) : null;

    if (sameSection || (dist !== null && dist <= radius)) {
      hits.push({
        job: j,
        sameSection,
        distanceKm: dist === null ? null : Math.round(dist * 100) / 100,
        deliverables: deliverablesFor(j.id),
      });
    }
  }

  hits.sort((a, b) => {
    if (a.sameSection !== b.sameSection) return a.sameSection ? -1 : 1;
    return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
  });
  return hits;
}

/** Prior-work panel for a job detail page. */
export function priorWorkForJob(jobId: number): PriorWorkHit[] {
  const job = getJob(jobId);
  if (!job) return [];
  return findPriorWork({
    lat: job.lat,
    lng: job.lng,
    plss: job.plss_trs ? parsePLSS(job.plss_trs, job.state) : null,
    excludeJobId: jobId,
  });
}

/** Set of active-job ids that have prior work in the same section (board badge). */
export function activeJobsWithPriorWork(): Set<number> {
  const jobs = getJobs();
  const historyBySection = new Map<string, number>();
  for (const j of jobs) {
    if (!HISTORY_STAGES.includes(j.stage) || !j.plss_trs) continue;
    const ref = parsePLSS(j.plss_trs, j.state);
    if (!ref) continue;
    const key = formatPLSS(ref);
    historyBySection.set(key, (historyBySection.get(key) ?? 0) + 1);
  }
  const result = new Set<number>();
  for (const j of jobs) {
    if (HISTORY_STAGES.includes(j.stage) || !j.plss_trs) continue;
    const ref = parsePLSS(j.plss_trs, j.state);
    if (ref && historyBySection.has(formatPLSS(ref))) result.add(j.id);
  }
  return result;
}

// --- radar search ------------------------------------------------------------------

export type RadarQuery =
  | { kind: "plss"; ref: PLSSRef; label: string }
  | { kind: "coords"; lat: number; lng: number; label: string }
  | { kind: "address"; lat: number; lng: number; matched: string; plss: PLSSRef | null; label: string }
  | { kind: "error"; message: string };

/**
 * Interpret a radar search string, strictly:
 *  1. "lat,lng" decimal pair;
 *  2. a PLSS T-R-S string (lib/plss, live);
 *  3. a substring match against seeded job addresses (mock geocoder);
 *  otherwise a loud error — never a guess.
 */
export function interpretRadarQuery(q: string): RadarQuery {
  const text = q.trim();
  if (!text) return { kind: "error", message: "Enter an address, coordinates, or a Township-Range-Section reference." };

  const coordMatch = text.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { kind: "coords", lat, lng, label: `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
    }
    return { kind: "error", message: `"${text}" is not a valid latitude, longitude pair.` };
  }

  const ref = parsePLSS(text, "CO");
  if (ref) {
    return {
      kind: "plss",
      ref,
      label: `${formatPLSS(ref)}${ref.meridian ? `, ${ref.meridian}` : ""}`,
    };
  }

  // Mock geocoder: substring match against seeded addresses (see lib/geocode.ts).
  const needle = text.toLowerCase();
  const match = getJobs().find((j) => j.address.toLowerCase().includes(needle));
  if (match) {
    return {
      kind: "address",
      lat: match.lat,
      lng: match.lng,
      matched: match.address,
      plss: match.plss_trs ? parsePLSS(match.plss_trs, match.state) : null,
      label: match.address,
    };
  }

  return {
    kind: "error",
    message: `Couldn't interpret "${text}". Try a seeded address (e.g. "Bingham Hill"), coordinates ("40.6, -105.1"), or a section reference ("T7N R69W S14").`,
  };
}

export function radarSearch(q: string): {
  query: RadarQuery;
  hits: PriorWorkHit[];
  center: { lat: number; lng: number } | null;
} {
  const query = interpretRadarQuery(q);
  if (query.kind === "error") return { query, hits: [], center: null };

  if (query.kind === "plss") {
    const c = sectionCenter(query.ref.township, query.ref.range, query.ref.section);
    return { query, hits: findPriorWork({ plss: query.ref, radiusKm: 2 }), center: c };
  }
  const center = { lat: query.lat, lng: query.lng };
  return {
    query,
    hits: findPriorWork({
      lat: query.lat,
      lng: query.lng,
      plss: query.kind === "address" ? query.plss : null,
      radiusKm: 2,
    }),
    center,
  };
}
