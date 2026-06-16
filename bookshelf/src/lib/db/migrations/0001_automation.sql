CREATE TABLE "automation_book_selections" (
	"config_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "automation_book_selections_config_id_book_id_pk" PRIMARY KEY("config_id","book_id")
);
--> statement-breakpoint
CREATE TABLE "automation_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"post_bridge_account_id" integer NOT NULL,
	"username" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"intervals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"book_pointer" integer DEFAULT 0 NOT NULL,
	"music_pointer" integer DEFAULT 0 NOT NULL,
	"last_posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_music_selections" (
	"config_id" uuid NOT NULL,
	"music_clip_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "automation_music_selections_config_id_music_clip_id_pk" PRIMARY KEY("config_id","music_clip_id")
);
--> statement-breakpoint
ALTER TABLE "automation_book_selections" ADD CONSTRAINT "automation_book_selections_config_id_automation_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."automation_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_book_selections" ADD CONSTRAINT "automation_book_selections_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_configs" ADD CONSTRAINT "automation_configs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_music_selections" ADD CONSTRAINT "automation_music_selections_config_id_automation_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."automation_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_music_selections" ADD CONSTRAINT "automation_music_selections_music_clip_id_music_clips_id_fk" FOREIGN KEY ("music_clip_id") REFERENCES "public"."music_clips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_owner_idx" ON "automation_configs" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "automation_enabled_idx" ON "automation_configs" USING btree ("enabled");