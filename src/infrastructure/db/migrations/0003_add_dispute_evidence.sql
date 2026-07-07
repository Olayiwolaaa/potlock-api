CREATE TYPE "public"."dispute_media_type" AS ENUM('IMAGE', 'VIDEO');
--> statement-breakpoint
CREATE TABLE "dispute_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"media_type" "dispute_media_type" NOT NULL,
	"media_url" text NOT NULL,
	"media_public_id" text NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "dispute_evidence_challenge_idx" ON "dispute_evidence" USING btree ("challenge_id");
