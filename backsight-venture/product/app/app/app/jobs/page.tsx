import Link from "next/link";
import StageActions from "@/components/StageActions";
import { money, shortDate, STAGE_COLORS } from "@/lib/format";
import { activeJobsWithPriorWork, getJobs, isOverdue } from "@/lib/queries";
import {
  JOB_TYPE_LABELS,
  STAGE_LABELS,
  STAGES,
  type JobType,
  type JobWithClient,
  type Stage,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const CREWS = ["Crew A", "Crew B", "Crew C"];

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white ${color}`}>
      {children}
    </span>
  );
}

function JobCard({ job, priorWork }: { job: JobWithClient; priorWork: boolean }) {
  const overdue = isOverdue(job);
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/app/jobs/${job.id}`}
          className="font-semibold text-slate-900 hover:text-orange-600"
        >
          {job.job_number}
        </Link>
        <details className="menu relative">
          <summary
            className="rounded px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={`Actions for ${job.job_number}`}
          >
            ⋮
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg">
            <StageActions jobId={job.id} stage={job.stage} compact />
            <Link
              href={`/app/jobs/${job.id}`}
              className="block px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
            >
              Open job detail
            </Link>
          </div>
        </details>
      </div>
      <p className="truncate text-sm text-slate-600">{job.client_name}</p>
      <p className="mt-0.5 text-xs text-slate-500">{JOB_TYPE_LABELS[job.type]}</p>
      <p className="mt-0.5 truncate text-xs text-slate-400">
        {job.plss_trs ? `${job.plss_trs} · ` : ""}
        {job.county} Co., {job.state}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {job.due_date ? (
          <span className={`text-xs ${overdue ? "font-semibold text-red-600" : "text-slate-500"}`}>
            Due {shortDate(job.due_date)}
          </span>
        ) : null}
        {overdue ? <Badge color="bg-red-600">Overdue</Badge> : null}
        {priorWork ? <Badge color="bg-teal-600">Prior work nearby</Badge> : null}
        {job.crew ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
            {job.crew}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function JobsPage({
  searchParams,
}: {
  searchParams: { view?: string; type?: string; crew?: string; stage?: string };
}) {
  const view = searchParams.view === "list" ? "list" : "board";
  const typeFilter = (searchParams.type ?? "") as JobType | "";
  const crewFilter = searchParams.crew ?? "";
  const stageFilter = (searchParams.stage ?? "") as Stage | "";

  const priorWork = activeJobsWithPriorWork();
  let jobs = getJobs();
  if (typeFilter) jobs = jobs.filter((j) => j.type === typeFilter);
  if (crewFilter) jobs = jobs.filter((j) => j.crew === crewFilter);

  // Board shows the live pipeline (invoiced history hidden unless filtered to it).
  const boardStages = stageFilter ? [stageFilter] : STAGES.filter((s) => s !== "invoiced");
  const listJobs = (stageFilter ? jobs.filter((j) => j.stage === stageFilter) : jobs).slice(
    0,
    stageFilter || typeFilter || crewFilter ? undefined : 60,
  );

  const qs = (over: Record<string, string>) => {
    const params = new URLSearchParams();
    const merged = { view, type: typeFilter, crew: crewFilter, stage: stageFilter, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pipeline</h1>
          <p className="text-sm text-slate-500">
            Advance or regress a job from its card menu (⋮). Key transitions notify the client.
          </p>
        </div>
        <div className="flex rounded-md border border-slate-300 text-sm font-medium">
          <Link
            href={`/app/jobs${qs({ view: "" })}`}
            className={`rounded-l-md px-3 py-1.5 ${view === "board" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}
          >
            Board
          </Link>
          <Link
            href={`/app/jobs${qs({ view: "list" })}`}
            className={`rounded-r-md px-3 py-1.5 ${view === "list" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}
          >
            List
          </Link>
        </div>
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap items-center gap-2 text-sm">
        {view === "list" ? <input type="hidden" name="view" value="list" /> : null}
        {stageFilter ? <input type="hidden" name="stage" value={stageFilter} /> : null}
        <label className="text-slate-500">Type</label>
        <select name="type" defaultValue={typeFilter} className="rounded-md border border-slate-300 bg-white px-2 py-1.5">
          <option value="">All types</option>
          {Object.entries(JOB_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <label className="text-slate-500">Crew</label>
        <select name="crew" defaultValue={crewFilter} className="rounded-md border border-slate-300 bg-white px-2 py-1.5">
          <option value="">All crews</option>
          {CREWS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700">
          Apply
        </button>
        {typeFilter || crewFilter || stageFilter ? (
          <Link href={`/app/jobs${view === "list" ? "?view=list" : ""}`} className="text-orange-600 hover:underline">
            Clear filters
          </Link>
        ) : null}
      </form>

      {view === "board" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
          <div className="flex gap-3" style={{ minWidth: `${boardStages.length * 15}rem` }}>
            {boardStages.map((stage) => {
              const col = jobs.filter((j) => j.stage === stage);
              return (
                <div key={stage} className="w-60 flex-shrink-0 rounded-lg bg-slate-100 p-2">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                      <span className={`h-2 w-2 rounded-full ${STAGE_COLORS[stage]}`} aria-hidden />
                      {STAGE_LABELS[stage]}
                    </h2>
                    <span className="rounded-full bg-white px-2 text-xs font-semibold text-slate-500">
                      {col.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {col.map((j) => (
                      <JobCard key={j.id} job={j} priorWork={priorWork.has(j.id)} />
                    ))}
                    {col.length === 0 ? (
                      <p className="px-1 py-4 text-center text-xs text-slate-400">Empty</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Job #</th>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Section / County</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2">Quote</th>
                <th className="px-3 py-2">Crew</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {listJobs.map((j) => (
                <tr key={j.id} className="hover:bg-orange-50/50">
                  <td className="px-3 py-2">
                    <Link href={`/app/jobs/${j.id}`} className="font-semibold hover:text-orange-600">
                      {j.job_number}
                    </Link>
                    {isOverdue(j) ? <span className="ml-2 text-[10px] font-bold uppercase text-red-600">Overdue</span> : null}
                    {priorWork.has(j.id) ? <span className="ml-2 text-[10px] font-bold uppercase text-teal-600">Prior work</span> : null}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{j.client_name}</td>
                  <td className="px-3 py-2 text-slate-600">{JOB_TYPE_LABELS[j.type]}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold text-white ${STAGE_COLORS[j.stage]}`}>
                      {STAGE_LABELS[j.stage]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {j.plss_trs ?? "—"} · {j.county}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{shortDate(j.due_date)}</td>
                  <td className="px-3 py-2 text-slate-500">{money(j.quote_amount)}</td>
                  <td className="px-3 py-2 text-slate-500">{j.crew ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!stageFilter && !typeFilter && !crewFilter ? (
            <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
              Showing the 60 most recent jobs. Use filters to narrow the full history.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
