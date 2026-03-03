import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface W2Income {
  id: string;
  employer_name: string;
  employer_ein: string | null;
  wages: number;
  federal_tax_withheld: number;
  state_tax_withheld: number;
  social_security_withheld: number;
  medicare_withheld: number;
  state: string | null;
  tax_year: number;
  notes: string | null;
}

export interface PersonalExpense {
  id: string;
  date: string;
  description: string | null;
  vendor: string;
  amount: number;
  category: string;
  tax_deductible: boolean;
  receipt_url: string | null;
}

export interface PersonalDeduction {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  tax_year: number;
}

// ─── W2 Income ───────────────────────────────────────────────
export function useW2Income(taxYear = 2026) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["w2_income", user?.id, taxYear],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("w2_income")
        .select("*")
        .eq("user_id", user!.id)
        .eq("tax_year", taxYear)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any): W2Income => ({
        id: r.id,
        employer_name: r.employer_name,
        employer_ein: r.employer_ein,
        wages: Number(r.wages),
        federal_tax_withheld: Number(r.federal_tax_withheld),
        state_tax_withheld: Number(r.state_tax_withheld),
        social_security_withheld: Number(r.social_security_withheld),
        medicare_withheld: Number(r.medicare_withheld),
        state: r.state,
        tax_year: r.tax_year,
        notes: r.notes,
      }));
    },
  });
}

export function useAddW2Income() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (income: Omit<W2Income, "id">) => {
      const { error } = await (supabase as any)
        .from("w2_income")
        .insert({ ...income, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["w2_income"] }),
  });
}

export function useUpdateW2Income() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<W2Income> & { id: string }) => {
      const { error } = await (supabase as any)
        .from("w2_income")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["w2_income"] }),
  });
}

export function useRemoveW2Income() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("w2_income")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["w2_income"] }),
  });
}

// ─── Personal Expenses ──────────────────────────────────────
export function usePersonalExpenses() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["personal_expenses", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("personal_expenses")
        .select("*")
        .eq("user_id", user!.id)
        .order("date", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []).map((r: any): PersonalExpense => ({
        id: r.id,
        date: r.date,
        description: r.description,
        vendor: r.vendor,
        amount: Number(r.amount),
        category: r.category,
        tax_deductible: r.tax_deductible,
        receipt_url: r.receipt_url,
      }));
    },
  });
}

export function useAddPersonalExpense() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (expense: Omit<PersonalExpense, "id">) => {
      const { error } = await (supabase as any)
        .from("personal_expenses")
        .insert({ ...expense, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personal_expenses"] }),
  });
}

export function useRemovePersonalExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("personal_expenses")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personal_expenses"] }),
  });
}

// ─── Personal Deductions ────────────────────────────────────
export function usePersonalDeductions(taxYear = 2026) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["personal_deductions", user?.id, taxYear],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("personal_deductions")
        .select("*")
        .eq("user_id", user!.id)
        .eq("tax_year", taxYear)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any): PersonalDeduction => ({
        id: r.id,
        category: r.category,
        description: r.description,
        amount: Number(r.amount),
        tax_year: r.tax_year,
      }));
    },
  });
}

export function useAddPersonalDeduction() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: Omit<PersonalDeduction, "id">) => {
      const { error } = await (supabase as any)
        .from("personal_deductions")
        .insert({ ...d, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personal_deductions"] }),
  });
}

export function useRemovePersonalDeduction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("personal_deductions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personal_deductions"] }),
  });
}
