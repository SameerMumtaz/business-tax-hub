import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useTaxStore } from "@/store/taxStore";
import { formatCurrency } from "@/lib/format";
import { generateId } from "@/lib/format";
import { EXPENSE_CATEGORIES, ExpenseCategory } from "@/types/tax";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Filter } from "lucide-react";
import { toast } from "sonner";

export default function ExpensesPage() {
  const { expenses, addExpense, removeExpense } = useTaxStore();
  const [open, setOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [form, setForm] = useState({ date: "", vendor: "", description: "", amount: "", category: "" as string });

  const filtered = filterCategory === "all" ? expenses : expenses.filter((e) => e.category === filterCategory);
  const totalFiltered = filtered.reduce((sum, e) => sum + e.amount, 0);

  const handleAdd = () => {
    if (!form.date || !form.vendor || !form.amount || !form.category) {
      toast.error("Please fill all required fields");
      return;
    }
    addExpense({
      id: generateId(),
      date: form.date,
      vendor: form.vendor,
      description: form.description,
      amount: parseFloat(form.amount),
      category: form.category as ExpenseCategory,
    });
    setForm({ date: "", vendor: "", description: "", amount: "", category: "" });
    setOpen(false);
    toast.success("Expense added");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {filterCategory !== "all" && <span>{filterCategory} — </span>}
              Total: <span className="font-mono text-chart-negative">{formatCurrency(totalFiltered)}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-3.5 w-3.5 mr-2" />
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Add Expense</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  <Input placeholder="Vendor" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
                  <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  <Input type="number" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleAdd} className="w-full">Add Expense</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="stat-card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Vendor</th>
                <th>Description</th>
                <th>Category</th>
                <th className="text-right">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td className="font-mono text-xs text-muted-foreground">{e.date}</td>
                  <td className="font-medium">{e.vendor}</td>
                  <td className="text-muted-foreground">{e.description}</td>
                  <td><Badge variant="secondary" className="text-xs font-normal">{e.category}</Badge></td>
                  <td className="text-right font-mono text-chart-negative">{formatCurrency(e.amount)}</td>
                  <td>
                    <Button variant="ghost" size="icon" onClick={() => { removeExpense(e.id); toast.success("Removed"); }}>
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
