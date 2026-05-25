import { Router } from "express";
import { db } from "@workspace/db";
import {
  sessionsTable,
  logEntriesTable,
  reportsTable,
  n8nConfigTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { AnalyzeSessionParams, AnalyzeSessionBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { maskIp, classifyIp, sanitizeLogForAi, HIGH_RISK_PORTS } from "../lib/ip-utils";
import { computeThreatScore, threatScoreToRisk } from "../lib/log-parser";

export const analyzeRouter = Router();

interface AiReportResult {
  summary: string;
  severity: string;
  iocs: string[];
  recommendations: string[];
  attackVector?: string;
  affectedSystems: string[];
  mitreAttackTechniques: string[];
}

/**
 * Build a sanitized, structured log payload to send to AI.
 * Masks IPs if requested, redacts sensitive fields, and enriches with metadata.
 */
function buildSanitizedPayload(
  logs: (typeof logEntriesTable.$inferSelect)[],
  maskIps: boolean
) {
  return logs.map((l) => {
    let parsedObj: unknown;
    try {
      parsedObj = JSON.parse(l.rawJson);
    } catch {
      parsedObj = l.rawJson;
    }

    const sanitized = sanitizeLogForAi(parsedObj, maskIps);
    const srcIpDisplay = maskIps && l.extractedIp ? maskIp(l.extractedIp) : (l.extractedIp ?? "unknown");
    const dstIpDisplay = maskIps && l.dstIp ? maskIp(l.dstIp) : (l.dstIp ?? null);

    return {
      source: l.source,
      src_ip: srcIpDisplay,
      src_ip_type: l.ipType ?? classifyIp(l.extractedIp ?? ""),
      dst_ip: dstIpDisplay,
      dst_port: l.dstPort ?? null,
      dst_port_service: l.dstPort ? (HIGH_RISK_PORTS[l.dstPort] ?? null) : null,
      protocol: l.protocol ?? null,
      action: l.actionTaken ?? null,
      log_timestamp: l.logTimestamp ?? null,
      raw_log: sanitized,
    };
  });
}

/**
 * Build correlated IP threat context for the AI prompt.
 */
function buildCorrelationContext(
  logs: (typeof logEntriesTable.$inferSelect)[],
  maskIps: boolean
): string {
  const ipMap = new Map<string, typeof logs>();
  for (const log of logs) {
    const ip = log.extractedIp ?? "unknown";
    if (!ipMap.has(ip)) ipMap.set(ip, []);
    ipMap.get(ip)!.push(log);
  }

  const lines: string[] = [];
  for (const [ip, ipLogs] of ipMap.entries()) {
    const displayIp = maskIps ? maskIp(ip) : ip;
    const ipType = classifyIp(ip);
    const sources = [...new Set(ipLogs.map((l) => l.source))];
    const actions = ipLogs.map((l) => l.actionTaken);
    const ports = ipLogs.map((l) => l.dstPort);

    const score = computeThreatScore({
      logCount: ipLogs.length,
      uniqueSources: sources,
      actions,
      dstPorts: ports,
      ipType,
    });

    const riskLevel = threatScoreToRisk(score);
    const uniquePorts = [...new Set(ports.filter(Boolean))];
    const portServices = uniquePorts.map((p) => `${p}/${HIGH_RISK_PORTS[p!] ?? "unknown"}`);
    const blockedCount = actions.filter((a) => a === "blocked").length;
    const allowedCount = actions.filter((a) => a === "allowed").length;
    const detectedCount = actions.filter((a) => a === "detected").length;

    lines.push(
      `  IP: ${displayIp} (${ipType}) — Risk: ${riskLevel.toUpperCase()} (score: ${score}/100)\n` +
      `    Sources: ${sources.join(", ")} | Log count: ${ipLogs.length}\n` +
      `    Actions: blocked=${blockedCount}, allowed=${allowedCount}, detected=${detectedCount}\n` +
      (uniquePorts.length ? `    Destination ports: ${portServices.join(", ")}\n` : "")
    );
  }

  return lines.join("\n");
}

async function callN8nWebhook(
  webhookUrl: string,
  payload: object
): Promise<{ result: AiReportResult; executionId?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`n8n webhook returned ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return {
      result: {
        summary: String(data.summary ?? "No summary provided"),
        severity: String(data.severity ?? "informational"),
        iocs: Array.isArray(data.iocs) ? (data.iocs as string[]) : [],
        recommendations: Array.isArray(data.recommendations) ? (data.recommendations as string[]) : [],
        attackVector: data.attackVector ? String(data.attackVector) : undefined,
        affectedSystems: Array.isArray(data.affectedSystems) ? (data.affectedSystems as string[]) : [],
        mitreAttackTechniques: Array.isArray(data.mitreAttackTechniques)
          ? (data.mitreAttackTechniques as string[])
          : [],
      },
      executionId: data.executionId ? String(data.executionId) : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callDirectGemini(
  logs: (typeof logEntriesTable.$inferSelect)[],
  maskIps: boolean,
  additionalContext?: string
): Promise<AiReportResult> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Configure it in environment variables or use n8n webhook."
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const sanitizedLogs = buildSanitizedPayload(logs, maskIps);
  const correlationContext = buildCorrelationContext(logs, maskIps);

  const prompt = `You are an expert SOC (Security Operations Center) analyst with deep knowledge of threat hunting, incident response, and MITRE ATT&CK framework.

Analyze the following correlated security log data and produce a comprehensive threat assessment report.

## IP CORRELATION SUMMARY
${correlationContext}

## DETAILED LOG DATA (${sanitizedLogs.length} events)
${sanitizedLogs.map((l, i) =>
  `### Event ${i + 1} — Source: ${l.source.toUpperCase()} | Action: ${l.action ?? "unknown"}\n` +
  `- Source IP: ${l.src_ip} (${l.src_ip_type})\n` +
  (l.dst_ip ? `- Destination IP: ${l.dst_ip}\n` : "") +
  (l.dst_port ? `- Destination Port: ${l.dst_port}${l.dst_port_service ? ` (${l.dst_port_service})` : ""}\n` : "") +
  (l.protocol ? `- Protocol: ${l.protocol.toUpperCase()}\n` : "") +
  (l.log_timestamp ? `- Timestamp: ${l.log_timestamp}\n` : "") +
  `- Raw Log:\n\`\`\`json\n${JSON.stringify(l.raw_log, null, 2)}\n\`\`\``
).join("\n\n")}

${additionalContext ? `## ANALYST CONTEXT\n${additionalContext}\n\n` : ""}

## INSTRUCTIONS
Based on the above data, provide a structured threat assessment. Consider:
- Multi-source correlation patterns (same IP in FortiGate + WatchGuard + Agent = high confidence)
- Lateral movement indicators (SMB/RDP/WMI traffic to internal hosts)
- Credential access techniques (lsass access, SAM dump, Kerberoasting)
- Command and control patterns (unusual outbound connections, beaconing)
- Defense evasion (disabled logging, unusual process parents)
- Privilege escalation patterns

Respond ONLY with this exact JSON structure (no markdown, no code blocks):
{
  "summary": "3-5 paragraph detailed narrative of findings, attack chain, and timeline",
  "severity": "critical|high|medium|low|informational",
  "iocs": ["IP addresses", "file paths", "process names", "registry keys", "domains", "hashes as IOCs"],
  "recommendations": ["Specific actionable remediation steps ordered by priority"],
  "attackVector": "Brief description of primary attack vector",
  "affectedSystems": ["Hostname/IP of affected systems"],
  "mitreAttackTechniques": ["T1078 - Valid Accounts", "T1003 - OS Credential Dumping", ...]
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  let parsed: AiReportResult;
  try {
    parsed = JSON.parse(text) as AiReportResult;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Failed to parse AI response as JSON");
    parsed = JSON.parse(match[0]) as AiReportResult;
  }

  return {
    summary: String(parsed.summary ?? ""),
    severity: String(parsed.severity ?? "informational"),
    iocs: Array.isArray(parsed.iocs) ? parsed.iocs : [],
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    attackVector: parsed.attackVector ?? undefined,
    affectedSystems: Array.isArray(parsed.affectedSystems) ? parsed.affectedSystems : [],
    mitreAttackTechniques: Array.isArray(parsed.mitreAttackTechniques)
      ? parsed.mitreAttackTechniques
      : [],
  };
}

analyzeRouter.post("/sessions/:id/analyze", async (req, res): Promise<void> => {
  const paramsParsed = AnalyzeSessionParams.safeParse({ id: Number(req.params.id) });
  const bodyParsed = AnalyzeSessionBody.safeParse(req.body);

  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const sessionId = paramsParsed.data.id;

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const logs = await db
    .select()
    .from(logEntriesTable)
    .where(eq(logEntriesTable.sessionId, sessionId));

  if (logs.length === 0) {
    res.status(400).json({ error: "No logs in this session to analyze" });
    return;
  }

  await db
    .update(sessionsTable)
    .set({ status: "analyzing" })
    .where(eq(sessionsTable.id, sessionId));

  let aiResult: AiReportResult;
  let executionId: string | undefined;

  try {
    const [n8nRow] = await db
      .select()
      .from(n8nConfigTable)
      .orderBy(sql`${n8nConfigTable.id} desc`)
      .limit(1);
    const webhookUrl = n8nRow?.webhookUrl;

    if (webhookUrl) {
      logger.info({ sessionId, webhookUrl }, "Sending to n8n webhook for analysis");
      const sanitizedLogs = buildSanitizedPayload(logs, bodyParsed.data.maskIps);
      const n8nResult = await callN8nWebhook(webhookUrl, {
        sessionId,
        maskIps: bodyParsed.data.maskIps,
        additionalContext: bodyParsed.data.additionalContext,
        correlationContext: buildCorrelationContext(logs, bodyParsed.data.maskIps),
        logs: sanitizedLogs,
        logCount: logs.length,
        uniqueIps: [...new Set(logs.map((l) => l.extractedIp).filter(Boolean))].length,
      });
      aiResult = n8nResult.result;
      executionId = n8nResult.executionId;
    } else {
      logger.info({ sessionId }, "No n8n webhook configured, calling Gemini directly");
      aiResult = await callDirectGemini(
        logs,
        bodyParsed.data.maskIps,
        bodyParsed.data.additionalContext
      );
    }
  } catch (err) {
    logger.error({ err, sessionId }, "AI analysis failed");
    await db
      .update(sessionsTable)
      .set({ status: "open" })
      .where(eq(sessionsTable.id, sessionId));
    res.status(500).json({
      error: `Analysis failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    });
    return;
  }

  await db.delete(reportsTable).where(eq(reportsTable.sessionId, sessionId));

  const [report] = await db
    .insert(reportsTable)
    .values({
      sessionId,
      summary: aiResult.summary,
      severity: aiResult.severity,
      iocs: aiResult.iocs,
      recommendations: aiResult.recommendations,
      attackVector: aiResult.attackVector ?? null,
      affectedSystems: aiResult.affectedSystems,
      mitreAttackTechniques: aiResult.mitreAttackTechniques ?? [],
      rawAiResponse: JSON.stringify(aiResult),
      n8nExecutionId: executionId ?? null,
    })
    .returning();

  await db
    .update(sessionsTable)
    .set({ status: "analyzed" })
    .where(eq(sessionsTable.id, sessionId));

  res.json({
    id: report.id,
    sessionId: report.sessionId,
    summary: report.summary,
    severity: report.severity,
    iocs: report.iocs,
    recommendations: report.recommendations,
    attackVector: report.attackVector ?? null,
    affectedSystems: report.affectedSystems,
    mitreAttackTechniques: report.mitreAttackTechniques ?? [],
    rawAiResponse: report.rawAiResponse,
    n8nExecutionId: report.n8nExecutionId ?? null,
    createdAt: report.createdAt.toISOString(),
  });
});
