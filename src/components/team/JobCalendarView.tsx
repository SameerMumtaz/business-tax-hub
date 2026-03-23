import { useState, useRef, useCallback, useMemo } from "react";
import { type Job, type JobSite, type JobAssignment } from "@/hooks/useJobs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Clock, MapPin, AlertTriangle, Sparkles, GripVertical, Lock, Unlock, Copy, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

/* ── Utilities ── */

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime12(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/* ── Status colors ── */

const STATUS_BG: Record<string, string> = {
  scheduled: "bg-blue-500/10 border-blue-300 dark:border-blue-700",
  in_progress: "bg-amber-500/10 border-amber-300 dark:border-amber-700",
  completed: "bg-emerald-500/10 border-emerald-300 dark:border-emerald-700",
  cancelled: "bg-muted border-border",
};

const STATUS_ACCENT: Record<string, string> = {
  scheduled: "bg-blue-500",
  in_progress: "bg-amber-500",
  completed: "bg-emerald-500",
  cancelled: "bg-muted-foreground",
};

const STATUS_TEXT: Record<string, string> = {
  scheduled: "text-blue-700 dark:text-blue-400",
  in_progress: "text-amber-700 dark:text-amber-400",
  completed: "text-emerald-700 dark:text-emerald-400",
  cancelled: "text-muted-foreground",
};

/* ── Workload thresholds ── */

function getWorkloadLevel(hours: number): { color: string; label: string } {
  if (hours === 0) return { color: "bg-muted/30", label: "Open" };
  if (hours <= 4) return { color: "bg-emerald-500/15", label: "Light" };
  if (hours <= 8) return { color: "bg-blue-500/15", label: "Normal" };
  if (hours <= 12) return { color: "bg-amber-500/15", label: "Busy" };
  return { color: "bg-red-500/15", label: "Overloaded" };
}

function getWorkloadBarColor(hours: number): string {
  if (hours === 0) return "bg-muted";
  if (hours <= 4) return "bg-emerald-500";
  if (hours <= 8) return "bg-blue-500";
  if (hours <= 12) return "bg-amber-500";
  return "bg-red-500";
}

/* ── Types ── */

export interface JobMoveEvent {
  jobId: string;
  newDate: string;
  newTime?: string | null;
  /** For recurring jobs: "this" = create one-off copy, "all" = update the recurring job itself */
  recurringMode?: "this" | "all";
  /** The original recurring job to reference when creating a one-off copy */
  sourceJob?: Job;
  /** The specific instance date being moved (for recurring) */
  instanceDate?: string;
}

interface Props {
  jobs: Job[];
  sites: JobSite[];
  assignments?: JobAssignment[];
  teamMembers?: { id: string; name: string; pay_rate: number | null; worker_type: string }[];
  onJobClick?: (job: Job) => void;
  onJobMove?: (event: JobMoveEvent) => void;
}

type ViewMode = "week" | "month";

/* ── Conflict detection ── */

interface ConflictInfo {
  type: "crew_overlap" | "overloaded";
  message: string;
}

function detectConflicts(
  job: Job,
  targetDate: string,
  allJobs: Job[],
  jobsByDate: Map<string, Job[]>,
  assignments: JobAssignment[]
): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];
  const dayJobs = (jobsByDate.get(targetDate) || []).filter((j) => j.id !== job.id);

  // Check crew overlap
  const jobCrewIds = new Set(assignments.filter((a) => a.job_id === job.id).map((a) => a.worker_id));
  for (const otherJob of dayJobs) {
    const otherCrewIds = assignments.filter((a) => a.job_id === otherJob.id).map((a) => a.worker_id);
    const overlap = otherCrewIds.filter((id) => jobCrewIds.has(id));
    if (overlap.length > 0 && job.start_time && otherJob.start_time) {
      conflicts.push({
        type: "crew_overlap",
        message: `${overlap.length} crew member${overlap.length > 1 ? "s" : ""} already assigned to "${otherJob.title}" at ${formatTime12(otherJob.start_time)}`,
      });
    }
  }

  // Check daily hours overload
  const existingHours = dayJobs.reduce((s, j) => s + (j.estimated_hours || 2), 0);
  const totalAfterDrop = existingHours + (job.estimated_hours || 2);
  if (totalAfterDrop > 12) {
    conflicts.push({
      type: "overloaded",
      message: `Day would have ${totalAfterDrop.toFixed(1)}h of work scheduled`,
    });
  }

  return conflicts;
}

/* ── Gap detection ── */

function findGapSuggestions(
  job: Job,
  jobsByDate: Map<string, Job[]>,
  weekDays: Date[]
): string[] {
  const jobHours = job.estimated_hours || 2;
  const suggestions: string[] = [];

  const dayLoads = weekDays.map((d) => {
    const key = toDateStr(d);
    const dayJobs = (jobsByDate.get(key) || []).filter((j) => j.id !== job.id);
    return { date: key, hours: dayJobs.reduce((s, j) => s + (j.estimated_hours || 2), 0) };
  });

  // Sort by lowest workload first
  const sorted = [...dayLoads].sort((a, b) => a.hours - b.hours);
  for (const day of sorted) {
    if (day.hours + jobHours <= 8 && suggestions.length < 3) {
      suggestions.push(day.date);
    }
  }

  return suggestions;
}

/* ── Build recurring job instances for a date range ── */

/** Set of "parentJobId:dateStr" keys for recurring instances that have been rescheduled */
function buildRescheduledSet(jobs: Job[]): Set<string> {
  const set = new Set<string>();
  for (const job of jobs) {
    const match = job.description?.match(/\[rescheduled:([^:]+):([^\]]+)\]/);
    if (match) {
      set.add(`${match[1]}:${match[2]}`);
    }
  }
  return set;
}

interface CalendarJob extends Job {
  /** If true, this recurring instance was rescheduled to another date */
  _rescheduled?: boolean;
  /** The specific date this job instance appears on (for recurring) */
  _instanceDate?: string;
}

function buildJobsByDate(jobs: Job[], rangeStart: Date, rangeEnd: Date): Map<string, CalendarJob[]> {
  const map = new Map<string, CalendarJob[]>();
  const add = (key: string, job: CalendarJob) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(job);
  };

  const rescheduledSet = buildRescheduledSet(jobs);
  const horizon = addDays(rangeEnd, 365);

  for (const job of jobs) {
    if (job.status === "cancelled") continue;
    const start = parseLocalDate(job.start_date);

    if (job.job_type === "recurring" && job.recurring_interval) {
      const endDate = job.recurring_end_date ? parseLocalDate(job.recurring_end_date) : horizon;
      const intervalDays = job.recurring_interval === "weekly" ? 7
        : job.recurring_interval === "biweekly" ? 14 : 0;

      const cursor = new Date(start);
      while (cursor <= endDate && cursor <= rangeEnd) {
        if (cursor >= rangeStart) {
          const dateStr = toDateStr(cursor);
          const isRescheduled = rescheduledSet.has(`${job.id}:${dateStr}`);
          add(dateStr, { ...job, _rescheduled: isRescheduled, _instanceDate: dateStr });
        }
        if (job.recurring_interval === "monthly") cursor.setMonth(cursor.getMonth() + 1);
        else if (intervalDays > 0) cursor.setDate(cursor.getDate() + intervalDays);
        else break;
      }
    } else {
      // Skip showing one-time rescheduled copies on the ORIGINAL date (they appear on their new date)
      const end = job.end_date ? parseLocalDate(job.end_date) : start;
      const cursor = new Date(start);
      while (cursor <= end) {
        if (cursor >= rangeStart && cursor <= rangeEnd) {
          add(toDateStr(cursor), { ...job, _instanceDate: toDateStr(cursor) });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
  }
  return map;
}

/* ── Main Component ── */

export default function JobCalendarView({ jobs, sites, assignments = [], teamMembers = [], onJobClick, onJobMove }: Props) {
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [dragJob, setDragJob] = useState<Job | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [showConflicts, setShowConflicts] = useState<ConflictInfo[]>([]);
  const [gapSuggestions, setGapSuggestions] = useState<string[]>([]);
  const dragStartDate = useRef<string | null>(null);
  const dragIsRecurringInstance = useRef(false);
  const wasDragging = useRef(false);

  // Recurring drag dialog state
  const [recurringDialogOpen, setRecurringDialogOpen] = useState(false);
  const [pendingRecurringMove, setPendingRecurringMove] = useState<{
    job: Job;
    fromDate: string;
    toDate: string;
    newTime?: string | null;
  } | null>(null);

  const siteMap = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);

  // Compute date range
  const { weekDays, rangeStart, rangeEnd } = useMemo(() => {
    if (viewMode === "week") {
      const ws = getWeekStart(currentDate);
      const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
      return { weekDays: days, rangeStart: days[0], rangeEnd: days[6] };
    } else {
      const ms = getMonthStart(currentDate);
      const daysInMonth = new Date(ms.getFullYear(), ms.getMonth() + 1, 0).getDate();
      const firstDay = ms.getDay();
      const days: Date[] = [];
      for (let i = -firstDay; i < daysInMonth + (6 - new Date(ms.getFullYear(), ms.getMonth(), daysInMonth).getDay()); i++) {
        days.push(addDays(ms, i));
      }
      return { weekDays: days, rangeStart: days[0], rangeEnd: days[days.length - 1] };
    }
  }, [viewMode, currentDate]);

  const jobsByDate = useMemo(
    () => buildJobsByDate(jobs, rangeStart, rangeEnd),
    [jobs, rangeStart, rangeEnd]
  );

  const todayStr = toDateStr(new Date());

  // Navigation
  const goBack = () => {
    if (viewMode === "week") setCurrentDate((d) => addDays(d, -7));
    else setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };
  const goForward = () => {
    if (viewMode === "week") setCurrentDate((d) => addDays(d, 7));
    else setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };
  const goToday = () => setCurrentDate(new Date());

  const headerLabel = viewMode === "week"
    ? `${weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekDays[weekDays.length - 1].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    : currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // ── Helper: compute new start_time based on drop index ──

  const computeTimeForIndex = (dateStr: string, dropIndex: number, excludeJobId?: string): string | null => {
    const dayJobs = sortJobs((jobsByDate.get(dateStr) || []).filter((j) => j.id !== excludeJobId));
    if (dayJobs.length === 0) return null; // keep existing time

    if (dropIndex <= 0) {
      // Dropped before first job — place 30min before it
      const firstTime = dayJobs[0]?.start_time;
      if (!firstTime) return null;
      const [h, m] = firstTime.split(":").map(Number);
      const mins = Math.max(0, h * 60 + m - 30);
      return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    }

    if (dropIndex >= dayJobs.length) {
      // Dropped after last job — place after last job ends
      const lastJob = dayJobs[dayJobs.length - 1];
      const lastTime = lastJob?.start_time;
      if (!lastTime) return null;
      const [h, m] = lastTime.split(":").map(Number);
      const estHours = lastJob.estimated_hours || 1;
      const mins = h * 60 + m + estHours * 60;
      return `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(Math.floor(mins) % 60).padStart(2, "0")}`;
    }

    // Between two jobs — place in the middle
    const before = dayJobs[dropIndex - 1];
    const after = dayJobs[dropIndex];
    if (before?.start_time && after?.start_time) {
      const [bh, bm] = before.start_time.split(":").map(Number);
      const [ah, am] = after.start_time.split(":").map(Number);
      const bMins = bh * 60 + bm + (before.estimated_hours || 1) * 60;
      const aMins = ah * 60 + am;
      const midMins = Math.floor((bMins + aMins) / 2);
      return `${String(Math.floor(midMins / 60) % 24).padStart(2, "0")}:${String(midMins % 60).padStart(2, "0")}`;
    }
    return null;
  };

  // ── Drag handlers ──

  const clearDragState = () => {
    setDragJob(null);
    setDragOverDate(null);
    setDragOverIndex(null);
    setShowConflicts([]);
    setGapSuggestions([]);
    dragIsRecurringInstance.current = false;
  };

  const handleDragStart = (e: React.DragEvent, job: Job, fromDate: string) => {
    if (!editMode) { e.preventDefault(); return; }
    if (job.status === "completed" || job.status === "cancelled") {
      e.preventDefault();
      return;
    }
    wasDragging.current = true;
    setDragJob(job);
    dragStartDate.current = fromDate;
    dragIsRecurringInstance.current = job.job_type === "recurring";
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", job.id);

    // Compute gap suggestions
    const gaps = findGapSuggestions(job, jobsByDate, weekDays);
    setGapSuggestions(gaps);
  };

  const handleDragOver = useCallback((e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDate(dateStr);

    if (dragJob) {
      const conflicts = detectConflicts(dragJob, dateStr, jobs, jobsByDate, assignments);
      setShowConflicts(conflicts);
    }
  }, [dragJob, jobs, jobsByDate, assignments]);

  const handleDragLeave = useCallback(() => {
    setDragOverDate(null);
    setDragOverIndex(null);
    setShowConflicts([]);
  }, []);

  const handleCardDragOver = useCallback((e: React.DragEvent, dateStr: string, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDragOverDate(dateStr);
    setDragOverIndex(index);
  }, []);

  const executeDrop = useCallback((dateStr: string, dropIdx?: number) => {
    if (!dragJob) return;
    const sameDay = dateStr === dragStartDate.current;
    const newTime = typeof dropIdx === "number" ? computeTimeForIndex(dateStr, dropIdx, dragJob.id) : undefined;

    // For intra-day with no position change, skip
    if (sameDay && newTime === undefined) {
      clearDragState();
      return;
    }

    // Recurring job — show dialog
    if (dragJob.job_type === "recurring") {
      setPendingRecurringMove({
        job: dragJob,
        fromDate: dragStartDate.current || dateStr,
        toDate: dateStr,
        newTime,
      });
      setRecurringDialogOpen(true);
      setDragJob(null);
      setDragOverDate(null);
      setDragOverIndex(null);
      setShowConflicts([]);
      setGapSuggestions([]);
      return;
    }

    // Conflict check
    if (!sameDay) {
      const conflicts = detectConflicts(dragJob, dateStr, jobs, jobsByDate, assignments);
      if (conflicts.some((c) => c.type === "crew_overlap")) {
        const proceed = window.confirm(
          `⚠️ Scheduling conflict:\n${conflicts.map((c) => c.message).join("\n")}\n\nMove anyway?`
        );
        if (!proceed) { clearDragState(); return; }
      }
    }

    onJobMove?.({
      jobId: dragJob.id,
      newDate: dateStr,
      newTime: sameDay ? newTime : (newTime || undefined),
    });
    clearDragState();
  }, [dragJob, jobs, jobsByDate, assignments, onJobMove]);

  const handleDrop = useCallback((e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    // If we have a specific drop index from a card zone, use it
    executeDrop(dateStr, dragOverIndex ?? undefined);
  }, [executeDrop, dragOverIndex]);

  const handleCardDrop = useCallback((e: React.DragEvent, dateStr: string, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    executeDrop(dateStr, index);
  }, [executeDrop]);

  const handleDragEnd = () => {
    clearDragState();
    // Keep wasDragging true briefly to suppress the click event that fires after dragEnd
    setTimeout(() => { wasDragging.current = false; }, 100);
  };

  // ── Recurring dialog handlers ──

  const handleRecurringChoice = (mode: "this" | "all") => {
    if (!pendingRecurringMove) return;
    const { job, fromDate, toDate, newTime } = pendingRecurringMove;

    onJobMove?.({
      jobId: job.id,
      newDate: toDate,
      newTime,
      recurringMode: mode,
      sourceJob: job,
      instanceDate: fromDate,
    });

    setRecurringDialogOpen(false);
    setPendingRecurringMove(null);
  };

  // ── Day column compute ──

  const getDayHours = (dateStr: string) => {
    const dayJobs = jobsByDate.get(dateStr) || [];
    return dayJobs.reduce((s, j) => s + (j.estimated_hours || 2), 0);
  };

  const sortJobs = (jobList: Job[]) =>
    jobList.slice().sort((a, b) => {
      if (!a.start_time && !b.start_time) return 0;
      if (!a.start_time) return 1;
      if (!b.start_time) return -1;
      return a.start_time.localeCompare(b.start_time);
    });

  const dayHeaders = isMobile
    ? ["S", "M", "T", "W", "T", "F", "S"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  /* ── Week View (Kanban columns) ── */

  const renderWeekView = () => (
    <div className={cn("grid gap-1.5", isMobile ? "grid-cols-2" : "grid-cols-7")}>
      {weekDays.map((day) => {
        const dateStr = toDateStr(day);
        const dayJobs = sortJobs(jobsByDate.get(dateStr) || []);
        const hours = getDayHours(dateStr);
        const workload = getWorkloadLevel(hours);
        const isToday = dateStr === todayStr;
        const isDragTarget = dragOverDate === dateStr;
        const isGapSuggestion = gapSuggestions.includes(dateStr) && dragJob !== null;
        const isCurrentMonth = day.getMonth() === currentDate.getMonth();

        return (
          <div
            key={dateStr}
            className={cn(
              "rounded-lg border transition-all flex flex-col min-h-[200px]",
              isToday && "ring-2 ring-primary/50",
              isDragTarget && showConflicts.length > 0 && "ring-2 ring-red-500/60 bg-red-500/5",
              isDragTarget && showConflicts.length === 0 && "ring-2 ring-primary/60 bg-primary/5",
              isGapSuggestion && !isDragTarget && "ring-2 ring-emerald-500/40 bg-emerald-500/5",
              !isDragTarget && !isGapSuggestion && "border-border bg-card",
              !isCurrentMonth && "opacity-50"
            )}
            onDragOver={(e) => handleDragOver(e, dateStr)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, dateStr)}
          >
            {/* Column header */}
            <div className={cn("px-2 py-1.5 border-b border-border/50 flex-shrink-0", workload.color)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "text-xs font-medium",
                    !isMobile && "hidden"
                  )}>
                    {day.toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                  <span className={cn(
                    "text-xs font-medium",
                    isMobile && "hidden"
                  )}>
                    {dayHeaders[day.getDay()]}
                  </span>
                  <span className={cn(
                    "w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center",
                    isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                  )}>
                    {day.getDate()}
                  </span>
                </div>
                {hours > 0 && (
                  <span className="text-[10px] font-mono text-muted-foreground">{hours.toFixed(1)}h</span>
                )}
              </div>

              {/* Workload bar */}
              <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", getWorkloadBarColor(hours))}
                  style={{ width: `${Math.min(100, (hours / 12) * 100)}%` }}
                />
              </div>

              {/* Gap suggestion indicator */}
              {isGapSuggestion && !isDragTarget && (
                <div className="mt-1 flex items-center gap-1 text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">
                  <Sparkles className="h-3 w-3" />
                  Suggested
                </div>
              )}
            </div>

            {/* Job cards with intra-day drop zones */}
            <div className="flex-1 p-1 overflow-y-auto">
              {dayJobs.length === 0 && !isDragTarget && (
                <div className="h-full flex items-center justify-center">
                  <span className="text-[10px] text-muted-foreground/50">No jobs</span>
                </div>
              )}

              {/* Top drop zone */}
              {editMode && dragJob && isDragTarget && (
                <div
                  className={cn(
                    "h-1 rounded-full mb-1 transition-all",
                    dragOverIndex === 0 ? "h-6 border-2 border-dashed border-primary/50 bg-primary/5 flex items-center justify-center" : "bg-transparent"
                  )}
                  onDragOver={(e) => handleCardDragOver(e, dateStr, 0)}
                  onDrop={(e) => handleCardDrop(e, dateStr, 0)}
                >
                  {dragOverIndex === 0 && <span className="text-[9px] text-primary">Drop here</span>}
                </div>
              )}

              {dayJobs.map((job, idx) => {
                const site = siteMap.get(job.site_id);
                const isDragging = dragJob?.id === job.id;
                const isRescheduled = !!(job as CalendarJob)._rescheduled;
                const canDrag = editMode && !isRescheduled && job.status !== "completed" && job.status !== "cancelled";

                return (
                  <div key={`${job.id}-${dateStr}-${idx}`} className="space-y-0">
                    <div
                      draggable={canDrag}
                      onDragStart={(e) => handleDragStart(e, job, dateStr)}
                      onDragEnd={handleDragEnd}
                      onClick={() => { if (!wasDragging.current && !isRescheduled) onJobClick?.(job); }}
                      className={cn(
                        "group rounded-md border px-2 py-1.5 transition-all",
                        isRescheduled
                          ? "opacity-40 bg-muted/50 border-dashed border-muted-foreground/30 cursor-default line-through decoration-muted-foreground/40"
                          : cn(
                              "cursor-pointer hover:shadow-sm",
                              STATUS_BG[job.status] || STATUS_BG.scheduled,
                              canDrag && "hover:ring-1 hover:ring-primary/30"
                            ),
                        isDragging && "opacity-40 scale-95",
                      )}
                    >
                      <div className="flex items-start gap-1.5">
                        {canDrag && (
                          <GripVertical className="h-3.5 w-3.5 mt-0.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 cursor-grab" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className={cn("text-xs font-semibold truncate", STATUS_TEXT[job.status])}>
                            {job.title}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0 mt-0.5">
                            {job.start_time && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {formatTime12(job.start_time)}
                              </span>
                            )}
                            {job.estimated_hours && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {job.estimated_hours}h
                              </span>
                            )}
                            {site && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 truncate">
                                <MapPin className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate">{site.name}</span>
                              </span>
                            )}
                          </div>
                          {assignments.filter((a) => a.job_id === job.id).length > 0 && (
                            <div className="flex flex-wrap gap-0.5 mt-1">
                              {assignments
                                .filter((a) => a.job_id === job.id)
                                .slice(0, 3)
                                .map((a) => (
                                  <span key={a.id} className="text-[9px] bg-background/80 border border-border/50 rounded px-1 py-0 text-muted-foreground">
                                    {a.worker_name.split(" ")[0]}
                                  </span>
                                ))}
                              {assignments.filter((a) => a.job_id === job.id).length > 3 && (
                                <span className="text-[9px] text-muted-foreground">
                                  +{assignments.filter((a) => a.job_id === job.id).length - 3}
                                </span>
                              )}
                            </div>
                          )}
                          {isRescheduled ? (
                            <span className="text-[9px] text-destructive/70 font-medium no-underline" style={{ textDecoration: 'none' }}>
                              ↗ Rescheduled
                            </span>
                          ) : job.job_type === "recurring" ? (
                            <span className="text-[9px] text-muted-foreground/60 italic">
                              ↻ {job.recurring_interval}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Between-card drop zone */}
                    {editMode && dragJob && isDragTarget && (
                      <div
                        className={cn(
                          "h-1 rounded-full my-0.5 transition-all",
                          dragOverIndex === idx + 1 ? "h-6 border-2 border-dashed border-primary/50 bg-primary/5 flex items-center justify-center" : "bg-transparent"
                        )}
                        onDragOver={(e) => handleCardDragOver(e, dateStr, idx + 1)}
                        onDrop={(e) => handleCardDrop(e, dateStr, idx + 1)}
                      >
                        {dragOverIndex === idx + 1 && <span className="text-[9px] text-primary">Drop here</span>}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Bottom drop zone for empty days or conflict display */}
              {isDragTarget && dayJobs.length === 0 && (
                <div className={cn(
                  "rounded-md border-2 border-dashed py-3 flex flex-col items-center justify-center gap-1 transition-all",
                  showConflicts.length > 0
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-primary/40 bg-primary/5"
                )}>
                  {showConflicts.length > 0 ? (
                    <>
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      {showConflicts.map((c, i) => (
                        <span key={i} className="text-[9px] text-destructive text-center px-1">
                          {c.message}
                        </span>
                      ))}
                    </>
                  ) : (
                    <span className="text-[10px] text-primary font-medium">Drop here</span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  /* ── Month View (compact grid with dots) ── */

  const renderMonthView = () => {
    const ms = getMonthStart(currentDate);
    const daysInMonth = new Date(ms.getFullYear(), ms.getMonth() + 1, 0).getDate();
    const firstDayOfWeek = ms.getDay();

    const cells: (Date | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(ms.getFullYear(), ms.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);

    return (
      <>
        <div className="grid grid-cols-7 text-center text-[10px] sm:text-xs font-medium text-muted-foreground mb-1">
          {dayHeaders.map((d, i) => (
            <div key={i} className="py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 border-t border-l border-border rounded-t-md overflow-hidden">
          {cells.map((day, i) => {
            if (!day) {
              return <div key={`e-${i}`} className="border-r border-b border-border min-h-[80px] bg-muted/20" />;
            }
            const dateStr = toDateStr(day);
            const dayJobs = sortJobs(jobsByDate.get(dateStr) || []);
            const hours = getDayHours(dateStr);
            const isToday = dateStr === todayStr;
            const isDragTarget = dragOverDate === dateStr;
            const isGapSuggestion = gapSuggestions.includes(dateStr);

            return (
              <div
                key={dateStr}
                className={cn(
                  "border-r border-b border-border min-h-[80px] p-1 transition-colors",
                  isToday && "bg-primary/5",
                  isDragTarget && "bg-primary/10 ring-1 ring-inset ring-primary",
                  isGapSuggestion && dragJob && "bg-emerald-500/5"
                )}
                onDragOver={(e) => handleDragOver(e, dateStr)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, dateStr)}
                onClick={() => {
                  setCurrentDate(day);
                  setViewMode("week");
                }}
              >
                <div className="flex items-center justify-between">
                  <span className={cn(
                    "text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full",
                    isToday && "bg-primary text-primary-foreground"
                  )}>
                    {day.getDate()}
                  </span>
                  {hours > 0 && (
                    <span className="text-[9px] font-mono text-muted-foreground">{hours.toFixed(0)}h</span>
                  )}
                </div>

                {/* Workload indicator */}
                {hours > 0 && (
                  <div className="mt-0.5 h-0.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", getWorkloadBarColor(hours))}
                      style={{ width: `${Math.min(100, (hours / 12) * 100)}%` }}
                    />
                  </div>
                )}

                <div className="mt-0.5 space-y-0.5 overflow-hidden max-h-[52px]">
                  {dayJobs.slice(0, 3).map((job) => (
                    <div
                      key={`${job.id}-${dateStr}`}
                      draggable={editMode && job.status !== "completed" && job.status !== "cancelled"}
                      onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, job, dateStr); }}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => { e.stopPropagation(); if (!wasDragging.current) onJobClick?.(job); }}
                      className={cn(
                        "rounded px-1 py-0 text-[9px] leading-tight truncate border cursor-pointer",
                        STATUS_BG[job.status]
                      )}
                    >
                      <span className={cn("font-medium", STATUS_TEXT[job.status])}>{job.title}</span>
                    </div>
                  ))}
                  {dayJobs.length > 3 && (
                    <span className="text-[9px] text-muted-foreground pl-1">+{dayJobs.length - 3} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <>
    <Card>
      <CardContent className="pt-4 px-2 sm:px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goBack}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goForward}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <h3 className="text-sm sm:text-base font-semibold ml-1 sm:ml-2">{headerLabel}</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={goToday}>Today</Button>
            <Button
              variant={editMode ? "default" : "outline"}
              size="sm"
              className="text-xs h-7 gap-1"
              onClick={() => setEditMode(!editMode)}
            >
              {editMode ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              {editMode ? "Editing" : "Locked"}
            </Button>
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setViewMode("week")}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium transition-colors",
                  viewMode === "week"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                Week
              </button>
              <button
                onClick={() => setViewMode("month")}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium transition-colors",
                  viewMode === "month"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                Month
              </button>
            </div>
          </div>
        </div>

        {/* Calendar content */}
        {viewMode === "week" ? renderWeekView() : renderMonthView()}

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-3 text-[10px]">
          {[
            { status: "scheduled", label: "Scheduled" },
            { status: "in_progress", label: "In Progress" },
            { status: "completed", label: "Completed" },
          ].map(({ status, label }) => (
            <div key={status} className="flex items-center gap-1">
              <div className={cn("w-2.5 h-2.5 rounded-full", STATUS_ACCENT[status])} />
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
          {editMode && (
            <div className="flex items-center gap-1">
              <GripVertical className="h-3 w-3 text-muted-foreground/60" />
              <span className="text-muted-foreground">Drag to reschedule</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>

    {/* Recurring move dialog */}
    <Dialog open={recurringDialogOpen} onOpenChange={setRecurringDialogOpen}>
      <DialogContent className="sm:max-w-md max-w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>Move Recurring Job</DialogTitle>
          <DialogDescription>
            "{pendingRecurringMove?.job.title}" is a {pendingRecurringMove?.job.recurring_interval} recurring job. How would you like to apply this change?
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            className="justify-start gap-2 h-auto py-3"
            onClick={() => handleRecurringChoice("this")}
          >
            <Copy className="h-4 w-4 shrink-0" />
            <div className="text-left">
              <div className="font-medium text-sm">This instance only</div>
              <div className="text-xs text-muted-foreground">Creates a one-time copy for the new date. The recurring schedule stays unchanged.</div>
            </div>
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-2 h-auto py-3"
            onClick={() => handleRecurringChoice("all")}
          >
            <RefreshCw className="h-4 w-4 shrink-0" />
            <div className="text-left">
              <div className="font-medium text-sm">All future instances</div>
              <div className="text-xs text-muted-foreground">Updates the recurring job's start date. All future occurrences will shift.</div>
            </div>
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setRecurringDialogOpen(false); setPendingRecurringMove(null); }}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
