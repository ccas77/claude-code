import { inngest } from "../client";
import { ingestFromFacebookLibrary, type FacebookLibraryItem } from "../../src/services/assets";

interface EventData {
  workspaceId: string;
  actorUserId?: string | null;
  items: FacebookLibraryItem[];
}

export const facebookLibraryIngest = inngest.createFunction(
  {
    id: "facebook-library-ingest",
    triggers: [{ event: "content-engine/assets.facebook-library.ingest" }],
  },
  async ({ event, step }) => {
    const data = event.data as EventData;
    if (!data.workspaceId || !Array.isArray(data.items)) {
      throw new Error("workspaceId and items[] required");
    }

    const result = await step.run("insert-asset-rows", () =>
      ingestFromFacebookLibrary({
        workspaceId: data.workspaceId,
        actorUserId: data.actorUserId ?? null,
        items: data.items,
      }),
    );

    for (const assetId of result.ids) {
      await step.sendEvent(`ocr-${assetId}`, {
        name: "content-engine/asset.ocr-requested",
        data: { assetId },
      });
    }

    return { inserted: result.inserted, ocrRequested: result.ids.length };
  },
);
