import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import SuggestedRulesPanel from "@/components/SuggestedRulesPanel";
import RuleSuggestionDialog from "@/components/RuleSuggestionDialog";
import VehicleAssignDialog from "@/components/VehicleAssignDialog";
import { supabase } from "@/integrations/supabase/client";
import { extractVendorName } from "@/lib/ruleInference";
import DashboardLayout from "@/components/DashboardLayout";
import useExpensesLogic, { PAGE_SIZE } from "@/hooks/useExpensesLogic";
import { LINE_COLORS } from "@/lib/chartTheme";
import DateRangeFilter from "@/components/DateRangeFilter";
import ExportButton from "@/components/ExportButton";
import ReceiptUploadButton from "@/components/ReceiptUploadButton";
import AuditIssuesPanel from "@/components/AuditIssuesPanel";
import { formatCurrency } from "@/lib/format";
import { EXPENSE_CATEGORIES } from "@/types/tax";
import { auditExpenses } from "@/lib/audit";
import { useAuditDismissals } from "@/hooks/useAuditDismissals";
import { applyRulesToUncategorized } from "@/lib/categorize";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2, Filter, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, Tag, Pencil, Search, ShieldAlert, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const logic = useExpensesLogic();
  const { dismissedSet, dismiss: dismissAudit, undismiss: undismissAudit } = useAuditDismissals();
  const {
    expenses, sorted, paginatedRows, totalPages, currentPage, setCurrentPage, totalFiltered,
    open, setOpen, form, setForm, handleAdd, addExpense,
    editDialogOpen, setEditDialogOpen, editForm, setEditForm, handleEditSave, openEditDialog,
    filterCategory, setFilterCategory, sortField, sortDir, toggleSort,
    selected, toggleSelect, selectItems, toggleAll, handleBulkDelete, handleBulkCategoryChange,
    editingCategoryId, setEditingCategoryId, handleSingleCategoryChange,
    searchQuery, setSearchQuery, auditResult, setAuditResult,
    pendingRuleSuggestion, setPendingRuleSuggestion,
    ruleDialogOpen, setRuleDialogOpen, ruleKeyword, setRuleKeyword, ruleCategory, setRuleCategory,
    openBulkRule, saveBulkRule, removeExpense, updateExpense, bulkRemove,
    trendFilterCat, setTrendFilterCat, categories, monthlyData, currentSpikes, visibleCats,
    user,
  } = logic;
  const [unfilteredAuditResult, setUnfilteredAuditResult] = useState<typeof auditResult>(null);
  const [vehicleAssign, setVehicleAssign] = useState<{ open: boolean; expenseId: string; amount: number; date: string }>({ open: false, expenseId: "", amount: 0, date: "" });

  // Wrap category change to trigger vehicle assignment dialog or clean up vehicle links
  const handleCategoryChangeWithVehicle = async (id: string, category: string) => {
    const expense = expenses.find(e => e.id === id);
    const wasPreviouslyVehiclePayment = expense?.category === "Vehicle Payment";

    handleSingleCategoryChange(id, category);

    if (category === "Vehicle Payment") {
      if (expense) {
        setVehicleAssign({ open: true, expenseId: id, amount: expense.amount, date: expense.date });
      }
    } else if (wasPreviouslyVehiclePayment) {
      // Removing from Vehicle Payment — clean up linked vehicle data
      try {
        // Find and remove vehicle_expenses link
        const { data: links } = await supabase
          .from("vehicle_expenses")
          .select("id, vehicle_id")
          .eq("expense_id", id);

        if (links && links.length > 0) {
          const vehicleId = links[0].vehicle_id;
          // Remove the link
          await supabase.from("vehicle_expenses").delete().eq("expense_id", id);

          // Remove any vehicle_payment that was linked from this expense
          // (matched by vehicle_id, amount, date, and notes containing "Linked from expense")
          if (expense) {
            await supabase
              .from("vehicle_payments")
              .delete()
              .eq("vehicle_id", vehicleId)
              .eq("amount_paid", expense.amount)
              .eq("date_paid", expense.date)
              .like("notes", "%Linked from expense%");
          }

          // Invalidate vehicle-related queries
          queryClient.invalidateQueries({ queryKey: ["vehicle_payments", vehicleId] });
          queryClient.invalidateQueries({ queryKey: ["vehicle_payments_all"] });
          queryClient.invalidateQueries({ queryKey: ["vehicle_expenses", vehicleId] });
        }
      } catch {
        // Non-critical — log but don't block
        console.warn("Failed to clean up vehicle payment link");
      }
    }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
            <p className="text-muted-foreground text-sm mt-1">{filterCategory !== "all" && <span>{filterCategory} — </span>}Total: <span className="font-mono text-chart-negative">{formatCurrency(totalFiltered)}</span></p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <DateRangeFilter />
            <ExportButton data={sorted.map((e) => ({ date: e.date, vendor: e.vendor, description: e.description, category: e.category, amount: e.amount }))} filename="expenses" columns={[{ key: "date", label: "Date" }, { key: "vendor", label: "Vendor" }, { key: "description", label: "Description" }, { key: "category", label: "Category" }, { key: "amount", label: "Amount" }]} />
            <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v); setCurrentPage(0); }}>
              <SelectTrigger className="w-[180px]"><Filter className="h-3.5 w-3.5 mr-2" /><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Categories</SelectItem>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
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
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger><SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
                  <Button onClick={handleAdd} className="w-full" disabled={addExpense.isPending}>Add Expense</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Expense</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} />
              <Input placeholder="Vendor" value={editForm.vendor} onChange={(e) => setEditForm({ ...editForm, vendor: e.target.value })} />
              <Input placeholder="Description" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
              <Input type="number" placeholder="Amount" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} />
              <Select value={editForm.category} onValueChange={(v) => setEditForm({ ...editForm, category: v })}><SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger><SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
              <Button onClick={handleEditSave} className="w-full" disabled={updateExpense.isPending}>Save Changes</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Tabs defaultValue={new URLSearchParams(window.location.search).get("tab") || "expenses"}>
          <TabsList><TabsTrigger value="expenses">Expenses</TabsTrigger><TabsTrigger value="trends">Trends & Alerts</TabsTrigger><TabsTrigger value="rules">Rules</TabsTrigger></TabsList>

          <TabsContent value="expenses" className="mt-4 space-y-3">
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
                // Use fresh data from cache after refetch completes
                const freshExpenses = queryClient.getQueryData<typeof expenses>(["expenses", user?.id]) ?? expenses;
                const freshDismissals = queryClient.getQueryData<{ transaction_id: string; issue_type: string }[]>(["audit_dismissals", user?.id]) ?? [];
                const freshDismissedSet = new Set(freshDismissals.map((d) => `${d.transaction_id}::${d.issue_type}`));
                setUnfilteredAuditResult(auditExpenses(freshExpenses));
                setAuditResult(auditExpenses(freshExpenses, freshDismissedSet));
              }}><ShieldAlert className="h-4 w-4 mr-2" />Quick Audit</Button>
            </div>

            {auditResult && (
              <AuditIssuesPanel result={auditResult} unfilteredResult={unfilteredAuditResult ?? undefined} dismissedSet={dismissedSet} getItemLabel={(id) => { const e = expenses.find((x) => x.id === id); if (!e) return null; return { date: e.date, label: `${e.vendor} — ${e.description}`, amount: e.amount }; }}
                onDeleteItems={(ids) => { bulkRemove.mutate(ids, { onSuccess: () => { toast.success(`Deleted ${ids.length} expense(s)`); const freshDismissals = queryClient.getQueryData<{ transaction_id: string; issue_type: string }[]>(["audit_dismissals", user?.id]) ?? []; const ds = new Set(freshDismissals.map((d) => `${d.transaction_id}::${d.issue_type}`)); setAuditResult(auditExpenses(expenses.filter((e) => !ids.includes(e.id)), ds)); } }); }}
                onSelectItems={(ids) => { selectItems(ids); toast.info(`Selected ${ids.length} item(s)`); }}
                onDismissItems={(items) => { dismissAudit.mutate(items, { onSuccess: () => toast.success("Marked as non-issue — won't appear in future audits") }); }}
                onUndismissItems={(items) => { undismissAudit.mutate(items, { onSuccess: () => toast.success("Issue restored — will appear in future audits") }); }}
              />
            )}

            {selected.size > 0 && (
              <div className="flex items-center gap-3 bg-muted rounded-lg px-4 py-2 flex-wrap">
                <span className="text-sm font-medium">{selected.size} selected</span>
                <Select onValueChange={handleBulkCategoryChange}>
                  <SelectTrigger className="h-7 text-xs w-[160px]"><Pencil className="h-3 w-3 mr-1" /><SelectValue placeholder="Set category" /></SelectTrigger>
                  <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openBulkRule}><Tag className="h-3 w-3 mr-1" /> Create Rule</Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="h-7 text-xs text-destructive"><Trash2 className="h-3 w-3 mr-1" /> Delete</Button></AlertDialogTrigger>
                  <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {selected.size} expense(s)?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                </AlertDialog>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleAll()}>Clear</Button>
              </div>
            )}

            <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Categorization Rule</DialogTitle></DialogHeader>
                <p className="text-sm text-muted-foreground">Auto-categorize future imports and update selected expenses.</p>
                <div className="space-y-3">
                  <div><label className="text-xs text-muted-foreground mb-1 block">Keyword</label><Input value={ruleKeyword} onChange={(e) => setRuleKeyword(e.target.value)} placeholder="e.g. adobe" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">Category</label><Select value={ruleCategory} onValueChange={setRuleCategory}><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
                  <Button onClick={saveBulkRule} className="w-full" disabled={!ruleKeyword || !ruleCategory}>Save Rule & Apply</Button>
                </div>
              </DialogContent>
            </Dialog>

            <div className="stat-card overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-10"><Checkbox checked={sorted.length > 0 && selected.size === sorted.length} onCheckedChange={toggleAll} /></th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("date")}><span className="inline-flex items-center">Date<SortIcon field="date" /></span></th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("vendor")}><span className="inline-flex items-center">Vendor<SortIcon field="vendor" /></span></th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("description")}><span className="inline-flex items-center">Description<SortIcon field="description" /></span></th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("category")}><span className="inline-flex items-center">Category<SortIcon field="category" /></span></th>
                    <th className="text-right cursor-pointer select-none" onClick={() => toggleSort("amount")}><span className="inline-flex items-center justify-end">Amount<SortIcon field="amount" /></span></th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((e) => (
                    <tr key={e.id} className={selected.has(e.id) ? "bg-primary/5" : ""}>
                      <td><Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggleSelect(e.id)} /></td>
                      <td className="font-mono text-xs text-muted-foreground">{e.date}</td>
                      <td className="font-medium" title={e.vendor}>{extractVendorName(e.vendor) || e.vendor}</td>
                      <td className="text-muted-foreground">{e.description}</td>
                      <td>
                        {editingCategoryId === e.id ? (
                          <Select value={e.category} onValueChange={(v) => handleCategoryChangeWithVehicle(e.id, v)}><SelectTrigger className="h-7 text-xs w-[150px]"><SelectValue /></SelectTrigger><SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
                        ) : (
                          <button onClick={() => setEditingCategoryId(e.id)} className="group flex items-center gap-1"><Badge variant="secondary" className="text-xs font-normal">{e.category}</Badge><Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" /></button>
                        )}
                      </td>
                      <td className="text-right font-mono text-chart-negative">{formatCurrency(e.amount)}</td>
                      <td className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(e)}><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                        <ReceiptUploadButton expenseId={e.id} receiptUrl={(e as any).receipt_url} userId={user?.id} />
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button></AlertDialogTrigger>
                          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete expense?</AlertDialogTitle><AlertDialogDescription>{e.vendor} — {formatCurrency(e.amount)} on {e.date}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { removeExpense.mutate(e.id); toast.success("Removed"); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
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

          <TabsContent value="trends" className="space-y-8 mt-4">
            {currentSpikes.length > 0 && (
              <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Spending Spikes Detected</AlertTitle><AlertDescription>{currentSpikes.map((s) => <span key={s.category} className="block"><strong>{s.category}</strong>: {formatCurrency(s.amount)} — {s.pctOver.toFixed(0)}% above average ({formatCurrency(s.avg)})</span>)}</AlertDescription></Alert>
            )}
            <div className="flex items-center gap-3">
              <label className="text-sm text-muted-foreground">Filter category:</label>
              <Select value={trendFilterCat} onValueChange={setTrendFilterCat}><SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Categories</SelectItem>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
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
                    {visibleCats.map((cat, i) => <Line key={cat} type="monotone" dataKey={cat} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={false} />)}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">No expense data yet.</div>
            )}
          </TabsContent>

          <TabsContent value="rules" className="mt-4">
            <SuggestedRulesPanel type="expense" transactions={expenses.map(e => ({ id: e.id, vendor: e.vendor, category: e.category }))} />
          </TabsContent>
        </Tabs>
      </div>
      <RuleSuggestionDialog
        suggestion={pendingRuleSuggestion}
        onClose={() => setPendingRuleSuggestion(null)}
        onApplied={() => {
          queryClient.invalidateQueries({ queryKey: ["expenses", user?.id] });
        }}
      />
      <VehicleAssignDialog
        open={vehicleAssign.open}
        onOpenChange={(open) => setVehicleAssign(prev => ({ ...prev, open }))}
        expenseId={vehicleAssign.expenseId}
        expenseAmount={vehicleAssign.amount}
        expenseDate={vehicleAssign.date}
      />
    </DashboardLayout>
  );
}
