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
}

export interface AuditResult {
  issues: AuditIssue[];
  summary: string;
  riskLevel: "low" | "medium" | "high" | "";
  estimatedTax: string;
}

const PERSONAL_RX = /\b(netflix|hulu|disney\+?|spotify|apple music|gym|fitness|personal|grocery|groceries|whole foods|trader joe|planet fitness|peloton|amazon prime|youtube premium|audible|kindle unlimited)\b/i;

export function auditExpenses(expenses: Expense[]): AuditResult {
  const issues: AuditIssue[] = [];

  // 1. Duplicates
  const seen = new Map<string, Expense[]>();
  for (const e of expenses) {
    const key = `${e.date}|${e.amount.toFixed(2)}`;
    const group = seen.get(key) || [];
    group.push(e);
    seen.set(key, group);
  }
  for (const [, group] of seen) {
    if (group.length >= 2) {
      issues.push({
        type: "duplicate", severity: "medium",
        title: `Possible duplicate: ${group[0].vendor.slice(0, 40)}`,
        description: `${group.length} expenses on ${group[0].date} for $${group[0].amount.toFixed(2)} each.`,
        affected_ids: group.map((e) => e.id),
        suggestion: "review",
        suggestion_detail: "Review these — they may be duplicates from overlapping statement periods.",
      });
    }
  }

  // 2. Uncategorized
  const uncategorized = expenses.filter((e) => e.category === "Other");
  if (uncategorized.length > 0) {
    issues.push({
      type: "miscategorized", severity: uncategorized.length > 10 ? "high" : "medium",
      title: `${uncategorized.length} expense(s) uncategorized`,
      description: "Uncategorized expenses may lead to missed deductions at tax time.",
      affected_ids: uncategorized.slice(0, 10).map((e) => e.id),
      suggestion: "recategorize",
      suggestion_detail: "Edit categories or create categorization rules to auto-assign them.",
    });
  }

  // 3. Large outliers
  const amounts = expenses.map((e) => e.amount);
  const avg = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
  const threshold = Math.max(avg * 5, 5000);
  for (const e of expenses.filter((e) => e.amount > threshold)) {
    issues.push({
      type: "anomaly", severity: "low",
      title: `Large expense: $${e.amount.toFixed(2)}`,
      description: `"${e.vendor.slice(0, 50)}" is significantly above average ($${avg.toFixed(0)}).`,
      affected_ids: [e.id],
      suggestion: "review",
      suggestion_detail: "Verify this amount is correct and properly categorized.",
    });
  }

  // 4. Personal expenses
  const personal = expenses.filter((e) => PERSONAL_RX.test(e.vendor) || PERSONAL_RX.test(e.description));
  if (personal.length > 0) {
    issues.push({
      type: "personal_expense", severity: "high",
      title: `${personal.length} possible personal expense(s)`,
      description: "These look like personal rather than business expenses — an IRS red flag.",
      affected_ids: personal.map((e) => e.id),
      suggestion: "review",
      suggestion_detail: "Exclude personal expenses from business deductions or document the business purpose.",
      irs_reference: "IRC §262",
    });
  }

  // 5. Round-number expenses
  const roundExpenses = expenses.filter((e) => e.amount >= 500 && e.amount % 100 === 0);
  if (roundExpenses.length > 3) {
    issues.push({
      type: "documentation", severity: "low",
      title: `${roundExpenses.length} round-number expenses`,
      description: "Multiple round-number expenses may look like estimates to the IRS.",
      affected_ids: roundExpenses.slice(0, 5).map((e) => e.id),
      suggestion: "review",
      suggestion_detail: "Ensure you have receipts for these amounts.",
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
    issues.push({
      type: "1099_compliance", severity: "medium",
      title: `${over600.length} vendor(s) over $600 — may need 1099`,
      description: `Vendors: ${over600.map(([name, v]) => `${name} ($${v.total.toFixed(0)})`).slice(0, 5).join(", ")}`,
      affected_ids: over600.flatMap(([, v]) => v.ids).slice(0, 10),
      suggestion: "file_1099",
      suggestion_detail: "Check if these vendors are contractors and collect W-9s.",
      irs_reference: "IRC §6041",
    });
  }

  return buildResult(issues, expenses.reduce((s, e) => s + e.amount, 0));
}

export function auditSales(sales: Sale[], expenses: Expense[], matchedSaleIds?: Set<string>): AuditResult {
  const issues: AuditIssue[] = [];

  // 1. Duplicate sales
  const seen = new Map<string, Sale[]>();
  for (const s of sales) {
    const key = `${s.date}|${s.amount.toFixed(2)}`;
    const group = seen.get(key) || [];
    group.push(s);
    seen.set(key, group);
  }
  for (const [, group] of seen) {
    if (group.length >= 2) {
      issues.push({
        type: "duplicate", severity: "medium",
        title: `Possible duplicate: ${group[0].client.slice(0, 40)}`,
        description: `${group.length} sales on ${group[0].date} for $${group[0].amount.toFixed(2)} each.`,
        affected_ids: group.map((s) => s.id),
        suggestion: "review",
        suggestion_detail: "Review these — they may be duplicate entries.",
      });
    }
  }

  // 2. Large outliers
  const amounts = sales.map((s) => s.amount);
  const avg = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
  const threshold = Math.max(avg * 5, 10000);
  for (const s of sales.filter((s) => s.amount > threshold)) {
    issues.push({
      type: "anomaly", severity: "low",
      title: `Large sale: $${s.amount.toFixed(2)}`,
      description: `"${s.client.slice(0, 50)}" is significantly above average ($${avg.toFixed(0)}).`,
      affected_ids: [s.id],
      suggestion: "review",
      suggestion_detail: "Verify this amount is correct and properly documented.",
    });
  }

  // 3. Sales without matched invoices
  const unmatchedSales = matchedSaleIds
    ? sales.filter((s) => !matchedSaleIds.has(s.id))
    : sales.filter((s) => !s.invoiceNumber || s.invoiceNumber.startsWith("IMP-"));
  if (unmatchedSales.length > 0) {
    issues.push({
      type: "missing_invoice", severity: "medium",
      title: `${unmatchedSales.length} sale(s) without a matched invoice`,
      description: "Income without proper invoice documentation may complicate IRS audits and revenue tracking.",
      affected_ids: unmatchedSales.map((s) => s.id),
      suggestion: "create_invoice",
      suggestion_detail: "Create invoices for these sales to maintain proper documentation and enable reconciliation.",
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
      title: `Estimated quarterly tax: ~$${estQuarterly.toLocaleString()}`,
      description: `Net income of $${Math.round(net).toLocaleString()} may require quarterly estimated tax payments.`,
      affected_ids: [],
      suggestion: "review",
      suggestion_detail: "Use the Tax Center to calculate and track quarterly payments.",
      irs_reference: "IRC §6654",
    });
  }

  // 5. Round-number sales
  const roundSales = sales.filter((s) => s.amount >= 1000 && s.amount % 100 === 0);
  if (roundSales.length > 5) {
    issues.push({
      type: "documentation", severity: "low",
      title: `${roundSales.length} round-number sales`,
      description: "Multiple round-number amounts may look like estimates.",
      affected_ids: roundSales.slice(0, 5).map((s) => s.id),
      suggestion: "review",
      suggestion_detail: "Ensure each sale is documented with an invoice.",
    });
  }

  return buildResult(issues, totalIncome);
}

function buildResult(issues: AuditIssue[], totalAmount: number): AuditResult {
  const riskLevel = issues.some((i) => i.severity === "high") ? "high"
    : issues.some((i) => i.severity === "medium") ? "medium"
    : issues.length > 0 ? "low" : "";
  return {
    issues,
    summary: issues.length === 0
      ? "No issues detected — your data looks clean!"
      : `Found ${issues.length} issue(s) to review.`,
    riskLevel,
    estimatedTax: "",
  };
}
