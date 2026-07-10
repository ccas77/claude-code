import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { assertUserCanPost, submitPost, AllowlistDenied } from "@/services/posting";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData.user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  let body: {
    workspaceId?: string;
    socialAccountId?: string;
    mediaUrl?: string;
    caption?: string;
    idempotencyKey?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { workspaceId, socialAccountId, mediaUrl, caption } = body;
  if (!workspaceId || !socialAccountId || !mediaUrl) {
    return NextResponse.json(
      { error: "workspaceId, socialAccountId, and mediaUrl are required" },
      { status: 400 },
    );
  }

  try {
    await assertUserCanPost(authData.user.id, socialAccountId);
  } catch (err) {
    if (err instanceof AllowlistDenied) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  try {
    const result = await submitPost({
      workspaceId,
      actorUserId: authData.user.id,
      socialAccountId,
      mediaUrls: [mediaUrl],
      caption: caption ?? "",
      idempotencyKey: body.idempotencyKey ?? randomUUID(),
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
