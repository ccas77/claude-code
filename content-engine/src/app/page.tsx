import Link from "next/link";
import { supabaseConfigured } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const configured = supabaseConfigured();
  const email = configured ? await currentUserEmail() : null;

  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold">content-engine</h1>
      <p className="mt-2 text-sm text-neutral-600">
        M0 scaffold + M1 posting core + M2 asset library.
      </p>

      {!configured ? (
        <section className="mt-6 border rounded p-4 text-sm">
          <p className="font-medium">Supabase not configured on this deployment.</p>
          <p className="mt-2 text-neutral-600">
            This preview is running with placeholder Supabase envs so the build
            can stay green. To sign in and exercise the flows, set
            <code className="mx-1">NEXT_PUBLIC_SUPABASE_URL</code>,
            <code className="mx-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, and
            <code className="mx-1">DATABASE_URL</code> to real values, then
            redeploy.
          </p>
        </section>
      ) : (
        <p className="mt-4 text-sm">
          Signed in as: <code>{email ?? "anonymous"}</code>
        </p>
      )}

      <nav className="mt-8 flex gap-4 text-sm">
        <Link className="underline" href="/post-one">
          /post-one
        </Link>
        <Link className="underline" href="/assets">
          /assets
        </Link>
      </nav>
    </main>
  );
}

async function currentUserEmail() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}
