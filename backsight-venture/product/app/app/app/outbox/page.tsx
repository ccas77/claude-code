import Link from "next/link";
import { dateTime } from "@/lib/format";
import { getOutbox } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function OutboxPage() {
  const rows = getOutbox();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Outbox</h1>
        <p className="text-sm text-slate-500">
          Every client notification the system has &ldquo;sent&rdquo;. In this demo there is no
          SMTP — messages land here instead of an inbox, which proves the notification loop
          without an email provider.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nothing sent yet. Advance a job to Scheduled or Delivered on the Pipeline board and the
          notification will appear here.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-slate-900">{r.subject}</p>
                <p className="text-xs text-slate-400">{dateTime(r.at)}</p>
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                To: <span className="font-mono text-xs">{r.to_email}</span>
                {r.job_id ? (
                  <>
                    {" · "}
                    <Link href={`/app/jobs/${r.job_id}`} className="text-orange-600 hover:underline">
                      {r.job_number ?? `job #${r.job_id}`}
                    </Link>
                  </>
                ) : null}
              </p>
              <pre className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-sans text-sm text-slate-700">
                {r.body}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
