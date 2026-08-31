CREATE SEQUENCE "public"."seq_member_number" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "processed_operations" (
	"client_operation_id" uuid PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"operation_type" text NOT NULL,
	"resource_id" integer,
	"result_payload" jsonb,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_photo_url" text;--> statement-breakpoint
ALTER TABLE "processed_operations" ADD CONSTRAINT "processed_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_line_items" ADD CONSTRAINT "activity_line_items_activity_id_member_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."member_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_activities" ADD CONSTRAINT "member_activities_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_activities" ADD CONSTRAINT "member_activities_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_activities" ADD CONSTRAINT "member_activities_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_activities" ADD CONSTRAINT "member_activities_arrondissement_id_arrondissements_id_fk" FOREIGN KEY ("arrondissement_id") REFERENCES "public"."arrondissements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_arrondissement_id_arrondissements_id_fk" FOREIGN KEY ("arrondissement_id") REFERENCES "public"."arrondissements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activity_line_items_activity_id" ON "activity_line_items" USING btree ("activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_single_primary_activity" ON "member_activities" USING btree ("member_id") WHERE is_primary = true;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_member_activity_type" ON "member_activities" USING btree ("member_id","activity_type");--> statement-breakpoint
CREATE INDEX "idx_member_activities_member_id" ON "member_activities" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_members_created_by" ON "members" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "idx_members_region" ON "members" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "idx_members_badge_token" ON "members" USING btree ("badge_token");