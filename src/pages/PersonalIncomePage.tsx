import { useState, useRef } from "react";
import PersonalDashboardLayout from "@/components/PersonalDashboardLayout";
import { useW2Income, useAddW2Income, useRemoveW2Income, W2Income } from "@/hooks/usePersonalData";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Briefcase, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { US_STATES } from "@/lib/taxCalc";
import { supabase } from "@/integrations/supabase/client";

const emptyW2: Omit<W2Income, "id"> = {
  employer_name: "",
  employer_ein: "",
  wages: 0,
  federal_tax_withheld: 0,
  state_tax_withheld: 0,
  social_security_withheld: 0,
  medicare_withheld: 0,
  state: null,
  tax_year: 2026,
  notes: null,
};

export default function PersonalIncomePage() {
  const { data: w2s = [], isLoading } = useW2Income();
  const addW2 = useAddW2Income();
  const removeW2 = useRemoveW2Income();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyW2);
  const [uploading, setUploading] = useState(false);
  const w2FileRef = useRef<HTMLInputElement>(null);

  const handleW2PdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        fullText += tc.items.map((it: any) => ("str" in it ? it.str : "")).join(" ") + "\n";
      }
      const { data, error } = await supabase.functions.invoke("parse-w2", { body: { text: fullText } });
      if (error) throw error;
      if (data?.w2) {
        setForm({
          employer_name: data.w2.employer_name || "",
          employer_ein: data.w2.employer_ein || "",
          wages: data.w2.wages || 0,
          federal_tax_withheld: data.w2.federal_tax_withheld || 0,
          state_tax_withheld: data.w2.state_tax_withheld || 0,
          social_security_withheld: data.w2.social_security_withheld || 0,
          medicare_withheld: data.w2.medicare_withheld || 0,
          state: data.w2.state || null,
          tax_year: 2026,
          notes: null,
        });
        setShowAdd(true);
        toast.success("W-2 data extracted! Review and save.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to parse W-2 PDF");
    } finally {
      setUploading(false);
    }
  };

  const totalWages = w2s.reduce((s, w) => s + w.wages, 0);
  const totalFedWithheld = w2s.reduce((s, w) => s + w.federal_tax_withheld, 0);
  const totalStateWithheld = w2s.reduce((s, w) => s + w.state_tax_withheld, 0);

  const handleAdd = async () => {
    if (!form.employer_name.trim()) {
      toast.error("Employer name is required");
      return;
    }
    await addW2.mutateAsync(form);
    toast.success("W-2 added");
    setForm(emptyW2);
    setShowAdd(false);
  };

  const handleDelete = async (id: string) => {
    await removeW2.mutateAsync(id);
    toast.success("W-2 removed");
  };

  const setField = (key: string, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <PersonalDashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Income</h1>
            <p className="text-muted-foreground text-sm mt-1">Add your W-2 forms and other wage income</p>
          </div>
          <div className="flex gap-2">
            <input ref={w2FileRef} type="file" accept=".pdf" className="hidden" onChange={handleW2PdfUpload} />
            <Button variant="outline" onClick={() => w2FileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload W-2 PDF
            </Button>
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add W-2
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="stat-card text-center py-6">
            <p className="text-sm text-muted-foreground">Total Wages</p>
            <p className="text-2xl font-bold font-mono mt-1">{formatCurrency(totalWages)}</p>
          </div>
          <div className="stat-card text-center py-6">
            <p className="text-sm text-muted-foreground">Federal Tax Withheld</p>
            <p className="text-2xl font-bold font-mono mt-1">{formatCurrency(totalFedWithheld)}</p>
          </div>
          <div className="stat-card text-center py-6">
            <p className="text-sm text-muted-foreground">State Tax Withheld</p>
            <p className="text-2xl font-bold font-mono mt-1">{formatCurrency(totalStateWithheld)}</p>
          </div>
        </div>

        {/* W-2 list */}
        {isLoading ? (
          <div className="stat-card p-8 text-center text-muted-foreground">Loading…</div>
        ) : w2s.length === 0 ? (
          <div className="stat-card p-8 text-center space-y-3">
            <Briefcase className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">No W-2 forms added yet. Click "Add W-2" to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {w2s.map((w) => (
              <div key={w.id} className="stat-card flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{w.employer_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {w.state ?? "No state"} • EIN: {w.employer_ein || "—"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono font-semibold">{formatCurrency(w.wages)}</p>
                  <p className="text-xs text-muted-foreground">
                    Fed: {formatCurrency(w.federal_tax_withheld)} • State: {formatCurrency(w.state_tax_withheld)}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(w.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add dialog */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add W-2</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Employer Name *</Label>
                <Input value={form.employer_name} onChange={(e) => setField("employer_name", e.target.value)} />
              </div>
              <div>
                <Label>Employer EIN</Label>
                <Input placeholder="XX-XXXXXXX" value={form.employer_ein ?? ""} onChange={(e) => setField("employer_ein", e.target.value)} />
              </div>
              <div>
                <Label>State</Label>
                <Select value={form.state ?? ""} onValueChange={(v) => setField("state", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {US_STATES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Wages (Box 1)</Label>
                <Input type="number" min={0} step="0.01" value={form.wages || ""} onChange={(e) => setField("wages", Number(e.target.value))} />
              </div>
              <div>
                <Label>Federal Tax Withheld (Box 2)</Label>
                <Input type="number" min={0} step="0.01" value={form.federal_tax_withheld || ""} onChange={(e) => setField("federal_tax_withheld", Number(e.target.value))} />
              </div>
              <div>
                <Label>Social Security Withheld (Box 4)</Label>
                <Input type="number" min={0} step="0.01" value={form.social_security_withheld || ""} onChange={(e) => setField("social_security_withheld", Number(e.target.value))} />
              </div>
              <div>
                <Label>Medicare Withheld (Box 6)</Label>
                <Input type="number" min={0} step="0.01" value={form.medicare_withheld || ""} onChange={(e) => setField("medicare_withheld", Number(e.target.value))} />
              </div>
              <div>
                <Label>State Tax Withheld (Box 17)</Label>
                <Input type="number" min={0} step="0.01" value={form.state_tax_withheld || ""} onChange={(e) => setField("state_tax_withheld", Number(e.target.value))} />
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={form.notes ?? ""} onChange={(e) => setField("notes", e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={addW2.isPending}>
                {addW2.isPending ? "Saving…" : "Save W-2"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PersonalDashboardLayout>
  );
}
