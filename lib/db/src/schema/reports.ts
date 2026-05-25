import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reportsTable = pgTable("reports", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  summary: text("summary").notNull(),
  severity: text("severity").notNull().default("informational"),
  iocs: text("iocs").array().notNull().default([]),
  recommendations: text("recommendations").array().notNull().default([]),
  attackVector: text("attack_vector"),
  affectedSystems: text("affected_systems").array().notNull().default([]),
  rawAiResponse: text("raw_ai_response").notNull(),
  n8nExecutionId: text("n8n_execution_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReportSchema = createInsertSchema(reportsTable).omit({ id: true, createdAt: true });
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reportsTable.$inferSelect;
