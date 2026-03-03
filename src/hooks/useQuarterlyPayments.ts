import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface QuarterlyPayment {
  id: string;
  tax_year: number;
  quarter: number;
  amount_paid: number;
  date_paid: string;
  payment_type: string;
  notes: string | null;
}

export function useQuarterlyPayments(taxYear = 2026) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["quarterly_payments", user?.id, taxYear],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quarterly_tax_payments")
        .select("*")
        .eq("user_id", user!.id)
        .eq("tax_year", taxYear)
        .order("quarter", { ascending: true });
      if (error) throw error;
      return (data || []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        tax_year: r.tax_year as number,
        quarter: r.quarter as number,
        amount_paid: Number(r.amount_paid),
        date_paid: r.date_paid as string,
        payment_type: r.payment_type as string,
        notes: r.notes as string | null,
      })) as QuarterlyPayment[];
    },
  });
}

export function useAddQuarterlyPayment() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payment: Omit<QuarterlyPayment, "id">) => {
      const { error } = await supabase.from("quarterly_tax_payments").insert({
        user_id: user!.id,
        tax_year: payment.tax_year,
        quarter: payment.quarter,
        amount_paid: payment.amount_paid,
        date_paid: payment.date_paid,
        payment_type: payment.payment_type,
        notes: payment.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quarterly_payments"] }),
  });
}

export function useDeleteQuarterlyPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quarterly_tax_payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quarterly_payments"] }),
  });
}
