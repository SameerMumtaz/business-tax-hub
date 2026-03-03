import { useState, useMemo } from "react";
import PersonalDashboardLayout from "@/components/PersonalDashboardLayout";
import { usePersonalDeductions, useAddPersonalDeduction, useRemovePersonalDeduction } from "@/hooks/usePersonalData";
import { useW2Income } from "@/hooks/usePersonalData";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Scale } from "lucide-react";
import { toast } from "sonner";

const DEDUCTION_CATEGORIES = [
  "Mortgage Interest",
  "State & Local Taxes (SALT)",
  "Charitable Contributions",
  "Medical Expenses",
  "Student Loan Interest",
  "Educator Expenses",
  "Health Savings Account (HSA)",
  "IRA Contributions",
  "Other",
];

// 2026 standard deduction estimates
const STANDARD_DEDUCTION = {
  single: 15700,
  married_joint: 31400,
  head_of_household: 23500,
};

type FilingStatus = keyof typeof STANDARD_DEDUCTION;

export default function PersonalDeductionsPage() {
  const { data: deductions = [], isLoading } = usePersonalDeductions();
  const { data: w2s = [] } = useW2Income();
  const addDeduction = useAddPersonalDeduction();
  const removeDeduction = useRemovePersonalDeduction();
  const [showAdd, setShowAdd] = useState(false);
  const [filingStatus, setFilingStatus] = useState<FilingStatus>("single");
  const [form, setForm] = useState({ category: "Other", description: "", amount: 0, tax_year: 2026 });

  const itemizedTotal = useMemo(
    () => deductions.reduce((s, d) => s + d.amount, 0),
    [deductions]
  );

  const standardAmt = STANDARD_DEDUCTION[filingStatus];
  const betterOption = itemizedTotal > standardAmt ? "itemized" : "standard";
  const bestDeduction = Math.max(itemizedTotal, standardAmt);

  const totalIncome = w2s.reduce((s, w) => s + w.wages, 0);
  const taxableIncome = Math.max(0, totalIncome - bestDeduction);

  const handleAdd = async () => {
    if (!form.category || form.amount <= 0) {
      toast.error("Category and amount are required");
      return;
    }
    await addDeduction.mutateAsync(form);
    toast.success("Deduction added");
    setForm({ category: "Other", description: "", amount: 0, tax_year: 2026 });
    setShowAdd(false);
  };

  // Group deductions by category
  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    deductions.forEach((d) => {
      map[d.category] = (map[d.category] || 0) + d.amount;
    });
    return Object.entries(map).sort(([, a], [, b]) => b - a);
  }, [deductions]);

  return (
    <PersonalDashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Deductions</h1>
            <p className="text-muted-foreground text-sm mt-1">Compare standard vs. itemized deductions</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filingStatus} onValueChange={(v) => setFilingStatus(v as FilingStatus)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single</SelectItem>
                <SelectItem value="married_joint">Married Filing Jointly</SelectItem>
                <SelectItem value="head_of_household">Head of Household</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Deduction
            </Button>
          </div>
        </div>

        {/* Comparison cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={`stat-card text-center py-6 ${betterOption === "standard" ? "ring-2 ring-primary" : ""}`}>
            <p className="text-sm text-muted-foreground">Standard Deduction</p>
            <p className="text-2xl font-bold font-mono mt-1">{formatCurrency(standardAmt)}</p>
            {betterOption === "standard" && <p className="text-xs text-primary font-medium mt-1">✓ Better option</p>}
          </div>
          <div className={`stat-card text-center py-6 ${betterOption === "itemized" ? "ring-2 ring-primary" : ""}`}>
            <p className="text-sm text-muted-foreground">Itemized Deductions</p>
            <p className="text-2xl font-bold font-mono mt-1">{formatCurrency(itemizedTotal)}</p>
            {betterOption === "itemized" && <p className="text-xs text-primary font-medium mt-1">✓ Better option</p>}
          </div>
          <div className="stat-card text-center py-6">
            <p className="text-sm text-muted-foreground">Est. Taxable Income</p>
            <p className="text-2xl font-bold font-mono mt-1">{formatCurrency(taxableIncome)}</p>
            <p className="text-xs text-muted-foreground mt-1">After best deduction</p>
          </div>
        </div>

        {/* Itemized breakdown */}
        {byCategory.length > 0 && (
          <div className="stat-card">
            <h2 className="section-title mb-4">Itemized Breakdown</h2>
            <div className="space-y-2">
              {byCategory.map(([cat, amt]) => (
                <div key={cat} className="flex items-center justify-between text-sm py-1">
                  <span>{cat}</span>
                  <span className="font-mono">{formatCurrency(amt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Deduction list */}
        {isLoading ? (
          <div className="stat-card p-8 text-center text-muted-foreground">Loading…</div>
        ) : deductions.length === 0 ? (
          <div className="stat-card p-8 text-center space-y-3">
            <Scale className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">No itemized deductions added. Add deductions to compare against the standard deduction.</p>
          </div>
        ) : (
          <div className="stat-card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Description</th>
                  <th className="text-right">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {deductions.map((d) => (
                  <tr key={d.id}>
                    <td><span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{d.category}</span></td>
                    <td className="text-muted-foreground">{d.description || "—"}</td>
                    <td className="text-right font-mono">{formatCurrency(d.amount)}</td>
                    <td>
                      <Button variant="ghost" size="icon" onClick={() => { removeDeduction.mutate(d.id); toast.success("Removed"); }}>
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
              <DialogTitle>Add Deduction</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEDUCTION_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div>
                <Label>Amount</Label>
                <Input type="number" min={0} step="0.01" value={form.amount || ""} onChange={(e) => setForm((p) => ({ ...p, amount: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={addDeduction.isPending}>
                {addDeduction.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PersonalDashboardLayout>
  );
}
