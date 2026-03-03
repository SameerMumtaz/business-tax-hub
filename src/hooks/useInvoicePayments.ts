import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  amount: number;
  date_paid: string;
  method: string | null;
  notes: string | null;
}

export function useInvoicePayments(invoiceId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["invoice_payments", user?.id, invoiceId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("invoice_payments")
        .select("*")
        .eq("user_id", user!.id)
        .order("date_paid", { ascending: true });
      if (invoiceId) q = q.eq("invoice_id", invoiceId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        invoice_id: r.invoice_id as string,
        amount: Number(r.amount),
        date_paid: r.date_paid as string,
        method: r.method as string | null,
        notes: r.notes as string | null,
      })) as InvoicePayment[];
    },
  });
}

export function useAddInvoicePayment() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payment: Omit<InvoicePayment, "id">) => {
      const { error } = await supabase.from("invoice_payments").insert({
        user_id: user!.id,
        invoice_id: payment.invoice_id,
        amount: payment.amount,
        date_paid: payment.date_paid,
        method: payment.method,
        notes: payment.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice_payments"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useDeleteInvoicePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoice_payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice_payments"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}
