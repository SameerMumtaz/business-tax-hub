import { supabase } from "@/integrations/supabase/client";
import { invalidateRulesCache } from "@/lib/categorize";
import { toast } from "sonner";

export interface InferredPattern {
  keyword: string;
  category: string;
  type: "expense" | "income";
  count: number;
  exampleVendors: string[];
}

/**
 * Extract the likely vendor/company name from a raw bank transaction description.
 * Strips bank prefixes (POS, DEBIT, VISA, etc.), trailing reference numbers,
 * dates, and noise to isolate the actual business name.
 */
function extractVendorName(raw: string): string | null {
  // Common bank/payment prefixes to strip
  const prefixNoise = /^(pos|point of sale|debit|credit|purchase|payment|check|chk|ach|wire|txn|tran|transaction|recurring|autopay|bill pay|online|electronic|sq\s*\*|sp\s*\*|tst\s*\*|in\s*\*|pp\s*\*|paypal\s*\*?|zelle\s*(to|from)?|venmo|cash app|apple pay|google pay)\s*/gi;
  // Card brand prefixes
  const cardNoise = /^(visa|mastercard|amex|discover|mc)\s+/gi;
  // Trailing noise: dates, ref numbers, locations, card last4
  const suffixNoise = /\s+(ref\s*#?\s*\w+|seq\s*#?\s*\w+|trace\s*#?\s*\w+|conf\s*#?\s*\w+|#\w+|\d{2}\/\d{2}(\/\d{2,4})?|\d{4,}|x{2,}\d{2,4}|\*{2,}\d{2,4}|card\s*\d+|ending\s+in\s+\d+).*$/gi;
  // State/city suffixes like "NY US", "CA", "US"
  const locationSuffix = /\s+[A-Z]{2}\s+(US|USA)?\s*$/gi;

  let cleaned = raw
    .replace(/[*#_.\/\\]+/g, " ")   // normalize special chars
    .replace(/\s+/g, " ")
    .trim();

  // Repeatedly strip prefixes
  let prev = "";
  while (prev !== cleaned) {
    prev = cleaned;
    cleaned = cleaned.replace(prefixNoise, "").replace(cardNoise, "").trim();
  }

  // Strip suffixes
  cleaned = cleaned
    .replace(suffixNoise, "")
    .replace(locationSuffix, "")
    .replace(/\s+\d+\s*$/, "")       // trailing standalone numbers
    .replace(/\s+/g, " ")
    .trim();

  // Remove any remaining pure-numeric tokens
  const tokens = cleaned.split(/\s+/).filter(t => !/^\d+$/.test(t));
  cleaned = tokens.join(" ");

  // Final cleanup: lowercase, remove very short results
  const result = cleaned.toLowerCase().trim();
  if (result.length < 3) return null;

  return result;
}

/**
 * From a vendor name, produce keyword candidates: the full cleaned name
 * plus individual meaningful words (for multi-word vendors like "home depot").
 */
function extractKeywords(vendor: string): string[] {
  const vendorName = extractVendorName(vendor);
  if (!vendorName) return [];

  const noise = new Set([
    "the", "of", "and", "a", "an", "inc", "llc", "ltd", "corp", "co",
    "store", "shop", "market", "marketplace", "services", "service",
  ]);

  const keywords: string[] = [];

  // The full cleaned vendor name is the best candidate
  keywords.push(vendorName);

  // Also add individual words if multi-word (e.g. "home depot" → also "home", "depot")
  const words = vendorName.split(/\s+/).filter(w => w.length >= 3 && !noise.has(w));
  if (words.length > 1) {
    for (const w of words) {
      keywords.push(w);
    }
    // Add bigrams for 3+ word names
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      if (bigram !== vendorName) keywords.push(bigram);
    }
  }

  return keywords;
}

/**
 * Detect vendor→category patterns from a list of transactions.
 * Finds keywords that appear in 2+ transactions all categorized the same way (non-"Other").
 * Excludes patterns that already have a matching rule.
 */
export async function detectPatterns(
  transactions: { id: string; vendor: string; description?: string; category: string }[],
  type: "expense" | "income",
  userId: string
): Promise<InferredPattern[]> {
  // Get existing rules to avoid duplicates
  const { data: existingRules } = await supabase
    .from("categorization_rules")
    .select("vendor_pattern, type")
    .eq("user_id", userId);
  const existingPatterns = new Set((existingRules || []).filter(r => r.type === type).map(r => r.vendor_pattern.toLowerCase()));

  // Only consider non-"Other" categorized transactions
  const categorized = transactions.filter(t => t.category && t.category !== "Other");

  // Build keyword → { category → vendors } map
  const keywordMap: Record<string, Record<string, Set<string>>> = {};
  for (const t of categorized) {
    const keywords = extractKeywords(t.vendor);
    for (const kw of keywords) {
      if (existingPatterns.has(kw)) continue;
      if (!keywordMap[kw]) keywordMap[kw] = {};
      if (!keywordMap[kw][t.category]) keywordMap[kw][t.category] = new Set();
      keywordMap[kw][t.category].add(t.vendor);
    }
  }

  // Find patterns: keyword maps to exactly one category with 2+ unique vendors
  const patterns: InferredPattern[] = [];
  for (const [keyword, catMap] of Object.entries(keywordMap)) {
    const categories = Object.keys(catMap);
    if (categories.length !== 1) continue; // ambiguous, skip
    const category = categories[0];
    const vendors = catMap[category];
    if (vendors.size < 2) continue;
    patterns.push({
      keyword,
      category,
      type,
      count: vendors.size,
      exampleVendors: [...vendors].slice(0, 3),
    });
  }

  // Sort by count desc, prefer longer keywords (more specific)
  patterns.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.keyword.length - a.keyword.length;
  });

  // Deduplicate: if "home depot" covers the same vendors as "home", prefer "home depot"
  const seen = new Set<string>();
  const deduped: InferredPattern[] = [];
  for (const p of patterns) {
    // Check if a more specific pattern already covers these vendors
    const vendorKey = [...p.exampleVendors].sort().join("|");
    if (seen.has(vendorKey)) continue;
    seen.add(vendorKey);
    deduped.push(p);
  }

  return deduped.slice(0, 20); // Cap at 20 suggestions
}

/**
 * After a user manually categorizes a transaction, check if a pattern has emerged
 * and prompt via toast to create a rule.
 */
export async function checkForPatternAfterCategoryChange(
  changedVendor: string,
  newCategory: string,
  allTransactions: { id: string; vendor: string; description?: string; category: string }[],
  type: "expense" | "income",
  userId: string
) {
  if (newCategory === "Other") return;

  const keywords = extractKeywords(changedVendor);
  
  // Get existing rules
  const { data: existingRules } = await supabase
    .from("categorization_rules")
    .select("vendor_pattern, type")
    .eq("user_id", userId);
  const existingPatterns = new Set((existingRules || []).filter(r => r.type === type).map(r => r.vendor_pattern.toLowerCase()));

  for (const kw of keywords) {
    if (existingPatterns.has(kw)) continue;
    if (kw.length < 3) continue;

    // Count how many transactions with this keyword are in the same category
    const matching = allTransactions.filter(t =>
      t.category === newCategory && t.vendor.toLowerCase().includes(kw)
    );

    if (matching.length >= 2) {
      // Found a pattern! Show toast with create-rule action
      const totalOther = allTransactions.filter(t =>
        t.category === "Other" && t.vendor.toLowerCase().includes(kw)
      ).length;

      const message = totalOther > 0
        ? `${matching.length} "${kw}" transactions → ${newCategory}. ${totalOther} more could be auto-categorized.`
        : `${matching.length} "${kw}" transactions → ${newCategory}.`;

      toast(message, {
        description: "Create a rule to auto-categorize future imports?",
        duration: 10000,
        action: {
          label: "Create Rule",
          onClick: async () => {
            const { error } = await supabase.from("categorization_rules").insert({
              vendor_pattern: kw,
              category: newCategory,
              type,
              priority: 10,
              user_id: userId,
            });
            if (error) {
              toast.error("Failed to create rule");
              return;
            }
            invalidateRulesCache();

            // Auto-apply to remaining "Other" transactions
            const othersToUpdate = allTransactions
              .filter(t => t.category === "Other" && t.vendor.toLowerCase().includes(kw))
              .map(t => t.id);

            if (othersToUpdate.length > 0) {
              const table = type === "expense" ? "expenses" : "sales";
              await supabase.from(table).update({ category: newCategory }).in("id", othersToUpdate);
              toast.success(`✨ Rule created! ${othersToUpdate.length} more transaction${othersToUpdate.length > 1 ? "s" : ""} auto-categorized.`);
            } else {
              toast.success(`Rule created: "${kw}" → ${newCategory}`);
            }
          },
        },
      });
      return; // Only show one suggestion at a time
    }
  }
}

/**
 * Save an inferred pattern as a rule and apply it to uncategorized transactions.
 */
export async function saveInferredRule(
  pattern: InferredPattern,
  userId: string
): Promise<{ created: boolean; applied: number }> {
  const { error } = await supabase.from("categorization_rules").insert({
    vendor_pattern: pattern.keyword,
    category: pattern.category,
    type: pattern.type,
    priority: 10,
    user_id: userId,
  });

  if (error) {
    toast.error("Failed to create rule");
    return { created: false, applied: 0 };
  }

  invalidateRulesCache();

  // Apply to "Other" transactions
  let toUpdate: string[] = [];
  if (pattern.type === "expense") {
    const { data: others } = await supabase
      .from("expenses")
      .select("id, vendor")
      .eq("user_id", userId)
      .eq("category", "Other");
    toUpdate = (others || [])
      .filter(t => t.vendor.toLowerCase().includes(pattern.keyword))
      .map(t => t.id);
  } else {
    const { data: others } = await supabase
      .from("sales")
      .select("id, client")
      .eq("user_id", userId)
      .eq("category", "Other");
    toUpdate = (others || [])
      .filter(t => t.client.toLowerCase().includes(pattern.keyword))
      .map(t => t.id);
  }

  const table = pattern.type === "expense" ? "expenses" : "sales";

  if (toUpdate.length > 0) {
    await supabase.from(table).update({ category: pattern.category }).in("id", toUpdate);
  }

  return { created: true, applied: toUpdate.length };
}
