import { Router } from "express";
import { db } from "@workspace/db";
import { logEntriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetSessionCorrelationsParams } from "@workspace/api-zod";
import { maskIp, classifyIp, HIGH_RISK_PORTS } from "../lib/ip-utils";
import { computeThreatScore, threatScoreToRisk } from "../lib/log-parser";

export const correlationsRouter = Router();

correlationsRouter.get("/sessions/:id/correlations", async (req, res): Promise<void> => {
  const parsed = GetSessionCorrelationsParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  const logs = await db
    .select()
    .from(logEntriesTable)
    .where(eq(logEntriesTable.sessionId, parsed.data.id));

  // Group by extractedIp
  const ipMap = new Map<string, typeof logs>();
  for (const log of logs) {
    const ip = log.extractedIp ?? "unknown";
    if (!ipMap.has(ip)) ipMap.set(ip, []);
    ipMap.get(ip)!.push(log);
  }

  const correlations = Array.from(ipMap.entries()).map(([ip, ipLogs]) => {
    const ipType = ip !== "unknown" ? classifyIp(ip) : "unknown";
    const uniqueSources = [...new Set(ipLogs.map((l) => l.source))];
    const actions = ipLogs.map((l) => l.actionTaken);
    const dstPorts = ipLogs.map((l) => l.dstPort);

    const threatScore = computeThreatScore({
      logCount: ipLogs.length,
      uniqueSources,
      actions,
      dstPorts,
      ipType,
    });

    const riskLevel = threatScoreToRisk(threatScore);

    // Port summary with human-readable service name
    const portsSeen = [...new Set(dstPorts.filter((p): p is number => p !== null))];

    // Action summary
    const actionSummary = {
      blocked: actions.filter((a) => a === "blocked").length,
      allowed: actions.filter((a) => a === "allowed").length,
      detected: actions.filter((a) => a === "detected").length,
      other: actions.filter((a) => a !== null && a !== "blocked" && a !== "allowed" && a !== "detected").length,
    };

    return {
      ip,
      maskedIp: ip === "unknown" ? "unknown" : maskIp(ip),
      ipType,
      sources: uniqueSources,
      logCount: ipLogs.length,
      threatScore,
      riskLevel,
      portsSeen,
      actionSummary,
      logs: ipLogs.map((l) => ({
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
      })),
    };
  });

  // Sort by threat score descending
  correlations.sort((a, b) => b.threatScore - a.threatScore);

  res.json(correlations);
});
