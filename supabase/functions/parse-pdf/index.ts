import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { pages } = await req.json() as {
      pages: string[]; // base64 encoded page images (data:image/png;base64,...)
    };

    if (!pages?.length) {
      return new Response(
        JSON.stringify({ error: "No pages provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Process pages in batches of up to 4 to stay within token limits
    const BATCH_SIZE = 4;
    const allTransactions: any[] = [];

    for (let i = 0; i < pages.length; i += BATCH_SIZE) {
      const batch = pages.slice(i, i + BATCH_SIZE);
      const pageRange = `pages ${i + 1}-${Math.min(i + BATCH_SIZE, pages.length)}`;

      const imageContent = batch.map((pageBase64) => ({
        type: "image_url" as const,
        image_url: { url: pageBase64, detail: "low" as const },
      }));

      const response = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
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
                content: `You are an expert bank statement parser. Extract every individual transaction from the provided bank statement page images. 
                
Rules:
- Extract ONLY actual transactions (debits, credits, deposits, withdrawals, payments, transfers)
- SKIP headers, footers, account summaries, beginning/ending balances, statement dates, bank logos, page numbers
- SKIP "balance forward", "opening balance", "closing balance", "total debits", "total credits" rows
- For each transaction, determine if it's income (credit/deposit) or expense (debit/withdrawal/payment)
- Use the ORIGINAL description exactly as shown on the statement
- Dates should be in YYYY-MM-DD format (infer the year from context if only month/day shown)
- Amounts should be positive numbers (the type field indicates income vs expense)
- If a running balance column exists, do NOT confuse it with the transaction amount`,
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Extract all transactions from these bank statement images (${pageRange}). Return every transaction you can find.`,
                  },
                  ...imageContent,
                ],
              },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "report_transactions",
                  description: "Report extracted transactions from the bank statement",
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
                              description: "Transaction date in YYYY-MM-DD format",
                            },
                            description: {
                              type: "string",
                              description: "Original transaction description from the statement",
                            },
                            amount: {
                              type: "number",
                              description: "Transaction amount as a positive number",
                            },
                            type: {
                              type: "string",
                              enum: ["income", "expense"],
                              description: "income for credits/deposits, expense for debits/withdrawals",
                            },
                          },
                          required: ["date", "description", "amount", "type"],
                          additionalProperties: false,
                        },
                      },
                      page_info: {
                        type: "string",
                        description: "Brief note about what was found on these pages",
                      },
                    },
                    required: ["transactions", "page_info"],
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
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error(`AI error on ${pageRange}:`, response.status, errText);

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
        // Skip this batch but continue
        console.error(`Skipping ${pageRange} due to error`);
        continue;
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

      if (toolCall) {
        try {
          const parsed = JSON.parse(toolCall.function.arguments);
          if (parsed.transactions?.length) {
            allTransactions.push(...parsed.transactions);
          }
          console.log(`${pageRange}: ${parsed.transactions?.length || 0} transactions, note: ${parsed.page_info}`);
        } catch (parseErr) {
          console.error(`Failed to parse response for ${pageRange}:`, parseErr);
        }
      }
    }

    // Deduplicate transactions that might span page boundaries
    const seen = new Set<string>();
    const unique = allTransactions.filter((t) => {
      const key = `${t.date}|${t.amount}|${t.description?.substring(0, 30)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return new Response(
      JSON.stringify({
        transactions: unique,
        total_pages: pages.length,
        total_extracted: unique.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("parse-pdf error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
