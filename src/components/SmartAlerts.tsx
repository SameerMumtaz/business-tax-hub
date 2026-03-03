import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useExpenses, useSales } from "@/hooks/useData";
import { useInvoices } from "@/hooks/useInvoices";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Clock, Tag, Upload, FileText, Receipt } from "lucide-react";

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
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: taxFilings = [] } = useQuery({
    queryKey: ["sales-tax-filings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_tax_filings" as any)
        .select("*")
        .eq("user_id", user!.id);
      return (data || []) as any[];
    },
  });

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

    // Sales tax filing reminder
    const quarterDueDates = [
      { quarter: 1, label: "Q1 2026", due: new Date(2026, 3, 30), start: "2026-01-01", end: "2026-03-31" },
      { quarter: 2, label: "Q2 2026", due: new Date(2026, 6, 31), start: "2026-04-01", end: "2026-06-30" },
      { quarter: 3, label: "Q3 2026", due: new Date(2026, 9, 31), start: "2026-07-01", end: "2026-09-30" },
      { quarter: 4, label: "Q4 2026", due: new Date(2027, 0, 31), start: "2026-10-01", end: "2026-12-31" },
    ];
    for (const q of quarterDueDates) {
      const filed = taxFilings.some((f: any) => f.period_label === q.label && f.filed_at);
      if (filed) continue;
      const qSales = sales.filter((s) => s.date >= q.start && s.date <= q.end);
      const taxCollected = qSales.reduce((s, r) => s + (r.taxCollected || 0), 0);
      if (taxCollected <= 0) continue;
      const daysUntilDue = Math.ceil((q.due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilDue <= 30 && daysUntilDue > 0) {
        result.push({
          id: `sales-tax-${q.quarter}`,
          severity: daysUntilDue <= 7 ? "urgent" : "warning",
          icon: Receipt,
          title: `${q.label} sales tax not filed — due in ${daysUntilDue} days`,
          description: `${formatCurrency(taxCollected)} in sales tax collected needs to be filed.`,
          actionLabel: "View Sales Tax",
          actionPath: "/tax-center?tab=sales-tax",
        });
      } else if (daysUntilDue < 0) {
        result.push({
          id: `sales-tax-${q.quarter}`,
          severity: "urgent",
          icon: Receipt,
          title: `${q.label} sales tax filing OVERDUE`,
          description: `${formatCurrency(taxCollected)} in sales tax was due ${q.due.toLocaleDateString()}.`,
          actionLabel: "View Sales Tax",
          actionPath: "/tax-center?tab=sales-tax",
        });
      }
    }

    return result;
  }, [expenses, sales, invoices, taxFilings]);

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
