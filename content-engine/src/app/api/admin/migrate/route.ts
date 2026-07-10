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
  try {
    const db = drizzle(sql);
    await migrate(db, {
      migrationsFolder: path.join(process.cwd(), "src/lib/db/migrations"),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const e = err as { message?: string; code?: string; severity?: string; detail?: string; hint?: string; where?: string; stack?: string };
    return NextResponse.json({
      ok: false,
      error: e.message ?? String(err),
      code: e.code,
      severity: e.severity,
      detail: e.detail,
      hint: e.hint,
      where: e.where,
      stack: e.stack,
    }, { status: 500 });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
