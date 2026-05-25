import { Badge } from "@/components/ui/badge";

export function SeverityBadge({ severity, className }: { severity: string, className?: string }) {
  const colorMap: Record<string, string> = {
    critical: "bg-red-500/10 text-red-500 border-red-500/20",
    high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    low: "bg-green-500/10 text-green-500 border-green-500/20",
    informational: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  };

  return (
    <Badge variant="outline" className={`${colorMap[severity.toLowerCase()] || "bg-gray-500/10 text-gray-500 border-gray-500/20"} ${className}`}>
      {severity.toUpperCase()}
    </Badge>
  );
}

export function SourceBadge({ source, className }: { source: string, className?: string }) {
  const colorMap: Record<string, string> = {
    fortigate: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    watchguard: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    agent_windows: "bg-green-500/10 text-green-500 border-green-500/20",
    agent_linux: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    unknown: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  };

  return (
    <Badge variant="outline" className={`${colorMap[source.toLowerCase()] || colorMap.unknown} ${className}`}>
      {source.replace('_', ' ').toUpperCase()}
    </Badge>
  );
}

export function StatusBadge({ status, className }: { status: string, className?: string }) {
  const colorMap: Record<string, string> = {
    open: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    analyzing: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    analyzed: "bg-green-500/10 text-green-500 border-green-500/20",
    closed: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  };

  return (
    <Badge variant="outline" className={`${colorMap[status.toLowerCase()] || colorMap.open} ${className}`}>
      {status.toUpperCase()}
    </Badge>
  );
}