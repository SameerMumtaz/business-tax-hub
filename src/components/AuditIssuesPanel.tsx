import { useState } from "react";
import { AuditIssue, AuditResult } from "@/lib/audit";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Ban, AlertTriangle, Info, Trash2, X, Eye } from "lucide-react";

interface AuditIssuesPanelProps {
  result: AuditResult;
  /** Map of id → display label (e.g. vendor name or client name) */
  getItemLabel: (id: string) => { date: string; label: string; amount: number } | null;
  onDeleteItems?: (ids: string[]) => void;
  onSelectItems?: (ids: string[]) => void;
}

export default function AuditIssuesPanel({ result, getItemLabel, onDeleteItems, onSelectItems }: AuditIssuesPanelProps) {
  const [dismissedIssues, setDismissedIssues] = useState<Set<number>>(new Set());

  const dismiss = (idx: number) => {
    setDismissedIssues((prev) => new Set(prev).add(idx));
  };

  const activeIssues = result.issues.filter((_, i) => !dismissedIssues.has(i));

  if (result.issues.length === 0) {
    return (
      <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
        <ShieldAlert className="h-4 w-4 text-chart-positive" />
        {result.summary}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-destructive" />
          CPA Audit Issues ({activeIssues.length} remaining)
        </h3>
        {result.riskLevel && (
          <Badge variant={result.riskLevel === "high" ? "destructive" : result.riskLevel === "medium" ? "secondary" : "outline"}>
            Risk: {result.riskLevel}
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">{result.summary}</p>

      <div className="space-y-2">
        {result.issues.map((issue, idx) => {
          if (dismissedIssues.has(idx)) return null;
          const SeverityIcon = issue.severity === "high" ? Ban
            : issue.severity === "medium" ? AlertTriangle : Info;
          const severityColor = issue.severity === "high" ? "text-destructive"
            : issue.severity === "medium" ? "text-chart-warning" : "text-muted-foreground";

          return (
            <div key={idx} className="bg-muted rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-3">
                <SeverityIcon className={`h-4 w-4 mt-0.5 shrink-0 ${severityColor}`} />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{issue.title}</span>
                    <Badge variant="outline" className="text-[10px]">{issue.type.replace(/_/g, " ")}</Badge>
                    <Badge
                      variant={issue.severity === "high" ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {issue.severity}
                    </Badge>
                    {issue.irs_reference && (
                      <Badge variant="outline" className="text-[10px] font-mono">{issue.irs_reference}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{issue.description}</p>
                  <p className="text-xs font-medium">💡 {issue.suggestion_detail}</p>
                  {issue.tax_impact && (
                    <p className="text-xs text-chart-warning font-medium">💰 Tax impact: {issue.tax_impact}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {onSelectItems && issue.affected_ids.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => onSelectItems(issue.affected_ids)}
                    >
                      <Eye className="h-3 w-3 mr-1" /> Select
                    </Button>
                  )}
                  {onDeleteItems && issue.affected_ids.length > 0 && (issue.suggestion === "delete" || issue.suggestion === "review") && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 text-destructive"
                      onClick={() => {
                        onDeleteItems(issue.affected_ids);
                        dismiss(idx);
                      }}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Remove
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => dismiss(idx)}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>

              {/* Affected items */}
              {issue.affected_ids.length > 0 && (
                <div className="ml-7 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Affected transactions</p>
                  <div className="flex flex-col gap-0.5">
                    {issue.affected_ids.slice(0, 8).map((id) => {
                      const item = getItemLabel(id);
                      if (!item) return null;
                      return (
                        <div
                          key={id}
                          className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-background/60 transition-colors"
                        >
                          <span className="font-mono text-muted-foreground w-20 shrink-0">{item.date}</span>
                          <span className="truncate flex-1">{item.label}</span>
                          <span className="font-mono shrink-0">{formatCurrency(item.amount)}</span>
                        </div>
                      );
                    })}
                    {issue.affected_ids.length > 8 && (
                      <span className="text-[10px] text-muted-foreground ml-2">…and {issue.affected_ids.length - 8} more</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
