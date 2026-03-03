export type ExpenseCategory =
  | "Office Supplies"
  | "Travel"
  | "Software & SaaS"
  | "Marketing"
  | "Professional Services"
  | "Utilities"
  | "Insurance"
  | "Meals & Entertainment"
  | "Equipment"
  | "Rent"
  | "Payroll"
  | "Other";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "Office Supplies",
  "Travel",
  "Software & SaaS",
  "Marketing",
  "Professional Services",
  "Utilities",
  "Insurance",
  "Meals & Entertainment",
  "Equipment",
  "Rent",
  "Payroll",
  "Other",
];

export interface Expense {
  id: string;
  date: string;
  vendor: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
}

export interface Sale {
  id: string;
  date: string;
  client: string;
  description: string;
  amount: number;
  invoiceNumber: string;
}

export interface Contractor {
  id: string;
  name: string;
  tin: string;
  totalPaid: number;
  address: string;
}

export interface ProfitAndLoss {
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  expensesByCategory: Record<string, number>;
}
