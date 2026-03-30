import { useState, useRef, useCallback, useMemo } from "react";
import { type Job, type JobSite, type JobAssignment, type CrewCheckinOccurrence } from "@/hooks/useJobs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FilterCombobox from "@/components/FilterCombobox";
import { ChevronLeft, ChevronRight, Clock, MapPin, AlertTriangle, Sparkles, GripVertical, Lock, Unlock, Copy, RefreshCw, Undo2, Save, Trash2, Filter, X, CloudRain, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

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
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = start of week
  d.setDate(d.getDate() + diff);
  return d;
}

function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

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

export interface JobMoveEvent {
  jobId: string;
  newDate: string;
  newTime?: string | null;
  fromDate?: string;
  dropIndex?: number;
  recurringMode?: "this" | "all";
  sourceJob?: Job;
  instanceDate?: string;
}

export interface RaincheckResult {
  moved: number;
  targetDate: string;
  movedJobs: { title: string; clientName?: string }[];
}

export interface RebalanceResult {
  moves: number;
  details: { title: string; fromDate: string; toDate: string }[];
}

interface Props {
  jobs: Job[];
  sites: JobSite[];
  assignments?: JobAssignment[];
  checkins?: CrewCheckinOccurrence[];
  teamMembers?: { id: string; name: string; pay_rate: number | null; worker_type: string }[];
  onJobClick?: (job: Job) => void;
  onJobMove?: (event: JobMoveEvent) => void;
  onJobDelete?: (jobId: string) => Promise<void>;
  onDiscardEdits?: (revertData: { jobId: string; updates: Record<string, any> }[]) => void;
  onRaincheckDay?: (dateStr: string) => Promise<RaincheckResult | null>;
  onRebalanceWeek?: (weekStartStr: string, weekEndStr: string) => Promise<RebalanceResult | null>;
}

type ViewMode = "week" | "month";

interface ConflictInfo {
  type: "crew_overlap" | "overloaded";
  message: string;
}

function detectConflicts(
  job: Job,
  targetDate: string,
  allJobs: Job[],
  jobsByDate: Map<string, CalendarJob[]>,
  assignments: JobAssignment[],
  proposedStartTime?: string | null,
): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];
  const dayJobs = (jobsByDate.get(targetDate) || []).filter((j) => j.id !== job.id);

  const getWindow = (targetJob: Job, startOverride?: string | null) => {
    const start = startOverride ?? targetJob.start_time;
    if (!start) return null;
    const [h, m] = start.split(":").map(Number);
    const startMinutes = h * 60 + m;
    const durationMinutes = Math.max(30, Math.round((targetJob.estimated_hours || 1) * 60));
    return { startMinutes, endMinutes: startMinutes + durationMinutes };
  };

  const movedWindow = getWindow(job, proposedStartTime);
  const jobCrewIds = new Set(assignments.filter((a) => a.job_id === job.id).map((a) => a.worker_id));
  for (const otherJob of dayJobs) {
    const otherCrewIds = assignments.filter((a) => a.job_id === otherJob.id).map((a) => a.worker_id);
    const overlap = otherCrewIds.filter((id) => jobCrewIds.has(id));
    const otherWindow = getWindow(otherJob);

    if (overlap.length > 0 && movedWindow && otherWindow && movedWindow.startMinutes < otherWindow.endMinutes && movedWindow.endMinutes > otherWindow.startMinutes) {
      conflicts.push({
        type: "crew_overlap",
        message: `${overlap.length} crew member${overlap.length > 1 ? "s" : ""} already assigned to "${otherJob.title}" from ${formatTime12(otherJob.start_time!)} to ${formatTime12(`${String(Math.floor(otherWindow.endMinutes / 60) % 24).padStart(2, "0")}:${String(otherWindow.endMinutes % 60).padStart(2, "0")}`)}`,
      });
    }
  }

  return conflicts;
}

function findGapSuggestions(job: Job, jobsByDate: Map<string, CalendarJob[]>, weekDays: Date[]): string[] {
  const jobHours = job.estimated_hours || 2;
  const suggestions: string[] = [];
  const dayLoads = weekDays.map((d) => {
    const key = toDateStr(d);
    const dayJobs = (jobsByDate.get(key) || []).filter((j) => j.id !== job.id);
    return { date: key, hours: dayJobs.reduce((s, j) => s + (j.estimated_hours || 2), 0) };
  });
  const sorted = [...dayLoads].sort((a, b) => a.hours - b.hours);
  for (const day of sorted) {
    if (day.hours + jobHours <= 8 && suggestions.length < 3) suggestions.push(day.date);
  }
  return suggestions;
}

function buildRescheduledSet(jobs: Job[]): Set<string> {
  const set = new Set<string>();
  for (const job of jobs) {
    const match = job.description?.match(/\[rescheduled:([^:]+):([^\]]+)\]/);
    if (match) set.add(`${match[1]}:${match[2]}`);
  }
  return set;
}

interface CalendarJob extends Job {
  _rescheduled?: boolean;
  _instanceDate?: string;
  _displayStatus?: string;
  _isMultiDayContinuation?: boolean;
  _multiDayInfo?: { dayIndex: number; totalDays: number };
}

function getOccurrenceStatus(job: Job, dateStr: string, checkins: CrewCheckinOccurrence[]) {
  if (job.job_type !== "recurring") return job.status;
  const latest = checkins
    .filter((entry) => entry.job_id === job.id && entry.occurrence_date === dateStr)
    .sort((a, b) => b.check_in_time.localeCompare(a.check_in_time))[0];
  if (!latest) return "scheduled";
  if (latest.status === "checked_in") return "in_progress";
  if (latest.status === "checked_out") return "completed";
  return "scheduled";
}

function buildJobsByDate(jobs: Job[], checkins: CrewCheckinOccurrence[], rangeStart: Date, rangeEnd: Date): Map<string, CalendarJob[]> {
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
      const intervalDays = job.recurring_interval === "weekly" ? 7 : job.recurring_interval === "biweekly" ? 14 : 0;
      const cursor = new Date(start);
      while (cursor <= endDate && cursor <= rangeEnd) {
        if (cursor >= rangeStart) {
          const dateStr = toDateStr(cursor);
          add(dateStr, { ...job, _rescheduled: rescheduledSet.has(`${job.id}:${dateStr}`), _instanceDate: dateStr, _displayStatus: getOccurrenceStatus(job, dateStr, checkins) });
        }
        if (job.recurring_interval === "monthly") cursor.setMonth(cursor.getMonth() + 1);
        else if (job.recurring_interval === "quarterly") cursor.setMonth(cursor.getMonth() + 3);
        else if (job.recurring_interval === "biannual") cursor.setMonth(cursor.getMonth() + 6);
        else if (job.recurring_interval === "annual") cursor.setFullYear(cursor.getFullYear() + 1);
        else if (intervalDays > 0) cursor.setDate(cursor.getDate() + intervalDays);
        else break;
      }
    } else {
      const end = job.end_date ? parseLocalDate(job.end_date) : start;
      const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
      const cursor = new Date(start);
      let dayIndex = 0;
      while (cursor <= end) {
        if (cursor >= rangeStart && cursor <= rangeEnd) {
          const dateStr = toDateStr(cursor);
          add(dateStr, {
            ...job,
            _instanceDate: dateStr,
            _displayStatus: job.status,
            _isMultiDayContinuation: dayIndex > 0,
            _multiDayInfo: totalDays > 1 ? { dayIndex, totalDays } : undefined,
          });
        }
        cursor.setDate(cursor.getDate() + 1);
        dayIndex++;
      }
    }
  }
  return map;
}

export default function JobCalendarView({ jobs, sites, assignments = [], checkins = [], teamMembers = [], onJobClick, onJobMove, onJobDelete, onDiscardEdits, onRaincheckDay, onRebalanceWeek }: Props) {
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
  const [recurringDialogOpen, setRecurringDialogOpen] = useState(false);
  const [pendingRecurringMove, setPendingRecurringMove] = useState<{ job: Job; fromDate: string; toDate: string; newTime?: string | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Filter state
  const [filterCrewId, setFilterCrewId] = useState<string>("all");
  const [filterSiteId, setFilterSiteId] = useState<string>("all");
  const [filterJobTitle, setFilterJobTitle] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const hasActiveFilters = filterCrewId !== "all" || filterSiteId !== "all" || filterJobTitle !== "all";

  // Snapshot tracking for undo
  const jobSnapshotsRef = useRef<Map<string, { start_date: string; start_time: string | null; end_date: string | null }>>(new Map());
  const [movedJobIds, setMovedJobIds] = useState<Set<string>>(new Set());
  const hasEdits = movedJobIds.size > 0;

  const enterEditMode = useCallback(() => {
    // Snapshot all jobs when entering edit mode
    const snapshots = new Map<string, { start_date: string; start_time: string | null; end_date: string | null }>();
    jobs.forEach((j) => {
      snapshots.set(j.id, { start_date: j.start_date, start_time: j.start_time, end_date: j.end_date });
    });
    jobSnapshotsRef.current = snapshots;
    setMovedJobIds(new Set());
    setEditMode(true);
  }, [jobs]);

  const handleSaveEdits = useCallback(() => {
    setEditMode(false);
    setMovedJobIds(new Set());
    jobSnapshotsRef.current = new Map();
    toast.success(`${movedJobIds.size} change${movedJobIds.size !== 1 ? "s" : ""} saved`);
  }, [movedJobIds]);

  const handleDiscardEdits = useCallback(() => {
    if (movedJobIds.size > 0 && onDiscardEdits) {
      const revertData: { jobId: string; updates: Record<string, any> }[] = [];
      movedJobIds.forEach((id) => {
        const snapshot = jobSnapshotsRef.current.get(id);
        if (snapshot) {
          revertData.push({ jobId: id, updates: snapshot });
        }
      });
      onDiscardEdits(revertData);
    }
    setEditMode(false);
    setMovedJobIds(new Set());
    jobSnapshotsRef.current = new Map();
    toast.info("Changes discarded");
  }, [movedJobIds, onDiscardEdits]);

  // Wrap onJobMove to track moved IDs
  const wrappedOnJobMove = useCallback((event: JobMoveEvent) => {
    setMovedJobIds((prev) => new Set(prev).add(event.jobId));
    onJobMove?.(event);
  }, [onJobMove]);

  const siteMap = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);

  const { weekDays, rangeStart, rangeEnd } = useMemo(() => {
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
    if (viewMode === "week") {
      const ws = getWeekStart(currentDate);
      const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
      return { weekDays: days, rangeStart: startOfDay(days[0]), rangeEnd: endOfDay(days[6]) };
    }
    const ms = getMonthStart(currentDate);
    const daysInMonth = new Date(ms.getFullYear(), ms.getMonth() + 1, 0).getDate();
    const firstDayOfWeek = ms.getDay(); // 0=Sun
    const mondayOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Mon=0
    const days: Date[] = [];
    const lastDayOfMonth = new Date(ms.getFullYear(), ms.getMonth(), daysInMonth);
    const lastDayOfWeek = lastDayOfMonth.getDay();
    const trailingDays = lastDayOfWeek === 0 ? 0 : 7 - lastDayOfWeek;
    for (let i = -mondayOffset; i < daysInMonth + trailingDays; i++) {
      days.push(addDays(ms, i));
    }
    return { weekDays: days, rangeStart: startOfDay(days[0]), rangeEnd: endOfDay(days[days.length - 1]) };
  }, [viewMode, currentDate]);

  const allJobsByDate = useMemo(() => buildJobsByDate(jobs, checkins, rangeStart, rangeEnd), [jobs, checkins, rangeStart, rangeEnd]);

  // Apply filters to jobsByDate
  const jobsByDate = useMemo(() => {
    if (!hasActiveFilters) return allJobsByDate;
    const filtered = new Map<string, CalendarJob[]>();
    allJobsByDate.forEach((dayJobs, dateStr) => {
      const matching = dayJobs.filter((job) => {
        if (filterSiteId !== "all" && job.site_id !== filterSiteId) return false;
        if (filterJobTitle !== "all" && job.title !== filterJobTitle) return false;
        if (filterCrewId !== "all") {
          const jobAssigns = assignments.filter((a) => a.job_id === job.id);
          if (!jobAssigns.some((a) => a.worker_id === filterCrewId)) return false;
        }
        return true;
      });
      if (matching.length > 0) filtered.set(dateStr, matching);
    });
    return filtered;
  }, [allJobsByDate, hasActiveFilters, filterSiteId, filterJobTitle, filterCrewId, assignments]);
  const todayStr = toDateStr(new Date());
  const goBack = () => viewMode === "week" ? setCurrentDate((d) => addDays(d, -7)) : setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const goForward = () => viewMode === "week" ? setCurrentDate((d) => addDays(d, 7)) : setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const goToday = () => setCurrentDate(new Date());
  const headerLabel = viewMode === "week"
    ? `${weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekDays[weekDays.length - 1].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    : currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const sortJobs = (jobList: CalendarJob[]) => jobList.slice().sort((a, b) => {
    if (!a.start_time && !b.start_time) return 0;
    if (!a.start_time) return 1;
    if (!b.start_time) return -1;
    return a.start_time.localeCompare(b.start_time);
  });

  const MIN_BUFFER_MINUTES = 10;
  const DEFAULT_START = "08:00";

  const roundTo5Min = (totalMinutes: number): number => Math.round(totalMinutes / 5) * 5;

  const minsToTimeStr = (mins: number): string => {
    const clamped = Math.max(0, Math.min(mins, 23 * 60 + 59));
    return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
  };

  const getJobEndMinutes = (job: CalendarJob): number => {
    if (!job.start_time) return 0;
    const [h, m] = job.start_time.split(":").map(Number);
    return h * 60 + m + Math.round((job.estimated_hours || 1) * 60);
  };

  const getJobStartMinutes = (job: CalendarJob): number => {
    if (!job.start_time) return 0;
    const [h, m] = job.start_time.split(":").map(Number);
    return h * 60 + m;
  };

  // Haversine distance in miles between two GPS coordinates
  const haversineDistanceMiles = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3958.8;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, []);

  // Estimate travel buffer in minutes between two sites
  const getTravelBuffer = useCallback((siteIdA: string | undefined, siteIdB: string | undefined): number => {
    if (!siteIdA || !siteIdB || siteIdA === siteIdB) return MIN_BUFFER_MINUTES;
    const a = siteMap.get(siteIdA);
    const b = siteMap.get(siteIdB);
    if (a?.latitude && a?.longitude && b?.latitude && b?.longitude) {
      const miles = haversineDistanceMiles(a.latitude, a.longitude, b.latitude, b.longitude);
      if (miles <= 0) return MIN_BUFFER_MINUTES;
      const drivingMinutes = (miles / 30) * 60; // ~30 mph average
      return Math.max(MIN_BUFFER_MINUTES, Math.ceil(drivingMinutes / 5) * 5);
    }
    return MIN_BUFFER_MINUTES;
  }, [siteMap, haversineDistanceMiles]);

  const computeTimeForIndex = (dateStr: string, dropIndex: number, excludeJobId?: string, movedJobDurationHours?: number, movedJobSiteId?: string): string | null => {
    const dayJobs = sortJobs((jobsByDate.get(dateStr) || []).filter((j) => j.id !== excludeJobId));
    const movedDurationMins = Math.round((movedJobDurationHours || 1) * 60);

    // Empty day → default 8:00 AM
    if (dayJobs.length === 0) return DEFAULT_START;

    // Drop ABOVE all jobs
    if (dropIndex <= 0) {
      const firstJob = dayJobs[0];
      if (!firstJob?.start_time) return DEFAULT_START;
      const buffer = getTravelBuffer(movedJobSiteId, firstJob.site_id);
      const nextStart = getJobStartMinutes(firstJob);
      const newStart = roundTo5Min(nextStart - movedDurationMins - buffer);
      return minsToTimeStr(Math.max(0, newStart));
    }

    // Drop BELOW all jobs
    if (dropIndex >= dayJobs.length) {
      const lastJob = dayJobs[dayJobs.length - 1];
      if (!lastJob?.start_time) return DEFAULT_START;
      const buffer = getTravelBuffer(lastJob.site_id, movedJobSiteId);
      const prevEnd = getJobEndMinutes(lastJob);
      const newStart = roundTo5Min(prevEnd + buffer);
      return minsToTimeStr(Math.min(newStart, 23 * 60 + 59));
    }

    // Drop BETWEEN two jobs
    const prevJob = dayJobs[dropIndex - 1];
    if (!prevJob?.start_time) return DEFAULT_START;
    const buffer = getTravelBuffer(prevJob.site_id, movedJobSiteId);
    const prevEnd = getJobEndMinutes(prevJob);
    const newStart = roundTo5Min(prevEnd + buffer);
    return minsToTimeStr(newStart);
  };



  const clearDragState = () => {
    setDragJob(null);
    setDragOverDate(null);
    setDragOverIndex(null);
    setShowConflicts([]);
    setGapSuggestions([]);
    dragIsRecurringInstance.current = false;
  };

  const handleDragStart = (e: React.DragEvent, job: CalendarJob, fromDate: string) => {
    if (!editMode) { e.preventDefault(); return; }
    if ((job._displayStatus || job.status) === "completed" || job.status === "cancelled") { e.preventDefault(); return; }
    wasDragging.current = true;
    setDragJob(job);
    dragStartDate.current = fromDate;
    dragIsRecurringInstance.current = job.job_type === "recurring";
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", job.id);
    setGapSuggestions(findGapSuggestions(job, jobsByDate, weekDays));
  };

  const handleDragOver = useCallback((e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDate(dateStr);
    if (dragJob) setShowConflicts(detectConflicts(dragJob, dateStr, jobs, jobsByDate, assignments));
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
    const movedDuration = dragJob.estimated_hours || 1;
    const newTime = typeof dropIdx === "number" ? computeTimeForIndex(dateStr, dropIdx, dragJob.id, movedDuration, dragJob.site_id) : undefined;
    if (sameDay && newTime === undefined) { clearDragState(); return; }
    if (dragJob.job_type === "recurring") {
      setPendingRecurringMove({ job: dragJob, fromDate: dragStartDate.current || dateStr, toDate: dateStr, newTime });
      setRecurringDialogOpen(true);
      setDragJob(null);
      setDragOverDate(null);
      setDragOverIndex(null);
      setShowConflicts([]);
      setGapSuggestions([]);
      return;
    }
    if (!sameDay) {
      const conflicts = detectConflicts(dragJob, dateStr, jobs, jobsByDate, assignments, newTime);
      if (conflicts.some((c) => c.type === "crew_overlap")) {
        const proceed = window.confirm(`⚠️ Scheduling conflict:\n${conflicts.map((c) => c.message).join("\n")}\n\nMove anyway?`);
        if (!proceed) { clearDragState(); return; }
      }
    }
    wrappedOnJobMove({ jobId: dragJob.id, newDate: dateStr, newTime: sameDay ? newTime : (newTime || undefined), fromDate: dragStartDate.current || undefined, dropIndex: typeof dropIdx === "number" ? dropIdx : undefined });
    clearDragState();
  }, [dragJob, jobs, jobsByDate, assignments, wrappedOnJobMove]);

  const handleDrop = useCallback((e: React.DragEvent, dateStr: string) => { e.preventDefault(); executeDrop(dateStr, dragOverIndex ?? undefined); }, [executeDrop, dragOverIndex]);
  const handleCardDrop = useCallback((e: React.DragEvent, dateStr: string, index: number) => { e.preventDefault(); e.stopPropagation(); executeDrop(dateStr, index); }, [executeDrop]);
  const handleDragEnd = () => { clearDragState(); setTimeout(() => { wasDragging.current = false; }, 100); };
  const handleRecurringChoice = (mode: "this" | "all") => {
    if (!pendingRecurringMove) return;
    const { job, fromDate, toDate, newTime } = pendingRecurringMove;
    wrappedOnJobMove({ jobId: job.id, newDate: toDate, newTime, recurringMode: mode, sourceJob: job, instanceDate: fromDate });
    setRecurringDialogOpen(false);
    setPendingRecurringMove(null);
  };
  const getDayHours = (dateStr: string) => (jobsByDate.get(dateStr) || []).reduce((s, j) => s + (j.estimated_hours || 2), 0);
  const dayHeaders = isMobile ? ["M", "T", "W", "T", "F", "S", "S"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const renderWeekView = () => {
    const HOUR_PX = 48;
    const MIN_BLOCK_PX = 36;
    return (
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
            <div key={dateStr} className={cn("rounded-lg border transition-all flex flex-col", isToday && "ring-2 ring-primary/50", isDragTarget && showConflicts.length > 0 && "ring-2 ring-red-500/60 bg-red-500/5", isDragTarget && showConflicts.length === 0 && "ring-2 ring-primary/60 bg-primary/5", isGapSuggestion && !isDragTarget && "ring-2 ring-emerald-500/40 bg-emerald-500/5", !isDragTarget && !isGapSuggestion && "border-border bg-card", !isCurrentMonth && "opacity-50")} onDragOver={(e) => handleDragOver(e, dateStr)} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, dateStr)}>
              <div className={cn("px-2 py-1.5 border-b border-border/50 flex-shrink-0", workload.color)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("text-xs font-medium", !isMobile && "hidden")}>{day.toLocaleDateString("en-US", { weekday: "short" })}</span>
                    <span className={cn("text-xs font-medium", isMobile && "hidden")}>{day.toLocaleDateString("en-US", { weekday: "short" })}</span>
                    <span className={cn("w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center", isToday ? "bg-primary text-primary-foreground" : "text-foreground")}>{day.getDate()}</span>
                  </div>
                  {hours > 0 && <span className="text-[10px] font-mono text-muted-foreground">{hours.toFixed(1)}h</span>}
                </div>
                <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden"><div className={cn("h-full rounded-full transition-all", getWorkloadBarColor(hours))} style={{ width: `${Math.min(100, (hours / 12) * 100)}%` }} /></div>
                {isGapSuggestion && !isDragTarget && <div className="mt-1 flex items-center gap-1 text-[9px] text-emerald-600 dark:text-emerald-400 font-medium"><Sparkles className="h-3 w-3" />Suggested</div>}
              </div>
              <div className="flex-1 p-1 overflow-y-auto space-y-0">
                {dayJobs.length === 0 && !dragJob && <div className="h-full flex items-center justify-center min-h-[120px]"><span className="text-[10px] text-muted-foreground/50">No jobs</span></div>}
                {dragJob && !dayJobs.some((j, i) => i === 0 && j.id === dragJob.id) && (() => { const movedDur = dragJob.estimated_hours || 1; const previewTime = computeTimeForIndex(dateStr, 0, dragJob.id, movedDur); const isActive = dragOverDate === dateStr && dragOverIndex === 0; return <div className={cn("rounded-md border-2 border-dashed flex items-center justify-center transition-all mb-1 pointer-events-auto", isActive ? "h-9 border-primary bg-primary/15 shadow-sm" : "h-7 border-primary/30 bg-primary/5 hover:border-primary hover:bg-primary/10")} onDragOver={(e) => handleCardDragOver(e, dateStr, 0)} onDrop={(e) => handleCardDrop(e, dateStr, 0)}><span className={cn("text-[10px] font-medium pointer-events-none", isActive ? "text-primary" : "text-primary/60")}>↑ Move here{isActive && previewTime ? ` · ${formatTime12(previewTime)}` : ""}</span></div>; })()}
                {dayJobs.map((job, idx) => {
                  const site = siteMap.get(job.site_id);
                  const displayStatus = job._displayStatus || job.status;
                  const isDragging = dragJob?.id === job.id;
                  const isRescheduled = !!job._rescheduled;
                  const canDrag = editMode && !isRescheduled && displayStatus !== "completed" && job.status !== "cancelled" && !job._isMultiDayContinuation;
                  const isLastCard = idx === dayJobs.length - 1;
                  const nextJob = dayJobs[idx + 1];
                  const showDropAfter = dragJob && dragJob.id !== job.id && (!nextJob || dragJob.id !== nextJob.id);
                  const estHours = job.estimated_hours || 1;
                  const blockHeight = Math.max(MIN_BLOCK_PX, Math.round(estHours * HOUR_PX));
                  let gapMinutes = 0;
                  let requiredTravelBuffer = 10;
                  let isTightBuffer = false;
                  if (!isLastCard && job.start_time && nextJob?.start_time) {
                    const [h1, m1] = job.start_time.split(":").map(Number);
                    const [h2, m2] = nextJob.start_time.split(":").map(Number);
                    const jobEndMin = h1 * 60 + m1 + estHours * 60;
                    const nextStartMin = h2 * 60 + m2;
                    gapMinutes = Math.max(0, nextStartMin - jobEndMin);
                    // Calculate required travel buffer between these two jobs
                    requiredTravelBuffer = getTravelBuffer(job.site_id, nextJob.site_id);
                    isTightBuffer = gapMinutes < requiredTravelBuffer && gapMinutes >= 0;
                  }
                  const gapHeight = gapMinutes > 0 ? Math.max(0, Math.round((gapMinutes / 60) * HOUR_PX)) : 0;
                  return <div key={`${job.id}-${dateStr}-${idx}`}><div draggable={canDrag} onDragStart={(e) => handleDragStart(e, job, dateStr)} onDragEnd={handleDragEnd} onClick={() => { if (!wasDragging.current && !isRescheduled) onJobClick?.(job); }} style={{ minHeight: `${blockHeight}px` }} className={cn("group relative rounded-md border px-2 py-1.5 transition-all select-none flex flex-col", isRescheduled ? "opacity-40 bg-muted/50 border-dashed border-muted-foreground/30 cursor-default line-through decoration-muted-foreground/40 pointer-events-none" : cn("cursor-pointer hover:shadow-sm", STATUS_BG[displayStatus] || STATUS_BG.scheduled, canDrag && "hover:ring-1 hover:ring-primary/30", job._isMultiDayContinuation && "opacity-70 border-dashed"), isDragging && "opacity-30 scale-95")}>{editMode && onJobDelete && !isRescheduled && !job._isMultiDayContinuation && <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(job); }} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10 pointer-events-auto z-10" title="Delete job"><Trash2 className="h-3 w-3 text-destructive" /></button>}<div className="flex gap-1.5 flex-1 pointer-events-none"><div className={cn("w-1 rounded-full shrink-0 self-stretch", STATUS_ACCENT[displayStatus] || STATUS_ACCENT.scheduled)} /><div className="min-w-0 flex-1 flex flex-col">{canDrag && <GripVertical className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 self-end cursor-grab" />}<div className={cn("text-xs font-semibold truncate", STATUS_TEXT[displayStatus])}>{job.title}</div><div className="flex flex-wrap items-center gap-x-2 gap-y-0 mt-0.5">{job.start_time && !job._isMultiDayContinuation && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{formatTime12(job.start_time)}</span>}{job.estimated_hours && !job._isMultiDayContinuation && <span className="text-[10px] text-muted-foreground font-mono">{job.estimated_hours}h</span>}</div>{site && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 truncate mt-0.5"><MapPin className="h-2.5 w-2.5 shrink-0" /><span className="truncate">{site.name}</span></span>}{!job._isMultiDayContinuation && assignments.filter((a) => a.job_id === job.id).length > 0 && <div className="flex flex-wrap gap-0.5 mt-1">{assignments.filter((a) => a.job_id === job.id).slice(0, 3).map((a) => <span key={a.id} className="text-[9px] bg-background/80 border border-border/50 rounded px-1 py-0 text-muted-foreground">{a.worker_name.split(" ")[0]}</span>)}{assignments.filter((a) => a.job_id === job.id).length > 3 && <span className="text-[9px] text-muted-foreground">+{assignments.filter((a) => a.job_id === job.id).length - 3}</span>}</div>}{isRescheduled ? <span className="text-[9px] text-destructive/70 font-medium no-underline mt-auto" style={{ textDecoration: "none" }}>↗ Rescheduled</span> : job._multiDayInfo ? <span className="text-[9px] text-muted-foreground/60 italic mt-auto">Day {job._multiDayInfo.dayIndex + 1}/{job._multiDayInfo.totalDays}</span> : job.job_type === "recurring" ? <span className="text-[9px] text-muted-foreground/60 italic mt-auto">↻ {job.recurring_interval}</span> : null}</div></div></div>{isTightBuffer && !dragJob && <div className="mx-1 border-l-2 border-dashed border-destructive/40 flex items-center pl-2 py-0.5" style={{ minHeight: "20px" }}><span className="text-[9px] text-destructive font-medium flex items-center gap-0.5"><AlertTriangle className="h-2.5 w-2.5" />{gapMinutes}m gap · need {requiredTravelBuffer}m travel</span></div>}{gapHeight > 8 && !dragJob && !isTightBuffer && <div className="mx-1 border-l-2 border-dashed border-muted-foreground/15 flex items-center pl-2" style={{ height: `${Math.min(gapHeight, 80)}px` }}><span className="text-[9px] text-muted-foreground/40 font-mono">{gapMinutes >= 60 ? `${(gapMinutes / 60).toFixed(1)}h free` : `${gapMinutes}m free`}</span></div>}{showDropAfter && (() => { const dropIdx = idx + 1; const movedDur = dragJob.estimated_hours || 1; const previewTime = computeTimeForIndex(dateStr, dropIdx, dragJob.id, movedDur); const isActive = dragOverDate === dateStr && dragOverIndex === dropIdx; return <div className={cn("rounded-md border-2 border-dashed flex items-center justify-center cursor-pointer transition-all my-1", isActive ? "h-9 border-primary bg-primary/15 shadow-sm" : "h-7 border-primary/30 bg-primary/5 hover:border-primary hover:bg-primary/10")} onDragOver={(e) => handleCardDragOver(e, dateStr, dropIdx)} onDrop={(e) => handleCardDrop(e, dateStr, dropIdx)}><span className={cn("text-[10px] font-medium pointer-events-none", isActive ? "text-primary" : "text-primary/60")}>{isLastCard ? "↓" : "→"} Move here{isActive && previewTime ? ` · ${formatTime12(previewTime)}` : ""}</span></div>; })()}</div>;
                })}
                {dragJob && dayJobs.length === 0 && <div className={cn("rounded-md border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-all py-4", dragOverDate === dateStr ? "border-primary bg-primary/15 shadow-sm" : "border-primary/30 bg-primary/5 hover:border-primary hover:bg-primary/10")} onDragOver={(e) => handleCardDragOver(e, dateStr, 0)} onDrop={(e) => handleCardDrop(e, dateStr, 0)}>{showConflicts.length > 0 && dragOverDate === dateStr ? <><AlertTriangle className="h-3.5 w-3.5 text-destructive" /><span className="text-[9px] text-destructive text-center px-1">{showConflicts[0]?.message}</span></> : <span className="text-[10px] text-primary/60 font-medium">Move here · {formatTime12(DEFAULT_START)}</span>}</div>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderMonthView = () => {
    const ms = getMonthStart(currentDate);
    const daysInMonth = new Date(ms.getFullYear(), ms.getMonth() + 1, 0).getDate();
    const firstDayOfWeek = ms.getDay();
    const mondayPad = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Mon=0
    const cells: (Date | null)[] = [];
    for (let i = 0; i < mondayPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(ms.getFullYear(), ms.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return <><div className="grid grid-cols-7 text-center text-[10px] sm:text-xs font-medium text-muted-foreground mb-1">{dayHeaders.map((d, i) => <div key={i} className="py-1">{d}</div>)}</div><div className="grid grid-cols-7 border-t border-l border-border rounded-t-md overflow-hidden">{cells.map((day, i) => {
      if (!day) return <div key={`e-${i}`} className="border-r border-b border-border min-h-[80px] bg-muted/20" />;
      const dateStr = toDateStr(day);
      const dayJobs = sortJobs(jobsByDate.get(dateStr) || []);
      const hours = getDayHours(dateStr);
      const isToday = dateStr === todayStr;
      const isDragTarget = dragOverDate === dateStr;
      const isGapSuggestion = gapSuggestions.includes(dateStr);
      return <div key={dateStr} className={cn("border-r border-b border-border min-h-[80px] p-1 transition-colors", isToday && "bg-primary/5", isDragTarget && "bg-primary/10 ring-1 ring-inset ring-primary", isGapSuggestion && dragJob && "bg-emerald-500/5")} onDragOver={(e) => handleDragOver(e, dateStr)} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, dateStr)} onClick={() => { setCurrentDate(day); setViewMode("week"); }}><div className="flex items-center justify-between"><span className={cn("text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full", isToday && "bg-primary text-primary-foreground")}>{day.getDate()}</span>{hours > 0 && <span className="text-[9px] font-mono text-muted-foreground">{hours.toFixed(0)}h</span>}</div>{hours > 0 && <div className="mt-0.5 h-0.5 rounded-full bg-muted overflow-hidden"><div className={cn("h-full rounded-full", getWorkloadBarColor(hours))} style={{ width: `${Math.min(100, (hours / 12) * 100)}%` }} /></div>}<div className="mt-0.5 space-y-0.5 overflow-y-auto max-h-[120px]">{dayJobs.map((job) => { const displayStatus = job._displayStatus || job.status; return <div key={`${job.id}-${dateStr}`} draggable={editMode && displayStatus !== "completed" && job.status !== "cancelled"} onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, job, dateStr); }} onDragEnd={handleDragEnd} onClick={(e) => { e.stopPropagation(); if (!wasDragging.current) onJobClick?.(job); }} className={cn("rounded px-1 py-0 text-[9px] leading-tight truncate border cursor-pointer", STATUS_BG[displayStatus] || STATUS_BG.scheduled)}><span className={cn("font-medium", STATUS_TEXT[displayStatus] || STATUS_TEXT.scheduled)}>{job.title}</span></div>; })}</div></div>; })}</div></>;
  };


  // Build unique crew and site lists for filter dropdowns
  const crewOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    assignments.forEach((a) => {
      if (!seen.has(a.worker_id)) {
        seen.add(a.worker_id);
        list.push({ id: a.worker_id, name: a.worker_name });
      }
    });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments]);

  const siteFilterOptions = useMemo(() => {
    return sites.slice().sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({
      value: s.id,
      label: s.name,
      sublabel: [s.address, s.city, s.state].filter(Boolean).join(", ") || undefined,
    }));
  }, [sites]);

  const jobTitleFilterOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: { value: string; label: string }[] = [];
    for (const j of jobs) {
      if (!seen.has(j.title)) {
        seen.add(j.title);
        list.push({ value: j.title, label: j.title });
      }
    }
    return list.sort((a, b) => a.label.localeCompare(b.label));
  }, [jobs]);

  const clearFilters = () => { setFilterCrewId("all"); setFilterSiteId("all"); setFilterJobTitle("all"); };

  return (
    <>
      <Card>
        <CardContent className="pt-4 px-2 sm:px-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-1 sm:gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={goBack}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={goForward}><ChevronRight className="h-4 w-4" /></Button>
              <h3 className="text-sm sm:text-base font-semibold ml-1 sm:ml-2">{headerLabel}</h3>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant={showFilters || hasActiveFilters ? "default" : "ghost"}
                size="sm"
                className="text-xs h-7 relative"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-3.5 w-3.5 mr-1" />Filter
                {hasActiveFilters && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center">
                   {(filterCrewId !== "all" ? 1 : 0) + (filterSiteId !== "all" ? 1 : 0) + (filterJobTitle !== "all" ? 1 : 0)}
                  </span>
                )}
              </Button>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={goToday}>Today</Button>
              {editMode ? (
                <>
                  {hasEdits && <Button variant="outline" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={handleDiscardEdits}><Undo2 className="h-3.5 w-3.5 mr-1" />Discard</Button>}
                  <Button variant="default" size="sm" className="h-7 text-xs" onClick={hasEdits ? handleSaveEdits : () => setEditMode(false)}><Save className="h-3.5 w-3.5 mr-1" />{hasEdits ? "Save" : "Done"}</Button>
                </>
              ) : (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={enterEditMode}><Lock className="h-3.5 w-3.5 mr-1" />Edit schedule</Button>
              )}
              <Button variant={viewMode === "week" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setViewMode("week")}>Week</Button>
              <Button variant={viewMode === "month" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setViewMode("month")}>Month</Button>
            </div>
          </div>

          {showFilters && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <FilterCombobox
                options={crewOptions.map((c) => ({ value: c.id, label: c.name }))}
                value={filterCrewId}
                onSelect={setFilterCrewId}
                allLabel="All crew members"
                placeholder="Search crew…"
                className="w-[180px]"
              />
              <FilterCombobox
                options={siteFilterOptions}
                value={filterSiteId}
                onSelect={setFilterSiteId}
                allLabel="All sites"
                placeholder="Search sites…"
                className="w-[200px]"
              />
              <FilterCombobox
                options={jobTitleFilterOptions}
                value={filterJobTitle}
                onSelect={setFilterJobTitle}
                allLabel="All jobs / services"
                placeholder="Search jobs…"
                className="w-[200px]"
              />
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={clearFilters}>
                  <X className="h-3.5 w-3.5 mr-1" />Clear filters
                </Button>
              )}
            </div>
          )}

          {hasActiveFilters && !showFilters && (
            <div className="flex items-center gap-1.5 mb-3 flex-wrap">
              {filterCrewId !== "all" && (
                <Badge variant="secondary" className="text-xs gap-1 cursor-pointer" onClick={() => setFilterCrewId("all")}>
                  {crewOptions.find((c) => c.id === filterCrewId)?.name || "Crew"}
                  <X className="h-3 w-3" />
                </Badge>
              )}
              {filterSiteId !== "all" && (
                <Badge variant="secondary" className="text-xs gap-1 cursor-pointer" onClick={() => setFilterSiteId("all")}>
                  {siteFilterOptions.find((s) => s.value === filterSiteId)?.label || "Site"}
                  <X className="h-3 w-3" />
                </Badge>
              )}
              {filterJobTitle !== "all" && (
                <Badge variant="secondary" className="text-xs gap-1 cursor-pointer" onClick={() => setFilterJobTitle("all")}>
                  {filterJobTitle}
                  <X className="h-3 w-3" />
                </Badge>
              )}
            </div>
          )}

          {viewMode === "week" ? renderWeekView() : renderMonthView()}
        </CardContent>
      </Card>

      <Dialog open={recurringDialogOpen} onOpenChange={setRecurringDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move recurring job</DialogTitle>
            <DialogDescription>Choose whether to move only this occurrence or shift the whole recurring series.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => handleRecurringChoice("this")}><Copy className="h-4 w-4 mr-2" />This instance only</Button>
            <Button onClick={() => handleRecurringChoice("all")}><RefreshCw className="h-4 w-4 mr-2" />All future instances</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deleteTarget && onJobDelete && (
        <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) { setDeleteTarget(null); setDeleteConfirmed(false); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {deleteTarget.status === "completed" && <AlertTriangle className="h-5 w-5 text-amber-500" />}
                Delete Job?
              </DialogTitle>
              <DialogDescription className="space-y-2">
                <span className="block">This will permanently delete &quot;<strong>{deleteTarget.title}</strong>&quot; and cascade-remove all assignments, timesheet entries (reversing pay), check-in records, and photos.</span>
                {deleteTarget.status === "completed" && (
                  <div className="mt-3 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                    <p className="text-sm font-medium text-destructive mb-2">⚠️ This job is completed. Deleting it will reverse all pay allocated to crew for this job.</p>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" checked={deleteConfirmed} onChange={(e) => setDeleteConfirmed(e.target.checked)} className="mt-0.5" />
                      <span className="text-sm leading-tight">I understand and want to proceed</span>
                    </label>
                  </div>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteConfirmed(false); }} disabled={deleting}>Cancel</Button>
              <Button variant="destructive" disabled={deleting || (deleteTarget.status === "completed" && !deleteConfirmed)} onClick={async () => { setDeleting(true); await onJobDelete(deleteTarget.id); setDeleting(false); setDeleteTarget(null); setDeleteConfirmed(false); }}>
                {deleting ? "Deleting…" : "Delete Job"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
