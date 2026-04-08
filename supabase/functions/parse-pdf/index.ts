// AI-Powered Bank Statement Parser + Rule-Based W-2 Parser
// Supports both legacy {text} and structured {pages} payload formats
// Uses server-side column detection + Lovable AI Gateway (Gemini Flash)
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

// ─── Column Detection ────────────────────────────────────────────────────────

interface ColumnDef {
  name: string;
  xMin: number;
  xMax: number;
  xCenter: number;
}

const HEADER_KEYWORDS: Record<string, string[]> = {
  date: ["date", "trans date", "post date", "posting date", "transaction date", "effective date"],
  description: ["description", "details", "memo", "payee", "merchant", "transaction description", "narrative"],
  debit: ["debit", "debits", "withdrawal", "withdrawals", "charges", "amount deducted", "purchases"],
  credit: ["credit", "credits", "deposit", "deposits", "amount added"],
  amount: ["amount", "transaction amount"],
  balance: ["balance", "running balance", "available balance", "ending balance", "closing balance"],
};

// ─── Section Detection (bank-agnostic, comprehensive) ───────────────────────

// Income/deposit section patterns — covers BoA, Chase, Wells Fargo, Citi, credit unions, generic
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

// Expense/withdrawal section patterns
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

// Combined pattern for "is this a section header at all?" — used to skip these in column detection
const ALL_SECTION_PATTERNS = [...DEPOSIT_PATTERNS, ...WITHDRAWAL_PATTERNS];

// Also skip summary/balance section headers
const SUMMARY_SECTION_RE = /\b(daily\s+(?:ledger\s+)?balance|account\s+summary|statement\s+summary|balance\s+summary|transaction\s+summary|interest\s+(?:charged|earned|summary)|rewards?\s+summary|year.to.date\s+totals?)\b/i;

function detectSectionType(text: string): "income" | "expense" | "summary" | null {
  // Check summary first (these should stop section tracking)
  if (SUMMARY_SECTION_RE.test(text)) return "summary";
  for (const re of DEPOSIT_PATTERNS) {
    if (re.test(text)) return "income";
  }
  for (const re of WITHDRAWAL_PATTERNS) {
    if (re.test(text)) return "expense";
  }
  return null;
}

function isSectionHeader(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (SUMMARY_SECTION_RE.test(lower)) return true;
  for (const re of ALL_SECTION_PATTERNS) {
    if (re.test(lower)) return true;
  }
  return false;
}

function detectColumns(pages: PagePayload[]): ColumnDef[] {
  const candidates: { name: string; x: number; width: number }[] = [];

  for (const page of pages.slice(0, 3)) {
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
    columns.push({
      name,
      xMin: avgX - 10,
      xMax: avgX + avgW + 10,
      xCenter: avgX + avgW / 2,
    });
  }

  columns.sort((a, b) => a.xCenter - b.xCenter);
  return columns;
}

// ─── Row Grouping ────────────────────────────────────────────────────────────

interface Row {
  y: number;
  items: RawItem[];
}

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

// ─── Junk Detection ──────────────────────────────────────────────────────────

function detectRepeatedHeaders(pages: PagePayload[]): Set<string> {
  const topTexts = new Map<string, number>();
  const bottomTexts = new Map<string, number>();

  for (const page of pages) {
    const pageHeight = page.height;
    for (const item of page.items) {
      const normalized = item.str.trim().toLowerCase();
      if (normalized.length < 3) continue;
      if (item.y > pageHeight * 0.85) {
        topTexts.set(normalized, (topTexts.get(normalized) || 0) + 1);
      }
      if (item.y < pageHeight * 0.15) {
        bottomTexts.set(normalized, (bottomTexts.get(normalized) || 0) + 1);
      }
    }
  }

  const repeated = new Set<string>();
  const threshold = Math.max(2, Math.ceil(pages.length * 0.5));
  for (const [text, count] of topTexts) {
    if (count >= threshold) repeated.add(text);
  }
  for (const [text, count] of bottomTexts) {
    if (count >= threshold) repeated.add(text);
  }
  return repeated;
}

// ─── Build Structured Table ─────────────────────────────────────────────────

function assignColumn(item: RawItem, columns: ColumnDef[]): string {
  const itemCenter = item.x + (item.width / 2);
  let best = "unknown";
  let bestDist = Infinity;
  for (const col of columns) {
    const dist = Math.abs(itemCenter - col.xCenter);
    if (dist < bestDist) {
      bestDist = dist;
      best = col.name;
    }
  }
  return best;
}

function buildStructuredTable(
  pages: PagePayload[],
  columns: ColumnDef[],
  initialSection: TxType | null,
): string {
  const repeatedHeaders = detectRepeatedHeaders(pages);
  const JUNK_RE = /\b(subtotal|total for|beginning balance|ending balance|closing balance|opening balance|daily.*balance|account ending|statement period|page \d+ of \d+|continued|account number|member fdic)\b/i;

  const hasDebitCol = columns.some((c) => c.name === "debit");
  const hasCreditCol = columns.some((c) => c.name === "credit");
  const isSectionBased = !hasCreditCol || !hasDebitCol;

  const headerLine = "| " + columns.map((c) => c.name.charAt(0).toUpperCase() + c.name.slice(1)).join(" | ") + " |";
  const sepLine = "| " + columns.map(() => "---").join(" | ") + " |";
  const dataLines: string[] = [];
  let currentSection: TxType | null = initialSection;

  // If we have an initial section from a previous chunk, inject marker at start
  if (initialSection && isSectionBased) {
    const sectionLabel = initialSection === "income"
      ? ">>> SECTION: DEPOSITS / CREDITS (type = income) <<<"
      : ">>> SECTION: WITHDRAWALS / DEBITS (type = expense) <<<";
    dataLines.push(sectionLabel);
  }

  for (const page of pages) {
    const filteredItems = page.items.filter((item) => {
      const norm = item.str.trim().toLowerCase();
      return !repeatedHeaders.has(norm);
    });

    const rows = groupIntoRows(filteredItems);

    for (const row of rows) {
      const rowText = row.items.map((i) => i.str).join(" ");

      const sectionType = detectSectionType(rowText);
      if (sectionType) {
        if (sectionType === "summary") {
          // Stop processing — everything after is balances/summary
          currentSection = null;
          continue;
        }
        currentSection = sectionType;
        if (isSectionBased) {
          const sectionLabel = sectionType === "income"
            ? ">>> SECTION: DEPOSITS / CREDITS (type = income) <<<"
            : ">>> SECTION: WITHDRAWALS / DEBITS (type = expense) <<<";
          dataLines.push(sectionLabel);
        }
        continue;
      }

      if (JUNK_RE.test(rowText)) continue;
      if (row.items.length < 2) continue;
      if (/^\s*(date|trans\s*date|post\s*date)\s*$/i.test(row.items[0]?.str?.trim())) continue;

      const cells: Record<string, string> = {};
      for (const col of columns) cells[col.name] = "";

      for (const item of row.items) {
        const colName = assignColumn(item, columns);
        if (cells[colName]) cells[colName] += " " + item.str.trim();
        else cells[colName] = item.str.trim();
      }

      const dateCell = cells["date"] || "";
      const hasDate = /\d{1,2}[\/\-]\d{1,2}/.test(dateCell) || /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(dateCell);
      if (!hasDate && columns.some((c) => c.name === "date")) continue;

      const line = "| " + columns.map((c) => cells[c.name] || "").join(" | ") + " |";
      dataLines.push(line);
    }
  }

  if (dataLines.length === 0) return "";

  const hasSectionMarkers = dataLines.some((l) => l.startsWith(">>>"));
  const preamble = hasSectionMarkers
    ? "NOTE: This statement uses SECTION-BASED layout. Lines starting with '>>>' indicate a section change. ALL transactions after a section marker belong to that section type (income or expense) until the next marker appears.\n\n"
    : "";

  return `${preamble}${headerLine}\n${sepLine}\n${dataLines.join("\n")}`;
}

// ─── Fallback: Reconstruct text from items ──────────────────────────────────

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

// ─── AI-Powered Parser ──────────────────────────────────────────────────────

async function parseWithAI(input: string, isStructured: boolean, columnNames?: string[]): Promise<ParsedTx[]> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  let systemPrompt: string;

  if (isStructured && columnNames) {
    const hasDebit = columnNames.includes("debit");
    const hasCredit = columnNames.includes("credit");
    const hasBalance = columnNames.includes("balance");
    const hasSectionMarkers = input.includes(">>> SECTION:");

    const colList = columnNames.map((n) => n.charAt(0).toUpperCase() + n.slice(1)).join(", ");

    let typeRules: string;

    if (hasSectionMarkers) {
      typeRules = `- This statement uses a SECTION-BASED layout with section markers like ">>> SECTION: DEPOSITS / CREDITS (type = income) <<<" and ">>> SECTION: WITHDRAWALS / DEBITS (type = expense) <<<".
- ALL transactions after a "DEPOSITS / CREDITS" marker are type = "income" until the next section marker.
- ALL transactions after a "WITHDRAWALS / DEBITS" marker are type = "expense" until the next section marker.
- The section marker ALWAYS determines the type — do NOT guess from the description or amount sign.
- Use the Amount/Debit column value for the transaction amount (always output as positive number).
- If no section marker has appeared yet, default to "expense".`;
    } else if (hasDebit && hasCredit) {
      typeRules = `- This table has SEPARATE Debit and Credit columns.
- If a row has a value in the Debit column → type = "expense"
- If a row has a value in the Credit column → type = "income"
- Use the amount from whichever column has the value.`;
    } else if (hasDebit && !hasCredit) {
      typeRules = `- This table has only a Debit column. All amounts are expenses (type = "expense").
- If a deposit/credit appears, it should be rare — classify based on description context.`;
    } else {
      typeRules = `- Determine type from context: deposits/credits/refunds = "income", withdrawals/debits/purchases = "expense".`;
    }

    systemPrompt = `You are a financial data extraction engine. You will receive a markdown table from a bank or credit card statement.

TABLE COLUMNS: ${colList}

${typeRules}

CRITICAL RULES:
- Extract ONLY actual transactions (purchases, payments, deposits, withdrawals, transfers)
${hasBalance ? "- IGNORE the Balance column — it shows running totals, NOT transaction amounts" : ""}
- IGNORE subtotals, section totals, summary rows, daily balance rows
- The "amount" field must ALWAYS be a positive number — remove dollar signs, commas, and negative signs
- Clean merchant names: remove reference numbers, card masks (XXXX1234), internal codes
- Infer the full year (YYYY) from statement context if dates only show month/day
- Each row with a date is ONE transaction — do not skip or merge rows
- If a row has values in both a numeric column AND no clear date, skip it (likely a subtotal)`;
  } else {
    systemPrompt = `You are a financial data extraction engine. Extract transactions from bank/credit card statement text.

CRITICAL RULES:
- deposits/credits/refunds/payments received = type "income"
- withdrawals/debits/purchases/payments made/fees = type "expense"
- amount must always be a positive number
- Clean merchant names`;
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: input },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "extract_transactions",
            description:
              "Extract all individual financial transactions. Skip subtotals, running balances, section headers, account summaries, daily balances, and totals.",
            parameters: {
              type: "object",
              properties: {
                transactions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      date: { type: "string", description: "Transaction date in YYYY-MM-DD format." },
                      description: { type: "string", description: "Cleaned merchant/payee name." },
                      amount: { type: "number", description: "Transaction amount as a POSITIVE number. Never use the balance column." },
                      type: { type: "string", enum: ["income", "expense"], description: "Based on section headers or column position. Debit/withdrawal section = expense. Credit/deposit section = income." },
                    },
                    required: ["date", "description", "amount", "type"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["transactions"],
              additionalProperties: false,
            },
          },
        },
      ],
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

  if (!toolCall?.function?.arguments) {
    throw new Error("No tool call in AI response");
  }

  let parsed: { transactions: ParsedTx[] };
  try {
    parsed = JSON.parse(toolCall.function.arguments);
  } catch {
    throw new Error("Failed to parse AI tool call arguments");
  }

  return (parsed.transactions || [])
    .filter((t) => t.date && t.description && t.amount > 0)
    .map((t) => ({
      date: t.date,
      description: t.description.trim(),
      amount: Math.abs(t.amount),
      type: t.type === "income" ? ("income" as TxType) : ("expense" as TxType),
    }));
}

// ─── Column-Aware Regex Fallback ────────────────────────────────────────────

function structuredRegexParse(
  pages: PagePayload[],
  columns: ColumnDef[],
  initialSection: TxType | null,
): ParsedTx[] {
  const transactions: ParsedTx[] = [];
  const dateCol = columns.find((c) => c.name === "date");
  const debitCol = columns.find((c) => c.name === "debit");
  const creditCol = columns.find((c) => c.name === "credit");
  const amountCol = columns.find((c) => c.name === "amount");

  if (!dateCol) return [];

  const JUNK_RE = /\b(subtotal|total for|beginning balance|ending balance|closing balance|opening balance|daily.*balance|account ending|statement period|continued|account number)\b/i;
  const DATE_RE = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/;
  const AMOUNT_RE = /\$?\s*(\d{1,3}(?:,\d{3})*\.?\d{0,2})/;

  const allText = pages.flatMap((p) => p.items.map((i) => i.str)).join(" ");
  const yearMatch = allText.match(/(?:statement|through|ending|period)[:\s]*\d{1,2}[\/\-]\d{1,2}[\/\-](\d{4})/i);
  const year = yearMatch?.[1] || new Date().getFullYear().toString();

  let currentSection: TxType | null = initialSection;

  for (const page of pages) {
    const rows = groupIntoRows(page.items);

    for (const row of rows) {
      const rowText = row.items.map((i) => i.str).join(" ");

      const sectionType = detectSectionType(rowText);
      if (sectionType) {
        if (sectionType === "summary") { currentSection = null; continue; }
        currentSection = sectionType;
        continue;
      }

      if (JUNK_RE.test(rowText)) continue;

      const cells: Record<string, string> = {};
      for (const col of columns) cells[col.name] = "";
      for (const item of row.items) {
        const colName = assignColumn(item, columns);
        if (cells[colName]) cells[colName] += " " + item.str.trim();
        else cells[colName] = item.str.trim();
      }

      const dateMatch = cells["date"]?.match(DATE_RE);
      if (!dateMatch) continue;

      const mm = dateMatch[1].padStart(2, "0");
      const dd = dateMatch[2].padStart(2, "0");
      const yy = dateMatch[3] ? (dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]) : year;

      const desc = (cells["description"] || "").trim();
      if (!desc || desc.length < 2) continue;

      let amount = 0;
      let txType: TxType = currentSection || "expense";

      if (debitCol && creditCol) {
        const debitMatch = cells["debit"]?.match(AMOUNT_RE);
        const creditMatch = cells["credit"]?.match(AMOUNT_RE);
        if (debitMatch) {
          amount = parseFloat(debitMatch[1].replace(/,/g, ""));
          txType = "expense";
        } else if (creditMatch) {
          amount = parseFloat(creditMatch[1].replace(/,/g, ""));
          txType = "income";
        }
      } else if (currentSection) {
        const amtMatch = (cells["debit"] || cells["amount"] || cells["credit"] || "").match(AMOUNT_RE);
        if (amtMatch) {
          amount = parseFloat(amtMatch[1].replace(/,/g, ""));
          txType = currentSection;
        }
      } else if (amountCol) {
        const amtMatch = cells["amount"]?.match(AMOUNT_RE);
        if (amtMatch) {
          amount = parseFloat(amtMatch[1].replace(/,/g, ""));
          const isDeposit = /(deposit|credit|refund|payment received|transfer from|direct dep|payroll|interest earned)/i.test(desc);
          txType = isDeposit ? "income" : "expense";
        }
      }

      if (amount <= 0) continue;

      transactions.push({
        date: `${yy}-${mm}-${dd}`,
        description: desc.replace(/\s+/g, " ").replace(/[Xx*]{4,}\s*\d{0,4}/g, "").trim(),
        amount,
        type: txType,
      });
    }
  }

  return transactions;
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
    if (!m) return undefined;
    return parseFloat(m[1].replace(/,/g, ""));
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

// ─── Legacy Regex Fallback Parser ───────────────────────────────────────────

function regexFallbackParse(text: string): ParsedTx[] {
  const transactions: ParsedTx[] = [];
  const DATE_RE = /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(.+)/;
  const AMOUNT_RE = /(-?\$?\d{1,3}(?:,\d{3})*\.\d{2})/g;
  const SKIP_RE = /subtotal|^total\b|total for|beginning balance|ending balance|daily.*balance|account ending|page \d|continued on|account summary|available balance/i;

  const yearMatch = text.match(/(?:statement|through|ending)[:\s]*\d{1,2}[\/\-]\d{1,2}[\/\-](\d{4})/i);
  const year = yearMatch?.[1] || new Date().getFullYear().toString();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || SKIP_RE.test(line)) continue;

    const dateMatch = line.match(DATE_RE);
    if (!dateMatch) continue;

    const [, dateStr, remainder] = dateMatch;
    const amounts = [...remainder.matchAll(AMOUNT_RE)];
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

const JUNK_RE = /\b(subtotal|total for|beginning balance|ending balance|closing balance|opening balance|daily.*balance|account ending|statement period|page \d+ of \d+|continued)\b/i;

function postFilter(txs: ParsedTx[]): ParsedTx[] {
  const seen = new Set<string>();
  return txs.filter((t) => {
    if (JUNK_RE.test(t.description)) return false;
    if (t.amount <= 0) return false;
    if (t.description.length < 2) return false;
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

// ─── Pre-scan: detect section boundaries across all pages ───────────────────

interface SectionBoundary {
  pageNum: number;
  y: number;
  type: TxType;
}

function prescanSections(pages: PagePayload[]): SectionBoundary[] {
  const boundaries: SectionBoundary[] = [];
  for (const page of pages) {
    const rows = groupIntoRows(page.items);
    for (const row of rows) {
      const rowText = row.items.map((i) => i.str).join(" ");
      const sectionType = detectSectionType(rowText);
      if (sectionType && sectionType !== "summary") {
        boundaries.push({ pageNum: page.pageNum, y: row.y, type: sectionType });
      }
    }
  }
  return boundaries;
}

/** Given section boundaries from all pages, determine which section a chunk starts in. */
function getInitialSectionForChunk(
  chunkStartPage: number,
  allBoundaries: SectionBoundary[],
): TxType | null {
  // Find the last section boundary BEFORE this chunk's first page
  let lastSection: TxType | null = null;
  for (const b of allBoundaries) {
    if (b.pageNum < chunkStartPage) {
      lastSection = b.type;
    }
  }
  return lastSection;
}

// ─── Structured Pages Pipeline ──────────────────────────────────────────────

async function processStructuredPages(
  pages: PagePayload[],
  predetectedColumns?: ColumnDef[],
  initialSection?: TxType | null,
): Promise<{ transactions: ParsedTx[]; method: string; lastSection: TxType | null }> {
  const columns = predetectedColumns || detectColumns(pages);
  const effectiveInitialSection = initialSection ?? null;

  console.log(`Detected ${columns.length} columns: ${columns.map((c) => c.name).join(", ")}`);
  console.log(`Initial section: ${effectiveInitialSection || "none"}`);

  let transactions: ParsedTx[] = [];
  let method = "ai_structured";

  // Track last section seen for returning to caller
  let lastSection = effectiveInitialSection;

  if (columns.length >= 2) {
    const table = buildStructuredTable(pages, columns, effectiveInitialSection);

    if (table) {
      console.log(`Built structured table with ${table.split("\n").length - 2} data rows`);

      const truncated = table.length > 80000 ? table.slice(0, 80000) : table;

      try {
        const colNames = columns.map((c) => c.name);
        transactions = await parseWithAI(truncated, true, colNames);
        console.log(`AI structured parser returned ${transactions.length} transactions`);
      } catch (aiErr) {
        const errMsg = aiErr instanceof Error ? aiErr.message : "Unknown";
        if (errMsg === "RATE_LIMITED" || errMsg === "PAYMENT_REQUIRED") throw aiErr;

        console.warn(`AI structured parse failed (${errMsg}), trying column-aware regex`);
        method = "regex_structured";
        transactions = structuredRegexParse(pages, columns, effectiveInitialSection);
        console.log(`Column-aware regex returned ${transactions.length} transactions`);
      }
    } else {
      method = "regex_structured";
      transactions = structuredRegexParse(pages, columns, effectiveInitialSection);
    }
  } else {
    console.log("No column structure detected, falling back to text reconstruction");
    const text = reconstructTextFromPages(pages);
    const truncated = text.length > 100000 ? text.slice(0, 100000) : text;

    try {
      transactions = await parseWithAI(truncated, false);
      method = "ai_text";
    } catch (aiErr) {
      const errMsg = aiErr instanceof Error ? aiErr.message : "Unknown";
      if (errMsg === "RATE_LIMITED" || errMsg === "PAYMENT_REQUIRED") throw aiErr;

      method = "regex";
      transactions = regexFallbackParse(truncated);
    }
  }

  // Determine last section from this chunk's pages
  for (const page of pages) {
    const rows = groupIntoRows(page.items);
    for (const row of rows) {
      const rowText = row.items.map((i) => i.str).join(" ");
      const st = detectSectionType(rowText);
      if (st && st !== "summary") lastSection = st;
    }
  }

  return { transactions, method, lastSection };
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

    // Accept pre-detected columns and initial section from client
    const predetectedColumns: ColumnDef[] | undefined = body.detectedColumns;
    const initialSection: TxType | null = body.initialSection || null;

    // W-2: rule-based regardless of format
    if (docType === "w2") {
      let w2Text = text;
      if (!w2Text && hasPages) {
        w2Text = reconstructTextFromPages(body.pages);
      }
      if (w2Text) {
        const w2Data = parseW2(w2Text);
        return new Response(JSON.stringify({ w2: w2Data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // === Structured pages pipeline (new) ===
    if (hasPages) {
      console.log(`Processing ${body.pages.length} pages with structured pipeline (initialSection: ${initialSection || "none"})`);

      const { transactions: rawTx, method } = await processStructuredPages(
        body.pages,
        predetectedColumns,
        initialSection,
      );
      const transactions = postFilter(rawTx);

      console.log(`Final: ${transactions.length} transactions via ${method}`);

      return new Response(
        JSON.stringify({
          transactions,
          method,
          summary: transactions.length > 0
            ? `Extracted ${transactions.length} transactions`
            : "No transactions detected",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // === Legacy text pipeline ===
    if (!text?.trim()) {
      return new Response(JSON.stringify({ error: "No text or pages provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const truncated = text.length > 100000 ? text.slice(0, 100000) : text;
    let transactions: ParsedTx[] = [];
    let method = "ai";

    try {
      console.log(`Attempting AI parse for ${truncated.length} chars...`);
      transactions = await parseWithAI(truncated, false);
      console.log(`AI parser returned ${transactions.length} transactions`);
    } catch (aiErr) {
      const errMsg = aiErr instanceof Error ? aiErr.message : "Unknown AI error";
      console.warn(`AI parse failed (${errMsg}), falling back to regex`);

      if (errMsg === "RATE_LIMITED") {
        return new Response(
          JSON.stringify({ error: "Rate limited — please try again in a moment" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (errMsg === "PAYMENT_REQUIRED") {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted — please add credits" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      method = "regex";
      transactions = regexFallbackParse(truncated);
    }

    transactions = postFilter(transactions);

    return new Response(
      JSON.stringify({
        transactions,
        method,
        summary: transactions.length > 0
          ? `Extracted ${transactions.length} transactions`
          : "No transactions detected",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "Unknown error";

    if (errMsg === "RATE_LIMITED") {
      return new Response(
        JSON.stringify({ error: "Rate limited — please try again in a moment" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (errMsg === "PAYMENT_REQUIRED") {
      return new Response(
        JSON.stringify({ error: "AI credits exhausted — please add credits" }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.error("parse-pdf error:", e);
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
