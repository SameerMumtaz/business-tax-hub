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
  pageNum?: number;
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
  statementYear?: number;
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
  const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
  const base64 = dataUrl.split(",")[1];
  canvas.width = 0;
  canvas.height = 0;
  return { base64, mimeType: "image/jpeg", pageNum };
}

/** Render multiple pages in parallel (batched to avoid memory spikes) */
async function renderPagesParallel(
  pdf: any,
  pageNums: number[],
  scale: number = 1.5,
  batchSize: number = 4,
): Promise<PageImage[]> {
  const results: PageImage[] = [];
  for (let i = 0; i < pageNums.length; i += batchSize) {
    const batch = pageNums.slice(i, i + batchSize);
    const rendered = await Promise.all(batch.map((p) => renderPageToImage(pdf, p, scale)));
    results.push(...rendered);
  }
  return results;
}

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

  if (summaryPages.length === 0 && numPages > 1) {
    summaryPages.push(1);
  }

  // If summary page has transactions too, include it in both lists
  for (const sp of summaryPages) {
    if (!transactionPages.includes(sp)) {
      const page = await pdf.getPage(sp);
      const content = await page.getTextContent();
      const text = content.items.map((i: any) => i.str || "").join(" ");
      const dateCount = (text.match(DATE_RE) || []).length;
      if (dateCount >= 5) {
        transactionPages.push(sp);
        transactionPages.sort((a: number, b: number) => a - b);
      }
    }
  }

  return { summaryPages, transactionPages, legalPages };
}

// ─── Reconciliation ─────────────────────────────────────────────────────────

function reconcile(
  txs: ParsedImportTx[],
  summary: StatementSummary,
): ReconciliationResult {
  let incomeTotal = 0, expenseTotal = 0, incomeCount = 0, expenseCount = 0;
  for (const tx of txs) {
    if (tx.type === "income") { incomeTotal += tx.amount; incomeCount++; }
    else { expenseTotal += tx.amount; expenseCount++; }
  }

  if (summary.depositTotal != null || summary.withdrawalTotal != null) {
    const toleranceDollars = 1;
    const incomeMatch = summary.depositTotal != null
      ? Math.abs(incomeTotal - summary.depositTotal) <= toleranceDollars
      : true;
    const expenseMatch = summary.withdrawalTotal != null
      ? Math.abs(expenseTotal - summary.withdrawalTotal) <= toleranceDollars
      : true;

    return {
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
  }

  return {
    status: "no_reference",
    parsedIncome: Math.round(incomeTotal * 100) / 100,
    parsedExpense: Math.round(expenseTotal * 100) / 100,
    incomeCountParsed: incomeCount,
    expenseCountParsed: expenseCount,
  };
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
  console.log(`Pages: ${transactionPages.length} transaction [${transactionPages.join(",")}], ${summaryPages.length} summary [${summaryPages.join(",")}], ${legalPages.length} legal`);

  // Step 3: Render summary + transaction pages IN PARALLEL
  onProgress("Rendering pages…", 15);
  const pagesToRender = transactionPages.length > 0
    ? transactionPages
    : Array.from({ length: numPages }, (_, i) => i + 1);

  // Render summary pages at 2.0x (for number accuracy) and transaction pages at 1.5x simultaneously
  const [summaryImages, pageImages] = await Promise.all([
    summaryPages.length > 0
      ? renderPagesParallel(pdf, summaryPages.slice(0, 2), 2.0)
      : Promise.resolve([]),
    renderPagesParallel(pdf, pagesToRender, 1.5),
  ]);

  onProgress("Analyzing…", 25);

  // Step 4: Fire summary extraction AND first transaction chunks IN PARALLEL
  const PAGES_PER_CHUNK = 3;
  const chunks: PageImage[][] = [];
  for (let i = 0; i < pageImages.length; i += PAGES_PER_CHUNK) {
    chunks.push(pageImages.slice(i, i + PAGES_PER_CHUNK));
  }

  let summary: StatementSummary = {};
  const allTx: ParsedImportTx[] = [];
  const chunkErrors: string[] = [];
  const chunkStats: { chunkIdx: number; count: number; income: number; expense: number }[] = [];
  const totalChunks = chunks.length;
  const CONCURRENCY = Math.min(3, totalChunks);
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

  const processChunk = async (chunkIndex: number): Promise<ParsedImportTx[]> => {
    const images = chunks[chunkIndex];
    const { data, error } = await supabase.functions.invoke("parse-pdf", {
      body: {
        mode: "transactions",
        images,
        statementYear: summary.statementYear,
      },
    });
    if (error) throw new Error((error as any).message || "failed");
    return data?.transactions || [];
  };

  // Extract summary concurrently with first transaction chunks
  const summaryPromise = summaryImages.length > 0
    ? supabase.functions.invoke("parse-pdf", { body: { mode: "summary", images: summaryImages } })
        .then(({ data, error }) => {
          if (!error && data?.summary) {
            summary = data.summary;
            console.log("Statement summary:", JSON.stringify(summary));
          }
        })
        .catch((e) => console.warn("Summary extraction failed:", e))
    : Promise.resolve();

  const runWorker = async () => {
    while (nextChunkIndex < totalChunks) {
      const chunkIndex = nextChunkIndex++;
      try {
        const txs = await processChunk(chunkIndex);
        let chunkIncome = 0, chunkExpense = 0;
        for (const tx of txs) {
          if (tx.type === "income") chunkIncome += tx.amount;
          else chunkExpense += tx.amount;
        }
        chunkStats.push({ chunkIdx: chunkIndex, count: txs.length, income: chunkIncome, expense: chunkExpense });
        allTx.push(...txs);
      } catch (e) {
        chunkErrors.push(`Chunk ${chunkIndex + 1}: ${e instanceof Error ? e.message : "failed"}`);
      } finally {
        completed++;
        onProgress(
          `Analyzing transactions… ${completed}/${totalChunks} chunks done, ${getEta()}`,
          25 + Math.round((completed / totalChunks) * 55),
        );
      }
    }
  };

  // Run summary + all transaction workers in parallel
  await Promise.all([
    summaryPromise,
    ...Array.from({ length: CONCURRENCY }, () => runWorker()),
  ]);

  // Step 5: Reconcile
  onProgress("Reconciling results…", 85);
  const reconciliation = reconcile(allTx, summary);

  // Step 6: Lopsided guard
  if (summary.depositTotal && summary.withdrawalTotal) {
    const totalParsed = reconciliation.incomeCountParsed + reconciliation.expenseCountParsed;
    if (totalParsed > 10 && (reconciliation.incomeCountParsed < 2 || reconciliation.expenseCountParsed < 2)) {
      console.warn(`Lopsided results: ${reconciliation.incomeCountParsed} income, ${reconciliation.expenseCountParsed} expense — likely parsing error`);
    }
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
