import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

declare global {
  var __contentEngineDb: ReturnType<typeof drizzle> | undefined;
  var __contentEngineSql: ReturnType<typeof postgres> | undefined;
}

function build() {
  const sql = postgres(env().DATABASE_URL, { prepare: false });
  return { sql, db: drizzle(sql, { schema }) };
}

const cached =
  globalThis.__contentEngineDb && globalThis.__contentEngineSql
    ? { db: globalThis.__contentEngineDb, sql: globalThis.__contentEngineSql }
    : build();

if (process.env.NODE_ENV !== "production") {
  globalThis.__contentEngineDb = cached.db;
  globalThis.__contentEngineSql = cached.sql;
}

export const db = cached.db;
export { schema };
