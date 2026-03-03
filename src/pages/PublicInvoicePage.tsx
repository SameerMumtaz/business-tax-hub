import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { CheckCircle2, FileText, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order: number;
}

interface PublicInvoice {
  id: string;
  invoice_number: string;
  client_name: string;
  client_email: string | null;
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  status: string;
  pay_status: string;
  line_items: InvoiceLineItem[];
}

function usePublicInvoice(token: string | undefined) {
  return useQuery({
    queryKey: ["public-invoice", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, invoice_line_items(*)")
        .eq("share_token", token!)
        .single();
      if (error) throw error;
      return {
        ...data,
        subtotal: Number(data.subtotal),
        tax_rate: Number(data.tax_rate),
        tax_amount: Number(data.tax_amount),
        total: Number(data.total),
        pay_status: (data as any).pay_status || "unpaid",
        line_items: (data.invoice_line_items || [])
          .map((li: any) => ({
            ...li,
            quantity: Number(li.quantity),
            unit_price: Number(li.unit_price),
            amount: Number(li.amount),
          }))
          .sort((a: InvoiceLineItem, b: InvoiceLineItem) => a.sort_order - b.sort_order),
      } as PublicInvoice;
    },
  });
}

export default function PublicInvoicePage() {
  const { token } = useParams<{ token: string }>();
  const { data: invoice, isLoading, error } = usePublicInvoice(token);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <p className="text-muted-foreground">Loading invoice…</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center space-y-2">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto" />
          <h1 className="text-xl font-semibold">Invoice Not Found</h1>
          <p className="text-muted-foreground text-sm">This link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  const isPaid = invoice.status === "paid" || invoice.pay_status === "paid";

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Invoice Card */}
        <div className="bg-card border rounded-xl shadow-sm relative overflow-hidden">
          {/* Paid Watermark */}
          {isPaid && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="border-4 border-accent/30 text-accent/30 rounded-xl px-8 py-4 rotate-[-20deg]">
                <span className="text-6xl font-black tracking-widest">PAID</span>
              </div>
            </div>
          )}

          <div className="p-8 space-y-6 relative z-0">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Invoice</h1>
                <p className="text-lg font-mono text-muted-foreground">{invoice.invoice_number}</p>
              </div>
              <div className="text-right space-y-1">
                {isPaid ? (
                  <Badge className="bg-accent/10 text-accent-foreground border-accent/30 gap-1 text-sm px-3 py-1">
                    <CheckCircle2 className="h-4 w-4" /> Paid
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1 text-sm px-3 py-1">
                    <Clock className="h-4 w-4" /> Unpaid
                  </Badge>
                )}
              </div>
            </div>

            {/* Client & Dates */}
            <div className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Bill To</p>
                <p className="font-semibold">{invoice.client_name}</p>
                {invoice.client_email && <p className="text-muted-foreground">{invoice.client_email}</p>}
              </div>
              <div className="text-right">
                <div className="space-y-1">
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-wider">Issued</span>
                    <p className="font-mono">{invoice.issue_date}</p>
                  </div>
                  {invoice.due_date && (
                    <div>
                      <span className="text-muted-foreground text-xs uppercase tracking-wider">Due</span>
                      <p className="font-mono">{invoice.due_date}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Description</th>
                    <th className="text-right py-2.5 px-4 font-medium text-muted-foreground w-20">Qty</th>
                    <th className="text-right py-2.5 px-4 font-medium text-muted-foreground w-28">Price</th>
                    <th className="text-right py-2.5 px-4 font-medium text-muted-foreground w-28">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.line_items.map((li) => (
                    <tr key={li.id} className="border-t">
                      <td className="py-2.5 px-4">{li.description}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{li.quantity}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(li.unit_price)}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(li.amount)}</td>
                    </tr>
                  ))}
                  {invoice.line_items.length === 0 && (
                    <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">No line items</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-mono">{formatCurrency(invoice.subtotal)}</span>
                </div>
                {invoice.tax_rate > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax ({invoice.tax_rate}%)</span>
                    <span className="font-mono">{formatCurrency(invoice.tax_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1.5 font-semibold text-base">
                  <span>Total</span>
                  <span className="font-mono">{formatCurrency(invoice.total)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="border-t pt-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Powered by Bookie
        </p>
      </div>
    </div>
  );
}
