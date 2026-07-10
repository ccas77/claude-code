import Link from "next/link";
import JobMap, { type MapPin } from "@/components/JobMap";
import { money, yearOf } from "@/lib/format";
import { radarSearch } from "@/lib/queries";
import { JOB_TYPE_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

const EXAMPLES: Array<{ q: string; why: string }> = [
  { q: "T7N R69W S14", why: "a section this firm has surveyed 3 times" },
  { q: "4515 Terry Lake Rd", why: "an address with nearby prior jobs" },
  { q: "40.488, -105.041", why: "raw coordinates from a county GIS" },
];

export default function RadarPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q ?? "";
  const result = q ? radarSearch(q) : null;

  const pins: MapPin[] =
    result && result.query.kind !== "error"
      ? [
          ...(result.center
            ? [
                {
                  ...result.center,
                  label: "Search location",
                  sublabel: result.query.label,
                  kind: "primary" as const,
                },
              ]
            : []),
          ...result.hits.map((h) => ({
            lat: h.job.lat,
            lng: h.job.lng,
            label: h.job.job_number,
            sublabel: `${JOB_TYPE_LABELS[h.job.type]} · ${yearOf(h.job.created_at)}`,
            href: `/app/jobs/${h.job.id}`,
            kind: "hit" as const,
          })),
        ]
      : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Prior-Work Radar</h1>
        <p className="text-sm text-slate-500">
          Before you quote, check whether the firm has already surveyed this ground.
        </p>
      </div>

      <form method="GET" className="flex flex-wrap gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder='Address, "lat, lng", or a section — e.g. "T7N R69W Sec 14"'
          className="w-full max-w-xl rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-md bg-orange-600 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-700"
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Try these:</span>
        {EXAMPLES.map((e) => (
          <Link
            key={e.q}
            href={`/app/radar?q=${encodeURIComponent(e.q)}`}
            title={e.why}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 font-mono text-xs text-slate-700 hover:border-orange-500 hover:text-orange-700"
          >
            {e.q}
          </Link>
        ))}
      </div>

      {!result ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-lg font-semibold text-slate-700">
            The five minutes that wins the job.
          </p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
            A title company asks for a quote on a parcel. Search the address or its
            Township-Range-Section here: if Whitfield has boundary corners, control, or a plat in
            that section already, you can quote faster, bid lower, and finish in half the field
            time — because your own monuments are still in the ground.
          </p>
          <p className="mt-3 text-xs text-slate-400">
            Accepts a seeded address, decimal &ldquo;lat, lng&rdquo;, or a live-parsed S-T-R string
            (e.g. &ldquo;Township 7 North, Range 69 West, Section 14&rdquo;).
          </p>
        </div>
      ) : result.query.kind === "error" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Couldn&apos;t run that search.</p>
          <p className="mt-1">{result.query.message}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm">
            <span className="text-slate-500">Interpreted as: </span>
            <span className="font-semibold">
              {result.query.kind === "plss" && "PLSS section — "}
              {result.query.kind === "coords" && "Coordinates — "}
              {result.query.kind === "address" && "Seeded address — "}
              {result.query.label}
            </span>
            {result.query.kind === "plss" && result.query.ref.ambiguous ? (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                Ambiguous: no principal meridian known — same T-R-S exists under many meridians
              </span>
            ) : null}
            {result.query.kind === "plss" && result.query.ref.quarters?.length ? (
              <span className="ml-2 text-xs text-slate-500">
                (quarters: {result.query.ref.quarters.join(" of ")})
              </span>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <JobMap
              center={result.center ?? { lat: 40.55, lng: -105.08 }}
              zoom={12}
              pins={pins}
              className="h-96"
            />
            <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="font-semibold">
                  {result.hits.length} prior job{result.hits.length === 1 ? "" : "s"} found
                </h2>
                <p className="text-xs text-slate-500">Same section first, then by distance (2 km radius).</p>
              </div>
              {result.hits.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">
                  No completed work in this section or within 2 km. If you win this job, it becomes
                  the firm&apos;s first mark on this ground — and the next search here will find it.
                </p>
              ) : (
                <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
                  {result.hits.map((h) => (
                    <li key={h.job.id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <Link
                          href={`/app/jobs/${h.job.id}`}
                          className="font-medium hover:text-orange-600"
                        >
                          {h.job.job_number} · {JOB_TYPE_LABELS[h.job.type]} ({yearOf(h.job.created_at)})
                        </Link>
                        <p className="truncate text-sm text-slate-500">{h.job.address}</p>
                        <p className="text-xs text-slate-400">
                          {h.deliverables.length > 0
                            ? h.deliverables.join(" · ")
                            : "No deliverable metadata"}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right text-xs">
                        {h.sameSection ? (
                          <span className="rounded bg-teal-600 px-1.5 py-0.5 font-bold uppercase text-white">
                            Same section
                          </span>
                        ) : (
                          <span className="text-slate-500">{h.distanceKm} km away</span>
                        )}
                        <p className="mt-1 font-medium text-slate-600">{money(h.job.quote_amount)}</p>
                        <p className="text-slate-400">original quote</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
