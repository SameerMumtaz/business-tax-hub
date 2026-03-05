import { useMemo } from "react";
import PersonalDashboardLayout from "@/components/PersonalDashboardLayout";
import { usePersonalExpenses, useW2Income } from "@/hooks/usePersonalData";
import { formatCurrency } from "@/lib/format";
import { CHART_COLORS, TOOLTIP_STYLE } from "@/lib/chartTheme";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, TrendingDown, RefreshCw, DollarSign } from "lucide-react";

interface RecurringItem {
  vendor: string;
  avgAmount: number;
  frequency: string;
  count: number;
  category: string;
}

function detectRecurring(expenses: { vendor: string; amount: number; date: string; category: string }[]): RecurringItem[] {
  // Group by vendor (normalized)
  const vendorMap: Record<string, { amounts: number[]; dates: string[]; category: string }> = {};
  expenses.forEach((e) => {
    const key = e.vendor.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30);
    if (!key) return;
    if (!vendorMap[key]) vendorMap[key] = { amounts: [], dates: [], category: e.category };
    vendorMap[key].amounts.push(e.amount);
    vendorMap[key].dates.push(e.date);
  });

  const recurring: RecurringItem[] = [];

  for (const [, data] of Object.entries(vendorMap)) {
    if (data.amounts.length < 2) continue;

    // Check if amounts are consistent (within 10% of median)
    const sorted = [...data.amounts].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const consistent = data.amounts.filter((a) => Math.abs(a - median) / median < 0.1).length;
    if (consistent < data.amounts.length * 0.7) continue;

    // Determine frequency by average gap between dates
    const dates = data.dates.map((d) => new Date(d).getTime()).sort((a, b) => a - b);
    if (dates.length < 2) continue;
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      gaps.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
    }
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    let frequency = "Other";
    if (avgGap < 10) frequency = "Weekly";
    else if (avgGap >= 25 && avgGap <= 35) frequency = "Monthly";
    else if (avgGap >= 80 && avgGap <= 100) frequency = "Quarterly";
    else if (avgGap >= 350 && avgGap <= 380) frequency = "Annual";
    else continue; // Not a recognizable pattern

    const avgAmount = data.amounts.reduce((s, a) => s + a, 0) / data.amounts.length;
    const vendor = expenses.find(
      (e) => e.vendor.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30) === Object.keys(vendorMap).find((k) => vendorMap[k] === data)
    )?.vendor || "Unknown";

    recurring.push({
      vendor,
      avgAmount: Math.round(avgAmount * 100) / 100,
      frequency,
      count: data.amounts.length,
      category: data.category,
    });
  }

  return recurring.sort((a, b) => b.avgAmount - a.avgAmount);
}

export default function PersonalBudgetPage() {
  const { data: expenses = [], isLoading } = usePersonalExpenses();
  const { data: w2s = [] } = useW2Income();

  const monthlyIncome = useMemo(() => {
    const totalAnnual = w2s.reduce((s, w) => s + w.wages, 0);
    return totalAnnual / 12;
  }, [w2s]);

  // Monthly spending breakdown
  const monthlySpending = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => {
      const month = e.date.slice(0, 7); // YYYY-MM
      map[month] = (map[month] || 0) + e.amount;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, amount]) => ({
        month: new Date(month + "-01").toLocaleDateString("en-US", { month: "short" }),
        spending: Math.round(amount),
        income: Math.round(monthlyIncome),
      }));
  }, [expenses, monthlyIncome]);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  }, [expenses]);

  // Recurring payments
  const recurring = useMemo(() => detectRecurring(expenses), [expenses]);
  const monthlyRecurring = recurring
    .filter((r) => r.frequency === "Monthly")
    .reduce((s, r) => s + r.avgAmount, 0);

  const totalSpending = expenses.reduce((s, e) => s + e.amount, 0);
  const avgMonthlySpend = monthlySpending.length > 0
    ? monthlySpending.reduce((s, m) => s + m.spending, 0) / monthlySpending.length
    : 0;
  const savingsRate = monthlyIncome > 0 ? Math.round(((monthlyIncome - avgMonthlySpend) / monthlyIncome) * 100) : 0;

  return (
    <PersonalDashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Budget & Insights</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Spending habits, recurring payments, and income vs. expenses
          </p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Monthly Income", value: monthlyIncome, icon: DollarSign, color: "text-chart-positive" },
            { label: "Avg Monthly Spend", value: avgMonthlySpend, icon: TrendingDown, color: "text-destructive" },
            { label: "Monthly Subscriptions", value: monthlyRecurring, icon: RefreshCw, color: "text-primary" },
            { label: "Savings Rate", value: null, display: `${savingsRate}%`, icon: TrendingUp, color: savingsRate >= 20 ? "text-chart-positive" : "text-destructive" },
          ].map((c) => (
            <div key={c.label} className="stat-card py-5">
              <div className="flex items-center gap-2 mb-2">
                <c.icon className={`h-4 w-4 ${c.color}`} />
                <p className="text-xs text-muted-foreground">{c.label}</p>
              </div>
              <p className={`text-xl font-bold font-mono ${c.color}`}>
                {c.display ?? formatCurrency(c.value!)}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Income vs Spending chart */}
          <div className="stat-card">
            <h2 className="section-title mb-4">Income vs. Spending</h2>
            {monthlySpending.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No expense data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthlySpending} barCategoryGap="20%">
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="income" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} name="Income" />
                  <Bar dataKey="spending" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="Spending" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Category pie */}
          <div className="stat-card">
            <h2 className="section-title mb-4">Spending by Category</h2>
            {categoryBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No expense data yet</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={220}>
                  <PieChart>
                    <Pie data={categoryBreakdown.slice(0, 8)} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3}>
                      {categoryBreakdown.slice(0, 8).map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[220px]">
                  {categoryBreakdown.slice(0, 8).map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-muted-foreground truncate max-w-[100px]">{item.name}</span>
                      </div>
                      <span className="font-mono text-xs">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recurring payments */}
        <div className="stat-card">
          <h2 className="section-title mb-4">
            <RefreshCw className="h-4 w-4 inline mr-2" />
            Recurring Payments & Subscriptions
          </h2>
          {recurring.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {isLoading ? "Loading…" : "No recurring payments detected yet. Import more statements to see patterns."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th>Category</th>
                    <th>Frequency</th>
                    <th>Occurrences</th>
                    <th className="text-right">Avg Amount</th>
                    <th className="text-right">Est. Annual</th>
                  </tr>
                </thead>
                <tbody>
                  {recurring.map((r, i) => {
                    const annual = r.frequency === "Monthly" ? r.avgAmount * 12
                      : r.frequency === "Weekly" ? r.avgAmount * 52
                      : r.frequency === "Quarterly" ? r.avgAmount * 4
                      : r.avgAmount;
                    return (
                      <tr key={i}>
                        <td className="font-medium">{r.vendor}</td>
                        <td>
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {r.category}
                          </span>
                        </td>
                        <td className="text-sm">{r.frequency}</td>
                        <td className="text-sm text-muted-foreground">{r.count}×</td>
                        <td className="text-right font-mono text-sm">{formatCurrency(r.avgAmount)}</td>
                        <td className="text-right font-mono text-sm">{formatCurrency(annual)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PersonalDashboardLayout>
  );
}
