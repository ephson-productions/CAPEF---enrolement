import { pgTable, serial, text, integer, doublePrecision, jsonb, timestamp, boolean, uuid, pgSequence, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { regionsTable } from "./regions";
import { departmentsTable } from "./departments";
import { arrondissementsTable } from "./arrondissements";

export const seqMemberNumber = pgSequence("seq_member_number", { startWith: 1, increment: 1 });

export const membersTable = pgTable("members", {
  id: serial("id").primaryKey(),
  memberNumber: text("member_number").notNull().unique(),
  memberType: text("member_type").notNull(), // physique | morale
  category: text("category").notNull(), // agriculteur | pecheur | eleveur | forestier | artisan
  version: integer("version").default(1).notNull(),
  individualOrOrg: text("individual_or_org").notNull().default("individuel"), // individuel | organisation
  regionId: integer("region_id").references(() => regionsTable.id, { onDelete: "restrict" }),
  departmentId: integer("department_id").references(() => departmentsTable.id, { onDelete: "restrict" }),
  arrondissementId: integer("arrondissement_id").references(() => arrondissementsTable.id, { onDelete: "restrict" }),
  village: text("village"),
  gpsLat: doublePrecision("gps_lat"),
  gpsLng: doublePrecision("gps_lng"),
  createdById: integer("created_by_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  physiqueData: jsonb("physique_data"),
  moraleData: jsonb("morale_data"),
  categoryData: jsonb("category_data"),
  badgeUrl: text("badge_url"),
  badgeToken: text("badge_token").unique(),
  status: text("status").notNull().default("incomplet"), // incomplet | en_attente | valide | desactive | bloque
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  idxMembersCreatedBy: index("idx_members_created_by").on(table.createdById),
  idxMembersRegion: index("idx_members_region").on(table.regionId),
  idxMembersBadgeToken: index("idx_members_badge_token").on(table.badgeToken),
}));

export const memberActivitiesTable = pgTable("member_activities", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  activityType: text("activity_type").notNull(), // agriculteur | pecheur | eleveur | forestier | artisan
  version: integer("version").default(1).notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  regionId: integer("region_id").references(() => regionsTable.id, { onDelete: "restrict" }),
  departmentId: integer("department_id").references(() => departmentsTable.id, { onDelete: "restrict" }),
  arrondissementId: integer("arrondissement_id").references(() => arrondissementsTable.id, { onDelete: "restrict" }),
  village: text("village"),
  maillons: jsonb("maillons").default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  idxSinglePrimaryActivity: uniqueIndex("idx_single_primary_activity").on(table.memberId).where(sql`is_primary = true`),
  uniqueMemberActivityType: uniqueIndex("unique_member_activity_type").on(table.memberId, table.activityType),
  idxMemberActivitiesMemberId: index("idx_member_activities_member_id").on(table.memberId),
}));

export const activityLineItemsTable = pgTable("activity_line_items", {
  id: serial("id").primaryKey(),
  activityId: integer("activity_id").notNull().references(() => memberActivitiesTable.id, { onDelete: "cascade" }),
  version: integer("version").default(1).notNull(),
  parcelleGroupId: text("parcelle_group_id"),
  cropCategory: text("crop_category"),
  cropName: text("crop_name"),
  cultureType: text("culture_type"),
  superficieHa: doublePrecision("superficie_ha"),
  productionQuantity: doublePrecision("production_quantity"),
  productionUnit: text("production_unit"),
  productionFcfa: doublePrecision("production_fcfa"),
  isPrincipalCrop: boolean("is_principal_crop").default(true),
  parentLineItemId: integer("parent_line_item_id"),

  species: text("species"),
  cheptelSize: integer("cheptel_size"),
  foodType: text("food_type"),
  products: jsonb("products"),

  speciesPêche: text("species_peche"),

  subCategory: text("sub_category"),
  essence: text("essence"),
  plantationType: text("plantation_type"),

  artisanatProducts: text("artisanat_products"),
  rawMaterials: text("raw_materials"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  idxActivityLineItemsActivityId: index("idx_activity_line_items_activity_id").on(table.activityId),
}));

export const insertMemberSchema = createInsertSchema(membersTable).omit({
  id: true,
  memberNumber: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof membersTable.$inferSelect;

export const insertMemberActivitySchema = createInsertSchema(memberActivitiesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMemberActivity = z.infer<typeof insertMemberActivitySchema>;
export type MemberActivity = typeof memberActivitiesTable.$inferSelect;

export const insertActivityLineItemSchema = createInsertSchema(activityLineItemsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertActivityLineItem = z.infer<typeof insertActivityLineItemSchema>;
export type ActivityLineItem = typeof activityLineItemsTable.$inferSelect;

export const processedOperationsTable = pgTable("processed_operations", {
  userId: integer("user_id").notNull().references(() => usersTable.id),
  clientOperationId: uuid("client_operation_id").notNull(),
  operationType: text("operation_type").notNull(),
  resourceId: integer("resource_id"),
  payloadHash: text("payload_hash"),
  resultPayload: jsonb("result_payload"),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.clientOperationId] }),
  idxProcessedOpsUserClientOp: uniqueIndex("idx_processed_ops_user_client_op").on(table.userId, table.clientOperationId),
}));

export const insertProcessedOperationSchema = createInsertSchema(processedOperationsTable);
export type InsertProcessedOperation = z.infer<typeof insertProcessedOperationSchema>;
export type ProcessedOperation = typeof processedOperationsTable.$inferSelect;
