import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTeamRole } from "@/hooks/useTeamRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, UserCircle } from "lucide-react";
import { toast } from "sonner";
import SetPasswordCard from "@/components/SetPasswordCard";

interface PersonalFields {
  first_name: string;
  last_name: string;
  personal_address: string;
  personal_city: string;
  personal_state: string;
  personal_zip: string;
  ssn_last4: string;
}

const empty: PersonalFields = {
  first_name: "",
  last_name: "",
  personal_address: "",
  personal_city: "",
  personal_state: "",
  personal_zip: "",
  ssn_last4: "",
};

export default function CrewProfileTab() {
  const { user } = useAuth();
  const { teamMemberId, businessUserId } = useTeamRole();
  const [profile, setProfile] = useState<PersonalFields>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // 1. Load existing profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("first_name, last_name, personal_address, personal_city, personal_state, personal_zip, ssn_last4")
        .eq("user_id", user.id)
        .single();

      const p: PersonalFields = {
        first_name: profileData?.first_name || "",
        last_name: profileData?.last_name || "",
        personal_address: profileData?.personal_address || "",
        personal_city: profileData?.personal_city || "",
        personal_state: profileData?.personal_state || "",
        personal_zip: profileData?.personal_zip || "",
        ssn_last4: profileData?.ssn_last4 || "",
      };

      // 2. If profile fields are empty, try to pre-populate from admin's records
      const needsSync = !p.first_name && !p.last_name;
      if (needsSync && teamMemberId && businessUserId) {
        // Get team member info (name set by admin)
        const { data: tm } = await supabase
          .from("team_members")
          .select("name, email, worker_type")
          .eq("id", teamMemberId)
          .single();

        if (tm) {
          // Split admin-provided name into first/last
          const nameParts = (tm.name || "").trim().split(/\s+/);
          if (!p.first_name) p.first_name = nameParts[0] || "";
          if (!p.last_name) p.last_name = nameParts.slice(1).join(" ") || "";

          // Get address from contractor/employee record admin created
          if (tm.worker_type === "1099" || tm.worker_type === "contractor") {
            const { data: contractor } = await supabase
              .from("contractors")
              .select("address, state_employed, tin_last4")
              .eq("user_id", businessUserId)
              .eq("name", tm.name)
              .maybeSingle();
            if (contractor) {
              if (!p.personal_address && contractor.address) p.personal_address = contractor.address;
              if (!p.personal_state && contractor.state_employed) p.personal_state = contractor.state_employed;
              if (!p.ssn_last4 && contractor.tin_last4) p.ssn_last4 = contractor.tin_last4;
            }
          } else {
            const { data: employee } = await supabase
              .from("employees")
              .select("address, state_employed, ssn_last4")
              .eq("user_id", businessUserId)
              .eq("name", tm.name)
              .maybeSingle();
            if (employee) {
              if (!p.personal_address && employee.address) p.personal_address = employee.address;
              if (!p.personal_state && employee.state_employed) p.personal_state = employee.state_employed;
              if (!p.ssn_last4 && employee.ssn_last4) p.ssn_last4 = employee.ssn_last4;
            }
          }

          // Auto-save the pre-populated data to their profile
          if (p.first_name || p.personal_address) {
            await supabase.from("profiles").update(p).eq("user_id", user.id);
          }
        }
      }

      setProfile(p);
      setLoading(false);
    })();
  }, [user, teamMemberId, businessUserId]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    // 1. Save to own profile
    const { error } = await supabase
      .from("profiles")
      .update(profile)
      .eq("user_id", user.id);

    if (error) {
      toast.error("Failed to save profile");
      setSaving(false);
      return;
    }

    // 2. Sync back to admin's records (team_members + contractor/employee)
    if (teamMemberId && businessUserId) {
      const fullName = `${profile.first_name} ${profile.last_name}`.trim();

      // Get current team member info to find the right contractor/employee record
      const { data: tm } = await supabase
        .from("team_members")
        .select("name, worker_type")
        .eq("id", teamMemberId)
        .single();

      if (tm) {
        const oldName = tm.name;

        // Update team_members name
        if (fullName) {
          await supabase
            .from("team_members")
            .update({ name: fullName })
            .eq("id", teamMemberId);
        }

        // Update contractor/employee record
        const addressData = {
          name: fullName || oldName,
          address: profile.personal_address || null,
          state_employed: profile.personal_state || null,
        };

        if (tm.worker_type === "1099" || tm.worker_type === "contractor") {
          await supabase
            .from("contractors")
            .update({
              ...addressData,
              tin_last4: profile.ssn_last4 || null,
            })
            .eq("user_id", businessUserId)
            .eq("name", oldName);
        } else {
          await supabase
            .from("employees")
            .update({
              ...addressData,
              ssn_last4: profile.ssn_last4 || null,
            })
            .eq("user_id", businessUserId)
            .eq("name", oldName);
        }
      }
    }

    setSaving(false);
    toast.success("Profile saved & synced");
  };

  const set = (key: keyof PersonalFields, value: string) =>
    setProfile((p) => ({ ...p, [key]: value }));

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading…</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCircle className="h-5 w-5" /> My Info
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Changes you make here will also update your employer's records.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
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
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>City</Label>
            <Input value={profile.personal_city} onChange={(e) => set("personal_city", e.target.value)} />
          </div>
          <div>
            <Label>State</Label>
            <Input value={profile.personal_state} onChange={(e) => set("personal_state", e.target.value)} placeholder="TX" maxLength={2} />
          </div>
          <div>
            <Label>ZIP</Label>
            <Input value={profile.personal_zip} onChange={(e) => set("personal_zip", e.target.value)} maxLength={10} />
          </div>
        </div>
        <div className="max-w-[200px]">
          <Label>SSN (last 4 only)</Label>
          <Input
            value={profile.ssn_last4}
            onChange={(e) => set("ssn_last4", e.target.value.replace(/\D/g, "").slice(0, 4))}
            maxLength={4}
            placeholder="••••"
          />
          <p className="text-xs text-muted-foreground mt-1">Only last 4 digits stored</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save Profile"}
        </Button>
      </CardContent>
    </Card>

    <SetPasswordCard />
    </>
  );
}
