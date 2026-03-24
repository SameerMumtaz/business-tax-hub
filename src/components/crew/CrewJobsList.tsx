import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, Navigation, Clock, LogIn, AlertTriangle, DollarSign, CalendarOff, CheckCircle, MapPin, CalendarDays, Timer } from "lucide-react";
import JobPhotosPanel from "@/components/job/JobPhotosPanel";
import { formatDateOnly, getNextInstanceDate, isRecurringJobToday, getTodayDateOnlyKey, compareDateOnly, addDaysToDateOnly, parseDateOnlyLocal } from "@/lib/dateOnly";

export interface AssignedJob {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
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

function getRelativeDayLabel(dateStr: string): string {
  const today = getTodayDateOnlyKey();
  const tomorrow = addDaysToDateOnly(today, 1);
  if (dateStr === today) return "Today";
  if (dateStr === tomorrow) return "Tomorrow";
  const d = parseDateOnlyLocal(dateStr);
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return dayNames[d.getDay()];
}

function getDirectionsUrl(lat: number | null, lng: number | null, address: string | null) {
  if (lat != null && lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  if (address) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  return null;
}

function JobCard({ job, activeCheckin, gpsLoading, onCheckIn, onPhotos, variant }: {
  job: AssignedJob;
  activeCheckin: any;
  gpsLoading: string | null;
  onCheckIn: (job: AssignedJob) => void;
  onPhotos: (id: string) => void;
  variant: "today" | "week" | "upcoming";
}) {
  const directionsUrl = getDirectionsUrl(job.site.latitude, job.site.longitude, job.site.address);
  const todayJob = isRecurringJobToday(job);
  const displayDate = getNextInstanceDate(job);
  const borderColor = variant === "today"
    ? "border-l-4 border-l-primary"
    : variant === "week"
      ? "border-l-4 border-l-chart-info"
      : "border-l-4 border-l-muted-foreground/30";

  return (
    <Card className={`${borderColor} overflow-hidden`}>
      <CardContent className="pt-4 pb-3 px-4 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm truncate">{job.title}</h3>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{job.site.name}</span>
            </div>
          </div>
          <Badge
            variant={job.status === "completed" ? "default" : "secondary"}
            className={`text-[10px] shrink-0 ${job.status === "completed" ? "bg-primary text-primary-foreground" : ""}`}
          >
            {job.status}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{getRelativeDayLabel(displayDate)}</span>
          <span>{formatDateOnly(displayDate)}</span>
          {job.job_type === "recurring" && job.recurring_interval && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{job.recurring_interval}</Badge>
          )}
          {job.expectedHours != null && <span>{job.expectedHours}h</span>}
          {job.expectedPay != null && <span>${job.expectedPay.toFixed(0)}</span>}
        </div>

        {!job.site.latitude && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted px-2.5 py-1.5 rounded-md">
            <AlertTriangle className="h-3 w-3" />
            No GPS — geofencing disabled
          </div>
        )}

        <div className="flex gap-2">
          {job.status === "completed" && job.job_type !== "recurring" ? (
            <div className="flex-1 flex items-center gap-1.5 text-xs text-primary bg-accent px-3 py-2 rounded-md">
              <CheckCircle className="h-3.5 w-3.5" />
              Completed
            </div>
          ) : variant === "today" && !activeCheckin && todayJob ? (
            <Button className="flex-1 h-9" onClick={() => onCheckIn(job)} disabled={gpsLoading === job.id}>
              <LogIn className="h-4 w-4 mr-1.5" />
              {gpsLoading === job.id ? "Getting location…" : "Check In"}
            </Button>
          ) : variant !== "today" ? (
            <div className="flex-1 flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-3 py-2 rounded-md">
              <CalendarOff className="h-3.5 w-3.5" />
              {getRelativeDayLabel(displayDate)}, {formatDateOnly(displayDate)}
            </div>
          ) : !activeCheckin && !todayJob ? (
            <div className="flex-1 flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-3 py-2 rounded-md">
              <CalendarOff className="h-3.5 w-3.5" />
              Check-in on {formatDateOnly(displayDate)}
            </div>
          ) : null}

          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => onPhotos(job.id)} title="Photos">
            <Camera className="h-4 w-4" />
          </Button>
          {directionsUrl && (
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => window.open(directionsUrl, "_blank", "noopener,noreferrer")}>
              <Navigation className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CrewJobsList({ jobs, activeCheckin, gpsLoading, onCheckIn }: Props) {
  const [photosJobId, setPhotosJobId] = useState<string | null>(null);

  const { todayJobs, thisWeekJobs, upcomingJobs } = useMemo(() => {
    const today = getTodayDateOnlyKey();
    const dayOfWeek = parseDateOnlyLocal(today).getDay(); // 0=Sun
    const weekEnd = addDaysToDateOnly(today, 6 - dayOfWeek); // end of week (Sat)

    const todayArr: AssignedJob[] = [];
    const weekArr: AssignedJob[] = [];
    const upcomingArr: AssignedJob[] = [];

    for (const job of jobs) {
      const instanceDate = getNextInstanceDate(job);

      // Skip past non-recurring jobs
      if (job.job_type !== "recurring" && !job.recurring_interval && job.status !== "completed") {
        const end = job.end_date ?? job.start_date;
        if (compareDateOnly(end, today) < 0) continue;
      }

      if (instanceDate === today) {
        todayArr.push(job);
      } else if (compareDateOnly(instanceDate, today) > 0 && compareDateOnly(instanceDate, weekEnd) <= 0) {
        weekArr.push(job);
      } else if (compareDateOnly(instanceDate, weekEnd) > 0) {
        upcomingArr.push(job);
      }
      // Past completed jobs are silently omitted from list (visible in calendar)
    }

    // Sort each group by instance date
    const sortFn = (a: AssignedJob, b: AssignedJob) => compareDateOnly(getNextInstanceDate(a), getNextInstanceDate(b));
    weekArr.sort(sortFn);
    upcomingArr.sort(sortFn);

    return { todayJobs: todayArr, thisWeekJobs: weekArr, upcomingJobs: upcomingArr.slice(0, 3) };
  }, [jobs]);

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

  const hasNoVisibleJobs = todayJobs.length === 0 && thisWeekJobs.length === 0 && upcomingJobs.length === 0;

  return (
    <div className="space-y-5">
      {/* Today */}
      {todayJobs.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Today — {todayJobs.length} job{todayJobs.length !== 1 ? "s" : ""}
          </h2>
          {todayJobs.map((job) => (
            <JobCard key={job.id} job={job} activeCheckin={activeCheckin} gpsLoading={gpsLoading} onCheckIn={onCheckIn} onPhotos={setPhotosJobId} variant="today" />
          ))}
        </section>
      )}

      {/* This Week */}
      {thisWeekJobs.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">This Week</h2>
          {thisWeekJobs.map((job) => (
            <JobCard key={job.id} job={job} activeCheckin={activeCheckin} gpsLoading={gpsLoading} onCheckIn={onCheckIn} onPhotos={setPhotosJobId} variant="week" />
          ))}
        </section>
      )}

      {/* Upcoming */}
      {upcomingJobs.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Upcoming</h2>
          {upcomingJobs.map((job) => (
            <JobCard key={job.id} job={job} activeCheckin={activeCheckin} gpsLoading={gpsLoading} onCheckIn={onCheckIn} onPhotos={setPhotosJobId} variant="upcoming" />
          ))}
          <p className="text-xs text-muted-foreground text-center pt-1">
            <CalendarDays className="h-3 w-3 inline mr-1" />
            View all jobs in Calendar tab
          </p>
        </section>
      )}

      {hasNoVisibleJobs && (
        <Card>
          <CardContent className="text-center py-10 space-y-2">
            <CheckCircle className="h-10 w-10 mx-auto text-primary/50" />
            <p className="text-sm text-muted-foreground">All caught up! No upcoming jobs this week.</p>
            <p className="text-xs text-muted-foreground">Check the Calendar tab for future jobs.</p>
          </CardContent>
        </Card>
      )}

      {/* Photos Dialog */}
      <Dialog open={!!photosJobId} onOpenChange={(open) => { if (!open) setPhotosJobId(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Job Photos</DialogTitle>
          </DialogHeader>
          {photosJobId && <JobPhotosPanel jobId={photosJobId} occurrenceDate={jobs.find((j) => j.id === photosJobId) ? getNextInstanceDate(jobs.find((j) => j.id === photosJobId)!) : null} compact />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
