import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTeamRole } from "@/hooks/useTeamRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

interface DeletionRequest {
  id: string;
  requester_user_id: string;
  team_member_id: string;
  business_user_id: string;
  status: string;
  reason: string | null;
  created_at: string;
  member_name?: string;
  member_role?: string;
}

export default function DeletionRequestsPanel() {
  const { user } = useAuth();
  const { role, businessUserId } = useTeamRole();
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchRequests = async () => {
    if (!user || !businessUserId) return;
    const { data } = await supabase
      .from("deletion_requests" as any)
      .select("*")
      .eq("business_user_id", businessUserId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (!data?.length) {
      setRequests([]);
      return;
    }

    // Fetch member names
    const memberIds = (data as any[]).map((d: any) => d.team_member_id);
    const { data: members } = await supabase
      .from("team_members")
      .select("id, name, role")
      .in("id", memberIds);

    const nameMap = new Map((members || []).map((m: any) => [m.id, { name: m.name, role: m.role }]));

    setRequests(
      (data as any[]).map((d: any) => ({
        ...d,
        member_name: nameMap.get(d.team_member_id)?.name || "Unknown",
        member_role: nameMap.get(d.team_member_id)?.role || "crew",
      }))
    );
  };

  useEffect(() => {
    fetchRequests();
  }, [user, businessUserId]);

  const handleAction = async (requestId: string, action: "approve_deletion" | "reject_deletion") => {
    setProcessing(requestId);
    try {
      const res = await supabase.functions.invoke("delete-account", {
        body: { action, deletion_request_id: requestId },
      });
      const data = res.data as any;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      toast.success(data.message || (action === "approve_deletion" ? "Member removed" : "Request rejected"));
      fetchRequests();
    } catch (err: any) {
      toast.error(err.message || "Failed to process request");
    } finally {
      setProcessing(null);
    }
  };

  // Only show for admins (business owners) and managers
  if (!role || role === "crew" || requests.length === 0) return null;

  return (
    <Card className="border-destructive/20 bg-destructive/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {requests.length} Deletion Request{requests.length > 1 ? "s" : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {requests.map((r) => (
          <div key={r.id} className="flex items-center justify-between bg-background rounded-md px-3 py-2">
            <div>
              <span className="font-medium text-sm">{r.member_name}</span>
              <Badge variant="outline" className="ml-2 text-xs">{r.member_role}</Badge>
              {r.reason && (
                <p className="text-xs text-muted-foreground mt-0.5">"{r.reason}"</p>
              )}
              <p className="text-xs text-muted-foreground">
                Requested {new Date(r.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                className="h-7 gap-1"
                onClick={() => handleAction(r.id, "approve_deletion")}
                disabled={processing === r.id}
              >
                <CheckCircle className="h-3.5 w-3.5" /> Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1"
                onClick={() => handleAction(r.id, "reject_deletion")}
                disabled={processing === r.id}
              >
                <XCircle className="h-3.5 w-3.5" /> Reject
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
