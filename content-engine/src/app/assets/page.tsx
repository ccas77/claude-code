import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { supabaseServer } from "@/lib/supabase/server";
import { AssetUploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/");

  const memberships = await db
    .select({ workspaceId: schema.workspaceMembers.workspaceId, name: schema.workspaces.name })
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
    .where(eq(schema.workspaceMembers.userId, data.user.id));

  const workspaceIds = memberships.map((m) => m.workspaceId);
  const recent = workspaceIds.length
    ? await db
        .select()
        .from(schema.assets)
        .where(eq(schema.assets.workspaceId, workspaceIds[0]))
        .orderBy(desc(schema.assets.createdAt))
        .limit(50)
    : [];

  return (
    <main className="min-h-screen p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold">Assets</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Workspace asset library. Upload a file or paste a URL — both are supported.
      </p>

      {memberships.length === 0 ? (
        <p className="mt-6 text-sm">
          You are not a member of any workspace yet. An admin needs to add you.
        </p>
      ) : (
        <AssetUploadForm workspaces={memberships} />
      )}

      <section className="mt-10">
        <h2 className="text-lg font-medium">Recent assets</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm">No assets in this workspace yet.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recent.map((a) => (
              <li key={a.id} className="border rounded p-3 text-sm">
                <div className="flex items-center justify-between">
                  <code className="text-xs">{a.kind}</code>
                  <span className="text-xs text-neutral-500">
                    {a.origin} · {a.visibility}
                  </span>
                </div>
                <div className="mt-1 truncate">
                  {a.externalUrl ? (
                    <a
                      className="underline"
                      href={a.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {a.externalUrl}
                    </a>
                  ) : (
                    <span className="text-neutral-600">
                      {a.storagePath ?? "(no source)"}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  {a.sourcePlatform ? `${a.sourcePlatform} · ` : ""}
                  {a.createdAt.toISOString()}
                </div>
                {a.ocrStatus && (
                  <div className="mt-1 text-xs">ocr: {a.ocrStatus}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
