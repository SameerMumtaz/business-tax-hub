// AI-Powered Bank Statement Parser + Rule-Based W-2 Parser
// Supports both legacy {text} and structured {pages} payload formats
// Uses server-side column detection + Lovable AI Gateway (Gemini Flash Lite)
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
  credit: ["credit", "credits", "deposit", "deposits", "payments", "amount added"],
  amount: ["amount", "transaction amount"],
  balance: ["balance", "running balance", "available balance", "ending balance", "closing balance"],
};

function detectColumns(pages: PagePayload[]): ColumnDef[] {
  const candidates: { name: string; x: number; width: number }[] = [];

  // Scan first 3 pages for header keywords
  for (const page of pages.slice(0, 3)) {
    for (const item of page.items) {
      const lower = item.str.toLowerCase().trim();
      for (const [colName, keywords] of Object.entries(HEADER_KEYWORDS)) {
        if (keywords.some((kw) => lower === kw || lower.startsWith(kw))) {
          candidates.push({ name: colName, x: item.x, width: item.width });
        }
      }
    }
  }

  if (candidates.length === 0) return [];

  // Deduplicate: group by name, take most common X position
  const byName = new Map<string, { x: number; width: number }[]>();
  for (const c of candidates) {
    if (!byName.has(c.name)) byName.set(c.name, []);
    byName.get(c.name)!.push({ x: c.x, width: c.width });
  }

  const columns: ColumnDef[] = [];
  for (const [name, positions] of byName) {
    // Take the most frequent x position (within tolerance)
    const avgX = positions.reduce((s, p) => s + p.x, 0) / positions.length;
    const avgW = positions.reduce((s, p) => s + p.width, 0) / positions.length;
    columns.push({
      name,
      xMin: avgX - 10,
      xMax: avgX + avgW + 10,
      xCenter: avgX + avgW / 2,
    });
  }

  // Sort columns left-to-right
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
  // Find text that appears at similar Y positions across multiple pages
  const topTexts = new Map<string, number>();
  const bottomTexts = new Map<string, number>();

  for (const page of pages) {
    const pageHeight = page.height;
    for (const item of page.items) {
      const normalized = item.str.trim().toLowerCase();
      if (normalized.length < 3) continue;
      // Top 15% or bottom 15% of page
      if (item.y > pageHeight * 0.85) {
        topTexts.set(normalized, (topTexts.get(normalized) || 0) + 1);
      }
      if (item.y < pageHeight * 0.15) {
        bottomTexts.set(normalized, (bottomTexts.get(normalized) || 0) + 1);
      }
    }
  }

  const repeated = new Set<string>();
  const threshold = Math.min(pages.length, 3);
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

function buildStructuredTable(pages: PagePayload[], columns: ColumnDef[]): string {
  const repeatedHeaders = detectRepeatedHeaders(pages);
  const JUNK_RE = /\b(subtotal|total for|beginning balance|ending balance|closing balance|opening balance|daily.*balance|account ending|statement period|page \d+ of \d+|continued|account number|member fdic)\b/i;

  const headerLine = "| " + columns.map((c) => c.name.charAt(0).toUpperCase() + c.name.slice(1)).join(" | ") + " |";
  const sepLine = "| " + columns.map(() => "---").join(" | ") + " |";
  const dataLines: string[] = [];

  for (const page of pages) {
    // Filter out repeated headers/footers
    const filteredItems = page.items.filter((item) => {
      const norm = item.str.trim().toLowerCase();
      return !repeatedHeaders.has(norm);
    });

    const rows = groupIntoRows(filteredItems);

    for (const row of rows) {
      const rowText = row.items.map((i) => i.str).join(" ");
      if (JUNK_RE.test(rowText)) continue;
      // Skip rows with only 1 item (likely headers/labels)
      if (row.items.length < 2) continue;

      const cells: Record<string, string> = {};
      for (const col of columns) cells[col.name] = "";

      for (const item of row.items) {
        const colName = assignColumn(item, columns);
        if (cells[colName]) cells[colName] += " " + item.str.trim();
        else cells[colName] = item.str.trim();
      }

      // Skip rows with no date-like content in date column
      const dateCell = cells["date"] || "";
      const hasDate = /\d{1,2}[\/\-]\d{1,2}/.test(dateCell) || /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(dateCell);
      if (!hasDate && columns.some((c) => c.name === "date")) continue;

      const line = "| " + columns.map((c) => cells[c.name] || "").join(" | ") + " |";
      dataLines.push(line);
    }
  }

  if (dataLines.length === 0) return "";
  return `${headerLine}\n${sepLine}\n${dataLines.join("\n")}`;
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

async function parseWithAI(input: string, isStructured: boolean): Promise<ParsedTx[]> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const systemPrompt = isStructured
    ? `You are a financial data extraction engine. You will receive a markdown table extracted from a bank or credit card statement. The table has labeled columns (Date, Description, Debit, Credit, Amount, Balance, etc.).

CRITICAL RULES:
- Extract ONLY actual transactions (purchases, payments, deposits, withdrawals, transfers)
- IGNORE the Balance column — it shows running totals, not transaction amounts
- IGNORE subtotals, section totals, summary rows, daily balance rows
- For Debit/Credit columns: Debit = expense, Credit = income
- For single Amount column: negative or withdrawal = expense, positive or deposit = income
- Clean merchant names: remove reference numbers, card masks, internal codes
- Infer the year from statement context if dates only show month/day`
    : `You are a financial data extraction engine. Extract transactions from bank/credit card statement text using the provided tool.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
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
              "Extract all individual financial transactions. Skip subtotals, running balances, section headers, account summaries, daily balances, and totals. Only include actual purchases, payments, deposits, withdrawals, and transfers.",
            parameters: {
              type: "object",
              properties: {
                transactions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      date: {
                        type: "string",
                        description: "Transaction date in YYYY-MM-DD format.",
                      },
                      description: {
                        type: "string",
                        description: "Cleaned merchant/payee name.",
                      },
                      amount: {
                        type: "number",
                        description: "Transaction amount as a positive number.",
                      },
                      type: {
                        type: "string",
                        enum: ["income", "expense"],
                        description: "deposits/credits/refunds = income, withdrawals/debits/purchases = expense.",
                      },
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

function structuredRegexParse(pages: PagePayload[], columns: ColumnDef[]): ParsedTx[] {
  const transactions: ParsedTx[] = [];
  const dateCol = columns.find((c) => c.name === "date");
  const descCol = columns.find((c) => c.name === "description");
  const debitCol = columns.find((c) => c.name === "debit");
  const creditCol = columns.find((c) => c.name === "credit");
  const amountCol = columns.find((c) => c.name === "amount");

  if (!dateCol) return [];

  const JUNK_RE = /\b(subtotal|total for|beginning balance|ending balance|closing balance|opening balance|daily.*balance|account ending|statement period|continued|account number)\b/i;
  const DATE_RE = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/;
  const AMOUNT_RE = /\$?\s*(\d{1,3}(?:,\d{3})*\.?\d{0,2})/;

  // Try to detect year from all text
  const allText = pages.flatMap((p) => p.items.map((i) => i.str)).join(" ");
  const yearMatch = allText.match(/(?:statement|through|ending|period)[:\s]*\d{1,2}[\/\-]\d{1,2}[\/\-](\d{4})/i);
  const year = yearMatch?.[1] || new Date().getFullYear().toString();

  for (const page of pages) {
    const rows = groupIntoRows(page.items);

    for (const row of rows) {
      const rowText = row.items.map((i) => i.str).join(" ");
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
      let txType: TxType = "expense";

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

// ─── Structured Pages Pipeline ──────────────────────────────────────────────

async function processStructuredPages(pages: PagePayload[]): Promise<{ transactions: ParsedTx[]; method: string }> {
  const columns = detectColumns(pages);
  console.log(`Detected ${columns.length} columns: ${columns.map((c) => c.name).join(", ")}`);

  let transactions: ParsedTx[] = [];
  let method = "ai_structured";

  if (columns.length >= 2) {
    // Build structured markdown table for AI
    const table = buildStructuredTable(pages, columns);

    if (table) {
      console.log(`Built structured table with ${table.split("\n").length - 2} data rows`);

      // Truncate if too large
      const truncated = table.length > 80000 ? table.slice(0, 80000) : table;

      try {
        transactions = await parseWithAI(truncated, true);
        console.log(`AI structured parser returned ${transactions.length} transactions`);
      } catch (aiErr) {
        const errMsg = aiErr instanceof Error ? aiErr.message : "Unknown";
        if (errMsg === "RATE_LIMITED" || errMsg === "PAYMENT_REQUIRED") throw aiErr;

        console.warn(`AI structured parse failed (${errMsg}), trying column-aware regex`);
        method = "regex_structured";
        transactions = structuredRegexParse(pages, columns);
        console.log(`Column-aware regex returned ${transactions.length} transactions`);
      }
    } else {
      // Table building returned empty — try regex directly
      method = "regex_structured";
      transactions = structuredRegexParse(pages, columns);
    }
  } else {
    // No columns detected — reconstruct text and use legacy pipeline
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

  return { transactions, method };
}

// ─── HTTP Handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Detect payload format
    const hasPages = Array.isArray(body.pages) && body.pages.length > 0;
    const text = body.text || body.fullText || "";
    const docType = body.docType || "unknown";

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
      console.log(`Processing ${body.pages.length} pages with structured pipeline`);

      const { transactions: rawTx, method } = await processStructuredPages(body.pages);
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
