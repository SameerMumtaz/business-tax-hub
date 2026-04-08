import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useAddExpense, useAddSale, useExpenses, useSales } from "@/hooks/useData";
import { useAuth } from "@/hooks/useAuth";
import { parseCSV, parseExcel, ParsedTransaction } from "@/lib/csvParser";
import { categorizeTransactions, invalidateRulesCache } from "@/lib/categorize";
import { generateId } from "@/lib/format";
import { ExpenseCategory } from "@/types/tax";
import { supabase } from "@/integrations/supabase/client";
import { extractRawItems, detectDocTypeFromItems, type PageData } from "@/lib/pdfTextExtract";
import { toast } from "sonner";

export interface AuditIssue {
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

export type SortField = "date" | "description" | "type" | "category" | "amount";
export type SortDir = "asc" | "desc";

export interface ReviewTransaction extends ParsedTransaction {
  id: string;
  category: ExpenseCategory;
  include: boolean;
  catSource?: "rule" | "keyword";
  userEdited?: boolean;
  isDuplicate?: boolean;
}

export interface RuleSuggestion {
  keyword: string;
  category: string;
  type: "expense" | "income";
  count: number;
  saved?: boolean;
}

function detectDuplicates(
  transactions: ReviewTransaction[],
  existingExpenses: { date: string; amount: number }[],
  existingSales: { date: string; amount: number }[],
) {
  const existingKeys = new Set<string>();
  for (const e of existingExpenses) existingKeys.add(`${e.date}|${Math.abs(e.amount).toFixed(2)}`);
  for (const s of existingSales) existingKeys.add(`${s.date}|${Math.abs(s.amount).toFixed(2)}`);
  let dupeCount = 0;
  const withDupeFlags = transactions.map((t) => {
    const key = `${t.date}|${Math.abs(t.amount).toFixed(2)}`;
    if (existingKeys.has(key)) { dupeCount++; return { ...t, include: false, isDuplicate: true }; }
    return t;
  });
  return { dupeCount, withDupeFlags };
}

export function extractKeyword(description: string): string | null {
  const words = description.toLowerCase().replace(/[^a-z0-9\s&]/g, "").split(/\s+/);
  const stopWords = new Set(["the", "and", "for", "from", "payment", "purchase", "pos", "ach", "debit", "credit", "to", "inc", "llc", "ltd", "corp"]);
  for (const word of words) { if (word.length >= 3 && !stopWords.has(word)) return word; }
  return null;
}

export default function useImportLogic() {
  const addExpenseMutation = useAddExpense();
  const addSaleMutation = useAddSale();
  const { user } = useAuth();
  const { data: existingExpenses = [] } = useExpenses();
  const { data: existingSales = [] } = useSales();
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
  const [auditSummary, setAuditSummary] = useState("");
  const [auditRiskLevel, setAuditRiskLevel] = useState("");
  const [auditEstimatedTax, setAuditEstimatedTax] = useState("");
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
  const [savedRules, setSavedRules] = useState<Set<string>>(new Set());
  const [dismissedRules, setDismissedRules] = useState<Set<string>>(new Set());

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

  const totalPages = Math.ceil(sortedTransactions.length / PAGE_SIZE);
  const pagedTransactions = useMemo(
    () => sortedTransactions.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [sortedTransactions, currentPage]
  );

  const navigateToTransaction = useCallback((id: string) => {
    const idx = sortedTransactions.findIndex((t) => t.id === id);
    if (idx === -1) return;
    setCurrentPage(Math.floor(idx / PAGE_SIZE));
    setHighlightedId(id);
    setTimeout(() => setHighlightedId(null), 3000);
  }, [sortedTransactions]);

  useEffect(() => {
    if (highlightedId && highlightedRowRef.current) {
      setTimeout(() => highlightedRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    }
  }, [highlightedId, currentPage]);

  const categorizeReviewed = useCallback(async (reviewed: ReviewTransaction[]) => {
    setCategorizing(true);
    try {
      const results = await categorizeTransactions(
        reviewed.map((t) => ({ id: t.id, description: t.description, originalDescription: t.originalDescription, type: t.type })),
      );
      setTransactions((prev) =>
        prev.map((t) => {
          const match = results.find((r) => r.id === t.id);
          if (match && match.category !== "Other") return { ...t, category: match.category as ExpenseCategory, catSource: match.source };
          return t;
        })
      );
      const ruleCount = results.filter((r) => r.source === "rule").length;
      const uncategorized = results.filter((r) => r.category === "Other").length;
      if (ruleCount > 0) toast.success(`${ruleCount} matched by rules`);
      if (uncategorized > 0) toast.info(`${uncategorized} uncategorized — edit manually or add rules`);
    } catch { toast.error("Rule matching failed"); }
    finally { setCategorizing(false); }
  }, []);

  const handlePdfFile = useCallback(async (file: File) => {
    if (file.size > 20 * 1024 * 1024) { toast.error("File too large — max 20MB"); return; }
    setPdfProcessing(true); setPdfStatus("Reading PDF…"); setPdfProgress(0);
    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = Math.min(pdf.numPages, 50);
      const allPages: PageData[] = [];
      for (let p = 1; p <= numPages; p++) {
        setPdfProgress(Math.round((p / numPages) * 25));
        setPdfStatus(`Reading page ${p} of ${numPages}…`);
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });
        const pageData = extractRawItems(content.items, { width: viewport.width, height: viewport.height });
        pageData.pageNum = p;
        allPages.push(pageData);
      }

      const docType = detectDocTypeFromItems(allPages);

      // Chunk by page groups (6 pages per chunk)
      const PAGES_PER_CHUNK = 6;
      const pageChunks: PageData[][] = [];
      for (let i = 0; i < allPages.length; i += PAGES_PER_CHUNK) {
        pageChunks.push(allPages.slice(i, i + PAGES_PER_CHUNK));
      }

      const allTx: any[] = []; const chunkErrors: string[] = [];
      const totalChunks = pageChunks.length;
      const concurrency = Math.min(6, totalChunks);
      let nextChunkIndex = 0;
      let completed = 0;
      const chunkTimes: number[] = [];
      const etaThreshold = totalChunks <= 7 ? Math.ceil(totalChunks / 2) : 4;

      const getEta = () => {
        if (chunkTimes.length < etaThreshold) return "estimating…";
        const window = totalChunks <= 7 ? chunkTimes.slice(-etaThreshold) : chunkTimes.slice(-4);
        const avgMs = window.reduce((a, b) => a + b, 0) / window.length;
        const remaining = totalChunks - completed;
        const rounds = Math.ceil(remaining / concurrency);
        const etaSec = Math.max(1, Math.round((avgMs * rounds) / 1000));
        return etaSec >= 60 ? `~${Math.ceil(etaSec / 60)}min remaining` : `~${etaSec}s remaining`;
      };

      const updateStatus = () => {
        setPdfStatus(`Analyzing transactions… ${completed}/${totalChunks} chunks done, ${getEta()}`);
      };
      updateStatus();
      const statusTimer = setInterval(updateStatus, 1000);

      const runWorker = async () => {
        while (nextChunkIndex < totalChunks) {
          const chunkIndex = nextChunkIndex++;
          const timeoutMs = 45000;
          const chunkStart = performance.now();

          try {
            const chunkPromise = supabase.functions.invoke("parse-pdf", {
              body: { pages: pageChunks[chunkIndex], docType },
            });
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Chunk ${chunkIndex + 1} timed out after ${timeoutMs / 1000}s`)), timeoutMs)
            );

            const { data, error } = await Promise.race([chunkPromise, timeoutPromise]) as Awaited<typeof chunkPromise>;
            if (error) chunkErrors.push(`Chunk ${chunkIndex + 1}: ${(error as any).message || "failed"}`);
            else if (data?.transactions?.length) allTx.push(...data.transactions);
          } catch (e) {
            chunkErrors.push(`Chunk ${chunkIndex + 1}: ${e instanceof Error ? e.message : "failed"}`);
          } finally {
            chunkTimes.push(performance.now() - chunkStart);
            completed++;
            setPdfProgress(30 + Math.round((completed / totalChunks) * 55));
            updateStatus();
          }
        }
      };

      await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
      clearInterval(statusTimer);
      setPdfStatus(`Analysis complete (${completed}/${totalChunks} chunks)`);
      if (allTx.length === 0) { toast.error(chunkErrors[0] || "No transactions found in PDF"); return; }

      setPdfProgress(90); setPdfStatus("Processing results…");
      const reviewed: ReviewTransaction[] = allTx.map((t: any) => ({
        date: t.date || "", description: t.description || "", originalDescription: t.description || "",
        amount: Math.abs(t.amount || 0), type: t.type === "income" ? "income" : "expense",
        id: generateId(), category: "Other" as ExpenseCategory, include: true,
      }));
      const { dupeCount, withDupeFlags } = detectDuplicates(reviewed, existingExpenses, existingSales);
      setTransactions(withDupeFlags); setStep("review");
      toast.success(`Extracted ${reviewed.length} transactions from ${numPages} pages${dupeCount > 0 ? ` (${dupeCount} duplicates excluded)` : ""}`);
      setPdfStatus("Categorizing transactions…"); setPdfProgress(95);
      await categorizeReviewed(reviewed);
    } catch (err) { console.error(err); toast.error(err instanceof Error ? err.message : "Failed to parse PDF"); }
    finally { setPdfProcessing(false); setPdfStatus(""); setPdfProgress(0); }
  }, [existingExpenses, existingSales, categorizeReviewed]);

  const processSpreadsheetFile = useCallback((file: File) => {
    const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
    const reader = new FileReader();
    reader.onload = async (e) => {
      const parsed = isExcel ? await parseExcel(e.target?.result as ArrayBuffer) : parseCSV(e.target?.result as string);
      if (parsed.length === 0) { toast.error("No transactions found."); return; }
      const reviewed: ReviewTransaction[] = parsed.map((t) => ({ ...t, id: generateId(), category: "Other" as ExpenseCategory, include: true }));
      const { dupeCount, withDupeFlags } = detectDuplicates(reviewed, existingExpenses, existingSales);
      setTransactions(withDupeFlags); setStep("review");
      if (dupeCount > 0) toast.warning(`${dupeCount} potential duplicates excluded`);
      await categorizeReviewed(reviewed);
    };
    if (isExcel) reader.readAsArrayBuffer(file); else reader.readAsText(file);
  }, [existingExpenses, existingSales, categorizeReviewed]);

  // Unified file handler — auto-detects PDF vs CSV/Excel
  const handleFileUpload = useCallback((file: File) => {
    const ext = file.name.toLowerCase().split(".").pop() || "";
    if (ext === "pdf") {
      handlePdfFile(file);
    } else if (["csv", "tsv", "txt", "xlsx", "xls"].includes(ext)) {
      processSpreadsheetFile(file);
    } else {
      toast.error("Unsupported file type. Upload a PDF, CSV, or Excel file.");
    }
  }, [handlePdfFile, processSpreadsheetFile]);

  // Legacy handlers for backward compat — now delegate to unified handler
  const handlePdfUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    if (pdfInputRef.current) pdfInputRef.current.value = "";
  }, [handleFileUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); setPdfDragOver(false); const file = e.dataTransfer.files[0]; if (file) handleFileUpload(file); }, [handleFileUpload]);
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) handleFileUpload(file); }, [handleFileUpload]);

  const toggleInclude = (id: string) => setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, include: !t.include } : t)));
  const deleteTransaction = (id: string) => setTransactions((prev) => prev.filter((t) => t.id !== id));
  const toggleSort = (field: SortField) => { if (sortField === field) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortField(field); setSortDir("asc"); } setCurrentPage(0); };
  const updateCategory = (id: string, category: ExpenseCategory) => setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, category, catSource: "rule", userEdited: true } : t)));

  const ruleSuggestions = useMemo<RuleSuggestion[]>(() => {
    const map = new Map<string, { category: string; type: "expense" | "income"; count: number }>();
    for (const t of transactions) {
      if (!t.include || t.category === "Other" || !t.userEdited) continue;
      const keyword = extractKeyword(t.description);
      if (!keyword) continue;
      const key = `${keyword}|${t.category}|${t.type}`;
      const existing = map.get(key);
      if (existing) existing.count++; else map.set(key, { category: t.category, type: t.type, count: 1 });
    }
    return Array.from(map.entries()).map(([key, val]) => ({ keyword: key.split("|")[0], ...val, saved: false })).sort((a, b) => b.count - a.count);
  }, [transactions]);

  const visibleSuggestions = ruleSuggestions.filter((s) => !savedRules.has(`${s.keyword}|${s.category}`) && !dismissedRules.has(`${s.keyword}|${s.category}`));

  const saveRule = async (suggestion: RuleSuggestion) => {
    const { error } = await supabase.from("categorization_rules").insert({ vendor_pattern: suggestion.keyword, category: suggestion.category, type: suggestion.type, priority: 10, user_id: user?.id });
    if (error) toast.error("Failed to save rule");
    else { invalidateRulesCache(); setSavedRules((prev) => new Set(prev).add(`${suggestion.keyword}|${suggestion.category}`)); toast.success(`Rule saved: "${suggestion.keyword}" → ${suggestion.category}`); }
  };

  const dismissRule = (suggestion: RuleSuggestion) => setDismissedRules((prev) => new Set(prev).add(`${suggestion.keyword}|${suggestion.category}`));

  const saveAllRules = async () => {
    const inserts = visibleSuggestions.map((s) => ({ vendor_pattern: s.keyword, category: s.category, type: s.type, priority: 10, user_id: user?.id }));
    const { error } = await supabase.from("categorization_rules").insert(inserts);
    if (error) toast.error("Failed to save rules");
    else { invalidateRulesCache(); const keys = new Set(savedRules); visibleSuggestions.forEach((s) => keys.add(`${s.keyword}|${s.category}`)); setSavedRules(keys); toast.success(`Saved ${visibleSuggestions.length} rules`); }
  };

  const saveInlineRule = async (issueIdx: number) => {
    if (!inlineRuleKeyword || !inlineRuleCategory) { toast.error("Enter a keyword and category"); return; }
    const { error } = await supabase.from("categorization_rules").insert({ vendor_pattern: inlineRuleKeyword, category: inlineRuleCategory, type: "expense", priority: 10, user_id: user?.id });
    if (error) toast.error("Failed to save rule");
    else {
      invalidateRulesCache(); toast.success(`Rule saved: "${inlineRuleKeyword}" → ${inlineRuleCategory}`);
      setTransactions((prev) => prev.map((t) => t.description.toLowerCase().includes(inlineRuleKeyword.toLowerCase()) ? { ...t, category: inlineRuleCategory as ExpenseCategory, catSource: "rule" } : t));
      setInlineRuleIssueIdx(null); setInlineRuleKeyword(""); setInlineRuleCategory("");
    }
  };

  const handleAudit = () => {
    if (transactions.length === 0) return;
    setAuditIssues([]); setAuditSummary(""); setAuditRiskLevel(""); setAuditEstimatedTax(""); setDismissedIssues(new Set());
    const issues: AuditIssue[] = [];
    const seen = new Map<string, ReviewTransaction[]>();
    for (const t of transactions) { if (!t.include) continue; const key = `${t.date}|${t.amount.toFixed(2)}`; const group = seen.get(key) || []; group.push(t); seen.set(key, group); }
    for (const [, group] of seen) { if (group.length >= 2) issues.push({ type: "duplicate", severity: "medium", title: `Possible duplicate: ${group[0].description.slice(0, 40)}`, description: `${group.length} transactions on ${group[0].date} for $${group[0].amount.toFixed(2)} each.`, affected_ids: group.map((t) => t.id), suggestion: "review", suggestion_detail: "Review these — they may be duplicates." }); }
    const uncategorized = transactions.filter((t) => t.include && t.category === "Other" && t.type === "expense");
    if (uncategorized.length > 5) issues.push({ type: "miscategorized", severity: "medium", title: `${uncategorized.length} expenses uncategorized`, description: "Uncategorized expenses may lead to missed deductions.", affected_ids: uncategorized.slice(0, 5).map((t) => t.id), suggestion: "review", suggestion_detail: "Edit categories manually or create a rule." });
    const amounts = transactions.filter((t) => t.include).map((t) => t.amount);
    const avg = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
    const threshold = Math.max(avg * 5, 5000);
    for (const t of transactions.filter((t) => t.include && t.amount > threshold)) issues.push({ type: "anomaly", severity: "low", title: `Large transaction: $${t.amount.toFixed(2)}`, description: `"${t.description.slice(0, 50)}" is above average ($${avg.toFixed(0)}).`, affected_ids: [t.id], suggestion: "review", suggestion_detail: "Verify amount and category." });
    const personalRx = /\b(netflix|hulu|disney\+|spotify|apple music|gym|fitness|personal|grocery|groceries|whole foods|trader joe)\b/i;
    const personal = transactions.filter((t) => t.include && t.type === "expense" && personalRx.test(t.description));
    if (personal.length > 0) issues.push({ type: "personal_expense", severity: "high", title: `${personal.length} possible personal expense(s)`, description: "These look like personal expenses — an IRS red flag.", affected_ids: personal.map((t) => t.id), suggestion: "review", suggestion_detail: "Exclude personal expenses from business deductions.", irs_reference: "IRC §262" });
    const roundExpenses = transactions.filter((t) => t.include && t.type === "expense" && t.amount >= 500 && t.amount % 100 === 0);
    if (roundExpenses.length > 3) issues.push({ type: "documentation", severity: "low", title: `${roundExpenses.length} round-number expenses`, description: "Multiple round-number expenses may look like estimates.", affected_ids: roundExpenses.slice(0, 5).map((t) => t.id), suggestion: "review", suggestion_detail: "Ensure you have receipts." });
    const totalByVendor = new Map<string, number>();
    for (const t of transactions) { if (!t.include || t.type !== "expense") continue; totalByVendor.set(t.description.toLowerCase().slice(0, 30), (totalByVendor.get(t.description.toLowerCase().slice(0, 30)) || 0) + t.amount); }
    const over600 = Array.from(totalByVendor.entries()).filter(([, amt]) => amt >= 600);
    if (over600.length > 0) issues.push({ type: "1099_compliance", severity: "medium", title: `${over600.length} vendor(s) over $600`, description: "May require 1099-NEC.", affected_ids: [], suggestion: "review", suggestion_detail: "Check if vendors are contractors.", irs_reference: "IRC §6041" });
    const totalExp = transactions.filter((t) => t.include && t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const totalInc = transactions.filter((t) => t.include && t.type === "income").reduce((s, t) => s + t.amount, 0);
    const net = totalInc - totalExp; const estTax = net > 0 ? net * 0.3 : 0;
    setAuditIssues(issues); setAuditSummary(issues.length === 0 ? "No issues — your data looks clean!" : `Found ${issues.length} issue(s).`);
    setAuditRiskLevel(issues.some((i) => i.severity === "high") ? "high" : issues.some((i) => i.severity === "medium") ? "medium" : "low");
    setAuditEstimatedTax(estTax > 0 ? `~$${Math.round(estTax).toLocaleString()}` : "");
    if (issues.length === 0) toast.success("No issues detected!"); else toast.info(`Found ${issues.length} issue(s)`);
  };

  const applyIssueSuggestion = (issue: AuditIssue, issueIdx: number) => {
    if (issue.suggestion === "delete") { setTransactions((prev) => prev.filter((t) => !issue.affected_ids.includes(t.id))); toast.success(`Deleted ${issue.affected_ids.length} transaction(s)`); }
    else { setTransactions((prev) => prev.map((t) => issue.affected_ids.includes(t.id) ? { ...t, include: false } : t)); toast.success(`Excluded ${issue.affected_ids.length} transaction(s)`); }
    setDismissedIssues((prev) => new Set(prev).add(issueIdx));
  };

  const dismissIssue = (issueIdx: number) => setDismissedIssues((prev) => new Set(prev).add(issueIdx));

  const uncategorizedCount = useMemo(() => transactions.filter((t) => t.include && t.category === "Other").length, [transactions]);

  const handleImport = async () => {
    const included = transactions.filter((t) => t.include);
    if (included.length === 0) { toast.error("No transactions to import"); return; }
    setImporting(true); setImportProgress(0);
    let expenseCount = 0, saleCount = 0, errorCount = 0;
    for (let i = 0; i < included.length; i++) {
      const t = included[i];
      setImportProgress(Math.round(((i + 1) / included.length) * 100));
      setImportStatus(`Importing ${i + 1} of ${included.length}…`);
      try {
        if (t.type === "expense") { await addExpenseMutation.mutateAsync({ date: t.date, vendor: t.description, description: t.originalDescription, amount: t.amount, category: t.category }); expenseCount++; }
        else { await addSaleMutation.mutateAsync({ date: t.date, client: t.description, description: t.originalDescription, amount: t.amount, invoiceNumber: `IMP-${Date.now().toString().slice(-4)}`, category: t.category || "Other", taxCollected: 0 }); saleCount++; }
      } catch { errorCount++; }
    }
    setImporting(false); setImportProgress(0); setImportStatus("");
    if (errorCount > 0) toast.warning(`Imported ${expenseCount + saleCount}, ${errorCount} failed`);
    else toast.success(`Imported ${expenseCount} expenses and ${saleCount} income transactions`);
    setTransactions([]); setStep("upload");
  };

  const { incomeCount, expenseCountN, totalIncome, totalExpenseAmt } = useMemo(() => {
    let ic = 0, ec = 0, ti = 0, te = 0;
    for (const t of transactions) { if (!t.include) continue; if (t.type === "income") { ic++; ti += t.amount; } else { ec++; te += t.amount; } }
    return { incomeCount: ic, expenseCountN: ec, totalIncome: ti, totalExpenseAmt: te };
  }, [transactions]);

  const getAffectedTransactions = (ids: string[]) => transactions.filter((t) => ids.includes(t.id));

  return {
    transactions, step, importing, importProgress, importStatus, dragOver, setDragOver, pdfDragOver, setPdfDragOver,
    categorizing, sortField, sortDir, auditIssues, auditSummary, auditRiskLevel, auditEstimatedTax, auditing,
    dismissedIssues, pdfProcessing, pdfStatus, pdfProgress, pdfInputRef, highlightedId, highlightedRowRef,
    inlineRuleIssueIdx, setInlineRuleIssueIdx, inlineRuleKeyword, setInlineRuleKeyword, inlineRuleCategory, setInlineRuleCategory,
    currentPage, setCurrentPage, PAGE_SIZE, sortedTransactions, totalPages, pagedTransactions,
    navigateToTransaction, handlePdfUpload, handleFileUpload, handleDrop, handleFileInput, toggleInclude, deleteTransaction,
    toggleSort, updateCategory, ruleSuggestions, visibleSuggestions, saveRule, dismissRule, saveAllRules, saveInlineRule,
    handleAudit, applyIssueSuggestion, dismissIssue, uncategorizedCount, handleImport, setStep, setTransactions,
    incomeCount, expenseCountN, totalIncome, totalExpenseAmt, getAffectedTransactions,
  };
}
