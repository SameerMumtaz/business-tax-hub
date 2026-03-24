import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, Navigation, Clock, LogIn, AlertTriangle, DollarSign, CalendarOff, CheckCircle, MapPin, CalendarDays, Timer } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
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

function getDirectionsUrl(lat: number | null, lng: number | null, address: string | null) {
  if (lat != null && lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  if (address) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  return null;
}

/** Live countdown to a job's start_time */
function StartsInCountdown({ startTime }: { startTime: string }) {
  const { t } = useLanguage();
  const [label, setLabel] = useState("");
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const [h, m] = startTime.split(":").map(Number);
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
      const diffMs = target.getTime() - now.getTime();
      if (diffMs <= 0) {
        setLabel(t("jobs.startingNow"));
        return;
      }
      const mins = Math.floor(diffMs / 60000);
      if (mins < 60) {
        setLabel(`${t("jobs.startsIn")} ${mins}m`);
      } else {
        const hrs = Math.floor(mins / 60);
        const rm = mins % 60;
        setLabel(`${t("jobs.startsIn")} ${hrs}h ${rm > 0 ? `${rm}m` : ""}`);
      }
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [startTime, t]);

  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-primary font-medium">
      <Timer className="h-3 w-3" />
      {label}
    </span>
  );
}

function JobCard({ job, activeCheckin, gpsLoading, onCheckIn, onPhotos, variant }: {
  job: AssignedJob;
  activeCheckin: any;
  gpsLoading: string | null;
  onCheckIn: (job: AssignedJob) => void;
  onPhotos: (id: string) => void;
  variant: "today" | "week" | "upcoming";
}) {
  const { t } = useLanguage();
  const directionsUrl = getDirectionsUrl(job.site.latitude, job.site.longitude, job.site.address);
  const todayJob = isRecurringJobToday(job);
  const displayDate = getNextInstanceDate(job);

  const dayNames: Record<number, string> = {
    0: t("day.sunday"), 1: t("day.monday"), 2: t("day.tuesday"),
    3: t("day.wednesday"), 4: t("day.thursday"), 5: t("day.friday"), 6: t("day.saturday"),
  };

  const getRelativeDayLabel = (dateStr: string): string => {
    const today = getTodayDateOnlyKey();
    const tomorrow = addDaysToDateOnly(today, 1);
    if (dateStr === today) return t("jobs.today");
    if (dateStr === tomorrow) return t("jobs.tomorrow");
    const d = parseDateOnlyLocal(dateStr);
    return dayNames[d.getDay()] || "";
  };

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
          {job.start_time && <span>{job.start_time.slice(0, 5)}</span>}
          {job.job_type === "recurring" && job.recurring_interval && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{job.recurring_interval}</Badge>
          )}
          {job.expectedHours != null && <span>{job.expectedHours}h</span>}
          {job.expectedPay != null && <span>${job.expectedPay.toFixed(0)}</span>}
          {variant === "today" && job.start_time && job.status !== "completed" && !activeCheckin && (
            <StartsInCountdown startTime={job.start_time} />
          )}
        </div>

        {!job.site.latitude && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted px-2.5 py-1.5 rounded-md">
            <AlertTriangle className="h-3 w-3" />
            {t("jobs.noGps")}
          </div>
        )}

        <div className="flex gap-2">
          {job.status === "completed" && job.job_type !== "recurring" ? (
            <div className="flex-1 flex items-center gap-1.5 text-xs text-primary bg-accent px-3 py-2 rounded-md">
              <CheckCircle className="h-3.5 w-3.5" />
              {t("jobs.completed")}
            </div>
          ) : variant === "today" && !activeCheckin && todayJob ? (
            <Button className="flex-1 h-9" onClick={() => onCheckIn(job)} disabled={gpsLoading === job.id}>
              <LogIn className="h-4 w-4 mr-1.5" />
              {gpsLoading === job.id ? t("checkin.gettingLocation") : t("checkin.checkIn")}
            </Button>
          ) : variant !== "today" ? (
            <div className="flex-1 flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-3 py-2 rounded-md">
              <CalendarOff className="h-3.5 w-3.5" />
              {getRelativeDayLabel(displayDate)}, {formatDateOnly(displayDate)}
            </div>
          ) : !activeCheckin && !todayJob ? (
            <div className="flex-1 flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-3 py-2 rounded-md">
              <CalendarOff className="h-3.5 w-3.5" />
              {t("checkin.onScheduledDate")} {formatDateOnly(displayDate)}
            </div>
          ) : null}

          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => onPhotos(job.id)} title={t("jobs.photos")}>
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
  const { t } = useLanguage();
  const [photosJobId, setPhotosJobId] = useState<string | null>(null);

  const { todayJobs, thisWeekJobs, upcomingJobs } = useMemo(() => {
    const today = getTodayDateOnlyKey();
    const dayOfWeek = parseDateOnlyLocal(today).getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekEnd = addDaysToDateOnly(today, 6 - mondayOffset);

    const todayArr: AssignedJob[] = [];
    const weekArr: AssignedJob[] = [];
    const upcomingArr: AssignedJob[] = [];

    for (const job of jobs) {
      const instanceDate = getNextInstanceDate(job);
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
    }

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
          <p className="text-muted-foreground">{t("jobs.noJobs")}</p>
        </CardContent>
      </Card>
    );
  }

  const hasNoVisibleJobs = todayJobs.length === 0 && thisWeekJobs.length === 0 && upcomingJobs.length === 0;

  return (
    <div className="space-y-5">
      {todayJobs.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            {t("jobs.today")} — {todayJobs.length} {todayJobs.length !== 1 ? t("jobs.jobPlural") : t("jobs.job")}
          </h2>
          {todayJobs.map((job) => (
            <JobCard key={job.id} job={job} activeCheckin={activeCheckin} gpsLoading={gpsLoading} onCheckIn={onCheckIn} onPhotos={setPhotosJobId} variant="today" />
          ))}
        </section>
      )}

      {thisWeekJobs.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">{t("jobs.thisWeek")}</h2>
          {thisWeekJobs.map((job) => (
            <JobCard key={job.id} job={job} activeCheckin={activeCheckin} gpsLoading={gpsLoading} onCheckIn={onCheckIn} onPhotos={setPhotosJobId} variant="week" />
          ))}
        </section>
      )}

      {upcomingJobs.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">{t("jobs.upcoming")}</h2>
          {upcomingJobs.map((job) => (
            <JobCard key={job.id} job={job} activeCheckin={activeCheckin} gpsLoading={gpsLoading} onCheckIn={onCheckIn} onPhotos={setPhotosJobId} variant="upcoming" />
          ))}
          <p className="text-xs text-muted-foreground text-center pt-1">
            <CalendarDays className="h-3 w-3 inline mr-1" />
            {t("jobs.viewCalendar")}
          </p>
        </section>
      )}

      {hasNoVisibleJobs && (
        <Card>
          <CardContent className="text-center py-10 space-y-2">
            <CheckCircle className="h-10 w-10 mx-auto text-primary/50" />
            <p className="text-sm text-muted-foreground">{t("jobs.allCaughtUp")}</p>
            <p className="text-xs text-muted-foreground">{t("jobs.viewCalendar")}</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!photosJobId} onOpenChange={(open) => { if (!open) setPhotosJobId(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("jobs.photos")}</DialogTitle>
          </DialogHeader>
          {photosJobId && <JobPhotosPanel jobId={photosJobId} occurrenceDate={jobs.find((j) => j.id === photosJobId) ? getNextInstanceDate(jobs.find((j) => j.id === photosJobId)!) : null} compact />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
