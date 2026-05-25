import { Router } from "express";
import { db } from "@workspace/db";
import { logEntriesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  GetSessionLogsParams,
  AddLogToSessionParams,
  AddLogToSessionBody,
  RemoveLogFromSessionParams,
} from "@workspace/api-zod";
import { parseLogEntry } from "../lib/log-parser";
import type { LogSource } from "../lib/log-parser";

export const logsRouter = Router();

function serializeLog(l: typeof logEntriesTable.$inferSelect) {
  return {
    id: l.id,
    sessionId: l.sessionId,
    source: l.source,
    rawJson: l.rawJson,
    extractedIp: l.extractedIp ?? null,
    dstIp: l.dstIp ?? null,
    dstPort: l.dstPort ?? null,
    protocol: l.protocol ?? null,
    actionTaken: l.actionTaken ?? null,
    logTimestamp: l.logTimestamp ?? null,
    ipType: l.ipType ?? null,
    masked: l.masked,
    createdAt: l.createdAt.toISOString(),
  };
}

logsRouter.get("/sessions/:id/logs", async (req, res): Promise<void> => {
  const parsed = GetSessionLogsParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }
  const logs = await db
    .select()
    .from(logEntriesTable)
    .where(eq(logEntriesTable.sessionId, parsed.data.id));

  res.json(logs.map(serializeLog));
});

logsRouter.post("/sessions/:id/logs", async (req, res): Promise<void> => {
  const paramsParsed = AddLogToSessionParams.safeParse({ id: Number(req.params.id) });
  const bodyParsed = AddLogToSessionBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const meta = parseLogEntry(bodyParsed.data.rawJson, bodyParsed.data.source as LogSource);

  const [log] = await db
    .insert(logEntriesTable)
    .values({
      sessionId: paramsParsed.data.id,
      source: meta.detectedSource,
      rawJson: bodyParsed.data.rawJson,
      extractedIp: meta.extractedIp,
      dstIp: meta.dstIp,
      dstPort: meta.dstPort,
      protocol: meta.protocol,
      actionTaken: meta.actionTaken,
      logTimestamp: meta.logTimestamp,
      ipType: meta.ipType,
      masked: false,
    })
    .returning();

  res.status(201).json(serializeLog(log));
});

logsRouter.delete("/sessions/:id/logs/:logId", async (req, res): Promise<void> => {
  const parsed = RemoveLogFromSessionParams.safeParse({
    id: Number(req.params.id),
    logId: Number(req.params.logId),
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  await db
    .delete(logEntriesTable)
    .where(
      and(
        eq(logEntriesTable.id, parsed.data.logId),
        eq(logEntriesTable.sessionId, parsed.data.id)
      )
    );
  res.status(204).send();
});
