import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { transactions } = await req.json() as {
      transactions: {
        id: string;
        date: string;
        description: string;
        amount: number;
        type: string;
      }[];
    };

    if (!transactions?.length) {
      return new Response(JSON.stringify({ issues: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const txSummary = transactions
      .map((t, i) => `${i + 1}. ${t.date} | ${t.type} | $${t.amount.toFixed(2)} | "${t.description}"`)
      .join("\n");

    const totalIncome = transactions
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + t.amount, 0);
    const totalExpenses = transactions
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + t.amount, 0);

    const prompt = `You are a financial auditor reviewing imported bank transactions for a small business.

Summary:
- Total income: $${totalIncome.toFixed(2)}
- Total expenses: $${totalExpenses.toFixed(2)}
- Transaction count: ${transactions.length}

Transactions:
${txSummary}

Analyze these transactions for issues:
1. **Duplicates**: Transactions with the same date, amount, and similar description
2. **Anomalies**: Unusually large amounts compared to others, round-number suspicious entries
3. **Balance concerns**: Income/expense ratio issues, potential missing transactions
4. **Unknown/vague entries**: Descriptions that are too generic or meaningless (e.g., "MISCELLANEOUS", "UNKNOWN", just numbers)
5. **Potential personal expenses**: Non-business-looking transactions mixed in (e.g., entertainment, personal shopping)
6. **Date issues**: Out-of-order dates, future dates, weekend-only patterns

For each issue found, specify which transaction(s) are affected and suggest a resolution.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: "You are a meticulous financial auditor. Find real issues only — do not invent problems. Be specific about which transactions are affected.",
            },
            { role: "user", content: prompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "report_issues",
                description: "Report detected issues in the transaction data",
                parameters: {
                  type: "object",
                  properties: {
                    issues: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          type: {
                            type: "string",
                            enum: ["duplicate", "anomaly", "balance", "unknown", "personal", "date_issue"],
                          },
                          severity: {
                            type: "string",
                            enum: ["low", "medium", "high"],
                          },
                          title: { type: "string" },
                          description: { type: "string" },
                          affected_indices: {
                            type: "array",
                            items: { type: "number" },
                            description: "1-based indices of affected transactions",
                          },
                          suggestion: {
                            type: "string",
                            enum: ["delete", "review", "recategorize", "flag", "keep"],
                          },
                          suggestion_detail: { type: "string" },
                        },
                        required: ["type", "severity", "title", "description", "affected_indices", "suggestion", "suggestion_detail"],
                        additionalProperties: false,
                      },
                    },
                    summary: { type: "string" },
                  },
                  required: ["issues", "summary"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "report_issues" },
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded." }), {
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

      return new Response(JSON.stringify({ issues: [], summary: "Analysis failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      return new Response(JSON.stringify({ issues: [], summary: "No issues detected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    // Map 1-based indices to transaction IDs
    const issues = (parsed.issues || []).map((issue: any) => ({
      ...issue,
      affected_ids: (issue.affected_indices || [])
        .map((idx: number) => transactions[idx - 1]?.id)
        .filter(Boolean),
    }));

    return new Response(
      JSON.stringify({ issues, summary: parsed.summary || "Analysis complete" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("audit error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
