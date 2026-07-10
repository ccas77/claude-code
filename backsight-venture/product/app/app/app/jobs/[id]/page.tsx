import Link from "next/link";
import { notFound } from "next/navigation";
import CopyButton from "@/components/CopyButton";
import JobMap, { type MapPin } from "@/components/JobMap";
import StageActions from "@/components/StageActions";
import { dateTime, money, shortDate, STAGE_COLORS, yearOf } from "@/lib/format";
import {
  getAttachments,
  getJob,
  getJobEvents,
  isOverdue,
  priorWorkForJob,
} from "@/lib/queries";
import { CLIENT_KIND_LABELS, JOB_TYPE_LABELS, STAGE_LABELS, STAGES } from "@/lib/types";

export const dynamic = "force-dynamic";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

export default function JobDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const job = Number.isInteger(id) ? getJob(id) : null;
  if (!job) notFound();

  const events = getJobEvents(job.id);
  const attachments = getAttachments(job.id);
  const prior = priorWorkForJob(job.id);
  const overdue = isOverdue(job);
  const stageIdx = STAGES.indexOf(job.stage);

  const pins: MapPin[] = [
    {
      lat: job.lat,
      lng: job.lng,
      label: `${job.job_number} (this job)`,
      sublabel: job.address,
      kind: "primary",
    },
    ...prior.slice(0, 12).map((h) => ({
      lat: h.job.lat,
      lng: h.job.lng,
      label: h.job.job_number,
      sublabel: `${JOB_TYPE_LABELS[h.job.type]} · ${yearOf(h.job.created_at)}`,
      href: `/app/jobs/${h.job.id}`,
      kind: "hit" as const,
    })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            <Link href="/app/jobs" className="hover:text-orange-600">Pipeline</Link> / {job.job_number}
          </p>
          <h1 className="text-2xl font-bold">
            {job.job_number} — {JOB_TYPE_LABELS[job.type]}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold text-white ${STAGE_COLORS[job.stage]}`}>
              {STAGE_LABELS[job.stage]}
            </span>
            {overdue ? (
              <span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold uppercase text-white">
                Overdue
              </span>
            ) : null}
            {job.address}
          </p>
        </div>
        <CopyButton path={`/status/${job.share_token}`} label="Copy client share link" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Full record */}
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Job record</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Field label="Client">
                {job.client_name}
                <span className="block text-xs text-slate-500">
                  {CLIENT_KIND_LABELS[job.client_kind]} · {job.client_email}
                </span>
              </Field>
              <Field label="Quote">{money(job.quote_amount)}</Field>
              <Field label="Crew">{job.crew ?? "Unassigned"}</Field>
              <Field label="County / State">{job.county} Co., {job.state}</Field>
              <Field label="PLSS section">
                {job.plss_trs ? `${job.plss_trs} (${job.plss_meridian})` : "— address only"}
              </Field>
              <Field label="Coordinates">
                {job.lat.toFixed(5)}, {job.lng.toFixed(5)}
              </Field>
              <Field label="Created">{shortDate(job.created_at)}</Field>
              <Field label="Due">{shortDate(job.due_date)}</Field>
              <Field label="Delivered">{shortDate(job.delivered_at)}</Field>
            </dl>
            {job.notes ? (
              <div className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-slate-700">
                <span className="font-semibold text-amber-800">Notes: </span>
                {job.notes}
              </div>
            ) : null}
          </section>

          {/* Map */}
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-semibold">Location & prior work nearby</h2>
            <JobMap center={{ lat: job.lat, lng: job.lng }} zoom={13} pins={pins} />
          </section>

          {/* Prior work panel */}
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Prior work — same section & within 2 km</h2>
              <Link href="/app/radar" className="text-sm font-medium text-orange-600 hover:underline">
                Open Radar →
              </Link>
            </div>
            {prior.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No completed jobs in this section or within 2 km. First time on this ground.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {prior.map((h) => (
                  <li key={h.job.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link href={`/app/jobs/${h.job.id}`} className="font-medium hover:text-orange-600">
                        {h.job.job_number} · {JOB_TYPE_LABELS[h.job.type]} ({yearOf(h.job.created_at)})
                      </Link>
                      <p className="truncate text-sm text-slate-500">{h.job.address}</p>
                      {h.deliverables.length > 0 ? (
                        <p className="text-xs text-slate-400">{h.deliverables.join(" · ")}</p>
                      ) : null}
                    </div>
                    <div className="flex-shrink-0 text-right text-xs">
                      {h.sameSection ? (
                        <span className="rounded bg-teal-600 px-1.5 py-0.5 font-bold uppercase text-white">
                          Same section
                        </span>
                      ) : (
                        <span className="text-slate-500">{h.distanceKm} km</span>
                      )}
                      <p className="mt-1 text-slate-500">{money(h.job.quote_amount)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {/* Stage controls */}
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Stage</h2>
            <ol className="mt-3 space-y-1 text-sm">
              {STAGES.map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                      i < stageIdx
                        ? "bg-emerald-600 text-white"
                        : i === stageIdx
                          ? "bg-orange-600 text-white"
                          : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className={i === stageIdx ? "font-semibold" : "text-slate-500"}>
                    {STAGE_LABELS[s]}
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-4">
              <StageActions jobId={job.id} stage={job.stage} />
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Moving to Scheduled or Delivered sends the client a notification (see Outbox).
            </p>
          </section>

          {/* Attachments */}
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Attachments</h2>
            {attachments.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No deliverables attached yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {attachments.map((a) => (
                  <li key={a.id} className="flex items-start gap-2">
                    <span aria-hidden className="mt-0.5 text-slate-400">📄</span>
                    <div>
                      <p className="font-medium text-slate-800">{a.label}</p>
                      <p className="font-mono text-xs text-slate-400">{a.filename}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-400">Metadata only in this demo — no file storage.</p>
          </section>

          {/* Timeline */}
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Status timeline</h2>
            <ol className="mt-3 space-y-3 border-l-2 border-slate-200 pl-4">
              {[...events].reverse().map((e) => (
                <li key={e.id} className="relative">
                  <span
                    className={`absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full ${STAGE_COLORS[e.to_stage]}`}
                    aria-hidden
                  />
                  <p className="text-sm font-medium">
                    {e.from_stage
                      ? `${STAGE_LABELS[e.from_stage]} → ${STAGE_LABELS[e.to_stage]}`
                      : `Created (${STAGE_LABELS[e.to_stage]})`}
                  </p>
                  <p className="text-xs text-slate-500">
                    {e.actor} · {dateTime(e.at)}
                  </p>
                  {e.note ? <p className="text-xs italic text-slate-400">{e.note}</p> : null}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
