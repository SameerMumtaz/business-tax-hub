import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useExpenses, useSales, useProfile } from "@/hooks/useData";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Printer } from "lucide-react";
import { toast } from "sonner";

// IRS Schedule C line items mapped to app expense categories
const SCHEDULE_C_LINES: { line: string; label: string; key: string }[] = [
  { line: "8", label: "Advertising", key: "Marketing" },
  { line: "13", label: "Depreciation and section 179 expense", key: "Equipment" },
  { line: "15", label: "Insurance (other than health)", key: "Insurance" },
  { line: "17", label: "Legal and professional services", key: "Professional Services" },
  { line: "18", label: "Office expense", key: "Office Supplies" },
  { line: "20b", label: "Rent — Business property", key: "Rent" },
  { line: "24a", label: "Travel", key: "Travel" },
  { line: "24b", label: "Deductible meals (50%)", key: "Meals & Entertainment" },
  { line: "25", label: "Utilities", key: "Utilities" },
  { line: "26", label: "Wages", key: "Payroll" },
  { line: "27a", label: "Other expenses (Software/SaaS)", key: "Software & SaaS" },
  { line: "27b", label: "Other expenses", key: "Other" },
];

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt$(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ScheduleCPage() {
  const { data: expenses = [] } = useExpenses();
  const { data: sales = [] } = useSales();
  const { data: profile } = useProfile();
  const [ssnDialog, setSsnDialog] = useState(false);
  const [fullSsn, setFullSsn] = useState("");
  const [fullEin, setFullEin] = useState("");

  const totalRevenue = sales.reduce((sum, s) => sum + s.amount, 0);

  // Build category totals
  const categoryTotals: Record<string, number> = {};
  expenses.forEach((e) => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
  });

  // Meals are 50% deductible
  if (categoryTotals["Meals & Entertainment"]) {
    categoryTotals["Meals & Entertainment"] = Math.round(categoryTotals["Meals & Entertainment"] * 0.5 * 100) / 100;
  }

  const lineItems = SCHEDULE_C_LINES.map((l) => ({
    ...l,
    amount: categoryTotals[l.key] || 0,
  }));

  const totalExpenses = lineItems.reduce((sum, l) => sum + l.amount, 0);
  const netProfit = totalRevenue - totalExpenses;

  const generateScheduleC = () => {
    if (!fullSsn) { toast.error("Enter your SSN"); return; }
    const taxYear = new Date().getFullYear();
    const businessName = profile?.business_name || "Your Business";
    const businessAddress = profile ? [profile.business_address, profile.business_city, profile.business_state, profile.business_zip].filter(Boolean).join(", ") : "";
    const ein = fullEin || (profile?.ein_last4 ? `**-***${profile.ein_last4}` : "");

    const lineRows = lineItems
      .filter((l) => l.amount > 0)
      .map((l) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;font-size:11px;color:#666;">Line ${escapeHtml(l.line)}</td><td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;">${escapeHtml(l.label)}</td><td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;text-align:right;font-family:'Courier New',monospace;">$${fmt$(l.amount)}</td></tr>`)
      .join("\n");

    const html = `<!DOCTYPE html>
<html><head><title>Schedule C - ${businessName} ${taxYear}</title>
<style>
  @page { size: letter; margin: 0.5in; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 11px; color: #000; background: #fff; padding: 0.5in; }
  .form { border: 2px solid #000; max-width: 7.5in; margin: 0 auto; }
  .header { background: #2d5016; color: #fff; padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 18px; font-weight: bold; letter-spacing: 1px; }
  .header .year { font-size: 28px; font-weight: bold; color: #e8e8e8; }
  .header .sub { font-size: 9px; color: #ccc; margin-top: 2px; }
  .section { border-bottom: 1px solid #000; }
  .section-label { background: #f0f0f0; padding: 6px 10px; font-size: 9px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #000; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; }
  .info-cell { padding: 8px 10px; border-right: 1px solid #ccc; border-bottom: 1px solid #ccc; }
  .info-cell:nth-child(even) { border-right: none; }
  .info-label { font-size: 8px; color: #666; text-transform: uppercase; margin-bottom: 3px; letter-spacing: 0.5px; }
  .info-value { font-size: 12px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 6px 10px; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 2px solid #000; }
  th:last-child { text-align: right; }
  .total-row { font-weight: bold; font-size: 13px; border-top: 2px solid #000; }
  .total-row td { padding: 10px; }
  .net-row { font-size: 16px; font-weight: bold; background: #f7f7f0; }
  .net-row td { padding: 12px 10px; }
  .footer { padding: 10px; font-size: 8px; color: #666; text-align: center; border-top: 1px solid #ccc; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style></head><body>
<div class="no-print" style="text-align:center;margin-bottom:20px;">
  <button onclick="window.print()" style="padding:10px 24px;font-size:14px;cursor:pointer;background:#2d5016;color:#fff;border:none;border-radius:4px;">Print / Save as PDF</button>
</div>
<div class="form">
  <div class="header">
    <div><h1>Schedule C (Form 1040)</h1><div class="sub">Profit or Loss From Business (Sole Proprietorship)</div></div>
    <div class="year">${taxYear}</div>
  </div>

  <div class="section">
    <div class="section-label">Taxpayer / Business Information</div>
    <div class="info-grid">
      <div class="info-cell"><div class="info-label">Name of proprietor</div><div class="info-value">${escapeHtml(businessName)}</div></div>
      <div class="info-cell"><div class="info-label">Social Security Number</div><div class="info-value">${escapeHtml(fullSsn)}</div></div>
      <div class="info-cell"><div class="info-label">Business Name (DBA)</div><div class="info-value">${escapeHtml(businessName)}</div></div>
      <div class="info-cell"><div class="info-label">Employer ID Number (EIN)</div><div class="info-value">${escapeHtml(ein)}</div></div>
      <div class="info-cell" style="grid-column:1/-1;border-right:none;"><div class="info-label">Business Address</div><div class="info-value">${escapeHtml(businessAddress)}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-label">Part I — Income</div>
    <table>
      <tr><td style="padding:8px 10px;font-size:11px;color:#666;">Line 1</td><td style="padding:8px 10px;">Gross receipts or sales</td><td style="padding:8px 10px;text-align:right;font-family:'Courier New',monospace;font-weight:bold;font-size:14px;">$${fmt$(totalRevenue)}</td></tr>
      <tr class="total-row"><td></td><td>Line 7 — Gross income</td><td style="text-align:right;font-family:'Courier New',monospace;">$${fmt$(totalRevenue)}</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-label">Part II — Expenses</div>
    <table>
      <thead><tr><th>Line</th><th>Description</th><th>Amount</th></tr></thead>
      <tbody>
        ${lineRows}
        <tr class="total-row"><td></td><td>Line 28 — Total expenses</td><td style="text-align:right;font-family:'Courier New',monospace;">$${fmt$(totalExpenses)}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <table>
      <tr class="net-row">
        <td colspan="2">Line 31 — Net profit (or loss)</td>
        <td style="text-align:right;font-family:'Courier New',monospace;color:${netProfit >= 0 ? '#2d5016' : '#dc2626'};">$${fmt$(netProfit)}</td>
      </tr>
    </table>
  </div>

  <div class="footer">Schedule C (Form 1040) ${taxYear} &bull; Generated by TaxDash &bull; For informational purposes — verify with a tax professional</div>
</div>
</body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) {
      const a = document.createElement("a");
      a.href = url;
      a.download = `Schedule-C-${taxYear}.html`;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setSsnDialog(false);
    setFullSsn("");
    setFullEin("");
    toast.success("Schedule C generated");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Schedule C</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Profit or Loss From Business (Sole Proprietorship)
              {!profile?.business_name && <span className="text-chart-warning"> — <a href="/profile" className="underline">Set up your company profile first</a></span>}
            </p>
          </div>
          <Button onClick={() => setSsnDialog(true)} className="gap-2">
            <FileText className="h-4 w-4" />
            Generate Schedule C
          </Button>
        </div>

        {/* SSN Dialog */}
        {ssnDialog && (
          <div className="stat-card border-primary/30 space-y-3">
            <h3 className="font-semibold">Enter SSN & EIN to generate</h3>
            <p className="text-xs text-muted-foreground">These values are used on the form only and are never saved to the database.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Your SSN (XXX-XX-XXXX) *</label>
                <Input value={fullSsn} onChange={(e) => setFullSsn(e.target.value)} placeholder="XXX-XX-XXXX" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  EIN {profile?.ein_last4 ? `(stored: **-***${profile.ein_last4})` : "(optional)"}
                </label>
                <Input value={fullEin} onChange={(e) => setFullEin(e.target.value)} placeholder="XX-XXXXXXX" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={generateScheduleC} disabled={!fullSsn}>
                <Printer className="h-4 w-4 mr-2" />Generate
              </Button>
              <Button variant="ghost" onClick={() => { setSsnDialog(false); setFullSsn(""); setFullEin(""); }}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Income Summary */}
        <div className="stat-card">
          <h2 className="section-title mb-4">Part I — Income</h2>
          <div className="flex justify-between items-center py-2">
            <span>Line 1 — Gross receipts or sales</span>
            <span className="font-mono text-lg font-semibold text-chart-positive">{formatCurrency(totalRevenue)}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-t">
            <span className="font-medium">Line 7 — Gross income</span>
            <span className="font-mono text-lg font-bold">{formatCurrency(totalRevenue)}</span>
          </div>
        </div>

        {/* Expenses Detail */}
        <div className="stat-card">
          <h2 className="section-title mb-4">Part II — Expenses</h2>
          <div className="space-y-1">
            {lineItems.map((l) => (
              <div key={l.line} className={`flex justify-between items-center py-1.5 ${l.amount > 0 ? "" : "opacity-40"}`}>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-10 font-mono">L{l.line}</span>
                  <span className="text-sm">{l.label}</span>
                  {l.key === "Meals & Entertainment" && l.amount > 0 && (
                    <span className="text-xs text-muted-foreground">(50% deductible)</span>
                  )}
                </div>
                <span className="font-mono text-sm">{l.amount > 0 ? formatCurrency(l.amount) : "—"}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center py-3 mt-2 border-t-2">
            <span className="font-semibold">Line 28 — Total expenses</span>
            <span className="font-mono text-lg font-bold text-chart-negative">{formatCurrency(totalExpenses)}</span>
          </div>
        </div>

        {/* Net Profit */}
        <div className="stat-card">
          <div className="flex justify-between items-center py-3">
            <span className="text-lg font-bold">Line 31 — Net profit (or loss)</span>
            <span className={`font-mono text-2xl font-bold ${netProfit >= 0 ? "text-chart-positive" : "text-chart-negative"}`}>
              {formatCurrency(netProfit)}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-chart-info/30 bg-chart-info/5 p-4">
          <p className="text-sm">
            <span className="font-semibold">Note:</span> This is a simplified Schedule C based on your imported transactions.
            Meals & entertainment are automatically reduced to 50% (IRS rule). Always verify with a tax professional before filing.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
