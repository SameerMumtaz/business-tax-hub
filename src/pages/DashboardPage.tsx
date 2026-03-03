import { useExpenses, useSales, useContractors } from "@/hooks/useData";
import { formatCurrency } from "@/lib/format";
import StatCard from "@/components/StatCard";
import DashboardLayout from "@/components/DashboardLayout";
import { TrendingUp, TrendingDown, DollarSign, Users } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const COLORS = [
  "hsl(160, 84%, 39%)",
  "hsl(217, 91%, 60%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)",
  "hsl(280, 65%, 60%)",
  "hsl(160, 40%, 55%)",
  "hsl(200, 70%, 50%)",
  "hsl(340, 75%, 55%)",
];

export default function DashboardPage() {
  const { data: expenses = [] } = useExpenses();
  const { data: sales = [] } = useSales();
  const { data: contractors = [] } = useContractors();

  const totalRevenue = sales.reduce((sum, s) => sum + s.amount, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netIncome = totalRevenue - totalExpenses;

  const categoryMap: Record<string, number> = {};
  expenses.forEach((e) => {
    categoryMap[e.category] = (categoryMap[e.category] || 0) + e.amount;
  });
  const pieData = Object.entries(categoryMap).map(([name, value]) => ({ name, value }));

  const monthlyRevenue: Record<string, number> = {};
  sales.forEach((s) => {
    const month = s.date.substring(0, 7);
    monthlyRevenue[month] = (monthlyRevenue[month] || 0) + s.amount;
  });
  const barData = Object.entries(monthlyRevenue)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({
      month: new Date(month + "-01").toLocaleDateString("en-US", { month: "short" }),
      revenue,
    }));

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Your business tax overview for 2026</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Revenue" value={totalRevenue} icon={TrendingUp} variant="positive" trend={`${sales.length} invoices`} />
          <StatCard title="Total Expenses" value={totalExpenses} icon={TrendingDown} variant="negative" trend={`${expenses.length} transactions`} />
          <StatCard title="Net Income" value={netIncome} icon={DollarSign} variant={netIncome >= 0 ? "positive" : "negative"} />
          <StatCard title="1099 Contractors" value={contractors.reduce((s, c) => s + c.totalPaid, 0)} icon={Users} trend={`${contractors.length} contractors`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="stat-card">
            <h2 className="section-title mb-4">Monthly Revenue</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 90%)" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: "8px", border: "1px solid hsl(220, 13%, 90%)", fontSize: "13px" }} />
                <Bar dataKey="revenue" fill="hsl(160, 84%, 39%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="stat-card">
            <h2 className="section-title mb-4">Expense Breakdown</h2>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={240}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: "8px", fontSize: "13px" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {pieData.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-muted-foreground truncate max-w-[120px]">{item.name}</span>
                    </div>
                    <span className="font-mono text-xs">{formatCurrency(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <h2 className="section-title mb-4">Recent Transactions</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Type</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {[
                ...sales.map((s) => ({ date: s.date, desc: `${s.client} — ${s.description}`, type: "Income" as const, amount: s.amount })),
                ...expenses.map((e) => ({ date: e.date, desc: `${e.vendor} — ${e.description}`, type: "Expense" as const, amount: -e.amount })),
              ]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 8)
                .map((t, i) => (
                  <tr key={i}>
                    <td className="font-mono text-xs text-muted-foreground">{t.date}</td>
                    <td>{t.desc}</td>
                    <td>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.type === "Income" ? "bg-accent text-accent-foreground" : "bg-destructive/10 text-destructive"}`}>
                        {t.type}
                      </span>
                    </td>
                    <td className={`text-right font-mono ${t.amount >= 0 ? "text-chart-positive" : "text-chart-negative"}`}>
                      {t.amount >= 0 ? "+" : ""}{formatCurrency(Math.abs(t.amount))}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
