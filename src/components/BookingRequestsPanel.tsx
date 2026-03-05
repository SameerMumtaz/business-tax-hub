import { useState } from "react";
import { useBookingRequests, type BookingRequest } from "@/hooks/useBooking";
import { useJobs } from "@/hooks/useJobs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Clock, Calendar, User, Mail, Phone, MapPin } from "lucide-react";
import { toast } from "sonner";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pending", variant: "secondary" },
  confirmed: { label: "Confirmed", variant: "default" },
  declined: { label: "Declined", variant: "destructive" },
};

const formatTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
};

export default function BookingRequestsPanel() {
  const { requests, loading, updateStatus } = useBookingRequests();
  const { sites, createJob } = useJobs();
  const [confirmDialog, setConfirmDialog] = useState<BookingRequest | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");

  const handleConfirm = async () => {
    const req = confirmDialog;
    if (!req) return;
    
    const siteId = selectedSiteId || (sites.length > 0 ? sites[0].id : null);
    if (!siteId) {
      toast.error("Please create a job site first before confirming bookings");
      return;
    }

    const success = await updateStatus(req.id, "confirmed");
    if (!success) return;

    const endTimeMinutes = (() => {
      const [h, m] = req.requested_time.split(":").map(Number);
      const total = h * 60 + m + req.duration_minutes;
      return `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
    })();

    await createJob({
      title: `${req.service_name} — ${req.client_name}`,
      description: [
        `📅 Booked Appointment: ${formatTime(req.requested_time)} – ${formatTime(endTimeMinutes)}`,
        `👤 ${req.client_name} (${req.client_email}${req.client_phone ? `, ${req.client_phone}` : ""})`,
        req.price > 0 ? `💰 $${req.price}` : "",
        req.notes ? `📝 ${req.notes}` : "",
      ].filter(Boolean).join("\n"),
      site_id: siteId,
      start_date: req.requested_date,
      end_date: null,
      start_time: req.requested_time,
      estimated_hours: req.duration_minutes / 60,
      status: "scheduled",
      job_type: "one_time",
      recurring_interval: null,
      recurring_end_date: null,
      invoice_id: null,
      client_id: null,
      price: req.price || 0,
      material_budget: 0,
      labor_budget_type: "amount",
      labor_budget_amount: 0,
      labor_budget_hours: 0,
      labor_budget_rate: 0,
    });
    toast.success("Job created in scheduler");
    setConfirmDialog(null);
    setSelectedSiteId("");
  };

  const handleDecline = async (req: BookingRequest) => {
    await updateStatus(req.id, "declined");
  };

  const pendingCount = requests.filter(r => r.status === "pending").length;

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading booking requests…</div>;
  }

  return (
    <>
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
                            {formatTime(req.requested_time)}
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
                        <Button size="sm" className="h-7 text-xs gap-1" onClick={() => {
                          setConfirmDialog(req);
                          setSelectedSiteId(sites.length > 0 ? sites[0].id : "");
                        }}>
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

      {/* Confirm & Assign Site Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Booking & Assign Job Site</DialogTitle>
          </DialogHeader>
          {confirmDialog && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                <p><span className="text-muted-foreground">Service:</span> {confirmDialog.service_name}</p>
                <p><span className="text-muted-foreground">Client:</span> {confirmDialog.client_name}</p>
                <p><span className="text-muted-foreground">Date:</span> {confirmDialog.requested_date}</p>
                <p><span className="text-muted-foreground">Time:</span> {formatTime(confirmDialog.requested_time)} ({confirmDialog.duration_minutes} min)</p>
                {confirmDialog.price > 0 && (
                  <p><span className="text-muted-foreground">Price:</span> ${confirmDialog.price}</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Job Site
                </label>
                {sites.length > 0 ? (
                  <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a job site" />
                    </SelectTrigger>
                    <SelectContent>
                      {sites.map(site => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name} {site.address ? `— ${site.address}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-destructive">No job sites available. Create one in the Job Scheduler first.</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={!selectedSiteId}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Confirm & Create Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
