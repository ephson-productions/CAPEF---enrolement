CREATE TABLE IF NOT EXISTS "regions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "regions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"region_id" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "arrondissements" (
	"id" serial PRIMARY KEY NOT NULL,
	"department_id" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'agent' NOT NULL,
	"region_id" integer,
	"cni_number" text,
	"cni_photo_url" text,
	"assigned_zones" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_line_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" integer NOT NULL,
	"parcelle_group_id" text,
	"crop_category" text,
	"crop_name" text,
	"culture_type" text,
	"superficie_ha" double precision,
	"production_quantity" double precision,
	"production_unit" text,
	"production_fcfa" double precision,
	"is_principal_crop" boolean DEFAULT true,
	"parent_line_item_id" integer,
	"species" text,
	"cheptel_size" integer,
	"food_type" text,
	"products" jsonb,
	"species_peche" text,
	"sub_category" text,
	"essence" text,
	"plantation_type" text,
	"artisanat_products" text,
	"raw_materials" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "member_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"activity_type" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"region_id" integer,
	"department_id" integer,
	"arrondissement_id" integer,
	"village" text,
	"maillons" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "members" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_number" text NOT NULL,
	"member_type" text NOT NULL,
	"category" text NOT NULL,
	"individual_or_org" text DEFAULT 'individuel' NOT NULL,
	"region_id" integer,
	"department_id" integer,
	"arrondissement_id" integer,
	"village" text,
	"gps_lat" double precision,
	"gps_lng" double precision,
	"created_by_id" integer NOT NULL,
	"physique_data" jsonb,
	"morale_data" jsonb,
	"category_data" jsonb,
	"badge_url" text,
	"status" text DEFAULT 'incomplet' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_member_number_unique" UNIQUE("member_number")
);
