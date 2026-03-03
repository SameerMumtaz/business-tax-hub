import { ExpenseCategory, EXPENSE_CATEGORIES } from "@/types/tax";

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  originalDescription: string;
}

/**
 * Parse CSV text into transactions. Handles common bank export formats:
 * - Date, Description, Amount (positive = income, negative = expense)
 * - Date, Description, Debit, Credit
 */
export function parseCSV(csvText: string): ParsedTransaction[] {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];

  // Parse header to detect column format
  const header = lines[0].toLowerCase();
  const separator = header.includes("\t") ? "\t" : ",";
  const headers = parseCSVLine(lines[0], separator).map((h) => h.toLowerCase().trim());

  const dateIdx = headers.findIndex((h) => h.includes("date") || h.includes("posted"));
  const descIdx = headers.findIndex((h) => h.includes("description") || h.includes("memo") || h.includes("payee") || h.includes("name"));
  const amountIdx = headers.findIndex((h) => h === "amount" || h.includes("amount"));
  const debitIdx = headers.findIndex((h) => h.includes("debit") || h.includes("withdrawal"));
  const creditIdx = headers.findIndex((h) => h.includes("credit") || h.includes("deposit"));

  if (dateIdx === -1) return [];

  const transactions: ParsedTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line, separator);
    const dateStr = cols[dateIdx]?.trim();
    if (!dateStr) continue;

    const date = normalizeDate(dateStr);
    if (!date) continue;

    const description = cols[descIdx]?.trim() || "Unknown";

    let amount = 0;
    let type: "income" | "expense" = "expense";

    if (amountIdx !== -1) {
      amount = parseAmount(cols[amountIdx]);
      type = amount >= 0 ? "income" : "expense";
      amount = Math.abs(amount);
    } else if (debitIdx !== -1 || creditIdx !== -1) {
      const debit = debitIdx !== -1 ? parseAmount(cols[debitIdx]) : 0;
      const credit = creditIdx !== -1 ? parseAmount(cols[creditIdx]) : 0;
      if (credit > 0) {
        amount = credit;
        type = "income";
      } else {
        amount = Math.abs(debit);
        type = "expense";
      }
    }

    if (amount === 0) continue;

    transactions.push({
      date,
      description: cleanDescription(description),
      amount,
      type,
      originalDescription: description,
    });
  }

  return transactions;
}

function parseCSVLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === separator && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseAmount(str: string | undefined): number {
  if (!str) return 0;
  const cleaned = str.replace(/[^0-9.\-]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function normalizeDate(dateStr: string): string | null {
  // Try common date formats
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/,           // 2026-01-15
    /^(\d{2})\/(\d{2})\/(\d{4})$/,           // 01/15/2026
    /^(\d{2})-(\d{2})-(\d{4})$/,             // 01-15-2026
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,       // 1/5/2026
  ];

  // ISO format
  let match = dateStr.match(formats[0]);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;

  // MM/DD/YYYY or MM-DD-YYYY
  match = dateStr.match(formats[1]) || dateStr.match(formats[2]) || dateStr.match(formats[3]);
  if (match) return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;

  // Try Date.parse as fallback
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return null;
}

function cleanDescription(desc: string): string {
  return desc
    .replace(/\s+/g, " ")
    .replace(/^(POS|ACH|DEBIT|CREDIT|CHK|WIRE|XFER)\s*/i, "")
    .trim();
}

// Simple keyword-based auto-categorization
const CATEGORY_KEYWORDS: Record<ExpenseCategory, string[]> = {
  "Office Supplies": ["staples", "office depot", "officemax", "amazon", "paper"],
  "Travel": ["airline", "delta", "united", "american air", "southwest", "uber", "lyft", "hotel", "airbnb", "hertz", "enterprise"],
  "Software & SaaS": ["aws", "google cloud", "azure", "figma", "slack", "zoom", "adobe", "github", "notion", "dropbox", "microsoft 365"],
  "Marketing": ["google ads", "facebook ads", "meta ads", "mailchimp", "hubspot", "canva"],
  "Professional Services": ["law", "legal", "attorney", "consultant", "accounting", "cpa"],
  "Utilities": ["comcast", "verizon", "at&t", "electric", "water", "gas", "internet", "phone"],
  "Insurance": ["insurance", "geico", "state farm", "allstate", "aetna", "cigna"],
  "Meals & Entertainment": ["restaurant", "doordash", "grubhub", "uber eats", "starbucks", "coffee"],
  "Equipment": ["apple store", "dell", "lenovo", "best buy", "newegg"],
  "Rent": ["rent", "lease", "wework", "regus"],
  "Payroll": ["payroll", "gusto", "adp", "paychex"],
  "Other": [],
};

export function autoCategorize(description: string): ExpenseCategory {
  const lower = description.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category === "Other") continue;
    if (keywords.some((kw) => lower.includes(kw))) {
      return category as ExpenseCategory;
    }
  }
  return "Other";
}
