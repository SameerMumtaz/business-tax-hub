// AI-Powered Bank Statement Parser + Rule-Based W-2 Parser
// Uses Lovable AI Gateway (Gemini Flash) for bank statements
// Falls back to regex parser if AI fails
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

// ─── AI-Powered Parser (Primary) ─────────────────────────────────────────────

async function parseWithAI(text: string): Promise<ParsedTx[]> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: "You are a financial data extraction engine. Extract transactions from bank/credit card statement text using the provided tool.",
        },
        {
          role: "user",
          content: text,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "extract_transactions",
            description: "Extract all individual financial transactions from the statement text. Skip subtotals, running balances, section headers, account summaries, daily balances, and totals. Only include actual purchases, payments, deposits, withdrawals, and transfers.",
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
                        description: "Transaction date in YYYY-MM-DD format. Infer year from statement period if not explicit.",
                      },
                      description: {
                        type: "string",
                        description: "Cleaned merchant/payee name. Remove reference numbers, card masks, and internal codes.",
                      },
                      amount: {
                        type: "number",
                        description: "Transaction amount as a positive number (always > 0).",
                      },
                      type: {
                        type: "string",
                        enum: ["income", "expense"],
                        description: "For bank accounts: deposits/credits/refunds = income, withdrawals/debits/purchases = expense. For credit cards: payments to card = income, charges = expense.",
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
      type: t.type === "income" ? "income" as TxType : "expense" as TxType,
    }));
}

// ─── W-2 Rule-Based Parser ───────────────────────────────────────────────────

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

// ─── Regex Fallback Parser (simplified from v4) ──────────────────────────────

const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function regexFallbackParse(text: string): ParsedTx[] {
  const transactions: ParsedTx[] = [];

  // Simple line-by-line: find lines starting with a date and containing an amount
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
    const desc = remainder.slice(0, amountIdx).trim()
      .replace(/\s+/g, " ")
      .replace(/[Xx*]{4,}\s*\d{0,4}/g, "")
      .trim();

    if (!desc || desc.length < 2) continue;

    const rawAmt = lastAmount[1].replace(/[^\d.-]/g, "");
    const value = Math.abs(parseFloat(rawAmt));
    if (!value || value <= 0) continue;

    // Parse date
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
    // Date validation
    const m = t.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return false;
    const month = Number(m[2]), day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    // Dedup
    const key = `${t.date}|${t.amount.toFixed(2)}|${t.description.toLowerCase().slice(0, 50)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── HTTP Handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Support both old format { text } and new format { text, docType }
    const text = body.text || body.fullText || "";
    const docType = body.docType || "unknown";

    if (!text?.trim()) {
      return new Response(JSON.stringify({ error: "No text provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // W-2: rule-based, no AI needed
    if (docType === "w2") {
      const w2Data = parseW2(text);
      return new Response(JSON.stringify({ w2: w2Data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bank statement / unknown: try AI first, fall back to regex
    const truncated = text.length > 100000 ? text.slice(0, 100000) : text;
    let transactions: ParsedTx[] = [];
    let method = "ai";

    try {
      console.log(`Attempting AI parse for ${truncated.length} chars...`);
      transactions = await parseWithAI(truncated);
      console.log(`AI parser returned ${transactions.length} transactions`);
    } catch (aiErr) {
      const errMsg = aiErr instanceof Error ? aiErr.message : "Unknown AI error";
      console.warn(`AI parse failed (${errMsg}), falling back to regex`);

      // Surface rate limit / payment errors to client
      if (errMsg === "RATE_LIMITED") {
        return new Response(
          JSON.stringify({ error: "Rate limited — please try again in a moment" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (errMsg === "PAYMENT_REQUIRED") {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted — please add credits to your workspace" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      method = "regex";
      transactions = regexFallbackParse(truncated);
      console.log(`Regex fallback returned ${transactions.length} transactions`);
    }

    // Post-process
    transactions = postFilter(transactions);

    console.log(`Final: ${transactions.length} transactions via ${method}`);
    if (transactions.length > 0) {
      const sample = transactions.slice(0, 3).map(
        (t) => `${t.date} | ${t.type} | $${t.amount} | ${t.description.slice(0, 50)}`
      );
      console.log("Samples:", JSON.stringify(sample));
    }

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
    console.error("parse-pdf error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
