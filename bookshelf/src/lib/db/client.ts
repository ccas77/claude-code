import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config';
import * as schema from './schema';

declare global {
  var __bookshelf_pg: ReturnType<typeof postgres> | undefined;
  var __bookshelf_db: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

function getClient() {
  if (!global.__bookshelf_pg) {
    global.__bookshelf_pg = postgres(env().DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 30,
      prepare: false,
    });
  }
  return global.__bookshelf_pg;
}

// Lazy proxy: nothing connects until the first query, so `next build`
// can import this module without DATABASE_URL set.
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_, prop, receiver) {
    if (!global.__bookshelf_db) {
      global.__bookshelf_db = drizzle(getClient(), { schema });
    }
    return Reflect.get(global.__bookshelf_db, prop, receiver);
  },
});

export { schema };
