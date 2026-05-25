import { Router } from "express";
import { db } from "@workspace/db";
import { sessionsTable, logEntriesTable, reportsTable } from "@workspace/db";
import { count, eq, sql } from "drizzle-orm";

export const dashboardRouter = Router();

dashboardRouter.get("/dashboard/stats", async (req, res): Promise<void> => {
  const [totalSessionsRow] = await db.select({ count: count() }).from(sessionsTable);
  const [openSessionsRow] = await db
    .select({ count: count() })
    .from(sessionsTable)
    .where(eq(sessionsTable.status, "open"));
  const [analyzedSessionsRow] = await db
    .select({ count: count() })
    .from(sessionsTable)
    .where(eq(sessionsTable.status, "analyzed"));
  const [totalReportsRow] = await db.select({ count: count() }).from(reportsTable);
  const [totalLogsRow] = await db.select({ count: count() }).from(logEntriesTable);
  const [criticalRow] = await db
    .select({ count: count() })
    .from(reportsTable)
    .where(eq(reportsTable.severity, "critical"));
  const [highRow] = await db
    .select({ count: count() })
    .from(reportsTable)
    .where(eq(reportsTable.severity, "high"));

  res.json({
    totalSessions: Number(totalSessionsRow?.count ?? 0),
    openSessions: Number(openSessionsRow?.count ?? 0),
    analyzedSessions: Number(analyzedSessionsRow?.count ?? 0),
    totalReports: Number(totalReportsRow?.count ?? 0),
    totalLogs: Number(totalLogsRow?.count ?? 0),
    criticalCount: Number(criticalRow?.count ?? 0),
    highCount: Number(highRow?.count ?? 0),
  });
});

dashboardRouter.get("/dashboard/recent-activity", async (req, res): Promise<void> => {
  const recentSessions = await db
    .select()
    .from(sessionsTable)
    .orderBy(sql`${sessionsTable.updatedAt} desc`)
    .limit(5);

  const recentReports = await db
    .select()
    .from(reportsTable)
    .orderBy(sql`${reportsTable.createdAt} desc`)
    .limit(5);

  const sessionActivities = recentSessions.map((s) => ({
    id: s.id,
    type: s.status === "analyzed" ? "session_analyzed" as const : "session_created" as const,
    title: s.title,
    description: `Session status: ${s.status}`,
    severity: null,
    timestamp: s.updatedAt.toISOString(),
  }));

  const reportActivities = recentReports.map((r) => ({
    id: r.id + 10000,
    type: "report_generated" as const,
    title: `Report #${r.id}`,
    description: r.summary.slice(0, 100) + (r.summary.length > 100 ? "..." : ""),
    severity: r.severity,
    timestamp: r.createdAt.toISOString(),
  }));

  const combined = [...sessionActivities, ...reportActivities]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);

  res.json(combined);
});

dashboardRouter.get("/dashboard/threat-breakdown", async (req, res): Promise<void> => {
  const severities = ["critical", "high", "medium", "low", "informational"];
  const results = await Promise.all(
    severities.map(async (severity) => {
      const [row] = await db
        .select({ count: count() })
        .from(reportsTable)
        .where(eq(reportsTable.severity, severity));
      return { severity, count: Number(row?.count ?? 0) };
    })
  );
  res.json(results);
});

dashboardRouter.get("/dashboard/source-distribution", async (req, res): Promise<void> => {
  const sources = ["fortigate", "watchguard", "agent_windows", "agent_linux", "unknown"];
  const results = await Promise.all(
    sources.map(async (source) => {
      const [row] = await db
        .select({ count: count() })
        .from(logEntriesTable)
        .where(eq(logEntriesTable.source, source));
      return { source, count: Number(row?.count ?? 0) };
    })
  );
  res.json(results);
});
