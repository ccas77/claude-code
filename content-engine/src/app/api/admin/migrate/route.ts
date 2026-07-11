import { NextResponse, type NextRequest } from "next/server";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "node:path";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const token = process.env.MIGRATE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "migrate token not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }

  const sql = postgres(url, { max: 1, prepare: false });
  const steps: Record<string, unknown> = {};
  try {
    const [who] = await sql`select current_user as user, current_database() as db, version() as version`;
    steps.connection = who;
    try {
      await sql`create schema if not exists "drizzle"`;
      steps.createSchema = "ok";
    } catch (schemaErr) {
      const s = schemaErr as { message?: string; code?: string; detail?: string; severity?: string };
      steps.createSchema = { message: s.message, code: s.code, detail: s.detail, severity: s.severity };
      throw schemaErr;
    }
    const db = drizzle(sql);
    await migrate(db, {
      migrationsFolder: path.join(process.cwd(), "src/lib/db/migrations"),
    });
    return NextResponse.json({ ok: true, steps });
  } catch (err) {
    const e = err as { message?: string; code?: string; severity?: string; detail?: string; hint?: string; where?: string; stack?: string; cause?: unknown };
    const cause = e.cause as { message?: string; code?: string; detail?: string; severity?: string } | undefined;
    return NextResponse.json({
      ok: false,
      error: e.message ?? String(err),
      code: e.code,
      severity: e.severity,
      detail: e.detail,
      hint: e.hint,
      where: e.where,
      cause: cause ? { message: cause.message, code: cause.code, detail: cause.detail, severity: cause.severity } : undefined,
      steps,
    }, { status: 500 });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
