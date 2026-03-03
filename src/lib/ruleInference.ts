import { supabase } from "@/integrations/supabase/client";
import { invalidateRulesCache, applyRulesToUncategorized } from "@/lib/categorize";
import { toast } from "sonner";

export interface InferredPattern {
  keyword: string;
  category: string;
  type: "expense" | "income";
  count: number; // categorized transactions supporting this suggestion
  recategorizableCount: number; // current "Other" transactions likely to be updated now
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

  if (cleaned.length < 2) return null;

  // Title Case: capitalize each word for proper display
  const titleCased = cleaned
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return titleCased;
}

/**
 * From a vendor name, produce keyword candidates: the full cleaned name
 * plus individual meaningful words (for multi-word vendors like "home depot").
 */
function extractKeywords(vendor: string): string[] {
  const vendorName = extractVendorName(vendor);
  if (!vendorName) return [];

  // Lowercase for matching purposes
  const lowerName = vendorName.toLowerCase();

  const noise = new Set([
    "the", "of", "and", "a", "an", "inc", "llc", "ltd", "corp", "co",
    "store", "shop", "market", "marketplace", "services", "service",
    // Transaction-type words that appear across all categories
    "purchase", "payment", "debit", "credit", "pos", "online", "recurring",
    "autopay", "bill", "pay", "transfer", "transaction", "check", "deposit",
    "withdrawal", "refund", "fee", "charge", "order", "sale", "return",
  ]);

  const keywords: string[] = [];

  // The full cleaned vendor name is the best candidate
  keywords.push(lowerName);

  // Also add individual words if multi-word (e.g. "home depot" → also "home", "depot")
  const words = lowerName.split(/\s+/).filter(w => w.length >= 3 && !noise.has(w));
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

  // Supporting evidence: only already categorized (non-Other) transactions
  const categorized = transactions.filter(t => t.category && t.category.toLowerCase() !== "other");
  // Impact estimate: current transactions still in Other
  const uncategorized = transactions.filter(t => !t.category || t.category.toLowerCase() === "other");

  // Build keyword → { category → { txCount, vendors } } map
  const keywordMap: Record<string, Record<string, { txCount: number; vendors: Set<string> }>> = {};
  for (const t of categorized) {
    const keywords = extractKeywords(t.vendor);
    for (const kw of keywords) {
      if (existingPatterns.has(kw)) continue;
      if (!keywordMap[kw]) keywordMap[kw] = {};
      if (!keywordMap[kw][t.category]) keywordMap[kw][t.category] = { txCount: 0, vendors: new Set() };
      keywordMap[kw][t.category].txCount += 1;
      keywordMap[kw][t.category].vendors.add(t.vendor);
    }
  }

  // Find stable patterns: keyword maps to exactly one category with 2+ transactions
  const patterns: InferredPattern[] = [];
  for (const [keyword, catMap] of Object.entries(keywordMap)) {
    const categories = Object.keys(catMap);
    if (categories.length !== 1) continue;

    const category = categories[0];
    const { txCount, vendors } = catMap[category];
    if (txCount < 2) continue;

    const recategorizableCount = uncategorized.filter(t =>
      t.vendor.toLowerCase().includes(keyword)
    ).length;

    patterns.push({
      keyword,
      category,
      type,
      count: txCount,
      recategorizableCount,
      exampleVendors: [...vendors].slice(0, 3),
    });
  }

  // Sort by evidence count desc, then longer keywords (more specific)
  patterns.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.keyword.length - a.keyword.length;
  });

  // Deduplicate near-duplicates by category + sample vendors
  const seen = new Set<string>();
  const deduped: InferredPattern[] = [];
  for (const p of patterns) {
    const vendorKey = [...p.exampleVendors].sort().join("|");
    const signature = `${p.category}::${vendorKey}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    deduped.push(p);
  }

  return deduped.slice(0, 20);
}

export interface RuleSuggestion {
  keyword: string;
  category: string;
  type: "expense" | "income";
  userId: string;
  evidenceCount: number;
  matchingTransactions: { id: string; vendor: string; description?: string; amount?: number; date?: string; category: string }[];
}

/**
 * After a user manually categorizes a transaction, check if a pattern has emerged
 * and return a RuleSuggestion for the UI to display in a dialog.
 */
export async function checkForPatternAfterCategoryChange(
  changedVendor: string,
  newCategory: string,
  allTransactions: { id: string; vendor: string; description?: string; amount?: number; date?: string; category: string }[],
  type: "expense" | "income",
  userId: string
): Promise<RuleSuggestion | null> {
  if (newCategory === "Other") return null;

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
      // Found a pattern! Return the "Other" transactions that would be affected
      const otherMatching = allTransactions.filter(t =>
        (t.category === "Other" || !t.category) && t.vendor.toLowerCase().includes(kw)
      );

      if (otherMatching.length === 0) continue;

      return {
        keyword: kw,
        category: newCategory,
        type,
        userId,
        evidenceCount: matching.length,
        matchingTransactions: otherMatching,
      };
    }
  }
  return null;
}

/**
 * Apply a confirmed rule suggestion — create the rule and update selected transaction IDs.
 */
export async function applyRuleSuggestion(
  suggestion: RuleSuggestion,
  selectedIds: string[]
): Promise<{ success: boolean; applied: number }> {
  const { keyword, category, type, userId } = suggestion;

  // Create the rule
  const { error } = await supabase.from("categorization_rules").upsert({
    vendor_pattern: keyword,
    category,
    type,
    priority: 10,
    user_id: userId,
  }, { onConflict: "vendor_pattern,type,user_id", ignoreDuplicates: false });

  if (error) {
    const { error: updateError } = await supabase
      .from("categorization_rules")
      .update({ category })
      .eq("vendor_pattern", keyword)
      .eq("type", type)
      .eq("user_id", userId);
    if (updateError) return { success: false, applied: 0 };
  }

  invalidateRulesCache();

  // Update only the selected transactions
  if (selectedIds.length > 0) {
    const table = type === "expense" ? "expenses" : "sales";
    const { error: updateErr } = await supabase
      .from(table)
      .update({ category })
      .in("id", selectedIds)
      .eq("user_id", userId);
    if (updateErr) {
      toast.error("Rule created but failed to update some transactions");
      return { success: true, applied: 0 };
    }
  }

  return { success: true, applied: selectedIds.length };
}
/**
 * Count how many current "Other" transactions match a keyword directly.
 * This is used for UX messaging only (estimate before global re-application).
 */
async function estimateRuleImpact(
  pattern: InferredPattern,
  userId: string
): Promise<number> {
  const keyword = pattern.keyword.toLowerCase();

  if (pattern.type === "expense") {
    const { data } = await supabase
      .from("expenses")
      .select("vendor, description")
      .eq("user_id", userId)
      .in("category", ["Other", "other"]);

    return (data || []).filter((row) =>
      `${row.vendor || ""} ${row.description || ""}`.toLowerCase().includes(keyword)
    ).length;
  }

  const { data } = await supabase
    .from("sales")
    .select("client, description")
    .eq("user_id", userId)
    .in("category", ["Other", "other"]);

  return (data || []).filter((row) =>
    `${row.client || ""} ${row.description || ""}`.toLowerCase().includes(keyword)
  ).length;
}

/**
 * Save an inferred pattern as a rule and apply it to uncategorized transactions.
 */
export async function saveInferredRule(
  pattern: InferredPattern,
  userId: string
): Promise<{ created: boolean; applied: number; estimatedByPattern: number }> {
  const estimatedByPattern = await estimateRuleImpact(pattern, userId);

  const { error } = await supabase.from("categorization_rules").upsert({
    vendor_pattern: pattern.keyword,
    category: pattern.category,
    type: pattern.type,
    priority: 10,
    user_id: userId,
  }, { onConflict: "vendor_pattern,type,user_id", ignoreDuplicates: false });

  if (error) {
    const { error: updateError } = await supabase
      .from("categorization_rules")
      .update({ category: pattern.category })
      .eq("vendor_pattern", pattern.keyword)
      .eq("type", pattern.type)
      .eq("user_id", userId);
    if (updateError) {
      toast.error("Failed to create rule");
      return { created: false, applied: 0, estimatedByPattern };
    }
  }

  invalidateRulesCache();

  // Run ALL rules (old + new) against ALL "Other" transactions
  const { expenseCount, salesCount } = await applyRulesToUncategorized(userId);
  const totalApplied = expenseCount + salesCount;

  return { created: true, applied: totalApplied, estimatedByPattern };
}
