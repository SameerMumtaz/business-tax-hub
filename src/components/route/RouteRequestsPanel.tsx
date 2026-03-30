import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navigation, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import RouteOptimizationDialog from "./RouteOptimizationDialog";
import type { OptimizedRoute } from "@/hooks/useRouteOptimization";
import { toast } from "sonner";

interface RouteRequest {
  id: string;
  crew_member_id: string;
  business_user_id: string;
  request_date: string;
  original_order: any[];
  optimized_order: any[];
  total_original_minutes: number;
  total_optimized_minutes: number;
  estimated_savings_minutes: number;
  status: string;
  created_at: string;
  crew_name?: string;
}

interface Props {
  onScheduleUpdate?: () => void;
}

export default function RouteRequestsPanel({ onScheduleUpdate }: Props) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<RouteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RouteRequest | null>(null);
  const [processing, setProcessing] = useState(false);

  const fetchRequests = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("route_optimization_requests")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false }) as any;

    if (data) {
      // Fetch crew member names
      const memberIds = [...new Set(data.map((r: any) => r.crew_member_id))] as string[];
      const { data: members } = await supabase
        .from("team_members")
        .select("id, name")
        .in("id", memberIds);

      const nameMap = new Map((members || []).map((m: any) => [m.id, m.name]));
      setRequests(
        data.map((r: any) => ({
          ...r,
          crew_name: nameMap.get(r.crew_member_id) || "Unknown",
        })),
      );
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchRequests();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("route-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "route_optimization_requests" }, () => {
        fetchRequests();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchRequests]);

  const handleReview = (req: RouteRequest) => {
    setSelectedRequest(req);
    setReviewOpen(true);
  };

  const handleApprove = async () => {
    if (!selectedRequest || !user) return;
    setProcessing(true);

    try {
      // Update request status
      await supabase
        .from("route_optimization_requests")
        .update({
          status: "approved",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", selectedRequest.id);

      // Apply schedule changes — update job start_times
      for (const item of selectedRequest.optimized_order) {
        await supabase
          .from("jobs")
          .update({
            start_time: item.suggestedTime,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.jobId);
      }

      // Notify crew member
      const { data: member } = await supabase
        .from("team_members")
        .select("member_user_id")
        .eq("id", selectedRequest.crew_member_id)
        .single();

      if (member?.member_user_id) {
        await supabase.from("notifications").insert({
          user_id: member.member_user_id,
          title: "Route Approved ✓",
          message: `Your optimized route for ${selectedRequest.request_date} has been approved. Schedule updated with new times.`,
          type: "info",
        } as any);
      }

      toast.success("Route approved — schedule updated!");
      setReviewOpen(false);
      setSelectedRequest(null);
      fetchRequests();
      onScheduleUpdate?.();
    } catch (err) {
      toast.error("Failed to approve route");
    }
    setProcessing(false);
  };

  const handleReject = async () => {
    if (!selectedRequest || !user) return;
    setProcessing(true);

    await supabase
      .from("route_optimization_requests")
      .update({
        status: "rejected",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", selectedRequest.id);

    // Notify crew member
    const { data: member } = await supabase
      .from("team_members")
      .select("member_user_id")
      .eq("id", selectedRequest.crew_member_id)
      .single();

    if (member?.member_user_id) {
      await supabase.from("notifications").insert({
        user_id: member.member_user_id,
        title: "Route Request Declined",
        message: `Your route optimization request for ${selectedRequest.request_date} was not approved.`,
        type: "warning",
      } as any);
    }

    toast.info("Route request rejected");
    setReviewOpen(false);
    setSelectedRequest(null);
    fetchRequests();
    setProcessing(false);
  };

  const selectedRoute: OptimizedRoute | null = selectedRequest
    ? {
        originalOrder: selectedRequest.original_order,
        optimizedOrder: selectedRequest.optimized_order,
        totalOriginalMinutes: selectedRequest.total_original_minutes,
        totalOptimizedMinutes: selectedRequest.total_optimized_minutes,
        savingsMinutes: selectedRequest.estimated_savings_minutes,
      }
    : null;

  if (loading || requests.length === 0) return null;

  return (
    <>
      <Card className="border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Navigation className="h-4 w-4 text-primary" />
            Route Optimization Requests
            <Badge variant="secondary" className="ml-auto">{requests.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {requests.map((req) => (
            <div
              key={req.id}
              className="flex items-center justify-between p-2 rounded-md border bg-card hover:bg-accent/50 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{req.crew_name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{req.request_date}</span>
                  <span>·</span>
                  <span className="text-primary font-medium">Save {req.estimated_savings_minutes} min</span>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleReview(req)}>
                Review
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <RouteOptimizationDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        route={selectedRoute}
        loading={false}
        onSubmit={async () => {}}
        submitting={processing}
        isManagerView
        onApprove={handleApprove}
        onReject={handleReject}
        crewName={selectedRequest?.crew_name}
      />
    </>
  );
}
