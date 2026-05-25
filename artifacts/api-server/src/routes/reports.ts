import { Router } from "express";
import { db } from "@workspace/db";
import { reportsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { GetReportParams, DeleteReportParams } from "@workspace/api-zod";

export const reportsRouter = Router();

function serializeReport(r: typeof reportsTable.$inferSelect) {
  return {
    id: r.id,
    sessionId: r.sessionId,
    summary: r.summary,
    severity: r.severity,
    iocs: r.iocs,
    recommendations: r.recommendations,
    attackVector: r.attackVector ?? null,
    affectedSystems: r.affectedSystems,
    mitreAttackTechniques: r.mitreAttackTechniques ?? [],
    rawAiResponse: r.rawAiResponse,
    n8nExecutionId: r.n8nExecutionId ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

reportsRouter.get("/reports", async (req, res): Promise<void> => {
  const reports = await db
    .select()
    .from(reportsTable)
    .orderBy(sql`${reportsTable.createdAt} desc`);
  res.json(reports.map(serializeReport));
});

reportsRouter.get("/reports/:id", async (req, res): Promise<void> => {
  const parsed = GetReportParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [report] = await db
    .select()
    .from(reportsTable)
    .where(eq(reportsTable.id, parsed.data.id));

  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  res.json(serializeReport(report));
});

reportsRouter.delete("/reports/:id", async (req, res): Promise<void> => {
  const parsed = DeleteReportParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(reportsTable).where(eq(reportsTable.id, parsed.data.id));
  res.status(204).send();
});
