/**
 * Shared PDF import helper — used by both business and personal import flows.
 * Handles PDF reading, page classification, summary extraction, smart chunking,
 * edge function invocation, and reconciliation.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  extractRawItems,
  detectDocTypeFromItems,
  prescanDocument,
  getInitialSectionForChunk,
  classifyPage,
  extractStatementSummary,
  type PageData,
  type StatementSummary,
  type PageType,
} from "@/lib/pdfTextExtract";

export interface ParsedImportTx {
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
}

export interface ReconciliationResult {
  status: "matched" | "mismatched" | "no_reference";
  expectedIncome?: number;
  parsedIncome: number;
  expectedExpense?: number;
  parsedExpense: number;
  incomeCountExpected?: number;
  incomeCountParsed: number;
  expenseCountExpected?: number;
  expenseCountParsed: number;
}

export interface PdfImportResult {
  transactions: ParsedImportTx[];
  summary: StatementSummary;
  reconciliation: ReconciliationResult;
  pageStats: { total: number; transaction: number; summary: number; legal: number };
  method: string;
  totalMs: number;
}

export type ProgressCallback = (status: string, percent: number) => void;

/**
 * Process a PDF statement file end-to-end.
 * Returns parsed transactions with reconciliation status.
 */
export async function processStatementPdf(
  file: File,
  onProgress: ProgressCallback,
): Promise<PdfImportResult> {
  const startTime = Date.now();

  // Step 1: Read PDF pages
  onProgress("Reading PDF…", 5);
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = Math.min(pdf.numPages, 50);

  const allPages: PageData[] = [];
  for (let p = 1; p <= numPages; p++) {
    onProgress(`Reading page ${p} of ${numPages}…`, 5 + Math.round((p / numPages) * 15));
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const pageData = extractRawItems(content.items, { width: viewport.width, height: viewport.height });
    pageData.pageNum = p;
    allPages.push(pageData);
  }

  // Step 2: Detect doc type
  const docType = detectDocTypeFromItems(allPages);

  // Step 3: Classify pages
  onProgress("Classifying pages…", 22);
  const pageTypes: PageType[] = allPages.map((p) => classifyPage(p));
  const pageStats = {
    total: numPages,
    transaction: pageTypes.filter((t) => t === "transaction").length,
    summary: pageTypes.filter((t) => t === "summary").length,
    legal: pageTypes.filter((t) => t === "legal").length,
  };

  // Step 4: Extract summary from summary pages
  onProgress("Extracting statement summary…", 25);
  const summaryPages = allPages.filter((_, i) => pageTypes[i] === "summary");
  const summary = extractStatementSummary(summaryPages.length > 0 ? summaryPages : allPages.slice(0, 2));

  // Step 5: Pre-scan for columns and section boundaries
  const prescan = prescanDocument(allPages);
  console.log(
    `Pre-scan: ${prescan.columns.length} columns (${prescan.columns.map((c) => c.name).join(", ")}), ` +
    `${prescan.sectionBoundaries.length} section boundaries, ` +
    `pages: ${pageStats.transaction} transaction, ${pageStats.summary} summary, ${pageStats.legal} legal`
  );

  // Step 6: Get transaction pages only
  const transactionPages = allPages.filter((_, i) => pageTypes[i] === "transaction" || pageTypes[i] === "unknown");
  const pagesToProcess = transactionPages.length > 0 ? transactionPages : allPages;

  // Step 7: Smart chunking — larger chunks since deterministic parsing is fast
  onProgress("Analyzing transactions…", 30);
  const PAGES_PER_CHUNK = 15; // Larger chunks since deterministic is < 100ms
  const pageChunks: PageData[][] = [];
  for (let i = 0; i < pagesToProcess.length; i += PAGES_PER_CHUNK) {
    pageChunks.push(pagesToProcess.slice(i, i + PAGES_PER_CHUNK));
  }

  // Step 8: Send chunks to edge function (max 3 concurrent)
  const allTx: ParsedImportTx[] = [];
  const chunkErrors: string[] = [];
  const totalChunks = pageChunks.length;
  const concurrency = Math.min(3, totalChunks);
  let nextChunkIndex = 0;
  let completed = 0;
  let method = "deterministic";
  const chunkStartTime = Date.now();

  const getEta = () => {
    if (completed < 1) return "estimating…";
    const elapsedMs = Date.now() - chunkStartTime;
    const msPerChunk = elapsedMs / completed;
    const remaining = totalChunks - completed;
    const etaSec = Math.max(1, Math.round((msPerChunk * remaining) / 1000));
    return etaSec >= 60 ? `~${Math.ceil(etaSec / 60)}min remaining` : `~${etaSec}s remaining`;
  };

  const runWorker = async () => {
    while (nextChunkIndex < totalChunks) {
      const chunkIndex = nextChunkIndex++;
      const chunkStartPage = pageChunks[chunkIndex][0]?.pageNum || 1;
      const initialSection = getInitialSectionForChunk(chunkStartPage, prescan.sectionBoundaries);

      try {
        const { data, error } = await supabase.functions.invoke("parse-pdf", {
          body: {
            pages: pageChunks[chunkIndex],
            docType,
            detectedColumns: prescan.columns,
            initialSection,
          },
        });
        if (error) {
          chunkErrors.push(`Chunk ${chunkIndex + 1}: ${(error as any).message || "failed"}`);
        } else {
          if (data?.transactions?.length) allTx.push(...data.transactions);
          if (data?.method && data.method !== "deterministic") method = data.method;
        }
      } catch (e) {
        chunkErrors.push(`Chunk ${chunkIndex + 1}: ${e instanceof Error ? e.message : "failed"}`);
      } finally {
        completed++;
        onProgress(
          `Analyzing transactions… ${completed}/${totalChunks} chunks done, ${getEta()}`,
          30 + Math.round((completed / totalChunks) * 55),
        );
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => runWorker()));

  // Step 9: Reconciliation
  onProgress("Reconciling results…", 90);

  let incomeTotal = 0, expenseTotal = 0, incomeCount = 0, expenseCount = 0;
  for (const tx of allTx) {
    if (tx.type === "income") { incomeTotal += tx.amount; incomeCount++; }
    else { expenseTotal += tx.amount; expenseCount++; }
  }

  let reconciliation: ReconciliationResult;
  if (summary.depositTotal != null || summary.withdrawalTotal != null) {
    const tolerance = 0.02; // 2% tolerance
    const incomeMatch = summary.depositTotal != null
      ? Math.abs(incomeTotal - summary.depositTotal) / Math.max(summary.depositTotal, 1) <= tolerance
      : true;
    const expenseMatch = summary.withdrawalTotal != null
      ? Math.abs(expenseTotal - summary.withdrawalTotal) / Math.max(summary.withdrawalTotal, 1) <= tolerance
      : true;

    reconciliation = {
      status: incomeMatch && expenseMatch ? "matched" : "mismatched",
      expectedIncome: summary.depositTotal,
      parsedIncome: Math.round(incomeTotal * 100) / 100,
      expectedExpense: summary.withdrawalTotal,
      parsedExpense: Math.round(expenseTotal * 100) / 100,
      incomeCountExpected: summary.depositCount,
      incomeCountParsed: incomeCount,
      expenseCountExpected: summary.withdrawalCount,
      expenseCountParsed: expenseCount,
    };
  } else {
    reconciliation = {
      status: "no_reference",
      parsedIncome: Math.round(incomeTotal * 100) / 100,
      parsedExpense: Math.round(expenseTotal * 100) / 100,
      incomeCountParsed: incomeCount,
      expenseCountParsed: expenseCount,
    };
  }

  onProgress("Done", 100);
  const totalMs = Date.now() - startTime;

  console.log(
    `PDF import complete: ${allTx.length} transactions, method=${method}, ` +
    `reconciliation=${reconciliation.status}, took ${totalMs}ms` +
    (chunkErrors.length > 0 ? `, errors: ${chunkErrors.join("; ")}` : "")
  );

  return { transactions: allTx, summary, reconciliation, pageStats, method, totalMs };
}
