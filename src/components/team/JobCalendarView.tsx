import { useState } from "react";
import { type Job, type JobSite } from "@/hooks/useJobs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEffect, useState as useReactState } from "react";

function useIsTablet() {
  const [isTablet, setIsTablet] = useReactState(false);
  useEffect(() => {
    const check = () => setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isTablet;
}

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

function sortJobs(jobs: Job[]): Job[] {
  return jobs.slice().sort((a, b) => {
    if (!a.start_time && !b.start_time) return 0;
    if (!a.start_time) return 1;
    if (!b.start_time) return -1;
    return a.start_time.localeCompare(b.start_time);
  });
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-500/15 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800",
  in_progress: "bg-amber-500/15 text-amber-700 border-amber-200 dark:text-amber-400 dark:border-amber-800",
  completed: "bg-emerald-500/15 text-emerald-700 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const STATUS_DOT: Record<string, string> = {
  scheduled: "bg-blue-500",
  in_progress: "bg-amber-500",
  completed: "bg-emerald-500",
  cancelled: "bg-muted-foreground",
};

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default function JobCalendarView({ jobs, sites, onJobClick }: Props) {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompact = isMobile || isTablet;
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const siteMap = new Map(sites.map((s) => [s.id, s]));

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const goToday = () => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(toDateStr(now.getFullYear(), now.getMonth(), now.getDate()));
  };

  const today = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  // Build date -> jobs map
  const jobsByDate = new Map<string, Job[]>();
  for (const job of jobs) {
    if (job.status === "cancelled") continue;
    const start = parseLocalDate(job.start_date);
    const end = job.end_date ? parseLocalDate(job.end_date) : start;
    const cursor = new Date(start);
    while (cursor <= end) {
      if (cursor.getMonth() === month && cursor.getFullYear() === year) {
        const key = toDateStr(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
        if (!jobsByDate.has(key)) jobsByDate.set(key, []);
        jobsByDate.get(key)!.push(job);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const monthLabel = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const dayHeaders = isMobile
    ? ["S", "M", "T", "W", "T", "F", "S"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const selectedDayJobs = selectedDate ? sortJobs(jobsByDate.get(selectedDate) || []) : [];

  return (
    <Card>
      <CardContent className="pt-4 px-2 sm:px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <h3 className="text-sm sm:text-base font-semibold ml-1 sm:ml-2">{monthLabel}</h3>
          </div>
          <Button variant="ghost" size="sm" className="text-xs sm:text-sm" onClick={goToday}>Today</Button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 text-center text-[10px] sm:text-xs font-medium text-muted-foreground mb-1">
          {dayHeaders.map((d, i) => (
            <div key={i} className="py-1">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 border-t border-l border-border rounded-t-md overflow-hidden">
          {cells.map((day, i) => {
            if (day === null) {
              return <div key={`empty-${i}`} className="border-r border-b border-border min-h-[44px] sm:min-h-[90px] bg-muted/20" />;
            }
            const dateStr = toDateStr(year, month, day);
            const dayJobs = jobsByDate.get(dateStr) || [];
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;

            if (useCompact) {
              // Compact mobile cell: just day number + dot indicators
              const hasJobs = dayJobs.length > 0;
              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={cn(
                    "border-r border-b border-border min-h-[44px] md:min-h-[56px] flex flex-col items-center justify-center gap-0.5 md:gap-1 transition-colors",
                    isSelected && "bg-primary/10",
                    !isSelected && "active:bg-muted/60"
                  )}
                >
                  <span className={cn(
                    "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                    isToday && "bg-primary text-primary-foreground",
                    isSelected && !isToday && "ring-1 ring-primary"
                  )}>
                    {day}
                  </span>
                  {hasJobs && (
                    <div className="flex gap-0.5">
                      {dayJobs.slice(0, 3).map((job, j) => (
                        <div key={j} className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[job.status] || STATUS_DOT.scheduled)} />
                      ))}
                      {dayJobs.length > 3 && (
                        <span className="text-[8px] text-muted-foreground leading-none">+{dayJobs.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            }

            // Desktop cell: full job cards
            const sorted = sortJobs(dayJobs);
            return (
              <div
                key={dateStr}
                className={cn(
                  "border-r border-b border-border min-h-[90px] p-1 transition-colors cursor-pointer hover:bg-muted/30",
                  isToday && "bg-primary/5",
                  isSelected && "ring-1 ring-inset ring-primary"
                )}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
              >
                <div className={cn(
                  "text-xs font-medium mb-0.5 w-6 h-6 flex items-center justify-center rounded-full",
                  isToday && "bg-primary text-primary-foreground"
                )}>
                  {day}
                </div>
                <div className="space-y-0.5 overflow-y-auto max-h-[72px]">
                  {sorted.map((job) => (
                    <button
                      key={`${job.id}-${dateStr}`}
                      onClick={(e) => { e.stopPropagation(); onJobClick?.(job); }}
                      className={cn(
                        "w-full text-left rounded px-1.5 py-0.5 text-[10px] leading-tight border truncate transition-opacity hover:opacity-80",
                        STATUS_COLORS[job.status] || STATUS_COLORS.scheduled
                      )}
                    >
                      <span className="font-medium">{job.title}</span>
                      {job.start_time && (
                        <span className="ml-1 opacity-70">{formatTime12(job.start_time)}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Compact: selected day agenda */}
        {useCompact && selectedDate && (
          <div className="mt-3 space-y-2">
            <h4 className="text-sm font-semibold">
              {parseLocalDate(selectedDate).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </h4>
            {selectedDayJobs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">No jobs scheduled</p>
            ) : (
              selectedDayJobs.map((job) => {
                const site = siteMap.get(job.site_id);
                return (
                  <button
                    key={job.id}
                    onClick={() => onJobClick?.(job)}
                    className={cn(
                      "w-full text-left rounded-lg p-3 border transition-opacity hover:opacity-90",
                      STATUS_COLORS[job.status] || STATUS_COLORS.scheduled
                    )}
                  >
                    <div className="font-medium text-sm">{job.title}</div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs opacity-80">
                      {job.start_time && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTime12(job.start_time)}
                          {job.estimated_hours && ` · ${job.estimated_hours}h`}
                        </span>
                      )}
                      {site && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {site.name}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

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
