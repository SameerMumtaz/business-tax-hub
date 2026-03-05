import { useMemo, useState } from "react";
import { useJobs } from "@/hooks/useJobs";
import { getExpectedProfit } from "@/components/job/JobBudgetFields";
import { useTimesheets } from "@/hooks/useTimesheets";
import { useInvoices } from "@/hooks/useInvoices";
import { useExpenses } from "@/hooks/useData";
import { useDateRange } from "@/contexts/DateRangeContext";
import { formatCurrency } from "@/lib/format";
import { CHART_COLORS, AXIS_STYLE, GRID_STYLE, TOOLTIP_STYLE } from "@/lib/chartTheme";
import ExportButton from "@/components/ExportButton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine } from "recharts";
import { TrendingUp, Trophy, DollarSign, ArrowUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";

interface JobProfitRow {
  jobId: string;
  jobName: string;
  client: string;
  date: string;
  revenue: number;
  laborCost: number;
  expenseCost: number;
  grossProfit: number;
  margin: number;
  expectedProfit: number;
  expectedMargin: number;
  variance: number;
}

type SortKey = "jobName" | "revenue" | "laborCost" | "expenseCost" | "grossProfit" | "margin" | "expectedProfit" | "variance";

export default function JobProfitabilityTab() {
  const { user } = useAuth();
  const { jobs, sites, loading: jobsLoading } = useJobs();
  const { entries, loading: tsLoading } = useTimesheets();
  const { data: allExpenses = [] } = useExpenses();
  const { filterByDate } = useDateRange();
  const [sortKey, setSortKey] = useState<SortKey>("grossProfit");
  const [sortAsc, setSortAsc] = useState(false);

  // Fetch invoices with job_id
  const { data: invoicesWithJobs = [] } = useQuery({
    queryKey: ["invoices-with-jobs", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("invoices")
        .select("id, total, job_id, client_name, status, pay_status")
        .eq("user_id", user.id)
        .not("job_id", "is", null);
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch job_expenses links
  const { data: jobExpenseLinks = [] } = useQuery({
    queryKey: ["job-expense-links", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("job_expenses").select("job_id, expense_id");
      return data || [];
    },
    enabled: !!user,
  });

  const filteredJobs = useMemo(
    () => filterByDate(jobs.map((j) => ({ ...j, date: j.start_date }))),
    [jobs, filterByDate]
  );

  const rows = useMemo((): JobProfitRow[] => {
    return filteredJobs.map((job) => {
      const site = sites.find((s) => s.id === job.site_id);
      const jobInvoices = invoicesWithJobs.filter((i) => i.job_id === job.id);
      const revenue = jobInvoices.reduce((s, i) => s + Number(i.total), 0);
      const jobEntries = entries.filter((e) => e.job_id === job.id);
      const laborCost = jobEntries.reduce((s, e) => s + e.total_pay, 0);
      const linkedExpenseIds = jobExpenseLinks.filter((l) => l.job_id === job.id).map((l) => l.expense_id);
      const expenseCost = allExpenses
        .filter((e) => linkedExpenseIds.includes(e.id))
        .reduce((s, e) => s + e.amount, 0);
      const grossProfit = revenue - laborCost - expenseCost;
      const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
      const client = jobInvoices[0]?.client_name || site?.name || "—";

      // Expected profit from budgets
      const { profit: expectedProfit } = getExpectedProfit(
        job.price, job.material_budget, job.labor_budget_type,
        job.labor_budget_amount, job.labor_budget_hours, job.labor_budget_rate,
      );
      const expectedMargin = job.price > 0 ? (expectedProfit / job.price) * 100 : 0;
      const variance = grossProfit - expectedProfit;

      return {
        jobId: job.id, jobName: job.title, client, date: job.start_date,
        revenue, laborCost, expenseCost, grossProfit, margin,
        expectedProfit, expectedMargin, variance,
      };
    });
  }, [filteredJobs, sites, invoicesWithJobs, entries, jobExpenseLinks, allExpenses]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [rows, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  // Summary stats
  const totalProfit = rows.reduce((s, r) => s + r.grossProfit, 0);
  const avgMargin = rows.length > 0 ? rows.reduce((s, r) => s + r.margin, 0) / rows.length : 0;
  const mostProfitable = rows.length > 0 ? [...rows].sort((a, b) => b.grossProfit - a.grossProfit)[0] : null;

  // Chart data — top 5 most and least profitable
  const chartData = useMemo(() => {
    if (rows.length === 0) return [];
    const byProfit = [...rows].sort((a, b) => b.grossProfit - a.grossProfit);
    const top5 = byProfit.slice(0, 5);
    const bottom5 = byProfit.slice(-5).reverse();
    const combined = [...top5];
    for (const b of bottom5) {
      if (!combined.find((c) => c.jobId === b.jobId)) combined.push(b);
    }
    return combined.slice(0, 10).map((r) => ({
      name: r.jobName.length > 20 ? r.jobName.slice(0, 18) + "…" : r.jobName,
      profit: r.grossProfit,
      margin: r.margin,
    }));
  }, [rows]);

  const marginColor = (m: number) => {
    if (m >= 30) return "text-chart-positive";
    if (m >= 10) return "text-chart-warning";
    return "text-chart-negative";
  };

  const marginBg = (m: number) => {
    if (m >= 30) return "bg-chart-positive/10";
    if (m >= 10) return "bg-chart-warning/10";
    return "bg-chart-negative/10";
  };

  const exportData = sorted.map((r) => ({
    job: r.jobName,
    client: r.client,
    date: r.date,
    revenue: r.revenue,
    labor_cost: r.laborCost,
    expenses: r.expenseCost,
    gross_profit: r.grossProfit,
    margin_pct: r.margin.toFixed(1) + "%",
    expected_profit: r.expectedProfit,
    variance: r.variance,
  }));

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <TableHead
      className="cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => toggleSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
      </span>
    </TableHead>
  );

  if (jobsLoading || tsLoading) {
    return <div className="text-center py-12 text-muted-foreground">Loading job data…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card py-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Total Job Profit</p>
          </div>
          <p className={`text-2xl font-bold font-mono ${totalProfit >= 0 ? "text-chart-positive" : "text-chart-negative"}`}>
            {formatCurrency(totalProfit)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{rows.length} jobs</p>
        </div>

        <div className="stat-card py-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Average Margin</p>
          </div>
          <p className={`text-2xl font-bold font-mono ${marginColor(avgMargin)}`}>
            {avgMargin.toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">Across all jobs</p>
        </div>

        <div className="stat-card py-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
              <Trophy className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Most Profitable</p>
          </div>
          <p className="text-lg font-bold truncate">{mostProfitable?.jobName || "—"}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {mostProfitable ? formatCurrency(mostProfitable.grossProfit) : "No jobs yet"}
          </p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="stat-card">
          <h2 className="section-title mb-4">Profitability by Job</h2>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 140 }}>
              <CartesianGrid {...GRID_STYLE} horizontal={false} />
              <XAxis type="number" {...AXIS_STYLE} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" {...AXIS_STYLE} width={130} />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={TOOLTIP_STYLE}
              />
              <ReferenceLine x={0} stroke="hsl(var(--border))" />
              <Bar dataKey="profit" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.profit >= 0 ? "hsl(var(--chart-positive))" : "hsl(var(--chart-negative))"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="stat-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Job Breakdown</h2>
          <ExportButton
            data={exportData}
            filename="job-profitability"
            columns={[
              { key: "job", label: "Job" },
              { key: "client", label: "Client" },
              { key: "date", label: "Date" },
              { key: "revenue", label: "Revenue" },
              { key: "labor_cost", label: "Labor Cost" },
              { key: "expenses", label: "Expenses" },
              { key: "gross_profit", label: "Gross Profit" },
              { key: "margin_pct", label: "Margin %" },
              { key: "expected_profit", label: "Expected Profit" },
              { key: "variance", label: "Variance" },
            ]}
          />
        </div>

        {sorted.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No jobs found in this date range</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader label="Job Name" field="jobName" />
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <SortHeader label="Revenue" field="revenue" />
                  <SortHeader label="Labor" field="laborCost" />
                  <SortHeader label="Expenses" field="expenseCost" />
                  <SortHeader label="Gross Profit" field="grossProfit" />
                  <SortHeader label="Margin %" field="margin" />
                  <SortHeader label="Expected" field="expectedProfit" />
                  <SortHeader label="Variance" field="variance" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => (
                  <TableRow key={r.jobId}>
                    <TableCell className="font-medium">{r.jobName}</TableCell>
                    <TableCell className="text-muted-foreground">{r.client}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.date}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(r.revenue)}</TableCell>
                    <TableCell className="text-right font-mono text-chart-negative">
                      {r.laborCost > 0 ? `(${formatCurrency(r.laborCost)})` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-chart-negative">
                      {r.expenseCost > 0 ? `(${formatCurrency(r.expenseCost)})` : "—"}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-medium ${r.grossProfit >= 0 ? "text-chart-positive" : "text-chart-negative"}`}>
                      {formatCurrency(r.grossProfit)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${marginBg(r.margin)} ${marginColor(r.margin)}`}>
                        {r.margin.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {r.expectedProfit !== 0 ? formatCurrency(r.expectedProfit) : "—"}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm font-medium ${r.variance >= 0 ? "text-chart-positive" : "text-chart-negative"}`}>
                      {r.expectedProfit !== 0 ? (r.variance >= 0 ? "+" : "") + formatCurrency(r.variance) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
