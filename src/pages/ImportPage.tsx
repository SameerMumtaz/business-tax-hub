import { useState, useCallback, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useTaxStore } from "@/store/taxStore";
import { parseCSV, ParsedTransaction } from "@/lib/csvParser";
import { categorizeTransactions } from "@/lib/categorize";
import { formatCurrency, generateId } from "@/lib/format";
import { EXPENSE_CATEGORIES, ExpenseCategory } from "@/types/tax";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, Landmark, Check, X, FileUp, ArrowRight, Sparkles, Loader2, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Lightbulb, Plus, XCircle } from "lucide-react";
import { toast } from "sonner";

type SortField = "date" | "description" | "type" | "category" | "amount";
type SortDir = "asc" | "desc";


interface ReviewTransaction extends ParsedTransaction {
  id: string;
  category: ExpenseCategory;
  include: boolean;
  catSource?: "rule" | "ai" | "keyword";
  userEdited?: boolean;
}

interface RuleSuggestion {
  keyword: string;
  category: string;
  type: "expense" | "income";
  count: number;
  saved?: boolean;
}
function extractKeyword(description: string): string | null {
  const words = description.toLowerCase().replace(/[^a-z0-9\s&]/g, "").split(/\s+/);
  // Skip common filler words, return first meaningful word (3+ chars)
  const stopWords = new Set(["the", "and", "for", "from", "payment", "purchase", "pos", "ach", "debit", "credit", "to", "inc", "llc", "ltd", "corp"]);
  for (const word of words) {
    if (word.length >= 3 && !stopWords.has(word)) return word;
  }
  return null;
}

export default function ImportPage() {
  const { addExpense, addSale } = useTaxStore();
  const [transactions, setTransactions] = useState<ReviewTransaction[]>([]);
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [dragOver, setDragOver] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".tsv") && !file.name.endsWith(".txt")) {
      toast.error("Please upload a CSV file");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        toast.error("No transactions found. Check the CSV format.");
        return;
      }

      const reviewed: ReviewTransaction[] = parsed.map((t) => ({
        ...t,
        id: generateId(),
        category: "Other" as ExpenseCategory,
        include: true,
      }));

      setTransactions(reviewed);
      setStep("review");

      // Step 1: Apply rules only (no AI)
      setCategorizing(true);
      try {
        const results = await categorizeTransactions(
          reviewed.map((t) => ({ id: t.id, description: t.description, type: t.type })),
          false // useAI = false
        );
        setTransactions((prev) =>
          prev.map((t) => {
            const match = results.find((r) => r.id === t.id);
            if (match && match.category !== "Other") {
              return { ...t, category: match.category as ExpenseCategory, catSource: match.source };
            }
            return t;
          })
        );
        const ruleCount = results.filter((r) => r.source === "rule").length;
        const uncategorized = results.filter((r) => r.category === "Other").length;
        if (ruleCount > 0) toast.success(`${ruleCount} matched by rules`);
        if (uncategorized > 0) toast.info(`${uncategorized} uncategorized — use AI to auto-categorize`);
      } catch {
        toast.error("Rule matching failed");
      } finally {
        setCategorizing(false);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const toggleInclude = (id: string) => {
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, include: !t.include } : t)));
  };

  const deleteTransaction = (id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const updateCategory = (id: string, category: ExpenseCategory) => {
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, category, catSource: "rule", userEdited: true } : t)));
  };

  // Generate rule suggestions from user edits and AI categorizations
  const ruleSuggestions = useMemo<RuleSuggestion[]>(() => {
    const map = new Map<string, { category: string; type: "expense" | "income"; count: number }>();
    for (const t of transactions) {
      if (!t.include) continue;
      if (t.category === "Other") continue;
      // Only suggest from user edits or AI results (not existing rules)
      if (!t.userEdited && t.catSource !== "ai") continue;

      // Extract a keyword from the description (first meaningful word, 3+ chars)
      const keyword = extractKeyword(t.description);
      if (!keyword) continue;

      const key = `${keyword}|${t.category}|${t.type}`;
      const existing = map.get(key);
      if (existing) {
        existing.count++;
      } else {
        map.set(key, { category: t.category, type: t.type, count: 1 });
      }
    }

    return Array.from(map.entries())
      .map(([key, val]) => {
        const keyword = key.split("|")[0];
        return { keyword, ...val, saved: false };
      })
      .sort((a, b) => b.count - a.count);
  }, [transactions]);

  const [savedRules, setSavedRules] = useState<Set<string>>(new Set());
  const [dismissedRules, setDismissedRules] = useState<Set<string>>(new Set());

  const visibleSuggestions = ruleSuggestions.filter(
    (s) => !savedRules.has(`${s.keyword}|${s.category}`) && !dismissedRules.has(`${s.keyword}|${s.category}`)
  );

  const saveRule = async (suggestion: RuleSuggestion) => {
    const { error } = await supabase.from("categorization_rules").insert({
      vendor_pattern: suggestion.keyword,
      category: suggestion.category,
      type: suggestion.type,
      priority: 10,
    });
    if (error) {
      toast.error("Failed to save rule");
    } else {
      setSavedRules((prev) => new Set(prev).add(`${suggestion.keyword}|${suggestion.category}`));
      toast.success(`Rule saved: "${suggestion.keyword}" → ${suggestion.category}`);
    }
  };

  const dismissRule = (suggestion: RuleSuggestion) => {
    setDismissedRules((prev) => new Set(prev).add(`${suggestion.keyword}|${suggestion.category}`));
  };

  const saveAllRules = async () => {
    const toSave = visibleSuggestions;
    const inserts = toSave.map((s) => ({
      vendor_pattern: s.keyword,
      category: s.category,
      type: s.type,
      priority: 10,
    }));
    const { error } = await supabase.from("categorization_rules").insert(inserts);
    if (error) {
      toast.error("Failed to save rules");
    } else {
      const keys = new Set(savedRules);
      toSave.forEach((s) => keys.add(`${s.keyword}|${s.category}`));
      setSavedRules(keys);
      toast.success(`Saved ${toSave.length} rules`);
    }
  };

  const uncategorizedItems = transactions.filter((t) => t.include && t.category === "Other" && !t.catSource);

  const handleAICategorize = async () => {
    const targets = uncategorizedItems;
    if (targets.length === 0) return;

    setCategorizing(true);
    try {
      const results = await categorizeTransactions(
        targets.map((t) => ({ id: t.id, description: t.description, type: t.type })),
        true // useAI = true
      );
      setTransactions((prev) =>
        prev.map((t) => {
          const match = results.find((r) => r.id === t.id);
          if (match && match.category !== "Other") {
            return { ...t, category: match.category as ExpenseCategory, catSource: match.source };
          }
          return t;
        })
      );
      const aiCount = results.filter((r) => r.source === "ai" && r.category !== "Other").length;
      toast.success(`AI categorized ${aiCount} transactions`);
    } catch {
      toast.error("AI categorization failed");
    } finally {
      setCategorizing(false);
    }
  };

  const handleImport = () => {
    const included = transactions.filter((t) => t.include);
    let expenseCount = 0;
    let saleCount = 0;

    included.forEach((t) => {
      if (t.type === "expense") {
        addExpense({
          id: generateId(),
          date: t.date,
          vendor: t.description,
          description: t.originalDescription,
          amount: t.amount,
          category: t.category,
        });
        expenseCount++;
      } else {
        addSale({
          id: generateId(),
          date: t.date,
          client: t.description,
          description: t.originalDescription,
          amount: t.amount,
          invoiceNumber: `IMP-${Date.now().toString().slice(-4)}`,
        });
        saleCount++;
      }
    });

    toast.success(`Imported ${expenseCount} expenses and ${saleCount} income transactions`);
    setTransactions([]);
    setStep("upload");
  };

  const incomeCount = transactions.filter((t) => t.include && t.type === "income").length;
  const expenseCountN = transactions.filter((t) => t.include && t.type === "expense").length;
  const totalIncome = transactions.filter((t) => t.include && t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpenseAmt = transactions.filter((t) => t.include && t.type === "expense").reduce((s, t) => s + t.amount, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Import Transactions</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload bank statements to populate your records
          </p>
        </div>

        {step === "upload" && (
          <Tabs defaultValue="csv">
            <TabsList>
              <TabsTrigger value="csv"><FileText className="h-4 w-4 mr-2" />CSV Upload</TabsTrigger>
              <TabsTrigger value="pdf"><FileUp className="h-4 w-4 mr-2" />PDF Statements</TabsTrigger>
              <TabsTrigger value="bank"><Landmark className="h-4 w-4 mr-2" />Link Bank</TabsTrigger>
            </TabsList>

            <TabsContent value="csv" className="mt-6">
              <div
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                  dragOver ? "border-primary bg-accent" : "border-border"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Drop your CSV file here</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Export transactions from your bank as CSV and upload them here.
                  <br />
                  Supports most bank formats (Date, Description, Amount columns).
                </p>
                <label>
                  <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleFileInput} />
                  <Button variant="outline" asChild>
                    <span>Browse Files</span>
                  </Button>
                </label>
              </div>
            </TabsContent>

            <TabsContent value="pdf" className="mt-6">
              <div className="border-2 border-dashed rounded-lg p-12 text-center border-border">
                <FileUp className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">PDF Bank Statements</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload PDF bank statements and we'll extract the transactions automatically.
                  <br />
                  Supports up to 12 months of statements.
                </p>
                <Badge variant="secondary" className="text-xs">Coming soon — requires AI parsing</Badge>
              </div>
            </TabsContent>

            <TabsContent value="bank" className="mt-6">
              <div className="border-2 border-dashed rounded-lg p-12 text-center border-border">
                <Landmark className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Link Bank Account</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Connect your bank account via Plaid for automatic transaction syncing.
                  <br />
                  Securely links to 12,000+ financial institutions.
                </p>
                <Badge variant="secondary" className="text-xs">Coming soon — requires Plaid integration</Badge>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {step === "review" && (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-card border rounded-lg p-4">
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Income:</span>{" "}
                  <span className="font-mono text-chart-positive">{incomeCount} ({formatCurrency(totalIncome)})</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Expenses:</span>{" "}
                  <span className="font-mono text-chart-negative">{expenseCountN} ({formatCurrency(totalExpenseAmt)})</span>
                </div>
                {uncategorizedItems.length > 0 && (
                  <div>
                    <span className="text-chart-warning font-medium">{uncategorizedItems.length} uncategorized</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2 items-center">
                {categorizing && (
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Categorizing…
                  </span>
                )}
                {uncategorizedItems.length > 0 && !categorizing && (
                  <Button variant="outline" onClick={handleAICategorize}>
                    <Sparkles className="h-4 w-4 mr-2 text-primary" />
                    AI Categorize ({uncategorizedItems.length})
                  </Button>
                )}
                <Button variant="outline" onClick={() => { setStep("upload"); setTransactions([]); }}>
                  Cancel
                </Button>
                <Button onClick={handleImport} disabled={categorizing}>
                  <ArrowRight className="h-4 w-4 mr-2" />Import {transactions.filter((t) => t.include).length} Transactions
                </Button>
              </div>
            </div>

            {/* Transaction review table */}
            <div className="stat-card overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-10"></th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("date")}>
                      <span className="inline-flex items-center">Date<SortIcon field="date" /></span>
                    </th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("description")}>
                      <span className="inline-flex items-center">Description<SortIcon field="description" /></span>
                    </th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("type")}>
                      <span className="inline-flex items-center">Type<SortIcon field="type" /></span>
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
                  {[...transactions]
                    .sort((a, b) => {
                      let cmp = 0;
                      switch (sortField) {
                        case "date": cmp = a.date.localeCompare(b.date); break;
                        case "description": cmp = a.description.localeCompare(b.description); break;
                        case "type": cmp = a.type.localeCompare(b.type); break;
                        case "category": cmp = a.category.localeCompare(b.category); break;
                        case "amount": cmp = a.amount - b.amount; break;
                      }
                      return sortDir === "asc" ? cmp : -cmp;
                    })
                    .map((t) => (
                    <tr key={t.id} className={!t.include ? "opacity-40" : ""}>
                      <td>
                        <button onClick={() => toggleInclude(t.id)} className="p-1">
                          {t.include ? (
                            <Check className="h-4 w-4 text-chart-positive" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </td>
                      <td className="font-mono text-xs text-muted-foreground">{t.date}</td>
                      <td className="max-w-[250px] truncate">{t.description}</td>
                      <td>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          t.type === "income" ? "bg-accent text-accent-foreground" : "bg-destructive/10 text-destructive"
                        }`}>
                          {t.type === "income" ? "Income" : "Expense"}
                        </span>
                      </td>
                      <td>
                        {t.type === "expense" ? (
                          <Select value={t.category} onValueChange={(v) => updateCategory(t.id, v as ExpenseCategory)}>
                            <SelectTrigger className="h-8 text-xs w-[160px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {EXPENSE_CATEGORIES.map((c) => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className={`text-right font-mono ${t.type === "income" ? "text-chart-positive" : "text-chart-negative"}`}>
                        {t.type === "income" ? "+" : "-"}{formatCurrency(t.amount)}
                      </td>
                      <td>
                        <button onClick={() => deleteTransaction(t.id)} className="p-1 hover:text-destructive text-muted-foreground transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Rule suggestions */}
            {visibleSuggestions.length > 0 && (
              <div className="stat-card space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="section-title flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-chart-warning" />
                    Suggested Rules ({visibleSuggestions.length})
                  </h3>
                  <Button variant="outline" size="sm" onClick={saveAllRules}>
                    <Plus className="h-3 w-3 mr-1" /> Save All
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Based on your edits and AI results. Save these to auto-categorize future imports.
                </p>
                <div className="flex flex-wrap gap-2">
                  {visibleSuggestions.map((s) => (
                    <div
                      key={`${s.keyword}|${s.category}`}
                      className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-xs">{s.keyword}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <Badge variant="secondary" className="text-xs">{s.category}</Badge>
                      {s.count > 1 && (
                        <span className="text-xs text-muted-foreground">×{s.count}</span>
                      )}
                      <button
                        onClick={() => saveRule(s)}
                        className="p-0.5 text-primary hover:text-primary/80 transition-colors"
                        title="Save rule"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => dismissRule(s)}
                        className="p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                        title="Dismiss"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
