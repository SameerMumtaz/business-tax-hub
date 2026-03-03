import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useExpenses, useSales } from "@/hooks/useData";
import { formatCurrency } from "@/lib/format";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/* ── P&L Compare helpers ── */
function pctChange(curr: number, prev: number) {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function DeltaBadge({ value }: { value: number }) {
  if (Math.abs(value) < 0.5) return <span className="text-muted-foreground flex items-center gap-1"><Minus className="h-3 w-3" />0%</span>;
  const positive = value > 0;
  return (
    <span className={`flex items-center gap-1 ${positive ? "text-chart-positive" : "text-chart-negative"}`}>
      {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

type PeriodData = { label: string; revenue: number; expenses: number; net: number };

export default function ProfitLossPage() {
  const { data: expenses = [] } = useExpenses();
  const { data: sales = [] } = useSales();
  const [compareView, setCompareView] = useState<"monthly" | "quarterly">("monthly");

  const totalRevenue = sales.reduce((sum, s) => sum + s.amount, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netIncome = totalRevenue - totalExpenses;
  const margin = totalRevenue > 0 ? ((netIncome / totalRevenue) * 100).toFixed(1) : "0";

  const categoryMap: Record<string, number> = {};
  expenses.forEach((e) => {
    categoryMap[e.category] = (categoryMap[e.category] || 0) + e.amount;
  });
  const sortedCategories = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]);
  const chartData = sortedCategories.map(([name, amount]) => ({ name, amount }));

  /* ── P&L Compare data ── */
  const periods = useMemo(() => {
    const revenueMap: Record<string, number> = {};
    const expenseMap: Record<string, number> = {};
    for (const s of sales) {
      const key = compareView === "monthly" ? s.date.slice(0, 7) : `${s.date.slice(0, 4)}-Q${Math.ceil(parseInt(s.date.slice(5, 7)) / 3)}`;
      revenueMap[key] = (revenueMap[key] || 0) + s.amount;
    }
    for (const e of expenses) {
      const key = compareView === "monthly" ? e.date.slice(0, 7) : `${e.date.slice(0, 4)}-Q${Math.ceil(parseInt(e.date.slice(5, 7)) / 3)}`;
      expenseMap[key] = (expenseMap[key] || 0) + e.amount;
    }
    const allKeys = [...new Set([...Object.keys(revenueMap), ...Object.keys(expenseMap)])].sort();
    return allKeys.map((label): PeriodData => ({
      label,
      revenue: revenueMap[label] || 0,
      expenses: expenseMap[label] || 0,
      net: (revenueMap[label] || 0) - (expenseMap[label] || 0),
    }));
  }, [expenses, sales, compareView]);

  const pairs = periods.map((curr, i) => ({
    current: curr,
    previous: i > 0 ? periods[i - 1] : null,
  }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profit & Loss</h1>
          <p className="text-muted-foreground text-sm mt-1">Year-to-date financial summary</p>
        </div>

        <Tabs defaultValue="statement">
          <TabsList>
            <TabsTrigger value="statement">Income Statement</TabsTrigger>
            <TabsTrigger value="compare">P&L Compare</TabsTrigger>
          </TabsList>

          {/* ── Income Statement Tab ── */}
          <TabsContent value="statement" className="space-y-8 mt-4">
            <div className="stat-card">
              <h2 className="section-title mb-6">Income Statement</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2">
                  <span className="font-medium">Total Revenue</span>
                  <span className="font-mono text-lg text-chart-positive">{formatCurrency(totalRevenue)}</span>
                </div>
                <div className="border-t pt-2 space-y-2">
                  <span className="text-sm font-medium text-muted-foreground">Expenses</span>
                  {sortedCategories.map(([cat, amount]) => (
                    <div key={cat} className="flex justify-between items-center pl-4">
                      <span className="text-sm text-muted-foreground">{cat}</span>
                      <span className="font-mono text-sm text-chart-negative">({formatCurrency(amount)})</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center py-2 border-t">
                  <span className="font-medium">Total Expenses</span>
                  <span className="font-mono text-lg text-chart-negative">({formatCurrency(totalExpenses)})</span>
                </div>
                <div className="flex justify-between items-center py-3 border-t-2 border-foreground/20">
                  <span className="text-lg font-bold">Net Income</span>
                  <span className={`font-mono text-2xl font-bold ${netIncome >= 0 ? "text-chart-positive" : "text-chart-negative"}`}>
                    {formatCurrency(netIncome)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm text-muted-foreground">
                  <span>Profit Margin</span>
                  <span className="font-mono">{margin}%</span>
                </div>
              </div>
            </div>

            <div className="stat-card">
              <h2 className="section-title mb-4">Expenses by Category</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 90%)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" width={110} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: "8px", fontSize: "13px" }} />
                  <Bar dataKey="amount" fill="hsl(0, 72%, 51%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          {/* ── P&L Compare Tab ── */}
          <TabsContent value="compare" className="space-y-6 mt-4">
            <Tabs value={compareView} onValueChange={(v) => setCompareView(v as "monthly" | "quarterly")}>
              <TabsList>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
                <TabsTrigger value="quarterly">Quarterly</TabsTrigger>
              </TabsList>
            </Tabs>

            {periods.length > 0 && (
              <div className="rounded-lg border bg-card p-6">
                <h2 className="text-lg font-medium mb-4">Revenue vs Expenses by Period</h2>
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={periods}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="Expenses" fill="hsl(var(--chart-5))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {pairs.length > 0 && (
              <div className="rounded-lg border bg-card p-6">
                <h2 className="text-lg font-medium mb-4">Period Detail</h2>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Δ Rev</TableHead>
                      <TableHead className="text-right">Expenses</TableHead>
                      <TableHead className="text-right">Δ Exp</TableHead>
                      <TableHead className="text-right">Net Income</TableHead>
                      <TableHead className="text-right">Δ Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pairs.map(({ current: c, previous: p }) => (
                      <TableRow key={c.label}>
                        <TableCell className="font-medium">{c.label}</TableCell>
                        <TableCell className="text-right">{formatCurrency(c.revenue)}</TableCell>
                        <TableCell className="text-right">{p ? <DeltaBadge value={pctChange(c.revenue, p.revenue)} /> : "—"}</TableCell>
                        <TableCell className="text-right">{formatCurrency(c.expenses)}</TableCell>
                        <TableCell className="text-right">{p ? <DeltaBadge value={pctChange(c.expenses, p.expenses)} /> : "—"}</TableCell>
                        <TableCell className={`text-right ${c.net >= 0 ? "text-chart-positive" : "text-chart-negative"}`}>{formatCurrency(c.net)}</TableCell>
                        <TableCell className="text-right">{p ? <DeltaBadge value={pctChange(c.net, p.net)} /> : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {periods.length === 0 && (
              <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
                No data yet. Import transactions to compare periods.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
