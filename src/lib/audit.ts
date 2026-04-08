import { Expense, Sale } from "@/types/tax";

export interface AuditIssue {
  type: "duplicate" | "deductibility" | "miscategorized" | "1099_compliance" | "missing_deduction" | "irs_red_flag" | "documentation" | "estimated_tax" | "anomaly" | "personal_expense" | "date_issue" | "uncategorized_income" | "missing_invoice";
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  affected_ids: string[];
  suggestion: "delete" | "review" | "recategorize" | "flag" | "keep" | "add_deduction" | "document" | "file_1099" | "create_invoice";
  suggestion_detail: string;
  tax_impact?: string;
  irs_reference?: string;
  /** Dollar amount of affected transactions for priority sorting */
  dollarImpact: number;
}

export interface AuditResult {
  issues: AuditIssue[];
  summary: string;
  riskLevel: "low" | "medium" | "high" | "";
  estimatedTax: string;
  /** Total dollar value across all issues */
  totalDollarImpact: number;
}

const PERSONAL_RX = /\b(netflix|hulu|disney\+?|spotify|apple music|gym|fitness|personal|grocery|groceries|whole foods|trader joe|planet fitness|peloton|amazon prime|youtube premium|audible|kindle unlimited)\b/i;

const SEVERITY_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 };

export function auditExpenses(expenses: Expense[], dismissedSet?: Set<string>): AuditResult {
  const issues: AuditIssue[] = [];

  // 1. Duplicates
  const seen = new Map<string, Expense[]>();
  for (const e of expenses) {
    const key = `${e.date}|${e.amount.toFixed(2)}`;
    (seen.get(key) || (seen.set(key, []), seen.get(key)!)).push(e);
  }
  for (const [, group] of seen) {
    if (group.length >= 2) {
      const total = group.reduce((s, e) => s + e.amount, 0);
      issues.push({
        type: "duplicate", severity: "medium",
        title: `Possible duplicate: ${group[0].vendor.slice(0, 40)}`,
        description: `${group.length} expenses on ${group[0].date} for $${group[0].amount.toFixed(2)} each.`,
        affected_ids: group.map((e) => e.id),
        suggestion: "review",
        suggestion_detail: "Review these — they may be duplicates from overlapping statement periods.",
        dollarImpact: total,
      });
    }
  }

  // 2. Uncategorized
  const uncategorized = expenses.filter((e) => e.category === "Other" || !e.category);
  if (uncategorized.length > 0) {
    const total = uncategorized.reduce((s, e) => s + e.amount, 0);
    issues.push({
      type: "miscategorized", severity: uncategorized.length > 10 ? "high" : "medium",
      title: `${uncategorized.length} expense(s) uncategorized`,
      description: "Uncategorized expenses may lead to missed deductions at tax time.",
      affected_ids: uncategorized.slice(0, 10).map((e) => e.id),
      suggestion: "recategorize",
      suggestion_detail: "Edit categories or create categorization rules to auto-assign them.",
      dollarImpact: total,
    });
  }

  // 3. Large outliers — use median + 2 std-dev to avoid false flags
  const amounts = expenses.map((e) => e.amount);
  if (amounts.length >= 5) {
    const sorted = [...amounts].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const stdDev = Math.sqrt(amounts.reduce((s, v) => s + (v - mean) ** 2, 0) / amounts.length);
    const threshold = Math.max(median + 2 * stdDev, 5000);
    for (const e of expenses.filter((e) => e.amount > threshold)) {
      issues.push({
        type: "anomaly", severity: "low",
        title: `Large expense: $${e.amount.toFixed(2)}`,
        description: `"${e.vendor.slice(0, 50)}" is significantly above the median ($${median.toFixed(0)}).`,
        affected_ids: [e.id],
        suggestion: "review",
        suggestion_detail: "Verify this amount is correct and properly categorized.",
        dollarImpact: e.amount,
      });
    }
  }

  // 4. Personal expenses
  const personal = expenses.filter((e) => PERSONAL_RX.test(e.vendor) || PERSONAL_RX.test(e.description));
  if (personal.length > 0) {
    const total = personal.reduce((s, e) => s + e.amount, 0);
    issues.push({
      type: "personal_expense", severity: "high",
      title: `${personal.length} possible personal expense(s)`,
      description: "These look like personal rather than business expenses — an IRS red flag.",
      affected_ids: personal.map((e) => e.id),
      suggestion: "review",
      suggestion_detail: "Exclude personal expenses from business deductions or document the business purpose.",
      irs_reference: "IRC §262",
      dollarImpact: total,
    });
  }

  // 5. Round-number expenses
  const roundExpenses = expenses.filter((e) => e.amount >= 500 && e.amount % 100 === 0);
  if (roundExpenses.length > 3) {
    const total = roundExpenses.reduce((s, e) => s + e.amount, 0);
    issues.push({
      type: "documentation", severity: "low",
      title: `${roundExpenses.length} round-number expenses`,
      description: "Multiple round-number expenses may look like estimates to the IRS.",
      affected_ids: roundExpenses.slice(0, 5).map((e) => e.id),
      suggestion: "review",
      suggestion_detail: "Ensure you have receipts for these amounts.",
      dollarImpact: total,
    });
  }

  // 6. 1099 threshold
  const totalByVendor = new Map<string, { total: number; ids: string[] }>();
  for (const e of expenses) {
    const vendor = e.vendor.toLowerCase().trim();
    const existing = totalByVendor.get(vendor) || { total: 0, ids: [] };
    existing.total += e.amount;
    existing.ids.push(e.id);
    totalByVendor.set(vendor, existing);
  }
  const over600 = Array.from(totalByVendor.entries()).filter(([, v]) => v.total >= 600);
  if (over600.length > 0) {
    const total = over600.reduce((s, [, v]) => s + v.total, 0);
    issues.push({
      type: "1099_compliance", severity: "medium",
      title: `${over600.length} vendor(s) over $600 — may need 1099`,
      description: `Vendors: ${over600.map(([name, v]) => `${name} ($${v.total.toFixed(0)})`).slice(0, 5).join(", ")}`,
      affected_ids: over600.flatMap(([, v]) => v.ids).slice(0, 10),
      suggestion: "file_1099",
      suggestion_detail: "Check if these vendors are contractors and collect W-9s.",
      irs_reference: "IRC §6041",
      dollarImpact: total,
    });
  }

  return buildResult(issues, dismissedSet);
}

export function auditSales(sales: Sale[], expenses: Expense[], matchedSaleIds?: Set<string>, dismissedSet?: Set<string>): AuditResult {
  const issues: AuditIssue[] = [];

  // 1. Duplicate sales
  const seen = new Map<string, Sale[]>();
  for (const s of sales) {
    const key = `${s.date}|${s.amount.toFixed(2)}`;
    (seen.get(key) || (seen.set(key, []), seen.get(key)!)).push(s);
  }
  for (const [, group] of seen) {
    if (group.length >= 2) {
      const total = group.reduce((s, r) => s + r.amount, 0);
      issues.push({
        type: "duplicate", severity: "medium",
        title: `Possible duplicate: ${group[0].client.slice(0, 40)}`,
        description: `${group.length} sales on ${group[0].date} for $${group[0].amount.toFixed(2)} each.`,
        affected_ids: group.map((s) => s.id),
        suggestion: "review",
        suggestion_detail: "Review these — they may be duplicate entries.",
        dollarImpact: total,
      });
    }
  }

  // 2. Large outliers — use median + 2 std-dev, separate from expense threshold
  const amounts = sales.map((s) => s.amount);
  if (amounts.length >= 5) {
    const sorted = [...amounts].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const stdDev = Math.sqrt(amounts.reduce((s, v) => s + (v - mean) ** 2, 0) / amounts.length);
    const threshold = Math.max(median + 2 * stdDev, 10000);
    for (const s of sales.filter((s) => s.amount > threshold)) {
      issues.push({
        type: "anomaly", severity: "low",
        title: `Large sale: $${s.amount.toFixed(2)}`,
        description: `"${s.client.slice(0, 50)}" is significantly above the median ($${median.toFixed(0)}).`,
        affected_ids: [s.id],
        suggestion: "review",
        suggestion_detail: "Verify this amount is correct and properly documented.",
        dollarImpact: s.amount,
      });
    }
  }

  // 3. Sales without matched invoices
  const unmatchedSales = matchedSaleIds
    ? sales.filter((s) => !matchedSaleIds.has(s.id))
    : sales.filter((s) => !s.invoiceNumber || s.invoiceNumber.startsWith("IMP-"));
  if (unmatchedSales.length > 0) {
    const total = unmatchedSales.reduce((s, r) => s + r.amount, 0);
    issues.push({
      type: "missing_invoice", severity: "medium",
      title: `${unmatchedSales.length} sale(s) without a matched invoice`,
      description: `${formatDollar(total)} in income without proper invoice documentation.`,
      affected_ids: unmatchedSales.map((s) => s.id),
      suggestion: "create_invoice",
      suggestion_detail: "Click a sale below to create an invoice, or use 'Create All' to batch-generate invoices for all unmatched sales.",
      dollarImpact: total,
    });
  }

  // 4. Estimated quarterly tax
  const totalIncome = sales.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const net = totalIncome - totalExpenses;
  if (net > 1000) {
    const estQuarterly = Math.round(net * 0.3 / 4);
    issues.push({
      type: "estimated_tax", severity: "medium",
      title: `Estimated quarterly tax: ~${formatDollar(estQuarterly)}`,
      description: `Net income of ${formatDollar(Math.round(net))} may require quarterly estimated tax payments.`,
      affected_ids: [],
      suggestion: "review",
      suggestion_detail: "Use the Tax Center to calculate and track quarterly payments.",
      irs_reference: "IRC §6654",
      dollarImpact: estQuarterly,
    });
  }

  // 5. Round-number sales
  const roundSales = sales.filter((s) => s.amount >= 1000 && s.amount % 100 === 0);
  if (roundSales.length > 5) {
    const total = roundSales.reduce((s, r) => s + r.amount, 0);
    issues.push({
      type: "documentation", severity: "low",
      title: `${roundSales.length} round-number sales`,
      description: "Multiple round-number amounts may look like estimates.",
      affected_ids: roundSales.slice(0, 5).map((s) => s.id),
      suggestion: "review",
      suggestion_detail: "Ensure each sale is documented with an invoice.",
      dollarImpact: total,
    });
  }

  return buildResult(issues, dismissedSet);
}

function formatDollar(n: number): string {
  return `$${n.toLocaleString()}`;
}

function buildResult(issues: AuditIssue[], dismissedSet?: Set<string>): AuditResult {
  // Filter out issues where ALL affected_ids have been dismissed for that issue type
  if (dismissedSet && dismissedSet.size > 0) {
    for (const issue of issues) {
      issue.affected_ids = issue.affected_ids.filter(
        (id) => !dismissedSet.has(`${id}::${issue.type}`)
      );
    }
    // Remove issues that have no remaining affected transactions
    issues = issues.filter((issue) => {
      // Keep issues with no affected_ids (like estimated_tax) unless explicitly dismissed
      if (issue.affected_ids.length === 0 && issue.type !== "estimated_tax") return false;
      return true;
    });
  }
  // Sort by severity weight × dollar impact (highest first)
  issues.sort((a, b) => {
    const scoreA = (SEVERITY_WEIGHT[a.severity] || 1) * a.dollarImpact;
    const scoreB = (SEVERITY_WEIGHT[b.severity] || 1) * b.dollarImpact;
    return scoreB - scoreA;
  });

  const riskLevel = issues.some((i) => i.severity === "high") ? "high"
    : issues.some((i) => i.severity === "medium") ? "medium"
    : issues.length > 0 ? "low" : "";
  const totalDollarImpact = issues.reduce((s, i) => s + i.dollarImpact, 0);

  return {
    issues,
    summary: issues.length === 0
      ? "No issues detected — your data looks clean!"
      : `Found ${issues.length} issue(s) affecting ${formatDollar(Math.round(totalDollarImpact))} — sorted by priority.`,
    riskLevel,
    estimatedTax: "",
    totalDollarImpact,
  };
}
