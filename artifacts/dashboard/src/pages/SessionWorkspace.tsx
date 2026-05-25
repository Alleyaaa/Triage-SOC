import { useParams, Link } from "wouter";
import {
  useGetSession, getGetSessionQueryKey,
  useGetSessionLogs, getGetSessionLogsQueryKey,
  useAddLogToSession,
  useRemoveLogFromSession,
  useGetSessionCorrelations, getGetSessionCorrelationsQueryKey,
  useAnalyzeSession,
  useUpdateSession,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SourceBadge, StatusBadge, SeverityBadge } from "@/components/ui/badges";
import { ArrowLeft, Plus, BrainCircuit, Trash2, ShieldAlert, Shield, AlertTriangle, GitBranch } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { extractIpFromJson } from "@/lib/ip-extractor";
import { EmptyState } from "@/components/EmptyState";

const LogEntryInputSource = {
  fortigate: "fortigate" as const,
  watchguard: "watchguard" as const,
  agent_windows: "agent_windows" as const,
  agent_linux: "agent_linux" as const,
  unknown: "unknown" as const,
};
type LogEntryInputSource = typeof LogEntryInputSource[keyof typeof LogEntryInputSource];

function maskIpClient(ip: string): string {
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
  if (ip.includes(":")) {
    const segs = ip.split(":");
    const half = Math.ceil(segs.length / 2);
    return segs.slice(0, half).join(":") + ":****:****";
  }
  return "***.***.***";
}

const RISK_COLORS: Record<string, string> = {
  critical: "border-red-500/50 bg-red-500/5",
  high: "border-orange-500/50 bg-orange-500/5",
  medium: "border-yellow-500/50 bg-yellow-500/5",
  low: "border-border bg-muted/20",
};

const RISK_SCORE_COLOR: Record<string, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
  low: "text-muted-foreground",
};

const IP_TYPE_LABEL: Record<string, string> = {
  private: "INTERNAL",
  public: "EXTERNAL",
  loopback: "LOOPBACK",
  "link-local": "LINK-LOCAL",
  multicast: "MCAST",
  unknown: "",
};

export default function SessionWorkspace() {
  const { id } = useParams<{ id: string }>();
  const sessionId = parseInt(id || "0", 10);
  const queryClient = useQueryClient();

  const [rawJson, setRawJson] = useState("");
  const [source, setSource] = useState<LogEntryInputSource>(LogEntryInputSource.fortigate);
  const [maskIps, setMaskIps] = useState(false);
  const [additionalContext, setAdditionalContext] = useState("");
  const [showContext, setShowContext] = useState(false);

  const { data: session, isLoading: sessionLoading } = useGetSession(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetSessionQueryKey(sessionId) },
  });
  const { data: logs, isLoading: logsLoading } = useGetSessionLogs(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetSessionLogsQueryKey(sessionId) },
  });
  const { data: correlations, isLoading: correlationsLoading } = useGetSessionCorrelations(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetSessionCorrelationsQueryKey(sessionId) },
  });

  const addLogMutation = useAddLogToSession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSessionLogsQueryKey(sessionId) });
        queryClient.invalidateQueries({ queryKey: getGetSessionCorrelationsQueryKey(sessionId) });
        queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
        setRawJson("");
      },
    },
  });

  const removeLogMutation = useRemoveLogFromSession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSessionLogsQueryKey(sessionId) });
        queryClient.invalidateQueries({ queryKey: getGetSessionCorrelationsQueryKey(sessionId) });
        queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
      },
    },
  });

  const analyzeMutation = useAnalyzeSession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
      },
    },
  });

  const updateSessionMutation = useUpdateSession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
      },
    },
  });

  const handleAddLog = () => {
    addLogMutation.mutate({ id: sessionId, data: { source, rawJson } });
  };

  const handleAnalyze = () => {
    analyzeMutation.mutate({
      id: sessionId,
      data: { maskIps, additionalContext: additionalContext || undefined },
    });
  };

  const detectedIp = extractIpFromJson(rawJson, source);

  if (sessionLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!session) {
    return <div className="p-8">Session not found.</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border bg-card p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/sessions">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold font-mono">{session.title}</h1>
              <StatusBadge status={session.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Session #{session.id} • Created {format(new Date(session.createdAt), "MMM d, yyyy HH:mm")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch id="mask-ips" checked={maskIps} onCheckedChange={setMaskIps} />
            <Label htmlFor="mask-ips" className="text-sm font-medium">
              Mask IPs
            </Label>
          </div>
          <Button
            onClick={handleAnalyze}
            disabled={
              analyzeMutation.isPending ||
              session.status === "analyzing" ||
              (logs?.length || 0) === 0
            }
            className="gap-2"
          >
            <BrainCircuit className="h-4 w-4" />
            {analyzeMutation.isPending || session.status === "analyzing"
              ? "Analyzing..."
              : "Analyze with AI"}
          </Button>
          <Link href={`/sessions/${sessionId}/timeline`}>
            <Button variant="outline" size="sm" className="gap-2">
              <GitBranch className="h-4 w-4" /> Timeline
            </Button>
          </Link>
          {session.status === "open" ? (
            <Button
              variant="outline"
              onClick={() =>
                updateSessionMutation.mutate({ id: sessionId, data: { status: "closed" } })
              }
            >
              Close Session
            </Button>
          ) : session.status === "closed" ? (
            <Button
              variant="outline"
              onClick={() =>
                updateSessionMutation.mutate({ id: sessionId, data: { status: "open" } })
              }
            >
              Reopen
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {session.report && (
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-primary" />
                  Analysis Report Ready
                </CardTitle>
                <SeverityBadge severity={session.report.severity} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm mb-4 line-clamp-2">{session.report.summary}</p>
              <Link href={`/reports/${session.report.id}`}>
                <Button variant="secondary" size="sm">
                  View Full Report
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="flex flex-col h-[500px] border-card-border bg-card">
            <CardHeader className="py-3 px-4 border-b border-border shrink-0">
              <CardTitle className="text-sm font-mono uppercase">
                Log Entries ({logs?.length || 0})
              </CardTitle>
            </CardHeader>
            <div className="flex-1 overflow-auto p-4">
              {logsLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (logs?.length || 0) === 0 ? (
                <EmptyState
                  title="No logs yet"
                  description="Add logs from the right panel to begin correlation."
                />
              ) : (
                <div className="space-y-3">
                  {logs?.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded border border-border bg-muted/30 relative group text-sm"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <SourceBadge source={log.source} />
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {format(new Date(log.createdAt), "HH:mm:ss")}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                            onClick={() =>
                              removeLogMutation.mutate({ id: sessionId, logId: log.id })
                            }
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="font-mono text-xs overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground">
                        {log.rawJson}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
                        {log.extractedIp && (
                          <span>
                            src:{" "}
                            <span className="text-primary font-bold">
                              {maskIps ? maskIpClient(log.extractedIp) : log.extractedIp}
                            </span>
                            {log.ipType && log.ipType !== "unknown" && (
                              <span className="ml-1 text-muted-foreground">({log.ipType})</span>
                            )}
                          </span>
                        )}
                        {log.dstIp && (
                          <span>
                            dst:{" "}
                            <span className="text-muted-foreground">
                              {maskIps ? maskIpClient(log.dstIp) : log.dstIp}
                              {log.dstPort ? `:${log.dstPort}` : ""}
                            </span>
                          </span>
                        )}
                        {log.protocol && (
                          <span className="text-muted-foreground uppercase">{log.protocol}</span>
                        )}
                        {log.actionTaken && (
                          <span
                            className={
                              log.actionTaken === "blocked"
                                ? "text-red-400"
                                : log.actionTaken === "allowed"
                                ? "text-green-400"
                                : log.actionTaken === "detected"
                                ? "text-yellow-400"
                                : "text-muted-foreground"
                            }
                          >
                            {log.actionTaken.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card className="flex flex-col h-[500px] border-card-border bg-card">
            <CardHeader className="py-3 px-4 border-b border-border shrink-0">
              <CardTitle className="text-sm font-mono uppercase">Add Log Entry</CardTitle>
            </CardHeader>
            <div className="p-4 flex flex-col h-full gap-4 overflow-auto">
              <div className="space-y-2">
                <Label>Source System</Label>
                <Select
                  value={source}
                  onValueChange={(v: LogEntryInputSource) => setSource(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={LogEntryInputSource.fortigate}>
                      FortiGate Firewall
                    </SelectItem>
                    <SelectItem value={LogEntryInputSource.watchguard}>WatchGuard EDR</SelectItem>
                    <SelectItem value={LogEntryInputSource.agent_windows}>Windows Agent</SelectItem>
                    <SelectItem value={LogEntryInputSource.agent_linux}>Linux Agent</SelectItem>
                    <SelectItem value={LogEntryInputSource.unknown}>
                      Unknown (auto-detect)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 flex-1 flex flex-col min-h-0">
                <Label>Raw JSON Log</Label>
                <Textarea
                  className="flex-1 font-mono text-xs resize-none"
                  placeholder='{"data":{"srcip":"1.2.3.4",...}}'
                  value={rawJson}
                  onChange={(e) => setRawJson(e.target.value)}
                />
                {detectedIp && (
                  <p className="text-xs text-primary font-mono bg-primary/10 p-2 rounded border border-primary/20">
                    Detected src IP: {detectedIp}
                  </p>
                )}
              </div>
              <div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground underline mb-1"
                  onClick={() => setShowContext((v) => !v)}
                >
                  {showContext ? "Hide" : "Add"} analyst context for AI
                </button>
                {showContext && (
                  <Textarea
                    className="font-mono text-xs resize-none h-16"
                    placeholder="Additional context for AI analysis (e.g. known campaign, affected user)..."
                    value={additionalContext}
                    onChange={(e) => setAdditionalContext(e.target.value)}
                  />
                )}
              </div>
              <Button
                onClick={handleAddLog}
                disabled={!rawJson || addLogMutation.isPending}
                className="w-full"
              >
                <Plus className="mr-2 h-4 w-4" /> Add to Correlation
              </Button>
            </div>
          </Card>
        </div>

        <Card className="border-card-border bg-card">
          <CardHeader className="py-3 px-4 border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-mono uppercase">
                IP Correlation Map
              </CardTitle>
              {correlations && correlations.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  Sorted by threat score
                </span>
              )}
            </div>
          </CardHeader>
          <div className="p-4">
            {correlationsLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (correlations?.length || 0) === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No IPs extracted for correlation yet.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {correlations?.map((corr) => {
                  const riskLevel = corr.riskLevel ?? "low";
                  return (
                    <div
                      key={corr.ip}
                      className={`p-4 rounded-lg border space-y-3 ${RISK_COLORS[riskLevel] ?? RISK_COLORS.low}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono font-bold text-base">
                            {maskIps ? corr.maskedIp : corr.ip}
                          </span>
                          {corr.ipType && IP_TYPE_LABEL[corr.ipType] && (
                            <span className="ml-2 text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                              {IP_TYPE_LABEL[corr.ipType]}
                            </span>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div
                            className={`text-xl font-bold font-mono ${RISK_SCORE_COLOR[riskLevel] ?? ""}`}
                          >
                            {corr.threatScore}
                          </div>
                          <div className="text-[10px] text-muted-foreground uppercase">
                            {riskLevel}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {corr.sources.map((src) => (
                          <SourceBadge key={src} source={src} className="text-[10px] py-0 h-5" />
                        ))}
                      </div>

                      <div className="grid grid-cols-3 gap-1 text-center text-xs">
                        <div className="bg-background/40 rounded p-1.5">
                          <div className="font-bold text-red-400">
                            {corr.actionSummary?.blocked ?? 0}
                          </div>
                          <div className="text-muted-foreground text-[10px]">Blocked</div>
                        </div>
                        <div className="bg-background/40 rounded p-1.5">
                          <div className="font-bold text-green-400">
                            {corr.actionSummary?.allowed ?? 0}
                          </div>
                          <div className="text-muted-foreground text-[10px]">Allowed</div>
                        </div>
                        <div className="bg-background/40 rounded p-1.5">
                          <div className="font-bold text-yellow-400">
                            {corr.actionSummary?.detected ?? 0}
                          </div>
                          <div className="text-muted-foreground text-[10px]">Detected</div>
                        </div>
                      </div>

                      {corr.portsSeen && corr.portsSeen.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {corr.portsSeen.slice(0, 5).map((port) => (
                            <span
                              key={port}
                              className="text-[10px] font-mono bg-background/40 border border-border px-1.5 py-0.5 rounded"
                            >
                              :{port}
                            </span>
                          ))}
                          {corr.portsSeen.length > 5 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{corr.portsSeen.length - 5} more
                            </span>
                          )}
                        </div>
                      )}

                      <div className="text-xs text-muted-foreground flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          {riskLevel === "critical" || riskLevel === "high" ? (
                            <AlertTriangle className="h-3 w-3 text-orange-400" />
                          ) : (
                            <Shield className="h-3 w-3" />
                          )}
                          {corr.logCount} events
                        </span>
                        <span className="font-mono">score {corr.threatScore}/100</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
