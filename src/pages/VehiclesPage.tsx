import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Car, Trash2, Check, DollarSign, Calendar, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import {
  Vehicle,
  useVehicles,
  useAddVehicle,
  useRemoveVehicle,
  useVehiclePayments,
  useAddVehiclePayment,
  useRemoveVehiclePayment,
  useVehicleExpenses,
  useLinkExpenseToVehicle,
  useUnlinkExpenseFromVehicle,
  generateAmortSchedule,
} from "@/hooks/useVehicles";
import { useExpenses } from "@/hooks/useData";

const emptyVehicle: Omit<Vehicle, "id"> = {
  name: "",
  year: new Date().getFullYear(),
  make: "",
  model: "",
  vin_last6: null,
  purchase_price: 0,
  loan_amount: 0,
  interest_rate: 5.9,
  loan_term_months: 60,
  monthly_payment: 0,
  loan_start_date: new Date().toISOString().slice(0, 10),
  status: "active",
  notes: null,
};

export default function VehiclesPage() {
  const { data: vehicles = [], isLoading } = useVehicles();
  const addVehicle = useAddVehicle();
  const removeVehicle = useRemoveVehicle();
  const { data: expenses = [] } = useExpenses();

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyVehicle);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = vehicles.find((v) => v.id === selectedId) ?? null;
  const { data: payments = [] } = useVehiclePayments(selectedId);
  const { data: linkedExpenses = [] } = useVehicleExpenses(selectedId);
  const addPayment = useAddVehiclePayment();
  const removePayment = useRemoveVehiclePayment();
  const linkExpense = useLinkExpenseToVehicle();
  const unlinkExpense = useUnlinkExpenseFromVehicle();

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [expenseSearch, setExpenseSearch] = useState("");

  const setField = (key: string, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Auto-calc monthly payment when loan details change
  const calcMonthly = () => {
    const P = form.loan_amount;
    const r = form.interest_rate / 100 / 12;
    const n = form.loan_term_months;
    if (P > 0 && r > 0 && n > 0) {
      const m = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
      setField("monthly_payment", Math.round(m * 100) / 100);
    }
  };

  const handleAdd = async () => {
    if (!form.name.trim()) { toast.error("Vehicle name is required"); return; }
    await addVehicle.mutateAsync(form);
    toast.success("Vehicle added");
    setForm(emptyVehicle);
    setShowAdd(false);
  };

  // Amortization schedule for selected vehicle
  const amortSchedule = useMemo(() => {
    if (!selected) return [];
    return generateAmortSchedule(
      selected.loan_amount,
      selected.interest_rate,
      selected.loan_term_months,
      selected.monthly_payment,
      selected.loan_start_date,
      payments
    );
  }, [selected, payments]);

  const nextUnpaid = amortSchedule.find((r) => !r.paid);
  const totalPaid = payments.reduce((s, p) => s + p.amount_paid, 0);
  const remainingBalance = amortSchedule.length > 0
    ? amortSchedule[amortSchedule.length - 1].balance
    : selected?.loan_amount ?? 0;
  const currentBalance = amortSchedule.find((r) => !r.paid)?.balance
    ?? (amortSchedule.length > 0 ? amortSchedule[amortSchedule.length - 1].balance : 0);

  const handleMarkPaid = async (row: typeof amortSchedule[0]) => {
    if (!selected) return;
    await addPayment.mutateAsync({
      vehicle_id: selected.id,
      payment_number: row.number,
      amount_paid: row.payment,
      principal_portion: row.principal,
      interest_portion: row.interest,
      date_paid: new Date().toISOString().slice(0, 10),
      notes: null,
    });
    toast.success(`Payment #${row.number} recorded`);
  };

  // Linked expense total
  const linkedExpenseTotal = linkedExpenses.reduce((s: number, le: any) => s + Number(le.expenses?.amount ?? 0), 0);

  // Filter unlinked vehicle-related expenses for linking
  const linkedIds = new Set(linkedExpenses.map((le: any) => le.expense_id));
  const vehicleCategories = ["Vehicle & Gas", "Vehicle Maintenance"];
  const linkableExpenses = useMemo(() => {
    let list = expenses.filter(
      (e) => vehicleCategories.includes(e.category) && !linkedIds.has(e.id)
    );
    if (expenseSearch.trim()) {
      const q = expenseSearch.toLowerCase();
      list = list.filter((e) => e.vendor.toLowerCase().includes(q) || e.description.toLowerCase().includes(q));
    }
    return list.slice(0, 20);
  }, [expenses, linkedIds, expenseSearch]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Vehicle Manager</h1>
            <p className="text-muted-foreground text-sm mt-1">Track financing, payments, and per-vehicle costs</p>
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Vehicle
          </Button>
        </div>

        {/* Vehicle cards grid */}
        {isLoading ? (
          <div className="stat-card p-8 text-center text-muted-foreground">Loading…</div>
        ) : vehicles.length === 0 ? (
          <div className="stat-card p-8 text-center space-y-3">
            <Car className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">No vehicles yet. Click "Add Vehicle" to start tracking.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vehicles.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedId(v.id === selectedId ? null : v.id)}
                className={`stat-card p-4 text-left transition-all hover:shadow-md cursor-pointer ${
                  v.id === selectedId ? "ring-2 ring-primary" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Car className="h-5 w-5 text-primary" />
                    <span className="font-semibold">{v.name}</span>
                  </div>
                  <Badge variant={v.status === "active" ? "default" : "secondary"}>
                    {v.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {v.year} {v.make} {v.model}
                </p>
                <div className="flex justify-between mt-3 text-sm">
                  <span className="text-muted-foreground">Loan</span>
                  <span className="font-mono">{formatCurrency(v.loan_amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Monthly</span>
                  <span className="font-mono">{formatCurrency(v.monthly_payment)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Rate</span>
                  <span className="font-mono">{v.interest_rate}% / {v.loan_term_months}mo</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Detail panel for selected vehicle */}
        {selected && (
          <div className="stat-card">
            <Tabs defaultValue="schedule" className="w-full">
              <div className="flex items-center justify-between p-4 border-b border-border flex-wrap gap-2">
                <div>
                  <h2 className="text-lg font-bold">{selected.name}</h2>
                  <p className="text-xs text-muted-foreground">{selected.year} {selected.make} {selected.model}</p>
                </div>
                <div className="flex gap-2">
                  <TabsList>
                    <TabsTrigger value="schedule">Amortization</TabsTrigger>
                    <TabsTrigger value="expenses">Linked Expenses</TabsTrigger>
                  </TabsList>
                  <Button variant="destructive" size="sm" onClick={() => {
                    if (confirm("Delete this vehicle and all its data?")) {
                      removeVehicle.mutate(selected.id);
                      setSelectedId(null);
                      toast.success("Vehicle deleted");
                    }
                  }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Total Paid</p>
                  <p className="text-lg font-bold font-mono text-chart-positive">{formatCurrency(totalPaid)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Remaining Balance</p>
                  <p className="text-lg font-bold font-mono">{formatCurrency(currentBalance)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Payments Made</p>
                  <p className="text-lg font-bold font-mono">{payments.length} / {selected.loan_term_months}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Vehicle Expenses</p>
                  <p className="text-lg font-bold font-mono">{formatCurrency(linkedExpenseTotal)}</p>
                </div>
              </div>

              {/* Next payment due */}
              {nextUnpaid && (
                <div className="mx-4 mb-4 p-3 rounded-lg bg-accent/50 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Next payment #{nextUnpaid.number} due {nextUnpaid.date}</span>
                    <span className="text-sm font-mono text-muted-foreground">{formatCurrency(nextUnpaid.payment)}</span>
                  </div>
                  <Button size="sm" onClick={() => handleMarkPaid(nextUnpaid)} disabled={addPayment.isPending}>
                    <Check className="h-3.5 w-3.5 mr-1" /> Mark Paid
                  </Button>
                </div>
              )}

              <TabsContent value="schedule" className="p-4 pt-0">
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="data-table">
                    <thead className="sticky top-0 bg-card z-10">
                      <tr>
                        <th>#</th>
                        <th>Due Date</th>
                        <th className="text-right">Payment</th>
                        <th className="text-right">Principal</th>
                        <th className="text-right">Interest</th>
                        <th className="text-right">Balance</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {amortSchedule.map((row) => (
                        <tr key={row.number} className={row.paid ? "opacity-60" : ""}>
                          <td className="font-mono text-xs">{row.number}</td>
                          <td className="font-mono text-xs">{row.date}</td>
                          <td className="text-right font-mono text-xs">{formatCurrency(row.payment)}</td>
                          <td className="text-right font-mono text-xs">{formatCurrency(row.principal)}</td>
                          <td className="text-right font-mono text-xs">{formatCurrency(row.interest)}</td>
                          <td className="text-right font-mono text-xs">{formatCurrency(row.balance)}</td>
                          <td>
                            {row.paid ? (
                              <div className="flex items-center gap-1">
                                <Badge variant="secondary" className="text-xs">
                                  <Check className="h-3 w-3 mr-0.5" /> Paid
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => {
                                    const p = payments.find((p) => p.payment_number === row.number);
                                    if (p) {
                                      removePayment.mutate({ id: p.id, vehicleId: selected.id });
                                      toast.success("Payment undone");
                                    }
                                  }}
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => handleMarkPaid(row)}
                                disabled={addPayment.isPending}
                              >
                                Mark Paid
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="expenses" className="p-4 pt-0 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Link gas, maintenance, and insurance expenses to this vehicle for per-vehicle cost tracking.
                  </p>
                  <Button size="sm" onClick={() => { setLinkDialogOpen(true); setExpenseSearch(""); }}>
                    <Link2 className="h-3.5 w-3.5 mr-1" /> Link Expense
                  </Button>
                </div>

                {linkedExpenses.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6">No expenses linked yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Vendor</th>
                          <th>Category</th>
                          <th className="text-right">Amount</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {linkedExpenses.map((le: any) => (
                          <tr key={le.id}>
                            <td className="font-mono text-xs">{le.expenses?.date}</td>
                            <td>{le.expenses?.vendor}</td>
                            <td>
                              <Badge variant="secondary" className="text-xs">{le.expenses?.category}</Badge>
                            </td>
                            <td className="text-right font-mono">{formatCurrency(Number(le.expenses?.amount ?? 0))}</td>
                            <td>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                                unlinkExpense.mutate({ id: le.id, vehicleId: selected.id });
                                toast.success("Unlinked");
                              }}>
                                <Unlink className="h-3 w-3 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Add Vehicle dialog */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Vehicle</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name *</Label>
                <Input placeholder="e.g. Work Truck" value={form.name} onChange={(e) => setField("name", e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Year</Label><Input type="number" value={form.year || ""} onChange={(e) => setField("year", Number(e.target.value))} /></div>
                <div><Label>Make</Label><Input placeholder="Ford" value={form.make || ""} onChange={(e) => setField("make", e.target.value)} /></div>
                <div><Label>Model</Label><Input placeholder="F-150" value={form.model || ""} onChange={(e) => setField("model", e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>VIN (last 6)</Label><Input maxLength={6} value={form.vin_last6 || ""} onChange={(e) => setField("vin_last6", e.target.value)} /></div>
                <div><Label>Purchase Price</Label><Input type="number" min={0} step="0.01" value={form.purchase_price || ""} onChange={(e) => setField("purchase_price", Number(e.target.value))} /></div>
              </div>
              <hr className="border-border" />
              <p className="text-sm font-medium text-muted-foreground">Loan Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Loan Amount</Label><Input type="number" min={0} step="0.01" value={form.loan_amount || ""} onChange={(e) => setField("loan_amount", Number(e.target.value))} /></div>
                <div><Label>Interest Rate (%)</Label><Input type="number" min={0} step="0.1" value={form.interest_rate || ""} onChange={(e) => setField("interest_rate", Number(e.target.value))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Term (months)</Label><Input type="number" min={1} value={form.loan_term_months || ""} onChange={(e) => setField("loan_term_months", Number(e.target.value))} /></div>
                <div><Label>Loan Start Date</Label><Input type="date" value={form.loan_start_date || ""} onChange={(e) => setField("loan_start_date", e.target.value)} /></div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Label>Monthly Payment</Label>
                  <Input type="number" min={0} step="0.01" value={form.monthly_payment || ""} onChange={(e) => setField("monthly_payment", Number(e.target.value))} />
                </div>
                <Button variant="outline" size="sm" className="mt-5" onClick={calcMonthly} type="button">
                  <DollarSign className="h-3.5 w-3.5 mr-1" /> Calculate
                </Button>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={addVehicle.isPending}>
                {addVehicle.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Link Expense dialog */}
        <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Link Expense to {selected?.name}</DialogTitle>
            </DialogHeader>
            <Input placeholder="Search vehicle expenses…" value={expenseSearch} onChange={(e) => setExpenseSearch(e.target.value)} />
            <div className="max-h-60 overflow-y-auto space-y-1 mt-2">
              {linkableExpenses.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No matching vehicle expenses found.</p>
              ) : (
                linkableExpenses.map((e) => (
                  <button
                    key={e.id}
                    className="flex items-center justify-between w-full px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
                    onClick={async () => {
                      await linkExpense.mutateAsync({ vehicleId: selected!.id, expenseId: e.id });
                      toast.success("Expense linked");
                    }}
                  >
                    <div className="text-left">
                      <span className="font-medium">{e.vendor}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{e.date}</span>
                    </div>
                    <span className="font-mono text-xs">{formatCurrency(e.amount)}</span>
                  </button>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
