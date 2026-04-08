/**
 * Vision-first PDF import helper.
 * Renders PDF pages to compressed JPEG images, sends to edge function for
 * multimodal AI extraction, and reconciles against statement summary.
 */
import { supabase } from "@/integrations/supabase/client";

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

export interface StatementSummary {
  depositTotal?: number;
  withdrawalTotal?: number;
  depositCount?: number;
  withdrawalCount?: number;
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

// ─── Page rendering ─────────────────────────────────────────────────────────

interface PageImage {
  base64: string;
  mimeType: string;
  pageNum: number;
}

/**
 * Render a single PDF page to a compressed JPEG base64 string.
 */
async function renderPageToImage(
  pdf: any,
  pageNum: number,
  scale: number = 1.5,
): Promise<PageImage> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport }).promise;
  // Compress to JPEG at 75% quality — good balance of size vs readability
  const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
  const base64 = dataUrl.split(",")[1];
  canvas.width = 0;
  canvas.height = 0;
  return { base64, mimeType: "image/jpeg", pageNum };
}

/**
 * Classify pages into summary vs transaction using simple text heuristics.
 * We still extract text for classification only — actual parsing uses images.
 */
async function classifyPages(pdf: any, numPages: number): Promise<{
  summaryPages: number[];
  transactionPages: number[];
  legalPages: number[];
}> {
  const summaryPages: number[] = [];
  const transactionPages: number[] = [];
  const legalPages: number[] = [];

  const SUMMARY_RE = /account\s+summary|statement\s+summary|beginning\s+balance|ending\s+balance|total\s+deposits?|total\s+withdrawals?/i;
  const LEGAL_RE = /important\s+information|terms\s+and\s+conditions|disclosure|privacy\s+(?:notice|policy)|in\s+case\s+of\s+errors?|electronic\s+fund\s+transfer/i;
  const DATE_RE = /\d{1,2}[\/\-]\d{1,2}/g;

  for (let p = 1; p <= numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const text = content.items.map((i: any) => i.str || "").join(" ");
    const lower = text.toLowerCase();

    const dateCount = (lower.match(DATE_RE) || []).length;
    const isSummary = SUMMARY_RE.test(lower);
    const isLegal = LEGAL_RE.test(lower);

    if (isLegal && dateCount < 5) {
      legalPages.push(p);
    } else if (isSummary && dateCount < 10) {
      summaryPages.push(p);
    } else {
      transactionPages.push(p);
    }
  }

  // First page is often summary even if it also has some transactions
  if (summaryPages.length === 0 && numPages > 1) {
    summaryPages.push(1);
  }

  return { summaryPages, transactionPages, legalPages };
}

// ─── Main pipeline ──────────────────────────────────────────────────────────

export async function processStatementPdf(
  file: File,
  onProgress: ProgressCallback,
): Promise<PdfImportResult> {
  const startTime = Date.now();

  // Step 1: Load PDF
  onProgress("Reading PDF…", 5);
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = Math.min(pdf.numPages, 50);

  // Step 2: Classify pages
  onProgress("Classifying pages…", 10);
  const { summaryPages, transactionPages, legalPages } = await classifyPages(pdf, numPages);
  const pageStats = {
    total: numPages,
    transaction: transactionPages.length,
    summary: summaryPages.length,
    legal: legalPages.length,
  };
  console.log(`Pages: ${transactionPages.length} transaction, ${summaryPages.length} summary, ${legalPages.length} legal`);

  // Step 3: Render summary pages and extract summary
  onProgress("Extracting statement summary…", 15);
  let summary: StatementSummary = {};
  if (summaryPages.length > 0) {
    const summaryImages = await Promise.all(
      summaryPages.slice(0, 2).map((p) => renderPageToImage(pdf, p, 2.0)),
    );
    try {
      const { data, error } = await supabase.functions.invoke("parse-pdf", {
        body: { mode: "summary", images: summaryImages },
      });
      if (!error && data?.summary) {
        summary = data.summary;
        console.log("Statement summary:", JSON.stringify(summary));
      }
    } catch (e) {
      console.warn("Summary extraction failed:", e);
    }
  }

  // Step 4: Render transaction pages to images
  onProgress("Rendering pages…", 20);
  const pagesToRender = transactionPages.length > 0 ? transactionPages : Array.from({ length: numPages }, (_, i) => i + 1);
  const pageImages: PageImage[] = [];
  for (let i = 0; i < pagesToRender.length; i++) {
    onProgress(`Rendering page ${i + 1} of ${pagesToRender.length}…`, 20 + Math.round((i / pagesToRender.length) * 15));
    pageImages.push(await renderPageToImage(pdf, pagesToRender[i]));
  }

  // Step 5: Chunk images and send to vision extraction
  // Send 3-4 pages per chunk to keep payload manageable
  onProgress("Analyzing transactions…", 38);
  const PAGES_PER_CHUNK = 4;
  const chunks: PageImage[][] = [];
  for (let i = 0; i < pageImages.length; i += PAGES_PER_CHUNK) {
    chunks.push(pageImages.slice(i, i + PAGES_PER_CHUNK));
  }

  const allTx: ParsedImportTx[] = [];
  const chunkErrors: string[] = [];
  const totalChunks = chunks.length;
  const concurrency = Math.min(2, totalChunks); // Keep concurrency low for vision calls
  let nextChunkIndex = 0;
  let completed = 0;
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
      try {
        const { data, error } = await supabase.functions.invoke("parse-pdf", {
          body: { mode: "transactions", images: chunks[chunkIndex] },
        });
        if (error) {
          chunkErrors.push(`Chunk ${chunkIndex + 1}: ${(error as any).message || "failed"}`);
        } else if (data?.transactions?.length) {
          allTx.push(...data.transactions);
        }
      } catch (e) {
        chunkErrors.push(`Chunk ${chunkIndex + 1}: ${e instanceof Error ? e.message : "failed"}`);
      } finally {
        completed++;
        onProgress(
          `Analyzing transactions… ${completed}/${totalChunks} chunks done, ${getEta()}`,
          38 + Math.round((completed / totalChunks) * 47),
        );
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => runWorker()));

  // Step 6: Reconciliation
  onProgress("Reconciling results…", 90);

  let incomeTotal = 0, expenseTotal = 0, incomeCount = 0, expenseCount = 0;
  for (const tx of allTx) {
    if (tx.type === "income") { incomeTotal += tx.amount; incomeCount++; }
    else { expenseTotal += tx.amount; expenseCount++; }
  }

  // Lopsided guard: if summary says there should be both types but we got almost all one type
  if (summary.depositTotal && summary.withdrawalTotal) {
    const totalParsed = incomeCount + expenseCount;
    if (totalParsed > 10 && (incomeCount < 2 || expenseCount < 2)) {
      console.warn(`Lopsided results detected: ${incomeCount} income, ${expenseCount} expense. Statement has both deposits ($${summary.depositTotal}) and withdrawals ($${summary.withdrawalTotal}). This likely indicates a parsing error.`);
    }
  }

  let reconciliation: ReconciliationResult;
  if (summary.depositTotal != null || summary.withdrawalTotal != null) {
    const toleranceDollars = 1; // Fail closed unless totals are effectively exact
    const incomeMatch = summary.depositTotal != null
      ? Math.abs(incomeTotal - summary.depositTotal) <= toleranceDollars
      : true;
    const expenseMatch = summary.withdrawalTotal != null
      ? Math.abs(expenseTotal - summary.withdrawalTotal) <= toleranceDollars
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
    `PDF import complete: ${allTx.length} transactions, method=vision, ` +
    `reconciliation=${reconciliation.status}, took ${totalMs}ms` +
    (chunkErrors.length > 0 ? `, errors: ${chunkErrors.join("; ")}` : "")
  );

  return { transactions: allTx, summary, reconciliation, pageStats, method: "vision", totalMs };
}
