import { put, list } from "@vercel/blob";

// Per-user saved Cast, Locations, and Scenes. Single-user app: one shared
// pool. Persisted in Blob using the same unique-URL-per-write pattern as
// job state, so reads always see the latest after a write.

export type SavedCharacter = {
  id: string;
  name: string;
  imageUrl: string;
  createdAt: string;
};

export type SavedLocation = {
  id: string;
  label: string;
  imageUrl: string;
  createdAt: string;
};

export type SavedScene = {
  id: string;
  label: string;
  mode: "A" | "B" | "C";
  conceptInput: string;
  createdAt: string;
};

export type LibraryType = "characters" | "locations" | "scenes";

export type LibrarySnapshot = {
  characters: SavedCharacter[];
  locations: SavedLocation[];
  scenes: SavedScene[];
};

const PREFIX: Record<LibraryType, string> = {
  characters: "library/characters-",
  locations: "library/locations-",
  scenes: "library/scenes-",
};

async function readLatestList<T>(prefix: string): Promise<T[]> {
  try {
    const result = await list({ prefix });
    if (result.blobs.length === 0) return [];
    result.blobs.sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
    );
    const latest = result.blobs[0];
    const res = await fetch(latest.url, { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as T[];
  } catch {
    return [];
  }
}

async function writeList<T>(prefix: string, items: T[]): Promise<void> {
  await put(
    `${prefix}${Date.now()}.json`,
    JSON.stringify(items, null, 2),
    {
      access: "public",
      addRandomSuffix: true,
      contentType: "application/json",
    },
  );
}

export async function getLibrary(): Promise<LibrarySnapshot> {
  const [characters, locations, scenes] = await Promise.all([
    readLatestList<SavedCharacter>(PREFIX.characters),
    readLatestList<SavedLocation>(PREFIX.locations),
    readLatestList<SavedScene>(PREFIX.scenes),
  ]);
  return { characters, locations, scenes };
}

// Character dedupe: same imageUrl OR same name (case-insensitive). Same
// imageUrl wins (updates the existing entry's name); same name overwrites
// the imageUrl.
export async function upsertCharacter(
  input: { name: string; imageUrl: string },
): Promise<SavedCharacter[]> {
  const list = await readLatestList<SavedCharacter>(PREFIX.characters);
  const name = input.name.trim();
  const lname = name.toLowerCase();
  const existing = list.find(
    (c) => c.imageUrl === input.imageUrl || c.name.toLowerCase() === lname,
  );
  if (existing) {
    existing.name = name;
    existing.imageUrl = input.imageUrl;
  } else {
    list.push({
      id: crypto.randomUUID(),
      name,
      imageUrl: input.imageUrl,
      createdAt: new Date().toISOString(),
    });
  }
  await writeList(PREFIX.characters, list);
  return list;
}

export async function upsertLocation(
  input: { label: string; imageUrl: string },
): Promise<SavedLocation[]> {
  const list = await readLatestList<SavedLocation>(PREFIX.locations);
  const label = input.label.trim() || "Untitled location";
  const existing = list.find((l) => l.imageUrl === input.imageUrl);
  if (existing) {
    existing.label = label;
    existing.imageUrl = input.imageUrl;
  } else {
    list.push({
      id: crypto.randomUUID(),
      label,
      imageUrl: input.imageUrl,
      createdAt: new Date().toISOString(),
    });
  }
  await writeList(PREFIX.locations, list);
  return list;
}

export async function addScene(
  input: { label?: string; mode: "A" | "B" | "C"; conceptInput: string },
): Promise<SavedScene[]> {
  const list = await readLatestList<SavedScene>(PREFIX.scenes);
  const conceptInput = input.conceptInput.trim();
  if (!conceptInput) return list;
  // Dedupe by exact conceptInput match (in same mode).
  const exists = list.some(
    (s) => s.mode === input.mode && s.conceptInput === conceptInput,
  );
  if (!exists) {
    const label =
      input.label?.trim() ||
      conceptInput.split(/\s+/).slice(0, 8).join(" ").slice(0, 80);
    list.push({
      id: crypto.randomUUID(),
      label,
      mode: input.mode,
      conceptInput,
      createdAt: new Date().toISOString(),
    });
    await writeList(PREFIX.scenes, list);
  }
  return list;
}

export async function removeFromLibrary(
  type: LibraryType,
  id: string,
): Promise<void> {
  const prefix = PREFIX[type];
  if (type === "characters") {
    const items = await readLatestList<SavedCharacter>(prefix);
    await writeList(prefix, items.filter((x) => x.id !== id));
  } else if (type === "locations") {
    const items = await readLatestList<SavedLocation>(prefix);
    await writeList(prefix, items.filter((x) => x.id !== id));
  } else {
    const items = await readLatestList<SavedScene>(prefix);
    await writeList(prefix, items.filter((x) => x.id !== id));
  }
}
