import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useSales, useAddSale, useRemoveSale } from "@/hooks/useData";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function SalesPage() {
  const { data: sales = [] } = useSales();
  const addSale = useAddSale();
  const removeSale = useRemoveSale();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: "", client: "", description: "", amount: "", invoiceNumber: "" });

  const totalSales = sales.reduce((sum, s) => sum + s.amount, 0);

  const handleAdd = () => {
    if (!form.date || !form.client || !form.amount) {
      toast.error("Please fill required fields");
      return;
    }
    addSale.mutate({
      date: form.date,
      client: form.client,
      description: form.description,
      amount: parseFloat(form.amount),
      invoiceNumber: form.invoiceNumber || `INV-${Date.now().toString().slice(-4)}`,
    }, {
      onSuccess: () => {
        setForm({ date: "", client: "", description: "", amount: "", invoiceNumber: "" });
        setOpen(false);
        toast.success("Sale added");
      },
      onError: () => toast.error("Failed to add sale"),
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Total: <span className="font-mono text-chart-positive">{formatCurrency(totalSales)}</span>
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add Sale</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Sale</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                <Input placeholder="Client name" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
                <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                <Input type="number" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                <Input placeholder="Invoice # (optional)" value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} />
                <Button onClick={handleAdd} className="w-full" disabled={addSale.isPending}>Add Sale</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="stat-card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice</th>
                <th>Client</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono text-xs text-muted-foreground">{s.date}</td>
                  <td className="font-mono text-xs">{s.invoiceNumber}</td>
                  <td className="font-medium">{s.client}</td>
                  <td className="text-muted-foreground">{s.description}</td>
                  <td className="text-right font-mono text-chart-positive">{formatCurrency(s.amount)}</td>
                  <td>
                    <Button variant="ghost" size="icon" onClick={() => { removeSale.mutate(s.id); toast.success("Removed"); }}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
