import { useState, useMemo } from "react";
import PersonalDashboardLayout from "@/components/PersonalDashboardLayout";
import { usePersonalExpenses, useAddPersonalExpense, useRemovePersonalExpense, PersonalExpense } from "@/hooks/usePersonalData";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, ShoppingCart, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const PERSONAL_CATEGORIES = [
  "Housing",
  "Medical & Health",
  "Charitable Giving",
  "Education",
  "Childcare",
  "Transportation",
  "Groceries",
  "Utilities",
  "Insurance",
  "Entertainment",
  "Clothing",
  "Subscriptions",
  "Other",
];

const emptyExpense: Omit<PersonalExpense, "id"> = {
  date: new Date().toISOString().slice(0, 10),
  description: "",
  vendor: "",
  amount: 0,
  category: "Other",
  tax_deductible: false,
  receipt_url: null,
};

export default function PersonalExpensesPage() {
  const { data: expenses = [], isLoading } = usePersonalExpenses();
  const addExpense = useAddPersonalExpense();
  const removeExpense = useRemovePersonalExpense();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyExpense);
  const [filterCat, setFilterCat] = useState("all");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    let list = expenses;
    if (filterCat !== "all") list = list.filter((e) => e.category === filterCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) => e.vendor.toLowerCase().includes(q) || (e.description ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [expenses, filterCat, search]);

  const totalSpend = filtered.reduce((s, e) => s + e.amount, 0);
  const deductibleSpend = filtered.filter((e) => e.tax_deductible).reduce((s, e) => s + e.amount, 0);

  const handleAdd = async () => {
    if (!form.vendor.trim()) {
      toast.error("Vendor is required");
      return;
    }
    await addExpense.mutateAsync(form);
    toast.success("Expense added");
    setForm(emptyExpense);
    setShowAdd(false);
  };

  const setField = (key: string, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <PersonalDashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Personal Expenses</h1>
            <p className="text-muted-foreground text-sm mt-1">Track spending and flag tax-deductible items</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/personal/import")}>
              <Upload className="h-4 w-4 mr-2" /> Import Statement
            </Button>
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Expense
            </Button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="stat-card text-center py-6">
            <p className="text-sm text-muted-foreground">Total Spending</p>
            <p className="text-2xl font-bold font-mono mt-1">{formatCurrency(totalSpend)}</p>
          </div>
          <div className="stat-card text-center py-6">
            <p className="text-sm text-muted-foreground">Tax Deductible</p>
            <p className="text-2xl font-bold font-mono mt-1 text-chart-positive">{formatCurrency(deductibleSpend)}</p>
          </div>
          <div className="stat-card text-center py-6">
            <p className="text-sm text-muted-foreground">Transactions</p>
            <p className="text-2xl font-bold font-mono mt-1">{filtered.length}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <Input placeholder="Search vendor or description…" className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {PERSONAL_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="stat-card p-8 text-center text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="stat-card p-8 text-center space-y-3">
            <ShoppingCart className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">No expenses yet. Click "Add Expense" to start tracking.</p>
          </div>
        ) : (
          <div className="stat-card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vendor</th>
                  <th>Category</th>
                  <th>Deductible</th>
                  <th className="text-right">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 50).map((e) => (
                  <tr key={e.id}>
                    <td className="font-mono text-xs text-muted-foreground">{e.date}</td>
                    <td>{e.vendor}</td>
                    <td>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{e.category}</span>
                    </td>
                    <td>{e.tax_deductible ? <span className="text-xs font-medium text-chart-positive">✓ Yes</span> : <span className="text-xs text-muted-foreground">No</span>}</td>
                    <td className="text-right font-mono">{formatCurrency(e.amount)}</td>
                    <td>
                      <Button variant="ghost" size="icon" onClick={() => { removeExpense.mutate(e.id); toast.success("Deleted"); }}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add dialog */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Expense</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} />
              </div>
              <div>
                <Label>Vendor *</Label>
                <Input value={form.vendor} onChange={(e) => setField("vendor", e.target.value)} />
              </div>
              <div>
                <Label>Description</Label>
                <Input value={form.description ?? ""} onChange={(e) => setField("description", e.target.value)} />
              </div>
              <div>
                <Label>Amount</Label>
                <Input type="number" min={0} step="0.01" value={form.amount || ""} onChange={(e) => setField("amount", Number(e.target.value))} />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setField("category", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERSONAL_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.tax_deductible}
                  onCheckedChange={(v) => setField("tax_deductible", !!v)}
                  id="tax-ded"
                />
                <Label htmlFor="tax-ded" className="font-normal">Tax deductible</Label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={addExpense.isPending}>
                {addExpense.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PersonalDashboardLayout>
  );
}
