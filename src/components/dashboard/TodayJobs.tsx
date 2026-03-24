import { useMemo } from "react";
import { useJobs } from "@/hooks/useJobs";
import { MapPin, Calendar, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

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

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentMinutes = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, []);

  const siteMap = useMemo(() => {
    const m = new Map<string, string>();
    sites.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [sites]);

  const todayJobs = useMemo(
    () =>
      jobs
        .filter((j) => {
          const start = j.start_date?.slice(0, 10);
          const end = j.end_date?.slice(0, 10);
          if (!start) return false;
          if (end) return start <= todayStr && end >= todayStr;
          return start === todayStr;
        })
        .sort((a, b) => (a.start_time || "00:00").localeCompare(b.start_time || "00:00")),
    [jobs, todayStr]
  );

  const isPastDue = (job: typeof todayJobs[0]) => {
    if (job.status !== "scheduled") return false;
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
          const pastDue = isPastDue(j);
          return (
            <div
              key={j.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                pastDue && "border-destructive/40 bg-destructive/5"
              )}
            >
              <div className={cn(
                "w-2 h-2 rounded-full shrink-0",
                pastDue ? "bg-destructive animate-pulse" : (STATUS_COLORS[j.status] || "bg-muted-foreground")
              )} />
              <div className="flex-1 min-w-0">
                <p className={cn("font-medium truncate", pastDue && "text-destructive")}>
                  {j.title}
                  {pastDue && (
                    <AlertTriangle className="h-3 w-3 inline ml-1.5 -mt-0.5 text-destructive" />
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
                    pastDue ? "text-destructive font-medium" : "text-muted-foreground"
                  )}>
                    <Clock className="h-3 w-3" />
                    {j.start_time}
                  </p>
                )}
                <span className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                  pastDue
                    ? "bg-destructive/15 text-destructive"
                    : `${STATUS_COLORS[j.status]}/20 ${STATUS_COLORS[j.status].replace("bg-", "text-")}`
                )}>
                  {pastDue ? "Past Due" : (STATUS_LABELS[j.status] || j.status)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
