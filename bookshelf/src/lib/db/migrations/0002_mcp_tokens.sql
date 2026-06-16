CREATE TABLE "mcp_tokens" (
	"provider" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_enc" text,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text,
	"expires_at" timestamp with time zone,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
