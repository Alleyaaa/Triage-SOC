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

export const analyzeRouter = Router();

function maskIp(ip: string): string {
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  return "***.***.***";
}

interface AiReportResult {
  summary: string;
  severity: string;
  iocs: string[];
  recommendations: string[];
  attackVector?: string;
  affectedSystems: string[];
}

async function callN8nWebhook(
  webhookUrl: string,
  payload: object
): Promise<{ result: AiReportResult; executionId?: string }> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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
      recommendations: Array.isArray(data.recommendations)
        ? (data.recommendations as string[])
        : [],
      attackVector: data.attackVector ? String(data.attackVector) : undefined,
      affectedSystems: Array.isArray(data.affectedSystems)
        ? (data.affectedSystems as string[])
        : [],
    },
    executionId: data.executionId ? String(data.executionId) : undefined,
  };
}

async function callDirectGemini(
  logs: { source: string; rawJson: string; extractedIp: string | null }[],
  maskIps: boolean,
  additionalContext?: string
): Promise<AiReportResult> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Configure it in environment variables or use n8n webhook.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const logSummary = logs.map((l, i) => {
    const ip = maskIps && l.extractedIp ? maskIp(l.extractedIp) : (l.extractedIp ?? "unknown");
    let parsed: unknown;
    try {
      parsed = JSON.parse(l.rawJson);
    } catch {
      parsed = l.rawJson;
    }
    return `Log ${i + 1} [Source: ${l.source}, IP: ${ip}]:\n${JSON.stringify(parsed, null, 2)}`;
  }).join("\n\n---\n\n");

  const prompt = `You are a SOC (Security Operations Center) analyst. Analyze the following security logs and provide a threat assessment report.

${additionalContext ? `Additional context from analyst: ${additionalContext}\n\n` : ""}

SECURITY LOGS:
${logSummary}

Provide a structured JSON response with exactly these fields:
{
  "summary": "Detailed narrative summary of the security incident or findings (2-4 paragraphs)",
  "severity": "one of: critical, high, medium, low, informational",
  "iocs": ["list of indicators of compromise (IPs, domains, hashes, file paths, etc.)"],
  "recommendations": ["actionable security recommendations"],
  "attackVector": "brief description of the attack vector or null",
  "affectedSystems": ["list of affected systems or assets"]
}

Respond with ONLY valid JSON, no markdown code blocks.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  let parsed: AiReportResult;
  try {
    parsed = JSON.parse(text) as AiReportResult;
  } catch {
    // Try to extract JSON from the response
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

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
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

  // Update session status to analyzing
  await db
    .update(sessionsTable)
    .set({ status: "analyzing" })
    .where(eq(sessionsTable.id, sessionId));

  let aiResult: AiReportResult;
  let executionId: string | undefined;

  try {
    // Check if n8n webhook is configured
    const [n8nRow] = await db.select().from(n8nConfigTable).orderBy(sql`${n8nConfigTable.id} desc`).limit(1);
    const webhookUrl = n8nRow?.webhookUrl;

    const logsPayload = logs.map((l) => ({
      source: l.source,
      rawJson: l.rawJson,
      extractedIp: bodyParsed.data.maskIps && l.extractedIp ? maskIp(l.extractedIp) : l.extractedIp,
    }));

    if (webhookUrl) {
      logger.info({ sessionId, webhookUrl }, "Sending to n8n webhook for analysis");
      const n8nResult = await callN8nWebhook(webhookUrl, {
        sessionId,
        maskIps: bodyParsed.data.maskIps,
        additionalContext: bodyParsed.data.additionalContext,
        logs: logsPayload,
      });
      aiResult = n8nResult.result;
      executionId = n8nResult.executionId;
    } else {
      logger.info({ sessionId }, "No n8n webhook configured, calling Gemini directly");
      aiResult = await callDirectGemini(
        logsPayload,
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
    res.status(500).json({ error: `Analysis failed: ${err instanceof Error ? err.message : "Unknown error"}` });
    return;
  }

  // Delete existing report for this session if any
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
      rawAiResponse: JSON.stringify(aiResult),
      n8nExecutionId: executionId ?? null,
    })
    .returning();

  // Update session status to analyzed
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
    rawAiResponse: report.rawAiResponse,
    n8nExecutionId: report.n8nExecutionId ?? null,
    createdAt: report.createdAt.toISOString(),
  });
});
