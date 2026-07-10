CREATE TYPE "public"."post_status" AS ENUM('dry_run', 'submitted', 'verified', 'unverified', 'failed');--> statement-breakpoint
CREATE TYPE "public"."social_platform" AS ENUM('tiktok', 'instagram', 'facebook', 'pinterest');--> statement-breakpoint
CREATE TABLE "post_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"social_account_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"caption" text,
	"media_urls" jsonb NOT NULL,
	"dry_run" boolean DEFAULT false NOT NULL,
	"pb_post_id" text,
	"status" "post_status" NOT NULL,
	"request_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"verification" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "social_account_allowlist" (
	"social_account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_account_allowlist_social_account_id_user_id_pk" PRIMARY KEY("social_account_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"platform" "social_platform" NOT NULL,
	"pb_account_id" text NOT NULL,
	"handle" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_aigc" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_log" ADD CONSTRAINT "post_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_log" ADD CONSTRAINT "post_log_actor_user_id_profiles_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_log" ADD CONSTRAINT "post_log_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_account_allowlist" ADD CONSTRAINT "social_account_allowlist_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_account_allowlist" ADD CONSTRAINT "social_account_allowlist_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_log_workspace_idx" ON "post_log" USING btree ("workspace_id","submitted_at");--> statement-breakpoint
CREATE INDEX "post_log_account_idx" ON "post_log" USING btree ("social_account_id","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "post_log_workspace_idem_uidx" ON "post_log" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "social_account_allowlist_user_idx" ON "social_account_allowlist" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "social_accounts_workspace_idx" ON "social_accounts" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_accounts_workspace_pb_uidx" ON "social_accounts" USING btree ("workspace_id","pb_account_id");