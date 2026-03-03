import { useState, useCallback, useMemo, useRef, memo, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAddExpense, useAddSale } from "@/hooks/useData";
import { useAuth } from "@/hooks/useAuth";
import { parseCSV, parseExcel, ParsedTransaction } from "@/lib/csvParser";
import { categorizeTransactions, invalidateRulesCache } from "@/lib/categorize";
import { formatCurrency, generateId } from "@/lib/format";
import { EXPENSE_CATEGORIES, ExpenseCategory } from "@/types/tax";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, Landmark, Check, X, FileUp, ArrowRight, Loader2, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Lightbulb, Plus, XCircle, ShieldAlert, AlertTriangle, Info, Ban, Tag, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

interface AuditIssue {
  type: "duplicate" | "deductibility" | "miscategorized" | "1099_compliance" | "missing_deduction" | "irs_red_flag" | "documentation" | "estimated_tax" | "anomaly" | "personal_expense" | "date_issue";
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  affected_ids: string[];
  suggestion: "delete" | "review" | "recategorize" | "flag" | "keep" | "add_deduction" | "document" | "file_1099";
  suggestion_detail: string;
  tax_impact?: string;
  irs_reference?: string;
}

type SortField = "date" | "description" | "type" | "category" | "amount";
type SortDir = "asc" | "desc";

interface ReviewTransaction extends ParsedTransaction {
  id: string;
  category: ExpenseCategory;
  include: boolean;
  catSource?: "rule" | "keyword";
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
  const stopWords = new Set(["the", "and", "for", "from", "payment", "purchase", "pos", "ach", "debit", "credit", "to", "inc", "llc", "ltd", "corp"]);
  for (const word of words) {
    if (word.length >= 3 && !stopWords.has(word)) return word;
  }
  return null;
}

const TransactionRow = memo(function TransactionRow({
  t,
  onToggle,
  onDelete,
  onUpdateCategory,
  highlighted,
  rowRef,
}: {
  t: ReviewTransaction;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateCategory: (id: string, category: ExpenseCategory) => void;
  highlighted?: boolean;
  rowRef?: React.RefObject<HTMLTableRowElement>;
}) {
  return (
    <tr
      ref={rowRef}
      className={`transition-colors duration-500 ${!t.include ? "opacity-40" : ""} ${highlighted ? "!bg-primary/10 ring-1 ring-primary/30" : ""}`}
    >
      <td>
        <button onClick={() => onToggle(t.id)} className="p-1">
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
          <Select value={t.category} onValueChange={(v) => onUpdateCategory(t.id, v as ExpenseCategory)}>
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
        <button onClick={() => onDelete(t.id)} className="p-1 hover:text-destructive text-muted-foreground transition-colors">
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
});

export default function ImportPage() {
  const addExpenseMutation = useAddExpense();
  const addSaleMutation = useAddSale();
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<ReviewTransaction[]>([]);
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [pdfDragOver, setPdfDragOver] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [auditIssues, setAuditIssues] = useState<AuditIssue[]>([]);
  const [auditSummary, setAuditSummary] = useState<string>("");
  const [auditRiskLevel, setAuditRiskLevel] = useState<string>("");
  const [auditEstimatedTax, setAuditEstimatedTax] = useState<string>("");
  const [auditing, setAuditing] = useState(false);
  const [dismissedIssues, setDismissedIssues] = useState<Set<number>>(new Set());
  const [pdfProcessing, setPdfProcessing] = useState(false);
  const [pdfStatus, setPdfStatus] = useState("");
  const [pdfProgress, setPdfProgress] = useState(0);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);
  const [inlineRuleIssueIdx, setInlineRuleIssueIdx] = useState<number | null>(null);
  const [inlineRuleKeyword, setInlineRuleKeyword] = useState("");
  const [inlineRuleCategory, setInlineRuleCategory] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const PAGE_SIZE = 50;

  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date": cmp = a.date.localeCompare(b.date); break;
        case "description": cmp = a.description.localeCompare(b.description); break;
        case "type": cmp = a.type.localeCompare(b.type); break;
        case "category": cmp = a.category.localeCompare(b.category); break;
        case "amount": cmp = a.amount - b.amount; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [transactions, sortField, sortDir]);

  // Navigate to a transaction: find its page, set highlight, scroll to it
  const navigateToTransaction = useCallback((id: string) => {
    const idx = sortedTransactions.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const targetPage = Math.floor(idx / PAGE_SIZE);
    setCurrentPage(targetPage);
    setHighlightedId(id);
    setTimeout(() => setHighlightedId(null), 3000);
  }, [sortedTransactions]);

  // Scroll to highlighted row when it changes
  useEffect(() => {
    if (highlightedId && highlightedRowRef.current) {
      setTimeout(() => {
        highlightedRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [highlightedId, currentPage]);

  // Save an inline rule from audit banner
  const saveInlineRule = async (issueIdx: number) => {
    if (!inlineRuleKeyword || !inlineRuleCategory) {
      toast.error("Enter a keyword and category");
      return;
    }
    const { error } = await supabase.from("categorization_rules").insert({
      vendor_pattern: inlineRuleKeyword,
      category: inlineRuleCategory,
      type: "expense",
      priority: 10,
      user_id: user?.id,
    });
    if (error) {
      toast.error("Failed to save rule");
    } else {
      invalidateRulesCache();
      toast.success(`Rule saved: "${inlineRuleKeyword}" → ${inlineRuleCategory}`);
      // Also apply the rule to matching transactions right now
      setTransactions((prev) =>
        prev.map((t) => {
          if (t.description.toLowerCase().includes(inlineRuleKeyword.toLowerCase())) {
            return { ...t, category: inlineRuleCategory as ExpenseCategory, catSource: "rule" };
          }
          return t;
        })
      );
      setInlineRuleIssueIdx(null);
      setInlineRuleKeyword("");
      setInlineRuleCategory("");
    }
  };

  const handlePdfUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please select a PDF file");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File too large — max 20MB");
      return;
    }

    setPdfProcessing(true);
    setPdfStatus("Loading PDF…");
    setPdfProgress(0);

    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = Math.min(pdf.numPages, 50);

      setPdfStatus(`Extracting text from ${totalPages} pages…`);
      const pageTexts: string[] = [];
      for (let p = 1; p <= totalPages; p++) {
        setPdfProgress(Math.round((p / totalPages) * 30));
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const lines: string[] = [];
        let lastY: number | null = null;
        for (const item of content.items) {
          if ("str" in item && item.str) {
            const y = Math.round((item as any).transform?.[5] ?? 0);
            if (lastY !== null && Math.abs(y - lastY) > 5) {
              lines.push("\n");
            }
            lines.push(item.str + " ");
            lastY = y;
          }
        }
        pageTexts.push(lines.join(""));
      }

      const fullText = pageTexts.join("\n\n--- PAGE BREAK ---\n\n");
      setPdfStatus("Extracting transactions…");
      setPdfProgress(40);

      const CHUNK_SIZE = 50000;
      const textChunks: string[] = [];
      if (fullText.length <= CHUNK_SIZE) {
        textChunks.push(fullText);
      } else {
        let current = "";
        for (const pageText of pageTexts) {
          if (current.length + pageText.length > CHUNK_SIZE && current.length > 0) {
            textChunks.push(current);
            current = "";
          }
          current += pageText + "\n\n--- PAGE BREAK ---\n\n";
        }
        if (current.trim()) textChunks.push(current);
      }

      const allTransactions: any[] = [];
      const chunkErrors: string[] = [];
      for (let i = 0; i < textChunks.length; i++) {
        if (textChunks.length > 1) {
          setPdfStatus(`Extracting chunk ${i + 1}/${textChunks.length}…`);
        }
        setPdfProgress(40 + Math.round(((i + 1) / textChunks.length) * 50));

        const { data, error } = await supabase.functions.invoke("parse-pdf", {
          body: { text: textChunks[i] },
        });

        if (error) {
          const msg = (error as { message?: string }).message || "Chunk extraction failed";
          chunkErrors.push(`Chunk ${i + 1}: ${msg}`);
          continue;
        }

        if (data?.transactions?.length) {
          allTransactions.push(...data.transactions);
        }
      }

      if (allTransactions.length === 0) {
        if (chunkErrors.length === textChunks.length) {
          toast.error(chunkErrors[0] || "PDF extraction failed");
        } else {
          toast.error("No transactions found in the PDF");
        }
        return;
      }

      setPdfProgress(90);
      setPdfStatus("Processing results…");

      const reviewed: ReviewTransaction[] = allTransactions.map((t: any) => ({
        date: t.date || "",
        description: t.description || "",
        originalDescription: t.description || "",
        amount: Math.abs(t.amount || 0),
        type: t.type === "income" ? "income" : "expense",
        id: generateId(),
        category: "Other" as ExpenseCategory,
        include: true,
      }));

      setTransactions(reviewed);
      setStep("review");
      toast.success(`Extracted ${reviewed.length} transactions from ${totalPages} pages`);

      setCategorizing(true);
      try {
        const results = await categorizeTransactions(
          reviewed.map((t) => ({ id: t.id, description: t.description, type: t.type })),
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
        if (ruleCount > 0) toast.success(`${ruleCount} matched by rules`);
      } catch {
        // Non-critical
      } finally {
        setCategorizing(false);
      }
    } catch (err) {
      console.error("PDF parsing error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to parse PDF");
    } finally {
      setPdfProcessing(false);
      setPdfStatus("");
      setPdfProgress(0);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  }, []);

  const processFile = useCallback((file: File) => {
    const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
    const isCsv = file.name.endsWith(".csv") || file.name.endsWith(".tsv") || file.name.endsWith(".txt");
    if (!isCsv && !isExcel) {
      toast.error("Please upload a CSV or Excel file");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      let parsed: ParsedTransaction[];
      if (isExcel) {
        parsed = parseExcel(e.target?.result as ArrayBuffer);
      } else {
        parsed = parseCSV(e.target?.result as string);
      }
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

      setCategorizing(true);
      try {
        const results = await categorizeTransactions(
          reviewed.map((t) => ({ id: t.id, description: t.description, type: t.type })),
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
        if (uncategorized > 0) toast.info(`${uncategorized} uncategorized — edit manually or add rules`);
      } catch {
        toast.error("Rule matching failed");
      } finally {
        setCategorizing(false);
      }
    };
    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
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

  // currentPage and PAGE_SIZE moved above navigateToTransaction

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setCurrentPage(0);
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

  const ruleSuggestions = useMemo<RuleSuggestion[]>(() => {
    const map = new Map<string, { category: string; type: "expense" | "income"; count: number }>();
    for (const t of transactions) {
      if (!t.include) continue;
      if (t.category === "Other") continue;
      if (!t.userEdited) continue;
      const keyword = extractKeyword(t.description);
      if (!keyword) continue;
      const key = `${keyword}|${t.category}|${t.type}`;
      const existing = map.get(key);
      if (existing) { existing.count++; } else { map.set(key, { category: t.category, type: t.type, count: 1 }); }
    }
    return Array.from(map.entries())
      .map(([key, val]) => ({ keyword: key.split("|")[0], ...val, saved: false }))
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
      user_id: user?.id,
    });
    if (error) {
      toast.error("Failed to save rule");
    } else {
      invalidateRulesCache();
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
      user_id: user?.id,
    }));
    const { error } = await supabase.from("categorization_rules").insert(inserts);
    if (error) {
      toast.error("Failed to save rules");
    } else {
      invalidateRulesCache();
      const keys = new Set(savedRules);
      toSave.forEach((s) => keys.add(`${s.keyword}|${s.category}`));
      setSavedRules(keys);
      toast.success(`Saved ${toSave.length} rules`);
    }
  };

  /** Rule-based audit — no AI needed */
  const handleAudit = () => {
    if (transactions.length === 0) return;
    setAuditIssues([]);
    setAuditSummary("");
    setAuditRiskLevel("");
    setAuditEstimatedTax("");
    setDismissedIssues(new Set());

    const issues: AuditIssue[] = [];

    // 1. Duplicate detection
    const seen = new Map<string, ReviewTransaction[]>();
    for (const t of transactions) {
      if (!t.include) continue;
      const key = `${t.date}|${t.amount.toFixed(2)}`;
      const group = seen.get(key) || [];
      group.push(t);
      seen.set(key, group);
    }
    for (const [, group] of seen) {
      if (group.length >= 2) {
        issues.push({
          type: "duplicate", severity: "medium",
          title: `Possible duplicate: ${group[0].description.slice(0, 40)}`,
          description: `${group.length} transactions on ${group[0].date} for $${group[0].amount.toFixed(2)} each.`,
          affected_ids: group.map((t) => t.id),
          suggestion: "review",
          suggestion_detail: "Review these — they may be duplicates from overlapping statement periods.",
        });
      }
    }

    // 2. Uncategorized expenses
    const uncategorized = transactions.filter((t) => t.include && t.category === "Other" && t.type === "expense");
    if (uncategorized.length > 5) {
      issues.push({
        type: "miscategorized", severity: "medium",
        title: `${uncategorized.length} expenses uncategorized`,
        description: "Uncategorized expenses may lead to missed deductions at tax time.",
        affected_ids: uncategorized.slice(0, 5).map((t) => t.id),
        suggestion: "review",
        suggestion_detail: "Edit categories manually or create a rule to auto-categorize.",
      });
    }

    // 3. Large outliers
    const amounts = transactions.filter((t) => t.include).map((t) => t.amount);
    const avg = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
    const threshold = Math.max(avg * 5, 5000);
    for (const t of transactions.filter((t) => t.include && t.amount > threshold)) {
      issues.push({
        type: "anomaly", severity: "low",
        title: `Large transaction: $${t.amount.toFixed(2)}`,
        description: `"${t.description.slice(0, 50)}" is significantly above average ($${avg.toFixed(0)}).`,
        affected_ids: [t.id],
        suggestion: "review",
        suggestion_detail: "Verify this amount is correct and properly categorized.",
      });
    }

    // 4. Personal expenses
    const personalRx = /\b(netflix|hulu|disney\+|spotify|apple music|gym|fitness|personal|grocery|groceries|whole foods|trader joe)\b/i;
    const personal = transactions.filter((t) => t.include && t.type === "expense" && personalRx.test(t.description));
    if (personal.length > 0) {
      issues.push({
        type: "personal_expense", severity: "high",
        title: `${personal.length} possible personal expense(s)`,
        description: "These look like personal rather than business expenses — an IRS red flag.",
        affected_ids: personal.map((t) => t.id),
        suggestion: "review",
        suggestion_detail: "Exclude personal expenses from business deductions, or create a rule to auto-exclude.",
        irs_reference: "IRC §262",
      });
    }

    // 5. Round-number expenses
    const roundExpenses = transactions.filter((t) => t.include && t.type === "expense" && t.amount >= 500 && t.amount % 100 === 0);
    if (roundExpenses.length > 3) {
      issues.push({
        type: "documentation", severity: "low",
        title: `${roundExpenses.length} round-number expenses`,
        description: "Multiple round-number expenses may look like estimates to the IRS.",
        affected_ids: roundExpenses.slice(0, 5).map((t) => t.id),
        suggestion: "review",
        suggestion_detail: "Ensure you have receipts for these amounts.",
      });
    }

    // 6. 1099 threshold
    const totalByVendor = new Map<string, number>();
    for (const t of transactions) {
      if (!t.include || t.type !== "expense") continue;
      const vendor = t.description.toLowerCase().slice(0, 30);
      totalByVendor.set(vendor, (totalByVendor.get(vendor) || 0) + t.amount);
    }
    const over600 = Array.from(totalByVendor.entries()).filter(([, amt]) => amt >= 600);
    if (over600.length > 0) {
      issues.push({
        type: "1099_compliance", severity: "medium",
        title: `${over600.length} vendor(s) over $600 — may need 1099`,
        description: "Payments over $600 to a single vendor may require a 1099-NEC.",
        affected_ids: [],
        suggestion: "review",
        suggestion_detail: "Check if these vendors are contractors and collect W-9s.",
        irs_reference: "IRC §6041",
      });
    }

    const totalExpenses = transactions.filter((t) => t.include && t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const totalIncomeAmt = transactions.filter((t) => t.include && t.type === "income").reduce((s, t) => s + t.amount, 0);
    const net = totalIncomeAmt - totalExpenses;
    const estTax = net > 0 ? net * 0.3 : 0;

    setAuditIssues(issues);
    setAuditSummary(issues.length === 0 ? "No issues detected — your data looks clean!" : `Found ${issues.length} issue(s) to review.`);
    setAuditRiskLevel(issues.some((i) => i.severity === "high") ? "high" : issues.some((i) => i.severity === "medium") ? "medium" : "low");
    setAuditEstimatedTax(estTax > 0 ? `~$${Math.round(estTax).toLocaleString()}` : "");

    if (issues.length === 0) toast.success("No issues detected — your data looks clean!");
    else toast.info(`Found ${issues.length} issue(s)`);
  };

  const applyIssueSuggestion = (issue: AuditIssue, issueIdx: number) => {
    if (issue.suggestion === "delete") {
      setTransactions((prev) => prev.filter((t) => !issue.affected_ids.includes(t.id)));
      toast.success(`Deleted ${issue.affected_ids.length} flagged transaction(s)`);
    } else if (issue.suggestion === "review" || issue.suggestion === "flag") {
      setTransactions((prev) =>
        prev.map((t) => issue.affected_ids.includes(t.id) ? { ...t, include: false } : t)
      );
      toast.success(`Excluded ${issue.affected_ids.length} transaction(s) from import`);
    }
    setDismissedIssues((prev) => new Set(prev).add(issueIdx));
  };

  const dismissIssue = (issueIdx: number) => {
    setDismissedIssues((prev) => new Set(prev).add(issueIdx));
  };

  const uncategorizedCount = useMemo(() => transactions.filter((t) => t.include && t.category === "Other").length, [transactions]);

  const handleImport = async () => {
    const included = transactions.filter((t) => t.include);
    if (included.length === 0) { toast.error("No transactions to import"); return; }

    setImporting(true);
    setImportProgress(0);
    setImportStatus(`Importing 0 of ${included.length} transactions…`);

    let expenseCount = 0;
    let saleCount = 0;
    let errorCount = 0;

    for (let i = 0; i < included.length; i++) {
      const t = included[i];
      setImportProgress(Math.round(((i + 1) / included.length) * 100));
      setImportStatus(`Importing ${i + 1} of ${included.length} transactions…`);

      try {
        if (t.type === "expense") {
          await addExpenseMutation.mutateAsync({
            date: t.date,
            vendor: t.description,
            description: t.originalDescription,
            amount: t.amount,
            category: t.category,
          });
          expenseCount++;
        } else {
          await addSaleMutation.mutateAsync({
            date: t.date,
            client: t.description,
            description: t.originalDescription,
            amount: t.amount,
            invoiceNumber: `IMP-${Date.now().toString().slice(-4)}`,
          });
          saleCount++;
        }
      } catch {
        errorCount++;
      }
    }

    setImporting(false);
    setImportProgress(0);
    setImportStatus("");

    if (errorCount > 0) {
      toast.warning(`Imported ${expenseCount + saleCount} transactions, ${errorCount} failed`);
    } else {
      toast.success(`Imported ${expenseCount} expenses and ${saleCount} income transactions`);
    }
    setTransactions([]);
    setStep("upload");
  };

  const { incomeCount, expenseCountN, totalIncome, totalExpenseAmt } = useMemo(() => {
    let ic = 0, ec = 0, ti = 0, te = 0;
    for (const t of transactions) {
      if (!t.include) continue;
      if (t.type === "income") { ic++; ti += t.amount; }
      else { ec++; te += t.amount; }
    }
    return { incomeCount: ic, expenseCountN: ec, totalIncome: ti, totalExpenseAmt: te };
  }, [transactions]);

  // sortedTransactions moved above navigateToTransaction

  const totalPages = Math.ceil(sortedTransactions.length / PAGE_SIZE);
  const pagedTransactions = useMemo(
    () => sortedTransactions.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [sortedTransactions, currentPage]
  );

  // Get affected transactions for an issue (for display)
  const getAffectedTransactions = (ids: string[]) => {
    return transactions.filter((t) => ids.includes(t.id));
  };

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
                <h3 className="text-lg font-semibold mb-2">Drop your CSV or Excel file here</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Export transactions from your bank as CSV or Excel and upload them here.
                  <br />
                  Supports CSV, TSV, XLSX, and XLS formats.
                </p>
                <label>
                  <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" className="hidden" onChange={handleFileInput} />
                  <Button variant="outline" asChild>
                    <span>Browse Files</span>
                  </Button>
                </label>
              </div>
            </TabsContent>

            <TabsContent value="pdf" className="mt-6">
              <div
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                  pdfProcessing ? "border-primary bg-accent/50" : pdfDragOver ? "border-primary bg-accent" : "border-border"
                }`}
                onDragOver={(e) => { e.preventDefault(); setPdfDragOver(true); }}
                onDragLeave={() => setPdfDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setPdfDragOver(false);
                  const file = e.dataTransfer.files[0];
                  if (file?.name.toLowerCase().endsWith(".pdf")) {
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    if (pdfInputRef.current) {
                      pdfInputRef.current.files = dt.files;
                      pdfInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
                    }
                  } else if (file) {
                    toast.error("Please drop a PDF file");
                  }
                }}
              >
                <FileUp className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Drop your PDF here or browse</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload PDF bank statements and transactions will be extracted automatically.
                  <br />
                  Supports any bank format — up to 50 pages per file.
                </p>
                {pdfProcessing ? (
                  <div className="flex flex-col items-center gap-3 max-w-xs mx-auto">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">{pdfStatus}</p>
                    {pdfProgress > 0 && (
                      <Progress value={pdfProgress} className="h-2 w-full" />
                    )}
                  </div>
                ) : (
                  <label>
                    <input
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      ref={pdfInputRef}
                      onChange={handlePdfUpload}
                    />
                    <Button variant="outline" asChild>
                      <span>Browse PDF Files</span>
                    </Button>
                  </label>
                )}
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
                {uncategorizedCount > 0 && (
                  <div>
                    <span className="text-chart-warning font-medium">{uncategorizedCount} uncategorized</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2 items-center flex-wrap">
                {categorizing && (
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Categorizing…
                  </span>
                )}
                <Button variant="outline" onClick={handleAudit} disabled={categorizing}>
                  <ShieldAlert className="h-4 w-4 mr-2" />
                  Quick Audit
                </Button>
                <Button variant="outline" onClick={() => { setStep("upload"); setTransactions([]); }}>
                  Cancel
                </Button>
                <Button onClick={handleImport} disabled={categorizing || auditing || importing}>
                  {importing ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing…</>
                  ) : (
                    <><ArrowRight className="h-4 w-4 mr-2" />Import {transactions.filter((t) => t.include).length} Transactions</>
                  )}
                </Button>
              </div>

              {/* Import progress bar */}
              {importing && (
                <div className="space-y-2 mt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {importStatus}
                    </span>
                    <span className="font-mono text-xs">{importProgress}%</span>
                  </div>
                  <Progress value={importProgress} className="h-2" />
                </div>
              )}
            </div>

            {/* Audit issues */}
            {auditIssues.length > 0 && (
              <div className="stat-card space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="section-title flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-destructive" />
                    CPA Audit Results ({auditIssues.filter((_, i) => !dismissedIssues.has(i)).length} issues)
                  </h3>
                  <div className="flex items-center gap-2">
                    {auditRiskLevel && (
                      <Badge variant={auditRiskLevel === "high" ? "destructive" : auditRiskLevel === "medium" ? "secondary" : "outline"}>
                        Risk: {auditRiskLevel}
                      </Badge>
                    )}
                    {auditEstimatedTax && (
                      <Badge variant="outline" className="text-xs">
                        Est. quarterly tax: {auditEstimatedTax}
                      </Badge>
                    )}
                  </div>
                </div>
                {auditSummary && (
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">{auditSummary}</p>
                )}
                <div className="space-y-2">
                  {auditIssues.map((issue, idx) => {
                    if (dismissedIssues.has(idx)) return null;
                    const SeverityIcon = issue.severity === "high" ? Ban
                      : issue.severity === "medium" ? AlertTriangle : Info;
                    const severityColor = issue.severity === "high" ? "text-destructive"
                      : issue.severity === "medium" ? "text-chart-warning" : "text-chart-info";
                    const affected = getAffectedTransactions(issue.affected_ids);
                    return (
                      <div key={idx} className="bg-muted rounded-lg p-3 space-y-2">
                        <div className="flex items-start gap-3">
                          <SeverityIcon className={`h-4 w-4 mt-0.5 shrink-0 ${severityColor}`} />
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{issue.title}</span>
                              <Badge variant="outline" className="text-[10px]">{issue.type.replace(/_/g, " ")}</Badge>
                              <Badge
                                variant={issue.severity === "high" ? "destructive" : "secondary"}
                                className="text-[10px]"
                              >
                                {issue.severity}
                              </Badge>
                              {issue.irs_reference && (
                                <Badge variant="outline" className="text-[10px] font-mono">{issue.irs_reference}</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{issue.description}</p>
                            <p className="text-xs font-medium">💡 {issue.suggestion_detail}</p>
                            {issue.tax_impact && (
                              <p className="text-xs text-chart-warning font-medium">💰 Tax impact: {issue.tax_impact}</p>
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => {
                                setInlineRuleIssueIdx(inlineRuleIssueIdx === idx ? null : idx);
                                // Pre-fill keyword from first affected transaction
                                if (affected.length > 0) {
                                  const kw = extractKeyword(affected[0].description);
                                  setInlineRuleKeyword(kw || "");
                                }
                                setInlineRuleCategory("");
                              }}
                            >
                              <Tag className="h-3 w-3 mr-1" /> Create Rule
                            </Button>
                            {(issue.suggestion === "delete" || issue.suggestion === "review" || issue.suggestion === "flag") && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7"
                                onClick={() => applyIssueSuggestion(issue, idx)}
                              >
                                {issue.suggestion === "delete" ? (
                                  <><Trash2 className="h-3 w-3 mr-1" /> Delete</>
                                ) : (
                                  <><X className="h-3 w-3 mr-1" /> Exclude</>
                                )}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => dismissIssue(idx)}
                            >
                              Dismiss
                            </Button>
                          </div>
                        </div>

                        {/* Affected transactions — clickable */}
                        {affected.length > 0 && (
                          <div className="ml-7 space-y-1">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Affected transactions</p>
                            <div className="flex flex-col gap-0.5">
                              {affected.slice(0, 8).map((t) => (
                                <button
                                  key={t.id}
                                  onClick={() => navigateToTransaction(t.id)}
                                  className="flex items-center gap-2 text-xs text-left hover:bg-background/60 rounded px-2 py-1 transition-colors group w-full"
                                >
                                  <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-primary shrink-0" />
                                  <span className="font-mono text-muted-foreground w-20 shrink-0">{t.date}</span>
                                  <span className="truncate flex-1">{t.description}</span>
                                  <span className={`font-mono shrink-0 ${t.type === "income" ? "text-chart-positive" : "text-chart-negative"}`}>
                                    {formatCurrency(t.amount)}
                                  </span>
                                </button>
                              ))}
                              {affected.length > 8 && (
                                <span className="text-[10px] text-muted-foreground ml-7">…and {affected.length - 8} more</span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Inline rule creation */}
                        {inlineRuleIssueIdx === idx && (
                          <div className="ml-7 flex items-center gap-2 bg-background/60 rounded-lg p-2 border">
                            <Tag className="h-3.5 w-3.5 text-primary shrink-0" />
                            <Input
                              placeholder="Keyword (e.g. netflix)"
                              value={inlineRuleKeyword}
                              onChange={(e) => setInlineRuleKeyword(e.target.value)}
                              className="h-7 text-xs w-[140px]"
                            />
                            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                            <Select value={inlineRuleCategory} onValueChange={setInlineRuleCategory}>
                              <SelectTrigger className="h-7 text-xs w-[160px]">
                                <SelectValue placeholder="Category" />
                              </SelectTrigger>
                              <SelectContent>
                                {EXPENSE_CATEGORIES.map((c) => (
                                  <SelectItem key={c} value={c}>{c}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button size="sm" className="h-7 text-xs" onClick={() => saveInlineRule(idx)}>
                              Save Rule
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setInlineRuleIssueIdx(null)}>
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
                  {pagedTransactions.map((t) => (
                    <TransactionRow
                      key={t.id}
                      t={t}
                      onToggle={toggleInclude}
                      onDelete={deleteTransaction}
                      onUpdateCategory={updateCategory}
                      highlighted={t.id === highlightedId}
                      rowRef={t.id === highlightedId ? highlightedRowRef : undefined}
                    />
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t">
                  <span className="text-xs text-muted-foreground">
                    Showing {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, sortedTransactions.length)} of {sortedTransactions.length}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={currentPage === 0} onClick={() => setCurrentPage(0)}>First</Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={currentPage === 0} onClick={() => setCurrentPage((p) => p - 1)}>Prev</Button>
                    <span className="flex items-center px-2 text-xs text-muted-foreground">Page {currentPage + 1} of {totalPages}</span>
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage((p) => p + 1)}>Next</Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(totalPages - 1)}>Last</Button>
                  </div>
                </div>
              )}
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
                  Based on your edits. Save these to auto-categorize future imports.
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
