import { useState, useMemo } from "react";
import { useExpenses, useAddExpense, useRemoveExpense, useUpdateExpense, useBulkRemoveExpenses, useBulkUpdateExpenseCategory } from "@/hooks/useData";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { EXPENSE_CATEGORIES, ExpenseCategory } from "@/types/tax";
import { invalidateRulesCache } from "@/lib/categorize";
import { auditExpenses, AuditResult } from "@/lib/audit";
import { checkForPatternAfterCategoryChange } from "@/lib/ruleInference";
import { toast } from "sonner";

type SortField = "date" | "vendor" | "description" | "category" | "amount";
type SortDir = "asc" | "desc";
const PAGE_SIZE = 50;

export type { SortField, SortDir };
export { PAGE_SIZE };

export default function useExpensesLogic() {
  const { data: allExpenses = [] } = useExpenses();
  const { user } = useAuth();
  const { filterByDate } = useDateRange();
  const expenses = useMemo(() => filterByDate(allExpenses), [allExpenses, filterByDate]);
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
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({ id: "", date: "", vendor: "", description: "", amount: "", category: "" });
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleKeyword, setRuleKeyword] = useState("");
  const [ruleCategory, setRuleCategory] = useState("");

  const filtered = useMemo(() => {
    let result = filterCategory === "all" ? expenses : expenses.filter((e) => e.category === filterCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((e) => e.vendor.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.date.includes(q) || e.amount.toString().includes(q) || formatCurrency(e.amount).toLowerCase().includes(q));
    }
    return result;
  }, [expenses, filterCategory, searchQuery]);

  const totalFiltered = filtered.reduce((sum, e) => sum + e.amount, 0);

  const handleAdd = () => {
    if (!form.date || !form.vendor || !form.amount || !form.category) { toast.error("Please fill all required fields"); return; }
    addExpense.mutate({ date: form.date, vendor: form.vendor, description: form.description, amount: parseFloat(form.amount), category: form.category as ExpenseCategory }, {
      onSuccess: () => { setForm({ date: "", vendor: "", description: "", amount: "", category: "" }); setOpen(false); toast.success("Expense added"); },
      onError: () => toast.error("Failed to add expense"),
    });
  };

  const openEditDialog = (e: typeof expenses[0]) => { setEditForm({ id: e.id, date: e.date, vendor: e.vendor, description: e.description, amount: String(e.amount), category: e.category }); setEditDialogOpen(true); };

  const handleEditSave = () => {
    if (!editForm.date || !editForm.vendor || !editForm.amount || !editForm.category) { toast.error("Please fill all required fields"); return; }
    updateExpense.mutate({ id: editForm.id, date: editForm.date, vendor: editForm.vendor, description: editForm.description, amount: parseFloat(editForm.amount), category: editForm.category }, {
      onSuccess: () => { setEditDialogOpen(false); toast.success("Expense updated"); },
      onError: () => toast.error("Failed to update"),
    });
  };

  const toggleSort = (field: SortField) => { if (sortField === field) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortField(field); setSortDir("asc"); } setCurrentPage(0); };

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      // Selected items float to top
      const aSelected = selected.has(a.id) ? 0 : 1;
      const bSelected = selected.has(b.id) ? 0 : 1;
      if (aSelected !== bSelected) return aSelected - bSelected;
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
  }, [filtered, sortField, sortDir, selected]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginatedRows = sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const toggleSelect = (id: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const selectItems = (ids: string[]) => { setSelected(new Set(ids)); setCurrentPage(0); };
  const toggleAll = () => { if (selected.size === sorted.length) setSelected(new Set()); else setSelected(new Set(sorted.map((e) => e.id))); };

  const handleBulkDelete = () => {
    if (selected.size === 0) return;
    const deletedIds = new Set(selected);
    bulkRemove.mutate([...selected], {
      onSuccess: () => {
        toast.success(`Deleted ${selected.size} expense(s)`);
        setSelected(new Set());
        if (auditResult) {
          const remaining = expenses.filter(e => !deletedIds.has(e.id));
          setAuditResult(auditExpenses(remaining));
        }
      },
      onError: () => toast.error("Failed to delete"),
    });
  };

  const handleBulkCategoryChange = (category: string) => {
    if (selected.size === 0) return;
    bulkUpdateCategory.mutate({ ids: [...selected], category }, {
      onSuccess: () => {
        toast.success(`Updated ${selected.size} expense(s)`);
        const updatedExpenses = expenses.map(e => selected.has(e.id) ? { ...e, category: category as ExpenseCategory } : e);
        // Re-run audit so fixed transactions disappear from issues
        if (auditResult) {
          setAuditResult(auditExpenses(updatedExpenses));
        }
        // Check for pattern inference after bulk change
        const firstSelected = expenses.find(e => selected.has(e.id));
        if (firstSelected && user) {
          checkForPatternAfterCategoryChange(firstSelected.vendor, category, updatedExpenses, "expense", user.id);
        }
        setSelected(new Set());
      },
      onError: () => toast.error("Failed to update"),
    });
  };

  const handleSingleCategoryChange = (id: string, category: string) => {
    const expense = expenses.find(e => e.id === id);
    updateExpense.mutate({ id, category }, {
      onSuccess: () => {
        toast.success("Category updated");
        setEditingCategoryId(null);

        // Re-run audit with the optimistic update so counts refresh immediately
        if (auditResult) {
          const updatedExpenses = expenses.map(e => e.id === id ? { ...e, category: category as ExpenseCategory } : e);
          setAuditResult(auditExpenses(updatedExpenses));
        }

        // Check for pattern inference
        if (expense && user) {
          const updatedExpenses = expenses.map(e => e.id === id ? { ...e, category } : e);
          checkForPatternAfterCategoryChange(expense.vendor, category, updatedExpenses, "expense", user.id);
        }
      },
      onError: () => toast.error("Failed to update"),
    });
  };

  const openBulkRule = () => {
    const selectedExpenses = expenses.filter((e) => selected.has(e.id));
    if (selectedExpenses.length > 0) { setRuleKeyword(selectedExpenses[0].vendor.split(/\s+/)[0]?.toLowerCase() || ""); const cats = new Set(selectedExpenses.map((e) => e.category)); setRuleCategory(cats.size === 1 ? [...cats][0] : ""); }
    setRuleDialogOpen(true);
  };

  const saveBulkRule = async () => {
    if (!ruleKeyword || !ruleCategory) { toast.error("Enter keyword and category"); return; }
    const { error } = await supabase.from("categorization_rules").insert({ vendor_pattern: ruleKeyword, category: ruleCategory, type: "expense", priority: 10, user_id: user?.id });
    if (error) { toast.error("Failed to save rule"); return; }
    invalidateRulesCache(); toast.success(`Rule saved: "${ruleKeyword}" → ${ruleCategory}`);
    const matchingIds = expenses.filter((e) => selected.has(e.id) && e.vendor.toLowerCase().includes(ruleKeyword.toLowerCase())).map((e) => e.id);
    if (matchingIds.length > 0) bulkUpdateCategory.mutate({ ids: matchingIds, category: ruleCategory });
    setRuleDialogOpen(false); setRuleKeyword(""); setRuleCategory("");
  };

  const { months, categories, monthlyData, spikes } = useMemo(() => {
    const catMonthMap: Record<string, Record<string, number>> = {};
    const monthSet = new Set<string>();
    for (const e of expenses) { const m = e.date.slice(0, 7); monthSet.add(m); if (!catMonthMap[e.category]) catMonthMap[e.category] = {}; catMonthMap[e.category][m] = (catMonthMap[e.category][m] || 0) + e.amount; }
    const sortedMonths = [...monthSet].sort(); const cats = Object.keys(catMonthMap).sort();
    const data = sortedMonths.map((m) => { const row: Record<string, string | number> = { month: m }; for (const cat of cats) row[cat] = catMonthMap[cat][m] || 0; return row; });
    const spikeList: { category: string; month: string; amount: number; avg: number; pctOver: number }[] = [];
    for (const cat of cats) { for (let i = 0; i < sortedMonths.length; i++) { const m = sortedMonths[i]; const val = catMonthMap[cat][m] || 0; if (i < 3 || val === 0) continue; const prev3 = [catMonthMap[cat][sortedMonths[i-1]]||0, catMonthMap[cat][sortedMonths[i-2]]||0, catMonthMap[cat][sortedMonths[i-3]]||0]; const avg = prev3.reduce((a, b) => a + b, 0) / 3; if (avg > 0 && val > avg * 1.5) spikeList.push({ category: cat, month: m, amount: val, avg, pctOver: ((val - avg) / avg) * 100 }); } }
    return { months: sortedMonths, categories: cats, monthlyData: data, spikes: spikeList };
  }, [expenses]);

  const latestMonth = months.length > 0 ? months[months.length - 1] : null;
  const currentSpikes = spikes.filter((s) => s.month === latestMonth);
  const visibleCats = trendFilterCat === "all" ? categories : categories.filter((c) => c === trendFilterCat);

  return {
    expenses, sorted, paginatedRows, totalPages, currentPage, setCurrentPage, totalFiltered,
    open, setOpen, form, setForm, handleAdd, addExpense,
    editDialogOpen, setEditDialogOpen, editForm, setEditForm, handleEditSave, openEditDialog,
    filterCategory, setFilterCategory, sortField, sortDir, toggleSort,
    selected, toggleSelect, selectItems, toggleAll, handleBulkDelete, handleBulkCategoryChange,
    editingCategoryId, setEditingCategoryId, handleSingleCategoryChange,
    searchQuery, setSearchQuery, auditResult, setAuditResult,
    ruleDialogOpen, setRuleDialogOpen, ruleKeyword, setRuleKeyword, ruleCategory, setRuleCategory,
    openBulkRule, saveBulkRule, removeExpense, updateExpense, bulkRemove,
    trendFilterCat, setTrendFilterCat, months, categories, monthlyData, currentSpikes, visibleCats,
    user,
  };
}
