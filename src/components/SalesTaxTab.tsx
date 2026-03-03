import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSales, useProfile } from "@/hooks/useData";
import { useDateRange } from "@/contexts/DateRangeContext";
import { formatCurrency } from "@/lib/format";
import ExportButton from "@/components/ExportButton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Clock, FileText } from "lucide-react";
import { toast } from "sonner";

interface SalesTaxFiling {
  id: string;
  period_label: string;
  period_start: string;
  period_end: string;
  tax_collected: number;
  filed_at: string | null;
}

const STATE_FILING_FREQ: Record<string, string> = {
  CA: "Quarterly (or monthly if >$10k/quarter)",
  TX: "Monthly or Quarterly based on tax liability",
  NY: "Quarterly",
  FL: "Monthly, Quarterly, or Semiannually",
  IL: "Monthly or Quarterly",
  PA: "Monthly or Quarterly",
  OH: "Semiannually",
  WA: "Monthly or Quarterly",
};

const QUARTER_RANGES = [
  { label: "Q1 2026", quarter: 1, start: "2026-01-01", end: "2026-03-31" },
  { label: "Q2 2026", quarter: 2, start: "2026-04-01", end: "2026-06-30" },
  { label: "Q3 2026", quarter: 3, start: "2026-07-01", end: "2026-09-30" },
  { label: "Q4 2026", quarter: 4, start: "2026-10-01", end: "2026-12-31" },
];

export default function SalesTaxTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: allSales = [] } = useSales();
  const { data: profile } = useProfile();
  const state = profile?.business_state || "";

  const { data: filings = [] } = useQuery({
    queryKey: ["sales-tax-filings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_tax_filings" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("period_start");
      return (data || []) as unknown as SalesTaxFiling[];
    },
  });

  const markFiled = useMutation({
    mutationFn: async (q: typeof QUARTER_RANGES[0]) => {
      const taxCollected = quarterData.find((d) => d.label === q.label)?.taxCollected || 0;
      // Check if filing exists
      const existing = filings.find((f) => f.period_label === q.label);
      if (existing) {
        await supabase
          .from("sales_tax_filings" as any)
          .update({ filed_at: new Date().toISOString(), tax_collected: taxCollected } as any)
          .eq("id", existing.id);
      } else {
        await supabase.from("sales_tax_filings" as any).insert({
          user_id: user!.id,
          period_label: q.label,
          period_start: q.start,
          period_end: q.end,
          tax_collected: taxCollected,
          filed_at: new Date().toISOString(),
        } as any);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-tax-filings"] });
      toast.success("Marked as filed");
    },
  });

  const quarterData = useMemo(() => {
    return QUARTER_RANGES.map((q) => {
      const qSales = allSales.filter((s) => s.date >= q.start && s.date <= q.end);
      const grossSales = qSales.reduce((s, r) => s + r.amount, 0);
      const taxCollected = qSales.reduce((s, r) => s + (r.taxCollected || 0), 0);
      const filing = filings.find((f) => f.period_label === q.label);
      return {
        ...q,
        grossSales,
        taxCollected,
        filed: !!filing?.filed_at,
        filedAt: filing?.filed_at,
      };
    });
  }, [allSales, filings]);

  const totalTaxCollected = quarterData.reduce((s, q) => s + q.taxCollected, 0);
  const filingFreq = STATE_FILING_FREQ[state?.toUpperCase()] || "Check your state's requirements";
  const defaultRate = (profile as any)?.default_tax_rate ?? 0;

  const exportData = quarterData.map((q) => ({
    period: q.label,
    gross_sales: q.grossSales,
    tax_rate: defaultRate + "%",
    tax_collected: q.taxCollected,
    status: q.filed ? "Filed" : "Pending",
  }));

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card py-5">
          <p className="text-sm text-muted-foreground">Total Tax Collected</p>
          <p className="text-2xl font-bold font-mono mt-1">{formatCurrency(totalTaxCollected)}</p>
          <p className="text-xs text-muted-foreground mt-1">Year to date</p>
        </div>
        <div className="stat-card py-5">
          <p className="text-sm text-muted-foreground">Default Tax Rate</p>
          <p className="text-2xl font-bold font-mono mt-1">{defaultRate}%</p>
          <p className="text-xs text-muted-foreground mt-1">Set in Company Profile</p>
        </div>
        <div className="stat-card py-5">
          <p className="text-sm text-muted-foreground">Filing Frequency</p>
          <p className="text-lg font-bold mt-1">{state ? `${state}` : "Set state in profile"}</p>
          <p className="text-xs text-muted-foreground mt-1">{filingFreq}</p>
        </div>
      </div>

      {/* Quarterly breakdown */}
      <div className="stat-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Quarterly Sales Tax</h2>
          <ExportButton
            data={exportData}
            filename="sales-tax-report"
            columns={[
              { key: "period", label: "Period" },
              { key: "gross_sales", label: "Gross Sales" },
              { key: "tax_rate", label: "Tax Rate" },
              { key: "tax_collected", label: "Tax Collected" },
              { key: "status", label: "Status" },
            ]}
          />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Gross Sales</TableHead>
              <TableHead className="text-right">Tax Rate</TableHead>
              <TableHead className="text-right">Tax Collected</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quarterData.map((q) => (
              <TableRow key={q.label}>
                <TableCell className="font-medium">{q.label}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(q.grossSales)}</TableCell>
                <TableCell className="text-right font-mono">{defaultRate}%</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(q.taxCollected)}</TableCell>
                <TableCell>
                  {q.filed ? (
                    <Badge variant="outline" className="gap-1 text-chart-positive border-chart-positive/30">
                      <Check className="h-3 w-3" /> Filed
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <Clock className="h-3 w-3" /> Pending
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {!q.filed && q.taxCollected > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => markFiled.mutate(q)}
                      disabled={markFiled.isPending}
                    >
                      <FileText className="h-3 w-3" /> Mark Filed
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="font-semibold border-t-2">
              <TableCell>Total</TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(quarterData.reduce((s, q) => s + q.grossSales, 0))}
              </TableCell>
              <TableCell></TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(totalTaxCollected)}</TableCell>
              <TableCell></TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {state && (
        <div className="rounded-lg border border-chart-info/30 bg-chart-info/5 p-4">
          <p className="text-sm">
            <span className="font-semibold">{state} filing note:</span> {filingFreq}.
            Check your state's Department of Revenue website for exact due dates and filing requirements.
          </p>
        </div>
      )}
    </div>
  );
}
