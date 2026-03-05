import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useExpenses, useSales, useProfile } from "@/hooks/useData";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useQuarterlyPayments, useAddQuarterlyPayment, useDeleteQuarterlyPayment } from "@/hooks/useQuarterlyPayments";
import { calculateWithholdings, calculateQBI, calculateHomeOffice, calculateMileageDeduction, STATE_RATES, FilingStatus, FILING_STATUS_LABELS, MILEAGE_RATE_2026 } from "@/lib/taxCalc";
import { formatCurrency } from "@/lib/format";
import DateRangeFilter from "@/components/DateRangeFilter";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Calculator, Calendar, DollarSign, Landmark, FileText, Printer, Home, Car, Percent, Trash2, Plus, Check } from "lucide-react";
import SalesTaxTab from "@/components/SalesTaxTab";
import { toast } from "sonner";

const SE_RATE = 0.153;
const SE_FACTOR = 0.9235;
const QUARTERLY_DATES = [
  { label: "Q1", due: "Apr 15, 2026", quarter: 1 },
  { label: "Q2", due: "Jun 15, 2026", quarter: 2 },
  { label: "Q3", due: "Sep 15, 2026", quarter: 3 },
  { label: "Q4", due: "Jan 15, 2027", quarter: 4 },
];

const SCHEDULE_C_LINES: { line: string; label: string; key: string }[] = [
  { line: "8", label: "Advertising", key: "Marketing" },
  { line: "9", label: "Car and truck expenses", key: "Fuel" },
  { line: "9", label: "Vehicle repairs and maintenance", key: "Vehicle Maintenance" },
  { line: "10", label: "Commissions and fees", key: "Commissions & Fees" },
  { line: "11", label: "Contract labor", key: "Contract Labor" },
  { line: "13", label: "Depreciation and section 179 expense", key: "Equipment" },
  { line: "15", label: "Insurance (other than health)", key: "Insurance" },
  { line: "16a", label: "Interest (mortgage)", key: "Interest & Bank Fees" },
  { line: "17", label: "Legal and professional services", key: "Professional Services" },
  { line: "18", label: "Office expense", key: "Office Supplies" },
  { line: "20b", label: "Rent — Business property", key: "Rent" },
  { line: "21", label: "Repairs and maintenance", key: "Repairs & Maintenance" },
  { line: "22", label: "Supplies", key: "Supplies & Materials" },
  { line: "23", label: "Taxes and licenses", key: "Taxes & Licenses" },
  { line: "24a", label: "Travel", key: "Travel" },
  { line: "24b", label: "Deductible meals (50%)", key: "Meals & Entertainment" },
  { line: "25", label: "Utilities", key: "Utilities" },
  { line: "26", label: "Wages", key: "Payroll" },
  { line: "27a", label: "Education and training", key: "Education & Training" },
  { line: "27a", label: "Shipping and postage", key: "Shipping & Postage" },
  { line: "27a", label: "Software and SaaS", key: "Software & SaaS" },
  { line: "30", label: "Business use of home", key: "Home Office" },
  { line: "27b", label: "Other expenses", key: "Other" },
];

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmt$(n: number) { return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function TaxCenterPage() {
  const { data: allExpenses = [] } = useExpenses();
  const { data: allSales = [] } = useSales();
  const { data: profile } = useProfile();
  const { filterByDate } = useDateRange();
  const { data: qPayments = [] } = useQuarterlyPayments();
  const addQPayment = useAddQuarterlyPayment();
  const deleteQPayment = useDeleteQuarterlyPayment();

  const expenses = useMemo(() => filterByDate(allExpenses), [allExpenses, filterByDate]);
  const sales = useMemo(() => filterByDate(allSales), [allSales, filterByDate]);

  const state = profile?.business_state || "CA";

  // ── Deductions & settings ──
  const [filingStatus, setFilingStatus] = useState<FilingStatus>("single");
  const [qbiEnabled, setQbiEnabled] = useState(true);
  const [homeOfficeSqft, setHomeOfficeSqft] = useState(0);
  const [businessMiles, setBusinessMiles] = useState(0);
  const [paymentForm, setPaymentForm] = useState({ quarter: "", amount: "", date: "" });
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  /* ── Tax Estimate ── */
  const taxCalc = useMemo(() => {
    const totalRevenue = sales.reduce((s, r) => s + r.amount, 0);
    const totalExpenses = expenses.reduce((s, r) => s + r.amount, 0);
    const homeOfficeDeduction = calculateHomeOffice(homeOfficeSqft);
    const mileageDeduction = calculateMileageDeduction(businessMiles);
    const net = totalRevenue - totalExpenses - homeOfficeDeduction - mileageDeduction;
    const seBase = Math.max(0, net * SE_FACTOR);
    const se = Math.round(seBase * SE_RATE * 100) / 100;
    const qbiDeduction = qbiEnabled ? calculateQBI(net, filingStatus) : 0;
    const adjustedIncome = Math.max(0, net - se / 2 - qbiDeduction);
    const w = calculateWithholdings(adjustedIncome, state, filingStatus);
    const totalLiability = w.federalWithholding + w.stateWithholding + se;
    return { netIncome: net, seTax: se, federalTax: w.federalWithholding, stateTax: w.stateWithholding, totalLiability, qbiDeduction, homeOfficeDeduction, mileageDeduction };
  }, [expenses, sales, state, filingStatus, qbiEnabled, homeOfficeSqft, businessMiles]);

  const quarterlyPayment = Math.round((taxCalc.totalLiability / 4) * 100) / 100;
  const now = new Date();
  const yearStart = new Date(2026, 0, 1);
  const yearEnd = new Date(2026, 11, 31);
  const yearProgress = Math.min(100, Math.max(0, ((now.getTime() - yearStart.getTime()) / (yearEnd.getTime() - yearStart.getTime())) * 100));

  // Quarterly payments by quarter
  const paidByQuarter = useMemo(() => {
    const map: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    qPayments.forEach((p) => { map[p.quarter] = (map[p.quarter] || 0) + p.amount_paid; });
    return map;
  }, [qPayments]);
  const totalPaid = Object.values(paidByQuarter).reduce((s, v) => s + v, 0);

  const handleAddPayment = () => {
    if (!paymentForm.quarter || !paymentForm.amount || !paymentForm.date) { toast.error("Fill all fields"); return; }
    addQPayment.mutate({
      quarter: parseInt(paymentForm.quarter),
      amount_paid: parseFloat(paymentForm.amount),
      date_paid: paymentForm.date,
      tax_year: 2026,
      payment_type: "federal",
      notes: null,
    }, {
      onSuccess: () => { toast.success("Payment recorded"); setPaymentForm({ quarter: "", amount: "", date: "" }); setShowPaymentForm(false); },
      onError: () => toast.error("Failed to record"),
    });
  };

  /* ── Schedule C ── */
  const [ssnDialog, setSsnDialog] = useState(false);
  const [fullSsn, setFullSsn] = useState("");
  const [fullEin, setFullEin] = useState("");

  const totalRevenue = sales.reduce((sum, s) => sum + s.amount, 0);
  const categoryTotals: Record<string, number> = {};
  expenses.forEach((e) => { categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount; });
  if (categoryTotals["Meals & Entertainment"]) categoryTotals["Meals & Entertainment"] = Math.round(categoryTotals["Meals & Entertainment"] * 0.5 * 100) / 100;
  const lineItems = SCHEDULE_C_LINES.map((l) => ({ ...l, amount: categoryTotals[l.key] || 0 }));
  const totalExpensesC = lineItems.reduce((sum, l) => sum + l.amount, 0);
  const netProfit = totalRevenue - totalExpensesC;

  const generateScheduleC = () => {
    if (!fullSsn) { toast.error("Enter your SSN"); return; }
    const taxYear = new Date().getFullYear();
    const businessName = profile?.business_name || "Your Business";
    const businessAddress = profile ? [profile.business_address, profile.business_city, profile.business_state, profile.business_zip].filter(Boolean).join(", ") : "";
    const ein = fullEin || (profile?.ein_last4 ? `**-***${profile.ein_last4}` : "");
    const lineRows = lineItems.filter((l) => l.amount > 0).map((l) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;font-size:11px;color:#666;">Line ${escapeHtml(l.line)}</td><td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;">${escapeHtml(l.label)}</td><td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;text-align:right;font-family:'Courier New',monospace;">$${fmt$(l.amount)}</td></tr>`).join("\n");
    const html = `<!DOCTYPE html><html><head><title>Schedule C - ${businessName} ${taxYear}</title><style>@page{size:letter;margin:0.5in}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:11px;color:#000;background:#fff;padding:0.5in}.form{border:2px solid #000;max-width:7.5in;margin:0 auto}.header{background:#2d5016;color:#fff;padding:14px 16px;display:flex;justify-content:space-between;align-items:center}.header h1{font-size:18px;font-weight:bold;letter-spacing:1px}.header .year{font-size:28px;font-weight:bold;color:#e8e8e8}.section{border-bottom:1px solid #000}.section-label{background:#f0f0f0;padding:6px 10px;font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #000}.info-grid{display:grid;grid-template-columns:1fr 1fr}.info-cell{padding:8px 10px;border-right:1px solid #ccc;border-bottom:1px solid #ccc}.info-cell:nth-child(even){border-right:none}.info-label{font-size:8px;color:#666;text-transform:uppercase;margin-bottom:3px;letter-spacing:0.5px}.info-value{font-size:12px;font-weight:bold}table{width:100%;border-collapse:collapse}th{text-align:left;padding:6px 10px;font-size:9px;text-transform:uppercase;color:#666;border-bottom:2px solid #000}th:last-child{text-align:right}.total-row{font-weight:bold;font-size:13px;border-top:2px solid #000}.total-row td{padding:10px}.net-row{font-size:16px;font-weight:bold;background:#f7f7f0}.net-row td{padding:12px 10px}.footer{padding:10px;font-size:8px;color:#666;text-align:center;border-top:1px solid #ccc}@media print{body{padding:0}.no-print{display:none}}</style></head><body><div class="no-print" style="text-align:center;margin-bottom:20px;"><button onclick="window.print()" style="padding:10px 24px;font-size:14px;cursor:pointer;background:#2d5016;color:#fff;border:none;border-radius:4px;">Print / Save as PDF</button></div><div class="form"><div class="header"><div><h1>Schedule C (Form 1040)</h1><div class="sub" style="font-size:9px;color:#ccc;margin-top:2px;">Profit or Loss From Business (Sole Proprietorship)</div></div><div class="year">${taxYear}</div></div><div class="section"><div class="section-label">Taxpayer / Business Information</div><div class="info-grid"><div class="info-cell"><div class="info-label">Name of proprietor</div><div class="info-value">${escapeHtml(businessName)}</div></div><div class="info-cell"><div class="info-label">Social Security Number</div><div class="info-value">${escapeHtml(fullSsn)}</div></div><div class="info-cell"><div class="info-label">Business Name (DBA)</div><div class="info-value">${escapeHtml(businessName)}</div></div><div class="info-cell"><div class="info-label">Employer ID Number (EIN)</div><div class="info-value">${escapeHtml(ein)}</div></div><div class="info-cell" style="grid-column:1/-1;border-right:none;"><div class="info-label">Business Address</div><div class="info-value">${escapeHtml(businessAddress)}</div></div></div></div><div class="section"><div class="section-label">Part I — Income</div><table><tr><td style="padding:8px 10px;font-size:11px;color:#666;">Line 1</td><td style="padding:8px 10px;">Gross receipts or sales</td><td style="padding:8px 10px;text-align:right;font-family:'Courier New',monospace;font-weight:bold;font-size:14px;">$${fmt$(totalRevenue)}</td></tr><tr class="total-row"><td></td><td>Line 7 — Gross income</td><td style="text-align:right;font-family:'Courier New',monospace;">$${fmt$(totalRevenue)}</td></tr></table></div><div class="section"><div class="section-label">Part II — Expenses</div><table><thead><tr><th>Line</th><th>Description</th><th>Amount</th></tr></thead><tbody>${lineRows}<tr class="total-row"><td></td><td>Line 28 — Total expenses</td><td style="text-align:right;font-family:'Courier New',monospace;">$${fmt$(totalExpensesC)}</td></tr></tbody></table></div><div class="section"><table><tr class="net-row"><td colspan="2">Line 31 — Net profit (or loss)</td><td style="text-align:right;font-family:'Courier New',monospace;color:${netProfit >= 0 ? '#2d5016' : '#dc2626'};">$${fmt$(netProfit)}</td></tr></table></div><div class="footer">Schedule C (Form 1040) ${taxYear} &bull; Generated by Bookie &bull; For informational purposes — verify with a tax professional</div></div></body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) { const a = document.createElement("a"); a.href = url; a.download = `Schedule-C-${taxYear}.html`; a.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setSsnDialog(false); setFullSsn(""); setFullEin("");
    toast.success("Schedule C generated");
  };

  // ── Tax Payment Reminders ──
  const taxReminders = useMemo(() => {
    const dueDates = [
      { quarter: 1, date: new Date(2026, 3, 15), label: "Q1 — Apr 15, 2026" },
      { quarter: 2, date: new Date(2026, 5, 15), label: "Q2 — Jun 15, 2026" },
      { quarter: 3, date: new Date(2026, 8, 15), label: "Q3 — Sep 15, 2026" },
      { quarter: 4, date: new Date(2027, 0, 15), label: "Q4 — Jan 15, 2027" },
    ];
    const reminders: { label: string; type: "warning" | "overdue" }[] = [];
    const today = new Date();
    for (const q of dueDates) {
      const paid = paidByQuarter[q.quarter] || 0;
      if (paid >= quarterlyPayment && quarterlyPayment > 0) continue;
      const daysUntil = Math.ceil((q.date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntil < 0) reminders.push({ label: `${q.label} — OVERDUE (no payment recorded)`, type: "overdue" });
      else if (daysUntil <= 30) reminders.push({ label: `${q.label} — due in ${daysUntil} days`, type: "warning" });
    }
    return reminders;
  }, [paidByQuarter, quarterlyPayment]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Tax Center</h1>
            <p className="text-muted-foreground text-sm mt-1">Tax liability estimates, quarterly payments & Schedule C</p>
          </div>
          <DateRangeFilter />
        </div>

        {/* Tax payment reminders */}
        {taxReminders.map((r, i) => (
          <Alert key={i} variant={r.type === "overdue" ? "destructive" : "default"} className={r.type === "warning" ? "border-yellow-500/50 bg-yellow-500/5" : ""}>
            <Calendar className="h-4 w-4" />
            <AlertTitle className="text-sm">{r.type === "overdue" ? "⚠️ Overdue Payment" : "📅 Upcoming Due Date"}</AlertTitle>
            <AlertDescription className="text-xs">{r.label}</AlertDescription>
          </Alert>
        ))}

        <Tabs defaultValue={new URLSearchParams(window.location.search).get("tab") || "estimate"}>
          <TabsList>
            <TabsTrigger value="estimate">Tax Estimate</TabsTrigger>
            <TabsTrigger value="deductions">Deductions</TabsTrigger>
            <TabsTrigger value="sales-tax">Sales Tax</TabsTrigger>
            <TabsTrigger value="schedule-c">Schedule C</TabsTrigger>
          </TabsList>

          {/* ── Tax Estimate Tab ── */}
          <TabsContent value="estimate" className="space-y-8 mt-4">
            {/* Filing status & QBI */}
            <div className="flex flex-wrap items-center gap-4 bg-muted/50 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground">Filing Status:</label>
                <Select value={filingStatus} onValueChange={(v) => setFilingStatus(v as FilingStatus)}>
                  <SelectTrigger className="h-8 w-[200px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FILING_STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={qbiEnabled} onCheckedChange={setQbiEnabled} />
                <label className="text-xs font-medium text-muted-foreground">QBI Deduction (§199A)</label>
                {qbiEnabled && taxCalc.qbiDeduction > 0 && (
                  <span className="text-xs font-mono text-chart-positive">-{formatCurrency(taxCalc.qbiDeduction)}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="stat-card animate-fade-in">
                <div className="flex items-center justify-between mb-3"><span className="text-sm font-medium text-muted-foreground">Net Income</span><DollarSign className="h-4 w-4 text-muted-foreground" /></div>
                <p className={`text-2xl font-semibold font-mono tracking-tight ${taxCalc.netIncome >= 0 ? "text-chart-positive" : "text-chart-negative"}`}>{formatCurrency(taxCalc.netIncome)}</p>
              </div>
              <div className="stat-card animate-fade-in">
                <div className="flex items-center justify-between mb-3"><span className="text-sm font-medium text-muted-foreground">Federal Tax</span><Landmark className="h-4 w-4 text-muted-foreground" /></div>
                <p className="text-2xl font-semibold font-mono tracking-tight text-foreground">{formatCurrency(taxCalc.federalTax)}</p>
              </div>
              <div className="stat-card animate-fade-in">
                <div className="flex items-center justify-between mb-3"><span className="text-sm font-medium text-muted-foreground">State Tax ({state})</span><Landmark className="h-4 w-4 text-muted-foreground" /></div>
                <p className="text-2xl font-semibold font-mono tracking-tight text-foreground">{formatCurrency(taxCalc.stateTax)}</p>
              </div>
              <div className="stat-card animate-fade-in">
                <div className="flex items-center justify-between mb-3"><span className="text-sm font-medium text-muted-foreground">SE Tax (15.3%)</span><Calculator className="h-4 w-4 text-muted-foreground" /></div>
                <p className="text-2xl font-semibold font-mono tracking-tight text-foreground">{formatCurrency(taxCalc.seTax)}</p>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <DollarSign className="h-5 w-5" />Total Estimated Liability: {formatCurrency(taxCalc.totalLiability)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm text-muted-foreground mb-2"><span>Tax Year Progress</span><span>{yearProgress.toFixed(0)}%</span></div>
                  <Progress value={yearProgress} />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Accrued liability estimate</span>
                  <span className="font-mono">{formatCurrency(taxCalc.totalLiability * yearProgress / 100)} of {formatCurrency(taxCalc.totalLiability)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total paid</span>
                  <span className="font-mono text-chart-positive">{formatCurrency(totalPaid)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold">
                  <span>Remaining owed</span>
                  <span className={`font-mono ${taxCalc.totalLiability - totalPaid > 0 ? "text-chart-negative" : "text-chart-positive"}`}>
                    {formatCurrency(Math.max(0, taxCalc.totalLiability - totalPaid))}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Quarterly Payment Schedule with tracking */}
            <div className="rounded-lg border bg-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium flex items-center gap-2"><Calendar className="h-5 w-5" />Quarterly Payment Schedule</h2>
                <Button size="sm" variant="outline" onClick={() => setShowPaymentForm(!showPaymentForm)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Record Payment
                </Button>
              </div>

              {showPaymentForm && (
                <div className="mb-4 flex items-end gap-2 bg-muted/50 rounded-lg p-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Quarter</label>
                    <Select value={paymentForm.quarter} onValueChange={(v) => setPaymentForm({ ...paymentForm, quarter: v })}>
                      <SelectTrigger className="h-8 w-[80px] text-xs"><SelectValue placeholder="Q" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Q1</SelectItem>
                        <SelectItem value="2">Q2</SelectItem>
                        <SelectItem value="3">Q3</SelectItem>
                        <SelectItem value="4">Q4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Amount</label>
                    <Input type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="h-8 w-[120px] text-xs" placeholder="$0" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Date Paid</label>
                    <Input type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} className="h-8 w-[140px] text-xs" />
                  </div>
                  <Button size="sm" className="h-8" onClick={handleAddPayment} disabled={addQPayment.isPending}>
                    <Check className="h-3.5 w-3.5 mr-1" />Save
                  </Button>
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quarter</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Estimated</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {QUARTERLY_DATES.map((q) => {
                    const paid = paidByQuarter[q.quarter] || 0;
                    const remaining = Math.max(0, quarterlyPayment - paid);
                    const qPmts = qPayments.filter((p) => p.quarter === q.quarter);
                    return (
                      <TableRow key={q.label}>
                        <TableCell className="font-medium">{q.label}</TableCell>
                        <TableCell>{q.due}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(quarterlyPayment)}</TableCell>
                        <TableCell className="text-right font-mono text-chart-positive">{formatCurrency(paid)}</TableCell>
                        <TableCell className={`text-right font-mono ${remaining > 0 ? "text-chart-negative" : "text-chart-positive"}`}>
                          {remaining > 0 ? formatCurrency(remaining) : <Check className="h-4 w-4 inline text-chart-positive" />}
                        </TableCell>
                        <TableCell>
                          {qPmts.length > 0 && (
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => deleteQPayment.mutate(qPmts[qPmts.length - 1].id)}>
                              <Trash2 className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">⚠ These are estimates using simplified tax brackets. Consult a tax professional for accurate filing.</p>
          </TabsContent>

          {/* ── Deductions Tab ── */}
          <TabsContent value="deductions" className="space-y-6 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* QBI */}
              <div className="stat-card">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Percent className="h-4 w-4" />QBI Deduction (§199A)</h3>
                <p className="text-xs text-muted-foreground mb-3">Most sole proprietors can deduct 20% of qualified business income.</p>
                <div className="flex items-center gap-2 mb-2">
                  <Switch checked={qbiEnabled} onCheckedChange={setQbiEnabled} />
                  <span className="text-sm">{qbiEnabled ? "Enabled" : "Disabled"}</span>
                </div>
                {qbiEnabled && (
                  <div className="flex justify-between text-sm mt-3 pt-3 border-t">
                    <span>Estimated QBI deduction</span>
                    <span className="font-mono font-semibold text-chart-positive">{formatCurrency(taxCalc.qbiDeduction)}</span>
                  </div>
                )}
              </div>

              {/* Home Office */}
              <div className="stat-card">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Home className="h-4 w-4" />Home Office Deduction</h3>
                <p className="text-xs text-muted-foreground mb-3">Simplified method: $5/sqft up to 300 sqft ($1,500 max).</p>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Square footage used exclusively for business</label>
                  <Input
                    type="number"
                    value={homeOfficeSqft || ""}
                    onChange={(e) => setHomeOfficeSqft(Math.min(300, Math.max(0, parseInt(e.target.value) || 0)))}
                    placeholder="0-300 sqft"
                    className="w-[180px]"
                  />
                </div>
                {homeOfficeSqft > 0 && (
                  <div className="flex justify-between text-sm mt-3 pt-3 border-t">
                    <span>Home office deduction</span>
                    <span className="font-mono font-semibold text-chart-positive">{formatCurrency(taxCalc.homeOfficeDeduction)}</span>
                  </div>
                )}
              </div>

              {/* Vehicle / Mileage */}
              <div className="stat-card">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Car className="h-4 w-4" />Vehicle / Mileage Deduction</h3>
                <p className="text-xs text-muted-foreground mb-3">IRS standard mileage rate: ${MILEAGE_RATE_2026}/mile for 2026.</p>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Total business miles driven</label>
                  <Input
                    type="number"
                    value={businessMiles || ""}
                    onChange={(e) => setBusinessMiles(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="0"
                    className="w-[180px]"
                  />
                </div>
                {businessMiles > 0 && (
                  <div className="flex justify-between text-sm mt-3 pt-3 border-t">
                    <span>Mileage deduction</span>
                    <span className="font-mono font-semibold text-chart-positive">{formatCurrency(taxCalc.mileageDeduction)}</span>
                  </div>
                )}
              </div>

              {/* Deduction summary */}
              <div className="stat-card bg-accent/30">
                <h3 className="text-sm font-semibold mb-3">Deduction Summary</h3>
                <div className="space-y-2 text-sm">
                  {taxCalc.qbiDeduction > 0 && <div className="flex justify-between"><span>QBI (20%)</span><span className="font-mono">{formatCurrency(taxCalc.qbiDeduction)}</span></div>}
                  {taxCalc.homeOfficeDeduction > 0 && <div className="flex justify-between"><span>Home Office</span><span className="font-mono">{formatCurrency(taxCalc.homeOfficeDeduction)}</span></div>}
                  {taxCalc.mileageDeduction > 0 && <div className="flex justify-between"><span>Vehicle Mileage</span><span className="font-mono">{formatCurrency(taxCalc.mileageDeduction)}</span></div>}
                  <div className="flex justify-between pt-2 border-t font-semibold">
                    <span>Total additional deductions</span>
                    <span className="font-mono text-chart-positive">{formatCurrency(taxCalc.qbiDeduction + taxCalc.homeOfficeDeduction + taxCalc.mileageDeduction)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Estimated tax savings</span>
                    <span className="font-mono">{formatCurrency((taxCalc.qbiDeduction + taxCalc.homeOfficeDeduction + taxCalc.mileageDeduction) * 0.25)}</span>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Sales Tax Tab ── */}
          <TabsContent value="sales-tax" className="mt-4">
            <SalesTaxTab />
          </TabsContent>

          {/* ── Schedule C Tab ── */}
          <TabsContent value="schedule-c" className="space-y-6 mt-4">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                Profit or Loss From Business (Sole Proprietorship)
                {!profile?.business_name && <span className="text-chart-warning"> — <a href="/profile" className="underline">Set up your company profile first</a></span>}
              </p>
              <Button onClick={() => setSsnDialog(true)} className="gap-2"><FileText className="h-4 w-4" />Generate Schedule C</Button>
            </div>

            {ssnDialog && (
              <div className="stat-card border-primary/30 space-y-3">
                <h3 className="font-semibold">Enter SSN & EIN to generate</h3>
                <p className="text-xs text-muted-foreground">These values are used on the form only and are never saved to the database.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground mb-1 block">Your SSN (XXX-XX-XXXX) *</label><Input value={fullSsn} onChange={(e) => setFullSsn(e.target.value)} placeholder="XXX-XX-XXXX" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">EIN {profile?.ein_last4 ? `(stored: **-***${profile.ein_last4})` : "(optional)"}</label><Input value={fullEin} onChange={(e) => setFullEin(e.target.value)} placeholder="XX-XXXXXXX" /></div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={generateScheduleC} disabled={!fullSsn}><Printer className="h-4 w-4 mr-2" />Generate</Button>
                  <Button variant="ghost" onClick={() => { setSsnDialog(false); setFullSsn(""); setFullEin(""); }}>Cancel</Button>
                </div>
              </div>
            )}

            <div className="stat-card">
              <h2 className="section-title mb-4">Part I — Income</h2>
              <div className="flex justify-between items-center py-2"><span>Line 1 — Gross receipts or sales</span><span className="font-mono text-lg font-semibold text-chart-positive">{formatCurrency(totalRevenue)}</span></div>
              <div className="flex justify-between items-center py-2 border-t"><span className="font-medium">Line 7 — Gross income</span><span className="font-mono text-lg font-bold">{formatCurrency(totalRevenue)}</span></div>
            </div>

            <div className="stat-card">
              <h2 className="section-title mb-4">Part II — Expenses</h2>
              <div className="space-y-1">
                {lineItems.map((l) => (
                  <div key={l.line} className={`flex justify-between items-center py-1.5 ${l.amount > 0 ? "" : "opacity-40"}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-10 font-mono">L{l.line}</span>
                      <span className="text-sm">{l.label}</span>
                      {l.key === "Meals & Entertainment" && l.amount > 0 && <span className="text-xs text-muted-foreground">(50% deductible)</span>}
                    </div>
                    <span className="font-mono text-sm">{l.amount > 0 ? formatCurrency(l.amount) : "—"}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center py-3 mt-2 border-t-2"><span className="font-semibold">Line 28 — Total expenses</span><span className="font-mono text-lg font-bold text-chart-negative">{formatCurrency(totalExpensesC)}</span></div>
            </div>

            <div className="stat-card">
              <div className="flex justify-between items-center py-3">
                <span className="text-lg font-bold">Line 31 — Net profit (or loss)</span>
                <span className={`font-mono text-2xl font-bold ${netProfit >= 0 ? "text-chart-positive" : "text-chart-negative"}`}>{formatCurrency(netProfit)}</span>
              </div>
            </div>

            <div className="rounded-lg border border-chart-info/30 bg-chart-info/5 p-4">
              <p className="text-sm"><span className="font-semibold">Note:</span> This is a simplified Schedule C based on your imported transactions. Meals & entertainment are automatically reduced to 50% (IRS rule). Always verify with a tax professional before filing.</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
