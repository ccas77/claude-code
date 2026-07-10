"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getDb } from "./db";
import {
  DEMO_USERS,
  FIRM,
  STAGES,
  STAGE_LABELS,
  type JobWithClient,
  type Stage,
} from "./types";

const USER_COOKIE = "backsight_user";

/** Current demo user from the cookie (mocked auth — see /app/settings). */
export async function getCurrentUser() {
  const id = cookies().get(USER_COOKIE)?.value;
  return DEMO_USERS.find((u) => u.id === id) ?? DEMO_USERS[0];
}

export async function setCurrentUser(formData: FormData) {
  const id = String(formData.get("user") ?? "");
  if (DEMO_USERS.some((u) => u.id === id)) {
    cookies().set(USER_COOKIE, id, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  revalidatePath("/app", "layout");
}

/** Stage transitions that trigger a client notification (outbox row). */
const NOTIFY_STAGES: Stage[] = ["scheduled", "delivered"];

/**
 * The single stage-transition engine: validate -> update jobs.stage ->
 * insert job_events -> insert outbox row on key transitions.
 * Moves are restricted to one step forward or one step back.
 */
export async function transitionJob(formData: FormData) {
  const jobId = Number(formData.get("jobId"));
  const toStage = String(formData.get("toStage")) as Stage;
  if (!Number.isInteger(jobId) || !STAGES.includes(toStage)) {
    throw new Error("Invalid transition request");
  }

  const db = getDb();
  const job = db
    .prepare(
      `SELECT j.*, c.name AS client_name, c.kind AS client_kind, c.contact_email AS client_email
       FROM jobs j JOIN clients c ON c.id = j.client_id WHERE j.id = ?`,
    )
    .get(jobId) as JobWithClient | undefined;
  if (!job) throw new Error(`Job ${jobId} not found`);

  const fromIdx = STAGES.indexOf(job.stage);
  const toIdx = STAGES.indexOf(toStage);
  if (Math.abs(toIdx - fromIdx) !== 1) {
    throw new Error(
      `Illegal transition ${job.stage} -> ${toStage}: only adjacent stage moves are allowed`,
    );
  }

  const actor = (await getCurrentUser()).name;
  const now = new Date().toISOString();

  const run = db.transaction(() => {
    db.prepare(
      "UPDATE jobs SET stage = ?, delivered_at = CASE WHEN ? = 'delivered' THEN ? ELSE delivered_at END WHERE id = ?",
    ).run(toStage, toStage, now, jobId);

    db.prepare(
      "INSERT INTO job_events (job_id, at, actor, from_stage, to_stage, note) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      jobId,
      now,
      actor,
      job.stage,
      toStage,
      toIdx < fromIdx ? "Moved back for rework" : null,
    );

    if (NOTIFY_STAGES.includes(toStage) && toIdx > fromIdx) {
      const subject =
        toStage === "scheduled"
          ? `[${FIRM.name}] Job ${job.job_number} — fieldwork scheduled`
          : `[${FIRM.name}] Job ${job.job_number} — deliverables ready`;
      const body =
        `Hi ${job.client_name},\n\n` +
        (toStage === "scheduled"
          ? `Your survey at ${job.address} has been scheduled.`
          : `Deliverables for ${job.address} are complete.`) +
        ` Current status: ${STAGE_LABELS[toStage]}.\n\n` +
        `Track progress anytime: /status/${job.share_token}\n\n— ${FIRM.name}`;
      db.prepare(
        "INSERT INTO outbox (at, to_email, subject, body, job_id) VALUES (?, ?, ?, ?, ?)",
      ).run(now, job.client_email, subject, body, jobId);
    }
  });
  run();

  revalidatePath("/app", "layout");
  revalidatePath(`/status/${job.share_token}`);
}
