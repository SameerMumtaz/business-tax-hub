import DashboardLayout from "@/components/DashboardLayout";
import useImportLogic, { extractKeyword, type ReviewTransaction } from "@/hooks/useImportLogic";
import { formatCurrency } from "@/lib/format";
import { EXPENSE_CATEGORIES, ExpenseCategory } from "@/types/tax";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { memo, useState, useRef, useCallback } from "react";
import {
  Upload, Check, X, ArrowRight, Loader2, Trash2, ArrowUpDown, ArrowUp, ArrowDown,
  Lightbulb, Plus, XCircle, ShieldAlert, AlertTriangle, Info, Ban, Tag, ExternalLink, CheckCircle, FileText,
} from "lucide-react";
import { toast } from "sonner";

const TransactionRow = memo(function TransactionRow({
  t, onToggle, onDelete, onUpdateCategory, highlighted, rowRef,
}: {
  t: ReviewTransaction; onToggle: (id: string) => void; onDelete: (id: string) => void;
  onUpdateCategory: (id: string, category: ExpenseCategory) => void; highlighted?: boolean;
  rowRef?: React.RefObject<HTMLTableRowElement>;
}) {
  return (
    <tr ref={rowRef} className={`transition-colors duration-500 ${!t.include ? "opacity-40" : ""} ${highlighted ? "!bg-primary/10 ring-1 ring-primary/30" : ""}`}>
      <td><button onClick={() => onToggle(t.id)} className="p-1">{t.include ? <Check className="h-4 w-4 text-chart-positive" /> : <X className="h-4 w-4 text-muted-foreground" />}</button></td>
      <td className="font-mono text-xs text-muted-foreground">{t.date}</td>
      <td className="max-w-[250px] truncate">{t.description}{t.isDuplicate && <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-600">Duplicate</span>}</td>
      <td><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.type === "income" ? "bg-accent text-accent-foreground" : "bg-destructive/10 text-destructive"}`}>{t.type === "income" ? "Income" : "Expense"}</span></td>
      <td>{t.type === "expense" ? (
        <Select value={t.category} onValueChange={(v) => onUpdateCategory(t.id, v as ExpenseCategory)}>
          <SelectTrigger className="h-8 text-xs w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      ) : <span className="text-xs text-muted-foreground">—</span>}</td>
      <td className={`text-right font-mono ${t.type === "income" ? "text-chart-positive" : "text-chart-negative"}`}>{t.type === "income" ? "+" : "-"}{formatCurrency(t.amount)}</td>
      <td><button onClick={() => onDelete(t.id)} className="p-1 hover:text-destructive text-muted-foreground transition-colors"><Trash2 className="h-4 w-4" /></button></td>
    </tr>
  );
});

function DropZone({ pdfProcessing, pdfStatus, pdfProgress, onDrop, onFileInput }: {
  pdfProcessing: boolean;
  pdfStatus: string;
  pdfProgress: number;
  onDrop: (e: React.DragEvent) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const [hovering, setHovering] = useState(false);
  const [dropped, setDropped] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (dragCounter.current === 1) setHovering(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setHovering(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setHovering(false);
    setDropped(true);
    setTimeout(() => setDropped(false), 600);
    onDrop(e);
  }, [onDrop]);

  return (
    <div
      className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-all duration-300 ${
        pdfProcessing
          ? "border-primary bg-accent/50"
          : hovering
            ? "border-primary bg-accent scale-[1.02] shadow-lg shadow-primary/10"
            : dropped
              ? "border-primary bg-accent/30 scale-[0.98]"
              : "border-border hover:border-muted-foreground/40"
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {pdfProcessing ? (
        <div className="flex flex-col items-center gap-3 max-w-xs mx-auto animate-fade-in">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{pdfStatus}</p>
          {pdfProgress > 0 && <Progress value={pdfProgress} className="h-2 w-full" />}
        </div>
      ) : (
        <div className={`transition-all duration-300 ${hovering ? "scale-110" : dropped ? "scale-95 opacity-70" : ""}`}>
          {hovering ? (
            <div className="animate-fade-in">
              <FileText className="h-12 w-12 text-primary mx-auto mb-4 animate-bounce" />
              <h3 className="text-lg font-semibold text-primary mb-2">Drop to upload</h3>
              <p className="text-sm text-muted-foreground">Release to start processing your file</p>
            </div>
          ) : (
            <>
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Drop your bank statement here</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Supports PDF statements, CSV, TSV, XLSX, and XLS — from any bank.
              </p>
              <label>
                <input
                  type="file"
                  accept=".pdf,.csv,.tsv,.txt,.xlsx,.xls"
                  className="hidden"
                  onChange={onFileInput}
                />
                <Button variant="outline" asChild><span>Browse Files</span></Button>
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}


  const logic = useImportLogic();
  const {
    step, importing, importProgress, importStatus, dragOver, setDragOver, pdfDragOver, setPdfDragOver,
    categorizing, sortField, sortDir, auditIssues, auditSummary, auditRiskLevel, auditEstimatedTax,
    dismissedIssues, pdfProcessing, pdfStatus, pdfProgress, highlightedId, highlightedRowRef,
    inlineRuleIssueIdx, setInlineRuleIssueIdx, inlineRuleKeyword, setInlineRuleKeyword, inlineRuleCategory, setInlineRuleCategory,
    currentPage, setCurrentPage, PAGE_SIZE, sortedTransactions, filteredTransactions, totalPages, pagedTransactions, transactions,
    viewFilter, setViewFilter,
    navigateToTransaction, handleFileUpload, handleDrop, handleFileInput,
    toggleInclude, selectAll, deselectAll, deleteTransaction,
    toggleSort, updateCategory, visibleSuggestions, saveRule, dismissRule, saveAllRules, saveInlineRule,
    handleAudit, applyIssueSuggestion, dismissIssue, uncategorizedCount, handleImport, setStep, setTransactions,
    incomeCount, expenseCountN, totalIncome, totalExpenseAmt, getAffectedTransactions, auditing, reconciliation,
  } = logic;

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const selectedCount = transactions.filter((t) => t.include).length;
  const excludedCount = Math.max(0, transactions.length - selectedCount);
  const selectedTotalsDifferFromExtraction = reconciliation
    ? Math.abs(reconciliation.parsedIncome - totalIncome) > 0.009 || Math.abs(reconciliation.parsedExpense - totalExpenseAmt) > 0.009
    : false;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Import Transactions</h1>
          <p className="text-muted-foreground text-sm mt-1">Upload bank statements to populate your records</p>
        </div>

        {step === "upload" && (
          <DropZone
            pdfProcessing={pdfProcessing}
            pdfStatus={pdfStatus}
            pdfProgress={pdfProgress}
            onDrop={handleDrop}
            onFileInput={handleFileInput}
          />
        )}

        {step === "review" && (
          <div className="space-y-4">
            {/* Reconciliation banner */}
            {reconciliation && reconciliation.status !== "no_reference" && (
              <div className={`flex items-center gap-3 rounded-lg p-3 text-sm ${
                reconciliation.status === "matched" ? "bg-chart-positive/10 text-chart-positive" : "bg-destructive/10 text-destructive"
              }`}>
                {reconciliation.status === "matched" ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                <div className="flex-1 flex flex-wrap gap-x-4 gap-y-1">
                  <span>{reconciliation.status === "matched" ? "Extracted totals match statement" : "Extracted totals don't match statement"}</span>
                  {reconciliation.expectedIncome != null && (
                    <span className="font-mono text-xs">Extracted deposits: {formatCurrency(reconciliation.parsedIncome)} / {formatCurrency(reconciliation.expectedIncome)} expected</span>
                  )}
                  {reconciliation.expectedExpense != null && (
                    <span className="font-mono text-xs">Extracted withdrawals: {formatCurrency(reconciliation.parsedExpense)} / {formatCurrency(reconciliation.expectedExpense)} expected</span>
                  )}
                  {selectedTotalsDifferFromExtraction && (
                    <span className="text-xs text-foreground/80">
                      Selected import totals differ because {excludedCount} transaction{excludedCount === 1 ? " is" : "s are"} excluded from import.
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Summary bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-card border rounded-lg p-4">
              <div className="flex gap-6 text-sm">
                <div><span className="text-muted-foreground">Selected income:</span> <span className="font-mono text-chart-positive">{incomeCount} ({formatCurrency(totalIncome)})</span></div>
                <div><span className="text-muted-foreground">Selected expenses:</span> <span className="font-mono text-chart-negative">{expenseCountN} ({formatCurrency(totalExpenseAmt)})</span></div>
                {excludedCount > 0 && <div><span className="text-muted-foreground">Excluded:</span> <span className="font-mono">{excludedCount}</span></div>}
                {uncategorizedCount > 0 && <div><span className="text-chart-warning font-medium">{uncategorizedCount} uncategorized</span></div>}
              </div>
              <div className="flex gap-2 items-center flex-wrap">
                {categorizing && <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Categorizing…</span>}
                <div className="flex border rounded-md overflow-hidden">
                  <button onClick={() => { setViewFilter("all"); setCurrentPage(0); }} className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewFilter === "all" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>All ({transactions.length})</button>
                  <button onClick={() => { setViewFilter("selected"); setCurrentPage(0); }} className={`px-3 py-1.5 text-xs font-medium transition-colors border-l ${viewFilter === "selected" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>Selected ({selectedCount})</button>
                  <button onClick={() => { setViewFilter("excluded"); setCurrentPage(0); }} className={`px-3 py-1.5 text-xs font-medium transition-colors border-l ${viewFilter === "excluded" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>Excluded ({excludedCount})</button>
                </div>
                {selectedCount < transactions.length ? (
                  <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={deselectAll}>Deselect All</Button>
                )}
                <Button variant="outline" onClick={handleAudit} disabled={categorizing}><ShieldAlert className="h-4 w-4 mr-2" />Quick Audit</Button>
                <Button variant="outline" onClick={() => { setStep("upload"); setTransactions([]); }}>Cancel</Button>
                <Button onClick={handleImport} disabled={categorizing || auditing || importing || (reconciliation?.status === "mismatched")}>
                  {importing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing…</> : <><ArrowRight className="h-4 w-4 mr-2" />Import {selectedCount} Transactions</>}
                </Button>
              </div>
              {importing && (
                <div className="space-y-2 mt-3 w-full">
                  <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />{importStatus}</span><span className="font-mono text-xs">{importProgress}%</span></div>
                  <Progress value={importProgress} className="h-2" />
                </div>
              )}
            </div>

            {/* Audit issues */}
            {auditIssues.length > 0 && (
              <div className="stat-card space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="section-title flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-destructive" />CPA Audit Results ({auditIssues.filter((_, i) => !dismissedIssues.has(i)).length} issues)</h3>
                  <div className="flex items-center gap-2">
                    {auditRiskLevel && <Badge variant={auditRiskLevel === "high" ? "destructive" : auditRiskLevel === "medium" ? "secondary" : "outline"}>Risk: {auditRiskLevel}</Badge>}
                    {auditEstimatedTax && <Badge variant="outline" className="text-xs">Est. quarterly tax: {auditEstimatedTax}</Badge>}
                  </div>
                </div>
                {auditSummary && <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">{auditSummary}</p>}
                <div className="space-y-2">
                  {auditIssues.map((issue, idx) => {
                    if (dismissedIssues.has(idx)) return null;
                    const SeverityIcon = issue.severity === "high" ? Ban : issue.severity === "medium" ? AlertTriangle : Info;
                    const severityColor = issue.severity === "high" ? "text-destructive" : issue.severity === "medium" ? "text-chart-warning" : "text-chart-info";
                    const affected = getAffectedTransactions(issue.affected_ids);
                    return (
                      <div key={idx} className="bg-muted rounded-lg p-3 space-y-2">
                        <div className="flex items-start gap-3">
                          <SeverityIcon className={`h-4 w-4 mt-0.5 shrink-0 ${severityColor}`} />
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{issue.title}</span>
                              <Badge variant="outline" className="text-[10px]">{issue.type.replace(/_/g, " ")}</Badge>
                              <Badge variant={issue.severity === "high" ? "destructive" : "secondary"} className="text-[10px]">{issue.severity}</Badge>
                              {issue.irs_reference && <Badge variant="outline" className="text-[10px] font-mono">{issue.irs_reference}</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">{issue.description}</p>
                            <p className="text-xs font-medium">💡 {issue.suggestion_detail}</p>
                            {issue.tax_impact && <p className="text-xs text-chart-warning font-medium">💰 Tax impact: {issue.tax_impact}</p>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => { setInlineRuleIssueIdx(inlineRuleIssueIdx === idx ? null : idx); if (affected.length > 0) { const kw = extractKeyword(affected[0].description); setInlineRuleKeyword(kw || ""); } setInlineRuleCategory(""); }}>
                              <Tag className="h-3 w-3 mr-1" /> Create Rule
                            </Button>
                            {(issue.suggestion === "delete" || issue.suggestion === "review" || issue.suggestion === "flag") && (
                              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => applyIssueSuggestion(issue, idx)}>
                                {issue.suggestion === "delete" ? <><Trash2 className="h-3 w-3 mr-1" /> Delete</> : <><X className="h-3 w-3 mr-1" /> Exclude</>}
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => dismissIssue(idx)}>Dismiss</Button>
                          </div>
                        </div>
                        {affected.length > 0 && (
                          <div className="ml-7 space-y-1">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Affected transactions</p>
                            <div className="flex flex-col gap-0.5">
                              {affected.slice(0, 8).map((t) => (
                                <button key={t.id} onClick={() => navigateToTransaction(t.id)} className="flex items-center gap-2 text-xs text-left hover:bg-background/60 rounded px-2 py-1 transition-colors group w-full">
                                  <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-primary shrink-0" />
                                  <span className="font-mono text-muted-foreground w-20 shrink-0">{t.date}</span>
                                  <span className="truncate flex-1">{t.description}</span>
                                  <span className={`font-mono shrink-0 ${t.type === "income" ? "text-chart-positive" : "text-chart-negative"}`}>{formatCurrency(t.amount)}</span>
                                </button>
                              ))}
                              {affected.length > 8 && <span className="text-[10px] text-muted-foreground ml-7">…and {affected.length - 8} more</span>}
                            </div>
                          </div>
                        )}
                        {inlineRuleIssueIdx === idx && (
                          <div className="ml-7 flex items-center gap-2 bg-background/60 rounded-lg p-2 border">
                            <Tag className="h-3.5 w-3.5 text-primary shrink-0" />
                            <Input placeholder="Keyword" value={inlineRuleKeyword} onChange={(e) => setInlineRuleKeyword(e.target.value)} className="h-7 text-xs w-[140px]" />
                            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                            <Select value={inlineRuleCategory} onValueChange={setInlineRuleCategory}>
                              <SelectTrigger className="h-7 text-xs w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
                              <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button size="sm" className="h-7 text-xs" onClick={() => saveInlineRule(idx)}>Save Rule</Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setInlineRuleIssueIdx(null)}>Cancel</Button>
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
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("date")}><span className="inline-flex items-center">Date<SortIcon field="date" /></span></th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("description")}><span className="inline-flex items-center">Description<SortIcon field="description" /></span></th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("type")}><span className="inline-flex items-center">Type<SortIcon field="type" /></span></th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("category")}><span className="inline-flex items-center">Category<SortIcon field="category" /></span></th>
                    <th className="text-right cursor-pointer select-none" onClick={() => toggleSort("amount")}><span className="inline-flex items-center justify-end">Amount<SortIcon field="amount" /></span></th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedTransactions.map((t) => (
                    <TransactionRow key={t.id} t={t} onToggle={toggleInclude} onDelete={deleteTransaction} onUpdateCategory={updateCategory} highlighted={t.id === highlightedId} rowRef={t.id === highlightedId ? highlightedRowRef : undefined} />
                  ))}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t">
                  <span className="text-xs text-muted-foreground">Showing {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, filteredTransactions.length)} of {filteredTransactions.length}</span>
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
                  <h3 className="section-title flex items-center gap-2"><Lightbulb className="h-4 w-4 text-chart-warning" />Suggested Rules ({visibleSuggestions.length})</h3>
                  <Button variant="outline" size="sm" onClick={saveAllRules}><Plus className="h-3 w-3 mr-1" /> Save All</Button>
                </div>
                <p className="text-xs text-muted-foreground">Based on your edits. Save these to auto-categorize future imports.</p>
                <div className="flex flex-wrap gap-2">
                  {visibleSuggestions.map((s) => (
                    <div key={`${s.keyword}|${s.category}`} className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 text-sm">
                      <span className="font-mono text-xs">{s.keyword}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <Badge variant="secondary" className="text-xs">{s.category}</Badge>
                      {s.count > 1 && <span className="text-xs text-muted-foreground">×{s.count}</span>}
                      <button onClick={() => saveRule(s)} className="p-0.5 text-primary hover:text-primary/80 transition-colors" title="Save rule"><Plus className="h-3.5 w-3.5" /></button>
                      <button onClick={() => dismissRule(s)} className="p-0.5 text-muted-foreground hover:text-destructive transition-colors" title="Dismiss"><XCircle className="h-3.5 w-3.5" /></button>
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
