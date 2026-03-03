import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfileGate } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Save, Download, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

const BUSINESS_TYPES = ["Sole Proprietor", "LLC", "S-Corp", "C-Corp", "Partnership", "Nonprofit"];

interface Profile {
  business_name: string;
  ein_last4: string;
  business_address: string;
  business_city: string;
  business_state: string;
  business_zip: string;
  business_type: string;
  business_phone: string;
  business_email: string;
  bookie_id: string;
  default_tax_rate: string;
}

const emptyProfile: Profile = {
  business_name: "",
  ein_last4: "",
  business_address: "",
  business_city: "",
  business_state: "",
  business_zip: "",
  business_type: "",
  business_phone: "",
  business_email: "",
  bookie_id: "",
  default_tax_rate: "0",
};

export default function ProfilePage() {
  const { user } = useAuth();
  const { recheckProfile } = useProfileGate();
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [einFull, setEinFull] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setProfile({
          business_name: data.business_name || "",
          ein_last4: data.ein_last4 || "",
          business_address: data.business_address || "",
          business_city: data.business_city || "",
          business_state: data.business_state || "",
          business_zip: data.business_zip || "",
          business_type: data.business_type || "",
          business_phone: data.business_phone || "",
          business_email: data.business_email || "",
          bookie_id: (data as any).bookie_id || "",
          default_tax_rate: String((data as any).default_tax_rate ?? "0"),
        });
      }
      setLoading(false);
    })();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    let ein_last4 = profile.ein_last4;
    if (einFull) {
      const digits = einFull.replace(/\D/g, "");
      ein_last4 = digits.slice(-4);
    }
    const { default_tax_rate, ...profileRest } = profile;
    const { error } = await supabase
      .from("profiles")
      .update({ ...profileRest, ein_last4, default_tax_rate: parseFloat(default_tax_rate) || 0 } as any)
      .eq("user_id", user.id);
    if (error) {
      toast.error("Failed to save profile");
    } else {
      setProfile((p) => ({ ...p, ein_last4 }));
      setEinFull("");
      recheckProfile();
      toast.success("Profile saved");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground">Loading…</div>
      </DashboardLayout>
    );
  }

  const isIncomplete = !profile.business_name?.trim();

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-2xl">
        {isIncomplete && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-medium">
              👋 Welcome! Please complete your company profile before continuing. This info is needed for tax form generation.
            </p>
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Company Profile</h1>
          <p className="text-muted-foreground text-sm mt-1">
            This information is used on generated 1099-NEC and W-2 forms
          </p>
        </div>

        {/* Bookie ID Banner */}
        {profile.bookie_id && (
          <BookieIdBanner bookieId={profile.bookie_id} />
        )}

        <div className="stat-card space-y-5">
          <h2 className="section-title flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Business Information
          </h2>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Business Name *</label>
              <Input value={profile.business_name} onChange={(e) => setProfile({ ...profile, business_name: e.target.value })} placeholder="Your Business LLC" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Business Type</label>
                <Select value={profile.business_type} onValueChange={(v) => setProfile({ ...profile, business_type: v })}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>{BUSINESS_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  EIN {profile.ein_last4 && <span className="text-primary">(stored: ***-**{profile.ein_last4})</span>}
                </label>
                <Input value={einFull} onChange={(e) => setEinFull(e.target.value)} placeholder={profile.ein_last4 ? `***-**${profile.ein_last4} — enter new to update` : "XX-XXXXXXX"} />
                <p className="text-xs text-muted-foreground mt-1">Only last 4 digits are stored for security</p>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Street Address</label>
              <Input value={profile.business_address} onChange={(e) => setProfile({ ...profile, business_address: e.target.value })} placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">City</label>
                <Input value={profile.business_city} onChange={(e) => setProfile({ ...profile, business_city: e.target.value })} placeholder="City" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">State</label>
                <Input value={profile.business_state} onChange={(e) => setProfile({ ...profile, business_state: e.target.value })} placeholder="TX" maxLength={2} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">ZIP</label>
                <Input value={profile.business_zip} onChange={(e) => setProfile({ ...profile, business_zip: e.target.value })} placeholder="78701" maxLength={10} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Phone</label>
                <Input value={profile.business_phone} onChange={(e) => setProfile({ ...profile, business_phone: e.target.value })} placeholder="(555) 123-4567" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Business Email</label>
                <Input type="email" value={profile.business_email} onChange={(e) => setProfile({ ...profile, business_email: e.target.value })} placeholder="info@yourbusiness.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Default Sales Tax Rate %</label>
                <Input type="number" step="0.01" value={profile.default_tax_rate} onChange={(e) => setProfile({ ...profile, default_tax_rate: e.target.value })} placeholder="0.00" />
                <p className="text-xs text-muted-foreground mt-1">Pre-fills on new invoices</p>
              </div>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving…" : "Save Profile"}
          </Button>
        </div>

        <div className="rounded-lg border border-chart-info/30 bg-chart-info/5 p-4">
          <p className="text-sm">
            <span className="font-semibold">Privacy note:</span> Only the last 4 digits of your EIN are stored. 
            SSNs and TINs for contractors/employees are also stored as last-4 only. 
            Full values must be re-entered when generating tax forms.
          </p>
        </div>

        <FullAccountExport userId={user?.id} />
      </div>
    </DashboardLayout>
  );
}

// ── Bookie ID Banner ──
function BookieIdBanner({ bookieId }: { bookieId: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(bookieId).then(() => {
      setCopied(true);
      toast.success("Bookie ID copied!");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-center justify-between">
      <div>
        <p className="text-xs text-muted-foreground font-medium mb-1">Your Bookie ID</p>
        <p className="text-xl font-bold font-mono tracking-widest text-primary">{bookieId}</p>
        <p className="text-xs text-muted-foreground mt-1">Share this code so team members can link to your business</p>
      </div>
      <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 shrink-0">
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

// ── Full Account Export ──
function toCsvString(headers: string[], rows: Record<string, any>[]): string {
  const escape = (v: any) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

function FullAccountExport({ userId }: { userId?: string }) {
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (!userId) return;
    setExporting(true);
    try {
      const tables = [
        { name: "sales", select: "date,client,description,amount,category,invoice_number" },
        { name: "expenses", select: "date,vendor,description,amount,category" },
        { name: "invoices", select: "invoice_number,client_name,issue_date,due_date,status,subtotal,tax_amount,total" },
        { name: "contractors", select: "name,tin_last4,total_paid,address,state_employed" },
        { name: "employees", select: "name,ssn_last4,salary,federal_withholding,state_withholding,social_security,medicare,state_employed" },
      ];

      const csvFiles: { name: string; content: string }[] = [];

      for (const t of tables) {
        const { data, error } = await (supabase as any)
          .from(t.name)
          .select(t.select)
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(5000);
        if (error) continue;
        if (data && data.length > 0) {
          const headers = t.select.split(",");
          csvFiles.push({ name: `${t.name}.csv`, content: toCsvString(headers, data) });
        }
      }

      if (csvFiles.length === 0) {
        toast.error("No data to export");
        return;
      }

      for (const file of csvFiles) {
        const blob = new Blob([file.content], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bookie-${file.name}`;
        a.click();
        URL.revokeObjectURL(url);
        await new Promise((r) => setTimeout(r, 300));
      }

      toast.success(`Exported ${csvFiles.length} files`);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }, [userId]);

  return (
    <div className="stat-card space-y-4">
      <h2 className="section-title flex items-center gap-2">
        <Download className="h-4 w-4" /> Data Export
      </h2>
      <p className="text-sm text-muted-foreground">
        Download all your business data as CSV files — sales, expenses, invoices, contractors, and employees.
      </p>
      <Button variant="outline" onClick={handleExport} disabled={exporting} className="gap-2">
        {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {exporting ? "Exporting…" : "Export All Data"}
      </Button>
    </div>
  );
}
