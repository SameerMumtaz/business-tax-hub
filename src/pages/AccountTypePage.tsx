import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, User, ArrowRight, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function AccountTypePage() {
  const [selected, setSelected] = useState<"business" | "individual" | null>(null);
  const [saving, setSaving] = useState(false);
  const [bookieCode, setBookieCode] = useState("");
  const [showBookieInput, setShowBookieInput] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleContinue = async () => {
    if (!selected || !user) return;
    setSaving(true);

    // If linking with a Bookie ID, validate it first
    if (showBookieInput && bookieCode.trim()) {
      const code = bookieCode.trim().toUpperCase();
      const { data: bizProfile, error: lookupError } = await (supabase as any)
        .from("profiles")
        .select("user_id, business_name, bookie_id")
        .eq("bookie_id", code)
        .single();

      if (lookupError || !bizProfile) {
        toast.error("Invalid Bookie ID. Please check the code and try again.");
        setSaving(false);
        return;
      }

      // Check if already a team member
      const { data: existing } = await supabase
        .from("team_members")
        .select("id")
        .eq("email", user.email!)
        .eq("business_user_id", bizProfile.user_id)
        .maybeSingle();

      if (!existing) {
        // Create team member record linked to the business
        const { error: insertError } = await supabase
          .from("team_members")
          .insert({
            business_user_id: bizProfile.user_id,
            member_user_id: user.id,
            email: user.email!,
            name: user.email!.split("@")[0],
            role: "crew" as const,
            status: "active",
            accepted_at: new Date().toISOString(),
          });
        if (insertError) {
          toast.error("Failed to link to business. Please try again.");
          setSaving(false);
          return;
        }
      } else {
        // Update existing record
        await supabase
          .from("team_members")
          .update({ member_user_id: user.id, status: "active", accepted_at: new Date().toISOString() })
          .eq("id", existing.id);
      }

      toast.success(`Linked to ${(bizProfile as any).business_name || "business"}!`);
    }

    const { error } = await supabase
      .from("profiles")
      .update({ account_type: selected } as any)
      .eq("user_id", user.id);
    setSaving(false);

    if (error) {
      toast.error("Failed to save. Please try again.");
      return;
    }

    if (selected === "business") {
      navigate("/profile", { replace: true });
    } else {
      navigate("/personal", { replace: true });
    }
  };

  const options = [
    {
      key: "business" as const,
      icon: Building2,
      title: "Business",
      description: "Track business income & expenses, invoices, contractors, and file Schedule C.",
    },
    {
      key: "individual" as const,
      icon: User,
      title: "Individual",
      description: "Track personal income, expenses, deductions, and preview your 1040 tax return.",
    },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Welcome to Bookie</h1>
          <p className="text-muted-foreground">How will you be using Bookie?</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {options.map((opt) => {
            const isSelected = selected === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => { setSelected(opt.key); if (opt.key === "business") setShowBookieInput(false); }}
                className={`relative flex flex-col items-center gap-4 p-6 rounded-xl border-2 transition-all text-center cursor-pointer ${
                  isSelected
                    ? "border-primary bg-accent shadow-md"
                    : "border-border bg-card hover:border-muted-foreground/40 hover:shadow-sm"
                }`}
              >
                <div
                  className={`h-14 w-14 rounded-full flex items-center justify-center transition-colors ${
                    isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <opt.icon className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{opt.title}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{opt.description}</p>
                </div>
                {isSelected && (
                  <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                    <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Bookie ID link option */}
        {selected === "individual" && (
          <div className="space-y-3">
            {!showBookieInput ? (
              <button
                onClick={() => setShowBookieInput(true)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mx-auto"
              >
                <Link2 className="h-4 w-4" />
                Have a Bookie ID? Link to a business
              </button>
            ) : (
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Link2 className="h-4 w-4 text-primary" />
                  Link to a Business
                </div>
                <Input
                  placeholder="Enter Bookie ID (e.g. BK-A3X9)"
                  value={bookieCode}
                  onChange={(e) => setBookieCode(e.target.value.toUpperCase())}
                  maxLength={7}
                  className="font-mono tracking-wider"
                />
                <p className="text-xs text-muted-foreground">
                  Ask your employer or team admin for their Bookie ID
                </p>
                <button
                  onClick={() => { setShowBookieInput(false); setBookieCode(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-center">
          <Button
            size="lg"
            disabled={!selected || saving}
            onClick={handleContinue}
            className="min-w-[200px]"
          >
            {saving ? "Saving…" : "Continue"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
