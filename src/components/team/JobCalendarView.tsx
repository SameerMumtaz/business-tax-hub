import { useState } from "react";
import { type Job, type JobSite } from "@/hooks/useJobs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  jobs: Job[];
  sites: JobSite[];
  onJobClick?: (job: Job) => void;
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatTime12(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-500/15 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800",
  in_progress: "bg-amber-500/15 text-amber-700 border-amber-200 dark:text-amber-400 dark:border-amber-800",
  completed: "bg-emerald-500/15 text-emerald-700 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export default function JobCalendarView({ jobs, sites, onJobClick }: Props) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const siteMap = new Map(sites.map((s) => [s.id, s]));

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const goToday = () => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Build a map of date -> jobs
  const jobsByDate = new Map<string, Job[]>();
  for (const job of jobs) {
    if (job.status === "cancelled") continue;
    const start = parseLocalDate(job.start_date);
    const end = job.end_date ? parseLocalDate(job.end_date) : start;
    const cursor = new Date(start);
    while (cursor <= end) {
      if (cursor.getMonth() === month && cursor.getFullYear() === year) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        if (!jobsByDate.has(key)) jobsByDate.set(key, []);
        jobsByDate.get(key)!.push(job);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const monthLabel = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Build calendar grid cells
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <h3 className="text-base font-semibold ml-2">{monthLabel}</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={goToday}>Today</Button>
        </div>

        <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground mb-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 border-t border-l">
          {cells.map((day, i) => {
            if (day === null) {
              return <div key={`empty-${i}`} className="border-r border-b min-h-[90px] bg-muted/30" />;
            }
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayJobs = jobsByDate.get(dateStr) || [];
            const isToday = dateStr === todayStr;

            return (
              <div
                key={dateStr}
                className={cn(
                  "border-r border-b min-h-[90px] p-1 transition-colors",
                  isToday && "bg-primary/5"
                )}
              >
                <div className={cn(
                  "text-xs font-medium mb-0.5 w-6 h-6 flex items-center justify-center rounded-full",
                  isToday && "bg-primary text-primary-foreground"
                )}>
                  {day}
                </div>
                <div className="space-y-0.5 overflow-y-auto max-h-[72px]">
                  {dayJobs.map((job) => {
                    const site = siteMap.get(job.site_id);
                    return (
                      <button
                        key={`${job.id}-${dateStr}`}
                        onClick={() => onJobClick?.(job)}
                        className={cn(
                          "w-full text-left rounded px-1.5 py-0.5 text-[10px] leading-tight border truncate transition-opacity hover:opacity-80",
                          STATUS_COLORS[job.status] || STATUS_COLORS.scheduled
                        )}
                        title={`${job.title}${site ? ` @ ${site.name}` : ""}${job.start_time ? ` ${formatTime12(job.start_time)}` : ""}${job.estimated_hours ? ` (${job.estimated_hours}h)` : ""}`}
                      >
                        <span className="font-medium">{job.title}</span>
                        {job.start_time && (
                          <span className="ml-1 opacity-70">{formatTime12(job.start_time)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-3 text-[10px]">
          {[
            { status: "scheduled", label: "Scheduled" },
            { status: "in_progress", label: "In Progress" },
            { status: "completed", label: "Completed" },
          ].map(({ status, label }) => (
            <div key={status} className="flex items-center gap-1">
              <div className={cn("w-3 h-3 rounded border", STATUS_COLORS[status])} />
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
