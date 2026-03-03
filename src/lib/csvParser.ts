import { ExpenseCategory, EXPENSE_CATEGORIES } from "@/types/tax";
import readXlsxFile from "read-excel-file/browser";

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  originalDescription: string;
}

/**
 * Robustly parse CSV/TSV text into transactions.
 * Handles: various separators, with/without headers, many date formats,
 * amount formats with parentheses for negatives, currency symbols, etc.
 */
export function parseCSV(csvText: string): ParsedTransaction[] {
  const raw = csvText.trim();
  if (!raw) return [];

  // Normalize line endings
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 1) return [];

  // Detect separator
  const separator = detectSeparator(lines[0]);

  // Parse all lines
  const allRows = lines.map((l) => parseCSVLine(l, separator));

  // Detect if first row is a header
  const { hasHeader, colMap } = detectColumns(allRows);

  const dataRows = hasHeader ? allRows.slice(1) : allRows;

  const transactions: ParsedTransaction[] = [];

  for (const cols of dataRows) {
    const result = extractTransaction(cols, colMap);
    if (result) transactions.push(result);
  }

  return transactions;
}

/**
 * Parse an Excel file (xlsx/xls) into transactions.
 * Reads the first sheet and converts rows to CSV text, then reuses parseCSV.
 */
export async function parseExcel(data: ArrayBuffer): Promise<ParsedTransaction[]> {
  const rows = await readXlsxFile(new Blob([data]));
  const csvText = rows.map(row => row.map(cell => {
    const val = cell === null || cell === undefined ? "" : String(cell);
    return val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
  }).join(",")).join("\n");
  return parseCSV(csvText);
}

// --- Separator Detection ---

function detectSeparator(firstLine: string): string {
  // Count potential separators outside quotes
  const counts: Record<string, number> = { ",": 0, "\t": 0, ";": 0, "|": 0 };
  let inQuotes = false;
  for (const char of firstLine) {
    if (char === '"') inQuotes = !inQuotes;
    if (!inQuotes && char in counts) counts[char]++;
  }
  // Pick the one with highest count (minimum 1)
  let best = ",";
  let bestCount = 0;
  for (const [sep, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = sep;
      bestCount = count;
    }
  }
  return best;
}

// --- Column Detection ---

interface ColMap {
  dateIdx: number;
  descIdx: number;
  amountIdx: number;
  debitIdx: number;
  creditIdx: number;
  balanceIdx: number;
}

const DATE_HEADER_WORDS = ["date", "posted", "transaction date", "trans date", "posting date", "trade date", "effective date", "settlement date", "value date"];
const DESC_HEADER_WORDS = ["description", "memo", "payee", "name", "details", "narrative", "particulars", "reference", "transaction", "merchant", "vendor"];
const AMOUNT_HEADER_WORDS = ["amount", "sum", "value", "total"];
const DEBIT_HEADER_WORDS = ["debit", "withdrawal", "withdrawals", "charges", "payment", "money out", "out"];
const CREDIT_HEADER_WORDS = ["credit", "deposit", "deposits", "money in", "in"];
const BALANCE_HEADER_WORDS = ["balance", "running balance", "closing balance"];

function matchesAny(header: string, words: string[]): boolean {
  const h = header.toLowerCase().trim();
  return words.some((w) => h === w || h.includes(w));
}

function detectColumns(allRows: string[][]): { hasHeader: boolean; colMap: ColMap } {
  if (allRows.length < 2) {
    return { hasHeader: false, colMap: guessColumnsFromData(allRows) };
  }

  const firstRow = allRows[0];
  const headers = firstRow.map((h) => h.toLowerCase().trim());

  // Check if first row looks like a header (contains known header words)
  const dateIdx = headers.findIndex((h) => matchesAny(h, DATE_HEADER_WORDS));
  const descIdx = headers.findIndex((h) => matchesAny(h, DESC_HEADER_WORDS));
  const amountIdx = headers.findIndex((h) => matchesAny(h, AMOUNT_HEADER_WORDS) && !matchesAny(h, DEBIT_HEADER_WORDS) && !matchesAny(h, CREDIT_HEADER_WORDS));
  const debitIdx = headers.findIndex((h) => matchesAny(h, DEBIT_HEADER_WORDS));
  const creditIdx = headers.findIndex((h) => matchesAny(h, CREDIT_HEADER_WORDS));
  const balanceIdx = headers.findIndex((h) => matchesAny(h, BALANCE_HEADER_WORDS));

  // If we found at least a date column, treat as header
  if (dateIdx !== -1) {
    return {
      hasHeader: true,
      colMap: {
        dateIdx,
        descIdx: descIdx !== -1 ? descIdx : -1,
        amountIdx,
        debitIdx,
        creditIdx,
        balanceIdx,
      },
    };
  }

  // Check if first row contains any parseable date (if so, it's data not header)
  const firstRowHasDate = firstRow.some((cell) => normalizeDate(cell.trim()) !== null);
  if (firstRowHasDate) {
    return { hasHeader: false, colMap: guessColumnsFromData(allRows) };
  }

  // Last resort: if first row has no numbers but second row does, it's a header
  const firstRowHasNum = firstRow.some((cell) => parseAmount(cell) !== 0);
  const secondRowHasNum = allRows[1]?.some((cell) => parseAmount(cell) !== 0);
  if (!firstRowHasNum && secondRowHasNum) {
    // Treat as header even without recognized names — guess by position
    return { hasHeader: true, colMap: guessColumnsFromData(allRows.slice(1)) };
  }

  return { hasHeader: false, colMap: guessColumnsFromData(allRows) };
}

function guessColumnsFromData(rows: string[][]): ColMap {
  if (rows.length === 0) return { dateIdx: -1, descIdx: -1, amountIdx: -1, debitIdx: -1, creditIdx: -1, balanceIdx: -1 };

  const numCols = Math.max(...rows.slice(0, 10).map((r) => r.length));
  const colScores = Array.from({ length: numCols }, () => ({
    dateScore: 0,
    numScore: 0,
    textScore: 0,
  }));

  const sample = rows.slice(0, 10);
  for (const row of sample) {
    for (let i = 0; i < numCols; i++) {
      const cell = (row[i] || "").trim();
      if (!cell) continue;
      if (normalizeDate(cell) !== null) colScores[i].dateScore++;
      else if (parseAmount(cell) !== 0 || /^[\$€£\-\(]?\s*\d/.test(cell)) colScores[i].numScore++;
      else colScores[i].textScore++;
    }
  }

  let dateIdx = -1;
  let bestDate = 0;
  colScores.forEach((s, i) => {
    if (s.dateScore > bestDate) { bestDate = s.dateScore; dateIdx = i; }
  });

  let descIdx = -1;
  let bestText = 0;
  colScores.forEach((s, i) => {
    if (i !== dateIdx && s.textScore > bestText) { bestText = s.textScore; descIdx = i; }
  });

  const numericCols = colScores
    .map((s, i) => ({ i, score: s.numScore }))
    .filter((c) => c.i !== dateIdx && c.i !== descIdx && c.score > 0)
    .sort((a, b) => b.score - a.score);

  // Detect running balance column from data patterns
  let balanceIdx = -1;
  if (numericCols.length >= 2 && sample.length >= 3) {
    balanceIdx = detectBalanceColumnFromData(numericCols.map((c) => c.i), sample);
  }

  const filteredNumeric = numericCols.filter((c) => c.i !== balanceIdx);

  let amountIdx = -1;
  let debitIdx = -1;
  let creditIdx = -1;

  if (filteredNumeric.length === 1) {
    amountIdx = filteredNumeric[0].i;
  } else if (filteredNumeric.length >= 2) {
    debitIdx = filteredNumeric[0].i;
    creditIdx = filteredNumeric[1].i;
  }

  return { dateIdx, descIdx, amountIdx, debitIdx, creditIdx, balanceIdx };
}

/**
 * Detect a running balance column: it tends to be monotonic or have the
 * largest average absolute values (cumulative sums vs individual amounts).
 */
function detectBalanceColumnFromData(numericColIndices: number[], sample: string[][]): number {
  if (numericColIndices.length < 2) return -1;

  const colStats = numericColIndices.map((colIdx) => {
    const values = sample.map((row) => parseAmount(row[colIdx])).filter((v) => v !== 0);
    const avgAbs = values.length > 0 ? values.reduce((s, v) => s + Math.abs(v), 0) / values.length : 0;
    let monotonic = values.length >= 3;
    if (monotonic) {
      let inc = true, dec = true;
      for (let i = 1; i < values.length; i++) {
        if (values[i] < values[i - 1]) inc = false;
        if (values[i] > values[i - 1]) dec = false;
      }
      monotonic = inc || dec;
    }
    return { colIdx, avgAbs, monotonic, count: values.length };
  });

  // Monotonic column among non-monotonic ones → likely balance
  const mono = colStats.filter((s) => s.monotonic && s.count >= 3);
  const nonMono = colStats.filter((s) => !s.monotonic);
  if (mono.length === 1 && nonMono.length >= 1) return mono[0].colIdx;

  // Column with 2x+ larger average absolute value → likely cumulative balance
  const sorted = [...colStats].sort((a, b) => b.avgAbs - a.avgAbs);
  if (sorted.length >= 2 && sorted[0].avgAbs > sorted[1].avgAbs * 2 && sorted[0].count >= 2) {
    return sorted[0].colIdx;
  }

  return -1;
}

// --- Transaction Extraction ---

function extractTransaction(cols: string[], colMap: ColMap): ParsedTransaction | null {
  // Try to find a date
  let date: string | null = null;
  if (colMap.dateIdx !== -1) {
    date = normalizeDate((cols[colMap.dateIdx] || "").trim());
  }
  // If no date from mapped column, scan all columns
  if (!date) {
    for (const cell of cols) {
      date = normalizeDate(cell.trim());
      if (date) break;
    }
  }
  if (!date) return null;

  // Description
  let description = "Unknown";
  if (colMap.descIdx !== -1) {
    description = (cols[colMap.descIdx] || "").trim() || "Unknown";
  } else {
    // Use the longest non-date, non-numeric cell
    let longest = "";
    for (let i = 0; i < cols.length; i++) {
      const cell = cols[i].trim();
      if (cell.length > longest.length && normalizeDate(cell) === null && parseAmount(cell) === 0 && !/^[\$€£\-\(]?\s*[\d,.]/.test(cell)) {
        longest = cell;
      }
    }
    if (longest) description = longest;
  }

  // Amount
  let amount = 0;
  let type: "income" | "expense" = "expense";

  if (colMap.amountIdx !== -1) {
    amount = parseAmount(cols[colMap.amountIdx]);
    type = amount >= 0 ? "income" : "expense";
    amount = Math.abs(amount);
  } else if (colMap.debitIdx !== -1 || colMap.creditIdx !== -1) {
    const debit = colMap.debitIdx !== -1 ? parseAmount(cols[colMap.debitIdx]) : 0;
    const credit = colMap.creditIdx !== -1 ? parseAmount(cols[colMap.creditIdx]) : 0;
    if (Math.abs(credit) > 0 && Math.abs(debit) === 0) {
      amount = Math.abs(credit);
      type = "income";
    } else if (Math.abs(debit) > 0) {
      amount = Math.abs(debit);
      type = "expense";
    }
  } else {
    // No mapped amount column — find the first numeric value in the row (skip balance)
    for (let i = 0; i < cols.length; i++) {
      if (i === colMap.dateIdx || i === colMap.descIdx || i === colMap.balanceIdx) continue;
      const val = parseAmount(cols[i]);
      if (val !== 0) {
        amount = Math.abs(val);
        type = val >= 0 ? "income" : "expense";
        break;
      }
    }
  }

  if (amount === 0) return null;

  // Filter out non-transaction rows (balance statements, headers, totals, etc.)
  if (isNonTransactionRow(description)) return null;

  return {
    date,
    description: cleanDescription(description),
    amount,
    type,
    originalDescription: description,
  };
}

// --- CSV Line Parser ---

function parseCSVLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// --- Amount Parsing ---

function parseAmount(str: string | undefined): number {
  if (!str) return 0;
  const trimmed = str.trim();
  if (!trimmed) return 0;

  // Detect negative from parentheses: (1,234.56)
  const isParensNegative = /^\(.*\)$/.test(trimmed);

  // Remove currency symbols, spaces, parentheses
  let cleaned = trimmed.replace(/[£€$¥₹\s()]/g, "");

  // Handle European format: 1.234,56 → 1234.56
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // Handle commas as thousand separators: 1,234.56
    cleaned = cleaned.replace(/,/g, "");
  }

  // Keep only digits, dots, minus
  cleaned = cleaned.replace(/[^0-9.\-]/g, "");

  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return isParensNegative ? -Math.abs(num) : num;
}

// --- Date Normalization ---

function normalizeDate(dateStr: string): string | null {
  if (!dateStr || dateStr.length < 4) return null;

  // Strip surrounding quotes
  let s = dateStr.replace(/^["']|["']$/g, "").trim();

  // ISO: 2026-01-15 or 2026-01-15T...
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;

  // MM/DD/YYYY or M/D/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;

  // DD/MM/YYYY (European) — ambiguous, try US first via Date.parse later
  // MM-DD-YYYY
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;

  // DD.MM.YYYY (European)
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;

  // YYYY/MM/DD
  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;

  // DD MMM YYYY or MMM DD, YYYY (e.g. "15 Jan 2026", "Jan 15, 2026")
  m = s.match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s,]+(\d{4})$/i);
  if (m) {
    const month = monthNameToNum(m[2]);
    if (month) return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
  }
  m = s.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s.]+(\d{1,2})[\s,]+(\d{4})$/i);
  if (m) {
    const month = monthNameToNum(m[1]);
    if (month) return `${m[3]}-${month}-${m[2].padStart(2, "0")}`;
  }

  // MM/DD/YY or M/D/YY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m) {
    const yr = parseInt(m[3]) > 50 ? `19${m[3]}` : `20${m[3]}`;
    return `${yr}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }

  // YYYYMMDD
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // Fallback: Date.parse
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1990 && parsed.getFullYear() < 2100) {
    return parsed.toISOString().split("T")[0];
  }

  return null;
}

const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function monthNameToNum(name: string): string | null {
  return MONTH_MAP[name.toLowerCase().slice(0, 3)] || null;
}

// --- Non-Transaction Row Detection ---

const NON_TRANSACTION_PATTERNS = [
  /\b(beginning|opening|starting|closing|ending)\s+(balance|bal)\b/i,
  /\btotal\s*(debits?|credits?|charges?|deposits?|withdrawals?|payments?)?\s*$/i,
  /\b(statement|account)\s+(summary|period|ending|opening|closing)\b/i,
  /\b(page|continued|subtotal)\b/i,
  /^\s*(balance\s+forward|brought?\s+forward|carried?\s+forward)\s*$/i,
  /\b(as\s+of|through)\s+\d/i,
  /^\s*-{3,}\s*$/,
  /^\s*(grand\s+)?total\s*$/i,
  /\bavailable\s+(balance|credit)\b/i,
  /\b(minimum|previous|new)\s+balance\b/i,
  /\bbalance\s+as\s+of\b/i,
];

function isNonTransactionRow(description: string): boolean {
  const d = description.trim();
  if (!d || d.length < 2) return true;
  return NON_TRANSACTION_PATTERNS.some((p) => p.test(d));
}

// --- Description Cleaning ---

function cleanDescription(desc: string): string {
  return desc
    .replace(/\s+/g, " ")
    .replace(/^(POS|ACH|DEBIT|CREDIT|CHK|WIRE|XFER|EFT|PMT|TFR|INT|FEE|ATM|WDL|DEP)\s*/i, "")
    .trim();
}

// Simple keyword-based auto-categorization (kept for backward compat)
const CATEGORY_KEYWORDS: Record<ExpenseCategory, string[]> = {
  "Office Supplies": ["staples", "office depot", "officemax", "amazon", "paper"],
  "Travel": ["airline", "delta", "united", "american air", "southwest", "uber", "lyft", "hotel", "airbnb", "hertz", "enterprise"],
  "Software & SaaS": ["aws", "google cloud", "azure", "figma", "slack", "zoom", "adobe", "github", "notion", "dropbox", "microsoft 365"],
  "Marketing": ["google ads", "facebook ads", "meta ads", "mailchimp", "hubspot", "canva"],
  "Professional Services": ["law", "legal", "attorney", "consultant", "accounting", "cpa"],
  "Utilities": ["comcast", "verizon", "at&t", "electric", "water", "internet", "phone"],
  "Insurance": ["insurance", "geico", "state farm", "allstate", "aetna", "cigna"],
  "Meals & Entertainment": ["restaurant", "doordash", "grubhub", "uber eats", "starbucks", "coffee"],
  "Equipment": ["apple store", "dell", "lenovo", "best buy", "newegg"],
  "Rent": ["rent", "lease", "wework", "regus"],
  "Payroll": ["payroll", "gusto", "adp", "paychex"],
  "Vehicle & Gas": ["shell", "exxon", "chevron", "bp", "mobil", "gas", "fuel", "gasoline", "petroleum", "sunoco", "marathon", "speedway", "wawa", "quiktrip"],
  "Vehicle Maintenance": ["jiffy lube", "midas", "firestone", "goodyear", "autozone", "o'reilly", "napa", "pep boys", "valvoline", "tire", "oil change"],
  "Contract Labor": ["subcontract", "freelance", "1099", "contract labor"],
  "Repairs & Maintenance": ["repair", "maintenance", "plumber", "electrician", "handyman", "hvac"],
  "Taxes & Licenses": ["license", "permit", "tax payment", "franchise tax", "state tax", "city tax"],
  "Interest & Bank Fees": ["interest", "bank fee", "overdraft", "finance charge", "annual fee", "monthly fee", "service charge"],
  "Supplies & Materials": ["home depot", "lowes", "lowe's", "menards", "lumber", "hardware", "materials", "supply"],
  "Shipping & Postage": ["usps", "ups", "fedex", "dhl", "postage", "shipping", "stamps"],
  "Education & Training": ["udemy", "coursera", "seminar", "workshop", "training", "certification", "conference"],
  "Commissions & Fees": ["stripe", "square", "paypal fee", "processing fee", "commission", "platform fee", "merchant fee"],
  "Home Office": ["home office"],
  "Other": [],
};

export function autoCategorize(description: string): ExpenseCategory {
  const lower = description.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category === "Other") continue;
    if (keywords.some((kw) => lower.includes(kw))) {
      return category as ExpenseCategory;
    }
  }
  return "Other";
}
