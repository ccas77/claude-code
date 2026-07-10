import { dateTime, shortDate } from "@/lib/format";
import { getJobByToken, getJobEvents } from "@/lib/queries";
import { FIRM, JOB_TYPE_LABELS, STAGE_LABELS, STAGES } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Public, read-only client status page (no auth — the share token is the key).
 * Deliberately exposes NO pricing, internal notes, or app navigation.
 */
export default function StatusPage({ params }: { params: { token: string } }) {
  const job = getJobByToken(params.token);

  if (!job) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-4xl" aria-hidden>🧭</p>
          <h1 className="mt-3 text-xl font-bold">Status link not found</h1>
          <p className="mt-2 text-sm text-slate-500">
            This tracking link isn&apos;t valid — it may have been mistyped or replaced. Please
            check the link in your email, or contact {FIRM.name} at {FIRM.phone}.
          </p>
        </div>
      </div>
    );
  }

  const events = getJobEvents(job.id);
  const lastEvent = events[events.length - 1];
  const stageIdx = STAGES.indexOf(job.stage);
  const progressPct = Math.round(((stageIdx + 1) / STAGES.length) * 100);
  const done = job.stage === "delivered" || job.stage === "invoiced";

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        {/* Firm brand header */}
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-slate-900 text-base font-bold text-orange-500">
            WLS
          </span>
          <div>
            <p className="font-bold">{FIRM.name}</p>
            <p className="text-xs text-slate-500">
              {FIRM.city}, {FIRM.state} · Licensed Professional Land Surveying
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Survey status tracker
          </p>
          <h1 className="mt-1 text-xl font-bold">
            Job {job.job_number} — {JOB_TYPE_LABELS[job.type]}
          </h1>
          <p className="text-sm text-slate-500">{job.address}</p>

          {/* Progress bar */}
          <div className="mt-6">
            <div className="h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full ${done ? "bg-emerald-600" : "bg-orange-500"}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="mt-2 hidden justify-between text-[10px] uppercase tracking-wide text-slate-400 sm:flex">
              {STAGES.map((s, i) => (
                <span key={s} className={i <= stageIdx ? "font-bold text-slate-700" : ""}>
                  {STAGE_LABELS[s]}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-400">Current stage</p>
              <p className="mt-1 font-bold text-slate-900">{STAGE_LABELS[job.stage]}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-400">Last update</p>
              <p className="mt-1 text-sm font-medium text-slate-700">
                {lastEvent ? dateTime(lastEvent.at) : "—"}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-400">
                {done ? "Delivered" : "Expected delivery"}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-700">
                {done ? shortDate(job.delivered_at) : job.due_date ? shortDate(job.due_date) : "To be scheduled"}
              </p>
            </div>
          </div>

          <p className="mt-6 text-sm text-slate-600">
            {done
              ? "Your survey is complete. Deliverables have been sent to the contact on file."
              : "This page updates automatically as your survey moves through our workflow — no need to call for status."}
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
          <p className="font-semibold text-slate-800">Questions?</p>
          <p>
            Office: {FIRM.phone} · {FIRM.email}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Ask for Marcus Lee (office manager) and reference job {job.job_number}.
          </p>
        </div>
      </div>
    </div>
  );
}
