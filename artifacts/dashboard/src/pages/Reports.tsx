import { useListReports, getListReportsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SeverityBadge } from "@/components/ui/badges";
import { Search, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { EmptyState } from "@/components/EmptyState";

export default function Reports() {
  const [search, setSearch] = useState("");
  const [, setLocation] = useLocation();

  const { data: reports, isLoading } = useListReports({ query: { queryKey: getListReportsQueryKey() } });

  const filteredReports = reports?.filter(r => 
    r.summary.toLowerCase().includes(search.toLowerCase()) ||
    r.sessionId.toString().includes(search) ||
    r.severity.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 flex flex-col h-full">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-mono uppercase">AI Analysis Reports</h1>
        <p className="text-muted-foreground">Review completed threat intelligence narratives and IOCs.</p>
      </div>

      <Card className="flex-1 flex flex-col min-h-0 bg-card border-card-border overflow-hidden">
        <div className="p-4 border-b border-card-border flex gap-4 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search reports by content, severity, or session ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : filteredReports.length === 0 ? (
            <EmptyState title="No reports found" description="Analyze a triage session to generate a report." />
          ) : (
            <Table>
              <TableHeader className="bg-muted/50 sticky top-0">
                <TableRow>
                  <TableHead className="w-[100px]">ID</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReports.map((report) => (
                  <TableRow key={report.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setLocation(`/reports/${report.id}`)}>
                    <TableCell className="font-mono text-muted-foreground">#{report.id}</TableCell>
                    <TableCell><SeverityBadge severity={report.severity} /></TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      <Link href={`/sessions/${report.sessionId}`} className="hover:text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                        Session {report.sessionId}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-md truncate">{report.summary}</TableCell>
                    <TableCell>{format(new Date(report.createdAt), 'MMM d, HH:mm')}</TableCell>
                    <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}