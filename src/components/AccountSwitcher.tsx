import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, User, ArrowLeftRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfileGate } from "@/components/ProtectedRoute";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function AccountSwitcher({ current }: { current: "business" | "individual" }) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const { user } = useAuth();
  const { recheckProfile } = useProfileGate();
  const navigate = useNavigate();

  const target = current === "business" ? "individual" : "business";
  const TargetIcon = target === "business" ? Building2 : User;

  const handleSwitch = async () => {
    if (!user) return;
    setSwitching(true);
    await supabase
      .from("profiles")
      .update({ account_type: target } as any)
      .eq("user_id", user.id);
    recheckProfile();
    setSwitching(false);
    setOpen(false);
    navigate(target === "business" ? "/" : "/personal", { replace: true });
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
      >
        <ArrowLeftRight className="h-3.5 w-3.5" />
        Switch to {target === "business" ? "Business" : "Personal"}
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TargetIcon className="h-5 w-5" />
              Switch to {target === "business" ? "Business" : "Personal"} mode?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You'll be redirected to the {target === "business" ? "business dashboard" : "personal tax filing"} view. Your data in both modes is preserved — you can switch back anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSwitch} disabled={switching}>
              {switching ? "Switching…" : "Switch"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
