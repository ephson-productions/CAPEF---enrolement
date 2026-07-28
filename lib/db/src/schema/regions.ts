import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const regionsTable = pgTable("regions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const insertRegionSchema = createInsertSchema(regionsTable).omit({ id: true });
export type InsertRegion = z.infer<typeof insertRegionSchema>;
export type Region = typeof regionsTable.$inferSelect;
