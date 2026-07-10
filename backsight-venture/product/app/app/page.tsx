import Link from "next/link";

const PROBLEMS = [
  {
    title: "Institutional memory lives in one person's head",
    body: "Thirty years of plats, corners, and control — findable only by asking the owner. When the PLS retires, the archive retires with them.",
  },
  {
    title: "“Where's my survey?” calls eat the office day",
    body: "Title companies and builders call for status because they have no other way to check. Every call interrupts drafting time.",
  },
  {
    title: "Jobs stall silently between stages",
    body: "A plat sits in review for two weeks; a delivered survey never gets invoiced. Nobody notices until the money is late.",
  },
  {
    title: "You re-bid ground you've already surveyed",
    body: "The fastest, most profitable job is one where your own corners are already in the ground — if you knew to look.",
  },
];

const TIERS = [
  {
    name: "Solo",
    price: "$79",
    blurb: "One licensed surveyor, one crew.",
    features: ["Job pipeline & status pages", "Prior-Work Radar", "Client notifications", "Unlimited jobs"],
    highlight: false,
  },
  {
    name: "Crew",
    price: "$149",
    blurb: "The 2–5 person firm. Most popular.",
    features: ["Everything in Solo", "Multiple crews & assignments", "Priority support", "Historical archive import help"],
    highlight: true,
  },
  {
    name: "Office",
    price: "$249",
    blurb: "Multi-crew firms with office staff.",
    features: ["Everything in Crew", "Unlimited users", "Custom branding on status pages", "Onboarding call with a human"],
    highlight: false,
  },
];

const FAQS = [
  {
    q: "What's mocked in this demo?",
    a: "Auth (a demo-user switcher instead of real login), email (notifications land in an in-app Outbox instead of SMTP), geocoding (demo jobs are pre-seeded with coordinates; the Census Geocoder integration is stubbed), and billing. The PLSS section parser, the pipeline engine, Prior-Work Radar, and the public status pages are fully real.",
  },
  {
    q: "Do I need to be in a PLSS state?",
    a: "Prior-Work Radar is strongest in the 30 PLSS states, where Township-Range-Section gives an exact “same ground” match. In metes-and-bounds states, Radar still works by coordinate proximity.",
  },
  {
    q: "How does my archive get in?",
    a: "Start forward-only in ten minutes: new jobs get logged as they arrive. Backfilling history is a spreadsheet import — job number, address or T-R-S, year, type — and it's exactly what makes Radar valuable.",
  },
  {
    q: "Is my data locked in?",
    a: "No. Flat pricing, no contracts, and a one-click export of every table. It's your firm's history.",
  },
  {
    q: "Why flat pricing per firm?",
    a: "Small firms shouldn't do per-seat math. One price covers the whole office, and it's less than one hour of billable crew time per month.",
  },
];

function Screenshot({ label, caption }: { label: string; caption: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-xl">
      <div className="flex items-center gap-1.5 border-b border-slate-700 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
        <span className="ml-2 text-xs text-slate-400">{label}</span>
      </div>
      <div className="flex h-44 items-center justify-center bg-[linear-gradient(135deg,#1e293b_0%,#0f172a_100%)] p-4">
        <div className="w-full space-y-2">
          <div className="h-3 w-2/3 rounded bg-slate-700" />
          <div className="h-3 w-1/2 rounded bg-slate-700" />
          <div className="mt-3 grid grid-cols-4 gap-2">
            <div className="h-14 rounded bg-slate-700/70" />
            <div className="h-14 rounded bg-orange-600/40" />
            <div className="h-14 rounded bg-slate-700/70" />
            <div className="h-14 rounded bg-slate-700/70" />
          </div>
        </div>
      </div>
      <div className="border-t border-slate-700 px-3 py-2 text-xs text-slate-400">{caption}</div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rotate-45 bg-orange-500" aria-hidden />
          <span className="text-lg font-bold tracking-tight">Backsight</span>
        </div>
        <nav className="flex items-center gap-6 text-sm text-slate-300">
          <a href="#pricing" className="hidden hover:text-white sm:inline">Pricing</a>
          <a href="#faq" className="hidden hover:text-white sm:inline">FAQ</a>
          <Link
            href="/app"
            className="rounded-md bg-orange-600 px-4 py-2 font-semibold text-white hover:bg-orange-500"
          >
            Open the demo
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-orange-500">
          Job tracking for land surveying firms
        </p>
        <h1 className="text-balance mx-auto max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">
          Your firm has surveyed this ground before.{" "}
          <span className="text-orange-500">Backsight remembers.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300">
          A simple pipeline for every job, a status page your title companies refresh instead of
          calling, and a radar that flags when a new request lands on a section you&apos;ve already
          surveyed.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/app"
            className="rounded-md bg-orange-600 px-6 py-3 text-base font-semibold text-white hover:bg-orange-500"
          >
            Try the live demo →
          </Link>
          <a
            href="#pricing"
            className="rounded-md border border-slate-600 px-6 py-3 text-base font-semibold text-slate-200 hover:border-slate-400"
          >
            See pricing
          </a>
        </div>
        <p className="mt-4 text-sm text-slate-500">
          Demo firm: Whitfield Land Surveying, PLS — Fort Collins, Colorado. No signup required.
        </p>
      </section>

      {/* Problems */}
      <section className="border-t border-slate-800 bg-slate-950/50">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-bold sm:text-3xl">The problems every small firm knows</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {PROBLEMS.map((p) => (
              <div key={p.title} className="rounded-lg border border-slate-800 bg-slate-900 p-5">
                <h3 className="font-semibold text-orange-400">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Screenshots */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-bold sm:text-3xl">Built around three screens</h2>
        <p className="mt-2 max-w-2xl text-slate-400">
          A pipeline board the office runs the day from, a radar the owner quotes from, and a
          status page clients check themselves.
        </p>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <Screenshot label="backsight — pipeline" caption="Every job, one board: request to invoiced." />
          <Screenshot label="backsight — prior-work radar" caption="Type a section; see every job you've done there." />
          <Screenshot label="backsight — client status page" caption="The link that replaces the status call." />
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-slate-800 bg-slate-950/50">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-bold sm:text-3xl">Flat pricing, per firm</h2>
          <p className="mt-2 text-slate-400">No per-seat math. Every plan includes unlimited jobs.</p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {TIERS.map((t) => (
              <div
                key={t.name}
                className={`rounded-xl border p-6 ${
                  t.highlight
                    ? "border-orange-500 bg-slate-900 shadow-lg shadow-orange-900/20"
                    : "border-slate-800 bg-slate-900"
                }`}
              >
                {t.highlight ? (
                  <p className="mb-2 text-xs font-bold uppercase tracking-widest text-orange-500">
                    Most popular
                  </p>
                ) : null}
                <h3 className="text-lg font-semibold">{t.name}</h3>
                <p className="mt-1 text-sm text-slate-400">{t.blurb}</p>
                <p className="mt-4 text-4xl font-bold">
                  {t.price}
                  <span className="text-base font-normal text-slate-400">/mo</span>
                </p>
                <ul className="mt-4 space-y-2 text-sm text-slate-300">
                  {t.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-orange-500">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-2xl font-bold sm:text-3xl">Questions surveyors actually ask</h2>
        <div className="mt-8 space-y-4">
          {FAQS.map((f) => (
            <details key={f.q} className="group rounded-lg border border-slate-800 bg-slate-900 p-5">
              <summary className="cursor-pointer font-semibold text-slate-100 group-open:text-orange-400">
                {f.q}
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-800 bg-slate-950/50">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center">
          <h2 className="text-balance text-3xl font-bold">
            Stop re-surveying your own memory.
          </h2>
          <Link
            href="/app"
            className="mt-6 inline-block rounded-md bg-orange-600 px-8 py-3 text-lg font-semibold text-white hover:bg-orange-500"
          >
            Open the Backsight demo →
          </Link>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-8 text-center text-xs text-slate-500">
        Backsight demo — fictional firm, fictional data. Auth, email, geocoding, and billing are
        mocked; see Settings → &ldquo;What&apos;s real vs. mocked&rdquo;.
      </footer>
    </div>
  );
}
