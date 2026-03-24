import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ChevronLeft, ChevronRight, Clock, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfWeek, endOfWeek, addWeeks, eachDayOfInterval, isSameDay } from "date-fns";
import { getJobDateKeysInRange } from "@/lib/dateOnly";

interface Job {
  id: string;
  title: string;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  estimated_hours: number | null;
  job_type: string;
  status: string;
  recurring_interval?: string | null;
  recurring_end_date?: string | null;
}

interface Assignment {
  job_id: string;
  worker_id: string;
  worker_name: string;
  worker_type?: string;
  hours_per_day?: number;
  assigned_days?: string[] | null;
}

interface CheckinRecord {
  id: string;
  job_id: string | null;
  team_member_id: string;
  check_in_time: string;
  check_out_time: string | null;
  total_hours: number | null;
  occurrence_date: string | null;
  status: string;
}

interface TeamMember {
  id: string;
  name: string;
}

interface Props {
  jobs: Job[];
  assignments: Assignment[];
  checkins: CheckinRecord[];
  members: TeamMember[];
}

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export default function ScheduledVsActualWidget({ jobs, assignments, checkins, members }: Props) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const todayStr = formatDateStr(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekStartStr = formatDateStr(weekStart);
  const weekEndStr = formatDateStr(weekEnd);
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const prevWeek = useCallback(() => setSelectedDate((d) => addWeeks(d, -1)), []);
  const nextWeek = useCallback(() => setSelectedDate((d) => addWeeks(d, 1)), []);

  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const analysis = useMemo(() => {
    // For each worker, compute scheduled hours & actual hours for the week
    const workerData = new Map<string, {
      name: string;
      scheduledHours: number;
      actualHours: number;
      scheduledByDay: number[];
      actualByDay: number[];
      jobCount: number;
    }>();

    // 1) Compute scheduled hours from job assignments
    for (const job of jobs) {
      if (job.status === "cancelled") continue;

      // Get which days of this week the job runs
      let jobDatesInWeek: string[] = [];
      if (job.job_type === "recurring" && job.recurring_interval) {
        jobDatesInWeek = getJobDateKeysInRange(job, weekStartStr, weekEndStr);
      } else {
        const jEnd = job.end_date ?? job.start_date;
        const days = weekDays.map(formatDateStr).filter((d) => d >= job.start_date && d <= jEnd);
        jobDatesInWeek = days;
      }

      if (jobDatesInWeek.length === 0) continue;

      const jobAssigns = assignments.filter((a) => a.job_id === job.id);
      for (const assign of jobAssigns) {
        const hpd = assign.hours_per_day && assign.hours_per_day > 0 ? assign.hours_per_day : (job.estimated_hours || 8);

        if (!workerData.has(assign.worker_id)) {
          const member = memberMap.get(assign.worker_id);
          workerData.set(assign.worker_id, {
            name: member?.name || assign.worker_name,
            scheduledHours: 0,
            actualHours: 0,
            scheduledByDay: [0, 0, 0, 0, 0, 0, 0],
            actualByDay: [0, 0, 0, 0, 0, 0, 0],
            jobCount: 0,
          });
        }

        const data = workerData.get(assign.worker_id)!;
        data.jobCount++;

        for (const dateStr of jobDatesInWeek) {
          // Skip future days — don't penalize for days that haven't happened yet
          if (dateStr > todayStr) continue;
          // Check assigned_days filter
          if (assign.assigned_days && assign.assigned_days.length > 0 && !assign.assigned_days.includes(dateStr)) continue;

          const d = parseLocalDate(dateStr);
          const dayIndex = weekDays.findIndex((wd) => isSameDay(wd, d));
          if (dayIndex >= 0) {
            data.scheduledByDay[dayIndex] += hpd;
            data.scheduledHours += hpd;
          }
        }
      }
    }

    // 2) Compute actual hours from check-ins
    const weekCheckins = checkins.filter((c) => {
      const checkinDate = c.occurrence_date || c.check_in_time.split("T")[0];
      return checkinDate >= weekStartStr && checkinDate <= weekEndStr;
    });

    for (const c of weekCheckins) {
      const workerId = c.team_member_id;
      if (!workerData.has(workerId)) {
        const member = memberMap.get(workerId);
        workerData.set(workerId, {
          name: member?.name || "Unknown",
          scheduledHours: 0,
          actualHours: 0,
          scheduledByDay: [0, 0, 0, 0, 0, 0, 0],
          actualByDay: [0, 0, 0, 0, 0, 0, 0],
          jobCount: 0,
        });
      }

      const data = workerData.get(workerId)!;
      const checkinDate = c.occurrence_date || c.check_in_time.split("T")[0];
      const d = parseLocalDate(checkinDate);
      const dayIndex = weekDays.findIndex((wd) => isSameDay(wd, d));

      let hours = 0;
      if (c.total_hours && c.total_hours > 0) {
        hours = c.total_hours;
      } else if (c.check_out_time) {
        hours = Math.round((new Date(c.check_out_time).getTime() - new Date(c.check_in_time).getTime()) / 3600000 * 4) / 4;
      } else if (c.status === "checked_in") {
        hours = Math.round((Date.now() - new Date(c.check_in_time).getTime()) / 3600000 * 4) / 4;
      }

      data.actualHours += hours;
      if (dayIndex >= 0) {
        data.actualByDay[dayIndex] += hours;
      }
    }

    // Convert to sorted array
    const workers = Array.from(workerData.entries())
      .map(([id, data]) => ({ id, ...data, variance: data.actualHours - data.scheduledHours }))
      .sort((a, b) => a.variance - b.variance); // worst variance first

    const totalScheduled = workers.reduce((s, w) => s + w.scheduledHours, 0);
    const totalActual = workers.reduce((s, w) => s + w.actualHours, 0);

    return { workers, totalScheduled, totalActual };
  }, [jobs, assignments, checkins, members, weekStartStr, weekEndStr, weekDays, memberMap]);

  const totalVariance = analysis.totalActual - analysis.totalScheduled;
  const completionPct = analysis.totalScheduled > 0
    ? Math.min(100, Math.round((analysis.totalActual / analysis.totalScheduled) * 100))
    : 0;

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <Card className="col-span-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Scheduled vs. Actual Hours
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                  <CalendarIcon className="h-3 w-3" />
                  {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => { if (d) { setSelectedDate(d); setCalendarOpen(false); } }}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {analysis.workers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No scheduled jobs or check-ins this week</p>
        ) : (
          <>
            {/* Summary bar */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">
                    {analysis.totalActual.toFixed(1)}h / {analysis.totalScheduled.toFixed(1)}h scheduled
                  </span>
                  <span className={cn(
                    "font-medium",
                    totalVariance > 0 && "text-amber-600 dark:text-amber-400",
                    totalVariance < 0 && "text-destructive",
                    totalVariance === 0 && "text-emerald-600 dark:text-emerald-400",
                  )}>
                    {totalVariance > 0 ? "+" : ""}{totalVariance.toFixed(1)}h
                  </span>
                </div>
                <Progress value={completionPct} className="h-2" />
              </div>
              <span className="text-lg font-bold font-mono">{completionPct}%</span>
            </div>

            {/* Per-worker rows */}
            <div className="space-y-2">
              {analysis.workers.map((worker) => {
                const pct = worker.scheduledHours > 0
                  ? Math.round((worker.actualHours / worker.scheduledHours) * 100)
                  : worker.actualHours > 0 ? 100 : 0;
                const isOver = worker.variance > 0.25;
                const isUnder = worker.variance < -0.25;
                const isOnTrack = !isOver && !isUnder;

                return (
                  <div key={worker.id} className={cn(
                    "rounded-lg border p-3 space-y-2",
                    isOver && "border-amber-200 dark:border-amber-800/50",
                    isUnder && "border-destructive/30",
                    isOnTrack && "border-border",
                  )}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-sm truncate">{worker.name}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {worker.jobCount} job{worker.jobCount !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground font-mono">
                          {worker.actualHours.toFixed(1)}h / {worker.scheduledHours.toFixed(1)}h
                        </span>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] gap-0.5",
                            isOver && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                            isUnder && "bg-destructive/10 text-destructive",
                            isOnTrack && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                          )}
                        >
                          {isOver && <TrendingUp className="h-3 w-3" />}
                          {isUnder && <TrendingDown className="h-3 w-3" />}
                          {isOnTrack && <Minus className="h-3 w-3" />}
                          {worker.variance > 0 ? "+" : ""}{worker.variance.toFixed(1)}h
                        </Badge>
                      </div>
                    </div>

                    {/* Mini daily breakdown */}
                    <div className="grid grid-cols-7 gap-1">
                      {dayLabels.map((label, i) => {
                        const dayDateStr = formatDateStr(weekDays[i]);
                        const isFuture = dayDateStr > todayStr;
                        const sched = worker.scheduledByDay[i];
                        const actual = worker.actualByDay[i];
                        const dayVar = actual - sched;
                        const hasData = sched > 0 || actual > 0;

                        return (
                          <div key={label} className="text-center">
                            <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
                            {isFuture ? (
                              <div className="text-[10px] text-muted-foreground/40">—</div>
                            ) : hasData ? (
                              <div className={cn(
                                "text-xs font-mono rounded px-1 py-0.5",
                                dayVar > 0.25 && "bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400",
                                dayVar < -0.25 && "bg-destructive/10 text-destructive",
                                Math.abs(dayVar) <= 0.25 && "bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400",
                              )}>
                                {actual.toFixed(1)}
                              </div>
                            ) : (
                              <div className="text-[10px] text-muted-foreground/40">–</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
