import { useState, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useTaxStore } from "@/store/taxStore";
import { parseCSV, ParsedTransaction, autoCategorize } from "@/lib/csvParser";
import { formatCurrency, generateId } from "@/lib/format";
import { EXPENSE_CATEGORIES, ExpenseCategory } from "@/types/tax";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, Landmark, Check, X, FileUp, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface ReviewTransaction extends ParsedTransaction {
  id: string;
  category: ExpenseCategory;
  include: boolean;
}

export default function ImportPage() {
  const { addExpense, addSale } = useTaxStore();
  const [transactions, setTransactions] = useState<ReviewTransaction[]>([]);
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [dragOver, setDragOver] = useState(false);

  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".tsv") && !file.name.endsWith(".txt")) {
      toast.error("Please upload a CSV file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        toast.error("No transactions found. Check the CSV format.");
        return;
      }

      const reviewed: ReviewTransaction[] = parsed.map((t) => ({
        ...t,
        id: generateId(),
        category: t.type === "expense" ? autoCategorize(t.description) : "Other" as ExpenseCategory,
        include: true,
      }));

      setTransactions(reviewed);
      setStep("review");
      toast.success(`Found ${parsed.length} transactions`);
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

  const updateCategory = (id: string, category: ExpenseCategory) => {
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, category } : t)));
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
            <div className="flex items-center justify-between bg-card border rounded-lg p-4">
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Income:</span>{" "}
                  <span className="font-mono text-chart-positive">{incomeCount} ({formatCurrency(totalIncome)})</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Expenses:</span>{" "}
                  <span className="font-mono text-chart-negative">{expenseCountN} ({formatCurrency(totalExpenseAmt)})</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setStep("upload"); setTransactions([]); }}>
                  Cancel
                </Button>
                <Button onClick={handleImport}>
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
                    <th>Date</th>
                    <th>Description</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
