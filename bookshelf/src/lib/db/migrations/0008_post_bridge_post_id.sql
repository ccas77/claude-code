ALTER TABLE "cards" ADD COLUMN "post_bridge_post_id" text;
--> statement-breakpoint
-- Stale URLs were attached by the previous "first successful Post Bridge
-- result wins" logic, which routinely matched OTHER apps' posts since the
-- shared key has no workspace isolation. Clearing them so refreshStats can
-- repopulate them correctly using post_id once that column has data.
UPDATE "cards" SET "post_url" = NULL;
