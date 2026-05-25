/**
 * IP Utilities — validation, classification, sanitization, masking
 * Used across all route handlers for consistent IP handling
 */

export type IpType = "private" | "public" | "loopback" | "multicast" | "link-local" | "unknown";

const PRIVATE_RANGES_V4 = [
  { start: ipToLong("10.0.0.0"), end: ipToLong("10.255.255.255") },        // RFC 1918
  { start: ipToLong("172.16.0.0"), end: ipToLong("172.31.255.255") },      // RFC 1918
  { start: ipToLong("192.168.0.0"), end: ipToLong("192.168.255.255") },    // RFC 1918
  { start: ipToLong("169.254.0.0"), end: ipToLong("169.254.255.255") },    // Link-local
  { start: ipToLong("100.64.0.0"), end: ipToLong("100.127.255.255") },     // CGNAT (RFC 6598)
];

function ipToLong(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

export function isValidIpv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    const n = Number(p);
    return Number.isInteger(n) && n >= 0 && n <= 255 && String(n) === p;
  });
}

export function isValidIpv6(ip: string): boolean {
  // Basic IPv6 validation
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::$|^::1$|^([0-9a-fA-F]{1,4}:)*::([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}$/;
  return ipv6Regex.test(ip);
}

export function isValidIp(ip: string): boolean {
  return isValidIpv4(ip) || isValidIpv6(ip);
}

export function classifyIp(ip: string): IpType {
  if (!ip) return "unknown";

  // IPv6 loopback
  if (ip === "::1") return "loopback";
  // IPv6 link-local
  if (ip.toLowerCase().startsWith("fe80:")) return "link-local";
  // IPv6 multicast
  if (ip.toLowerCase().startsWith("ff")) return "multicast";

  if (!isValidIpv4(ip)) return "unknown";

  const long = ipToLong(ip);

  // Loopback 127.0.0.0/8
  if (long >= ipToLong("127.0.0.0") && long <= ipToLong("127.255.255.255")) return "loopback";
  // Multicast 224.0.0.0/4
  if (long >= ipToLong("224.0.0.0") && long <= ipToLong("239.255.255.255")) return "multicast";
  // Link-local
  if (long >= ipToLong("169.254.0.0") && long <= ipToLong("169.254.255.255")) return "link-local";

  for (const range of PRIVATE_RANGES_V4) {
    if (long >= range.start && long <= range.end) return "private";
  }

  return "public";
}

export function normalizeIp(ip: string): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  // Strip port if present (e.g. "1.2.3.4:8080")
  const withoutPort = trimmed.split(":")[0];
  // Handle IPv4-mapped IPv6 (::ffff:1.2.3.4)
  const ipv4MappedMatch = trimmed.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (ipv4MappedMatch) return ipv4MappedMatch[1];
  if (isValidIpv4(withoutPort)) return withoutPort;
  if (isValidIpv6(trimmed)) return trimmed.toLowerCase();
  return null;
}

export function maskIp(ip: string): string {
  if (!ip || ip === "unknown") return ip;
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  if (ip.includes(":")) {
    const segments = ip.split(":");
    const half = Math.ceil(segments.length / 2);
    return segments.slice(0, half).join(":") + ":****:****";
  }
  return "***.***.***";
}

/**
 * Sanitize IPs in a log object before sending to AI.
 * If maskIps=true, replaces all valid IPs with masked versions.
 * Also removes fields that should never be sent to external AI (e.g. raw passwords).
 */
export function sanitizeLogForAi(
  obj: unknown,
  maskIps: boolean,
  sensitiveKeys: Set<string> = SENSITIVE_FIELD_KEYS
): unknown {
  if (typeof obj === "string") {
    if (maskIps) {
      // Replace IPv4 addresses in strings
      return obj.replace(/\b(\d{1,3}\.){3}\d{1,3}\b/g, (match) =>
        isValidIpv4(match) ? maskIp(match) : match
      );
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeLogForAi(item, maskIps, sensitiveKeys));
  }

  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (sensitiveKeys.has(key.toLowerCase())) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = sanitizeLogForAi(value, maskIps, sensitiveKeys);
      }
    }
    return result;
  }

  return obj;
}

// Fields that should be redacted before sending to external AI
const SENSITIVE_FIELD_KEYS = new Set([
  "password", "passwd", "secret", "token", "apikey", "api_key",
  "authorization", "auth", "credential", "credentials", "cookie",
  "session_id", "sessionid", "private_key", "privatekey",
  "ntlm_hash", "ntlm", "lm_hash", "kerberos_ticket",
]);

// Well-known high-risk ports for threat scoring
export const HIGH_RISK_PORTS: Record<number, string> = {
  21: "FTP",
  22: "SSH",
  23: "Telnet",
  25: "SMTP",
  445: "SMB",
  1433: "MSSQL",
  1434: "MSSQL-UDP",
  3306: "MySQL",
  3389: "RDP",
  4444: "Metasploit-default",
  5432: "PostgreSQL",
  5900: "VNC",
  6379: "Redis",
  8080: "HTTP-alt",
  8443: "HTTPS-alt",
  9200: "Elasticsearch",
  27017: "MongoDB",
};

export const MEDIUM_RISK_PORTS: Record<number, string> = {
  80: "HTTP",
  135: "RPC",
  137: "NetBIOS",
  138: "NetBIOS",
  139: "NetBIOS",
  443: "HTTPS",
  593: "RPC-over-HTTP",
  636: "LDAPS",
};
