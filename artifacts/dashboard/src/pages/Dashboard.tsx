import { useGetDashboardStats, getGetDashboardStatsQueryKey, useGetRecentActivity, getGetRecentActivityQueryKey, useGetThreatBreakdown, getGetThreatBreakdownQueryKey, useGetSourceDistribution, getGetSourceDistributionQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, List, CheckCircle, Clock } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { SeverityBadge } from "@/components/ui/badges";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({ query: { queryKey: getGetDashboardStatsQueryKey() } });
  const { data: activities, isLoading: activityLoading } = useGetRecentActivity({ query: { queryKey: getGetRecentActivityQueryKey() } });
  const { data: threatData, isLoading: threatLoading } = useGetThreatBreakdown({ query: { queryKey: getGetThreatBreakdownQueryKey() } });
  const { data: sourceData, isLoading: sourceLoading } = useGetSourceDistribution({ query: { queryKey: getGetSourceDistributionQueryKey() } });

  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-mono uppercase">Overview</h1>
        <p className="text-muted-foreground">Monitor triage sessions and automated analysis.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Sessions" value={stats?.totalSessions} loading={statsLoading} icon={List} />
        <StatCard title="Open" value={stats?.openSessions} loading={statsLoading} icon={Clock} />
        <StatCard title="Analyzed" value={stats?.analyzedSessions} loading={statsLoading} icon={CheckCircle} />
        <StatCard title="Critical / High" value={(stats?.criticalCount || 0) + (stats?.highCount || 0)} loading={statsLoading} icon={ShieldAlert} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 bg-card border-card-border">
          <CardHeader>
            <CardTitle>Log Source Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {sourceLoading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceData}>
                  <XAxis dataKey="source" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }} />
                  <Bar dataKey="count" fill="currentColor" className="fill-primary" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        
        <Card className="col-span-3 bg-card border-card-border">
          <CardHeader>
            <CardTitle>Threat Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {threatLoading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={threatData} dataKey="count" nameKey="severity" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
                    {threatData?.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-card-border">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="space-y-6">
              {activities?.map((activity) => (
                <div key={activity.id} className="flex items-center">
                  <div className="ml-4 space-y-1">
                    <p className="text-sm font-medium leading-none">{activity.title}</p>
                    <p className="text-sm text-muted-foreground">{activity.description}</p>
                  </div>
                  <div className="ml-auto flex items-center space-x-4">
                    {activity.severity && <SeverityBadge severity={activity.severity} />}
                    <div className="text-sm text-muted-foreground">
                      {format(new Date(activity.timestamp), 'PPp')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, loading }: { title: string; value?: number; icon: any; loading: boolean }) {
  return (
    <Card className="bg-card border-card-border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="text-2xl font-bold font-mono">{value || 0}</div>
        )}
      </CardContent>
    </Card>
  );
}