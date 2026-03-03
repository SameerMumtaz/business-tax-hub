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
    const { transactions } = await req.json() as {
      transactions: {
        id: string;
        date: string;
        description: string;
        amount: number;
        type: string;
        category?: string;
      }[];
    };

    if (!transactions?.length) {
      return new Response(JSON.stringify({ issues: [], summary: "No transactions to audit." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const txSummary = transactions
      .map((t, i) => `${i + 1}. ${t.date} | ${t.type} | $${t.amount.toFixed(2)} | "${t.description}" | cat: ${t.category || "uncategorized"}`)
      .join("\n");

    const totalIncome = transactions
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + t.amount, 0);
    const totalExpenses = transactions
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + t.amount, 0);
    const profit = totalIncome - totalExpenses;
    const deductionRatio = totalIncome > 0 ? (totalExpenses / totalIncome * 100).toFixed(1) : "N/A";

    // Group payments by vendor for 1099 analysis
    const vendorTotals = new Map<string, number>();
    for (const t of transactions) {
      if (t.type === "expense") {
        const vendor = t.description.toLowerCase().trim();
        vendorTotals.set(vendor, (vendorTotals.get(vendor) || 0) + t.amount);
      }
    }
    const vendorSummary = Array.from(vendorTotals.entries())
      .filter(([, total]) => total >= 400) // flag vendors approaching $600
      .sort((a, b) => b[1] - a[1])
      .map(([vendor, total]) => `  - "${vendor}": $${total.toFixed(2)}${total >= 600 ? " ⚠️ EXCEEDS $600 1099 THRESHOLD" : " (approaching $600)"}`)
      .join("\n");

    const prompt = `You are a senior CPA conducting a thorough audit of a small business's imported bank transactions for tax preparation. Apply the same rigor you would to a real Schedule C filing.

=== FINANCIAL OVERVIEW ===
- Total income: $${totalIncome.toFixed(2)}
- Total expenses (deductions): $${totalExpenses.toFixed(2)}
- Net profit: $${profit.toFixed(2)}
- Deduction-to-income ratio: ${deductionRatio}%
- Transaction count: ${transactions.length}

=== VENDOR PAYMENT TOTALS (≥$400) ===
${vendorSummary || "  No vendors with payments ≥$400"}

=== TRANSACTIONS ===
${txSummary}

Perform ALL of the following CPA-level checks:

1. **DUPLICATES**: Same date + similar amount + similar description. Be strict — legitimate recurring charges (subscriptions) are NOT duplicates unless they appear multiple times in the same period.

2. **TAX DEDUCTIBILITY**: Flag expenses that are typically NOT deductible or only PARTIALLY deductible:
   - Meals & entertainment (only 50% deductible since 2023)
   - Clothing (unless uniforms/safety gear)
   - Commuting costs (home to office)
   - Political contributions, fines, penalties
   - Personal insurance premiums
   - Life insurance
   Specify which part is deductible vs not.

3. **CATEGORIZATION ACCURACY**: Check if the assigned category matches the description. Flag miscategorized items with the correct Schedule C category:
   - Advertising, Car & truck, Commissions, Contract labor, Depreciation, Insurance, Interest, Legal & professional, Office expense, Pension, Rent, Repairs, Supplies, Taxes & licenses, Travel, Meals, Utilities, Wages, Other

4. **1099 COMPLIANCE**: Flag vendors with total payments approaching or exceeding $600 — a 1099-NEC must be filed. List the vendor and total.

5. **MISSING COMMON DEDUCTIONS**: Based on the business type implied by the transactions, flag potentially missing deductions:
   - Home office deduction (if no rent/utilities seen)
   - Health insurance premiums
   - Retirement contributions (SEP-IRA, Solo 401k)
   - Professional development / education
   - Software & subscriptions
   - Vehicle / mileage deduction
   - Cell phone / internet (business portion)

6. **IRS AUDIT RED FLAGS**: Flag patterns that commonly trigger IRS scrutiny:
   - Deduction ratio > 60% of income
   - Excessive meals/entertainment deductions
   - Round-number expenses (e.g., exactly $500, $1000) — especially if frequent
   - Home office > 30% of total expenses
   - Cash transactions with no clear vendor
   - Unusually large single transactions

7. **DOCUMENTATION REQUIREMENTS**: Flag expenses that require additional documentation:
   - Any expense > $75 (receipt required)
   - Travel expenses (business purpose + itinerary needed)
   - Meals (attendees + business purpose needed)
   - Vehicle expenses (mileage log or actual expenses log needed)
   - Charitable contributions (receipt + acknowledgment)

8. **ESTIMATED TAX WARNING**: Based on profit, determine if quarterly estimated taxes are likely needed (generally if tax liability > $1,000). Provide a rough estimate.

9. **ANOMALIES**: Unusually large amounts vs average, suspicious patterns, potential personal expenses mixed with business.

10. **DATE ISSUES**: Out-of-order dates, future dates, gaps suggesting missing transactions.

IMPORTANT: Only report REAL issues you can substantiate from the data. Do not invent problems. Be specific about which transactions are affected. For each issue, provide an actionable recommendation a business owner can follow.`;

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
              content: "You are a meticulous senior CPA with 15 years of experience in small business tax preparation. You are thorough but practical — flag real issues that would affect a tax filing, not theoretical edge cases. Prioritize items by tax impact. Always cite specific transaction numbers.",
            },
            { role: "user", content: prompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "report_audit",
                description: "Report the complete CPA audit findings",
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
                            enum: [
                              "duplicate",
                              "deductibility",
                              "miscategorized",
                              "1099_compliance",
                              "missing_deduction",
                              "irs_red_flag",
                              "documentation",
                              "estimated_tax",
                              "anomaly",
                              "personal_expense",
                              "date_issue",
                            ],
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
                            enum: ["delete", "review", "recategorize", "flag", "keep", "add_deduction", "document", "file_1099"],
                          },
                          suggestion_detail: { type: "string" },
                          tax_impact: {
                            type: "string",
                            description: "Estimated dollar impact on tax liability, if applicable",
                          },
                          irs_reference: {
                            type: "string",
                            description: "Relevant IRS publication or form number, e.g. 'Pub 463' for travel",
                          },
                        },
                        required: ["type", "severity", "title", "description", "affected_indices", "suggestion", "suggestion_detail"],
                        additionalProperties: false,
                      },
                    },
                    summary: {
                      type: "string",
                      description: "Executive summary of the audit findings with overall risk assessment",
                    },
                    estimated_quarterly_tax: {
                      type: "string",
                      description: "Rough quarterly estimated tax payment recommendation based on profit",
                    },
                    risk_level: {
                      type: "string",
                      enum: ["low", "medium", "high"],
                      description: "Overall audit risk level for this set of transactions",
                    },
                  },
                  required: ["issues", "summary", "risk_level"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "report_audit" },
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

      return new Response(JSON.stringify({ issues: [], summary: "Analysis failed", risk_level: "low" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      return new Response(JSON.stringify({ issues: [], summary: "No issues detected", risk_level: "low" }), {
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
      JSON.stringify({
        issues,
        summary: parsed.summary || "Analysis complete",
        risk_level: parsed.risk_level || "low",
        estimated_quarterly_tax: parsed.estimated_quarterly_tax || null,
      }),
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
