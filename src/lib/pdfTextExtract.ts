// Spatial PDF text reconstruction utility
// Preserves column layout by detecting X-coordinate gaps between text items
// Uses tolerance-based Y-band clustering that adapts to font size

export interface TextItem {
  str: string;
  transform?: number[];
  width?: number;
  height?: number;
}

interface LineItem {
  x: number;
  y: number;
  text: string;
  width: number;
  height: number;
}

export type DocType = "bank_statement" | "w2" | "unknown";

/** Raw positioned item for structured extraction */
export interface RawPageItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageData {
  pageNum: number;
  width: number;
  height: number;
  items: RawPageItem[];
}

/** Column definition detected from headers */
export interface ColumnDef {
  name: string;
  xMin: number;
  xMax: number;
  xCenter: number;
}

/** Section boundary detected across pages */
export interface SectionBoundary {
  pageNum: number;
  y: number;
  type: "income" | "expense";
}

/** Pre-scan result for the entire document */
export interface DocumentPrescan {
  columns: ColumnDef[];
  sectionBoundaries: SectionBoundary[];
}

/** Statement summary extracted from summary pages */
export interface StatementSummary {
  depositTotal?: number;
  withdrawalTotal?: number;
  depositCount?: number;
  withdrawalCount?: number;
  beginningBalance?: number;
  endingBalance?: number;
}

/** Page classification */
export type PageType = "summary" | "transaction" | "legal" | "unknown";

/**
 * Extract raw positioned items from a pdf.js page's text content.
 */
export function extractRawItems(contentItems: any[], viewport?: { width: number; height: number }): PageData {
  const items: RawPageItem[] = [];
  for (const item of contentItems) {
    if (!("str" in item) || !item.str || !item.str.trim()) continue;
    items.push({
      str: item.str,
      x: item.transform?.[4] ?? 0,
      y: item.transform?.[5] ?? 0,
      width: item.width ?? item.str.length * 6,
      height: item.height ?? 12,
    });
  }
  return {
    pageNum: 0,
    width: viewport?.width ?? 612,
    height: viewport?.height ?? 792,
    items,
  };
}

// ─── Section detection patterns ─────────────────────────────────────────────

const DEPOSIT_PATTERNS: RegExp[] = [
  /\bdeposits?\s+and\s+(?:other\s+)?credits?\b/i,
  /\bdeposits?\s+and\s+additions\b/i,
  /\bdeposits?\s*[\/&]\s*credits?\b/i,
  /\bother\s+credits?\b/i,
  /\belectronic\s+deposits?\b/i,
  /\bdirect\s+deposits?\b/i,
  /\bdeposits?\s+(?:made|received|posted)\b/i,
  /\bcredits?\s+(?:and\s+)?deposits?\b/i,
  /\badditions\s+(?:and\s+)?deposits?\b/i,
  /\bmoney\s+in\b/i,
  /\bincoming\s+transactions?\b/i,
  /\bpayments?\s+(?:received|and\s+other\s+credits?)\b/i,
  /\bcredit\s+transactions?\b/i,
];

const WITHDRAWAL_PATTERNS: RegExp[] = [
  /\bwithdrawals?\s+and\s+(?:other\s+)?debits?\b/i,
  /\bwithdrawals?\s+and\s+(?:subtractions?|deductions?)\b/i,
  /\bwithdrawals?\s*[\/&]\s*debits?\b/i,
  /\bother\s+debits?\b/i,
  /\belectronic\s+withdrawals?\b/i,
  /\bpurchases?\s+and\s+adjustments?\b/i,
  /\bchecks?\s+paid\b/i,
  /\bchecks?\s+and\s+substitute\s+checks?\b/i,
  /\bdebit\s+card\s+(?:purchases?|transactions?)\b/i,
  /\batm\s+(?:and\s+)?(?:debit\s+card\s+)?(?:withdrawals?|transactions?)\b/i,
  /\bservice\s+(?:charges?|fees?)\b/i,
  /\bmoney\s+out\b/i,
  /\boutgoing\s+transactions?\b/i,
  /\bdebit\s+transactions?\b/i,
  /\bother\s+(?:withdrawals?|subtractions?)\b/i,
  /\bdaily\s+card\s+transactions?\b/i,
];

const ALL_SECTION_PATTERNS = [...DEPOSIT_PATTERNS, ...WITHDRAWAL_PATTERNS];

const HEADER_KEYWORDS: Record<string, string[]> = {
  date: ["date", "trans date", "post date", "posting date", "transaction date", "effective date"],
  description: ["description", "details", "memo", "payee", "merchant", "transaction description", "narrative"],
  debit: ["debit", "debits", "withdrawal", "withdrawals", "charges", "amount deducted", "purchases"],
  credit: ["credit", "credits", "deposit", "deposits", "amount added"],
  amount: ["amount", "transaction amount"],
  balance: ["balance", "running balance", "available balance", "ending balance", "closing balance"],
};

function isSectionHeaderText(text: string): boolean {
  const lower = text.toLowerCase().trim();
  for (const re of ALL_SECTION_PATTERNS) {
    if (re.test(lower)) return true;
  }
  return false;
}

function detectSectionTypeFromText(text: string): "income" | "expense" | null {
  for (const re of DEPOSIT_PATTERNS) {
    if (re.test(text)) return "income";
  }
  for (const re of WITHDRAWAL_PATTERNS) {
    if (re.test(text)) return "expense";
  }
  return null;
}

function groupItemsIntoRows(items: RawPageItem[]): { y: number; items: RawPageItem[] }[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: { y: number; items: RawPageItem[] }[] = [];
  let currentRow: RawPageItem[] = [sorted[0]];
  let bandY = sorted[0].y;
  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const tolerance = Math.max(item.height * 0.35, 2);
    if (Math.abs(item.y - bandY) <= tolerance) {
      currentRow.push(item);
    } else {
      rows.push({ y: bandY, items: [...currentRow].sort((a, b) => a.x - b.x) });
      currentRow = [item];
      bandY = item.y;
    }
  }
  rows.push({ y: bandY, items: [...currentRow].sort((a, b) => a.x - b.x) });
  return rows;
}

// ─── Page Classification ────────────────────────────────────────────────────

const LEGAL_PATTERNS = [
  /\bimportant\s+information\b/i,
  /\bterms\s+and\s+conditions\b/i,
  /\bdisclosure\b/i,
  /\bprivacy\s+(?:notice|policy)\b/i,
  /\bmember\s+fdic\b/i,
  /\bequal\s+(?:housing|opportunity)\b/i,
  /\b(?:©|copyright)\b/i,
  /\bnotice\s+to\s+customers?\b/i,
  /\bterms\s+of\s+(?:use|service)\b/i,
  /\bin\s+case\s+of\s+errors?\b/i,
  /\belectronic\s+fund\s+transfer\s+act\b/i,
];

const SUMMARY_PAGE_PATTERNS = [
  /\baccount\s+summary\b/i,
  /\bstatement\s+summary\b/i,
  /\bbeginning\s+balance\b/i,
  /\bending\s+balance\b/i,
  /\btotal\s+deposits?\b/i,
  /\btotal\s+withdrawals?\b/i,
  /\baccount\s+overview\b/i,
];

/**
 * Classify a page as summary, transaction, legal, or unknown.
 */
export function classifyPage(page: PageData): PageType {
  const allText = page.items.map((i) => i.str).join(" ");
  const lower = allText.toLowerCase();

  // Count signals
  let legalSignals = 0;
  let summarySignals = 0;
  let transactionSignals = 0;

  for (const re of LEGAL_PATTERNS) {
    if (re.test(lower)) legalSignals++;
  }
  for (const re of SUMMARY_PAGE_PATTERNS) {
    if (re.test(lower)) summarySignals++;
  }

  // Count date patterns (strong indicator of transaction page)
  const dateMatches = lower.match(/\d{1,2}[\/\-]\d{1,2}/g) || [];
  if (dateMatches.length >= 5) transactionSignals += 3;
  else if (dateMatches.length >= 2) transactionSignals += 1;

  // Count dollar amount patterns
  const amountMatches = lower.match(/\$?\d{1,3}(?:,\d{3})*\.\d{2}/g) || [];
  if (amountMatches.length >= 5) transactionSignals += 2;

  // Legal pages with few dates/amounts
  if (legalSignals >= 2 && transactionSignals < 2) return "legal";

  // Summary pages
  if (summarySignals >= 2 && transactionSignals < 3) return "summary";

  // Transaction pages have lots of dates and amounts
  if (transactionSignals >= 3) return "transaction";

  // If page has section headers, likely transaction-adjacent
  if (isSectionHeaderText(lower)) return "transaction";

  return "unknown";
}

// ─── Statement Summary Extraction ───────────────────────────────────────────

/**
 * Extract official totals/counts from summary pages.
 * Looks for patterns like "Total deposits: $92,786.53" or "26 deposits".
 */
export function extractStatementSummary(pages: PageData[]): StatementSummary {
  const summary: StatementSummary = {};
  const allText = pages.flatMap((p) => p.items.map((i) => i.str)).join(" ");

  // Extract total deposits
  const depositTotalMatch = allText.match(
    /(?:total\s+)?(?:deposits?\s+(?:and\s+(?:other\s+)?credits?|and\s+additions)?|additions\s+and\s+deposits?)\s*[:$]?\s*\$?\s*([\d,]+\.\d{2})/i
  );
  if (depositTotalMatch) {
    summary.depositTotal = parseFloat(depositTotalMatch[1].replace(/,/g, ""));
  }

  // Extract total withdrawals
  const withdrawalTotalMatch = allText.match(
    /(?:total\s+)?(?:withdrawals?\s+(?:and\s+(?:other\s+)?debits?|and\s+(?:subtractions?|deductions?))?|debits?\s+and\s+withdrawals?)\s*[:$]?\s*\$?\s*([\d,]+\.\d{2})/i
  );
  if (withdrawalTotalMatch) {
    summary.withdrawalTotal = parseFloat(withdrawalTotalMatch[1].replace(/,/g, ""));
  }

  // Extract deposit count
  const depositCountMatch = allText.match(/(\d+)\s+(?:deposits?|credits?|items?\s+(?:added|deposited))/i);
  if (depositCountMatch) {
    summary.depositCount = parseInt(depositCountMatch[1]);
  }

  // Extract withdrawal count
  const withdrawalCountMatch = allText.match(/(\d+)\s+(?:withdrawals?|debits?|checks?\s+(?:paid|cleared)|items?\s+(?:withdrawn|paid))/i);
  if (withdrawalCountMatch) {
    summary.withdrawalCount = parseInt(withdrawalCountMatch[1]);
  }

  // Beginning balance
  const beginMatch = allText.match(/(?:beginning|opening|previous)\s+balance\s*[:$]?\s*\$?\s*([\d,]+\.\d{2})/i);
  if (beginMatch) {
    summary.beginningBalance = parseFloat(beginMatch[1].replace(/,/g, ""));
  }

  // Ending balance
  const endMatch = allText.match(/(?:ending|closing|new)\s+balance\s*[:$]?\s*\$?\s*([\d,]+\.\d{2})/i);
  if (endMatch) {
    summary.endingBalance = parseFloat(endMatch[1].replace(/,/g, ""));
  }

  return summary;
}

// ─── Pre-scan ───────────────────────────────────────────────────────────────

/**
 * Pre-scan all pages to detect columns and section boundaries.
 */
export function prescanDocument(pages: PageData[]): DocumentPrescan {
  // Detect columns from all pages (not just first 3)
  const candidates: { name: string; x: number; width: number }[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      const lower = item.str.toLowerCase().trim();
      if (isSectionHeaderText(lower)) continue;
      for (const [colName, keywords] of Object.entries(HEADER_KEYWORDS)) {
        if (keywords.some((kw) => lower === kw || lower.startsWith(kw))) {
          candidates.push({ name: colName, x: item.x, width: item.width });
        }
      }
    }
  }

  const columns: ColumnDef[] = [];
  if (candidates.length > 0) {
    const byName = new Map<string, { x: number; width: number }[]>();
    for (const c of candidates) {
      if (!byName.has(c.name)) byName.set(c.name, []);
      byName.get(c.name)!.push({ x: c.x, width: c.width });
    }
    for (const [name, positions] of byName) {
      const avgX = positions.reduce((s, p) => s + p.x, 0) / positions.length;
      const avgW = positions.reduce((s, p) => s + p.width, 0) / positions.length;
      columns.push({
        name,
        xMin: avgX - 10,
        xMax: avgX + avgW + 10,
        xCenter: avgX + avgW / 2,
      });
    }
    columns.sort((a, b) => a.xCenter - b.xCenter);
  }

  // Detect section boundaries across ALL pages
  const sectionBoundaries: SectionBoundary[] = [];
  for (const page of pages) {
    const rows = groupItemsIntoRows(page.items);
    for (const row of rows) {
      const rowText = row.items.map((i) => i.str).join(" ");
      const sectionType = detectSectionTypeFromText(rowText);
      if (sectionType) {
        sectionBoundaries.push({ pageNum: page.pageNum, y: row.y, type: sectionType });
      }
    }
  }

  return { columns, sectionBoundaries };
}

/**
 * Given section boundaries from all pages, determine which section a chunk starts in.
 */
export function getInitialSectionForChunk(
  chunkStartPage: number,
  boundaries: SectionBoundary[],
): "income" | "expense" | null {
  let lastSection: "income" | "expense" | null = null;
  for (const b of boundaries) {
    if (b.pageNum < chunkStartPage) {
      lastSection = b.type;
    }
  }
  return lastSection;
}

/**
 * Detect document type from extracted text.
 */
export function detectDocType(fullText: string): DocType {
  const upper = fullText.toUpperCase();
  if (
    upper.includes("WAGE AND TAX STATEMENT") ||
    upper.includes("FORM W-2") ||
    upper.includes("W-2 WAGE")
  ) return "w2";

  if (
    upper.includes("ACCOUNT STATEMENT") ||
    upper.includes("STATEMENT OF ACCOUNT") ||
    upper.includes("BEGINNING BALANCE") ||
    upper.includes("ENDING BALANCE") ||
    upper.includes("AVAILABLE BALANCE") ||
    upper.includes("DEPOSITS AND ADDITIONS") ||
    upper.includes("WITHDRAWALS AND DEDUCTIONS") ||
    upper.includes("DEPOSITS AND OTHER CREDITS") ||
    upper.includes("WITHDRAWALS AND OTHER DEBITS") ||
    upper.includes("TRANSACTION DETAIL") ||
    upper.includes("PREVIOUS BALANCE") ||
    upper.includes("NEW BALANCE") ||
    upper.includes("PAYMENT DUE DATE") ||
    upper.includes("MINIMUM PAYMENT")
  ) return "bank_statement";

  return "unknown";
}

/**
 * Detect document type from raw page items.
 */
export function detectDocTypeFromItems(pages: PageData[]): DocType {
  const allText = pages.flatMap((p) => p.items.map((i) => i.str)).join(" ");
  return detectDocType(allText);
}

/**
 * Reconstructs text from PDF page content items, preserving spatial layout.
 */
export function reconstructPageText(items: TextItem[]): string {
  const lineItems: LineItem[] = [];
  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const x = item.transform?.[4] ?? 0;
    const y = item.transform?.[5] ?? 0;
    const width = item.width ?? item.str.length * 6;
    const height = item.height ?? 12;
    lineItems.push({ x, y, text: item.str, width, height });
  }
  if (lineItems.length === 0) return "";

  const sorted = [...lineItems].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; items: LineItem[] }[] = [];
  let currentBand: LineItem[] = [sorted[0]];
  let bandY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const tolerance = Math.max(item.height * 0.3, 2);
    if (Math.abs(item.y - bandY) <= tolerance) {
      currentBand.push(item);
    } else {
      lines.push({ y: bandY, items: [...currentBand] });
      currentBand = [item];
      bandY = item.y;
    }
  }
  lines.push({ y: bandY, items: [...currentBand] });

  const outputLines: string[] = [];
  for (const line of lines) {
    const sortedItems = [...line.items].sort((a, b) => a.x - b.x);
    let text = sortedItems[0].text;
    for (let i = 1; i < sortedItems.length; i++) {
      const prev = sortedItems[i - 1];
      const curr = sortedItems[i];
      const gap = curr.x - (prev.x + prev.width);
      if (gap > prev.height * 2) text += "    ";
      else if (gap > prev.height * 0.3) text += " ";
      text += curr.text;
    }
    outputLines.push(text.trimEnd());
  }

  return outputLines.join("\n");
}
