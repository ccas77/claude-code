import { inngest } from "../client";

export const health = inngest.createFunction(
  { id: "health", triggers: [{ event: "content-engine/health" }] },
  async ({ event }) => {
    return { ok: true, receivedAt: new Date().toISOString(), data: event.data };
  },
);
