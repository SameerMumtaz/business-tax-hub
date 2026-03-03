import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useTaxStore } from "@/store/taxStore";
import { formatCurrency } from "@/lib/format";
import { generateId } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, FileDown, FileText, Users } from "lucide-react";
import { toast } from "sonner";
import { Contractor, Employee } from "@/types/tax";

// ── Shared utils ──

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt$(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isContractorComplete(c: Contractor): boolean {
  return !!(c.name.trim() && c.tin.trim() && c.address.trim() && c.totalPaid >= 600);
}

function isEmployeeComplete(e: Employee): boolean {
  return !!(e.name.trim() && e.ssn.trim() && e.address.trim() && e.salary > 0);
}

// ── 1099-NEC Generator ──

function generate1099NEC(contractor: Contractor, payer: { name: string; tin: string; address: string }) {
  const taxYear = new Date().getFullYear();
  const html = `<!DOCTYPE html>
<html><head><title>1099-NEC ${contractor.name} ${taxYear}</title>
<style>
  @page { size: letter; margin: 0.5in; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 11px; color: #000; background: #fff; padding: 0.5in; }
  .form { border: 2px solid #000; max-width: 7.5in; margin: 0 auto; }
  .header { background: #1a1a2e; color: #fff; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 18px; font-weight: bold; letter-spacing: 1px; }
  .header .year { font-size: 28px; font-weight: bold; color: #e8e8e8; }
  .header .sub { font-size: 9px; color: #ccc; margin-top: 2px; }
  .row { display: flex; border-bottom: 1px solid #000; }
  .cell { padding: 8px 10px; border-right: 1px solid #000; flex: 1; min-height: 60px; }
  .cell:last-child { border-right: none; }
  .cell-label { font-size: 8px; color: #666; text-transform: uppercase; margin-bottom: 4px; letter-spacing: 0.5px; }
  .cell-value { font-size: 12px; font-weight: bold; }
  .cell-amount { font-size: 16px; font-weight: bold; text-align: right; }
  .wide { flex: 2; }
  .narrow { flex: 0.7; }
  .section-label { background: #f0f0f0; padding: 4px 10px; font-size: 9px; font-weight: bold; border-bottom: 1px solid #000; text-transform: uppercase; letter-spacing: 1px; }
  .footer { padding: 10px; font-size: 8px; color: #666; text-align: center; border-top: 1px solid #ccc; }
  .checkbox { display: inline-block; width: 10px; height: 10px; border: 1px solid #000; margin-right: 4px; vertical-align: middle; }
  .instructions { margin-top: 20px; font-size: 9px; color: #444; line-height: 1.5; max-width: 7.5in; margin-left: auto; margin-right: auto; }
  .instructions h3 { font-size: 11px; margin-bottom: 6px; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style></head><body>
<div class="no-print" style="text-align:center;margin-bottom:20px;">
  <button onclick="window.print()" style="padding:10px 24px;font-size:14px;cursor:pointer;background:#1a1a2e;color:#fff;border:none;border-radius:4px;">Print / Save as PDF</button>
</div>
<div class="form">
  <div class="header"><div><h1>Form 1099-NEC</h1><div class="sub">Nonemployee Compensation &bull; Department of the Treasury &mdash; Internal Revenue Service</div></div><div class="year">${taxYear}</div></div>
  <div class="section-label">Payer Information</div>
  <div class="row"><div class="cell wide"><div class="cell-label">Payer's Name, Address</div><div class="cell-value">${escapeHtml(payer.name)}</div><div style="margin-top:2px;font-size:10px;">${escapeHtml(payer.address)}</div></div><div class="cell"><div class="cell-label">Payer's TIN</div><div class="cell-value">${escapeHtml(payer.tin)}</div></div></div>
  <div class="section-label">Recipient Information</div>
  <div class="row"><div class="cell wide"><div class="cell-label">Recipient's Name</div><div class="cell-value">${escapeHtml(contractor.name)}</div></div><div class="cell"><div class="cell-label">Recipient's TIN</div><div class="cell-value">${escapeHtml(contractor.tin)}</div></div></div>
  <div class="row"><div class="cell"><div class="cell-label">Address</div><div class="cell-value">${escapeHtml(contractor.address)}</div></div></div>
  <div class="section-label">Amounts</div>
  <div class="row"><div class="cell"><div class="cell-label">1. Nonemployee Compensation</div><div class="cell-amount">$${fmt$(contractor.totalPaid)}</div></div><div class="cell"><div class="cell-label">2. Direct sales $5,000+</div><div class="cell-value"><span class="checkbox"></span> No</div></div></div>
  <div class="row"><div class="cell"><div class="cell-label">4. Federal Income Tax Withheld</div><div class="cell-amount">$0.00</div></div><div class="cell"><div class="cell-label">5. State Tax Withheld</div><div class="cell-amount">$0.00</div></div><div class="cell narrow"><div class="cell-label">6. State No.</div><div class="cell-value"></div></div><div class="cell"><div class="cell-label">7. State Income</div><div class="cell-amount">$${fmt$(contractor.totalPaid)}</div></div></div>
  <div class="footer">Form 1099-NEC (Rev. ${taxYear}) &bull; Generated by TaxDash</div>
</div>
<div class="instructions"><h3>Filing Instructions</h3><p><strong>Due:</strong> Copy A to IRS and Copy B to recipient — January 31, ${taxYear + 1}.</p><p style="margin-top:8px;color:#999;">Verify all data before filing with the IRS.</p></div>
</body></html>`;
  openFormWindow(html, `1099-NEC-${contractor.name.replace(/\s+/g, "-")}-${taxYear}.html`);
}

// ── W-2 Generator ──

function generateW2(employee: Employee, employer: { name: string; ein: string; address: string }) {
  const taxYear = new Date().getFullYear();
  const totalWithholding = employee.federalWithholding + employee.stateWithholding + employee.socialSecurity + employee.medicare;
  const html = `<!DOCTYPE html>
<html><head><title>W-2 ${employee.name} ${taxYear}</title>
<style>
  @page { size: letter; margin: 0.5in; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 11px; color: #000; background: #fff; padding: 0.5in; }
  .form { border: 2px solid #000; max-width: 7.5in; margin: 0 auto; }
  .header { background: #1a3a5c; color: #fff; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 18px; font-weight: bold; letter-spacing: 1px; }
  .header .year { font-size: 28px; font-weight: bold; color: #e8e8e8; }
  .header .sub { font-size: 9px; color: #ccc; margin-top: 2px; }
  .row { display: flex; border-bottom: 1px solid #000; }
  .cell { padding: 8px 10px; border-right: 1px solid #000; flex: 1; min-height: 52px; }
  .cell:last-child { border-right: none; }
  .cell-label { font-size: 8px; color: #666; text-transform: uppercase; margin-bottom: 4px; letter-spacing: 0.5px; }
  .cell-value { font-size: 12px; font-weight: bold; }
  .cell-amount { font-size: 14px; font-weight: bold; text-align: right; }
  .wide { flex: 2; }
  .section-label { background: #f0f0f0; padding: 4px 10px; font-size: 9px; font-weight: bold; border-bottom: 1px solid #000; text-transform: uppercase; letter-spacing: 1px; }
  .footer { padding: 10px; font-size: 8px; color: #666; text-align: center; border-top: 1px solid #ccc; }
  .instructions { margin-top: 20px; font-size: 9px; color: #444; line-height: 1.5; max-width: 7.5in; margin-left: auto; margin-right: auto; }
  .instructions h3 { font-size: 11px; margin-bottom: 6px; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style></head><body>
<div class="no-print" style="text-align:center;margin-bottom:20px;">
  <button onclick="window.print()" style="padding:10px 24px;font-size:14px;cursor:pointer;background:#1a3a5c;color:#fff;border:none;border-radius:4px;">Print / Save as PDF</button>
</div>
<div class="form">
  <div class="header"><div><h1>Form W-2</h1><div class="sub">Wage and Tax Statement &bull; Department of the Treasury &mdash; Internal Revenue Service</div></div><div class="year">${taxYear}</div></div>

  <div class="section-label">Employer Information</div>
  <div class="row">
    <div class="cell wide"><div class="cell-label">c. Employer's Name, Address, ZIP</div><div class="cell-value">${escapeHtml(employer.name)}</div><div style="margin-top:2px;font-size:10px;">${escapeHtml(employer.address)}</div></div>
    <div class="cell"><div class="cell-label">b. Employer's EIN</div><div class="cell-value">${escapeHtml(employer.ein)}</div></div>
  </div>

  <div class="section-label">Employee Information</div>
  <div class="row">
    <div class="cell wide"><div class="cell-label">e. Employee's Name</div><div class="cell-value">${escapeHtml(employee.name)}</div></div>
    <div class="cell"><div class="cell-label">a. Employee's SSN</div><div class="cell-value">${escapeHtml(employee.ssn)}</div></div>
  </div>
  <div class="row"><div class="cell"><div class="cell-label">f. Employee's Address, ZIP</div><div class="cell-value">${escapeHtml(employee.address)}</div></div></div>

  <div class="section-label">Wages & Withholdings</div>
  <div class="row">
    <div class="cell"><div class="cell-label">1. Wages, Tips, Other Compensation</div><div class="cell-amount">$${fmt$(employee.salary)}</div></div>
    <div class="cell"><div class="cell-label">2. Federal Income Tax Withheld</div><div class="cell-amount">$${fmt$(employee.federalWithholding)}</div></div>
  </div>
  <div class="row">
    <div class="cell"><div class="cell-label">3. Social Security Wages</div><div class="cell-amount">$${fmt$(employee.salary)}</div></div>
    <div class="cell"><div class="cell-label">4. Social Security Tax Withheld</div><div class="cell-amount">$${fmt$(employee.socialSecurity)}</div></div>
  </div>
  <div class="row">
    <div class="cell"><div class="cell-label">5. Medicare Wages and Tips</div><div class="cell-amount">$${fmt$(employee.salary)}</div></div>
    <div class="cell"><div class="cell-label">6. Medicare Tax Withheld</div><div class="cell-amount">$${fmt$(employee.medicare)}</div></div>
  </div>
  <div class="row">
    <div class="cell"><div class="cell-label">16. State Wages, Tips, etc.</div><div class="cell-amount">$${fmt$(employee.salary)}</div></div>
    <div class="cell"><div class="cell-label">17. State Income Tax</div><div class="cell-amount">$${fmt$(employee.stateWithholding)}</div></div>
  </div>

  <div class="footer">Form W-2 (${taxYear}) &bull; Generated by TaxDash &bull; Total withholdings: $${fmt$(totalWithholding)}</div>
</div>
<div class="instructions"><h3>Filing Instructions</h3><p><strong>Due:</strong> Copy A to SSA by January 31, ${taxYear + 1}. Copy B/C to employee by January 31, ${taxYear + 1}.</p><p style="margin-top:8px;color:#999;">Verify all data before filing.</p></div>
</body></html>`;
  openFormWindow(html, `W-2-${employee.name.replace(/\s+/g, "-")}-${taxYear}.html`);
}

function openFormWindow(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ── Page Component ──

export default function Report1099Page() {
  const { contractors, addContractor, removeContractor, updateContractor, employees, addEmployee, removeEmployee, updateEmployee } = useTaxStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", tin: "", totalPaid: "", address: "", payRate: "" });
  const [payerInfo, setPayerInfo] = useState({ name: "", tin: "", address: "" });
  const [payerOpen, setPayerOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", tin: "", totalPaid: "", address: "", payRate: "" });

  // Employee state
  const [empOpen, setEmpOpen] = useState(false);
  const [empForm, setEmpForm] = useState({ name: "", ssn: "", address: "", salary: "", federalWithholding: "", stateWithholding: "", socialSecurity: "", medicare: "" });
  const [empEditId, setEmpEditId] = useState<string | null>(null);
  const [empEditForm, setEmpEditForm] = useState({ name: "", ssn: "", address: "", salary: "", federalWithholding: "", stateWithholding: "", socialSecurity: "", medicare: "" });

  // ── Contractor handlers ──
  const handleAdd = () => {
    if (!form.name || !form.tin || !form.totalPaid) { toast.error("Please fill required fields"); return; }
    addContractor({ id: generateId(), name: form.name, tin: form.tin, totalPaid: parseFloat(form.totalPaid), address: form.address, payRate: form.payRate ? parseFloat(form.payRate) : undefined });
    setForm({ name: "", tin: "", totalPaid: "", address: "", payRate: "" });
    setOpen(false);
    toast.success("Contractor added");
  };

  const startEdit = (c: Contractor) => {
    setEditId(c.id);
    setEditForm({ name: c.name, tin: c.tin, totalPaid: String(c.totalPaid), address: c.address, payRate: c.payRate ? String(c.payRate) : "" });
  };

  const saveEdit = () => {
    if (!editId) return;
    updateContractor(editId, { name: editForm.name, tin: editForm.tin, totalPaid: parseFloat(editForm.totalPaid) || 0, address: editForm.address, payRate: editForm.payRate ? parseFloat(editForm.payRate) : undefined });
    setEditId(null);
    toast.success("Contractor updated");
  };

  const handleGenerate1099 = (contractor: Contractor) => {
    if (!payerInfo.name || !payerInfo.tin || !payerInfo.address) { setPayerOpen(true); toast.info("Enter your business info first"); return; }
    generate1099NEC(contractor, payerInfo);
    toast.success(`1099-NEC generated for ${contractor.name}`);
  };

  // ── Employee handlers ──
  const handleAddEmployee = () => {
    if (!empForm.name || !empForm.ssn || !empForm.salary) { toast.error("Please fill required fields"); return; }
    addEmployee({
      id: generateId(), name: empForm.name, ssn: empForm.ssn, address: empForm.address,
      salary: parseFloat(empForm.salary), federalWithholding: parseFloat(empForm.federalWithholding) || 0,
      stateWithholding: parseFloat(empForm.stateWithholding) || 0, socialSecurity: parseFloat(empForm.socialSecurity) || 0,
      medicare: parseFloat(empForm.medicare) || 0,
    });
    setEmpForm({ name: "", ssn: "", address: "", salary: "", federalWithholding: "", stateWithholding: "", socialSecurity: "", medicare: "" });
    setEmpOpen(false);
    toast.success("Employee added");
  };

  const startEmpEdit = (e: Employee) => {
    setEmpEditId(e.id);
    setEmpEditForm({ name: e.name, ssn: e.ssn, address: e.address, salary: String(e.salary), federalWithholding: String(e.federalWithholding), stateWithholding: String(e.stateWithholding), socialSecurity: String(e.socialSecurity), medicare: String(e.medicare) });
  };

  const saveEmpEdit = () => {
    if (!empEditId) return;
    updateEmployee(empEditId, {
      name: empEditForm.name, ssn: empEditForm.ssn, address: empEditForm.address,
      salary: parseFloat(empEditForm.salary) || 0, federalWithholding: parseFloat(empEditForm.federalWithholding) || 0,
      stateWithholding: parseFloat(empEditForm.stateWithholding) || 0, socialSecurity: parseFloat(empEditForm.socialSecurity) || 0,
      medicare: parseFloat(empEditForm.medicare) || 0,
    });
    setEmpEditId(null);
    toast.success("Employee updated");
  };

  const handleGenerateW2 = (employee: Employee) => {
    if (!payerInfo.name || !payerInfo.tin || !payerInfo.address) { setPayerOpen(true); toast.info("Enter your business info first"); return; }
    generateW2(employee, { name: payerInfo.name, ein: payerInfo.tin, address: payerInfo.address });
    toast.success(`W-2 generated for ${employee.name}`);
  };

  const handleExport = () => {
    const csv = ["Name,TIN,Total Paid,Pay Rate,Address", ...contractors.map((c) => `"${c.name}","${c.tin}",${c.totalPaid},${c.payRate ?? ""},"${c.address}"`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "1099-report-2026.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("1099 report exported");
  };

  const totalPaid = contractors.reduce((sum, c) => sum + c.totalPaid, 0);
  const threshold = contractors.filter((c) => c.totalPaid >= 600);
  const totalSalaries = employees.reduce((sum, e) => sum + e.salary, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tax Forms</h1>
            <p className="text-muted-foreground text-sm mt-1">Generate 1099-NEC and W-2 forms for contractors and employees</p>
          </div>
          <Dialog open={payerOpen} onOpenChange={setPayerOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">{payerInfo.name ? "Edit Business Info" : "Set Business Info"}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Your Business Info (Employer/Payer)</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">Used on all generated 1099-NEC and W-2 forms.</p>
              <div className="space-y-3">
                <Input placeholder="Business name" value={payerInfo.name} onChange={(e) => setPayerInfo({ ...payerInfo, name: e.target.value })} />
                <Input placeholder="EIN (XX-XXXXXXX)" value={payerInfo.tin} onChange={(e) => setPayerInfo({ ...payerInfo, tin: e.target.value })} />
                <Input placeholder="Business address" value={payerInfo.address} onChange={(e) => setPayerInfo({ ...payerInfo, address: e.target.value })} />
                <Button onClick={() => { setPayerOpen(false); toast.success("Business info saved"); }} className="w-full" disabled={!payerInfo.name || !payerInfo.tin || !payerInfo.address}>Save</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="contractors" className="w-full">
          <TabsList>
            <TabsTrigger value="contractors">Contractors (1099-NEC)</TabsTrigger>
            <TabsTrigger value="employees">Salaried Employees (W-2)</TabsTrigger>
          </TabsList>

          {/* ── Contractors Tab ── */}
          <TabsContent value="contractors" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {threshold.length} contractor{threshold.length !== 1 ? "s" : ""} above $600 — Total: <span className="font-mono">{formatCurrency(totalPaid)}</span>
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleExport}><FileDown className="h-4 w-4 mr-2" />Export CSV</Button>
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" />Add Contractor</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Add Contractor</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <Input placeholder="Contractor name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                      <Input placeholder="TIN / SSN" value={form.tin} onChange={(e) => setForm({ ...form, tin: e.target.value })} />
                      <Input type="number" placeholder="Total paid" value={form.totalPaid} onChange={(e) => setForm({ ...form, totalPaid: e.target.value })} />
                      <Input type="number" placeholder="Pay rate ($/hr, optional)" value={form.payRate} onChange={(e) => setForm({ ...form, payRate: e.target.value })} />
                      <Input placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                      <Button onClick={handleAdd} className="w-full">Add Contractor</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="rounded-lg border border-chart-warning/30 bg-chart-warning/5 p-4">
              <p className="text-sm"><span className="font-semibold">IRS Requirement:</span> File Form 1099-NEC for each contractor paid <span className="font-mono font-semibold">$600+</span> during the tax year.</p>
            </div>

            <div className="stat-card overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Contractor</th><th>TIN</th><th>Address</th><th className="text-right">Pay Rate</th><th className="text-right">Total Paid</th><th>1099 Required</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {contractors.map((c) => {
                    const isEditing = editId === c.id;
                    const complete = isContractorComplete(c);
                    const missing = c.totalPaid >= 600 && !complete ? [!c.tin.trim() && "TIN", !c.address.trim() && "address"].filter(Boolean).join(", ") : "";
                    if (isEditing) {
                      return (
                        <tr key={c.id} className="bg-accent/30">
                          <td><Input className="h-8 text-sm" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></td>
                          <td><Input className="h-8 text-sm font-mono" value={editForm.tin} onChange={(e) => setEditForm({ ...editForm, tin: e.target.value })} /></td>
                          <td><Input className="h-8 text-sm" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></td>
                          <td><Input className="h-8 text-sm text-right" type="number" value={editForm.payRate} onChange={(e) => setEditForm({ ...editForm, payRate: e.target.value })} /></td>
                          <td><Input className="h-8 text-sm text-right" type="number" value={editForm.totalPaid} onChange={(e) => setEditForm({ ...editForm, totalPaid: e.target.value })} /></td>
                          <td colSpan={2}><div className="flex gap-1"><Button size="sm" className="h-7 text-xs" onClick={saveEdit}>Save</Button><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditId(null)}>Cancel</Button></div></td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={c.id} className="cursor-pointer hover:bg-accent/20" onDoubleClick={() => startEdit(c)}>
                        <td className="font-medium">{c.name}</td>
                        <td className="font-mono text-xs text-muted-foreground">{c.tin}</td>
                        <td className="text-sm text-muted-foreground">{c.address || <span className="italic text-chart-warning">Missing</span>}</td>
                        <td className="text-right font-mono text-sm text-muted-foreground">{c.payRate ? `$${c.payRate}/hr` : "—"}</td>
                        <td className="text-right font-mono">{formatCurrency(c.totalPaid)}</td>
                        <td><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.totalPaid >= 600 ? "bg-chart-warning/10 text-chart-warning" : "bg-muted text-muted-foreground"}`}>{c.totalPaid >= 600 ? "Required" : "Below threshold"}</span></td>
                        <td>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => startEdit(c)}>Edit</Button>
                            {c.totalPaid >= 600 && (<Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleGenerate1099(c)} disabled={!complete} title={missing ? `Missing: ${missing}` : "Generate 1099-NEC"}><FileText className="h-3 w-3" />1099-NEC</Button>)}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { removeContractor(c.id); toast.success("Removed"); }}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ── Employees Tab ── */}
          <TabsContent value="employees" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {employees.length} employee{employees.length !== 1 ? "s" : ""} — Total salaries: <span className="font-mono">{formatCurrency(totalSalaries)}</span>
              </p>
              <Dialog open={empOpen} onOpenChange={setEmpOpen}>
                <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" />Add Employee</Button></DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>Add Salaried Employee</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <Input placeholder="Employee name *" value={empForm.name} onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })} />
                    <Input placeholder="SSN (XXX-XX-XXXX) *" value={empForm.ssn} onChange={(e) => setEmpForm({ ...empForm, ssn: e.target.value })} />
                    <Input placeholder="Address" value={empForm.address} onChange={(e) => setEmpForm({ ...empForm, address: e.target.value })} />
                    <Input type="number" placeholder="Annual salary *" value={empForm.salary} onChange={(e) => setEmpForm({ ...empForm, salary: e.target.value })} />
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="number" placeholder="Federal withholding" value={empForm.federalWithholding} onChange={(e) => setEmpForm({ ...empForm, federalWithholding: e.target.value })} />
                      <Input type="number" placeholder="State withholding" value={empForm.stateWithholding} onChange={(e) => setEmpForm({ ...empForm, stateWithholding: e.target.value })} />
                      <Input type="number" placeholder="Social Security tax" value={empForm.socialSecurity} onChange={(e) => setEmpForm({ ...empForm, socialSecurity: e.target.value })} />
                      <Input type="number" placeholder="Medicare tax" value={empForm.medicare} onChange={(e) => setEmpForm({ ...empForm, medicare: e.target.value })} />
                    </div>
                    <Button onClick={handleAddEmployee} className="w-full">Add Employee</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="rounded-lg border border-chart-info/30 bg-chart-info/5 p-4">
              <p className="text-sm"><span className="font-semibold">IRS Requirement:</span> File Form W-2 for every employee. Copy A to SSA and Copy B to employees by <span className="font-mono font-semibold">January 31</span>.</p>
            </div>

            <div className="stat-card overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th><th>SSN</th><th>Address</th><th className="text-right">Salary</th><th className="text-right">Fed. W/H</th><th className="text-right">State W/H</th><th className="text-right">SS + Med</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => {
                    const isEditing = empEditId === e.id;
                    const complete = isEmployeeComplete(e);
                    if (isEditing) {
                      return (
                        <tr key={e.id} className="bg-accent/30">
                          <td><Input className="h-8 text-sm" value={empEditForm.name} onChange={(ev) => setEmpEditForm({ ...empEditForm, name: ev.target.value })} /></td>
                          <td><Input className="h-8 text-sm font-mono" value={empEditForm.ssn} onChange={(ev) => setEmpEditForm({ ...empEditForm, ssn: ev.target.value })} /></td>
                          <td><Input className="h-8 text-sm" value={empEditForm.address} onChange={(ev) => setEmpEditForm({ ...empEditForm, address: ev.target.value })} /></td>
                          <td><Input className="h-8 text-sm text-right" type="number" value={empEditForm.salary} onChange={(ev) => setEmpEditForm({ ...empEditForm, salary: ev.target.value })} /></td>
                          <td><Input className="h-8 text-sm text-right" type="number" value={empEditForm.federalWithholding} onChange={(ev) => setEmpEditForm({ ...empEditForm, federalWithholding: ev.target.value })} /></td>
                          <td><Input className="h-8 text-sm text-right" type="number" value={empEditForm.stateWithholding} onChange={(ev) => setEmpEditForm({ ...empEditForm, stateWithholding: ev.target.value })} /></td>
                          <td><Input className="h-8 text-sm text-right" type="number" value={empEditForm.socialSecurity} onChange={(ev) => setEmpEditForm({ ...empEditForm, socialSecurity: ev.target.value })} /></td>
                          <td><div className="flex gap-1"><Button size="sm" className="h-7 text-xs" onClick={saveEmpEdit}>Save</Button><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEmpEditId(null)}>Cancel</Button></div></td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={e.id} className="cursor-pointer hover:bg-accent/20" onDoubleClick={() => startEmpEdit(e)}>
                        <td className="font-medium">{e.name}</td>
                        <td className="font-mono text-xs text-muted-foreground">{e.ssn}</td>
                        <td className="text-sm text-muted-foreground">{e.address || <span className="italic text-chart-warning">Missing</span>}</td>
                        <td className="text-right font-mono">{formatCurrency(e.salary)}</td>
                        <td className="text-right font-mono text-sm">{formatCurrency(e.federalWithholding)}</td>
                        <td className="text-right font-mono text-sm">{formatCurrency(e.stateWithholding)}</td>
                        <td className="text-right font-mono text-sm">{formatCurrency(e.socialSecurity + e.medicare)}</td>
                        <td>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => startEmpEdit(e)}>Edit</Button>
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleGenerateW2(e)} disabled={!complete} title={!complete ? "Missing required info" : "Generate W-2"}><FileText className="h-3 w-3" />W-2</Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { removeEmployee(e.id); toast.success("Removed"); }}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
