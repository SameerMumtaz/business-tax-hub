// Deterministic-First Bank Statement Parser + AI Rescue + W-2 Parser
// Primary path: geometry-based row parsing with x-band column assignment
// AI used ONLY as rescue for unresolved rows
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type TxType = "income" | "expense";

interface ParsedTx {
  date: string;
  description: string;
  amount: number;
  type: TxType;
}

interface RawItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PagePayload {
  pageNum: number;
  width: number;
  height: number;
  items: RawItem[];
}

interface ColumnDef {
  name: string;
  xMin: number;
  xMax: number;
  xCenter: number;
}

interface ParseStats {
  incomeTotal: number;
  expenseTotal: number;
  incomeCount: number;
  expenseCount: number;
}

// ─── Section Detection (bank-agnostic, comprehensive) ───────────────────────

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
  /\bfunds?\s+(?:received|added|deposited)\b/i,
  /\bpayments?\s+(?:received|and\s+other\s+credits?)\b/i,
  /\btransaction\s+credits?\b/i,
  /\bcredit\s+transactions?\b/i,
  /\bpositive\s+transactions?\b/i,
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
  /\bchecks?\s+(?:cleared|cashed|written)\b/i,
  /\bdebit\s+card\s+(?:purchases?|transactions?)\b/i,
  /\bcard\s+transactions?\b/i,
  /\batm\s+(?:and\s+)?(?:debit\s+card\s+)?(?:withdrawals?|transactions?)\b/i,
  /\bonline\s+(?:and\s+)?(?:electronic\s+)?(?:banking\s+)?transactions?\b/i,
  /\bservice\s+(?:charges?|fees?)\b/i,
  /\bfees?\s+(?:and\s+)?(?:service\s+)?charges?\b/i,
  /\bmoney\s+out\b/i,
  /\boutgoing\s+transactions?\b/i,
  /\bfunds?\s+(?:withdrawn|removed|paid)\b/i,
  /\bpayments?\s+(?:made|sent)\b/i,
  /\bpoint\s+of\s+sale\b/i,
  /\bdebit\s+transactions?\b/i,
  /\bnegative\s+transactions?\b/i,
  /\bother\s+(?:withdrawals?|subtractions?)\b/i,
  /\bdaily\s+card\s+transactions?\b/i,
];

const SUMMARY_SECTION_RE = /\b(daily\s+(?:ledger\s+)?balance|account\s+summary|statement\s+summary|balance\s+summary|transaction\s+summary|interest\s+(?:charged|earned|summary)|rewards?\s+summary|year.to.date\s+totals?)\b/i;

function detectSectionType(text: string): "income" | "expense" | "summary" | null {
  if (SUMMARY_SECTION_RE.test(text)) return "summary";
  for (const re of DEPOSIT_PATTERNS) { if (re.test(text)) return "income"; }
  for (const re of WITHDRAWAL_PATTERNS) { if (re.test(text)) return "expense"; }
  return null;
}

// ─── Column Detection ────────────────────────────────────────────────────────

const HEADER_KEYWORDS: Record<string, string[]> = {
  date: ["date", "trans date", "post date", "posting date", "transaction date", "effective date"],
  description: ["description", "details", "memo", "payee", "merchant", "transaction description", "narrative"],
  debit: ["debit", "debits", "withdrawal", "withdrawals", "charges", "amount deducted", "purchases"],
  credit: ["credit", "credits", "deposit", "deposits", "amount added"],
  amount: ["amount", "transaction amount"],
  balance: ["balance", "running balance", "available balance", "ending balance", "closing balance"],
};

const ALL_SECTION_PATTERNS = [...DEPOSIT_PATTERNS, ...WITHDRAWAL_PATTERNS];

function isSectionHeader(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (SUMMARY_SECTION_RE.test(lower)) return true;
  for (const re of ALL_SECTION_PATTERNS) { if (re.test(lower)) return true; }
  return false;
}

function detectColumns(pages: PagePayload[]): ColumnDef[] {
  const candidates: { name: string; x: number; width: number }[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      const lower = item.str.toLowerCase().trim();
      if (isSectionHeader(lower)) continue;
      for (const [colName, keywords] of Object.entries(HEADER_KEYWORDS)) {
        if (keywords.some((kw) => lower === kw || lower.startsWith(kw))) {
          candidates.push({ name: colName, x: item.x, width: item.width });
        }
      }
    }
  }
  if (candidates.length === 0) return [];

  const byName = new Map<string, { x: number; width: number }[]>();
  for (const c of candidates) {
    if (!byName.has(c.name)) byName.set(c.name, []);
    byName.get(c.name)!.push({ x: c.x, width: c.width });
  }

  const columns: ColumnDef[] = [];
  for (const [name, positions] of byName) {
    const avgX = positions.reduce((s, p) => s + p.x, 0) / positions.length;
    const avgW = positions.reduce((s, p) => s + p.width, 0) / positions.length;
    columns.push({ name, xMin: avgX - 10, xMax: avgX + avgW + 10, xCenter: avgX + avgW / 2 });
  }
  columns.sort((a, b) => a.xCenter - b.xCenter);
  return columns;
}

/** Compute non-overlapping x-bands from column definitions */
function computeBands(columns: ColumnDef[], pageWidth: number): ColumnDef[] {
  if (columns.length === 0) return [];
  const sorted = [...columns].sort((a, b) => a.xCenter - b.xCenter);
  return sorted.map((col, i) => {
    const leftBound = i > 0 ? (sorted[i - 1].xCenter + col.xCenter) / 2 : 0;
    const rightBound = i < sorted.length - 1 ? (col.xCenter + sorted[i + 1].xCenter) / 2 : pageWidth;
    return { ...col, xMin: leftBound, xMax: rightBound };
  });
}

// ─── Row Grouping ────────────────────────────────────────────────────────────

interface Row { y: number; items: RawItem[]; }

function groupIntoRows(items: RawItem[]): Row[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Row[] = [];
  let currentRow: RawItem[] = [sorted[0]];
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

// ─── Junk / Repeated Header Detection ───────────────────────────────────────

const JUNK_RE = /\b(subtotal|total\s+(?:for|deposits|withdrawals|debits|credits|checks)|(?:beginning|ending|closing|opening)\s+balance|daily.*balance|account\s+ending|statement\s+period|page\s+\d+\s+of\s+\d+|continued|account\s+number|member\s+fdic)\b/i;

function detectRepeatedHeaders(pages: PagePayload[]): Set<string> {
  const topTexts = new Map<string, number>();
  const bottomTexts = new Map<string, number>();
  for (const page of pages) {
    for (const item of page.items) {
      const norm = item.str.trim().toLowerCase();
      if (norm.length < 3) continue;
      if (item.y > page.height * 0.85) topTexts.set(norm, (topTexts.get(norm) || 0) + 1);
      if (item.y < page.height * 0.15) bottomTexts.set(norm, (bottomTexts.get(norm) || 0) + 1);
    }
  }
  const repeated = new Set<string>();
  const threshold = Math.max(2, Math.ceil(pages.length * 0.5));
  for (const [text, count] of topTexts) { if (count >= threshold) repeated.add(text); }
  for (const [text, count] of bottomTexts) { if (count >= threshold) repeated.add(text); }
  return repeated;
}

// ─── Deterministic Parser (PRIMARY) ─────────────────────────────────────────

const DATE_RE = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/;
const AMOUNT_RE = /^\$?\s*-?\(?\s*(\d{1,3}(?:,\d{3})*\.?\d{0,2})\s*\)?$/;
const AMOUNT_LOOSE_RE = /\$?\s*-?\(?\s*(\d{1,3}(?:,\d{3})*\.\d{2})\s*\)?/;

function parseAmountStr(str: string): number | null {
  const cleaned = str.replace(/[\s$,]/g, "").replace(/[()]/g, "");
  if (!cleaned) return null;
  const val = parseFloat(cleaned);
  return isNaN(val) || val <= 0 ? null : Math.abs(val);
}

function assignItemToColumn(item: RawItem, bands: ColumnDef[]): string {
  const center = item.x + item.width / 2;
  // Check if item falls within a band
  for (const band of bands) {
    if (center >= band.xMin && center <= band.xMax) return band.name;
  }
  // Fallback: nearest center
  let best = "unknown";
  let bestDist = Infinity;
  for (const band of bands) {
    const dist = Math.abs(center - band.xCenter);
    if (dist < bestDist) { bestDist = dist; best = band.name; }
  }
  return best;
}

function isNumericItem(str: string): boolean {
  return /^\s*\$?\s*-?\(?\s*[\d,]+\.?\d*\s*\)?\s*$/.test(str.trim());
}

function deterministicParse(
  pages: PagePayload[],
  columns: ColumnDef[],
  initialSection: TxType | null,
): { transactions: ParsedTx[]; stats: ParseStats; unresolvedCount: number } {
  const pageWidth = pages[0]?.width || 612;
  const bands = computeBands(columns, pageWidth);
  const repeatedHeaders = detectRepeatedHeaders(pages);

  const hasDebitCol = columns.some(c => c.name === "debit");
  const hasCreditCol = columns.some(c => c.name === "credit");
  const hasAmountCol = columns.some(c => c.name === "amount");
  const hasBalanceCol = columns.some(c => c.name === "balance");

  // Infer year from statement
  const allText = pages.flatMap(p => p.items.map(i => i.str)).join(" ");
  const yearMatch = allText.match(/(?:statement|through|ending|period)[:\s]*\d{1,2}[\/\-]\d{1,2}[\/\-](\d{4})/i);
  const defaultYear = yearMatch?.[1] || new Date().getFullYear().toString();

  const transactions: ParsedTx[] = [];
  let currentSection: TxType | null = initialSection;
  let unresolvedCount = 0;
  let inSummarySection = false;

  // Pending transaction for multi-line stitching
  let pending: { date: string; desc: string; amount: number; type: TxType } | null = null;

  const flushPending = () => {
    if (pending && pending.amount > 0 && pending.desc.length >= 2) {
      transactions.push({
        date: pending.date,
        description: pending.desc.replace(/\s+/g, " ").trim(),
        amount: pending.amount,
        type: pending.type,
      });
    }
    pending = null;
  };

  for (const page of pages) {
    // Filter repeated headers/footers
    const filteredItems = page.items.filter(item => {
      const norm = item.str.trim().toLowerCase();
      return !repeatedHeaders.has(norm);
    });

    const rows = groupIntoRows(filteredItems);

    for (const row of rows) {
      const rowText = row.items.map(i => i.str).join(" ");

      // Section detection
      const sectionType = detectSectionType(rowText);
      if (sectionType) {
        if (sectionType === "summary") {
          flushPending();
          inSummarySection = true;
          continue;
        }
        flushPending();
        inSummarySection = false;
        currentSection = sectionType;
        continue;
      }

      if (inSummarySection) continue;
      if (JUNK_RE.test(rowText)) continue;
      if (row.items.length < 2) continue;

      // Skip column header rows
      const firstStr = row.items[0]?.str?.trim().toLowerCase() || "";
      if (/^\s*(date|trans\s*date|post\s*date|posting\s*date)\s*$/i.test(firstStr)) continue;

      // Assign items to column bands
      const cells: Record<string, string> = {};
      for (const col of columns) cells[col.name] = "";

      for (const item of row.items) {
        const colName = assignItemToColumn(item, bands);
        // Numeric items should NOT go to description column
        if (colName === "description" && isNumericItem(item.str) && (hasDebitCol || hasCreditCol || hasAmountCol)) {
          // Try to assign to nearest numeric column instead
          const numericBands = bands.filter(b => ["debit", "credit", "amount", "balance"].includes(b.name));
          if (numericBands.length > 0) {
            const center = item.x + item.width / 2;
            let nearest = numericBands[0].name;
            let nearestDist = Math.abs(center - numericBands[0].xCenter);
            for (const nb of numericBands.slice(1)) {
              const d = Math.abs(center - nb.xCenter);
              if (d < nearestDist) { nearestDist = d; nearest = nb.name; }
            }
            if (cells[nearest]) cells[nearest] += " " + item.str.trim();
            else cells[nearest] = item.str.trim();
            continue;
          }
        }
        if (cells[colName] !== undefined) {
          if (cells[colName]) cells[colName] += " " + item.str.trim();
          else cells[colName] = item.str.trim();
        }
      }

      // Check for date
      const dateStr = cells["date"] || "";
      const dateMatch = dateStr.match(DATE_RE);

      if (dateMatch) {
        // New transaction - flush previous
        flushPending();

        const mm = dateMatch[1].padStart(2, "0");
        const dd = dateMatch[2].padStart(2, "0");
        const yy = dateMatch[3]
          ? (dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3])
          : defaultYear;

        const desc = (cells["description"] || "").trim();

        // Extract amount and determine type
        let amount = 0;
        let txType: TxType = currentSection || "expense";

        if (hasDebitCol && hasCreditCol) {
          // Separate debit/credit columns
          const debitAmt = parseAmountStr(cells["debit"] || "");
          const creditAmt = parseAmountStr(cells["credit"] || "");
          if (debitAmt && debitAmt > 0) {
            amount = debitAmt;
            txType = "expense";
          } else if (creditAmt && creditAmt > 0) {
            amount = creditAmt;
            txType = "income";
          } else if (hasAmountCol) {
            const amtVal = parseAmountStr(cells["amount"] || "");
            if (amtVal) { amount = amtVal; txType = currentSection || "expense"; }
          }
        } else if (currentSection) {
          // Section-based layout (e.g., BoA)
          // Try amount column, then debit, then credit
          const candidates = [cells["amount"], cells["debit"], cells["credit"]].filter(Boolean);
          for (const c of candidates) {
            const val = parseAmountStr(c!);
            if (val && val > 0) { amount = val; break; }
          }
          // If still no amount, scan all non-date, non-description, non-balance cells
          if (amount <= 0) {
            for (const [colName, cellVal] of Object.entries(cells)) {
              if (["date", "description", "balance"].includes(colName)) continue;
              const val = parseAmountStr(cellVal);
              if (val && val > 0) { amount = val; break; }
            }
          }
          txType = currentSection;
        } else if (hasAmountCol) {
          const amtVal = parseAmountStr(cells["amount"] || "");
          if (amtVal) {
            amount = amtVal;
            const isDeposit = /(deposit|credit|refund|payment received|transfer from|direct dep|payroll|interest earned)/i.test(desc);
            txType = isDeposit ? "income" : "expense";
          }
        } else {
          // No recognized amount columns - scan all numeric cells except balance
          for (const [colName, cellVal] of Object.entries(cells)) {
            if (colName === "date" || colName === "description" || colName === "balance") continue;
            const val = parseAmountStr(cellVal);
            if (val && val > 0) { amount = val; break; }
          }
        }

        if (amount > 0 && desc.length >= 2) {
          pending = { date: `${yy}-${mm}-${dd}`, desc, amount, type: txType };
        } else if (desc.length >= 2) {
          // Has date and description but no amount - might resolve with continuation lines
          pending = { date: `${yy}-${mm}-${dd}`, desc, amount: 0, type: txType };
          unresolvedCount++;
        }
      } else {
        // No date - check if this is a continuation line
        const descText = (cells["description"] || "").trim();
        if (pending && descText && !isNumericItem(descText)) {
          // Append to pending description
          pending.desc += " " + descText;

          // Check if continuation line has an amount (some statements put amount on second line)
          if (pending.amount <= 0) {
            for (const [colName, cellVal] of Object.entries(cells)) {
              if (colName === "date" || colName === "description" || colName === "balance") continue;
              const val = parseAmountStr(cellVal);
              if (val && val > 0) { pending.amount = val; unresolvedCount--; break; }
            }
          }
        }
      }
    }
  }

  // Flush final pending transaction
  flushPending();

  // Calculate stats
  let incomeTotal = 0, expenseTotal = 0, incomeCount = 0, expenseCount = 0;
  for (const tx of transactions) {
    if (tx.type === "income") { incomeTotal += tx.amount; incomeCount++; }
    else { expenseTotal += tx.amount; expenseCount++; }
  }

  return {
    transactions,
    stats: { incomeTotal, expenseTotal, incomeCount, expenseCount },
    unresolvedCount,
  };
}

// ─── AI Rescue Parser (fallback only) ───────────────────────────────────────

function reconstructTextFromPages(pages: PagePayload[]): string {
  const pageTexts: string[] = [];
  for (const page of pages) {
    const rows = groupIntoRows(page.items);
    const lines: string[] = [];
    for (const row of rows) {
      let text = "";
      for (let i = 0; i < row.items.length; i++) {
        if (i > 0) {
          const prev = row.items[i - 1];
          const curr = row.items[i];
          const gap = curr.x - (prev.x + prev.width);
          if (gap > prev.height * 2) text += "    ";
          else if (gap > prev.height * 0.3) text += " ";
        }
        text += row.items[i].str;
      }
      lines.push(text.trimEnd());
    }
    pageTexts.push(lines.join("\n"));
  }
  return pageTexts.join("\n\n--- PAGE BREAK ---\n\n");
}

async function aiRescueParse(text: string, sectionContext: TxType | null): Promise<ParsedTx[]> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const sectionHint = sectionContext
    ? `\nCONTEXT: These transactions are from the ${sectionContext === "income" ? "DEPOSITS/CREDITS" : "WITHDRAWALS/DEBITS"} section. Classify all as type="${sectionContext}" unless clearly otherwise.`
    : "";

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        {
          role: "system",
          content: `You are a financial data extraction engine. Extract transactions from bank statement text.${sectionHint}
Rules:
- deposits/credits/refunds = type "income"
- withdrawals/debits/purchases/fees = type "expense"
- amount must be a positive number
- Clean merchant names (remove reference numbers, card masks)
- IGNORE subtotals, running balances, summaries, page headers/footers
- Date format: YYYY-MM-DD`,
        },
        { role: "user", content: text },
      ],
      tools: [{
        type: "function",
        function: {
          name: "extract_transactions",
          description: "Extract financial transactions. Skip subtotals, balances, summaries.",
          parameters: {
            type: "object",
            properties: {
              transactions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    date: { type: "string" },
                    description: { type: "string" },
                    amount: { type: "number" },
                    type: { type: "string", enum: ["income", "expense"] },
                  },
                  required: ["date", "description", "amount", "type"],
                },
              },
            },
            required: ["transactions"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "extract_transactions" } },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 429) throw new Error("RATE_LIMITED");
    if (response.status === 402) throw new Error("PAYMENT_REQUIRED");
    throw new Error(`AI gateway error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) return [];

  try {
    const parsed = JSON.parse(toolCall.function.arguments);
    return (parsed.transactions || [])
      .filter((t: ParsedTx) => t.date && t.description && t.amount > 0)
      .map((t: ParsedTx) => ({
        date: t.date,
        description: t.description.trim(),
        amount: Math.abs(t.amount),
        type: t.type === "income" ? "income" as TxType : "expense" as TxType,
      }));
  } catch {
    return [];
  }
}

// ─── W-2 Rule-Based Parser ──────────────────────────────────────────────────

interface W2Result {
  type: "w2";
  employerName?: string;
  employerEin?: string;
  box1_wages?: number;
  box2_federalTax?: number;
  box3_socialSecurityWages?: number;
  box4_socialSecurityTax?: number;
  box5_medicareWages?: number;
  box6_medicareTax?: number;
  box16_stateWages?: number;
  box17_stateTax?: number;
  taxYear?: number;
}

function parseW2(text: string): W2Result {
  const result: W2Result = { type: "w2" };
  const money = (pattern: RegExp): number | undefined => {
    const m = text.match(pattern);
    return m ? parseFloat(m[1].replace(/,/g, "")) : undefined;
  };
  const yearMatch = text.match(/\b(20\d{2})\b/);
  if (yearMatch) result.taxYear = parseInt(yearMatch[1]);
  result.box1_wages = money(/(?:box\s*1|wages[,\s]+tips)[^\d]*(\d[\d,]*\.?\d{0,2})/i);
  result.box2_federalTax = money(/(?:box\s*2|federal\s+income\s+tax\s+withheld)[^\d]*(\d[\d,]*\.?\d{0,2})/i);
  result.box3_socialSecurityWages = money(/(?:box\s*3|social\s+security\s+wages)[^\d]*(\d[\d,]*\.?\d{0,2})/i);
  result.box4_socialSecurityTax = money(/(?:box\s*4|social\s+security\s+tax)[^\d]*(\d[\d,]*\.?\d{0,2})/i);
  result.box5_medicareWages = money(/(?:box\s*5|medicare\s+wages)[^\d]*(\d[\d,]*\.?\d{0,2})/i);
  result.box6_medicareTax = money(/(?:box\s*6|medicare\s+tax)[^\d]*(\d[\d,]*\.?\d{0,2})/i);
  const einMatch = text.match(/\b(\d{2}-\d{7})\b/);
  if (einMatch) result.employerEin = einMatch[1];
  return result;
}

// ─── Legacy Regex Fallback ──────────────────────────────────────────────────

function regexFallbackParse(text: string): ParsedTx[] {
  const transactions: ParsedTx[] = [];
  const LINE_DATE_RE = /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(.+)/;
  const LINE_AMOUNT_RE = /(-?\$?\d{1,3}(?:,\d{3})*\.\d{2})/g;
  const SKIP_RE = /subtotal|^total\b|total for|beginning balance|ending balance|daily.*balance|account ending|page \d|continued on|account summary|available balance/i;
  const yearMatch = text.match(/(?:statement|through|ending)[:\s]*\d{1,2}[\/\-]\d{1,2}[\/\-](\d{4})/i);
  const year = yearMatch?.[1] || new Date().getFullYear().toString();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || SKIP_RE.test(line)) continue;
    const dateMatch = line.match(LINE_DATE_RE);
    if (!dateMatch) continue;
    const [, dateStr, remainder] = dateMatch;
    const amounts = [...remainder.matchAll(LINE_AMOUNT_RE)];
    if (amounts.length === 0) continue;
    const lastAmount = amounts[amounts.length === 1 ? 0 : amounts.length >= 3 ? amounts.length - 2 : 0];
    const amountIdx = remainder.lastIndexOf(lastAmount[0]);
    const desc = remainder.slice(0, amountIdx).trim().replace(/\s+/g, " ").replace(/[Xx*]{4,}\s*\d{0,4}/g, "").trim();
    if (!desc || desc.length < 2) continue;
    const rawAmt = lastAmount[1].replace(/[^\d.-]/g, "");
    const value = Math.abs(parseFloat(rawAmt));
    if (!value || value <= 0) continue;
    const parts = dateStr.split("/");
    const mm = parts[0].padStart(2, "0");
    const dd = parts[1].padStart(2, "0");
    const yy = parts[2] ? (parts[2].length === 2 ? `20${parts[2]}` : parts[2]) : year;
    const isNeg = lastAmount[1].startsWith("-") || lastAmount[1].startsWith("(");
    const isDeposit = /(deposit|credit|refund|payment received|transfer from|direct dep|payroll|interest earned)/i.test(desc);
    transactions.push({
      date: `${yy}-${mm}-${dd}`,
      description: desc,
      amount: value,
      type: isNeg || !isDeposit ? "expense" : "income",
    });
  }
  return transactions;
}

// ─── Post-Processing Filter ─────────────────────────────────────────────────

function postFilter(txs: ParsedTx[]): ParsedTx[] {
  const seen = new Set<string>();
  return txs.filter(t => {
    if (JUNK_RE.test(t.description)) return false;
    if (t.amount <= 0 || t.description.length < 2) return false;
    // Clean description
    t.description = t.description
      .replace(/[Xx*]{4,}\s*\d{0,4}/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const m = t.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return false;
    const month = Number(m[2]), day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const key = `${t.date}|${t.amount.toFixed(2)}|${t.description.toLowerCase().slice(0, 50)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

async function processPages(
  pages: PagePayload[],
  predetectedColumns?: ColumnDef[],
  initialSection?: TxType | null,
): Promise<{ transactions: ParsedTx[]; method: string; stats: ParseStats }> {
  const startMs = Date.now();
  const columns = predetectedColumns && predetectedColumns.length > 0
    ? predetectedColumns
    : detectColumns(pages);
  const effectiveSection = initialSection ?? null;

  console.log(`Columns: ${columns.map(c => c.name).join(", ")} | Initial section: ${effectiveSection || "none"}`);

  // STEP 1: Deterministic parse (primary - always runs, very fast)
  const { transactions: detTxs, stats, unresolvedCount } = deterministicParse(
    pages, columns, effectiveSection,
  );
  const detMs = Date.now() - startMs;
  console.log(`Deterministic: ${detTxs.length} transactions in ${detMs}ms (${unresolvedCount} unresolved)`);

  // STEP 2: If deterministic got reasonable results, use them
  if (detTxs.length > 0) {
    return { transactions: detTxs, method: "deterministic", stats };
  }

  // STEP 3: Deterministic found nothing — AI rescue
  console.log("Deterministic found 0 transactions, attempting AI rescue...");
  const text = reconstructTextFromPages(pages);
  const truncated = text.length > 60000 ? text.slice(0, 60000) : text;

  try {
    const aiTxs = await aiRescueParse(truncated, effectiveSection);
    console.log(`AI rescue: ${aiTxs.length} transactions`);

    let aiStats: ParseStats = { incomeTotal: 0, expenseTotal: 0, incomeCount: 0, expenseCount: 0 };
    for (const tx of aiTxs) {
      if (tx.type === "income") { aiStats.incomeTotal += tx.amount; aiStats.incomeCount++; }
      else { aiStats.expenseTotal += tx.amount; aiStats.expenseCount++; }
    }

    return { transactions: aiTxs, method: "ai_rescue", stats: aiStats };
  } catch (aiErr) {
    const errMsg = aiErr instanceof Error ? aiErr.message : "Unknown";
    if (errMsg === "RATE_LIMITED" || errMsg === "PAYMENT_REQUIRED") throw aiErr;
    console.warn(`AI rescue failed: ${errMsg}, trying regex`);

    const regTxs = regexFallbackParse(text);
    let regStats: ParseStats = { incomeTotal: 0, expenseTotal: 0, incomeCount: 0, expenseCount: 0 };
    for (const tx of regTxs) {
      if (tx.type === "income") { regStats.incomeTotal += tx.amount; regStats.incomeCount++; }
      else { regStats.expenseTotal += tx.amount; regStats.expenseCount++; }
    }

    return { transactions: regTxs, method: "regex_fallback", stats: regStats };
  }
}

// ─── HTTP Handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const hasPages = Array.isArray(body.pages) && body.pages.length > 0;
    const text = body.text || body.fullText || "";
    const docType = body.docType || "unknown";
    const predetectedColumns: ColumnDef[] | undefined = body.detectedColumns;
    const initialSection: TxType | null = body.initialSection || null;

    // W-2: rule-based
    if (docType === "w2") {
      let w2Text = text;
      if (!w2Text && hasPages) w2Text = reconstructTextFromPages(body.pages);
      if (w2Text) {
        const w2Data = parseW2(w2Text);
        return new Response(JSON.stringify({ w2: w2Data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Structured pages pipeline (deterministic-first)
    if (hasPages) {
      const startMs = Date.now();
      console.log(`Processing ${body.pages.length} pages (initialSection: ${initialSection || "none"})`);

      const { transactions: rawTx, method, stats } = await processPages(
        body.pages, predetectedColumns, initialSection,
      );
      const transactions = postFilter(rawTx);

      // Recalculate stats after post-filter
      const finalStats: ParseStats = { incomeTotal: 0, expenseTotal: 0, incomeCount: 0, expenseCount: 0 };
      for (const tx of transactions) {
        if (tx.type === "income") { finalStats.incomeTotal += tx.amount; finalStats.incomeCount++; }
        else { finalStats.expenseTotal += tx.amount; finalStats.expenseCount++; }
      }

      const totalMs = Date.now() - startMs;
      console.log(`Final: ${transactions.length} transactions via ${method} in ${totalMs}ms`);

      return new Response(
        JSON.stringify({ transactions, method, stats: finalStats, processingMs: totalMs }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Legacy text pipeline
    if (!text?.trim()) {
      return new Response(JSON.stringify({ error: "No text or pages provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const truncated = text.length > 100000 ? text.slice(0, 100000) : text;
    let transactions: ParsedTx[] = [];
    let method = "regex";

    transactions = regexFallbackParse(truncated);
    transactions = postFilter(transactions);

    return new Response(
      JSON.stringify({
        transactions, method,
        summary: transactions.length > 0 ? `Extracted ${transactions.length} transactions` : "No transactions detected",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "Unknown error";
    if (errMsg === "RATE_LIMITED") {
      return new Response(JSON.stringify({ error: "Rate limited — try again shortly" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (errMsg === "PAYMENT_REQUIRED") {
      return new Response(JSON.stringify({ error: "AI credits exhausted" }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    console.error("parse-pdf error:", e);
    return new Response(JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
