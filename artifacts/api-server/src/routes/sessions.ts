import { Router } from "express";
import { db } from "@workspace/db";
import {
  sessionsTable,
  logEntriesTable,
  reportsTable,
} from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";
import {
  CreateSessionBody,
  UpdateSessionBody,
  UpdateSessionParams,
  GetSessionParams,
  DeleteSessionParams,
} from "@workspace/api-zod";

export const sessionsRouter = Router();

sessionsRouter.get("/sessions", async (req, res): Promise<void> => {
  const allSessions = await db.select().from(sessionsTable).orderBy(sql`${sessionsTable.createdAt} desc`);
  const logCounts = await db
    .select({ sessionId: logEntriesTable.sessionId, count: count() })
    .from(logEntriesTable)
    .groupBy(logEntriesTable.sessionId);
  const reportIds = await db.select({ sessionId: reportsTable.sessionId }).from(reportsTable);

  const logCountMap = new Map(logCounts.map((r) => [r.sessionId, Number(r.count)]));
  const reportSessionIds = new Set(reportIds.map((r) => r.sessionId));

  const result = allSessions.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description ?? null,
    status: s.status,
    logCount: logCountMap.get(s.id) ?? 0,
    hasReport: reportSessionIds.has(s.id),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));

  res.json(result);
});

sessionsRouter.post("/sessions", async (req, res): Promise<void> => {
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [session] = await db.insert(sessionsTable).values({
    title: parsed.data.title,
    description: parsed.data.description,
    status: "open",
  }).returning();

  res.status(201).json({
    id: session.id,
    title: session.title,
    description: session.description ?? null,
    status: session.status,
    logCount: 0,
    hasReport: false,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  });
});

sessionsRouter.get("/sessions/:id", async (req, res): Promise<void> => {
  const parsed = GetSessionParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, parsed.data.id));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const logs = await db.select().from(logEntriesTable).where(eq(logEntriesTable.sessionId, session.id)).orderBy(sql`${logEntriesTable.createdAt} asc`);
  const [report] = await db.select().from(reportsTable).where(eq(reportsTable.sessionId, session.id));

  res.json({
    id: session.id,
    title: session.title,
    description: session.description ?? null,
    status: session.status,
    logs: logs.map((l) => ({
      id: l.id,
      sessionId: l.sessionId,
      source: l.source,
      rawJson: l.rawJson,
      extractedIp: l.extractedIp ?? null,
      masked: l.masked,
      createdAt: l.createdAt.toISOString(),
    })),
    report: report
      ? {
          id: report.id,
          sessionId: report.sessionId,
          summary: report.summary,
          severity: report.severity,
          iocs: report.iocs,
          recommendations: report.recommendations,
          attackVector: report.attackVector ?? null,
          affectedSystems: report.affectedSystems,
          rawAiResponse: report.rawAiResponse,
          n8nExecutionId: report.n8nExecutionId ?? null,
          createdAt: report.createdAt.toISOString(),
        }
      : undefined,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  });
});

sessionsRouter.patch("/sessions/:id", async (req, res): Promise<void> => {
  const paramsParsed = UpdateSessionParams.safeParse({ id: Number(req.params.id) });
  const bodyParsed = UpdateSessionBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const [session] = await db
    .update(sessionsTable)
    .set({
      ...(bodyParsed.data.title && { title: bodyParsed.data.title }),
      ...(bodyParsed.data.description !== undefined && { description: bodyParsed.data.description }),
      ...(bodyParsed.data.status && { status: bodyParsed.data.status }),
    })
    .where(eq(sessionsTable.id, paramsParsed.data.id))
    .returning();

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const [logCount] = await db
    .select({ count: count() })
    .from(logEntriesTable)
    .where(eq(logEntriesTable.sessionId, session.id));
  const [report] = await db.select({ id: reportsTable.id }).from(reportsTable).where(eq(reportsTable.sessionId, session.id));

  res.json({
    id: session.id,
    title: session.title,
    description: session.description ?? null,
    status: session.status,
    logCount: Number(logCount?.count ?? 0),
    hasReport: !!report,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  });
});

sessionsRouter.delete("/sessions/:id", async (req, res): Promise<void> => {
  const parsed = DeleteSessionParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(logEntriesTable).where(eq(logEntriesTable.sessionId, parsed.data.id));
  await db.delete(reportsTable).where(eq(reportsTable.sessionId, parsed.data.id));
  await db.delete(sessionsTable).where(eq(sessionsTable.id, parsed.data.id));
  res.status(204).send();
});
