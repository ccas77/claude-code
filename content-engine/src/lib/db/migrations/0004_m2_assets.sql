CREATE TYPE "public"."asset_kind" AS ENUM('image', 'font', 'audio', 'video');--> statement-breakpoint
CREATE TYPE "public"."asset_visibility" AS ENUM('workspace', 'private');--> statement-breakpoint
CREATE TYPE "public"."asset_origin" AS ENUM('uploaded', 'generated', 'ingested');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"uploaded_by" uuid,
	"kind" "asset_kind" NOT NULL,
	"visibility" "asset_visibility" DEFAULT 'workspace' NOT NULL,
	"origin" "asset_origin" NOT NULL,
	"storage_path" text,
	"external_url" text,
	"mime_type" text,
	"width" text,
	"height" text,
	"ocr_text" text,
	"ocr_status" text,
	"source_platform" text,
	"source_url" text,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_kits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"palette" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"font_roles" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recipe_text" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_workspace_kind_idx" ON "assets" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE INDEX "assets_origin_idx" ON "assets" USING btree ("workspace_id","origin");--> statement-breakpoint
CREATE INDEX "assets_source_idx" ON "assets" USING btree ("workspace_id","source_platform");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_kits_workspace_name_uidx" ON "brand_kits" USING btree ("workspace_id","name");
