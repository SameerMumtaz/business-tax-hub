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
 * Built-in keyword dictionary for instant categorization without AI.
 * Maps common vendor/description keywords to categories.
 */
const EXPENSE_KEYWORDS: Record<string, string[]> = {
  "Office Supplies": ["staples", "office depot", "officemax", "paper", "toner", "ink cartridge", "pens", "folders", "binder"],
  "Travel": ["airline", "airbnb", "hotel", "marriott", "hilton", "united air", "delta air", "southwest", "expedia", "uber", "lyft", "rental car", "hertz", "avis", "parking", "toll", "flight"],
  "Software & SaaS": ["adobe", "microsoft", "google workspace", "slack", "zoom", "dropbox", "github", "aws", "azure", "heroku", "vercel", "netlify", "figma", "notion", "jira", "atlassian", "salesforce", "hubspot", "mailchimp", "twilio", "stripe fee", "shopify", "squarespace", "canva", "openai", "anthropic"],
  "Marketing": ["facebook ads", "google ads", "meta ads", "linkedin ads", "twitter ads", "tiktok ads", "advertising", "campaign", "promotion", "social media", "seo", "marketing"],
  "Professional Services": ["legal", "attorney", "lawyer", "accountant", "accounting", "cpa", "consulting", "consultant", "advisory", "bookkeeping", "tax prep"],
  "Utilities": ["electric", "water bill", "gas bill", "internet", "comcast", "verizon", "at&t", "t-mobile", "phone bill", "utility"],
  "Insurance": ["insurance", "geico", "state farm", "allstate", "progressive", "premium", "coverage", "policy"],
  "Meals & Entertainment": ["restaurant", "cafe", "coffee", "starbucks", "mcdonald", "chipotle", "doordash", "grubhub", "uber eats", "lunch", "dinner", "catering"],
  "Equipment": ["computer", "laptop", "monitor", "keyboard", "mouse", "printer", "scanner", "hardware", "apple store", "best buy", "dell", "lenovo"],
  "Rent": ["rent", "lease", "office space", "wework", "regus", "coworking"],
  "Payroll": ["payroll", "salary", "wages", "adp", "gusto", "paychex", "bonus", "commission"],
};

const INCOME_KEYWORDS: Record<string, string[]> = {
  "Product Sales": ["product sale", "merchandise", "inventory sale", "retail sale", "shopify payout"],
  "Service Revenue": ["service", "project fee", "client payment", "invoice payment", "professional fee"],
  "Consulting": ["consulting", "advisory fee", "engagement fee"],
  "Subscription": ["subscription", "recurring", "monthly fee", "annual fee", "membership"],
  "Licensing": ["license", "licensing", "royalt"],
  "Affiliate": ["affiliate", "referral", "commission"],
  "Interest": ["interest", "dividend", "yield", "savings"],
};

function matchKeyword(description: string, type: string): { category: string; confidence: number } | null {
  const lower = description.toLowerCase();
  const dict = type === "expense" ? EXPENSE_KEYWORDS : INCOME_KEYWORDS;

  let bestMatch: { category: string; matchLen: number } | null = null;

  for (const [category, keywords] of Object.entries(dict)) {
    for (const kw of keywords) {
      if (lower.includes(kw) && (!bestMatch || kw.length > bestMatch.matchLen)) {
        bestMatch = { category, matchLen: kw.length };
      }
    }
  }

  if (bestMatch) {
    // Longer keyword matches = higher confidence
    const confidence = Math.min(0.85, 0.6 + bestMatch.matchLen * 0.02);
    return { category: bestMatch.category, confidence };
  }
  return null;
}

/**
 * Categorize transactions using a priority chain:
 * 1. Custom rules from the database
 * 2. Built-in keyword dictionary (instant, no API call)
 * 3. AI categorization (batch, only for remaining unknowns)
 * 4. Fallback to "Other"
 */
export async function categorizeTransactions(
  items: CategorizeInput[],
  useAI = true,
  onProgress?: (completed: number, total: number) => void
): Promise<CategorizationResult[]> {
  const rules = await fetchRules();
  const results: CategorizationResult[] = [];
  const needsAI: CategorizeInput[] = [];

  // Step 1: Apply custom rules, then keyword dictionary
  for (const item of items) {
    const ruleMatch = matchRule(item.description, item.type, rules);
    if (ruleMatch) {
      results.push({
        id: item.id,
        category: ruleMatch,
        confidence: 1,
        source: "rule",
      });
      continue;
    }

    const kwMatch = matchKeyword(item.description, item.type);
    if (kwMatch) {
      results.push({
        id: item.id,
        category: kwMatch.category,
        confidence: kwMatch.confidence,
        source: "keyword",
      });
      continue;
    }

    needsAI.push(item);
  }

  // Step 2: AI categorization for unmatched items (batched to avoid timeouts)
  if (useAI && needsAI.length > 0) {
    const BATCH_SIZE = 25;
    const batches: CategorizeInput[][] = [];
    for (let i = 0; i < needsAI.length; i += BATCH_SIZE) {
      batches.push(needsAI.slice(i, i + BATCH_SIZE));
    }

    const aiResults: { id: string; category: string; confidence: number }[] = [];

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      const batch = batches[bIdx];
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
      onProgress?.((bIdx + 1), batches.length);
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
