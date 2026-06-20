import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addScene,
  getLibrary,
  removeFromLibrary,
  upsertCharacter,
  upsertLocation,
  type LibraryType,
} from "@/lib/video-module/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

export async function GET() {
  const snapshot = await getLibrary();
  return NextResponse.json(snapshot, { headers: noStore });
}

const characterSchema = z.object({
  type: z.literal("characters"),
  item: z.object({
    name: z.string().min(1).max(40),
    imageUrl: z.string().url(),
  }),
});

const locationSchema = z.object({
  type: z.literal("locations"),
  item: z.object({
    label: z.string().max(60).optional().default(""),
    imageUrl: z.string().url(),
  }),
});

const sceneSchema = z.object({
  type: z.literal("scenes"),
  item: z.object({
    label: z.string().max(80).optional(),
    mode: z.enum(["A", "B", "C"]),
    conceptInput: z.string().min(1),
  }),
});

const bodySchema = z.discriminatedUnion("type", [
  characterSchema,
  locationSchema,
  sceneSchema,
]);

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.message },
      { status: 400, headers: noStore },
    );
  }
  const data = parsed.data;
  if (data.type === "characters") {
    const list = await upsertCharacter(data.item);
    return NextResponse.json({ characters: list }, { headers: noStore });
  }
  if (data.type === "locations") {
    const list = await upsertLocation({
      label: data.item.label ?? "",
      imageUrl: data.item.imageUrl,
    });
    return NextResponse.json({ locations: list }, { headers: noStore });
  }
  const list = await addScene(data.item);
  return NextResponse.json({ scenes: list }, { headers: noStore });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") as LibraryType | null;
  const id = url.searchParams.get("id");
  if (!type || !id || !["characters", "locations", "scenes"].includes(type)) {
    return NextResponse.json(
      { error: "type and id required" },
      { status: 400, headers: noStore },
    );
  }
  await removeFromLibrary(type, id);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
