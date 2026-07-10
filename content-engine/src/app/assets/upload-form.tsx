"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface WorkspaceOption {
  workspaceId: string;
  name: string;
}

type Kind = "image" | "font" | "audio" | "video";

export function AssetUploadForm({ workspaces }: { workspaces: WorkspaceOption[] }) {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.workspaceId ?? "");
  const [kind, setKind] = useState<Kind>("image");
  const [mode, setMode] = useState<"file" | "url">("file");
  const [file, setFile] = useState<File | null>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | { ok: boolean; message: string }>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      let res: Response;
      if (mode === "file") {
        if (!file) throw new Error("choose a file");
        const form = new FormData();
        form.set("workspaceId", workspaceId);
        form.set("kind", kind);
        form.set("file", file);
        res = await fetch("/api/assets", { method: "POST", body: form });
      } else {
        if (!externalUrl) throw new Error("paste a URL");
        res = await fetch("/api/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, kind, externalUrl }),
        });
      }
      const json = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: json.error ?? `HTTP ${res.status}` });
      } else {
        setResult({
          ok: true,
          message: `Saved${json.dryRun ? " (storage DRY_RUN — no file uploaded)" : ""}: ${json.asset.id}`,
        });
        setFile(null);
        setExternalUrl("");
        router.refresh();
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className="text-sm">Workspace</span>
        <select
          className="mt-1 block w-full border rounded p-2"
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
        >
          {workspaces.map((w) => (
            <option key={w.workspaceId} value={w.workspaceId}>
              {w.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm">Kind</span>
        <select
          className="mt-1 block w-full border rounded p-2"
          value={kind}
          onChange={(e) => setKind(e.target.value as Kind)}
        >
          <option value="image">image</option>
          <option value="font">font</option>
          <option value="audio">audio</option>
          <option value="video">video</option>
        </select>
      </label>

      <fieldset className="sm:col-span-2 border rounded p-3">
        <legend className="text-sm px-1">Source</legend>
        <div className="flex gap-4 text-sm">
          <label className="inline-flex items-center gap-1">
            <input
              type="radio"
              name="mode"
              value="file"
              checked={mode === "file"}
              onChange={() => setMode("file")}
            />
            File upload
          </label>
          <label className="inline-flex items-center gap-1">
            <input
              type="radio"
              name="mode"
              value="url"
              checked={mode === "url"}
              onChange={() => setMode("url")}
            />
            Paste URL
          </label>
        </div>

        {mode === "file" ? (
          <input
            type="file"
            className="mt-3 block w-full text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        ) : (
          <input
            type="url"
            className="mt-3 block w-full border rounded p-2"
            placeholder="https://..."
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
          />
        )}
      </fieldset>

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save asset"}
        </button>
        {result && (
          <p className={`mt-3 text-sm ${result.ok ? "" : "text-red-600"}`}>{result.message}</p>
        )}
      </div>
    </form>
  );
}
