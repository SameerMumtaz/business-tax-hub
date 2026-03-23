import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTeamRole } from "@/hooks/useTeamRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";

interface Props {
  variant?: "business" | "personal";
}

export default function DeleteAccountSection({ variant = "business" }: Props) {
  const { user } = useAuth();
  const { role, teamMemberId, businessUserId, isTeamMember } = useTeamRole();
  const navigate = useNavigate();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Request deletion state (for sub-accounts)
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestReason, setRequestReason] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [existingRequest, setExistingRequest] = useState<string | null>(null);

  // Check for existing pending request
  useState(() => {
    if (!user || !teamMemberId) return;
    supabase
      .from("deletion_requests" as any)
      .select("id, status")
      .eq("requester_user_id", user.id)
      .eq("team_member_id", teamMemberId)
      .eq("status", "pending")
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) setExistingRequest(data.id);
      });
  });

  const handleSelfDelete = async () => {
    if (!user || confirmText !== "DELETE") return;
    setDeleting(true);
    try {
      const res = await supabase.functions.invoke("delete-account", {
        body: { action: "self_delete" },
      });
      const data = res.data as any;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      toast.success("Account deleted. Goodbye!");
      await supabase.auth.signOut();
      navigate("/auth", { replace: true });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete account");
    } finally {
      setDeleting(false);
    }
  };

  const handleRequestDeletion = async () => {
    if (!user || !teamMemberId || !businessUserId) return;
    setRequesting(true);
    try {
      const { error } = await supabase
        .from("deletion_requests" as any)
        .insert({
          requester_user_id: user.id,
          team_member_id: teamMemberId,
          business_user_id: businessUserId,
          reason: requestReason.trim() || null,
        });
      if (error) throw error;
      toast.success("Deletion request sent to your admin");
      setRequestOpen(false);
      setExistingRequest("sent");
    } catch (err: any) {
      toast.error(err.message || "Failed to send request");
    } finally {
      setRequesting(false);
    }
  };

  // Sub-account (crew or manager linked to a business)
  if (isTeamMember && teamMemberId) {
    return (
      <div className="stat-card space-y-4 border-destructive/20">
        <div className="flex items-center gap-3">
          <Trash2 className="h-5 w-5 text-destructive" />
          <h2 className="font-semibold text-destructive">Remove My Account</h2>
        </div>

        {existingRequest ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted rounded-md px-3 py-2">
            <Clock className="h-4 w-4" />
            <span>Your deletion request is pending approval from your {role === "crew" ? "manager or admin" : "admin"}.</span>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              As a {role} member, you can request your account be removed from this business. 
              Your {role === "crew" ? "manager or admin" : "admin"} will need to approve the request.
            </p>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setRequestOpen(true)}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Request Account Removal
            </Button>
          </>
        )}

        <AlertDialog open={requestOpen} onOpenChange={setRequestOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Request Account Removal
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will send a request to your admin to remove you from this business. 
                Your team records, check-ins, and assignments will be deleted upon approval.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <label className="text-sm font-medium">Reason (optional)</label>
                <Textarea
                  placeholder="Why are you leaving?"
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={requesting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRequestDeletion}
                disabled={requesting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {requesting ? "Sending…" : "Send Request"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Business owner or personal account — full self-delete
  return (
    <div className="stat-card space-y-4 border-destructive/20">
      <div className="flex items-center gap-3">
        <Trash2 className="h-5 w-5 text-destructive" />
        <h2 className="font-semibold text-destructive">Delete Account</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Permanently delete your account and all associated data. 
        {variant === "business"
          ? " This includes all invoices, expenses, sales, team members, jobs, vehicles, and tax records."
          : " This includes all expenses, income, deductions, and tax records."}
        {" "}This action cannot be undone.
      </p>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        className="gap-2"
      >
        <Trash2 className="h-4 w-4" />
        Delete My Account
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Account Permanently
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your account, all data, and cannot be reversed. 
              Type <span className="font-mono font-bold">DELETE</span> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder='Type "DELETE" to confirm'
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="font-mono"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSelfDelete}
              disabled={deleting || confirmText !== "DELETE"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete Forever"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
