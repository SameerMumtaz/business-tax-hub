import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { invalidateRulesCache } from "@/lib/categorize";
import { useAuth } from "@/hooks/useAuth";
import { EXPENSE_CATEGORIES, ExpenseCategory } from "@/types/tax";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Tag, Sparkles, BookOpen } from "lucide-react";
import { toast } from "sonner";

const INCOME_CATEGORIES = [
  "Product Sales", "Service Revenue", "Consulting",
  "Subscription", "Licensing", "Affiliate", "Interest", "Other",
];

interface Rule {
  id: string;
  vendor_pattern: string;
  category: string;
  type: string;
  priority: number;
}

export default function CategorizationRulesPage() {
  const { user } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPattern, setNewPattern] = useState("");
  const [newCategory, setNewCategory] = useState("Other");
  const [newType, setNewType] = useState<"expense" | "income">("expense");

  useEffect(() => {
    fetchRules();
  }, []);

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

    const { error } = await supabase.from("categorization_rules").insert({
      vendor_pattern: newPattern.trim().toLowerCase(),
      category: newCategory,
      type: newType,
      priority: 10,
      user_id: user?.id,
    });

    if (error) {
      toast.error("Failed to add rule");
    } else {
      toast.success(`Rule added: "${newPattern}" → ${newCategory}`);
      setNewPattern("");
      const { data } = await supabase.from("categorization_rules").select("*").order("priority", { ascending: false });
      const updated = data || [];
      setRules(updated);
      applyRulesToStore(updated);
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
    }
  }

  const categories = newType === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const expenseRules = rules.filter((r) => r.type === "expense");
  const incomeRules = rules.filter((r) => r.type === "income");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categorization Rules</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Define vendor keywords to auto-categorize imported transactions
          </p>
        </div>

        {/* How it works */}
        <div className="stat-card flex items-start gap-4">
          <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="text-sm space-y-1">
            <p className="font-medium">How categorization works</p>
            <p className="text-muted-foreground">
              When you import transactions, they're categorized in this order:{" "}
              <strong>Custom rules</strong> (highest priority) →{" "}
              <strong>AI categorization</strong> →{" "}
              <strong>Fallback to "Other"</strong>.
              User-created rules (priority 10) always override defaults (priority 0).
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
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
