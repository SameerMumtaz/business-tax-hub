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
    const { descriptions } = await req.json() as {
      descriptions: { id: string; description: string; type: string }[];
    };

    if (!descriptions?.length) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const expenseCategories = [
      "Office Supplies", "Travel", "Software & SaaS", "Marketing",
      "Professional Services", "Utilities", "Insurance",
      "Meals & Entertainment", "Equipment", "Rent", "Payroll", "Other",
    ];

    const incomeCategories = [
      "Product Sales", "Service Revenue", "Consulting", "Subscription",
      "Licensing", "Affiliate", "Interest", "Other",
    ];

    const prompt = `You are a business transaction categorizer. For each transaction below, return the most appropriate category.

Expense categories: ${expenseCategories.join(", ")}
Income categories: ${incomeCategories.join(", ")}

Transactions:
${descriptions.map((d, i) => `${i + 1}. [${d.type}] "${d.description}"`).join("\n")}`;

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
            { role: "system", content: "You categorize business transactions. Respond ONLY with valid JSON." },
            { role: "user", content: prompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "categorize_transactions",
                description: "Return categories for each transaction",
                parameters: {
                  type: "object",
                  properties: {
                    categories: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          index: { type: "number" },
                          category: { type: "string" },
                          confidence: { type: "number" },
                        },
                        required: ["index", "category", "confidence"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["categories"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "categorize_transactions" },
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
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
      
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    
    const results = descriptions.map((d, i) => {
      const match = parsed.categories?.find((c: any) => c.index === i + 1);
      return {
        id: d.id,
        category: match?.category || "Other",
        confidence: match?.confidence || 0,
        source: "ai" as const,
      };
    });

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("categorize error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
