import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type PageImage = {
  type: "image_url";
  image_url: { url: string; detail: "low" | "high" };
};

async function extractTransactionsWithModel(params: {
  apiKey: string;
  model: string;
  detail: "low" | "high";
  pageRange: string;
  batch: string[];
}) {
  const { apiKey, model, detail, pageRange, batch } = params;

  const imageContent: PageImage[] = batch.map((pageBase64) => ({
    type: "image_url",
    image_url: { url: pageBase64, detail },
  }));

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are an expert bank statement OCR parser. Extract ONLY ledger transactions rows. Skip opening/closing/running balances, headers, footers, summaries, totals, and account metadata. Return date (YYYY-MM-DD), description, positive amount, and type (income|expense).",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract all transaction rows from ${pageRange}. Do not include balance lines.`,
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
            description: "Report extracted transactions",
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
                    additionalProperties: false,
                  },
                },
                page_info: { type: "string" },
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
  });

  if (!response.ok) {
    const errText = await response.text();
    return { errorStatus: response.status, errorText: errText, transactions: [] as any[] };
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return { errorStatus: 0, errorText: "No tool call", transactions: [] as any[] };

  try {
    const parsed = JSON.parse(toolCall.function.arguments);
    const txns = Array.isArray(parsed.transactions) ? parsed.transactions : [];
    return { errorStatus: 0, errorText: "", transactions: txns, pageInfo: parsed.page_info || "" };
  } catch (e) {
    return { errorStatus: 0, errorText: `parse error: ${String(e)}`, transactions: [] as any[] };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pages } = (await req.json()) as { pages: string[] };

    if (!pages?.length) {
      return new Response(JSON.stringify({ error: "No pages provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const BATCH_SIZE = 4;
    const allTransactions: any[] = [];

    for (let i = 0; i < pages.length; i += BATCH_SIZE) {
      const batch = pages.slice(i, i + BATCH_SIZE);
      const pageRange = `pages ${i + 1}-${Math.min(i + BATCH_SIZE, pages.length)}`;

      // Fast path first
      const fast = await extractTransactionsWithModel({
        apiKey: LOVABLE_API_KEY,
        model: "google/gemini-2.5-flash-lite",
        detail: "low",
        pageRange,
        batch,
      });

      if (fast.errorStatus === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (fast.errorStatus === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let batchTransactions = fast.transactions;

      // Fallback 1: stronger OCR
      if (!batchTransactions.length) {
        const mid = await extractTransactionsWithModel({
          apiKey: LOVABLE_API_KEY,
          model: "google/gemini-2.5-flash",
          detail: "high",
          pageRange,
          batch,
        });
        batchTransactions = mid.transactions;
      }

      // Fallback 2: max quality, only when still empty
      if (!batchTransactions.length) {
        const strong = await extractTransactionsWithModel({
          apiKey: LOVABLE_API_KEY,
          model: "google/gemini-2.5-pro",
          detail: "high",
          pageRange,
          batch,
        });
        batchTransactions = strong.transactions;
      }

      if (batchTransactions.length) {
        allTransactions.push(...batchTransactions);
      }

      console.log(`${pageRange}: ${batchTransactions.length} transactions extracted`);
    }

    const seen = new Set<string>();
    const unique = allTransactions.filter((t) => {
      const key = `${t.date}|${t.amount}|${(t.description || "").substring(0, 30)}`;
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
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
