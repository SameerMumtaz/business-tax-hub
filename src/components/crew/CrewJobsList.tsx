import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, LogIn, AlertTriangle, DollarSign, Navigation, CalendarOff } from "lucide-react";

export interface AssignedJob {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
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

  const isJobToday = (job: AssignedJob) => {
    const now = Date.now();
    const startMs = new Date(job.start_date).setHours(0,0,0,0);
    const endMs = job.end_date ? new Date(job.end_date).setHours(23,59,59,999) : new Date(job.start_date).setHours(23,59,59,999);
    return now >= startMs && now <= endMs;
  };

  return (
    <div className="space-y-3">
      {jobs.map((job) => {
        const directionsUrl = getDirectionsUrl(job.site.latitude, job.site.longitude, job.site.address);
        const todayJob = isJobToday(job);
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
                <Badge variant="secondary">{job.status}</Badge>
              </div>

              <div className="flex flex-wrap gap-3 text-sm">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{new Date(job.start_date).toLocaleDateString()}</span>
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
                    Check-in available on {new Date(job.start_date).toLocaleDateString()}
                  </div>
                )}
                {directionsUrl && (
                  <Button variant="outline" size="icon" asChild>
                    <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
                      <Navigation className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
