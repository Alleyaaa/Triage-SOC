import { Link } from "wouter";
import {
  useGetDashboardStats, getGetDashboardStatsQueryKey,
  useGetRecentActivity, getGetRecentActivityQueryKey,
  useGetThreatBreakdown, getGetThreatBreakdownQueryKey,
  useGetSourceDistribution, getGetSourceDistributionQueryKey,
  useListSessions, getListSessionsQueryKey,
  useListReports, getListReportsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ShieldAlert, List, CheckCircle, Clock, Database,
  FileText, TrendingUp, ArrowRight, AlertTriangle,
  Shield, Activity, Eye,
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend, RadialBarChart, RadialBar,
} from "recharts";
import { SeverityBadge, SourceBadge } from "@/components/ui/badges";
import { format, formatDistanceToNow } from "date-fns";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
  informational: "#3b82f6",
};

const SOURCE_COLORS: Record<string, string> = {
  fortigate: "#06b6d4",
  watchguard: "#8b5cf6",
  agent_windows: "#3b82f6",
  agent_linux: "#10b981",
  unknown: "#6b7280",
};

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  session_analyzed: <CheckCircle className="h-4 w-4 text-green-400" />,
  session_created: <List className="h-4 w-4 text-blue-400" />,
  report_generated: <FileText className="h-4 w-4 text-orange-400" />,
  log_added: <Database className="h-4 w-4 text-muted-foreground" />,
};

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({
    query: { queryKey: getGetDashboardStatsQueryKey() },
  });
  const { data: activities, isLoading: activityLoading } = useGetRecentActivity({
    query: { queryKey: getGetRecentActivityQueryKey() },
  });
  const { data: threatData, isLoading: threatLoading } = useGetThreatBreakdown({
    query: { queryKey: getGetThreatBreakdownQueryKey() },
  });
  const { data: sourceData, isLoading: sourceLoading } = useGetSourceDistribution({
    query: { queryKey: getGetSourceDistributionQueryKey() },
  });
  const { data: sessions } = useListSessions({ query: { queryKey: getListSessionsQueryKey() } });
  const { data: reports } = useListReports({ query: { queryKey: getListReportsQueryKey() } });

  const criticalHighCount = (stats?.criticalCount ?? 0) + (stats?.highCount ?? 0);

  const alertSessions = sessions
    ?.filter((s) => s.status === "analyzed" && s.hasReport)
    .slice(0, 3) ?? [];

  const criticalReports = reports
    ?.filter((r) => r.severity === "critical" || r.severity === "high")
    .slice(0, 5) ?? [];

  const threatPieData = (threatData ?? [])
    .filter((d) => d.count > 0)
    .map((d) => ({ ...d, fill: SEVERITY_COLORS[d.severity] ?? "#6b7280" }));

  const sourceBarData = (sourceData ?? []).filter((d) => d.count > 0);

  const radialData = [
    { name: "Analyzed", value: stats?.analyzedSessions ?? 0, fill: "#22c55e" },
    { name: "Open", value: stats?.openSessions ?? 0, fill: "#f97316" },
  ];

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-mono uppercase text-foreground">
            Overview
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            SOC Triage Dashboard — Real-time security operations center
          </p>
        </div>
        <Link href="/sessions">
          <Button className="gap-2">
            <TrendingUp className="h-4 w-4" /> New Triage Session
          </Button>
        </Link>
      </div>

      {criticalHighCount > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-4">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-400">
              {criticalHighCount} Critical / High severity threat{criticalHighCount > 1 ? "s" : ""} detected
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review analyzed sessions for immediate action
            </p>
          </div>
          <Link href="/reports">
            <Button variant="outline" size="sm" className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-1">
              View Reports <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      )}

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <StatCard title="Total Sessions" value={stats?.totalSessions} loading={statsLoading} icon={List} color="text-blue-400" />
        <StatCard title="Open" value={stats?.openSessions} loading={statsLoading} icon={Clock} color="text-orange-400" />
        <StatCard title="Analyzed" value={stats?.analyzedSessions} loading={statsLoading} icon={CheckCircle} color="text-green-400" />
        <StatCard title="Total Logs" value={stats?.totalLogs} loading={statsLoading} icon={Database} color="text-cyan-400" />
        <StatCard title="Reports" value={stats?.totalReports} loading={statsLoading} icon={FileText} color="text-purple-400" />
        <StatCard
          title="Critical / High"
          value={criticalHighCount}
          loading={statsLoading}
          icon={ShieldAlert}
          color={criticalHighCount > 0 ? "text-red-400" : "text-muted-foreground"}
          highlight={criticalHighCount > 0}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5 bg-card border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono uppercase flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Log Source Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[260px] pt-2">
            {sourceLoading ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceBarData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <XAxis dataKey="source" stroke="#555" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#555" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", fontSize: 12 }}
                    formatter={(v, name, props) => [v, props.payload.source]}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {sourceBarData.map((entry) => (
                      <Cell key={entry.source} fill={SOURCE_COLORS[entry.source] ?? "#6b7280"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-4 bg-card border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono uppercase flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" /> Threat Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[260px] pt-2">
            {threatLoading ? (
              <Skeleton className="w-full h-full" />
            ) : threatPieData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No reports yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={threatPieData}
                    dataKey="count"
                    nameKey="severity"
                    cx="45%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {threatPieData.map((entry) => (
                      <Cell key={entry.severity} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", fontSize: 12 }}
                  />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => (
                      <span style={{ fontSize: 11, textTransform: "capitalize" }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 bg-card border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono uppercase flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" /> Session Status
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[260px] pt-2 flex flex-col items-center justify-center gap-4">
            {statsLoading ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <RadialBarChart
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={70}
                    data={radialData}
                    startAngle={180}
                    endAngle={-180}
                  >
                    <RadialBar dataKey="value" cornerRadius={4} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", fontSize: 12 }}
                    />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 text-xs">
                  {radialData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
                      <span className="text-muted-foreground">{d.name}</span>
                      <span className="font-bold font-mono">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7 bg-card border-card-border">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-mono uppercase flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Recent Activity
            </CardTitle>
            <Link href="/sessions">
              <Button variant="ghost" size="sm" className="text-xs gap-1 text-muted-foreground h-7">
                All sessions <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (activities?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No activity yet.</p>
            ) : (
              <div className="space-y-1">
                {activities?.slice(0, 8).map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center gap-3 p-2.5 rounded-md hover:bg-muted/30 transition-colors group"
                  >
                    <div className="shrink-0">
                      {ACTIVITY_ICONS[activity.type] ?? <Activity className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{activity.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{activity.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {activity.severity && <SeverityBadge severity={activity.severity} />}
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5 bg-card border-card-border">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-mono uppercase flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" /> Active Threats
            </CardTitle>
            <Link href="/reports">
              <Button variant="ghost" size="sm" className="text-xs gap-1 text-muted-foreground h-7">
                All reports <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {criticalReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Shield className="h-8 w-8 text-green-400/50" />
                <p className="text-sm text-muted-foreground">No critical or high threats</p>
                <p className="text-xs text-muted-foreground">System appears clean</p>
              </div>
            ) : (
              <div className="space-y-2">
                {criticalReports.map((report) => (
                  <Link key={report.id} href={`/reports/${report.id}`}>
                    <div className="flex items-center gap-3 p-3 rounded-md border border-border hover:bg-muted/30 transition-colors cursor-pointer">
                      <SeverityBadge severity={report.severity} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-muted-foreground">Session #{report.sessionId}</p>
                        <p className="text-sm truncate">{report.summary.slice(0, 60)}...</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(report.createdAt), "MMM d, HH:mm")}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {(sessions?.length ?? 0) > 0 && (
        <Card className="bg-card border-card-border">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-mono uppercase flex items-center gap-2">
              <List className="h-4 w-4 text-primary" /> Triage Sessions
            </CardTitle>
            <Link href="/sessions">
              <Button variant="ghost" size="sm" className="text-xs gap-1 text-muted-foreground h-7">
                Manage all <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sessions?.slice(0, 6).map((session) => (
                <Link key={session.id} href={`/sessions/${session.id}`}>
                  <div className="p-3 rounded-md border border-border hover:bg-muted/30 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-mono text-muted-foreground">#{session.id}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase font-bold ${
                        session.status === "analyzed"
                          ? "bg-green-500/10 text-green-400"
                          : session.status === "analyzing"
                          ? "bg-yellow-500/10 text-yellow-400"
                          : session.status === "closed"
                          ? "bg-muted text-muted-foreground"
                          : "bg-blue-500/10 text-blue-400"
                      }`}>
                        {session.status}
                      </span>
                    </div>
                    <p className="text-sm font-medium truncate">{session.title}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Database className="h-3 w-3" /> {session.logCount} logs
                      </span>
                      <span>{formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  title, value, icon: Icon, loading, color = "text-foreground", highlight = false,
}: {
  title: string;
  value?: number;
  icon: React.ElementType;
  loading: boolean;
  color?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={`bg-card border-card-border ${highlight ? "border-red-500/30 bg-red-500/5" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground font-medium">{title}</p>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        {loading ? (
          <Skeleton className="h-8 w-12" />
        ) : (
          <div className={`text-3xl font-bold font-mono ${color}`}>{value ?? 0}</div>
        )}
      </CardContent>
    </Card>
  );
}
