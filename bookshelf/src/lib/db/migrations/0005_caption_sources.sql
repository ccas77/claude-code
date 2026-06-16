ALTER TABLE "books" ADD COLUMN "description" text;
--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "review_dump" text;
--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "tropes" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "vibe_notes" text;
--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "genres" ADD COLUMN "default_hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "caption" text;
