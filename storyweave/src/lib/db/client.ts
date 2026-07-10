import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config';
import * as schema from './schema';

declare global {
  var __storyweave_pg: ReturnType<typeof postgres> | undefined;
  var __storyweave_db: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

function getClient() {
  if (!global.__storyweave_pg) {
    global.__storyweave_pg = postgres(env().DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 30,
      prepare: false,
    });
  }
  return global.__storyweave_pg;
}

// Lazy proxy: nothing connects until the first query, so `next build`
// can import this module without DATABASE_URL set.
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_, prop, receiver) {
    if (!global.__storyweave_db) {
      global.__storyweave_db = drizzle(getClient(), { schema, casing: 'snake_case' });
    }
    return Reflect.get(global.__storyweave_db, prop, receiver);
  },
});

export { schema };
