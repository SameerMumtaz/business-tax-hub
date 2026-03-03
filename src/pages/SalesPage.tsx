import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import SuggestedRulesPanel from "@/components/SuggestedRulesPanel";
import RuleSuggestionDialog from "@/components/RuleSuggestionDialog";
import { extractVendorName } from "@/lib/ruleInference";
import DashboardLayout from "@/components/DashboardLayout";
import useSalesLogic, { PAGE_SIZE } from "@/hooks/useSalesLogic";
import DateRangeFilter from "@/components/DateRangeFilter";
import ExportButton from "@/components/ExportButton";
import { formatCurrency } from "@/lib/format";
import { EXPENSE_CATEGORIES } from "@/types/tax";
import StatCard from "@/components/StatCard";
import AuditIssuesPanel from "@/components/AuditIssuesPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, ArrowDownLeft, ArrowUpRight, Activity, Wallet, ArrowUpDown, ArrowUp, ArrowDown, Tag, Search, ShieldAlert, Pencil, AlertTriangle, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { toast } from "sonner";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { auditSales } from "@/lib/audit";
import { useAuditDismissals } from "@/hooks/useAuditDismissals";
import { applyRulesToUncategorized } from "@/lib/categorize";

export default function SalesPage() {
  const queryClient = useQueryClient();
  const logic = useSalesLogic();
  const { dismissedSet, dismiss: dismissAudit, undismiss: undismissAudit } = useAuditDismissals();
  const {
    sales, sorted, paginatedRows, totalPages, currentPage, setCurrentPage, totalSales,
    open, setOpen, form, setForm, handleAdd, addSale,
    sortField, sortDir, toggleSort, selected, toggleSelect, toggleAll, handleBulkDelete,
    searchQuery, setSearchQuery, filterCategory, setFilterCategory, auditResult, setAuditResult, persistentAudit, activeIssueCount,
    pendingRuleSuggestion, setPendingRuleSuggestion,
    editingCategoryId, setEditingCategoryId, updateSale, removeSale, handleSingleCategoryChange,
    ruleDialogOpen, setRuleDialogOpen, ruleKeyword, setRuleKeyword, ruleCategory, setRuleCategory,
    openBulkRule, saveBulkRule, handleBatchCreateInvoices, handleInlineCreateInvoice,
    chartData, totalInflows, totalOutflows, netCashFlow, currentBalance, expenses, matchedSaleIds,
    user,
  } = logic;
  const [unfilteredAuditResult, setUnfilteredAuditResult] = useState<typeof auditResult>(null);

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
            <p className="text-muted-foreground text-sm mt-1">{filterCategory !== "all" && <span>{filterCategory} — </span>}Total: <span className="font-mono text-chart-positive">{formatCurrency(totalSales)}</span></p>
          </div>
          <div className="flex items-center gap-2">
            <DateRangeFilter />
            <ExportButton data={sorted.map((s) => ({ date: s.date, client: s.client, description: s.description, invoice: s.invoiceNumber, category: s.category, amount: s.amount }))} filename="sales" columns={[{ key: "date", label: "Date" }, { key: "client", label: "Client" }, { key: "description", label: "Description" }, { key: "invoice", label: "Invoice #" }, { key: "category", label: "Category" }, { key: "amount", label: "Amount" }]} />
            <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v); setCurrentPage(0); }}>
              <SelectTrigger className="w-[180px]"><Filter className="h-3.5 w-3.5 mr-2" /><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Categories</SelectItem>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Sale</Button></DialogTrigger>
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

        {persistentAudit && activeIssueCount > 0 && !auditResult && (
          <Alert variant="destructive" className="cursor-pointer" onClick={() => setAuditResult(persistentAudit)}>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="flex items-center gap-2">
              {activeIssueCount} audit issue{activeIssueCount !== 1 ? "s" : ""} detected
              {persistentAudit.totalDollarImpact > 0 && <Badge variant="outline" className="text-[10px] font-mono ml-1">{formatCurrency(persistentAudit.totalDollarImpact)} impacted</Badge>}
            </AlertTitle>
            <AlertDescription className="text-xs">Click to review and resolve.</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="sales">
          <TabsList>
            <TabsTrigger value="sales">Sales{activeIssueCount > 0 && <Badge variant="destructive" className="ml-2 text-[10px] h-5 w-5 rounded-full p-0 flex items-center justify-center">{activeIssueCount}</Badge>}</TabsTrigger>
            <TabsTrigger value="cashflow">Cash Flow</TabsTrigger>
            <TabsTrigger value="rules">Rules</TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="mt-4 space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search…" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(0); }} className="pl-9" /></div>
              <Button variant="outline" onClick={async () => {
                if (user) {
                  const { expenseCount, salesCount } = await applyRulesToUncategorized(user.id);
                  const total = expenseCount + salesCount;
                  if (total > 0) {
                    toast.success(`✨ ${total} transaction${total > 1 ? "s" : ""} auto-categorized with rules`);
                  }
                  await queryClient.refetchQueries({ queryKey: ["expenses", user.id] });
                  await queryClient.refetchQueries({ queryKey: ["sales", user.id] });
                  await queryClient.refetchQueries({ queryKey: ["audit_dismissals", user.id] });
                }
                const freshSales = queryClient.getQueryData<typeof sales>(["sales", user?.id]) || sales;
                const freshDismissals = queryClient.getQueryData<{ transaction_id: string; issue_type: string }[]>(["audit_dismissals", user?.id]) ?? [];
                const freshDismissedSet = new Set(freshDismissals.map((d) => `${d.transaction_id}::${d.issue_type}`));
                setUnfilteredAuditResult(auditSales(freshSales, expenses, matchedSaleIds));
                setAuditResult(auditSales(freshSales, expenses, matchedSaleIds, freshDismissedSet));
              }}><ShieldAlert className="h-4 w-4 mr-2" />Quick Audit</Button>
            </div>

            {auditResult && (
              <AuditIssuesPanel result={auditResult} unfilteredResult={unfilteredAuditResult ?? undefined} dismissedSet={dismissedSet} getItemLabel={(id) => { const s = sales.find((x) => x.id === id); if (!s) return null; return { date: s.date, label: `${s.client} — ${s.description}`, amount: s.amount }; }}
                onDeleteItems={(ids) => { logic.bulkRemove.mutate(ids, { onSuccess: () => { toast.success(`Deleted ${ids.length} sale(s)`); const freshDismissals = queryClient.getQueryData<{ transaction_id: string; issue_type: string }[]>(["audit_dismissals", user?.id]) ?? []; const ds = new Set(freshDismissals.map((d) => `${d.transaction_id}::${d.issue_type}`)); logic.setAuditResult(auditSales(sales.filter((s) => !ids.includes(s.id)), logic.expenses, logic.matchedSaleIds, ds)); } }); }}
                onSelectItems={(ids) => { logic.selectItems(ids); toast.info(`Selected ${ids.length} item(s)`); }}
                onCreateInvoice={handleInlineCreateInvoice}
                onBatchCreateInvoices={(ids) => handleBatchCreateInvoices(ids)}
                onDismissItems={(items) => { dismissAudit.mutate(items, { onSuccess: () => toast.success("Marked as non-issue — won't appear in future audits") }); }}
                onUndismissItems={(items) => { undismissAudit.mutate(items, { onSuccess: () => toast.success("Issue restored — will appear in future audits") }); }}
              />
            )}

            {selected.size > 0 && (
              <div className="flex items-center gap-3 bg-muted rounded-lg px-4 py-2">
                <span className="text-sm font-medium">{selected.size} selected</span>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openBulkRule}><Tag className="h-3 w-3 mr-1" /> Create Rule</Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="h-7 text-xs text-destructive"><Trash2 className="h-3 w-3 mr-1" /> Delete</Button></AlertDialogTrigger>
                  <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {selected.size} sale(s)?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                </AlertDialog>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleAll()}>Clear</Button>
              </div>
            )}

            <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Categorization Rule</DialogTitle></DialogHeader>
                <p className="text-sm text-muted-foreground">Auto-categorize future imports matching this keyword.</p>
                <div className="space-y-3">
                  <div><label className="text-xs text-muted-foreground mb-1 block">Keyword</label><Input value={ruleKeyword} onChange={(e) => setRuleKeyword(e.target.value)} placeholder="e.g. acme" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">Category</label><Select value={ruleCategory} onValueChange={setRuleCategory}><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
                  <Button onClick={saveBulkRule} className="w-full" disabled={!ruleKeyword || !ruleCategory}>Save Rule</Button>
                </div>
              </DialogContent>
            </Dialog>

            <div className="stat-card overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-10"><Checkbox checked={sorted.length > 0 && selected.size === sorted.length} onCheckedChange={toggleAll} /></th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("date")}><span className="inline-flex items-center">Date<SortIcon field="date" /></span></th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("invoiceNumber")}><span className="inline-flex items-center">Invoice<SortIcon field="invoiceNumber" /></span></th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("client")}><span className="inline-flex items-center">Client<SortIcon field="client" /></span></th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("description")}><span className="inline-flex items-center">Description<SortIcon field="description" /></span></th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("category")}><span className="inline-flex items-center">Category<SortIcon field="category" /></span></th>
                    <th className="text-right cursor-pointer select-none" onClick={() => toggleSort("amount")}><span className="inline-flex items-center justify-end">Amount<SortIcon field="amount" /></span></th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((s) => (
                    <tr key={s.id} className={selected.has(s.id) ? "bg-primary/5" : ""}>
                      <td><Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggleSelect(s.id)} /></td>
                      <td className="font-mono text-xs text-muted-foreground">{s.date}</td>
                      <td className="font-mono text-xs">{s.invoiceNumber}</td>
                      <td className="font-medium" title={s.client}>{extractVendorName(s.client) || s.client}</td>
                      <td className="text-muted-foreground">{s.description}</td>
                      <td>
                        {editingCategoryId === s.id ? (
                          <Select value={s.category} onValueChange={(v) => handleSingleCategoryChange(s.id, v)}>
                            <SelectTrigger className="h-7 text-xs w-[150px]"><SelectValue /></SelectTrigger>
                            <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <button onClick={() => setEditingCategoryId(s.id)} className="group flex items-center gap-1">
                            <Badge variant="secondary" className="text-xs font-normal">{s.category}</Badge>
                            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        )}
                      </td>
                      <td className="text-right font-mono text-chart-positive">{formatCurrency(s.amount)}</td>
                      <td>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button></AlertDialogTrigger>
                          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete sale?</AlertDialogTitle><AlertDialogDescription>{s.client} — {formatCurrency(s.amount)} on {s.date}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { removeSale.mutate(s.id); toast.success("Removed"); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                        </AlertDialog>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">Showing {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setCurrentPage((p) => p - 1)}><ChevronLeft className="h-4 w-4 mr-1" />Previous</Button>
                  <span className="text-sm text-muted-foreground">Page {currentPage + 1} of {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage((p) => p + 1)}>Next<ChevronRight className="h-4 w-4 ml-1" /></Button>
                </div>
              </div>
            )}
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
                    <TableHeader><TableRow><TableHead>Month</TableHead><TableHead className="text-right">Inflows</TableHead><TableHead className="text-right">Outflows</TableHead><TableHead className="text-right">Net</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {chartData.map((row) => (
                        <TableRow key={row.month}>
                          <TableCell className="font-medium">{row.month}</TableCell>
                          <TableCell className="text-right text-chart-positive">{formatCurrency(row.inflows)}</TableCell>
                          <TableCell className="text-right text-chart-negative">{formatCurrency(row.outflows)}</TableCell>
                          <TableCell className={`text-right ${row.inflows - row.outflows >= 0 ? "text-chart-positive" : "text-chart-negative"}`}>{formatCurrency(row.inflows - row.outflows)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(row.balance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">No transaction data yet.</div>
            )}
          </TabsContent>

          <TabsContent value="rules" className="mt-4">
            <SuggestedRulesPanel type="income" transactions={sales.map(s => ({ id: s.id, vendor: s.client, category: s.category }))} />
          </TabsContent>
        </Tabs>
      </div>
      <RuleSuggestionDialog
        suggestion={pendingRuleSuggestion}
        onClose={() => setPendingRuleSuggestion(null)}
        onApplied={() => {
          queryClient.invalidateQueries({ queryKey: ["sales", user?.id] });
        }}
      />
    </DashboardLayout>
  );
}
