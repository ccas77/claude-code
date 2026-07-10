import { db, schema } from "./index";
import type { NewEventLog } from "./schema";

export async function logEvent(input: Omit<NewEventLog, "id" | "createdAt">) {
  await db.insert(schema.eventLog).values(input);
}
