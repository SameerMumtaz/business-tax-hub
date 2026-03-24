import { useState, useMemo } from "react";
import { type Job, type JobAssignment } from "@/hooks/useJobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, X, AlertTriangle, Clock, ShieldAlert, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

interface TeamMember {
  id: string;
  name: string;
  pay_rate: number | null;
  worker_type: string;
}

interface CrewAssignmentPanelProps {
  job: Job;
  assignments: JobAssignment[];
  teamMembers: TeamMember[];
  allJobs?: Job[];
  onAssign: (workerId: string, workerName: string, workerType: string, totalHours: number, hoursPerDay: number, assignedDays: string[] | null) => void;
  onRemove: (assignmentId: string) => void;
}

/** Parse "HH:MM" to minutes from midnight */
function timeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Check if two jobs overlap in time on a given date */
function jobsOverlap(a: Job, b: Job): boolean {
  const aStart = a.start_date;
  const aEnd = a.end_date || a.start_date;
  const bStart = b.start_date;
  const bEnd = b.end_date || b.start_date;
  if (aEnd < bStart || bEnd < aStart) return false;
  const aTime = timeToMinutes(a.start_time);
  const bTime = timeToMinutes(b.start_time);
  if (aTime === null || bTime === null) return true;
  const aDuration = Math.round((a.estimated_hours || 1) * 60);
  const bDuration = Math.round((b.estimated_hours || 1) * 60);
  const aEndMin = aTime + aDuration;
  const bEndMin = bTime + bDuration;
  return aTime < bEndMin && bTime < aEndMin;
}

/** Generate all dates between start and end (inclusive) as YYYY-MM-DD strings */
function getDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const cursor = new Date(sy, sm - 1, sd);
  const endDate = new Date(ey, em - 1, ed);
  while (cursor <= endDate) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function formatShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const [y2, m2, d2] = dateStr.split("-").map(Number);
  const dt = new Date(y2, m2 - 1, d2);
  return `${days[dt.getDay()]} ${m}/${d}`;
}

export default function CrewAssignmentPanel({
  job, assignments, teamMembers, allJobs = [], onAssign, onRemove,
}: CrewAssignmentPanelProps) {
  const [adding, setAdding] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState("");
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());

  const isMultiDay = job.job_type === "multi_day" && job.end_date && job.end_date !== job.start_date;
  const allJobDays = useMemo(() => {
    if (!isMultiDay) return [];
    return getDateRange(job.start_date, job.end_date!);
  }, [job.start_date, job.end_date, isMultiDay]);

  const jobAssignments = assignments.filter((a) => a.job_id === job.id);
  const assignedWorkerIds = new Set(jobAssignments.map((a) => a.worker_id));
  const availableWorkers = teamMembers.filter((m) => !assignedWorkerIds.has(m.id));

  // Build a map of worker → conflicting jobs for this job's time window
  const workerConflicts = useMemo(() => {
    const conflicts = new Map<string, Job[]>();
    if (allJobs.length === 0) return conflicts;
    for (const worker of teamMembers) {
      const workerAssignments = assignments.filter(
        (a) => a.worker_id === worker.id && a.job_id !== job.id
      );
      const conflicting: Job[] = [];
      for (const wa of workerAssignments) {
        const otherJob = allJobs.find((j) => j.id === wa.job_id);
        if (otherJob && jobsOverlap(job, otherJob)) {
          conflicting.push(otherJob);
        }
      }
      if (conflicting.length > 0) {
        conflicts.set(worker.id, conflicting);
      }
    }
    return conflicts;
  }, [job, assignments, allJobs, teamMembers]);

  // W-2 (salaried) workers don't count toward labor budget
  const isW2 = (workerType: string) => workerType === "W2";

  // For budget calculations, use the effective total hours (considering assigned_days for multi-day)
  const getEffectiveHours = (a: JobAssignment) => {
    if (isW2(a.worker_type)) return 0;
    return a.assigned_hours || 0;
  };

  const totalAssignedHours = jobAssignments.reduce((s, a) => s + getEffectiveHours(a), 0);
  const laborBudgetHrs = job.labor_budget_type === "hours"
    ? job.labor_budget_hours
    : (job.labor_budget_amount > 0 ? job.labor_budget_amount : 0);
  const isHoursMode = job.labor_budget_type === "hours";

  const assignedDollars = jobAssignments.reduce((s, a) => {
    if (isW2(a.worker_type)) return s;
    const member = teamMembers.find((m) => m.id === a.worker_id);
    const rate = member?.pay_rate || 0;
    return s + (a.assigned_hours || 0) * rate;
  }, 0);

  const budgetDollars = isHoursMode
    ? job.labor_budget_hours * job.labor_budget_rate
    : job.labor_budget_amount;

  const remainingHrs = isHoursMode ? laborBudgetHrs - totalAssignedHours : 0;
  const remainingDollars = budgetDollars - assignedDollars;
  const isOverBudget = isHoursMode ? totalAssignedHours > laborBudgetHrs && laborBudgetHrs > 0 : assignedDollars > budgetDollars && budgetDollars > 0;
  const hasBudget = budgetDollars > 0 || laborBudgetHrs > 0;

  const selectedConflicts = selectedWorker ? workerConflicts.get(selectedWorker) : undefined;
  const hasConflict = !!selectedConflicts && selectedConflicts.length > 0;

  // Initialize day picker when entering add mode for multi-day
  const startAdding = () => {
    setAdding(true);
    if (isMultiDay) {
      setSelectedDays(new Set(allJobDays)); // default: all days
    }
  };

  const toggleDay = (day: string) => {
    setSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const selectAllDays = () => setSelectedDays(new Set(allJobDays));
  const clearAllDays = () => setSelectedDays(new Set());

  const effectiveDayCount = isMultiDay ? selectedDays.size : 1;
  const totalHoursForAssignment = Number(hoursPerDay || 0) * effectiveDayCount;

  const handleAssign = () => {
    const worker = teamMembers.find((m) => m.id === selectedWorker);
    if (!worker || !hoursPerDay) return;
    if (isMultiDay && selectedDays.size === 0) return;

    const hpd = Number(hoursPerDay);
    const days = isMultiDay ? Array.from(selectedDays).sort() : null;
    const total = hpd * effectiveDayCount;

    onAssign(worker.id, worker.name, worker.worker_type, total, hpd, days);
    setAdding(false);
    setSelectedWorker("");
    setHoursPerDay("");
    setSelectedDays(new Set());
  };

  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Users className="h-3.5 w-3.5" /> Crew Assignments
        </div>
        {hasBudget && (
          <Badge variant={isOverBudget ? "destructive" : "secondary"} className="text-[10px] gap-1">
            {isOverBudget && <AlertTriangle className="h-3 w-3" />}
            {isHoursMode
              ? `${totalAssignedHours}/${laborBudgetHrs} hrs`
              : `$${assignedDollars.toFixed(0)}/$${budgetDollars.toFixed(0)}`}
          </Badge>
        )}
      </div>

      {/* Budget summary */}
      {hasBudget && (
        <div className="grid grid-cols-3 gap-2 text-center rounded-md bg-muted/50 p-2">
          <div>
            <p className="text-[10px] text-muted-foreground">Budget</p>
            <p className="text-xs font-mono font-medium">
              {isHoursMode ? `${laborBudgetHrs}h · $${budgetDollars.toFixed(0)}` : `$${budgetDollars.toFixed(0)}`}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Assigned</p>
            <p className="text-xs font-mono font-medium">
              {totalAssignedHours}h · ${assignedDollars.toFixed(0)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Remaining</p>
            <p className={cn("text-xs font-mono font-semibold", isOverBudget ? "text-destructive" : "text-chart-positive")}>
              {isHoursMode ? `${remainingHrs}h` : `$${remainingDollars.toFixed(0)}`}
            </p>
          </div>
        </div>
      )}

      {/* Current assignments */}
      {jobAssignments.length > 0 ? (
        <div className="space-y-1.5">
          {jobAssignments.map((a) => {
            const member = teamMembers.find((m) => m.id === a.worker_id);
            const rate = member?.pay_rate || 0;
            const w2 = isW2(a.worker_type);
            const cost = w2 ? 0 : (a.assigned_hours || 0) * rate;
            const dayCount = a.assigned_days?.length || 0;
            const hpd = a.hours_per_day || 0;
            return (
              <div key={a.id} className="rounded-md border px-2.5 py-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{a.worker_name}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">{a.worker_type}</Badge>
                    {w2 && <Badge variant="secondary" className="text-[10px] shrink-0">Salaried</Badge>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {isMultiDay && hpd > 0 ? (
                        <>{hpd}h/day × {dayCount || allJobDays.length}d = {a.assigned_hours}h</>
                      ) : (
                        <>{a.assigned_hours}h</>
                      )}
                      {!w2 && rate > 0 && ` · $${cost.toFixed(0)}`}
                    </span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onRemove(a.id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {/* Show assigned days for multi-day */}
                {isMultiDay && a.assigned_days && a.assigned_days.length > 0 && a.assigned_days.length < allJobDays.length && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {a.assigned_days.map(d => (
                      <Badge key={d} variant="outline" className="text-[9px] py-0 px-1">{formatShortDate(d)}</Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2">No crew assigned yet</p>
      )}

      {/* Add worker */}
      {adding ? (
        <div className="space-y-2 rounded-md border bg-muted/30 p-2.5">
          <Select value={selectedWorker} onValueChange={setSelectedWorker}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select worker" />
            </SelectTrigger>
            <SelectContent>
              {availableWorkers.length === 0 ? (
                <SelectItem value="__none" disabled>No available workers</SelectItem>
              ) : (
                availableWorkers.map((m) => {
                  const conflicts = workerConflicts.get(m.id);
                  const w2 = isW2(m.worker_type);
                  return (
                    <SelectItem key={m.id} value={m.id}>
                      <span className={cn(conflicts && "text-destructive")}>
                        {m.name} ({m.worker_type}){!w2 && m.pay_rate ? ` · $${m.pay_rate}/hr` : ""}{w2 ? " · Salaried" : ""}
                        {conflicts ? ` ⚠ ${conflicts.length} conflict${conflicts.length > 1 ? "s" : ""}` : ""}
                      </span>
                    </SelectItem>
                  );
                })
              )}
            </SelectContent>
          </Select>

          {/* Conflict warning */}
          {hasConflict && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-destructive">
                <ShieldAlert className="h-3.5 w-3.5" />
                Schedule conflict — this worker is already booked:
              </div>
              {selectedConflicts!.map((cj) => (
                <div key={cj.id} className="text-[11px] text-destructive/80 pl-5">
                  • {cj.title} — {cj.start_date}{cj.start_time ? ` at ${cj.start_time}` : ""}{cj.estimated_hours ? ` (${cj.estimated_hours}h)` : ""}
                </div>
              ))}
            </div>
          )}

          {/* Multi-day: Day picker */}
          {isMultiDay && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" /> Assign to days ({selectedDays.size}/{allJobDays.length})
                </p>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5" onClick={selectAllDays}>All</Button>
                  <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5" onClick={clearAllDays}>None</Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {allJobDays.map(day => (
                  <label
                    key={day}
                    className={cn(
                      "flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] cursor-pointer transition-colors",
                      selectedDays.has(day) ? "bg-primary/10 border-primary" : "bg-background"
                    )}
                  >
                    <Checkbox
                      checked={selectedDays.has(day)}
                      onCheckedChange={() => toggleDay(day)}
                      className="h-3 w-3"
                    />
                    {formatShortDate(day)}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                type="number" min="0.5" step="0.5"
                placeholder={isMultiDay ? "Hours per day" : "Hours"}
                className="h-8 text-xs" value={hoursPerDay} onChange={(e) => setHoursPerDay(e.target.value)}
              />
              {isMultiDay && hoursPerDay && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {hoursPerDay}h/day × {effectiveDayCount} days = {totalHoursForAssignment}h total
                  {(() => {
                    const worker = teamMembers.find(m => m.id === selectedWorker);
                    if (worker && !isW2(worker.worker_type) && worker.pay_rate) {
                      return ` · $${(totalHoursForAssignment * worker.pay_rate).toFixed(0)}`;
                    }
                    return "";
                  })()}
                </p>
              )}
            </div>
            <Button
              size="sm" className="h-8 text-xs" onClick={handleAssign}
              disabled={!selectedWorker || !hoursPerDay || hasConflict || (isMultiDay && selectedDays.size === 0)}
            >
              Assign
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setAdding(false); setSelectedDays(new Set()); }}>
              Cancel
            </Button>
          </div>
          {/* Over-budget warning */}
          {selectedWorker && hoursPerDay && hasBudget && !hasConflict && (() => {
            const worker = teamMembers.find((m) => m.id === selectedWorker);
            if (worker && isW2(worker.worker_type)) return null;
            const newHrs = totalAssignedHours + totalHoursForAssignment;
            const newCost = assignedDollars + totalHoursForAssignment * (worker?.pay_rate || 0);
            const wouldExceed = isHoursMode ? newHrs > laborBudgetHrs : newCost > budgetDollars;
            if (wouldExceed) {
              return (
                <div className="flex items-center gap-1.5 text-[11px] text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  This assignment would exceed the labor budget
                </div>
              );
            }
            return null;
          })()}
        </div>
      ) : (
        <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={startAdding}>
          <Plus className="h-3 w-3 mr-1" /> Assign Worker
        </Button>
      )}
    </div>
  );
}
