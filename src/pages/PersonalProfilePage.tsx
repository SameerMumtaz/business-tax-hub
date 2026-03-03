import { useState, useEffect } from "react";
import PersonalDashboardLayout from "@/components/PersonalDashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { US_STATES, FILING_STATUS_LABELS, type FilingStatus } from "@/lib/taxCalc";
import { toast } from "sonner";
import { Save, UserCircle } from "lucide-react";

interface PersonalProfile {
  first_name: string;
  last_name: string;
  personal_address: string;
  personal_city: string;
  personal_state: string;
  personal_zip: string;
  ssn_last4: string;
  filing_status: FilingStatus;
}

const empty: PersonalProfile = {
  first_name: "",
  last_name: "",
  personal_address: "",
  personal_city: "",
  personal_state: "",
  personal_zip: "",
  ssn_last4: "",
  filing_status: "single",
};

export default function PersonalProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<PersonalProfile>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("first_name, last_name, personal_address, personal_city, personal_state, personal_zip, ssn_last4, filing_status")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setProfile({
          first_name: data.first_name || "",
          last_name: data.last_name || "",
          personal_address: data.personal_address || "",
          personal_city: data.personal_city || "",
          personal_state: data.personal_state || "",
          personal_zip: data.personal_zip || "",
          ssn_last4: data.ssn_last4 || "",
          filing_status: data.filing_status || "single",
        });
      }
      setLoading(false);
    })();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await (supabase as any)
      .from("profiles")
      .update(profile)
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Failed to save profile");
    } else {
      toast.success("Profile saved");
    }
  };

  const set = (key: keyof PersonalProfile, value: string) =>
    setProfile((p) => ({ ...p, [key]: value }));

  if (loading) {
    return (
      <PersonalDashboardLayout>
        <div className="animate-pulse space-y-4 p-8">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </PersonalDashboardLayout>
    );
  }

  return (
    <PersonalDashboardLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Info</h1>
          <p className="text-muted-foreground text-sm mt-1">Personal details for your tax return</p>
        </div>

        <div className="stat-card space-y-5">
          <div className="flex items-center gap-3 mb-2">
            <UserCircle className="h-6 w-6 text-muted-foreground" />
            <h2 className="font-semibold">Personal Information</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>First Name</Label>
              <Input value={profile.first_name} onChange={(e) => set("first_name", e.target.value)} />
            </div>
            <div>
              <Label>Last Name</Label>
              <Input value={profile.last_name} onChange={(e) => set("last_name", e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Street Address</Label>
            <Input value={profile.personal_address} onChange={(e) => set("personal_address", e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>City</Label>
              <Input value={profile.personal_city} onChange={(e) => set("personal_city", e.target.value)} />
            </div>
            <div>
              <Label>State</Label>
              <Select value={profile.personal_state} onValueChange={(v) => set("personal_state", v)}>
                <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent>
                  {US_STATES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ZIP Code</Label>
              <Input value={profile.personal_zip} onChange={(e) => set("personal_zip", e.target.value)} maxLength={10} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>SSN (last 4 digits only)</Label>
              <Input
                value={profile.ssn_last4}
                onChange={(e) => set("ssn_last4", e.target.value.replace(/\D/g, "").slice(0, 4))}
                maxLength={4}
                placeholder="••••"
              />
              <p className="text-xs text-muted-foreground mt-1">Only the last 4 digits are stored</p>
            </div>
            <div>
              <Label>Filing Status</Label>
              <Select value={profile.filing_status} onValueChange={(v) => set("filing_status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(FILING_STATUS_LABELS) as [FilingStatus, string][]).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save Profile"}
        </Button>
      </div>
    </PersonalDashboardLayout>
  );
}
