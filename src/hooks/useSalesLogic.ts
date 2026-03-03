import { useState, useMemo } from "react";
import { ExpenseCategory } from "@/types/tax";
import { useSales, useAddSale, useRemoveSale, useUpdateSale, useBulkRemoveSales, useExpenses } from "@/hooks/useData";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useInvoices, useAddInvoice } from "@/hooks/useInvoices";
import { useClients } from "@/hooks/useClients";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { invalidateRulesCache } from "@/lib/categorize";
import { auditSales, AuditResult } from "@/lib/audit";
import { checkForPatternAfterCategoryChange } from "@/lib/ruleInference";
import { toast } from "sonner";

type SortField = "date" | "client" | "invoiceNumber" | "amount" | "description" | "category";
type SortDir = "asc" | "desc";
const PAGE_SIZE = 50;

export type { SortField, SortDir };
export { PAGE_SIZE };

export default function useSalesLogic() {
  const { data: allSales = [] } = useSales();
  const { data: allExpenses = [] } = useExpenses();
  const { filterByDate } = useDateRange();
  const sales = useMemo(() => filterByDate(allSales), [allSales, filterByDate]);
  const expenses = useMemo(() => filterByDate(allExpenses), [allExpenses, filterByDate]);
  const { data: invoices = [] } = useInvoices();
  const { data: clients = [] } = useClients();
  const { user } = useAuth();
  const addSale = useAddSale();
  const removeSale = useRemoveSale();
  const updateSale = useUpdateSale();
  const bulkRemove = useBulkRemoveSales();
  const addInvoice = useAddInvoice();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: "", client: "", description: "", amount: "", invoiceNumber: "" });
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [batchCreating, setBatchCreating] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleKeyword, setRuleKeyword] = useState("");
  const [ruleCategory, setRuleCategory] = useState("");

  const matchedSaleIds = useMemo(() => new Set(invoices.filter(inv => inv.matched_sale_id).map(inv => inv.matched_sale_id!)) as Set<string>, [invoices]);
  const persistentAudit = useMemo(() => sales.length > 0 ? auditSales(sales, expenses, matchedSaleIds) : null, [sales, expenses, matchedSaleIds]);
  const activeIssueCount = persistentAudit?.issues.length ?? 0;

  const findClientForSale = (clientName: string) => {
    const lower = clientName.toLowerCase();
    return clients.find((c) => { const cName = c.name.toLowerCase(); return cName === lower || cName.includes(lower) || lower.includes(cName); });
  };

  const handleBatchCreateInvoices = async (saleIds: string[]) => {
    const salesToInvoice = sales.filter((s) => saleIds.includes(s.id));
    if (salesToInvoice.length === 0) return;
    setBatchCreating(true);
    let created = 0, failed = 0;
    for (const sale of salesToInvoice) {
      const mc = findClientForSale(sale.client);
      try {
        await addInvoice.mutateAsync({ invoice_number: `INV-${Date.now().toString().slice(-6)}-${created}`, client_name: mc?.name || sale.client, client_email: mc?.email || undefined, client_id: mc?.id || undefined, issue_date: sale.date, matched_sale_id: sale.id, line_items: [{ description: sale.description || `Sale to ${sale.client}`, quantity: 1, unit_price: sale.amount }] });
        created++;
      } catch { failed++; }
    }
    setBatchCreating(false);
    if (failed > 0) toast.warning(`Created ${created} invoices, ${failed} failed`); else toast.success(`Created ${created} invoices`);
    const nm = new Set(matchedSaleIds); salesToInvoice.forEach((s) => nm.add(s.id)); setAuditResult(auditSales(sales, expenses, nm));
  };

  const handleInlineCreateInvoice = async (saleId: string) => {
    const sale = sales.find((s) => s.id === saleId); if (!sale) return;
    const mc = findClientForSale(sale.client);
    try {
      await addInvoice.mutateAsync({ invoice_number: `INV-${Date.now().toString().slice(-6)}`, client_name: mc?.name || sale.client, client_email: mc?.email || undefined, client_id: mc?.id || undefined, issue_date: sale.date, matched_sale_id: sale.id, line_items: [{ description: sale.description || `Sale to ${sale.client}`, quantity: 1, unit_price: sale.amount }] });
      toast.success(`Invoice created for ${sale.client}`);
      const nm = new Set(matchedSaleIds); nm.add(saleId); setAuditResult(auditSales(sales, expenses, nm));
    } catch { toast.error("Failed to create invoice"); }
  };

  const searchedSales = useMemo(() => {
    if (!searchQuery.trim()) return sales;
    const q = searchQuery.trim().toLowerCase();
    return sales.filter((s) => s.client.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.date.includes(q) || s.amount.toString().includes(q) || formatCurrency(s.amount).toLowerCase().includes(q) || (s.invoiceNumber || "").toLowerCase().includes(q));
  }, [sales, searchQuery]);

  const totalSales = searchedSales.reduce((sum, s) => sum + s.amount, 0);

  const handleAdd = () => {
    if (!form.date || !form.client || !form.amount) { toast.error("Please fill required fields"); return; }
    addSale.mutate({ date: form.date, client: form.client, description: form.description, amount: parseFloat(form.amount), invoiceNumber: form.invoiceNumber || `INV-${Date.now().toString().slice(-4)}`, category: "Other" }, {
      onSuccess: () => { setForm({ date: "", client: "", description: "", amount: "", invoiceNumber: "" }); setOpen(false); toast.success("Sale added"); },
      onError: () => toast.error("Failed to add sale"),
    });
  };

  const toggleSort = (field: SortField) => { if (sortField === field) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortField(field); setSortDir("asc"); } setCurrentPage(0); };

  const sorted = useMemo(() => {
    return [...searchedSales].sort((a, b) => {
      // Selected items float to top
      const aSelected = selected.has(a.id) ? 0 : 1;
      const bSelected = selected.has(b.id) ? 0 : 1;
      if (aSelected !== bSelected) return aSelected - bSelected;
      let cmp = 0;
      switch (sortField) {
        case "date": cmp = a.date.localeCompare(b.date); break;
        case "client": cmp = a.client.localeCompare(b.client); break;
        case "invoiceNumber": cmp = (a.invoiceNumber || "").localeCompare(b.invoiceNumber || ""); break;
        case "description": cmp = a.description.localeCompare(b.description); break;
        case "category": cmp = a.category.localeCompare(b.category); break;
        case "amount": cmp = a.amount - b.amount; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [searchedSales, sortField, sortDir, selected]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginatedRows = sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const toggleSelect = (id: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const selectItems = (ids: string[]) => { setSelected(new Set(ids)); setCurrentPage(0); };
  const toggleAll = () => { if (selected.size === sorted.length) setSelected(new Set()); else setSelected(new Set(sorted.map((s) => s.id))); };

  const handleBulkDelete = () => {
    if (selected.size === 0) return;
    const deletedIds = new Set(selected);
    bulkRemove.mutate([...selected], {
      onSuccess: () => {
        toast.success(`Deleted ${selected.size} sale(s)`);
        setSelected(new Set());
        if (auditResult) {
          const remaining = sales.filter(s => !deletedIds.has(s.id));
          setAuditResult(auditSales(remaining, expenses, matchedSaleIds));
        }
      },
      onError: () => toast.error("Failed to delete"),
    });
  };

  const handleSingleCategoryChange = (id: string, category: string) => {
    const sale = sales.find(s => s.id === id);
    updateSale.mutate({ id, category }, {
      onSuccess: () => {
        toast.success("Category updated");
        setEditingCategoryId(null);

        // Re-run audit with optimistic update so counts refresh immediately
        if (auditResult) {
          const updatedSales = sales.map(s => s.id === id ? { ...s, category: category as ExpenseCategory } : s);
          setAuditResult(auditSales(updatedSales, expenses, matchedSaleIds));
        }

        if (sale && user) {
          const updatedSales = sales.map(s => s.id === id ? { ...s, category } : s);
          const mapped = updatedSales.map(s => ({ id: s.id, vendor: s.client, category: s.category }));
          checkForPatternAfterCategoryChange(sale.client, category, mapped, "income", user.id);
        }
      },
      onError: () => toast.error("Failed to update"),
    });
  };

  const openBulkRule = () => {
    const selectedSales = sales.filter((s) => selected.has(s.id));
    if (selectedSales.length > 0) setRuleKeyword(selectedSales[0].client.split(/\s+/)[0]?.toLowerCase() || "");
    setRuleCategory(""); setRuleDialogOpen(true);
  };

  const saveBulkRule = async () => {
    if (!ruleKeyword || !ruleCategory) { toast.error("Enter keyword and category"); return; }
    const { error } = await supabase.from("categorization_rules").insert({ vendor_pattern: ruleKeyword, category: ruleCategory, type: "income", priority: 10, user_id: user?.id });
    if (error) { toast.error("Failed to save rule"); return; }
    invalidateRulesCache(); toast.success(`Rule saved: "${ruleKeyword}" → ${ruleCategory}`); setRuleDialogOpen(false); setRuleKeyword(""); setRuleCategory("");
  };

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

  return {
    sales, expenses, sorted, paginatedRows, totalPages, currentPage, setCurrentPage, totalSales,
    open, setOpen, form, setForm, handleAdd, addSale,
    sortField, sortDir, toggleSort, selected, toggleSelect, selectItems, toggleAll, handleBulkDelete,
    searchQuery, setSearchQuery, auditResult, setAuditResult, persistentAudit, activeIssueCount,
    editingCategoryId, setEditingCategoryId, batchCreating, updateSale, removeSale, bulkRemove,
    handleSingleCategoryChange,
    ruleDialogOpen, setRuleDialogOpen, ruleKeyword, setRuleKeyword, ruleCategory, setRuleCategory,
    openBulkRule, saveBulkRule, handleBatchCreateInvoices, handleInlineCreateInvoice,
    chartData, totalInflows, totalOutflows, netCashFlow, currentBalance, matchedSaleIds,
    user,
  };
}
