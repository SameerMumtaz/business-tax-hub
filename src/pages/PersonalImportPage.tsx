import { useState, useMemo, useRef, useCallback } from "react";
import PersonalDashboardLayout from "@/components/PersonalDashboardLayout";
import { usePersonalExpenses, useAddPersonalExpense, PersonalExpense } from "@/hooks/usePersonalData";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, FileText, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractRawItems, detectDocTypeFromItems, type PageData } from "@/lib/pdfTextExtract";

const PERSONAL_CATEGORIES = [
  "Housing", "Medical & Health", "Charitable Giving", "Education", "Childcare",
  "Transportation", "Groceries", "Utilities", "Insurance", "Entertainment",
  "Clothing", "Subscriptions", "Dining Out", "Gas & Fuel", "Other",
];

interface ReviewTx {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  include: boolean;
  tax_deductible: boolean;
}

const autoCategorize = (desc: string): string => {
  const d = desc.toLowerCase();
  if (/(netflix|hulu|spotify|disney|hbo|apple\s*tv|youtube\s*premium|amazon\s*prime|subscription)/i.test(d)) return "Subscriptions";
  if (/(walmart|target|kroger|costco|aldi|safeway|publix|grocery|whole\s*foods|trader\s*joe)/i.test(d)) return "Groceries";
  if (/(shell|exxon|chevron|bp\s|marathon|speedway|wawa|qt\s|gas|fuel|sunoco)/i.test(d)) return "Gas & Fuel";
  if (/(restaurant|mcdonald|burger|pizza|starbucks|chick-fil|wendy|taco\s*bell|chipotle|dine|grubhub|doordash|uber\s*eats)/i.test(d)) return "Dining Out";
  if (/(electric|water\s*bill|gas\s*bill|utility|power|internet|comcast|att|verizon|t-mobile|xfinity|spectrum)/i.test(d)) return "Utilities";
  if (/(geico|state\s*farm|allstate|progressive|insurance|premium)/i.test(d)) return "Insurance";
  if (/(rent|mortgage|hoa|property\s*tax|home\s*depot|lowe)/i.test(d)) return "Housing";
  if (/(hospital|pharmacy|cvs|walgreens|doctor|medical|dental|health|copay|urgent\s*care)/i.test(d)) return "Medical & Health";
  if (/(uber|lyft|parking|toll|transit|metro|bus\s*fare)/i.test(d)) return "Transportation";
  if (/(amazon|ebay|etsy|clothing|nike|adidas|old\s*navy|zara|h&m|gap\s)/i.test(d)) return "Clothing";
  if (/(movie|theater|concert|ticket|amusement|bowling|gaming|playstation|xbox|steam)/i.test(d)) return "Entertainment";
  if (/(tuition|school|university|college|coursera|udemy|textbook|education)/i.test(d)) return "Education";
  if (/(daycare|childcare|babysit)/i.test(d)) return "Childcare";
  if (/(church|charity|donation|goodwill|salvation\s*army|red\s*cross)/i.test(d)) return "Charitable Giving";
  return "Other";
};

const DEDUCTIBLE_CATS = new Set(["Medical & Health", "Charitable Giving", "Education", "Childcare"]);

export default function PersonalImportPage() {
  const { data: existingExpenses = [] } = usePersonalExpenses();
  const addExpense = useAddPersonalExpense();
  const [transactions, setTransactions] = useState<ReviewTx[]>([]);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [filterCat, setFilterCat] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePdfUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const numPages = Math.min(pdf.numPages, 50);
      const pageTexts: string[] = [];
      for (let p = 1; p <= numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        // Reconstruct lines using Y-coordinate changes (same as business import)
        const textItems = content.items
          .filter((item: any) => "str" in item && item.str)
          .map((item: any) => ({
            str: item.str,
            transform: item.transform,
            width: item.width,
          }));
        pageTexts.push(reconstructPageText(textItems));
      }
      const fullText = pageTexts.join("\n\n--- PAGE BREAK ---\n\n");

      // Chunk large texts like business import does
      const CHUNK_SIZE = 50000;
      const textChunks: string[] = [];
      if (fullText.length <= CHUNK_SIZE) {
        textChunks.push(fullText);
      } else {
        let current = "";
        for (const pt of pageTexts) {
          if (current.length + pt.length > CHUNK_SIZE && current.length > 0) {
            textChunks.push(current);
            current = "";
          }
          current += pt + "\n\n--- PAGE BREAK ---\n\n";
        }
        if (current.trim()) textChunks.push(current);
      }

      const allTx: any[] = [];
      for (const chunk of textChunks) {
        const { data, error } = await supabase.functions.invoke("parse-pdf", {
          body: { text: chunk },
        });
        if (error) throw error;
        if (data?.transactions?.length) allTx.push(...data.transactions);
      }

      if (allTx.length === 0) {
        toast.error("No transactions found in PDF");
        return;
      }

      const parsed: ReviewTx[] = allTx.map((t: any, i: number) => {
        const cat = autoCategorize(t.description);
        return {
          id: `imp-${i}-${Date.now()}`,
          date: t.date,
          description: t.description,
          amount: Math.abs(t.amount),
          type: t.type as "income" | "expense",
          category: cat,
          include: t.type === "expense",
          tax_deductible: DEDUCTIBLE_CATS.has(cat),
        };
      });

      // Deduplicate against existing
      const existingKeys = new Set(
        existingExpenses.map((e) => `${e.date}|${e.amount.toFixed(2)}`)
      );
      parsed.forEach((t) => {
        const key = `${t.date}|${t.amount.toFixed(2)}`;
        if (existingKeys.has(key)) t.include = false;
      });

      setTransactions(parsed);
      toast.success(`Extracted ${parsed.length} transactions`);
    } catch (e: any) {
      toast.error(e.message || "Failed to parse PDF");
    } finally {
      setUploading(false);
    }
  }, [existingExpenses]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      handlePdfUpload(file);
    } else {
      toast.error("Only PDF statements are supported");
    }
    e.target.value = "";
  };

  const toggleInclude = (id: string) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, include: !t.include } : t))
    );
  };

  const setCat = (id: string, cat: string) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, category: cat, tax_deductible: DEDUCTIBLE_CATS.has(cat) } : t))
    );
  };

  const filtered = useMemo(() => {
    let list = transactions;
    if (filterCat !== "all") list = list.filter((t) => t.category === filterCat);
    if (filterType !== "all") list = list.filter((t) => t.type === filterType);
    return list;
  }, [transactions, filterCat, filterType]);

  const included = transactions.filter((t) => t.include);
  const totalToImport = included.reduce((s, t) => s + t.amount, 0);

  const handleImport = async () => {
    if (included.length === 0) { toast.error("No transactions selected"); return; }
    setImporting(true);
    setProgress(0);
    let done = 0;
    for (const t of included) {
      await addExpense.mutateAsync({
        date: t.date,
        vendor: t.description,
        description: null,
        amount: t.amount,
        category: t.category,
        tax_deductible: t.tax_deductible,
        receipt_url: null,
      });
      done++;
      setProgress(Math.round((done / included.length) * 100));
    }
    toast.success(`Imported ${done} expenses`);
    setTransactions([]);
    setImporting(false);
  };

  return (
    <PersonalDashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Import Statements</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload bank or credit card statements to auto-import expenses
          </p>
        </div>

        {/* Upload area */}
        <div
          className="stat-card border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer p-8 text-center"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const file = e.dataTransfer.files?.[0];
            if (file && (file.type === "application/pdf" || file.name.endsWith(".pdf"))) {
              handlePdfUpload(file);
            } else {
              toast.error("Only PDF statements are supported");
            }
          }}
        >
          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Parsing statement…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Drop a PDF statement or click to browse</p>
              <p className="text-xs text-muted-foreground">Supports bank statements and credit card statements</p>
            </div>
          )}
        </div>

        {/* Review area */}
        {transactions.length > 0 && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="stat-card text-center py-5">
                <p className="text-sm text-muted-foreground">Extracted</p>
                <p className="text-2xl font-bold font-mono mt-1">{transactions.length}</p>
              </div>
              <div className="stat-card text-center py-5">
                <p className="text-sm text-muted-foreground">Selected</p>
                <p className="text-2xl font-bold font-mono mt-1">{included.length}</p>
              </div>
              <div className="stat-card text-center py-5">
                <p className="text-sm text-muted-foreground">Import Total</p>
                <p className="text-2xl font-bold font-mono mt-1">{formatCurrency(totalToImport)}</p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-3 flex-wrap items-center">
              <Select value={filterCat} onValueChange={setFilterCat}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {PERSONAL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex-1" />
              <Button onClick={handleImport} disabled={importing || included.length === 0}>
                {importing ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {progress}%</>
                ) : (
                  <><Check className="h-4 w-4 mr-2" /> Import {included.length} Expenses</>
                )}
              </Button>
            </div>

            {/* Transaction table */}
            <div className="stat-card overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-8"></th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map((t) => (
                    <tr key={t.id} className={!t.include ? "opacity-40" : ""}>
                      <td>
                        <Checkbox checked={t.include} onCheckedChange={() => toggleInclude(t.id)} />
                      </td>
                      <td className="font-mono text-xs text-muted-foreground whitespace-nowrap">{t.date}</td>
                      <td className="max-w-[250px] truncate text-sm">{t.description}</td>
                      <td>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          t.type === "income" ? "bg-chart-positive/10 text-chart-positive" : "bg-muted text-muted-foreground"
                        }`}>
                          {t.type}
                        </span>
                      </td>
                      <td>
                        <Select value={t.category} onValueChange={(v) => setCat(t.id, v)}>
                          <SelectTrigger className="h-7 text-xs w-[140px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PERSONAL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="text-right font-mono text-sm">{formatCurrency(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </PersonalDashboardLayout>
  );
}
