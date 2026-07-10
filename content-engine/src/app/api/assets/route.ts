import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { assertMember } from "@/services/workspace/membership";
import {
  createAssetFromFile,
  createAssetFromUrl,
  type AssetKind,
} from "@/services/assets";

export const runtime = "nodejs";

const VALID_KINDS = new Set<AssetKind>(["image", "font", "audio", "video"]);

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData.user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const workspaceId = String(form.get("workspaceId") ?? "");
    const kindRaw = String(form.get("kind") ?? "image") as AssetKind;
    const file = form.get("file");
    if (!workspaceId || !VALID_KINDS.has(kindRaw) || !(file instanceof File)) {
      return NextResponse.json(
        { error: "workspaceId, kind, and a file field are required" },
        { status: 400 },
      );
    }
    const denied = await assertMember(authData.user.id, workspaceId);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });

    const bytes = await file.arrayBuffer();
    const { asset, dryRun } = await createAssetFromFile({
      workspaceId,
      uploadedBy: authData.user.id,
      kind: kindRaw,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes,
    });
    return NextResponse.json({ asset, dryRun });
  }

  let body: {
    workspaceId?: string;
    kind?: AssetKind;
    externalUrl?: string;
    mimeType?: string;
    sourcePlatform?: string;
    sourceUrl?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { workspaceId, kind, externalUrl } = body;
  if (!workspaceId || !kind || !VALID_KINDS.has(kind) || !externalUrl) {
    return NextResponse.json(
      { error: "workspaceId, kind, and externalUrl are required" },
      { status: 400 },
    );
  }
  const denied = await assertMember(authData.user.id, workspaceId);
  if (denied) return NextResponse.json({ error: denied }, { status: 403 });

  const asset = await createAssetFromUrl({
    workspaceId,
    uploadedBy: authData.user.id,
    kind,
    externalUrl,
    mimeType: body.mimeType,
    sourcePlatform: body.sourcePlatform,
    sourceUrl: body.sourceUrl,
  });
  return NextResponse.json({ asset, dryRun: false });
}
