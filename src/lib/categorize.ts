import { supabase } from "@/integrations/supabase/client";
import { ExpenseCategory, EXPENSE_CATEGORIES } from "@/types/tax";

export interface CategorizationResult {
  id: string;
  category: string;
  confidence: number;
  source: "rule" | "ai" | "keyword";
}

interface CategorizeInput {
  id: string;
  description: string;
  type: "income" | "expense";
}

/**
 * Fetch user-defined rules from the database.
 */
async function fetchRules() {
  const { data } = await supabase
    .from("categorization_rules")
    .select("*")
    .order("priority", { ascending: false });
  return data || [];
}

/**
 * Match a description against custom rules.
 */
function matchRule(
  description: string,
  type: string,
  rules: { vendor_pattern: string; category: string; type: string }[]
): string | null {
  const lower = description.toLowerCase();
  for (const rule of rules) {
    if (rule.type === type && lower.includes(rule.vendor_pattern.toLowerCase())) {
      return rule.category;
    }
  }
  return null;
}

/**
 * Categorize transactions using a priority chain:
 * 1. Custom rules from the database
 * 2. AI categorization (batch)
 * 3. Fallback to "Other"
 */
export async function categorizeTransactions(
  items: CategorizeInput[],
  useAI = true
): Promise<CategorizationResult[]> {
  const rules = await fetchRules();
  const results: CategorizationResult[] = [];
  const needsAI: CategorizeInput[] = [];

  // Step 1: Apply custom rules
  for (const item of items) {
    const ruleMatch = matchRule(item.description, item.type, rules);
    if (ruleMatch) {
      results.push({
        id: item.id,
        category: ruleMatch,
        confidence: 1,
        source: "rule",
      });
    } else {
      needsAI.push(item);
    }
  }

  // Step 2: AI categorization for unmatched items
  if (useAI && needsAI.length > 0) {
    try {
      const { data, error } = await supabase.functions.invoke("categorize", {
        body: {
          descriptions: needsAI.map((t) => ({
            id: t.id,
            description: t.description,
            type: t.type,
          })),
        },
      });

      if (!error && data?.results) {
        for (const r of data.results) {
          // Validate the AI category is valid for expenses
          const item = needsAI.find((n) => n.id === r.id);
          if (item?.type === "expense" && !EXPENSE_CATEGORIES.includes(r.category as ExpenseCategory)) {
            r.category = "Other";
          }
          results.push({
            id: r.id,
            category: r.category,
            confidence: r.confidence,
            source: "ai",
          });
        }
        // Remove AI-categorized items from the needsAI list
        const aiIds = new Set(data.results.map((r: any) => r.id));
        const stillNeeds = needsAI.filter((n) => !aiIds.has(n.id));
        // Fallback for any missed items
        for (const item of stillNeeds) {
          results.push({
            id: item.id,
            category: "Other",
            confidence: 0,
            source: "keyword",
          });
        }
      } else {
        // AI failed, fallback all to Other
        for (const item of needsAI) {
          results.push({
            id: item.id,
            category: "Other",
            confidence: 0,
            source: "keyword",
          });
        }
      }
    } catch {
      // AI call failed, fallback
      for (const item of needsAI) {
        results.push({
          id: item.id,
          category: "Other",
          confidence: 0,
          source: "keyword",
        });
      }
    }
  } else {
    // No AI, fallback for remaining
    for (const item of needsAI) {
      results.push({
        id: item.id,
        category: "Other",
        confidence: 0,
        source: "keyword",
      });
    }
  }

  return results;
}
