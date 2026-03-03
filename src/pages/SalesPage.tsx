import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useSales, useAddSale, useRemoveSale, useBulkRemoveSales, useExpenses } from "@/hooks/useData";
import { formatCurrency } from "@/lib/format";
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
import StatCard from "@/components/StatCard";
import { Plus, Trash2, ArrowDownLeft, ArrowUpRight, Activity, Wallet, ArrowUpDown, ArrowUp, ArrowDown, Tag, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { auditSales, AuditResult } from "@/lib/audit";
import AuditIssuesPanel from "@/components/AuditIssuesPanel";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { EXPENSE_CATEGORIES } from "@/types/tax";

type SortField = "date" | "client" | "invoiceNumber" | "amount" | "description";
type SortDir = "asc" | "desc";

export default function SalesPage() {
  const { data: sales = [] } = useSales();
  const { data: expenses = [] } = useExpenses();
  const { user } = useAuth();
  const addSale = useAddSale();
  const removeSale = useRemoveSale();
  const bulkRemove = useBulkRemoveSales();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: "", client: "", description: "", amount: "", invoiceNumber: "" });
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);

  const searchedSales = useMemo(() => {
    if (!searchQuery.trim()) return sales;
    const q = searchQuery.trim().toLowerCase();
    return sales.filter((s) =>
      s.client.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.date.includes(q) ||
      s.amount.toString().includes(q) ||
      formatCurrency(s.amount).toLowerCase().includes(q) ||
      (s.invoiceNumber || "").toLowerCase().includes(q)
    );
  }, [sales, searchQuery]);

  const totalSales = searchedSales.reduce((sum, s) => sum + s.amount, 0);

  const handleAdd = () => {
    if (!form.date || !form.client || !form.amount) {
      toast.error("Please fill required fields");
      return;
    }
    addSale.mutate({
      date: form.date, client: form.client, description: form.description,
      amount: parseFloat(form.amount),
      invoiceNumber: form.invoiceNumber || `INV-${Date.now().toString().slice(-4)}`,
    }, {
      onSuccess: () => { setForm({ date: "", client: "", description: "", amount: "", invoiceNumber: "" }); setOpen(false); toast.success("Sale added"); },
      onError: () => toast.error("Failed to add sale"),
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
    return [...searchedSales].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date": cmp = a.date.localeCompare(b.date); break;
        case "client": cmp = a.client.localeCompare(b.client); break;
        case "invoiceNumber": cmp = (a.invoiceNumber || "").localeCompare(b.invoiceNumber || ""); break;
        case "description": cmp = a.description.localeCompare(b.description); break;
        case "amount": cmp = a.amount - b.amount; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [searchedSales, sortField, sortDir]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === sorted.length) setSelected(new Set());
    else setSelected(new Set(sorted.map((s) => s.id)));
  };

  const handleBulkDelete = () => {
    if (selected.size === 0) return;
    bulkRemove.mutate([...selected], {
      onSuccess: () => { toast.success(`Deleted ${selected.size} sale(s)`); setSelected(new Set()); },
      onError: () => toast.error("Failed to delete"),
    });
  };

  // Create rule from selected sales (keyword → category)
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleKeyword, setRuleKeyword] = useState("");
  const [ruleCategory, setRuleCategory] = useState("");

  const openBulkRule = () => {
    const selectedSales = sales.filter((s) => selected.has(s.id));
    if (selectedSales.length > 0) {
      const first = selectedSales[0].client.split(/\s+/)[0]?.toLowerCase() || "";
      setRuleKeyword(first);
    }
    setRuleCategory("");
    setRuleDialogOpen(true);
  };

  const saveBulkRule = async () => {
    if (!ruleKeyword || !ruleCategory) { toast.error("Enter keyword and category"); return; }
    const { error } = await supabase.from("categorization_rules").insert({
      vendor_pattern: ruleKeyword,
      category: ruleCategory,
      type: "income",
      priority: 10,
      user_id: user?.id,
    });
    if (error) { toast.error("Failed to save rule"); return; }
    invalidateRulesCache();
    toast.success(`Rule saved: "${ruleKeyword}" → ${ruleCategory}`);
    setRuleDialogOpen(false);
    setRuleKeyword("");
    setRuleCategory("");
  };

  /* ── Cash Flow data ── */
  const { chartData, totalInflows, totalOutflows } = useMemo(() => {
    const monthMap: Record<string, { inflows: number; outflows: number }> = {};
    for (const s of sales) { const m = s.date.slice(0, 7); if (!monthMap[m]) monthMap[m] = { inflows: 0, outflows: 0 }; monthMap[m].inflows += s.amount; }
    for (const e of expenses) { const m = e.date.slice(0, 7); if (!monthMap[m]) monthMap[m] = { inflows: 0, outflows: 0 }; monthMap[m].outflows += e.amount; }
    const sortedM = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));
    let balance = 0;
    const data = sortedM.map((row) => { balance += row.inflows - row.outflows; return { ...row, balance }; });
    return { chartData: data, totalInflows: data.reduce((s, r) => s + r.inflows, 0), totalOutflows: data.reduce((s, r) => s + r.outflows, 0) };
  }, [expenses, sales]);

  const netCashFlow = totalInflows - totalOutflows;
  const currentBalance = chartData.length > 0 ? chartData[chartData.length - 1].balance : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Total: <span className="font-mono text-chart-positive">{formatCurrency(totalSales)}</span>
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add Sale</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Sale</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                <Input placeholder="Client name" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
                <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                <Input type="number" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                <Input placeholder="Invoice # (optional)" value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} />
                <Button onClick={handleAdd} className="w-full" disabled={addSale.isPending}>Add Sale</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="sales">
          <TabsList>
            <TabsTrigger value="sales">Sales</TabsTrigger>
            <TabsTrigger value="cashflow">Cash Flow</TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="mt-4 space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by client, description, date, or amount…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setAuditResult(auditSales(sales, expenses))}
              >
                <ShieldAlert className="h-4 w-4 mr-2" />
                Quick Audit
              </Button>
            </div>

            {auditResult && (
              <AuditIssuesPanel
                result={auditResult}
                getItemLabel={(id) => {
                  const s = sales.find((x) => x.id === id);
                  if (!s) return null;
                  return { date: s.date, label: `${s.client} — ${s.description}`, amount: s.amount };
                }}
                onDeleteItems={(ids) => {
                  bulkRemove.mutate(ids, {
                    onSuccess: () => { toast.success(`Deleted ${ids.length} sale(s)`); setAuditResult(auditSales(sales.filter((s) => !ids.includes(s.id)), expenses)); },
                  });
                }}
                onSelectItems={(ids) => setSelected(new Set(ids))}
              />
            )}
            {/* Bulk actions bar */}
            {selected.size > 0 && (
              <div className="flex items-center gap-3 bg-muted rounded-lg px-4 py-2">
                <span className="text-sm font-medium">{selected.size} selected</span>
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
                <p className="text-sm text-muted-foreground">This rule will auto-categorize future imports matching the keyword.</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Keyword pattern</label>
                    <Input value={ruleKeyword} onChange={(e) => setRuleKeyword(e.target.value)} placeholder="e.g. acme" />
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
                  <Button onClick={saveBulkRule} className="w-full" disabled={!ruleKeyword || !ruleCategory}>Save Rule</Button>
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
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("invoiceNumber")}>
                      <span className="inline-flex items-center">Invoice<SortIcon field="invoiceNumber" /></span>
                    </th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("client")}>
                      <span className="inline-flex items-center">Client<SortIcon field="client" /></span>
                    </th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("description")}>
                      <span className="inline-flex items-center">Description<SortIcon field="description" /></span>
                    </th>
                    <th className="text-right cursor-pointer select-none" onClick={() => toggleSort("amount")}>
                      <span className="inline-flex items-center justify-end">Amount<SortIcon field="amount" /></span>
                    </th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s) => (
                    <tr key={s.id} className={selected.has(s.id) ? "bg-primary/5" : ""}>
                      <td>
                        <Checkbox
                          checked={selected.has(s.id)}
                          onCheckedChange={() => toggleSelect(s.id)}
                        />
                      </td>
                      <td className="font-mono text-xs text-muted-foreground">{s.date}</td>
                      <td className="font-mono text-xs">{s.invoiceNumber}</td>
                      <td className="font-medium">{s.client}</td>
                      <td className="text-muted-foreground">{s.description}</td>
                      <td className="text-right font-mono text-chart-positive">{formatCurrency(s.amount)}</td>
                      <td>
                        <Button variant="ghost" size="icon" onClick={() => { removeSale.mutate(s.id); toast.success("Removed"); }}>
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="cashflow" className="space-y-8 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title="Total Inflows" value={totalInflows} icon={ArrowUpRight} variant="positive" />
              <StatCard title="Total Outflows" value={totalOutflows} icon={ArrowDownLeft} variant="negative" />
              <StatCard title="Net Cash Flow" value={netCashFlow} icon={Activity} variant={netCashFlow >= 0 ? "positive" : "negative"} />
              <StatCard title="Current Balance" value={currentBalance} icon={Wallet} variant={currentBalance >= 0 ? "positive" : "negative"} />
            </div>

            {chartData.length > 0 ? (
              <>
                <div className="rounded-lg border bg-card p-6">
                  <h2 className="text-lg font-medium mb-4">Monthly Cash Flow</h2>
                  <ResponsiveContainer width="100%" height={360}>
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                      <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                      <Bar dataKey="inflows" name="Inflows" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="outflows" name="Outflows" fill="hsl(var(--chart-5))" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="balance" name="Running Balance" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded-lg border bg-card p-6">
                  <h2 className="text-lg font-medium mb-4">Monthly Breakdown</h2>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Inflows</TableHead>
                        <TableHead className="text-right">Outflows</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {chartData.map((row) => (
                        <TableRow key={row.month}>
                          <TableCell className="font-medium">{row.month}</TableCell>
                          <TableCell className="text-right text-chart-positive">{formatCurrency(row.inflows)}</TableCell>
                          <TableCell className="text-right text-chart-negative">{formatCurrency(row.outflows)}</TableCell>
                          <TableCell className={`text-right ${row.inflows - row.outflows >= 0 ? "text-chart-positive" : "text-chart-negative"}`}>
                            {formatCurrency(row.inflows - row.outflows)}
                          </TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(row.balance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
                No transaction data yet. Import sales and expenses to see your cash flow.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
