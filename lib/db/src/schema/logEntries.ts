import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const logEntriesTable = pgTable("log_entries", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  source: text("source").notNull().default("unknown"),
  rawJson: text("raw_json").notNull(),
  extractedIp: text("extracted_ip"),
  dstIp: text("dst_ip"),
  dstPort: integer("dst_port"),
  protocol: text("protocol"),
  actionTaken: text("action_taken"),
  logTimestamp: text("log_timestamp"),
  ipType: text("ip_type"),
  masked: boolean("masked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLogEntrySchema = createInsertSchema(logEntriesTable).omit({ id: true, createdAt: true });
export type InsertLogEntry = z.infer<typeof insertLogEntrySchema>;
export type LogEntry = typeof logEntriesTable.$inferSelect;
