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
import { Save, UserCircle, Link2, Check, X } from "lucide-react";
import DeleteAccountSection from "@/components/DeleteAccountSection";
import SetPasswordCard from "@/components/SetPasswordCard";

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

        <SetPasswordCard />

        {/* Link to Business via Bookie ID */}
        <LinkToBusinessSection />

        <DeleteAccountSection variant="personal" />
      </div>
    </PersonalDashboardLayout>
  );
}

function LinkToBusinessSection() {
  const { user } = useAuth();
  const [bookieCode, setBookieCode] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkedBusinesses, setLinkedBusinesses] = useState<{ name: string; id: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("team_members")
        .select("business_user_id, status")
        .eq("member_user_id", user.id)
        .eq("status", "active");
      if (data && data.length > 0) {
        // Fetch business names
        const bizIds = data.map((d) => d.business_user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, business_name")
          .in("user_id", bizIds);
        setLinkedBusinesses(
          (profiles || []).map((p) => ({ name: p.business_name || "Unnamed Business", id: p.user_id }))
        );
      }
    })();
  }, [user]);

  const handleLink = async () => {
    if (!user || !bookieCode.trim()) return;
    setLinking(true);
    const code = bookieCode.trim().toUpperCase();

    const { data: bizProfile, error } = await (supabase as any)
      .from("profiles")
      .select("user_id, business_name, bookie_id")
      .eq("bookie_id", code)
      .single();

    if (error || !bizProfile) {
      toast.error("Invalid Bookie ID");
      setLinking(false);
      return;
    }

    const { data: existing } = await supabase
      .from("team_members")
      .select("id")
      .eq("email", user.email!)
      .eq("business_user_id", bizProfile.user_id)
      .maybeSingle();

    if (!existing) {
      const { error: insertError } = await supabase
        .from("team_members")
        .insert({
          business_user_id: bizProfile.user_id,
          member_user_id: user.id,
          email: user.email!,
          name: user.email!.split("@")[0],
          role: "crew" as const,
          status: "pending",
        });
      if (insertError) {
        toast.error("Failed to send request");
        setLinking(false);
        return;
      }
    } else if (existing) {
      // Check if already active or pending
      const { data: existingFull } = await supabase
        .from("team_members")
        .select("id, status")
        .eq("id", (existing as any).id)
        .single();
      if (existingFull?.status === "active") {
        toast.info("Already linked to this business");
        setLinking(false);
        return;
      }
      if (existingFull?.status === "pending") {
        toast.info("Your request is pending admin approval");
        setLinking(false);
        return;
      }
      await supabase
        .from("team_members")
        .update({ member_user_id: user.id, status: "pending" })
        .eq("id", (existing as any).id);
    }

    toast.success(`Request sent to ${(bizProfile as any).business_name || "business"}! Waiting for admin approval.`);
    setBookieCode("");
    setLinkedBusinesses((prev) => [...prev, { name: (bizProfile as any).business_name || "Unnamed Business", id: bizProfile.user_id }]);
    setLinking(false);
  };

  return (
    <div className="stat-card space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Link2 className="h-5 w-5 text-muted-foreground" />
        <h2 className="font-semibold">Linked Businesses</h2>
      </div>

      {linkedBusinesses.length > 0 ? (
        <div className="space-y-2">
          {linkedBusinesses.map((biz) => (
            <div key={biz.id} className="flex items-center gap-2 rounded-md bg-accent/50 px-3 py-2 text-sm">
              <Check className="h-4 w-4 text-primary" />
              <span className="font-medium">{biz.name}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No businesses linked yet</p>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Enter Bookie ID (e.g. BK-A3X9)"
          value={bookieCode}
          onChange={(e) => setBookieCode(e.target.value.toUpperCase())}
          maxLength={7}
          className="font-mono tracking-wider"
        />
        <Button onClick={handleLink} disabled={linking || !bookieCode.trim()} size="sm">
          {linking ? "Linking…" : "Link"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Ask your employer for their Bookie ID to link your account to their business
      </p>
    </div>
  );
}
