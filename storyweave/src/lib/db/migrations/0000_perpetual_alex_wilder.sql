CREATE TYPE "public"."event_level" AS ENUM('info', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."story_status" AS ENUM('draft', 'scripting', 'casting', 'generating', 'rendering', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"reference_images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"story_id" uuid,
	"level" "event_level" DEFAULT 'info' NOT NULL,
	"stage" text NOT NULL,
	"message" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"narration" text NOT NULL,
	"image_prompt" text NOT NULL,
	"character_slugs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"shot" text DEFAULT 'medium' NOT NULL,
	"focus" text DEFAULT 'center' NOT NULL,
	"mood" text DEFAULT 'calm' NOT NULL,
	"image_url" text,
	"image_pathname" text,
	"audio_url" text,
	"audio_pathname" text,
	"audio_duration_seconds" real,
	"words" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"clip_url" text,
	"clip_pathname" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"premise" text NOT NULL,
	"style" text NOT NULL,
	"target_minutes" real DEFAULT 3 NOT NULL,
	"aspect" text DEFAULT '16:9' NOT NULL,
	"status" "story_status" DEFAULT 'draft' NOT NULL,
	"video_blob_url" text,
	"video_blob_pathname" text,
	"video_duration_seconds" real,
	"error_info" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "characters_story_idx" ON "characters" USING btree ("story_id");--> statement-breakpoint
CREATE UNIQUE INDEX "characters_story_slug_idx" ON "characters" USING btree ("story_id","slug");--> statement-breakpoint
CREATE INDEX "event_log_story_idx" ON "event_log" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "event_log_created_idx" ON "event_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "scenes_story_idx" ON "scenes" USING btree ("story_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scenes_story_idx_idx" ON "scenes" USING btree ("story_id","idx");--> statement-breakpoint
CREATE INDEX "stories_owner_idx" ON "stories" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "stories_status_idx" ON "stories" USING btree ("status");