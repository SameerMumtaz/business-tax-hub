import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { invalidateRulesCache, applyRulesToUncategorized } from "@/lib/categorize";
import { detectPatterns, saveInferredRule, InferredPattern } from "@/lib/ruleInference";
import SuggestedRulesPanel from "@/components/SuggestedRulesPanel";
import { useAuth } from "@/hooks/useAuth";
import { useExpenses, useSales } from "@/hooks/useData";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, ExpenseCategory } from "@/types/tax";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Tag, Sparkles, BookOpen, Lightbulb, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
interface Rule {
  id: string;
  vendor_pattern: string;
  category: string;
  type: string;
  priority: number;
}

export default function CategorizationRulesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: allExpenses = [] } = useExpenses();
  const { data: allSales = [] } = useSales();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPattern, setNewPattern] = useState("");
  const [newCategory, setNewCategory] = useState("Other");
  const [newType, setNewType] = useState<"expense" | "income">("expense");
  const [customCategoryName, setCustomCategoryName] = useState("");
  const [inferredPatterns, setInferredPatterns] = useState<InferredPattern[]>([]);
  const [detectingPatterns, setDetectingPatterns] = useState(false);
  const expenseTransactions = allExpenses.map(e => ({ id: e.id, vendor: e.vendor, category: e.category }));
  const salesTransactions = allSales.map(s => ({ id: s.id, vendor: s.client, category: s.category }));

  useEffect(() => {
    if (!user) return;
    fetchRules();
  }, [user?.id]);

  function applyRulesToStore(currentRules: Rule[]) {
    invalidateRulesCache();
  }

  async function fetchRules() {
    setLoading(true);
    const { data, error } = await supabase
      .from("categorization_rules")
      .select("*")
      .order("priority", { ascending: false });
    if (error) {
      toast.error("Failed to load rules");
    } else {
      setRules(data || []);
    }
    setLoading(false);
  }

  async function addRule() {
    if (!newPattern.trim()) {
      toast.error("Enter a vendor keyword");
      return;
    }

    const resolvedCategory = newCategory === "__custom__" ? customCategoryName.trim() : newCategory;
    if (!resolvedCategory) {
      toast.error("Enter a custom category name");
      return;
    }

    const { error } = await supabase.from("categorization_rules").insert({
      vendor_pattern: newPattern.trim().toLowerCase(),
      category: resolvedCategory,
      type: newType,
      priority: 10,
      user_id: user?.id,
    });

    if (error) {
      toast.error("Failed to add rule");
    } else {
      toast.success(`Rule added: "${newPattern}" → ${resolvedCategory}`);
      setNewPattern("");
      setCustomCategoryName("");
      const { data } = await supabase.from("categorization_rules").select("*").order("priority", { ascending: false });
      const updated = data || [];
      setRules(updated);
      applyRulesToStore(updated);

      // Auto-apply to uncategorized transactions
      if (user) {
        const { expenseCount, salesCount } = await applyRulesToUncategorized(user.id);
        const total = expenseCount + salesCount;
        if (total > 0) {
          toast.success(`✨ ${total} transaction${total > 1 ? "s" : ""} auto-categorized (${expenseCount} expense${expenseCount !== 1 ? "s" : ""}, ${salesCount} sale${salesCount !== 1 ? "s" : ""})`);
        }
        await queryClient.invalidateQueries({ queryKey: ["expenses"] });
        await queryClient.invalidateQueries({ queryKey: ["sales"] });
      }
    }
  }

  async function deleteRule(id: string) {
    const { error } = await supabase
      .from("categorization_rules")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Failed to delete rule");
    } else {
      toast.success("Rule deleted");
      const updated = rules.filter((r) => r.id !== id);
      setRules(updated);
      applyRulesToStore(updated);
    }
  }

  async function updateRuleCategory(id: string, category: string) {
    const { error } = await supabase
      .from("categorization_rules")
      .update({ category })
      .eq("id", id);
    if (error) {
      toast.error("Failed to update rule");
    } else {
      toast.success(`Category updated to ${category}`);
      const updated = rules.map((r) => r.id === id ? { ...r, category } : r);
      setRules(updated);
      applyRulesToStore(updated);

      // Re-apply all rules to uncategorized transactions
      if (user) {
        const { expenseCount, salesCount } = await applyRulesToUncategorized(user.id);
        const total = expenseCount + salesCount;
        if (total > 0) {
          toast.success(`✨ ${total} transaction${total > 1 ? "s" : ""} auto-categorized`);
        }
        await queryClient.invalidateQueries({ queryKey: ["expenses"] });
        await queryClient.invalidateQueries({ queryKey: ["sales"] });
      }
    }
  }

  const categories = newType === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const expenseRules = rules.filter((r) => r.type === "expense");
  const incomeRules = rules.filter((r) => r.type === "income");

  async function handleDetectPatterns() {
    if (!user) return;
    setDetectingPatterns(true);
    try {
      const expenseItems = allExpenses.map(e => ({ id: e.id, vendor: e.vendor, category: e.category }));
      const salesItems = allSales.map(s => ({ id: s.id, vendor: s.client, category: s.category }));
      const [expPatterns, incPatterns] = await Promise.all([
        detectPatterns(expenseItems, "expense", user.id),
        detectPatterns(salesItems, "income", user.id),
      ]);
      const all = [...expPatterns, ...incPatterns];
      setInferredPatterns(all);
      if (all.length === 0) {
        toast.info("No new patterns detected. Categorize more transactions to build patterns.");
      } else {
        toast.success(`Found ${all.length} pattern${all.length > 1 ? "s" : ""} from your categorization history`);
      }
    } catch {
      toast.error("Failed to detect patterns");
    } finally {
      setDetectingPatterns(false);
    }
  }

  async function handleAcceptPattern(pattern: InferredPattern) {
    if (!user) return;
    const { created, applied } = await saveInferredRule(pattern, user.id);
    if (created) {
      toast.success(`Rule created: "${pattern.keyword}" → ${pattern.category}${applied > 0 ? `. ${applied} transaction${applied > 1 ? "s" : ""} auto-categorized.` : ""}`);
      setInferredPatterns(prev => prev.filter(p => p.keyword !== pattern.keyword));
      fetchRules();
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    }
  }

  function handleDismissPattern(keyword: string) {
    setInferredPatterns(prev => prev.filter(p => p.keyword !== keyword));
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Categorization Rules</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Define vendor keywords to auto-categorize imported transactions
            </p>
          </div>
        </div>

        {/* Suggested rules — single unified panel */}
        <div className="stat-card">
          <SuggestedRulesPanel type="expense" transactions={[...expenseTransactions, ...salesTransactions]} onRuleSaved={fetchRules} />
        </div>

        {/* How it works */}
        <div className="stat-card flex items-start gap-4">
          <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="text-sm space-y-1">
           <p className="font-medium">How categorization works</p>
            <p className="text-muted-foreground">
              Transactions are matched using a <strong>built-in keyword database</strong> of 500+ vendor patterns
              (e.g. "amazon" → Product Sales, "uber" → Travel) with confidence scores up to <strong>0.85</strong> based
              on match quality. <strong>Your custom rules always take priority</strong> over built-in keywords.
              Anything unmatched falls back to <strong>"Other"</strong> for you to recategorize manually.
            </p>
          </div>
        </div>

        {/* Add new rule */}
        <div className="stat-card space-y-4">
          <h2 className="section-title flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Rule
          </h2>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground mb-1 block">Vendor keyword</label>
              <Input
                placeholder='e.g. "shopify", "stripe", "costco"'
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addRule()}
              />
            </div>
            <div className="w-[130px]">
              <label className="text-xs text-muted-foreground mb-1 block">Type</label>
              <Select value={newType} onValueChange={(v) => { setNewType(v as any); setNewCategory("Other"); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[200px]">
              <label className="text-xs text-muted-foreground mb-1 block">Category</label>
              <Select value={newCategory} onValueChange={(v) => { setNewCategory(v); if (v !== "__custom__") setCustomCategoryName(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                  <SelectItem value="__custom__">Custom…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newCategory === "__custom__" && (
              <div className="min-w-[180px]">
                <label className="text-xs text-muted-foreground mb-1 block">Custom name</label>
                <Input
                  placeholder="e.g. Equipment Rental"
                  value={customCategoryName}
                  onChange={(e) => setCustomCategoryName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addRule()}
                />
              </div>
            )}
            <Button onClick={addRule}>Add Rule</Button>
          </div>
        </div>

        {/* Expense rules */}
        <div className="stat-card">
          <h2 className="section-title flex items-center gap-2 mb-4">
            <Tag className="h-4 w-4" /> Expense Rules ({expenseRules.length})
          </h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : expenseRules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expense rules yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Vendor Keyword</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {expenseRules.map((r) => (
                    <tr key={r.id}>
                      <td className="font-mono text-sm">{r.vendor_pattern}</td>
                      <td>
                        <Select value={r.category} onValueChange={(v) => updateRuleCategory(r.id, v)}>
                          <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {EXPENSE_CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td>
                        <Badge variant={r.priority > 0 ? "default" : "outline"} className="text-xs">
                          {r.priority >= 10 ? "Custom" : r.priority >= 5 ? "AI Learned" : "Default"}
                        </Badge>
                      </td>
                      <td>
                        <Button variant="ghost" size="icon" onClick={() => deleteRule(r.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Income rules */}
        <div className="stat-card">
          <h2 className="section-title flex items-center gap-2 mb-4">
            <BookOpen className="h-4 w-4" /> Income Rules ({incomeRules.length})
          </h2>
          {incomeRules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No income rules yet. Add one above to start categorizing income.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Vendor Keyword</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {incomeRules.map((r) => (
                    <tr key={r.id}>
                      <td className="font-mono text-sm">{r.vendor_pattern}</td>
                      <td>
                        <Select value={r.category} onValueChange={(v) => updateRuleCategory(r.id, v)}>
                          <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {INCOME_CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td>
                        <Badge variant={r.priority > 0 ? "default" : "outline"} className="text-xs">
                          {r.priority >= 10 ? "Custom" : r.priority >= 5 ? "AI Learned" : "Default"}
                        </Badge>
                      </td>
                      <td>
                        <Button variant="ghost" size="icon" onClick={() => deleteRule(r.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
