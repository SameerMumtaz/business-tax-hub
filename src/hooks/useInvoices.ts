import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order: number;
}

export interface Invoice {
  id: string;
  user_id: string;
  invoice_number: string;
  client_name: string;
  client_email: string | null;
  status: "draft" | "sent" | "paid" | "overdue";
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  share_token: string | null;
  matched_sale_id: string | null;
  client_id: string | null;
  created_at: string;
  updated_at: string;
  line_items?: InvoiceLineItem[];
}

export function useInvoices() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["invoices", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, invoice_line_items(*)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        subtotal: Number(r.subtotal),
        tax_rate: Number(r.tax_rate),
        tax_amount: Number(r.tax_amount),
        total: Number(r.total),
        status: r.status as Invoice["status"],
        line_items: (r.invoice_line_items || []).map((li: any) => ({
          ...li,
          quantity: Number(li.quantity),
          unit_price: Number(li.unit_price),
          amount: Number(li.amount),
        })),
      })) as Invoice[];
    },
  });
}

export function useAddInvoice() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      invoice_number: string;
      client_name: string;
      client_email?: string;
      client_id?: string;
      issue_date: string;
      due_date?: string;
      notes?: string;
      tax_rate?: number;
      line_items: { description: string; quantity: number; unit_price: number }[];
    }) => {
      const subtotal = input.line_items.reduce((s, li) => s + li.quantity * li.unit_price, 0);
      const taxRate = input.tax_rate || 0;
      const taxAmount = subtotal * (taxRate / 100);
      const total = subtotal + taxAmount;

      const { data, error } = await supabase
        .from("invoices")
        .insert({
          user_id: user!.id,
          invoice_number: input.invoice_number,
          client_name: input.client_name,
          client_email: input.client_email || null,
          client_id: input.client_id || null,
          issue_date: input.issue_date,
          due_date: input.due_date || null,
          notes: input.notes || null,
          tax_rate: taxRate,
          subtotal,
          tax_amount: taxAmount,
          total,
        })
        .select()
        .single();
      if (error) throw error;

      if (input.line_items.length > 0) {
        const { error: liError } = await supabase
          .from("invoice_line_items")
          .insert(
            input.line_items.map((li, i) => ({
              invoice_id: data.id,
              description: li.description,
              quantity: li.quantity,
              unit_price: li.unit_price,
              amount: li.quantity * li.unit_price,
              sort_order: i,
            }))
          );
        if (liError) throw liError;
      }
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

export function useUpdateInvoiceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("invoices").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

export function useMatchInvoiceToSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoiceId, saleId }: { invoiceId: string; saleId: string | null }) => {
      const update: Record<string, unknown> = { matched_sale_id: saleId };
      if (saleId) update.status = "paid";
      const { error } = await supabase.from("invoices").update(update).eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}
