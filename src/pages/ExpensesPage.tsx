import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useExpenses, useAddExpense, useRemoveExpense, useUpdateExpense, useBulkRemoveExpenses, useBulkUpdateExpenseCategory } from "@/hooks/useData";
import { formatCurrency } from "@/lib/format";
import { EXPENSE_CATEGORIES, ExpenseCategory } from "@/types/tax";
import { invalidateRulesCache } from "@/lib/categorize";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2, Filter, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, Tag, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

const LINE_COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(210 70% 50%)",
  "hsl(30 80% 55%)", "hsl(280 60% 55%)",
];

type SortField = "date" | "vendor" | "description" | "category" | "amount";
type SortDir = "asc" | "desc";

export default function ExpensesPage() {
  const { data: expenses = [] } = useExpenses();
  const { user } = useAuth();
  const addExpense = useAddExpense();
  const removeExpense = useRemoveExpense();
  const updateExpense = useUpdateExpense();
  const bulkRemove = useBulkRemoveExpenses();
  const bulkUpdateCategory = useBulkUpdateExpenseCategory();
  const [open, setOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [form, setForm] = useState({ date: "", vendor: "", description: "", amount: "", category: "" as string });
  const [trendFilterCat, setTrendFilterCat] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    let result = filterCategory === "all" ? expenses : expenses.filter((e) => e.category === filterCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((e) =>
        e.vendor.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.date.includes(q) ||
        e.amount.toString().includes(q) ||
        formatCurrency(e.amount).toLowerCase().includes(q)
      );
    }
    return result;
  }, [expenses, filterCategory, searchQuery]);
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

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date": cmp = a.date.localeCompare(b.date); break;
        case "vendor": cmp = a.vendor.localeCompare(b.vendor); break;
        case "description": cmp = a.description.localeCompare(b.description); break;
        case "category": cmp = a.category.localeCompare(b.category); break;
        case "amount": cmp = a.amount - b.amount; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === sorted.length) setSelected(new Set());
    else setSelected(new Set(sorted.map((e) => e.id)));
  };

  const handleBulkDelete = () => {
    if (selected.size === 0) return;
    bulkRemove.mutate([...selected], {
      onSuccess: () => { toast.success(`Deleted ${selected.size} expense(s)`); setSelected(new Set()); },
      onError: () => toast.error("Failed to delete"),
    });
  };

  const handleBulkCategoryChange = (category: string) => {
    if (selected.size === 0) return;
    bulkUpdateCategory.mutate({ ids: [...selected], category }, {
      onSuccess: () => { toast.success(`Updated ${selected.size} expense(s) to ${category}`); setSelected(new Set()); },
      onError: () => toast.error("Failed to update"),
    });
  };

  const handleSingleCategoryChange = (id: string, category: string) => {
    updateExpense.mutate({ id, category }, {
      onSuccess: () => { toast.success("Category updated"); setEditingCategoryId(null); },
      onError: () => toast.error("Failed to update"),
    });
  };

  // Rule creation
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleKeyword, setRuleKeyword] = useState("");
  const [ruleCategory, setRuleCategory] = useState("");

  const openBulkRule = () => {
    const selectedExpenses = expenses.filter((e) => selected.has(e.id));
    if (selectedExpenses.length > 0) {
      const first = selectedExpenses[0].vendor.split(/\s+/)[0]?.toLowerCase() || "";
      setRuleKeyword(first);
      // If all selected share same category, pre-fill
      const cats = new Set(selectedExpenses.map((e) => e.category));
      setRuleCategory(cats.size === 1 ? [...cats][0] : "");
    }
    setRuleDialogOpen(true);
  };

  const saveBulkRule = async () => {
    if (!ruleKeyword || !ruleCategory) { toast.error("Enter keyword and category"); return; }
    const { error } = await supabase.from("categorization_rules").insert({
      vendor_pattern: ruleKeyword,
      category: ruleCategory,
      type: "expense",
      priority: 10,
      user_id: user?.id,
    });
    if (error) { toast.error("Failed to save rule"); return; }
    invalidateRulesCache();
    toast.success(`Rule saved: "${ruleKeyword}" → ${ruleCategory}`);
    // Also update matching selected expenses
    const matchingIds = expenses.filter((e) => selected.has(e.id) && e.vendor.toLowerCase().includes(ruleKeyword.toLowerCase())).map((e) => e.id);
    if (matchingIds.length > 0) {
      bulkUpdateCategory.mutate({ ids: matchingIds, category: ruleCategory });
    }
    setRuleDialogOpen(false);
    setRuleKeyword("");
    setRuleCategory("");
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

          <TabsContent value="expenses" className="mt-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by vendor, description, date, or amount…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            {/* Bulk actions bar */}
            {selected.size > 0 && (
              <div className="flex items-center gap-3 bg-muted rounded-lg px-4 py-2 flex-wrap">
                <span className="text-sm font-medium">{selected.size} selected</span>
                <Select onValueChange={handleBulkCategoryChange}>
                  <SelectTrigger className="h-7 text-xs w-[160px]">
                    <Pencil className="h-3 w-3 mr-1" />
                    <SelectValue placeholder="Set category" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openBulkRule}>
                  <Tag className="h-3 w-3 mr-1" /> Create Rule
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs text-destructive" onClick={handleBulkDelete}>
                  <Trash2 className="h-3 w-3 mr-1" /> Delete
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </div>
            )}

            {/* Rule creation dialog */}
            <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Categorization Rule</DialogTitle></DialogHeader>
                <p className="text-sm text-muted-foreground">This rule will auto-categorize future imports matching the keyword and update selected expenses.</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Keyword pattern</label>
                    <Input value={ruleKeyword} onChange={(e) => setRuleKeyword(e.target.value)} placeholder="e.g. adobe" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                    <Select value={ruleCategory} onValueChange={setRuleCategory}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={saveBulkRule} className="w-full" disabled={!ruleKeyword || !ruleCategory}>Save Rule & Apply</Button>
                </div>
              </DialogContent>
            </Dialog>

            <div className="stat-card overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-10">
                      <Checkbox
                        checked={sorted.length > 0 && selected.size === sorted.length}
                        onCheckedChange={toggleAll}
                      />
                    </th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("date")}>
                      <span className="inline-flex items-center">Date<SortIcon field="date" /></span>
                    </th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("vendor")}>
                      <span className="inline-flex items-center">Vendor<SortIcon field="vendor" /></span>
                    </th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("description")}>
                      <span className="inline-flex items-center">Description<SortIcon field="description" /></span>
                    </th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("category")}>
                      <span className="inline-flex items-center">Category<SortIcon field="category" /></span>
                    </th>
                    <th className="text-right cursor-pointer select-none" onClick={() => toggleSort("amount")}>
                      <span className="inline-flex items-center justify-end">Amount<SortIcon field="amount" /></span>
                    </th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((e) => (
                    <tr key={e.id} className={selected.has(e.id) ? "bg-primary/5" : ""}>
                      <td>
                        <Checkbox
                          checked={selected.has(e.id)}
                          onCheckedChange={() => toggleSelect(e.id)}
                        />
                      </td>
                      <td className="font-mono text-xs text-muted-foreground">{e.date}</td>
                      <td className="font-medium">{e.vendor}</td>
                      <td className="text-muted-foreground">{e.description}</td>
                      <td>
                        {editingCategoryId === e.id ? (
                          <Select
                            value={e.category}
                            onValueChange={(v) => handleSingleCategoryChange(e.id, v)}
                          >
                            <SelectTrigger className="h-7 text-xs w-[150px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <button
                            onClick={() => setEditingCategoryId(e.id)}
                            className="group flex items-center gap-1"
                          >
                            <Badge variant="secondary" className="text-xs font-normal">{e.category}</Badge>
                            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        )}
                      </td>
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
