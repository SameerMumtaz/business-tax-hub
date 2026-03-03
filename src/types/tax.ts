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
  | "Vehicle & Gas"
  | "Vehicle Maintenance"
  | "Contract Labor"
  | "Repairs & Maintenance"
  | "Taxes & Licenses"
  | "Interest & Bank Fees"
  | "Supplies & Materials"
  | "Shipping & Postage"
  | "Education & Training"
  | "Commissions & Fees"
  | "Home Office"
  | "Partner Distribution"
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
  "Vehicle & Gas",
  "Vehicle Maintenance",
  "Contract Labor",
  "Repairs & Maintenance",
  "Taxes & Licenses",
  "Interest & Bank Fees",
  "Supplies & Materials",
  "Shipping & Postage",
  "Education & Training",
  "Commissions & Fees",
  "Home Office",
  "Partner Distribution",
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
  category: ExpenseCategory;
  taxCollected: number;
}

export interface Contractor {
  id: string;
  name: string;
  tin: string;
  totalPaid: number;
  address: string;
  payRate?: number;
  stateEmployed?: string;
}

export interface Employee {
  id: string;
  name: string;
  ssn: string;
  address: string;
  salary: number;
  federalWithholding: number;
  stateWithholding: number;
  socialSecurity: number;
  medicare: number;
  startDate?: string;
  stateEmployed?: string;
}

export interface ProfitAndLoss {
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  expensesByCategory: Record<string, number>;
}
