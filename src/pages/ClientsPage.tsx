import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useClients, useAddClient, useUpdateClient, useDeleteClient, Client } from "@/hooks/useClients";
import { useInvoices } from "@/hooks/useInvoices";
import { useSales, useExpenses } from "@/hooks/useData";
import { useJobs } from "@/hooks/useJobs";
import { formatCurrency } from "@/lib/format";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, ChevronRight, Mail, Phone, MapPin, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import ClientJobsPanel from "@/components/client/ClientJobsPanel";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary", sent: "default", paid: "outline", overdue: "destructive",
};

export default function ClientsPage() {
  const { data: clients = [] } = useClients();
  const { data: invoices = [] } = useInvoices();
  const { data: sales = [] } = useSales();
  const { data: expenses = [] } = useExpenses();
  const { jobs } = useJobs();
  const addClient = useAddClient();
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", notes: "" });

  const resetForm = () => setForm({ name: "", email: "", phone: "", address: "", notes: "" });

  const handleCreate = () => {
    if (!form.name) { toast.error("Client name is required"); return; }
    addClient.mutate(form, {
      onSuccess: () => { resetForm(); setCreateOpen(false); toast.success("Client saved"); },
      onError: () => toast.error("Failed to save client"),
    });
  };

  const handleUpdate = () => {
    if (!editClient || !form.name) return;
    updateClient.mutate({ id: editClient.id, ...form }, {
      onSuccess: () => { setEditClient(null); resetForm(); toast.success("Client updated"); },
      onError: () => toast.error("Failed to update"),
    });
  };

  const openEdit = (c: Client) => {
    setForm({ name: c.name, email: c.email || "", phone: c.phone || "", address: c.address || "", notes: c.notes || "" });
    setEditClient(c);
  };

  const clientInvoices = selectedClient
    ? invoices.filter(inv => inv.client_id === selectedClient.id || inv.client_name.toLowerCase() === selectedClient.name.toLowerCase())
    : [];

  const clientStats = selectedClient ? {
    total: clientInvoices.length,
    paid: clientInvoices.filter(i => i.status === "paid").length,
    sent: clientInvoices.filter(i => i.status === "sent").length,
    overdue: clientInvoices.filter(i => i.status === "overdue").length,
    draft: clientInvoices.filter(i => i.status === "draft").length,
    totalAmount: clientInvoices.reduce((s, i) => s + i.total, 0),
    paidAmount: clientInvoices.filter(i => i.status === "paid").reduce((s, i) => s + i.total, 0),
    pendingAmount: clientInvoices.filter(i => i.status !== "paid" && i.status !== "draft").reduce((s, i) => s + i.total, 0),
  } : null;

  // ── Profitability data — only user-created clients ──
  const profitabilityData = useMemo(() => {
    return clients.map((c) => {
      const lower = c.name.toLowerCase();

      // Revenue: invoices linked by client_id OR name match
      const clientInvs = invoices.filter(
        (inv) => inv.client_id === c.id || inv.client_name.toLowerCase() === lower
      );
      const invoiceRevenue = clientInvs
        .filter((inv) => inv.status === "paid")
        .reduce((sum, inv) => sum + inv.total, 0);

      // Also include sales matched by client name
      const salesRevenue = sales
        .filter((s) => s.client.toLowerCase() === lower)
        .reduce((sum, s) => sum + s.amount, 0);

      const revenue = invoiceRevenue + salesRevenue;

      // Expenses matched by vendor name
      const cost = expenses
        .filter((e) => e.vendor.toLowerCase() === lower)
        .reduce((sum, e) => sum + e.amount, 0);

      // Job count
      const jobCount = jobs.filter((j) => j.client_id === c.id).length;

      const profit = revenue - cost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      return { name: c.name, revenue, cost, profit, margin, jobCount };
    }).sort((a, b) => b.profit - a.profit);
  }, [clients, invoices, sales, expenses, jobs]);

  const clientFormFields = (
    <div className="space-y-3">
      <Input placeholder="Client Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      <Input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
      <Input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
      <Input placeholder="Address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
      <Textarea placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
            <p className="text-muted-foreground text-sm mt-1">{clients.length} saved clients</p>
          </div>
          <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Client</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Client</DialogTitle></DialogHeader>
              {clientFormFields}
              <Button onClick={handleCreate} className="w-full" disabled={addClient.isPending}>Save Client</Button>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="clients">
          <TabsList>
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="profitability">Profitability</TabsTrigger>
          </TabsList>

          <TabsContent value="clients" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Client list */}
              <div className="lg:col-span-1 space-y-2">
                {clients.map(c => {
                  const invCount = invoices.filter(inv => inv.client_id === c.id || inv.client_name.toLowerCase() === c.name.toLowerCase()).length;
                  const isSelected = selectedClient?.id === c.id;
                  return (
                    <button key={c.id} onClick={() => setSelectedClient(isSelected ? null : c)}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${isSelected ? "bg-accent border-primary/30" : "bg-card hover:bg-accent/50"}`}>
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{c.name}</p>
                          {c.email && <p className="text-xs text-muted-foreground truncate">{c.email}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="secondary" className="text-xs">{invCount} inv</Badge>
                          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isSelected ? "rotate-90" : ""}`} />
                        </div>
                      </div>
                    </button>
                  );
                })}
                {clients.length === 0 && (
                  <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">No clients yet. Add your first client above.</div>
                )}
              </div>

              {/* Client detail */}
              <div className="lg:col-span-2">
                {selectedClient && clientStats ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border bg-card p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h2 className="text-xl font-semibold">{selectedClient.name}</h2>
                          <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                            {selectedClient.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{selectedClient.email}</span>}
                            {selectedClient.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{selectedClient.phone}</span>}
                            {selectedClient.address && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{selectedClient.address}</span>}
                          </div>
                          {selectedClient.notes && <p className="text-sm text-muted-foreground mt-2">{selectedClient.notes}</p>}
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(selectedClient)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {selectedClient.name}?</AlertDialogTitle>
                                <AlertDialogDescription>This will permanently delete this client record. Invoices will not be affected.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => { deleteClient.mutate(selectedClient.id, { onSuccess: () => { setSelectedClient(null); toast.success("Client deleted"); } }); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-md bg-muted/50 p-3 text-center">
                          <p className="text-xs text-muted-foreground">Total Invoiced</p>
                          <p className="text-lg font-bold font-mono">{formatCurrency(clientStats.totalAmount)}</p>
                        </div>
                        <div className="rounded-md bg-muted/50 p-3 text-center">
                          <p className="text-xs text-muted-foreground">Paid</p>
                          <p className="text-lg font-bold font-mono">{formatCurrency(clientStats.paidAmount)}</p>
                        </div>
                        <div className="rounded-md bg-muted/50 p-3 text-center">
                          <p className="text-xs text-muted-foreground">Pending</p>
                          <p className="text-lg font-bold font-mono">{formatCurrency(clientStats.pendingAmount)}</p>
                        </div>
                        <div className="rounded-md bg-muted/50 p-3 text-center">
                          <p className="text-xs text-muted-foreground">Invoices</p>
                          <div className="flex items-center justify-center gap-1.5 mt-1">
                            {clientStats.paid > 0 && <Badge variant="outline" className="text-xs">{clientStats.paid} paid</Badge>}
                            {clientStats.sent > 0 && <Badge variant="default" className="text-xs">{clientStats.sent} sent</Badge>}
                            {clientStats.overdue > 0 && <Badge variant="destructive" className="text-xs">{clientStats.overdue} overdue</Badge>}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg border bg-card overflow-hidden">
                      <div className="p-4 border-b"><h3 className="font-medium">Invoices</h3></div>
                      {clientInvoices.length > 0 ? (
                        <table className="data-table">
                          <thead><tr><th>Invoice #</th><th>Date</th><th>Due</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
                          <tbody>
                            {clientInvoices.map(inv => (
                              <tr key={inv.id}>
                                <td className="font-medium">{inv.invoice_number}</td>
                                <td className="font-mono text-xs text-muted-foreground">{inv.issue_date}</td>
                                <td className="font-mono text-xs text-muted-foreground">{inv.due_date || "—"}</td>
                                <td><Badge variant={STATUS_VARIANT[inv.status] || "secondary"}>{inv.status}</Badge></td>
                                <td className="text-right font-mono">{formatCurrency(inv.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="p-8 text-center text-muted-foreground">No invoices for this client yet.</div>
                      )}
                    </div>
                    <div className="rounded-lg border bg-card p-4">
                      <ClientJobsPanel client={selectedClient} />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">Select a client to view their details and invoice history.</div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="profitability" className="mt-4 space-y-6">
            {clients.length > 0 ? (
              <>
                {profitabilityData.some(c => c.revenue > 0 || c.cost > 0) && (
                  <div className="rounded-lg border bg-card p-6">
                    <h2 className="text-lg font-medium mb-4">Profit by Client</h2>
                    <ResponsiveContainer width="100%" height={Math.max(200, profitabilityData.filter(c => c.revenue > 0 || c.cost > 0).length * 40)}>
                      <BarChart data={profitabilityData.filter(c => c.revenue > 0 || c.cost > 0)} layout="vertical" margin={{ left: 100 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis type="number" tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} className="fill-muted-foreground" />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} className="fill-muted-foreground" width={100} />
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        <Bar dataKey="profit" name="Profit" radius={[0, 4, 4, 0]}>
                          {profitabilityData.filter(c => c.revenue > 0 || c.cost > 0).map((entry, i) => (
                            <Cell key={i} fill={entry.profit >= 0 ? "hsl(var(--chart-2))" : "hsl(var(--chart-5))"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-right">Jobs</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Expenses</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profitabilityData.map((c) => (
                      <TableRow key={c.name}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right font-mono">{c.jobCount}</TableCell>
                        <TableCell className="text-right font-mono text-chart-positive">{formatCurrency(c.revenue)}</TableCell>
                        <TableCell className="text-right font-mono text-chart-negative">{formatCurrency(c.cost)}</TableCell>
                        <TableCell className={`text-right font-mono font-semibold ${c.profit >= 0 ? "text-chart-positive" : "text-destructive"}`}>{formatCurrency(c.profit)}</TableCell>
                        <TableCell className="text-right font-mono">{c.margin.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            ) : (
              <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
                No clients yet. Add clients to see profitability data.
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Edit dialog */}
        <Dialog open={!!editClient} onOpenChange={(o) => { if (!o) { setEditClient(null); resetForm(); } }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Client</DialogTitle></DialogHeader>
            {clientFormFields}
            <Button onClick={handleUpdate} className="w-full">Save Changes</Button>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
