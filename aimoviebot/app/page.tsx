"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Uploaded = { url: string };

export default function UploadPage() {
  const router = useRouter();
  const [character, setCharacter] = useState<Uploaded | null>(null);
  const [location, setLocation] = useState<Uploaded | null>(null);
  const [busy, setBusy] = useState<"character" | "location" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(kind: "character" | "location", file: File) {
    setError(null);
    setBusy(kind);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", kind);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as Uploaded;
      if (kind === "character") setCharacter(data);
      else setLocation(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const ready = character && location;

  return (
    <main className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">AI Movie Bot</h1>
        <p className="text-stone-600 mt-1">
          9:16 vertical, 4–15s, with spoken dialogue. Start by uploading a
          character image and a location image.
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <UploadCard
          label="Character"
          uploaded={character}
          busy={busy === "character"}
          onFile={(f) => upload("character", f)}
        />
        <UploadCard
          label="Location"
          uploaded={location}
          busy={busy === "location"}
          onFile={(f) => upload("location", f)}
        />
      </section>

      {error ? (
        <p className="text-red-600 text-sm">{error}</p>
      ) : null}

      <button
        className="w-full bg-violet-700 text-white rounded-lg py-3 font-medium disabled:bg-stone-300"
        disabled={!ready}
        onClick={() => {
          const params = new URLSearchParams({
            character: character!.url,
            location: location!.url,
          });
          router.push(`/concept?${params.toString()}`);
        }}
      >
        Continue to concept
      </button>
    </main>
  );
}

function UploadCard({
  label,
  uploaded,
  busy,
  onFile,
}: {
  label: string;
  uploaded: Uploaded | null;
  busy: boolean;
  onFile: (f: File) => void;
}) {
  return (
    <label className="block border border-stone-200 rounded-lg p-4 bg-white cursor-pointer hover:border-violet-300">
      <div className="text-sm text-stone-600">{label}</div>
      {uploaded ? (
        <img
          src={uploaded.url}
          alt={label}
          className="mt-3 w-full aspect-[9/16] object-cover rounded"
        />
      ) : (
        <div className="mt-3 aspect-[9/16] rounded bg-stone-100 border border-dashed border-stone-300 flex items-center justify-center text-stone-500 text-sm">
          {busy ? "Uploading…" : "Click to choose an image"}
        </div>
      )}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </label>
  );
}
