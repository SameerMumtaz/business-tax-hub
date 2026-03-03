import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useInvoices, useAddInvoice, useUpdateInvoiceStatus, useDeleteInvoice, useMatchInvoiceToSale, useGenerateRecurringInvoice, Invoice } from "@/hooks/useInvoices";
import { useClients } from "@/hooks/useClients";
import { useSales } from "@/hooks/useData";
import { formatCurrency } from "@/lib/format";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Send, FileText, Link2, CheckCircle2, AlertCircle, Clock, X, RefreshCw, Repeat } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  draft: { label: "Draft", variant: "secondary", icon: FileText },
  sent: { label: "Sent", variant: "default", icon: Send },
  paid: { label: "Paid", variant: "outline", icon: CheckCircle2 },
  overdue: { label: "Overdue", variant: "destructive", icon: AlertCircle },
};

export default function InvoicesPage() {
  const { data: invoices = [] } = useInvoices();
  const { data: sales = [] } = useSales();
  const { data: clients = [] } = useClients();
  const addInvoice = useAddInvoice();
  const updateStatus = useUpdateInvoiceStatus();
  const deleteInvoice = useDeleteInvoice();
  const matchToSale = useMatchInvoiceToSale();
  const generateRecurring = useGenerateRecurringInvoice();

  const [createOpen, setCreateOpen] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Create form
  const [form, setForm] = useState({
    invoice_number: "",
    client_name: "",
    client_email: "",
    client_id: "",
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    notes: "",
    tax_rate: "0",
    is_recurring: false,
    recurring_interval: "monthly",
    recurring_end_date: "",
    line_items: [{ description: "", quantity: "1", unit_price: "" }] as { description: string; quantity: string; unit_price: string }[],
  });

  const handleSelectClient = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (client) {
      setForm({ ...form, client_id: clientId, client_name: client.name, client_email: client.email || "" });
    }
  };

  const addLineItem = () => setForm({ ...form, line_items: [...form.line_items, { description: "", quantity: "1", unit_price: "" }] });
  const removeLineItem = (i: number) => setForm({ ...form, line_items: form.line_items.filter((_, idx) => idx !== i) });
  const updateLineItem = (i: number, field: string, value: string) => {
    const items = [...form.line_items];
    items[i] = { ...items[i], [field]: value };
    setForm({ ...form, line_items: items });
  };

  const formSubtotal = form.line_items.reduce((s, li) => s + (parseFloat(li.quantity) || 0) * (parseFloat(li.unit_price) || 0), 0);
  const formTax = formSubtotal * ((parseFloat(form.tax_rate) || 0) / 100);
  const formTotal = formSubtotal + formTax;

  const handleCreate = () => {
    if (!form.invoice_number || !form.client_name || !form.issue_date) {
      toast.error("Fill required fields"); return;
    }
    addInvoice.mutate({
      invoice_number: form.invoice_number,
      client_name: form.client_name,
      client_email: form.client_email || undefined,
      client_id: form.client_id || undefined,
      issue_date: form.issue_date,
      due_date: form.due_date || undefined,
      notes: form.notes || undefined,
      tax_rate: parseFloat(form.tax_rate) || 0,
      is_recurring: form.is_recurring,
      recurring_interval: form.is_recurring ? form.recurring_interval : undefined,
      recurring_next_date: form.is_recurring ? form.issue_date : undefined,
      recurring_end_date: form.is_recurring && form.recurring_end_date ? form.recurring_end_date : undefined,
      line_items: form.line_items.filter(li => li.description && li.unit_price).map(li => ({
        description: li.description,
        quantity: parseFloat(li.quantity) || 1,
        unit_price: parseFloat(li.unit_price) || 0,
      })),
    }, {
      onSuccess: () => {
        setForm({ invoice_number: "", client_name: "", client_email: "", client_id: "", issue_date: new Date().toISOString().slice(0, 10), due_date: "", notes: "", tax_rate: "0", is_recurring: false, recurring_interval: "monthly", recurring_end_date: "", line_items: [{ description: "", quantity: "1", unit_price: "" }] });
        setCreateOpen(false);
        toast.success("Invoice created");
      },
      onError: () => toast.error("Failed to create invoice"),
    });
  };

  const handleMarkSent = (id: string) => {
    updateStatus.mutate({ id, status: "sent" }, { onSuccess: () => toast.success("Marked as Sent") });
  };

  const handleMarkOverdue = (id: string) => {
    updateStatus.mutate({ id, status: "overdue" }, { onSuccess: () => toast.success("Marked as Overdue") });
  };

  const handleCopyLink = (token: string | null) => {
    if (!token) return;
    const url = `${window.location.origin}/invoice/view/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Share link copied to clipboard");
  };

  const handleGeneratePDF = (inv: Invoice) => {
    const items = inv.line_items || [];
    const lines = items.map(li => `${li.description} | Qty: ${li.quantity} | ${formatCurrency(li.unit_price)} | ${formatCurrency(li.amount)}`).join("\n");
    const content = `
INVOICE ${inv.invoice_number}
========================================
To: ${inv.client_name}${inv.client_email ? ` (${inv.client_email})` : ""}
Date: ${inv.issue_date}${inv.due_date ? `\nDue: ${inv.due_date}` : ""}

Items:
${lines || "No items"}

Subtotal: ${formatCurrency(inv.subtotal)}
Tax (${inv.tax_rate}%): ${formatCurrency(inv.tax_amount)}
TOTAL: ${formatCurrency(inv.total)}
${inv.notes ? `\nNotes: ${inv.notes}` : ""}
    `.trim();

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice-${inv.invoice_number}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Invoice downloaded");
  };

  // Reconciliation — auto-suggest matches
  const unmatchedInvoices = invoices.filter(inv => !inv.matched_sale_id && inv.status !== "draft");
  const matchedSaleIds = new Set(invoices.filter(inv => inv.matched_sale_id).map(inv => inv.matched_sale_id));
  const unmatchedSales = sales.filter(s => !matchedSaleIds.has(s.id));

  const suggestions = useMemo(() => {
    return unmatchedInvoices.map(inv => {
      const candidates = unmatchedSales
        .map(sale => {
          let score = 0;
          // Amount match (within 1%)
          if (Math.abs(sale.amount - inv.total) / Math.max(inv.total, 1) < 0.01) score += 50;
          else if (Math.abs(sale.amount - inv.total) / Math.max(inv.total, 1) < 0.05) score += 20;
          // Client name match
          if (sale.client.toLowerCase().includes(inv.client_name.toLowerCase()) || inv.client_name.toLowerCase().includes(sale.client.toLowerCase())) score += 30;
          // Date proximity (within 30 days)
          const daysDiff = Math.abs(new Date(sale.date).getTime() - new Date(inv.issue_date).getTime()) / (1000 * 60 * 60 * 24);
          if (daysDiff < 7) score += 20;
          else if (daysDiff < 30) score += 10;
          return { sale, score };
        })
        .filter(c => c.score >= 20)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      return { invoice: inv, candidates };
    }).filter(s => s.candidates.length > 0);
  }, [unmatchedInvoices, unmatchedSales]);

  const handleMatch = (invoiceId: string, saleId: string) => {
    matchToSale.mutate({ invoiceId, saleId }, {
      onSuccess: () => toast.success("Invoice matched and marked as Paid"),
      onError: () => toast.error("Failed to match"),
    });
  };

  const handleUnmatch = (invoiceId: string) => {
    matchToSale.mutate({ invoiceId, saleId: null }, {
      onSuccess: () => toast.success("Match removed"),
    });
  };

  const filtered = filterStatus === "all" ? invoices : invoices.filter(inv => inv.status === filterStatus);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {invoices.length} invoices — {invoices.filter(i => i.status === "paid").length} paid
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Invoice</Button></DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Input placeholder="Invoice # *" value={form.invoice_number} onChange={e => setForm({ ...form, invoice_number: e.target.value })} />
                    <div>
                      <Select value={form.client_id} onValueChange={handleSelectClient}>
                        <SelectTrigger><SelectValue placeholder="Select Saved Client" /></SelectTrigger>
                        <SelectContent>
                          {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.email ? ` (${c.email})` : ""}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input placeholder="Client Name *" value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} />
                    <Input placeholder="Client Email" value={form.client_email} onChange={e => setForm({ ...form, client_email: e.target.value })} />
                    <Input type="date" value={form.issue_date} onChange={e => setForm({ ...form, issue_date: e.target.value })} />
                    <Input type="date" placeholder="Due Date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
                    <Input type="number" placeholder="Tax Rate %" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">Line Items</label>
                      <Button variant="outline" size="sm" onClick={addLineItem}><Plus className="h-3 w-3 mr-1" />Add</Button>
                    </div>
                    <div className="space-y-2">
                      {form.line_items.map((li, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <Input placeholder="Description" className="flex-1" value={li.description} onChange={e => updateLineItem(i, "description", e.target.value)} />
                          <Input type="number" placeholder="Qty" className="w-20" value={li.quantity} onChange={e => updateLineItem(i, "quantity", e.target.value)} />
                          <Input type="number" placeholder="Price" className="w-28" value={li.unit_price} onChange={e => updateLineItem(i, "unit_price", e.target.value)} />
                          <span className="text-sm font-mono w-24 text-right">{formatCurrency((parseFloat(li.quantity) || 0) * (parseFloat(li.unit_price) || 0))}</span>
                          {form.line_items.length > 1 && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeLineItem(i)}><X className="h-3 w-3" /></Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <Textarea placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />

                  {/* Recurring toggle */}
                  <div className="border-t pt-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="is_recurring"
                        checked={form.is_recurring}
                        onCheckedChange={(checked) => setForm({ ...form, is_recurring: !!checked })}
                      />
                      <label htmlFor="is_recurring" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                        <Repeat className="h-3.5 w-3.5" /> Make this a recurring invoice
                      </label>
                    </div>
                    {form.is_recurring && (
                      <div className="grid grid-cols-2 gap-3 pl-6">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Interval</label>
                          <Select value={form.recurring_interval} onValueChange={v => setForm({ ...form, recurring_interval: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="quarterly">Quarterly</SelectItem>
                              <SelectItem value="yearly">Yearly</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">End Date (optional)</label>
                          <Input type="date" value={form.recurring_end_date} onChange={e => setForm({ ...form, recurring_end_date: e.target.value })} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-3 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{formatCurrency(formSubtotal)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Tax ({form.tax_rate}%)</span><span className="font-mono">{formatCurrency(formTax)}</span></div>
                    <div className="flex justify-between font-semibold"><span>Total</span><span className="font-mono">{formatCurrency(formTotal)}</span></div>
                  </div>

                  <Button onClick={handleCreate} className="w-full" disabled={addInvoice.isPending}>Create Invoice</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs defaultValue="invoices">
          <TabsList>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
          </TabsList>

          <TabsContent value="invoices" className="mt-4">
            <div className="stat-card overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Client</th>
                    <th>Date</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th className="text-right">Total</th>
                    <th>Matched</th>
                    <th className="w-40">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(inv => {
                    const cfg = STATUS_CONFIG[inv.status] || STATUS_CONFIG.draft;
                    const Icon = cfg.icon;
                    return (
                      <tr key={inv.id}>
                        <td className="font-medium">
                          <span>{inv.invoice_number}</span>
                          {inv.is_recurring && (
                            <Badge variant="secondary" className="ml-2 text-xs gap-1"><Repeat className="h-3 w-3" />{inv.recurring_interval}</Badge>
                          )}
                          {inv.recurring_parent_id && (
                            <Badge variant="outline" className="ml-1 text-xs">auto</Badge>
                          )}
                        </td>
                        <td>{inv.client_name}</td>
                        <td className="font-mono text-xs text-muted-foreground">{inv.issue_date}</td>
                        <td className="font-mono text-xs text-muted-foreground">{inv.due_date || "—"}</td>
                        <td>
                          <Badge variant={cfg.variant} className="gap-1">
                            <Icon className="h-3 w-3" />{cfg.label}
                          </Badge>
                        </td>
                        <td className="text-right font-mono">{formatCurrency(inv.total)}</td>
                        <td>
                          {inv.matched_sale_id ? (
                            <Badge variant="outline" className="gap-1 text-xs">
                              <CheckCircle2 className="h-3 w-3" />Matched
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td>
                          <div className="flex gap-1">
                            {inv.status === "draft" && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMarkSent(inv.id)} title="Mark Sent">
                                <Send className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {inv.status === "sent" && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMarkOverdue(inv.id)} title="Mark Overdue">
                                <AlertCircle className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopyLink(inv.share_token)} title="Copy Link">
                              <Link2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleGeneratePDF(inv)} title="Download">
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { deleteInvoice.mutate(inv.id); toast.success("Deleted"); }} title="Delete">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                            {inv.is_recurring && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                                generateRecurring.mutate(inv, {
                                  onSuccess: () => toast.success("Recurring invoice generated"),
                                  onError: () => toast.error("Failed to generate"),
                                });
                              }} title="Generate Next Invoice">
                                <RefreshCw className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} className="text-center text-muted-foreground py-8">No invoices yet. Create your first invoice above.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="reconciliation" className="mt-4 space-y-6">
            {/* Auto-suggested matches */}
            {suggestions.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold">Suggested Matches</h2>
                <p className="text-sm text-muted-foreground">These invoices closely match unreconciled revenue transactions based on amount, client, and date.</p>
                {suggestions.map(({ invoice: inv, candidates }) => (
                  <div key={inv.id} className="rounded-lg border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">{inv.invoice_number}</span>
                        <span className="text-muted-foreground mx-2">→</span>
                        <span>{inv.client_name}</span>
                        <span className="ml-2 font-mono text-sm">{formatCurrency(inv.total)}</span>
                      </div>
                      <Badge variant={STATUS_CONFIG[inv.status]?.variant || "secondary"}>{inv.status}</Badge>
                    </div>
                    <div className="pl-4 space-y-2">
                      {candidates.map(({ sale, score }) => (
                        <div key={sale.id} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2">
                          <div className="text-sm">
                            <span className="font-medium">{sale.client}</span>
                            <span className="mx-2 text-muted-foreground">{sale.date}</span>
                            <span className="font-mono">{formatCurrency(sale.amount)}</span>
                            {sale.invoiceNumber && <span className="ml-2 text-xs text-muted-foreground">Ref: {sale.invoiceNumber}</span>}
                            <Badge variant="outline" className="ml-2 text-xs">{score}% match</Badge>
                          </div>
                          <Button size="sm" className="h-7 text-xs" onClick={() => handleMatch(inv.id, sale.id)}>
                            <CheckCircle2 className="h-3 w-3 mr-1" />Match
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Manual matching */}
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Manual Reconciliation</h2>
              <p className="text-sm text-muted-foreground">Select a revenue transaction to match to each invoice.</p>
              <div className="stat-card overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Client</th>
                      <th className="text-right">Amount</th>
                      <th>Status</th>
                      <th>Match to Sale</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.filter(inv => inv.status !== "draft").map(inv => (
                      <tr key={inv.id}>
                        <td className="font-medium">{inv.invoice_number}</td>
                        <td>{inv.client_name}</td>
                        <td className="text-right font-mono">{formatCurrency(inv.total)}</td>
                        <td><Badge variant={STATUS_CONFIG[inv.status]?.variant || "secondary"}>{inv.status}</Badge></td>
                        <td>
                          {inv.matched_sale_id ? (
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3" />Matched</Badge>
                              <span className="text-xs text-muted-foreground">
                                {sales.find(s => s.id === inv.matched_sale_id)?.client || "Unknown"} — {formatCurrency(sales.find(s => s.id === inv.matched_sale_id)?.amount || 0)}
                              </span>
                            </div>
                          ) : (
                            <Select onValueChange={(saleId) => handleMatch(inv.id, saleId)}>
                              <SelectTrigger className="h-7 text-xs w-[250px]">
                                <SelectValue placeholder="Select a sale to match..." />
                              </SelectTrigger>
                              <SelectContent>
                                {unmatchedSales.map(sale => (
                                  <SelectItem key={sale.id} value={sale.id}>
                                    {sale.client} — {sale.date} — {formatCurrency(sale.amount)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                        <td>
                          {inv.matched_sale_id && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleUnmatch(inv.id)} title="Unmatch">
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border bg-card p-4 text-center">
                <p className="text-sm text-muted-foreground">Total Invoiced</p>
                <p className="text-2xl font-bold font-mono">{formatCurrency(invoices.reduce((s, i) => s + i.total, 0))}</p>
              </div>
              <div className="rounded-lg border bg-card p-4 text-center">
                <p className="text-sm text-muted-foreground">Matched / Paid</p>
                <p className="text-2xl font-bold font-mono">{formatCurrency(invoices.filter(i => i.matched_sale_id).reduce((s, i) => s + i.total, 0))}</p>
              </div>
              <div className="rounded-lg border bg-card p-4 text-center">
                <p className="text-sm text-muted-foreground">Unreconciled</p>
                <p className="text-2xl font-bold font-mono">{formatCurrency(invoices.filter(i => !i.matched_sale_id && i.status !== "draft").reduce((s, i) => s + i.total, 0))}</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
