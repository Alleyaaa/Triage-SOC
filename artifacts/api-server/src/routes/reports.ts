import { Router } from "express";
import { db } from "@workspace/db";
import { reportsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { GetReportParams, DeleteReportParams } from "@workspace/api-zod";

export const reportsRouter = Router();

reportsRouter.get("/reports", async (req, res): Promise<void> => {
  const reports = await db
    .select()
    .from(reportsTable)
    .orderBy(sql`${reportsTable.createdAt} desc`);

  res.json(
    reports.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      summary: r.summary,
      severity: r.severity,
      iocs: r.iocs,
      recommendations: r.recommendations,
      attackVector: r.attackVector ?? null,
      affectedSystems: r.affectedSystems,
      rawAiResponse: r.rawAiResponse,
      n8nExecutionId: r.n8nExecutionId ?? null,
      createdAt: r.createdAt.toISOString(),
    }))
  );
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

  res.json({
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
  });
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
