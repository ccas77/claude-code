import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { postbridgeDryRun, supabaseConfigured } from "@/lib/env";
import { listAllowedAccounts } from "@/services/posting";
import { getSignedInUserId } from "@/lib/supabase/server";
import { PostOneForm } from "./form";

export const dynamic = "force-dynamic";

export default async function PostOnePage() {
  if (!supabaseConfigured()) {
    return (
      <main className="min-h-screen p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold">Post one image now</h1>
        <p className="mt-4 text-sm">
          Supabase not configured on this deployment — see the home page.
        </p>
      </main>
    );
  }
  const userId = await getSignedInUserId();
  if (!userId) {
    return (
      <main className="min-h-screen p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold">Post one image now</h1>
        <p className="mt-4 text-sm">Sign in to use this flow.</p>
      </main>
    );
  }

  const [allowed, recent] = await Promise.all([
    listAllowedAccounts(userId),
    db
      .select({
        id: schema.postLog.id,
        status: schema.postLog.status,
        dryRun: schema.postLog.dryRun,
        pbPostId: schema.postLog.pbPostId,
        error: schema.postLog.error,
        submittedAt: schema.postLog.submittedAt,
        socialAccountId: schema.postLog.socialAccountId,
      })
      .from(schema.postLog)
      .where(eq(schema.postLog.actorUserId, userId))
      .orderBy(desc(schema.postLog.submittedAt))
      .limit(10),
  ]);

  const activeAccounts = allowed.filter((a) => a.isActive);
  const dryRun = postbridgeDryRun();

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold">Post one image now</h1>
      <p className="mt-1 text-sm">
        Mode: <strong>{dryRun ? "DRY_RUN" : "LIVE"}</strong>
        {dryRun && " — nothing will be sent to Post Bridge."}
      </p>

      {activeAccounts.length === 0 ? (
        <p className="mt-6 text-sm">
          No social accounts are on your allow-list yet. An admin needs to grant access.
        </p>
      ) : (
        <PostOneForm accounts={activeAccounts} />
      )}

      <section className="mt-10">
        <h2 className="text-lg font-medium">Your recent submissions</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm">No submissions yet.</p>
        ) : (
          <ul className="mt-2 text-sm space-y-1">
            {recent.map((r) => (
              <li key={r.id}>
                <code>{r.status}</code> · {r.dryRun ? "dry-run" : "live"} ·{" "}
                {r.pbPostId ?? "(no id)"} · {r.submittedAt.toISOString()}
                {r.error ? ` · error: ${r.error}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
