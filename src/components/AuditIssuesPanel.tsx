import { useState } from "react";
import { AuditIssue, AuditResult } from "@/lib/audit";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ShieldAlert, Ban, AlertTriangle, Info, Trash2, Eye, FileText, Zap, CheckCircle2, Undo2 } from "lucide-react";

interface AuditIssuesPanelProps {
  result: AuditResult;
  /** Full unfiltered audit result (includes dismissed issues) — shown when toggle is on */
  unfilteredResult?: AuditResult;
  getItemLabel: (id: string) => { date: string; label: string; amount: number } | null;
  onDeleteItems?: (ids: string[]) => void;
  onSelectItems?: (ids: string[]) => void;
  onCreateInvoice?: (saleId: string) => void;
  onBatchCreateInvoices?: (saleIds: string[]) => void;
  onDismissItems?: (items: { transactionId: string; issueType: string }[]) => void;
  onUndismissItems?: (items: { transactionId: string; issueType: string }[]) => void;
  /** Set of "transactionId::issueType" strings that are dismissed */
  dismissedSet?: Set<string>;
}

export default function AuditIssuesPanel({ result, unfilteredResult, getItemLabel, onDeleteItems, onSelectItems, onCreateInvoice, onBatchCreateInvoices, onDismissItems, onUndismissItems, dismissedSet }: AuditIssuesPanelProps) {
  const [sessionDismissed, setSessionDismissed] = useState<Set<number>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);

  const displayResult = showDismissed && unfilteredResult ? unfilteredResult : result;

  const dismissSession = (idx: number) => {
    setSessionDismissed((prev) => new Set(prev).add(idx));
  };

  const dismissPersistent = (issue: AuditIssue, idx: number) => {
    if (onDismissItems && issue.affected_ids.length > 0) {
      onDismissItems(issue.affected_ids.map((id) => ({ transactionId: id, issueType: issue.type })));
    }
    dismissSession(idx);
  };

  const undismissIssue = (issue: AuditIssue) => {
    if (onUndismissItems && issue.affected_ids.length > 0) {
      onUndismissItems(issue.affected_ids.map((id) => ({ transactionId: id, issueType: issue.type })));
    }
  };

  const activeIssues = displayResult.issues.filter((_, i) => !sessionDismissed.has(i));
  const dismissedCount = unfilteredResult
    ? unfilteredResult.issues.length - result.issues.length
    : 0;

  // Check if an issue is entirely dismissed (all affected_ids are in dismissedSet)
  const isIssueDismissed = (issue: AuditIssue): boolean => {
    if (!dismissedSet || issue.affected_ids.length === 0) return false;
    return issue.affected_ids.every((id) => dismissedSet.has(`${id}::${issue.type}`));
  };

  if (result.issues.length === 0 && dismissedCount === 0) {
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
        <div className="flex items-center gap-3">
          {dismissedCount > 0 && (
            <div className="flex items-center gap-2">
              <Switch id="show-dismissed" checked={showDismissed} onCheckedChange={setShowDismissed} />
              <Label htmlFor="show-dismissed" className="text-xs text-muted-foreground cursor-pointer">
                Show {dismissedCount} dismissed
              </Label>
            </div>
          )}
          {result.riskLevel && (
            <Badge variant={result.riskLevel === "high" ? "destructive" : result.riskLevel === "medium" ? "secondary" : "outline"}>
              Risk: {result.riskLevel}
            </Badge>
          )}
          {result.totalDollarImpact > 0 && (
            <Badge variant="outline" className="text-[10px] font-mono">
              {formatCurrency(result.totalDollarImpact)} impacted
            </Badge>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">{displayResult.summary}</p>

      <div className="space-y-2">
        {displayResult.issues.map((issue, idx) => {
          if (sessionDismissed.has(idx)) return null;
          const isDismissed = isIssueDismissed(issue);
          const SeverityIcon = issue.severity === "high" ? Ban
            : issue.severity === "medium" ? AlertTriangle : Info;
          const severityColor = issue.severity === "high" ? "text-destructive"
            : issue.severity === "medium" ? "text-chart-warning" : "text-muted-foreground";

          return (
            <div key={idx} className={`rounded-lg p-3 space-y-2 ${isDismissed ? "bg-muted/40 opacity-60 border border-dashed border-muted-foreground/20" : "bg-muted"}`}>
              <div className="flex items-start gap-3">
                <SeverityIcon className={`h-4 w-4 mt-0.5 shrink-0 ${severityColor}`} />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{issue.title}</span>
                    {isDismissed && <Badge variant="outline" className="text-[10px] bg-muted">dismissed</Badge>}
                    <Badge variant="outline" className="text-[10px]">{issue.type.replace(/_/g, " ")}</Badge>
                    <Badge
                      variant={issue.severity === "high" ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {issue.severity}
                    </Badge>
                    {issue.dollarImpact > 0 && (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {formatCurrency(issue.dollarImpact)}
                      </Badge>
                    )}
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
                <div className="flex gap-1 shrink-0 flex-wrap">
                  {isDismissed && onUndismissItems ? (
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => undismissIssue(issue)}>
                      <Undo2 className="h-3 w-3 mr-1" /> Restore
                    </Button>
                  ) : (
                    <>
                      {issue.type === "missing_invoice" && onBatchCreateInvoices && issue.affected_ids.length > 1 && (
                        <Button variant="default" size="sm" className="text-xs h-7" onClick={() => onBatchCreateInvoices(issue.affected_ids)}>
                          <Zap className="h-3 w-3 mr-1" /> Create All ({issue.affected_ids.length})
                        </Button>
                      )}
                      {onSelectItems && issue.affected_ids.length > 0 && (
                        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => onSelectItems(issue.affected_ids)}>
                          <Eye className="h-3 w-3 mr-1" /> Select
                        </Button>
                      )}
                      {onDeleteItems && issue.affected_ids.length > 0 && (issue.suggestion === "delete" || issue.suggestion === "review") && (
                        <Button
                          variant="outline" size="sm" className="text-xs h-7 text-destructive"
                          onClick={() => { onDeleteItems(issue.affected_ids); dismissSession(idx); }}
                        >
                          <Trash2 className="h-3 w-3 mr-1" /> Remove
                        </Button>
                      )}
                      {onDismissItems && issue.affected_ids.length > 0 && (
                        <Button
                          variant="outline" size="sm" className="text-xs h-7"
                          onClick={() => dismissPersistent(issue, idx)}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Not an Issue
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => dismissSession(idx)}>
                        Dismiss
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {issue.affected_ids.length > 0 && (
                <div className="ml-7 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    Affected transactions
                    {issue.type === "missing_invoice" && onCreateInvoice && (
                      <span className="ml-1 text-primary normal-case">(click to create invoice)</span>
                    )}
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {issue.affected_ids.slice(0, 8).map((id) => {
                      const item = getItemLabel(id);
                      if (!item) return null;
                      const isInvoiceIssue = issue.type === "missing_invoice" && onCreateInvoice;
                      return (
                        <div
                          key={id}
                          className={`flex items-center gap-2 text-xs px-2 py-1 rounded transition-colors ${isInvoiceIssue ? "hover:bg-primary/10 cursor-pointer group" : "hover:bg-background/60"}`}
                          onClick={isInvoiceIssue ? () => onCreateInvoice(id) : undefined}
                        >
                          <span className="font-mono text-muted-foreground w-20 shrink-0">{item.date}</span>
                          <span className="truncate flex-1">{item.label}</span>
                          <span className="font-mono shrink-0">{formatCurrency(item.amount)}</span>
                          {isInvoiceIssue && (
                            <FileText className="h-3 w-3 text-primary shrink-0 opacity-50 group-hover:opacity-100" />
                          )}
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