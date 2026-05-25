import { useParams, Link } from "wouter";
import { useGetReport, getGetReportQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { SeverityBadge } from "@/components/ui/badges";
import { ArrowLeft, Target, Shield, Server, FileText, Crosshair } from "lucide-react";
import { format } from "date-fns";

const MITRE_TACTIC_COLORS: Record<string, string> = {
  "T1078": "bg-red-500/10 text-red-400 border-red-500/30",
  "T1003": "bg-red-500/10 text-red-400 border-red-500/30",
  "T1059": "bg-orange-500/10 text-orange-400 border-orange-500/30",
  "T1055": "bg-orange-500/10 text-orange-400 border-orange-500/30",
  "T1021": "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  "T1110": "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
};

function getMitreColor(technique: string): string {
  const tid = technique.match(/T\d{4}/)?.[0];
  return tid && MITRE_TACTIC_COLORS[tid]
    ? MITRE_TACTIC_COLORS[tid]
    : "bg-primary/10 text-primary border-primary/20";
}

export default function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const reportId = parseInt(id || "0", 10);

  const { data: report, isLoading } = useGetReport(reportId, {
    query: { enabled: !!reportId, queryKey: getGetReportQueryKey(reportId) },
  });

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-8 text-center text-muted-foreground">Report not found.</div>
    );
  }

  const mitreAttackTechniques = report.mitreAttackTechniques ?? [];

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/reports">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono uppercase">AI Threat Narrative</h1>
            <SeverityBadge severity={report.severity} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Generated {format(new Date(report.createdAt), "PPP p")} •{" "}
            <Link
              href={`/sessions/${report.sessionId}`}
              className="hover:text-primary hover:underline"
            >
              View Source Session #{report.sessionId}
            </Link>
            {report.n8nExecutionId && (
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                n8n: {report.n8nExecutionId}
              </span>
            )}
          </p>
        </div>
      </div>

      <Card className="bg-card border-card-border shadow-lg">
        <CardContent className="p-6 text-base leading-relaxed text-card-foreground whitespace-pre-line">
          {report.summary}
        </CardContent>
      </Card>

      {mitreAttackTechniques.length > 0 && (
        <Card className="bg-card border-card-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase">
              <Crosshair className="h-4 w-4" /> MITRE ATT&CK Techniques
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {mitreAttackTechniques.map((technique, i) => (
                <span
                  key={i}
                  className={`text-xs font-mono border px-2.5 py-1.5 rounded ${getMitreColor(technique)}`}
                >
                  {technique}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-card border-card-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase">
              <Target className="h-4 w-4" /> Indicators of Compromise
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.iocs.length > 0 ? (
              <ul className="space-y-2">
                {report.iocs.map((ioc, i) => (
                  <li
                    key={i}
                    className="text-sm font-mono bg-muted/50 p-2 rounded border border-border"
                  >
                    {ioc}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No IOCs identified.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase">
              <Shield className="h-4 w-4" /> Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.recommendations.length > 0 ? (
              <ol className="space-y-3">
                {report.recommendations.map((rec, i) => (
                  <li key={i} className="text-sm flex gap-3">
                    <span className="text-primary font-bold font-mono shrink-0 mt-0.5">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No recommendations provided.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase">
              <Server className="h-4 w-4" /> Attack Vector & Affected Systems
            </CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">
                Attack Vector
              </h4>
              <p className="text-sm bg-muted/30 p-3 rounded border border-border">
                {report.attackVector || "Not identified"}
              </p>
            </div>
            <div>
              <h4 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">
                Affected Systems
              </h4>
              {report.affectedSystems && report.affectedSystems.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {report.affectedSystems.map((sys, i) => (
                    <span
                      key={i}
                      className="text-xs font-mono bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded"
                    >
                      {sys}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">None identified.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="raw">
          <AccordionTrigger className="font-mono text-sm uppercase">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Raw AI Response
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <pre className="p-4 bg-muted/50 rounded-md text-xs font-mono overflow-x-auto border border-border whitespace-pre-wrap">
              {report.rawAiResponse}
            </pre>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
