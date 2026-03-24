import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuotes, useAddQuote, useUpdateQuoteStatus, useDeleteQuote, useConvertQuoteToInvoice, useConvertQuoteToJob, Quote } from "@/hooks/useQuotes";
import { useClients } from "@/hooks/useClients";
import { useJobs } from "@/hooks/useJobs";
import { useJobTemplates } from "@/hooks/useJobTemplates";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Send, FileText, Link2, CheckCircle2, XCircle, Clock, X, ArrowRight, Briefcase, FileDown } from "lucide-react";
import { toast } from "sonner";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  draft: { label: "Draft", variant: "secondary", icon: FileText },
  sent: { label: "Sent", variant: "default", icon: Send },
  approved: { label: "Approved", variant: "outline", icon: CheckCircle2 },
  declined: { label: "Declined", variant: "destructive", icon: XCircle },
  converted: { label: "Converted", variant: "outline", icon: ArrowRight },
};

export default function QuotesPage() {
  const { data: quotes = [] } = useQuotes();
  const { data: clients = [] } = useClients();
  const { sites } = useJobs();
  const { templates } = useJobTemplates();
  const addQuote = useAddQuote();
  const updateStatus = useUpdateQuoteStatus();
  const deleteQuote = useDeleteQuote();
  const convertToInvoice = useConvertQuoteToInvoice();
  const convertToJob = useConvertQuoteToJob();

  const [createOpen, setCreateOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");
  const [jobDialogQuote, setJobDialogQuote] = useState<Quote | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState("");

  const [form, setForm] = useState({
    title: "",
    client_name: "",
    client_email: "",
    client_id: "",
    valid_until: "",
    notes: "",
    tax_rate: "0",
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

  const resetForm = () => setForm({ title: "", client_name: "", client_email: "", client_id: "", valid_until: "", notes: "", tax_rate: "0", line_items: [{ description: "", quantity: "1", unit_price: "" }] });

  const handleCreate = () => {
    if (!form.title || !form.client_name) { toast.error("Title and client name are required"); return; }
    addQuote.mutate({
      title: form.title,
      client_name: form.client_name,
      client_email: form.client_email || undefined,
      client_id: form.client_id || undefined,
      notes: form.notes || undefined,
      valid_until: form.valid_until || undefined,
      tax_rate: parseFloat(form.tax_rate) || 0,
      line_items: form.line_items.filter(li => li.description && li.unit_price).map(li => ({
        description: li.description,
        quantity: parseFloat(li.quantity) || 1,
        unit_price: parseFloat(li.unit_price) || 0,
      })),
    }, {
      onSuccess: () => { resetForm(); setCreateOpen(false); toast.success("Quote created"); },
      onError: () => toast.error("Failed to create quote"),
    });
  };

  const handleCopyLink = (token: string | null) => {
    if (!token) return;
    navigator.clipboard.writeText(`${window.location.origin}/q/${token}`);
    toast.success("Quote link copied");
  };

  const handleSend = (q: Quote) => {
    updateStatus.mutate({ id: q.id, status: "sent" }, { onSuccess: () => toast.success("Marked as Sent") });
  };

  const handleConvertInvoice = (q: Quote) => {
    convertToInvoice.mutate(q, {
      onSuccess: () => toast.success("Invoice created from quote"),
      onError: () => toast.error("Failed to convert"),
    });
  };

  const handleConvertJob = () => {
    if (!jobDialogQuote || !selectedSiteId) { toast.error("Select a job site"); return; }
    convertToJob.mutate({ quote: jobDialogQuote, siteId: selectedSiteId }, {
      onSuccess: () => { setJobDialogQuote(null); setSelectedSiteId(""); toast.success("Job created from quote"); },
      onError: () => toast.error("Failed to create job"),
    });
  };

  const handleDownloadPDF = (q: Quote) => {
    const items = q.line_items || [];
    const lines = items.map(li => `${li.description} | Qty: ${li.quantity} | ${formatCurrency(li.unit_price)} | ${formatCurrency(li.amount)}`).join("\n");
    const content = `
QUOTE ${q.quote_number}
${q.title}
========================================
To: ${q.client_name}${q.client_email ? ` (${q.client_email})` : ""}
Date: ${new Date(q.created_at).toLocaleDateString()}
${q.valid_until ? `Valid Until: ${q.valid_until}` : ""}

Items:
${lines || "No items"}

Subtotal: ${formatCurrency(q.subtotal)}
Tax (${q.tax_rate}%): ${formatCurrency(q.tax_amount)}
TOTAL: ${formatCurrency(q.total)}
${q.notes ? `\nNotes: ${q.notes}` : ""}
    `.trim();
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quote-${q.quote_number}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Quote downloaded");
  };

  const filtered = filterStatus === "all" ? quotes : quotes.filter(q => q.status === filterStatus);
  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortBy === "amount") arr.sort((a, b) => b.total - a.total);
    else arr.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return arr;
  }, [filtered, sortBy]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Quotes & Estimates</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {quotes.length} quotes — {quotes.filter(q => q.status === "approved").length} approved
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="declined">Declined</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as "date" | "amount")}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Sort by Date</SelectItem>
                <SelectItem value="amount">Sort by Amount</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Quote</Button></DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Create Quote</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <Input placeholder="Quote Title *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
                  <div className="grid grid-cols-2 gap-3">
                    <Select value={form.client_id} onValueChange={handleSelectClient}>
                      <SelectTrigger><SelectValue placeholder="Select Saved Client" /></SelectTrigger>
                      <SelectContent>
                        {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input placeholder="Client Name *" value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} />
                    <Input placeholder="Client Email" value={form.client_email} onChange={e => setForm({ ...form, client_email: e.target.value })} />
                    <Input type="date" placeholder="Valid Until" value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })} />
                    <Input type="number" placeholder="Tax Rate %" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">Line Items</label>
                      <div className="flex gap-1.5">
                        {templates.length > 0 && (
                          <Select value="" onValueChange={(templateId) => {
                            const t = templates.find((x) => x.id === templateId);
                            if (!t) return;
                            setForm({
                              ...form,
                              line_items: [...form.line_items.filter(li => li.description || li.unit_price), {
                                description: t.title + (t.description ? ` — ${t.description}` : ""),
                                quantity: "1",
                                unit_price: String(t.price || ""),
                              }],
                            });
                          }}>
                            <SelectTrigger className="h-8 text-xs w-auto border-dashed">
                              <Briefcase className="h-3 w-3 mr-1" />
                              <SelectValue placeholder="From service" />
                            </SelectTrigger>
                            <SelectContent>
                              {templates.map((t) => (
                                <SelectItem key={t.id} value={t.id}>{t.title}{t.price > 0 ? ` — $${t.price}` : ""}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Button variant="outline" size="sm" onClick={addLineItem}><Plus className="h-3 w-3 mr-1" />Add</Button>
                      </div>
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

                  <div className="border-t pt-3 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{formatCurrency(formSubtotal)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Tax ({form.tax_rate}%)</span><span className="font-mono">{formatCurrency(formTax)}</span></div>
                    <div className="flex justify-between font-semibold"><span>Total</span><span className="font-mono">{formatCurrency(formTotal)}</span></div>
                  </div>

                  <Button onClick={handleCreate} className="w-full" disabled={addQuote.isPending}>Create Quote</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Quotes table */}
        <div className="stat-card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Quote #</th>
                <th>Title</th>
                <th>Client</th>
                <th>Status</th>
                <th className="text-right">Total</th>
                <th>Valid Until</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={7} className="text-center text-muted-foreground py-8">No quotes yet</td></tr>
              )}
              {sorted.map((q) => {
                const cfg = STATUS_CONFIG[q.status] || STATUS_CONFIG.draft;
                const StatusIcon = cfg.icon;
                return (
                  <tr key={q.id}>
                    <td className="font-mono text-xs">{q.quote_number}</td>
                    <td className="font-medium">{q.title}</td>
                    <td>{q.client_name}</td>
                    <td>
                      <Badge variant={cfg.variant} className="gap-1">
                        <StatusIcon className="h-3 w-3" />{cfg.label}
                      </Badge>
                    </td>
                    <td className="text-right font-mono">{formatCurrency(q.total)}</td>
                    <td className="text-xs text-muted-foreground">{q.valid_until || "—"}</td>
                    <td className="text-right">
                      <div className="flex gap-1 justify-end">
                        {q.status === "draft" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Send" onClick={() => handleSend(q)}>
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Copy Link" onClick={() => handleCopyLink(q.share_token)}>
                          <Link2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Download" onClick={() => handleDownloadPDF(q)}>
                          <FileDown className="h-3.5 w-3.5" />
                        </Button>
                        {q.status === "approved" && !q.converted_invoice_id && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Convert to Invoice" onClick={() => handleConvertInvoice(q)}>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {q.status === "approved" && !q.converted_job_id && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Convert to Job" onClick={() => setJobDialogQuote(q)}>
                            <Briefcase className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Delete" onClick={() => deleteQuote.mutate(q.id, { onSuccess: () => toast.success("Deleted") })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Convert to Job dialog */}
        <Dialog open={!!jobDialogQuote} onOpenChange={(o) => { if (!o) setJobDialogQuote(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Convert Quote to Job</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground mb-3">Select a job site for "{jobDialogQuote?.title}"</p>
            <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
              <SelectTrigger><SelectValue placeholder="Select Job Site" /></SelectTrigger>
              <SelectContent>
                {sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {sites.length === 0 && <p className="text-xs text-muted-foreground">No job sites found. Create one in Team → Job Scheduler first.</p>}
            <Button onClick={handleConvertJob} disabled={!selectedSiteId} className="w-full mt-2">Create Job</Button>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
