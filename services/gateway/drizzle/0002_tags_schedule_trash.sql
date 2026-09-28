ALTER TABLE "links" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "links_tags_idx" ON "links" USING gin ("tags");