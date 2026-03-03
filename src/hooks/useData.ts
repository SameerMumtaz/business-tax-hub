import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Expense, Sale, Contractor, Employee, ExpenseCategory } from "@/types/tax";

// ── Expenses ──

export function useExpenses() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["expenses", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("user_id", user!.id)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        date: r.date,
        vendor: r.vendor,
        description: r.description || "",
        amount: Number(r.amount),
        category: r.category as ExpenseCategory,
      })) as Expense[];
    },
  });
}

export function useAddExpense() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (expense: Omit<Expense, "id">) => {
      const { error } = await supabase.from("expenses").insert({
        user_id: user!.id,
        date: expense.date,
        vendor: expense.vendor,
        description: expense.description,
        amount: expense.amount,
        category: expense.category,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; category?: string; vendor?: string; description?: string; amount?: number; date?: string }) => {
      const update: Record<string, unknown> = {};
      if (data.category !== undefined) update.category = data.category;
      if (data.vendor !== undefined) update.vendor = data.vendor;
      if (data.description !== undefined) update.description = data.description;
      if (data.amount !== undefined) update.amount = data.amount;
      if (data.date !== undefined) update.date = data.date;
      const { error } = await supabase.from("expenses").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

export function useBulkRemoveExpenses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("expenses").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

export function useBulkUpdateExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, category }: { ids: string[]; category: string }) => {
      const { error } = await supabase.from("expenses").update({ category }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

export function useRemoveExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

// ── Sales ──

export function useSales() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["sales", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("user_id", user!.id)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        date: r.date,
        client: r.client,
        description: r.description || "",
        amount: Number(r.amount),
        invoiceNumber: r.invoice_number || "",
      })) as Sale[];
    },
  });
}

export function useAddSale() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sale: Omit<Sale, "id">) => {
      const { error } = await supabase.from("sales").insert({
        user_id: user!.id,
        date: sale.date,
        client: sale.client,
        description: sale.description,
        amount: sale.amount,
        invoice_number: sale.invoiceNumber,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales"] }),
  });
}

export function useRemoveSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales"] }),
  });
}

export function useBulkRemoveSales() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("sales").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales"] }),
  });
}

// ── Contractors ──

export function useContractors() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["contractors", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contractors")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        name: r.name,
        tin: r.tin_last4 ? `***-**-${r.tin_last4}` : "",
        totalPaid: Number(r.total_paid),
        address: r.address || "",
        payRate: r.pay_rate ? Number(r.pay_rate) : undefined,
        stateEmployed: r.state_employed || undefined,
      })) as Contractor[];
    },
  });
}

export function useAddContractor() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: { name: string; tin_last4: string; total_paid: number; address: string; pay_rate?: number; state_employed?: string }) => {
      const { error } = await supabase.from("contractors").insert({
        user_id: user!.id,
        name: c.name,
        tin_last4: c.tin_last4,
        total_paid: c.total_paid,
        address: c.address,
        pay_rate: c.pay_rate,
        state_employed: c.state_employed,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contractors"] }),
  });
}

export function useUpdateContractor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; tin_last4?: string; total_paid?: number; address?: string; pay_rate?: number; state_employed?: string }) => {
      const { error } = await supabase.from("contractors").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contractors"] }),
  });
}

export function useRemoveContractor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contractors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contractors"] }),
  });
}

// ── Employees ──

export function useEmployees() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["employees", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        name: r.name,
        ssn: r.ssn_last4 ? `***-**-${r.ssn_last4}` : "",
        address: r.address || "",
        salary: Number(r.salary),
        federalWithholding: Number(r.federal_withholding),
        stateWithholding: Number(r.state_withholding),
        socialSecurity: Number(r.social_security),
        medicare: Number(r.medicare),
        startDate: r.start_date || undefined,
        stateEmployed: r.state_employed || undefined,
      })) as Employee[];
    },
  });
}

export function useAddEmployee() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: { name: string; ssn_last4: string; address: string; salary: number; federal_withholding: number; state_withholding: number; social_security: number; medicare: number; state_employed?: string }) => {
      const { error } = await supabase.from("employees").insert({
        user_id: user!.id,
        ...e,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; ssn_last4?: string; address?: string; salary?: number; federal_withholding?: number; state_withholding?: number; social_security?: number; medicare?: number; state_employed?: string }) => {
      const { error } = await supabase.from("employees").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useRemoveEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

// ── Profile (for payer info on tax forms) ──

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });
}
