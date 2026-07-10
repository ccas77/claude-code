import Link from "next/link";
import { getCurrentUser } from "@/lib/actions";
import { FIRM } from "@/lib/types";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/jobs", label: "Pipeline" },
  { href: "/app/radar", label: "Prior-Work Radar" },
  { href: "/app/outbox", label: "Outbox" },
  { href: "/app/settings", label: "Settings" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900 text-slate-100">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rotate-45 bg-orange-500" aria-hidden />
            <span className="font-bold tracking-tight">Backsight</span>
          </Link>
          <span className="hidden text-sm text-slate-400 md:inline">{FIRM.name}</span>
          <nav className="order-last flex w-full gap-1 overflow-x-auto text-sm sm:order-none sm:w-auto sm:flex-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="whitespace-nowrap rounded-md px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/app/settings"
            className="ml-auto flex items-center gap-2 rounded-md px-2 py-1 text-sm text-slate-300 hover:bg-slate-800 sm:ml-0"
            title="Switch demo user in Settings"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">
              {user.name
                .split(" ")
                .slice(0, 2)
                .map((s) => s[0])
                .join("")}
            </span>
            <span className="hidden lg:inline">{user.name}</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
