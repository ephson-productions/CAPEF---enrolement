CREATE SEQUENCE IF NOT EXISTS "public"."seq_member_number" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "processed_operations" (
	"client_operation_id" uuid PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"operation_type" text NOT NULL,
	"resource_id" integer,
	"result_payload" jsonb,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_photo_url" text;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'regions_pkey') THEN
    ALTER TABLE "regions" ADD PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_pkey') THEN
    ALTER TABLE "departments" ADD PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arrondissements_pkey') THEN
    ALTER TABLE "arrondissements" ADD PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_pkey') THEN
    ALTER TABLE "users" ADD PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'members_pkey') THEN
    ALTER TABLE "members" ADD PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_activities_pkey') THEN
    ALTER TABLE "member_activities" ADD PRIMARY KEY ("id");
  END IF;
END $$;--> statement-breakpoint
UPDATE "users" SET "region_id" = NULL WHERE "region_id" IS NOT NULL AND ("region_id" = 0 OR "region_id" NOT IN (SELECT "id" FROM "regions"));--> statement-breakpoint
UPDATE "member_activities" SET "region_id" = NULL WHERE "region_id" IS NOT NULL AND ("region_id" = 0 OR "region_id" NOT IN (SELECT "id" FROM "regions"));--> statement-breakpoint
UPDATE "member_activities" SET "department_id" = NULL WHERE "department_id" IS NOT NULL AND ("department_id" = 0 OR "department_id" NOT IN (SELECT "id" FROM "departments"));--> statement-breakpoint
UPDATE "member_activities" SET "arrondissement_id" = NULL WHERE "arrondissement_id" IS NOT NULL AND ("arrondissement_id" = 0 OR "arrondissement_id" NOT IN (SELECT "id" FROM "arrondissements"));--> statement-breakpoint
UPDATE "members" SET "region_id" = NULL WHERE "region_id" IS NOT NULL AND ("region_id" = 0 OR "region_id" NOT IN (SELECT "id" FROM "regions"));--> statement-breakpoint
UPDATE "members" SET "department_id" = NULL WHERE "department_id" IS NOT NULL AND ("department_id" = 0 OR "department_id" NOT IN (SELECT "id" FROM "departments"));--> statement-breakpoint
UPDATE "members" SET "arrondissement_id" = NULL WHERE "arrondissement_id" IS NOT NULL AND ("arrondissement_id" = 0 OR "arrondissement_id" NOT IN (SELECT "id" FROM "arrondissements"));--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'processed_operations_user_id_users_id_fk') THEN
    ALTER TABLE "processed_operations" ADD CONSTRAINT "processed_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_region_id_regions_id_fk') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_line_items_activity_id_member_activities_id_fk') THEN
    ALTER TABLE "activity_line_items" ADD CONSTRAINT "activity_line_items_activity_id_member_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."member_activities"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_activities_member_id_members_id_fk') THEN
    ALTER TABLE "member_activities" ADD CONSTRAINT "member_activities_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_activities_region_id_regions_id_fk') THEN
    ALTER TABLE "member_activities" ADD CONSTRAINT "member_activities_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_activities_department_id_departments_id_fk') THEN
    ALTER TABLE "member_activities" ADD CONSTRAINT "member_activities_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_activities_arrondissement_id_arrondissements_id_fk') THEN
    ALTER TABLE "member_activities" ADD CONSTRAINT "member_activities_arrondissement_id_arrondissements_id_fk" FOREIGN KEY ("arrondissement_id") REFERENCES "public"."arrondissements"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'members_region_id_regions_id_fk') THEN
    ALTER TABLE "members" ADD CONSTRAINT "members_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'members_department_id_departments_id_fk') THEN
    ALTER TABLE "members" ADD CONSTRAINT "members_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'members_arrondissement_id_arrondissements_id_fk') THEN
    ALTER TABLE "members" ADD CONSTRAINT "members_arrondissement_id_arrondissements_id_fk" FOREIGN KEY ("arrondissement_id") REFERENCES "public"."arrondissements"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'members_created_by_id_users_id_fk') THEN
    ALTER TABLE "members" ADD CONSTRAINT "members_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DELETE FROM "member_activities"
WHERE id NOT IN (
  SELECT MIN(id)
  FROM "member_activities"
  GROUP BY member_id, activity_type
);--> statement-breakpoint
UPDATE "member_activities"
SET is_primary = false
WHERE is_primary = true AND id NOT IN (
  SELECT MIN(id)
  FROM "member_activities"
  WHERE is_primary = true
  GROUP BY member_id
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_line_items_activity_id" ON "activity_line_items" USING btree ("activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_single_primary_activity" ON "member_activities" USING btree ("member_id") WHERE is_primary = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_member_activity_type" ON "member_activities" USING btree ("member_id","activity_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_member_activities_member_id" ON "member_activities" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_members_created_by" ON "members" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_members_region" ON "members" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_members_badge_token" ON "members" USING btree ("badge_token");