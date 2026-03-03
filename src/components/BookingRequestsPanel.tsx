import { useBookingRequests, type BookingRequest } from "@/hooks/useBooking";
import { useJobs } from "@/hooks/useJobs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Clock, Calendar, User, Mail, Phone } from "lucide-react";
import { toast } from "sonner";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pending", variant: "secondary" },
  confirmed: { label: "Confirmed", variant: "default" },
  declined: { label: "Declined", variant: "destructive" },
};

export default function BookingRequestsPanel() {
  const { requests, loading, updateStatus } = useBookingRequests();
  const { sites, createJob } = useJobs();

  const handleConfirm = async (req: BookingRequest) => {
    const success = await updateStatus(req.id, "confirmed");
    if (!success) return;

    // Auto-create a job — use the first site or skip if none
    if (sites.length > 0) {
      await createJob({
        title: `${req.service_name} — ${req.client_name}`,
        description: `Booked: ${req.client_name} (${req.client_email}${req.client_phone ? `, ${req.client_phone}` : ""})${req.notes ? `\nNotes: ${req.notes}` : ""}`,
        site_id: sites[0].id,
        start_date: req.requested_date,
        end_date: null,
        status: "scheduled",
        job_type: "one_time",
        recurring_interval: null,
        recurring_end_date: null,
        invoice_id: null,
      });
      toast.success("Job created in scheduler");
    }
  };

  const handleDecline = async (req: BookingRequest) => {
    await updateStatus(req.id, "declined");
  };

  const pendingCount = requests.filter(r => r.status === "pending").length;

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading booking requests…</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Booking Requests
          {pendingCount > 0 && (
            <Badge variant="destructive" className="text-xs">{pendingCount} pending</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <p className="text-center text-muted-foreground py-6 text-sm">
            No booking requests yet. Share your booking link with clients to start receiving bookings.
          </p>
        ) : (
          <div className="space-y-3">
            {requests.map(req => {
              const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
              return (
                <div key={req.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-sm">{req.service_name}</h3>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {req.requested_date}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {req.requested_time}
                        </span>
                        <span>{req.duration_minutes} min</span>
                        {req.price > 0 && <span className="font-mono">${req.price}</span>}
                      </div>
                    </div>
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                  </div>

                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><User className="h-3 w-3" />{req.client_name}</span>
                    <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{req.client_email}</span>
                    {req.client_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{req.client_phone}</span>}
                  </div>

                  {req.notes && (
                    <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">{req.notes}</p>
                  )}

                  {req.status === "pending" && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={() => handleConfirm(req)}>
                        <CheckCircle2 className="h-3 w-3" /> Confirm
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleDecline(req)}>
                        <XCircle className="h-3 w-3" /> Decline
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
