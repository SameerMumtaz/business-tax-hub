import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface QuoteLineItem {
  id: string;
  quote_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order: number;
}

export interface Quote {
  id: string;
  user_id: string;
  client_id: string | null;
  quote_number: string;
  title: string;
  status: "draft" | "sent" | "approved" | "declined" | "converted";
  notes: string | null;
  valid_until: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  client_name: string;
  client_email: string | null;
  share_token: string | null;
  converted_invoice_id: string | null;
  converted_job_id: string | null;
  created_at: string;
  updated_at: string;
  line_items?: QuoteLineItem[];
}

export function useQuotes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["quotes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, quote_line_items(*)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        subtotal: Number(r.subtotal),
        tax_rate: Number(r.tax_rate),
        tax_amount: Number(r.tax_amount),
        total: Number(r.total),
        status: r.status as Quote["status"],
        line_items: (r.quote_line_items || []).map((li: any) => ({
          ...li,
          quantity: Number(li.quantity),
          unit_price: Number(li.unit_price),
          amount: Number(li.amount),
        })),
      })) as Quote[];
    },
  });
}

export function useAddQuote() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      client_name: string;
      client_email?: string;
      client_id?: string;
      notes?: string;
      valid_until?: string;
      tax_rate?: number;
      line_items: { description: string; quantity: number; unit_price: number }[];
    }) => {
      const subtotal = input.line_items.reduce((s, li) => s + li.quantity * li.unit_price, 0);
      const taxRate = input.tax_rate || 0;
      const taxAmount = subtotal * (taxRate / 100);
      const total = subtotal + taxAmount;

      // Generate quote number
      const { data: existing } = await supabase
        .from("quotes")
        .select("quote_number")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1);

      let nextNum = 1;
      if (existing && existing.length > 0) {
        const match = existing[0].quote_number.match(/QT-(\d+)/);
        if (match) nextNum = parseInt(match[1], 10) + 1;
      }
      const quoteNumber = `QT-${String(nextNum).padStart(4, "0")}`;

      const { data, error } = await supabase
        .from("quotes")
        .insert({
          user_id: user!.id,
          quote_number: quoteNumber,
          title: input.title,
          client_name: input.client_name,
          client_email: input.client_email || null,
          client_id: input.client_id || null,
          notes: input.notes || null,
          valid_until: input.valid_until || null,
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
          .from("quote_line_items")
          .insert(
            input.line_items.map((li, i) => ({
              quote_id: data.id,
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  });
}

export function useUpdateQuoteStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("quotes").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  });
}

export function useDeleteQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quotes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  });
}

export function useConvertQuoteToInvoice() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (quote: Quote) => {
      // Generate invoice number
      const { data: existing } = await supabase
        .from("invoices")
        .select("invoice_number")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1);

      let invNum = `INV-${Date.now().toString().slice(-6)}`;
      if (existing && existing.length > 0) {
        const match = existing[0].invoice_number.match(/INV-(\d+)/);
        if (match) invNum = `INV-${String(parseInt(match[1], 10) + 1).padStart(4, "0")}`;
      }

      const { data, error } = await supabase
        .from("invoices")
        .insert({
          user_id: user!.id,
          invoice_number: invNum,
          client_name: quote.client_name,
          client_email: quote.client_email,
          client_id: quote.client_id,
          issue_date: new Date().toISOString().slice(0, 10),
          notes: quote.notes,
          tax_rate: quote.tax_rate,
          subtotal: quote.subtotal,
          tax_amount: quote.tax_amount,
          total: quote.total,
        })
        .select()
        .single();
      if (error) throw error;

      if (quote.line_items && quote.line_items.length > 0) {
        await supabase.from("invoice_line_items").insert(
          quote.line_items.map((li, i) => ({
            invoice_id: data.id,
            description: li.description,
            quantity: li.quantity,
            unit_price: li.unit_price,
            amount: li.amount,
            sort_order: i,
          }))
        );
      }

      // Mark quote as converted
      await supabase.from("quotes").update({ status: "converted", converted_invoice_id: data.id }).eq("id", quote.id);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useConvertQuoteToJob() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ quote, siteId }: { quote: Quote; siteId: string }) => {
      const description = quote.line_items?.map(li => `${li.description} (x${li.quantity} @ $${li.unit_price})`).join("\n") || quote.title;

      const { data, error } = await supabase
        .from("jobs")
        .insert({
          user_id: user!.id,
          title: quote.title || `Job from ${quote.quote_number}`,
          description,
          site_id: siteId,
          start_date: new Date().toISOString().slice(0, 10),
          status: "scheduled",
          job_type: "one_time",
        })
        .select()
        .single();
      if (error) throw error;

      await supabase.from("quotes").update({ converted_job_id: data.id }).eq("id", quote.id);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
    },
  });
}

/** Fetch a single quote by share token (public, no auth needed) */
export function usePublicQuote(token: string | undefined) {
  return useQuery({
    queryKey: ["public-quote", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, quote_line_items(*)")
        .eq("share_token", token!)
        .single();
      if (error) throw error;
      return {
        ...data,
        subtotal: Number(data.subtotal),
        tax_rate: Number(data.tax_rate),
        tax_amount: Number(data.tax_amount),
        total: Number(data.total),
        line_items: (data.quote_line_items || []).map((li: any) => ({
          ...li,
          quantity: Number(li.quantity),
          unit_price: Number(li.unit_price),
          amount: Number(li.amount),
        })),
      } as Quote;
    },
  });
}

export function useRespondToQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ token, status }: { token: string; status: "approved" | "declined" }) => {
      const { error } = await supabase
        .from("quotes")
        .update({ status })
        .eq("share_token", token);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["public-quote", vars.token] });
      qc.invalidateQueries({ queryKey: ["quotes"] });
    },
  });
}
