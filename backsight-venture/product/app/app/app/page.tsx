import Link from "next/link";
import { dateTime, money, STAGE_COLORS } from "@/lib/format";
import { getDashboardData } from "@/lib/queries";
import { STAGE_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

function Kpi({ label, value, sub, accent = false }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${accent ? "text-orange-600" : "text-slate-900"}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

export default function DashboardPage() {
  const d = getDashboardData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-slate-500">The state of the firm, at a glance.</p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Active jobs" value={String(d.activeCount)} sub="everything not yet invoiced" />
        <Kpi
          label="Overdue"
          value={String(d.overdueCount)}
          sub="past due date, not delivered"
          accent={d.overdueCount > 0}
        />
        <Kpi label="Avg days in stage" value={String(d.avgDaysInStage)} sub="across in-flight jobs" />
        <Kpi
          label="Unbilled"
          value={money(d.unbilledTotal)}
          sub="delivered but not invoiced"
          accent={d.unbilledTotal > 0}
        />
      </div>

      {/* Pipeline counts */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Pipeline</h2>
          <Link href="/app/jobs" className="text-sm font-medium text-orange-600 hover:underline">
            Open board →
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {d.pipelineCounts.map(({ stage, count }) => (
            <Link
              key={stage}
              href={`/app/jobs?stage=${stage}`}
              className="rounded-md border border-slate-200 p-2 text-center hover:border-orange-400"
            >
              <span
                className={`mx-auto mb-1 block h-1.5 w-8 rounded-full ${STAGE_COLORS[stage]}`}
                aria-hidden
              />
              <p className="text-lg font-bold">{count}</p>
              <p className="truncate text-[11px] text-slate-500">{STAGE_LABELS[stage]}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Needs attention */}
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Needs attention</h2>
          {d.needsAttention.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Nothing on fire. Enjoy it.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {d.needsAttention.map(({ job, reason, detail }) => (
                <li key={`${job.id}-${reason}`} className="flex items-start gap-3 py-3">
                  <span
                    className={`mt-0.5 rounded px-1.5 py-0.5 text-[11px] font-bold uppercase text-white ${
                      reason === "overdue" ? "bg-red-600" : "bg-purple-600"
                    }`}
                  >
                    {reason === "overdue" ? "Overdue" : "Stuck"}
                  </span>
                  <div className="min-w-0">
                    <Link
                      href={`/app/jobs/${job.id}`}
                      className="font-medium text-slate-900 hover:text-orange-600"
                    >
                      {job.job_number} — {job.client_name}
                    </Link>
                    <p className="truncate text-sm text-slate-500">{job.address}</p>
                    <p className="text-xs text-slate-500">{detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Activity feed */}
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Recent activity</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {d.activity.map((e) => (
              <li key={e.id} className="py-2.5 text-sm">
                <Link href={`/app/jobs/${e.job_id}`} className="font-medium hover:text-orange-600">
                  {e.job_number}
                </Link>{" "}
                <span className="text-slate-600">
                  {e.from_stage
                    ? `moved ${STAGE_LABELS[e.from_stage]} → ${STAGE_LABELS[e.to_stage]}`
                    : `created as ${STAGE_LABELS[e.to_stage]}`}
                </span>
                <p className="text-xs text-slate-400">
                  {e.actor} · {dateTime(e.at)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
