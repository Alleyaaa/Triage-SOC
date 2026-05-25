import { Router } from "express";
import { db } from "@workspace/db";
import { logEntriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetSessionCorrelationsParams } from "@workspace/api-zod";

export const correlationsRouter = Router();

function maskIp(ip: string): string {
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  // IPv6 or unknown — mask last half
  if (ip.includes(":")) {
    const segments = ip.split(":");
    const half = Math.ceil(segments.length / 2);
    return segments.slice(0, half).join(":") + ":****:****";
  }
  return "***.***.***";
}

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

  const correlations = Array.from(ipMap.entries()).map(([ip, ipLogs]) => ({
    ip,
    maskedIp: ip === "unknown" ? "unknown" : maskIp(ip),
    sources: [...new Set(ipLogs.map((l) => l.source))],
    logCount: ipLogs.length,
    logs: ipLogs.map((l) => ({
      id: l.id,
      sessionId: l.sessionId,
      source: l.source,
      rawJson: l.rawJson,
      extractedIp: l.extractedIp ?? null,
      masked: l.masked,
      createdAt: l.createdAt.toISOString(),
    })),
  }));

  res.json(correlations);
});
