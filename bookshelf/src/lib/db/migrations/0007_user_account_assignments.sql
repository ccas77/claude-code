CREATE TABLE "user_account_assignments" (
	"owner_id" uuid NOT NULL,
	"post_bridge_account_id" integer NOT NULL,
	CONSTRAINT "user_account_assignments_owner_id_post_bridge_account_id_pk" PRIMARY KEY("owner_id","post_bridge_account_id")
);
--> statement-breakpoint
ALTER TABLE "user_account_assignments" ADD CONSTRAINT "user_account_assignments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
