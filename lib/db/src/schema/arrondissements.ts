import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const arrondissementsTable = pgTable("arrondissements", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull(),
  name: text("name").notNull(),
});

export const insertArrondissementSchema = createInsertSchema(arrondissementsTable).omit({ id: true });
export type InsertArrondissement = z.infer<typeof insertArrondissementSchema>;
export type Arrondissement = typeof arrondissementsTable.$inferSelect;
