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
 * Strips bank prefixes (POS, DEBIT, VISA, CHECKCARD, etc.), trailing reference numbers,
 * dates, and noise to isolate the actual business name.
 */
export function extractVendorName(raw: string): string | null {
  // Common bank/payment prefixes to strip (order matters — longer first)
  const prefixNoise = /^(checkcard\s+\d{4}\s*|pos|point of sale|debit|credit|purchase\s+\d{4}\s*|purchase|payment|check|chk|ach|wire|txn|tran|transaction|recurring|autopay|bill pay|online\s+scheduled\s+payment\s+to|online|electronic|transfer|sq\s*\*|sp\s*\*|tst\s*\*|in\s*\*|pp\s*\*|paypal\s*\*?|zelle\s*(to|from)?|venmo|cash app|apple pay|google pay)\s*/gi;
  // Card brand prefixes
  const cardNoise = /^(visa|mastercard|amex|discover|mc)\s+/gi;

  let cleaned = raw
    .replace(/[*#_.\/\\:]+/g, " ")   // normalize special chars including colons
    .replace(/\s+/g, " ")
    .trim();

  // Repeatedly strip prefixes
  let prev = "";
  while (prev !== cleaned) {
    prev = cleaned;
    cleaned = cleaned.replace(prefixNoise, "").replace(cardNoise, "").trim();
  }

  // Strip CKCD and everything after it
  cleaned = cleaned.replace(/\s+CKCD\s+.*/i, "");
  
  // Strip Confirmation# and everything after
  cleaned = cleaned.replace(/\s+Confirmation\s*.*/i, "");
  
  // Strip long numeric sequences (11+ digits, like bank reference numbers)
  cleaned = cleaned.replace(/\s+\d{11,}/g, "");
  
  // Strip phone numbers (xxx-xxx-xxxx or xxxxxxxxxx)
  cleaned = cleaned.replace(/\s+\d{3}-\d{3}-\d{4}/g, "");
  cleaned = cleaned.replace(/\s+\d{10,}/g, "");
  
  // Strip masked card numbers (XXXXXXXXXXXX1234)
  cleaned = cleaned.replace(/\s+X{4,}\d{2,}/gi, "");
  cleaned = cleaned.replace(/\s+XXXX\s+XXXX\s+XXXX\s+\d{4}/gi, "");
  
  // Strip date patterns (MM/DD, MM/DD/YY, MM/DD/YYYY)
  cleaned = cleaned.replace(/\s+\d{2}\/\d{2}(\/\d{2,4})?/g, "");
  
  // Strip standalone state codes at end (2 letter + optional US)
  cleaned = cleaned.replace(/\s+[A-Z]{2}\s*$/i, "");
  cleaned = cleaned.replace(/\s+(US|USA)\s*$/i, "");
  
  // Strip ref/seq/trace numbers
  cleaned = cleaned.replace(/\s+(ref|seq|trace|conf)\s*#?\s*\w+/gi, "");
  
  // Strip store/location numbers after vendor name (e.g. "QT 378 OUTSIDE" → keep "QT", "ONCUE 0123" → keep "ONCUE")
  // But keep multi-word brand names intact
  
  // Strip trailing # followed by digits
  cleaned = cleaned.replace(/\s+#\d+/g, "");
  
  // Strip standalone numbers
  cleaned = cleaned.replace(/\s+\d+\s*/g, " ");

  // Remove location words that follow vendor names
  const locationWords = /\s+(inside|outside|drive thru|drive through|drv thru)\b/gi;
  cleaned = cleaned.replace(locationWords, "");
  
  // Strip city names that appear after the vendor (heuristic: known pattern of "VENDOR CITY STATE")
  // Remove trailing words that look like city/address (after vendor extracted)
  
  // Remove remaining special chars and normalize
  cleaned = cleaned.replace(/[^a-zA-Z\s'-]/g, " ").replace(/\s+/g, " ").trim();

  // Final: remove very short results or empty
  const result = cleaned.toLowerCase().trim();
  if (result.length < 2) return null;

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
            const { error } = await supabase.from("categorization_rules").upsert({
              vendor_pattern: kw,
              category: newCategory,
              type,
              priority: 10,
              user_id: userId,
            }, { onConflict: "vendor_pattern,type,user_id", ignoreDuplicates: false });
            if (error) {
              // If upsert also fails, try update
              const { error: updateError } = await supabase
                .from("categorization_rules")
                .update({ category: newCategory })
                .eq("vendor_pattern", kw)
                .eq("type", type)
                .eq("user_id", userId);
              if (updateError) {
                toast.error("Failed to create rule");
                return;
              }
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
  const { error } = await supabase.from("categorization_rules").upsert({
    vendor_pattern: pattern.keyword,
    category: pattern.category,
    type: pattern.type,
    priority: 10,
    user_id: userId,
  }, { onConflict: "vendor_pattern,type,user_id", ignoreDuplicates: false });

  if (error) {
    // Fallback: try update if upsert fails
    const { error: updateError } = await supabase
      .from("categorization_rules")
      .update({ category: pattern.category })
      .eq("vendor_pattern", pattern.keyword)
      .eq("type", pattern.type)
      .eq("user_id", userId);
    if (updateError) {
      toast.error("Failed to create rule");
      return { created: false, applied: 0 };
    }
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
