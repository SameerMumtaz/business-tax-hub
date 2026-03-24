import { useMemo } from "react";
import { useJobs } from "@/hooks/useJobs";
import { useCrewCheckins } from "@/hooks/useCrewCheckins";
import { MapPin, Calendar, Clock, AlertTriangle, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTodayDateOnlyKey, getJobDateKeysInRange } from "@/lib/dateOnly";

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-chart-info",
  in_progress: "bg-chart-warning",
  completed: "bg-chart-positive",
  cancelled: "bg-chart-negative",
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function TodayJobs() {
  const { jobs, sites } = useJobs();
  const { checkins } = useCrewCheckins();

  const todayStr = useMemo(() => getTodayDateOnlyKey(), []);
  const currentMinutes = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, []);

  const siteMap = useMemo(() => {
    const m = new Map<string, string>();
    sites.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [sites]);

  // Build a set of job IDs that have active check-ins today
  const activeJobIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of checkins) {
      if (!c.job_id) continue;
      const checkinDate = c.occurrence_date || new Date(c.check_in_time).toISOString().split("T")[0];
      if (checkinDate === todayStr && !c.check_out_time) {
        set.add(c.job_id);
      }
    }
    return set;
  }, [checkins, todayStr]);

  const completedJobIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of checkins) {
      if (!c.job_id) continue;
      const checkinDate = c.occurrence_date || new Date(c.check_in_time).toISOString().split("T")[0];
      if (checkinDate === todayStr && c.check_out_time) {
        set.add(c.job_id);
      }
    }
    return set;
  }, [checkins, todayStr]);

  const todayJobs = useMemo(
    () =>
      jobs
        .filter((j) => {
          if (j.status === "cancelled") return false;
          const start = j.start_date?.slice(0, 10);
          if (!start) return false;

          if (j.job_type === "recurring" && j.recurring_interval) {
            const instances = getJobDateKeysInRange(j as any, todayStr, todayStr);
            return instances.includes(todayStr);
          }

          const end = j.end_date?.slice(0, 10);
          if (end) return start <= todayStr && end >= todayStr;
          return start === todayStr;
        })
        .sort((a, b) => {
          const statusA = activeJobIds.has(a.id) ? "in_progress" : completedJobIds.has(a.id) ? "completed" : a.status;
          const statusB = activeJobIds.has(b.id) ? "in_progress" : completedJobIds.has(b.id) ? "completed" : b.status;
          const isCompA = statusA === "completed" ? 1 : 0;
          const isCompB = statusB === "completed" ? 1 : 0;
          if (isCompA !== isCompB) return isCompA - isCompB;
          // Among non-completed: in_progress first, then nearest start time
          if (!isCompA) {
            const isActiveA = statusA === "in_progress" ? 0 : 1;
            const isActiveB = statusB === "in_progress" ? 0 : 1;
            if (isActiveA !== isActiveB) return isActiveA - isActiveB;
          }
          return (a.start_time || "00:00").localeCompare(b.start_time || "00:00");
        }),
    [jobs, todayStr]
  );

  const getEffectiveStatus = (job: typeof todayJobs[0]): string => {
    // For recurring jobs, DB status stays "scheduled" — derive from checkins
    if (activeJobIds.has(job.id)) return "in_progress";
    if (completedJobIds.has(job.id) && !activeJobIds.has(job.id)) return "completed";
    return job.status;
  };

  const isPastDue = (job: typeof todayJobs[0]) => {
    const effectiveStatus = getEffectiveStatus(job);
    if (effectiveStatus !== "scheduled") return false;
    if (!job.start_time) return false;
    const [h, m] = job.start_time.split(":").map(Number);
    return currentMinutes > h * 60 + (m || 0);
  };

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          Today's Progress
        </h2>
        <span className="text-xs text-muted-foreground">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
        </span>
      </div>

      <div className="space-y-2">
        {todayJobs.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">No jobs scheduled today</p>
        )}
        {todayJobs.map((j) => {
          const effectiveStatus = getEffectiveStatus(j);
          const pastDue = isPastDue(j);
          const isInProgress = effectiveStatus === "in_progress";
          const isCompleted = effectiveStatus === "completed";
          return (
            <div
              key={j.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                pastDue && "border-destructive/40 bg-destructive/5",
                isInProgress && "border-blue-400/40 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-500/30",
                isCompleted && "border-emerald-400/40 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-500/30",
              )}
            >
              <div className={cn(
                "w-2 h-2 rounded-full shrink-0",
                pastDue ? "bg-destructive animate-pulse" :
                isInProgress ? "bg-blue-500 animate-pulse" :
                isCompleted ? "bg-emerald-500" :
                (STATUS_COLORS[effectiveStatus] || "bg-muted-foreground")
              )} />
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "font-medium truncate",
                  pastDue && "text-destructive",
                  isInProgress && "text-blue-700 dark:text-blue-400",
                )}>
                  {j.title}
                  {pastDue && (
                    <AlertTriangle className="h-3 w-3 inline ml-1.5 -mt-0.5 text-destructive" />
                  )}
                  {isInProgress && (
                    <Play className="h-3 w-3 inline ml-1.5 -mt-0.5 text-blue-500" />
                  )}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {siteMap.get(j.site_id) || "—"}
                </p>
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                {j.start_time && (
                  <p className={cn(
                    "text-xs flex items-center gap-1 justify-end",
                    pastDue ? "text-destructive font-medium" :
                    isInProgress ? "text-blue-600 dark:text-blue-400 font-medium" :
                    "text-muted-foreground"
                  )}>
                    <Clock className="h-3 w-3" />
                    {j.start_time}
                  </p>
                )}
                <span className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                  pastDue
                    ? "bg-destructive/15 text-destructive"
                    : isInProgress
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    : isCompleted
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : `${STATUS_COLORS[effectiveStatus]}/20 ${STATUS_COLORS[effectiveStatus]?.replace("bg-", "text-") || "text-muted-foreground"}`
                )}>
                  {pastDue ? "Past Due" : (STATUS_LABELS[effectiveStatus] || effectiveStatus)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
