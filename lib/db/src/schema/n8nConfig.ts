import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const n8nConfigTable = pgTable("n8n_config", {
  id: serial("id").primaryKey(),
  webhookUrl: text("webhook_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertN8nConfigSchema = createInsertSchema(n8nConfigTable).omit({ id: true, updatedAt: true });
export type InsertN8nConfig = z.infer<typeof insertN8nConfigSchema>;
export type N8nConfig = typeof n8nConfigTable.$inferSelect;
