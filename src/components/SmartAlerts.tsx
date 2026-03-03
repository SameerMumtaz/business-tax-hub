import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useExpenses, useSales } from "@/hooks/useData";
import { useInvoices } from "@/hooks/useInvoices";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Clock, Tag, Upload, FileText } from "lucide-react";

interface SmartAlert {
  id: string;
  severity: "info" | "warning" | "urgent";
  icon: typeof AlertTriangle;
  title: string;
  description: string;
  actionLabel: string;
  actionPath: string;
}

export default function SmartAlerts() {
  const { data: expenses = [] } = useExpenses();
  const { data: sales = [] } = useSales();
  const { data: invoices = [] } = useInvoices();
  const navigate = useNavigate();

  const alerts = useMemo(() => {
    const result: SmartAlert[] = [];

    // No data at all
    if (expenses.length === 0 && sales.length === 0) {
      result.push({
        id: "no-data",
        severity: "info",
        icon: Upload,
        title: "Import your first transactions",
        description: "Upload a bank statement or CSV to get started. Bookie will automatically sort your income and expenses.",
        actionLabel: "Import Now",
        actionPath: "/import",
      });
      return result;
    }

    // Uncategorized expenses
    const uncategorized = expenses.filter((e) => e.category === "Other" || !e.category);
    if (uncategorized.length > 0) {
      result.push({
        id: "uncategorized",
        severity: "warning",
        icon: Tag,
        title: `${uncategorized.length} expense${uncategorized.length !== 1 ? "s" : ""} need categorization`,
        description: `${formatCurrency(uncategorized.reduce((s, e) => s + e.amount, 0))} in uncategorized expenses may affect your tax deductions.`,
        actionLabel: "Categorize Now",
        actionPath: "/expenses",
      });
    }

    // Overdue invoices
    const overdue = invoices.filter((inv) => {
      if (inv.status === "paid") return false;
      if (!inv.due_date) return false;
      return new Date(inv.due_date) < new Date();
    });
    if (overdue.length > 0) {
      result.push({
        id: "overdue",
        severity: "urgent",
        icon: Clock,
        title: `${overdue.length} overdue invoice${overdue.length !== 1 ? "s" : ""}`,
        description: `${formatCurrency(overdue.reduce((s, inv) => s + inv.total, 0))} in unpaid invoices past their due date.`,
        actionLabel: "View Invoices",
        actionPath: "/aging",
      });
    }

    // Sales without invoices
    const invoicedSaleIds = new Set(invoices.filter((i) => i.matched_sale_id).map((i) => i.matched_sale_id));
    const uninvoiced = sales.filter((s) => !invoicedSaleIds.has(s.id));
    if (uninvoiced.length > 5) {
      result.push({
        id: "uninvoiced",
        severity: "info",
        icon: FileText,
        title: `${uninvoiced.length} sales without invoices`,
        description: "Creating invoices for your sales helps with record keeping and makes tax time easier.",
        actionLabel: "View Sales",
        actionPath: "/sales",
      });
    }

    // Quarterly tax reminder
    const now = new Date();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const deadlines = [
      new Date(now.getFullYear(), 3, 15), // Q1: Apr 15
      new Date(now.getFullYear(), 5, 15), // Q2: Jun 15
      new Date(now.getFullYear(), 8, 15), // Q3: Sep 15
      new Date(now.getFullYear() + 1, 0, 15), // Q4: Jan 15
    ];
    const nextDeadline = deadlines[quarter - 1];
    const daysUntil = Math.ceil((nextDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil > 0 && daysUntil <= 30) {
      result.push({
        id: "quarterly-tax",
        severity: daysUntil <= 7 ? "urgent" : "warning",
        icon: AlertTriangle,
        title: `Quarterly taxes due in ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`,
        description: `Q${quarter} estimated taxes are due ${nextDeadline.toLocaleDateString("en-US", { month: "long", day: "numeric" })}. Check your tax estimates.`,
        actionLabel: "View Tax Center",
        actionPath: "/tax-center",
      });
    }

    return result;
  }, [expenses, sales, invoices]);

  if (alerts.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
        <div className="rounded-full bg-accent p-2">
          <CheckCircle2 className="h-5 w-5 text-chart-positive" />
        </div>
        <div>
          <p className="text-sm font-medium">You're all caught up!</p>
          <p className="text-xs text-muted-foreground">No action items right now.</p>
        </div>
      </div>
    );
  }

  const severityOrder = { urgent: 0, warning: 1, info: 2 };
  const sorted = [...alerts].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Action Items</h2>
      {sorted.map((alert) => (
        <div
          key={alert.id}
          className={`rounded-lg border p-4 flex items-start gap-4 ${
            alert.severity === "urgent"
              ? "border-destructive/50 bg-destructive/5"
              : alert.severity === "warning"
              ? "border-yellow-500/50 bg-yellow-500/5"
              : "border-border bg-card"
          }`}
        >
          <div className={`rounded-full p-2 shrink-0 ${
            alert.severity === "urgent" ? "bg-destructive/10" : alert.severity === "warning" ? "bg-yellow-500/10" : "bg-muted"
          }`}>
            <alert.icon className={`h-4 w-4 ${
              alert.severity === "urgent" ? "text-destructive" : alert.severity === "warning" ? "text-yellow-600" : "text-muted-foreground"
            }`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{alert.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{alert.description}</p>
          </div>
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => navigate(alert.actionPath)}>
            {alert.actionLabel}
          </Button>
        </div>
      ))}
    </div>
  );
}
