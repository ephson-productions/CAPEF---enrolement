import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("agent"), // admin | supervisor | agent
  regionId: integer("region_id"), // preserved as legacy/fallback for scoping backward-compatibility
  cniNumber: text("cni_number"),
  cniPhotoUrl: text("cni_photo_url"),
  profilePhotoUrl: text("profile_photo_url"),
  status: text("status").notNull().default("active"), // active | suspended | banned
  assignedZones: jsonb("assigned_zones").default([]), // array of { regionId, departmentId?, arrondissementId? } - preserved for JIT offline/client compatibility
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// user_zone_assignments junction table as requested for multi-zone assignment
export const userZoneAssignmentsTable = pgTable("user_zone_assignments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  regionId: integer("region_id").notNull(),
  departmentId: integer("department_id"),      // nullable = toute la région
  arrondissementId: integer("arrondissement_id"), // nullable = tout le département
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type AppUser = typeof usersTable.$inferSelect;
