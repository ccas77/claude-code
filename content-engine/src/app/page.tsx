import { supabaseServer } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold">content-engine</h1>
      <p className="mt-2 text-sm">Milestone M0 scaffold.</p>
      <p className="mt-4 text-sm">
        Signed in as: <code>{data.user?.email ?? "anonymous"}</code>
      </p>
    </main>
  );
}
