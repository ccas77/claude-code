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

function get() {
  if (globalThis.__contentEngineDb && globalThis.__contentEngineSql) {
    return { db: globalThis.__contentEngineDb, sql: globalThis.__contentEngineSql };
  }
  const built = build();
  if (process.env.NODE_ENV !== "production") {
    globalThis.__contentEngineDb = built.db;
    globalThis.__contentEngineSql = built.sql;
  }
  return built;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return Reflect.get(get().db, prop);
  },
});

export { schema };
