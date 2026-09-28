CREATE TABLE "blocked_domains" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain" varchar(253) NOT NULL,
	"reason" varchar(300),
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_domains_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "lock_reason" varchar(300);--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "locked_by" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" varchar(10) DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "blocked_domains" ADD CONSTRAINT "blocked_domains_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;