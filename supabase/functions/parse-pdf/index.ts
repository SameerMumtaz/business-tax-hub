import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = (await req.json()) as { text: string };

    if (!text?.trim()) {
      return new Response(JSON.stringify({ error: "No text provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Truncate to ~60k chars to stay within token limits
    const truncated = text.length > 60000 ? text.substring(0, 60000) : text;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert bank statement parser. You receive raw text extracted from a PDF bank statement. Extract every individual transaction.

Rules:
- Extract ONLY actual transactions (debits, credits, deposits, withdrawals, payments, transfers, checkcard purchases)
- SKIP: opening/closing/beginning/ending balances, account summaries, totals, headers, footers, legal text, marketing text, page numbers
- SKIP: "Balance forward", "Total deposits", "Total withdrawals", "Service fees" summary lines
- Date format: YYYY-MM-DD (if year is shown as 2-digit like "02/03/26", interpret as 2026)
- Amount: always positive number
- Type: "income" for deposits/credits/refunds, "expense" for withdrawals/debits/payments/purchases
- Description: the original transaction description text
- Multi-line descriptions: combine into one description
- Card transactions (CHECKCARD): these are expenses
- Zelle payments out: expenses. Zelle received: income
- Mobile deposits (BKOFAMERICA MOBILE): income
- Wire OUT: expense. Wire IN: income
- TRANSFER out: expense. Online transfer in: income`,
          },
          {
            role: "user",
            content: `Extract all transactions from this bank statement text:\n\n${truncated}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_transactions",
              description: "Report extracted transactions from bank statement text",
              parameters: {
                type: "object",
                properties: {
                  transactions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        date: { type: "string", description: "YYYY-MM-DD" },
                        description: { type: "string" },
                        amount: { type: "number", description: "Positive number" },
                        type: { type: "string", enum: ["income", "expense"] },
                      },
                      required: ["date", "description", "amount", "type"],
                      additionalProperties: false,
                    },
                  },
                  summary: { type: "string", description: "Brief summary of what was extracted" },
                },
                required: ["transactions", "summary"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "report_transactions" },
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "AI extraction failed", transactions: [] }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      return new Response(JSON.stringify({ transactions: [], summary: "No data extracted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];

    // Deduplicate
    const seen = new Set<string>();
    const unique = transactions.filter((t: any) => {
      const key = `${t.date}|${t.amount}|${(t.description || "").substring(0, 30)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`Extracted ${unique.length} transactions from ${text.length} chars of text`);

    return new Response(
      JSON.stringify({
        transactions: unique,
        summary: parsed.summary || `Extracted ${unique.length} transactions`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("parse-pdf error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
