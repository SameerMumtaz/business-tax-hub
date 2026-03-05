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
import { Switch } from "@/components/ui/switch";
import { Plus, Car, Trash2, Check, DollarSign, Calendar, Link2, Unlink, ArrowDownToLine, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Vehicle,
  useVehicles,
  useAddVehicle,
  useRemoveVehicle,
  useVehiclePayments,
  useAllVehiclePayments,
  useAddVehiclePayment,
  useRemoveVehiclePayment,
  useVehicleExpenses,
  useLinkExpenseToVehicle,
  useUnlinkExpenseFromVehicle,
  useUpdateVehicle,
  generateAmortSchedule,
  calculateDepreciation,
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
  depreciation_method: "MACRS",
  placed_in_service_date: new Date().toISOString().slice(0, 10),
  business_use_pct: 100,
  useful_life_years: 5,
  section_179_amount: 0,
};

export default function VehiclesPage() {
  const { data: vehicles = [], isLoading } = useVehicles();
  const { data: allPrincipalPaid = {} } = useAllVehiclePayments();
  const addVehicle = useAddVehicle();
  const removeVehicle = useRemoveVehicle();
  const updateVehicle = useUpdateVehicle();
  const { data: expenses = [] } = useExpenses();

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyVehicle);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Extra payment dialog
  const [showExtraPayment, setShowExtraPayment] = useState(false);
  const [extraAmount, setExtraAmount] = useState(0);
  const [extraDate, setExtraDate] = useState(new Date().toISOString().slice(0, 10));
  const [extraNotes, setExtraNotes] = useState("");
  const [extraRecurring, setExtraRecurring] = useState(false);
  const [extraRecurringCount, setExtraRecurringCount] = useState(3);

  // Transaction matching dialog
  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [matchingPaymentRow, setMatchingPaymentRow] = useState<number | null>(null);
  const [matchSearch, setMatchSearch] = useState("");

  // Payment detail dialog
  const [paymentDetailOpen, setPaymentDetailOpen] = useState(false);
  const [paymentDetailData, setPaymentDetailData] = useState<{ payment: any; expense: any } | null>(null);

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

  const amortSchedule = useMemo(() => {
    if (!selected) return [];
    return generateAmortSchedule(
      selected.loan_amount, selected.interest_rate, selected.loan_term_months,
      selected.monthly_payment, selected.loan_start_date, payments
    );
  }, [selected, payments]);

  const depreciationSchedule = useMemo(() => {
    if (!selected) return [];
    return calculateDepreciation(selected);
  }, [selected]);

  const totalDepreciation = depreciationSchedule.reduce((s, r) => s + r.businessDepreciation, 0);
  const currentYear = new Date().getFullYear();
  const thisYearDepreciation = depreciationSchedule
    .filter((r) => r.calendarYear === currentYear)
    .reduce((s, r) => s + r.businessDepreciation, 0);

  const nextUnpaid = amortSchedule.find((r) => !r.paid);
  const totalPaid = payments.reduce((s, p) => s + p.amount_paid, 0);
  // Remaining balance = balance after the last payment actually made
  // If no payments made, show the original loan amount
  const lastPaidRow = [...amortSchedule].reverse().find((r) => r.paid);
  const currentBalance = lastPaidRow
    ? lastPaidRow.balance
    : (selected?.loan_amount ?? 0);

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

  // Extra payment handler — supports recurring
  const handleExtraPayment = async () => {
    if (!selected || !nextUnpaid || extraAmount <= 0) return;

    const count = extraRecurring ? Math.max(1, extraRecurringCount) : 1;
    const unpaidRows = amortSchedule.filter((r) => !r.paid);

    for (let i = 0; i < Math.min(count, unpaidRows.length); i++) {
      const targetRow = unpaidRows[i];
      const monthlyRate = selected.interest_rate / 100 / 12;
      // For simplicity, use the scheduled interest for each row
      const interestPortion = targetRow.interest;
      const principalPortion = Math.round((extraAmount - interestPortion) * 100) / 100;

      const payDate = new Date(extraDate);
      payDate.setMonth(payDate.getMonth() + i);

      await addPayment.mutateAsync({
        vehicle_id: selected.id,
        payment_number: targetRow.number,
        amount_paid: extraAmount,
        principal_portion: Math.max(principalPortion, 0),
        interest_portion: Math.min(interestPortion, extraAmount),
        date_paid: payDate.toISOString().slice(0, 10),
        notes: extraRecurring
          ? `Recurring extra payment ${i + 1}/${count}`
          : (extraNotes || "Extra payment"),
      });
    }

    toast.success(
      extraRecurring
        ? `${Math.min(count, unpaidRows.length)} recurring extra payments recorded`
        : `Extra payment of ${formatCurrency(extraAmount)} recorded`
    );
    setShowExtraPayment(false);
    setExtraAmount(0);
    setExtraNotes("");
    setExtraRecurring(false);
    setExtraRecurringCount(3);
  };

  // ── Transaction matching logic ──
  const linkedIds = new Set(linkedExpenses.map((le: any) => le.expense_id));

  // Find candidate transactions that could match a payment row
  const matchCandidates = useMemo(() => {
    if (matchingPaymentRow === null || !selected) return [];
    const row = amortSchedule.find((r) => r.number === matchingPaymentRow);
    if (!row) return [];

    const paymentAmount = selected.monthly_payment;
    const dueDate = new Date(row.date);

    // Score all expenses by similarity
    let candidates = expenses
      .filter((e) => !linkedIds.has(e.id))
      .map((e) => {
        const amountDiff = Math.abs(e.amount - paymentAmount);
        const amountScore = amountDiff <= paymentAmount * 0.05 ? 3
          : amountDiff <= paymentAmount * 0.15 ? 2
          : amountDiff <= paymentAmount * 0.50 ? 1 : 0;

        const expDate = new Date(e.date);
        const daysDiff = Math.abs((expDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        const dateScore = daysDiff <= 7 ? 3 : daysDiff <= 30 ? 2 : daysDiff <= 90 ? 1 : 0;

        // Check if description/vendor hints at vehicle payment
        const vendorLower = (e.vendor + " " + (e.description || "")).toLowerCase();
        const keywordScore = /loan|payment|auto|vehicle|car|finance|lien/.test(vendorLower) ? 2 : 0;

        return { ...e, score: amountScore + dateScore + keywordScore, amountDiff, daysDiff };
      })
      .filter((e) => e.score > 0);

    if (matchSearch.trim()) {
      const q = matchSearch.toLowerCase();
      candidates = candidates.filter(
        (e) => e.vendor.toLowerCase().includes(q) || (e.description || "").toLowerCase().includes(q)
      );
    }

    return candidates.sort((a, b) => b.score - a.score).slice(0, 15);
  }, [matchingPaymentRow, selected, expenses, linkedIds, amortSchedule, matchSearch]);

  const handleMatchTransaction = async (expenseId: string) => {
    if (!selected || matchingPaymentRow === null) return;
    const row = amortSchedule.find((r) => r.number === matchingPaymentRow);
    if (!row) return;

    // Link expense to vehicle
    await linkExpense.mutateAsync({ vehicleId: selected.id, expenseId });

    // If not already paid, mark as paid using the expense data
    if (!row.paid) {
      const expense = expenses.find((e) => e.id === expenseId);
      if (expense) {
        const monthlyRate = selected.interest_rate / 100 / 12;
        const interest = row.interest;
        const principal = Math.round((expense.amount - interest) * 100) / 100;
        await addPayment.mutateAsync({
          vehicle_id: selected.id,
          payment_number: row.number,
          amount_paid: expense.amount,
          principal_portion: Math.max(principal, 0),
          interest_portion: Math.min(interest, expense.amount),
          date_paid: expense.date,
          notes: `Matched: ${expense.vendor}`,
        });
      }
    }

    toast.success(`Transaction matched to payment #${matchingPaymentRow}`);
    setMatchDialogOpen(false);
    setMatchingPaymentRow(null);
  };

  // Vehicle expenses = linked expenses that are NOT payments or gas
  const nonPaymentLinked = linkedExpenses.filter((le: any) => {
    const cat = le.expenses?.category;
    return cat !== "Vehicle Payment" && cat !== "Fuel";
  });
  const linkedExpenseTotal = nonPaymentLinked.reduce((s: number, le: any) => s + Number(le.expenses?.amount ?? 0), 0);

  // Linkable: maintenance, insurance, repairs — exclude payments and gas
  const linkableCategories = ["Vehicle Maintenance", "Repairs & Maintenance", "Insurance", "Equipment"];
  const linkableExpenses = useMemo(() => {
    let list = expenses.filter(
      (e) => linkableCategories.includes(e.category) && !linkedIds.has(e.id)
    );
    if (expenseSearch.trim()) {
      const q = expenseSearch.toLowerCase();
      list = list.filter((e) => e.vendor.toLowerCase().includes(q) || (e.description || "").toLowerCase().includes(q));
    }
    return list.slice(0, 20);
  }, [expenses, linkedIds, expenseSearch]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Vehicle Manager</h1>
            <p className="text-muted-foreground text-sm mt-1">Track financing, payments, depreciation, and per-vehicle costs</p>
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
                  <Badge variant={v.status === "active" ? "default" : "secondary"}>{v.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{v.year} {v.make} {v.model}</p>
                <div className="flex justify-between mt-3 text-sm">
                  <span className="text-muted-foreground">Loan</span>
                  <span className="font-mono">{formatCurrency(v.loan_amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Monthly</span>
                  <span className="font-mono">{formatCurrency(v.monthly_payment)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Balance</span>
                  <span className="font-mono">{formatCurrency(Math.max(v.loan_amount - (allPrincipalPaid[v.id] || 0), 0))}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Detail panel */}
        {selected && (
          <div className="stat-card">
            <Tabs defaultValue="schedule" className="w-full">
              <div className="flex items-center justify-between p-4 border-b border-border flex-wrap gap-2">
                <div>
                  <h2 className="text-lg font-bold">{selected.name}</h2>
                  <p className="text-xs text-muted-foreground">{selected.year} {selected.make} {selected.model}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <TabsList>
                    <TabsTrigger value="schedule">Amortization</TabsTrigger>
                    <TabsTrigger value="depreciation">Depreciation</TabsTrigger>
                    <TabsTrigger value="expenses">Expenses</TabsTrigger>
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
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4">
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
                  <p className="text-xs text-muted-foreground">
                    {selected.section_179_amount > 0 ? "§179 Deduction" : `${currentYear} Depreciation`}
                  </p>
                  <p className="text-lg font-bold font-mono text-primary">
                    {formatCurrency(selected.section_179_amount > 0 ? totalDepreciation : thisYearDepreciation)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Vehicle Expenses</p>
                  <p className="text-lg font-bold font-mono">{formatCurrency(linkedExpenseTotal)}</p>
                </div>
              </div>

              {/* Next payment + extra payment */}
              {nextUnpaid && (
                <div className="mx-4 mb-4 p-3 rounded-lg bg-accent/50 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Next: #{nextUnpaid.number} due {nextUnpaid.date}</span>
                    <span className="text-sm font-mono text-muted-foreground">{formatCurrency(nextUnpaid.payment)}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => {
                      setExtraAmount(selected.monthly_payment * 2);
                      setExtraDate(new Date().toISOString().slice(0, 10));
                      setExtraNotes("");
                      setExtraRecurring(false);
                      setExtraRecurringCount(3);
                      setShowExtraPayment(true);
                    }}>
                      <ArrowDownToLine className="h-3.5 w-3.5 mr-1" /> Extra Payment
                    </Button>
                    <Button size="sm" onClick={() => handleMarkPaid(nextUnpaid)} disabled={addPayment.isPending}>
                      <Check className="h-3.5 w-3.5 mr-1" /> Mark Paid
                    </Button>
                  </div>
                </div>
              )}

              {/* Amortization tab */}
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
                        <th>Match</th>
                      </tr>
                    </thead>
                    <tbody>
                      {amortSchedule.map((row) => {
                        const payment = payments.find((p) => p.payment_number === row.number);
                        const isExtra = payment && payment.amount_paid > row.payment + 0.01;
                        const isMatched = payment?.notes?.startsWith("Matched:");
                        return (
                          <tr key={row.number} className={row.paid ? "opacity-60" : ""}>
                            <td className="font-mono text-xs">{row.number}</td>
                            <td className={`font-mono text-xs ${row.paid ? "cursor-pointer hover:text-primary hover:underline" : ""}`}
                              onClick={() => {
                                if (row.paid && payment) {
                                  // Find linked expense by matching date + amount through vehicle_expenses
                                  const linked = linkedExpenses.find((le: any) =>
                                    le.expenses?.date === payment.date_paid &&
                                    Math.abs(Number(le.expenses?.amount ?? 0) - payment.amount_paid) < 0.02
                                  );
                                  setPaymentDetailData({
                                    payment,
                                    expense: linked?.expenses ?? null,
                                  });
                                  setPaymentDetailOpen(true);
                                }
                              }}
                            >{row.date}{row.paid && <span className="ml-1 text-muted-foreground">↗</span>}</td>
                            <td className="text-right font-mono text-xs">
                              {row.paid && payment ? formatCurrency(payment.amount_paid) : formatCurrency(row.payment)}
                              {isExtra && <Badge variant="secondary" className="ml-1 text-[10px] py-0">Extra</Badge>}
                            </td>
                            <td className="text-right font-mono text-xs">
                              {row.paid && payment ? formatCurrency(payment.principal_portion) : formatCurrency(row.principal)}
                            </td>
                            <td className="text-right font-mono text-xs">
                              {row.paid && payment ? formatCurrency(payment.interest_portion) : formatCurrency(row.interest)}
                            </td>
                            <td className="text-right font-mono text-xs">{formatCurrency(row.balance)}</td>
                            <td>
                              {row.paid ? (
                                <div className="flex items-center gap-1">
                                  <Badge variant="secondary" className="text-xs">
                                    <Check className="h-3 w-3 mr-0.5" /> Paid
                                  </Badge>
                                  {isMatched && (
                                    <Badge variant="outline" className="text-[10px] py-0 text-primary">
                                      <Link2 className="h-2.5 w-2.5 mr-0.5" /> Matched
                                    </Badge>
                                  )}
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                                    if (payment) {
                                      removePayment.mutate({ id: payment.id, vehicleId: selected.id });
                                      toast.success("Payment undone");
                                    }
                                  }}>
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </div>
                              ) : (
                                <Button variant="outline" size="sm" className="h-6 text-xs"
                                  onClick={() => handleMarkPaid(row)} disabled={addPayment.isPending}>
                                  Mark Paid
                                </Button>
                              )}
                            </td>
                            <td>
                              {!row.paid && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-xs gap-1"
                                  onClick={() => {
                                    setMatchingPaymentRow(row.number);
                                    setMatchSearch("");
                                    setMatchDialogOpen(true);
                                  }}
                                >
                                  <Search className="h-3 w-3" /> Match
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* Depreciation tab */}
              <TabsContent value="depreciation" className="p-4 pt-0 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {selected.depreciation_method} Depreciation • {selected.useful_life_years}-Year Property
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Cost basis: {formatCurrency(selected.purchase_price)} • Business use: {selected.business_use_pct}%
                      {selected.section_179_amount > 0 && ` • §179: ${formatCurrency(selected.section_179_amount)}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <div>
                      <Label className="text-xs">Business Use %</Label>
                      <Input
                        type="number" min={0} max={100} className="w-20 h-8 text-xs"
                        value={selected.business_use_pct}
                        onChange={(e) => {
                          const val = Math.min(100, Math.max(0, Number(e.target.value)));
                          updateVehicle.mutate({ id: selected.id, business_use_pct: val } as any);
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">§179 (full Year 1)</Label>
                      <Switch
                        checked={selected.section_179_amount > 0}
                        onCheckedChange={(checked) => {
                          updateVehicle.mutate({ id: selected.id, section_179_amount: checked ? selected.purchase_price : 0 } as any);
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Year</th>
                        <th>Calendar Year</th>
                        <th className="text-right">Beginning Value</th>
                        <th className="text-right">Depreciation</th>
                        <th className="text-right">Ending Value</th>
                        <th className="text-right">Business Deduction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {depreciationSchedule.map((row) => (
                        <tr key={`${row.year}-${row.calendarYear}`}>
                          <td className="font-mono text-xs">
                            {row.year === 0 ? "§179" : `Year ${row.year}`}
                          </td>
                          <td className="font-mono text-xs">{row.calendarYear}</td>
                          <td className="text-right font-mono text-xs">{formatCurrency(row.beginningValue)}</td>
                          <td className="text-right font-mono text-xs">{formatCurrency(row.depreciation)}</td>
                          <td className="text-right font-mono text-xs">{formatCurrency(row.endingValue)}</td>
                          <td className="text-right font-mono text-xs font-semibold text-primary">
                            {formatCurrency(row.businessDepreciation)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border">
                        <td colSpan={5} className="font-semibold text-sm">Total Business Depreciation</td>
                        <td className="text-right font-mono font-bold text-primary">{formatCurrency(totalDepreciation)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="p-3 rounded-lg bg-accent/30 text-xs text-muted-foreground space-y-1">
                  <p><strong>MACRS (Modified Accelerated Cost Recovery System)</strong> is the IRS-required depreciation method for most business vehicles.</p>
                  <p>• 5-year property: cars, light trucks, SUVs under 6,000 lbs GVWR</p>
                  <p>• §179 allows you to deduct the full cost in year one (up to IRS limits)</p>
                  <p>• Only the business-use percentage is deductible on Schedule C (Line 13)</p>
                </div>
              </TabsContent>

              {/* Linked Expenses tab */}
              <TabsContent value="expenses" className="p-4 pt-0 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Link maintenance, repair, and insurance expenses to this vehicle for per-vehicle cost tracking (excludes payments & gas).
                  </p>
                  <Button size="sm" onClick={() => { setLinkDialogOpen(true); setExpenseSearch(""); }}>
                    <Link2 className="h-3.5 w-3.5 mr-1" /> Link Expense
                  </Button>
                </div>

                {nonPaymentLinked.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6">No maintenance/repair expenses linked yet.</p>
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
                        {nonPaymentLinked.map((le: any) => (
                          <tr key={le.id}>
                            <td className="font-mono text-xs">{le.expenses?.date}</td>
                            <td>{le.expenses?.vendor}</td>
                            <td><Badge variant="secondary" className="text-xs">{le.expenses?.category}</Badge></td>
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
            <DialogHeader><DialogTitle>Add Vehicle</DialogTitle></DialogHeader>
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

              <hr className="border-border" />
              <p className="text-sm font-medium text-muted-foreground">Depreciation</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Method</Label>
                  <Select value={form.depreciation_method} onValueChange={(v) => setField("depreciation_method", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MACRS">MACRS (Standard)</SelectItem>
                      <SelectItem value="Straight-Line">Straight-Line</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Placed in Service</Label><Input type="date" value={form.placed_in_service_date || ""} onChange={(e) => setField("placed_in_service_date", e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Business Use %</Label><Input type="number" min={0} max={100} value={form.business_use_pct} onChange={(e) => setField("business_use_pct", Number(e.target.value))} /></div>
                <div>
                  <Label>Recovery Period</Label>
                  <Select value={String(form.useful_life_years)} onValueChange={(v) => setField("useful_life_years", Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 Years</SelectItem>
                      <SelectItem value="7">7 Years</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="text-sm whitespace-nowrap">Deduct full cost in Year 1 (§179)?</Label>
                  <Switch
                    checked={form.section_179_amount > 0}
                    onCheckedChange={(checked) => setField("section_179_amount", checked ? form.purchase_price : 0)}
                  />
                  {form.section_179_amount > 0 && (
                    <span className="text-xs text-muted-foreground font-mono">{formatCurrency(form.section_179_amount)}</span>
                  )}
                </div>
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

        {/* Extra Payment dialog — now with recurring option */}
        <Dialog open={showExtraPayment} onOpenChange={setShowExtraPayment}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Extra Payment — {selected?.name}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              Make an additional principal payment to pay off the loan faster. Current balance: {formatCurrency(currentBalance)}
            </p>
            <div className="space-y-3 mt-2">
              <div>
                <Label>Payment Amount</Label>
                <Input type="number" min={0} step="0.01" value={extraAmount || ""} onChange={(e) => setExtraAmount(Number(e.target.value))} />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={extraDate} onChange={(e) => setExtraDate(e.target.value)} />
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Input value={extraNotes} onChange={(e) => setExtraNotes(e.target.value)} placeholder="e.g. Tax refund paydown" />
              </div>

              {/* Recurring toggle */}
              <div className="p-3 rounded-lg border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-medium cursor-pointer">Make Recurring</Label>
                  </div>
                  <Switch checked={extraRecurring} onCheckedChange={setExtraRecurring} />
                </div>
                {extraRecurring && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Schedule this extra payment amount for multiple consecutive months.
                    </p>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">Number of months</Label>
                      <Input
                        type="number"
                        min={2}
                        max={Math.max(2, amortSchedule.filter(r => !r.paid).length)}
                        className="w-20 h-8 text-xs"
                        value={extraRecurringCount}
                        onChange={(e) => setExtraRecurringCount(Number(e.target.value))}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Total: {formatCurrency(extraAmount * Math.min(extraRecurringCount, amortSchedule.filter(r => !r.paid).length))} over{" "}
                      {Math.min(extraRecurringCount, amortSchedule.filter(r => !r.paid).length)} months
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowExtraPayment(false)}>Cancel</Button>
              <Button onClick={handleExtraPayment} disabled={addPayment.isPending || extraAmount <= 0}>
                {addPayment.isPending ? "Saving…" : extraRecurring ? `Record ${Math.min(extraRecurringCount, amortSchedule.filter(r => !r.paid).length)} Payments` : "Record Payment"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Match Transaction dialog */}
        <Dialog open={matchDialogOpen} onOpenChange={setMatchDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Match Transaction to Payment #{matchingPaymentRow}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Select a transaction that corresponds to this loan payment. Best matches are shown first based on amount, date, and description.
            </p>
            <Input
              placeholder="Search transactions…"
              value={matchSearch}
              onChange={(e) => setMatchSearch(e.target.value)}
              className="mt-2"
            />
            <div className="max-h-60 overflow-y-auto space-y-1 mt-2">
              {matchCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No matching transactions found. Try broadening your search or import more transactions.
                </p>
              ) : (
                matchCandidates.map((e) => (
                  <button
                    key={e.id}
                    className="flex items-center justify-between w-full px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
                    onClick={() => handleMatchTransaction(e.id)}
                  >
                    <div className="text-left flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium truncate">{e.vendor}</span>
                        {e.score >= 6 && (
                          <Badge variant="default" className="text-[10px] py-0 shrink-0">Best Match</Badge>
                        )}
                        {e.score >= 4 && e.score < 6 && (
                          <Badge variant="secondary" className="text-[10px] py-0 shrink-0">Good Match</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{e.date}</span>
                        <span>•</span>
                        <span>{e.category}</span>
                      </div>
                    </div>
                    <span className="font-mono text-xs ml-2 shrink-0">{formatCurrency(e.amount)}</span>
                  </button>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Link Expense dialog */}
        <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Link Expense to {selected?.name}</DialogTitle></DialogHeader>
            <Input placeholder="Search maintenance/repair expenses…" value={expenseSearch} onChange={(e) => setExpenseSearch(e.target.value)} />
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

        {/* Payment Detail dialog */}
        <Dialog open={paymentDetailOpen} onOpenChange={setPaymentDetailOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Payment Details</DialogTitle></DialogHeader>
            {paymentDetailData && (
              <div className="space-y-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payment #</span>
                    <span className="font-mono">{paymentDetailData.payment.payment_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date Paid</span>
                    <span className="font-mono">{paymentDetailData.payment.date_paid}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-mono font-semibold">{formatCurrency(paymentDetailData.payment.amount_paid)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Principal</span>
                    <span className="font-mono">{formatCurrency(paymentDetailData.payment.principal_portion)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Interest</span>
                    <span className="font-mono">{formatCurrency(paymentDetailData.payment.interest_portion)}</span>
                  </div>
                  {paymentDetailData.payment.notes && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Notes</span>
                      <span className="text-xs text-right max-w-[200px]">{paymentDetailData.payment.notes}</span>
                    </div>
                  )}
                </div>

                <hr className="border-border" />

                {paymentDetailData.expense ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Linked Transaction</p>
                    <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="font-medium">{paymentDetailData.expense.vendor}</span>
                        <span className="font-mono">{formatCurrency(Number(paymentDetailData.expense.amount))}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{paymentDetailData.expense.date}</p>
                      {paymentDetailData.expense.description && (
                        <p className="text-xs text-muted-foreground">{paymentDetailData.expense.description}</p>
                      )}
                      <Badge variant="secondary" className="text-xs mt-1">{paymentDetailData.expense.category}</Badge>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">No linked transaction found — this payment was recorded manually.</p>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
