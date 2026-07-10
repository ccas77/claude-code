import { eq } from "drizzle-orm";
import { inngest } from "../client";
import { db, schema } from "../../src/lib/db";

// DRY_RUN by design in M2. When we wire a real OCR provider in M3+, gate the
// live path on an env flag the way postbridgeDryRun() gates the posting client.
function ocrDryRun(): boolean {
  const flag = process.env.OCR_DRY_RUN;
  if (flag === "0" || flag === "false") return false;
  return true;
}

export const assetOcr = inngest.createFunction(
  { id: "asset-ocr", triggers: [{ event: "content-engine/asset.ocr-requested" }] },
  async ({ event, step }) => {
    const assetId = (event.data as { assetId?: string }).assetId;
    if (!assetId) throw new Error("assetId required");

    const dryRun = ocrDryRun();
    const status = dryRun ? "dry_run_completed" : "pending_live";
    const text = dryRun ? null : null;

    await step.run("update-asset-ocr", async () => {
      await db
        .update(schema.assets)
        .set({ ocrStatus: status, ocrText: text })
        .where(eq(schema.assets.id, assetId));
    });

    return { assetId, ocrStatus: status, dryRun };
  },
);
