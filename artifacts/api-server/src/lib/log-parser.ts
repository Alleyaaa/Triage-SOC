/**
 * Log Parser — multi-source JSON log normalization
 * Supports: FortiGate Firewall, WatchGuard EDR, Windows Agent, Linux Agent
 */

import { normalizeIp, classifyIp, HIGH_RISK_PORTS, MEDIUM_RISK_PORTS, type IpType } from "./ip-utils";

export type LogSource = "fortigate" | "watchguard" | "agent_windows" | "agent_linux" | "unknown";

export interface ParsedLogMetadata {
  extractedIp: string | null;
  dstIp: string | null;
  dstPort: number | null;
  protocol: string | null;
  actionTaken: string | null;
  logTimestamp: string | null;
  ipType: IpType;
  detectedSource: LogSource;
}

/**
 * Auto-detect the log source from JSON structure fingerprinting.
 * Used when user passes "unknown" or for validation.
 */
export function detectSource(obj: Record<string, unknown>): LogSource {
  // FortiGate: has data.srcip or data.logid or data.type === "traffic"
  const data = obj?.data as Record<string, unknown> | undefined;
  if (data?.srcip || data?.logid || data?.type === "traffic" || data?.subtype === "forward") {
    return "fortigate";
  }
  // WatchGuard EDR: has data.watchguard.ip_address
  if ((data?.watchguard as Record<string, unknown>)?.ip_address) {
    return "watchguard";
  }
  // Windows/Linux Agent: has agent.ip
  const agent = obj?.agent as Record<string, unknown> | undefined;
  if (agent?.ip) {
    const os = String(agent?.os ?? "").toLowerCase();
    if (os.includes("windows") || os.includes("win")) return "agent_windows";
    if (os.includes("linux") || os.includes("ubuntu") || os.includes("centos") || os.includes("debian")) return "agent_linux";
    // Check manager or hostname clues
    const hostname = String(agent?.hostname ?? "").toLowerCase();
    if (hostname.startsWith("win") || hostname.includes("win-") || hostname.includes("desktop")) return "agent_windows";
    return "agent_linux"; // default for agent with ip
  }
  return "unknown";
}

/**
 * Extract source IP from a parsed log object based on source type.
 * Priority: declared source field → auto-detect fallback.
 */
function extractSourceIp(obj: Record<string, unknown>, source: LogSource): string | null {
  const data = obj?.data as Record<string, unknown> | undefined;
  const agent = obj?.agent as Record<string, unknown> | undefined;
  const watchguard = data?.watchguard as Record<string, unknown> | undefined;

  switch (source) {
    case "fortigate":
      return normalizeIp(String(data?.srcip ?? data?.src_ip ?? ""));
    case "watchguard":
      return normalizeIp(String(watchguard?.ip_address ?? data?.src_ip ?? ""));
    case "agent_windows":
    case "agent_linux":
      return normalizeIp(String(agent?.ip ?? agent?.nat_ip ?? ""));
    default: {
      // Try all known fields
      const candidates = [
        data?.srcip, data?.src_ip, data?.source_ip,
        agent?.ip, agent?.nat_ip,
        watchguard?.ip_address,
        obj?.src_ip, obj?.srcip, obj?.source_ip,
      ];
      for (const c of candidates) {
        const normalized = normalizeIp(String(c ?? ""));
        if (normalized) return normalized;
      }
      return null;
    }
  }
}

/**
 * Extract destination IP from various source formats.
 */
function extractDstIp(obj: Record<string, unknown>, source: LogSource): string | null {
  const data = obj?.data as Record<string, unknown> | undefined;
  const watchguard = data?.watchguard as Record<string, unknown> | undefined;

  switch (source) {
    case "fortigate":
      return normalizeIp(String(data?.dstip ?? data?.dst_ip ?? data?.destip ?? ""));
    case "watchguard":
      return normalizeIp(String(watchguard?.dst_ip ?? data?.dst_ip ?? ""));
    default: {
      const candidates = [data?.dstip, data?.dst_ip, data?.destip, obj?.dstip, obj?.dst_ip];
      for (const c of candidates) {
        const normalized = normalizeIp(String(c ?? ""));
        if (normalized) return normalized;
      }
      return null;
    }
  }
}

/**
 * Extract destination port.
 */
function extractDstPort(obj: Record<string, unknown>, source: LogSource): number | null {
  const data = obj?.data as Record<string, unknown> | undefined;
  const watchguard = data?.watchguard as Record<string, unknown> | undefined;

  const candidates: unknown[] =
    source === "fortigate"
      ? [data?.dstport, data?.dst_port, data?.port]
      : source === "watchguard"
      ? [watchguard?.dst_port, watchguard?.port, data?.dst_port]
      : [data?.dstport, data?.dst_port, data?.port, obj?.dstport, obj?.dst_port];

  for (const c of candidates) {
    const n = Number(c);
    if (!isNaN(n) && n > 0 && n <= 65535) return n;
  }
  return null;
}

/**
 * Extract protocol (tcp/udp/icmp etc).
 */
function extractProtocol(obj: Record<string, unknown>, source: LogSource): string | null {
  const data = obj?.data as Record<string, unknown> | undefined;
  const watchguard = data?.watchguard as Record<string, unknown> | undefined;

  const raw =
    source === "fortigate"
      ? data?.proto ?? data?.protocol
      : source === "watchguard"
      ? watchguard?.protocol ?? data?.protocol
      : data?.protocol ?? obj?.protocol;

  if (!raw) return null;
  const str = String(raw).toLowerCase().trim();

  // Normalize numeric protocols
  const protoMap: Record<string, string> = {
    "6": "tcp", "17": "udp", "1": "icmp", "41": "ipv6", "58": "icmpv6",
  };
  return protoMap[str] ?? str;
}

/**
 * Extract the action taken (allowed/blocked/denied/dropped/etc).
 */
function extractAction(obj: Record<string, unknown>, source: LogSource): string | null {
  const data = obj?.data as Record<string, unknown> | undefined;
  const watchguard = data?.watchguard as Record<string, unknown> | undefined;

  const raw =
    source === "fortigate"
      ? data?.action ?? data?.disposition
      : source === "watchguard"
      ? watchguard?.action ?? data?.action
      : data?.action ?? data?.event ?? obj?.action;

  if (!raw) return null;
  const str = String(raw).toLowerCase().trim();

  // Normalize to standard values
  if (["deny", "denied", "block", "blocked", "drop", "dropped", "reject", "rejected"].includes(str)) return "blocked";
  if (["allow", "allowed", "accept", "accepted", "permit", "permitted", "pass"].includes(str)) return "allowed";
  if (["alert", "detect", "detected", "warn"].includes(str)) return "detected";
  return str;
}

/**
 * Extract the event timestamp from the raw log.
 * Returns ISO 8601 string or null.
 */
function extractTimestamp(obj: Record<string, unknown>): string | null {
  const candidates = [
    obj?.timestamp, obj?.time, obj?.datetime, obj?.eventtime,
    (obj?.data as Record<string, unknown>)?.timestamp,
    (obj?.agent as Record<string, unknown>)?.timestamp,
  ];

  for (const c of candidates) {
    if (!c) continue;
    const d = new Date(String(c));
    if (!isNaN(d.getTime())) return d.toISOString();
    // Try Unix epoch (seconds or ms)
    const n = Number(c);
    if (!isNaN(n)) {
      const ts = n > 1e12 ? new Date(n) : new Date(n * 1000);
      if (!isNaN(ts.getTime()) && ts.getFullYear() > 2000) return ts.toISOString();
    }
  }
  return null;
}

/**
 * Full parse of a raw JSON log string.
 * Returns all extracted metadata needed for storage and analysis.
 */
export function parseLogEntry(rawJson: string, declaredSource: LogSource): ParsedLogMetadata {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(rawJson) as Record<string, unknown>;
  } catch {
    return {
      extractedIp: null,
      dstIp: null,
      dstPort: null,
      protocol: null,
      actionTaken: null,
      logTimestamp: null,
      ipType: "unknown",
      detectedSource: "unknown",
    };
  }

  const detectedSource = declaredSource === "unknown" ? detectSource(obj) : declaredSource;
  const extractedIp = extractSourceIp(obj, detectedSource);
  const dstIp = extractDstIp(obj, detectedSource);
  const dstPort = extractDstPort(obj, detectedSource);
  const protocol = extractProtocol(obj, detectedSource);
  const actionTaken = extractAction(obj, detectedSource);
  const logTimestamp = extractTimestamp(obj);
  const ipType = extractedIp ? classifyIp(extractedIp) : "unknown";

  return {
    extractedIp,
    dstIp,
    dstPort,
    protocol,
    actionTaken,
    logTimestamp,
    ipType,
    detectedSource,
  };
}

/**
 * Compute threat score (0–100) for an IP across correlated logs.
 * Higher = more suspicious.
 */
export interface ThreatScoreInput {
  logCount: number;
  uniqueSources: string[];
  actions: (string | null)[];
  dstPorts: (number | null)[];
  ipType: IpType;
}

export function computeThreatScore(input: ThreatScoreInput): number {
  let score = 0;

  // Base: more logs = more suspicious (up to 20 points)
  score += Math.min(input.logCount * 2, 20);

  // Multi-source correlation bonus (up to 30 points)
  const srcCount = input.uniqueSources.length;
  if (srcCount >= 3) score += 30;
  else if (srcCount === 2) score += 20;
  else score += 5;

  // Action-based scoring (up to 20 points)
  const blockedCount = input.actions.filter((a) => a === "blocked").length;
  const allowedCount = input.actions.filter((a) => a === "allowed").length;
  const detectedCount = input.actions.filter((a) => a === "detected").length;

  if (detectedCount > 0) score += 15; // EDR detection is serious
  if (blockedCount > 0 && allowedCount > 0) score += 20; // blocked some, allowed others = likely pivot
  else if (blockedCount > 0) score += 10;
  else if (allowedCount > 0 && input.logCount > 1) score += 12;

  // Port-based scoring (up to 25 points)
  const ports = input.dstPorts.filter((p): p is number => p !== null);
  const highRiskHit = ports.some((p) => HIGH_RISK_PORTS[p]);
  const medRiskHit = ports.some((p) => MEDIUM_RISK_PORTS[p]);
  if (highRiskHit) score += 25;
  else if (medRiskHit) score += 10;

  // IP type modifier
  if (input.ipType === "public") score += 5; // public IPs connecting inward = more suspicious
  if (input.ipType === "loopback") score -= 10; // loopback is less likely to be real attack

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function threatScoreToRisk(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 80) return "critical";
  if (score >= 55) return "high";
  if (score >= 30) return "medium";
  return "low";
}
