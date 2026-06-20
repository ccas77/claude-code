"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Uploaded = { url: string };
type CharacterDraft = { id: string; name: string; image: Uploaded | null };

type SavedCharacter = { id: string; name: string; imageUrl: string };
type SavedLocation = { id: string; label: string; imageUrl: string };

const MAX_CHARACTERS = 4;

function newCharacter(): CharacterDraft {
  return {
    id: Math.random().toString(36).slice(2),
    name: "",
    image: null,
  };
}

export default function UploadPage() {
  const router = useRouter();
  const [characters, setCharacters] = useState<CharacterDraft[]>([newCharacter()]);
  const [location, setLocation] = useState<Uploaded | null>(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [savedCast, setSavedCast] = useState<SavedCharacter[]>([]);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [savingLibrary, setSavingLibrary] = useState(false);

  useEffect(() => {
    fetch("/api/oauth/higgsfield/status")
      .then((r) => r.json())
      .then((d) => setConnected(Boolean(d.connected)))
      .catch(() => setConnected(false));
  }, []);

  useEffect(() => {
    fetch("/api/library")
      .then((r) => r.json())
      .then((d) => {
        setSavedCast(d.characters ?? []);
        setSavedLocations(d.locations ?? []);
      })
      .catch(() => {});
  }, []);

  async function uploadFile(file: File, kind: string): Promise<Uploaded> {
    const fd = new FormData();
    fd.set("file", file);
    fd.set("kind", kind);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as Uploaded;
  }

  async function setCharacterImage(id: string, file: File) {
    setError(null);
    setBusy(`character:${id}`);
    try {
      const uploaded = await uploadFile(file, "character");
      setCharacters((cs) =>
        cs.map((c) => (c.id === id ? { ...c, image: uploaded } : c)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function setLocationImage(file: File) {
    setError(null);
    setBusy("location");
    try {
      setLocation(await uploadFile(file, "location"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function setCharacterName(id: string, name: string) {
    setCharacters((cs) =>
      cs.map((c) => (c.id === id ? { ...c, name } : c)),
    );
  }

  function addCharacter() {
    if (characters.length >= MAX_CHARACTERS) return;
    setCharacters((cs) => [...cs, newCharacter()]);
  }

  function removeCharacter(id: string) {
    setCharacters((cs) =>
      cs.length === 1 ? cs : cs.filter((c) => c.id !== id),
    );
  }

  // Pull a saved character into the current cast. Adds at the next empty
  // slot or appends. Skips if already in cast.
  function useSavedCharacter(saved: SavedCharacter) {
    setCharacters((cs) => {
      if (cs.some((c) => c.image?.url === saved.imageUrl)) return cs;
      const emptyIdx = cs.findIndex((c) => !c.image && !c.name.trim());
      const slot: CharacterDraft = {
        id: Math.random().toString(36).slice(2),
        name: saved.name,
        image: { url: saved.imageUrl },
      };
      if (emptyIdx >= 0) {
        const next = [...cs];
        next[emptyIdx] = slot;
        return next;
      }
      if (cs.length >= MAX_CHARACTERS) return cs;
      return [...cs, slot];
    });
  }

  function useSavedLocation(saved: SavedLocation) {
    setLocation({ url: saved.imageUrl });
    setLocationLabel(saved.label);
  }

  async function removeFromLibrary(type: "characters" | "locations", id: string) {
    try {
      await fetch(`/api/library?type=${type}&id=${id}`, { method: "DELETE" });
      if (type === "characters") {
        setSavedCast((xs) => xs.filter((x) => x.id !== id));
      } else {
        setSavedLocations((xs) => xs.filter((x) => x.id !== id));
      }
    } catch {
      // swallow; library removal isn't critical-path
    }
  }

  const namedAndUploaded = characters.filter(
    (c) => c.name.trim() && c.image,
  );
  const namesUnique =
    new Set(namedAndUploaded.map((c) => c.name.trim().toLowerCase())).size ===
    namedAndUploaded.length;
  const ready =
    namedAndUploaded.length === characters.length &&
    characters.length > 0 &&
    location &&
    namesUnique;

  async function goToConcept() {
    if (!ready) return;
    setSavingLibrary(true);
    const cast = characters.map((c) => ({
      name: c.name.trim(),
      imageUrl: c.image!.url,
    }));
    // Autosave cast + location to library BEFORE navigating. Failures here
    // shouldn't block the render flow; library is convenience, not core.
    try {
      await Promise.all([
        ...cast.map((c) =>
          fetch("/api/library", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "characters", item: c }),
          }),
        ),
        fetch("/api/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "locations",
            item: { label: locationLabel, imageUrl: location!.url },
          }),
        }),
      ]);
    } catch {
      // ignore library save failures
    }
    setSavingLibrary(false);
    const params = new URLSearchParams({
      cast: JSON.stringify(cast),
      location: location!.url,
    });
    router.push(`/concept?${params.toString()}`);
  }

  return (
    <main className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">AI Movie Bot</h1>
        <p className="text-stone-600 mt-1">
          9:16 vertical, 4-15s, with spoken dialogue. Add one or more
          characters (name + image each), pick a location, write a scene.
        </p>
      </header>

      <div
        className={`rounded-lg px-4 py-3 text-sm border ${
          connected
            ? "bg-violet-50 border-violet-200 text-violet-900"
            : "bg-stone-50 border-stone-200 text-stone-700"
        }`}
      >
        {connected === null ? (
          "Checking Higgsfield connection…"
        ) : connected ? (
          <>Higgsfield connected. Renders will use nano_banana_pro + seedance_2_0.</>
        ) : (
          <>
            Higgsfield not connected. The app still works via the Gateway
            fallback, but to use the higher-quality primary path,{" "}
            <a href="/api/oauth/higgsfield" className="underline font-medium">
              connect Higgsfield
            </a>
            .
          </>
        )}
      </div>

      {savedCast.length > 0 ? (
        <LibraryStrip
          label="Saved cast"
          empty="No saved characters yet."
          items={savedCast.map((c) => ({
            id: c.id,
            label: c.name,
            imageUrl: c.imageUrl,
            onUse: () => useSavedCharacter(c),
            onRemove: () => removeFromLibrary("characters", c.id),
          }))}
        />
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-stone-700">
            Cast ({characters.length}/{MAX_CHARACTERS})
          </h2>
          <button
            onClick={addCharacter}
            disabled={characters.length >= MAX_CHARACTERS}
            className="text-violet-700 text-sm disabled:text-stone-400"
          >
            + Add character
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {characters.map((c) => (
            <CharacterCard
              key={c.id}
              draft={c}
              busy={busy === `character:${c.id}`}
              canRemove={characters.length > 1}
              onFile={(f) => setCharacterImage(c.id, f)}
              onName={(n) => setCharacterName(c.id, n)}
              onRemove={() => removeCharacter(c.id)}
            />
          ))}
        </div>
        {!namesUnique ? (
          <p className="text-amber-700 text-sm">
            Character names must be unique.
          </p>
        ) : null}
      </section>

      {savedLocations.length > 0 ? (
        <LibraryStrip
          label="Saved locations"
          empty="No saved locations yet."
          items={savedLocations.map((l) => ({
            id: l.id,
            label: l.label,
            imageUrl: l.imageUrl,
            onUse: () => useSavedLocation(l),
            onRemove: () => removeFromLibrary("locations", l.id),
          }))}
        />
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-stone-700">Location</h2>
        <input
          value={locationLabel}
          onChange={(e) => setLocationLabel(e.target.value)}
          placeholder="Location name (e.g. Kitchen at night)"
          maxLength={60}
          className="w-full border border-stone-300 rounded p-2 bg-white text-sm"
        />
        <UploadCard
          label="Location image"
          uploaded={location}
          busy={busy === "location"}
          onFile={setLocationImage}
        />
      </section>

      {error ? <p className="text-red-600 text-sm">{error}</p> : null}

      <button
        className="w-full bg-violet-700 text-white rounded-lg py-3 font-medium disabled:bg-stone-300"
        disabled={!ready || savingLibrary}
        onClick={goToConcept}
      >
        {savingLibrary ? "Saving…" : "Continue to concept"}
      </button>
    </main>
  );
}

function LibraryStrip({
  label,
  empty,
  items,
}: {
  label: string;
  empty: string;
  items: {
    id: string;
    label: string;
    imageUrl: string;
    onUse: () => void;
    onRemove: () => void;
  }[];
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-stone-700">{label}</h2>
      {items.length === 0 ? (
        <p className="text-stone-500 text-sm">{empty}</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
          {items.map((it) => (
            <div
              key={it.id}
              className="flex-shrink-0 w-24 border border-stone-200 rounded-lg bg-white overflow-hidden"
            >
              <button
                onClick={it.onUse}
                className="block w-full"
                aria-label={`Use ${it.label}`}
              >
                <img
                  src={it.imageUrl}
                  alt={it.label}
                  className="w-full aspect-[9/16] object-cover hover:opacity-90"
                />
              </button>
              <div className="px-2 pt-1 pb-2 flex items-start justify-between gap-1">
                <span className="text-xs text-stone-700 truncate" title={it.label}>
                  {it.label}
                </span>
                <button
                  onClick={it.onRemove}
                  className="text-stone-400 hover:text-red-600 text-xs"
                  aria-label="Remove from library"
                  title="Remove from library"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CharacterCard({
  draft,
  busy,
  canRemove,
  onFile,
  onName,
  onRemove,
}: {
  draft: CharacterDraft;
  busy: boolean;
  canRemove: boolean;
  onFile: (f: File) => void;
  onName: (n: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-stone-200 rounded-lg p-3 bg-white space-y-3">
      <div className="flex gap-2">
        <input
          value={draft.name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Character name"
          maxLength={40}
          className="flex-1 border border-stone-300 rounded p-2 bg-white text-sm"
        />
        {canRemove ? (
          <button
            onClick={onRemove}
            className="text-stone-500 text-sm px-2"
            aria-label="Remove character"
          >
            ×
          </button>
        ) : null}
      </div>
      <label className="block cursor-pointer">
        {draft.image ? (
          <img
            src={draft.image.url}
            alt={draft.name || "character"}
            className="w-full aspect-[9/16] object-cover rounded"
          />
        ) : (
          <div className="aspect-[9/16] rounded bg-stone-100 border border-dashed border-stone-300 flex items-center justify-center text-stone-500 text-sm">
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
    </div>
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
