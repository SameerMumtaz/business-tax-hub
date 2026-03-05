import { useMemo } from "react";
import { useJobs } from "@/hooks/useJobs";
import { MapPin, Calendar } from "lucide-react";
import { Link } from "react-router-dom";

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-chart-info",
  in_progress: "bg-chart-warning",
  completed: "bg-chart-positive",
  cancelled: "bg-chart-negative",
};

export default function ThisWeekJobs() {
  const { jobs, sites } = useJobs();

  const weekDays = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, []);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const todayStr = fmt(new Date());

  const siteMap = useMemo(() => {
    const m = new Map<string, string>();
    sites.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [sites]);

  const jobsByDate = useMemo(() => {
    const m = new Map<string, typeof jobs>();
    weekDays.forEach((d) => m.set(fmt(d), []));
    jobs.forEach((j) => {
      const key = j.start_date?.slice(0, 10);
      if (m.has(key)) m.get(key)!.push(j);
    });
    return m;
  }, [jobs, weekDays]);

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          This Week's Jobs
        </h2>
        <Link to="/jobs" className="text-xs text-primary hover:underline">
          View all
        </Link>
      </div>

      {/* Day strip */}
      <div className="grid grid-cols-7 gap-1 mb-4">
        {weekDays.map((d, i) => {
          const key = fmt(d);
          const isToday = key === todayStr;
          const dayJobs = jobsByDate.get(key) || [];
          return (
            <div
              key={key}
              className={`text-center rounded-lg py-2 px-1 transition-colors ${
                isToday ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/40"
              }`}
            >
              <span className="text-[10px] font-medium text-muted-foreground uppercase">
                {dayLabels[i]}
              </span>
              <p className={`text-sm font-semibold ${isToday ? "text-primary" : "text-foreground"}`}>
                {d.getDate()}
              </p>
              <div className="flex justify-center gap-0.5 mt-1 min-h-[8px]">
                {dayJobs.slice(0, 4).map((j) => (
                  <div
                    key={j.id}
                    className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[j.status] || "bg-muted-foreground"}`}
                    title={`${j.title} (${j.status})`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Job list for today/upcoming */}
      <div className="space-y-2">
        {weekDays.map((d) => {
          const key = fmt(d);
          const dayJobs = jobsByDate.get(key) || [];
          if (dayJobs.length === 0) return null;
          const isPast = key < todayStr;
          return dayJobs.map((j) => (
            <div
              key={j.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                isPast ? "opacity-50" : ""
              }`}
            >
              <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[j.status] || "bg-muted-foreground"}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{j.title}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {siteMap.get(j.site_id) || "—"}
                </p>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(key).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </span>
            </div>
          ));
        })}
        {Array.from(jobsByDate.values()).every((v) => v.length === 0) && (
          <p className="text-sm text-muted-foreground text-center py-4">No jobs scheduled this week</p>
        )}
      </div>
    </div>
  );
}
