import { getCurrentUser, setCurrentUser } from "@/lib/actions";
import { DEMO_USERS, FIRM } from "@/lib/types";

export const dynamic = "force-dynamic";

const REAL_VS_MOCKED: Array<{ area: string; status: "real" | "mocked"; detail: string }> = [
  {
    area: "PLSS section parser",
    status: "real",
    detail:
      "lib/plss.ts — original, license-clean Township-Range-Section parser with vitest coverage. Ships to production unchanged.",
  },
  {
    area: "Pipeline & stage engine",
    status: "real",
    detail:
      "Stage transitions validate adjacency, write job_events history, and enqueue client notifications — the real workflow engine.",
  },
  {
    area: "Prior-Work Radar",
    status: "real",
    detail: "Same-section matching plus 2 km haversine proximity over the firm's job history.",
  },
  {
    area: "Public status pages",
    status: "real",
    detail: "Token-gated read-only tracker at /status/[token]; exposes no pricing, notes, or navigation.",
  },
  {
    area: "Geocoding",
    status: "mocked",
    detail:
      "Demo jobs are pre-seeded with coordinates; address search matches seeded addresses. Census Geocoder integration is stubbed with a documented TODO in lib/geocode.ts (free, no API key).",
  },
  {
    area: "Email",
    status: "mocked",
    detail:
      "No SMTP. Notifications are written to the outbox table and shown at /app/outbox, proving the loop end to end.",
  },
  {
    area: "Auth & users",
    status: "mocked",
    detail:
      "No auth provider. The demo-user switcher below stores a cookie; production gets real accounts.",
  },
  {
    area: "Billing",
    status: "mocked",
    detail: "Pricing tiers on the landing page are display-only. No payment integration.",
  },
];

export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-slate-500">Firm profile, demo user, and demo transparency.</p>
      </div>

      {/* Firm profile */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Firm profile</h2>
        <div className="mt-3 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-900 text-lg font-bold text-orange-500">
            WLS
          </span>
          <div>
            <p className="font-semibold">{FIRM.name}</p>
            <p className="text-sm text-slate-500">
              {FIRM.city}, {FIRM.county}, {FIRM.state} · {FIRM.phone} · {FIRM.email}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          The firm name and logo text brand the public client status pages.
        </p>
      </section>

      {/* User switcher */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Demo user (mocked auth)</h2>
        <p className="mt-1 text-sm text-slate-500">
          No login in this demo — pick who you are. Stage changes are recorded under this name.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {DEMO_USERS.map((u) => (
            <form key={u.id} action={setCurrentUser}>
              <input type="hidden" name="user" value={u.id} />
              <button
                type="submit"
                className={`rounded-lg border px-4 py-3 text-left ${
                  u.id === user.id
                    ? "border-orange-500 bg-orange-50"
                    : "border-slate-200 bg-white hover:border-slate-400"
                }`}
              >
                <p className="font-semibold">{u.name}</p>
                <p className="text-xs text-slate-500">{u.role}</p>
                {u.id === user.id ? (
                  <p className="mt-1 text-xs font-semibold text-orange-600">Current user</p>
                ) : null}
              </button>
            </form>
          ))}
        </div>
      </section>

      {/* What's real vs mocked */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold">What&apos;s real vs. mocked in this demo</h2>
        <ul className="mt-3 space-y-3">
          {REAL_VS_MOCKED.map((r) => (
            <li key={r.area} className="flex items-start gap-3">
              <span
                className={`mt-0.5 w-16 flex-shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-bold uppercase text-white ${
                  r.status === "real" ? "bg-emerald-600" : "bg-slate-500"
                }`}
              >
                {r.status}
              </span>
              <div>
                <p className="text-sm font-semibold">{r.area}</p>
                <p className="text-sm text-slate-500">{r.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
