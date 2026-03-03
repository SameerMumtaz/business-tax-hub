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

  // Step 2: AI categorization for unmatched items (batched to avoid timeouts)
  if (useAI && needsAI.length > 0) {
    const BATCH_SIZE = 25;
    const batches: CategorizeInput[][] = [];
    for (let i = 0; i < needsAI.length; i += BATCH_SIZE) {
      batches.push(needsAI.slice(i, i + BATCH_SIZE));
    }

    const aiResults: { id: string; category: string; confidence: number }[] = [];

    for (const batch of batches) {
      try {
        const { data, error } = await supabase.functions.invoke("categorize", {
          body: {
            descriptions: batch.map((t) => ({
              id: t.id,
              description: t.description,
              type: t.type,
            })),
          },
        });

        if (!error && data?.results) {
          aiResults.push(...data.results);
        }
      } catch {
        // Batch failed, will fallback below
      }
    }

    const aiIds = new Set(aiResults.map((r) => r.id));
    for (const r of aiResults) {
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

    // Fallback for any items not returned by AI
    for (const item of needsAI) {
      if (!aiIds.has(item.id)) {
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
