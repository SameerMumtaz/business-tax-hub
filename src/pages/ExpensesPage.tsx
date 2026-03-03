import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useExpenses, useAddExpense, useRemoveExpense } from "@/hooks/useData";
import { formatCurrency } from "@/lib/format";
import { EXPENSE_CATEGORIES, ExpenseCategory } from "@/types/tax";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2, Filter, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

const LINE_COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(210 70% 50%)",
  "hsl(30 80% 55%)", "hsl(280 60% 55%)",
];

export default function ExpensesPage() {
  const { data: expenses = [] } = useExpenses();
  const addExpense = useAddExpense();
  const removeExpense = useRemoveExpense();
  const [open, setOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [form, setForm] = useState({ date: "", vendor: "", description: "", amount: "", category: "" as string });
  const [trendFilterCat, setTrendFilterCat] = useState<string>("all");

  const filtered = filterCategory === "all" ? expenses : expenses.filter((e) => e.category === filterCategory);
  const totalFiltered = filtered.reduce((sum, e) => sum + e.amount, 0);

  const handleAdd = () => {
    if (!form.date || !form.vendor || !form.amount || !form.category) { toast.error("Please fill all required fields"); return; }
    addExpense.mutate({
      date: form.date, vendor: form.vendor, description: form.description,
      amount: parseFloat(form.amount), category: form.category as ExpenseCategory,
    }, {
      onSuccess: () => { setForm({ date: "", vendor: "", description: "", amount: "", category: "" }); setOpen(false); toast.success("Expense added"); },
      onError: () => toast.error("Failed to add expense"),
    });
  };

  /* ── Expense Trends data ── */
  const { months, categories, monthlyData, spikes } = useMemo(() => {
    const catMonthMap: Record<string, Record<string, number>> = {};
    const monthSet = new Set<string>();
    for (const e of expenses) {
      const m = e.date.slice(0, 7); monthSet.add(m);
      if (!catMonthMap[e.category]) catMonthMap[e.category] = {};
      catMonthMap[e.category][m] = (catMonthMap[e.category][m] || 0) + e.amount;
    }
    const sortedMonths = [...monthSet].sort();
    const cats = Object.keys(catMonthMap).sort();
    const data = sortedMonths.map((m) => {
      const row: Record<string, string | number> = { month: m };
      for (const cat of cats) row[cat] = catMonthMap[cat][m] || 0;
      return row;
    });
    const spikeList: { category: string; month: string; amount: number; avg: number; pctOver: number }[] = [];
    for (const cat of cats) {
      for (let i = 0; i < sortedMonths.length; i++) {
        const m = sortedMonths[i]; const val = catMonthMap[cat][m] || 0;
        if (i < 3 || val === 0) continue;
        const prev3 = [catMonthMap[cat][sortedMonths[i-1]]||0, catMonthMap[cat][sortedMonths[i-2]]||0, catMonthMap[cat][sortedMonths[i-3]]||0];
        const avg = prev3.reduce((a, b) => a + b, 0) / 3;
        if (avg > 0 && val > avg * 1.5) spikeList.push({ category: cat, month: m, amount: val, avg, pctOver: ((val - avg) / avg) * 100 });
      }
    }
    return { months: sortedMonths, categories: cats, monthlyData: data, spikes: spikeList };
  }, [expenses]);

  const latestMonth = months.length > 0 ? months[months.length - 1] : null;
  const currentSpikes = spikes.filter((s) => s.month === latestMonth);
  const visibleCats = trendFilterCat === "all" ? categories : categories.filter((c) => c === trendFilterCat);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {filterCategory !== "all" && <span>{filterCategory} — </span>}
              Total: <span className="font-mono text-chart-negative">{formatCurrency(totalFiltered)}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[180px]"><Filter className="h-3.5 w-3.5 mr-2" /><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Expense</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  <Input placeholder="Vendor" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
                  <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  <Input type="number" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button onClick={handleAdd} className="w-full" disabled={addExpense.isPending}>Add Expense</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs defaultValue="expenses">
          <TabsList>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="trends">Trends & Alerts</TabsTrigger>
          </TabsList>

          <TabsContent value="expenses" className="mt-4">
            <div className="stat-card overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr><th>Date</th><th>Vendor</th><th>Description</th><th>Category</th><th className="text-right">Amount</th><th></th></tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id}>
                      <td className="font-mono text-xs text-muted-foreground">{e.date}</td>
                      <td className="font-medium">{e.vendor}</td>
                      <td className="text-muted-foreground">{e.description}</td>
                      <td><Badge variant="secondary" className="text-xs font-normal">{e.category}</Badge></td>
                      <td className="text-right font-mono text-chart-negative">{formatCurrency(e.amount)}</td>
                      <td>
                        <Button variant="ghost" size="icon" onClick={() => { removeExpense.mutate(e.id); toast.success("Removed"); }}>
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="trends" className="space-y-8 mt-4">
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
              <Select value={trendFilterCat} onValueChange={setTrendFilterCat}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
                      <Line key={cat} type="monotone" dataKey={cat} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
                No expense data yet. Import expenses to see trends.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
