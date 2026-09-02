ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "badge_token" text;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'members_badge_token_unique') THEN
    ALTER TABLE "members" ADD CONSTRAINT "members_badge_token_unique" UNIQUE("badge_token");
  END IF;
END $$;