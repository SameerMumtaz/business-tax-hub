import { create } from "zustand";
import { Expense, Sale, Contractor, Employee } from "@/types/tax";

interface TaxStore {
  expenses: Expense[];
  sales: Sale[];
  contractors: Contractor[];
  employees: Employee[];
  addExpense: (expense: Expense) => void;
  removeExpense: (id: string) => void;
  updateExpenseCategory: (vendor: string, newCategory: Expense["category"]) => void;
  recategorizeAll: (rules: { vendor_pattern: string; category: string; type: string }[]) => void;
  addSale: (sale: Sale) => void;
  removeSale: (id: string) => void;
  addContractor: (contractor: Contractor) => void;
  removeContractor: (id: string) => void;
  updateContractor: (id: string, data: Partial<Contractor>) => void;
  addEmployee: (employee: Employee) => void;
  removeEmployee: (id: string) => void;
  updateEmployee: (id: string, data: Partial<Employee>) => void;
}

/**
 * Legacy Zustand store — kept for backward compatibility only.
 * All data now lives in Supabase via hooks in useData.ts.
 * Do NOT add demo data here.
 */
export const useTaxStore = create<TaxStore>((set) => ({
  expenses: [],
  sales: [],
  contractors: [],
  employees: [],
  addExpense: (expense) => set((s) => ({ expenses: [expense, ...s.expenses] })),
  removeExpense: (id) => set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) })),
  updateExpenseCategory: (vendor, newCategory) =>
    set((s) => ({
      expenses: s.expenses.map((e) =>
        e.vendor.toLowerCase().includes(vendor.toLowerCase())
          ? { ...e, category: newCategory }
          : e
      ),
    })),
  recategorizeAll: (rules) =>
    set((s) => ({
      expenses: s.expenses.map((e) => {
        const desc = e.vendor.toLowerCase();
        for (const rule of rules) {
          if (rule.type === "expense" && desc.includes(rule.vendor_pattern.toLowerCase())) {
            return { ...e, category: rule.category as Expense["category"] };
          }
        }
        return e;
      }),
    })),
  addSale: (sale) => set((s) => ({ sales: [sale, ...s.sales] })),
  removeSale: (id) => set((s) => ({ sales: s.sales.filter((e) => e.id !== id) })),
  addContractor: (contractor) => set((s) => ({ contractors: [contractor, ...s.contractors] })),
  removeContractor: (id) => set((s) => ({ contractors: s.contractors.filter((c) => c.id !== id) })),
  updateContractor: (id, data) =>
    set((s) => ({
      contractors: s.contractors.map((c) => (c.id === id ? { ...c, ...data } : c)),
    })),
  addEmployee: (employee) => set((s) => ({ employees: [employee, ...s.employees] })),
  removeEmployee: (id) => set((s) => ({ employees: s.employees.filter((e) => e.id !== id) })),
  updateEmployee: (id, data) =>
    set((s) => ({
      employees: s.employees.map((e) => (e.id === id ? { ...e, ...data } : e)),
    })),
}));
