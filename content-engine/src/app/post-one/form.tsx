"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AccountOption {
  id: string;
  platform: string;
  handle: string | null;
  workspaceId: string;
}

export function PostOneForm({ accounts }: { accounts: AccountOption[] }) {
  const router = useRouter();
  const [socialAccountId, setSocialAccountId] = useState(accounts[0]?.id ?? "");
  const [mediaUrl, setMediaUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | { ok: boolean; message: string }>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    const account = accounts.find((a) => a.id === socialAccountId);
    if (!account) {
      setResult({ ok: false, message: "select an account" });
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch("/api/post-one", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: account.workspaceId,
          socialAccountId,
          mediaUrl,
          caption,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: json.error ?? `HTTP ${res.status}` });
      } else {
        setResult({
          ok: true,
          message: `status=${json.status} · pbPostId=${json.pbPostId ?? "(none)"} · dryRun=${json.dryRun}`,
        });
        router.refresh();
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm">Account</span>
        <select
          className="mt-1 block w-full border rounded p-2"
          value={socialAccountId}
          onChange={(e) => setSocialAccountId(e.target.value)}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.platform} · {a.handle ?? a.id}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm">Image URL</span>
        <input
          type="url"
          required
          className="mt-1 block w-full border rounded p-2"
          value={mediaUrl}
          onChange={(e) => setMediaUrl(e.target.value)}
          placeholder="https://..."
        />
      </label>

      <label className="block">
        <span className="text-sm">Caption</span>
        <textarea
          className="mt-1 block w-full border rounded p-2"
          rows={3}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
      >
        {submitting ? "Submitting..." : "Post"}
      </button>

      {result && (
        <p className={`text-sm ${result.ok ? "" : "text-red-600"}`}>{result.message}</p>
      )}
    </form>
  );
}
