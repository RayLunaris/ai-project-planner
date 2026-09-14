CREATE TYPE "public"."sync_mode" AS ENUM('basic', 'full');--> statement-breakpoint
CREATE TABLE "codebase_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codebase_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"summary" text,
	"code_snippet" text,
	"language" text
);
--> statement-breakpoint
CREATE TABLE "codebases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"root_path" text NOT NULL,
	"framework" text,
	"sync_mode" "sync_mode" DEFAULT 'basic',
	"last_synced_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "personal_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"label" text,
	"created_at" timestamp DEFAULT now(),
	"last_used_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "codebase_files" ADD CONSTRAINT "codebase_files_codebase_id_codebases_id_fk" FOREIGN KEY ("codebase_id") REFERENCES "public"."codebases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codebases" ADD CONSTRAINT "codebases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_access_tokens" ADD CONSTRAINT "personal_access_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;