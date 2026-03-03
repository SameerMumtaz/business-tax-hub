import DashboardLayout from "@/components/DashboardLayout";
import { useExpenses, useSales } from "@/hooks/useData";
import { formatCurrency } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function ProfitLossPage() {
  const { data: expenses = [] } = useExpenses();
  const { data: sales = [] } = useSales();

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

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profit & Loss</h1>
          <p className="text-muted-foreground text-sm mt-1">Year-to-date financial summary</p>
        </div>

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
      </div>
    </DashboardLayout>
  );
}
