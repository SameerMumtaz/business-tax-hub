import { useParams } from "react-router-dom";
import { usePublicQuote, useRespondToQuote } from "@/hooks/useQuotes";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, FileText, Clock } from "lucide-react";
import { toast } from "sonner";

export default function PublicQuotePage() {
  const { token } = useParams<{ token: string }>();
  const { data: quote, isLoading, error } = usePublicQuote(token);
  const respond = useRespondToQuote();

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><p className="text-muted-foreground">Loading quote...</p></div>;
  if (error || !quote) return <div className="min-h-screen flex items-center justify-center bg-background"><p className="text-destructive">Quote not found or link is invalid.</p></div>;

  const canRespond = quote.status === "sent";
  const isExpired = quote.valid_until && new Date(quote.valid_until) < new Date();

  const handleRespond = (status: "approved" | "declined") => {
    if (!token) return;
    respond.mutate({ token, status }, {
      onSuccess: () => toast.success(status === "approved" ? "Quote accepted!" : "Quote declined"),
      onError: () => toast.error("Something went wrong"),
    });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-card rounded-lg border p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{quote.title || "Quote"}</h1>
            <p className="text-muted-foreground text-sm font-mono">{quote.quote_number}</p>
          </div>
          <Badge variant={quote.status === "approved" ? "outline" : quote.status === "declined" ? "destructive" : "secondary"} className="gap-1 capitalize">
            {quote.status === "approved" && <CheckCircle2 className="h-3 w-3" />}
            {quote.status === "declined" && <XCircle className="h-3 w-3" />}
            {quote.status === "sent" && <Clock className="h-3 w-3" />}
            {quote.status === "draft" && <FileText className="h-3 w-3" />}
            {quote.status}
          </Badge>
        </div>

        <div className="text-sm space-y-1">
          <p><span className="text-muted-foreground">To:</span> {quote.client_name}</p>
          {quote.client_email && <p><span className="text-muted-foreground">Email:</span> {quote.client_email}</p>}
          <p><span className="text-muted-foreground">Date:</span> {new Date(quote.created_at).toLocaleDateString()}</p>
          {quote.valid_until && (
            <p>
              <span className="text-muted-foreground">Valid Until:</span>{" "}
              <span className={isExpired ? "text-destructive" : ""}>{quote.valid_until}{isExpired ? " (Expired)" : ""}</span>
            </p>
          )}
        </div>

        {/* Line Items */}
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Description</th>
                <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Qty</th>
                <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Price</th>
                <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(quote.line_items || []).map((li, i) => (
                <tr key={i} className="border-t">
                  <td className="py-2.5 px-4">{li.description}</td>
                  <td className="py-2.5 px-3 text-center">{li.quantity}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(li.unit_price)}</td>
                  <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(li.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-1 text-sm ml-auto w-fit min-w-[200px]">
          <div className="flex justify-between gap-8"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{formatCurrency(quote.subtotal)}</span></div>
          {quote.tax_rate > 0 && (
            <div className="flex justify-between gap-8"><span className="text-muted-foreground">Tax ({quote.tax_rate}%)</span><span className="font-mono">{formatCurrency(quote.tax_amount)}</span></div>
          )}
          <div className="flex justify-between gap-8 font-semibold text-base border-t pt-2"><span>Total</span><span className="font-mono">{formatCurrency(quote.total)}</span></div>
        </div>

        {quote.notes && (
          <div className="bg-muted/30 rounded-md p-4 text-sm">
            <p className="font-medium text-xs text-muted-foreground mb-1">Notes</p>
            <p className="whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}

        {canRespond && !isExpired && (
          <div className="flex gap-3 pt-2">
            <Button className="flex-1" onClick={() => handleRespond("approved")} disabled={respond.isPending}>
              <CheckCircle2 className="h-4 w-4 mr-2" />Accept Quote
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => handleRespond("declined")} disabled={respond.isPending}>
              <XCircle className="h-4 w-4 mr-2" />Decline
            </Button>
          </div>
        )}

        {quote.status === "approved" && (
          <div className="text-center py-3 bg-accent/50 rounded-md">
            <p className="text-accent-foreground font-medium flex items-center justify-center gap-2"><CheckCircle2 className="h-4 w-4" />This quote has been accepted</p>
          </div>
        )}
        {quote.status === "declined" && (
          <div className="text-center py-3 bg-destructive/10 rounded-md">
            <p className="text-destructive font-medium flex items-center justify-center gap-2"><XCircle className="h-4 w-4" />This quote was declined</p>
          </div>
        )}
      </div>
    </div>
  );
}
