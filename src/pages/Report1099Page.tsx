import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useTaxStore } from "@/store/taxStore";
import { formatCurrency } from "@/lib/format";
import { generateId } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, FileDown } from "lucide-react";
import { toast } from "sonner";

export default function Report1099Page() {
  const { contractors, addContractor, removeContractor } = useTaxStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", tin: "", totalPaid: "", address: "" });

  const handleAdd = () => {
    if (!form.name || !form.tin || !form.totalPaid) {
      toast.error("Please fill required fields");
      return;
    }
    addContractor({
      id: generateId(),
      name: form.name,
      tin: form.tin,
      totalPaid: parseFloat(form.totalPaid),
      address: form.address,
    });
    setForm({ name: "", tin: "", totalPaid: "", address: "" });
    setOpen(false);
    toast.success("Contractor added");
  };

  const handleExport = () => {
    const csv = [
      "Name,TIN,Total Paid,Address",
      ...contractors.map((c) => `"${c.name}","${c.tin}",${c.totalPaid},"${c.address}"`),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "1099-report-2026.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("1099 report exported");
  };

  const totalPaid = contractors.reduce((sum, c) => sum + c.totalPaid, 0);
  const threshold = contractors.filter((c) => c.totalPaid >= 600);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">1099 Reports</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {threshold.length} contractor{threshold.length !== 1 ? "s" : ""} above $600 threshold — Total: <span className="font-mono">{formatCurrency(totalPaid)}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport}>
              <FileDown className="h-4 w-4 mr-2" />Export CSV
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Add Contractor</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Contractor</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Input placeholder="Contractor name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <Input placeholder="TIN / SSN" value={form.tin} onChange={(e) => setForm({ ...form, tin: e.target.value })} />
                  <Input type="number" placeholder="Total paid" value={form.totalPaid} onChange={(e) => setForm({ ...form, totalPaid: e.target.value })} />
                  <Input placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                  <Button onClick={handleAdd} className="w-full">Add Contractor</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Threshold alert */}
        <div className="rounded-lg border border-chart-warning/30 bg-chart-warning/5 p-4">
          <p className="text-sm">
            <span className="font-semibold">IRS Requirement:</span> You must file Form 1099-NEC for each contractor paid <span className="font-mono font-semibold">$600+</span> during the tax year.
          </p>
        </div>

        <div className="stat-card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Contractor</th>
                <th>TIN</th>
                <th>Address</th>
                <th className="text-right">Total Paid</th>
                <th>1099 Required</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contractors.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">{c.name}</td>
                  <td className="font-mono text-xs text-muted-foreground">{c.tin}</td>
                  <td className="text-sm text-muted-foreground">{c.address}</td>
                  <td className="text-right font-mono">{formatCurrency(c.totalPaid)}</td>
                  <td>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.totalPaid >= 600 ? "bg-chart-warning/10 text-chart-warning" : "bg-muted text-muted-foreground"}`}>
                      {c.totalPaid >= 600 ? "Required" : "Below threshold"}
                    </span>
                  </td>
                  <td>
                    <Button variant="ghost" size="icon" onClick={() => { removeContractor(c.id); toast.success("Removed"); }}>
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
