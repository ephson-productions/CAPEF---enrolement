import { pgTable, serial, text, integer, doublePrecision, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const membersTable = pgTable("members", {
  id: serial("id").primaryKey(),
  memberNumber: text("member_number").notNull().unique(),
  memberType: text("member_type").notNull(), // physique | morale
  category: text("category").notNull(), // agriculteur | pecheur | eleveur | forestier | artisan
  individualOrOrg: text("individual_or_org").notNull().default("individuel"), // individuel | organisation
  regionId: integer("region_id"),
  departmentId: integer("department_id"),
  arrondissementId: integer("arrondissement_id"),
  village: text("village"),
  gpsLat: doublePrecision("gps_lat"),
  gpsLng: doublePrecision("gps_lng"),
  createdById: integer("created_by_id").notNull(),
  // JSONB columns for flexible nested data
  physiqueData: jsonb("physique_data"),
  moraleData: jsonb("morale_data"),
  categoryData: jsonb("category_data"),
  badgeUrl: text("badge_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMemberSchema = createInsertSchema(membersTable).omit({
  id: true,
  memberNumber: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof membersTable.$inferSelect;
