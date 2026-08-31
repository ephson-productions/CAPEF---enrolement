import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("agent"), // admin | supervisor | agent
  status: text("status").notNull().default("active"), // active | suspended | banned
  regionId: integer("region_id"),
  cniNumber: text("cni_number"),
  cniPhotoUrl: text("cni_photo_url"),
  profilePhotoUrl: text("profile_photo_url"),
  assignedZones: jsonb("assigned_zones").default([]), // array of { regionId, departmentId?, arrondissementId? }
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type AppUser = typeof usersTable.$inferSelect;
