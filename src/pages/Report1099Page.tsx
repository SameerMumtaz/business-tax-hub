import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useContractors, useAddContractor, useRemoveContractor, useUpdateContractor, useEmployees, useAddEmployee, useRemoveEmployee, useUpdateEmployee, useProfile } from "@/hooks/useData";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, FileDown, FileText } from "lucide-react";
import { toast } from "sonner";
import { Contractor, Employee } from "@/types/tax";

// ── Shared utils ──
function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt$(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function generate1099NEC(contractor: Contractor, fullTin: string, payer: { name: string; tin: string; address: string }) {
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
  @media print { body { padding: 0; } .no-print { display: none; } }
</style></head><body>
<div class="no-print" style="text-align:center;margin-bottom:20px;">
  <button onclick="window.print()" style="padding:10px 24px;font-size:14px;cursor:pointer;background:#1a1a2e;color:#fff;border:none;border-radius:4px;">Print / Save as PDF</button>
</div>
<div class="form">
  <div class="header"><div><h1>Form 1099-NEC</h1><div class="sub">Nonemployee Compensation</div></div><div class="year">${taxYear}</div></div>
  <div class="section-label">Payer Information</div>
  <div class="row"><div class="cell wide"><div class="cell-label">Payer's Name, Address</div><div class="cell-value">${escapeHtml(payer.name)}</div><div style="margin-top:2px;font-size:10px;">${escapeHtml(payer.address)}</div></div><div class="cell"><div class="cell-label">Payer's TIN</div><div class="cell-value">${escapeHtml(payer.tin)}</div></div></div>
  <div class="section-label">Recipient Information</div>
  <div class="row"><div class="cell wide"><div class="cell-label">Recipient's Name</div><div class="cell-value">${escapeHtml(contractor.name)}</div></div><div class="cell"><div class="cell-label">Recipient's TIN</div><div class="cell-value">${escapeHtml(fullTin)}</div></div></div>
  <div class="row"><div class="cell"><div class="cell-label">Address</div><div class="cell-value">${escapeHtml(contractor.address)}</div></div></div>
  <div class="section-label">Amounts</div>
  <div class="row"><div class="cell"><div class="cell-label">1. Nonemployee Compensation</div><div class="cell-amount">$${fmt$(contractor.totalPaid)}</div></div><div class="cell"><div class="cell-label">2. Direct sales $5,000+</div><div class="cell-value"><span class="checkbox"></span> No</div></div></div>
  <div class="row"><div class="cell"><div class="cell-label">4. Federal Income Tax Withheld</div><div class="cell-amount">$0.00</div></div><div class="cell"><div class="cell-label">5. State Tax Withheld</div><div class="cell-amount">$0.00</div></div><div class="cell narrow"><div class="cell-label">6. State No.</div><div class="cell-value"></div></div><div class="cell"><div class="cell-label">7. State Income</div><div class="cell-amount">$${fmt$(contractor.totalPaid)}</div></div></div>
  <div class="footer">Form 1099-NEC (Rev. ${taxYear})</div>
</div>
</body></html>`;
  openFormWindow(html, `1099-NEC-${contractor.name.replace(/\s+/g, "-")}-${taxYear}.html`);
}

function generateW2(employee: Employee, fullSsn: string, employer: { name: string; ein: string; address: string }) {
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
  @media print { body { padding: 0; } .no-print { display: none; } }
</style></head><body>
<div class="no-print" style="text-align:center;margin-bottom:20px;">
  <button onclick="window.print()" style="padding:10px 24px;font-size:14px;cursor:pointer;background:#1a3a5c;color:#fff;border:none;border-radius:4px;">Print / Save as PDF</button>
</div>
<div class="form">
  <div class="header"><div><h1>Form W-2</h1><div class="sub">Wage and Tax Statement</div></div><div class="year">${taxYear}</div></div>
  <div class="section-label">Employer Information</div>
  <div class="row"><div class="cell wide"><div class="cell-label">c. Employer's Name, Address</div><div class="cell-value">${escapeHtml(employer.name)}</div><div style="margin-top:2px;font-size:10px;">${escapeHtml(employer.address)}</div></div><div class="cell"><div class="cell-label">b. Employer's EIN</div><div class="cell-value">${escapeHtml(employer.ein)}</div></div></div>
  <div class="section-label">Employee Information</div>
  <div class="row"><div class="cell wide"><div class="cell-label">e. Employee's Name</div><div class="cell-value">${escapeHtml(employee.name)}</div></div><div class="cell"><div class="cell-label">a. Employee's SSN</div><div class="cell-value">${escapeHtml(fullSsn)}</div></div></div>
  <div class="row"><div class="cell"><div class="cell-label">f. Employee's Address</div><div class="cell-value">${escapeHtml(employee.address)}</div></div></div>
  <div class="section-label">Wages & Withholdings</div>
  <div class="row"><div class="cell"><div class="cell-label">1. Wages, Tips, Other Compensation</div><div class="cell-amount">$${fmt$(employee.salary)}</div></div><div class="cell"><div class="cell-label">2. Federal Income Tax Withheld</div><div class="cell-amount">$${fmt$(employee.federalWithholding)}</div></div></div>
  <div class="row"><div class="cell"><div class="cell-label">3. Social Security Wages</div><div class="cell-amount">$${fmt$(employee.salary)}</div></div><div class="cell"><div class="cell-label">4. Social Security Tax Withheld</div><div class="cell-amount">$${fmt$(employee.socialSecurity)}</div></div></div>
  <div class="row"><div class="cell"><div class="cell-label">5. Medicare Wages and Tips</div><div class="cell-amount">$${fmt$(employee.salary)}</div></div><div class="cell"><div class="cell-label">6. Medicare Tax Withheld</div><div class="cell-amount">$${fmt$(employee.medicare)}</div></div></div>
  <div class="row"><div class="cell"><div class="cell-label">16. State Wages</div><div class="cell-amount">$${fmt$(employee.salary)}</div></div><div class="cell"><div class="cell-label">17. State Income Tax</div><div class="cell-amount">$${fmt$(employee.stateWithholding)}</div></div></div>
  <div class="footer">Form W-2 (${taxYear}) &bull; Total withholdings: $${fmt$(totalWithholding)}</div>
</div>
</body></html>`;
  openFormWindow(html, `W-2-${employee.name.replace(/\s+/g, "-")}-${taxYear}.html`);
}

// ── Page Component ──

export default function Report1099Page() {
  const { data: contractors = [] } = useContractors();
  const { data: employees = [] } = useEmployees();
  const { data: profile } = useProfile();
  const addContractor = useAddContractor();
  const removeContractor = useRemoveContractor();
  const updateContractor = useUpdateContractor();
  const addEmployee = useAddEmployee();
  const removeEmployee = useRemoveEmployee();
  const updateEmployee = useUpdateEmployee();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", tin: "", totalPaid: "", address: "", payRate: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", tin_last4: "", totalPaid: "", address: "", payRate: "" });

  // Employee state
  const [empOpen, setEmpOpen] = useState(false);
  const [empForm, setEmpForm] = useState({ name: "", ssn: "", address: "", salary: "", federalWithholding: "", stateWithholding: "", socialSecurity: "", medicare: "" });
  const [empEditId, setEmpEditId] = useState<string | null>(null);
  const [empEditForm, setEmpEditForm] = useState({ name: "", ssn_last4: "", address: "", salary: "", federalWithholding: "", stateWithholding: "", socialSecurity: "", medicare: "" });

  // Full TIN/SSN entry for form generation (never stored)
  const [genDialog, setGenDialog] = useState<{ type: "1099" | "w2"; id: string } | null>(null);
  const [fullTin, setFullTin] = useState("");
  const [fullEin, setFullEin] = useState("");

  // ── Contractor handlers ──
  const handleAdd = () => {
    if (!form.name || !form.tin || !form.totalPaid) { toast.error("Please fill required fields"); return; }
    const digits = form.tin.replace(/\D/g, "");
    addContractor.mutate({
      name: form.name,
      tin_last4: digits.slice(-4),
      total_paid: parseFloat(form.totalPaid),
      address: form.address,
      pay_rate: form.payRate ? parseFloat(form.payRate) : undefined,
    }, {
      onSuccess: () => {
        setForm({ name: "", tin: "", totalPaid: "", address: "", payRate: "" });
        setOpen(false);
        toast.success("Contractor added");
      },
    });
  };

  const startEdit = (c: Contractor) => {
    setEditId(c.id);
    setEditForm({ name: c.name, tin_last4: "", totalPaid: String(c.totalPaid), address: c.address, payRate: c.payRate ? String(c.payRate) : "" });
  };

  const saveEdit = () => {
    if (!editId) return;
    const update: any = { id: editId, name: editForm.name, total_paid: parseFloat(editForm.totalPaid) || 0, address: editForm.address, pay_rate: editForm.payRate ? parseFloat(editForm.payRate) : undefined };
    if (editForm.tin_last4) {
      const digits = editForm.tin_last4.replace(/\D/g, "");
      update.tin_last4 = digits.slice(-4);
    }
    updateContractor.mutate(update, { onSuccess: () => { setEditId(null); toast.success("Updated"); } });
  };

  // ── Employee handlers ──
  const handleAddEmployee = () => {
    if (!empForm.name || !empForm.ssn || !empForm.salary) { toast.error("Please fill required fields"); return; }
    const digits = empForm.ssn.replace(/\D/g, "");
    addEmployee.mutate({
      name: empForm.name,
      ssn_last4: digits.slice(-4),
      address: empForm.address,
      salary: parseFloat(empForm.salary),
      federal_withholding: parseFloat(empForm.federalWithholding) || 0,
      state_withholding: parseFloat(empForm.stateWithholding) || 0,
      social_security: parseFloat(empForm.socialSecurity) || 0,
      medicare: parseFloat(empForm.medicare) || 0,
    }, {
      onSuccess: () => {
        setEmpForm({ name: "", ssn: "", address: "", salary: "", federalWithholding: "", stateWithholding: "", socialSecurity: "", medicare: "" });
        setEmpOpen(false);
        toast.success("Employee added");
      },
    });
  };

  const startEmpEdit = (e: Employee) => {
    setEmpEditId(e.id);
    setEmpEditForm({ name: e.name, ssn_last4: "", address: e.address, salary: String(e.salary), federalWithholding: String(e.federalWithholding), stateWithholding: String(e.stateWithholding), socialSecurity: String(e.socialSecurity), medicare: String(e.medicare) });
  };

  const saveEmpEdit = () => {
    if (!empEditId) return;
    const update: any = {
      id: empEditId, name: empEditForm.name, address: empEditForm.address,
      salary: parseFloat(empEditForm.salary) || 0, federal_withholding: parseFloat(empEditForm.federalWithholding) || 0,
      state_withholding: parseFloat(empEditForm.stateWithholding) || 0, social_security: parseFloat(empEditForm.socialSecurity) || 0,
      medicare: parseFloat(empEditForm.medicare) || 0,
    };
    if (empEditForm.ssn_last4) {
      const digits = empEditForm.ssn_last4.replace(/\D/g, "");
      update.ssn_last4 = digits.slice(-4);
    }
    updateEmployee.mutate(update, { onSuccess: () => { setEmpEditId(null); toast.success("Updated"); } });
  };

  // ── Form generation with full TIN/SSN entry ──
  const handleGenerate = () => {
    if (!genDialog || !fullTin || !fullEin) {
      toast.error("Enter full TIN/SSN and EIN");
      return;
    }
    const payerAddress = profile ? [profile.business_address, profile.business_city, profile.business_state, profile.business_zip].filter(Boolean).join(", ") : "";
    const payerName = profile?.business_name || "";

    if (genDialog.type === "1099") {
      const contractor = contractors.find((c) => c.id === genDialog.id);
      if (!contractor) return;
      generate1099NEC(contractor, fullTin, { name: payerName, tin: fullEin, address: payerAddress });
      toast.success(`1099-NEC generated for ${contractor.name}`);
    } else {
      const employee = employees.find((e) => e.id === genDialog.id);
      if (!employee) return;
      generateW2(employee, fullTin, { name: payerName, ein: fullEin, address: payerAddress });
      toast.success(`W-2 generated for ${employee.name}`);
    }
    setGenDialog(null);
    setFullTin("");
    setFullEin("");
  };

  const handleExport = () => {
    const csv = ["Name,TIN (last 4),Total Paid,Pay Rate,Address", ...contractors.map((c) => `"${c.name}","${c.tin}",${c.totalPaid},${c.payRate ?? ""},"${c.address}"`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "1099-report-2026.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported");
  };

  const totalPaid = contractors.reduce((sum, c) => sum + c.totalPaid, 0);
  const threshold = contractors.filter((c) => c.totalPaid >= 600);
  const totalSalaries = employees.reduce((sum, e) => sum + e.salary, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tax Forms</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Generate 1099-NEC and W-2 forms
            {!profile?.business_name && <span className="text-chart-warning"> — <a href="/profile" className="underline">Set up your company profile first</a></span>}
          </p>
        </div>

        {/* Full TIN/SSN Entry Dialog */}
        <Dialog open={!!genDialog} onOpenChange={(open) => { if (!open) { setGenDialog(null); setFullTin(""); setFullEin(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enter Full {genDialog?.type === "1099" ? "TIN" : "SSN"} & EIN</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              For privacy, only the last 4 digits are stored. Enter the full values to generate the form — they won't be saved.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {genDialog?.type === "1099" ? "Contractor's TIN (XXX-XX-XXXX)" : "Employee's SSN (XXX-XX-XXXX)"}
                </label>
                <Input
                  value={fullTin}
                  onChange={(e) => setFullTin(e.target.value)}
                  placeholder="XXX-XX-XXXX"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Your EIN (XX-XXXXXXX)</label>
                <Input
                  value={fullEin}
                  onChange={(e) => setFullEin(e.target.value)}
                  placeholder="XX-XXXXXXX"
                />
              </div>
              <Button onClick={handleGenerate} className="w-full" disabled={!fullTin || !fullEin}>
                Generate {genDialog?.type === "1099" ? "1099-NEC" : "W-2"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

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
                    <p className="text-xs text-muted-foreground">Only the last 4 digits of the TIN will be stored.</p>
                    <div className="space-y-3">
                      <Input placeholder="Contractor name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                      <Input placeholder="TIN / SSN (full — only last 4 stored)" value={form.tin} onChange={(e) => setForm({ ...form, tin: e.target.value })} />
                      <Input type="number" placeholder="Total paid" value={form.totalPaid} onChange={(e) => setForm({ ...form, totalPaid: e.target.value })} />
                      <Input type="number" placeholder="Pay rate ($/hr, optional)" value={form.payRate} onChange={(e) => setForm({ ...form, payRate: e.target.value })} />
                      <Input placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                      <Button onClick={handleAdd} className="w-full" disabled={addContractor.isPending}>Add Contractor</Button>
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
                    <th>Contractor</th><th>TIN (last 4)</th><th>Address</th><th className="text-right">Pay Rate</th><th className="text-right">Total Paid</th><th>1099 Required</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {contractors.map((c) => {
                    const isEditing = editId === c.id;
                    if (isEditing) {
                      return (
                        <tr key={c.id} className="bg-accent/30">
                          <td><Input className="h-8 text-sm" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></td>
                          <td><Input className="h-8 text-sm font-mono" placeholder="New TIN (optional)" value={editForm.tin_last4} onChange={(e) => setEditForm({ ...editForm, tin_last4: e.target.value })} /></td>
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
                            {c.totalPaid >= 600 && (
                              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { setGenDialog({ type: "1099", id: c.id }); }}>
                                <FileText className="h-3 w-3" />1099-NEC
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { removeContractor.mutate(c.id); toast.success("Removed"); }}>
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
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
                  <p className="text-xs text-muted-foreground">Only the last 4 digits of the SSN will be stored.</p>
                  <div className="space-y-3">
                    <Input placeholder="Employee name *" value={empForm.name} onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })} />
                    <Input placeholder="SSN (full — only last 4 stored) *" value={empForm.ssn} onChange={(e) => setEmpForm({ ...empForm, ssn: e.target.value })} />
                    <Input placeholder="Address" value={empForm.address} onChange={(e) => setEmpForm({ ...empForm, address: e.target.value })} />
                    <Input type="number" placeholder="Annual salary *" value={empForm.salary} onChange={(e) => setEmpForm({ ...empForm, salary: e.target.value })} />
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="number" placeholder="Federal withholding" value={empForm.federalWithholding} onChange={(e) => setEmpForm({ ...empForm, federalWithholding: e.target.value })} />
                      <Input type="number" placeholder="State withholding" value={empForm.stateWithholding} onChange={(e) => setEmpForm({ ...empForm, stateWithholding: e.target.value })} />
                      <Input type="number" placeholder="Social Security tax" value={empForm.socialSecurity} onChange={(e) => setEmpForm({ ...empForm, socialSecurity: e.target.value })} />
                      <Input type="number" placeholder="Medicare tax" value={empForm.medicare} onChange={(e) => setEmpForm({ ...empForm, medicare: e.target.value })} />
                    </div>
                    <Button onClick={handleAddEmployee} className="w-full" disabled={addEmployee.isPending}>Add Employee</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="rounded-lg border border-chart-info/30 bg-chart-info/5 p-4">
              <p className="text-sm"><span className="font-semibold">IRS Requirement:</span> File Form W-2 for every employee by <span className="font-mono font-semibold">January 31</span>.</p>
            </div>

            <div className="stat-card overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th><th>SSN (last 4)</th><th>Address</th><th className="text-right">Salary</th><th className="text-right">Fed. W/H</th><th className="text-right">State W/H</th><th className="text-right">SS + Med</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => {
                    const isEditing = empEditId === e.id;
                    if (isEditing) {
                      return (
                        <tr key={e.id} className="bg-accent/30">
                          <td><Input className="h-8 text-sm" value={empEditForm.name} onChange={(ev) => setEmpEditForm({ ...empEditForm, name: ev.target.value })} /></td>
                          <td><Input className="h-8 text-sm font-mono" placeholder="New SSN (optional)" value={empEditForm.ssn_last4} onChange={(ev) => setEmpEditForm({ ...empEditForm, ssn_last4: ev.target.value })} /></td>
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
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { setGenDialog({ type: "w2", id: e.id }); }}>
                              <FileText className="h-3 w-3" />W-2
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { removeEmployee.mutate(e.id); toast.success("Removed"); }}>
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
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
