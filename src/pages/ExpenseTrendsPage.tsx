import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useExpenses } from "@/hooks/useData";
import { formatCurrency } from "@/lib/format";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

const LINE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(210 70% 50%)",
  "hsl(30 80% 55%)",
  "hsl(280 60% 55%)",
];

export default function ExpenseTrendsPage() {
  const { data: expenses = [] } = useExpenses();
  const [filterCat, setFilterCat] = useState<string>("all");

  const { months, categories, monthlyData, spikes } = useMemo(() => {
    // Build month×category matrix
    const catMonthMap: Record<string, Record<string, number>> = {};
    const monthSet = new Set<string>();

    for (const e of expenses) {
      const m = e.date.slice(0, 7);
      monthSet.add(m);
      if (!catMonthMap[e.category]) catMonthMap[e.category] = {};
      catMonthMap[e.category][m] = (catMonthMap[e.category][m] || 0) + e.amount;
    }

    const sortedMonths = [...monthSet].sort();
    const cats = Object.keys(catMonthMap).sort();

    // Build chart data rows
    const data = sortedMonths.map((m) => {
      const row: Record<string, string | number> = { month: m };
      for (const cat of cats) row[cat] = catMonthMap[cat][m] || 0;
      return row;
    });

    // Detect spikes: spending > 1.5× 3-month rolling average
    const spikeList: { category: string; month: string; amount: number; avg: number; pctOver: number }[] = [];
    for (const cat of cats) {
      for (let i = 0; i < sortedMonths.length; i++) {
        const m = sortedMonths[i];
        const val = catMonthMap[cat][m] || 0;
        if (i < 3 || val === 0) continue;
        const prev3 = [
          catMonthMap[cat][sortedMonths[i - 1]] || 0,
          catMonthMap[cat][sortedMonths[i - 2]] || 0,
          catMonthMap[cat][sortedMonths[i - 3]] || 0,
        ];
        const avg = prev3.reduce((a, b) => a + b, 0) / 3;
        if (avg > 0 && val > avg * 1.5) {
          spikeList.push({ category: cat, month: m, amount: val, avg, pctOver: ((val - avg) / avg) * 100 });
        }
      }
    }

    return { months: sortedMonths, categories: cats, monthlyData: data, spikes: spikeList };
  }, [expenses]);

  const latestMonth = months.length > 0 ? months[months.length - 1] : null;
  const currentSpikes = spikes.filter((s) => s.month === latestMonth);

  const visibleCats = filterCat === "all" ? categories : categories.filter((c) => c === filterCat);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Expense Trends & Alerts</h1>
          <p className="text-muted-foreground text-sm mt-1">Category spending over time — spikes flagged vs 3-month rolling average</p>
        </div>

        {currentSpikes.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Spending Spikes Detected</AlertTitle>
            <AlertDescription>
              {currentSpikes.map((s) => (
                <span key={s.category} className="block">
                  <strong>{s.category}</strong>: {formatCurrency(s.amount)} this month — {s.pctOver.toFixed(0)}% above 3-month average ({formatCurrency(s.avg)})
                </span>
              ))}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-3">
          <label className="text-sm text-muted-foreground">Filter category:</label>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {monthlyData.length > 0 ? (
          <div className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-medium mb-4">Spending by Category Over Time</h2>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                {visibleCats.map((cat, i) => (
                  <Line
                    key={cat}
                    type="monotone"
                    dataKey={cat}
                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
            No expense data yet. Import expenses to see trends.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
