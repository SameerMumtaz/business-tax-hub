import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapPin, Clock, LogIn, AlertTriangle, DollarSign, Navigation, CalendarOff, Camera } from "lucide-react";
import JobPhotosPanel from "@/components/job/JobPhotosPanel";
import { formatDateOnly, getNextInstanceDate, isRecurringJobToday } from "@/lib/dateOnly";
export interface AssignedJob {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
  job_type?: string;
  recurring_interval?: string | null;
  recurring_end_date?: string | null;
  site: {
    id: string;
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    geofence_radius: number | null;
  };
  expectedHours: number | null;
  expectedPay: number | null;
}

interface Props {
  jobs: AssignedJob[];
  activeCheckin: any;
  gpsLoading: string | null;
  onCheckIn: (job: AssignedJob) => void;
}

export default function CrewJobsList({ jobs, activeCheckin, gpsLoading, onCheckIn }: Props) {
  const [photosJobId, setPhotosJobId] = useState<string | null>(null);
  if (jobs.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12 space-y-2">
          <MapPin className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <p className="text-muted-foreground">No jobs assigned</p>
        </CardContent>
      </Card>
    );
  }

  const getDirectionsUrl = (lat: number | null, lng: number | null, address: string | null) => {
    if (lat != null && lng != null) {
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    }
    if (address) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
    }
    return null;
  };

  return (
    <div className="space-y-3">
      {jobs.map((job) => {
        const directionsUrl = getDirectionsUrl(job.site.latitude, job.site.longitude, job.site.address);
        const todayJob = isRecurringJobToday(job);
        const displayDate = getNextInstanceDate(job);
        return (
          <Card key={job.id}>
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h3 className="font-semibold">{job.title}</h3>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {job.site.name}
                    {job.site.address && ` — ${job.site.address}`}
                  </div>
                </div>
                <Badge variant={job.status === "completed" ? "default" : "secondary"} className={job.status === "completed" ? "bg-emerald-600 text-white" : ""}>{job.status}</Badge>
              </div>

              <div className="flex flex-wrap gap-3 text-sm">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{formatDateOnly(displayDate)}{job.job_type === "recurring" && job.recurring_interval ? ` (${job.recurring_interval})` : ""}</span>
                </div>
                {job.expectedHours != null && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{job.expectedHours}h expected</span>
                  </div>
                )}
                {job.expectedPay != null && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <DollarSign className="h-3.5 w-3.5" />
                    <span>${job.expectedPay.toFixed(2)} est. pay</span>
                  </div>
                )}
              </div>

              {!job.site.latitude && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted px-3 py-2 rounded-md">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  No GPS coordinates — geofencing disabled
                </div>
              )}

              <div className="flex gap-2">
                {!activeCheckin && todayJob && (
                  <Button
                    className="flex-1"
                    onClick={() => onCheckIn(job)}
                    disabled={gpsLoading === job.id}
                  >
                    <LogIn className="h-4 w-4 mr-2" />
                    {gpsLoading === job.id ? "Getting location…" : "Check In"}
                  </Button>
                )}
                {!activeCheckin && !todayJob && (
                  <div className="flex-1 flex items-center gap-2 text-xs text-muted-foreground bg-muted px-3 py-2 rounded-md">
                    <CalendarOff className="h-3.5 w-3.5" />
                    Check-in available on {formatDateOnly(displayDate)}
                  </div>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPhotosJobId(job.id)}
                  title="Photos"
                >
                  <Camera className="h-4 w-4" />
                </Button>
                {directionsUrl && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => window.open(directionsUrl, "_blank", "noopener,noreferrer")}
                  >
                    <Navigation className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Photos Dialog */}
      <Dialog open={!!photosJobId} onOpenChange={(open) => { if (!open) setPhotosJobId(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Job Photos</DialogTitle>
          </DialogHeader>
          {photosJobId && <JobPhotosPanel jobId={photosJobId} occurrenceDate={jobs.find((job) => job.id === photosJobId) ? getNextInstanceDate(jobs.find((job) => job.id === photosJobId)!) : null} compact />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
