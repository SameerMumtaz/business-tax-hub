// Vision-First Bank Statement Parser + W-2 Parser
// Primary path: multimodal AI extracts transactions from page images
// Deterministic text parsing kept only as fast-path fallback validated by reconciliation
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
  pageNum?: number;
}

interface ParseStats {
  incomeTotal: number;
  expenseTotal: number;
  incomeCount: number;
  expenseCount: number;
}

// ─── Vision-based extraction ────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a bank statement transaction extraction engine. You will receive one or more page images from a bank statement.

Extract EVERY individual transaction. For each transaction provide:
- date: in YYYY-MM-DD format
- description: clean merchant/payee name (remove reference numbers, card masks like XXXX1234)
- amount: positive number (no negatives)
- type: "income" for deposits/credits/refunds/transfers-in, "expense" for withdrawals/debits/purchases/fees/checks
- pageNum: the page number shown in the image

CRITICAL RULES:
1. IGNORE subtotals, running balances, beginning/ending balances, daily balance summaries, page headers/footers
2. Look at the ACTUAL column the amount appears in (debit vs credit) or the section header (Deposits vs Withdrawals) to determine type
3. If the statement has separate "Deposits and Credits" and "Withdrawals and Debits" sections, use those sections to determine type
4. DO NOT classify everything as income or everything as expense — real statements have BOTH
5. Fees and service charges are ALWAYS expense
6. Direct deposits and interest earned are ALWAYS income
7. Extract ALL transactions, not just a sample — every single row with a date and amount`;

async function visionExtractTransactions(
  images: { base64: string; mimeType: string; pageNum: number }[],
): Promise<ParsedTx[]> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  // Build multimodal content array
  const content: any[] = [];
  for (const img of images) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
    });
    content.push({
      type: "text",
      text: `[Page ${img.pageNum}]`,
    });
  }
  content.push({
    type: "text",
    text: "Extract ALL transactions from these bank statement pages. Remember: deposits/credits = income, withdrawals/debits/purchases/fees = expense.",
  });

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
      tools: [{
        type: "function",
        function: {
          name: "extract_transactions",
          description: "Extract all financial transactions from bank statement page images. Skip subtotals, balances, summaries.",
          parameters: {
            type: "object",
            properties: {
              transactions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    date: { type: "string", description: "Date in YYYY-MM-DD format" },
                    description: { type: "string", description: "Clean merchant/payee name" },
                    amount: { type: "number", description: "Positive transaction amount" },
                    type: { type: "string", enum: ["income", "expense"], description: "income for deposits/credits, expense for withdrawals/debits" },
                    pageNum: { type: "number", description: "Page number this transaction appears on" },
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
      .filter((t: any) => t.date && t.description && t.amount > 0)
      .map((t: any) => ({
        date: t.date,
        description: t.description.trim(),
        amount: Math.abs(t.amount),
        type: t.type === "income" ? "income" as TxType : "expense" as TxType,
        pageNum: t.pageNum,
      }));
  } catch {
    return [];
  }
}

// ─── Summary extraction from page images ────────────────────────────────────

interface StatementSummary {
  depositTotal?: number;
  withdrawalTotal?: number;
  depositCount?: number;
  withdrawalCount?: number;
}

async function visionExtractSummary(
  images: { base64: string; mimeType: string; pageNum: number }[],
): Promise<StatementSummary> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return {};

  const content: any[] = [];
  for (const img of images) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
    });
  }
  content.push({
    type: "text",
    text: "Extract the statement summary totals from these pages. Look for total deposits, total withdrawals, deposit count, withdrawal count. These are usually in an 'Account Summary' section.",
  });

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: "Extract statement summary numbers. Return only the official totals printed on the statement.",
          },
          { role: "user", content },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_summary",
            description: "Extract statement summary totals",
            parameters: {
              type: "object",
              properties: {
                depositTotal: { type: "number", description: "Total deposits/credits amount" },
                withdrawalTotal: { type: "number", description: "Total withdrawals/debits amount" },
                depositCount: { type: "number", description: "Number of deposits" },
                withdrawalCount: { type: "number", description: "Number of withdrawals" },
              },
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_summary" } },
      }),
    });

    if (!response.ok) {
      await response.text();
      return {};
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) return {};

    const parsed = JSON.parse(toolCall.function.arguments);
    const summary: StatementSummary = {};
    if (parsed.depositTotal && parsed.depositTotal > 0) summary.depositTotal = parsed.depositTotal;
    if (parsed.withdrawalTotal && parsed.withdrawalTotal > 0) summary.withdrawalTotal = parsed.withdrawalTotal;
    if (parsed.depositCount && parsed.depositCount > 0) summary.depositCount = parsed.depositCount;
    if (parsed.withdrawalCount && parsed.withdrawalCount > 0) summary.withdrawalCount = parsed.withdrawalCount;
    return summary;
  } catch {
    return {};
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

// ─── Post-Processing Filter ─────────────────────────────────────────────────

const JUNK_RE = /\b(subtotal|total\s+(?:for|deposits|withdrawals|debits|credits|checks)|(?:beginning|ending|closing|opening)\s+balance|daily.*balance|account\s+ending|statement\s+period|page\s+\d+\s+of\s+\d+|continued|account\s+number|member\s+fdic)\b/i;

function postFilter(txs: ParsedTx[]): ParsedTx[] {
  const seen = new Set<string>();
  return txs.filter(t => {
    if (JUNK_RE.test(t.description)) return false;
    if (t.amount <= 0 || t.description.length < 2) return false;
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

function computeStats(txs: ParsedTx[]): ParseStats {
  let incomeTotal = 0, expenseTotal = 0, incomeCount = 0, expenseCount = 0;
  for (const tx of txs) {
    if (tx.type === "income") { incomeTotal += tx.amount; incomeCount++; }
    else { expenseTotal += tx.amount; expenseCount++; }
  }
  return { incomeTotal, expenseTotal, incomeCount, expenseCount };
}

// ─── HTTP Handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // W-2: rule-based
    if (body.docType === "w2" && body.text) {
      const w2Data = parseW2(body.text);
      return new Response(JSON.stringify({ w2: w2Data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Vision pipeline: expects { images: [{base64, mimeType, pageNum}], mode: "transactions" | "summary" }
    if (body.mode === "summary" && Array.isArray(body.images)) {
      const startMs = Date.now();
      console.log(`Extracting summary from ${body.images.length} page image(s)`);
      const summary = await visionExtractSummary(body.images);
      console.log(`Summary extracted in ${Date.now() - startMs}ms:`, JSON.stringify(summary));
      return new Response(JSON.stringify({ summary }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.mode === "transactions" && Array.isArray(body.images)) {
      const startMs = Date.now();
      console.log(`Vision-extracting transactions from ${body.images.length} page image(s)`);
      const rawTxs = await visionExtractTransactions(body.images);
      const transactions = postFilter(rawTxs);
      const stats = computeStats(transactions);
      const totalMs = Date.now() - startMs;
      console.log(`Vision: ${transactions.length} transactions in ${totalMs}ms (${stats.incomeCount} income, ${stats.expenseCount} expense)`);
      return new Response(
        JSON.stringify({ transactions, method: "vision", stats, processingMs: totalMs }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "Invalid request. Expected mode='transactions' or mode='summary' with images array." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
