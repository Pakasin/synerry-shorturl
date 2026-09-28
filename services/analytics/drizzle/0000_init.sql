CREATE TABLE "clicks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"link_id" integer NOT NULL,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_hash" varchar(64),
	"user_agent" text,
	"referer" text,
	"device_type" varchar(20),
	"browser" varchar(50),
	"os" varchar(50)
);
--> statement-breakpoint
CREATE INDEX "clicks_link_time_idx" ON "clicks" USING btree ("link_id","clicked_at");