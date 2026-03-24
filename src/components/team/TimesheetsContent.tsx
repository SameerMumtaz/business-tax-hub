import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useTimesheets, type TimesheetEntry } from "@/hooks/useTimesheets";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Clock, Send, Trash2, RotateCcw, UserPlus, Zap, CalendarCheck, ArrowUpDown, DollarSign, Timer, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Worker {
  id: string;
  name: string;
  type: "employee" | "contractor";
  pay_rate: number;
  worker_type_raw: string;
}

interface Job {
  id: string;
  title: string;
  start_date: string;
  end_date: string | null;
  job_type: string;
  start_time: string | null;
  estimated_hours: number | null;
}

interface JobAssignment {
  job_id: string;
  worker_id: string;
  worker_name: string;
  worker_type: string;
  hours_per_day: number;
  assigned_days: string[] | null;
  assigned_hours: number;
}

interface CheckinRecord {
  id: string;
  team_member_id: string;
  job_id: string | null;
  job_site_id: string | null;
  check_in_time: string;
  check_out_time: string | null;
  total_hours: number | null;
  occurrence_date: string | null;
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMonday(ref: Date): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function getDayLabelsWithDates(weekStart: string): string[] {
  const start = parseLocalDate(weekStart);
  const datesByWeekday: Partial<Record<number, Date>> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    datesByWeekday[d.getDay()] = d;
  }
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
  return DAY_LABELS.map((label, i) => {
    const d = datesByWeekday[weekdayOrder[i]];
    return d ? `${label} ${d.getMonth() + 1}/${d.getDate()}` : label;
  });
}

// Map JS getDay (0=Sun) -> our day keys
const JS_DAY_TO_KEY: Record<number, string> = {
  0: "sun_hours", 1: "mon_hours", 2: "tue_hours", 3: "wed_hours",
  4: "thu_hours", 5: "fri_hours", 6: "sat_hours",
};

// ─── Weekly Summary Cards ───────────────────────────────
function WeeklySummaryCards({ entries }: { entries: TimesheetEntry[] }) {
  const stats = useMemo(() => {
    const totalHours = entries.reduce((s, e) => s + e.total_hours, 0);
    const totalPay = entries.reduce((s, e) => s + e.total_pay, 0);
    const totalOT = entries.reduce((s, e) => s + e.overtime_hours, 0);

    // Cost by crew member
    const byWorker = new Map<string, { name: string; hours: number; pay: number; type: string }>();
    entries.forEach((e) => {
      const existing = byWorker.get(e.worker_id) || { name: e.worker_name, hours: 0, pay: 0, type: e.worker_type };
      existing.hours += e.total_hours;
      existing.pay += e.total_pay;
      byWorker.set(e.worker_id, existing);
    });
    const workerBreakdown = Array.from(byWorker.values()).sort((a, b) => b.pay - a.pay);

    return { totalHours, totalPay, totalOT, workerBreakdown, workerCount: byWorker.size };
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card>
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <DollarSign className="h-3.5 w-3.5" />Total Labor Cost
          </div>
          <p className="text-xl font-bold font-mono">{formatCurrency(stats.totalPay)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Clock className="h-3.5 w-3.5" />Total Hours
          </div>
          <p className="text-xl font-bold font-mono">{stats.totalHours.toFixed(1)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Timer className="h-3.5 w-3.5" />Overtime Hours
          </div>
          <p className={cn("text-xl font-bold font-mono", stats.totalOT > 0 && "text-destructive")}>
            {stats.totalOT.toFixed(1)}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <UserPlus className="h-3.5 w-3.5" />Crew Members
          </div>
          <p className="text-xl font-bold font-mono">{stats.workerCount}</p>
        </CardContent>
      </Card>

      {/* Worker breakdown - spans full width */}
      {stats.workerBreakdown.length > 1 && (
        <Card className="col-span-2 md:col-span-4">
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground mb-2">Cost by Crew Member</p>
            <div className="flex flex-wrap gap-3">
              {stats.workerBreakdown.map((w) => (
                <div key={w.name} className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{w.name}</span>
                  <Badge variant="outline" className="text-[10px]">{w.type}</Badge>
                  <span className="font-mono text-muted-foreground">{w.hours.toFixed(1)}h</span>
                  <span className="font-mono font-semibold">{formatCurrency(w.pay)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────
export default function TimesheetsContent() {
  const { user } = useAuth();
  const {
    timesheets, entries, loading,
    createTimesheet, addEntry, updateEntry, deleteEntry,
    submitTimesheet, reopenTimesheet, deleteTimesheet,
  } = useTimesheets();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [assignments, setAssignments] = useState<JobAssignment[]>([]);
  const [checkins, setCheckins] = useState<CheckinRecord[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [weekStart, setWeekStart] = useState("");
  const [weekEnd, setWeekEnd] = useState("");
  const [addWorkerTsId, setAddWorkerTsId] = useState<string | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [editingCell, setEditingCell] = useState<{ entryId: string; day: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [generatingCheckins, setGeneratingCheckins] = useState<string | null>(null);
  const [generatingSchedule, setGeneratingSchedule] = useState<string | null>(null);
  // OT toggle per worker: default W-2 = true, 1099 = false
  const [otEnabled, setOtEnabled] = useState<Record<string, boolean>>({});

  const getOtEnabled = useCallback((workerId: string): boolean => {
    if (workerId in otEnabled) return otEnabled[workerId];
    const worker = workers.find((w) => w.id === workerId);
    // Default: W-2 employees get OT, 1099 contractors don't
    return worker ? worker.type === "employee" : true;
  }, [otEnabled, workers]);

  const toggleOt = useCallback((workerId: string) => {
    setOtEnabled((prev) => ({ ...prev, [workerId]: !getOtEnabled(workerId) }));
  }, [getOtEnabled]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [teamRes, empRes, conRes, jobRes, assignRes, checkinRes] = await Promise.all([
        supabase.from("team_members").select("id, name, worker_type, pay_rate").eq("business_user_id", user.id).in("status", ["active", "invited"]),
        supabase.from("employees").select("id, name, salary").eq("user_id", user.id),
        supabase.from("contractors").select("id, name, pay_rate").eq("user_id", user.id),
        supabase.from("jobs").select("id, title, start_date, end_date, job_type, start_time, estimated_hours").eq("user_id", user.id).in("status", ["scheduled", "in_progress"]),
        supabase.from("job_assignments").select("job_id, worker_id, worker_name, worker_type, hours_per_day, assigned_days, assigned_hours"),
        supabase.from("crew_checkins").select("id, team_member_id, job_id, job_site_id, check_in_time, check_out_time, total_hours, occurrence_date"),
      ]);

      const w: Worker[] = [];
      const seen = new Set<string>();

      (teamRes.data || []).forEach((tm: any) => {
        const isContractor = tm.worker_type === "1099";
        w.push({
          id: tm.id, name: tm.name,
          type: isContractor ? "contractor" : "employee",
          pay_rate: isContractor ? (tm.pay_rate || 0) : (tm.pay_rate ? tm.pay_rate / 2080 : 0),
          worker_type_raw: tm.worker_type,
        });
        seen.add(tm.name.toLowerCase());
      });

      (empRes.data || []).forEach((e: any) => {
        if (!seen.has(e.name.toLowerCase())) {
          w.push({ id: e.id, name: e.name, type: "employee", pay_rate: e.salary ? e.salary / 2080 : 0, worker_type_raw: "W-2" });
          seen.add(e.name.toLowerCase());
        }
      });

      (conRes.data || []).forEach((c: any) => {
        if (!seen.has(c.name.toLowerCase())) {
          w.push({ id: c.id, name: c.name, type: "contractor", pay_rate: c.pay_rate || 0, worker_type_raw: "1099" });
          seen.add(c.name.toLowerCase());
        }
      });

      setWorkers(w);
      setJobs((jobRes.data || []) as Job[]);
      setAssignments((assignRes.data || []) as JobAssignment[]);
      setCheckins((checkinRes.data || []) as CheckinRecord[]);
    };
    load();
  }, [user]);

  // ─── Quick Create Helpers ─────────────────────────────
  const handleQuickCreate = async (offset: 0 | 1) => {
    const today = new Date();
    const monday = getMonday(today);
    if (offset === 1) monday.setDate(monday.getDate() + 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const ws = formatDateStr(monday);
    const we = formatDateStr(sunday);

    // Check for duplicates
    const exists = timesheets.some((t) => t.week_start === ws);
    if (exists) {
      toast.error(`Timesheet for week of ${ws} already exists`);
      return;
    }
    await createTimesheet(ws, we);
  };

  const handleCreate = async () => {
    if (!weekStart || !weekEnd) { toast.error("Both dates required"); return; }
    const result = await createTimesheet(weekStart, weekEnd);
    if (result) { setCreateOpen(false); setWeekStart(""); setWeekEnd(""); }
  };

  // ─── Auto-generate from Check-ins ─────────────────────
  const handleGenerateFromCheckins = async (tsId: string) => {
    const ts = timesheets.find((t) => t.id === tsId);
    if (!ts) return;
    setGeneratingCheckins(tsId);

    try {
      const wsDate = parseLocalDate(ts.week_start);
      const weDate = parseLocalDate(ts.week_end);

      // Find all checkins in this date range
      const weekCheckins = checkins.filter((c) => {
        const checkinDate = c.occurrence_date || c.check_in_time.split("T")[0];
        return checkinDate >= ts.week_start && checkinDate <= ts.week_end;
      });

      if (weekCheckins.length === 0) {
        toast.error("No check-ins found for this week");
        setGeneratingCheckins(null);
        return;
      }

      // Group checkins by worker+job
      const grouped = new Map<string, { workerId: string; jobId: string | null; hoursByDay: Record<string, number> }>();

      for (const c of weekCheckins) {
        const key = `${c.team_member_id}__${c.job_id || "none"}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            workerId: c.team_member_id,
            jobId: c.job_id,
            hoursByDay: { mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0, fri_hours: 0, sat_hours: 0, sun_hours: 0 },
          });
        }
        const group = grouped.get(key)!;
        const checkinDate = c.occurrence_date || c.check_in_time.split("T")[0];
        const d = parseLocalDate(checkinDate);
        const dayKey = JS_DAY_TO_KEY[d.getDay()];
        if (dayKey) {
          // Use total_hours if checked out, else compute elapsed
          if (c.total_hours && c.total_hours > 0) {
            group.hoursByDay[dayKey] += c.total_hours;
          } else if (c.check_out_time) {
            const hrs = (new Date(c.check_out_time).getTime() - new Date(c.check_in_time).getTime()) / 3600000;
            group.hoursByDay[dayKey] += Math.round(hrs * 4) / 4; // Round to 15min
          } else {
            // Still checked in — compute hours so far
            const hrs = (Date.now() - new Date(c.check_in_time).getTime()) / 3600000;
            group.hoursByDay[dayKey] += Math.round(hrs * 4) / 4;
          }
        }
      }

      // Create entries, skipping existing ones
      let added = 0;
      for (const [, group] of grouped) {
        const worker = workers.find((w) => w.id === group.workerId);
        if (!worker) continue;

        const alreadyExists = entries.some(
          (e) => e.timesheet_id === tsId && e.worker_id === group.workerId && e.job_id === (group.jobId || null)
        );
        if (alreadyExists) continue;

        await addEntry({
          timesheet_id: tsId,
          worker_id: worker.id,
          worker_name: worker.name,
          worker_type: worker.type,
          pay_rate: worker.pay_rate,
          ...group.hoursByDay as any,
          job_id: group.jobId || null,
        });
        added++;
      }

      toast.success(`Generated ${added} entries from check-ins`);
    } catch (err) {
      toast.error("Failed to generate from check-ins");
    }
    setGeneratingCheckins(null);
  };

  // ─── Auto-generate from Job Assignments ───────────────
  const handleGenerateFromSchedule = async (tsId: string) => {
    const ts = timesheets.find((t) => t.id === tsId);
    if (!ts) return;
    setGeneratingSchedule(tsId);

    try {
      const wsDate = parseLocalDate(ts.week_start);
      const weDate = parseLocalDate(ts.week_end);

      // Find jobs that overlap this week
      const weekJobs = jobs.filter((j) => {
        const jobStart = parseLocalDate(j.start_date);
        const jobEnd = j.end_date ? parseLocalDate(j.end_date) : new Date(jobStart);
        return jobStart <= weDate && jobEnd >= wsDate;
      });

      if (weekJobs.length === 0) {
        toast.error("No jobs scheduled for this week");
        setGeneratingSchedule(null);
        return;
      }

      let added = 0;
      for (const job of weekJobs) {
        const jobAssignments = assignments.filter((a) => a.job_id === job.id);

        for (const assign of jobAssignments) {
          const worker = workers.find((w) => w.id === assign.worker_id);
          if (!worker) continue;

          const alreadyExists = entries.some(
            (e) => e.timesheet_id === tsId && e.worker_id === assign.worker_id && e.job_id === job.id
          );
          if (alreadyExists) continue;

          // Compute hours per day based on assignment
          const hours: Record<string, number> = {
            mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0,
            fri_hours: 0, sat_hours: 0, sun_hours: 0,
          };

          const jobStart = parseLocalDate(job.start_date);
          const jobEnd = job.end_date ? parseLocalDate(job.end_date) : new Date(jobStart);
          const hpd = assign.hours_per_day > 0 ? assign.hours_per_day : (job.estimated_hours || 8);

          const cursor = new Date(wsDate);
          while (cursor <= weDate) {
            if (cursor >= jobStart && cursor <= jobEnd) {
              const dateStr = formatDateStr(cursor);
              // Check assigned_days filter
              if (!assign.assigned_days || assign.assigned_days.length === 0 || assign.assigned_days.includes(dateStr)) {
                const dayKey = JS_DAY_TO_KEY[cursor.getDay()];
                if (dayKey) hours[dayKey] = hpd;
              }
            }
            cursor.setDate(cursor.getDate() + 1);
          }

          await addEntry({
            timesheet_id: tsId,
            worker_id: worker.id,
            worker_name: worker.name,
            worker_type: worker.type,
            pay_rate: worker.pay_rate,
            ...hours as any,
            job_id: job.id,
          });
          added++;
        }
      }

      toast.success(`Generated ${added} entries from schedule`);
    } catch (err) {
      toast.error("Failed to generate from schedule");
    }
    setGeneratingSchedule(null);
  };

  // ─── Compute Scheduled Hours for Variance ─────────────
  const getScheduledHours = (entry: TimesheetEntry, ts: { week_start: string; week_end: string }): Record<string, number> | null => {
    if (!entry.job_id) return null;
    const job = jobs.find((j) => j.id === entry.job_id);
    if (!job) return null;

    const assign = assignments.find((a) => a.job_id === entry.job_id && a.worker_id === entry.worker_id);
    const hpd = assign?.hours_per_day && assign.hours_per_day > 0 ? assign.hours_per_day : (job.estimated_hours || 8);

    const wsDate = parseLocalDate(ts.week_start);
    const weDate = parseLocalDate(ts.week_end);
    const jobStart = parseLocalDate(job.start_date);
    const jobEnd = job.end_date ? parseLocalDate(job.end_date) : new Date(jobStart);

    const scheduled: Record<string, number> = {
      mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0,
      fri_hours: 0, sat_hours: 0, sun_hours: 0,
    };

    const cursor = new Date(wsDate);
    while (cursor <= weDate) {
      if (cursor >= jobStart && cursor <= jobEnd) {
        const dateStr = formatDateStr(cursor);
        if (!assign?.assigned_days || assign.assigned_days.length === 0 || assign.assigned_days.includes(dateStr)) {
          const dayKey = JS_DAY_TO_KEY[cursor.getDay()];
          if (dayKey) scheduled[dayKey] = hpd;
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return scheduled;
  };

  // ─── Existing Handlers ────────────────────────────────
  const computeJobHours = (jobId: string, timesheetId: string): Record<string, number> => {
    const hours: Record<string, number> = {
      mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0,
      fri_hours: 0, sat_hours: 0, sun_hours: 0,
    };
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return hours;
    const ts = timesheets.find((t) => t.id === timesheetId);
    if (!ts) return hours;

    const weekStart = parseLocalDate(ts.week_start);
    const weekEnd = parseLocalDate(ts.week_end);
    const jobStart = parseLocalDate(job.start_date);
    const jobEnd = job.end_date ? parseLocalDate(job.end_date) : new Date(jobStart);

    const hoursPerDay = job.estimated_hours != null && job.estimated_hours > 0 ? job.estimated_hours : 8;
    const cursor = new Date(weekStart);
    while (cursor <= weekEnd) {
      if (cursor >= jobStart && cursor <= jobEnd) {
        const key = JS_DAY_TO_KEY[cursor.getDay()];
        hours[key] = hoursPerDay;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return hours;
  };

  const handleAddWorker = async () => {
    if (!addWorkerTsId || !selectedWorkerId) { toast.error("Select a worker"); return; }
    const worker = workers.find((w) => w.id === selectedWorkerId);
    if (!worker) return;
    const alreadyExists = entries.some(
      (e) => e.timesheet_id === addWorkerTsId && e.worker_id === worker.id && e.job_id === (selectedJobId || null)
    );
    if (alreadyExists) { toast.error("Worker already has this job on the timesheet"); return; }

    const jobHours = selectedJobId
      ? computeJobHours(selectedJobId, addWorkerTsId)
      : { mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0, fri_hours: 0, sat_hours: 0, sun_hours: 0 };

    await addEntry({
      timesheet_id: addWorkerTsId, worker_id: worker.id, worker_name: worker.name,
      worker_type: worker.type, pay_rate: worker.pay_rate,
      ...jobHours as any, job_id: selectedJobId || null,
    });
    setAddWorkerTsId(null); setSelectedWorkerId(""); setSelectedJobId("");
  };

  const handleCellClick = (entryId: string, day: string, currentValue: number) => {
    setEditingCell({ entryId, day }); setEditValue(currentValue.toString());
  };
  const handleCellBlur = async () => {
    if (!editingCell) return;
    const val = parseFloat(editValue) || 0;
    const key = `${editingCell.day}_hours` as keyof TimesheetEntry;
    await updateEntry(editingCell.entryId, { [key]: val } as any);
    setEditingCell(null);
  };
  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCellBlur();
    if (e.key === "Escape") setEditingCell(null);
  };
  const handleJobChange = async (entryId: string, jobId: string) => {
    if (jobId) {
      const entry = entries.find((e) => e.id === entryId);
      if (entry) {
        const jobHours = computeJobHours(jobId, entry.timesheet_id);
        await updateEntry(entryId, { job_id: jobId, ...jobHours } as any);
        return;
      }
    }
    await updateEntry(entryId, { job_id: jobId || null } as any);
  };

  const getTimesheetEntries = (tsId: string) => entries.filter((e) => e.timesheet_id === tsId);
  const workerMap = new Map(workers.map((w) => [w.id, w]));

  // All entries for summary
  const allDraftEntries = useMemo(() => {
    const draftTsIds = new Set(timesheets.filter((t) => t.status === "draft").map((t) => t.id));
    return entries.filter((e) => draftTsIds.has(e.timesheet_id));
  }, [timesheets, entries]);

  return (
    <div className="space-y-4">
      {/* Quick-create buttons + custom */}
      <div className="flex items-center gap-2 flex-wrap justify-between">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => handleQuickCreate(0)}>
            <CalendarCheck className="h-4 w-4 mr-1.5" />This Week
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleQuickCreate(1)}>
            <CalendarCheck className="h-4 w-4 mr-1.5" />Next Week
          </Button>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" />Custom Range</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Timesheet</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm text-muted-foreground">Week Start</label>
                  <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Week End</label>
                  <Input type="date" value={weekEnd} onChange={(e) => setWeekEnd(e.target.value)} />
                </div>
              </div>
              <Button className="w-full" onClick={handleCreate}>Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Weekly Summary Cards */}
      {entries.length > 0 && <WeeklySummaryCards entries={entries} />}

      {/* Add Worker Dialog */}
      <Dialog open={!!addWorkerTsId} onOpenChange={(open) => { if (!open) setAddWorkerTsId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Worker to Timesheet</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-sm text-muted-foreground">Worker</label>
              <Select value={selectedWorkerId} onValueChange={setSelectedWorkerId}>
                <SelectTrigger><SelectValue placeholder="Select worker" /></SelectTrigger>
                <SelectContent>
                  {workers.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} <span className="text-muted-foreground">({w.type})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Assign to Job (optional)</label>
              <Select value={selectedJobId || "none"} onValueChange={(v) => setSelectedJobId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="No job assigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No job</SelectItem>
                  {jobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedWorkerId && (
              <p className="text-xs text-muted-foreground">
                Pay rate: {formatCurrency(workerMap.get(selectedWorkerId)?.pay_rate || 0)}/hr
              </p>
            )}
            <Button className="w-full" onClick={handleAddWorker}>Add Worker</Button>
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">Loading…</p>
      ) : timesheets.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 space-y-3">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="text-muted-foreground">No timesheets yet</p>
            <p className="text-sm text-muted-foreground">Use the quick-create buttons above to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {timesheets.map((ts) => {
            const tsEntries = getTimesheetEntries(ts.id);
            const totalHours = tsEntries.reduce((s, e) => s + e.total_hours, 0);
            // Compute OT-aware totals by grouping per worker
            const { otAwarePay, otAwareOT } = (() => {
              const byWorker = new Map<string, { total: number; rate: number }>();
              tsEntries.forEach((e) => {
                const existing = byWorker.get(e.worker_id) || { total: 0, rate: e.pay_rate };
                existing.total += e.total_hours;
                byWorker.set(e.worker_id, existing);
              });
              let pay = 0, ot = 0;
              byWorker.forEach(({ total, rate }, wid) => {
                const otOn = getOtEnabled(wid);
                const workerOT = otOn ? Math.max(0, total - 40) : 0;
                const reg = total - workerOT;
                ot += workerOT;
                pay += reg * rate + workerOT * rate * 1.5;
              });
              return { otAwarePay: pay, otAwareOT: ot };
            })();
            const totalPay = otAwarePay;
            const isDraft = ts.status === "draft";
            return (
              <Card key={ts.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-base">{ts.week_start} — {ts.week_end}</CardTitle>
                      <Badge variant={ts.status === "submitted" ? "default" : "secondary"}>{ts.status}</Badge>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {isDraft && (
                        <>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="outline"
                                  disabled={generatingCheckins === ts.id}
                                  onClick={() => handleGenerateFromCheckins(ts.id)}>
                                  <Zap className="h-3.5 w-3.5 mr-1" />
                                  {generatingCheckins === ts.id ? "Generating…" : "From Check-ins"}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Pull actual hours from crew check-in/out records</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="outline"
                                  disabled={generatingSchedule === ts.id}
                                  onClick={() => handleGenerateFromSchedule(ts.id)}>
                                  <CalendarCheck className="h-3.5 w-3.5 mr-1" />
                                  {generatingSchedule === ts.id ? "Generating…" : "From Schedule"}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Prefill hours from job assignments for this week</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Button size="sm" variant="outline" onClick={() => setAddWorkerTsId(ts.id)}>
                            <UserPlus className="h-3.5 w-3.5 mr-1" />Add Worker
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => submitTimesheet(ts.id)}>
                            <Send className="h-3.5 w-3.5 mr-1" />Submit
                          </Button>
                        </>
                      )}
                      {ts.status === "submitted" && (
                        <Button size="sm" variant="outline" onClick={() => reopenTimesheet(ts.id)}>
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />Reopen
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Timesheet?</AlertDialogTitle>
                            <AlertDialogDescription>This will permanently delete this timesheet and all its entries.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteTimesheet(ts.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {tsEntries.length === 0 ? (
                    <div className="text-center py-8 space-y-3">
                      <p className="text-sm text-muted-foreground">No workers added yet</p>
                      {isDraft && (
                        <div className="flex items-center gap-2 justify-center flex-wrap">
                          <Button size="sm" variant="outline" onClick={() => handleGenerateFromCheckins(ts.id)}>
                            <Zap className="h-3.5 w-3.5 mr-1" />Generate from Check-ins
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleGenerateFromSchedule(ts.id)}>
                            <CalendarCheck className="h-3.5 w-3.5 mr-1" />Generate from Schedule
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setAddWorkerTsId(ts.id)}>
                            <UserPlus className="h-3.5 w-3.5 mr-1" />Add Manually
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[160px]">Worker / Job</TableHead>
                            <TableHead className="text-right">Rate</TableHead>
                            {getDayLabelsWithDates(ts.week_start).map((d, i) => (
                              <TableHead key={DAYS[i]} className="text-center w-16 text-xs">{d}</TableHead>
                            ))}
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-right">OT</TableHead>
                            <TableHead className="text-right">Pay</TableHead>
                            {isDraft && <TableHead className="w-10" />}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(() => {
                            // Group entries by worker
                            const workerGroups = new Map<string, TimesheetEntry[]>();
                            const workerOrder: string[] = [];
                            tsEntries.forEach((e) => {
                              if (!workerGroups.has(e.worker_id)) {
                                workerGroups.set(e.worker_id, []);
                                workerOrder.push(e.worker_id);
                              }
                              workerGroups.get(e.worker_id)!.push(e);
                            });

                            return workerOrder.map((workerId) => {
                              const workerEntries = workerGroups.get(workerId)!;
                              const firstEntry = workerEntries[0];
                              const hasMultipleJobs = workerEntries.length > 1;

                              // Aggregate totals across all jobs for this worker
                              const aggDayHours: Record<string, number> = {};
                              DAYS.forEach((day) => {
                                aggDayHours[day] = workerEntries.reduce((s, e) => s + (e[`${day}_hours` as keyof TimesheetEntry] as number), 0);
                              });
                              const aggTotal = workerEntries.reduce((s, e) => s + e.total_hours, 0);
                              const workerOtEnabled = getOtEnabled(workerId);
                              const aggOT = workerOtEnabled ? Math.max(0, aggTotal - 40) : 0;
                              const aggRegular = aggTotal - aggOT;
                              const rate = firstEntry.pay_rate;
                              const aggPay = aggRegular * rate + aggOT * rate * 1.5;

                              return (
                                <React.Fragment key={workerId}>
                                  {/* Worker header/summary row */}
                                  <TableRow className={cn(hasMultipleJobs && "border-t-2 border-border/60")}>
                                    <TableCell>
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold">{firstEntry.worker_name}</span>
                                        <Badge variant="outline" className="text-[10px]">{firstEntry.worker_type}</Badge>
                                      </div>
                                      {!hasMultipleJobs && (
                                        <div className="mt-0.5">
                                          {isDraft ? (
                                            <Select value={firstEntry.job_id || "none"} onValueChange={(v) => handleJobChange(firstEntry.id, v === "none" ? "" : v)}>
                                              <SelectTrigger className="h-6 text-xs w-28"><SelectValue placeholder="None" /></SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="none">None</SelectItem>
                                                {jobs.map((j) => (
                                                  <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          ) : (
                                            <span className="text-xs text-muted-foreground">
                                              {firstEntry.job_id ? jobs.find((j) => j.id === firstEntry.job_id)?.title || "—" : "—"}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                      {hasMultipleJobs && (
                                        <span className="text-[10px] text-muted-foreground">{workerEntries.length} jobs</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex flex-col items-end gap-1">
                                        <span className="font-mono text-xs">${rate.toFixed(2)}</span>
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <div className="flex items-center gap-1">
                                                <span className="text-[10px] text-muted-foreground">OT</span>
                                                <Switch
                                                  checked={workerOtEnabled}
                                                  onCheckedChange={() => toggleOt(workerId)}
                                                  className="h-4 w-7 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
                                                />
                                              </div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p className="text-xs">{workerOtEnabled ? "1.5x overtime enabled (40+ hrs)" : "No overtime applied"}</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      </div>
                                    </TableCell>
                                    {DAYS.map((day) => {
                                      const val = hasMultipleJobs ? aggDayHours[day] : (firstEntry[`${day}_hours` as keyof TimesheetEntry] as number);
                                      const scheduled = hasMultipleJobs ? null : getScheduledHours(firstEntry, ts);
                                      const scheduledVal = scheduled ? (scheduled[`${day}_hours`] || 0) : null;
                                      const hasVariance = scheduledVal !== null && val !== scheduledVal && (val > 0 || scheduledVal > 0);
                                      const variance = scheduledVal !== null ? val - scheduledVal : 0;

                                      if (hasMultipleJobs) {
                                        // Aggregated — not editable, just show total
                                        return (
                                          <TableCell key={day} className="text-center p-1">
                                            <span className="text-xs font-mono font-semibold">{val || "–"}</span>
                                          </TableCell>
                                        );
                                      }

                                      const isEditing = editingCell?.entryId === firstEntry.id && editingCell?.day === day;
                                      return (
                                        <TableCell key={day} className="text-center p-1">
                                          {isDraft ? (
                                            isEditing ? (
                                              <Input type="number" min="0" max="24" step="0.5" value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur}
                                                onKeyDown={handleCellKeyDown} className="h-7 w-14 text-center text-xs p-1" autoFocus />
                                            ) : (
                                              <TooltipProvider>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <button onClick={() => handleCellClick(firstEntry.id, day, val)}
                                                      className={cn(
                                                        "w-14 h-7 rounded border text-xs font-mono transition-colors",
                                                        hasVariance && variance > 0 && "border-chart-positive/50 bg-chart-positive/10",
                                                        hasVariance && variance < 0 && "border-destructive/50 bg-destructive/10",
                                                        !hasVariance && "border-transparent hover:border-border",
                                                      )}>
                                                      {val || "–"}
                                                    </button>
                                                  </TooltipTrigger>
                                                  {hasVariance && (
                                                    <TooltipContent>
                                                      <div className="text-xs">
                                                        <p>Scheduled: {scheduledVal}h</p>
                                                        <p>Actual: {val}h</p>
                                                        <p className={cn(variance > 0 ? "text-chart-positive" : "text-destructive")}>
                                                          {variance > 0 ? "+" : ""}{variance.toFixed(1)}h variance
                                                        </p>
                                                      </div>
                                                    </TooltipContent>
                                                  )}
                                                </Tooltip>
                                              </TooltipProvider>
                                            )
                                          ) : (
                                            <span className={cn(
                                              "text-xs font-mono px-1 py-0.5 rounded",
                                              hasVariance && variance > 0 && "bg-chart-positive/10",
                                              hasVariance && variance < 0 && "bg-destructive/10",
                                            )}>
                                              {val || "–"}
                                            </span>
                                          )}
                                        </TableCell>
                                      );
                                    })}
                                    <TableCell className="text-right font-bold font-mono text-sm">{hasMultipleJobs ? aggTotal : firstEntry.total_hours}</TableCell>
                                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                      {(hasMultipleJobs ? aggOT : firstEntry.overtime_hours) > 0 ? (hasMultipleJobs ? aggOT : firstEntry.overtime_hours) : "–"}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-semibold">{formatCurrency(hasMultipleJobs ? aggPay : firstEntry.total_pay)}</TableCell>
                                    {isDraft && (
                                      <TableCell>
                                        {!hasMultipleJobs && (
                                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                                            onClick={() => deleteEntry(firstEntry.id)}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        )}
                                      </TableCell>
                                    )}
                                  </TableRow>

                                  {/* Sub-rows for each job (only when worker has multiple jobs) */}
                                  {hasMultipleJobs && workerEntries.map((entry) => {
                                    const scheduled = getScheduledHours(entry, ts);
                                    return (
                                      <TableRow key={entry.id} className="bg-muted/30">
                                        <TableCell className="pl-6">
                                          {isDraft ? (
                                            <Select value={entry.job_id || "none"} onValueChange={(v) => handleJobChange(entry.id, v === "none" ? "" : v)}>
                                              <SelectTrigger className="h-6 text-xs w-28"><SelectValue placeholder="None" /></SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="none">None</SelectItem>
                                                {jobs.map((j) => (
                                                  <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          ) : (
                                            <span className="text-xs text-muted-foreground">
                                              {entry.job_id ? jobs.find((j) => j.id === entry.job_id)?.title || "—" : "—"}
                                            </span>
                                          )}
                                        </TableCell>
                                        <TableCell />
                                        {DAYS.map((day) => {
                                          const key = `${day}_hours` as keyof TimesheetEntry;
                                          const val = entry[key] as number;
                                          const scheduledVal = scheduled ? (scheduled[`${day}_hours`] || 0) : null;
                                          const isEditing = editingCell?.entryId === entry.id && editingCell?.day === day;
                                          const hasVariance = scheduledVal !== null && val !== scheduledVal && (val > 0 || scheduledVal > 0);
                                          const variance = scheduledVal !== null ? val - scheduledVal : 0;

                                          return (
                                            <TableCell key={day} className="text-center p-1">
                                              {isDraft ? (
                                                isEditing ? (
                                                  <Input type="number" min="0" max="24" step="0.5" value={editValue}
                                                    onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur}
                                                    onKeyDown={handleCellKeyDown} className="h-7 w-14 text-center text-xs p-1" autoFocus />
                                                ) : (
                                                  <TooltipProvider>
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <button onClick={() => handleCellClick(entry.id, day, val)}
                                                          className={cn(
                                                            "w-14 h-7 rounded border text-xs font-mono transition-colors",
                                                            hasVariance && variance > 0 && "border-chart-positive/50 bg-chart-positive/10",
                                                            hasVariance && variance < 0 && "border-destructive/50 bg-destructive/10",
                                                            !hasVariance && "border-transparent hover:border-border",
                                                          )}>
                                                          {val || "–"}
                                                        </button>
                                                      </TooltipTrigger>
                                                      {hasVariance && (
                                                        <TooltipContent>
                                                          <div className="text-xs">
                                                            <p>Scheduled: {scheduledVal}h | Actual: {val}h</p>
                                                            <p className={cn(variance > 0 ? "text-chart-positive" : "text-destructive")}>
                                                              {variance > 0 ? "+" : ""}{variance.toFixed(1)}h
                                                            </p>
                                                          </div>
                                                        </TooltipContent>
                                                      )}
                                                    </Tooltip>
                                                  </TooltipProvider>
                                                )
                                              ) : (
                                                <span className={cn(
                                                  "text-xs font-mono px-1 py-0.5 rounded",
                                                  hasVariance && variance > 0 && "bg-chart-positive/10",
                                                  hasVariance && variance < 0 && "bg-destructive/10",
                                                )}>
                                                  {val || "–"}
                                                </span>
                                              )}
                                            </TableCell>
                                          );
                                        })}
                                        <TableCell className="text-right font-mono text-xs text-muted-foreground">{entry.total_hours}</TableCell>
                                        <TableCell />
                                        <TableCell />
                                        {isDraft && (
                                          <TableCell>
                                            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive"
                                              onClick={() => deleteEntry(entry.id)}>
                                              <Trash2 className="h-3 w-3" />
                                            </Button>
                                          </TableCell>
                                        )}
                                      </TableRow>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            });
                          })()}
                          <TableRow className="border-t-2">
                            <TableCell colSpan={2} className="font-semibold">Totals</TableCell>
                            {DAYS.map((day) => {
                              const dayTotal = tsEntries.reduce((s, e) => s + (e[`${day}_hours` as keyof TimesheetEntry] as number), 0);
                              return <TableCell key={day} className="text-center font-mono text-xs font-semibold">{dayTotal || "–"}</TableCell>;
                            })}
                            <TableCell className="text-right font-bold font-mono">{totalHours}</TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {otAwareOT > 0 ? otAwareOT.toFixed(1) : "–"}
                            </TableCell>
                            <TableCell className="text-right font-bold font-mono">{formatCurrency(totalPay)}</TableCell>
                            {isDraft && <TableCell />}
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
