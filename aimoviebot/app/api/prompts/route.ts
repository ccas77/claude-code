import { NextResponse } from "next/server";
import { z } from "zod";
import {
  clearPromptOverride,
  getOverrides,
  invalidateCache,
  setPromptOverride,
} from "@/lib/video-module/custom-prompts";
import { DEFAULT_PROMPTS, PROMPT_DOCS, PROMPT_KEYS } from "@/lib/video-module/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

const keySchema = z.enum(PROMPT_KEYS as [string, ...string[]]);

export async function GET() {
  const overrides = await getOverrides();
  // Return defaults, docs, and active overrides so the editor can render
  // each prompt with a "Reset to default" affordance.
  return NextResponse.json(
    {
      defaults: DEFAULT_PROMPTS,
      overrides,
      docs: PROMPT_DOCS,
      keys: PROMPT_KEYS,
    },
    { headers: noStore },
  );
}

const bodySchema = z.object({
  key: keySchema,
  value: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.message },
      { status: 400, headers: noStore },
    );
  }
  const overrides = await setPromptOverride(
    parsed.data.key as never,
    parsed.data.value,
  );
  invalidateCache();
  return NextResponse.json({ overrides }, { headers: noStore });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const key = keySchema.safeParse(url.searchParams.get("key"));
  if (!key.success) {
    return NextResponse.json(
      { error: "valid key required" },
      { status: 400, headers: noStore },
    );
  }
  const overrides = await clearPromptOverride(key.data as never);
  invalidateCache();
  return NextResponse.json({ overrides }, { headers: noStore });
}
