ALTER TABLE "members" ADD COLUMN "badge_token" text;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_badge_token_unique" UNIQUE("badge_token");