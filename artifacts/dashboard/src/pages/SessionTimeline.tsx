import { useParams, Link } from "wouter";
import {
  useGetSession, getGetSessionQueryKey,
  useGetSessionLogs, getGetSessionLogsQueryKey,
  useGetSessionCorrelations, getGetSessionCorrelationsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SourceBadge } from "@/components/ui/badges";
import {
  ArrowLeft, Clock, Shield, ShieldAlert, AlertTriangle,
  ChevronRight, Filter, Activity, Crosshair,
} from "lucide-react";
import { useState, useMemo } from "react";
import { format, formatDistanceToNow, differenceInMilliseconds } from "date-fns";
import type { LogEntry } from "@workspace/api-client-react";

const ACTION_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  blocked:  { bg: "bg-red-500/10 border-red-500/30",    text: "text-red-400",    dot: "bg-red-500",    label: "BLOCKED"  },
  allowed:  { bg: "bg-green-500/10 border-green-500/30", text: "text-green-400",  dot: "bg-green-500",  label: "ALLOWED"  },
  detected: { bg: "bg-yellow-500/10 border-yellow-500/30", text: "text-yellow-400", dot: "bg-yellow-500", label: "DETECTED" },
};

const SOURCE_COLORS: Record<string, string> = {
  fortigate: "#06b6d4",
  watchguard: "#8b5cf6",
  agent_windows: "#3b82f6",
  agent_linux: "#10b981",
  unknown: "#6b7280",
};

function getActionStyle(action: string | null) {
  if (!action) return { bg: "bg-muted/30 border-border", text: "text-muted-foreground", dot: "bg-muted-foreground", label: "UNKNOWN" };
  return ACTION_STYLES[action] ?? { bg: "bg-muted/30 border-border", text: "text-muted-foreground", dot: "bg-blue-400", label: action.toUpperCase() };
}

function formatDelta(ms: number): string {
  if (ms < 1000) return `+${ms}ms`;
  if (ms < 60000) return `+${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `+${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `+${Math.floor(ms / 3600000)}h`;
}

function detectPattern(logs: LogEntry[]): { indices: number[]; label: string; severity: string } | null {
  if (logs.length < 2) return null;

  const actions = logs.map((l) => l.actionTaken);
  const sources = logs.map((l) => l.source);

  const blockedThenAllowed = actions.some((a) => a === "blocked") && actions.some((a) => a === "allowed");
  const multiSource = new Set(sources).size >= 3;
  const detectedPresent = actions.some((a) => a === "detected");
  const rdpSmb = logs.some((l) => l.dstPort === 3389 || l.dstPort === 445 || l.dstPort === 22);

  if (detectedPresent && rdpSmb) {
    return {
      indices: logs.map((_, i) => i),
      label: "Possible Lateral Movement Detected",
      severity: "critical",
    };
  }
  if (blockedThenAllowed) {
    return {
      indices: logs.map((_, i) => i),
      label: "Firewall Bypass Pattern — Blocked attempts followed by successful connection",
      severity: "high",
    };
  }
  if (multiSource) {
    return {
      indices: logs.map((_, i) => i),
      label: "Multi-Source Correlation — Same IP seen across 3+ security tools",
      severity: "high",
    };
  }
  return null;
}

export default function SessionTimeline() {
  const { id } = useParams<{ id: string }>();
  const sessionId = parseInt(id || "0", 10);

  const [filterSource, setFilterSource] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [maskIps, setMaskIps] = useState(false);

  const { data: session, isLoading: sessionLoading } = useGetSession(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetSessionQueryKey(sessionId) },
  });
  const { data: rawLogs, isLoading: logsLoading } = useGetSessionLogs(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetSessionLogsQueryKey(sessionId) },
  });
  const { data: correlations } = useGetSessionCorrelations(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetSessionCorrelationsQueryKey(sessionId) },
  });

  const sortedLogs = useMemo(() => {
    if (!rawLogs) return [];
    return [...rawLogs].sort((a, b) => {
      const ta = a.logTimestamp ? new Date(a.logTimestamp).getTime() : new Date(a.createdAt).getTime();
      const tb = b.logTimestamp ? new Date(b.logTimestamp).getTime() : new Date(b.createdAt).getTime();
      return ta - tb;
    });
  }, [rawLogs]);

  type SortedLog = (typeof sortedLogs)[number];

  const filteredLogs = useMemo(() => {
    return sortedLogs.filter((l) => {
      if (filterSource !== "all" && l.source !== filterSource) return false;
      if (filterAction !== "all" && (l.actionTaken ?? "unknown") !== filterAction) return false;
      return true;
    });
  }, [sortedLogs, filterSource, filterAction]);

  const pattern = useMemo(() => detectPattern(sortedLogs), [sortedLogs]);

  const uniqueSources = useMemo(
    () => ["all", ...new Set((rawLogs ?? []).map((l) => l.source))],
    [rawLogs]
  );
  const uniqueActions = useMemo(
    () => ["all", ...new Set((rawLogs ?? []).map((l) => l.actionTaken ?? "unknown").filter(Boolean))],
    [rawLogs]
  );

  const ipThreatMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of correlations ?? []) {
      if (c.ip !== "unknown") map.set(c.ip, c.threatScore);
    }
    return map;
  }, [correlations]);

  const maskIpClient = (ip: string): string => {
    const parts = ip.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
    return ip.replace(/[^:]+:[^:]+$/, "****:****");
  };

  const displayIp = (ip: string | null) => {
    if (!ip) return null;
    return maskIps ? maskIpClient(ip) : ip;
  };

  if (sessionLoading) {
    return <div className="p-8 space-y-4"><Skeleton className="h-12 w-1/3" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!session) {
    return <div className="p-8">Session not found.</div>;
  }

  const firstTime = filteredLogs[0]
    ? (filteredLogs[0].logTimestamp ? new Date(filteredLogs[0].logTimestamp) : new Date(filteredLogs[0].createdAt))
    : null;
  const lastTime = filteredLogs[filteredLogs.length - 1]
    ? (filteredLogs[filteredLogs.length - 1].logTimestamp
        ? new Date(filteredLogs[filteredLogs.length - 1].logTimestamp!)
        : new Date(filteredLogs[filteredLogs.length - 1].createdAt))
    : null;

  const totalDurationMs = firstTime && lastTime ? differenceInMilliseconds(lastTime, firstTime) : 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border bg-card p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link href={`/sessions/${sessionId}`}>
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold font-mono">{session.title}</h1>
              <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded font-mono uppercase">
                Timeline
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Session #{session.id} •{" "}
              {filteredLogs.length} events
              {totalDurationMs > 0 && ` • Duration: ${formatDelta(totalDurationMs).replace("+", "")}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMaskIps((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded border font-mono transition-colors ${
              maskIps ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {maskIps ? "IPs Masked" : "Mask IPs"}
          </button>
          <Link href={`/sessions/${sessionId}`}>
            <Button variant="outline" size="sm" className="gap-2">
              <ChevronRight className="h-4 w-4" /> Workspace
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {pattern && (
          <div className={`flex items-start gap-3 p-4 rounded-lg border ${
            pattern.severity === "critical"
              ? "bg-red-500/10 border-red-500/30"
              : "bg-orange-500/10 border-orange-500/30"
          }`}>
            <Crosshair className={`h-5 w-5 mt-0.5 shrink-0 ${
              pattern.severity === "critical" ? "text-red-400" : "text-orange-400"
            }`} />
            <div>
              <p className={`text-sm font-semibold ${
                pattern.severity === "critical" ? "text-red-400" : "text-orange-400"
              }`}>
                Attack Pattern Detected
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">{pattern.label}</p>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg p-3">
            <Clock className="h-4 w-4 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">First Event</p>
              <p className="text-sm font-mono font-medium">
                {firstTime ? format(firstTime, "HH:mm:ss") : "—"}
              </p>
              {firstTime && <p className="text-xs text-muted-foreground">{formatDistanceToNow(firstTime, { addSuffix: true })}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg p-3">
            <Activity className="h-4 w-4 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Total Duration</p>
              <p className="text-sm font-mono font-medium">
                {totalDurationMs > 0 ? formatDelta(totalDurationMs).replace("+", "") : "< 1s"}
              </p>
              <p className="text-xs text-muted-foreground">{filteredLogs.length} events</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg p-3">
            <ShieldAlert className="h-4 w-4 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Unique IPs</p>
              <p className="text-sm font-mono font-medium">
                {new Set(filteredLogs.map((l) => l.extractedIp).filter(Boolean)).size}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Set(filteredLogs.map((l) => l.source)).size} sources
              </p>
            </div>
          </div>
        </div>

        <Card className="bg-card border-card-border">
          <CardHeader className="py-3 px-4 border-b border-border">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm font-mono uppercase flex items-center gap-2">
                <Filter className="h-4 w-4" /> Filters
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Source:</span>
                  <select
                    value={filterSource}
                    onChange={(e) => setFilterSource(e.target.value)}
                    className="text-xs bg-background border border-border rounded px-2 py-1 font-mono text-foreground"
                  >
                    {uniqueSources.map((s) => (
                      <option key={s} value={s}>{s === "all" ? "All sources" : s}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Action:</span>
                  <select
                    value={filterAction}
                    onChange={(e) => setFilterAction(e.target.value)}
                    className="text-xs bg-background border border-border rounded px-2 py-1 font-mono text-foreground"
                  >
                    {uniqueActions.map((a) => (
                      <option key={a} value={a}>{a === "all" ? "All actions" : a}</option>
                    ))}
                  </select>
                </div>
                {(filterSource !== "all" || filterAction !== "all") && (
                  <button
                    onClick={() => { setFilterSource("all"); setFilterAction("all"); }}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {logsLoading ? (
              <div className="p-4 space-y-4">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : filteredLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">
                No events match the current filters.
              </p>
            ) : (
              <div className="relative">
                <div
                  className="absolute left-[2.35rem] top-0 bottom-0 w-px bg-border"
                  aria-hidden
                />
                <div className="space-y-0">
                  {filteredLogs.map((log, index) => {
                    const logTime = log.logTimestamp
                      ? new Date(log.logTimestamp)
                      : new Date(log.createdAt);
                    const prevLog = filteredLogs[index - 1];
                    const prevTime = prevLog
                      ? (prevLog.logTimestamp ? new Date(prevLog.logTimestamp) : new Date(prevLog.createdAt))
                      : null;
                    const deltaMs = prevTime ? differenceInMilliseconds(logTime, prevTime) : null;

                    const actionStyle = getActionStyle(log.actionTaken ?? null);
                    const srcIp = log.extractedIp ? displayIp(log.extractedIp) : null;
                    const dstIpDisplay = log.dstIp ? displayIp(log.dstIp) : null;
                    const threatScore = log.extractedIp ? (ipThreatMap.get(log.extractedIp) ?? null) : null;
                    const isHighThreat = threatScore !== null && threatScore >= 55;

                    return (
                      <div key={log.id} className="relative pl-[4.5rem] pr-4 py-3 hover:bg-muted/10 transition-colors">
                        <div className={`absolute left-7 top-4 w-4 h-4 rounded-full border-2 border-background ${actionStyle.dot} z-10 flex items-center justify-center`}>
                          {isHighThreat && (
                            <AlertTriangle className="h-2 w-2 text-background" />
                          )}
                        </div>

                        {deltaMs !== null && (
                          <div className="absolute left-[3.2rem] top-1 text-[9px] font-mono text-muted-foreground/70 bg-background px-0.5">
                            {formatDelta(deltaMs)}
                          </div>
                        )}

                        <div className={`rounded-lg border p-3 ${actionStyle.bg} ${isHighThreat ? "ring-1 ring-orange-500/30" : ""}`}>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <SourceBadge source={log.source} className="text-[10px] h-5" />
                              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${actionStyle.bg} ${actionStyle.text}`}>
                                {actionStyle.label}
                              </span>
                              {isHighThreat && (
                                <span className="text-[10px] font-mono bg-orange-500/10 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded">
                                  THREAT {threatScore}
                                </span>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-xs font-mono text-muted-foreground">
                                {format(logTime, "HH:mm:ss")}
                                {log.logTimestamp && (
                                  <span className="ml-1 text-[9px] text-muted-foreground/50">(log)</span>
                                )}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
                            {srcIp && (
                              <span className="flex items-center gap-1">
                                <span className="text-muted-foreground">src</span>
                                <span
                                  className="font-bold"
                                  style={{ color: SOURCE_COLORS[log.source] ?? "#888" }}
                                >
                                  {srcIp}
                                </span>
                                {log.ipType && log.ipType !== "unknown" && (
                                  <span className="text-muted-foreground/60 text-[10px]">({log.ipType})</span>
                                )}
                              </span>
                            )}
                            {dstIpDisplay && (
                              <span className="flex items-center gap-1">
                                <span className="text-muted-foreground">→</span>
                                <span className="text-foreground">{dstIpDisplay}</span>
                                {log.dstPort && (
                                  <span className="text-muted-foreground">:{log.dstPort}</span>
                                )}
                              </span>
                            )}
                            {log.protocol && (
                              <span className="text-muted-foreground uppercase">{log.protocol}</span>
                            )}
                          </div>

                          {log.logTimestamp && (
                            <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                              Log timestamp: {format(new Date(log.logTimestamp), "yyyy-MM-dd HH:mm:ss")}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {filteredLogs.length > 0 && (
                  <div className="relative pl-[4.5rem] pr-4 py-3">
                    <div className="absolute left-7 top-4 w-4 h-4 rounded-full border-2 border-background bg-muted z-10" />
                    <div className="p-3 rounded-lg border border-dashed border-border bg-muted/10">
                      <p className="text-xs font-mono text-muted-foreground text-center">
                        End of timeline — {filteredLogs.length} events recorded
                        {lastTime && ` • Last event: ${format(lastTime, "HH:mm:ss")}`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
