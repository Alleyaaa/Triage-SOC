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

export const logsRouter = Router();

function extractIpFromJson(rawJson: string, source: string): string | null {
  try {
    const obj = JSON.parse(rawJson);
    if (source === "fortigate" && obj?.data?.srcip) return String(obj.data.srcip);
    if ((source === "agent_windows" || source === "agent_linux") && obj?.agent?.ip) return String(obj.agent.ip);
    if (source === "watchguard" && obj?.data?.watchguard?.ip_address) return String(obj.data.watchguard.ip_address);
    // Try all fields as fallback
    if (obj?.data?.srcip) return String(obj.data.srcip);
    if (obj?.agent?.ip) return String(obj.agent.ip);
    if (obj?.data?.watchguard?.ip_address) return String(obj.data.watchguard.ip_address);
  } catch {
    // ignore parse errors
  }
  return null;
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

  res.json(
    logs.map((l) => ({
      id: l.id,
      sessionId: l.sessionId,
      source: l.source,
      rawJson: l.rawJson,
      extractedIp: l.extractedIp ?? null,
      masked: l.masked,
      createdAt: l.createdAt.toISOString(),
    }))
  );
});

logsRouter.post("/sessions/:id/logs", async (req, res): Promise<void> => {
  const paramsParsed = AddLogToSessionParams.safeParse({ id: Number(req.params.id) });
  const bodyParsed = AddLogToSessionBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const extractedIp = extractIpFromJson(bodyParsed.data.rawJson, bodyParsed.data.source);

  const [log] = await db
    .insert(logEntriesTable)
    .values({
      sessionId: paramsParsed.data.id,
      source: bodyParsed.data.source,
      rawJson: bodyParsed.data.rawJson,
      extractedIp,
      masked: false,
    })
    .returning();

  res.status(201).json({
    id: log.id,
    sessionId: log.sessionId,
    source: log.source,
    rawJson: log.rawJson,
    extractedIp: log.extractedIp ?? null,
    masked: log.masked,
    createdAt: log.createdAt.toISOString(),
  });
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
