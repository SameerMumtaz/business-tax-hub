import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useTaxStore } from "@/store/taxStore";
import { formatCurrency } from "@/lib/format";
import { generateId } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, FileDown, FileText } from "lucide-react";
import { toast } from "sonner";
import { Contractor } from "@/types/tax";

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
  .void { font-size: 8px; color: #999; }
  .checkbox { display: inline-block; width: 10px; height: 10px; border: 1px solid #000; margin-right: 4px; vertical-align: middle; }
  .instructions { margin-top: 20px; font-size: 9px; color: #444; line-height: 1.5; max-width: 7.5in; margin-left: auto; margin-right: auto; }
  .instructions h3 { font-size: 11px; margin-bottom: 6px; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style></head><body>
<div class="no-print" style="text-align:center;margin-bottom:20px;">
  <button onclick="window.print()" style="padding:10px 24px;font-size:14px;cursor:pointer;background:#1a1a2e;color:#fff;border:none;border-radius:4px;">Print / Save as PDF</button>
</div>
<div class="form">
  <div class="header">
    <div>
      <h1>Form 1099-NEC</h1>
      <div class="sub">Nonemployee Compensation &bull; Department of the Treasury &mdash; Internal Revenue Service</div>
    </div>
    <div class="year">${taxYear}</div>
  </div>

  <div class="section-label">Payer Information</div>
  <div class="row">
    <div class="cell wide">
      <div class="cell-label">Payer's Name, Street Address, City, State, ZIP</div>
      <div class="cell-value">${escapeHtml(payer.name)}</div>
      <div style="margin-top:2px;font-size:10px;">${escapeHtml(payer.address)}</div>
    </div>
    <div class="cell">
      <div class="cell-label">Payer's TIN</div>
      <div class="cell-value">${escapeHtml(payer.tin)}</div>
    </div>
  </div>

  <div class="section-label">Recipient Information</div>
  <div class="row">
    <div class="cell wide">
      <div class="cell-label">Recipient's Name</div>
      <div class="cell-value">${escapeHtml(contractor.name)}</div>
    </div>
    <div class="cell">
      <div class="cell-label">Recipient's TIN</div>
      <div class="cell-value">${escapeHtml(contractor.tin)}</div>
    </div>
  </div>
  <div class="row">
    <div class="cell">
      <div class="cell-label">Street Address (including apt. no.)</div>
      <div class="cell-value">${escapeHtml(contractor.address)}</div>
    </div>
  </div>

  <div class="section-label">Amounts</div>
  <div class="row">
    <div class="cell">
      <div class="cell-label">1. Nonemployee Compensation</div>
      <div class="cell-amount">$${contractor.totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
    </div>
    <div class="cell">
      <div class="cell-label">2. Payer made direct sales totaling $5,000 or more</div>
      <div class="cell-value"><span class="checkbox"></span> No</div>
    </div>
  </div>
  <div class="row">
    <div class="cell">
      <div class="cell-label">4. Federal Income Tax Withheld</div>
      <div class="cell-amount">$0.00</div>
    </div>
    <div class="cell">
      <div class="cell-label">5. State Tax Withheld</div>
      <div class="cell-amount">$0.00</div>
    </div>
    <div class="cell narrow">
      <div class="cell-label">6. State/Payer's State No.</div>
      <div class="cell-value"></div>
    </div>
    <div class="cell">
      <div class="cell-label">7. State Income</div>
      <div class="cell-amount">$${contractor.totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
    </div>
  </div>

  <div class="footer">
    Form 1099-NEC (Rev. ${taxYear}) &bull; This is an informational copy generated by TaxDash. 
    File Copy A with the IRS. Provide Copy B to the recipient. Retain Copy C for your records.
  </div>
</div>

<div class="instructions">
  <h3>Filing Instructions</h3>
  <p><strong>Due dates:</strong> Copy A to IRS and Copy B to recipient — January 31, ${taxYear + 1}.</p>
  <p><strong>E-file:</strong> If filing 10+ forms, electronic filing is required. Use IRS FIRE system or an approved e-file provider.</p>
  <p><strong>Penalties:</strong> Failure to file correct information returns by the due date may result in penalties under IRC §6721/§6722.</p>
  <p style="margin-top:8px;color:#999;">This form is for informational purposes. Verify all data before filing with the IRS.</p>
</div>
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `1099-NEC-${contractor.name.replace(/\s+/g, "-")}-${taxYear}.html`;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function isContractorComplete(c: Contractor): boolean {
  return !!(c.name.trim() && c.tin.trim() && c.address.trim() && c.totalPaid >= 600);
}

export default function Report1099Page() {
  const { contractors, addContractor, removeContractor, updateContractor } = useTaxStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", tin: "", totalPaid: "", address: "", payRate: "" });
  const [payerInfo, setPayerInfo] = useState({ name: "", tin: "", address: "" });
  const [payerOpen, setPayerOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", tin: "", totalPaid: "", address: "", payRate: "" });

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
      payRate: form.payRate ? parseFloat(form.payRate) : undefined,
    });
    setForm({ name: "", tin: "", totalPaid: "", address: "", payRate: "" });
    setOpen(false);
    toast.success("Contractor added");
  };

  const startEdit = (c: Contractor) => {
    setEditId(c.id);
    setEditForm({
      name: c.name,
      tin: c.tin,
      totalPaid: String(c.totalPaid),
      address: c.address,
      payRate: c.payRate ? String(c.payRate) : "",
    });
  };

  const saveEdit = () => {
    if (!editId) return;
    updateContractor(editId, {
      name: editForm.name,
      tin: editForm.tin,
      totalPaid: parseFloat(editForm.totalPaid) || 0,
      address: editForm.address,
      payRate: editForm.payRate ? parseFloat(editForm.payRate) : undefined,
    });
    setEditId(null);
    toast.success("Contractor updated");
  };

  const cancelEdit = () => setEditId(null);

  const handleExport = () => {
    const csv = [
      "Name,TIN,Total Paid,Pay Rate,Address",
      ...contractors.map((c) => `"${c.name}","${c.tin}",${c.totalPaid},${c.payRate ?? ""},"${c.address}"`),
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

  const handleGenerate1099 = (contractor: Contractor) => {
    if (!payerInfo.name || !payerInfo.tin || !payerInfo.address) {
      setPayerOpen(true);
      toast.info("Enter your business info first to generate 1099-NEC forms");
      return;
    }
    generate1099NEC(contractor, payerInfo);
    toast.success(`1099-NEC generated for ${contractor.name}`);
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
            <Dialog open={payerOpen} onOpenChange={setPayerOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  {payerInfo.name ? "Edit Payer Info" : "Set Payer Info"}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Your Business Info (Payer)</DialogTitle></DialogHeader>
                <p className="text-sm text-muted-foreground">This info appears on all generated 1099-NEC forms.</p>
                <div className="space-y-3">
                  <Input placeholder="Business name" value={payerInfo.name} onChange={(e) => setPayerInfo({ ...payerInfo, name: e.target.value })} />
                  <Input placeholder="EIN (XX-XXXXXXX)" value={payerInfo.tin} onChange={(e) => setPayerInfo({ ...payerInfo, tin: e.target.value })} />
                  <Input placeholder="Business address" value={payerInfo.address} onChange={(e) => setPayerInfo({ ...payerInfo, address: e.target.value })} />
                  <Button onClick={() => { setPayerOpen(false); toast.success("Payer info saved"); }} className="w-full" disabled={!payerInfo.name || !payerInfo.tin || !payerInfo.address}>
                    Save
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
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
                  <Input type="number" placeholder="Pay rate ($/hr, optional)" value={form.payRate} onChange={(e) => setForm({ ...form, payRate: e.target.value })} />
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
                <th className="text-right">Pay Rate</th>
                <th className="text-right">Total Paid</th>
                <th>1099 Required</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contractors.map((c) => {
                const isEditing = editId === c.id;
                const complete = isContractorComplete(c);
                const missing = c.totalPaid >= 600 && !complete
                  ? [!c.tin.trim() && "TIN", !c.address.trim() && "address"].filter(Boolean).join(", ")
                  : "";

                if (isEditing) {
                  return (
                    <tr key={c.id} className="bg-accent/30">
                      <td><Input className="h-8 text-sm" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></td>
                      <td><Input className="h-8 text-sm font-mono" value={editForm.tin} onChange={(e) => setEditForm({ ...editForm, tin: e.target.value })} /></td>
                      <td><Input className="h-8 text-sm" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></td>
                      <td><Input className="h-8 text-sm text-right" type="number" placeholder="$/hr" value={editForm.payRate} onChange={(e) => setEditForm({ ...editForm, payRate: e.target.value })} /></td>
                      <td><Input className="h-8 text-sm text-right" type="number" value={editForm.totalPaid} onChange={(e) => setEditForm({ ...editForm, totalPaid: e.target.value })} /></td>
                      <td colSpan={2}>
                        <div className="flex gap-1">
                          <Button size="sm" className="h-7 text-xs" onClick={saveEdit}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit}>Cancel</Button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={c.id} className="cursor-pointer hover:bg-accent/20" onDoubleClick={() => startEdit(c)}>
                    <td className="font-medium">{c.name}</td>
                    <td className="font-mono text-xs text-muted-foreground">{c.tin}</td>
                    <td className="text-sm text-muted-foreground">{c.address || <span className="italic text-chart-warning">Missing</span>}</td>
                    <td className="text-right font-mono text-sm text-muted-foreground">
                      {c.payRate ? `$${c.payRate}/hr` : "—"}
                    </td>
                    <td className="text-right font-mono">{formatCurrency(c.totalPaid)}</td>
                    <td>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.totalPaid >= 600 ? "bg-chart-warning/10 text-chart-warning" : "bg-muted text-muted-foreground"}`}>
                        {c.totalPaid >= 600 ? "Required" : "Below threshold"}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => startEdit(c)}>
                          Edit
                        </Button>
                        {c.totalPaid >= 600 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => handleGenerate1099(c)}
                            disabled={!complete}
                            title={missing ? `Missing: ${missing}` : "Generate 1099-NEC"}
                          >
                            <FileText className="h-3 w-3" />
                            1099-NEC
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { removeContractor(c.id); toast.success("Removed"); }}>
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
      </div>
    </DashboardLayout>
  );
}