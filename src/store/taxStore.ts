import { create } from "zustand";
import { Expense, Sale, Contractor } from "@/types/tax";

interface TaxStore {
  expenses: Expense[];
  sales: Sale[];
  contractors: Contractor[];
  addExpense: (expense: Expense) => void;
  removeExpense: (id: string) => void;
  updateExpenseCategory: (vendor: string, newCategory: Expense["category"]) => void;
  recategorizeAll: (rules: { vendor_pattern: string; category: string; type: string }[]) => void;
  addSale: (sale: Sale) => void;
  removeSale: (id: string) => void;
  addContractor: (contractor: Contractor) => void;
  removeContractor: (id: string) => void;
  updateContractor: (id: string, data: Partial<Contractor>) => void;
}

// Demo data
const demoExpenses: Expense[] = [
  { id: "e1", date: "2026-01-15", vendor: "Amazon Web Services", description: "Cloud hosting", amount: 2340, category: "Software & SaaS" },
  { id: "e2", date: "2026-01-20", vendor: "WeWork", description: "Office space", amount: 4500, category: "Rent" },
  { id: "e3", date: "2026-02-01", vendor: "Google Ads", description: "Ad campaign Q1", amount: 3200, category: "Marketing" },
  { id: "e4", date: "2026-02-05", vendor: "Delta Airlines", description: "Client meeting travel", amount: 890, category: "Travel" },
  { id: "e5", date: "2026-02-10", vendor: "Staples", description: "Office supplies", amount: 245, category: "Office Supplies" },
  { id: "e6", date: "2026-02-15", vendor: "Johnson & Associates", description: "Legal consultation", amount: 1500, category: "Professional Services" },
  { id: "e7", date: "2026-02-20", vendor: "Comcast Business", description: "Internet service", amount: 180, category: "Utilities" },
  { id: "e8", date: "2026-03-01", vendor: "Figma", description: "Design tool subscription", amount: 75, category: "Software & SaaS" },
];

const demoSales: Sale[] = [
  { id: "s1", date: "2026-01-10", client: "Acme Corp", description: "Website redesign", amount: 15000, invoiceNumber: "INV-001" },
  { id: "s2", date: "2026-01-25", client: "TechStart Inc", description: "Mobile app development", amount: 28000, invoiceNumber: "INV-002" },
  { id: "s3", date: "2026-02-08", client: "Global Retail Co", description: "E-commerce integration", amount: 12500, invoiceNumber: "INV-003" },
  { id: "s4", date: "2026-02-18", client: "HealthFirst", description: "Dashboard analytics", amount: 9800, invoiceNumber: "INV-004" },
  { id: "s5", date: "2026-03-01", client: "EduLearn", description: "LMS platform", amount: 22000, invoiceNumber: "INV-005" },
];

const demoContractors: Contractor[] = [
  { id: "c1", name: "Sarah Chen", tin: "***-**-4521", totalPaid: 18500, address: "123 Oak St, Austin, TX 78701" },
  { id: "c2", name: "Marcus Johnson", tin: "***-**-7832", totalPaid: 12000, address: "456 Elm Ave, Portland, OR 97201" },
  { id: "c3", name: "Elena Rodriguez", tin: "***-**-3294", totalPaid: 8750, address: "789 Pine Rd, Denver, CO 80202" },
];

export const useTaxStore = create<TaxStore>((set) => ({
  expenses: demoExpenses,
  sales: demoSales,
  contractors: demoContractors,
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
}));
